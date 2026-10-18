-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — mercado (fase 5): avisos con destino y Modo pruebas
--   · Los avisos de ofertas, contraofertas e intercambios llevan al Mercado →
--     Ofertas; los de subastas perdidas o anuladas, al Mercado → Subastas.
--   · Modo pruebas: resolver ya todas las subastas abiertas y abrir una tanda
--     nueva al momento (sin esperar a la medianoche).
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.notificaciones drop constraint notificaciones_destino_tipo_check;
alter table public.notificaciones add constraint notificaciones_destino_tipo_check
  check (destino_tipo in ('carta', 'partido', 'movimientos', 'liga', 'mercado'));

create or replace function public.destino_notificacion(p_tipo text, p_datos jsonb, p_usuario uuid, p_liga uuid,
                                            out destino_tipo text, out destino_id text)
language plpgsql stable set search_path = public, extensions as $$
declare
  v_equipo uuid := (select e.id from equipos e where e.usuario_id = p_usuario and e.liga_id = p_liga);
begin
  case
    -- Dinero cobrado
    when p_tipo in ('venta_completada', 'clausula_recibida') then
      destino_tipo := 'movimientos'; destino_id := v_equipo::text;
    -- Algo que responder o que mirar en el Mercado: la sub-pestaña
    when p_tipo in ('oferta_recibida', 'contraoferta', 'intercambio_recibido') then
      destino_tipo := 'mercado'; destino_id := 'ofertas';
    when p_tipo in ('intercambio_aceptado', 'intercambio_rechazado', 'intercambio_caducado', 'intercambio_cancelado') then
      destino_tipo := 'mercado'; destino_id := 'ofertas';
    when p_tipo in ('subasta_perdida', 'puja_anulada', 'subasta_cancelada') then
      destino_tipo := 'mercado'; destino_id := 'subastas';
    -- Carta recibida, perdida o con algo pendiente
    when p_tipo in ('eleccion_automatica', 'subasta_ganada',
                    'oferta_aceptada', 'oferta_rechazada', 'oferta_caducada',
                    'oferta_cancelada', 'venta_cancelada', 'admin_carta')
         and p_datos ? 'carta_id' then
      destino_tipo := 'carta'; destino_id := p_datos ->> 'carta_id';
    -- Partido de liga publicado: su crónica (si descansó, sus cobros o la liga)
    when p_tipo = 'jornada_publicada' then
      select 'partido', p.id::text into destino_tipo, destino_id
      from partidos p
      where p.jornada_id = (p_datos ->> 'jornada_id')::uuid and v_equipo in (p.local_id, p.visitante_id)
      limit 1;
      if destino_tipo is null then
        if coalesce((p_datos ->> 'cobrado')::numeric, 0) > 0 then
          destino_tipo := 'movimientos'; destino_id := v_equipo::text;
        else
          destino_tipo := 'liga'; destino_id := p_liga::text;
        end if;
      end if;
    -- Pausa, reanudación, temporada, aplazamiento: el estado de la liga
    when p_tipo in ('liga_pausada', 'liga_reanudada', 'temporada_iniciada', 'temporada_terminada', 'jornada_aplazada') then
      destino_tipo := 'liga'; destino_id := p_liga::text;
    else
      null;   -- intercambios y demás: sin destino
  end case;
end $$;

-- Avisos ya guardados de ofertas e intercambios: también al Mercado
update notificaciones n set destino_tipo = 'mercado',
       destino_id = case when n.tipo in ('subasta_perdida', 'puja_anulada', 'subasta_cancelada') then 'subastas' else 'ofertas' end
 where n.tipo in ('oferta_recibida', 'contraoferta', 'intercambio_recibido', 'intercambio_aceptado', 'intercambio_rechazado',
                  'intercambio_caducado', 'intercambio_cancelado', 'subasta_perdida', 'puja_anulada', 'subasta_cancelada');

-- ── Modo pruebas ──────────────────────────────────────────────────────────
create function public.slr_admin_resolver_subastas(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_liga uuid := slr_admin_resolver_subastas.liga_id;
  r      record;
  v_n    int := 0;
  v_gan  int := 0;
  v_res  jsonb;
begin
  perform exigir_modo_beta(sesion_usuario(slr_admin_resolver_subastas.token), v_liga);
  for r in select s.id from subastas s where s.liga_id = v_liga and s.estado = 'abierta' order by s.cierra_en, s.id loop
    v_res := resolver_subasta(r.id);
    v_n := v_n + 1;
    if v_res ->> 'ganador_id' is not null then v_gan := v_gan + 1; end if;
  end loop;
  perform apuntar_historial(v_liga, 'admin_subastas', format('Subastas resueltas a mano: %s (%s con ganador) · modo pruebas', v_n, v_gan), '{}');
  return jsonb_build_object('resueltas', v_n, 'con_ganador', v_gan);
end $$;

create function public.slr_admin_tanda_nueva(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_liga  uuid := slr_admin_tanda_nueva.liga_id;
  v_fecha date;
  v_n     int;
begin
  perform exigir_modo_beta(sesion_usuario(slr_admin_tanda_nueva.token), v_liga);
  if liga_bloqueada(v_liga) then
    raise exception 'El mercado está cerrado: no se puede abrir una tanda' using errcode = 'P0001';
  end if;
  -- Una tanda por fecha: la siguiente libre a partir de hoy
  v_fecha := greatest((now() at time zone coalesce(config_liga(v_liga) ->> 'zona_horaria', 'Europe/Madrid'))::date,
                      coalesce((select max(t.fecha) + 1 from tandas_mercado t where t.liga_id = v_liga), '-infinity'::date));
  v_n := abrir_tanda(v_liga, v_fecha, now());
  return jsonb_build_object('fecha', v_fecha, 'cartas', v_n);
end $$;

revoke execute on function public.slr_admin_resolver_subastas(text, uuid), public.slr_admin_tanda_nueva(text, uuid) from public;
grant execute on function public.slr_admin_resolver_subastas(text, uuid), public.slr_admin_tanda_nueva(text, uuid) to anon, authenticated;
