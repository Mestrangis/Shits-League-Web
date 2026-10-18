-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — sorteo de rareza sin renormalizar por disponibilidad
--   Antes: la rareza se sorteaba solo entre las que tenían cartas libres en el
--   filtro (colección, perfil…), así que en un grupo pequeño lo bueno salía mucho
--   más (una colección con solo una épica libre daba la épica el 100 %).
--   Ahora: la rareza se sortea con los pesos completos del sobre (o de las
--   subastas) entre las que la progresión deja salir; si no queda ninguna carta
--   de esa rareza en el filtro, se baja a la inferior, y así sucesivamente. Si
--   tampoco hay nada por debajo, se sube a la siguiente que quede (solo da
--   AGOTADO si no queda ninguna carta). Vale para todo lo que sortea:
--   los cinco sobres, la candidata forzada del de elección y las subastas.
--   Las probabilidades de la tienda se calculan con la misma regla.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.sortear_carta(p_liga uuid, p_pesos jsonb, p_excluir uuid[], p_minima text,
                                                p_tanda_anterior date, p_filtro jsonb default null)
returns uuid
language plpgsql volatile set search_path = public, extensions as $$
declare
  v_orden  text[] := array['comun', 'rara', 'epica', 'legendaria'];
  v_cands  text[];      -- rarezas que se pueden sortear: peso > 0, desbloqueadas y ≥ mínima
  v_hay    text[];      -- de ésas, las que tienen alguna carta libre en el filtro
  v_rareza text;
  v_i      int;
  v_id     uuid;
  v_perfil text := p_filtro ->> 'perfil';
  v_col    uuid := (p_filtro ->> 'coleccion_id')::uuid;
begin
  perform asignar_cupos(p_liga);
  v_cands := array(select r from unnest(v_orden) r
                   where coalesce((p_pesos ->> r)::numeric, 0) > 0
                     and r = any(rarezas_desbloqueadas(p_liga))
                     and (p_minima is null or rango_rareza(r) >= rango_rareza(p_minima)));
  v_hay := array(
    select distinct d.rareza
    from cartas c join disenos_carta d on d.id = c.diseno_id
    where c.liga_id = p_liga and c.equipo_id is null and d.activo and c.reservada_por is null
      and d.rareza = any(v_cands)
      and c.id <> all(p_excluir)
      and en_bombo(p_liga, d.rareza, c.libera_jornada)
      and (v_perfil is null or d.perfil in (v_perfil, 'equilibrado'))
      and (v_col is null or d.coleccion_id = v_col)
      and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
      and (p_tanda_anterior is null or not exists (
            select 1 from subastas s where s.carta_id = c.id and s.liga_id = p_liga and s.tanda = p_tanda_anterior)));
  if cardinality(v_hay) = 0 then
    return null;
  end if;
  -- 1) La rareza, con los pesos completos (aunque no queden cartas de ella)
  select r into v_rareza from unnest(v_cands) r
  order by -ln(1 - random()) / (p_pesos ->> r)::numeric limit 1;
  -- 2) Si no queda de esa, la inferior que quede; si no hay ninguna por debajo, la superior
  if not (v_rareza = any(v_hay)) then
    v_i := array_position(v_cands, v_rareza);
    v_rareza := null;
    for k in reverse v_i - 1 .. 1 loop
      if v_cands[k] = any(v_hay) then v_rareza := v_cands[k]; exit; end if;
    end loop;
    if v_rareza is null then
      for k in v_i + 1 .. cardinality(v_cands) loop
        if v_cands[k] = any(v_hay) then v_rareza := v_cands[k]; exit; end if;
      end loop;
    end if;
  end if;
  -- 3) Una carta de esa rareza al azar
  select c.id into v_id
  from cartas c join disenos_carta d on d.id = c.diseno_id
  where c.liga_id = p_liga and c.equipo_id is null and d.activo and c.reservada_por is null and d.rareza = v_rareza
    and c.id <> all(p_excluir)
    and en_bombo(p_liga, d.rareza, c.libera_jornada)
    and (v_perfil is null or d.perfil in (v_perfil, 'equilibrado'))
    and (v_col is null or d.coleccion_id = v_col)
    and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
    and (p_tanda_anterior is null or not exists (
          select 1 from subastas s where s.carta_id = c.id and s.liga_id = p_liga and s.tanda = p_tanda_anterior))
  order by random()
  limit 1
  for update of c;
  return v_id;
end $$;

