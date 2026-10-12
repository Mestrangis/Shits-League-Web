-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — acabados (sustituyen a las variantes)
-- El acabado (normal, foil, brillante, plateada) es el aspecto visual de un
-- DISEÑO, que se decide al crear la carta, como su imagen. No hay copias
-- especiales: cada diseño tiene un acabado y un solo ejemplar por liga.
-- No cambia stats, valor ni reglas. Anula las secciones 2.3 y 3.3 de la
-- especificación complementaria (ver docs/slr/DECISIONES.md).
-- GENERADA a partir de las funciones vigentes (sin la lógica de variantes).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Esquema ────────────────────────────────────────────────────────────────
alter type public.variante_carta rename to acabado_carta;
alter table public.disenos_carta add column acabado public.acabado_carta not null default 'normal';

-- cartas: un ejemplar por diseño y liga (sin ligas ahora mismo; por si acaso,
-- primero se quitan los ejemplares especiales)
delete from public.cartas where variante <> 'normal';
alter table public.cartas drop column variante;
alter table public.cartas add constraint cartas_liga_diseno_key unique (liga_id, diseno_id);

-- álbum: una entrada por diseño (si hubiera duplicados, se queda la más antigua)
delete from public.album a using public.album b
 where a.usuario_id = b.usuario_id and a.liga_id = b.liga_id and a.diseno_id = b.diseno_id
   and (a.primera_vez_en, a.variante::text) > (b.primera_vez_en, b.variante::text);
alter table public.album drop constraint album_pkey;
alter table public.album drop column variante;
alter table public.album add primary key (usuario_id, liga_id, diseno_id);

-- Configuración: fuera las probabilidades de variante de los sobres
update public.ligas set config = config #- '{sobres,basico,variantes}' #- '{sobres,premium,variantes}' #- '{sobres,eleccion,variantes}';

-- ── Funciones ──────────────────────────────────────────────────────────────
drop function public.aplicar_variante(uuid, jsonb);

create or replace function public.config_liga_por_defecto() returns jsonb
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
      "basico":   { "precio": 1500, "cartas": 3, "pesos": { "individual": 1, "duo": 0.75, "trio": 0.15, "unica": 0.01 } },
      "premium":  { "precio": 4000, "cartas": 3, "pesos": { "individual": 1, "duo": 1.5, "trio": 0.4, "unica": 0.02 },
                    "garantia_tras": 2 },
      "eleccion": { "precio": 3000, "candidatas": 3, "minutos_eleccion": 10,
                    "pesos": { "individual": 1, "duo": 1.5, "trio": 0.4, "unica": 0.02 } }
    },
    "jornada": { "cierre_dia": "domingo", "cierre_hora": "20:00", "publicacion_hora": "21:00", "vueltas": 1 }
  }'::jsonb
$$;

create or replace function public.nombre_carta(p_carta uuid) returns text
language sql stable set search_path = public, extensions as $$
  select d.nombre
  from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = p_carta
$$;

create or replace function public.carta_json(p_carta uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', c.id, 'diseno_id', d.id, 'nombre', d.nombre, 'tipo', d.tipo, 'acabado', d.acabado,
    'ata', d.ata, 'def', d.def, 'con', d.con, 'ovr', round(ovr(d.ata, d.def, d.con), 2),
    'poderes', d.poderes, 'valor', d.valor, 'imagen_url', d.imagen_url, 'beta', d.beta)
  from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = p_carta
$$;

create or replace function public.adquirir_carta(p_carta uuid, p_equipo uuid, p_via text) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_liga uuid := liga_de_carta(p_carta);
  v_dias int := coalesce((config_liga(v_liga) ->> 'blindaje_dias')::int, 7);
begin
  perform cancelar_pendientes_carta(p_carta);
  update cartas c
     set equipo_id = p_equipo, blindada_hasta = now() + make_interval(days => v_dias),
         multiplicador_clausula = 1.5, adquirida_en = now(),
         reservada_hasta = null, reservada_por = null
   where c.id = p_carta;
  insert into album (usuario_id, liga_id, diseno_id, via_adquisicion)
  select e.usuario_id, c.liga_id, c.diseno_id, p_via
  from cartas c join equipos e on e.id = p_equipo
  where c.id = p_carta
  on conflict do nothing;
end $$;

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
  values (v_nombre, p_usuario, generar_codigo_invitacion(), config_liga_por_defecto(), p_prueba)
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

  insert into album (usuario_id, liga_id, diseno_id, via_adquisicion)
  select v_usuario, v_liga.id, c.diseno_id, 'inicial'
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

