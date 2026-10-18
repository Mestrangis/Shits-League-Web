-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — progresión por jornadas (mercado, fase 1)
--   · Lo que puede salir en sobres y subastas mejora con las jornadas:
--     J1–3 comunes y raras · J4–5 también épicas · J6+ también legendarias.
--     Referencia: la próxima jornada pendiente de la temporada actual.
--   · Dosificación: desde la J4 entran 6 épicas nuevas por jornada y desde la J6,
--     2 legendarias. Al empezar la temporada (o cuando una carta vuelve libre sin
--     turno) cada épica/legendaria libre recibe su jornada de entrada
--     (cartas.libera_jornada) por orden aleatorio; hasta entonces no sale ni en
--     subastas ni en sobres.
--   · Los pesos de cada sobre y de las subastas se aplican solo entre las rarezas
--     desbloqueadas que tienen cartas (es decir, renormalizados).
--   · Todo en ligas.config.progresion. activa: "auto" (encendida solo en temporada
--     real: en curso y sin modo beta), true o false. jornada_prueba: fuerza la
--     jornada de referencia (Modo pruebas).
--   · Cláusulas, ventas e intercambios no cambian.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cartas
  add column libera_jornada   int,     -- jornada en la que entra al bombo (épicas y legendarias dosificadas)
  add column libera_temporada uuid;    -- temporada para la que se asignó (si cambia, se vuelve a asignar)

-- ── Configuración por defecto y ligas existentes ────────────────────────────
do $do$
declare
  v_prog jsonb := '{
    "activa": "auto",
    "tramos": [
      {"desde": 1, "rarezas": ["comun", "rara"]},
      {"desde": 4, "rarezas": ["comun", "rara", "epica"]},
      {"desde": 6, "rarezas": ["comun", "rara", "epica", "legendaria"]}
    ],
    "cupos": {
      "epica":      {"desde": 4, "por_jornada": 6},
      "legendaria": {"desde": 6, "por_jornada": 2}
    },
    "jornada_prueba": null
  }';
  v_def jsonb := config_liga_por_defecto() || jsonb_build_object('progresion', v_prog);
begin
  execute format('create or replace function public.config_liga_por_defecto() returns jsonb '
                 'language sql immutable as $b$ select %L::jsonb $b$', v_def);
  update public.ligas l set config = l.config || jsonb_build_object('progresion', v_prog)
   where not (l.config ? 'progresion');
end $do$;

-- ── Estado de la progresión ────────────────────────────────────────────────
create function public.progresion_activa(p_liga uuid) returns boolean
language sql stable set search_path = public, extensions as $$
  select case coalesce(l.config -> 'progresion' ->> 'activa', 'auto')
           when 'true' then true
           when 'false' then false
           else l.estado = 'en_curso' and not coalesce((l.config ->> 'modo_beta')::boolean, false)
         end
  from ligas l where l.id = p_liga
$$;

-- Jornada de referencia: la de prueba, o la próxima pendiente de la temporada actual
-- (si ya no queda ninguna, la siguiente a la última; sin temporada, la 1)
create function public.jornada_progresion(p_liga uuid) returns int
language sql stable set search_path = public, extensions as $$
  select coalesce(
    (config_liga(p_liga) -> 'progresion' ->> 'jornada_prueba')::int,
    (select min(j.numero) from jornadas j
      where j.temporada_id = (temporada_actual(p_liga)).id and j.estado in ('programada', 'cerrada', 'simulada')),
    (select max(j.numero) + 1 from jornadas j where j.temporada_id = (temporada_actual(p_liga)).id),
    1)
$$;

create function public.rarezas_desbloqueadas(p_liga uuid) returns text[]
language sql stable set search_path = public, extensions as $$
  select case when not progresion_activa(p_liga) then array['comun', 'rara', 'epica', 'legendaria']
    else coalesce((
      select array(select jsonb_array_elements_text(t -> 'rarezas'))
      from jsonb_array_elements(config_liga(p_liga) -> 'progresion' -> 'tramos') t
      where (t ->> 'desde')::int <= jornada_progresion(p_liga)
      order by (t ->> 'desde')::int desc limit 1), array['comun', 'rara']) end
$$;

