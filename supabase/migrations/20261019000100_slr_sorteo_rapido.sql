-- sortear_carta: la progresión se calcula una vez por sorteo (antes, en_bombo la
-- recalculaba para cada carta libre). La rareza ya está entre las desbloqueadas.
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
  v_activa boolean;
  v_j      int;
  v_desb   text[];
begin
  perform asignar_cupos(p_liga);
  -- La progresión, una vez por sorteo (no por cada carta)
  v_activa := progresion_activa(p_liga);
  v_j := jornada_progresion(p_liga);
  v_desb := rarezas_desbloqueadas(p_liga);
  v_cands := array(select r from unnest(v_orden) r
                   where coalesce((p_pesos ->> r)::numeric, 0) > 0
                     and r = any(v_desb)
                     and (p_minima is null or rango_rareza(r) >= rango_rareza(p_minima)));
  v_hay := array(
    select distinct d.rareza
    from cartas c join disenos_carta d on d.id = c.diseno_id
    where c.liga_id = p_liga and c.equipo_id is null and d.activo and c.reservada_por is null
      and d.rareza = any(v_cands)
      and c.id <> all(p_excluir)
      and (not v_activa or c.libera_jornada is null or c.libera_jornada <= v_j)
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
    and (not v_activa or c.libera_jornada is null or c.libera_jornada <= v_j)
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
