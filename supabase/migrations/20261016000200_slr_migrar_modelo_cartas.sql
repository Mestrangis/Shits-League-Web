-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — migración de las cartas al modelo nuevo (OK de Marcos, 16/10/2026)
--
-- 1. Colecciones por palabra común al final del nombre; la carta se queda con
--    lo que va delante: Down (naranja), Dormidito (morado), Seductor (rojo),
--    Muerto (negro) y Cazatiburones (azul). Sin emblema todavía.
-- 2. Tipos: las antiguas «únicas» pasan a grupo (Abisal, El Pozo, La Familia,
--    La Obra, Los Feministas, Seguratas, Sísifo) o a especial (Cenicero de
--    Mateo). Inquina sigue siendo trío. Se quita 'unica' del CHECK.
-- 3. Generador: el tope de stats es 101 para todos los tipos (antes dependía
--    del tipo; el tipo no da ventajas). generar_stats y js/slr/generador.js.
-- Solo el catálogo común (liga_prueba_id null). No cambia stats, valor ni
-- rareza de ninguna carta (solo nombre, colección y tipo).
-- ═══════════════════════════════════════════════════════════════════════════

/* ── 1. Colecciones ──────────────────────────────────────────────────────── */
do $$
declare
  r      record;
  v_col  uuid;
  v_n    int;
begin
  for r in select * from (values
      ('Down', 'naranja', array['Javi', 'Jorge', 'Markis', 'Mateo', 'Nacho', 'Nico', 'Pablín', 'Vicu']),
      ('Dormidito', 'morado', array['Gonzalo', 'Jorge', 'Nico', 'Puebla']),
      ('Seductor', 'rojo', array['Jorge', 'Junquera', 'Nacho', 'Pablo']),
      ('Muerto', 'negro', array['Gonzalo', 'Jorge']),
      ('Cazatiburones', 'azul', array['Puebla', 'Vicu'])
    ) x(nombre, color, personas) loop
    insert into colecciones (nombre, color) values (r.nombre, r.color) returning id into v_col;
    update disenos_carta d
       set coleccion_id = v_col, nombre = left(d.nombre, length(d.nombre) - length(r.nombre) - 1)
     where d.liga_prueba_id is null and d.coleccion_id is null
       and d.nombre = any(array(select p || ' ' || r.nombre from unnest(r.personas) p));
    get diagnostics v_n = row_count;
    if v_n <> cardinality(r.personas) then
      raise exception 'Colección %: se esperaban % cartas y hay %', r.nombre, cardinality(r.personas), v_n;
    end if;
  end loop;
end $$;

/* ── 2. Tipos ────────────────────────────────────────────────────────────── */
update disenos_carta d set tipo = 'grupo'
 where d.tipo = 'unica' and d.nombre in ('Abisal', 'El Pozo', 'La Familia', 'La Obra', 'Los Feministas', 'Seguratas', 'Sísifo');
update disenos_carta d set tipo = 'especial' where d.tipo = 'unica' and d.nombre = 'Cenicero de Mateo';
do $$
begin
  if exists (select 1 from disenos_carta d where d.tipo = 'unica') then
    raise exception 'Quedan cartas de tipo unica: %', (select string_agg(d.nombre, ', ') from disenos_carta d where d.tipo = 'unica');
  end if;
end $$;
alter table public.disenos_carta drop constraint disenos_carta_tipo_check;
alter table public.disenos_carta add constraint disenos_carta_tipo_check
  check (tipo in ('individual', 'duo', 'trio', 'grupo', 'especial'));

/* ── 3. Generador: tope 101 para todos ───────────────────────────────────── */
-- generar_stats (de 20261016000000_slr_rareza_colecciones.sql)
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
  cap := 101;   -- igual para todos los tipos: el tipo no da ventajas (p_tipo se conserva por compatibilidad)
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