-- Probabilidad de cada rareza para la primera carta, con la misma regla: pesos
-- completos entre las desbloqueadas y, si no hay de una, a la inferior (o la superior)
create function public.probabilidades_sobre(p_pesos jsonb, p_disp jsonb, p_desb text[]) returns jsonb
language plpgsql immutable as $$
declare
  v_orden text[] := array['comun', 'rara', 'epica', 'legendaria'];
  v_cands text[] := array(select r from unnest(v_orden) r where coalesce((p_pesos ->> r)::numeric, 0) > 0 and r = any(p_desb));
  v_hay   text[] := array(select r from unnest(v_cands) r where coalesce((p_disp ->> r)::int, 0) > 0);
  v_total numeric := (select sum((p_pesos ->> r)::numeric) from unnest(v_cands) r);
  v_res   jsonb := '{}';
  v_dest  text;
  i       int;
  k       int;
begin
  if cardinality(v_hay) = 0 or coalesce(v_total, 0) = 0 then
    return '{}';
  end if;
  for i in 1 .. cardinality(v_cands) loop
    v_dest := null;
    if v_cands[i] = any(v_hay) then v_dest := v_cands[i];
    else
      for k in reverse i - 1 .. 1 loop if v_cands[k] = any(v_hay) then v_dest := v_cands[k]; exit; end if; end loop;
      if v_dest is null then
        for k in i + 1 .. cardinality(v_cands) loop if v_cands[k] = any(v_hay) then v_dest := v_cands[k]; exit; end if; end loop;
      end if;
    end if;
    v_res := jsonb_set(v_res, array[v_dest], to_jsonb(coalesce((v_res ->> v_dest)::numeric, 0) + (p_pesos ->> v_cands[i])::numeric / v_total));
  end loop;
  return (select jsonb_object_agg(key, round(value::numeric, 4)) from jsonb_each_text(v_res));
end $$;

create or replace function public.sobre_tienda(p_liga uuid, t tipos_sobre, p_col uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_filtro  jsonb := case when t.tipo = 'coleccion' then jsonb_build_object('coleccion_id', p_col) end;
  v_disp    jsonb;
  v_total   int;
  v_perfil  jsonb := '{}';
  v_agotado boolean;
  p         text;
  n         int;
begin
  v_disp := case when t.tipo = 'coleccion' and p_col is null then '{}'::jsonb else disponibles_sobre(p_liga, t.pesos, v_filtro) end;
  v_total := (select coalesce(sum(value::int), 0) from jsonb_each_text(v_disp));
  v_agotado := v_total < t.cartas;
  if t.tipo = 'posicion' then
    foreach p in array array['portero', 'defensa', 'control', 'atacante'] loop
      n := (select coalesce(sum(value::int), 0) from jsonb_each_text(disponibles_sobre(p_liga, t.pesos, jsonb_build_object('perfil', p))));
      v_perfil := v_perfil || jsonb_build_object(p, n);
    end loop;
    v_agotado := not exists (select 1 from jsonb_each_text(v_perfil) where value::int >= 1);
  end if;
  return jsonb_build_object(
    'tipo', t.tipo, 'nombre', t.nombre, 'descripcion', t.descripcion, 'cartas', t.cartas,
    'precio', t.precios[tramo_precio(p_liga)], 'precios', to_jsonb(t.precios), 'pesos', t.pesos,
    'probabilidades', probabilidades_sobre(t.pesos, v_disp, rarezas_desbloqueadas(p_liga)), 'imagen_url', t.imagen_url,
    'activo', t.activo, 'orden', t.orden, 'propio', t.liga_id is not null,
    'agotado', v_agotado, 'quedan', v_total, 'por_perfil', case when t.tipo = 'posicion' then v_perfil end);
end $$;

-- Modo pruebas: sortea n veces (sin dar ninguna carta) y cuenta las rarezas
create function public.slr_prueba_sorteo(token text, liga_id uuid, pesos jsonb, filtro jsonb default null,
                                         minima text default null, n int default 1000) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_liga uuid := slr_prueba_sorteo.liga_id;
  v_res  jsonb := '{}';
  v_c    uuid;
  v_r    text;
begin
  perform exigir_modo_beta(sesion_usuario(slr_prueba_sorteo.token), v_liga);
  if n not between 1 and 20000 then
    raise exception 'n entre 1 y 20.000' using errcode = 'P0001';
  end if;
  for i in 1 .. n loop
    v_c := sortear_carta(v_liga, pesos, '{}', minima, null, filtro);
    v_r := coalesce((select d.rareza from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = v_c), 'ninguna');
    v_res := jsonb_set(v_res, array[v_r], to_jsonb(coalesce((v_res ->> v_r)::int, 0) + 1));
  end loop;
  return v_res;
end $$;

revoke execute on function public.probabilidades_sobre(jsonb, jsonb, text[]) from public, anon, authenticated;
revoke execute on function public.slr_prueba_sorteo(text, uuid, jsonb, jsonb, text, int) from public;
grant execute on function public.slr_prueba_sorteo(text, uuid, jsonb, jsonb, text, int) to anon, authenticated;
