-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — cartas por tiers, generador, colores y poderes v1.3.0
--
-- 1. disenos_carta: tier (S…F), perfil, color (paleta fija; null = color del
--    tipo), semillas del generador y liga_prueba_id (cartas creadas desde una
--    liga de prueba: inactivas, con ejemplar solo en esa liga y que se borran
--    con ella).
-- 2. Generador: generar_stats() y generar_poderes(), gemelos exactos de
--    js/slr/generador.js (aritmética entera; tests/slr/generador-sql.test.mjs).
--    El trigger rellena las stats y los poderes que vengan vacíos.
-- 3. Poderes v1.3.0: `probabilidades` [p1, p2, p3] (al menos 1, 2 y 3
--    activaciones). Las cartas beta pasan a [0,40, 0,18, 0,07].
-- 4. slr_admin_guardar_diseno: formulario "Nueva carta" / "Editar carta".
-- ═══════════════════════════════════════════════════════════════════════════

/* ── 1. Columnas ──────────────────────────────────────────────────────────── */
alter table public.disenos_carta
  add column tier            text check (tier in ('S', 'A', 'B', 'C', 'D', 'E', 'F')),
  add column perfil          text check (perfil in ('atacante', 'defensa', 'control', 'portero', 'equilibrado')),
  add column color           text check (color in ('verde', 'morado', 'azul', 'rojo', 'naranja', 'dorado', 'plata', 'negro')),
  add column semilla_stats   bigint check (semilla_stats >= 0),
  add column semilla_poderes bigint check (semilla_poderes >= 0),
  add column liga_prueba_id  uuid references public.ligas(id) on delete cascade;

-- Stats y poderes vacíos al insertar = se generan (el trigger los rellena antes
-- de comprobar el not null)
alter table public.disenos_carta alter column poderes drop default;

/* ── 2. Generador (gemelo de js/slr/generador.js) ─────────────────────────── */
-- Park-Miller: siguiente estado
create function public.pm_sig(s bigint) returns bigint
language sql immutable as $$ select (s * 48271) % 2147483647 $$;

create function public.pm_inicio(p_semilla bigint) returns bigint
language sql immutable as $$ select (abs(coalesce(p_semilla, 0)) % 2147483646) + 1 $$;

create function public.generar_stats(p_tier text, p_perfil text, p_tipo text, p_semilla bigint) returns jsonb
language plpgsql immutable set search_path = public, extensions as $$
declare
  s     bigint := pm_inicio(p_semilla);
  lo    int;
  hi    int;
  t     int;
  d1    int;
  d2    int;
  cap   int;
  s1    int;
  orden text[];
  pr    text;
  resto text[];
  perms text[] := array['ATA,DEF,CON', 'ATA,CON,DEF', 'DEF,ATA,CON', 'DEF,CON,ATA', 'CON,ATA,DEF', 'CON,DEF,ATA'];
  v     int[];
begin
  select x.lo, x.hi into lo, hi from (values ('S', 85, 95), ('A', 78, 85), ('B', 72, 78), ('C', 66, 72),
    ('D', 60, 66), ('E', 54, 60), ('F', 46, 54)) x(tier, lo, hi) where x.tier = p_tier;
  if lo is null then raise exception 'Tier desconocido: %', p_tier using errcode = 'P0001'; end if;
  if p_perfil not in ('atacante', 'defensa', 'control', 'portero', 'equilibrado') or p_perfil is null then
    raise exception 'Perfil desconocido: %', p_perfil using errcode = 'P0001';
  end if;
  s := pm_sig(s); t := lo + (s % (hi - lo))::int;
  if p_perfil = 'portero' then
    s := pm_sig(s); d1 := 15 + (s % 11)::int;
    s := pm_sig(s); d2 := 15 + (s % 16)::int;
    orden := array['DEF', 'CON', 'ATA'];
  elsif p_perfil = 'equilibrado' then
    s := pm_sig(s); d1 := (s % 5)::int;
    s := pm_sig(s); d2 := (s % 5)::int;
    s := pm_sig(s); orden := string_to_array(perms[(s % 6)::int + 1], ',');
  else
    s := pm_sig(s); d1 := 8 + (s % 13)::int;
    s := pm_sig(s); d2 := (s % 15)::int;
    pr := case p_perfil when 'atacante' then 'ATA' when 'defensa' then 'DEF' else 'CON' end;
    resto := array_remove(array['ATA', 'DEF', 'CON'], pr);
    s := pm_sig(s);
    orden := case when s % 2 = 1 then array[pr, resto[1], resto[2]] else array[pr, resto[2], resto[1]] end;
  end if;
  cap := case p_tipo when 'duo' then 99 when 'trio' then 100 when 'unica' then 101 else 97 end;
  s1 := t + (40 * d1 + 15 * d2 + 99) / 100;
  while s1 > cap and (d1 > 0 or d2 > 0) loop
    if d2 > 0 then d2 := d2 - 1; else d1 := d1 - 1; end if;
    s1 := t + (40 * d1 + 15 * d2 + 99) / 100;
  end loop;
  s1 := least(s1, cap);
  v := array[s1, greatest(1, s1 - d1), 0];
  v[3] := greatest(1, v[2] - d2);
  return jsonb_build_object(orden[1], v[1], orden[2], v[2], orden[3], v[3]);
