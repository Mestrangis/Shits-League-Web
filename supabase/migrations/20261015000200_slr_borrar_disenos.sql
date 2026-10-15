-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — borrar diseños del catálogo (modo pruebas)
--
-- slr_admin_borrar_disenos(token, filtro, solo_contar): borra diseños y todo lo
-- que depende de ellos en una sola transacción. Desde el Table Editor no se
-- puede (cartas y album los referencian) y «Reiniciar beta» volvería a crear
-- sus ejemplares mientras sigan en el catálogo.
--
-- filtro (jsonb):
--   liga_id   liga desde la que actúa el admin (obligatorio; modo pruebas)
--   beta      true → solo diseños con beta = true
--   sin_foto  true → solo diseños sin imagen_url
--   ids       [uuid, …] → solo esos diseños
--   Hace falta beta = true o ids: un filtro vacío no borra el catálogo entero.
--
-- Alcance, igual que slr_admin_guardar_diseno:
--   · desde una liga de prueba, solo las cartas creadas en ella (liga_prueba_id);
--   · desde una liga real, las del catálogo común (liga_prueba_id null), y el
--     usuario tiene que ser admin con modo pruebas de TODAS las ligas reales,
--     porque los ejemplares de un diseño común están en todas.
--
-- Orden del borrado: alineaciones (huecos, banquillo y capitán), pujas,
-- subastas, ventas, ofertas, intercambios y sobres que tengan alguno de sus
-- ejemplares, historial y notificaciones que los mencionen, álbum, ejemplares
-- (cartas) y por último los diseños. Los partidos jugados no se tocan: guardan
-- su propia copia congelada de las alineaciones.
--
-- solo_contar = true hace el borrado completo dentro de un bloque que se
-- deshace al final: el recuento es exactamente el que saldría al borrar.
-- ═══════════════════════════════════════════════════════════════════════════

