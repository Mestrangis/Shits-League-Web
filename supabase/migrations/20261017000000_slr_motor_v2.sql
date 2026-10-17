-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — motor v2.0.0, fase 2 (servidor)
--   · disenos_carta: estamina y táctica favorita (generadas por perfil, editables)
--   · cartas: energía 0–100 (la gastan los partidos de liga al publicarse)
--   · alineaciones_tacticas: táctica, plan B, gestión y cambios programados.
--     Tabla aparte SIN lectura pública: la táctica del próximo partido no la ve
--     nadie más que su dueño; la de los partidos publicados va en partidos.tacticas
--   · partidos: tácticas por tramo (con cruce, plan B y cambios del descanso),
--     participación (quién jugó entero o una parte) y energía gastada
--   · bots: táctica al azar, gestión normal y rotan con la regla de «Sugerir»
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Rasgos del diseño ────────────────────────────────────────────────────
alter table public.disenos_carta
  add column estamina text check (estamina in ('alta', 'media', 'baja')),
  add column tactica_favorita text check (tactica_favorita in ('posesion', 'contraataque', 'presion'));

-- Gemelo de generarRasgos() en js/slr/generador.js (solo aritmética entera)
create function public.generar_rasgos(p_perfil text, p_semilla bigint) returns jsonb
language plpgsql immutable set search_path = public, extensions as $$
declare
  s     bigint := pm_sig(pm_sig(pm_inicio(coalesce(p_semilla, 0) + 7919)));
  x     int := (s % 100)::int;
  v_est text;
begin
  if p_perfil is null or p_perfil not in ('atacante', 'defensa', 'control', 'portero', 'equilibrado') then
    raise exception 'Perfil desconocido: %', p_perfil using errcode = 'P0001';
  end if;
  v_est := case when p_perfil = 'portero'
                then case when x < 50 then 'alta' when x < 85 then 'media' else 'baja' end
                else case when x < 20 then 'alta' when x < 72 then 'media' else 'baja' end end;
  s := pm_sig(s);
  return jsonb_build_object('estamina', v_est, 'tactica_favorita',
    case p_perfil when 'atacante' then 'contraataque' when 'control' then 'posesion' when 'defensa' then 'presion'
                  when 'portero' then null
                  else (array['posesion', 'contraataque', 'presion'])[(s % 3)::int + 1] end);
end $$;

-- Sin estamina = se generan los rasgos (la táctica favorita solo si tampoco viene).
-- Corre después de disenos_carta_antes (orden alfabético), con el perfil ya calculado.
create function public.disenos_carta_rasgos() returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  g jsonb;
begin
  if new.estamina is null then
    g := generar_rasgos(new.perfil, coalesce(new.semilla_stats, new.semilla_poderes, 1 + floor(random() * 2147483646)::bigint));
    new.estamina := g ->> 'estamina';
    if tg_op = 'INSERT' then
      new.tactica_favorita := coalesce(new.tactica_favorita, g ->> 'tactica_favorita');
    end if;
  end if;
  return new;
end $$;
create trigger disenos_carta_rasgos before insert or update on public.disenos_carta
  for each row execute function public.disenos_carta_rasgos();

update disenos_carta d
   set estamina = g ->> 'estamina', tactica_favorita = g ->> 'tactica_favorita'
  from (select x.id, generar_rasgos(x.perfil, coalesce(x.semilla_stats, x.semilla_poderes, abs(hashtext(x.id::text))::bigint)) as g
        from disenos_carta x) r
 where r.id = d.id;
alter table public.disenos_carta alter column estamina set not null;

-- ── 2) Energía de cada ejemplar ─────────────────────────────────────────────
alter table public.cartas add column energia int not null default 100 check (energia between 0 and 100);

-- Tramos del motor v2 (CONFIG.ENERGIA): ≥70 → 1 · ≥50 → 0,95 · ≥30 → 0,88 · <30 → 0,75
create function public.factor_energia(p_energia int) returns numeric
language sql immutable as $$
  select case when coalesce(p_energia, 100) >= 70 then 1.0 when p_energia >= 50 then 0.95
              when p_energia >= 30 then 0.88 else 0.75 end
$$;

-- Nueva temporada: todas las cartas de la liga a 100
create function public.temporada_energia_llena() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  update cartas c set energia = 100 where c.liga_id = new.liga_id and c.energia <> 100;
  return new;
end $$;
create trigger temporada_energia_llena after insert on public.temporadas
  for each row execute function public.temporada_energia_llena();

-- ── 3) Partidos: tácticas, participación y energía ──────────────────────────
alter table public.partidos
  add column tacticas jsonb,        -- { A: [t1, t2], B: [t1, t2], cruce: [..], plan_b: {A, B}, cambios_descanso: {A, B} }
  add column participacion jsonb,   -- { A: { completo: [ids], parcial: [ids] }, B: … }
  add column energia jsonb;         -- { A: [{ id, nombre, antes, gasto }], B: … } (al publicar; solo liga)

-- ── 4) Tácticas guardadas (privadas) ────────────────────────────────────────
create table public.alineaciones_tacticas (
  equipo_id         uuid primary key references public.equipos(id) on delete cascade,
  tactica           text not null default 'posesion' check (tactica in ('posesion', 'contraataque', 'presion')),
  plan_b            jsonb check (plan_b is null or jsonb_typeof(plan_b) = 'object'),
  gestion           text not null default 'normal' check (gestion in ('reservon', 'normal', 'a_tope')),
  cambios_avanzados jsonb not null default '[]'
                    check (jsonb_typeof(cambios_avanzados) = 'array' and jsonb_array_length(cambios_avanzados) <= 3),
  guardada_en       timestamptz not null default now()
);
alter table public.alineaciones_tacticas enable row level security;
revoke all on public.alineaciones_tacticas from anon, authenticated;

-- Las del equipo (o las de por defecto si nunca guardó)
create function public.tacticas_guardadas(p_equipo uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
    (select jsonb_build_object('tactica', t.tactica, 'plan_b', t.plan_b, 'gestion', t.gestion,
                               'cambios_avanzados', t.cambios_avanzados)
     from alineaciones_tacticas t where t.equipo_id = p_equipo),
    jsonb_build_object('tactica', 'posesion', 'plan_b', null, 'gestion', 'normal', 'cambios_avanzados', '[]'::jsonb))
