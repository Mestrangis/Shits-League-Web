-- ═══════════════════════════════════════════════════════════════════════════
-- SLR paso 5 (entrega 1, ajustes): cambiar el nombre del equipo propio.
-- La liga principal ya existe (la creó Marcos desde la interfaz), así que esta
-- migración no crea ninguna. Mismas reglas de nombre que al unirse.
-- ═══════════════════════════════════════════════════════════════════════════

create function public.slr_renombrar_equipo(token text, equipo_id uuid, nombre text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_renombrar_equipo.token);
  v_equipo  uuid := slr_renombrar_equipo.equipo_id;
  v_nombre  text := trim(slr_renombrar_equipo.nombre);
  v_eq      equipos;
begin
  select * into v_eq from equipos e where e.id = v_equipo and e.usuario_id = v_usuario for update;
  if not found then
    raise exception 'Ese equipo no es tuyo' using errcode = 'P0001';
  end if;
  if v_nombre is null or length(v_nombre) < 3 or length(v_nombre) > 30 then
    raise exception 'El nombre del equipo debe tener entre 3 y 30 caracteres' using errcode = 'P0001';
  end if;
  if v_nombre = v_eq.nombre then
    return jsonb_build_object('equipo_id', v_eq.id, 'nombre', v_nombre);
  end if;
  if exists (select 1 from equipos e where e.liga_id = v_eq.liga_id and e.id <> v_eq.id and lower(e.nombre) = lower(v_nombre)) then
    raise exception 'Ya hay un equipo con ese nombre en la liga' using errcode = 'P0001';
  end if;

  update equipos e set nombre = v_nombre where e.id = v_eq.id;
  perform apuntar_historial(v_eq.liga_id, 'equipo_renombrado',
    format('%s ahora se llama «%s»', v_eq.nombre, v_nombre),
    jsonb_build_object('equipo_id', v_eq.id, 'antes', v_eq.nombre, 'despues', v_nombre));
  return jsonb_build_object('equipo_id', v_eq.id, 'nombre', v_nombre);
end $$;

revoke execute on function public.slr_renombrar_equipo(text, uuid, text) from public;
grant execute on function public.slr_renombrar_equipo(text, uuid, text) to anon, authenticated;
