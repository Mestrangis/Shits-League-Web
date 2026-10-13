-- ═══════════════════════════════════════════════════════════════════════════
-- SLR paso 5 (entrega 1): lo que necesita la interfaz
--   · usuarios.es_admin (solo Marcos): el único que puede crear la liga
--   · una única liga "principal" (no de prueba): slr_crear_liga solo si no existe
--   · slr_unirse_liga_principal(token, nombre_equipo)
--   · slr_yo devuelve es_admin y la liga principal (con o sin equipo del usuario)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.usuarios add column es_admin boolean not null default false;
update public.usuarios u set es_admin = true where u.nombre = 'Marcos' and not u.es_bot;

create or replace function public.usuario_json(p_usuario uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object('id', u.id, 'nombre', u.nombre, 'avatar_url', u.avatar_url, 'es_admin', u.es_admin)
  from usuarios u where u.id = p_usuario
$$;

-- La liga principal: la única que no es de prueba (null si todavía no existe)
create function public.liga_principal() returns uuid
language sql stable set search_path = public, extensions as $$
  select l.id from ligas l where not l.es_prueba order by l.creada_en limit 1
$$;

create or replace function public.slr_crear_liga(token text, nombre text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_crear_liga.token);
begin
  if not exists (select 1 from usuarios u where u.id = v_usuario and u.es_admin) then
    raise exception 'Solo el administrador de Shits League Rush puede crear la liga' using errcode = 'P0001';
  end if;
  -- Dos peticiones a la vez no pueden crear dos ligas principales
  lock table ligas in share row exclusive mode;
  if liga_principal() is not null then
    raise exception 'La liga ya existe: solo hay una' using errcode = 'P0001';
  end if;
  return crear_liga_interna(v_usuario, slr_crear_liga.nombre, false);
end $$;

-- Unirse a la liga principal sin código de invitación (mismas reglas que slr_unirse_liga)
create function public.slr_unirse_liga_principal(token text, nombre_equipo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_codigo text;
begin
  perform sesion_usuario(slr_unirse_liga_principal.token);
  select l.codigo_invitacion into v_codigo from ligas l where l.id = liga_principal();
  if v_codigo is null then
    raise exception 'Todavía no hay liga' using errcode = 'P0001';
  end if;
  return slr_unirse_liga(slr_unirse_liga_principal.token, v_codigo, slr_unirse_liga_principal.nombre_equipo);
end $$;

-- slr_yo: añade es_admin y la liga principal
create or replace function public.slr_yo(token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_yo.token);
  v_lp      uuid := liga_principal();
begin
  return jsonb_build_object(
    'usuario', usuario_json(v_usuario),
    'es_admin', (select u.es_admin from usuarios u where u.id = v_usuario),
    'liga_principal', (
      select jsonb_build_object(
               'id', l.id, 'nombre', l.nombre, 'estado', l.estado, 'temporada', l.temporada,
               'pausada_en', l.pausada_en, 'es_admin', l.admin_id = v_usuario,
               'codigo_invitacion', case when l.admin_id = v_usuario then l.codigo_invitacion end,
               'equipo_id', (select e.id from equipos e where e.liga_id = l.id and e.usuario_id = v_usuario))
      from ligas l where l.id = v_lp),
    'ligas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'nombre', l.nombre, 'estado', l.estado, 'temporada', l.temporada,
               'pausada_en', l.pausada_en, 'es_admin', l.admin_id = v_usuario, 'es_prueba', l.es_prueba,
               'codigo_invitacion', l.codigo_invitacion)
             order by l.creada_en)
      from ligas l
      where l.admin_id = v_usuario
         or exists (select 1 from equipos e where e.liga_id = l.id and e.usuario_id = v_usuario)
    ), '[]'::jsonb),
    'equipos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'liga_id', e.liga_id, 'nombre', e.nombre, 'escudo_url', e.escudo_url, 'saldo', e.saldo)
             order by e.creado_en)
      from equipos e where e.usuario_id = v_usuario
    ), '[]'::jsonb),
    'sobres_pendientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'liga_id', s.liga_id, 'equipo_id', s.equipo_id, 'caduca_en', s.caduca_en,
               'candidatas', (select jsonb_agg(carta_json(x) order by o) from unnest(s.cartas) with ordinality t(x, o)))
             order by s.creado_en)
      from sobres_abiertos s join equipos e on e.id = s.equipo_id
      where e.usuario_id = v_usuario and s.estado = 'pendiente_eleccion'
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.liga_principal() from public, anon, authenticated;
revoke execute on function public.slr_unirse_liga_principal(text, text) from public;
grant execute on function public.slr_unirse_liga_principal(text, text) to anon, authenticated;
