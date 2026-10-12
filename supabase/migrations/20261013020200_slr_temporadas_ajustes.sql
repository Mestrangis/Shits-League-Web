-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — temporadas (paso 4), parte 2: ajustes de funciones existentes
-- GENERADA a partir de las versiones vigentes con los cambios mínimos:
--   · config: plantilla_inicial_excluir_top (bombo sin el 20 % más caro)
--   · slr_guardar_alineacion: bloqueo por ventana de jornada y deja de ser automática
--   · slr_unirse_liga: solo en preparación o entre temporadas
--   · resolver_subasta: desempate con la clasificación de la temporada actual
--   · slr_tareas_mercado: no abre subastas con el mercado cerrado
-- ═══════════════════════════════════════════════════════════════════════════

update public.ligas set config = config || '{"plantilla_inicial_excluir_top": 0.20}'::jsonb
 where not config ? 'plantilla_inicial_excluir_top';

create or replace function public.config_liga_por_defecto() returns jsonb
language sql immutable as $$
  select '{
    "zona_horaria": "Europe/Madrid",
    "plantilla_maxima": 15,
    "canterano": { "ata": 40, "def": 40, "con": 40 },
    "saldo_inicial": 5000,
    "plantilla_inicial": 11,
    "plantilla_inicial_tolerancia": 0.10,
    "plantilla_inicial_excluir_top": 0.20,
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

