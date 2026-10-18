-- Las tres funciones de alineación renombradas a «_base» en la migración anterior
-- seguían cualificando sus parámetros con el nombre antiguo (fallaban). Se quitan
-- los envoltorios, recuperan su nombre y llevan la comprobación de «Haz hueco» dentro.
drop function public.slr_guardar_tacticas(text, uuid, jsonb);
alter function public.slr_guardar_tacticas_base(text, uuid, jsonb) rename to slr_guardar_tacticas;
drop function public.slr_guardar_alineacion(text, uuid, text, jsonb, uuid[], boolean, uuid, jsonb);
alter function public.slr_guardar_alineacion_base(text, uuid, text, jsonb, uuid[], boolean, uuid, jsonb) rename to slr_guardar_alineacion;
drop function public.slr_confirmar_alineacion(text, uuid);
alter function public.slr_confirmar_alineacion_base(text, uuid) rename to slr_confirmar_alineacion;

create or replace function public.slr_guardar_tacticas(token text, equipo_id uuid, tacticas jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_guardar_tacticas.token);
  v_equipo  uuid := slr_guardar_tacticas.equipo_id;
  v_liga    uuid;
begin
  select e.liga_id into v_liga from equipos e where e.id = v_equipo and e.usuario_id = v_usuario;
  if v_liga is null then
    raise exception 'Ese equipo no es tuyo' using errcode = 'P0001';
  end if;
  perform exigir_sin_exceso(v_equipo);
  if alineaciones_cerradas(v_liga) then
    raise exception 'Las alineaciones están cerradas hasta que se publique la jornada' using errcode = 'P0001';
  end if;
  return guardar_tacticas(v_equipo, slr_guardar_tacticas.tacticas);
end $$;

