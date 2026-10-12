-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — funciones (paso 2): sesiones, dinero, ligas, alineaciones
--
-- · Todas las escrituras pasan por funciones slr_* (SECURITY DEFINER), que
--   reciben el token de sesión, lo validan y hacen todo en una transacción.
--   La web las llama con fetch a /rest/v1/rpc/<funcion>.
-- · Las funciones internas (sin prefijo slr_) no se pueden llamar desde fuera.
-- · Errores: errcode 28000 = sesión/código no válidos (HTTP 403 en PostgREST);
--   P0001 = operación rechazada (HTTP 400), siempre con un mensaje claro.
-- · Los parámetros de las slr_* se copian al empezar a variables v_* para que
--   nunca choquen con nombres de columna dentro de las consultas.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Configuración por defecto de una liga (sección 13: economía y mercado) ──
-- Las constantes del motor no van aquí: viven en js/slr/motor-vX.Y.Z.js.
create function public.config_liga_por_defecto() returns jsonb
language sql immutable as $$
  select '{
    "zona_horaria": "Europe/Madrid",
    "plantilla_maxima": 15,
    "canterano": { "ata": 40, "def": 40, "con": 40 },
    "saldo_inicial": 5000,
    "plantilla_inicial": 11,
    "plantilla_inicial_tolerancia": 0.10,
    "salario_jornada": 1000,
    "bonus_participacion": 100,
    "simulaciones_pronostico": 200,
    "bonus_sorpresa": { "victoria": 600, "empate": 300 },
    "ojo_clinico": { "umbral": 1.25, "factor": 100, "tope": 300, "cartas": 3, "partidos": 3 },
    "lesion_tocada_factor": 0.85,
    "mercado_cartas_diarias": 8,
    "subasta_horas": 24,
    "pesos_mercado": { "individual": 1, "duo": 0.25, "trio": 0.05, "unica": 0 },
    "venta_banco": 0.60,
    "impuesto_compraventa": 0.05,
    "caducidad_ofertas_horas": 48,
    "clausula": { "multiplicador_min": 1.5, "multiplicador_max": 3.0, "paso": 0.1, "coste_subida": 0.20, "parte_banco": 0.10 },
    "blindaje_dias": 7,
    "sobres": {
      "basico":   { "precio": 1500, "cartas": 3, "pesos": { "individual": 1, "duo": 0.75, "trio": 0.15, "unica": 0.01 },
                    "variantes": { "foil": 0.03, "brillante": 0.005, "plateada": 0.005 } },
      "premium":  { "precio": 4000, "cartas": 3, "pesos": { "individual": 1, "duo": 1.5, "trio": 0.4, "unica": 0.02 },
                    "garantia_tras": 2,
                    "variantes": { "foil": 0.06, "brillante": 0.015, "plateada": 0.015 } },
      "eleccion": { "precio": 3000, "candidatas": 3, "minutos_eleccion": 10,
                    "pesos": { "individual": 1, "duo": 1.5, "trio": 0.4, "unica": 0.02 },
                    "variantes": { "foil": 0.05, "brillante": 0.01, "plateada": 0.01 } }
    },
    "jornada": { "cierre_dia": "domingo", "cierre_hora": "20:00", "publicacion_hora": "21:00", "vueltas": 1 }
  }'::jsonb
$$;

-- ── Utilidades ─────────────────────────────────────────────────────────────
-- OVR = 0,60·s1 + 0,25·s2 + 0,15·s3 con las stats de mayor a menor (sección 3.5)
create function public.ovr(p_ata int, p_def int, p_con int) returns numeric
language sql immutable as $$
  select 0.60 * greatest(p_ata, p_def, p_con)
       + 0.25 * (p_ata + p_def + p_con - greatest(p_ata, p_def, p_con) - least(p_ata, p_def, p_con))
       + 0.15 * least(p_ata, p_def, p_con)
$$;

create function public.usuario_json(p_usuario uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object('id', u.id, 'nombre', u.nombre, 'avatar_url', u.avatar_url)
  from usuarios u where u.id = p_usuario
$$;

-- 6 caracteres legibles sin confusiones (sin 0/O, 1/I/L)
create function public.generar_codigo_invitacion() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_codigo text;
begin
  loop
    v_bytes := gen_random_bytes(6);
    v_codigo := '';
    for i in 0..5 loop
      v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % length(v_alfabeto)) + 1, 1);
    end loop;
    exit when not exists (select 1 from ligas where codigo_invitacion = v_codigo);
  end loop;
  return v_codigo;