$$;

-- La táctica con la que empezó su último partido de liga publicado (posesión si no hay)
create function public.ultima_tactica_publicada(p_equipo uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((
    select case when p.local_id = p_equipo then p.tacticas -> 'A' ->> 0 else p.tacticas -> 'B' ->> 0 end
    from partidos p join jornadas j on j.id = p.jornada_id
    where j.estado = 'publicada' and p.tacticas is not null and p_equipo in (p.local_id, p.visitante_id)
    order by j.publicada_en desc nulls last, j.numero desc
    limit 1), 'posesion')
$$;

-- Lo que ve el motor de las tácticas de un equipo. Privadas: las guardadas (partido
-- oficial o el propio equipo). Públicas: la última publicada, gestión normal, sin plan B
-- ni cambios programados (pronósticos y amistosos contra un rival: no se filtra nada).
create function public.tacticas_motor(p_equipo uuid, p_privadas boolean) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when p_privadas then tacticas_guardadas(p_equipo)
              else jsonb_build_object('tactica', ultima_tactica_publicada(p_equipo), 'plan_b', null,
                                      'gestion', 'normal', 'cambios_avanzados', '[]'::jsonb) end
$$;

-- Valida y guarda. Los cambios programados tienen que salir de un titular de la
-- alineación guardada y meter a uno de su banquillo.
create function public.guardar_tacticas(p_equipo uuid, p_t jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_tac    text := p_t ->> 'tactica';
  v_plan   jsonb := case when jsonb_typeof(p_t -> 'plan_b') = 'object' then p_t -> 'plan_b' end;
  v_gest   text := coalesce(p_t ->> 'gestion', 'normal');
  v_cambios jsonb := coalesce(case when jsonb_typeof(p_t -> 'cambios_avanzados') = 'array' then p_t -> 'cambios_avanzados' end, '[]');
  v_al     alineaciones;
  v_tit    text[];
  v_salen  text[] := '{}';
  v_entran text[] := '{}';
  c        jsonb;
  k        text;
begin
  if p_t is null or jsonb_typeof(p_t) <> 'object' then
    raise exception 'Las tácticas tienen que ser un objeto' using errcode = 'P0001';
  end if;
  for k in select jsonb_object_keys(p_t) loop
    if k not in ('tactica', 'plan_b', 'gestion', 'cambios_avanzados') then
      raise exception 'Campo de tácticas desconocido: %', k using errcode = 'P0001';
    end if;
  end loop;
  if v_tac is null or v_tac not in ('posesion', 'contraataque', 'presion') then
    raise exception 'Táctica no válida: %. Las válidas son posesion, contraataque y presion', coalesce(v_tac, '(vacía)')
      using errcode = 'P0001';
  end if;
  if p_t ? 'plan_b' and jsonb_typeof(p_t -> 'plan_b') not in ('object', 'null') then
    raise exception 'El plan B tiene que ser un objeto con condicion y tactica, o null' using errcode = 'P0001';
  end if;
  if v_plan is not null then
    if (select array_agg(x order by x) from jsonb_object_keys(v_plan) x) is distinct from array['condicion', 'tactica'] then
      raise exception 'El plan B lleva condicion y tactica' using errcode = 'P0001';
    end if;
    if v_plan ->> 'condicion' is null or v_plan ->> 'condicion' not in ('ganando', 'empatando', 'perdiendo') then
      raise exception 'Condición del plan B no válida: %', coalesce(v_plan ->> 'condicion', '(vacía)') using errcode = 'P0001';
    end if;
    if v_plan ->> 'tactica' is null or v_plan ->> 'tactica' not in ('posesion', 'contraataque', 'presion') then
      raise exception 'Táctica del plan B no válida: %', coalesce(v_plan ->> 'tactica', '(vacía)') using errcode = 'P0001';
    end if;
    if v_plan ->> 'tactica' = v_tac then
      raise exception 'El plan B tiene que ser una táctica distinta de la inicial' using errcode = 'P0001';
    end if;
  end if;
  if v_gest not in ('reservon', 'normal', 'a_tope') then
    raise exception 'Gestión no válida: %. Las válidas son reservon, normal y a_tope', v_gest using errcode = 'P0001';
  end if;
  if p_t ? 'cambios_avanzados' and jsonb_typeof(p_t -> 'cambios_avanzados') not in ('array', 'null') then
    raise exception 'Los cambios programados tienen que ser una lista' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_cambios) > 3 then
    raise exception 'Como mucho 3 cambios programados' using errcode = 'P0001';
  end if;

  if jsonb_array_length(v_cambios) > 0 then
    select * into v_al from alineaciones a where a.equipo_id = p_equipo;
    v_tit := array[v_al.huecos ->> 'por']
             || array(select jsonb_array_elements_text(v_al.huecos -> 'def'))
             || array(select jsonb_array_elements_text(v_al.huecos -> 'med'))
             || array(select jsonb_array_elements_text(v_al.huecos -> 'del'));
    for c in select x from jsonb_array_elements(v_cambios) x loop
      if jsonb_typeof(c) <> 'object' then
        raise exception 'Cada cambio programado es un objeto con sale, entra y condicion' using errcode = 'P0001';
      end if;
      for k in select jsonb_object_keys(c) loop
        if k not in ('sale', 'entra', 'condicion', 'umbral') then
          raise exception 'Campo desconocido en un cambio programado: %', k using errcode = 'P0001';
        end if;
      end loop;
      if c ->> 'condicion' is null or c ->> 'condicion' not in ('siempre', 'ganando', 'empatando', 'perdiendo', 'energia_menor') then
        raise exception 'Condición de cambio no válida: %', coalesce(c ->> 'condicion', '(vacía)') using errcode = 'P0001';
      end if;
      if c ->> 'condicion' = 'energia_menor' then
        if coalesce(jsonb_typeof(c -> 'umbral'), '') <> 'number' or (c ->> 'umbral')::numeric not between 1 and 99
           or (c ->> 'umbral')::numeric <> trunc((c ->> 'umbral')::numeric) then
          raise exception 'El cambio por energía necesita un umbral entero entre 1 y 99' using errcode = 'P0001';
        end if;
      elsif c ? 'umbral' then
        raise exception 'El umbral solo vale para el cambio por energía' using errcode = 'P0001';
      end if;
      if v_al.equipo_id is null or c ->> 'sale' is null or not (c ->> 'sale' = any(v_tit)) then
        raise exception 'El que sale en un cambio programado tiene que ser titular de tu alineación' using errcode = 'P0001';
      end if;
      if c ->> 'entra' is null or not (c ->> 'entra' = any(v_al.banquillo::text[])) then
        raise exception 'El que entra en un cambio programado tiene que estar en tu banquillo' using errcode = 'P0001';
      end if;
      if c ->> 'sale' = any(v_salen) or c ->> 'entra' = any(v_entran) then
        raise exception 'Una carta solo puede salir o entrar en un cambio programado' using errcode = 'P0001';
      end if;
      v_salen := v_salen || (c ->> 'sale');
      v_entran := v_entran || (c ->> 'entra');
    end loop;
    -- Solo los campos conocidos, con el umbral como entero
    v_cambios := (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                   'sale', x ->> 'sale', 'entra', x ->> 'entra', 'condicion', x ->> 'condicion',
                   'umbral', (x ->> 'umbral')::int)) order by n)
                  from jsonb_array_elements(v_cambios) with ordinality t(x, n));
  end if;

  insert into alineaciones_tacticas as a (equipo_id, tactica, plan_b, gestion, cambios_avanzados, guardada_en)
  values (p_equipo, v_tac, v_plan, v_gest, v_cambios, now())
  on conflict (equipo_id) do update
    set tactica = excluded.tactica, plan_b = excluded.plan_b, gestion = excluded.gestion,
        cambios_avanzados = excluded.cambios_avanzados, guardada_en = excluded.guardada_en;
  return tacticas_guardadas(p_equipo);
