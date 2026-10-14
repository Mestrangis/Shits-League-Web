-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — ajustes del generador y de la interfaz (cartas por tiers)
-- 1. generar_stats: si la stat principal pasa del tope del tipo, el portero
--    estrecha primero la distancia DEF–CON para que su ATA siga siendo la más
--    baja posible (antes acababa con ATA alta en el tier S). Gemelo de
--    js/slr/generador.js.
-- ═══════════════════════════════════════════════════════════════════════════

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
  cap := case p_tipo when 'duo' then 99 when 'trio' then 100 when 'unica' then 101 else 97 end;
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