create or replace function public.slr_comprar_sobre(token text, liga_id uuid, tipo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario   uuid := sesion_usuario(slr_comprar_sobre.token);
  v_liga      uuid := slr_comprar_sobre.liga_id;
  v_tipo      text := lower(trim(slr_comprar_sobre.tipo));
  v_eq        equipos := preparar_operacion(v_usuario, v_liga);
  v_cfg       jsonb;
  v_precio    int;
  v_n         int;
  v_pesos     jsonb;
  v_excluir   uuid[] := '{}';
  v_cartas    uuid[] := '{}';
  v_c         uuid;
  v_entregada uuid;
  v_forzar    boolean;
  v_garantia  boolean := false;
  v_hay_esp   boolean := false;
  v_sobre     uuid := gen_random_uuid();
  v_caduca    timestamptz;
  v_libres    int;
  v_saldo     int;
begin
  v_cfg := config_liga(v_liga) -> 'sobres' -> v_tipo;
  if v_tipo not in ('basico', 'premium', 'eleccion') or v_cfg is null then
    raise exception 'Tipo de sobre no válido: básico, premium o elección' using errcode = 'P0001';
  end if;
  v_precio := (v_cfg ->> 'precio')::int;
  v_n := coalesce((v_cfg ->> 'cartas')::int, (v_cfg ->> 'candidatas')::int, 3);
  v_pesos := v_cfg -> 'pesos';

  -- Hueco: el sobre de elección da 1 carta; el resto, todas las del sobre
  if v_tipo = 'eleccion' then
    perform exigir_hueco(v_eq.id, 1);
  elsif plantilla_ocupada(v_eq.id) + v_n > plantilla_maxima(v_liga) then
    raise exception 'Para comprar este sobre necesitas como mucho % cartas en la plantilla', plantilla_maxima(v_liga) - v_n
      using errcode = 'P0001';
  end if;

  select count(*) into v_libres
  from cartas c join disenos_carta d on d.id = c.diseno_id
  where c.liga_id = v_liga and c.equipo_id is null and c.reservada_por is null
    and coalesce((v_pesos ->> d.tipo)::numeric, 0) > 0
    and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta');
  if v_libres < v_n then
    raise exception 'Quedan menos de % cartas libres: ahora no se puede comprar este sobre', v_n using errcode = 'P0001';
  end if;

  v_saldo := mover_dinero(v_eq.id, -v_precio, 'sobre_' || v_tipo, 'sobre:' || v_sobre);

  for i in 1..v_n loop
    -- Garantía premium: primera carta dúo o superior si el contador ha llegado al tope.
    -- Elección: si las dos primeras son individuales, la tercera se fuerza a dúo o superior.
    v_forzar := (v_tipo = 'premium' and i = 1
                 and v_eq.contador_garantia_premium >= coalesce((v_cfg ->> 'garantia_tras')::int, 2))
             or (v_tipo = 'eleccion' and i = v_n and not v_hay_esp);
    v_c := null;
    if v_forzar then
      v_c := sortear_carta_sobre(v_liga, v_pesos, v_excluir, true);
      if v_c is not null and v_tipo = 'premium' then v_garantia := true; end if;
    end if;
    if v_c is null then
      v_c := sortear_carta_sobre(v_liga, v_pesos, v_excluir, false);
    end if;
    if v_c is null then
      raise exception 'No quedan cartas suficientes en el bombo' using errcode = 'P0001';
    end if;
    v_entregada := v_c;   -- un ejemplar por diseño: se entrega el que sale
    v_excluir := v_excluir || v_c;
    v_cartas := v_cartas || v_entregada;
    if (select d.tipo from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = v_entregada) <> 'individual' then
      v_hay_esp := true;
    end if;
  end loop;

  if v_tipo = 'premium' then
    update equipos e set contador_garantia_premium = case when v_hay_esp then 0 else e.contador_garantia_premium + 1 end
     where e.id = v_eq.id;
  end if;

  if v_tipo = 'eleccion' then
    v_caduca := now() + make_interval(mins => coalesce((v_cfg ->> 'minutos_eleccion')::int, 10));
    insert into sobres_abiertos (id, equipo_id, liga_id, tipo, precio, cartas, estado, caduca_en)
    values (v_sobre, v_eq.id, v_liga, v_tipo, v_precio, v_cartas, 'pendiente_eleccion', v_caduca);
    update cartas c set reservada_hasta = v_caduca, reservada_por = v_sobre where c.id = any(v_cartas);
  else
    insert into sobres_abiertos (id, equipo_id, liga_id, tipo, precio, cartas, estado, garantia_aplicada)
    values (v_sobre, v_eq.id, v_liga, v_tipo, v_precio, v_cartas, 'abierto', v_garantia);
    foreach v_c in array v_cartas loop
      perform adquirir_carta(v_c, v_eq.id, 'sobre_' || v_tipo);
    end loop;
    perform apuntar_historial(v_liga, 'sobre',
      format('%s abre un sobre %s: %s', nombre_dueno(v_eq.id), case v_tipo when 'basico' then 'básico' else v_tipo end,
             (select string_agg(nombre_carta(x), ', ') from unnest(v_cartas) x)),
      jsonb_build_object('equipo_id', v_eq.id, 'sobre_id', v_sobre, 'cartas', to_jsonb(v_cartas)));
  end if;

  return jsonb_build_object(
    'sobre_id', v_sobre, 'tipo', v_tipo, 'precio', v_precio, 'saldo', v_saldo,
    'cartas', (select jsonb_agg(carta_json(x) order by o) from unnest(v_cartas) with ordinality t(x, o)),
    'garantia_aplicada', v_garantia,
    'pendiente_eleccion', v_tipo = 'eleccion',
    'caduca_en', v_caduca);
end $$;