end $$;

-- Desde la web: guardar solo las tácticas
create function public.slr_guardar_tacticas(token text, equipo_id uuid, tacticas jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_guardar_tacticas.token);
  v_equipo  uuid := slr_guardar_tacticas.equipo_id;
  v_liga    uuid;
begin
  select e.liga_id into v_liga from equipos e where e.id = v_equipo and e.usuario_id = v_usuario;
  if v_liga is null then
    raise exception 'Ese equipo no es tuyo' using errcode = 'P0001';
  end if;
  if alineaciones_cerradas(v_liga) then
    raise exception 'Las alineaciones están cerradas hasta que se publique la jornada' using errcode = 'P0001';
  end if;
  return guardar_tacticas(v_equipo, slr_guardar_tacticas.tacticas);
end $$;

-- Desde la web: las tácticas guardadas de mi equipo (nadie más puede leerlas)
create function public.slr_mis_tacticas(token text, equipo_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_mis_tacticas.token);
begin
  if not exists (select 1 from equipos e where e.id = slr_mis_tacticas.equipo_id and e.usuario_id = v_usuario) then
    raise exception 'Ese equipo no es tuyo' using errcode = 'P0001';
  end if;
  return tacticas_guardadas(slr_mis_tacticas.equipo_id);
end $$;

-- ── 5) Cartas para el motor: energía, táctica favorita y colección ──────────
-- Las stats llegan ya multiplicadas por la tocada (lesión) y luego por la energía.
create or replace function public.carta_motor(p_carta uuid, p_jornada uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', c.id, 'nombre', d.nombre,
    'ATA', greatest(1, round(b.ata * fe.f))::int,
    'DEF', greatest(1, round(b.def * fe.f))::int,
    'CON', greatest(1, round(b.con * fe.f))::int,
    'poderes', d.poderes, 'tocada', t.tocada,
    'energia', c.energia, 'estamina', d.estamina, 'tactica_favorita', d.tactica_favorita, 'coleccion_id', d.coleccion_id)
  from cartas c join disenos_carta d on d.id = c.diseno_id
  cross join lateral (
    select (p_jornada is not null and c.tocada_en_jornada = p_jornada) as tocada,
           coalesce((config_liga(c.liga_id) ->> 'lesion_tocada_factor')::numeric, 0.85) as f
  ) t
  cross join lateral (
    select case when t.tocada then greatest(1, round(d.ata * t.f))::int else d.ata end as ata,
           case when t.tocada then greatest(1, round(d.def * t.f))::int else d.def end as def,
           case when t.tocada then greatest(1, round(d.con * t.f))::int else d.con end as con
  ) b
  cross join lateral (select factor_energia(c.energia) as f) fe
  where c.id = p_carta
$$;

-- congelar_alineacion pasa a llamarse congelar_alineacion_cartas (las cartas) y la
-- nueva le añade las tácticas guardadas: es la que usan cerrar_jornada y el resto.
alter function public.congelar_alineacion(uuid, uuid) rename to congelar_alineacion_cartas;
create function public.congelar_alineacion(p_equipo uuid, p_jornada uuid) returns jsonb
language sql volatile security definer set search_path = public, extensions as $$
  select congelar_alineacion_cartas(p_equipo, p_jornada) || tacticas_motor(p_equipo, true)
$$;
-- Igual, pero con las tácticas públicas (para simular contra un rival)
create function public.congelar_alineacion_rival(p_equipo uuid, p_jornada uuid) returns jsonb
language sql volatile security definer set search_path = public, extensions as $$
  select congelar_alineacion_cartas(p_equipo, p_jornada) || tacticas_motor(p_equipo, false)
$$;

-- ── 6) «Sugerir alineación»: la mejor stat del hueco × factor de energía ────
-- Gemelo de sugerirAlineacion() en la web. Desempates: OVR × factor e id.
create function public.cartas_equipo_energia(p_equipo uuid)
returns table (id uuid, ata numeric, def numeric, con numeric, o numeric)
language sql stable set search_path = public, extensions as $$
  select c.id, d.ata * f.f, d.def * f.f, d.con * f.f, ovr(d.ata, d.def, d.con) * f.f
  from cartas c join disenos_carta d on d.id = c.diseno_id
  cross join lateral (select factor_energia(c.energia) as f) f
  where c.equipo_id = p_equipo
$$;

