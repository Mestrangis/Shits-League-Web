-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — sobres nuevos (mercado, fase 2)
--   · Fuera el sobre premium y su garantía. Cinco tipos en tipos_sobre:
--     sencillo (1), básico (3), elección (3 candidatas, eliges 1 en 10 min),
--     de posición (1 del perfil elegido; las equilibradas valen para todos) y
--     de colección (1 de la colección de la semana).
--   · tipos_sobre: filas por defecto (liga_id null) y, si el admin las edita
--     desde el Modo pruebas, filas propias de su liga. Precio por tramo de la
--     progresión (J1–3 / J4–5 / J6+); sin progresión, el último.
--   · Colección de la semana: cada lunes a las 00:00 (hora de la liga) una al
--     azar entre las que tienen cartas que pueden salir; el admin la cambia.
--   · Solo cartas libres (fuera de subasta y no reservadas) y con progresión.
--     Si un sobre no se puede llenar: agotado (no se compra).
--   · Historial público solo de los sobres con épica o legendaria.
--   · Dorso de las cartas: ligas.config.dorso_url o, si no, ajustes.dorso_carta_url.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tablas ─────────────────────────────────────────────────────────────────
create table public.tipos_sobre (
  id          uuid primary key default gen_random_uuid(),
  liga_id     uuid references public.ligas(id) on delete cascade,     -- null: por defecto
  tipo        text not null check (tipo in ('sencillo', 'basico', 'eleccion', 'posicion', 'coleccion')),
  nombre      text not null check (length(trim(nombre)) between 2 and 30),
  descripcion text not null default '' check (length(descripcion) <= 200),
  precios     int[] not null check (cardinality(precios) = 3 and 0 < all(precios)),   -- J1–3, J4–5, J6+
  cartas      int not null check (cartas between 1 and 5),
  pesos       jsonb not null,
  imagen_url  text,
  activo      boolean not null default true,
  orden       int not null default 0,
  editado_en  timestamptz not null default now()
);
create unique index tipos_sobre_liga_tipo on public.tipos_sobre (coalesce(liga_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo);
alter table public.tipos_sobre enable row level security;
revoke all on public.tipos_sobre from anon, authenticated;
grant select on public.tipos_sobre to anon, authenticated;
create policy lectura_publica on public.tipos_sobre for select to anon, authenticated using (true);

insert into public.tipos_sobre (tipo, nombre, descripcion, precios, cartas, pesos, orden) values
  ('sencillo', 'Sencillo', 'Una carta al azar.', '{500,600,650}', 1,
   '{"comun": 72, "rara": 22, "epica": 5, "legendaria": 1}', 1),
  ('basico', 'Básico', 'Tres cartas al azar.', '{1500,1800,2000}', 3,
   '{"comun": 72, "rara": 22, "epica": 5, "legendaria": 1}', 2),
  ('eleccion', 'Elección', 'Tres candidatas (al menos una rara o mejor): te quedas con una en 10 minutos.', '{950,1600,2100}', 3,
   '{"comun": 50, "rara": 34, "epica": 12, "legendaria": 4}', 3),
  ('posicion', 'De posición', 'Eliges portero, defensa, control o atacante y te llevas una carta de ese perfil.', '{550,850,950}', 1,
   '{"comun": 55, "rara": 30, "epica": 12, "legendaria": 3}', 4),
  ('coleccion', 'De colección', 'Una carta de la colección de la semana.', '{600,850,900}', 1,
   '{"comun": 55, "rara": 30, "epica": 12, "legendaria": 3}', 5);

create table public.colecciones_semana (
  liga_id       uuid not null references public.ligas(id) on delete cascade,
  semana        date not null,                 -- el lunes
  coleccion_id  uuid references public.colecciones(id) on delete set null,
  manual        boolean not null default false,
  elegida_en    timestamptz not null default now(),
  primary key (liga_id, semana)
);
alter table public.colecciones_semana enable row level security;
revoke all on public.colecciones_semana from anon, authenticated;
grant select on public.colecciones_semana to anon, authenticated;
create policy lectura_publica on public.colecciones_semana for select to anon, authenticated using (true);

alter table public.sobres_abiertos drop constraint sobres_abiertos_tipo_check;
alter table public.sobres_abiertos add constraint sobres_abiertos_tipo_check
  check (tipo in ('sencillo', 'basico', 'eleccion', 'posicion', 'coleccion', 'premium'));   -- premium: solo los ya abiertos
alter table public.sobres_abiertos add column filtro jsonb;   -- perfil o colección del sobre
alter table public.album drop constraint album_via_adquisicion_check;
alter table public.album add constraint album_via_adquisicion_check check (via_adquisicion in
  ('sobre_sencillo', 'sobre_basico', 'sobre_premium', 'sobre_eleccion', 'sobre_posicion', 'sobre_coleccion',
   'subasta', 'compra', 'clausula', 'intercambio', 'inicial', 'admin'));

insert into public.ajustes (clave, valor, descripcion) values
  ('dorso_carta_url', 'null', 'Imagen del dorso de las cartas (5:7). null: el dorso provisional generado por código')
on conflict (clave) do nothing;

-- La configuración ya no lleva sobres (ni el premium ni su garantía)
do $do$
declare
  v_def jsonb := config_liga_por_defecto() - 'sobres';
begin
  execute format('create or replace function public.config_liga_por_defecto() returns jsonb '
                 'language sql immutable as $b$ select %L::jsonb $b$', v_def);
  update public.ligas l set config = l.config - 'sobres' where l.config ? 'sobres';
end $do$;
-- equipos.contador_garantia_premium queda sin uso (reiniciar_para_temporada aún lo pone a 0)

-- ── Tipos de una liga, precio y disponibilidad ────────────────────────────
create function public.tipos_sobre_liga(p_liga uuid) returns setof public.tipos_sobre
language sql stable set search_path = public, extensions as $$
  select t.* from tipos_sobre t
  where t.liga_id = p_liga
     or (t.liga_id is null and not exists (select 1 from tipos_sobre p where p.liga_id = p_liga and p.tipo = t.tipo))
  order by t.orden, t.tipo
$$;

-- Tramo de precio (1, 2, 3): cuántos tramos de la progresión ha alcanzado la jornada; sin progresión, el último
create function public.tramo_precio(p_liga uuid) returns int
language sql stable set search_path = public, extensions as $$
  select case when not progresion_activa(p_liga) then 3
    else greatest(1, least(3, (select count(*) from jsonb_array_elements(config_liga(p_liga) -> 'progresion' -> 'tramos') t
                               where (t ->> 'desde')::int <= jornada_progresion(p_liga))::int)) end
$$;

create function public.semana_liga(p_liga uuid, p_ahora timestamptz default now()) returns date
language sql stable set search_path = public, extensions as $$
  select date_trunc('week', p_ahora at time zone coalesce(config_liga(p_liga) ->> 'zona_horaria', 'Europe/Madrid'))::date
$$;

-- Cartas que pueden salir ahora con un filtro (perfil o colección), por rareza
create function public.disponibles_sobre(p_liga uuid, p_pesos jsonb, p_filtro jsonb) returns jsonb
language sql stable set search_path = public, extensions as $$
  select coalesce(jsonb_object_agg(x.rareza, x.n), '{}') from (
    select d.rareza, count(*) n
    from cartas c join disenos_carta d on d.id = c.diseno_id
    where c.liga_id = p_liga and c.equipo_id is null and d.activo and c.reservada_por is null
      and coalesce((p_pesos ->> d.rareza)::numeric, 0) > 0
      and en_bombo(p_liga, d.rareza, c.libera_jornada)
      and (p_filtro ->> 'perfil' is null or d.perfil in (p_filtro ->> 'perfil', 'equilibrado'))
      and (p_filtro ->> 'coleccion_id' is null or d.coleccion_id = (p_filtro ->> 'coleccion_id')::uuid)
      and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
    group by d.rareza) x
$$;

-- Colección de la semana (la elige si aún no hay para esta semana)
create function public.coleccion_semana(p_liga uuid, p_ahora timestamptz default now()) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_semana date := semana_liga(p_liga, p_ahora);
  v_col    uuid;
begin
  select cs.coleccion_id into v_col from colecciones_semana cs where cs.liga_id = p_liga and cs.semana = v_semana;
  if found then
    return v_col;
  end if;
  perform asignar_cupos(p_liga);
  select k.id into v_col
  from colecciones k
  where (k.liga_prueba_id is null or k.liga_prueba_id = p_liga)
    and exists (select 1 from cartas c join disenos_carta d on d.id = c.diseno_id
                where c.liga_id = p_liga and d.coleccion_id = k.id and c.equipo_id is null and d.activo
                  and c.reservada_por is null and en_bombo(p_liga, d.rareza, c.libera_jornada)
                  and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta'))
  order by random() limit 1;
  insert into colecciones_semana (liga_id, semana, coleccion_id) values (p_liga, v_semana, v_col)
  on conflict do nothing;
  if v_col is not null then
    perform apuntar_historial(p_liga, 'coleccion_semana',
      format('Colección de la semana: %s', (select k.nombre from colecciones k where k.id = v_col)),
      jsonb_build_object('coleccion_id', v_col, 'semana', v_semana));
  end if;
  return v_col;
end $$;

-- Probabilidad por rareza de la primera carta: los pesos entre lo que puede salir
create function public.probabilidades_sobre(p_pesos jsonb, p_disp jsonb) returns jsonb
language sql immutable as $$
  with x as (select k, (p_pesos ->> k)::numeric w from jsonb_object_keys(p_pesos) k
             where coalesce((p_disp ->> k)::int, 0) > 0 and (p_pesos ->> k)::numeric > 0)
  select coalesce(jsonb_object_agg(k, round(w / (select sum(w) from x), 4)), '{}') from x
$$;

-- Ficha de un tipo para la tienda: precio actual, probabilidades, agotado y cuántas quedan
create function public.sobre_tienda(p_liga uuid, t tipos_sobre, p_col uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_filtro  jsonb := case when t.tipo = 'coleccion' then jsonb_build_object('coleccion_id', p_col) end;
  v_disp    jsonb;
  v_total   int;
  v_perfil  jsonb := '{}';
  v_agotado boolean;
  p         text;
  n         int;
begin
  v_disp := case when t.tipo = 'coleccion' and p_col is null then '{}'::jsonb else disponibles_sobre(p_liga, t.pesos, v_filtro) end;
  v_total := (select coalesce(sum(value::int), 0) from jsonb_each_text(v_disp));
  v_agotado := v_total < t.cartas;
  if t.tipo = 'posicion' then
    foreach p in array array['portero', 'defensa', 'control', 'atacante'] loop
      n := (select coalesce(sum(value::int), 0) from jsonb_each_text(disponibles_sobre(p_liga, t.pesos, jsonb_build_object('perfil', p))));
      v_perfil := v_perfil || jsonb_build_object(p, n);
    end loop;
    v_agotado := not exists (select 1 from jsonb_each_text(v_perfil) where value::int >= 1);
  end if;
  return jsonb_build_object(
    'tipo', t.tipo, 'nombre', t.nombre, 'descripcion', t.descripcion, 'cartas', t.cartas,
    'precio', t.precios[tramo_precio(p_liga)], 'precios', to_jsonb(t.precios), 'pesos', t.pesos,
    'probabilidades', probabilidades_sobre(t.pesos, v_disp), 'imagen_url', t.imagen_url,
    'activo', t.activo, 'orden', t.orden, 'propio', t.liga_id is not null,
    'agotado', v_agotado, 'quedan', v_total, 'por_perfil', case when t.tipo = 'posicion' then v_perfil end);
end $$;

-- ── Tienda (una llamada para la pantalla de sobres) ───────────────────────
create function public.slr_tienda(token text, liga_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_tienda.token);
  v_liga    uuid := slr_tienda.liga_id;
  v_eq      equipos := equipo_en_liga(v_usuario, v_liga);
  v_col     uuid;
begin
  perform asignar_cupos(v_liga);
  v_col := coleccion_semana(v_liga);
  return jsonb_build_object(
    'saldo', (select e.saldo from equipos e where e.id = v_eq.id),
    'plantilla', jsonb_build_object('ocupada', plantilla_ocupada(v_eq.id), 'maxima', plantilla_maxima(v_liga)),
    'progresion', estado_progresion(v_liga),
    'cerrado', liga_bloqueada(v_liga),
    'coleccion_semana', (select jsonb_build_object('id', k.id, 'nombre', k.nombre, 'color', k.color, 'emblema_url', k.emblema_url,
                                                   'total', (select count(*) from disenos_carta d where d.coleccion_id = k.id and d.activo),
                                                   'tengo', (select count(*) from album a join disenos_carta d on d.id = a.diseno_id
                                                             where a.usuario_id = v_usuario and a.liga_id = v_liga and d.coleccion_id = k.id))
                         from colecciones k where k.id = v_col),
    'tipos', coalesce((select jsonb_agg(sobre_tienda(v_liga, t, v_col) order by t.orden, t.tipo)
                       from tipos_sobre_liga(v_liga) t where t.activo), '[]'),
    'pendiente', sobre_pendiente(v_eq.id),
    'dorso_url', coalesce(config_liga(v_liga) ->> 'dorso_url', (select a.valor #>> '{}' from ajustes a where a.clave = 'dorso_carta_url')));
end $$;

-- Carta del sobre con lo que la interfaz necesita: nueva en el álbum y progreso de su colección
create function public.carta_sobre(p_carta uuid, p_usuario uuid, p_nueva boolean) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select carta_json(p_carta) || jsonb_build_object('nueva', p_nueva,
    'coleccion', (select jsonb_build_object('id', k.id, 'nombre', k.nombre, 'color', k.color, 'emblema_url', k.emblema_url,
                    'total', (select count(*) from disenos_carta d2 where d2.coleccion_id = k.id and d2.activo),
                    'tengo', (select count(*) from album a join disenos_carta d2 on d2.id = a.diseno_id
                              where a.usuario_id = p_usuario and a.liga_id = c.liga_id and d2.coleccion_id = k.id))
                  from colecciones k where k.id = d.coleccion_id))
  from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = p_carta
$$;

create function public.es_nueva(p_carta uuid, p_usuario uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select not exists (select 1 from album a join cartas c on c.diseno_id = a.diseno_id and c.liga_id = a.liga_id
                     where c.id = p_carta and a.usuario_id = p_usuario)
$$;

-- Elección pendiente de un equipo (reaparece en cualquier pantalla)
create function public.sobre_pendiente(p_equipo uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object('sobre_id', s.id, 'tipo', s.tipo, 'caduca_en', s.caduca_en,
           'candidatas', (select jsonb_agg(carta_sobre(x, e.usuario_id, es_nueva(x, e.usuario_id)) order by o)
                          from unnest(s.cartas) with ordinality t(x, o)))
  from sobres_abiertos s join equipos e on e.id = s.equipo_id
  where s.equipo_id = p_equipo and s.estado = 'pendiente_eleccion' and s.caduca_en > now()
  order by s.creado_en desc limit 1
$$;

create function public.slr_sobre_pendiente(token text, liga_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  return sobre_pendiente((equipo_en_liga(sesion_usuario(slr_sobre_pendiente.token), slr_sobre_pendiente.liga_id)).id);
end $$;

-- ── Comprar y abrir ───────────────────────────────────────────────────────
drop function public.slr_comprar_sobre(text, uuid, text);
create function public.slr_comprar_sobre(token text, liga_id uuid, tipo text, perfil text default null) returns jsonb
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

  -- Hueco: el de elección da 1 carta (la pendiente ocupa su hueco) y el resto, todas las del sobre
  v_huecos := case when v_tipo = 'eleccion' then 1 else v_n end;
  if plantilla_ocupada(v_eq.id) + v_huecos > plantilla_maxima(v_liga) then
    raise exception 'No tienes hueco: necesitas % % en la plantilla', v_huecos,
      case when v_huecos = 1 then 'hueco libre' else 'huecos libres' end using errcode = 'P0001';
  end if;

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
    'pendiente_eleccion', v_tipo = 'eleccion', 'caduca_en', v_caduca);
end $$;

-- Elección resuelta: historial solo si la elegida es épica o legendaria
create or replace function public.resolver_eleccion(p_sobre uuid, p_carta uuid) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_s       sobres_abiertos;
  v_elegida uuid;
  v_rareza  text;
begin
  select * into v_s from sobres_abiertos s where s.id = p_sobre for update;
  if not found then
    raise exception 'Sobre no encontrado' using errcode = 'P0001';
  end if;
  if v_s.estado <> 'pendiente_eleccion' then
    return v_s.elegida;
  end if;
  v_elegida := coalesce(p_carta, v_s.cartas[1]);
  if not (v_elegida = any(v_s.cartas)) then
    raise exception 'Esa carta no es una de las candidatas del sobre' using errcode = 'P0001';
  end if;

  update cartas c set reservada_hasta = null, reservada_por = null where c.reservada_por = p_sobre;
  update sobres_abiertos s set estado = 'abierto', elegida = v_elegida where s.id = p_sobre;
  perform adquirir_carta(v_elegida, v_s.equipo_id, 'sobre_eleccion');

  v_rareza := (select d.rareza from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = v_elegida);
  if rango_rareza(v_rareza) >= rango_rareza('epica') then
    perform apuntar_historial(v_s.liga_id, 'sobre', format('%s elige a %s (%s) de un sobre de elección',
              nombre_dueno(v_s.equipo_id), nombre_carta(v_elegida), case v_rareza when 'legendaria' then 'legendaria' else 'épica' end),
            jsonb_build_object('equipo_id', v_s.equipo_id, 'sobre_id', p_sobre, 'carta_id', v_elegida,
                               'automatica', p_carta is null, 'mejor', v_rareza));
  end if;
  if p_carta is null then
    perform notificar(v_s.equipo_id, 'eleccion_automatica',
      format('Se acabó el tiempo para elegir: te llevas a %s, la primera candidata del sobre', nombre_carta(v_elegida)),
      jsonb_build_object('sobre_id', p_sobre, 'carta_id', v_elegida));
  end if;
  return v_elegida;
end $$;

-- ── Admin (Modo pruebas) ──────────────────────────────────────────────────
-- Edita un tipo para su liga (copia la fila por defecto la primera vez)
create function public.slr_admin_guardar_sobre(token text, liga_id uuid, tipo text, datos jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  v_liga  uuid := slr_admin_guardar_sobre.liga_id;
  v_tipo  text := slr_admin_guardar_sobre.tipo;
  v_d     jsonb := coalesce(slr_admin_guardar_sobre.datos, '{}');
  v_base  tipos_sobre;
  v_pesos jsonb;
  k       text;
begin
  perform exigir_modo_beta(sesion_usuario(slr_admin_guardar_sobre.token), v_liga);
  select * into v_base from tipos_sobre_liga(v_liga) t where t.tipo = v_tipo;
  if not found then
    raise exception 'Tipo de sobre desconocido: %', v_tipo using errcode = 'P0001';
  end if;
  for k in select jsonb_object_keys(v_d) loop
    if k not in ('nombre', 'descripcion', 'precios', 'pesos', 'activo', 'imagen_url', 'orden') then
      raise exception 'Campo desconocido: %', k using errcode = 'P0001';
    end if;
  end loop;
  v_pesos := coalesce(v_d -> 'pesos', v_base.pesos);
  if jsonb_typeof(v_pesos) <> 'object'
     or exists (select 1 from jsonb_each(v_pesos) where key not in ('comun', 'rara', 'epica', 'legendaria')
                  or jsonb_typeof(value) <> 'number' or value::numeric < 0)
     or (select coalesce(sum(value::numeric), 0) from jsonb_each(v_pesos)) <= 0 then
    raise exception 'Pesos no válidos: números ≥ 0 para comun, rara, epica y legendaria, y alguno mayor que 0' using errcode = 'P0001';
  end if;
  if v_d ? 'precios' and (jsonb_typeof(v_d -> 'precios') <> 'array' or jsonb_array_length(v_d -> 'precios') <> 3
       or exists (select 1 from jsonb_array_elements(v_d -> 'precios') x where jsonb_typeof(x) <> 'number' or x::numeric < 1
                    or x::numeric <> trunc(x::numeric))) then
    raise exception 'Precios: tres números enteros positivos (J1–3, J4–5 y J6+)' using errcode = 'P0001';
  end if;
  insert into tipos_sobre as t (liga_id, tipo, nombre, descripcion, precios, cartas, pesos, imagen_url, activo, orden, editado_en)
  values (v_liga, v_tipo,
          coalesce(trim(v_d ->> 'nombre'), v_base.nombre), coalesce(v_d ->> 'descripcion', v_base.descripcion),
          coalesce(array(select x::int from jsonb_array_elements_text(v_d -> 'precios') x), v_base.precios),
          v_base.cartas, v_pesos,
          case when v_d ? 'imagen_url' then nullif(trim(v_d ->> 'imagen_url'), '') else v_base.imagen_url end,
          coalesce((v_d ->> 'activo')::boolean, v_base.activo), coalesce((v_d ->> 'orden')::int, v_base.orden), now())
  on conflict (coalesce(liga_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo) do update
    set nombre = excluded.nombre, descripcion = excluded.descripcion, precios = excluded.precios, pesos = excluded.pesos,
        imagen_url = excluded.imagen_url, activo = excluded.activo, orden = excluded.orden, editado_en = now();
  perform apuntar_historial(v_liga, 'admin_sobre', format('Sobre %s editado (modo pruebas)', v_tipo), jsonb_build_object('tipo', v_tipo, 'cambios', v_d));
  return (select to_jsonb(t) from tipos_sobre t where t.liga_id = v_liga and t.tipo = v_tipo);
end $$;

-- Cambia la colección de la semana a mano
create function public.slr_admin_coleccion_semana(token text, liga_id uuid, coleccion_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  v_liga uuid := slr_admin_coleccion_semana.liga_id;
  v_col  uuid := slr_admin_coleccion_semana.coleccion_id;
begin
  perform exigir_modo_beta(sesion_usuario(slr_admin_coleccion_semana.token), v_liga);
  if not exists (select 1 from colecciones k where k.id = v_col and (k.liga_prueba_id is null or k.liga_prueba_id = v_liga)) then
    raise exception 'Esa colección no existe en esta liga' using errcode = 'P0001';
  end if;
  insert into colecciones_semana (liga_id, semana, coleccion_id, manual) values (v_liga, semana_liga(v_liga), v_col, true)
  on conflict (liga_id, semana) do update set coleccion_id = excluded.coleccion_id, manual = true, elegida_en = now();
  perform apuntar_historial(v_liga, 'coleccion_semana',
    format('Colección de la semana: %s (elegida por el administrador)', (select k.nombre from colecciones k where k.id = v_col)),
    jsonb_build_object('coleccion_id', v_col, 'manual', true));
  return jsonb_build_object('coleccion_id', v_col, 'semana', semana_liga(v_liga));
end $$;

-- Dorso de las cartas de la liga (null: el de ajustes o el provisional)
create function public.slr_admin_dorso(token text, liga_id uuid, url text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_liga uuid := slr_admin_dorso.liga_id;
begin
  perform exigir_modo_beta(sesion_usuario(slr_admin_dorso.token), v_liga);
  update ligas l set config = case when nullif(trim(url), '') is null then l.config - 'dorso_url'
                                   else l.config || jsonb_build_object('dorso_url', trim(url)) end
   where l.id = v_liga;
  return jsonb_build_object('dorso_url', nullif(trim(url), ''));
end $$;

revoke execute on function public.tipos_sobre_liga(uuid), public.tramo_precio(uuid), public.semana_liga(uuid, timestamptz),
  public.disponibles_sobre(uuid, jsonb, jsonb), public.coleccion_semana(uuid, timestamptz), public.probabilidades_sobre(jsonb, jsonb),
  public.sobre_tienda(uuid, tipos_sobre, uuid), public.carta_sobre(uuid, uuid, boolean), public.es_nueva(uuid, uuid),
  public.sobre_pendiente(uuid) from public, anon, authenticated;
revoke execute on function public.slr_tienda(text, uuid), public.slr_sobre_pendiente(text, uuid),
  public.slr_comprar_sobre(text, uuid, text, text), public.slr_admin_guardar_sobre(text, uuid, text, jsonb),
  public.slr_admin_coleccion_semana(text, uuid, uuid), public.slr_admin_dorso(text, uuid, text) from public;
grant execute on function public.slr_tienda(text, uuid), public.slr_sobre_pendiente(text, uuid),
  public.slr_comprar_sobre(text, uuid, text, text), public.slr_admin_guardar_sobre(text, uuid, text, jsonb),
  public.slr_admin_coleccion_semana(text, uuid, uuid), public.slr_admin_dorso(text, uuid, text) to anon, authenticated;

-- Tareas del mercado: además, la colección de la semana
create or replace function public.slr_tareas_mercado(p_ahora timestamptz default now(), p_liga uuid default null) returns jsonb
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

    -- Colección de la semana (el lunes a las 00:00 se elige una nueva)
    perform coleccion_semana(l.id, p_ahora);

    v_fecha := (p_ahora at time zone coalesce(l.config ->> 'zona_horaria', 'Europe/Madrid'))::date;
    -- Con el mercado cerrado (ventana de jornada) no se abren subastas
    if not liga_bloqueada(l.id) and not exists (select 1 from tandas_mercado t where t.liga_id = l.id and t.fecha = v_fecha) then
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
