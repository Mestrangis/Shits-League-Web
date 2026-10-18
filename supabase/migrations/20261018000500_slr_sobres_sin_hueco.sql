-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — sobres con la plantilla llena
--   · El sobre se compra y se abre aunque la plantilla pase de 15. Después hay
--     que hacer hueco: mientras el equipo tenga cartas de más («exceso») no
--     puede hacer otras operaciones de mercado ni guardar o confirmar la
--     alineación; solo vender al banco (slr_vender_banco o slr_hacer_hueco,
--     varias de una vez).
--   · Si llega el cierre de la jornada con cartas de más, el banco se queda
--     con las de menos valor hasta dejar el máximo, con aviso.
--   · El resto de adquisiciones (subastas, compras, cláusulas, intercambios)
--     siguen pidiendo hueco antes: ahí sí se sabe qué carta entra.
-- ═══════════════════════════════════════════════════════════════════════════

-- Cartas de más (sin contar la elección pendiente, que aún no es tuya)
create function public.exceso_plantilla(p_equipo uuid) returns int
language sql stable security definer set search_path = public, extensions as $$
  select greatest(0, (select count(*) from cartas c where c.equipo_id = p_equipo)::int
                     - plantilla_maxima((select e.liga_id from equipos e where e.id = p_equipo)))
$$;

create function public.exigir_sin_exceso(p_equipo uuid) returns void
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_n int := exceso_plantilla(p_equipo);
begin
  if v_n > 0 then
    raise exception 'Primero haz hueco: tienes % % de más. Vende al banco hasta quedarte en el máximo',
      v_n, case when v_n = 1 then 'carta' else 'cartas' end using errcode = 'P0001';
  end if;
end $$;

-- Toda operación de mercado comprueba el exceso, salvo vender al banco (que marca slr.haciendo_hueco)
create or replace function public.preparar_operacion(p_usuario uuid, p_liga uuid) returns public.equipos
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_eq     equipos := equipo_en_liga(p_usuario, p_liga);
  v_estado text;
  r        record;
begin
  select l.estado into v_estado from ligas l where l.id = p_liga;
  if v_estado not in ('preparacion', 'en_curso') then
    raise exception 'El mercado de esta liga está cerrado' using errcode = 'P0001';
  end if;
  if liga_bloqueada(p_liga) then
    raise exception 'El mercado está cerrado hasta que se publique la jornada' using errcode = 'P0001';
  end if;
  -- Si su elección ya caducó, se resuelve ahora (sin esperar a la tarea programada)
  for r in select s.id from sobres_abiertos s
           where s.equipo_id = v_eq.id and s.estado = 'pendiente_eleccion' and s.caduca_en <= now() loop
    perform resolver_eleccion(r.id, null);
  end loop;
  if coalesce(current_setting('slr.haciendo_hueco', true), '') <> '1' then
    perform exigir_sin_exceso(v_eq.id);
  end if;
  if exists (select 1 from sobres_abiertos s where s.equipo_id = v_eq.id and s.estado = 'pendiente_eleccion') then
    raise exception 'Tienes un sobre de elección pendiente: elige tu carta antes de hacer otra operación de mercado'
      using errcode = 'P0001';
  end if;
  return v_eq;
end $$;

-- Vender al banco (una o varias): siempre permitido, también con cartas de más
create function public.vender_carta_banco(p_equipo uuid, p_carta uuid, p_motivo text default null) returns int
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_liga   uuid := liga_de_carta(p_carta);
  v_precio int;
