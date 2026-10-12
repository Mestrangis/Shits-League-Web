-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — mercado (paso 3), parte 2: operaciones slr_*
-- Todas: token → sesión → liga de la carta → preparar_operacion (miembro, mercado
-- abierto, sin elección pendiente) → propiedad → hueco → dinero (mover_dinero).
-- Los parámetros se copian a v_* para no chocar con nombres de columna.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Venta al banco (8.2): 60 % del valor, la carta queda libre ──────────
create function public.slr_vender_banco(token text, carta_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_vender_banco.token);
  v_carta   uuid := slr_vender_banco.carta_id;
  v_liga    uuid := liga_de_carta(v_carta);
  v_eq      equipos := preparar_operacion(v_usuario, v_liga);
  v_precio  int;
  v_saldo   int;
begin
  perform 1 from cartas c where c.id = v_carta and c.equipo_id = v_eq.id for update;
  if not found then
    raise exception 'Esa carta no es tuya' using errcode = 'P0001';
  end if;
  v_precio := round(valor_carta(v_carta) * coalesce((config_liga(v_liga) ->> 'venta_banco')::numeric, 0.60))::int;
  perform liberar_carta(v_carta);
  v_saldo := mover_dinero(v_eq.id, v_precio, 'venta_banco', 'carta:' || v_carta);
  perform apuntar_historial(v_liga, 'venta_banco',
    format('%s ha vendido a %s al banco por %s', nombre_dueno(v_eq.id), nombre_carta(v_carta), fmt(v_precio)),
    jsonb_build_object('equipo_id', v_eq.id, 'carta_id', v_carta, 'precio', v_precio));
  return jsonb_build_object('carta_id', v_carta, 'precio', v_precio, 'saldo', v_saldo);
end $$;

-- ── 2. Ventas entre usuarios (8.3): precio fijo, 95 % al vendedor ──────────
create function public.slr_poner_en_venta(token text, carta_id uuid, precio int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_poner_en_venta.token);
  v_carta   uuid := slr_poner_en_venta.carta_id;
  v_precio  int := slr_poner_en_venta.precio;
  v_liga    uuid := liga_de_carta(v_carta);
  v_eq      equipos := preparar_operacion(v_usuario, v_liga);
  v_venta   uuid;
begin
  if v_precio is null or v_precio < 1 then
    raise exception 'El precio tiene que ser un número entero mayor que 0' using errcode = 'P0001';
  end if;
  perform 1 from cartas c where c.id = v_carta and c.equipo_id = v_eq.id for update;
  if not found then
    raise exception 'Esa carta no es tuya' using errcode = 'P0001';
  end if;
  if exists (select 1 from ventas v where v.carta_id = v_carta and v.estado = 'activa') then
    raise exception 'Esa carta ya está en venta' using errcode = 'P0001';
  end if;
  insert into ventas (liga_id, carta_id, vendedor_id, precio) values (v_liga, v_carta, v_eq.id, v_precio)
  returning id into v_venta;
  perform apuntar_historial(v_liga, 'en_venta',
    format('%s pone a la venta a %s por %s', nombre_dueno(v_eq.id), nombre_carta(v_carta), fmt(v_precio)),
    jsonb_build_object('equipo_id', v_eq.id, 'carta_id', v_carta, 'venta_id', v_venta, 'precio', v_precio));
  return jsonb_build_object('venta_id', v_venta, 'carta_id', v_carta, 'precio', v_precio);
end $$;

create function public.slr_retirar_venta(token text, venta_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_retirar_venta.token);
  v_id      uuid := slr_retirar_venta.venta_id;
  v_venta   ventas;
begin
  select * into v_venta from ventas v where v.id = v_id for update;
  if not found or v_venta.estado <> 'activa' then
    raise exception 'Esa venta no existe o ya no está activa' using errcode = 'P0001';
  end if;
  perform preparar_operacion(v_usuario, v_venta.liga_id);
  if v_venta.vendedor_id <> (equipo_en_liga(v_usuario, v_venta.liga_id)).id then
    raise exception 'Esa venta no es tuya' using errcode = 'P0001';
  end if;
  update ventas v set estado = 'retirada', resuelta_en = now() where v.id = v_id;
  return true;
end $$;

create function public.slr_comprar_venta(token text, venta_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_comprar_venta.token);
  v_id      uuid := slr_comprar_venta.venta_id;
  v_venta   ventas;
  v_eq      equipos;
  v_cobra   int;
  v_saldo   int;
begin
  select * into v_venta from ventas v where v.id = v_id for update;
  if not found or v_venta.estado <> 'activa' then
    raise exception 'Esa venta no existe o ya no está activa' using errcode = 'P0001';
  end if;
  v_eq := preparar_operacion(v_usuario, v_venta.liga_id);
  if v_venta.vendedor_id = v_eq.id then
    raise exception 'No puedes comprar tu propia carta' using errcode = 'P0001';
  end if;
  perform 1 from cartas c where c.id = v_venta.carta_id and c.equipo_id = v_venta.vendedor_id for update;
  if not found then
    raise exception 'La carta ya no es del vendedor' using errcode = 'P0001';
  end if;
  perform exigir_hueco(v_eq.id, 1);

  v_saldo := mover_dinero(v_eq.id, -v_venta.precio, 'compra', 'venta:' || v_id);
  v_cobra := round(v_venta.precio * (1 - coalesce((config_liga(v_venta.liga_id) ->> 'impuesto_compraventa')::numeric, 0.05)))::int;
  perform mover_dinero(v_venta.vendedor_id, v_cobra, 'venta', 'venta:' || v_id);
  update ventas v set estado = 'vendida', comprador_id = v_eq.id, resuelta_en = now() where v.id = v_id;
  perform adquirir_carta(v_venta.carta_id, v_eq.id, 'compra');

  perform apuntar_historial(v_venta.liga_id, 'compra',
    format('%s compra a %s a %s por %s', nombre_dueno(v_eq.id), nombre_carta(v_venta.carta_id),
           nombre_dueno(v_venta.vendedor_id), fmt(v_venta.precio)),
    jsonb_build_object('equipo_id', v_eq.id, 'vendedor_id', v_venta.vendedor_id, 'carta_id', v_venta.carta_id,
                       'precio', v_venta.precio));
  perform notificar(v_venta.vendedor_id, 'venta_completada',
    format('%s ha comprado a %s: recibes %s', nombre_dueno(v_eq.id), nombre_carta(v_venta.carta_id), fmt(v_cobra)),
    jsonb_build_object('venta_id', v_id, 'carta_id', v_venta.carta_id, 'importe', v_cobra));
  return jsonb_build_object('carta_id', v_venta.carta_id, 'precio', v_venta.precio, 'saldo', v_saldo);
end $$;

-- ── 3. Ofertas directas (8.3): caducan a las 48 h, saldo al aceptar ────────
-- Una oferta va de un equipo (de) a otro (para). Si la carta es de "para", "de"
-- compra; si es de "de" (contraoferta del dueño), compra "para". Acepta "para".
create function public.slr_ofertar(token text, carta_id uuid, importe int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_ofertar.token);
  v_carta   uuid := slr_ofertar.carta_id;
  v_importe int := slr_ofertar.importe;
  v_liga    uuid := liga_de_carta(v_carta);
  v_eq      equipos := preparar_operacion(v_usuario, v_liga);
  v_dueno   uuid;
  v_oferta  uuid;
  v_caduca  timestamptz;
