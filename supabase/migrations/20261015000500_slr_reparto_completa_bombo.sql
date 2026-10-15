-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — reparto entre temporadas: completar desde el bombo
--
-- repartir_desde_album (de 20261013020400_slr_reparto_safeupdate.sql) repartía
-- solo cartas de los álbumes: con un catálogo corto, las compartidas no llegan
-- para todos y algún equipo empezaba la temporada con menos de 11. Ahora, tras
-- el reparto y el ajuste de valor:
--   5. Los equipos a los que les faltan cartas se completan con individuales
--      libres del bombo de plantilla inicial (sin el % caro), por rondas (una
--      carta por equipo y ronda, en orden sorteado con la semilla) y en cada una
--      la más barata que deja su valor dentro del ±10 % del objetivo
--      proporcional; si ninguna lo deja dentro, la que más se acerca.
--      Esas cartas entran en su álbum (vía 'inicial').
--   6. Si aun así no llega, se queda con las que haya y recibe el aviso
--      «plantilla_incompleta» (el mismo que al unirse).
-- El resultado de cada equipo añade `del_bombo`.
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_meta     numeric;
  v_res      jsonb := '[]';
  e          uuid;
  r          record;
  v_a uuid; v_b uuid; v_va int; v_vb int; v_bdif numeric; v_dif numeric;
begin
  create temp table if not exists pg_temp.slr_reparto (
    carta_id uuid primary key, valor int, cara boolean, interesados uuid[], equipo uuid, orden text,
    del_bombo boolean not null default false
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

  -- 5) Completar desde el bombo: individuales libres sin el % caro que no se
  -- haya llevado nadie en el reparto (las del álbum que sobran también valen)
  insert into pg_temp.slr_reparto (carta_id, valor, cara, interesados, orden, del_bombo)
  select c.id, d.valor, false, '{}', hash_semilla(p_semilla, 'bombo:' || c.id), true
  from cartas c join disenos_carta d on d.id = c.diseno_id
  where c.liga_id = p_liga and c.equipo_id is null and c.reservada_por is null
    and d.activo and d.tipo = 'individual' and not (d.id = any(v_caras))
  on conflict (carta_id) do update set del_bombo = true where slr_reparto.equipo is null;

  for v_ronda in 1..v_n_obj loop
    v_progreso := false;
    for e in select x from unnest(v_eqs) x order by hash_semilla(p_semilla, 'bombo:' || v_ronda || ':' || x) loop
      v_idx := array_position(v_eqs, e);
      continue when v_cnt[v_idx] >= v_n_obj;
      v_meta := v_obj * (v_cnt[v_idx] + 1) / v_n_obj;      -- objetivo proporcional con una carta más
      select rp.carta_id, rp.valor into v_pick, v_valor
      from pg_temp.slr_reparto rp
      where rp.equipo is null and rp.del_bombo
      order by (abs(v_sum[v_idx] + rp.valor - v_meta) <= v_tol * v_meta) desc,
               case when abs(v_sum[v_idx] + rp.valor - v_meta) <= v_tol * v_meta then rp.valor::numeric
                    else abs(v_sum[v_idx] + rp.valor - v_meta) end,
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

  update cartas c
     set equipo_id = rp.equipo, blindada_hasta = now() + v_blindaje, multiplicador_clausula = 1.5, adquirida_en = now()
    from pg_temp.slr_reparto rp
   where rp.carta_id = c.id and rp.equipo is not null;

  -- Las del bombo entran en el álbum de su nuevo dueño
  insert into album (usuario_id, liga_id, diseno_id, via_adquisicion)
  select eq.usuario_id, p_liga, c.diseno_id, 'inicial'
  from pg_temp.slr_reparto rp join cartas c on c.id = rp.carta_id join equipos eq on eq.id = rp.equipo
  where rp.del_bombo and rp.equipo is not null
  on conflict do nothing;

  for v_idx in 1..cardinality(v_eqs) loop
    v_res := v_res || jsonb_build_object(
      'equipo_id', v_eqs[v_idx], 'cartas', v_cnt[v_idx], 'valor_total', v_sum[v_idx],
      'caras', (select count(*) from pg_temp.slr_reparto rp where rp.equipo = v_eqs[v_idx] and rp.cara),
      'compartidas', (select count(*) from pg_temp.slr_reparto rp where rp.equipo = v_eqs[v_idx] and cardinality(rp.interesados) > 1),
      'del_bombo', (select count(*) from pg_temp.slr_reparto rp where rp.equipo = v_eqs[v_idx] and rp.del_bombo),
      'dentro', abs(v_sum[v_idx] - v_obj) <= v_tol * v_obj);
    -- 6) Aun así corto: se queda con las que haya y se le avisa
    if v_cnt[v_idx] < v_n_obj then
      perform notificar(v_eqs[v_idx], 'plantilla_incompleta', aviso_plantilla_corta(p_liga, v_cnt[v_idx]),
                        jsonb_build_object('cartas', v_cnt[v_idx]));
    end if;
  end loop;
  return jsonb_build_object('objetivo', round(v_obj, 2), 'equipos', v_res);
end $$;