create function public.slr_admin_borrar_disenos(token text, filtro jsonb, solo_contar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario  uuid := sesion_usuario(slr_admin_borrar_disenos.token);
  v_f        jsonb := coalesce(slr_admin_borrar_disenos.filtro, '{}');
  v_liga     uuid := nullif(v_f ->> 'liga_id', '')::uuid;
  v_prueba   boolean;
  v_beta     boolean := coalesce((v_f ->> 'beta')::boolean, false);
  v_sin_foto boolean := coalesce((v_f ->> 'sin_foto')::boolean, false);
  v_ids      uuid[] := case when jsonb_typeof(v_f -> 'ids') = 'array'
                            then array(select jsonb_array_elements_text(v_f -> 'ids')::uuid) end;
  v_disenos  uuid[];
  v_cartas   uuid[];
  v_res      jsonb := '{}';
  v_n        int;
  r          record;
  UUID_RE    constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if v_liga is null then
    raise exception 'Falta la liga (filtro.liga_id)' using errcode = 'P0001';
  end if;
  perform exigir_modo_beta(v_usuario, v_liga);
  if not v_beta and coalesce(cardinality(v_ids), 0) = 0 then
    raise exception 'El filtro tiene que pedir beta = true o una lista de ids' using errcode = 'P0001';
  end if;
  select l.es_prueba into v_prueba from ligas l where l.id = v_liga;

  -- Diseños afectados (bloqueados hasta el final)
  v_disenos := array(
    select d.id from disenos_carta d
    where (not v_beta or d.beta)
      and (not v_sin_foto or coalesce(trim(d.imagen_url), '') = '')
      and (v_ids is null or d.id = any(v_ids))
      and case when v_prueba then d.liga_prueba_id = v_liga else d.liga_prueba_id is null end
    order by d.id
    for update);

  -- Los diseños comunes tienen ejemplar en todas las ligas reales: hay que ser
  -- admin con modo pruebas de todas ellas
  if not v_prueba and cardinality(v_disenos) > 0 then
    for r in select l.id from ligas l where not l.es_prueba loop
      perform exigir_modo_beta(v_usuario, r.id);
    end loop;
  end if;

  v_cartas := array(select c.id from cartas c where c.diseno_id = any(v_disenos) order by c.id for update);

  v_res := jsonb_build_object(
    'solo_contar', solo_contar,
    'disenos', cardinality(v_disenos),
    'cartas', cardinality(v_cartas),
    'por_tipo', coalesce((select jsonb_object_agg(x.tipo, x.n) from (
        select d.tipo, count(*) n from disenos_carta d where d.id = any(v_disenos) group by d.tipo) x), '{}'),
    'quedan', (select count(*) from disenos_carta d
               where not (d.id = any(v_disenos))
                 and case when v_prueba then d.liga_prueba_id = v_liga else d.liga_prueba_id is null end),
    'equipos', coalesce((select jsonb_agg(jsonb_build_object(
        'equipo_id', e.id, 'nombre', e.nombre, 'liga_id', e.liga_id,
        'pierde', x.pierde, 'quedan', plantilla_ocupada(e.id) - x.pierde) order by e.nombre)
      from (select c.equipo_id, count(*)::int pierde from cartas c
            where c.id = any(v_cartas) and c.equipo_id is not null group by c.equipo_id) x
      join equipos e on e.id = x.equipo_id), '[]'));

  if cardinality(v_disenos) = 0 then
    return v_res || jsonb_build_object('borrado', '{}'::jsonb);
  end if;

  begin
    -- Alineaciones: cada ejemplar fuera de huecos, banquillo y capitanía
    v_n := 0;
    for r in select a.equipo_id, array_agg(distinct m.x[1]::uuid) cartas
             from alineaciones a,
                  regexp_matches(a.huecos::text || ' ' || coalesce(a.banquillo::text, '') || ' ' || coalesce(a.capitan_id::text, ''),
                                 UUID_RE, 'g') as m(x)
             where m.x[1]::uuid = any(v_cartas)
             group by a.equipo_id loop
      for i in 1 .. cardinality(r.cartas) loop
        perform quitar_de_alineacion(r.equipo_id, r.cartas[i]);
      end loop;
      v_n := v_n + 1;
    end loop;
    v_res := jsonb_set(v_res, '{borrado}', jsonb_build_object('alineaciones', v_n));

    delete from pujas p using subastas s where p.subasta_id = s.id and s.carta_id = any(v_cartas);
    get diagnostics v_n = row_count;  v_res := jsonb_set(v_res, '{borrado,pujas}', to_jsonb(v_n));
    delete from subastas s where s.carta_id = any(v_cartas);
    get diagnostics v_n = row_count;  v_res := jsonb_set(v_res, '{borrado,subastas}', to_jsonb(v_n));
    delete from ventas v where v.carta_id = any(v_cartas);
    get diagnostics v_n = row_count;  v_res := jsonb_set(v_res, '{borrado,ventas}', to_jsonb(v_n));
    delete from ofertas o where o.carta_id = any(v_cartas);
    get diagnostics v_n = row_count;  v_res := jsonb_set(v_res, '{borrado,ofertas}', to_jsonb(v_n));
    delete from intercambios i where i.cartas_de && v_cartas or i.cartas_para && v_cartas;
    get diagnostics v_n = row_count;  v_res := jsonb_set(v_res, '{borrado,intercambios}', to_jsonb(v_n));
    -- Las demás cartas que reservaba un sobre de elección quedan libres (on delete set null)
    delete from sobres_abiertos s where s.cartas && v_cartas or s.elegida = any(v_cartas);
    get diagnostics v_n = row_count;  v_res := jsonb_set(v_res, '{borrado,sobres}', to_jsonb(v_n));

    -- Historial y avisos que mencionan un ejemplar o un diseño borrado
    delete from historial h
    where h.datos is not null and exists (
      select 1 from regexp_matches(h.datos::text, UUID_RE, 'g') as m(x)
      where m.x[1]::uuid = any(v_cartas) or m.x[1]::uuid = any(v_disenos));
    get diagnostics v_n = row_count;  v_res := jsonb_set(v_res, '{borrado,historial}', to_jsonb(v_n));
    delete from notificaciones n
    where n.datos is not null and exists (
      select 1 from regexp_matches(n.datos::text, UUID_RE, 'g') as m(x)
      where m.x[1]::uuid = any(v_cartas) or m.x[1]::uuid = any(v_disenos));
    get diagnostics v_n = row_count;  v_res := jsonb_set(v_res, '{borrado,notificaciones}', to_jsonb(v_n));

    delete from album a where a.diseno_id = any(v_disenos);
    get diagnostics v_n = row_count;  v_res := jsonb_set(v_res, '{borrado,album}', to_jsonb(v_n));
    delete from cartas c where c.id = any(v_cartas);
    get diagnostics v_n = row_count;  v_res := jsonb_set(v_res, '{borrado,cartas}', to_jsonb(v_n));
    delete from disenos_carta d where d.id = any(v_disenos);
    get diagnostics v_n = row_count;  v_res := jsonb_set(v_res, '{borrado,disenos}', to_jsonb(v_n));

    -- Aviso a los dueños que pierden cartas
    for r in select (x ->> 'equipo_id')::uuid equipo, (x ->> 'pierde')::int pierde
             from jsonb_array_elements(v_res -> 'equipos') x loop
      perform notificar(r.equipo, 'cartas_retiradas',
        format('El administrador ha retirado del catálogo %s %s de tu plantilla (modo pruebas)',
               r.pierde, case when r.pierde = 1 then 'carta' else 'cartas' end), '{}');
    end loop;
    perform apuntar_historial(v_liga, 'admin_disenos_borrados',
      format('El administrador borra %s %s del catálogo (modo pruebas)', cardinality(v_disenos),
             case when cardinality(v_disenos) = 1 then 'carta' else 'cartas' end),
      jsonb_build_object('disenos', cardinality(v_disenos), 'cartas', cardinality(v_cartas)));

    if solo_contar then
      raise exception using errcode = 'SLRSC';   -- deshace el bloque; el recuento se queda
    end if;
  exception when sqlstate 'SLRSC' then
    null;
  end;

  return v_res;
end $$;

revoke execute on function public.slr_admin_borrar_disenos(text, jsonb, boolean) from public;
grant execute on function public.slr_admin_borrar_disenos(text, jsonb, boolean) to anon, authenticated;