-- Alineación por defecto (equipos nuevos, bots y quien no guardó): la regla de
-- «Sugerir alineación», con cada stat multiplicada por el factor de energía
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
  select p.id into v_por from cartas_equipo_energia(p_equipo) p order by p.def desc, p.o desc, p.id limit 1;
  if v_por is not null then v_usadas := array[v_por]; end if;
  v_def := array(select p.id from cartas_equipo_energia(p_equipo) p where p.id <> all(v_usadas) order by p.def desc, p.o desc, p.id limit 2);
  v_usadas := v_usadas || v_def;
  v_med := array(select p.id from cartas_equipo_energia(p_equipo) p where p.id <> all(v_usadas) order by p.con desc, p.o desc, p.id limit 2);
  v_usadas := v_usadas || v_med;
  v_del := array(select p.id from cartas_equipo_energia(p_equipo) p where p.id <> all(v_usadas) order by p.ata desc, p.o desc, p.id limit 2);
  v_usadas := v_usadas || v_del;
  v_banco := array(select p.id from cartas_equipo_energia(p_equipo) p where p.id <> all(v_usadas) order by p.o desc, p.id limit 3);
  select p.id into v_capitan from cartas_equipo_energia(p_equipo) p where p.id = any(v_usadas) order by p.o desc, p.id limit 1;
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

-- Cierre: antes de congelar, los bots eligen táctica al azar (gestión normal, sin
-- plan B ni cambios programados). La alineación la rehace cerrar_jornada_base con
-- crear_alineacion_por_defecto, que ya rota según la energía.
alter function public.cerrar_jornada(uuid) rename to cerrar_jornada_base;
create function public.cerrar_jornada(p_jornada uuid) returns boolean
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
    insert into alineaciones_tacticas as a (equipo_id, tactica, plan_b, gestion, cambios_avanzados, guardada_en)
    values (r.id, (array['posesion', 'contraataque', 'presion'])[1 + floor(random() * 3)::int], null, 'normal', '[]', now())
    on conflict (equipo_id) do update
      set tactica = excluded.tactica, plan_b = null, gestion = 'normal', cambios_avanzados = '[]', guardada_en = now();
  end loop;
  return cerrar_jornada_base(p_jornada);
end $$;

