-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — tipo, rareza y colecciones (modelo de cartas)
-- Sin cambios en el motor ni en las reglas de partido.
--
-- 1. TIPO, solo descriptivo: individual, duo, trio, grupo (4 o más personas) y
--    especial (sin personas: objeto, lugar…). 'unica' se admite todavía hasta
--    migrar las cartas que lo son (migración aparte, con el OK de Marcos).
-- 2. RAREZA, columna generada a partir del tier: F, E y D → comun; C y B →
--    rara; A → epica; S → legendaria. Sobres y subastas reparten por rareza:
--    primero se sortea la rareza con los pesos de ligas.config (solo entre las
--    que tienen alguna carta libre) y luego una carta de esa rareza al azar.
--    La garantía premium y la tercera carta del sobre de elección pasan a ser
--    «rara o superior».
-- 3. COLECCIONES: tabla colecciones (nombre único, color de la paleta, emblema
--    en Cloudinary, descripción) y disenos_carta.coleccion_id. El nombre de una
--    carta es único dentro de su colección (y entre las que no tienen), en cada
--    liga de prueba por separado. Las colecciones creadas desde una liga de
--    prueba son de esa liga y se borran con ella, como sus cartas.
-- ═══════════════════════════════════════════════════════════════════════════

/* ── 1. Tipo ─────────────────────────────────────────────────────────────── */
do $$
declare v_con text;
begin
  select c.conname into v_con from pg_constraint c
  where c.conrelid = 'public.disenos_carta'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%tipo%individual%';
  execute format('alter table public.disenos_carta drop constraint %I', v_con);
end $$;
alter table public.disenos_carta add constraint disenos_carta_tipo_check
  check (tipo in ('individual', 'duo', 'trio', 'grupo', 'especial', 'unica'));   -- 'unica': hasta migrar

/* ── 2. Rareza ───────────────────────────────────────────────────────────── */
alter table public.disenos_carta add column rareza text not null generated always as (
  case tier when 'S' then 'legendaria' when 'A' then 'epica' when 'B' then 'rara' when 'C' then 'rara' else 'comun' end
) stored;
create index disenos_carta_rareza_idx on public.disenos_carta(rareza) where activo;

-- Orden de las rarezas (1 común … 4 legendaria)
create function public.rango_rareza(p_rareza text) returns int
language sql immutable set search_path = public, extensions as $$
  select array_position(array['comun', 'rara', 'epica', 'legendaria'], p_rareza)
$$;

/* ── 3. Colecciones ──────────────────────────────────────────────────────── */
create table public.colecciones (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (length(trim(nombre)) between 2 and 40),
  color          text check (color in ('verde', 'morado', 'azul', 'rojo', 'naranja', 'dorado', 'plata', 'negro')),
  emblema_url    text,
  descripcion    text,
  liga_prueba_id uuid references public.ligas(id) on delete cascade,
  creada_en      timestamptz not null default now()
);
-- Nombre único (sin distinguir mayúsculas); las de cada liga de prueba, aparte
create unique index colecciones_nombre_key
  on public.colecciones (coalesce(liga_prueba_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nombre));
alter table public.colecciones enable row level security;
grant select on public.colecciones to anon, authenticated;
create policy lectura_publica on public.colecciones for select to anon, authenticated using (true);

