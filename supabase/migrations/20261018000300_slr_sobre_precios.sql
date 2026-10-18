-- Editar un sobre sin mandar precios conserva los que tenía (antes quedaba un array vacío)
create or replace function public.slr_admin_guardar_sobre(token text, liga_id uuid, tipo text, datos jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  v_liga  uuid := slr_admin_guardar_sobre.liga_id;
  v_tipo  text := slr_admin_guardar_sobre.tipo;
  v_d     jsonb := coalesce(slr_admin_guardar_sobre.datos, '{}');
  v_base  tipos_sobre;
  v_pesos jsonb;
  k       text;
begin
  perform exigir_modo_beta(sesion_usuario(slr_admin_guardar_sobre.token), v_liga);
  select * into v_base from tipos_sobre_liga(v_liga) t where t.tipo = v_tipo;
  if not found then
    raise exception 'Tipo de sobre desconocido: %', v_tipo using errcode = 'P0001';
  end if;
  for k in select jsonb_object_keys(v_d) loop
    if k not in ('nombre', 'descripcion', 'precios', 'pesos', 'activo', 'imagen_url', 'orden') then
      raise exception 'Campo desconocido: %', k using errcode = 'P0001';
    end if;
  end loop;
  v_pesos := coalesce(v_d -> 'pesos', v_base.pesos);
  if jsonb_typeof(v_pesos) <> 'object'
     or exists (select 1 from jsonb_each(v_pesos) where key not in ('comun', 'rara', 'epica', 'legendaria')
                  or jsonb_typeof(value) <> 'number' or value::numeric < 0)
     or (select coalesce(sum(value::numeric), 0) from jsonb_each(v_pesos)) <= 0 then
    raise exception 'Pesos no válidos: números ≥ 0 para comun, rara, epica y legendaria, y alguno mayor que 0' using errcode = 'P0001';
  end if;
  if v_d ? 'precios' and (jsonb_typeof(v_d -> 'precios') <> 'array' or jsonb_array_length(v_d -> 'precios') <> 3
       or exists (select 1 from jsonb_array_elements(v_d -> 'precios') x where jsonb_typeof(x) <> 'number' or x::numeric < 1
                    or x::numeric <> trunc(x::numeric))) then
    raise exception 'Precios: tres números enteros positivos (J1–3, J4–5 y J6+)' using errcode = 'P0001';
  end if;
  insert into tipos_sobre as t (liga_id, tipo, nombre, descripcion, precios, cartas, pesos, imagen_url, activo, orden, editado_en)
  values (v_liga, v_tipo,
          coalesce(trim(v_d ->> 'nombre'), v_base.nombre), coalesce(v_d ->> 'descripcion', v_base.descripcion),
          case when v_d ? 'precios' then array(select x::int from jsonb_array_elements_text(v_d -> 'precios') x) else v_base.precios end,
          v_base.cartas, v_pesos,
          case when v_d ? 'imagen_url' then nullif(trim(v_d ->> 'imagen_url'), '') else v_base.imagen_url end,
          coalesce((v_d ->> 'activo')::boolean, v_base.activo), coalesce((v_d ->> 'orden')::int, v_base.orden), now())
  on conflict (coalesce(liga_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo) do update
    set nombre = excluded.nombre, descripcion = excluded.descripcion, precios = excluded.precios, pesos = excluded.pesos,
        imagen_url = excluded.imagen_url, activo = excluded.activo, orden = excluded.orden, editado_en = now();
  perform apuntar_historial(v_liga, 'admin_sobre', format('Sobre %s editado (modo pruebas)', v_tipo), jsonb_build_object('tipo', v_tipo, 'cambios', v_d));
  return (select to_jsonb(t) from tipos_sobre t where t.liga_id = v_liga and t.tipo = v_tipo);
end $$;