end $$;

-- ── Sesiones ───────────────────────────────────────────────────────────────
-- Devuelve el usuario de un token o lanza error. Las sesiones caducan tras
-- 180 días sin uso; cada uso renueva la fecha.
create function public.sesion_usuario(p_token text) returns uuid
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

-- ── Dinero: única forma de cambiar un saldo ────────────────────────────────
-- Actualiza el saldo y escribe el movimiento en la misma transacción.
-- importe > 0 cobra, < 0 paga. Devuelve el saldo resultante.
create function public.mover_dinero(p_equipo uuid, p_importe int, p_tipo text, p_referencia text default null)
returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_saldo int;
begin
  if p_importe is null or p_importe = 0 then
    raise exception 'Importe no válido' using errcode = 'P0001';
  end if;
  update equipos e set saldo = e.saldo + p_importe where e.id = p_equipo returning e.saldo into v_saldo;
  if not found then
    raise exception 'Equipo no encontrado' using errcode = 'P0001';
  end if;
  insert into movimientos (equipo_id, tipo, importe, saldo_despues, referencia)
  values (p_equipo, p_tipo, p_importe, v_saldo, p_referencia);
  return v_saldo;
exception when check_violation then
  raise exception 'Saldo insuficiente' using errcode = 'P0001';
end $$;

-- ── Bloqueo de alineaciones y mercado ──────────────────────────────────────
-- PASO 4: devolverá true entre el cierre y la publicación de la jornada
-- (sección 6.2). De momento nunca bloquea.
create function public.liga_bloqueada(p_liga uuid) returns boolean
language plpgsql stable set search_path = public, extensions as $$
begin
  return false;
end $$;

-- ── Plantilla inicial (sección 7.1) ────────────────────────────────────────
-- 11 individuales libres al azar con valor total dentro de ±tolerancia de
-- 11 × el valor medio de las individuales libres. Muestreo aleatorio y, si no
-- basta, intercambios voraces; si es imposible, la mejor aproximación.
create function public.asignar_plantilla_inicial(p_liga uuid, p_equipo uuid, p_config jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_n_obj     int     := coalesce((p_config ->> 'plantilla_inicial')::int, 11);
  v_tol       numeric := coalesce((p_config ->> 'plantilla_inicial_tolerancia')::numeric, 0.10);
  v_blindaje  interval := make_interval(days => coalesce((p_config ->> 'blindaje_dias')::int, 7));
  v_ids       uuid[];
  v_vals      int[];
  v_n         int;
  v_k         int;
  v_media     numeric;
  v_objetivo  numeric;
  v_sel       int[];      -- índices (1..n) elegidos
  v_mejor     int[];
  v_mejor_dif numeric;
  v_suma      numeric;
  v_dif       numeric;
  v_mejora    boolean;
  v_ba        int; v_bb int; v_bdif numeric;
  v_elegidas  uuid[];
begin
  -- Individuales libres, no reservadas ni en subasta. Bloqueadas hasta el final.
  select array_agg(x.id order by x.id), array_agg(x.valor order by x.id)
    into v_ids, v_vals
  from (
    select c.id, d.valor
    from cartas c join disenos_carta d on d.id = c.diseno_id
    where c.liga_id = p_liga and c.equipo_id is null and d.tipo = 'individual'
      and (c.reservada_hasta is null or c.reservada_hasta < now())
      and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
    for update of c
  ) x;

  v_n := coalesce(cardinality(v_ids), 0);
  if v_n = 0 then
    return jsonb_build_object('cartas', '[]'::jsonb, 'valor_total', 0, 'objetivo', 0, 'disponibles', 0, 'dentro', false);
  end if;

  select avg(v) into v_media from unnest(v_vals) v;
  v_k := least(v_n_obj, v_n);
  v_objetivo := v_n_obj * v_media;

  if v_n <= v_k then
    v_mejor := array(select generate_series(1, v_n));       -- no hay donde elegir: todas
  else
    -- 1) Muestreos aleatorios
    v_mejor_dif := null;
    for intento in 1..40 loop
      v_sel := array(select i from generate_series(1, v_n) i order by random() limit v_k);
      select sum(v_vals[i]) into v_suma from unnest(v_sel) i;
      v_dif := abs(v_suma - v_objetivo);
      if v_mejor_dif is null or v_dif < v_mejor_dif then
        v_mejor := v_sel; v_mejor_dif := v_dif;
      end if;
      exit when v_mejor_dif <= v_tol * v_objetivo;
    end loop;

    -- 2) Si aún no cumple: intercambios voraces (la mejor pareja cada vez)
    select sum(v_vals[i]) into v_suma from unnest(v_mejor) i;
    for paso in 1..60 loop
      exit when abs(v_suma - v_objetivo) <= v_tol * v_objetivo;
      v_bdif := abs(v_suma - v_objetivo);
      v_mejora := false;
      for a in 1..v_k loop
        for b in 1..v_n loop
          continue when b = any(v_mejor);
          v_dif := abs(v_suma - v_vals[v_mejor[a]] + v_vals[b] - v_objetivo);
          if v_dif < v_bdif then
            v_bdif := v_dif; v_ba := a; v_bb := b; v_mejora := true;
          end if;
        end loop;
      end loop;
      exit when not v_mejora;
      v_suma := v_suma - v_vals[v_mejor[v_ba]] + v_vals[v_bb];
      v_mejor[v_ba] := v_bb;
    end loop;
  end if;

  v_elegidas := array(select v_ids[i] from unnest(v_mejor) i);
  select sum(v_vals[i]) into v_suma from unnest(v_mejor) i;

  update cartas c
     set equipo_id = p_equipo,
         blindada_hasta = now() + v_blindaje,
         multiplicador_clausula = 1.5,
         adquirida_en = now()
   where c.id = any(v_elegidas);

  return jsonb_build_object(
    'cartas', to_jsonb(v_elegidas),
    'valor_total', v_suma,
    'objetivo', round(v_objetivo, 2),
    'media', round(v_media, 2),
    'disponibles', v_n,
    'dentro', abs(v_suma - v_objetivo) <= v_tol * v_objetivo
  );
