-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — catálogo corto: plantillas incompletas sin errores
--
-- Con pocas individuales en el catálogo, el bombo de plantillas iniciales (las
-- individuales libres sin el 20 % más caro) puede no llegar para todos.
-- asignar_plantilla_inicial ya completaba con las caras más baratas; si aun
-- así no llega, ahora:
--   1. crear_alineacion_por_defecto coloca las cartas que haya (hueco a hueco,
--      el resto vacío: en el partido juegan Canteranos) en vez de no crear nada.
--   2. slr_unirse_liga devuelve `aviso` y deja el aviso en la campana del
--      equipo y en el historial («plantilla_incompleta»), sin error.
--   3. slr_admin_anadir_bot devuelve cuántas cartas tiene el bot y el aviso.
--   4. slr_admin_reiniciar_beta conserva los equipos de personas: los vuelve a
--      unir con su nombre (plantilla, saldo y alineación nuevos, por orden de
--      llegada) y solo quita los bots. Devuelve las plantillas y los avisos.
--   5. slr_admin_bombo: cuántas plantillas iniciales completas quedan
--      (contador del Modo pruebas).
-- ═══════════════════════════════════════════════════════════════════════════

/* ── 1. Alineación por defecto con menos de 7 cartas ──────────────────────── */
-- 2-2-2 con las mejores cartas para cada hueco (POR por DEF; DEF por DEF; MED
-- por CON; DEL por ATA; banquillo las 3 siguientes por OVR; capitán el titular
-- de mayor OVR). Con menos de 7 cartas, los huecos que falten quedan vacíos.
create or replace function public.crear_alineacion_por_defecto(p_equipo uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_por     uuid;
  v_def     uuid[];
  v_med     uuid[];
  v_del     uuid[];
  v_banco   uuid[];
  v_usadas  uuid[] := '{}';
  v_capitan uuid;
begin
  select p.id into v_por from cartas_equipo(p_equipo) p order by p.def desc, p.o desc, p.id limit 1;
  if v_por is not null then v_usadas := array[v_por]; end if;
  v_def := array(select p.id from cartas_equipo(p_equipo) p where p.id <> all(v_usadas) order by p.def desc, p.o desc, p.id limit 2);
  v_usadas := v_usadas || v_def;
  v_med := array(select p.id from cartas_equipo(p_equipo) p where p.id <> all(v_usadas) order by p.con desc, p.o desc, p.id limit 2);
  v_usadas := v_usadas || v_med;
  v_del := array(select p.id from cartas_equipo(p_equipo) p where p.id <> all(v_usadas) order by p.ata desc, p.o desc, p.id limit 2);
  v_usadas := v_usadas || v_del;
  v_banco := array(select p.id from cartas_equipo(p_equipo) p where p.id <> all(v_usadas) order by p.o desc, p.id limit 3);
  select p.id into v_capitan from cartas_equipo(p_equipo) p where p.id = any(v_usadas) order by p.o desc, p.id limit 1;
  -- Huecos que falten: vacíos (siempre 2 por línea)
  v_def := v_def || array_fill(null::uuid, array[2 - cardinality(v_def)]);
  v_med := v_med || array_fill(null::uuid, array[2 - cardinality(v_med)]);
  v_del := v_del || array_fill(null::uuid, array[2 - cardinality(v_del)]);

  insert into alineaciones as a (equipo_id, formacion, huecos, banquillo, orden_manual, capitan_id, guardada_en, automatica)
  values (p_equipo, '2-2-2',
          jsonb_build_object('por', v_por, 'def', to_jsonb(v_def), 'med', to_jsonb(v_med), 'del', to_jsonb(v_del)),
          v_banco, false, v_capitan, now(), true)
  on conflict (equipo_id) do update
    set formacion = excluded.formacion, huecos = excluded.huecos, banquillo = excluded.banquillo,
        orden_manual = excluded.orden_manual, capitan_id = excluded.capitan_id, guardada_en = excluded.guardada_en,
        automatica = true;
  return (select to_jsonb(a) from alineaciones a where a.equipo_id = p_equipo);
end $$;

/* ── 2. Unirse: aviso si la plantilla inicial no llega ────────────────────── */
-- Texto del aviso (null si la plantilla está completa)
create function public.aviso_plantilla_corta(p_liga uuid, p_cartas int) returns text
language sql stable set search_path = public, extensions as $$
  select case when p_cartas < n then
    format('Plantilla inicial incompleta: no quedaban individuales libres suficientes y el equipo empieza con %s de %s cartas. ' ||
           'Los huecos vacíos los ocupan Canteranos; consigue más en el mercado.', p_cartas, n)
  end
  from (select coalesce((config_liga(p_liga) ->> 'plantilla_inicial')::int, 11) n) x
$$;

-- slr_unirse_liga (de 20261013020200_slr_temporadas_ajustes.sql) + aviso
create or replace function public.slr_unirse_liga(token text, codigo_invitacion text, nombre_equipo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario    uuid := sesion_usuario(slr_unirse_liga.token);
  v_codigo     text := upper(trim(slr_unirse_liga.codigo_invitacion));
  v_nombre     text := trim(slr_unirse_liga.nombre_equipo);
  v_liga       ligas%rowtype;
  v_equipo     uuid;
  v_saldo      int;
  v_plantilla  jsonb;
  v_alineacion jsonb;
  v_cartas     int;
  v_aviso      text;
begin
  -- Bloquea la liga: dos altas a la vez no pueden repartirse las mismas cartas
  select * into v_liga from ligas l where l.codigo_invitacion = v_codigo for update;
  if not found then
    raise exception 'Código de invitación incorrecto' using errcode = 'P0001';
  end if;
  -- Solo antes de la primera temporada o entre temporadas
  if v_liga.estado not in ('preparacion', 'entre_temporadas') then
    raise exception 'No te puedes unir con una temporada en marcha: espera a que termine' using errcode = 'P0001';
  end if;
  if exists (select 1 from equipos e where e.liga_id = v_liga.id and e.usuario_id = v_usuario) then
    raise exception 'Ya tienes un equipo en esta liga' using errcode = 'P0001';
  end if;
  if v_nombre is null or length(v_nombre) < 3 or length(v_nombre) > 30 then
    raise exception 'El nombre del equipo debe tener entre 3 y 30 caracteres' using errcode = 'P0001';
  end if;
  if exists (select 1 from equipos e where e.liga_id = v_liga.id and lower(e.nombre) = lower(v_nombre)) then
    raise exception 'Ya hay un equipo con ese nombre en la liga' using errcode = 'P0001';
  end if;

  insert into equipos (liga_id, usuario_id, nombre, saldo)
  values (v_liga.id, v_usuario, v_nombre, 0)
  returning id into v_equipo;

  v_saldo := mover_dinero(v_equipo, coalesce((v_liga.config ->> 'saldo_inicial')::int, 5000),
                          'saldo_inicial', 'liga:' || v_liga.id);

  v_plantilla := asignar_plantilla_inicial(v_liga.id, v_equipo, v_liga.config);

  insert into album (usuario_id, liga_id, diseno_id, via_adquisicion)
  select v_usuario, v_liga.id, c.diseno_id, 'inicial'
  from cartas c where c.equipo_id = v_equipo
  on conflict do nothing;

  v_alineacion := crear_alineacion_por_defecto(v_equipo);

  insert into historial (liga_id, tipo, texto, datos)
  values (v_liga.id, 'equipo_unido', format('%s se une a la liga con «%s»', (select u.nombre from usuarios u where u.id = v_usuario), v_nombre),
          jsonb_build_object('usuario_id', v_usuario, 'equipo_id', v_equipo));

  v_cartas := (select count(*) from cartas c where c.equipo_id = v_equipo);
  v_aviso := aviso_plantilla_corta(v_liga.id, v_cartas);
  if v_aviso is not null then
    perform notificar(v_equipo, 'plantilla_incompleta', v_aviso, jsonb_build_object('cartas', v_cartas));
    perform apuntar_historial(v_liga.id, 'plantilla_incompleta',
      format('«%s» empieza con %s cartas: no quedan individuales libres suficientes para una plantilla completa', v_nombre, v_cartas),
      jsonb_build_object('equipo_id', v_equipo, 'cartas', v_cartas));
  end if;

  return jsonb_build_object(
    'equipo', jsonb_build_object('id', v_equipo, 'liga_id', v_liga.id, 'nombre', v_nombre, 'saldo', v_saldo),
    'plantilla_inicial', v_plantilla,
    'cartas', v_cartas,
    'aviso', v_aviso,
    'alineacion', v_alineacion
  );
end $$;

/* ── 3. Añadir bot: cartas y aviso ────────────────────────────────────────── */
create or replace function public.slr_admin_anadir_bot(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_admin_anadir_bot.token);
  v_liga    uuid := slr_admin_anadir_bot.liga_id;
  v_l       ligas;
  v_nombre  text;
  v_bot     uuid;
  v_sesion  uuid;
  v_res     jsonb;
begin
  perform exigir_modo_beta(v_usuario, v_liga);
  select * into v_l from ligas l where l.id = v_liga;
  if v_l.estado not in ('preparacion', 'entre_temporadas') then
    raise exception 'Los bots solo se pueden añadir antes de empezar la temporada o entre temporadas' using errcode = 'P0001';
  end if;
  v_nombre := nombre_equipo_bot(v_liga);
  insert into usuarios (nombre, es_bot, interno)
  values (format('🤖 %s · %s', v_nombre, left(md5(v_liga::text || clock_timestamp()::text), 4)), true, true)
  returning id into v_bot;
  -- Se une como cualquiera (misma plantilla inicial y alineación 2-2-2) con una
  -- sesión interna que se borra en el acto: el bot no tiene código ni login
  insert into sesiones (usuario_id) values (v_bot) returning sesiones.token into v_sesion;
  v_res := slr_unirse_liga(v_sesion::text, v_l.codigo_invitacion, v_nombre);
  delete from sesiones s where s.token = v_sesion;
  return jsonb_build_object('equipo_id', v_res -> 'equipo' ->> 'id', 'nombre', v_nombre, 'bot', true,
                            'cartas', v_res -> 'cartas', 'aviso', v_res -> 'aviso');
end $$;

/* ── 4. Reiniciar beta: los equipos de personas se quedan ─────────────────── */
-- Deja la liga como recién creada (sin cartas en equipos, álbum, temporadas,
-- partidos, mercado ni movimientos, en preparación y con un ejemplar libre de
-- cada diseño) y vuelve a unir a las personas que tenían equipo, con el mismo
-- nombre y escudo, por orden de llegada: cada una recibe plantilla inicial, saldo y
-- alineación nuevos. Los bots se quitan. Se conservan la liga, su
-- administrador y su configuración.
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
  v_personas := coalesce((select jsonb_agg(jsonb_build_object('usuario_id', e.usuario_id, 'nombre', e.nombre, 'escudo_url', e.escudo_url) order by e.creado_en, e.id)
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
  for r in select (x ->> 'usuario_id')::uuid usuario_id, x ->> 'nombre' nombre, x ->> 'escudo_url' escudo from jsonb_array_elements(v_personas) x loop
    insert into sesiones (usuario_id) values (r.usuario_id) returning sesiones.token into v_sesion;
    begin
      v_res := slr_unirse_liga(v_sesion::text, (select l.codigo_invitacion from ligas l where l.id = v_liga), r.nombre);
      update equipos e set escudo_url = r.escudo where e.id = (v_res -> 'equipo' ->> 'id')::uuid;
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

/* ── 5. Bombo de plantillas iniciales ─────────────────────────────────────── */
-- individuales libres del bombo (sin el % caro) y de las caras, y cuántas
-- plantillas iniciales completas salen (el reparto usa primero el bombo y, si
-- no llega, las caras más baratas)
create function public.bombo_plantillas(p_liga uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  with cfg as (
    select coalesce((config_liga(p_liga) ->> 'plantilla_inicial')::int, 11) n,
           individuales_caras(coalesce((config_liga(p_liga) ->> 'plantilla_inicial_excluir_top')::numeric, 0.20)) caras
  ), libres as (
    select d.id = any(cfg.caras) cara
    from cartas c join disenos_carta d on d.id = c.diseno_id, cfg
    where c.liga_id = p_liga and c.equipo_id is null and d.activo and d.tipo = 'individual' and c.reservada_por is null
      and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
  )
  select jsonb_build_object(
    'por_equipo', cfg.n,
    'bombo', (select count(*) from libres where not cara),
    'caras', (select count(*) from libres where cara),
    'equipos', (select count(*) from libres where not cara) / cfg.n,
    'equipos_con_caras', (select count(*) from libres) / cfg.n,
    'individuales_catalogo', (select count(*) from disenos_carta d where d.activo and d.tipo = 'individual'))
  from cfg
$$;

create function public.slr_admin_bombo(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform exigir_modo_beta(sesion_usuario(slr_admin_bombo.token), slr_admin_bombo.liga_id);
  return bombo_plantillas(slr_admin_bombo.liga_id);
end $$;

/* ── Permisos ───────────────────────────────────────────────────────────── */
revoke execute on function public.aviso_plantilla_corta(uuid, int), public.bombo_plantillas(uuid)
  from public, anon, authenticated;
revoke execute on function public.slr_admin_bombo(text, uuid) from public;
grant execute on function public.slr_admin_bombo(text, uuid) to anon, authenticated;