begin
  if v_importe is null or v_importe < 1 then
    raise exception 'El importe tiene que ser un número entero mayor que 0' using errcode = 'P0001';
  end if;
  select c.equipo_id into v_dueno from cartas c where c.id = v_carta;
  if v_dueno is null then
    raise exception 'Esa carta no tiene dueño: no se le pueden hacer ofertas' using errcode = 'P0001';
  end if;
  if v_dueno = v_eq.id then
    raise exception 'No puedes ofertar por tu propia carta' using errcode = 'P0001';
  end if;
  v_caduca := now() + make_interval(hours => coalesce((config_liga(v_liga) ->> 'caducidad_ofertas_horas')::int, 48));
  insert into ofertas (liga_id, carta_id, de_id, para_id, importe, caduca_en)
  values (v_liga, v_carta, v_eq.id, v_dueno, v_importe, v_caduca) returning id into v_oferta;
  perform notificar(v_dueno, 'oferta_recibida',
    format('%s ofrece %s por %s', nombre_dueno(v_eq.id), fmt(v_importe), nombre_carta(v_carta)),
    jsonb_build_object('oferta_id', v_oferta, 'carta_id', v_carta, 'importe', v_importe));
  return jsonb_build_object('oferta_id', v_oferta, 'caduca_en', v_caduca);
end $$;

