-- Equipo nuevo sin cartas colocadas, y alineaciones completadas solas al cierre
-- · slr_unirse_liga deja la alineación vacía (2-2-2 sin cartas, sin banquillo ni
--   capitán): cada uno la hace a su gusto. Los bots siguen con la suya por defecto.
-- · completar_alineacion: rellena los huecos vacíos (o con cartas que ya no son del
--   equipo) con la regla de los bots (crear_alineacion_por_defecto: la mejor stat del
--   hueco × factor de energía; primero las sin colocar y, si no quedan, del
--   banquillo), completa el banquillo hasta 3 y pone capitán si no hay. Respeta lo
--   que la persona ya ha colocado. No cuenta como guardada (ni da el bonus).
-- · cerrar_jornada la llama para cada equipo de una persona, después de vender las
--   cartas de más, y avisa (alineacion_completada → pantalla Equipo).

-- Un destino más para los avisos: la pantalla Equipo
alter table public.notificaciones drop constraint notificaciones_destino_tipo_check;
alter table public.notificaciones add constraint notificaciones_destino_tipo_check
  check (destino_tipo in ('carta', 'partido', 'movimientos', 'liga', 'mercado', 'equipo'));

create or replace function public.crear_alineacion_vacia(p_equipo uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into alineaciones as a (equipo_id, formacion, huecos, banquillo, orden_manual, capitan_id, guardada_en, automatica)
  values (p_equipo, '2-2-2', '{"por": null, "def": [null, null], "med": [null, null], "del": [null, null]}', '{}', false, null, now(), true)
  on conflict (equipo_id) do update
    set formacion = excluded.formacion, huecos = excluded.huecos, banquillo = excluded.banquillo,
        orden_manual = excluded.orden_manual, capitan_id = excluded.capitan_id, guardada_en = excluded.guardada_en,
        automatica = true;
  return (select to_jsonb(a) from alineaciones a where a.equipo_id = p_equipo);
end $$;

create or replace function public.completar_alineacion(p_equipo uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_al       alineaciones;
  v_n        int[];
  v_propias  uuid[];
  v_slots    text[];
  v_guardado uuid[];
  v_ids      uuid[] := '{}';
  v_usadas   uuid[] := '{}';
  v_banco    uuid[];
  v_pick     uuid;
  v_stat     text;
  v_capitan  uuid;
  v_once     int := 0;
  v_suplen   int := 0;
  v_partes   text[] := '{}';
  i          int;
begin
  select * into v_al from alineaciones a where a.equipo_id = p_equipo for update;
  if not found then
    perform crear_alineacion_vacia(p_equipo);
    select * into v_al from alineaciones a where a.equipo_id = p_equipo for update;
  end if;
  v_n := string_to_array(coalesce(v_al.formacion, '2-2-2'), '-')::int[];
  v_propias := array(select c.id from cartas c where c.equipo_id = p_equipo);

  -- Huecos en orden (como el de los bots: POR, DEF, MED, DEL) y lo guardado en cada uno
  v_slots := array['por'] || array_fill('def'::text, array[v_n[1]]) || array_fill('med'::text, array[v_n[2]])
             || array_fill('del'::text, array[v_n[3]]);
  v_guardado := array[(v_al.huecos ->> 'por')::uuid];
  for i in 1..v_n[1] loop v_guardado := v_guardado || ((v_al.huecos -> 'def') ->> (i - 1))::uuid; end loop;
  for i in 1..v_n[2] loop v_guardado := v_guardado || ((v_al.huecos -> 'med') ->> (i - 1))::uuid; end loop;
  for i in 1..v_n[3] loop v_guardado := v_guardado || ((v_al.huecos -> 'del') ->> (i - 1))::uuid; end loop;

  -- Se queda lo colocado que sigue siendo del equipo
  for i in 1..cardinality(v_slots) loop
    if v_guardado[i] is not null and v_guardado[i] = any(v_propias) and not (v_guardado[i] = any(v_usadas)) then
      v_ids := v_ids || v_guardado[i];
      v_usadas := v_usadas || v_guardado[i];
    else
      v_ids := v_ids || null::uuid;
    end if;
  end loop;
  v_banco := array(select x from unnest(coalesce(v_al.banquillo, '{}')) with ordinality t(x, o)
                   where x = any(v_propias) and not (x = any(v_usadas)) order by o);

  -- Huecos vacíos: la regla de los bots, primero con las sin colocar y si no, del banquillo
  for i in 1..cardinality(v_slots) loop
    continue when v_ids[i] is not null;
    v_stat := case v_slots[i] when 'med' then 'con' when 'del' then 'ata' else 'def' end;
    select p.id into v_pick
    from cartas_equipo_energia(p_equipo) p
    where not (p.id = any(v_usadas))
    order by (p.id = any(v_banco)),
             case v_stat when 'ata' then p.ata when 'def' then p.def else p.con end desc, p.o desc, p.id
    limit 1;
    if v_pick is not null then
      v_ids[i] := v_pick;
      v_usadas := v_usadas || v_pick;
      v_banco := array_remove(v_banco, v_pick);
      v_once := v_once + 1;
    end if;
  end loop;

  -- Banquillo hasta 3, con las mejores que queden (OVR × energía)
  while cardinality(v_banco) < 3 loop
    select p.id into v_pick
    from cartas_equipo_energia(p_equipo) p
    where not (p.id = any(v_usadas)) and not (p.id = any(v_banco))
    order by p.o desc, p.id
    limit 1;
    exit when v_pick is null;
    v_banco := v_banco || v_pick;
    v_suplen := v_suplen + 1;
  end loop;

  -- Capitán: el de antes si sigue en el once; si no, el mejor titular
  v_capitan := case when v_al.capitan_id = any(v_ids) then v_al.capitan_id end;
  if v_capitan is null then
    select p.id into v_capitan from cartas_equipo_energia(p_equipo) p where p.id = any(v_ids) order by p.o desc, p.id limit 1;
  end if;

  if v_once = 0 and v_suplen = 0 and v_capitan is not distinct from v_al.capitan_id
     and v_ids = v_guardado and v_banco = coalesce(v_al.banquillo, '{}') then
    return jsonb_build_object('completada', false);
  end if;

  update alineaciones a
     set huecos = jsonb_build_object('por', v_ids[1],
                                     'def', to_jsonb(v_ids[2 : 1 + v_n[1]]),
                                     'med', to_jsonb(v_ids[2 + v_n[1] : 1 + v_n[1] + v_n[2]]),
                                     'del', to_jsonb(v_ids[2 + v_n[1] + v_n[2] : 1 + v_n[1] + v_n[2] + v_n[3]])),
         banquillo = v_banco,
         capitan_id = v_capitan
   where a.equipo_id = p_equipo;

  if v_once > 0 then v_partes := v_partes || format('%s %s en el once', v_once, case when v_once = 1 then 'carta' else 'cartas' end); end if;
  if v_suplen > 0 then v_partes := v_partes || format('%s en el banquillo', v_suplen); end if;
  if v_capitan is distinct from v_al.capitan_id and v_capitan is not null then v_partes := v_partes || 'capitán'::text; end if;
  return jsonb_build_object(
    'completada', cardinality(v_partes) > 0,
    'once', v_once, 'banquillo', v_suplen, 'capitan', v_capitan is distinct from v_al.capitan_id,
    'vacios', (select count(*) from unnest(v_ids) x where x is null),
    'texto', case cardinality(v_partes)
               when 0 then ''
               when 1 then v_partes[1]
               else array_to_string(v_partes[1 : cardinality(v_partes) - 1], ', ') || ' y ' || v_partes[cardinality(v_partes)] end);
end $$;

create or replace function public.slr_unirse_liga(token text, codigo_invitacion text, nombre_equipo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario    uuid := sesion_usuario(slr_unirse_liga.token);
  v_codigo     text := upper(trim(slr_unirse_liga.codigo_invitacion));
  v_nombre     text := trim(slr_unirse_liga.nombre_equipo);
  v_liga       ligas%rowtype;
  v_equipo     uuid;
  v_saldo      int;
  v_plantilla  jsonb;
  v_alineacion jsonb;
  v_cartas     int;
  v_aviso      text;
begin
  -- Bloquea la liga: dos altas a la vez no pueden repartirse las mismas cartas
  select * into v_liga from ligas l where l.codigo_invitacion = v_codigo for update;
  if not found then
    raise exception 'Código de invitación incorrecto' using errcode = 'P0001';
  end if;
  -- Solo antes de la primera temporada o entre temporadas
  if v_liga.estado not in ('preparacion', 'entre_temporadas') then
    raise exception 'No te puedes unir con una temporada en marcha: espera a que termine' using errcode = 'P0001';
  end if;
  if exists (select 1 from equipos e where e.liga_id = v_liga.id and e.usuario_id = v_usuario) then
    raise exception 'Ya tienes un equipo en esta liga' using errcode = 'P0001';
  end if;
  if v_nombre is null or length(v_nombre) < 3 or length(v_nombre) > 30 then
    raise exception 'El nombre del equipo debe tener entre 3 y 30 caracteres' using errcode = 'P0001';
  end if;
  if exists (select 1 from equipos e where e.liga_id = v_liga.id and lower(e.nombre) = lower(v_nombre)) then
    raise exception 'Ya hay un equipo con ese nombre en la liga' using errcode = 'P0001';
  end if;

  insert into equipos (liga_id, usuario_id, nombre, saldo)
  values (v_liga.id, v_usuario, v_nombre, 0)
  returning id into v_equipo;

  v_saldo := mover_dinero(v_equipo, coalesce((v_liga.config ->> 'saldo_inicial')::int, 5000),
                          'saldo_inicial', 'liga:' || v_liga.id);

  v_plantilla := asignar_plantilla_inicial(v_liga.id, v_equipo, v_liga.config);

  insert into album (usuario_id, liga_id, diseno_id, via_adquisicion)
  select v_usuario, v_liga.id, c.diseno_id, 'inicial'
  from cartas c where c.equipo_id = v_equipo
  on conflict do nothing;

  -- Sin cartas colocadas: cada uno hace su alineación a su gusto
  v_alineacion := crear_alineacion_vacia(v_equipo);

  insert into historial (liga_id, tipo, texto, datos)
  values (v_liga.id, 'equipo_unido', format('%s se une a la liga con «%s»', (select u.nombre from usuarios u where u.id = v_usuario), v_nombre),
          jsonb_build_object('usuario_id', v_usuario, 'equipo_id', v_equipo));

  v_cartas := (select count(*) from cartas c where c.equipo_id = v_equipo);
  v_aviso := aviso_plantilla_corta(v_liga.id, v_cartas);
  if v_aviso is not null then
    perform notificar(v_equipo, 'plantilla_incompleta', v_aviso, jsonb_build_object('cartas', v_cartas));
    perform apuntar_historial(v_liga.id, 'plantilla_incompleta',
      format('«%s» empieza con %s cartas: no quedan individuales libres suficientes para una plantilla completa', v_nombre, v_cartas),
      jsonb_build_object('equipo_id', v_equipo, 'cartas', v_cartas));
  end if;

  return jsonb_build_object(
    'equipo', jsonb_build_object('id', v_equipo, 'liga_id', v_liga.id, 'nombre', v_nombre, 'saldo', v_saldo),
    'plantilla_inicial', v_plantilla,
    'cartas', v_cartas,
    'aviso', v_aviso,
    'alineacion', v_alineacion
  );
end $$;

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
    -- Alineación completada sola al cierre: la pantalla Equipo
    when p_tipo = 'alineacion_completada' then
      destino_tipo := 'equipo'; destino_id := v_equipo::text;
    -- Pausa, reanudación, temporada, aplazamiento: el estado de la liga
    when p_tipo in ('liga_pausada', 'liga_reanudada', 'temporada_iniciada', 'temporada_terminada', 'jornada_aplazada') then
      destino_tipo := 'liga'; destino_id := p_liga::text;
    else
      null;   -- intercambios y demás: sin destino
  end case;
end $$;

create or replace function public.cerrar_jornada(p_jornada uuid) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_j jornadas;
  r   record;
begin
  select * into v_j from jornadas j where j.id = p_jornada for update;
  if v_j.estado <> 'programada' then
    return false;
  end if;
  -- Como tarde al cerrar la jornada siguiente: se paga lo que quedara pendiente de antes
  for r in select distinct cp.equipo_id from cobros_pendientes cp join equipos e on e.id = cp.equipo_id
           where e.liga_id = v_j.liga_id and cp.jornada_id <> p_jornada loop
    perform pagar_pendientes(r.equipo_id, null);
  end loop;
  for r in select e.id from equipos e join usuarios u on u.id = e.usuario_id
           where e.liga_id = v_j.liga_id and u.interno loop
    insert into alineaciones_tacticas as a (equipo_id, tactica, plan_b, gestion, cambios_avanzados, guardada_en)
    values (r.id, (array['posesion', 'contraataque', 'presion'])[1 + floor(random() * 3)::int], null, 'normal', '[]', now())
    on conflict (equipo_id) do update
      set tactica = excluded.tactica, plan_b = null, gestion = 'normal', cambios_avanzados = '[]', guardada_en = now();
  end loop;
  -- Cartas de más al cierre: el banco se queda con las de menos valor, con aviso
  for r in select e.id from equipos e where e.liga_id = v_j.liga_id and exceso_plantilla(e.id) > 0 loop
    declare
      v_vendidas text[] := '{}';
      v_total    int := 0;
      c          record;
    begin
      for c in select x.id from cartas x join disenos_carta d on d.id = x.diseno_id
               where x.equipo_id = r.id order by d.valor, x.id limit exceso_plantilla(r.id) loop
        v_vendidas := v_vendidas || nombre_carta(c.id);
        v_total := v_total + vender_carta_banco(r.id, c.id, 'cierre de jornada con cartas de más');
      end loop;
      perform notificar(r.id, 'hueco_automatico',
        format('Se cerró la jornada con cartas de más: el banco se ha quedado con %s por %s', array_to_string(v_vendidas, ', '), fmt(v_total)),
        jsonb_build_object('cartas', to_jsonb(v_vendidas), 'cobrado', v_total));
    end;
  end loop;
  -- Alineaciones vacías o incompletas (de personas): se completan con la regla de los bots
  -- y se avisa. Después de vender las de más, que pueden haber dejado huecos
  for r in select e.id from equipos e join usuarios u on u.id = e.usuario_id
           where e.liga_id = v_j.liga_id and not u.interno loop
    declare
      v_c jsonb := completar_alineacion(r.id);
    begin
      if (v_c ->> 'completada')::boolean then
        perform notificar(r.id, 'alineacion_completada',
          format('Tu alineación de la jornada %s estaba incompleta: se ha completado sola (%s). Revísala para la próxima',
                 v_j.numero, v_c ->> 'texto'),
          jsonb_build_object('jornada_id', p_jornada) || (v_c - 'texto'));
      end if;
    end;
  end loop;
  return cerrar_jornada_base(p_jornada);
end $$;

revoke execute on function public.crear_alineacion_vacia(uuid), public.completar_alineacion(uuid) from public, anon, authenticated;
