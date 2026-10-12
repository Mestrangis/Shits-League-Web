-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — esquema (paso 2)
-- Especificación: sección 11.2 + especificación complementaria (álbum, variantes,
-- sobre de elección). Decisiones en docs/slr/DECISIONES.md.
--
-- Seguridad:
--   · RLS activado en TODAS las tablas.
--   · Desde la web (anon / authenticated) solo SELECT, y solo en lo público.
--   · Ninguna escritura directa: todo pasa por las funciones slr_* (SECURITY DEFINER).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── Tipos ──────────────────────────────────────────────────────────────────
-- Extensible: añadir una variante = alter type ... add value (complementaria §2.1)
create type public.variante_carta as enum ('normal', 'foil', 'brillante', 'plateada');

-- ── Usuarios y sesiones ────────────────────────────────────────────────────
create table public.usuarios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  avatar_url  text,
  es_bot      boolean not null default false,   -- usuarios de prueba
  creado_en   timestamptz not null default now()
);

-- Hash SHA-256 (hex) del código en minúsculas. Nadie la lee desde fuera.
create table public.codigos (
  usuario_id   uuid primary key references public.usuarios(id) on delete cascade,
  codigo_hash  text not null unique check (codigo_hash ~ '^[0-9a-f]{64}$')
);

create table public.sesiones (
  token       uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  creada_en   timestamptz not null default now(),
  ultimo_uso  timestamptz not null default now()
);
create index sesiones_usuario_idx on public.sesiones(usuario_id);

-- ── Catálogo global ────────────────────────────────────────────────────────
create table public.disenos_carta (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  personas    text[] not null default '{}',
  tipo        text not null check (tipo in ('individual', 'duo', 'trio', 'unica')),
  ata         int not null check (ata between 1 and 101),
  def         int not null check (def between 1 and 101),
  con         int not null check (con between 1 and 101),
  poderes     jsonb not null default '[]' check (jsonb_typeof(poderes) = 'array'),
  imagen_url  text,
  texto       text,
  valor       int not null check (valor > 0),   -- calculado con js/slr/valor.js
  activo      boolean not null default true,
  beta        boolean not null default false,   -- catálogo de pruebas
  creado_en   timestamptz not null default now()
);
create index disenos_carta_tipo_idx on public.disenos_carta(tipo) where activo;

