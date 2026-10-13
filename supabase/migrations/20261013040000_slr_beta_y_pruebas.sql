-- ═══════════════════════════════════════════════════════════════════════════
-- SLR · Rush solo para la beta y modo pruebas del admin
--
-- 1. Acceso: usuarios.beta (Marcos y Nicolás) y la tabla ajustes con
--    rush_publico. Tiene acceso quien tenga beta, cualquiera si rush_publico es
--    true, y siempre los bots (tests y modo pruebas). slr_login no da sesión a
--    quien no tiene acceso y todas las slr_* lo exigen (sesion_usuario).
--    slr_yo responde siempre, con tiene_acceso, para que la web decida si
--    muestra la pestaña.
-- 2. Modo pruebas (ligas.config.modo_beta, solo el admin de la liga):
--    slr_admin_jugar_jornada, slr_admin_anadir_bot, slr_admin_quitar_bot y
--    slr_admin_reiniciar_beta. Los bots del modo pruebas son usuarios internos
--    (sin código, sin login) y su alineación se regenera sola antes de cada cierre.
-- ═══════════════════════════════════════════════════════════════════════════

/* ── 1. Acceso ──────────────────────────────────────────────────────────── */
alter table public.usuarios add column beta boolean not null default false;
-- Bots del modo pruebas: sin código y sin login; los crea slr_admin_anadir_bot
alter table public.usuarios add column interno boolean not null default false;
update public.usuarios u set beta = true where u.nombre in ('Marcos', 'Nicolás') and not u.es_bot;

create table public.ajustes (
  clave           text primary key,
  valor           jsonb not null,
  descripcion     text,
  actualizado_en  timestamptz not null default now()
);
alter table public.ajustes enable row level security;
revoke all on public.ajustes from anon, authenticated;
grant select on public.ajustes to anon, authenticated;
create policy lectura_publica on public.ajustes for select to anon, authenticated using (true);
insert into public.ajustes (clave, valor, descripcion) values
  ('rush_publico', 'false', 'true: Rush abierto a todos los jugadores; false: solo los usuarios con beta = true');

create function public.tiene_acceso(p_usuario uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select a.valor = 'true'::jsonb from ajustes a where a.clave = 'rush_publico'), false)
      or exists (select 1 from usuarios u where u.id = p_usuario and (u.beta or u.es_bot))
$$;

