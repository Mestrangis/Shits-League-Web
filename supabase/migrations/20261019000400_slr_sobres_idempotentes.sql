-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — compras de sobres idempotentes
--   Con mala conexión se tocaba «Comprar» varias veces y, al llegar, se abrían
--   (y cobraban) varios sobres. Ahora cada intento lleva un identificador que
--   genera el cliente:
--   · slr_comprar_sobre(…, intento): si ese intento ya se hizo, devuelve el
--     resultado del primero sin cobrar otra vez.
--   · slr_elegir_carta_sobre(…, intento): igual con la carta elegida.
--   · slr_anular_intento: cuando el cliente se cansa de esperar (~15 s), pregunta
--     por el intento. Si ya se hizo, devuelve el sobre; si no, lo anula, y la
--     petición que llegue tarde se rechaza sin cobrar.
--   Un candado por intento (pg_advisory_xact_lock) ordena las peticiones repetidas.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.intentos_sobre (
  intento   uuid primary key,
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  tipo      text not null check (tipo in ('compra', 'eleccion')),
  sobre_id  uuid,
  anulada   boolean not null default false,
  respuesta jsonb,
  creado_en timestamptz not null default now()
);
create index intentos_sobre_creado_idx on public.intentos_sobre(creado_en);
alter table public.intentos_sobre enable row level security;   -- privada: sin políticas

drop function public.slr_comprar_sobre(text, uuid, text, text);
create function public.slr_comprar_sobre(token text, liga_id uuid, tipo text, perfil text default null, intento uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_comprar_sobre.token);
  v_liga    uuid := slr_comprar_sobre.liga_id;
  v_tipo    text := lower(trim(slr_comprar_sobre.tipo));
  v_perfil  text := lower(trim(slr_comprar_sobre.perfil));
  v_intento uuid := slr_comprar_sobre.intento;
  v_eq      equipos;
  v_prev    intentos_sobre;
  v_res     jsonb;
  v_t       tipos_sobre;
  v_precio  int;
  v_n       int;
  v_filtro  jsonb;
  v_col     uuid;
  v_excluir uuid[] := '{}';
  v_cartas  uuid[] := '{}';
  v_nuevas  boolean[] := '{}';
  v_c       uuid;
  v_hay_esp boolean := false;
  v_sobre   uuid := gen_random_uuid();
  v_caduca  timestamptz;
  v_saldo   int;
  v_mejor   text;
  v_disp    int;
  v_huecos  int;
