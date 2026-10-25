-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — cada pantalla en UNA llamada (repaso de rendimiento, fase 3)
--   · slr_rush_inicio: todo lo que pide Rush al entrar (antes, 14 llamadas):
--     slr_yo, la liga, la temporada, el calendario con la fecha de publicación de
--     cada jornada, las colecciones, el partido sin ver, las cartas propias con su
--     diseño, las que están en venta, la alineación, las tácticas, los avisos, el
--     sobre y el «haz hueco» pendientes, y las fotos del rival de la jornada.
--   · slr_rush_liga: la pantalla Liga entera (clasificación, equipos con su dueño,
--     los últimos amistosos y los fichajes): cambiar de vista ya no pide nada.
--   Solo juntan lo que ya devuelven las funciones y lecturas de antes (mismos
--   permisos: lo propio con el token, lo demás es público).
-- ═══════════════════════════════════════════════════════════════════════════

create function public.slr_rush_inicio(token text, prueba boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_yo    jsonb := slr_yo(slr_rush_inicio.token);
  v_usu   uuid;
  v_liga  uuid;
  v_eq    uuid;
  v_rival uuid;
  r       jsonb;
begin
  if not coalesce((v_yo ->> 'tiene_acceso')::boolean, false) then
    return jsonb_build_object('yo', v_yo);
  end if;
  v_usu := sesion_usuario(slr_rush_inicio.token);
  -- La liga que se juega: la principal o, en local, la primera de prueba
  if slr_rush_inicio.prueba then
    select (l ->> 'id')::uuid into v_liga
    from jsonb_array_elements(v_yo -> 'ligas') l where (l ->> 'es_prueba')::boolean limit 1;
  end if;
  v_liga := coalesce(v_liga, (v_yo -> 'liga_principal' ->> 'id')::uuid);
  if v_liga is null then
    return jsonb_build_object('yo', v_yo);
  end if;
  select e.id into v_eq from equipos e where e.liga_id = v_liga and e.usuario_id = v_usu;

  r := jsonb_build_object(
    'yo', v_yo,
    'liga_id', v_liga,
    'liga', (select jsonb_build_object('id', l.id, 'nombre', l.nombre, 'estado', l.estado, 'temporada', l.temporada,
                                        'config', l.config, 'pausada_en', l.pausada_en)
             from ligas l where l.id = v_liga),
    'temporada', (select jsonb_build_object('id', t.id, 'numero', t.numero, 'estado', t.estado,
                                             'iniciada_en', t.iniciada_en, 'terminada_en', t.terminada_en)
                  from temporadas t where t.liga_id = v_liga order by t.numero desc limit 1),
    'colecciones', coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'nombre', k.nombre, 'color', k.color, 'emblema_url', k.emblema_url,
                                          'descripcion', k.descripcion, 'liga_prueba_id', k.liga_prueba_id, 'creada_en', k.creada_en)
                       order by k.nombre)
      from colecciones k where k.liga_prueba_id is null or k.liga_prueba_id = v_liga), '[]'::jsonb)
  );
  if v_eq is null then
    return r;
  end if;

  -- El rival de la próxima jornada (para precargar las fotos de sus cartas)
  select case when p.local_id = v_eq then p.visitante_id else p.local_id end into v_rival
  from partidos p join jornadas j on j.id = p.jornada_id
  where j.liga_id = v_liga and j.estado in ('programada', 'cerrada', 'simulada') and v_eq in (p.local_id, p.visitante_id)
  order by j.numero limit 1;

  return r || jsonb_build_object(
    'equipo_id', v_eq,
    'calendario', slr_calendario(slr_rush_inicio.token, v_liga),
    'publicadas', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'publicada_en', j.publicada_en))
                            from jornadas j where j.liga_id = v_liga), '[]'::jsonb),
    'sin_ver', slr_sin_ver(slr_rush_inicio.token, v_liga),
    'cartas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'diseno_id', c.diseno_id, 'equipo_id', c.equipo_id,
               'multiplicador_clausula', c.multiplicador_clausula, 'blindada_hasta', c.blindada_hasta,
               'tocada_en_jornada', c.tocada_en_jornada, 'adquirida_en', c.adquirida_en, 'energia', c.energia,
               'disenos_carta', jsonb_build_object(
                 'nombre', d.nombre, 'tipo', d.tipo, 'acabado', d.acabado, 'color', d.color, 'tier', d.tier,
                 'rareza', d.rareza, 'coleccion_id', d.coleccion_id, 'perfil', d.perfil, 'personas', d.personas,
                 'ata', d.ata, 'def', d.def, 'con', d.con, 'valor', d.valor, 'poderes', d.poderes,
                 'imagen_url', d.imagen_url, 'texto', d.texto, 'estamina', d.estamina,
                 'tactica_favorita', d.tactica_favorita))
             order by c.adquirida_en, c.id)
      from cartas c join disenos_carta d on d.id = c.diseno_id where c.equipo_id = v_eq), '[]'::jsonb),
    'ventas', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'carta_id', v.carta_id, 'precio', v.precio))
                        from ventas v where v.vendedor_id = v_eq and v.estado = 'activa'), '[]'::jsonb),
    'alineacion', (select to_jsonb(a) from alineaciones a where a.equipo_id = v_eq),
    'tacticas', slr_mis_tacticas(slr_rush_inicio.token, v_eq),
    'notificaciones', slr_notificaciones(slr_rush_inicio.token),
    'sobre_pendiente', slr_sobre_pendiente(slr_rush_inicio.token, v_liga),
    'hueco_pendiente', slr_hueco_pendiente(slr_rush_inicio.token, v_liga),
    'fotos_rival', coalesce((select jsonb_agg(d.imagen_url) from cartas c join disenos_carta d on d.id = c.diseno_id
                             where c.equipo_id = v_rival and d.imagen_url is not null), '[]'::jsonb)
  );
end $$;

create function public.slr_rush_liga(token text, liga_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_liga uuid := slr_rush_liga.liga_id;
begin
  return jsonb_build_object(
    'clasificacion', slr_clasificacion(slr_rush_liga.token, v_liga),
    'equipos', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'creado_en', e.creado_en,
                                          'usuarios', jsonb_build_object('nombre', u.nombre, 'interno', u.interno))
                       order by e.creado_en)
      from equipos e join usuarios u on u.id = e.usuario_id where e.liga_id = v_liga), '[]'::jsonb),
    'amistosos', coalesce((
      select jsonb_agg(x order by x.simulado_en desc) from (
        select p.id, p.local_id, p.visitante_id, p.goles_local, p.goles_visitante, p.simulado_en, p.creado_por
        from partidos p where p.liga_id = v_liga and p.tipo = 'amistoso'
        order by p.simulado_en desc limit 8) x), '[]'::jsonb),
    'fichajes', coalesce((
      select jsonb_agg(x order by x.id desc) from (
        select h.id, h.tipo, h.texto, h.creado_en, h.datos
        from historial h where h.liga_id = v_liga and h.tipo in ('compra', 'clausula', 'intercambio', 'subasta', 'sobre')
        order by h.id desc limit 60) x), '[]'::jsonb)
  );
end $$;

revoke all on function public.slr_rush_inicio(text, boolean) from public;
revoke all on function public.slr_rush_liga(text, uuid) from public;
grant execute on function public.slr_rush_inicio(text, boolean) to anon, authenticated;
grant execute on function public.slr_rush_liga(text, uuid) to anon, authenticated;