end $$;

create function public.generar_poderes(p_tier text, p_perfil text, p_semilla bigint) returns jsonb
language plpgsql immutable set search_path = public, extensions as $$
declare
  s        bigint := pm_inicio(p_semilla);
  n        int := 0;
  nivel    text := 'simple';
  momentos text[];
  base     int;
  momento  text;
  lista    text[];
  i        int;
  usados   text[] := '{}';
  out      jsonb := '[]';
begin
  if p_tier not in ('S', 'A', 'B', 'C', 'D', 'E', 'F') or p_tier is null then
    raise exception 'Tier desconocido: %', p_tier using errcode = 'P0001';
  end if;
  momentos := case p_perfil
    when 'atacante'    then array['chut', 'ocasion_ataque']
    when 'defensa'     then array['ocasion_defensa']
    when 'control'     then array['posesion']
    when 'portero'     then array['parada']
    when 'equilibrado' then array['posesion', 'ocasion_ataque', 'ocasion_defensa', 'chut'] end;
  if momentos is null then raise exception 'Perfil desconocido: %', p_perfil using errcode = 'P0001'; end if;
  if p_tier = 'S' then n := 2; nivel := 'fuerte';
  elsif p_tier = 'A' then n := 1; nivel := 'fuerte';
  elsif p_tier = 'B' then n := 1;
  elsif p_tier = 'C' then s := pm_sig(s); if s % 100 < 40 then n := 1; end if;
  end if;
  s := pm_sig(s); base := (s % cardinality(momentos))::int;
  for k in 0 .. n - 1 loop
    momento := momentos[(base + k) % cardinality(momentos) + 1];
    lista := case momento
      when 'posesion'        then array['Batuta', 'Cerebro', 'Pase de seda', 'Tiki-taka', 'El Metrónomo', 'Rondo eterno']
      when 'ocasion_ataque'  then array['Todos para uno', 'Desmarque', 'Contragolpe', 'Pared mágica', 'Carrerón', 'Bicicleta']
      when 'ocasion_defensa' then array['Muro', 'Cerrojo', 'Candado', 'El Autobús', 'Barrida', 'Tijera limpia']
      when 'chut'            then array['Francotirador', 'Cañonero', 'Folha seca', 'Al ángulo', 'Chilena', 'Zapatazo']
      when 'parada'          then array['Manos de hierro', 'Manos de oro', 'El Pulpo', 'Paradón', 'Gato volador', 'Muralla china'] end;
    s := pm_sig(s); i := (s % cardinality(lista))::int;
    while lista[i + 1] = any(usados) loop i := (i + 1) % cardinality(lista); end loop;
    usados := usados || lista[i + 1];
    out := out || jsonb_build_array(jsonb_build_object(
      'nombre', lista[i + 1], 'momento', momento, 'nivel', nivel,
      'efecto', case nivel when 'simple' then 0.2 when 'fuerte' then 0.3 else 0.4 end,
      'probabilidades', jsonb_build_array(0.40, 0.18, 0.07)));
  end loop;
  return out;
end $$;