end $$;

-- Cartas de un equipo con sus stats y OVR (para elegir alineaciones)
create function public.cartas_equipo(p_equipo uuid)
returns table (id uuid, ata int, def int, con int, o numeric)
language sql stable set search_path = public, extensions as $$
  select c.id, d.ata, d.def, d.con, ovr(d.ata, d.def, d.con)
  from cartas c join disenos_carta d on d.id = c.diseno_id
  where c.equipo_id = p_equipo
$$;

-- ── Alineación por defecto: 2-2-2 con las mejores cartas para cada hueco ──
-- POR por DEF; DEF por DEF; MED por CON; DEL por ATA; banquillo las 3
-- siguientes por OVR; capitán el titular de mayor OVR. Desempates: OVR y id.
create function public.crear_alineacion_por_defecto(p_equipo uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_por     uuid;
  v_def     uuid[];
  v_med     uuid[];
  v_del     uuid[];
  v_banco   uuid[];
  v_usadas  uuid[];
  v_capitan uuid;
begin
  if (select count(*) from cartas_equipo(p_equipo)) < 7 then
    return null; -- no hay cartas suficientes para una alineación
  end if;

  select p.id into v_por from cartas_equipo(p_equipo) p order by p.def desc, p.o desc, p.id limit 1;
  v_usadas := array[v_por];
  v_def := array(select p.id from cartas_equipo(p_equipo) p where p.id <> all(v_usadas) order by p.def desc, p.o desc, p.id limit 2);
  v_usadas := v_usadas || v_def;
  v_med := array(select p.id from cartas_equipo(p_equipo) p where p.id <> all(v_usadas) order by p.con desc, p.o desc, p.id limit 2);
  v_usadas := v_usadas || v_med;
  v_del := array(select p.id from cartas_equipo(p_equipo) p where p.id <> all(v_usadas) order by p.ata desc, p.o desc, p.id limit 2);
  v_usadas := v_usadas || v_del;
  v_banco := array(select p.id from cartas_equipo(p_equipo) p where p.id <> all(v_usadas) order by p.o desc, p.id limit 3);
  select p.id into v_capitan from cartas_equipo(p_equipo) p where p.id = any(v_usadas) order by p.o desc, p.id limit 1;

  insert into alineaciones as a (equipo_id, formacion, huecos, banquillo, orden_manual, capitan_id, guardada_en)
  values (p_equipo, '2-2-2',
          jsonb_build_object('por', v_por, 'def', to_jsonb(v_def), 'med', to_jsonb(v_med), 'del', to_jsonb(v_del)),
          v_banco, false, v_capitan, now())
  on conflict (equipo_id) do update
    set formacion = excluded.formacion, huecos = excluded.huecos, banquillo = excluded.banquillo,
        orden_manual = excluded.orden_manual, capitan_id = excluded.capitan_id, guardada_en = excluded.guardada_en;

  return (select to_jsonb(a) from alineaciones a where a.equipo_id = p_equipo);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- API pública (slr_*)
-- ═══════════════════════════════════════════════════════════════════════════

-- Login con el mismo código de Shits League: se compara su hash en el servidor
create function public.slr_login(codigo text) returns jsonb
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

  insert into sesiones (usuario_id) values (v_usuario) returning sesiones.token into v_token;
  -- Limpieza de sesiones caducadas de este usuario
  delete from sesiones s where s.usuario_id = v_usuario and s.ultimo_uso < now() - interval '180 days';

  return jsonb_build_object('token', v_token, 'usuario', usuario_json(v_usuario));
end $$;

create function public.slr_logout(token text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token uuid;
begin
  begin
    v_token := slr_logout.token::uuid;
  exception when invalid_text_representation then
    return true;
  end;
  delete from sesiones s where s.token = v_token;
  return true;
end $$;

-- Usuario, sus ligas (con el código de invitación, que solo ven sus miembros) y sus equipos
create function public.slr_yo(token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_yo.token);
begin
  return jsonb_build_object(
    'usuario', usuario_json(v_usuario),
    'ligas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'nombre', l.nombre, 'estado', l.estado, 'temporada', l.temporada,
               'es_admin', l.admin_id = v_usuario, 'codigo_invitacion', l.codigo_invitacion)
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
    ), '[]'::jsonb)
  );