alter table public.disenos_carta add column coleccion_id uuid references public.colecciones(id) on delete set null;
create index disenos_carta_coleccion_idx on public.disenos_carta(coleccion_id);
-- Nombre de carta único dentro de su colección (y entre las que no tienen)
create unique index disenos_carta_nombre_key on public.disenos_carta (
  coalesce(liga_prueba_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(coleccion_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(nombre));

/* ── 4. Sorteo por rareza (sobres y subastas) ────────────────────────────── */
-- Una carta libre de la liga: primero la rareza, ponderada con p_pesos
-- ({"comun": 85, …}) entre las que tienen alguna carta libre (y como mínimo
-- p_minima, si se pide); luego una carta de esa rareza al azar. Sin las de
-- p_excluir, las reservadas, las que están en subasta y, si se pasa
-- p_tanda_anterior, las que estuvieron en esa tanda. null si no hay ninguna.
create function public.sortear_carta_libre(p_liga uuid, p_pesos jsonb, p_excluir uuid[], p_minima text, p_tanda_anterior date)
returns uuid
language plpgsql volatile set search_path = public, extensions as $$
declare
  v_rareza text;
  v_id     uuid;
begin
  select x.rareza into v_rareza
  from (
    select d.rareza
    from cartas c join disenos_carta d on d.id = c.diseno_id
    where c.liga_id = p_liga and c.equipo_id is null and d.activo and c.reservada_por is null
      and c.id <> all(p_excluir)
      and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
      and (p_tanda_anterior is null or not exists (
            select 1 from subastas s where s.carta_id = c.id and s.liga_id = p_liga and s.tanda = p_tanda_anterior))
    group by d.rareza
  ) x
  where coalesce((p_pesos ->> x.rareza)::numeric, 0) > 0
    and (p_minima is null or rango_rareza(x.rareza) >= rango_rareza(p_minima))
  order by -ln(1 - random()) / (p_pesos ->> x.rareza)::numeric     -- elección ponderada
  limit 1;
  if v_rareza is null then
    return null;
  end if;
  select c.id into v_id
  from cartas c join disenos_carta d on d.id = c.diseno_id
  where c.liga_id = p_liga and c.equipo_id is null and d.activo and c.reservada_por is null and d.rareza = v_rareza
    and c.id <> all(p_excluir)
    and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
    and (p_tanda_anterior is null or not exists (
          select 1 from subastas s where s.carta_id = c.id and s.liga_id = p_liga and s.tanda = p_tanda_anterior))
  order by random()
  limit 1
  for update of c;
  return v_id;
end $$;

/* ── 5. Funciones existentes, actualizadas ─────────────────────────────── */
-- generar_stats (de 20261015000100_slr_generador_ajustes.sql)
create or replace function public.generar_stats(p_tier text, p_perfil text, p_tipo text, p_semilla bigint) returns jsonb
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
  cap := case p_tipo when 'duo' then 99 when 'trio' then 100 when 'unica' then 101 when 'grupo' then 101 when 'especial' then 101 else 97 end;
  s1 := t + (40 * d1 + 15 * d2 + 99) / 100;
  while s1 > cap and (d1 > 0 or d2 > 0) loop
    -- primero d2; en el portero primero d1, para que su ATA siga siendo la más baja posible
    if (p_perfil = 'portero' and d1 = 0) or (p_perfil <> 'portero' and d2 > 0) then d2 := d2 - 1; else d1 := d1 - 1; end if;
    s1 := t + (40 * d1 + 15 * d2 + 99) / 100;
  end loop;
  s1 := least(s1, cap);
  v := array[s1, greatest(1, s1 - d1), 0];
  v[3] := greatest(1, v[2] - d2);
  return jsonb_build_object(orden[1], v[1], orden[2], v[2], orden[3], v[3]);
end $$;

-- disenos_carta_antes (de 20261015000000_slr_tiers_y_motor_v130.sql)
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
  -- Una colección creada en una liga de prueba solo vale para las cartas de esa liga
  if new.coleccion_id is not null and exists (select 1 from colecciones k where k.id = new.coleccion_id
      and k.liga_prueba_id is not null and k.liga_prueba_id is distinct from new.liga_prueba_id) then
    raise exception 'Esa colección es de una liga de prueba: no se puede usar en esta carta' using errcode = 'P0001';
  end if;
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

-- carta_json (de 20261015000000_slr_tiers_y_motor_v130.sql)
create or replace function public.carta_json(p_carta uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', c.id, 'diseno_id', d.id, 'nombre', d.nombre, 'tipo', d.tipo, 'acabado', d.acabado,
    'color', d.color, 'tier', d.tier, 'rareza', d.rareza, 'coleccion_id', d.coleccion_id, 'perfil', d.perfil, 'personas', d.personas, 'texto', d.texto,
    'ata', d.ata, 'def', d.def, 'con', d.con, 'ovr', round(ovr(d.ata, d.def, d.con), 2),
    'poderes', d.poderes, 'valor', d.valor, 'imagen_url', d.imagen_url, 'beta', d.beta)
  from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = p_carta
$$;

-- slr_admin_cartas (de 20261015000000_slr_tiers_y_motor_v130.sql)
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
               'color', d.color, 'tier', d.tier, 'rareza', d.rareza, 'coleccion_id', d.coleccion_id, 'perfil', d.perfil,
               'ata', d.ata, 'def', d.def, 'con', d.con, 'valor', d.valor, 'poderes', d.poderes,
               'imagen_url', d.imagen_url, 'activo', d.activo, 'equipo_id', c.equipo_id)
             order by d.valor desc, d.nombre)
      from cartas c join disenos_carta d on d.id = c.diseno_id where c.liga_id = v_liga), '[]'::jsonb));