create or replace function public.slr_guardar_alineacion(
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

  -- Entre el cierre y la publicación de una jornada no se puede cambiar la alineación
  if alineaciones_cerradas(v_liga) then
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

  insert into alineaciones as a (equipo_id, formacion, huecos, banquillo, orden_manual, capitan_id, guardada_en, automatica)
  values (v_equipo, v_formacion,
          jsonb_build_object('por', v_por, 'def', to_jsonb(v_def), 'med', to_jsonb(v_med), 'del', to_jsonb(v_del)),
          v_banco, v_manual, v_capitan, now(), false)
  on conflict on constraint alineaciones_pkey do update
    set formacion = excluded.formacion, huecos = excluded.huecos, banquillo = excluded.banquillo,
        orden_manual = excluded.orden_manual, capitan_id = excluded.capitan_id, guardada_en = excluded.guardada_en,
        automatica = false;

  return (select to_jsonb(a) from alineaciones a where a.equipo_id = v_equipo);
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

  return jsonb_build_object(
    'equipo', jsonb_build_object('id', v_equipo, 'liga_id', v_liga.id, 'nombre', v_nombre, 'saldo', v_saldo),
    'plantilla_inicial', v_plantilla,
    'alineacion', v_alineacion
  );
end $$;

create or replace function public.resolver_subasta(p_subasta uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_sub     subastas;
  p         record;
  v_ganador uuid;
  v_precio  int;
  v_saldo   int;
  v_max     int;
  v_pujas   jsonb := '[]';
begin
  select * into v_sub from subastas s where s.id = p_subasta for update;
  if not found or v_sub.estado <> 'abierta' then
    return null;
  end if;
  v_max := plantilla_maxima(v_sub.liga_id);
  perform 1 from cartas c where c.id = v_sub.carta_id for update;

  for p in
    select pu.equipo_id, pu.importe
    from pujas pu
    left join clasificacion cl on cl.equipo_id = pu.equipo_id
                              and cl.temporada_id = (temporada_actual(v_sub.liga_id)).id
    where pu.subasta_id = p_subasta
    order by pu.importe desc, coalesce(cl.puntos, 0) asc, coalesce(cl.gf - cl.gc, 0) asc, coalesce(cl.gf, 0) asc,
             pu.actualizada_en asc
  loop
    v_pujas := v_pujas || jsonb_build_object('equipo_id', p.equipo_id, 'equipo', nombre_dueno(p.equipo_id), 'importe', p.importe);
    if v_ganador is not null then
      update pujas pu set estado = 'perdedora' where pu.subasta_id = p_subasta and pu.equipo_id = p.equipo_id;
      perform notificar(p.equipo_id, 'subasta_perdida',
        format('No has ganado la subasta de %s', nombre_carta(v_sub.carta_id)),
        jsonb_build_object('subasta_id', p_subasta, 'carta_id', v_sub.carta_id));
      continue;
    end if;
    select e.saldo into v_saldo from equipos e where e.id = p.equipo_id for update;
    if v_saldo >= p.importe and plantilla_ocupada(p.equipo_id) + 1 <= v_max
       and (select c.equipo_id from cartas c where c.id = v_sub.carta_id) is null then
      perform mover_dinero(p.equipo_id, -p.importe, 'subasta', 'subasta:' || p_subasta);
      perform adquirir_carta(v_sub.carta_id, p.equipo_id, 'subasta');
      update pujas pu set estado = 'ganadora' where pu.subasta_id = p_subasta and pu.equipo_id = p.equipo_id;
      v_ganador := p.equipo_id;
      v_precio := p.importe;
      perform notificar(p.equipo_id, 'subasta_ganada',
        format('Has ganado la subasta de %s por %s', nombre_carta(v_sub.carta_id), fmt(p.importe)),
        jsonb_build_object('subasta_id', p_subasta, 'carta_id', v_sub.carta_id, 'importe', p.importe));
    else
      update pujas pu set estado = 'anulada' where pu.subasta_id = p_subasta and pu.equipo_id = p.equipo_id;
      perform notificar(p.equipo_id, 'puja_anulada',
        format('Tu puja por %s se ha anulado: %s', nombre_carta(v_sub.carta_id),
               case when v_saldo < p.importe then 'no tenías saldo suficiente' else 'tenías la plantilla llena' end),
        jsonb_build_object('subasta_id', p_subasta, 'carta_id', v_sub.carta_id, 'importe', p.importe));
    end if;
  end loop;

  update subastas s set estado = case when v_ganador is null then 'desierta' else 'resuelta' end,
                        ganador_id = v_ganador, precio = v_precio
   where s.id = p_subasta;

  if v_ganador is not null then
    perform apuntar_historial(v_sub.liga_id, 'subasta',
      format('%s gana la subasta de %s por %s', nombre_dueno(v_ganador), nombre_carta(v_sub.carta_id), fmt(v_precio)),
      jsonb_build_object('subasta_id', p_subasta, 'carta_id', v_sub.carta_id, 'equipo_id', v_ganador,
                         'precio', v_precio, 'pujas', v_pujas));
  end if;
  return jsonb_build_object('subasta_id', p_subasta, 'ganador_id', v_ganador, 'precio', v_precio);
end $$;

create or replace function public.slr_tareas_mercado(p_ahora timestamptz default now(), p_liga uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  l        record;
  r        record;
  v_fecha  date;
  v_res    jsonb := '{"subastas_resueltas":0,"tandas_abiertas":0,"cartas_en_subasta":0,"ofertas_caducadas":0,"intercambios_caducados":0,"elecciones_resueltas":0}';
  v_n      int;
  v_ligas  int := 0;
begin
  for l in select lg.id, lg.config from ligas lg
           where lg.estado in ('preparacion', 'en_curso')
             and (case when p_liga is null then not lg.es_prueba else lg.id = p_liga end)
           order by lg.creada_en
  loop
    v_ligas := v_ligas + 1;
    for r in select s.id from subastas s where s.liga_id = l.id and s.estado = 'abierta' and s.cierra_en <= p_ahora
             order by s.cierra_en, s.id loop
      perform resolver_subasta(r.id);
      v_res := jsonb_set(v_res, '{subastas_resueltas}', to_jsonb((v_res ->> 'subastas_resueltas')::int + 1));
    end loop;

    v_fecha := (p_ahora at time zone coalesce(l.config ->> 'zona_horaria', 'Europe/Madrid'))::date;
    -- Con el mercado cerrado (ventana de jornada) no se abren subastas
    if not liga_bloqueada(l.id) and not exists (select 1 from tandas_mercado t where t.liga_id = l.id and t.fecha = v_fecha) then
      v_n := abrir_tanda(l.id, v_fecha, p_ahora);
      v_res := jsonb_set(v_res, '{tandas_abiertas}', to_jsonb((v_res ->> 'tandas_abiertas')::int + 1));
      v_res := jsonb_set(v_res, '{cartas_en_subasta}', to_jsonb((v_res ->> 'cartas_en_subasta')::int + v_n));
    end if;

    for r in update ofertas o set estado = 'caducada'
             where o.liga_id = l.id and o.estado = 'pendiente' and o.caduca_en <= p_ahora
             returning o.id, o.de_id, o.carta_id loop
      perform notificar(r.de_id, 'oferta_caducada', format('Tu oferta por %s ha caducado', nombre_carta(r.carta_id)),
        jsonb_build_object('oferta_id', r.id, 'carta_id', r.carta_id));
      v_res := jsonb_set(v_res, '{ofertas_caducadas}', to_jsonb((v_res ->> 'ofertas_caducadas')::int + 1));
    end loop;

    for r in update intercambios i set estado = 'caducado'
             where i.liga_id = l.id and i.estado = 'pendiente' and i.caduca_en <= p_ahora
             returning i.id, i.de_id loop
      perform notificar(r.de_id, 'intercambio_caducado', 'Tu propuesta de intercambio ha caducado',
        jsonb_build_object('intercambio_id', r.id));
      v_res := jsonb_set(v_res, '{intercambios_caducados}', to_jsonb((v_res ->> 'intercambios_caducados')::int + 1));
    end loop;

    for r in select s.id from sobres_abiertos s
             where s.liga_id = l.id and s.estado = 'pendiente_eleccion' and s.caduca_en <= p_ahora loop
      perform resolver_eleccion(r.id, null);
      v_res := jsonb_set(v_res, '{elecciones_resueltas}', to_jsonb((v_res ->> 'elecciones_resueltas')::int + 1));
    end loop;
  end loop;
  return v_res || jsonb_build_object('ligas', v_ligas, 'ahora', p_ahora);
end $$;
