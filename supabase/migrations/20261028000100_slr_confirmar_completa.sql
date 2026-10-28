-- Confirmar la alineación exige el once completo (con cartas propias): un equipo nuevo
-- empieza sin cartas colocadas y confirmar así daría el bonus de participación sin hacerla.

create or replace function public.alineacion_incompleta(p_equipo uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((
    select exists (
      select 1 from (
        select a.huecos ->> 'por' x
        union all select jsonb_array_elements_text(a.huecos -> 'def')
        union all select jsonb_array_elements_text(a.huecos -> 'med')
        union all select jsonb_array_elements_text(a.huecos -> 'del')
      ) h
      where h.x is null or not exists (select 1 from cartas c where c.id = h.x::uuid and c.equipo_id = p_equipo))
    from alineaciones a where a.equipo_id = p_equipo), true)
$$;

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
  -- Confirmar una alineación vacía o a medias daría el bonus sin haberla hecho
  if alineacion_incompleta(v_equipo) then
    raise exception 'Coloca tus cartas: el once tiene que estar completo para confirmarlo' using errcode = 'P0001';
  end if;
  update alineaciones a set guardada_en = now(), automatica = false where a.equipo_id = v_equipo;
  if not found then
    raise exception 'No tienes ninguna alineación guardada' using errcode = 'P0001';
  end if;
  return (select to_jsonb(a) from alineaciones a where a.equipo_id = v_equipo);
end $$;

revoke execute on function public.alineacion_incompleta(uuid) from public, anon, authenticated;
