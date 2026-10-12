-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — temporadas, jornadas y partidos (paso 4): esquema
-- Estados de liga: preparacion → en_curso ⇄ pausada → entre_temporadas → en_curso…
-- Jornada: programada → cerrada → simulada → publicada (o cancelada).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Ligas ──────────────────────────────────────────────────────────────────
alter table public.ligas drop constraint ligas_estado_check;
alter table public.ligas add constraint ligas_estado_check
  check (estado in ('preparacion', 'en_curso', 'pausada', 'entre_temporadas', 'terminada'));
alter table public.ligas add column pausada_en timestamptz;
grant select (pausada_en) on public.ligas to anon, authenticated;

-- ── Temporadas ─────────────────────────────────────────────────────────────
create table public.temporadas (
  id                   uuid primary key default gen_random_uuid(),
  liga_id              uuid not null references public.ligas(id) on delete cascade,
  numero               int not null,
  estado               text not null default 'en_curso' check (estado in ('en_curso', 'pausada', 'terminada')),
  semilla_calendario   bigint not null,
  semilla_desempate    bigint not null,
  semilla_reparto      bigint,                -- solo a partir de la 2.ª temporada
  iniciada_en          timestamptz not null default now(),
  terminada_en         timestamptz,
  terminada_antes      boolean not null default false,
  clasificacion_final  jsonb,
  unique (liga_id, numero)
);
create index temporadas_liga_idx on public.temporadas(liga_id);

-- ── Jornadas ───────────────────────────────────────────────────────────────
alter table public.jornadas drop constraint jornadas_estado_check;
alter table public.jornadas alter column estado set default 'programada';
update public.jornadas set estado = 'programada' where estado = 'abierta';
alter table public.jornadas add constraint jornadas_estado_check
  check (estado in ('programada', 'cerrada', 'simulada', 'publicada', 'cancelada'));
alter table public.jornadas drop constraint jornadas_liga_id_competicion_numero_key;
alter table public.jornadas
  add column temporada_id uuid not null references public.temporadas(id) on delete cascade,
  add column fecha date not null,                         -- día local del cierre (para recolocar sin líos de horario)
  add column descansa_id uuid references public.equipos(id) on delete set null,
  add column simulacion_pedida_en timestamptz,
  add column simulada_en timestamptz,
  add column publicada_en timestamptz,
  add column cobros jsonb;                                -- calculados al simular, pagados al publicar
alter table public.jornadas add constraint jornadas_temporada_numero_key unique (temporada_id, numero);
create index jornadas_temporada_idx on public.jornadas(temporada_id);
create index jornadas_pendientes_idx on public.jornadas(liga_id, cierre_en) where estado in ('programada', 'cerrada', 'simulada');

-- ── Partidos ───────────────────────────────────────────────────────────────
alter table public.partidos alter column jornada_id drop not null;
alter table public.partidos
  add column liga_id uuid not null references public.ligas(id) on delete cascade,
  add column temporada_id uuid references public.temporadas(id) on delete cascade,
  add column tipo text not null default 'liga' check (tipo in ('liga', 'amistoso')),
  add column lesiones jsonb,
  add column estadisticas jsonb,
  add column simulado_en timestamptz,
  add column creado_por uuid references public.usuarios(id) on delete set null;
alter table public.partidos add constraint partidos_tipo_jornada_check check ((tipo = 'liga') = (jornada_id is not null));
create index partidos_liga_idx on public.partidos(liga_id);
create index partidos_temporada_idx on public.partidos(temporada_id);

-- Visibles: los de liga solo con la jornada publicada; los amistosos siempre
drop policy lectura_publicada on public.partidos;
create policy lectura_publicada on public.partidos for select to anon, authenticated
  using (tipo = 'amistoso'
         or exists (select 1 from public.jornadas j where j.id = jornada_id and j.estado = 'publicada'));

-- ── Otros estados ──────────────────────────────────────────────────────────
alter table public.subastas drop constraint subastas_estado_check;
alter table public.subastas add constraint subastas_estado_check
  check (estado in ('abierta', 'resuelta', 'desierta', 'cancelada'));
alter table public.sobres_abiertos drop constraint sobres_abiertos_estado_check;
alter table public.sobres_abiertos add constraint sobres_abiertos_estado_check
  check (estado in ('abierto', 'pendiente_eleccion', 'cancelado'));

-- Alineación creada por el sistema (al unirse o al empezar temporada): no da
-- bonus de participación hasta que el usuario la guarde o la confirme
alter table public.alineaciones add column automatica boolean not null default false;

-- ── RLS de la tabla nueva ──────────────────────────────────────────────────
alter table public.temporadas enable row level security;
revoke all on public.temporadas from anon, authenticated;
grant select on public.temporadas to anon, authenticated;
create policy lectura_publica on public.temporadas for select to anon, authenticated using (true);

-- ── Clasificación por temporada (solo partidos de liga publicados) ─────────
-- Equipos de la temporada: los que existían al empezarla (nadie se une con
-- una temporada en marcha). El orden con desempates lo da clasificacion_temporada().
drop view public.clasificacion;
create view public.clasificacion with (security_invoker = on) as
with resultados as (
  select p.temporada_id, p.local_id as equipo_id, p.goles_local as gf, p.goles_visitante as gc
  from partidos p join jornadas j on j.id = p.jornada_id
  where p.tipo = 'liga' and j.estado = 'publicada' and p.goles_local is not null
  union all
  select p.temporada_id, p.visitante_id, p.goles_visitante, p.goles_local
  from partidos p join jornadas j on j.id = p.jornada_id
  where p.tipo = 'liga' and j.estado = 'publicada' and p.goles_local is not null
)
select t.liga_id,
       t.id     as temporada_id,
       t.numero as temporada,
       e.id     as equipo_id,
       e.nombre,
       count(r.equipo_id)::int                        as pj,
       count(*) filter (where r.gf > r.gc)::int       as g,
       count(*) filter (where r.gf = r.gc)::int       as e,
       count(*) filter (where r.gf < r.gc)::int       as p,
       coalesce(sum(r.gf), 0)::int                    as gf,
       coalesce(sum(r.gc), 0)::int                    as gc,
       (3 * count(*) filter (where r.gf > r.gc) + count(*) filter (where r.gf = r.gc))::int as puntos
from temporadas t
join equipos e on e.liga_id = t.liga_id and e.creado_en <= t.iniciada_en
left join resultados r on r.temporada_id = t.id and r.equipo_id = e.id
group by t.liga_id, t.id, t.numero, e.id, e.nombre;

grant select on public.clasificacion to anon, authenticated;