end $$;

-- Libro de movimientos de un equipo propio
create function public.slr_movimientos(token text, equipo_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_movimientos.token);
  v_equipo  uuid := slr_movimientos.equipo_id;
begin
  if not exists (select 1 from equipos e where e.id = v_equipo and e.usuario_id = v_usuario) then
    raise exception 'Ese equipo no es tuyo' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'tipo', m.tipo, 'importe', m.importe, 'saldo_despues', m.saldo_despues,
             'referencia', m.referencia, 'creado_en', m.creado_en) order by m.id)
    from movimientos m where m.equipo_id = v_equipo
  ), '[]'::jsonb);
end $$;

-- Crear liga: el usuario queda como admin; un ejemplar normal de cada diseño activo, libre.
-- No crea equipo: el admin se une como cualquiera.
create function public.slr_crear_liga(token text, nombre text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_crear_liga.token);
  v_nombre  text := trim(slr_crear_liga.nombre);
  v_liga    ligas%rowtype;
  v_cartas  int;
begin
  if v_nombre is null or length(v_nombre) < 3 or length(v_nombre) > 40 then
    raise exception 'El nombre de la liga debe tener entre 3 y 40 caracteres' using errcode = 'P0001';
  end if;

  insert into ligas (nombre, admin_id, codigo_invitacion, config)
  values (v_nombre, v_usuario, generar_codigo_invitacion(), config_liga_por_defecto())
  returning * into v_liga;

  insert into cartas (liga_id, diseno_id, variante)
  select v_liga.id, d.id, 'normal' from disenos_carta d where d.activo;
  get diagnostics v_cartas = row_count;

  insert into historial (liga_id, tipo, texto, datos)
  values (v_liga.id, 'liga_creada', format('%s ha creado la liga «%s»', (select u.nombre from usuarios u where u.id = v_usuario), v_nombre),
          jsonb_build_object('usuario_id', v_usuario));

  return jsonb_build_object('id', v_liga.id, 'nombre', v_liga.nombre, 'codigo_invitacion', v_liga.codigo_invitacion,
                            'estado', v_liga.estado, 'cartas', v_cartas);
end $$;

