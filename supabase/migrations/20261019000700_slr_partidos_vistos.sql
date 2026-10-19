-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — partidos vistos (reproducción animada sin destripar)
--   Qué partidos ha visto cada usuario, para que cuente igual en todos sus
--   dispositivos. La primera vez que abre un partido SUYO ya jugado se
--   reproduce solo; cuenta como visto al llegar al final o al pulsar «Saltar».
--   Hasta que vea su último partido de liga, para él la clasificación sigue
--   como estaba antes de esa jornada (y la web no enseña su resultado).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.partidos_vistos (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  partido_id uuid not null references public.partidos(id) on delete cascade,
  visto_en   timestamptz not null default now(),
  primary key (usuario_id, partido_id)
);
create index partidos_vistos_partido_idx on public.partidos_vistos(partido_id);
alter table public.partidos_vistos enable row level security;   -- privada: se lee y se escribe con las funciones slr_*

-- El último partido de liga publicado del equipo del usuario en esa liga, si aún no lo ha visto
create function public.partido_sin_ver(p_usuario uuid, p_liga uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  with ultimo as (
    select p.id, p.jornada_id, j.numero, p.temporada_id
    from equipos e
    join partidos p on e.id in (p.local_id, p.visitante_id)
    join jornadas j on j.id = p.jornada_id
    where e.liga_id = p_liga and e.usuario_id = p_usuario and p.tipo = 'liga'
      and j.estado = 'publicada' and p.goles_local is not null
    order by j.publicada_en desc nulls last, j.numero desc
    limit 1)
  select jsonb_build_object('partido_id', u.id, 'jornada_id', u.jornada_id, 'numero', u.numero, 'temporada_id', u.temporada_id)
  from ultimo u
  where not exists (select 1 from partidos_vistos pv where pv.usuario_id = p_usuario and pv.partido_id = u.id)
$$;

create function public.slr_sin_ver(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_sin_ver.token);
begin
  perform exigir_miembro(v_usuario, slr_sin_ver.liga_id);
  return jsonb_build_object('sin_ver', partido_sin_ver(v_usuario, slr_sin_ver.liga_id));
end $$;

-- Marca un partido como visto (al llegar al final o al pulsar «Saltar»). Idempotente.
create function public.slr_marcar_visto(token text, partido_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_marcar_visto.token);
  v_p       partidos;
begin
  select * into v_p from partidos p where p.id = slr_marcar_visto.partido_id;
  if not found then
    raise exception 'Ese partido no existe' using errcode = 'P0001';
  end if;
  perform exigir_miembro(v_usuario, v_p.liga_id);
  if v_p.goles_local is null then
    raise exception 'Este partido todavía no se ha jugado' using errcode = 'P0001';
  end if;
  insert into partidos_vistos (usuario_id, partido_id) values (v_usuario, v_p.id) on conflict do nothing;
  return jsonb_build_object('visto', true, 'sin_ver', partido_sin_ver(v_usuario, v_p.liga_id));
end $$;

create function public.clasificacion_temporada_sin(p_temporada uuid, p_jornada uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  with t as (select * from temporadas where id = p_temporada),
  resultados as (
    select p.local_id as equipo_id, p.goles_local as gf, p.goles_visitante as gc
    from partidos p join jornadas j on j.id = p.jornada_id
    where p.temporada_id = p_temporada and p.tipo = 'liga' and j.estado = 'publicada' and p.goles_local is not null and p.jornada_id <> p_jornada
    union all
    select p.visitante_id, p.goles_visitante, p.goles_local
    from partidos p join jornadas j on j.id = p.jornada_id
    where p.temporada_id = p_temporada and p.tipo = 'liga' and j.estado = 'publicada' and p.goles_local is not null and p.jornada_id <> p_jornada
  ),
  base as (
    select e.id as equipo_id, e.nombre,
           count(r.equipo_id)::int as pj,
           count(*) filter (where r.gf > r.gc)::int as g,
           count(*) filter (where r.gf = r.gc)::int as e,
           count(*) filter (where r.gf < r.gc)::int as p,
           coalesce(sum(r.gf), 0)::int as gf,
           coalesce(sum(r.gc), 0)::int as gc,
           (3 * count(*) filter (where r.gf > r.gc) + count(*) filter (where r.gf = r.gc))::int as puntos,
           coalesce(sum(r.gf), 0)::int - coalesce(sum(r.gc), 0)::int as dg
    from temporadas t
    join equipos e on e.liga_id = t.liga_id and e.creado_en <= t.iniciada_en
    left join resultados r on r.equipo_id = e.id
    where t.id = p_temporada
    group by e.id, e.nombre),
  jugados as (
    select p.local_id, p.visitante_id, p.goles_local as gl, p.goles_visitante as gv
    from partidos p join jornadas j on j.id = p.jornada_id
    where p.temporada_id = p_temporada and p.tipo = 'liga' and j.estado = 'publicada' and p.jornada_id <> p_jornada
  ),
  grupos as (select b.*, dense_rank() over (order by b.puntos desc, b.dg desc, b.gf desc) as grupo from base b),
  h2h as (
    select x.equipo_id,
           coalesce(sum(case when (m.local_id = x.equipo_id and m.gl > m.gv) or (m.visitante_id = x.equipo_id and m.gv > m.gl) then 3
                             when m.gl = m.gv then 1 else 0 end), 0) as pts,
           coalesce(sum(case when m.local_id = x.equipo_id then m.gl - m.gv else m.gv - m.gl end), 0) as dg
    from grupos x
    left join jugados m
      on (m.local_id = x.equipo_id and m.visitante_id in (select y.equipo_id from grupos y where y.grupo = x.grupo and y.equipo_id <> x.equipo_id))
      or (m.visitante_id = x.equipo_id and m.local_id in (select y.equipo_id from grupos y where y.grupo = x.grupo and y.equipo_id <> x.equipo_id))
    group by x.equipo_id
  ),
  ordenada as (
    select g.*, h.pts as h2h_puntos, h.dg as h2h_dg,
           row_number() over (order by g.puntos desc, g.dg desc, g.gf desc, h.pts desc, h.dg desc,
                                       hash_semilla((select semilla_desempate from t), 'desempate:' || g.equipo_id)) as posicion
    from grupos g join h2h h using (equipo_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'posicion', o.posicion, 'equipo_id', o.equipo_id, 'equipo', o.nombre, 'usuario', nombre_dueno(o.equipo_id),
           'pj', o.pj, 'g', o.g, 'e', o.e, 'p', o.p, 'gf', o.gf, 'gc', o.gc, 'dg', o.dg, 'puntos', o.puntos)
         order by o.posicion), '[]')
  from ordenada o
$$;

create or replace function public.slr_clasificacion(token text, liga_id uuid, temporada int default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_clasificacion.token);
  v_liga    uuid := slr_clasificacion.liga_id;
  v_t       temporadas;
  v_sin     jsonb;
begin
  perform exigir_miembro(v_usuario, v_liga);
  if slr_clasificacion.temporada is null then
    v_t := temporada_actual(v_liga);
  else
    select * into v_t from temporadas t where t.liga_id = v_liga and t.numero = slr_clasificacion.temporada;
  end if;
  if v_t.id is null then
    return jsonb_build_object('temporada', null, 'clasificacion', '[]'::jsonb);
  end if;
  -- Sin destripar: si el usuario no ha visto su último partido de liga, la clasificación
  -- sigue como estaba antes de esa jornada (solo para él)
  v_sin := partido_sin_ver(v_usuario, v_liga);
  if v_sin is not null and (v_sin ->> 'temporada_id')::uuid = v_t.id then
    return jsonb_build_object(
      'temporada', jsonb_build_object('numero', v_t.numero, 'estado', v_t.estado, 'terminada_antes', v_t.terminada_antes),
      'clasificacion', clasificacion_temporada_sin(v_t.id, (v_sin ->> 'jornada_id')::uuid),
      'sin_ver', v_sin);
  end if;
  return jsonb_build_object(
    'temporada', jsonb_build_object('numero', v_t.numero, 'estado', v_t.estado, 'terminada_antes', v_t.terminada_antes),
    'clasificacion', coalesce(v_t.clasificacion_final, clasificacion_temporada(v_t.id)));
end $$;

create or replace function public.slr_partido(token text, partido_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_partido.token);
  v_p       partidos;
  v_j       jornadas;
begin
  select * into v_p from partidos p where p.id = slr_partido.partido_id;
  if not found then
    raise exception 'Ese partido no existe' using errcode = 'P0001';
  end if;
  perform exigir_miembro(v_usuario, v_p.liga_id);
  if v_p.tipo = 'liga' then
    select * into v_j from jornadas j where j.id = v_p.jornada_id;
    if v_j.estado <> 'publicada' then
      raise exception 'Este partido todavía no se ha publicado' using errcode = 'P0001';
    end if;
  end if;
  -- Un amistoso lleva las tácticas guardadas de quien lo jugó: solo él ve la crónica
  if v_p.tipo = 'amistoso' and v_p.creado_por is distinct from v_usuario then
    raise exception 'La crónica de un amistoso solo la ve quien lo jugó (lleva su táctica)' using errcode = 'P0001';
  end if;
  if v_p.goles_local is null then
    raise exception 'Este partido todavía no se ha jugado' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', v_p.id, 'tipo', v_p.tipo, 'jornada', v_j.numero, 'liga_id', v_p.liga_id,
    'local_id', v_p.local_id, 'visitante_id', v_p.visitante_id,
    'semilla', v_p.semilla, 'version_motor', v_p.version_motor,
    'alineaciones_congeladas', v_p.alineaciones_congeladas,
    'goles', jsonb_build_array(v_p.goles_local, v_p.goles_visitante), 'penaltis', v_p.penaltis,
    'p_local', v_p.p_local, 'p_visitante', v_p.p_visitante,
    'pr', v_p.pr, 'pr_esperado', v_p.pr_esperado, 'lesiones', v_p.lesiones, 'estadisticas', v_p.estadisticas,
    'tacticas', v_p.tacticas, 'participacion', v_p.participacion, 'energia', v_p.energia,
    'creado_por', v_p.creado_por,
    -- Para la reproducción: si es del usuario y si ya lo ha visto (la primera vez se reproduce solo)
    'mio', exists (select 1 from equipos e where e.id in (v_p.local_id, v_p.visitante_id) and e.usuario_id = v_usuario),
    'visto', exists (select 1 from partidos_vistos pv where pv.usuario_id = v_usuario and pv.partido_id = v_p.id));
end $$;

revoke execute on function public.partido_sin_ver(uuid, uuid), public.clasificacion_temporada_sin(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.slr_sin_ver(text, uuid), public.slr_marcar_visto(text, uuid) from public;
grant execute on function public.slr_sin_ver(text, uuid), public.slr_marcar_visto(text, uuid) to anon, authenticated;
