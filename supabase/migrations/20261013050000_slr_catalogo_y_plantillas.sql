-- ═══════════════════════════════════════════════════════════════════════════
-- SLR · catálogo editable a mano, herramienta de plantillas y pronóstico contra
-- cualquier rival
--
-- 1. disenos_carta se puede editar desde el Table Editor de Supabase con
--    seguridad: el valor se calcula solo (misma fórmula que js/slr/valor.js),
--    los poderes se validan con mensajes claros, un diseño nuevo (o
--    reactivado) crea un ejemplar libre en cada liga no de prueba, y uno
--    desactivado deja de salir en sobres, subastas y plantillas nuevas sin
--    quitárselo a quien lo tenga. Guía para Marcos: docs/slr/CARTAS.md.
-- 2. Modo pruebas: buscar cualquier carta de la liga y darla a un equipo o
--    dejarla libre (álbum vía 'admin', alineaciones, mercado e historial).
-- 3. motor_preparar_pronostico acepta un rival concreto.
-- ═══════════════════════════════════════════════════════════════════════════

/* ── 1. Catálogo ────────────────────────────────────────────────────────── */
-- Valor = round(100 · e^(0,08·(OVR − 50)) · (1 + Σ bonus de poderes)), con
-- OVR = 0,60·s1 + 0,25·s2 + 0,15·s3 sin redondear (stats de mayor a menor).
-- En coma flotante doble y en el mismo orden que js/slr/valor.js; el test
-- tests/slr/valor-sql.test.mjs compara los dos para todo el catálogo.
create function public.valor_diseno(p_ata int, p_def int, p_con int, p_poderes jsonb) returns int
language plpgsql immutable set search_path = public, extensions as $$
declare
  s1    float8 := greatest(p_ata, p_def, p_con);
  s3    float8 := least(p_ata, p_def, p_con);
  s2    float8 := (p_ata + p_def + p_con) - greatest(p_ata, p_def, p_con) - least(p_ata, p_def, p_con);
  ovr   float8;
  bonus float8 := 0;
  p     jsonb;
begin
  ovr := 0.60::float8 * s1 + 0.25::float8 * s2 + 0.15::float8 * s3;
  for p in select x from jsonb_array_elements(coalesce(p_poderes, '[]')) x loop
    bonus := bonus + case p ->> 'nivel' when 'simple' then 0.15::float8 when 'fuerte' then 0.35::float8
                                        when 'muy fuerte' then 0.60::float8 else 0 end;
  end loop;
  return round((100::float8 * exp(0.08::float8 * (ovr - 50::float8)) * (1::float8 + bonus))::numeric)::int;
end $$;

-- Formato de poderes del motor (js/slr/motor-v1.1.0.js):
--   { "nombre": "Batuta", "momento": "posesion", "probabilidad": 0.25 | "siempre",
--     "efecto": 0.15, "nivel": "simple" | "fuerte" | "muy fuerte" }
create function public.validar_poderes(p_poderes jsonb) returns void
language plpgsql immutable set search_path = public, extensions as $$
declare
  p      jsonb;
  i      int := 0;
  quien  text;
  v_prob jsonb;
