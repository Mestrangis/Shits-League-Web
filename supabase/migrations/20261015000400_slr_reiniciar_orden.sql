-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — reiniciar beta: se conserva el orden de llegada
--
-- Al volver a unir a las personas, todos los equipos se creaban en la misma
-- transacción con el mismo creado_en (now()), y el orden de llegada (miembros,
-- desempates) quedaba al azar. Ahora cada equipo recupera su creado_en original.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.slr_admin_reiniciar_beta(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario  uuid := sesion_usuario(slr_admin_reiniciar_beta.token);
  v_liga     uuid := slr_admin_reiniciar_beta.liga_id;
  v_bots     uuid[];
  v_personas jsonb;
  v_equipos  jsonb := '[]';
  v_sesion   uuid;
  v_res      jsonb;
  t          text;
  r          record;
  v_cartas   int;
begin
  perform exigir_modo_beta(v_usuario, v_liga);
  perform 1 from ligas l where l.id = v_liga for update;
  v_bots := array(select e.usuario_id from equipos e join usuarios u on u.id = e.usuario_id
                  where e.liga_id = v_liga and u.interno);
  v_personas := coalesce((select jsonb_agg(jsonb_build_object('usuario_id', e.usuario_id, 'nombre', e.nombre, 'escudo_url', e.escudo_url, 'creado_en', e.creado_en) order by e.creado_en, e.id)
                          from equipos e join usuarios u on u.id = e.usuario_id
                          where e.liga_id = v_liga and not u.interno), '[]');
  -- Todas las tablas con liga_id (equipos, cartas, album, temporadas → jornadas →
  -- partidos, subastas, ventas, ofertas, intercambios, sobres, historial,
  -- notificaciones, tandas…); lo que cuelga de ellas se borra en cascada
  for t in select c.table_name::text
           from information_schema.columns c
           join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'liga_id'
             and tb.table_type = 'BASE TABLE' and c.table_name not in ('ligas', 'disenos_carta')
           order by case c.table_name when 'equipos' then 0 else 1 end, c.table_name loop
    execute format('delete from public.%I x where x.liga_id = $1', t) using v_liga;
  end loop;
  delete from usuarios u where u.id = any(v_bots) and u.interno;

  -- Un ejemplar libre de cada diseño activo (y de las cartas creadas en esta
  -- liga de prueba, que nacen inactivas)
  insert into cartas (liga_id, diseno_id)
  select v_liga, d.id from disenos_carta d where d.activo or d.liga_prueba_id = v_liga;
  get diagnostics v_cartas = row_count;
  update ligas l set estado = 'preparacion', temporada = 1, pausada_en = null where l.id = v_liga;
  perform apuntar_historial(v_liga, 'beta_reiniciada', 'La liga se ha reiniciado (modo pruebas)', '{}');

  -- Las personas vuelven a unirse como recién llegadas (sesión interna de un
  -- solo uso, como los bots). Si alguien ya no puede (p. ej. sin acceso a la
  -- beta), se queda fuera y se dice por qué.
  for r in select (x ->> 'usuario_id')::uuid usuario_id, x ->> 'nombre' nombre, x ->> 'escudo_url' escudo, (x ->> 'creado_en')::timestamptz creado_en from jsonb_array_elements(v_personas) x loop
    insert into sesiones (usuario_id) values (r.usuario_id) returning sesiones.token into v_sesion;
    begin
      v_res := slr_unirse_liga(v_sesion::text, (select l.codigo_invitacion from ligas l where l.id = v_liga), r.nombre);
      update equipos e set escudo_url = r.escudo, creado_en = r.creado_en where e.id = (v_res -> 'equipo' ->> 'id')::uuid;
      v_equipos := v_equipos || jsonb_build_object('nombre', r.nombre, 'equipo_id', v_res -> 'equipo' ->> 'id',
                                                   'cartas', v_res -> 'cartas', 'aviso', v_res -> 'aviso');
    exception when others then
      v_equipos := v_equipos || jsonb_build_object('nombre', r.nombre, 'cartas', 0, 'error', sqlerrm);
    end;
    delete from sesiones s where s.token = v_sesion;
  end loop;

  return jsonb_build_object('liga_id', v_liga, 'estado', 'preparacion', 'cartas', v_cartas,
                            'equipos', v_equipos, 'bots_quitados', cardinality(v_bots),
                            'bombo', bombo_plantillas(v_liga));
end $$;