-- ── Ligas y equipos ────────────────────────────────────────────────────────
create table public.ligas (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  admin_id           uuid not null references public.usuarios(id),
  -- 6 caracteres legibles (sin 0/O, 1/I/L). Columna NO legible desde fuera.
  codigo_invitacion  text not null unique check (codigo_invitacion ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  config             jsonb not null,
  estado             text not null default 'preparacion' check (estado in ('preparacion', 'en_curso', 'terminada')),
  temporada          int not null default 1,
  creada_en          timestamptz not null default now()
);
create index ligas_admin_idx on public.ligas(admin_id);

create table public.equipos (
  id                         uuid primary key default gen_random_uuid(),
  liga_id                    uuid not null references public.ligas(id) on delete cascade,
  usuario_id                 uuid not null references public.usuarios(id),
  nombre                     text not null,
  escudo_url                 text,
  saldo                      int not null default 0 check (saldo >= 0),
  contador_garantia_premium  int not null default 0,
  creado_en                  timestamptz not null default now(),
  unique (liga_id, usuario_id),
  unique (liga_id, nombre),
  unique (liga_id, id)          -- para las claves foráneas compuestas (misma liga)
);
create index equipos_usuario_idx on public.equipos(usuario_id);

-- ── Cartas (ejemplares de cada liga) ───────────────────────────────────────
create table public.jornadas (
  id              uuid primary key default gen_random_uuid(),
  liga_id         uuid not null references public.ligas(id) on delete cascade,
  numero          int not null,
  competicion     text not null default 'liga' check (competicion in ('liga', 'copa')),
  cierre_en       timestamptz not null,
  publicacion_en  timestamptz not null,
  estado          text not null default 'abierta' check (estado in ('abierta', 'cerrada', 'simulada', 'publicada')),
  unique (liga_id, competicion, numero)
);
create index jornadas_liga_idx on public.jornadas(liga_id);

create table public.cartas (
  id                      uuid primary key default gen_random_uuid(),
  liga_id                 uuid not null references public.ligas(id) on delete cascade,
  diseno_id               uuid not null references public.disenos_carta(id),
  variante                public.variante_carta not null default 'normal',
  equipo_id               uuid,                               -- null = libre
  multiplicador_clausula  numeric(2, 1) not null default 1.5 check (multiplicador_clausula between 1.5 and 3.0),
  blindada_hasta          timestamptz,
  tocada_en_jornada       uuid references public.jornadas(id) on delete set null,
  reservada_hasta         timestamptz,                        -- sobre de elección (complementaria §3.2)
  adquirida_en            timestamptz,
  unique (liga_id, diseno_id, variante),
  -- El equipo dueño tiene que ser de la misma liga; si se borra, la carta queda libre
  foreign key (liga_id, equipo_id) references public.equipos(liga_id, id) on delete set null (equipo_id)
);
create index cartas_liga_idx on public.cartas(liga_id);
create index cartas_equipo_idx on public.cartas(equipo_id);
create index cartas_diseno_idx on public.cartas(diseno_id);
create index cartas_libres_idx on public.cartas(liga_id) where equipo_id is null;

-- Álbum de coleccionista (complementaria §1): nunca se borra al perder la carta
create table public.album (
  usuario_id       uuid not null references public.usuarios(id) on delete cascade,
  liga_id          uuid not null references public.ligas(id) on delete cascade,
  diseno_id        uuid not null references public.disenos_carta(id),
  variante         public.variante_carta not null default 'normal',
  primera_vez_en   timestamptz not null default now(),
  via_adquisicion  text not null check (via_adquisicion in
                     ('sobre_basico', 'sobre_premium', 'sobre_eleccion', 'subasta', 'compra', 'clausula', 'intercambio', 'inicial')),
  primary key (usuario_id, liga_id, diseno_id, variante)
);
create index album_liga_idx on public.album(liga_id);
create index album_diseno_idx on public.album(diseno_id);

-- ── Alineaciones y partidos ────────────────────────────────────────────────
-- huecos: {"por": uuid, "def": [uuid…], "med": [uuid…], "del": [uuid…]}
-- (la misma forma que la alineación que recibe el motor)
create table public.alineaciones (
  equipo_id     uuid primary key references public.equipos(id) on delete cascade,
  formacion     text not null check (formacion in ('2-2-2', '3-2-1', '1-3-2', '2-3-1', '1-2-3')),
  huecos        jsonb not null,
  banquillo     uuid[] not null default '{}' check (cardinality(banquillo) <= 3),
  orden_manual  boolean not null default false,
  capitan_id    uuid,
  guardada_en   timestamptz not null default now()
);

create table public.partidos (
  id                       uuid primary key default gen_random_uuid(),
  jornada_id               uuid not null references public.jornadas(id) on delete cascade,
  local_id                 uuid not null references public.equipos(id) on delete cascade,
  visitante_id             uuid not null references public.equipos(id) on delete cascade,
  semilla                  bigint check (semilla between 0 and 4294967295),
  version_motor            text,
  alineaciones_congeladas  jsonb,
  goles_local              int,
  goles_visitante          int,
  p_local                  double precision,
  p_visitante              double precision,
  pr                       jsonb,
  pr_esperado              jsonb,
  penaltis                 jsonb,
  creado_en                timestamptz not null default now(),
  check (local_id <> visitante_id)
);
create index partidos_jornada_idx on public.partidos(jornada_id);
create index partidos_local_idx on public.partidos(local_id);
create index partidos_visitante_idx on public.partidos(visitante_id);

-- ── Mercado ────────────────────────────────────────────────────────────────
create table public.subastas (
  id          uuid primary key default gen_random_uuid(),
  liga_id     uuid not null references public.ligas(id) on delete cascade,
  carta_id    uuid not null references public.cartas(id) on delete cascade,
  abre_en     timestamptz not null,
  cierra_en   timestamptz not null,
  estado      text not null default 'abierta' check (estado in ('abierta', 'resuelta', 'desierta')),
  ganador_id  uuid references public.equipos(id) on delete set null,
  precio      int
);
create index subastas_liga_idx on public.subastas(liga_id);
create index subastas_carta_idx on public.subastas(carta_id);
create index subastas_abiertas_idx on public.subastas(liga_id) where estado = 'abierta';

-- Pujas ciegas: sin ninguna lectura desde fuera
create table public.pujas (
  subasta_id      uuid not null references public.subastas(id) on delete cascade,
  equipo_id       uuid not null references public.equipos(id) on delete cascade,
  importe         int not null check (importe > 0),
  creada_en       timestamptz not null default now(),
  actualizada_en  timestamptz not null default now(),
  primary key (subasta_id, equipo_id)
);
create index pujas_equipo_idx on public.pujas(equipo_id);

create table public.ventas (
  id            uuid primary key default gen_random_uuid(),
  liga_id       uuid not null references public.ligas(id) on delete cascade,
  carta_id      uuid not null references public.cartas(id) on delete cascade,
  vendedor_id   uuid not null references public.equipos(id) on delete cascade,
  comprador_id  uuid references public.equipos(id) on delete set null,
  precio        int not null check (precio > 0),
  estado        text not null default 'activa' check (estado in ('activa', 'vendida', 'retirada', 'cancelada')),
  creada_en     timestamptz not null default now(),
  resuelta_en   timestamptz
);
create index ventas_liga_idx on public.ventas(liga_id);
create index ventas_carta_idx on public.ventas(carta_id);
create index ventas_vendedor_idx on public.ventas(vendedor_id);

create table public.ofertas (
  id               uuid primary key default gen_random_uuid(),
  liga_id          uuid not null references public.ligas(id) on delete cascade,
  carta_id         uuid not null references public.cartas(id) on delete cascade,
  de_id            uuid not null references public.equipos(id) on delete cascade,
  para_id          uuid not null references public.equipos(id) on delete cascade,
  importe          int not null check (importe > 0),
  contraoferta_de  uuid references public.ofertas(id) on delete set null,
  estado           text not null default 'pendiente'
                     check (estado in ('pendiente', 'aceptada', 'rechazada', 'contraofertada', 'caducada', 'cancelada')),
  caduca_en        timestamptz not null,
  creada_en        timestamptz not null default now()
);
create index ofertas_liga_idx on public.ofertas(liga_id);
create index ofertas_carta_idx on public.ofertas(carta_id);
create index ofertas_de_idx on public.ofertas(de_id);
create index ofertas_para_idx on public.ofertas(para_id);

create table public.intercambios (
  id            uuid primary key default gen_random_uuid(),
  liga_id       uuid not null references public.ligas(id) on delete cascade,
  de_id         uuid not null references public.equipos(id) on delete cascade,
  para_id       uuid not null references public.equipos(id) on delete cascade,
  cartas_de     uuid[] not null default '{}',
  cartas_para   uuid[] not null default '{}',
  monedas_de    int not null default 0 check (monedas_de >= 0),
  monedas_para  int not null default 0 check (monedas_para >= 0),
  estado        text not null default 'pendiente'
                  check (estado in ('pendiente', 'aceptado', 'rechazado', 'caducado', 'cancelado')),
  caduca_en     timestamptz not null,
  creado_en     timestamptz not null default now()
);
create index intercambios_liga_idx on public.intercambios(liga_id);
create index intercambios_de_idx on public.intercambios(de_id);
create index intercambios_para_idx on public.intercambios(para_id);

-- Libro contable: saldo del equipo = suma de sus movimientos. Solo lo escribe mover_dinero().
create table public.movimientos (
  id             bigint generated always as identity primary key,
  equipo_id      uuid not null references public.equipos(id) on delete cascade,
  tipo           text not null,
  importe        int not null check (importe <> 0),
  saldo_despues  int not null check (saldo_despues >= 0),
  referencia     text,
  creado_en      timestamptz not null default now()
);
create index movimientos_equipo_idx on public.movimientos(equipo_id);

create table public.sobres_abiertos (
  id         uuid primary key default gen_random_uuid(),
  equipo_id  uuid not null references public.equipos(id) on delete cascade,
  tipo       text not null check (tipo in ('basico', 'premium', 'eleccion')),
  precio     int not null,
  cartas     uuid[] not null,
  elegida    uuid,                    -- sobre de elección
  estado     text not null default 'abierto' check (estado in ('abierto', 'pendiente_eleccion')),
  creado_en  timestamptz not null default now()
);
create index sobres_abiertos_equipo_idx on public.sobres_abiertos(equipo_id);

create table public.historial (
  id         bigint generated always as identity primary key,
  liga_id    uuid not null references public.ligas(id) on delete cascade,
  tipo       text not null,
  texto      text not null,
  datos      jsonb not null default '{}',
  creado_en  timestamptz not null default now()
);
create index historial_liga_idx on public.historial(liga_id, creado_en desc);

create table public.notificaciones (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  liga_id     uuid references public.ligas(id) on delete cascade,
  tipo        text not null,
  datos       jsonb not null default '{}',
  leida       boolean not null default false,
  creada_en   timestamptz not null default now()
);
create index notificaciones_usuario_idx on public.notificaciones(usuario_id, leida);
create index notificaciones_liga_idx on public.notificaciones(liga_id);

-- ── Plantilla máxima: red de seguridad además de las comprobaciones de cada función ──
create function public.comprobar_plantilla_maxima() returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  v_max int;
  v_n   int;
begin
  if new.equipo_id is null then return new; end if;
  select coalesce((config ->> 'plantilla_maxima')::int, 15) into v_max from ligas where id = new.liga_id;
  select count(*) into v_n from cartas where equipo_id = new.equipo_id;
  if v_n > v_max then
    raise exception 'La plantilla no puede superar % cartas', v_max using errcode = 'P0001';
  end if;
  return new;
end $$;

create constraint trigger cartas_plantilla_maxima
  after insert or update of equipo_id on public.cartas
  deferrable initially immediate
  for each row execute function public.comprobar_plantilla_maxima();

-- ── Clasificación (vista): solo cuenta partidos de liga publicados ─────────
create view public.clasificacion with (security_invoker = on) as
with resultados as (
  select j.liga_id, p.local_id as equipo_id, p.goles_local as gf, p.goles_visitante as gc
  from partidos p join jornadas j on j.id = p.jornada_id
  where j.competicion = 'liga' and j.estado = 'publicada' and p.goles_local is not null
  union all
  select j.liga_id, p.visitante_id, p.goles_visitante, p.goles_local
  from partidos p join jornadas j on j.id = p.jornada_id
  where j.competicion = 'liga' and j.estado = 'publicada' and p.goles_local is not null
)
select e.liga_id,
       e.id as equipo_id,
       e.nombre,
       count(r.equipo_id)::int                        as pj,
       count(*) filter (where r.gf > r.gc)::int       as g,
       count(*) filter (where r.gf = r.gc)::int       as e,
       count(*) filter (where r.gf < r.gc)::int       as p,
       coalesce(sum(r.gf), 0)::int                    as gf,
       coalesce(sum(r.gc), 0)::int                    as gc,
       (3 * count(*) filter (where r.gf > r.gc) + count(*) filter (where r.gf = r.gc))::int as puntos
from equipos e
left join resultados r on r.equipo_id = e.id
group by e.liga_id, e.id, e.nombre;

-- ═══════════════════════════════════════════════════════════════════════════
-- Seguridad: RLS en todo, sin escrituras desde fuera, lectura solo de lo público
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'usuarios', 'codigos', 'sesiones', 'disenos_carta', 'ligas', 'equipos', 'jornadas', 'cartas',
    'album', 'alineaciones', 'partidos', 'subastas', 'pujas', 'ventas', 'ofertas', 'intercambios',
    'movimientos', 'sobres_abiertos', 'historial', 'notificaciones'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;

  -- Tablas públicas: lectura para todos
  foreach t in array array[
    'usuarios', 'disenos_carta', 'equipos', 'jornadas', 'cartas', 'album', 'alineaciones',
    'subastas', 'ventas', 'historial'
  ] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy lectura_publica on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- Ligas: todo menos el código de invitación (privilegio por columnas)
grant select (id, nombre, admin_id, config, estado, temporada, creada_en) on public.ligas to anon, authenticated;
create policy lectura_publica on public.ligas for select to anon, authenticated using (true);

-- Partidos: solo cuando su jornada está publicada (la semilla y el resultado no se ven antes)
grant select on public.partidos to anon, authenticated;
create policy lectura_publicada on public.partidos for select to anon, authenticated
  using (exists (select 1 from public.jornadas j where j.id = jornada_id and j.estado = 'publicada'));

grant select on public.clasificacion to anon, authenticated;

-- Sin ninguna lectura desde fuera (solo vía funciones):
--   codigos, sesiones, pujas, ofertas, intercambios, movimientos, sobres_abiertos, notificaciones

-- Que las tablas y funciones que se creen después no hereden permisos por defecto
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;
revoke execute on function public.comprobar_plantilla_maxima() from public, anon, authenticated;