-- Tier y perfil a partir de las stats (cartas con stats puestas a mano)
create function public.tier_de_stats(p_ata int, p_def int, p_con int) returns text
language sql immutable as $$
  select case
    when o >= 8500 then 'S' when o >= 7800 then 'A' when o >= 7200 then 'B' when o >= 6600 then 'C'
    when o >= 6000 then 'D' when o >= 5400 then 'E' else 'F' end
  from (select 60 * greatest(p_ata, p_def, p_con) + 15 * least(p_ata, p_def, p_con)
             + 25 * (p_ata + p_def + p_con - greatest(p_ata, p_def, p_con) - least(p_ata, p_def, p_con)) as o) x
$$;

create function public.perfil_de_stats(p_ata int, p_def int, p_con int) returns text
language sql immutable as $$
  select case
    when mx - mn <= 6 then 'equilibrado'
    when p_def = mx and p_ata = mn and p_def - p_ata >= 30 then 'portero'
    when p_ata = mx then 'atacante'
    when p_def = mx then 'defensa'
    else 'control' end
  from (select greatest(p_ata, p_def, p_con) as mx, least(p_ata, p_def, p_con) as mn) x
$$;

-- Para el test de gemelos y para quien quiera probar el generador:
-- casos = [{ tier, perfil, tipo, semilla_stats, semilla_poderes }] → [{ stats, poderes }]
create function public.slr_generar_cartas(casos jsonb) returns jsonb
language sql immutable set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'stats',   generar_stats(c ->> 'tier', c ->> 'perfil', c ->> 'tipo', (c ->> 'semilla_stats')::bigint),
    'poderes', generar_poderes(c ->> 'tier', c ->> 'perfil', (c ->> 'semilla_poderes')::bigint)) order by n), '[]')
  from jsonb_array_elements(casos) with ordinality as x(c, n)
  where jsonb_array_length(casos) <= 2000
$$;

/* ── 3. Poderes: `probabilidades` [p1, p2, p3] ────────────────────────────── */
create or replace function public.validar_poderes(p_poderes jsonb) returns void
language plpgsql immutable set search_path = public, extensions as $$
declare
  p      jsonb;
  i      int := 0;
  quien  text;
  v_prob jsonb;
  v_ps   jsonb;
  v_ant  numeric;
  v_x    jsonb;
