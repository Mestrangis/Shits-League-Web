-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — colección de la semana y progresión
--   Una colección solo puede salir como colección de la semana si la rareza más
--   alta de TODAS sus cartas (libres o no) ya está desbloqueada: con la
--   progresión activa, una con legendarias no sale antes de la J6 y una con
--   épicas, antes de la J4. Sin progresión (beta), cualquiera.
--   El admin puede elegir a mano una que no cumpla: se le avisa y se aplica.
--   Sin colección indicada, el admin sortea otra con la regla.
-- ═══════════════════════════════════════════════════════════════════════════

-- Rareza más alta de las cartas de una colección (activas, del catálogo o de esa liga de prueba)
create function public.rareza_maxima_coleccion(p_liga uuid, p_coleccion uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select d.rareza from disenos_carta d
  where d.coleccion_id = p_coleccion and d.activo and (d.liga_prueba_id is null or d.liga_prueba_id = p_liga)
  order by rango_rareza(d.rareza) desc limit 1
$$;

create function public.coleccion_desbloqueada(p_liga uuid, p_coleccion uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select not progresion_activa(p_liga)
      or coalesce(rareza_maxima_coleccion(p_liga, p_coleccion) = any(rarezas_desbloqueadas(p_liga)), true)
$$;

create or replace function public.coleccion_semana(p_liga uuid, p_ahora timestamptz default now()) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_semana date := semana_liga(p_liga, p_ahora);
  v_col    uuid;
begin
  select cs.coleccion_id into v_col from colecciones_semana cs where cs.liga_id = p_liga and cs.semana = v_semana;
  if found then
    return v_col;
  end if;
  perform asignar_cupos(p_liga);
  select k.id into v_col
  from colecciones k
  where (k.liga_prueba_id is null or k.liga_prueba_id = p_liga)
    and coleccion_desbloqueada(p_liga, k.id)
    and exists (select 1 from cartas c join disenos_carta d on d.id = c.diseno_id
                where c.liga_id = p_liga and d.coleccion_id = k.id and c.equipo_id is null and d.activo
                  and c.reservada_por is null and en_bombo(p_liga, d.rareza, c.libera_jornada)
                  and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta'))
  order by random() limit 1;
  insert into colecciones_semana (liga_id, semana, coleccion_id) values (p_liga, v_semana, v_col)
  on conflict do nothing;
  if v_col is not null then
    perform apuntar_historial(p_liga, 'coleccion_semana',
      format('Colección de la semana: %s', (select k.nombre from colecciones k where k.id = v_col)),
      jsonb_build_object('coleccion_id', v_col, 'semana', v_semana));
  end if;
  return v_col;
end $$;

-- A mano (Modo pruebas): se aplica aunque no cumpla la regla, con aviso.
-- Sin colección: se sortea otra con la regla.
drop function public.slr_admin_coleccion_semana(text, uuid, uuid);
create function public.slr_admin_coleccion_semana(token text, liga_id uuid, coleccion_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  v_liga  uuid := slr_admin_coleccion_semana.liga_id;
  v_col   uuid := slr_admin_coleccion_semana.coleccion_id;
  v_max   text;
  v_aviso text;
  v_sig   jsonb;
begin
  perform exigir_modo_beta(sesion_usuario(slr_admin_coleccion_semana.token), v_liga);
  if v_col is null then
    delete from colecciones_semana cs where cs.liga_id = v_liga and cs.semana = semana_liga(v_liga);
    v_col := coleccion_semana(v_liga);
    return jsonb_build_object('coleccion_id', v_col, 'semana', semana_liga(v_liga), 'sorteada', true);
  end if;
  if not exists (select 1 from colecciones k where k.id = v_col and (k.liga_prueba_id is null or k.liga_prueba_id = v_liga)) then
    raise exception 'Esa colección no existe en esta liga' using errcode = 'P0001';
  end if;
  if not coleccion_desbloqueada(v_liga, v_col) then
    v_max := rareza_maxima_coleccion(v_liga, v_col);
    select jsonb_build_object('jornada', (t ->> 'desde')::int) into v_sig
    from jsonb_array_elements(config_liga(v_liga) -> 'progresion' -> 'tramos') t
    where t -> 'rarezas' ? v_max order by (t ->> 'desde')::int limit 1;
    v_aviso := format('Esta colección tiene cartas %s, que aún no están desbloqueadas (jornada %s; llegan en la jornada %s). La eligen igual porque la has puesto a mano.',
      case v_max when 'legendaria' then 'legendarias' when 'epica' then 'épicas' else v_max || 's' end,
      jornada_progresion(v_liga), coalesce(v_sig ->> 'jornada', '?'));
  end if;
  insert into colecciones_semana (liga_id, semana, coleccion_id, manual) values (v_liga, semana_liga(v_liga), v_col, true)
  on conflict (liga_id, semana) do update set coleccion_id = excluded.coleccion_id, manual = true, elegida_en = now();
  perform apuntar_historial(v_liga, 'coleccion_semana',
    format('Colección de la semana: %s (elegida por el administrador)', (select k.nombre from colecciones k where k.id = v_col)),
    jsonb_build_object('coleccion_id', v_col, 'manual', true, 'aviso', v_aviso));
  return jsonb_build_object('coleccion_id', v_col, 'semana', semana_liga(v_liga), 'aviso', v_aviso);
end $$;

revoke execute on function public.rareza_maxima_coleccion(uuid, uuid), public.coleccion_desbloqueada(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.slr_admin_coleccion_semana(text, uuid, uuid) from public;
grant execute on function public.slr_admin_coleccion_semana(text, uuid, uuid) to anon, authenticated;