end $$;

-- slr_admin_guardar_diseno (de 20261015000000_slr_tiers_y_motor_v130.sql)
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
                               personas, semilla_stats, semilla_poderes, activo, liga_prueba_id, coleccion_id)
    values (v_in ->> 'nombre', v_in ->> 'tipo', v_in ->> 'perfil', v_in ->> 'tier',
            coalesce(v_in ->> 'acabado', 'normal')::acabado_carta, nullif(v_in ->> 'color', ''),
            (v_in ->> 'ata')::int, (v_in ->> 'def')::int, (v_in ->> 'con')::int,
            case when jsonb_typeof(v_in -> 'poderes') = 'array' then v_in -> 'poderes' end,
            nullif(trim(v_in ->> 'imagen_url'), ''), nullif(trim(v_in ->> 'texto'), ''), v_pers,
            (v_in ->> 'semilla_stats')::bigint, (v_in ->> 'semilla_poderes')::bigint,
            not v_prueba, case when v_prueba then v_liga end, nullif(v_in ->> 'coleccion_id', '')::uuid)
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
           coleccion_id = nullif(v_in ->> 'coleccion_id', '')::uuid
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

-- slr_comprar_sobre (de 20261013050000_slr_catalogo_y_plantillas.sql)
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
  where c.liga_id = v_liga and c.equipo_id is null and d.activo and c.reservada_por is null
    and coalesce((v_pesos ->> d.rareza)::numeric, 0) > 0
    and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta');
  if v_libres < v_n then
    raise exception 'Quedan menos de % cartas libres: ahora no se puede comprar este sobre', v_n using errcode = 'P0001';
  end if;

  v_saldo := mover_dinero(v_eq.id, -v_precio, 'sobre_' || v_tipo, 'sobre:' || v_sobre);

  for i in 1..v_n loop
    -- Garantía premium: primera carta rara o superior si el contador ha llegado al tope.
    -- Elección: si las dos primeras son comunes, la tercera se fuerza a rara o superior.
    v_forzar := (v_tipo = 'premium' and i = 1
                 and v_eq.contador_garantia_premium >= coalesce((v_cfg ->> 'garantia_tras')::int, 2))
             or (v_tipo = 'eleccion' and i = v_n and not v_hay_esp);
    v_c := null;
    if v_forzar then
      v_c := sortear_carta_libre(v_liga, v_pesos, v_excluir, 'rara', null);
      if v_c is not null and v_tipo = 'premium' then v_garantia := true; end if;
    end if;
    if v_c is null then
      v_c := sortear_carta_libre(v_liga, v_pesos, v_excluir, null, null);
    end if;
    if v_c is null then
      raise exception 'No quedan cartas suficientes en el bombo' using errcode = 'P0001';
    end if;
    v_entregada := v_c;   -- un ejemplar por diseño: se entrega el que sale
    v_excluir := v_excluir || v_c;
    v_cartas := v_cartas || v_entregada;
    if (select d.rareza from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = v_entregada) <> 'comun' then
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

-- abrir_tanda (de 20261013050000_slr_catalogo_y_plantillas.sql)
create or replace function public.abrir_tanda(p_liga uuid, p_fecha date, p_ahora timestamptz) returns int
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_cfg      jsonb := config_liga(p_liga);
  v_pesos    jsonb := coalesce(v_cfg -> 'pesos_mercado', '{"comun":70,"rara":22,"epica":7,"legendaria":1}');
  v_n        int := coalesce((v_cfg ->> 'mercado_cartas_diarias')::int, 8);
  v_horas    int := coalesce((v_cfg ->> 'subasta_horas')::int, 24);
  v_anterior date;
  v_abiertas int;
  v_excl     uuid[] := '{}';
  v_c        uuid;