begin
  if jsonb_typeof(p_poderes) <> 'array' then
    raise exception 'poderes tiene que ser una lista: [] si no tiene, o [{"nombre": …}, …]' using errcode = 'P0001';
  end if;
  for p in select x from jsonb_array_elements(p_poderes) x loop
    i := i + 1;
    quien := format('Poder %s%s', i, coalesce(' («' || (p ->> 'nombre') || '»)', ''));
    if jsonb_typeof(p) <> 'object' then
      raise exception '%: cada poder es un objeto {"nombre", "momento", "probabilidades", "efecto", "nivel"}', quien using errcode = 'P0001';
    end if;
    if coalesce(trim(p ->> 'nombre'), '') = '' then
      raise exception '%: falta "nombre"', quien using errcode = 'P0001';
    end if;
    if coalesce(p ->> 'momento', '') not in ('posesion', 'ocasion_ataque', 'ocasion_defensa', 'tirador', 'chut', 'parada') then
      raise exception '%: "momento" tiene que ser posesion, ocasion_ataque, ocasion_defensa, tirador, chut o parada (es «%»)',
        quien, coalesce(p ->> 'momento', 'nada') using errcode = 'P0001';
    end if;
    v_prob := p -> 'probabilidad';
    v_ps := p -> 'probabilidades';
    if v_ps is not null then
      if jsonb_typeof(v_ps) <> 'array' or jsonb_array_length(v_ps) not between 1 and 3 then
        raise exception '%: "probabilidades" es una lista de 1 a 3 números: [0.4, 0.18, 0.07] = 40 %% de activarse al menos una vez, 18 %% dos y 7 %% tres', quien using errcode = 'P0001';
      end if;
      v_ant := 1;
      for v_x in select y from jsonb_array_elements(v_ps) y loop
        if jsonb_typeof(v_x) <> 'number' or (v_x #>> '{}')::numeric < 0 or (v_x #>> '{}')::numeric > v_ant then
          raise exception '%: en "probabilidades" cada número va de 0 a 1 y no puede ser mayor que el anterior', quien using errcode = 'P0001';
        end if;
        v_ant := (v_x #>> '{}')::numeric;
      end loop;
    elsif not (v_prob = '"siempre"'::jsonb
            or (jsonb_typeof(v_prob) = 'number' and (v_prob #>> '{}')::numeric > 0 and (v_prob #>> '{}')::numeric <= 1)) then
      raise exception '%: falta "probabilidades" ([0.4, 0.18, 0.07]) o "probabilidad": "siempre"', quien using errcode = 'P0001';
    end if;
    if jsonb_typeof(p -> 'efecto') <> 'number' or (p ->> 'efecto')::numeric <= 0 then
      raise exception '%: "efecto" es un número mayor que 0 (0.2 = +20 %%; en tirador, el multiplicador: 2 = ×2)', quien using errcode = 'P0001';
    end if;
    if coalesce(p ->> 'nivel', '') not in ('simple', 'fuerte', 'muy fuerte') then
      raise exception '%: "nivel" tiene que ser simple, fuerte o muy fuerte (sube el valor un 15, 35 o 60 %%)', quien using errcode = 'P0001';
    end if;
  end loop;
end $$;

-- Antes de guardar: nombre limpio, stats y poderes generados si vienen vacíos,
-- tier y perfil, poderes válidos y valor recalculado
create or replace function public.disenos_carta_antes() returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  g jsonb;
begin
  new.nombre := trim(new.nombre);
  if coalesce(new.nombre, '') = '' then
    raise exception 'La carta necesita un nombre' using errcode = 'P0001';
  end if;
  new.personas := coalesce(new.personas, '{}');
  if new.ata is null or new.def is null or new.con is null then
    if new.tier is null or new.perfil is null then
      raise exception 'Pon las tres stats (ata, def, con) o el tier y el perfil para que se generen' using errcode = 'P0001';
    end if;
    new.semilla_stats := coalesce(new.semilla_stats, 1 + floor(random() * 2147483646)::bigint);
    g := generar_stats(new.tier, new.perfil, new.tipo, new.semilla_stats);
    new.ata := coalesce(new.ata, (g ->> 'ATA')::int);
    new.def := coalesce(new.def, (g ->> 'DEF')::int);
    new.con := coalesce(new.con, (g ->> 'CON')::int);
  end if;
  new.tier := coalesce(new.tier, tier_de_stats(new.ata, new.def, new.con));
  new.perfil := coalesce(new.perfil, perfil_de_stats(new.ata, new.def, new.con));
  if new.poderes is null or new.poderes = 'null'::jsonb then
    new.semilla_poderes := coalesce(new.semilla_poderes, 1 + floor(random() * 2147483646)::bigint);
    new.poderes := generar_poderes(new.tier, new.perfil, new.semilla_poderes);
  end if;
  perform validar_poderes(new.poderes);
  new.valor := valor_diseno(new.ata, new.def, new.con, new.poderes);
  return new;
end $$;

-- Después: un diseño nuevo o reactivado tiene un ejemplar libre en cada liga
-- real (los de una liga de prueba, solo en la suya: lo pone slr_admin_guardar_diseno)
create or replace function public.disenos_carta_despues() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.activo and new.liga_prueba_id is null and (tg_op = 'INSERT' or not old.activo) then
    insert into cartas (liga_id, diseno_id)
    select l.id, new.id from ligas l where not l.es_prueba
    on conflict on constraint cartas_liga_diseno_key do nothing;
  end if;
  return null;
end $$;

-- Cartas existentes: tier y perfil a partir de sus stats; poderes del catálogo
-- beta con las probabilidades nuevas (los "siempre" no cambian)
update public.disenos_carta d
   set tier = tier_de_stats(d.ata, d.def, d.con), perfil = perfil_de_stats(d.ata, d.def, d.con)
 where d.tier is null or d.perfil is null;

update public.disenos_carta d
   set poderes = (select coalesce(jsonb_agg(
                    case when x -> 'probabilidad' = '"siempre"'::jsonb then x
                         else (x - 'probabilidad') || jsonb_build_object('probabilidades', jsonb_build_array(0.40, 0.18, 0.07)) end
                    order by n), '[]'::jsonb)
                  from jsonb_array_elements(d.poderes) with ordinality as t(x, n))
 where d.beta and jsonb_array_length(d.poderes) > 0;

alter table public.disenos_carta alter column tier set not null, alter column perfil set not null;

-- carta_json con color, tier y perfil
create or replace function public.carta_json(p_carta uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', c.id, 'diseno_id', d.id, 'nombre', d.nombre, 'tipo', d.tipo, 'acabado', d.acabado,
    'color', d.color, 'tier', d.tier, 'perfil', d.perfil, 'personas', d.personas, 'texto', d.texto,
    'ata', d.ata, 'def', d.def, 'con', d.con, 'ovr', round(ovr(d.ata, d.def, d.con), 2),
    'poderes', d.poderes, 'valor', d.valor, 'imagen_url', d.imagen_url, 'beta', d.beta)
  from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = p_carta
$$;

-- Herramienta de plantillas: también color y tier
create or replace function public.slr_admin_cartas(token text, liga_id uuid) returns jsonb
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
               'id', c.id, 'diseno_id', d.id, 'nombre', d.nombre, 'tipo', d.tipo, 'acabado', d.acabado, 'personas', d.personas,
               'color', d.color, 'tier', d.tier, 'perfil', d.perfil,
               'ata', d.ata, 'def', d.def, 'con', d.con, 'valor', d.valor, 'poderes', d.poderes,
               'imagen_url', d.imagen_url, 'activo', d.activo, 'equipo_id', c.equipo_id)
             order by d.valor desc, d.nombre)
      from cartas c join disenos_carta d on d.id = c.diseno_id where c.liga_id = v_liga), '[]'::jsonb));