begin
  -- El mismo intento dos veces (reintentos con mala conexión): el resultado del primero, sin cobrar otra vez.
  -- Antes de preparar_operacion: si el primero dejó la plantilla con exceso, el repetido no debe fallar por eso.
  if v_intento is not null then
    perform pg_advisory_xact_lock(hashtextextended('sobre:' || v_intento::text, 0));
    select * into v_prev from intentos_sobre i where i.intento = v_intento;
    if found then
      if v_prev.equipo_id <> (equipo_en_liga(v_usuario, v_liga)).id or v_prev.tipo <> 'compra' then
        raise exception 'Ese intento de compra no es tuyo' using errcode = 'P0001';
      end if;
      if v_prev.anulada then
        raise exception 'Esta compra se anuló porque tardaba demasiado: no se te ha cobrado nada' using errcode = 'P0001';
      end if;
      return v_prev.respuesta || jsonb_build_object('repetida', true);
    end if;
  end if;
  v_eq := preparar_operacion(v_usuario, v_liga);

  select * into v_t from tipos_sobre_liga(v_liga) t where t.tipo = v_tipo and t.activo;
  if not found then
    raise exception 'Tipo de sobre no válido o retirado: %', coalesce(v_tipo, '(vacío)') using errcode = 'P0001';
  end if;
  v_n := v_t.cartas;
  v_precio := v_t.precios[tramo_precio(v_liga)];
  perform asignar_cupos(v_liga);
  if v_tipo = 'posicion' then
    if v_perfil is null or v_perfil not in ('portero', 'defensa', 'control', 'atacante') then
      raise exception 'Elige el perfil del sobre: portero, defensa, control o atacante' using errcode = 'P0001';
    end if;
    v_filtro := jsonb_build_object('perfil', v_perfil);
  elsif v_tipo = 'coleccion' then
    v_col := coleccion_semana(v_liga);
    if v_col is null then
      raise exception 'Este sobre está agotado: no hay colección de la semana con cartas libres' using errcode = 'P0001';
    end if;
    v_filtro := jsonb_build_object('coleccion_id', v_col);
  end if;

  -- Sin comprobar hueco: el sobre se abre aunque la plantilla pase del máximo (luego, «Haz hueco»)

  v_disp := (select coalesce(sum(value::int), 0) from jsonb_each_text(disponibles_sobre(v_liga, v_t.pesos, v_filtro)));
  if v_disp < v_n then
    raise exception 'Este sobre está agotado: no quedan cartas suficientes que puedan salir' using errcode = 'P0001';
  end if;

  v_saldo := mover_dinero(v_eq.id, -v_precio, 'sobre_' || v_tipo, 'sobre:' || v_sobre);

  for i in 1..v_n loop
    v_c := null;
    -- Elección: si las dos primeras son comunes, la tercera es rara o mejor (si puede salir alguna)
    if v_tipo = 'eleccion' and i = v_n and not v_hay_esp then
      v_c := sortear_carta(v_liga, v_t.pesos, v_excluir, 'rara', null, v_filtro);
    end if;
    if v_c is null then
      v_c := sortear_carta(v_liga, v_t.pesos, v_excluir, null, null, v_filtro);
    end if;
    if v_c is null then
      raise exception 'No quedan cartas suficientes que puedan salir' using errcode = 'P0001';
    end if;
    v_excluir := v_excluir || v_c;
    v_cartas := v_cartas || v_c;
    v_nuevas := v_nuevas || es_nueva(v_c, v_usuario);
    if (select d.rareza from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = v_c) <> 'comun' then
      v_hay_esp := true;
    end if;
  end loop;
  v_mejor := (select d.rareza from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = any(v_cartas)
              order by rango_rareza(d.rareza) desc limit 1);

  if v_tipo = 'eleccion' then
    v_caduca := now() + interval '10 minutes';
    insert into sobres_abiertos (id, equipo_id, liga_id, tipo, precio, cartas, estado, caduca_en)
    values (v_sobre, v_eq.id, v_liga, v_tipo, v_precio, v_cartas, 'pendiente_eleccion', v_caduca);
    update cartas c set reservada_hasta = v_caduca, reservada_por = v_sobre where c.id = any(v_cartas);
  else
    insert into sobres_abiertos (id, equipo_id, liga_id, tipo, precio, cartas, estado, filtro)
    values (v_sobre, v_eq.id, v_liga, v_tipo, v_precio, v_cartas, 'abierto', v_filtro);
    foreach v_c in array v_cartas loop
      perform adquirir_carta(v_c, v_eq.id, 'sobre_' || v_tipo);
    end loop;
    -- Historial público solo si sale una épica o una legendaria
    if rango_rareza(v_mejor) >= rango_rareza('epica') then
      perform apuntar_historial(v_liga, 'sobre',
        format('%s abre un sobre %s y le sale %s', nombre_dueno(v_eq.id), v_t.nombre,
               (select string_agg(format('%s (%s)', d.nombre, case d.rareza when 'legendaria' then 'legendaria' else 'épica' end), ', ')
                from cartas c join disenos_carta d on d.id = c.diseno_id
                where c.id = any(v_cartas) and rango_rareza(d.rareza) >= rango_rareza('epica'))),
        jsonb_build_object('equipo_id', v_eq.id, 'sobre_id', v_sobre, 'cartas', to_jsonb(v_cartas), 'mejor', v_mejor));
    end if;
  end if;

  v_res := jsonb_build_object(
    'sobre_id', v_sobre, 'tipo', v_tipo, 'nombre', v_t.nombre, 'precio', v_precio, 'saldo', v_saldo,
    'mejor_rareza', v_mejor, 'filtro', v_filtro,
    'cartas', (select jsonb_agg(carta_sobre(x, v_usuario, v_nuevas[o]) order by o) from unnest(v_cartas) with ordinality t(x, o)),
    'pendiente_eleccion', v_tipo = 'eleccion', 'caduca_en', v_caduca,
    'sobran', exceso_plantilla(v_eq.id), 'maxima', plantilla_maxima(v_liga));
  if v_intento is not null then
    insert into intentos_sobre (intento, equipo_id, tipo, sobre_id, respuesta) values (v_intento, v_eq.id, 'compra', v_sobre, v_res);
    delete from intentos_sobre i where i.creado_en < now() - interval '7 days';
  end if;
  return v_res;