-- Turno de entrada de las épicas y legendarias libres que aún no lo tienen para esta temporada
create function public.asignar_cupos(p_liga uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_temp uuid := coalesce((temporada_actual(p_liga)).id, p_liga);
  r      record;
  v_n    int;
begin
  if not progresion_activa(p_liga) then
    return;
  end if;
  for r in select k as rareza, (v ->> 'desde')::int as desde, greatest(1, (v ->> 'por_jornada')::int) as por
           from jsonb_each(config_liga(p_liga) -> 'progresion' -> 'cupos') x(k, v) loop
    select count(*) into v_n from cartas c join disenos_carta d on d.id = c.diseno_id
     where c.liga_id = p_liga and d.rareza = r.rareza and c.libera_temporada = v_temp;
    update cartas c
       set libera_jornada = r.desde + (v_n + x.k - 1) / r.por, libera_temporada = v_temp
      from (select c2.id, row_number() over (order by random()) as k
            from cartas c2 join disenos_carta d2 on d2.id = c2.diseno_id
            where c2.liga_id = p_liga and c2.equipo_id is null and d2.rareza = r.rareza and d2.activo
              and c2.libera_temporada is distinct from v_temp) x
     where c.id = x.id;
  end loop;
end $$;

-- ¿Puede salir esta carta ahora (sobres y subastas)?
create function public.en_bombo(p_liga uuid, p_rareza text, p_libera int) returns boolean
language sql stable set search_path = public, extensions as $$
  select not progresion_activa(p_liga)
      or (p_rareza = any(rarezas_desbloqueadas(p_liga)) and (p_libera is null or p_libera <= jornada_progresion(p_liga)))
$$;

-- Resumen para la tienda y las subastas
create function public.estado_progresion(p_liga uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_activa boolean := progresion_activa(p_liga);
  v_j      int := jornada_progresion(p_liga);
  v_desb   text[] := rarezas_desbloqueadas(p_liga);
  v_sig    jsonb;
begin
  if not v_activa then
    return jsonb_build_object('activa', false, 'jornada', v_j, 'desbloqueadas', to_jsonb(v_desb));
  end if;
  -- La próxima rareza que llega y cuándo
  select jsonb_build_object('rareza', x.r, 'jornada', (t ->> 'desde')::int) into v_sig
  from jsonb_array_elements(config_liga(p_liga) -> 'progresion' -> 'tramos') t
  cross join lateral jsonb_array_elements_text(t -> 'rarezas') x(r)
  where (t ->> 'desde')::int > v_j and not (x.r = any(v_desb))
  order by (t ->> 'desde')::int, array_position(array['comun', 'rara', 'epica', 'legendaria'], x.r)
  limit 1;
  return jsonb_build_object(
    'activa', true, 'jornada', v_j, 'desbloqueadas', to_jsonb(v_desb), 'siguiente', v_sig,
    -- Cuántas épicas/legendarias entran en esta jornada y cuántas quedan por entrar
    'entran', (select coalesce(jsonb_object_agg(d.rareza, n), '{}') from (
                 select d.rareza, count(*) n from cartas c join disenos_carta d on d.id = c.diseno_id
                 where c.liga_id = p_liga and c.equipo_id is null and c.libera_jornada = v_j
                   and c.libera_temporada = coalesce((temporada_actual(p_liga)).id, p_liga)
                 group by d.rareza) d),
    'por_entrar', (select coalesce(jsonb_object_agg(d.rareza, n), '{}') from (
                 select d.rareza, count(*) n from cartas c join disenos_carta d on d.id = c.diseno_id
                 where c.liga_id = p_liga and c.equipo_id is null and c.libera_jornada > v_j
                   and c.libera_temporada = coalesce((temporada_actual(p_liga)).id, p_liga)
                 group by d.rareza) d));
end $$;

-- ── Sorteo con progresión y filtros ────────────────────────────────────────
-- p_filtro: {"perfil": "defensa"} (las equilibradas valen para cualquiera) o
-- {"coleccion_id": "…"}. Primero una rareza por sus pesos entre las que pueden
-- salir; después una carta de esa rareza al azar.
create function public.sortear_carta(p_liga uuid, p_pesos jsonb, p_excluir uuid[], p_minima text,
                                     p_tanda_anterior date, p_filtro jsonb default null)
returns uuid
language plpgsql volatile set search_path = public, extensions as $$
declare
  v_rareza text;
  v_id     uuid;
  v_perfil text := p_filtro ->> 'perfil';
  v_col    uuid := (p_filtro ->> 'coleccion_id')::uuid;
begin
  perform asignar_cupos(p_liga);
  select x.rareza into v_rareza
  from (
    select d.rareza
    from cartas c join disenos_carta d on d.id = c.diseno_id
    where c.liga_id = p_liga and c.equipo_id is null and d.activo and c.reservada_por is null
      and c.id <> all(p_excluir)
      and en_bombo(p_liga, d.rareza, c.libera_jornada)
      and (v_perfil is null or d.perfil in (v_perfil, 'equilibrado'))
      and (v_col is null or d.coleccion_id = v_col)
      and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
      and (p_tanda_anterior is null or not exists (
            select 1 from subastas s where s.carta_id = c.id and s.liga_id = p_liga and s.tanda = p_tanda_anterior))
    group by d.rareza
  ) x
  where coalesce((p_pesos ->> x.rareza)::numeric, 0) > 0
    and (p_minima is null or rango_rareza(x.rareza) >= rango_rareza(p_minima))
  order by -ln(1 - random()) / (p_pesos ->> x.rareza)::numeric     -- elección ponderada
  limit 1;
  if v_rareza is null then
    return null;
  end if;
  select c.id into v_id
  from cartas c join disenos_carta d on d.id = c.diseno_id
  where c.liga_id = p_liga and c.equipo_id is null and d.activo and c.reservada_por is null and d.rareza = v_rareza
    and c.id <> all(p_excluir)
    and en_bombo(p_liga, d.rareza, c.libera_jornada)
    and (v_perfil is null or d.perfil in (v_perfil, 'equilibrado'))
    and (v_col is null or d.coleccion_id = v_col)
    and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
    and (p_tanda_anterior is null or not exists (
          select 1 from subastas s where s.carta_id = c.id and s.liga_id = p_liga and s.tanda = p_tanda_anterior))
  order by random()
  limit 1
  for update of c;
  return v_id;
end $$;

-- La de siempre (tandas de subastas) pasa por la progresión
create or replace function public.sortear_carta_libre(p_liga uuid, p_pesos jsonb, p_excluir uuid[], p_minima text, p_tanda_anterior date)
returns uuid
language sql volatile set search_path = public, extensions as $$
  select sortear_carta(p_liga, p_pesos, p_excluir, p_minima, p_tanda_anterior, null)
$$;

-- ── Modo pruebas: forzar la progresión y la jornada de referencia ──────────
create function public.slr_admin_progresion(token text, liga_id uuid, activa text, jornada int default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_liga uuid := slr_admin_progresion.liga_id;
begin
  perform exigir_modo_beta(sesion_usuario(slr_admin_progresion.token), v_liga);
  if activa not in ('auto', 'true', 'false') then
    raise exception 'activa: auto, true o false' using errcode = 'P0001';
  end if;
  if jornada is not null and jornada not between 1 and 60 then
    raise exception 'La jornada de prueba va de 1 a 60' using errcode = 'P0001';
  end if;
  update ligas l set config = jsonb_set(jsonb_set(l.config, '{progresion,activa}', to_jsonb(activa)),
                                        '{progresion,jornada_prueba}', coalesce(to_jsonb(jornada), 'null'::jsonb))
   where l.id = v_liga;
  perform asignar_cupos(v_liga);
  perform apuntar_historial(v_liga, 'admin_progresion',
    format('Progresión: %s%s (modo pruebas)', activa, coalesce(', jornada ' || jornada, '')), '{}');
  return estado_progresion(v_liga);
end $$;

-- ── Contador del Modo pruebas: catálogo por rareza (objetivo en la web) ────
create or replace function public.bombo_plantillas(p_liga uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  with cfg as (
    select coalesce((config_liga(p_liga) ->> 'plantilla_inicial')::int, 11) n,
           individuales_caras(coalesce((config_liga(p_liga) ->> 'plantilla_inicial_excluir_top')::numeric, 0.20)) caras
  ), libres as (
    select d.id = any(cfg.caras) cara
    from cartas c join disenos_carta d on d.id = c.diseno_id, cfg
    where c.liga_id = p_liga and c.equipo_id is null and d.activo and d.tipo = 'individual' and c.reservada_por is null
      and not exists (select 1 from subastas s where s.carta_id = c.id and s.estado = 'abierta')
  )
  select jsonb_build_object(
    'por_equipo', cfg.n,
    'bombo', (select count(*) from libres where not cara),
    'caras', (select count(*) from libres where cara),
    'equipos', (select count(*) from libres where not cara) / cfg.n,
    'equipos_con_caras', (select count(*) from libres) / cfg.n,
    'individuales_catalogo', (select count(*) from disenos_carta d where d.activo and d.tipo = 'individual'),
    'catalogo_rarezas', (select coalesce(jsonb_object_agg(x.rareza, x.n), '{}') from (
        select d.rareza, count(*) n from disenos_carta d
        where d.activo and (d.liga_prueba_id is null or d.liga_prueba_id = p_liga) group by d.rareza) x))
  from cfg
$$;

revoke execute on function public.progresion_activa(uuid), public.jornada_progresion(uuid), public.rarezas_desbloqueadas(uuid),
  public.asignar_cupos(uuid), public.en_bombo(uuid, text, int), public.estado_progresion(uuid),
  public.sortear_carta(uuid, jsonb, uuid[], text, date, jsonb) from public, anon, authenticated;
revoke execute on function public.slr_admin_progresion(text, uuid, text, int) from public;
grant execute on function public.slr_admin_progresion(text, uuid, text, int) to anon, authenticated;