begin
  perform 1 from cartas c where c.id = p_carta and c.equipo_id = p_equipo for update;
  if not found then
    raise exception 'Esa carta no es tuya' using errcode = 'P0001';
  end if;
  v_precio := round(valor_carta(p_carta) * coalesce((config_liga(v_liga) ->> 'venta_banco')::numeric, 0.60))::int;
  perform liberar_carta(p_carta);
  perform mover_dinero(p_equipo, v_precio, 'venta_banco', 'carta:' || p_carta);
  perform apuntar_historial(v_liga, 'venta_banco',
    format('%s ha vendido a %s al banco por %s%s', nombre_dueno(p_equipo), nombre_carta(p_carta), fmt(v_precio), coalesce(' (' || p_motivo || ')', '')),
    jsonb_build_object('equipo_id', p_equipo, 'carta_id', p_carta, 'precio', v_precio));
  return v_precio;
end $$;

create or replace function public.slr_vender_banco(token text, carta_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_vender_banco.token);
  v_carta   uuid := slr_vender_banco.carta_id;
  v_liga    uuid := liga_de_carta(v_carta);
  v_eq      equipos;
  v_precio  int;
begin
  perform set_config('slr.haciendo_hueco', '1', true);
  v_eq := preparar_operacion(v_usuario, v_liga);
  v_precio := vender_carta_banco(v_eq.id, v_carta);
  return jsonb_build_object('carta_id', v_carta, 'precio', v_precio, 'saldo', (select e.saldo from equipos e where e.id = v_eq.id),
                            'sobran', exceso_plantilla(v_eq.id));
end $$;

-- «Haz hueco» tras un sobre: vende varias de una vez (todas o ninguna)
create function public.slr_hacer_hueco(token text, liga_id uuid, cartas uuid[]) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_hacer_hueco.token);
  v_liga    uuid := slr_hacer_hueco.liga_id;
  v_ids     uuid[] := array(select distinct x from unnest(coalesce(slr_hacer_hueco.cartas, '{}')) x);
  v_eq      equipos;
  v_total   int := 0;
  x         uuid;
begin
  perform set_config('slr.haciendo_hueco', '1', true);
  v_eq := preparar_operacion(v_usuario, v_liga);
  if cardinality(v_ids) = 0 then
    raise exception 'Elige al menos una carta' using errcode = 'P0001';
  end if;
  if cardinality(v_ids) < exceso_plantilla(v_eq.id) then
    raise exception 'Tienes % cartas de más: elige al menos esas', exceso_plantilla(v_eq.id) using errcode = 'P0001';
  end if;
  foreach x in array v_ids loop
    v_total := v_total + vender_carta_banco(v_eq.id, x);
  end loop;
  return jsonb_build_object('vendidas', cardinality(v_ids), 'cobrado', v_total,
                            'saldo', (select e.saldo from equipos e where e.id = v_eq.id), 'sobran', exceso_plantilla(v_eq.id));
end $$;