-- La sesión sin comprobar el acceso (solo para slr_yo)
create function public.sesion_sin_acceso(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token   uuid;
  v_usuario uuid;
begin
  begin
    v_token := p_token::uuid;
  exception when invalid_text_representation then
    raise exception 'Sesión no válida. Vuelve a entrar con tu código.' using errcode = '28000';
  end;
  update sesiones s set ultimo_uso = now()
   where s.token = v_token and s.ultimo_uso > now() - interval '180 days'
  returning s.usuario_id into v_usuario;
  if v_usuario is null then
    raise exception 'Sesión no válida o caducada. Vuelve a entrar con tu código.' using errcode = '28000';
  end if;
  return v_usuario;
end $$;

-- Todas las slr_* pasan por aquí: sesión válida y acceso a Rush.
-- Código de error propio (RUSH0) para que la web lo distinga de una sesión caducada.
create or replace function public.sesion_usuario(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_sin_acceso(p_token);
begin
  if not tiene_acceso(v_usuario) then
    raise exception 'Shits League Rush está en beta cerrada y todavía no tienes acceso.' using errcode = 'RUSH0';
  end if;
  return v_usuario;
end $$;

create or replace function public.slr_login(codigo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_codigo  text := lower(trim(slr_login.codigo));
  v_usuario uuid;
  v_token   uuid;
begin
  if v_codigo is null or v_codigo = '' then
    raise exception 'Introduce tu código' using errcode = 'P0001';
  end if;
  select c.usuario_id into v_usuario
  from codigos c
  where c.codigo_hash = encode(digest(v_codigo, 'sha256'), 'hex');
  if v_usuario is null then
    raise exception 'Código incorrecto' using errcode = '28000';
  end if;
  -- Sin acceso no hay sesión: la web solo necesita saberlo para no mostrar Rush
  if not tiene_acceso(v_usuario) then
    return jsonb_build_object('tiene_acceso', false, 'usuario', usuario_json(v_usuario));
  end if;

  insert into sesiones (usuario_id) values (v_usuario) returning sesiones.token into v_token;
  delete from sesiones s where s.usuario_id = v_usuario and s.ultimo_uso < now() - interval '180 days';
  return jsonb_build_object('tiene_acceso', true, 'token', v_token, 'usuario', usuario_json(v_usuario));
end $$;

create or replace function public.usuario_json(p_usuario uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object('id', u.id, 'nombre', u.nombre, 'avatar_url', u.avatar_url, 'es_admin', u.es_admin, 'beta', u.beta)
  from usuarios u where u.id = p_usuario
$$;

-- slr_yo: siempre responde (con una sesión válida) e indica tiene_acceso
create or replace function public.slr_yo(token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_sin_acceso(slr_yo.token);
  v_lp      uuid := liga_principal();
begin
  if not tiene_acceso(v_usuario) then
    return jsonb_build_object('tiene_acceso', false, 'usuario', usuario_json(v_usuario));
  end if;
  return jsonb_build_object(
    'tiene_acceso', true,
    'usuario', usuario_json(v_usuario),
    'es_admin', (select u.es_admin from usuarios u where u.id = v_usuario),
    'liga_principal', (
      select jsonb_build_object(
               'id', l.id, 'nombre', l.nombre, 'estado', l.estado, 'temporada', l.temporada,
               'pausada_en', l.pausada_en, 'es_admin', l.admin_id = v_usuario,
               'modo_beta', coalesce((l.config ->> 'modo_beta')::boolean, false),
               'equipo_id', (select e.id from equipos e where e.liga_id = l.id and e.usuario_id = v_usuario))
      from ligas l where l.id = v_lp),
    'ligas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'nombre', l.nombre, 'estado', l.estado, 'temporada', l.temporada,
               'pausada_en', l.pausada_en, 'es_admin', l.admin_id = v_usuario, 'es_prueba', l.es_prueba,
               'modo_beta', coalesce((l.config ->> 'modo_beta')::boolean, false),
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

/* ── 2. Modo pruebas ────────────────────────────────────────────────────── */
-- La liga principal empieza en modo pruebas; las ligas de prueba, siempre
update public.ligas l set config = l.config || '{"modo_beta": true}'::jsonb where not l.es_prueba;

create or replace function public.crear_liga_interna(p_usuario uuid, p_nombre text, p_prueba boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_nombre text := trim(p_nombre);
  v_liga   ligas%rowtype;
  v_cartas int;
begin
  if v_nombre is null or length(v_nombre) < 3 or length(v_nombre) > 40 then
    raise exception 'El nombre de la liga debe tener entre 3 y 40 caracteres' using errcode = 'P0001';
  end if;
  insert into ligas (nombre, admin_id, codigo_invitacion, config, es_prueba)
  values (v_nombre, p_usuario, generar_codigo_invitacion(),
          config_liga_por_defecto() || case when p_prueba then '{"modo_beta": true}'::jsonb else '{}'::jsonb end, p_prueba)
  returning * into v_liga;
  insert into cartas (liga_id, diseno_id)
  select v_liga.id, d.id from disenos_carta d where d.activo;
  get diagnostics v_cartas = row_count;
  perform apuntar_historial(v_liga.id, 'liga_creada',
    format('%s ha creado la liga «%s»', (select u.nombre from usuarios u where u.id = p_usuario), v_nombre),
    jsonb_build_object('usuario_id', p_usuario));
  return jsonb_build_object('id', v_liga.id, 'nombre', v_liga.nombre, 'codigo_invitacion', v_liga.codigo_invitacion,
                            'estado', v_liga.estado, 'es_prueba', v_liga.es_prueba, 'cartas', v_cartas);
end $$;

-- Admin de la liga con el modo pruebas activado
create function public.exigir_modo_beta(p_usuario uuid, p_liga uuid) returns void
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform exigir_admin(p_usuario, p_liga);
  if not coalesce((select (l.config ->> 'modo_beta')::boolean from ligas l where l.id = p_liga), false) then
    raise exception 'El modo pruebas no está activado en esta liga' using errcode = 'P0001';
  end if;
end $$;

-- Cierre (el del cron): antes de congelar, los bots del modo pruebas regeneran
-- su alineación (la mejor 2-2-2 con lo que tengan)
create or replace function public.cerrar_jornada(p_jornada uuid) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_j jornadas;
  r   record;
begin
  select * into v_j from jornadas j where j.id = p_jornada for update;
  if v_j.estado <> 'programada' then
    return false;
  end if;
  for r in select e.id from equipos e join usuarios u on u.id = e.usuario_id
           where e.liga_id = v_j.liga_id and u.interno loop
    perform crear_alineacion_por_defecto(r.id);
  end loop;
  for r in select p.id, p.local_id, p.visitante_id from partidos p where p.jornada_id = p_jornada loop
    update partidos p
       set alineaciones_congeladas = jsonb_build_object(
             'local', congelar_alineacion(r.local_id, p_jornada),
             'visitante', congelar_alineacion(r.visitante_id, p_jornada)),
           semilla = semilla_aleatoria()          -- criptográfica, generada ahora
     where p.id = r.id;
  end loop;
  update jornadas j set estado = 'cerrada' where j.id = p_jornada;
  return true;
end $$;

-- Juega la siguiente jornada pendiente ya, con el mismo código que el cron.
-- Idempotente y en pasos, porque la simulación la hace la Edge Function
-- (asíncrona): la web la llama hasta que devuelve estado = 'publicada'.
--   programada → cierra y pide la simulación      → 'simulando'
--   cerrada    → (re)pide la simulación si tarda   → 'simulando'
--   simulada   → publica (cobros, lesiones…)       → 'publicada'
create function public.slr_admin_jugar_jornada(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_admin_jugar_jornada.token);
  v_liga    uuid := slr_admin_jugar_jornada.liga_id;
  v_t       temporadas;
  v_j       jornadas;
begin
  perform exigir_modo_beta(v_usuario, v_liga);
  if (select l.estado from ligas l where l.id = v_liga) <> 'en_curso' then
    raise exception 'No hay ninguna temporada en marcha (o la liga está en pausa)' using errcode = 'P0001';
  end if;
  v_t := temporada_actual(v_liga);
  select * into v_j from jornadas j
  where j.temporada_id = v_t.id and j.estado in ('programada', 'cerrada', 'simulada')
  order by j.numero limit 1;
  if not found then
    return jsonb_build_object('estado', 'sin_jornadas');
  end if;

  if v_j.estado = 'programada' then
    perform cerrar_jornada(v_j.id);
    perform pedir_simulacion(v_j.id);
    return jsonb_build_object('jornada', v_j.numero, 'estado', 'simulando');
  end if;
  if v_j.estado = 'cerrada' then
    if v_j.simulacion_pedida_en is null or v_j.simulacion_pedida_en < now() - interval '20 seconds' then
      perform pedir_simulacion(v_j.id);
    end if;
    return jsonb_build_object('jornada', v_j.numero, 'estado', 'simulando');
  end if;
  perform publicar_jornada(v_j.id);
  return jsonb_build_object('jornada', v_j.numero, 'estado', 'publicada',
    'fin_temporada', (select l.estado from ligas l where l.id = v_liga) = 'entre_temporadas');
end $$;

-- Nombres para los equipos bot (el primero que no esté cogido en la liga)
create function public.nombre_equipo_bot(p_liga uuid) returns text
language sql stable set search_path = public, extensions as $$
  select coalesce(
    (select n from unnest(array['Robots United', 'Atlético Silicio', 'Real Algoritmo', 'Deportivo Bit', 'Sporting Byte',
                                'Unión Circuito', 'Racing Píxel', 'Olímpico Binario', 'Inter de Lógica', 'Club Atlético Bucle',
                                'Rayo Procesador', 'Celta de Datos', 'Recreativo Router', 'Getafe Gigabyte', 'Cádiz Caché',
                                'Betis Booleano', 'Valencia Vector', 'Elche Ethernet']) with ordinality t(n, o)
     where not exists (select 1 from equipos e where e.liga_id = p_liga and lower(e.nombre) = lower(t.n))
     order by o limit 1),
    'Bot ' || left(md5(random()::text), 6))
$$;

create function public.slr_admin_anadir_bot(token text, liga_id uuid) returns jsonb
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
  return jsonb_build_object('equipo_id', v_res -> 'equipo' ->> 'id', 'nombre', v_nombre, 'bot', true);
end $$;

-- Quita un equipo bot (el indicado o el último añadido); sus cartas quedan libres
create function public.slr_admin_quitar_bot(token text, liga_id uuid, equipo_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_admin_quitar_bot.token);
  v_liga    uuid := slr_admin_quitar_bot.liga_id;
  v_eq      record;
begin
  perform exigir_modo_beta(v_usuario, v_liga);
  if (select l.estado from ligas l where l.id = v_liga) not in ('preparacion', 'entre_temporadas') then
    raise exception 'Los bots solo se pueden quitar antes de empezar la temporada o entre temporadas' using errcode = 'P0001';
  end if;
  select e.id, e.nombre, e.usuario_id into v_eq
  from equipos e join usuarios u on u.id = e.usuario_id
  where e.liga_id = v_liga and u.interno
    and (slr_admin_quitar_bot.equipo_id is null or e.id = slr_admin_quitar_bot.equipo_id)
  order by e.creado_en desc limit 1;
  if v_eq.id is null then
    raise exception 'No hay ningún bot que quitar' using errcode = 'P0001';
  end if;
  delete from equipos e where e.id = v_eq.id;
  delete from usuarios u where u.id = v_eq.usuario_id and u.interno;
  perform apuntar_historial(v_liga, 'bot_quitado', format('El bot «%s» deja la liga', v_eq.nombre),
    jsonb_build_object('equipo_id', v_eq.id));
  return jsonb_build_object('quitado', v_eq.nombre);
end $$;

-- Deja la liga como recién creada: sin equipos, cartas, álbum, temporadas,
-- partidos, mercado ni movimientos, en preparación y con un ejemplar libre de
-- cada diseño. Se conservan la liga, su administrador y su configuración.
create function public.slr_admin_reiniciar_beta(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_admin_reiniciar_beta.token);
  v_liga    uuid := slr_admin_reiniciar_beta.liga_id;
  v_bots    uuid[];
  t         text;
  v_cartas  int;
begin
  perform exigir_modo_beta(v_usuario, v_liga);
  perform 1 from ligas l where l.id = v_liga for update;
  v_bots := array(select e.usuario_id from equipos e join usuarios u on u.id = e.usuario_id
                  where e.liga_id = v_liga and u.interno);
  -- Todas las tablas con liga_id (equipos, cartas, album, temporadas → jornadas →
  -- partidos, subastas, ventas, ofertas, intercambios, sobres, historial,
  -- notificaciones, tandas…); lo que cuelga de ellas se borra en cascada
  for t in select c.table_name::text
           from information_schema.columns c
           join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'liga_id'
             and tb.table_type = 'BASE TABLE' and c.table_name <> 'ligas'
           order by case c.table_name when 'equipos' then 0 else 1 end, c.table_name loop
    execute format('delete from public.%I x where x.liga_id = $1', t) using v_liga;
  end loop;
  delete from usuarios u where u.id = any(v_bots) and u.interno;

  insert into cartas (liga_id, diseno_id) select v_liga, d.id from disenos_carta d where d.activo;
  get diagnostics v_cartas = row_count;
  update ligas l set estado = 'preparacion', temporada = 1, pausada_en = null where l.id = v_liga;
  perform apuntar_historial(v_liga, 'beta_reiniciada', 'La liga se ha reiniciado (modo pruebas)', '{}');
  return jsonb_build_object('liga_id', v_liga, 'estado', 'preparacion', 'cartas', v_cartas);
end $$;

/* ── Permisos ───────────────────────────────────────────────────────────── */
revoke execute on function
  public.tiene_acceso(uuid), public.sesion_sin_acceso(text), public.exigir_modo_beta(uuid, uuid),
  public.nombre_equipo_bot(uuid)
from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'slr_admin_jugar_jornada(text, uuid)', 'slr_admin_anadir_bot(text, uuid)',
    'slr_admin_quitar_bot(text, uuid, uuid)', 'slr_admin_reiniciar_beta(text, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