begin
  insert into tandas_mercado (liga_id, fecha, abierta_en) values (p_liga, p_fecha, p_ahora)
  on conflict do nothing;
  if not found then
    return 0; -- otra ejecución ya la abrió
  end if;
  select max(t.fecha) into v_anterior from tandas_mercado t where t.liga_id = p_liga and t.fecha < p_fecha;

  -- Cada hueco: una rareza (pesos_mercado, entre las que tienen cartas libres) y una
  -- carta de esa rareza; nunca una que ya estuvo en la tanda anterior
  for i in 1..v_n loop
    v_c := sortear_carta_libre(p_liga, v_pesos, v_excl, null, v_anterior);
    exit when v_c is null;
    insert into subastas (liga_id, carta_id, abre_en, cierra_en, tanda)
    values (p_liga, v_c, p_ahora, p_ahora + make_interval(hours => v_horas), p_fecha);
    v_excl := v_excl || v_c;
  end loop;
  v_abiertas := cardinality(v_excl);
  update tandas_mercado t set cartas = v_abiertas where t.liga_id = p_liga and t.fecha = p_fecha;
  if v_abiertas > 0 then
    perform apuntar_historial(p_liga, 'tanda', format('Nueva tanda de subastas: %s cartas durante %s horas', v_abiertas, v_horas),
      jsonb_build_object('fecha', p_fecha));
  end if;
  return v_abiertas;
end $$;


-- El sorteo por tipo ya no se usa (slr_comprar_sobre llama a sortear_carta_libre)
drop function public.sortear_carta_sobre(uuid, jsonb, uuid[], boolean);

/* ── 6. Gestor de colecciones (modo pruebas, solo admin) ─────────────────── */
-- coleccion: { id?, nombre, color, emblema_url, descripcion }. Desde una liga de
-- prueba nace ligada a ella (se borra con la liga) y solo se editan las suyas.
create function public.slr_admin_guardar_coleccion(token text, liga_id uuid, coleccion jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_admin_guardar_coleccion.token);
  v_liga    uuid := slr_admin_guardar_coleccion.liga_id;
  v_in      jsonb := slr_admin_guardar_coleccion.coleccion;
  v_id      uuid := nullif(v_in ->> 'id', '')::uuid;
  v_prueba  boolean;
  v_nombre  text := trim(coalesce(v_in ->> 'nombre', ''));
  v_k       colecciones;
begin
  perform exigir_modo_beta(v_usuario, v_liga);
  select l.es_prueba into v_prueba from ligas l where l.id = v_liga;
  if length(v_nombre) not between 2 and 40 then
    raise exception 'El nombre de la colección tiene que tener entre 2 y 40 caracteres' using errcode = 'P0001';
  end if;
  if exists (select 1 from colecciones k
             where lower(k.nombre) = lower(v_nombre) and k.id is distinct from v_id
               and k.liga_prueba_id is not distinct from case when v_prueba then v_liga end) then
    raise exception 'Ya hay una colección que se llama «%»', v_nombre using errcode = 'P0001';
  end if;
  if v_id is null then
    insert into colecciones (nombre, color, emblema_url, descripcion, liga_prueba_id)
    values (v_nombre, nullif(v_in ->> 'color', ''), nullif(trim(v_in ->> 'emblema_url'), ''),
            nullif(trim(v_in ->> 'descripcion'), ''), case when v_prueba then v_liga end)
    returning * into v_k;
  else
    select * into v_k from colecciones k where k.id = v_id for update;
    if not found then
      raise exception 'Esa colección no existe' using errcode = 'P0001';
    end if;
    if v_prueba and v_k.liga_prueba_id is distinct from v_liga then
      raise exception 'Desde una liga de prueba solo se editan las colecciones creadas en ella' using errcode = 'P0001';
    end if;
    update colecciones k
       set nombre = v_nombre, color = nullif(v_in ->> 'color', ''), emblema_url = nullif(trim(v_in ->> 'emblema_url'), ''),
           descripcion = nullif(trim(v_in ->> 'descripcion'), '')
     where k.id = v_id
    returning * into v_k;
  end if;
  perform apuntar_historial(v_liga, 'admin_coleccion',
    format('%s la colección %s (modo pruebas)', case when v_id is null then 'Creada' else 'Editada' end, v_k.nombre),
    jsonb_build_object('coleccion_id', v_k.id));
  return to_jsonb(v_k) || jsonb_build_object('cartas', (select count(*) from disenos_carta d where d.coleccion_id = v_k.id));