-- Guardar la simulación: lo de siempre y, desde la v2, tácticas y participación
alter function public.motor_guardar_jornada(uuid, jsonb, text) rename to motor_guardar_jornada_base;
create function public.motor_guardar_jornada(p_jornada uuid, p_resultados jsonb, p_version text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_res jsonb := motor_guardar_jornada_base(p_jornada, p_resultados, p_version);
  r     jsonb;
begin
  if coalesce((v_res ->> 'simulada')::boolean, false) then
    for r in select x from jsonb_array_elements(p_resultados) x loop
      update partidos p set tacticas = tacticas_resultado(r), participacion = r -> 'participacion'
       where p.id = (r ->> 'partido_id')::uuid and p.jornada_id = p_jornada;
    end loop;
  end if;
  return v_res;
end $$;

create function public.tacticas_resultado(r jsonb) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(r -> 'tacticas') = 'object' then
    jsonb_build_object('A', r -> 'tacticas' -> 'A', 'B', r -> 'tacticas' -> 'B', 'cruce', r -> 'cruce',
                       'plan_b', r -> 'plan_b', 'cambios_descanso', r -> 'cambios_descanso') end
$$;

-- Amistoso: también guarda tácticas y participación (la energía no se toca)
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
         estadisticas = p_resultado -> 'estadisticas', version_motor = p_version, simulado_en = now(),
         tacticas = tacticas_resultado(p_resultado), participacion = p_resultado -> 'participacion'
   where p.id = p_partido;
  return jsonb_build_object('partido_id', p_partido, 'goles', p_resultado -> 'goles');
end $$;

create or replace function public.motor_preparar_amistoso(p_token text, p_rival uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(p_token);
  v_liga    uuid;
  v_eq      equipos;
  v_p       partidos;
begin
  select e.liga_id into v_liga from equipos e where e.id = p_rival;
  if v_liga is null then
    raise exception 'Ese equipo no existe' using errcode = 'P0001';
  end if;
  v_eq := equipo_en_liga(v_usuario, v_liga);
  if v_eq.id = p_rival then
    raise exception 'No puedes jugar un amistoso contra ti mismo' using errcode = 'P0001';
  end if;
  -- Amistoso: alineaciones guardadas y energía actual, sin "tocada" ni consecuencias.
  -- Mis tácticas guardadas; las del rival, las públicas (su última táctica publicada)
  insert into partidos (liga_id, tipo, local_id, visitante_id, semilla, alineaciones_congeladas, creado_por)
  values (v_liga, 'amistoso', v_eq.id, p_rival, semilla_aleatoria(),
          jsonb_build_object('local', congelar_alineacion(v_eq.id, null), 'visitante', congelar_alineacion_rival(p_rival, null)),
          v_usuario)
  returning * into v_p;
  return jsonb_build_object('partido_id', v_p.id, 'semilla', v_p.semilla,
                            'local', v_p.alineaciones_congeladas -> 'local', 'visitante', v_p.alineaciones_congeladas -> 'visitante');
end $$;

create function public.congelar_para(p_equipo uuid, p_jornada uuid, p_privadas boolean) returns jsonb
language sql volatile security definer set search_path = public, extensions as $$
  select congelar_alineacion_cartas(p_equipo, p_jornada) || tacticas_motor(p_equipo, p_privadas)
$$;

create or replace function public.motor_preparar_pronostico(p_token text, p_equipo uuid, p_rival uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(p_token);
  v_liga    uuid;
  v_j       uuid;
  v_mio     boolean;
  r         record;
begin
  select e.liga_id into v_liga from equipos e where e.id = p_equipo;
  if v_liga is null then
    raise exception 'Ese equipo no existe' using errcode = 'P0001';
  end if;
  perform exigir_miembro(v_usuario, v_liga);
  -- Las tácticas guardadas solo entran si el equipo es mío; el rival, con las públicas
  v_mio := exists (select 1 from equipos e where e.id = p_equipo and e.usuario_id = v_usuario);
  select p.id as partido_id, p.local_id, p.visitante_id, j.id as jornada_id, j.numero, j.cierre_en into r
  from partidos p join jornadas j on j.id = p.jornada_id
  where j.temporada_id = (temporada_actual(v_liga)).id and j.estado = 'programada'
    and (p.local_id = p_equipo or p.visitante_id = p_equipo)
  order by j.numero limit 1;

  if p_rival is null then
    if r.partido_id is null then
      return jsonb_build_object('sin_partido', true);
    end if;
    return jsonb_build_object(
      'partido_id', r.partido_id, 'jornada', r.numero, 'cierre_en', r.cierre_en,
      'es_local', r.local_id = p_equipo,
      'rival_id', case when r.local_id = p_equipo then r.visitante_id else r.local_id end,
      'local', congelar_para(r.local_id, r.jornada_id, v_mio and r.local_id = p_equipo),
      'visitante', congelar_para(r.visitante_id, r.jornada_id, v_mio and r.visitante_id = p_equipo));
  end if;

  if p_rival = p_equipo or not exists (select 1 from equipos e where e.id = p_rival and e.liga_id = v_liga) then
    raise exception 'Elige un rival de tu liga' using errcode = 'P0001';
  end if;
  if not exists (select 1 from alineaciones a where a.equipo_id = p_rival) then
    raise exception 'Ese equipo todavía no tiene alineación' using errcode = 'P0001';
  end if;
  -- Si el rival elegido es el del próximo partido, se respeta quién juega en casa
  if r.partido_id is not null and p_rival in (r.local_id, r.visitante_id) then
    return jsonb_build_object(
      'partido_id', r.partido_id, 'jornada', r.numero, 'cierre_en', r.cierre_en,
      'es_local', r.local_id = p_equipo, 'rival_id', p_rival,
      'local', congelar_para(r.local_id, r.jornada_id, v_mio and r.local_id = p_equipo),
      'visitante', congelar_para(r.visitante_id, r.jornada_id, v_mio and r.visitante_id = p_equipo));
  end if;
  v_j := r.jornada_id;
  return jsonb_build_object('es_local', true, 'rival_id', p_rival,
    'local', congelar_para(p_equipo, v_j, v_mio), 'visitante', congelar_alineacion_rival(p_rival, v_j));
end $$;

-- ── 7) Energía al publicar una jornada de liga ──────────────────────────────
-- Gasto por partido según la estamina (alta 22, media 30, baja 40), ×1,3 en cada
-- tramo jugado con presión; quien jugó solo una parte, la mitad (con la táctica
-- de su tramo: el titular sustituido, la del primero; el que entró, la del segundo).
-- Después todas las cartas de la liga recuperan 20 y las que no jugaron 20 más
-- (tope 0–100): los equipos que descansan recuperan como si no jugase nadie.
-- Las cartas sin dueño también descansan. Los amistosos no gastan ni recuperan.
create function public.gastar_energia_jornada(p_jornada uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_j     jornadas;
  p       record;
  lado    text;
  al      jsonb;
  part    jsonb;
  v_tit   text[];
  f1      numeric;
  f2      numeric;
  v_gasto jsonb := '{}';
  v_reg   jsonb;
  x       text;
  v_base  int;
  g       numeric;
begin
  select * into v_j from jornadas j where j.id = p_jornada;
  for p in select * from partidos q where q.jornada_id = p_jornada loop
    v_reg := '{}';
    foreach lado in array array['A', 'B'] loop
      part := p.participacion -> lado;
      continue when part is null;
      al := p.alineaciones_congeladas -> (case lado when 'A' then 'local' else 'visitante' end);
      v_tit := array[al -> 'por' ->> 'id']
               || array(select y ->> 'id' from jsonb_array_elements(al -> 'def') y)
               || array(select y ->> 'id' from jsonb_array_elements(al -> 'med') y)
               || array(select y ->> 'id' from jsonb_array_elements(al -> 'del') y);
      f1 := case when p.tacticas -> lado ->> 0 = 'presion' then 1.3 else 1 end;
      f2 := case when coalesce(p.tacticas -> lado ->> 1, p.tacticas -> lado ->> 0) = 'presion' then 1.3 else 1 end;
      v_reg := v_reg || jsonb_build_object(lado, '[]'::jsonb);
      for x in select jsonb_array_elements_text(part -> 'completo') union all
               select jsonb_array_elements_text(part -> 'parcial') loop
        continue when x like 'canterano-%';
        select case d.estamina when 'alta' then 22 when 'baja' then 40 else 30 end into v_base
        from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = x::uuid;
        continue when v_base is null;
        g := case when exists (select 1 from jsonb_array_elements_text(part -> 'completo') z where z = x)
                  then v_base * (f1 + f2) / 2
                  when x = any(v_tit) then v_base * 0.5 * f1
                  else v_base * 0.5 * f2 end;
        v_gasto := v_gasto || jsonb_build_object(x, g);
        v_reg := jsonb_set(v_reg, array[lado], (v_reg -> lado) || jsonb_build_array(jsonb_build_object(
          'id', x, 'nombre', nombre_carta(x::uuid), 'antes', (select c.energia from cartas c where c.id = x::uuid),
          'gasto', round(g)::int)));
      end loop;
    end loop;
    update partidos q set energia = nullif(v_reg, '{}') where q.id = p.id;
  end loop;

  update cartas c
     set energia = least(100, greatest(0, round(c.energia - coalesce((v_gasto ->> c.id::text)::numeric, 0)
                                                + 20 + case when v_gasto ? c.id::text then 0 else 20 end)))::int
   where c.liga_id = v_j.liga_id;
end $$;

alter function public.publicar_jornada(uuid) rename to publicar_jornada_base;
create function public.publicar_jornada(p_jornada uuid) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_j jornadas;
begin
  select * into v_j from jornadas j where j.id = p_jornada for update;
  if v_j.estado <> 'simulada' then
    return false;
  end if;
  perform gastar_energia_jornada(p_jornada);
  return publicar_jornada_base(p_jornada);
end $$;

-- Crónica: con tácticas, participación y energía gastada
create or replace function public.slr_partido(token text, partido_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_partido.token);
  v_p       partidos;
  v_j       jornadas;
begin
  select * into v_p from partidos p where p.id = slr_partido.partido_id;
  if not found then
    raise exception 'Ese partido no existe' using errcode = 'P0001';
  end if;
  perform exigir_miembro(v_usuario, v_p.liga_id);
  if v_p.tipo = 'liga' then
    select * into v_j from jornadas j where j.id = v_p.jornada_id;
    if v_j.estado <> 'publicada' then
      raise exception 'Este partido todavía no se ha publicado' using errcode = 'P0001';
    end if;
  end if;
  -- Un amistoso lleva las tácticas guardadas de quien lo jugó: solo él ve la crónica
  if v_p.tipo = 'amistoso' and v_p.creado_por is distinct from v_usuario then
    raise exception 'La crónica de un amistoso solo la ve quien lo jugó (lleva su táctica)' using errcode = 'P0001';
  end if;
  if v_p.goles_local is null then
    raise exception 'Este partido todavía no se ha jugado' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', v_p.id, 'tipo', v_p.tipo, 'jornada', v_j.numero, 'liga_id', v_p.liga_id,
    'local_id', v_p.local_id, 'visitante_id', v_p.visitante_id,
    'semilla', v_p.semilla, 'version_motor', v_p.version_motor,
    'alineaciones_congeladas', v_p.alineaciones_congeladas,
    'goles', jsonb_build_array(v_p.goles_local, v_p.goles_visitante), 'penaltis', v_p.penaltis,
    'p_local', v_p.p_local, 'p_visitante', v_p.p_visitante,
    'pr', v_p.pr, 'pr_esperado', v_p.pr_esperado, 'lesiones', v_p.lesiones, 'estadisticas', v_p.estadisticas,
    'tacticas', v_p.tacticas, 'participacion', v_p.participacion, 'energia', v_p.energia,
    'creado_por', v_p.creado_por);
end $$;

-- Guardar alineación: además, las tácticas en la misma llamada
drop function public.slr_guardar_alineacion(text, uuid, text, jsonb, uuid[], boolean, uuid);
create function public.slr_guardar_alineacion(
  token text, equipo_id uuid, formacion text, huecos jsonb,
  banquillo uuid[] default '{}', orden_manual boolean default false, capitan_id uuid default null,
  tacticas jsonb default null
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

  -- Tácticas (opcional): se validan contra la alineación que se acaba de guardar
  if slr_guardar_alineacion.tacticas is not null then
    perform guardar_tacticas(v_equipo, slr_guardar_alineacion.tacticas);
  end if;
  return (select to_jsonb(a) || jsonb_build_object('tacticas', tacticas_guardadas(v_equipo))
          from alineaciones a where a.equipo_id = v_equipo);
end $$;

create or replace function public.carta_json(p_carta uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', c.id, 'diseno_id', d.id, 'nombre', d.nombre, 'tipo', d.tipo, 'acabado', d.acabado,
    'color', d.color, 'tier', d.tier, 'rareza', d.rareza, 'coleccion_id', d.coleccion_id, 'perfil', d.perfil, 'personas', d.personas, 'texto', d.texto,
    'ata', d.ata, 'def', d.def, 'con', d.con, 'ovr', round(ovr(d.ata, d.def, d.con), 2),
    'poderes', d.poderes, 'valor', d.valor, 'imagen_url', d.imagen_url, 'beta', d.beta,
    'estamina', d.estamina, 'tactica_favorita', d.tactica_favorita, 'energia', c.energia)
  from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = p_carta
$$;

-- Formulario de carta: estamina y táctica favorita
create or replace function public.slr_admin_guardar_diseno(token text, liga_id uuid, diseno jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_admin_guardar_diseno.token);
  v_liga    uuid := slr_admin_guardar_diseno.liga_id;
  v_in      jsonb := slr_admin_guardar_diseno.diseno;
  v_id      uuid := nullif(v_in ->> 'id', '')::uuid;
  v_prueba  boolean;
  v_d       disenos_carta;
  v_carta   uuid;
  v_pers    text[] := array(select jsonb_array_elements_text(coalesce(v_in -> 'personas', '[]')));
begin
  perform exigir_modo_beta(v_usuario, v_liga);
  select l.es_prueba into v_prueba from ligas l where l.id = v_liga;
  if v_id is null then
    insert into disenos_carta (nombre, tipo, perfil, tier, acabado, color, ata, def, con, poderes, imagen_url, texto,
                               personas, semilla_stats, semilla_poderes, activo, liga_prueba_id, coleccion_id,
                               estamina, tactica_favorita)
    values (v_in ->> 'nombre', v_in ->> 'tipo', v_in ->> 'perfil', v_in ->> 'tier',
            coalesce(v_in ->> 'acabado', 'normal')::acabado_carta, nullif(v_in ->> 'color', ''),
            (v_in ->> 'ata')::int, (v_in ->> 'def')::int, (v_in ->> 'con')::int,
            case when jsonb_typeof(v_in -> 'poderes') = 'array' then v_in -> 'poderes' end,
            nullif(trim(v_in ->> 'imagen_url'), ''), nullif(trim(v_in ->> 'texto'), ''), v_pers,
            (v_in ->> 'semilla_stats')::bigint, (v_in ->> 'semilla_poderes')::bigint,
            not v_prueba, case when v_prueba then v_liga end, nullif(v_in ->> 'coleccion_id', '')::uuid,
            nullif(v_in ->> 'estamina', ''), nullif(v_in ->> 'tactica_favorita', ''))
    returning * into v_d;
    if v_prueba then
      insert into cartas (liga_id, diseno_id) values (v_liga, v_d.id);
    end if;
  else
    select * into v_d from disenos_carta d where d.id = v_id for update;
    if not found then
      raise exception 'Esa carta no existe' using errcode = 'P0001';
    end if;
    if v_prueba and v_d.liga_prueba_id is distinct from v_liga then
      raise exception 'Desde una liga de prueba solo se editan las cartas creadas en ella' using errcode = 'P0001';
    end if;
    update disenos_carta d
       set nombre = v_in ->> 'nombre', tipo = v_in ->> 'tipo', perfil = v_in ->> 'perfil', tier = v_in ->> 'tier',
           acabado = coalesce(v_in ->> 'acabado', 'normal')::acabado_carta, color = nullif(v_in ->> 'color', ''),
           ata = (v_in ->> 'ata')::int, def = (v_in ->> 'def')::int, con = (v_in ->> 'con')::int,
           poderes = case when jsonb_typeof(v_in -> 'poderes') = 'array' then v_in -> 'poderes' end,
           imagen_url = nullif(trim(v_in ->> 'imagen_url'), ''), texto = nullif(trim(v_in ->> 'texto'), ''),
           personas = v_pers,
           semilla_stats = (v_in ->> 'semilla_stats')::bigint, semilla_poderes = (v_in ->> 'semilla_poderes')::bigint,
           coleccion_id = nullif(v_in ->> 'coleccion_id', '')::uuid,
           -- Sin estamina se vuelven a generar; la táctica favorita vacía = ninguna
           estamina = case when v_in ? 'estamina' then nullif(v_in ->> 'estamina', '') else d.estamina end,
           tactica_favorita = case when v_in ? 'tactica_favorita' then nullif(v_in ->> 'tactica_favorita', '')
                                   else d.tactica_favorita end
     where d.id = v_id
    returning * into v_d;
  end if;
  select c.id into v_carta from cartas c where c.liga_id = v_liga and c.diseno_id = v_d.id;
  perform apuntar_historial(v_liga, 'admin_diseno',
    format('%s la carta %s (modo pruebas)', case when v_id is null then 'Creada' else 'Editada' end, v_d.nombre),
    jsonb_build_object('diseno_id', v_d.id));
  return jsonb_build_object('id', v_d.id, 'carta_id', v_carta, 'nombre', v_d.nombre, 'valor', v_d.valor,
                            'ata', v_d.ata, 'def', v_d.def, 'con', v_d.con, 'poderes', v_d.poderes,
                            'estamina', v_d.estamina, 'tactica_favorita', v_d.tactica_favorita);
end $$;

-- Edición múltiple: también estamina y táctica favorita
create or replace function public.slr_admin_editar_disenos(token text, liga_id uuid, ids uuid[], cambios jsonb, solo_contar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_admin_editar_disenos.token);
  v_liga    uuid := slr_admin_editar_disenos.liga_id;
  v_c       jsonb := coalesce(slr_admin_editar_disenos.cambios, '{}');
  v_pedidos uuid[] := array(select distinct x from unnest(coalesce(slr_admin_editar_disenos.ids, '{}')) x);
  v_prueba  boolean;
  v_ids     uuid[];
  v_antes   jsonb;
  v_regen_s boolean := coalesce((v_c ->> 'regenerar_stats')::boolean, false);
  v_regen_p boolean := coalesce((v_c ->> 'regenerar_poderes')::boolean, false);
  v_desc    text;
  v_res     jsonb;
  k         text;
begin
  perform exigir_modo_beta(v_usuario, v_liga);
  select l.es_prueba into v_prueba from ligas l where l.id = v_liga;
  if cardinality(v_pedidos) = 0 then
    raise exception 'No hay ninguna carta seleccionada' using errcode = 'P0001';
  end if;
  for k in select jsonb_object_keys(v_c) loop
    if k not in ('coleccion_id', 'color', 'tipo', 'tier', 'perfil', 'acabado', 'activo', 'estamina', 'tactica_favorita',
                 'regenerar_stats', 'regenerar_poderes') then
      raise exception 'Cambio desconocido: %', k using errcode = 'P0001';
    end if;
  end loop;
  if v_c - 'regenerar_stats' - 'regenerar_poderes' = '{}'::jsonb and not v_regen_s and not v_regen_p then
    raise exception 'Elige al menos un cambio' using errcode = 'P0001';
  end if;
  if v_prueba and v_c ? 'activo' then
    raise exception 'Desde una liga de prueba no se activan ni desactivan cartas: las creadas en ella son solo de esa liga' using errcode = 'P0001';
  end if;

  v_ids := array(
    select d.id from disenos_carta d
    where d.id = any(v_pedidos)
      and case when v_prueba then d.liga_prueba_id = v_liga else d.liga_prueba_id is null end
    order by d.id
    for update);
  if cardinality(v_ids) <> cardinality(v_pedidos) then
    raise exception '% de las cartas elegidas no existen o no se pueden editar desde esta liga',
      cardinality(v_pedidos) - cardinality(v_ids) using errcode = 'P0001';
  end if;
  v_antes := (select jsonb_object_agg(d.id, to_jsonb(d)) from disenos_carta d where d.id = any(v_ids));

  begin
    update disenos_carta d set
      coleccion_id = case when v_c ? 'coleccion_id' then nullif(v_c ->> 'coleccion_id', '')::uuid else d.coleccion_id end,
      color        = case when v_c ? 'color' then nullif(v_c ->> 'color', '') else d.color end,
      tipo         = coalesce(nullif(v_c ->> 'tipo', ''), d.tipo),
      tier         = coalesce(nullif(v_c ->> 'tier', ''), d.tier),
      perfil       = coalesce(nullif(v_c ->> 'perfil', ''), d.perfil),
      acabado      = coalesce(nullif(v_c ->> 'acabado', '')::acabado_carta, d.acabado),
      activo       = coalesce((v_c ->> 'activo')::boolean, d.activo),
      estamina     = coalesce(nullif(v_c ->> 'estamina', ''), d.estamina),
      -- Táctica favorita: '' = ninguna
      tactica_favorita = case when v_c ? 'tactica_favorita' then nullif(v_c ->> 'tactica_favorita', '') else d.tactica_favorita end,
      -- Vacías = las genera el trigger con una semilla nueva
      ata = case when v_regen_s then null else d.ata end,
      def = case when v_regen_s then null else d.def end,
      con = case when v_regen_s then null else d.con end,
      semilla_stats   = case when v_regen_s then null else d.semilla_stats end,
      poderes         = case when v_regen_p then null else d.poderes end,
      semilla_poderes = case when v_regen_p then null else d.semilla_poderes end
    where d.id = any(v_ids);

    -- Resumen: qué ha cambiado de verdad en cada carta
    with comp as (
      select d.nombre, d.valor, a,
             (a ->> 'coleccion_id') is distinct from d.coleccion_id::text as c_col,
             (a ->> 'color')        is distinct from d.color as c_color,
             (a ->> 'tipo')         is distinct from d.tipo as c_tipo,
             (a ->> 'tier')         is distinct from d.tier as c_tier,
             (a ->> 'rareza')       is distinct from d.rareza as c_rareza,
             (a ->> 'perfil')       is distinct from d.perfil as c_perfil,
             (a ->> 'acabado')      is distinct from d.acabado::text as c_acabado,
             (a ->> 'activo')::boolean is distinct from d.activo as c_activo,
             (a ->> 'estamina') is distinct from d.estamina as c_estamina,
             (a ->> 'tactica_favorita') is distinct from d.tactica_favorita as c_tfav,
             ((a ->> 'ata')::int, (a ->> 'def')::int, (a ->> 'con')::int) is distinct from (d.ata, d.def, d.con) as c_stats,
             (a -> 'poderes') is distinct from d.poderes as c_poderes,
             (a ->> 'valor')::int is distinct from d.valor as c_valor,
             d.tier, d.rareza, d.ata, d.def, d.con, d.estamina
      from disenos_carta d join jsonb_each(v_antes) e(id, a) on e.id::uuid = d.id
    ), marcadas as (
      select *, c_col or c_color or c_tipo or c_tier or c_perfil or c_acabado or c_activo or c_stats or c_poderes
                or c_estamina or c_tfav as alguno from comp
    )
    select jsonb_build_object(
      'solo_contar', solo_contar,
      'cartas', cardinality(v_ids),
      'cambian', count(*) filter (where alguno),
      'por_campo', jsonb_strip_nulls(jsonb_build_object(
         'coleccion', nullif(count(*) filter (where c_col), 0), 'color', nullif(count(*) filter (where c_color), 0),
         'tipo', nullif(count(*) filter (where c_tipo), 0), 'tier', nullif(count(*) filter (where c_tier), 0),
         'rareza', nullif(count(*) filter (where c_rareza), 0), 'perfil', nullif(count(*) filter (where c_perfil), 0),
         'acabado', nullif(count(*) filter (where c_acabado), 0), 'activo', nullif(count(*) filter (where c_activo), 0),
         'stats', nullif(count(*) filter (where c_stats), 0), 'poderes', nullif(count(*) filter (where c_poderes), 0),
         'valor', nullif(count(*) filter (where c_valor), 0),
         'estamina', nullif(count(*) filter (where c_estamina), 0),
         'tactica_favorita', nullif(count(*) filter (where c_tfav), 0))),
      'ejemplos', coalesce((select jsonb_agg(x.texto) from (
         select m.nombre || ': ' || concat_ws(', ',
           case when m.c_tier then format('tier %s→%s', m.a ->> 'tier', m.tier) end,
           case when m.c_rareza then format('%s→%s', m.a ->> 'rareza', m.rareza) end,
           case when m.c_stats then format('stats %s/%s/%s→%s/%s/%s', m.a ->> 'ata', m.a ->> 'def', m.a ->> 'con', m.ata, m.def, m.con) end,
           case when m.c_poderes then 'poderes nuevos' end,
           case when m.c_valor then format('valor %s→%s', m.a ->> 'valor', m.valor) end,
           case when m.c_col then 'colección' end, case when m.c_color then 'color' end, case when m.c_tipo then 'tipo' end,
           case when m.c_perfil then 'perfil' end, case when m.c_acabado then 'acabado' end,
           case when m.c_estamina then format('estamina %s→%s', m.a ->> 'estamina', m.estamina) end,
           case when m.c_tfav then 'táctica favorita' end,
           case when m.c_activo then case when m.a ->> 'activo' = 'true' then 'desactivada' else 'activada' end end) as texto
         from marcadas m where m.alguno order by m.nombre limit 8) x), '[]'::jsonb))
    into v_res from marcadas;

    if solo_contar then
      raise exception using errcode = 'SLRSC';   -- deshace los cambios; el resumen se queda
    end if;
  exception when sqlstate 'SLRSC' then
    null;
  end;

  if not solo_contar then
    v_desc := (select string_agg(t.clave, ', ') from jsonb_object_keys(v_c) as t(clave));
    perform apuntar_historial(v_liga, 'admin_edicion_multiple',
      format('Edición múltiple de %s cartas (%s) · modo pruebas', cardinality(v_ids), v_desc),
      jsonb_build_object('cartas', cardinality(v_ids), 'cambios', v_c));
  end if;
  return v_res;
end $$;

create or replace function public.slr_generar_cartas(casos jsonb) returns jsonb
language sql immutable set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'stats',   generar_stats(c ->> 'tier', c ->> 'perfil', c ->> 'tipo', (c ->> 'semilla_stats')::bigint),
    'poderes', generar_poderes(c ->> 'tier', c ->> 'perfil', (c ->> 'semilla_poderes')::bigint),
    'rasgos',  generar_rasgos(c ->> 'perfil', (c ->> 'semilla_stats')::bigint)) order by n), '[]')
  from jsonb_array_elements(casos) with ordinality as x(c, n)
  where jsonb_array_length(casos) <= 2000
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke execute on function
  public.generar_rasgos(text, bigint), public.disenos_carta_rasgos(), public.factor_energia(int),
  public.temporada_energia_llena(), public.tacticas_guardadas(uuid), public.ultima_tactica_publicada(uuid),
  public.tacticas_motor(uuid, boolean), public.guardar_tacticas(uuid, jsonb),
  public.congelar_alineacion(uuid, uuid), public.congelar_alineacion_rival(uuid, uuid), public.congelar_para(uuid, uuid, boolean),
  public.cartas_equipo_energia(uuid), public.cerrar_jornada(uuid), public.motor_guardar_jornada(uuid, jsonb, text),
  public.tacticas_resultado(jsonb), public.gastar_energia_jornada(uuid), public.publicar_jornada(uuid)
from public, anon, authenticated;
revoke execute on function public.slr_guardar_tacticas(text, uuid, jsonb), public.slr_mis_tacticas(text, uuid),
  public.slr_guardar_alineacion(text, uuid, text, jsonb, uuid[], boolean, uuid, jsonb) from public;
grant execute on function public.slr_guardar_tacticas(text, uuid, jsonb), public.slr_mis_tacticas(text, uuid),
  public.slr_guardar_alineacion(text, uuid, text, jsonb, uuid[], boolean, uuid, jsonb) to anon, authenticated;