-- Unirse a una liga: equipo con 5.000, plantilla inicial y alineación 2-2-2 por defecto
create function public.slr_unirse_liga(token text, codigo_invitacion text, nombre_equipo text) returns jsonb
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
begin
  -- Bloquea la liga: dos altas a la vez no pueden repartirse las mismas cartas
  select * into v_liga from ligas l where l.codigo_invitacion = v_codigo for update;
  if not found then
    raise exception 'Código de invitación incorrecto' using errcode = 'P0001';
  end if;
  if v_liga.estado not in ('preparacion', 'en_curso') then
    raise exception 'Esta liga ya ha terminado' using errcode = 'P0001';
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

  insert into album (usuario_id, liga_id, diseno_id, variante, via_adquisicion)
  select v_usuario, v_liga.id, c.diseno_id, c.variante, 'inicial'
  from cartas c where c.equipo_id = v_equipo
  on conflict do nothing;

  v_alineacion := crear_alineacion_por_defecto(v_equipo);

  insert into historial (liga_id, tipo, texto, datos)
  values (v_liga.id, 'equipo_unido', format('%s se une a la liga con «%s»', (select u.nombre from usuarios u where u.id = v_usuario), v_nombre),
          jsonb_build_object('usuario_id', v_usuario, 'equipo_id', v_equipo));

  return jsonb_build_object(
    'equipo', jsonb_build_object('id', v_equipo, 'liga_id', v_liga.id, 'nombre', v_nombre, 'saldo', v_saldo),
    'plantilla_inicial', v_plantilla,
    'alineacion', v_alineacion
  );
end $$;

-- Guardar alineación. huecos: {"por": uuid, "def": [uuid…], "med": [uuid…], "del": [uuid…]}
create function public.slr_guardar_alineacion(
  token text, equipo_id uuid, formacion text, huecos jsonb,
  banquillo uuid[] default '{}', orden_manual boolean default false, capitan_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario    uuid := sesion_usuario(slr_guardar_alineacion.token);
  v_equipo     uuid := slr_guardar_alineacion.equipo_id;
  v_formacion  text := slr_guardar_alineacion.formacion;
  v_huecos     jsonb := slr_guardar_alineacion.huecos;
  v_banco      uuid[] := coalesce(slr_guardar_alineacion.banquillo, '{}');
  v_manual     boolean := coalesce(slr_guardar_alineacion.orden_manual, false);
  v_capitan    uuid := slr_guardar_alineacion.capitan_id;
  v_liga       uuid;
  v_n          int[];
  v_por        uuid;
  v_def        uuid[];
  v_med        uuid[];
  v_del        uuid[];
  v_titulares  uuid[];
  v_todas      uuid[];
  v_propias    int;
begin
  select e.liga_id into v_liga from equipos e where e.id = v_equipo and e.usuario_id = v_usuario;
  if v_liga is null then
    raise exception 'Ese equipo no es tuyo' using errcode = 'P0001';
  end if;

  -- PASO 4: aquí se rechaza el guardado entre el cierre y la publicación de la jornada
  if liga_bloqueada(v_liga) then
    raise exception 'Las alineaciones están cerradas hasta que se publique la jornada' using errcode = 'P0001';
  end if;

  if v_formacion is null or v_formacion not in ('2-2-2', '3-2-1', '1-3-2', '2-3-1', '1-2-3') then
    raise exception 'Formación no permitida: %. Las válidas son 2-2-2, 3-2-1, 1-3-2, 2-3-1 y 1-2-3', coalesce(v_formacion, '(vacía)')
      using errcode = 'P0001';
  end if;
  v_n := string_to_array(v_formacion, '-')::int[];

  if v_huecos is null or jsonb_typeof(v_huecos) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(v_huecos) k) <> array['def', 'del', 'med', 'por'] then
    raise exception 'Los huecos deben ser un objeto con por, def, med y del' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_huecos -> 'por') <> 'string'
     or jsonb_typeof(v_huecos -> 'def') <> 'array'
     or jsonb_typeof(v_huecos -> 'med') <> 'array'
     or jsonb_typeof(v_huecos -> 'del') <> 'array' then
    raise exception 'Formato de huecos no válido: por es una carta y def, med y del son listas' using errcode = 'P0001';
  end if;

  begin
    v_por := (v_huecos ->> 'por')::uuid;
    v_def := array(select x::uuid from jsonb_array_elements_text(v_huecos -> 'def') x);
    v_med := array(select x::uuid from jsonb_array_elements_text(v_huecos -> 'med') x);
    v_del := array(select x::uuid from jsonb_array_elements_text(v_huecos -> 'del') x);
  exception when invalid_text_representation then
    raise exception 'Hay identificadores de carta no válidos en los huecos' using errcode = 'P0001';
  end;

  if cardinality(v_def) <> v_n[1] or cardinality(v_med) <> v_n[2] or cardinality(v_del) <> v_n[3] then
    raise exception 'La formación % pide % DEF, % MED y % DEL', v_formacion, v_n[1], v_n[2], v_n[3] using errcode = 'P0001';
  end if;
  if cardinality(v_banco) > 3 then
    raise exception 'El banquillo admite como máximo 3 cartas' using errcode = 'P0001';
  end if;
  if array_position(v_banco, null) is not null then
    raise exception 'El banquillo tiene huecos vacíos' using errcode = 'P0001';
  end if;

  v_titulares := array[v_por] || v_def || v_med || v_del;
  v_todas := v_titulares || v_banco;

  if (select count(distinct x) from unnest(v_todas) x) <> cardinality(v_todas) then
    raise exception 'Una carta no puede estar dos veces en la alineación' using errcode = 'P0001';
  end if;

  select count(*) into v_propias from cartas c where c.id = any(v_todas) and c.equipo_id = v_equipo;
  if v_propias <> cardinality(v_todas) then
    raise exception 'Todas las cartas de la alineación tienen que ser de tu equipo' using errcode = 'P0001';
  end if;

  if v_capitan is null or not (v_capitan = any(v_titulares)) then
    raise exception 'El capitán tiene que ser uno de los titulares' using errcode = 'P0001';
  end if;

  insert into alineaciones as a (equipo_id, formacion, huecos, banquillo, orden_manual, capitan_id, guardada_en)
  values (v_equipo, v_formacion,
          jsonb_build_object('por', v_por, 'def', to_jsonb(v_def), 'med', to_jsonb(v_med), 'del', to_jsonb(v_del)),
          v_banco, v_manual, v_capitan, now())
  on conflict on constraint alineaciones_pkey do update
    set formacion = excluded.formacion, huecos = excluded.huecos, banquillo = excluded.banquillo,
        orden_manual = excluded.orden_manual, capitan_id = excluded.capitan_id, guardada_en = excluded.guardada_en;

  return (select to_jsonb(a) from alineaciones a where a.equipo_id = v_equipo);
