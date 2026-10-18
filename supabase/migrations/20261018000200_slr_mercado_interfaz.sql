-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — pestaña Mercado (fase 3)
--   slr_mercado añade: plantilla (para «Haz hueco»), motivo de cierre del
--   mercado, estado de la progresión, impuesto de compraventa y venta al banco.
-- ═══════════════════════════════════════════════════════════════════════════

-- Por qué está cerrado el mercado (null: abierto)
create function public.motivo_cierre(p_liga uuid) returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_estado text;
begin
  select l.estado into v_estado from ligas l where l.id = p_liga;
  if v_estado = 'pausada' then return 'pausa'; end if;
  if v_estado in ('entre_temporadas', 'terminada') then return 'entre_temporadas'; end if;
  if alineaciones_cerradas(p_liga) then return 'jornada'; end if;
  return null;
end $$;
revoke execute on function public.motivo_cierre(uuid) from public, anon, authenticated;

create or replace function public.slr_mercado(token text, liga_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_mercado.token);
  v_liga    uuid := slr_mercado.liga_id;
  v_eq      equipos := equipo_en_liga(v_usuario, v_liga);
begin
  perform asignar_cupos(v_liga);
  return jsonb_build_object(
    'equipo_id', v_eq.id,
    'saldo', (select e.saldo from equipos e where e.id = v_eq.id),
    'plantilla', jsonb_build_object('ocupada', plantilla_ocupada(v_eq.id), 'maxima', plantilla_maxima(v_liga)),
    'cerrado', motivo_cierre(v_liga),
    'progresion', estado_progresion(v_liga),
    'impuesto', coalesce((config_liga(v_liga) ->> 'impuesto_compraventa')::numeric, 0.05),
    'venta_banco', coalesce((config_liga(v_liga) ->> 'venta_banco')::numeric, 0.6),
    'subastas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'carta', carta_json(s.carta_id), 'abre_en', s.abre_en, 'cierra_en', s.cierra_en,
               'puja_minima', valor_carta(s.carta_id),
               'mi_puja', (select p.importe from pujas p where p.subasta_id = s.id and p.equipo_id = v_eq.id))
             order by s.cierra_en, s.id)
      from subastas s where s.liga_id = v_liga and s.estado = 'abierta'), '[]'),
    'ventas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'carta', carta_json(v.carta_id), 'precio', v.precio,
               'vendedor', jsonb_build_object('equipo_id', v.vendedor_id, 'usuario', nombre_dueno(v.vendedor_id)),
               'mia', v.vendedor_id = v_eq.id, 'creada_en', v.creada_en)
             order by v.creada_en desc)
      from ventas v where v.liga_id = v_liga and v.estado = 'activa'), '[]'),
    'ofertas_enviadas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'carta', carta_json(o.carta_id), 'importe', o.importe, 'para_id', o.para_id,
               'para', nombre_dueno(o.para_id), 'contraoferta_de', o.contraoferta_de, 'caduca_en', o.caduca_en)
             order by o.creada_en desc)
      from ofertas o where o.de_id = v_eq.id and o.estado = 'pendiente'), '[]'),
    'ofertas_recibidas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'carta', carta_json(o.carta_id), 'importe', o.importe, 'de_id', o.de_id,
               'de', nombre_dueno(o.de_id), 'contraoferta_de', o.contraoferta_de, 'caduca_en', o.caduca_en)
             order by o.creada_en desc)
      from ofertas o where o.para_id = v_eq.id and o.estado = 'pendiente'), '[]'),
    'intercambios', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'enviado', i.de_id = v_eq.id, 'de_id', i.de_id, 'para_id', i.para_id,
               'de', nombre_dueno(i.de_id), 'para', nombre_dueno(i.para_id),
               'cartas_de', (select jsonb_agg(carta_json(x)) from unnest(i.cartas_de) x),
               'cartas_para', (select jsonb_agg(carta_json(x)) from unnest(i.cartas_para) x),
               'monedas_de', i.monedas_de, 'monedas_para', i.monedas_para, 'caduca_en', i.caduca_en)
             order by i.creado_en desc)
      from intercambios i where (i.de_id = v_eq.id or i.para_id = v_eq.id) and i.estado = 'pendiente'), '[]')
  );
end $$;