-- Lo que la web necesita para la hoja: cuántas sobran y cuáles son las del último sobre
create function public.slr_hueco_pendiente(token text, liga_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_eq equipos := equipo_en_liga(sesion_usuario(slr_hueco_pendiente.token), slr_hueco_pendiente.liga_id);
  v_s  sobres_abiertos;
begin
  select * into v_s from sobres_abiertos s where s.equipo_id = v_eq.id and s.estado = 'abierto' order by s.creado_en desc limit 1;
  return jsonb_build_object(
    'sobran', exceso_plantilla(v_eq.id),
    'maxima', plantilla_maxima(slr_hueco_pendiente.liga_id),
    'nuevas', coalesce((select jsonb_agg(c.id) from cartas c
                        where c.equipo_id = v_eq.id and c.id = any(coalesce(case when v_s.elegida is not null then array[v_s.elegida] end, v_s.cartas))), '[]'));
end $$;

-- Alineación: guardar, confirmar y tácticas, bloqueados con cartas de más
alter function public.slr_guardar_alineacion(text, uuid, text, jsonb, uuid[], boolean, uuid, jsonb) rename to slr_guardar_alineacion_base;
revoke execute on function public.slr_guardar_alineacion_base(text, uuid, text, jsonb, uuid[], boolean, uuid, jsonb) from public, anon, authenticated;
create function public.slr_guardar_alineacion(
  token text, equipo_id uuid, formacion text, huecos jsonb,
  banquillo uuid[] default '{}', orden_manual boolean default false, capitan_id uuid default null,
  tacticas jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from equipos e where e.id = slr_guardar_alineacion.equipo_id and e.usuario_id = sesion_usuario(slr_guardar_alineacion.token)) then
    perform exigir_sin_exceso(slr_guardar_alineacion.equipo_id);
  end if;
  return slr_guardar_alineacion_base(token, equipo_id, formacion, huecos, banquillo, orden_manual, capitan_id, tacticas);
end $$;

alter function public.slr_confirmar_alineacion(text, uuid) rename to slr_confirmar_alineacion_base;
revoke execute on function public.slr_confirmar_alineacion_base(text, uuid) from public, anon, authenticated;
create function public.slr_confirmar_alineacion(token text, equipo_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from equipos e where e.id = slr_confirmar_alineacion.equipo_id and e.usuario_id = sesion_usuario(slr_confirmar_alineacion.token)) then
    perform exigir_sin_exceso(slr_confirmar_alineacion.equipo_id);
  end if;
  return slr_confirmar_alineacion_base(token, equipo_id);
end $$;

alter function public.slr_guardar_tacticas(text, uuid, jsonb) rename to slr_guardar_tacticas_base;
revoke execute on function public.slr_guardar_tacticas_base(text, uuid, jsonb) from public, anon, authenticated;
create function public.slr_guardar_tacticas(token text, equipo_id uuid, tacticas jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from equipos e where e.id = slr_guardar_tacticas.equipo_id and e.usuario_id = sesion_usuario(slr_guardar_tacticas.token)) then
    perform exigir_sin_exceso(slr_guardar_tacticas.equipo_id);
  end if;
  return slr_guardar_tacticas_base(token, equipo_id, tacticas);
end $$;

-- Comprar un sobre: ya no pide hueco
create or replace function public.slr_comprar_sobre(token text, liga_id uuid, tipo text, perfil text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_comprar_sobre.token);
  v_liga    uuid := slr_comprar_sobre.liga_id;
  v_tipo    text := lower(trim(slr_comprar_sobre.tipo));
  v_perfil  text := lower(trim(slr_comprar_sobre.perfil));
  v_eq      equipos := preparar_operacion(v_usuario, v_liga);
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

  return jsonb_build_object(
    'sobre_id', v_sobre, 'tipo', v_tipo, 'nombre', v_t.nombre, 'precio', v_precio, 'saldo', v_saldo,
    'mejor_rareza', v_mejor, 'filtro', v_filtro,
    'cartas', (select jsonb_agg(carta_sobre(x, v_usuario, v_nuevas[o]) order by o) from unnest(v_cartas) with ordinality t(x, o)),
    'pendiente_eleccion', v_tipo = 'eleccion', 'caduca_en', v_caduca,
    'sobran', exceso_plantilla(v_eq.id), 'maxima', plantilla_maxima(v_liga));
end $$;

-- Cierre de jornada: además, vende las cartas de más
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
  return cerrar_jornada_base(p_jornada);
end $$;

revoke execute on function public.exceso_plantilla(uuid), public.exigir_sin_exceso(uuid), public.vender_carta_banco(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.slr_hacer_hueco(text, uuid, uuid[]), public.slr_hueco_pendiente(text, uuid),
  public.slr_guardar_alineacion(text, uuid, text, jsonb, uuid[], boolean, uuid, jsonb), public.slr_confirmar_alineacion(text, uuid),
  public.slr_guardar_tacticas(text, uuid, jsonb) from public;
grant execute on function public.slr_hacer_hueco(text, uuid, uuid[]), public.slr_hueco_pendiente(text, uuid),
  public.slr_guardar_alineacion(text, uuid, text, jsonb, uuid[], boolean, uuid, jsonb), public.slr_confirmar_alineacion(text, uuid),
  public.slr_guardar_tacticas(text, uuid, jsonb) to anon, authenticated;
