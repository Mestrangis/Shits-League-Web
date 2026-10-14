-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — motor v1.2.0, notificaciones con destino y plantillas
--
-- 1. Poderes del catálogo BETA para la v1.2.0: probabilidad al ~15 % (el 60 %
--    de la anterior, entre 0,10 y 0,20) y efecto según el nivel (simple +0,20,
--    fuerte +0,30, muy fuerte +0,40). Los "siempre" (tirador) no cambian, y los
--    de tirador conservan su multiplicador. El valor lo recalcula el trigger
--    (el nivel no cambia, así que el valor tampoco). Mismo cálculo que
--    tests/slr/catalogo-beta.mjs (poderV120). Las alineaciones ya congeladas
--    guardan sus poderes: los partidos jugados no cambian.
-- 2. Notificaciones: destino (tipo + id) guardado en el servidor; los
--    amistosos ya no avisan y se borran sus avisos.
-- 3. slr_admin_cartas: todas las cartas de la liga y los equipos (con dueño y
--    cartas ocupadas) para la herramienta de plantillas.
-- ═══════════════════════════════════════════════════════════════════════════

/* ── 1. Poderes del catálogo beta ─────────────────────────────────────────── */
create function public.poder_v120(p jsonb) returns jsonb
language sql immutable set search_path = public, extensions as $$
  select case
    when p -> 'probabilidad' = '"siempre"'::jsonb then p
    else p
      || jsonb_build_object('probabilidad',
           least(0.20, greatest(0.10, round((p ->> 'probabilidad')::numeric * 0.6, 2))))
      || case when p ->> 'momento' = 'tirador' then '{}'::jsonb
              else jsonb_build_object('efecto', case p ->> 'nivel' when 'simple' then 0.20 when 'fuerte' then 0.30
                                                                   when 'muy fuerte' then 0.40 else (p ->> 'efecto')::numeric end)
         end
  end
$$;

update public.disenos_carta d
   set poderes = (select coalesce(jsonb_agg(poder_v120(x) order by n), '[]'::jsonb)
                  from jsonb_array_elements(d.poderes) with ordinality as t(x, n))
 where d.beta and jsonb_array_length(d.poderes) > 0;

drop function public.poder_v120(jsonb);

/* ── 2. Notificaciones con destino ────────────────────────────────────────── */
-- destino_tipo: 'carta' (detalle de la carta), 'partido' (crónica),
-- 'movimientos' (Perfil → movimientos; id = equipo) o 'liga' (estado de la
-- liga; id = liga). Sin destino: se muestra sin flecha.
alter table public.notificaciones
  add column destino_tipo text check (destino_tipo in ('carta', 'partido', 'movimientos', 'liga')),
  add column destino_id   text;

create function public.destino_notificacion(p_tipo text, p_datos jsonb, p_usuario uuid, p_liga uuid,
                                            out destino_tipo text, out destino_id text)
language plpgsql stable set search_path = public, extensions as $$
declare
  v_equipo uuid := (select e.id from equipos e where e.usuario_id = p_usuario and e.liga_id = p_liga);
begin
  case
    -- Dinero cobrado
    when p_tipo in ('venta_completada', 'clausula_recibida') then
      destino_tipo := 'movimientos'; destino_id := v_equipo::text;
    -- Carta recibida, perdida o con algo pendiente
    when p_tipo in ('eleccion_automatica', 'subasta_ganada', 'subasta_perdida', 'puja_anulada', 'subasta_cancelada',
                    'oferta_recibida', 'oferta_aceptada', 'oferta_rechazada', 'contraoferta', 'oferta_caducada',
                    'oferta_cancelada', 'venta_cancelada', 'admin_carta')
         and p_datos ? 'carta_id' then
      destino_tipo := 'carta'; destino_id := p_datos ->> 'carta_id';
    -- Partido de liga publicado: su crónica (si descansó, sus cobros o la liga)
    when p_tipo = 'jornada_publicada' then
      select 'partido', p.id::text into destino_tipo, destino_id
      from partidos p
      where p.jornada_id = (p_datos ->> 'jornada_id')::uuid and v_equipo in (p.local_id, p.visitante_id)
      limit 1;
      if destino_tipo is null then
        if coalesce((p_datos ->> 'cobrado')::numeric, 0) > 0 then
          destino_tipo := 'movimientos'; destino_id := v_equipo::text;
        else
          destino_tipo := 'liga'; destino_id := p_liga::text;
        end if;
      end if;
    -- Pausa, reanudación, temporada, aplazamiento: el estado de la liga
    when p_tipo in ('liga_pausada', 'liga_reanudada', 'temporada_iniciada', 'temporada_terminada', 'jornada_aplazada') then
      destino_tipo := 'liga'; destino_id := p_liga::text;
    else
      null;   -- intercambios y demás: sin destino
  end case;