end $$;

/* ── 4. Formulario "Nueva carta" / "Editar carta" ─────────────────────────── */
-- diseno: { id?, nombre, tipo, perfil, tier, acabado, color, ata, def, con,
--           poderes, imagen_url, texto, personas, semilla_stats, semilla_poderes }
-- Desde una liga de prueba la carta nace inactiva (no llega a las ligas
-- reales), con ejemplar solo en esa liga, y se borra con ella; desde ahí solo
-- se pueden editar las cartas creadas en esa liga.
create function public.slr_admin_guardar_diseno(token text, liga_id uuid, diseno jsonb) returns jsonb
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
                               personas, semilla_stats, semilla_poderes, activo, liga_prueba_id)
    values (v_in ->> 'nombre', v_in ->> 'tipo', v_in ->> 'perfil', v_in ->> 'tier',
            coalesce(v_in ->> 'acabado', 'normal')::acabado_carta, nullif(v_in ->> 'color', ''),
            (v_in ->> 'ata')::int, (v_in ->> 'def')::int, (v_in ->> 'con')::int,
            case when jsonb_typeof(v_in -> 'poderes') = 'array' then v_in -> 'poderes' end,
            nullif(trim(v_in ->> 'imagen_url'), ''), nullif(trim(v_in ->> 'texto'), ''), v_pers,
            (v_in ->> 'semilla_stats')::bigint, (v_in ->> 'semilla_poderes')::bigint,
            not v_prueba, case when v_prueba then v_liga end)
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
           semilla_stats = (v_in ->> 'semilla_stats')::bigint, semilla_poderes = (v_in ->> 'semilla_poderes')::bigint
     where d.id = v_id
    returning * into v_d;
  end if;
  select c.id into v_carta from cartas c where c.liga_id = v_liga and c.diseno_id = v_d.id;
  perform apuntar_historial(v_liga, 'admin_diseno',
    format('%s la carta %s (modo pruebas)', case when v_id is null then 'Creada' else 'Editada' end, v_d.nombre),
    jsonb_build_object('diseno_id', v_d.id));
  return jsonb_build_object('id', v_d.id, 'carta_id', v_carta, 'nombre', v_d.nombre, 'valor', v_d.valor,
                            'ata', v_d.ata, 'def', v_d.def, 'con', v_d.con, 'poderes', v_d.poderes);
end $$;

revoke execute on function public.slr_admin_guardar_diseno(text, uuid, jsonb) from public;
grant execute on function public.slr_admin_guardar_diseno(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.slr_generar_cartas(jsonb) to anon, authenticated;