create or replace function public.slr_guardar_alineacion(
  token text, equipo_id uuid, formacion text, huecos jsonb,
  banquillo uuid[] default '{}', orden_manual boolean default false, capitan_id uuid default null,
  tacticas jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario    uuid := sesion_usuario(slr_guardar_alineacion.token);
  v_equipo     uuid := slr_guardar_alineacion.equipo_id;
  v_formacion  text := slr_guardar_alineacion.formacion;
  v_huecos     jsonb := slr_guardar_alineacion.huecos;
  v_banco      uuid[] := coalesce(slr_guardar_alineacion.banquillo, '{}');
  v_manual     boolean := coalesce(slr_guardar_alineacion.orden_manual, false);
  v_capitan    uuid := slr_guardar_alineacion.capitan_id;
  v_liga       uuid;
  v_n          int[];
  v_por        uuid;
  v_def        uuid[];
  v_med        uuid[];
  v_del        uuid[];
  v_titulares  uuid[];
  v_todas      uuid[];
  v_propias    int;
begin
  select e.liga_id into v_liga from equipos e where e.id = v_equipo and e.usuario_id = v_usuario;
  if v_liga is null then
    raise exception 'Ese equipo no es tuyo' using errcode = 'P0001';
  end if;
  perform exigir_sin_exceso(v_equipo);

  -- Entre el cierre y la publicación de una jornada no se puede cambiar la alineación
  if alineaciones_cerradas(v_liga) then
    raise exception 'Las alineaciones están cerradas hasta que se publique la jornada' using errcode = 'P0001';
  end if;

  if v_formacion is null or v_formacion not in ('2-2-2', '3-2-1', '1-3-2', '2-3-1', '1-2-3') then
    raise exception 'Formación no permitida: %. Las válidas son 2-2-2, 3-2-1, 1-3-2, 2-3-1 y 1-2-3', coalesce(v_formacion, '(vacía)')
      using errcode = 'P0001';
  end if;
  v_n := string_to_array(v_formacion, '-')::int[];

  if v_huecos is null or jsonb_typeof(v_huecos) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(v_huecos) k) <> array['def', 'del', 'med', 'por'] then
    raise exception 'Los huecos deben ser un objeto con por, def, med y del' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_huecos -> 'por') <> 'string'
     or jsonb_typeof(v_huecos -> 'def') <> 'array'
     or jsonb_typeof(v_huecos -> 'med') <> 'array'
     or jsonb_typeof(v_huecos -> 'del') <> 'array' then
    raise exception 'Formato de huecos no válido: por es una carta y def, med y del son listas' using errcode = 'P0001';
  end if;

  begin
    v_por := (v_huecos ->> 'por')::uuid;
    v_def := array(select x::uuid from jsonb_array_elements_text(v_huecos -> 'def') x);
    v_med := array(select x::uuid from jsonb_array_elements_text(v_huecos -> 'med') x);
    v_del := array(select x::uuid from jsonb_array_elements_text(v_huecos -> 'del') x);
  exception when invalid_text_representation then
    raise exception 'Hay identificadores de carta no válidos en los huecos' using errcode = 'P0001';
  end;

  if cardinality(v_def) <> v_n[1] or cardinality(v_med) <> v_n[2] or cardinality(v_del) <> v_n[3] then
    raise exception 'La formación % pide % DEF, % MED y % DEL', v_formacion, v_n[1], v_n[2], v_n[3] using errcode = 'P0001';
  end if;
  if cardinality(v_banco) > 3 then
    raise exception 'El banquillo admite como máximo 3 cartas' using errcode = 'P0001';
  end if;
  if array_position(v_banco, null) is not null then
    raise exception 'El banquillo tiene huecos vacíos' using errcode = 'P0001';
  end if;

  v_titulares := array[v_por] || v_def || v_med || v_del;
  v_todas := v_titulares || v_banco;

  if (select count(distinct x) from unnest(v_todas) x) <> cardinality(v_todas) then
    raise exception 'Una carta no puede estar dos veces en la alineación' using errcode = 'P0001';
  end if;

  select count(*) into v_propias from cartas c where c.id = any(v_todas) and c.equipo_id = v_equipo;
  if v_propias <> cardinality(v_todas) then
    raise exception 'Todas las cartas de la alineación tienen que ser de tu equipo' using errcode = 'P0001';
  end if;

  if v_capitan is null or not (v_capitan = any(v_titulares)) then
    raise exception 'El capitán tiene que ser uno de los titulares' using errcode = 'P0001';
  end if;

  insert into alineaciones as a (equipo_id, formacion, huecos, banquillo, orden_manual, capitan_id, guardada_en, automatica)
  values (v_equipo, v_formacion,
          jsonb_build_object('por', v_por, 'def', to_jsonb(v_def), 'med', to_jsonb(v_med), 'del', to_jsonb(v_del)),
          v_banco, v_manual, v_capitan, now(), false)
  on conflict on constraint alineaciones_pkey do update
    set formacion = excluded.formacion, huecos = excluded.huecos, banquillo = excluded.banquillo,
        orden_manual = excluded.orden_manual, capitan_id = excluded.capitan_id, guardada_en = excluded.guardada_en,
        automatica = false;

  -- Tácticas (opcional): se validan contra la alineación que se acaba de guardar
  if slr_guardar_alineacion.tacticas is not null then
    perform guardar_tacticas(v_equipo, slr_guardar_alineacion.tacticas);
  end if;
  return (select to_jsonb(a) || jsonb_build_object('tacticas', tacticas_guardadas(v_equipo))
          from alineaciones a where a.equipo_id = v_equipo);
end $$;

create or replace function public.slr_confirmar_alineacion(token text, equipo_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_confirmar_alineacion.token);
  v_equipo  uuid := slr_confirmar_alineacion.equipo_id;
  v_liga    uuid;
begin
  select e.liga_id into v_liga from equipos e where e.id = v_equipo and e.usuario_id = v_usuario;
  if v_liga is null then
    raise exception 'Ese equipo no es tuyo' using errcode = 'P0001';
  end if;
  perform exigir_sin_exceso(v_equipo);
  if alineaciones_cerradas(v_liga) then
    raise exception 'Las alineaciones están cerradas hasta que se publique la jornada' using errcode = 'P0001';
  end if;
  update alineaciones a set guardada_en = now(), automatica = false where a.equipo_id = v_equipo;
  if not found then
    raise exception 'No tienes ninguna alineación guardada' using errcode = 'P0001';
  end if;
  return (select to_jsonb(a) from alineaciones a where a.equipo_id = v_equipo);
end $$;

revoke execute on function public.slr_guardar_tacticas(text, uuid, jsonb), public.slr_confirmar_alineacion(text, uuid),
  public.slr_guardar_alineacion(text, uuid, text, jsonb, uuid[], boolean, uuid, jsonb) from public;
grant execute on function public.slr_guardar_tacticas(text, uuid, jsonb), public.slr_confirmar_alineacion(text, uuid),
  public.slr_guardar_alineacion(text, uuid, text, jsonb, uuid[], boolean, uuid, jsonb) to anon, authenticated;
