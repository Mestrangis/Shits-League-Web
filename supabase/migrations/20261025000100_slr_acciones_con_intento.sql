-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — acciones que mueven dinero o cartas, sin duplicados
--   (repaso de rendimiento, fase 4; lo mismo que se hizo con los sobres)
--   Con mala conexión, una acción puede llegar dos veces (un reintento, un toque
--   doble que se cuela). Ahora el cliente manda cada intento con un identificador:
--   · slr_con_intento(token, intento, funcion, args): hace la acción la primera
--     vez y guarda lo que devolvió; si el mismo intento llega otra vez, devuelve
--     eso mismo SIN volver a hacerla (ni cobrar, ni mover cartas).
--   · Solo las funciones de la lista (las que mueven dinero o cartas); cada una
--     con sus comprobaciones de siempre (la sesión, el mercado abierto, el saldo…).
--   · Si la acción falla, no se guarda nada (todo va en la misma transacción): el
--     reintento la vuelve a probar.
--   Un candado por intento (pg_advisory_xact_lock) ordena las peticiones repetidas.
--   Las funciones de siempre se siguen pudiendo llamar directamente (versiones
--   viejas de la app).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.intentos_accion (
  intento    uuid primary key,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  funcion    text not null,
  respuesta  jsonb,
  creado_en  timestamptz not null default now()
);
create index intentos_accion_creado_idx on public.intentos_accion(creado_en);
alter table public.intentos_accion enable row level security;   -- privada: sin políticas

create function public.slr_con_intento(token text, intento uuid, funcion text, args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_con_intento.token);
  v_t       text := slr_con_intento.token;
  v_fn      text := slr_con_intento.funcion;
  a         jsonb := coalesce(slr_con_intento.args, '{}'::jsonb);
  v_prev    intentos_accion;
  v_res     jsonb;
begin
  if slr_con_intento.intento is null then
    raise exception 'Falta el identificador del intento' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('accion:' || slr_con_intento.intento::text, 0));
  select * into v_prev from intentos_accion i where i.intento = slr_con_intento.intento;
  if found then
    if v_prev.usuario_id <> v_usuario or v_prev.funcion <> v_fn then
      raise exception 'Ese intento no es tuyo' using errcode = 'P0001';
    end if;
    return v_prev.respuesta;   -- lo mismo que la primera vez, sin repetir la acción
  end if;

  case v_fn
    when 'slr_comprar_venta'        then v_res := slr_comprar_venta(v_t, (a ->> 'venta_id')::uuid);
    when 'slr_poner_en_venta'       then v_res := slr_poner_en_venta(v_t, (a ->> 'carta_id')::uuid, (a ->> 'precio')::int);
    when 'slr_retirar_venta'        then v_res := to_jsonb(slr_retirar_venta(v_t, (a ->> 'venta_id')::uuid));
    when 'slr_pujar'                then v_res := slr_pujar(v_t, (a ->> 'subasta_id')::uuid, (a ->> 'importe')::int);
    when 'slr_retirar_puja'         then v_res := to_jsonb(slr_retirar_puja(v_t, (a ->> 'subasta_id')::uuid));
    when 'slr_ofertar'              then v_res := slr_ofertar(v_t, (a ->> 'carta_id')::uuid, (a ->> 'importe')::int);
    when 'slr_retirar_oferta'       then v_res := to_jsonb(slr_retirar_oferta(v_t, (a ->> 'oferta_id')::uuid));
    when 'slr_aceptar_oferta'       then v_res := slr_aceptar_oferta(v_t, (a ->> 'oferta_id')::uuid);
    when 'slr_rechazar_oferta'      then v_res := to_jsonb(slr_rechazar_oferta(v_t, (a ->> 'oferta_id')::uuid));
    when 'slr_contraofertar'        then v_res := slr_contraofertar(v_t, (a ->> 'oferta_id')::uuid, (a ->> 'importe')::int);
    when 'slr_proponer_intercambio' then v_res := slr_proponer_intercambio(v_t, (a ->> 'equipo_id')::uuid,
                                                   coalesce(array(select jsonb_array_elements_text(a -> 'cartas_mias'))::uuid[], '{}'),
                                                   coalesce(array(select jsonb_array_elements_text(a -> 'cartas_suyas'))::uuid[], '{}'),
                                                   coalesce((a ->> 'monedas_mias')::int, 0), coalesce((a ->> 'monedas_suyas')::int, 0));
    when 'slr_aceptar_intercambio'  then v_res := slr_aceptar_intercambio(v_t, (a ->> 'intercambio_id')::uuid);
    when 'slr_rechazar_intercambio' then v_res := to_jsonb(slr_rechazar_intercambio(v_t, (a ->> 'intercambio_id')::uuid));
    when 'slr_retirar_intercambio'  then v_res := to_jsonb(slr_retirar_intercambio(v_t, (a ->> 'intercambio_id')::uuid));
    when 'slr_pagar_clausula'       then v_res := slr_pagar_clausula(v_t, (a ->> 'carta_id')::uuid);
    when 'slr_cambiar_clausula'     then v_res := slr_cambiar_clausula(v_t, (a ->> 'carta_id')::uuid, (a ->> 'multiplicador')::numeric);
    when 'slr_vender_banco'         then v_res := slr_vender_banco(v_t, (a ->> 'carta_id')::uuid);
    when 'slr_hacer_hueco'          then v_res := slr_hacer_hueco(v_t, (a ->> 'liga_id')::uuid,
                                                   coalesce(array(select jsonb_array_elements_text(a -> 'cartas'))::uuid[], '{}'));
    when 'slr_admin_mover_carta'    then v_res := slr_admin_mover_carta(v_t, (a ->> 'liga_id')::uuid, (a ->> 'carta_id')::uuid, (a ->> 'equipo_id')::uuid);
    else
      raise exception 'Esta acción no se puede hacer así: %', coalesce(v_fn, '(vacía)') using errcode = 'P0001';
  end case;

  insert into intentos_accion (intento, usuario_id, funcion, respuesta)
  values (slr_con_intento.intento, v_usuario, v_fn, v_res);
  -- De vez en cuando, fuera los de hace más de una semana (ya no se van a repetir)
  if random() < 0.02 then
    delete from intentos_accion i where i.creado_en < now() - interval '7 days';
  end if;
  return v_res;
end $$;

revoke all on function public.slr_con_intento(text, uuid, text, jsonb) from public;
grant execute on function public.slr_con_intento(text, uuid, text, jsonb) to anon, authenticated;