end $$;


drop function public.slr_elegir_carta_sobre(text, uuid, uuid);
create function public.slr_elegir_carta_sobre(token text, sobre_id uuid, carta_id uuid, intento uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_elegir_carta_sobre.token);
  v_sobre   uuid := slr_elegir_carta_sobre.sobre_id;
  v_carta   uuid := slr_elegir_carta_sobre.carta_id;
  v_intento uuid := slr_elegir_carta_sobre.intento;
  v_s       sobres_abiertos;
  v_prev    intentos_sobre;
  v_elegida uuid;
  v_res     jsonb;
begin
  select * into v_s from sobres_abiertos s where s.id = v_sobre for update;
  if not found or v_s.equipo_id <> (equipo_en_liga(v_usuario, v_s.liga_id)).id then
    raise exception 'Ese sobre no es tuyo' using errcode = 'P0001';
  end if;
  if v_intento is not null then
    select * into v_prev from intentos_sobre i where i.intento = v_intento;
    if found then
      if v_prev.equipo_id <> v_s.equipo_id or v_prev.tipo <> 'eleccion' or v_prev.sobre_id <> v_sobre then
        raise exception 'Ese intento no es de este sobre' using errcode = 'P0001';
      end if;
      return v_prev.respuesta || jsonb_build_object('repetida', true);
    end if;
  end if;
  if v_s.estado <> 'pendiente_eleccion' then
    raise exception 'Ese sobre ya está resuelto' using errcode = 'P0001';
  end if;
  if v_s.caduca_en <= now() then
    -- Se acabó el tiempo: se entrega la primera candidata
    v_elegida := resolver_eleccion(v_sobre, null);
    v_res := jsonb_build_object('sobre_id', v_sobre, 'carta', carta_json(v_elegida), 'automatica', true);
  else
    v_elegida := resolver_eleccion(v_sobre, v_carta);
    v_res := jsonb_build_object('sobre_id', v_sobre, 'carta', carta_json(v_elegida), 'automatica', false);
  end if;
  if v_intento is not null then
    insert into intentos_sobre (intento, equipo_id, tipo, sobre_id, respuesta) values (v_intento, v_s.equipo_id, 'eleccion', v_sobre, v_res);
  end if;
  return v_res;
end $$;

-- El cliente se cansó de esperar: ¿se hizo la compra? Si sí, el sobre; si no, queda anulada
create function public.slr_anular_intento(token text, liga_id uuid, intento uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_eq   equipos := equipo_en_liga(sesion_usuario(slr_anular_intento.token), slr_anular_intento.liga_id);
  v_int  uuid := slr_anular_intento.intento;
  v_prev intentos_sobre;
begin
  if v_int is null then
    raise exception 'Falta el intento' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sobre:' || v_int::text, 0));
  select * into v_prev from intentos_sobre i where i.intento = v_int;
  if found then
    if v_prev.equipo_id <> v_eq.id or v_prev.tipo <> 'compra' then
      raise exception 'Ese intento de compra no es tuyo' using errcode = 'P0001';
    end if;
    if v_prev.anulada then
      return jsonb_build_object('anulada', true);
    end if;
    return jsonb_build_object('comprado', true, 'respuesta', v_prev.respuesta || jsonb_build_object('repetida', true));
  end if;
  insert into intentos_sobre (intento, equipo_id, tipo, anulada) values (v_int, v_eq.id, 'compra', true);
  return jsonb_build_object('anulada', true);
end $$;

revoke execute on function public.slr_comprar_sobre(text, uuid, text, text, uuid), public.slr_elegir_carta_sobre(text, uuid, uuid, uuid),
  public.slr_anular_intento(text, uuid, uuid) from public;
grant execute on function public.slr_comprar_sobre(text, uuid, text, text, uuid), public.slr_elegir_carta_sobre(text, uuid, uuid, uuid),
  public.slr_anular_intento(text, uuid, uuid) to anon, authenticated;