end $$;

-- Borra una colección: sus cartas se quedan sin colección (si así chocara algún
-- nombre con otra carta sin colección, no se borra y se dice cuál)
create function public.slr_admin_borrar_coleccion(token text, liga_id uuid, coleccion_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_admin_borrar_coleccion.token);
  v_liga    uuid := slr_admin_borrar_coleccion.liga_id;
  v_k       colecciones;
  v_choque  text;
  v_n       int;
begin
  perform exigir_modo_beta(v_usuario, v_liga);
  select * into v_k from colecciones k where k.id = slr_admin_borrar_coleccion.coleccion_id for update;
  if not found then
    raise exception 'Esa colección no existe' using errcode = 'P0001';
  end if;
  if (select l.es_prueba from ligas l where l.id = v_liga) and v_k.liga_prueba_id is distinct from v_liga then
    raise exception 'Desde una liga de prueba solo se borran las colecciones creadas en ella' using errcode = 'P0001';
  end if;
  select d.nombre into v_choque from disenos_carta d
  where d.coleccion_id = v_k.id and exists (
    select 1 from disenos_carta o where o.coleccion_id is null and lower(o.nombre) = lower(d.nombre)
      and o.liga_prueba_id is not distinct from d.liga_prueba_id)
  limit 1;
  if v_choque is not null then
    raise exception 'No se puede borrar: «%» quedaría con el mismo nombre que otra carta sin colección', v_choque using errcode = 'P0001';
  end if;
  select count(*) into v_n from disenos_carta d where d.coleccion_id = v_k.id;
  delete from colecciones k where k.id = v_k.id;
  perform apuntar_historial(v_liga, 'admin_coleccion', format('Borrada la colección %s (modo pruebas)', v_k.nombre),
    jsonb_build_object('coleccion_id', v_k.id));
  return jsonb_build_object('borrada', v_k.nombre, 'cartas_sin_coleccion', v_n);
end $$;

/* ── 7. Pesos por rareza en la configuración ─────────────────────────────── */
create or replace function public.pesos_por_rareza(p_cfg jsonb) returns jsonb
language sql immutable set search_path = public, extensions as $$
  select p_cfg
    || jsonb_build_object('pesos_mercado', '{"comun": 70, "rara": 22, "epica": 7, "legendaria": 1}'::jsonb)
    || jsonb_build_object('sobres', coalesce(p_cfg -> 'sobres', '{}'::jsonb)
         || jsonb_build_object('basico', coalesce(p_cfg #> '{sobres,basico}', '{}'::jsonb)
              || '{"pesos": {"comun": 85, "rara": 13, "epica": 2, "legendaria": 0}}'::jsonb)
         || jsonb_build_object('premium', coalesce(p_cfg #> '{sobres,premium}', '{}'::jsonb)
              || '{"pesos": {"comun": 60, "rara": 30, "epica": 8, "legendaria": 2}}'::jsonb)
         || jsonb_build_object('eleccion', coalesce(p_cfg #> '{sobres,eleccion}', '{}'::jsonb)
              || '{"pesos": {"comun": 45, "rara": 35, "epica": 15, "legendaria": 5}}'::jsonb))
$$;

do $do$
declare v_def text;
begin
  -- La configuración por defecto (ligas nuevas), con los pesos nuevos
  v_def := pesos_por_rareza(config_liga_por_defecto())::text;
  execute format('create or replace function public.config_liga_por_defecto() returns jsonb '
                 'language sql immutable as $b$ select %L::jsonb $b$', v_def);
end $do$;
-- Y las ligas que ya existen
update public.ligas l set config = pesos_por_rareza(l.config) where true;
drop function public.pesos_por_rareza(jsonb);

/* ── Permisos ───────────────────────────────────────────────────────────── */
revoke execute on function public.sortear_carta_libre(uuid, jsonb, uuid[], text, date), public.rango_rareza(text)
  from public, anon, authenticated;
revoke execute on function public.slr_admin_guardar_coleccion(text, uuid, jsonb), public.slr_admin_borrar_coleccion(text, uuid, uuid) from public;
grant execute on function public.slr_admin_guardar_coleccion(text, uuid, jsonb), public.slr_admin_borrar_coleccion(text, uuid, uuid) to anon, authenticated;