-- Una oferta caducada que la tarea aún no ha procesado se marca como caducada al
-- intentar aceptarla y devuelve {error} (sin lanzar, para que el cambio persista)
create function public.slr_aceptar_oferta(token text, oferta_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario   uuid := sesion_usuario(slr_aceptar_oferta.token);
  v_id        uuid := slr_aceptar_oferta.oferta_id;
  v_of        ofertas;
  v_eq        equipos;
  v_dueno     uuid;
  v_comprador uuid;
  v_cobra     int;
begin
  select * into v_of from ofertas o where o.id = v_id for update;
  if not found then
    raise exception 'Esa oferta no existe' using errcode = 'P0001';
  end if;
  v_eq := preparar_operacion(v_usuario, v_of.liga_id);
  if v_of.para_id <> v_eq.id then
    raise exception 'Esa oferta no es para ti' using errcode = 'P0001';
  end if;
  if v_of.estado = 'pendiente' and v_of.caduca_en <= now() then
    update ofertas o set estado = 'caducada' where o.id = v_id;
    return jsonb_build_object('error', 'La oferta ha caducado');
  end if;
  if v_of.estado = 'caducada' then
    raise exception 'La oferta ha caducado' using errcode = 'P0001';
  end if;
  if v_of.estado <> 'pendiente' then
    raise exception 'La oferta ya no está pendiente (%)', v_of.estado using errcode = 'P0001';
  end if;

  select c.equipo_id into v_dueno from cartas c where c.id = v_of.carta_id for update;
  if v_dueno is null or v_dueno not in (v_of.de_id, v_of.para_id) then
    raise exception 'La carta ya no es de ninguno de los dos' using errcode = 'P0001';
  end if;
  v_comprador := case when v_dueno = v_of.para_id then v_of.de_id else v_of.para_id end;
  perform exigir_hueco(v_comprador, 1);

  begin
    perform mover_dinero(v_comprador, -v_of.importe, 'oferta_compra', 'oferta:' || v_id);
  exception when sqlstate 'P0001' then
    raise exception 'El comprador no tiene saldo suficiente para pagar %', fmt(v_of.importe) using errcode = 'P0001';
  end;
  v_cobra := round(v_of.importe * (1 - coalesce((config_liga(v_of.liga_id) ->> 'impuesto_compraventa')::numeric, 0.05)))::int;
  perform mover_dinero(v_dueno, v_cobra, 'oferta_venta', 'oferta:' || v_id);
  update ofertas o set estado = 'aceptada' where o.id = v_id;
  perform adquirir_carta(v_of.carta_id, v_comprador, 'compra');

  perform apuntar_historial(v_of.liga_id, 'compra',
    format('%s compra a %s a %s por %s', nombre_dueno(v_comprador), nombre_carta(v_of.carta_id),
           nombre_dueno(v_dueno), fmt(v_of.importe)),
    jsonb_build_object('equipo_id', v_comprador, 'vendedor_id', v_dueno, 'carta_id', v_of.carta_id,
                       'precio', v_of.importe, 'oferta_id', v_id));
  perform notificar(v_of.de_id, 'oferta_aceptada',
    format('%s ha aceptado la oferta de %s por %s', nombre_dueno(v_of.para_id), fmt(v_of.importe), nombre_carta(v_of.carta_id)),
    jsonb_build_object('oferta_id', v_id, 'carta_id', v_of.carta_id));
  return jsonb_build_object('oferta_id', v_id, 'carta_id', v_of.carta_id, 'comprador_id', v_comprador,
                            'precio', v_of.importe, 'vendedor_recibe', v_cobra);
end $$;

create function public.slr_rechazar_oferta(token text, oferta_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_rechazar_oferta.token);
  v_id      uuid := slr_rechazar_oferta.oferta_id;
  v_of      ofertas;
begin
  select * into v_of from ofertas o where o.id = v_id for update;
  if not found or v_of.estado <> 'pendiente' then
    raise exception 'Esa oferta no existe o ya no está pendiente' using errcode = 'P0001';
  end if;
  if v_of.para_id <> (equipo_en_liga(v_usuario, v_of.liga_id)).id then
    raise exception 'Esa oferta no es para ti' using errcode = 'P0001';
  end if;
  update ofertas o set estado = 'rechazada' where o.id = v_id;
  perform notificar(v_of.de_id, 'oferta_rechazada',
    format('%s ha rechazado tu oferta de %s por %s', nombre_dueno(v_of.para_id), fmt(v_of.importe), nombre_carta(v_of.carta_id)),
    jsonb_build_object('oferta_id', v_id, 'carta_id', v_of.carta_id));
  return true;
end $$;

create function public.slr_retirar_oferta(token text, oferta_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_retirar_oferta.token);
  v_id      uuid := slr_retirar_oferta.oferta_id;
  v_of      ofertas;
begin
  select * into v_of from ofertas o where o.id = v_id for update;
  if not found or v_of.estado <> 'pendiente' then
    raise exception 'Esa oferta no existe o ya no está pendiente' using errcode = 'P0001';
  end if;
  if v_of.de_id <> (equipo_en_liga(v_usuario, v_of.liga_id)).id then
    raise exception 'Esa oferta no es tuya' using errcode = 'P0001';
  end if;
  update ofertas o set estado = 'cancelada' where o.id = v_id;
  return true;
end $$;

create function public.slr_contraofertar(token text, oferta_id uuid, importe int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_contraofertar.token);
  v_id      uuid := slr_contraofertar.oferta_id;
  v_importe int := slr_contraofertar.importe;
  v_of      ofertas;
  v_eq      equipos;
  v_nueva   uuid;
  v_caduca  timestamptz;
begin
  if v_importe is null or v_importe < 1 then
    raise exception 'El importe tiene que ser un número entero mayor que 0' using errcode = 'P0001';
  end if;
  select * into v_of from ofertas o where o.id = v_id for update;
  if not found then
    raise exception 'Esa oferta no existe' using errcode = 'P0001';
  end if;
  v_eq := preparar_operacion(v_usuario, v_of.liga_id);
  if v_of.para_id <> v_eq.id then
    raise exception 'Esa oferta no es para ti' using errcode = 'P0001';
  end if;
  if v_of.estado <> 'pendiente' or v_of.caduca_en <= now() then
    raise exception 'La oferta ya no está pendiente o ha caducado' using errcode = 'P0001';
  end if;
  v_caduca := now() + make_interval(hours => coalesce((config_liga(v_of.liga_id) ->> 'caducidad_ofertas_horas')::int, 48));
  update ofertas o set estado = 'contraofertada' where o.id = v_id;
  insert into ofertas (liga_id, carta_id, de_id, para_id, importe, contraoferta_de, caduca_en)
  values (v_of.liga_id, v_of.carta_id, v_eq.id, v_of.de_id, v_importe, v_id, v_caduca)
  returning id into v_nueva;
  perform notificar(v_of.de_id, 'contraoferta',
    format('%s responde con una contraoferta de %s por %s', nombre_dueno(v_eq.id), fmt(v_importe), nombre_carta(v_of.carta_id)),
    jsonb_build_object('oferta_id', v_nueva, 'contraoferta_de', v_id, 'carta_id', v_of.carta_id, 'importe', v_importe));
  return jsonb_build_object('oferta_id', v_nueva, 'contraoferta_de', v_id, 'caduca_en', v_caduca);
end $$;

-- ── 4. Intercambios (8.4) ──────────────────────────────────────────────────
-- Cartas por cartas (al menos una por lado) y monedas opcionales en ambos lados.
-- Quien recibe monedas pierde el 5 %. Al aceptar se comprueban plantillas y saldos.
create function public.slr_proponer_intercambio(
  token text, equipo_id uuid, cartas_mias uuid[], cartas_suyas uuid[],
  monedas_mias int default 0, monedas_suyas int default 0
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_proponer_intercambio.token);
  v_para    uuid := slr_proponer_intercambio.equipo_id;
  v_mias    uuid[] := coalesce(slr_proponer_intercambio.cartas_mias, '{}');
  v_suyas   uuid[] := coalesce(slr_proponer_intercambio.cartas_suyas, '{}');
  v_m_mias  int := coalesce(slr_proponer_intercambio.monedas_mias, 0);
  v_m_suyas int := coalesce(slr_proponer_intercambio.monedas_suyas, 0);
  v_liga    uuid;
  v_eq      equipos;
  v_id      uuid;
  v_caduca  timestamptz;
begin
  select e.liga_id into v_liga from equipos e where e.id = v_para;
  if v_liga is null then
    raise exception 'Ese equipo no existe' using errcode = 'P0001';
  end if;
  v_eq := preparar_operacion(v_usuario, v_liga);
  if v_para = v_eq.id then
    raise exception 'No puedes proponerte un intercambio a ti mismo' using errcode = 'P0001';
  end if;
  if cardinality(v_mias) = 0 or cardinality(v_suyas) = 0 then
    raise exception 'Un intercambio necesita al menos una carta de cada lado' using errcode = 'P0001';
  end if;
  if v_m_mias < 0 or v_m_suyas < 0 then
    raise exception 'Las monedas no pueden ser negativas' using errcode = 'P0001';
  end if;
  if (select count(distinct x) from unnest(v_mias || v_suyas) x) <> cardinality(v_mias) + cardinality(v_suyas) then
    raise exception 'Hay cartas repetidas en el intercambio' using errcode = 'P0001';
  end if;
  if (select count(*) from cartas c where c.id = any(v_mias) and c.equipo_id = v_eq.id) <> cardinality(v_mias) then
    raise exception 'Alguna de las cartas que ofreces no es tuya' using errcode = 'P0001';
  end if;
  if (select count(*) from cartas c where c.id = any(v_suyas) and c.equipo_id = v_para) <> cardinality(v_suyas) then
    raise exception 'Alguna de las cartas que pides no es de ese equipo' using errcode = 'P0001';
  end if;
  v_caduca := now() + make_interval(hours => coalesce((config_liga(v_liga) ->> 'caducidad_ofertas_horas')::int, 48));
  insert into intercambios (liga_id, de_id, para_id, cartas_de, cartas_para, monedas_de, monedas_para, caduca_en)
  values (v_liga, v_eq.id, v_para, v_mias, v_suyas, v_m_mias, v_m_suyas, v_caduca)
  returning id into v_id;
  perform notificar(v_para, 'intercambio_recibido',
    format('%s te propone un intercambio', nombre_dueno(v_eq.id)), jsonb_build_object('intercambio_id', v_id));
  return jsonb_build_object('intercambio_id', v_id, 'caduca_en', v_caduca);
end $$;

create function public.slr_aceptar_intercambio(token text, intercambio_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_aceptar_intercambio.token);
  v_id      uuid := slr_aceptar_intercambio.intercambio_id;
  v_in      intercambios;
  v_eq      equipos;
  v_imp     numeric;
  v_recibe_de   int;   -- lo que cobra "de" de las monedas de "para"
  v_recibe_para int;   -- lo que cobra "para" de las monedas de "de"
  v_c       uuid;
begin
  select * into v_in from intercambios i where i.id = v_id for update;
  if not found then
    raise exception 'Ese intercambio no existe' using errcode = 'P0001';
  end if;
  v_eq := preparar_operacion(v_usuario, v_in.liga_id);
  if v_in.para_id <> v_eq.id then
    raise exception 'Ese intercambio no es para ti' using errcode = 'P0001';
  end if;
  if v_in.estado <> 'pendiente' or v_in.caduca_en <= now() then
    raise exception 'El intercambio ya no está pendiente o ha caducado' using errcode = 'P0001';
  end if;

  perform 1 from cartas c where c.id = any(v_in.cartas_de || v_in.cartas_para) for update;
  if (select count(*) from cartas c where c.id = any(v_in.cartas_de) and c.equipo_id = v_in.de_id) <> cardinality(v_in.cartas_de)
     or (select count(*) from cartas c where c.id = any(v_in.cartas_para) and c.equipo_id = v_in.para_id) <> cardinality(v_in.cartas_para) then
    update intercambios i set estado = 'cancelado' where i.id = v_id;
    return jsonb_build_object('error', 'Alguna carta ya no es de quien la ofrecía: el intercambio se ha cancelado');
  end if;

  -- Plantillas tras el intercambio
  perform exigir_hueco(v_in.para_id, cardinality(v_in.cartas_de), cardinality(v_in.cartas_para));
  begin
    perform exigir_hueco(v_in.de_id, cardinality(v_in.cartas_para), cardinality(v_in.cartas_de));
  exception when sqlstate 'P0001' then
    raise exception 'La plantilla de % pasaría de % cartas', nombre_dueno(v_in.de_id), plantilla_maxima(v_in.liga_id)
      using errcode = 'P0001';
  end;

  -- Dinero: primero los cobros y después los pagos; si alguien queda en negativo, no se hace nada
  v_imp := coalesce((config_liga(v_in.liga_id) ->> 'impuesto_compraventa')::numeric, 0.05);
  v_recibe_para := round(v_in.monedas_de * (1 - v_imp))::int;
  v_recibe_de := round(v_in.monedas_para * (1 - v_imp))::int;
  if v_recibe_para > 0 then perform mover_dinero(v_in.para_id, v_recibe_para, 'intercambio_cobra', 'intercambio:' || v_id); end if;
  if v_recibe_de > 0 then perform mover_dinero(v_in.de_id, v_recibe_de, 'intercambio_cobra', 'intercambio:' || v_id); end if;
  begin
    if v_in.monedas_de > 0 then perform mover_dinero(v_in.de_id, -v_in.monedas_de, 'intercambio_paga', 'intercambio:' || v_id); end if;
  exception when sqlstate 'P0001' then
    raise exception '% no tiene saldo suficiente para el intercambio', nombre_dueno(v_in.de_id) using errcode = 'P0001';
  end;
  begin
    if v_in.monedas_para > 0 then perform mover_dinero(v_in.para_id, -v_in.monedas_para, 'intercambio_paga', 'intercambio:' || v_id); end if;
  exception when sqlstate 'P0001' then
    raise exception 'No tienes saldo suficiente para el intercambio' using errcode = 'P0001';
  end;

  -- Cartas (la plantilla máxima se comprueba al final de la transacción: en
  -- mitad del cambio un equipo puede tener una carta de más un instante)
  update intercambios i set estado = 'aceptado' where i.id = v_id;
  set constraints cartas_plantilla_maxima deferred;
  foreach v_c in array v_in.cartas_de loop perform adquirir_carta(v_c, v_in.para_id, 'intercambio'); end loop;
  foreach v_c in array v_in.cartas_para loop perform adquirir_carta(v_c, v_in.de_id, 'intercambio'); end loop;

  perform apuntar_historial(v_in.liga_id, 'intercambio',
    format('%s y %s intercambian %s por %s', nombre_dueno(v_in.de_id), nombre_dueno(v_in.para_id),
      (select string_agg(nombre_carta(x), ', ') from unnest(v_in.cartas_de) x)
        || case when v_in.monedas_de > 0 then ' + ' || fmt(v_in.monedas_de) else '' end,
      (select string_agg(nombre_carta(x), ', ') from unnest(v_in.cartas_para) x)
        || case when v_in.monedas_para > 0 then ' + ' || fmt(v_in.monedas_para) else '' end),
    jsonb_build_object('intercambio_id', v_id, 'cartas', to_jsonb(v_in.cartas_de || v_in.cartas_para)));
  perform notificar(v_in.de_id, 'intercambio_aceptado',
    format('%s ha aceptado tu intercambio', nombre_dueno(v_in.para_id)), jsonb_build_object('intercambio_id', v_id));
  return jsonb_build_object('intercambio_id', v_id, 'de_recibe', v_recibe_de, 'para_recibe', v_recibe_para);
end $$;

create function public.slr_rechazar_intercambio(token text, intercambio_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_rechazar_intercambio.token);
  v_id      uuid := slr_rechazar_intercambio.intercambio_id;
  v_in      intercambios;
begin
  select * into v_in from intercambios i where i.id = v_id for update;
  if not found or v_in.estado <> 'pendiente' then
    raise exception 'Ese intercambio no existe o ya no está pendiente' using errcode = 'P0001';
  end if;
  if v_in.para_id <> (equipo_en_liga(v_usuario, v_in.liga_id)).id then
    raise exception 'Ese intercambio no es para ti' using errcode = 'P0001';
  end if;
  update intercambios i set estado = 'rechazado' where i.id = v_id;
  perform notificar(v_in.de_id, 'intercambio_rechazado',
    format('%s ha rechazado tu intercambio', nombre_dueno(v_in.para_id)), jsonb_build_object('intercambio_id', v_id));
  return true;
end $$;

create function public.slr_retirar_intercambio(token text, intercambio_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_retirar_intercambio.token);
  v_id      uuid := slr_retirar_intercambio.intercambio_id;
  v_in      intercambios;
begin
  select * into v_in from intercambios i where i.id = v_id for update;
  if not found or v_in.estado <> 'pendiente' then
    raise exception 'Ese intercambio no existe o ya no está pendiente' using errcode = 'P0001';
  end if;
  if v_in.de_id <> (equipo_en_liga(v_usuario, v_in.liga_id)).id then
    raise exception 'Ese intercambio no es tuyo' using errcode = 'P0001';
  end if;
  update intercambios i set estado = 'cancelado' where i.id = v_id;
  return true;
end $$;

-- ── 5. Cláusulas (8.5) ─────────────────────────────────────────────────────
create function public.slr_pagar_clausula(token text, carta_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario  uuid := sesion_usuario(slr_pagar_clausula.token);
  v_carta    uuid := slr_pagar_clausula.carta_id;
  v_liga     uuid := liga_de_carta(v_carta);
  v_eq       equipos := preparar_operacion(v_usuario, v_liga);
  v_c        cartas;
  v_importe  int;
  v_cobra    int;
  v_saldo    int;
begin
  select * into v_c from cartas c where c.id = v_carta for update;
  if v_c.equipo_id is null then
    raise exception 'Esa carta no tiene dueño: no tiene cláusula' using errcode = 'P0001';
  end if;
  if v_c.equipo_id = v_eq.id then
    raise exception 'No puedes pagar la cláusula de tu propia carta' using errcode = 'P0001';
  end if;
  if v_c.blindada_hasta is not null and v_c.blindada_hasta > now() then
    raise exception 'La carta está blindada hasta el %', to_char(v_c.blindada_hasta at time zone 'Europe/Madrid', 'DD/MM HH24:MI')
      using errcode = 'P0001';
  end if;
  perform exigir_hueco(v_eq.id, 1);

  v_importe := clausula_carta(v_carta);
  v_saldo := mover_dinero(v_eq.id, -v_importe, 'clausula_paga', 'carta:' || v_carta);
  v_cobra := round(v_importe * (1 - coalesce((config_liga(v_liga) -> 'clausula' ->> 'parte_banco')::numeric, 0.10)))::int;
  perform mover_dinero(v_c.equipo_id, v_cobra, 'clausula_cobra', 'carta:' || v_carta);
  perform adquirir_carta(v_carta, v_eq.id, 'clausula');

  perform apuntar_historial(v_liga, 'clausula',
    format('%s ha clausulado a %s por %s', nombre_dueno(v_eq.id), nombre_carta(v_carta), fmt(v_importe)),
    jsonb_build_object('equipo_id', v_eq.id, 'antiguo_id', v_c.equipo_id, 'carta_id', v_carta, 'precio', v_importe));
  perform notificar(v_c.equipo_id, 'clausula_recibida',
    format('%s ha pagado la cláusula de %s: recibes %s', nombre_dueno(v_eq.id), nombre_carta(v_carta), fmt(v_cobra)),
    jsonb_build_object('carta_id', v_carta, 'importe', v_cobra, 'clausula', v_importe));
  return jsonb_build_object('carta_id', v_carta, 'clausula', v_importe, 'antiguo_recibe', v_cobra, 'saldo', v_saldo);
end $$;

-- Multiplicador entre 1,5 y 3,0 en pasos de 0,1. Subir cuesta el 20 % del aumento
-- de cláusula (al banco); bajar es gratis.
create function public.slr_cambiar_clausula(token text, carta_id uuid, multiplicador numeric) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_cambiar_clausula.token);
  v_carta   uuid := slr_cambiar_clausula.carta_id;
  v_mult    numeric := slr_cambiar_clausula.multiplicador;
  v_liga    uuid := liga_de_carta(v_carta);
  v_eq      equipos := preparar_operacion(v_usuario, v_liga);
  v_cfg     jsonb := config_liga(v_liga) -> 'clausula';
  v_min     numeric := coalesce((v_cfg ->> 'multiplicador_min')::numeric, 1.5);
  v_max     numeric := coalesce((v_cfg ->> 'multiplicador_max')::numeric, 3.0);
  v_antes   int;
  v_despues int;
  v_coste   int := 0;
  v_saldo   int;
begin
  perform 1 from cartas c where c.id = v_carta and c.equipo_id = v_eq.id for update;
  if not found then
    raise exception 'Esa carta no es tuya' using errcode = 'P0001';
  end if;
  if v_mult is null or v_mult < v_min or v_mult > v_max or v_mult * 10 <> round(v_mult * 10) then
    raise exception 'El multiplicador tiene que estar entre % y % en pasos de 0,1', v_min, v_max using errcode = 'P0001';
  end if;
  v_antes := clausula_carta(v_carta);
  update cartas c set multiplicador_clausula = v_mult where c.id = v_carta;
  v_despues := clausula_carta(v_carta);
  if v_despues > v_antes then
    v_coste := round((v_despues - v_antes) * coalesce((v_cfg ->> 'coste_subida')::numeric, 0.20))::int;
    if v_coste > 0 then
      v_saldo := mover_dinero(v_eq.id, -v_coste, 'subir_clausula', 'carta:' || v_carta);
    end if;
  end if;
  return jsonb_build_object('carta_id', v_carta, 'multiplicador', v_mult, 'clausula_antes', v_antes,
                            'clausula', v_despues, 'coste', v_coste,
                            'saldo', coalesce(v_saldo, (select e.saldo from equipos e where e.id = v_eq.id)));
end $$;

-- ── 6. Subastas (8.1): puja ciega ──────────────────────────────────────────
create function public.slr_pujar(token text, subasta_id uuid, importe int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_pujar.token);
  v_id      uuid := slr_pujar.subasta_id;
  v_importe int := slr_pujar.importe;
  v_sub     subastas;
  v_eq      equipos;
  v_minimo  int;
begin
  select * into v_sub from subastas s where s.id = v_id;
  if not found then
    raise exception 'Esa subasta no existe' using errcode = 'P0001';
  end if;
  v_eq := preparar_operacion(v_usuario, v_sub.liga_id);
  if v_sub.estado <> 'abierta' or v_sub.cierra_en <= now() then
    raise exception 'La subasta ya está cerrada' using errcode = 'P0001';
  end if;
  v_minimo := valor_carta(v_sub.carta_id);
  if v_importe is null or v_importe < v_minimo then
    raise exception 'La puja mínima es el valor de la carta: %', fmt(v_minimo) using errcode = 'P0001';
  end if;
  -- Se permite pujar por encima del saldo: solo se comprueba al resolver
  insert into pujas as p (subasta_id, equipo_id, importe)
  values (v_id, v_eq.id, v_importe)
  on conflict (subasta_id, equipo_id) do update set importe = excluded.importe, actualizada_en = now();
  return jsonb_build_object('subasta_id', v_id, 'importe', v_importe, 'cierra_en', v_sub.cierra_en);
end $$;

create function public.slr_retirar_puja(token text, subasta_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_retirar_puja.token);
  v_id      uuid := slr_retirar_puja.subasta_id;
  v_sub     subastas;
  v_eq      equipos;
begin
  select * into v_sub from subastas s where s.id = v_id;
  if not found then
    raise exception 'Esa subasta no existe' using errcode = 'P0001';
  end if;
  v_eq := preparar_operacion(v_usuario, v_sub.liga_id);
  if v_sub.estado <> 'abierta' or v_sub.cierra_en <= now() then
    raise exception 'La subasta ya está cerrada' using errcode = 'P0001';
  end if;
  delete from pujas p where p.subasta_id = v_id and p.equipo_id = v_eq.id;
  if not found then
    raise exception 'No tienes ninguna puja en esa subasta' using errcode = 'P0001';
  end if;
  return true;
end $$;

-- Resolución: gana la puja más alta; en empate, el peor clasificado y después la
-- puja más antigua (la que llegó antes a ese importe). Si el ganador no tiene
-- saldo o hueco, su puja se anula y pasa a la siguiente. Todo al banco.
create function public.resolver_subasta(p_subasta uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_sub     subastas;
  p         record;
  v_ganador uuid;
  v_precio  int;
  v_saldo   int;
  v_max     int;
  v_pujas   jsonb := '[]';
begin
  select * into v_sub from subastas s where s.id = p_subasta for update;
  if not found or v_sub.estado <> 'abierta' then
    return null;
  end if;
  v_max := plantilla_maxima(v_sub.liga_id);
  perform 1 from cartas c where c.id = v_sub.carta_id for update;

  for p in
    select pu.equipo_id, pu.importe
    from pujas pu
    left join clasificacion cl on cl.equipo_id = pu.equipo_id
    where pu.subasta_id = p_subasta
    order by pu.importe desc, coalesce(cl.puntos, 0) asc, coalesce(cl.gf - cl.gc, 0) asc, coalesce(cl.gf, 0) asc,
             pu.actualizada_en asc
  loop
    v_pujas := v_pujas || jsonb_build_object('equipo_id', p.equipo_id, 'equipo', nombre_dueno(p.equipo_id), 'importe', p.importe);
    if v_ganador is not null then
      update pujas pu set estado = 'perdedora' where pu.subasta_id = p_subasta and pu.equipo_id = p.equipo_id;
      perform notificar(p.equipo_id, 'subasta_perdida',
        format('No has ganado la subasta de %s', nombre_carta(v_sub.carta_id)),
        jsonb_build_object('subasta_id', p_subasta, 'carta_id', v_sub.carta_id));
      continue;
    end if;
    select e.saldo into v_saldo from equipos e where e.id = p.equipo_id for update;
    if v_saldo >= p.importe and plantilla_ocupada(p.equipo_id) + 1 <= v_max
       and (select c.equipo_id from cartas c where c.id = v_sub.carta_id) is null then
      perform mover_dinero(p.equipo_id, -p.importe, 'subasta', 'subasta:' || p_subasta);
      perform adquirir_carta(v_sub.carta_id, p.equipo_id, 'subasta');
      update pujas pu set estado = 'ganadora' where pu.subasta_id = p_subasta and pu.equipo_id = p.equipo_id;
      v_ganador := p.equipo_id;
      v_precio := p.importe;
      perform notificar(p.equipo_id, 'subasta_ganada',
        format('Has ganado la subasta de %s por %s', nombre_carta(v_sub.carta_id), fmt(p.importe)),
        jsonb_build_object('subasta_id', p_subasta, 'carta_id', v_sub.carta_id, 'importe', p.importe));
    else
      update pujas pu set estado = 'anulada' where pu.subasta_id = p_subasta and pu.equipo_id = p.equipo_id;
      perform notificar(p.equipo_id, 'puja_anulada',
        format('Tu puja por %s se ha anulado: %s', nombre_carta(v_sub.carta_id),
               case when v_saldo < p.importe then 'no tenías saldo suficiente' else 'tenías la plantilla llena' end),
        jsonb_build_object('subasta_id', p_subasta, 'carta_id', v_sub.carta_id, 'importe', p.importe));
    end if;
  end loop;

  update subastas s set estado = case when v_ganador is null then 'desierta' else 'resuelta' end,
                        ganador_id = v_ganador, precio = v_precio
   where s.id = p_subasta;

  if v_ganador is not null then
    perform apuntar_historial(v_sub.liga_id, 'subasta',
      format('%s gana la subasta de %s por %s', nombre_dueno(v_ganador), nombre_carta(v_sub.carta_id), fmt(v_precio)),
      jsonb_build_object('subasta_id', p_subasta, 'carta_id', v_sub.carta_id, 'equipo_id', v_ganador,
                         'precio', v_precio, 'pujas', v_pujas));
  end if;
  return jsonb_build_object('subasta_id', p_subasta, 'ganador_id', v_ganador, 'precio', v_precio);
end $$;

-- Tanda diaria: N cartas libres al azar ponderadas por el peso de mercado (la
-- Única pesa 0). Excluye reservadas, ya en subasta y las de la tanda anterior.
create function public.abrir_tanda(p_liga uuid, p_fecha date, p_ahora timestamptz) returns int
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_cfg      jsonb := config_liga(p_liga);
  v_pesos    jsonb := coalesce(v_cfg -> 'pesos_mercado', '{"individual":1,"duo":0.25,"trio":0.05,"unica":0}');
  v_n        int := coalesce((v_cfg ->> 'mercado_cartas_diarias')::int, 8);
  v_horas    int := coalesce((v_cfg ->> 'subasta_horas')::int, 24);
  v_anterior date;
  v_abiertas int;
begin
  insert into tandas_mercado (liga_id, fecha, abierta_en) values (p_liga, p_fecha, p_ahora)
  on conflict do nothing;
  if not found then
    return 0; -- otra ejecución ya la abrió
  end if;
  select max(t.fecha) into v_anterior from tandas_mercado t where t.liga_id = p_liga and t.fecha < p_fecha;

  insert into subastas (liga_id, carta_id, abre_en, cierra_en, tanda)
  select p_liga, x.id, p_ahora, p_ahora + make_interval(hours => v_horas), p_fecha
  from (
    select c.id
    from cartas c join disenos_carta d on d.id = c.diseno_id
    where c.liga_id = p_liga and c.equipo_id is null and c.reservada_por is null
      and coalesce((v_pesos ->> d.tipo)::numeric, 0) > 0
      and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
      and not exists (select 1 from subastas s where s.carta_id = c.id and s.liga_id = p_liga and s.tanda = v_anterior)
    -- Muestreo ponderado sin reemplazo (Efraimidis–Spirakis)
    order by -ln(1 - random()) / (v_pesos ->> d.tipo)::numeric
    limit v_n
  ) x;
  get diagnostics v_abiertas = row_count;
  update tandas_mercado t set cartas = v_abiertas where t.liga_id = p_liga and t.fecha = p_fecha;
  if v_abiertas > 0 then
    perform apuntar_historial(p_liga, 'tanda', format('Nueva tanda de subastas: %s cartas durante %s horas', v_abiertas, v_horas),
      jsonb_build_object('fecha', p_fecha));
  end if;
  return v_abiertas;
end $$;

-- ── 7. Sobres (9 + complementaria §3) ──────────────────────────────────────
-- Un ejemplar libre al azar del bombo, ponderado por los pesos del sobre.
create function public.sortear_carta_sobre(p_liga uuid, p_pesos jsonb, p_excluir uuid[], p_solo_especiales boolean)
returns uuid
language sql volatile set search_path = public, extensions as $$
  select c.id
  from cartas c join disenos_carta d on d.id = c.diseno_id
  where c.liga_id = p_liga and c.equipo_id is null and c.reservada_por is null
    and c.id <> all(p_excluir)
    and coalesce((p_pesos ->> d.tipo)::numeric, 0) > 0
    and (not p_solo_especiales or d.tipo <> 'individual')
    and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
  order by -ln(1 - random()) / (p_pesos ->> d.tipo)::numeric
  limit 1
  for update of c
$$;

-- Si sale un ejemplar normal se tira la variante del sobre. Si toca una especial
-- y ese ejemplar no existe (se crea) o está libre y fuera del mercado, se entrega
-- el especial; si no, el normal. Un ejemplar que ya es especial se entrega tal cual.
create function public.aplicar_variante(p_carta uuid, p_probs jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_c    cartas;
  v_r    numeric := random();
  v_acum numeric := 0;
  v_var  variante_carta;
  v_esp  cartas;
  k      text;
begin
  select * into v_c from cartas c where c.id = p_carta;
  if v_c.variante <> 'normal' then
    return p_carta;
  end if;
  foreach k in array array['foil', 'brillante', 'plateada'] loop
    v_acum := v_acum + coalesce((p_probs ->> k)::numeric, 0);
    if v_r < v_acum then
      v_var := k::variante_carta;
      exit;
    end if;
  end loop;
  if v_var is null then
    return p_carta;
  end if;

  insert into cartas (liga_id, diseno_id, variante) values (v_c.liga_id, v_c.diseno_id, v_var)
  on conflict (liga_id, diseno_id, variante) do nothing;
  select * into v_esp from cartas c
  where c.liga_id = v_c.liga_id and c.diseno_id = v_c.diseno_id and c.variante = v_var
  for update;
  if v_esp.equipo_id is null and v_esp.reservada_por is null and not en_subasta(v_esp.id) then
    return v_esp.id;
  end if;
  return p_carta;
end $$;

create function public.slr_comprar_sobre(token text, liga_id uuid, tipo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario   uuid := sesion_usuario(slr_comprar_sobre.token);
  v_liga      uuid := slr_comprar_sobre.liga_id;
  v_tipo      text := lower(trim(slr_comprar_sobre.tipo));
  v_eq        equipos := preparar_operacion(v_usuario, v_liga);
  v_cfg       jsonb;
  v_precio    int;
  v_n         int;
  v_pesos     jsonb;
  v_probs     jsonb;
  v_excluir   uuid[] := '{}';
  v_cartas    uuid[] := '{}';
  v_c         uuid;
  v_entregada uuid;
  v_forzar    boolean;
  v_garantia  boolean := false;
  v_hay_esp   boolean := false;
  v_sobre     uuid := gen_random_uuid();
  v_caduca    timestamptz;
  v_libres    int;
  v_saldo     int;
begin
  v_cfg := config_liga(v_liga) -> 'sobres' -> v_tipo;
  if v_tipo not in ('basico', 'premium', 'eleccion') or v_cfg is null then
    raise exception 'Tipo de sobre no válido: básico, premium o elección' using errcode = 'P0001';
  end if;
  v_precio := (v_cfg ->> 'precio')::int;
  v_n := coalesce((v_cfg ->> 'cartas')::int, (v_cfg ->> 'candidatas')::int, 3);
  v_pesos := v_cfg -> 'pesos';
  v_probs := coalesce(v_cfg -> 'variantes', '{}');

  -- Hueco: el sobre de elección da 1 carta; el resto, todas las del sobre
  if v_tipo = 'eleccion' then
    perform exigir_hueco(v_eq.id, 1);
  elsif plantilla_ocupada(v_eq.id) + v_n > plantilla_maxima(v_liga) then
    raise exception 'Para comprar este sobre necesitas como mucho % cartas en la plantilla', plantilla_maxima(v_liga) - v_n
      using errcode = 'P0001';
  end if;

  select count(*) into v_libres
  from cartas c join disenos_carta d on d.id = c.diseno_id
  where c.liga_id = v_liga and c.equipo_id is null and c.reservada_por is null
    and coalesce((v_pesos ->> d.tipo)::numeric, 0) > 0
    and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta');
  if v_libres < v_n then
    raise exception 'Quedan menos de % cartas libres: ahora no se puede comprar este sobre', v_n using errcode = 'P0001';
  end if;

  v_saldo := mover_dinero(v_eq.id, -v_precio, 'sobre_' || v_tipo, 'sobre:' || v_sobre);

  for i in 1..v_n loop
    -- Garantía premium: primera carta dúo o superior si el contador ha llegado al tope.
    -- Elección: si las dos primeras son individuales, la tercera se fuerza a dúo o superior.
    v_forzar := (v_tipo = 'premium' and i = 1
                 and v_eq.contador_garantia_premium >= coalesce((v_cfg ->> 'garantia_tras')::int, 2))
             or (v_tipo = 'eleccion' and i = v_n and not v_hay_esp);
    v_c := null;
    if v_forzar then
      v_c := sortear_carta_sobre(v_liga, v_pesos, v_excluir, true);
      if v_c is not null and v_tipo = 'premium' then v_garantia := true; end if;
    end if;
    if v_c is null then
      v_c := sortear_carta_sobre(v_liga, v_pesos, v_excluir, false);
    end if;
    if v_c is null then
      raise exception 'No quedan cartas suficientes en el bombo' using errcode = 'P0001';
    end if;
    v_entregada := aplicar_variante(v_c, v_probs);
    v_excluir := v_excluir || v_c || v_entregada;
    v_cartas := v_cartas || v_entregada;
    if (select d.tipo from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = v_entregada) <> 'individual' then
      v_hay_esp := true;
    end if;
  end loop;

  if v_tipo = 'premium' then
    update equipos e set contador_garantia_premium = case when v_hay_esp then 0 else e.contador_garantia_premium + 1 end
     where e.id = v_eq.id;
  end if;

  if v_tipo = 'eleccion' then
    v_caduca := now() + make_interval(mins => coalesce((v_cfg ->> 'minutos_eleccion')::int, 10));
    insert into sobres_abiertos (id, equipo_id, liga_id, tipo, precio, cartas, estado, caduca_en)
    values (v_sobre, v_eq.id, v_liga, v_tipo, v_precio, v_cartas, 'pendiente_eleccion', v_caduca);
    update cartas c set reservada_hasta = v_caduca, reservada_por = v_sobre where c.id = any(v_cartas);
  else
    insert into sobres_abiertos (id, equipo_id, liga_id, tipo, precio, cartas, estado, garantia_aplicada)
    values (v_sobre, v_eq.id, v_liga, v_tipo, v_precio, v_cartas, 'abierto', v_garantia);
    foreach v_c in array v_cartas loop
      perform adquirir_carta(v_c, v_eq.id, 'sobre_' || v_tipo);
    end loop;
    perform apuntar_historial(v_liga, 'sobre',
      format('%s abre un sobre %s: %s', nombre_dueno(v_eq.id), case v_tipo when 'basico' then 'básico' else v_tipo end,
             (select string_agg(nombre_carta(x), ', ') from unnest(v_cartas) x)),
      jsonb_build_object('equipo_id', v_eq.id, 'sobre_id', v_sobre, 'cartas', to_jsonb(v_cartas)));
  end if;

  return jsonb_build_object(
    'sobre_id', v_sobre, 'tipo', v_tipo, 'precio', v_precio, 'saldo', v_saldo,
    'cartas', (select jsonb_agg(carta_json(x) order by o) from unnest(v_cartas) with ordinality t(x, o)),
    'garantia_aplicada', v_garantia,
    'pendiente_eleccion', v_tipo = 'eleccion',
    'caduca_en', v_caduca);
end $$;

create function public.slr_elegir_carta_sobre(token text, sobre_id uuid, carta_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_elegir_carta_sobre.token);
  v_sobre   uuid := slr_elegir_carta_sobre.sobre_id;
  v_carta   uuid := slr_elegir_carta_sobre.carta_id;
  v_s       sobres_abiertos;
  v_elegida uuid;
begin
  select * into v_s from sobres_abiertos s where s.id = v_sobre;
  if not found or v_s.equipo_id <> (equipo_en_liga(v_usuario, v_s.liga_id)).id then
    raise exception 'Ese sobre no es tuyo' using errcode = 'P0001';
  end if;
  if v_s.estado <> 'pendiente_eleccion' then
    raise exception 'Ese sobre ya está resuelto' using errcode = 'P0001';
  end if;
  if v_s.caduca_en <= now() then
    -- Se acabó el tiempo: se entrega la primera candidata
    v_elegida := resolver_eleccion(v_sobre, null);
    return jsonb_build_object('sobre_id', v_sobre, 'carta', carta_json(v_elegida), 'automatica', true);
  end if;
  v_elegida := resolver_eleccion(v_sobre, v_carta);
  return jsonb_build_object('sobre_id', v_sobre, 'carta', carta_json(v_elegida), 'automatica', false);
end $$;

-- ── 8. Lecturas ────────────────────────────────────────────────────────────
create function public.slr_mercado(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_mercado.token);
  v_liga    uuid := slr_mercado.liga_id;
  v_eq      equipos := equipo_en_liga(v_usuario, v_liga);
begin
  return jsonb_build_object(
    'equipo_id', v_eq.id,
    'saldo', (select e.saldo from equipos e where e.id = v_eq.id),
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

create function public.slr_carta(token text, carta_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_carta.token);
  v_carta   uuid := slr_carta.carta_id;
  v_liga    uuid := liga_de_carta(v_carta);
  v_c       cartas;
begin
  if not exists (select 1 from equipos e where e.liga_id = v_liga and e.usuario_id = v_usuario)
     and not exists (select 1 from ligas l where l.id = v_liga and l.admin_id = v_usuario) then
    raise exception 'No perteneces a la liga de esa carta' using errcode = 'P0001';
  end if;
  select * into v_c from cartas c where c.id = v_carta;
  return carta_json(v_carta) || jsonb_build_object(
    'liga_id', v_liga,
    'dueno', case when v_c.equipo_id is null then null else jsonb_build_object(
               'equipo_id', v_c.equipo_id, 'equipo', (select e.nombre from equipos e where e.id = v_c.equipo_id),
               'usuario', nombre_dueno(v_c.equipo_id)) end,
    'multiplicador_clausula', v_c.multiplicador_clausula,
    'clausula', case when v_c.equipo_id is null then null else clausula_carta(v_carta) end,
    'blindada', v_c.blindada_hasta is not null and v_c.blindada_hasta > now(),
    'blindada_hasta', v_c.blindada_hasta,
    'reservada', v_c.reservada_por is not null,
    'en_venta', (select jsonb_build_object('venta_id', v.id, 'precio', v.precio)
                 from ventas v where v.carta_id = v_carta and v.estado = 'activa'),
    'en_subasta', (select jsonb_build_object('subasta_id', s.id, 'cierra_en', s.cierra_en)
                   from subastas s where s.carta_id = v_carta and s.estado = 'abierta'),
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', h.tipo, 'texto', h.texto, 'fecha', h.creado_en) order by h.creado_en)
      from historial h
      where h.liga_id = v_liga and (h.datos ->> 'carta_id' = v_carta::text or h.datos -> 'cartas' ? v_carta::text)), '[]')
  );
end $$;

-- Lista las notificaciones (las 100 últimas); marca como leídas las indicadas
create function public.slr_notificaciones(token text, marcar_leidas bigint[] default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_notificaciones.token);
  v_marcar  bigint[] := slr_notificaciones.marcar_leidas;
begin
  if v_marcar is not null then
    update notificaciones n set leida = true where n.usuario_id = v_usuario and n.id = any(v_marcar);
  end if;
  return jsonb_build_object(
    'no_leidas', (select count(*) from notificaciones n where n.usuario_id = v_usuario and not n.leida),
    'notificaciones', coalesce((
      select jsonb_agg(x order by x.id desc) from (
        select n.id, n.liga_id, n.tipo, n.datos, n.leida, n.creada_en
        from notificaciones n where n.usuario_id = v_usuario order by n.id desc limit 100) x), '[]'));
end $$;

-- slr_yo añade los sobres de elección pendientes
create or replace function public.slr_yo(token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_yo.token);
begin
  return jsonb_build_object(
    'usuario', usuario_json(v_usuario),
    'ligas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'nombre', l.nombre, 'estado', l.estado, 'temporada', l.temporada,
               'es_admin', l.admin_id = v_usuario, 'es_prueba', l.es_prueba, 'codigo_invitacion', l.codigo_invitacion)
             order by l.creada_en)
      from ligas l
      where l.admin_id = v_usuario
         or exists (select 1 from equipos e where e.liga_id = l.id and e.usuario_id = v_usuario)
    ), '[]'::jsonb),
    'equipos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'liga_id', e.liga_id, 'nombre', e.nombre, 'escudo_url', e.escudo_url, 'saldo', e.saldo)
             order by e.creado_en)
      from equipos e where e.usuario_id = v_usuario
    ), '[]'::jsonb),
    'sobres_pendientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'liga_id', s.liga_id, 'equipo_id', s.equipo_id, 'caduca_en', s.caduca_en,
               'candidatas', (select jsonb_agg(carta_json(x) order by o) from unnest(s.cartas) with ordinality t(x, o)))
             order by s.creado_en)
      from sobres_abiertos s join equipos e on e.id = s.equipo_id
      where e.usuario_id = v_usuario and s.estado = 'pendiente_eleccion'
    ), '[]'::jsonb)
  );
