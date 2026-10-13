-- ═══════════════════════════════════════════════════════════════════════════
-- SLR · corrección: borrar una liga también borra los usuarios internos de sus
-- bots del modo pruebas (antes se quedaban huérfanos, sin equipo). Se limpian
-- los que ya habían quedado así.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.slr_borrar_liga(token text, liga_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_borrar_liga.token);
  v_liga    uuid := slr_borrar_liga.liga_id;
  v_admin   uuid;
  v_bots    uuid[];
begin
  select l.admin_id into v_admin from ligas l where l.id = v_liga for update;
  if v_admin is null then
    raise exception 'Esa liga no existe' using errcode = 'P0001';
  end if;
  if v_admin <> v_usuario then
    raise exception 'Solo el administrador puede borrar la liga' using errcode = 'P0001';
  end if;
  v_bots := array(select e.usuario_id from equipos e join usuarios u on u.id = e.usuario_id
                  where e.liga_id = v_liga and u.interno);
  delete from ligas l where l.id = v_liga;
  delete from usuarios u where u.id = any(v_bots) and u.interno;
  return true;
end $$;

delete from public.usuarios u
where u.interno and not exists (select 1 from public.equipos e where e.usuario_id = u.id);
