-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — edición múltiple de cartas (modo pruebas, solo el admin)
--
-- slr_admin_editar_disenos(token, liga_id, ids, cambios, solo_contar): aplica
-- los mismos cambios a varias cartas en una sola transacción. Los triggers de
-- disenos_carta hacen el resto: validan, recalculan el valor, la rareza (que
-- sale del tier) y generan lo que se pida regenerar.
--
-- cambios (jsonb, solo las claves que cambian):
--   coleccion_id  uuid o null (quitar la colección)
--   color         de la paleta o null («el de la colección»)
--   tipo, tier, perfil, acabado
--   activo        true / false (no desde una liga de prueba)
--   regenerar_stats, regenerar_poderes  true: semilla nueva y se generan
--     con el tier y el perfil (nuevos, si también cambian)
--
-- Alcance, como slr_admin_guardar_diseno: desde una liga de prueba, solo las
-- cartas creadas en ella; desde una liga real, las del catálogo común.
-- Si alguna carta falla (p. ej. un nombre repetido al cambiar de colección),
-- no se aplica nada y se dice por qué.
--
-- solo_contar = true hace los cambios dentro de un bloque que se deshace al
-- final: el resumen (cuántas cambian, qué, y algunos ejemplos con valor y
-- rareza ya recalculados) es exactamente lo que pasará al aplicar.
-- ═══════════════════════════════════════════════════════════════════════════

create function public.slr_admin_editar_disenos(token text, liga_id uuid, ids uuid[], cambios jsonb, solo_contar boolean default false)
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
    if k not in ('coleccion_id', 'color', 'tipo', 'tier', 'perfil', 'acabado', 'activo', 'regenerar_stats', 'regenerar_poderes') then
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
             ((a ->> 'ata')::int, (a ->> 'def')::int, (a ->> 'con')::int) is distinct from (d.ata, d.def, d.con) as c_stats,
             (a -> 'poderes') is distinct from d.poderes as c_poderes,
             (a ->> 'valor')::int is distinct from d.valor as c_valor,
             d.tier, d.rareza, d.ata, d.def, d.con
      from disenos_carta d join jsonb_each(v_antes) e(id, a) on e.id::uuid = d.id
    ), marcadas as (
      select *, c_col or c_color or c_tipo or c_tier or c_perfil or c_acabado or c_activo or c_stats or c_poderes as alguno from comp
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
         'valor', nullif(count(*) filter (where c_valor), 0))),
      'ejemplos', coalesce((select jsonb_agg(x.texto) from (
         select m.nombre || ': ' || concat_ws(', ',
           case when m.c_tier then format('tier %s→%s', m.a ->> 'tier', m.tier) end,
           case when m.c_rareza then format('%s→%s', m.a ->> 'rareza', m.rareza) end,
           case when m.c_stats then format('stats %s/%s/%s→%s/%s/%s', m.a ->> 'ata', m.a ->> 'def', m.a ->> 'con', m.ata, m.def, m.con) end,
           case when m.c_poderes then 'poderes nuevos' end,
           case when m.c_valor then format('valor %s→%s', m.a ->> 'valor', m.valor) end,
           case when m.c_col then 'colección' end, case when m.c_color then 'color' end, case when m.c_tipo then 'tipo' end,
           case when m.c_perfil then 'perfil' end, case when m.c_acabado then 'acabado' end,
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
    v_desc := (select string_agg(x, ', ') from (select format('%s', k) x from jsonb_object_keys(v_c) k) y);
    perform apuntar_historial(v_liga, 'admin_edicion_multiple',
      format('Edición múltiple de %s cartas (%s) · modo pruebas', cardinality(v_ids), v_desc),
      jsonb_build_object('cartas', cardinality(v_ids), 'cambios', v_c));
  end if;
  return v_res;
end $$;

revoke execute on function public.slr_admin_editar_disenos(text, uuid, uuid[], jsonb, boolean) from public;
grant execute on function public.slr_admin_editar_disenos(text, uuid, uuid[], jsonb, boolean) to anon, authenticated;