end $$;

-- Borrar una liga y todo lo que cuelga de ella (solo el admin). Para pruebas.
create function public.slr_borrar_liga(token text, liga_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_borrar_liga.token);
  v_liga    uuid := slr_borrar_liga.liga_id;
  v_admin   uuid;
begin
  select l.admin_id into v_admin from ligas l where l.id = v_liga for update;
  if v_admin is null then
    raise exception 'Esa liga no existe' using errcode = 'P0001';
  end if;
  if v_admin <> v_usuario then
    raise exception 'Solo el administrador puede borrar la liga' using errcode = 'P0001';
  end if;
  delete from ligas l where l.id = v_liga;
  return true;
end $$;

-- ── Permisos: solo las slr_* son llamables desde fuera ─────────────────────
revoke execute on function
  public.config_liga_por_defecto(), public.ovr(int, int, int), public.usuario_json(uuid),
  public.generar_codigo_invitacion(), public.sesion_usuario(text),
  public.mover_dinero(uuid, int, text, text), public.liga_bloqueada(uuid),
  public.asignar_plantilla_inicial(uuid, uuid, jsonb), public.cartas_equipo(uuid),
  public.crear_alineacion_por_defecto(uuid)
from public, anon, authenticated;

revoke execute on function
  public.slr_login(text), public.slr_logout(text), public.slr_yo(text), public.slr_movimientos(text, uuid),
  public.slr_crear_liga(text, text), public.slr_unirse_liga(text, text, text),
  public.slr_guardar_alineacion(text, uuid, text, jsonb, uuid[], boolean, uuid),
  public.slr_borrar_liga(text, uuid)
from public;

grant execute on function
  public.slr_login(text), public.slr_logout(text), public.slr_yo(text), public.slr_movimientos(text, uuid),
  public.slr_crear_liga(text, text), public.slr_unirse_liga(text, text, text),
  public.slr_guardar_alineacion(text, uuid, text, jsonb, uuid[], boolean, uuid),
  public.slr_borrar_liga(text, uuid)
to anon, authenticated;
