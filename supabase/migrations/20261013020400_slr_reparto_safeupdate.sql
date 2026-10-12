-- SLR paso 4 · corrección: Supabase activa pg-safeupdate para las peticiones de
-- la API, que rechaza un DELETE sin WHERE incluso sobre una tabla temporal.
-- repartir_desde_album vaciaba pg_temp.slr_reparto así; ahora lleva «where true».
create or replace function public.repartir_desde_album(p_liga uuid, p_semilla bigint) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_cfg      jsonb := config_liga(p_liga);
  v_n_obj    int := coalesce((v_cfg ->> 'plantilla_inicial')::int, 11);
  v_tol      numeric := coalesce((v_cfg ->> 'plantilla_inicial_tolerancia')::numeric, 0.10);
  v_blindaje interval := make_interval(days => coalesce((v_cfg ->> 'blindaje_dias')::int, 7));
  v_caras    uuid[] := individuales_caras(coalesce((v_cfg ->> 'plantilla_inicial_excluir_top')::numeric, 0.20));
  v_obj      numeric := objetivo_plantilla(p_liga);
  v_eqs      uuid[];
  v_cnt      int[];
  v_sum      numeric[];
  v_progreso boolean;
  v_pick     uuid;
  v_valor    int;
  v_idx      int;
  v_res      jsonb := '[]';
  e          uuid;
  r          record;
  v_a uuid; v_b uuid; v_va int; v_vb int; v_bdif numeric; v_dif numeric;
begin
  create temp table if not exists pg_temp.slr_reparto (
    carta_id uuid primary key, valor int, cara boolean, interesados uuid[], equipo uuid, orden text
  ) on commit drop;
  delete from pg_temp.slr_reparto where true;

  insert into pg_temp.slr_reparto (carta_id, valor, cara, interesados, orden)
  select c.id, d.valor, d.id = any(v_caras), array_agg(distinct eq.id), hash_semilla(p_semilla, 'carta:' || c.id)
  from cartas c
  join disenos_carta d on d.id = c.diseno_id
  join album a on a.liga_id = c.liga_id and a.diseno_id = c.diseno_id
  join equipos eq on eq.liga_id = c.liga_id and eq.usuario_id = a.usuario_id
  where c.liga_id = p_liga and d.tipo = 'individual' and d.activo
  group by c.id, d.valor, d.id;

  v_eqs := array(select eq.id from equipos eq where eq.liga_id = p_liga order by eq.id);
  v_cnt := array_fill(0, array[cardinality(v_eqs)]);
  v_sum := array_fill(0::numeric, array[cardinality(v_eqs)]);

  for v_nivel in 1..4 loop
    for v_ronda in 1..v_n_obj loop
      v_progreso := false;
      -- En cada ronda, un orden de equipos sorteado con la semilla
      for e in select x from unnest(v_eqs) x order by hash_semilla(p_semilla, 'ronda:' || v_nivel || ':' || v_ronda || ':' || x) loop
        v_idx := array_position(v_eqs, e);
        continue when v_cnt[v_idx] >= v_n_obj;
        select rp.carta_id, rp.valor into v_pick, v_valor
        from pg_temp.slr_reparto rp
        where rp.equipo is null and e = any(rp.interesados)
          and rp.cara = (v_nivel >= 3)
          and (cardinality(rp.interesados) = 1) = (v_nivel in (1, 3))
        order by case when v_nivel >= 3 then rp.valor::numeric
                      else abs(v_sum[v_idx] + rp.valor - v_obj * (v_cnt[v_idx] + 1) / v_n_obj) end,
                 rp.orden
        limit 1;
        continue when v_pick is null;
        update pg_temp.slr_reparto rp set equipo = e where rp.carta_id = v_pick;
        v_cnt[v_idx] := v_cnt[v_idx] + 1;
        v_sum[v_idx] := v_sum[v_idx] + v_valor;
        v_progreso := true;
        v_pick := null;
      end loop;
      exit when not v_progreso;
    end loop;
  end loop;

  -- Ajuste de valor: intercambios dentro del mismo nivel (exclusiva por
  -- exclusiva, compartida por compartida, sin tocar las caras)
  for v_idx in 1..cardinality(v_eqs) loop
    e := v_eqs[v_idx];
    for paso in 1..30 loop
      exit when v_cnt[v_idx] = 0 or abs(v_sum[v_idx] - v_obj) <= v_tol * v_obj;
      v_bdif := abs(v_sum[v_idx] - v_obj);
      v_a := null;
      for r in
        select x.carta_id as a, x.valor as va, y.carta_id as b, y.valor as vb
        from pg_temp.slr_reparto x
        join pg_temp.slr_reparto y on y.equipo is null and e = any(y.interesados) and not y.cara
                                  and (cardinality(y.interesados) = 1) = (cardinality(x.interesados) = 1)
        where x.equipo = e and not x.cara
      loop
        v_dif := abs(v_sum[v_idx] - r.va + r.vb - v_obj);
        if v_dif < v_bdif then v_bdif := v_dif; v_a := r.a; v_b := r.b; v_va := r.va; v_vb := r.vb; end if;
      end loop;
      exit when v_a is null;
      update pg_temp.slr_reparto rp set equipo = null where rp.carta_id = v_a;
      update pg_temp.slr_reparto rp set equipo = e where rp.carta_id = v_b;
      v_sum[v_idx] := v_sum[v_idx] - v_va + v_vb;
    end loop;
  end loop;

  update cartas c
     set equipo_id = rp.equipo, blindada_hasta = now() + v_blindaje, multiplicador_clausula = 1.5, adquirida_en = now()
    from pg_temp.slr_reparto rp
   where rp.carta_id = c.id and rp.equipo is not null;

  for v_idx in 1..cardinality(v_eqs) loop
    v_res := v_res || jsonb_build_object(
      'equipo_id', v_eqs[v_idx], 'cartas', v_cnt[v_idx], 'valor_total', v_sum[v_idx],
      'caras', (select count(*) from pg_temp.slr_reparto rp where rp.equipo = v_eqs[v_idx] and rp.cara),
      'compartidas', (select count(*) from pg_temp.slr_reparto rp where rp.equipo = v_eqs[v_idx] and cardinality(rp.interesados) > 1),
      'dentro', abs(v_sum[v_idx] - v_obj) <= v_tol * v_obj);
  end loop;
  return jsonb_build_object('objetivo', round(v_obj, 2), 'equipos', v_res);
end $$;