begin
  if jsonb_typeof(p_poderes) <> 'array' then
    raise exception 'poderes tiene que ser una lista: [] si no tiene, o [{"nombre": …}, …]' using errcode = 'P0001';
  end if;
  for p in select x from jsonb_array_elements(p_poderes) x loop
    i := i + 1;
    quien := format('Poder %s%s', i, coalesce(' («' || (p ->> 'nombre') || '»)', ''));
    if jsonb_typeof(p) <> 'object' then
      raise exception '%: cada poder es un objeto {"nombre", "momento", "probabilidad", "efecto", "nivel"}', quien using errcode = 'P0001';
    end if;
    if coalesce(trim(p ->> 'nombre'), '') = '' then
      raise exception '%: falta "nombre"', quien using errcode = 'P0001';
    end if;
    if coalesce(p ->> 'momento', '') not in ('posesion', 'ocasion_ataque', 'ocasion_defensa', 'tirador', 'chut', 'parada') then
      raise exception '%: "momento" tiene que ser posesion, ocasion_ataque, ocasion_defensa, tirador, chut o parada (es «%»)',
        quien, coalesce(p ->> 'momento', 'nada') using errcode = 'P0001';
    end if;
    v_prob := p -> 'probabilidad';
    if not (v_prob = '"siempre"'::jsonb
            or (jsonb_typeof(v_prob) = 'number' and (v_prob #>> '{}')::numeric > 0 and (v_prob #>> '{}')::numeric <= 1)) then
      raise exception '%: "probabilidad" es un número entre 0 y 1 (0.25 = 25 %%) o "siempre"', quien using errcode = 'P0001';
    end if;
    if jsonb_typeof(p -> 'efecto') <> 'number' or (p ->> 'efecto')::numeric <= 0 then
      raise exception '%: "efecto" es un número mayor que 0 (0.15 = +15 %%; en tirador, el multiplicador: 2 = ×2)', quien using errcode = 'P0001';
    end if;
    if coalesce(p ->> 'nivel', '') not in ('simple', 'fuerte', 'muy fuerte') then
      raise exception '%: "nivel" tiene que ser simple, fuerte o muy fuerte (sube el valor un 15, 35 o 60 %%)', quien using errcode = 'P0001';
    end if;
  end loop;
end $$;

-- Antes de guardar: nombre limpio, poderes válidos y valor recalculado (siempre:
-- el valor nunca se escribe a mano)
create function public.disenos_carta_antes() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  new.nombre := trim(new.nombre);
  if new.nombre = '' then
    raise exception 'La carta necesita un nombre' using errcode = 'P0001';
  end if;
  new.poderes := coalesce(new.poderes, '[]'::jsonb);
  new.personas := coalesce(new.personas, '{}');
  perform validar_poderes(new.poderes);
  new.valor := valor_diseno(new.ata, new.def, new.con, new.poderes);
  return new;
end $$;

-- Después: un diseño nuevo o reactivado tiene un ejemplar libre en cada liga real
create function public.disenos_carta_despues() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.activo and (tg_op = 'INSERT' or not old.activo) then
    insert into cartas (liga_id, diseno_id)
    select l.id, new.id from ligas l where not l.es_prueba
    on conflict on constraint cartas_liga_diseno_key do nothing;
  end if;
  return null;
end $$;

-- El valor tiene ahora un valor por defecto para que una fila nueva no lo necesite
-- (el trigger lo sustituye por el calculado)
alter table public.disenos_carta alter column valor set default 1;

create trigger disenos_carta_antes before insert or update on public.disenos_carta
  for each row execute function public.disenos_carta_antes();
create trigger disenos_carta_despues after insert or update of activo on public.disenos_carta
  for each row execute function public.disenos_carta_despues();

-- Todo el catálogo pasa por el trigger una vez: si la fórmula SQL difiriera de
-- la de valor.js en alguna carta, el test lo detecta
update public.disenos_carta d set nombre = d.nombre;

/* ── 2. Herramienta de plantillas (modo pruebas) ────────────────────────── */
-- El álbum admite la vía 'admin'
do $$
declare v_con text;
begin
  select c.conname into v_con from pg_constraint c
  where c.conrelid = 'public.album'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%via_adquisicion%';
  execute format('alter table public.album drop constraint %I', v_con);
end $$;
alter table public.album add constraint album_via_adquisicion_check check (via_adquisicion in
  ('sobre_basico', 'sobre_premium', 'sobre_eleccion', 'subasta', 'compra', 'clausula', 'intercambio', 'inicial', 'admin'));

-- Quita una carta de la alineación guardada de un equipo: su hueco queda vacío
-- (el cierre lo resuelve con un suplente) y, si era el capitán, sin capitán
create function public.quitar_de_alineacion(p_equipo uuid, p_carta uuid) returns void
language sql volatile set search_path = public, extensions as $$
  update alineaciones a set
    huecos = jsonb_build_object(
      'por', case when a.huecos ->> 'por' = p_carta::text then 'null'::jsonb else a.huecos -> 'por' end,
      'def', (select coalesce(jsonb_agg(case when x #>> '{}' = p_carta::text then 'null'::jsonb else x end order by o), '[]')
              from jsonb_array_elements(a.huecos -> 'def') with ordinality t(x, o)),
      'med', (select coalesce(jsonb_agg(case when x #>> '{}' = p_carta::text then 'null'::jsonb else x end order by o), '[]')
              from jsonb_array_elements(a.huecos -> 'med') with ordinality t(x, o)),
      'del', (select coalesce(jsonb_agg(case when x #>> '{}' = p_carta::text then 'null'::jsonb else x end order by o), '[]')
              from jsonb_array_elements(a.huecos -> 'del') with ordinality t(x, o))),
    banquillo = array_remove(a.banquillo, p_carta),
    capitan_id = case when a.capitan_id = p_carta then null else a.capitan_id end
  where a.equipo_id = p_equipo
$$;

create function public.slr_admin_buscar_cartas(token text, liga_id uuid, texto text default '') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_admin_buscar_cartas.token);
  v_liga    uuid := slr_admin_buscar_cartas.liga_id;
  v_texto   text := lower(trim(coalesce(slr_admin_buscar_cartas.texto, '')));
begin
  perform exigir_modo_beta(v_usuario, v_liga);
  return coalesce((
    select jsonb_agg(carta_json(x.id) || jsonb_build_object(
             'equipo_id', x.equipo_id, 'equipo', (select e.nombre from equipos e where e.id = x.equipo_id))
           order by x.nombre)
    from (select c.id, c.equipo_id, d.nombre
          from cartas c join disenos_carta d on d.id = c.diseno_id
          where c.liga_id = v_liga and (v_texto = '' or lower(d.nombre) like '%' || v_texto || '%')
          order by d.nombre limit 40) x), '[]'::jsonb);
end $$;

-- Da una carta a un equipo (equipo_id) o la deja libre (equipo_id null)
create function public.slr_admin_mover_carta(token text, liga_id uuid, carta_id uuid, equipo_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_admin_mover_carta.token);
  v_liga    uuid := slr_admin_mover_carta.liga_id;
  v_carta   uuid := slr_admin_mover_carta.carta_id;
  v_destino uuid := slr_admin_mover_carta.equipo_id;
  v_c       cartas;
  v_nombre  text;
  v_antes   text;
  v_ahora   text;
begin
  perform exigir_modo_beta(v_usuario, v_liga);
  select * into v_c from cartas c where c.id = v_carta and c.liga_id = v_liga for update;
  if not found then
    raise exception 'Esa carta no es de esta liga' using errcode = 'P0001';
  end if;
  if v_destino is not null and not exists (select 1 from equipos e where e.id = v_destino and e.liga_id = v_liga) then
    raise exception 'Ese equipo no es de esta liga' using errcode = 'P0001';
  end if;
  if v_c.equipo_id is not distinct from v_destino then
    raise exception 'La carta ya está ahí' using errcode = 'P0001';
  end if;
  if v_destino is not null then
    perform exigir_hueco(v_destino, 1);          -- plantilla máxima (15)
  end if;

  v_nombre := nombre_carta(v_carta);
  v_antes := (select e.nombre from equipos e where e.id = v_c.equipo_id);
  v_ahora := (select e.nombre from equipos e where e.id = v_destino);
  if v_c.equipo_id is not null then
    perform quitar_de_alineacion(v_c.equipo_id, v_carta);
  end if;
  update subastas s set estado = 'cancelada' where s.carta_id = v_carta and s.estado = 'abierta';

  if v_destino is null then
    perform cancelar_pendientes_carta(v_carta);
    update cartas c set equipo_id = null, blindada_hasta = null, multiplicador_clausula = 1.5,
                        reservada_hasta = null, reservada_por = null, adquirida_en = null
     where c.id = v_carta;
  else
    perform adquirir_carta(v_carta, v_destino, 'admin');   -- ventas, ofertas, intercambios, blindaje y álbum
  end if;

  perform apuntar_historial(v_liga, 'admin_carta',
    case when v_destino is null then format('El administrador deja libre a %s (era de %s)', v_nombre, v_antes)
         when v_antes is null then format('El administrador da %s a %s', v_nombre, v_ahora)
         else format('El administrador pasa %s de %s a %s', v_nombre, v_antes, v_ahora) end,
    jsonb_build_object('carta_id', v_carta, 'antiguo_id', v_c.equipo_id, 'equipo_id', v_destino));
  if v_c.equipo_id is not null then
    perform notificar(v_c.equipo_id, 'admin_carta', format('%s ya no está en tu plantilla (modo pruebas)', v_nombre),
      jsonb_build_object('carta_id', v_carta));
  end if;
  if v_destino is not null then
    perform notificar(v_destino, 'admin_carta', format('%s llega a tu plantilla (modo pruebas)', v_nombre),
      jsonb_build_object('carta_id', v_carta));
  end if;
  return jsonb_build_object('carta_id', v_carta, 'nombre', v_nombre, 'antes', v_antes, 'ahora', v_ahora);
end $$;

/* ── 3. Pronóstico contra cualquier rival ───────────────────────────────── */
-- Sin rival: el próximo partido (como hasta ahora). Con rival: tu alineación
-- guardada contra la suya, tú de local. Las stats tocadas cuentan para la
-- próxima jornada del equipo.
drop function public.motor_preparar_pronostico(text, uuid);
create function public.motor_preparar_pronostico(p_token text, p_equipo uuid, p_rival uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(p_token);
  v_liga    uuid;
  v_j       uuid;
  r         record;
begin
  select e.liga_id into v_liga from equipos e where e.id = p_equipo;
  if v_liga is null then
    raise exception 'Ese equipo no existe' using errcode = 'P0001';
  end if;
  perform exigir_miembro(v_usuario, v_liga);
  select p.id as partido_id, p.local_id, p.visitante_id, j.id as jornada_id, j.numero, j.cierre_en into r
  from partidos p join jornadas j on j.id = p.jornada_id
  where j.temporada_id = (temporada_actual(v_liga)).id and j.estado = 'programada'
    and (p.local_id = p_equipo or p.visitante_id = p_equipo)
  order by j.numero limit 1;

  if p_rival is null then
    if r.partido_id is null then
      return jsonb_build_object('sin_partido', true);
    end if;
    return jsonb_build_object(
      'partido_id', r.partido_id, 'jornada', r.numero, 'cierre_en', r.cierre_en,
      'es_local', r.local_id = p_equipo,
      'rival_id', case when r.local_id = p_equipo then r.visitante_id else r.local_id end,
      'local', congelar_alineacion(r.local_id, r.jornada_id),
      'visitante', congelar_alineacion(r.visitante_id, r.jornada_id));
  end if;

  if p_rival = p_equipo or not exists (select 1 from equipos e where e.id = p_rival and e.liga_id = v_liga) then
    raise exception 'Elige un rival de tu liga' using errcode = 'P0001';
  end if;
  if not exists (select 1 from alineaciones a where a.equipo_id = p_rival) then
    raise exception 'Ese equipo todavía no tiene alineación' using errcode = 'P0001';
  end if;
  -- Si el rival elegido es el del próximo partido, se respeta quién juega en casa
  if r.partido_id is not null and p_rival in (r.local_id, r.visitante_id) then
    return jsonb_build_object(
      'partido_id', r.partido_id, 'jornada', r.numero, 'cierre_en', r.cierre_en,
      'es_local', r.local_id = p_equipo, 'rival_id', p_rival,
      'local', congelar_alineacion(r.local_id, r.jornada_id),
      'visitante', congelar_alineacion(r.visitante_id, r.jornada_id));
  end if;
  v_j := r.jornada_id;
  return jsonb_build_object('es_local', true, 'rival_id', p_rival,
    'local', congelar_alineacion(p_equipo, v_j), 'visitante', congelar_alineacion(p_rival, v_j));
end $$;

revoke execute on function public.motor_preparar_pronostico(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.motor_preparar_pronostico(text, uuid, uuid) to service_role;

revoke execute on function
  public.valor_diseno(int, int, int, jsonb), public.validar_poderes(jsonb), public.quitar_de_alineacion(uuid, uuid)
from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['slr_admin_buscar_cartas(text, uuid, text)', 'slr_admin_mover_carta(text, uuid, uuid, uuid)'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

/* ── Cartas inactivas: fuera de sobres, subastas y plantillas nuevas ─────── */
-- Copias de la última versión de cada función con "and d.activo" en las
-- selecciones de cartas libres (generadas a partir de las migraciones anteriores)

-- abrir_tanda (de 20261013000200_slr_mercado_operaciones.sql): 1 selecciones de cartas libres, ahora con d.activo
create or replace function public.abrir_tanda(p_liga uuid, p_fecha date, p_ahora timestamptz) returns int
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
    where c.liga_id = p_liga and c.equipo_id is null and d.activo and c.reservada_por is null
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

-- sortear_carta_sobre (de 20261013000200_slr_mercado_operaciones.sql): 1 selecciones de cartas libres, ahora con d.activo
create or replace function public.sortear_carta_sobre(p_liga uuid, p_pesos jsonb, p_excluir uuid[], p_solo_especiales boolean)
returns uuid
language sql volatile set search_path = public, extensions as $$
  select c.id
  from cartas c join disenos_carta d on d.id = c.diseno_id
  where c.liga_id = p_liga and c.equipo_id is null and d.activo and c.reservada_por is null
    and c.id <> all(p_excluir)
    and coalesce((p_pesos ->> d.tipo)::numeric, 0) > 0
    and (not p_solo_especiales or d.tipo <> 'individual')
    and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
  order by -ln(1 - random()) / (p_pesos ->> d.tipo)::numeric
  limit 1
  for update of c
$$;

-- slr_comprar_sobre (de 20261013010000_slr_acabados.sql): 1 selecciones de cartas libres, ahora con d.activo
create or replace function public.slr_comprar_sobre(token text, liga_id uuid, tipo text) returns jsonb
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

  -- Hueco: el sobre de elección da 1 carta; el resto, todas las del sobre
  if v_tipo = 'eleccion' then
    perform exigir_hueco(v_eq.id, 1);
  elsif plantilla_ocupada(v_eq.id) + v_n > plantilla_maxima(v_liga) then
    raise exception 'Para comprar este sobre necesitas como mucho % cartas en la plantilla', plantilla_maxima(v_liga) - v_n
      using errcode = 'P0001';
  end if;

  select count(*) into v_libres
  from cartas c join disenos_carta d on d.id = c.diseno_id
  where c.liga_id = v_liga and c.equipo_id is null and d.activo and c.reservada_por is null
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
    v_entregada := v_c;   -- un ejemplar por diseño: se entrega el que sale
    v_excluir := v_excluir || v_c;
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

-- asignar_plantilla_inicial (de 20261013020100_slr_temporadas_funciones.sql): 2 selecciones de cartas libres, ahora con d.activo
create or replace function public.asignar_plantilla_inicial(p_liga uuid, p_equipo uuid, p_config jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_n_obj     int     := coalesce((p_config ->> 'plantilla_inicial')::int, 11);
  v_tol       numeric := coalesce((p_config ->> 'plantilla_inicial_tolerancia')::numeric, 0.10);
  v_blindaje  interval := make_interval(days => coalesce((p_config ->> 'blindaje_dias')::int, 7));
  v_caras     uuid[]  := individuales_caras(coalesce((p_config ->> 'plantilla_inicial_excluir_top')::numeric, 0.20));
  v_objetivo  numeric := objetivo_plantilla(p_liga);
  v_ids       uuid[];
  v_vals      int[];
  v_fijas     uuid[] := '{}';   -- caras imprescindibles para llegar a 11
  v_valor_fijas int := 0;
  v_n         int;
  v_k         int;
  v_sel       int[];
  v_mejor     int[];
  v_mejor_dif numeric;
  v_suma      numeric;
  v_dif       numeric;
  v_mejora    boolean;
  v_ba int; v_bb int; v_bdif numeric;
  v_elegidas  uuid[];
begin
  -- Bombo: individuales libres, no reservadas ni en subasta, fuera del % caro
  select array_agg(x.id order by x.id), array_agg(x.valor order by x.id) into v_ids, v_vals
  from (
    select c.id, d.valor from cartas c join disenos_carta d on d.id = c.diseno_id
    where c.liga_id = p_liga and c.equipo_id is null and d.activo and d.tipo = 'individual' and c.reservada_por is null
      and d.id <> all(v_caras)
      and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
    for update of c
  ) x;
  v_n := coalesce(cardinality(v_ids), 0);

  -- Si no llegan, las más baratas de las caras libres (nunca las más caras primero)
  if v_n < v_n_obj then
    select coalesce(array_agg(x.id order by x.valor, x.id), '{}'), coalesce(sum(x.valor), 0) into v_fijas, v_valor_fijas
    from (
      select c.id, d.valor from cartas c join disenos_carta d on d.id = c.diseno_id
      where c.liga_id = p_liga and c.equipo_id is null and d.activo and d.tipo = 'individual' and c.reservada_por is null
        and d.id = any(v_caras)
        and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
      order by d.valor, c.id
      limit v_n_obj - v_n
      for update of c
    ) x;
  end if;

  v_k := least(v_n_obj - cardinality(v_fijas), v_n);
  if v_n = 0 then
    v_mejor := '{}';
  elsif v_n <= v_k then
    v_mejor := array(select generate_series(1, v_n));
  else
    v_mejor_dif := null;
    for intento in 1..40 loop
      v_sel := array(select i from generate_series(1, v_n) i order by random() limit v_k);
      select sum(v_vals[i]) + v_valor_fijas into v_suma from unnest(v_sel) i;
      v_dif := abs(v_suma - v_objetivo);
      if v_mejor_dif is null or v_dif < v_mejor_dif then v_mejor := v_sel; v_mejor_dif := v_dif; end if;
      exit when v_mejor_dif <= v_tol * v_objetivo;
    end loop;
    select sum(v_vals[i]) + v_valor_fijas into v_suma from unnest(v_mejor) i;
    for paso in 1..60 loop
      exit when abs(v_suma - v_objetivo) <= v_tol * v_objetivo;
      v_bdif := abs(v_suma - v_objetivo);
      v_mejora := false;
      for a in 1..v_k loop
        for b in 1..v_n loop
          continue when b = any(v_mejor);
          v_dif := abs(v_suma - v_vals[v_mejor[a]] + v_vals[b] - v_objetivo);
          if v_dif < v_bdif then v_bdif := v_dif; v_ba := a; v_bb := b; v_mejora := true; end if;
        end loop;
      end loop;
      exit when not v_mejora;
      v_suma := v_suma - v_vals[v_mejor[v_ba]] + v_vals[v_bb];
      v_mejor[v_ba] := v_bb;
    end loop;
  end if;

  v_elegidas := array(select v_ids[i] from unnest(v_mejor) i) || v_fijas;
  select coalesce(sum(d.valor), 0) into v_suma from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = any(v_elegidas);

  update cartas c
     set equipo_id = p_equipo, blindada_hasta = now() + v_blindaje, multiplicador_clausula = 1.5, adquirida_en = now()
   where c.id = any(v_elegidas);

  return jsonb_build_object(
    'cartas', to_jsonb(v_elegidas), 'valor_total', v_suma, 'objetivo', round(v_objetivo, 2),
    'caras_usadas', cardinality(v_fijas), 'disponibles', v_n,
    'dentro', abs(v_suma - v_objetivo) <= v_tol * v_objetivo);
end $$;