end $$;

create function public.notificaciones_destino() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.destino_tipo is null then
    select d.destino_tipo, d.destino_id into new.destino_tipo, new.destino_id
    from destino_notificacion(new.tipo, new.datos, new.usuario_id, new.liga_id) d;
  end if;
  return new;
end $$;

create trigger notificaciones_destino before insert on public.notificaciones
  for each row execute function public.notificaciones_destino();

-- Los amistosos ya no avisan: fuera los avisos que ya existían
delete from public.notificaciones n where n.tipo = 'amistoso';

-- Destino de las que ya existen
update public.notificaciones n
   set (destino_tipo, destino_id) = (select d.destino_tipo, d.destino_id
                                     from destino_notificacion(n.tipo, n.datos, n.usuario_id, n.liga_id) d)
 where true;

-- Lista de notificaciones, ahora con el destino
create or replace function public.slr_notificaciones(token text, marcar_leidas bigint[] default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_notificaciones.token);
  v_marcar  bigint[] := slr_notificaciones.marcar_leidas;
begin
  if v_marcar is not null then
    update notificaciones n set leida = true where n.usuario_id = v_usuario and n.id = any(v_marcar);
  end if;
  return jsonb_build_object(
    'no_leidas', (select count(*) from notificaciones n where n.usuario_id = v_usuario and not n.leida),
    'notificaciones', coalesce((
      select jsonb_agg(x order by x.id desc) from (
        select n.id, n.liga_id, n.tipo, n.datos, n.leida, n.creada_en, n.destino_tipo, n.destino_id
        from notificaciones n where n.usuario_id = v_usuario order by n.id desc limit 100) x), '[]'));
end $$;

-- Amistoso: se guarda igual, pero sin notificación
create or replace function public.motor_guardar_amistoso(p_partido uuid, p_resultado jsonb, p_version text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_p partidos;
begin
  select * into v_p from partidos p where p.id = p_partido and p.tipo = 'amistoso' for update;
  if not found or v_p.goles_local is not null then
    return jsonb_build_object('ya_guardado', true);
  end if;
  update partidos p
     set goles_local = (p_resultado -> 'goles' ->> 0)::int, goles_visitante = (p_resultado -> 'goles' ->> 1)::int,
         pr = p_resultado -> 'pr', lesiones = coalesce(p_resultado -> 'lesiones', '[]'),
         estadisticas = p_resultado -> 'estadisticas', version_motor = p_version, simulado_en = now()
   where p.id = p_partido;
  return jsonb_build_object('partido_id', p_partido, 'goles', p_resultado -> 'goles');
end $$;

/* ── 3. Herramienta de plantillas: todas las cartas de la liga ────────────── */
create function public.slr_admin_cartas(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_admin_cartas.token);
  v_liga    uuid := slr_admin_cartas.liga_id;
begin
  perform exigir_modo_beta(v_usuario, v_liga);
  return jsonb_build_object(
    'maximo', plantilla_maxima(v_liga),
    'equipos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'nombre', e.nombre, 'usuario', u.nombre, 'bot', u.interno,
               'cartas', plantilla_ocupada(e.id)) order by e.nombre)
      from equipos e join usuarios u on u.id = e.usuario_id where e.liga_id = v_liga), '[]'::jsonb),
    'cartas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'nombre', d.nombre, 'tipo', d.tipo, 'acabado', d.acabado, 'personas', d.personas,
               'ata', d.ata, 'def', d.def, 'con', d.con, 'valor', d.valor, 'poderes', d.poderes,
               'imagen_url', d.imagen_url, 'activo', d.activo, 'equipo_id', c.equipo_id)
             order by d.valor desc, d.nombre)
      from cartas c join disenos_carta d on d.id = c.diseno_id where c.liga_id = v_liga), '[]'::jsonb));
end $$;

revoke execute on function public.destino_notificacion(text, jsonb, uuid, uuid), public.notificaciones_destino()
  from public, anon, authenticated;
revoke execute on function public.slr_admin_cartas(text, uuid) from public;
grant execute on function public.slr_admin_cartas(text, uuid) to anon, authenticated;