end $$;

-- ── 9. Tareas programadas ──────────────────────────────────────────────────
-- Idempotente. Para cada liga en preparación o en curso: resuelve subastas
-- vencidas (en orden de cierre), abre la tanda del día local si falta, caduca
-- ofertas e intercambios y resuelve elecciones de sobre vencidas.
-- Sin p_liga procesa todas las ligas MENOS las de prueba (esas solo con
-- slr_prueba_tareas, para poder simular el tiempo sin interferencias).
create function public.slr_tareas_mercado(p_ahora timestamptz default now(), p_liga uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  l        record;
  r        record;
  v_fecha  date;
  v_res    jsonb := '{"subastas_resueltas":0,"tandas_abiertas":0,"cartas_en_subasta":0,"ofertas_caducadas":0,"intercambios_caducados":0,"elecciones_resueltas":0}';
  v_n      int;
  v_ligas  int := 0;
begin
  for l in select lg.id, lg.config from ligas lg
           where lg.estado in ('preparacion', 'en_curso')
             and (case when p_liga is null then not lg.es_prueba else lg.id = p_liga end)
           order by lg.creada_en
  loop
    v_ligas := v_ligas + 1;
    for r in select s.id from subastas s where s.liga_id = l.id and s.estado = 'abierta' and s.cierra_en <= p_ahora
             order by s.cierra_en, s.id loop
      perform resolver_subasta(r.id);
      v_res := jsonb_set(v_res, '{subastas_resueltas}', to_jsonb((v_res ->> 'subastas_resueltas')::int + 1));
    end loop;

    v_fecha := (p_ahora at time zone coalesce(l.config ->> 'zona_horaria', 'Europe/Madrid'))::date;
    if not exists (select 1 from tandas_mercado t where t.liga_id = l.id and t.fecha = v_fecha) then
      v_n := abrir_tanda(l.id, v_fecha, p_ahora);
      v_res := jsonb_set(v_res, '{tandas_abiertas}', to_jsonb((v_res ->> 'tandas_abiertas')::int + 1));
      v_res := jsonb_set(v_res, '{cartas_en_subasta}', to_jsonb((v_res ->> 'cartas_en_subasta')::int + v_n));
    end if;

    for r in update ofertas o set estado = 'caducada'
             where o.liga_id = l.id and o.estado = 'pendiente' and o.caduca_en <= p_ahora
             returning o.id, o.de_id, o.carta_id loop
      perform notificar(r.de_id, 'oferta_caducada', format('Tu oferta por %s ha caducado', nombre_carta(r.carta_id)),
        jsonb_build_object('oferta_id', r.id, 'carta_id', r.carta_id));
      v_res := jsonb_set(v_res, '{ofertas_caducadas}', to_jsonb((v_res ->> 'ofertas_caducadas')::int + 1));
    end loop;

    for r in update intercambios i set estado = 'caducado'
             where i.liga_id = l.id and i.estado = 'pendiente' and i.caduca_en <= p_ahora
             returning i.id, i.de_id loop
      perform notificar(r.de_id, 'intercambio_caducado', 'Tu propuesta de intercambio ha caducado',
        jsonb_build_object('intercambio_id', r.id));
      v_res := jsonb_set(v_res, '{intercambios_caducados}', to_jsonb((v_res ->> 'intercambios_caducados')::int + 1));
    end loop;

    for r in select s.id from sobres_abiertos s
             where s.liga_id = l.id and s.estado = 'pendiente_eleccion' and s.caduca_en <= p_ahora loop
      perform resolver_eleccion(r.id, null);
      v_res := jsonb_set(v_res, '{elecciones_resueltas}', to_jsonb((v_res ->> 'elecciones_resueltas')::int + 1));
    end loop;
  end loop;
  return v_res || jsonb_build_object('ligas', v_ligas, 'ahora', p_ahora);
end $$;

-- ── 10. Ligas de prueba y herramientas de test ─────────────────────────────
-- slr_crear_liga y slr_crear_liga_prueba comparten la creación
create function public.crear_liga_interna(p_usuario uuid, p_nombre text, p_prueba boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_nombre text := trim(p_nombre);
  v_liga   ligas%rowtype;
  v_cartas int;
begin
  if v_nombre is null or length(v_nombre) < 3 or length(v_nombre) > 40 then
    raise exception 'El nombre de la liga debe tener entre 3 y 40 caracteres' using errcode = 'P0001';
  end if;
  insert into ligas (nombre, admin_id, codigo_invitacion, config, es_prueba)
  values (v_nombre, p_usuario, generar_codigo_invitacion(), config_liga_por_defecto(), p_prueba)
  returning * into v_liga;
  insert into cartas (liga_id, diseno_id, variante)
  select v_liga.id, d.id, 'normal' from disenos_carta d where d.activo;
  get diagnostics v_cartas = row_count;
  perform apuntar_historial(v_liga.id, 'liga_creada',
    format('%s ha creado la liga «%s»', (select u.nombre from usuarios u where u.id = p_usuario), v_nombre),
    jsonb_build_object('usuario_id', p_usuario));
  return jsonb_build_object('id', v_liga.id, 'nombre', v_liga.nombre, 'codigo_invitacion', v_liga.codigo_invitacion,
                            'estado', v_liga.estado, 'es_prueba', v_liga.es_prueba, 'cartas', v_cartas);
end $$;

create or replace function public.slr_crear_liga(token text, nombre text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  return crear_liga_interna(sesion_usuario(slr_crear_liga.token), slr_crear_liga.nombre, false);
end $$;

create function public.slr_crear_liga_prueba(token text, nombre text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  return crear_liga_interna(sesion_usuario(slr_crear_liga_prueba.token), slr_crear_liga_prueba.nombre, true);
end $$;

-- Solo el admin de una liga de prueba
create function public.exigir_admin_prueba(p_usuario uuid, p_liga uuid) returns void
language plpgsql stable set search_path = public, extensions as $$
begin
  if not exists (select 1 from ligas l where l.id = p_liga and l.admin_id = p_usuario and l.es_prueba) then
    raise exception 'Solo el administrador de una liga de prueba puede usar esta función' using errcode = 'P0001';
  end if;
end $$;

create function public.slr_prueba_tareas(token text, liga_id uuid, ahora timestamptz) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_prueba_tareas.token);
begin
  perform exigir_admin_prueba(v_usuario, slr_prueba_tareas.liga_id);
  return slr_tareas_mercado(coalesce(slr_prueba_tareas.ahora, now()), slr_prueba_tareas.liga_id);
end $$;

create function public.slr_prueba_dar_dinero(token text, liga_id uuid, equipo_id uuid, importe int) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_prueba_dar_dinero.token);
  v_liga    uuid := slr_prueba_dar_dinero.liga_id;
  v_equipo  uuid := slr_prueba_dar_dinero.equipo_id;
begin
  perform exigir_admin_prueba(v_usuario, v_liga);
  if not exists (select 1 from equipos e where e.id = v_equipo and e.liga_id = v_liga) then
    raise exception 'Ese equipo no es de la liga' using errcode = 'P0001';
  end if;
  return mover_dinero(v_equipo, slr_prueba_dar_dinero.importe, 'prueba', 'prueba');
end $$;

-- Quita el blindaje de una carta (para poder probar las cláusulas sin esperar 7 días)
create function public.slr_prueba_desblindar(token text, liga_id uuid, carta_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_prueba_desblindar.token);
  v_liga    uuid := slr_prueba_desblindar.liga_id;
begin
  perform exigir_admin_prueba(v_usuario, v_liga);
  update cartas c set blindada_hasta = now() - interval '1 second'
   where c.id = slr_prueba_desblindar.carta_id and c.liga_id = v_liga;
  return found;
end $$;

-- ── Permisos ───────────────────────────────────────────────────────────────
revoke execute on function
  public.resolver_subasta(uuid), public.abrir_tanda(uuid, date, timestamptz),
  public.sortear_carta_sobre(uuid, jsonb, uuid[], boolean), public.aplicar_variante(uuid, jsonb),
  public.slr_tareas_mercado(timestamptz, uuid), public.crear_liga_interna(uuid, text, boolean),
  public.exigir_admin_prueba(uuid, uuid)
from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'slr_vender_banco(text, uuid)', 'slr_poner_en_venta(text, uuid, int)', 'slr_retirar_venta(text, uuid)',
    'slr_comprar_venta(text, uuid)', 'slr_ofertar(text, uuid, int)', 'slr_aceptar_oferta(text, uuid)',
    'slr_rechazar_oferta(text, uuid)', 'slr_retirar_oferta(text, uuid)', 'slr_contraofertar(text, uuid, int)',
    'slr_proponer_intercambio(text, uuid, uuid[], uuid[], int, int)', 'slr_aceptar_intercambio(text, uuid)',
    'slr_rechazar_intercambio(text, uuid)', 'slr_retirar_intercambio(text, uuid)',
    'slr_pagar_clausula(text, uuid)', 'slr_cambiar_clausula(text, uuid, numeric)',
    'slr_pujar(text, uuid, int)', 'slr_retirar_puja(text, uuid)',
    'slr_comprar_sobre(text, uuid, text)', 'slr_elegir_carta_sobre(text, uuid, uuid)',
    'slr_mercado(text, uuid)', 'slr_carta(text, uuid)', 'slr_notificaciones(text, bigint[])',
    'slr_yo(text)', 'slr_crear_liga(text, text)', 'slr_crear_liga_prueba(text, text)',
    'slr_prueba_tareas(text, uuid, timestamptz)', 'slr_prueba_dar_dinero(text, uuid, uuid, int)',
    'slr_prueba_desblindar(text, uuid, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
