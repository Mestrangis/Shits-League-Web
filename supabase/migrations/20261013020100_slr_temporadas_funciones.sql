-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — temporadas (paso 4), parte 1: calendario, temporadas,
-- plantillas iniciales y congelado de alineaciones. Decisiones en DECISIONES.md.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Utilidades ─────────────────────────────────────────────────────────────
-- Entero de 32 bits sin signo de un generador criptográfico
create function public.semilla_aleatoria() returns bigint
language sql volatile set search_path = public, extensions as $$
  select ('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint
$$;

-- Byte pseudoaleatorio reproducible a partir de una semilla y una clave
create function public.hash_semilla(p_semilla bigint, p_clave text) returns text
language sql immutable as $$
  select md5(p_semilla::text || ':' || p_clave)
$$;

create function public.dia_semana(p_dia text) returns int
language sql immutable as $$
  select array_position(array['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'],
                        translate(lower(coalesce(p_dia, 'domingo')), 'áéíóú', 'aeiou')) - 1
$$;

-- Momento exacto de una hora local de un día (respeta el cambio de hora)
create function public.momento_local(p_fecha date, p_hora text, p_tz text) returns timestamptz
language sql immutable as $$
  select (p_fecha + p_hora::time) at time zone p_tz
$$;

-- Primer día de jornada (domingo por defecto) cuyo cierre quede al menos 24 h por delante
create function public.primera_fecha_jornada(p_liga uuid, p_ahora timestamptz) returns date
language plpgsql stable set search_path = public, extensions as $$
declare
  v_cfg  jsonb := config_liga(p_liga);
  v_tz   text := coalesce(v_cfg ->> 'zona_horaria', 'Europe/Madrid');
  v_hora text := coalesce(v_cfg -> 'jornada' ->> 'cierre_hora', '20:00');
  v_dow  int := dia_semana(v_cfg -> 'jornada' ->> 'cierre_dia');
  v_hoy  date := (p_ahora at time zone v_tz)::date;
  v_d    date;
begin
  for k in 0..14 loop
    v_d := v_hoy + k;
    if extract(dow from v_d) = v_dow and momento_local(v_d, v_hora, v_tz) >= p_ahora + interval '24 hours' then
      return v_d;
    end if;
  end loop;
  return v_hoy + 14;
end $$;

-- Pone fecha, cierre y publicación a una jornada a partir de su día local
create function public.fechar_jornada(p_jornada uuid, p_fecha date) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_cfg jsonb := config_liga((select j.liga_id from jornadas j where j.id = p_jornada));
  v_tz  text := coalesce(v_cfg ->> 'zona_horaria', 'Europe/Madrid');
begin
  update jornadas j
     set fecha = p_fecha,
         cierre_en = momento_local(p_fecha, coalesce(v_cfg -> 'jornada' ->> 'cierre_hora', '20:00'), v_tz),
         publicacion_en = momento_local(p_fecha, coalesce(v_cfg -> 'jornada' ->> 'publicacion_hora', '21:00'), v_tz)
   where j.id = p_jornada;
end $$;

-- Recoloca las jornadas pendientes de una temporada semana a semana desde p_desde
create function public.recolocar_jornadas(p_temporada uuid, p_desde date) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  r record;
  k int := 0;
begin
  for r in select j.id from jornadas j where j.temporada_id = p_temporada and j.estado = 'programada' order by j.numero loop
    perform fechar_jornada(r.id, p_desde + 7 * k);
    k := k + 1;
  end loop;
end $$;

create function public.temporada_actual(p_liga uuid) returns public.temporadas
language sql stable set search_path = public, extensions as $$
  select * from temporadas t where t.liga_id = p_liga order by t.numero desc limit 1
$$;

-- ── Mercado y alineaciones cerrados ────────────────────────────────────────
-- Ventana entre el cierre y la publicación de una jornada: no se pueden
-- guardar alineaciones ni operar en el mercado.
create function public.alineaciones_cerradas(p_liga uuid) returns boolean
language sql stable set search_path = public, extensions as $$
  select exists (
    select 1 from jornadas j join temporadas t on t.id = j.temporada_id
    where j.liga_id = p_liga and t.estado = 'en_curso'
      and (j.estado in ('cerrada', 'simulada') or (j.estado = 'programada' and j.cierre_en <= now())))
$$;

-- Mercado cerrado: liga pausada, entre temporadas o terminada, o en la ventana de jornada
create or replace function public.liga_bloqueada(p_liga uuid) returns boolean
language plpgsql stable set search_path = public, extensions as $$
declare
  v_estado text;
begin
  select l.estado into v_estado from ligas l where l.id = p_liga;
  if v_estado in ('pausada', 'entre_temporadas', 'terminada') then
    return true;
  end if;
  return alineaciones_cerradas(p_liga);
end $$;

-- ── Bombo de plantillas iniciales ──────────────────────────────────────────
-- Diseños individuales activos del % más caro del catálogo (por defecto el 20 %).
-- Desempate por id para que siempre sea el mismo conjunto.
create function public.individuales_caras(p_fraccion numeric) returns uuid[]
language sql stable set search_path = public, extensions as $$
  select coalesce(array_agg(x.id), '{}') from (
    select d.id from disenos_carta d
    where d.activo and d.tipo = 'individual'
    order by d.valor desc, d.id
    limit (select round(count(*) * coalesce(p_fraccion, 0.20))::int
           from disenos_carta d2 where d2.activo and d2.tipo = 'individual')
  ) x
$$;

-- Objetivo común de valor de una plantilla inicial: 11 × valor medio del bombo
-- (las individuales del catálogo sin el % más caro). Igual para todos los equipos.
create function public.objetivo_plantilla(p_liga uuid) returns numeric
language sql stable set search_path = public, extensions as $$
  select coalesce((config_liga(p_liga) ->> 'plantilla_inicial')::int, 11) * avg(d.valor)
  from disenos_carta d
  where d.activo and d.tipo = 'individual'
    and d.id <> all(individuales_caras(coalesce((config_liga(p_liga) ->> 'plantilla_inicial_excluir_top')::numeric, 0.20)))
$$;

-- Plantilla inicial al unirse (1.ª temporada o entre temporadas): 11 individuales
-- libres del bombo (sin el 20 % más caro) con valor dentro de ±10 % del objetivo
-- común. Si no hay bastantes libres en el bombo, se completa con las más baratas
-- de las caras. Muestreo aleatorio + intercambios voraces.
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
    where c.liga_id = p_liga and c.equipo_id is null and d.tipo = 'individual' and c.reservada_por is null
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
      where c.liga_id = p_liga and c.equipo_id is null and d.tipo = 'individual' and c.reservada_por is null
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

-- ── Calendario: round-robin (método del círculo) en orden aleatorio ────────
-- Con la semilla de la temporada se barajan los equipos, el orden de las
-- jornadas y quién es local. Con N impar se añade un "descanso".
create function public.generar_calendario(p_temporada uuid, p_ahora timestamptz) returns int
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_t      temporadas;
  v_eqs    uuid[];
  v_arr    uuid[];
  v_n      int;
  v_rondas int;
  v_ronda  int[] := '{}';
  v_a      uuid[] := '{}';
  v_b      uuid[] := '{}';
  v_orden  int[];
  v_fecha  date;
  v_jor    uuid;
  v_loc    uuid;
  v_vis    uuid;
  r        int;
  i        int;
  k        int;
begin
  select * into v_t from temporadas t where t.id = p_temporada;
  v_eqs := array(select e.id from equipos e where e.liga_id = v_t.liga_id
                 order by hash_semilla(v_t.semilla_calendario, 'equipo:' || e.id));
  if cardinality(v_eqs) % 2 = 1 then
    v_eqs := v_eqs || null::uuid;
  end if;
  v_n := cardinality(v_eqs);
  v_rondas := v_n - 1;
  v_arr := v_eqs;
  for r in 0..v_rondas - 1 loop
    for i in 1..v_n / 2 loop
      v_ronda := v_ronda || r;
      v_a := v_a || v_arr[i];
      v_b := v_b || v_arr[v_n + 1 - i];
    end loop;
    v_arr := array[v_arr[1]] || array[v_arr[v_n]] || v_arr[2:v_n - 1];   -- rota todos menos el primero
  end loop;

  v_orden := array(select g from generate_series(0, v_rondas - 1) g
                   order by hash_semilla(v_t.semilla_calendario, 'ronda:' || g));
  v_fecha := primera_fecha_jornada(v_t.liga_id, p_ahora);

  for k in 1..v_rondas loop
    insert into jornadas (liga_id, temporada_id, numero, competicion, cierre_en, publicacion_en, fecha, estado)
    values (v_t.liga_id, p_temporada, k, 'liga', p_ahora, p_ahora, v_fecha, 'programada')
    returning id into v_jor;
    perform fechar_jornada(v_jor, v_fecha + 7 * (k - 1));
    for i in 1..cardinality(v_ronda) loop
      continue when v_ronda[i] <> v_orden[k];
      if v_a[i] is null or v_b[i] is null then
        update jornadas j set descansa_id = coalesce(v_a[i], v_b[i]) where j.id = v_jor;
        continue;
      end if;
      if get_byte(decode(hash_semilla(v_t.semilla_calendario, 'local:' || v_orden[k] || ':' || i), 'hex'), 0) % 2 = 0 then
        v_loc := v_a[i]; v_vis := v_b[i];
      else
        v_loc := v_b[i]; v_vis := v_a[i];
      end if;
      insert into partidos (jornada_id, liga_id, temporada_id, tipo, local_id, visitante_id)
      values (v_jor, v_t.liga_id, p_temporada, 'liga', v_loc, v_vis);
    end loop;
  end loop;
  return v_rondas;
end $$;

-- ── Alineación por defecto (marcada como automática) ───────────────────────
create or replace function public.crear_alineacion_por_defecto(p_equipo uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_por     uuid;
  v_def     uuid[];
  v_med     uuid[];
  v_del     uuid[];
  v_banco   uuid[];
  v_usadas  uuid[];
  v_capitan uuid;
begin
  if (select count(*) from cartas_equipo(p_equipo)) < 7 then
    return null;
  end if;
  select p.id into v_por from cartas_equipo(p_equipo) p order by p.def desc, p.o desc, p.id limit 1;
  v_usadas := array[v_por];
  v_def := array(select p.id from cartas_equipo(p_equipo) p where p.id <> all(v_usadas) order by p.def desc, p.o desc, p.id limit 2);
  v_usadas := v_usadas || v_def;
  v_med := array(select p.id from cartas_equipo(p_equipo) p where p.id <> all(v_usadas) order by p.con desc, p.o desc, p.id limit 2);
  v_usadas := v_usadas || v_med;
  v_del := array(select p.id from cartas_equipo(p_equipo) p where p.id <> all(v_usadas) order by p.ata desc, p.o desc, p.id limit 2);
  v_usadas := v_usadas || v_del;
  v_banco := array(select p.id from cartas_equipo(p_equipo) p where p.id <> all(v_usadas) order by p.o desc, p.id limit 3);
  select p.id into v_capitan from cartas_equipo(p_equipo) p where p.id = any(v_usadas) order by p.o desc, p.id limit 1;

  insert into alineaciones as a (equipo_id, formacion, huecos, banquillo, orden_manual, capitan_id, guardada_en, automatica)
  values (p_equipo, '2-2-2',
          jsonb_build_object('por', v_por, 'def', to_jsonb(v_def), 'med', to_jsonb(v_med), 'del', to_jsonb(v_del)),
          v_banco, false, v_capitan, now(), true)
  on conflict (equipo_id) do update
    set formacion = excluded.formacion, huecos = excluded.huecos, banquillo = excluded.banquillo,
        orden_manual = excluded.orden_manual, capitan_id = excluded.capitan_id, guardada_en = excluded.guardada_en,
        automatica = true;
  return (select to_jsonb(a) from alineaciones a where a.equipo_id = p_equipo);
end $$;

-- ── Congelado de alineaciones (sección 4.6) ────────────────────────────────
-- Una carta en el formato del motor, con las stats efectivas (tocada al 85 %
-- si p_jornada es la jornada en la que está tocada).
create function public.carta_motor(p_carta uuid, p_jornada uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', c.id, 'nombre', d.nombre,
    'ATA', case when t.tocada then greatest(1, round(d.ata * t.f))::int else d.ata end,
    'DEF', case when t.tocada then greatest(1, round(d.def * t.f))::int else d.def end,
    'CON', case when t.tocada then greatest(1, round(d.con * t.f))::int else d.con end,
    'poderes', d.poderes, 'tocada', t.tocada)
  from cartas c join disenos_carta d on d.id = c.diseno_id
  cross join lateral (
    select (p_jornada is not null and c.tocada_en_jornada = p_jornada) as tocada,
           coalesce((config_liga(c.liga_id) ->> 'lesion_tocada_factor')::numeric, 0.85) as f
  ) t
  where c.id = p_carta
$$;

create function public.canterano(p_equipo uuid, p_n int, p_liga uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', 'canterano-' || left(p_equipo::text, 8) || '-' || p_n, 'nombre', 'Canterano',
    'ATA', coalesce((config_liga(p_liga) -> 'canterano' ->> 'ata')::int, 40),
    'DEF', coalesce((config_liga(p_liga) -> 'canterano' ->> 'def')::int, 40),
    'CON', coalesce((config_liga(p_liga) -> 'canterano' ->> 'con')::int, 40),
    'poderes', '[]'::jsonb, 'canterano', true)
$$;

-- Copia congelada de la alineación de un equipo para una jornada (o para un
-- amistoso si p_jornada es null). Huecos de cartas que ya no son del equipo:
-- el mejor suplente para ese hueco; si no hay, la mejor carta libre de la
-- plantilla; si no, un Canterano. Si el capitán ya no está, no hay capitán.
create function public.congelar_alineacion(p_equipo uuid, p_jornada uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_liga     uuid := (select e.liga_id from equipos e where e.id = p_equipo);
  v_al       alineaciones;
  v_form     text;
  v_n        int[];
  v_propias  uuid[];
  v_banco    uuid[];
  v_usadas   uuid[] := '{}';
  v_slots    text[];
  v_ids      uuid[] := '{}';
  v_guardado uuid[];
  v_pick     uuid;
  v_stat     text;
  v_cant     int := 0;
  v_json     jsonb[] := '{}';
  v_capitan  uuid;
  i          int;
begin
  select * into v_al from alineaciones a where a.equipo_id = p_equipo;
  if not found then
    perform crear_alineacion_por_defecto(p_equipo);
    select * into v_al from alineaciones a where a.equipo_id = p_equipo;
  end if;
  v_form := coalesce(v_al.formacion, '2-2-2');
  v_n := string_to_array(v_form, '-')::int[];
  v_propias := array(select c.id from cartas c where c.equipo_id = p_equipo);

  -- Posiciones en orden de hueco y cartas guardadas para cada una
  v_slots := array['por'] || array_fill('def'::text, array[v_n[1]]) || array_fill('med'::text, array[v_n[2]])
             || array_fill('del'::text, array[v_n[3]]);
  v_guardado := array[(v_al.huecos ->> 'por')::uuid];
  for i in 1..v_n[1] loop v_guardado := v_guardado || ((v_al.huecos -> 'def') ->> (i - 1))::uuid; end loop;
  for i in 1..v_n[2] loop v_guardado := v_guardado || ((v_al.huecos -> 'med') ->> (i - 1))::uuid; end loop;
  for i in 1..v_n[3] loop v_guardado := v_guardado || ((v_al.huecos -> 'del') ->> (i - 1))::uuid; end loop;

  -- 1) Se quedan las cartas que siguen siendo del equipo
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

  -- 2) Huecos vacíos: mejor suplente, luego mejor carta libre de la plantilla, luego Canterano
  for i in 1..cardinality(v_slots) loop
    continue when v_ids[i] is not null;
    v_stat := case v_slots[i] when 'med' then 'con' when 'del' then 'ata' else 'def' end;
    select x.id into v_pick
    from cartas_equipo(p_equipo) x
    where x.id = any(v_banco) and not (x.id = any(v_usadas))
    order by case v_stat when 'ata' then x.ata when 'def' then x.def else x.con end desc, x.o desc, x.id
    limit 1;
    if v_pick is null then
      select x.id into v_pick
      from cartas_equipo(p_equipo) x
      where not (x.id = any(v_usadas)) and not (x.id = any(v_banco))
      order by case v_stat when 'ata' then x.ata when 'def' then x.def else x.con end desc, x.o desc, x.id
      limit 1;
    end if;
    if v_pick is not null then
      v_ids[i] := v_pick;
      v_usadas := v_usadas || v_pick;
      v_banco := array_remove(v_banco, v_pick);
    end if;
  end loop;

  -- 3) JSON en el formato del motor
  for i in 1..cardinality(v_slots) loop
    if v_ids[i] is null then
      v_cant := v_cant + 1;
      v_json := v_json || canterano(p_equipo, v_cant, v_liga);
    else
      v_json := v_json || carta_motor(v_ids[i], p_jornada);
    end if;
  end loop;
  v_capitan := case when v_al.capitan_id = any(v_ids) then v_al.capitan_id end;

  return jsonb_build_object(
    'equipo_id', p_equipo,
    'formacion', v_form,
    'por', v_json[1],
    'def', to_jsonb(v_json[2 : 1 + v_n[1]]),
    'med', to_jsonb(v_json[2 + v_n[1] : 1 + v_n[1] + v_n[2]]),
    'del', to_jsonb(v_json[2 + v_n[1] + v_n[2] : 1 + v_n[1] + v_n[2] + v_n[3]]),
    'banquillo', coalesce((select jsonb_agg(carta_motor(x, p_jornada) order by o)
                           from unnest(v_banco) with ordinality t(x, o)), '[]'),
    'orden_manual', coalesce(v_al.orden_manual, false),
    'capitan_id', v_capitan,
    'canteranos', v_cant);
end $$;

-- ── Reparto de plantillas desde el álbum (a partir de la 2.ª temporada) ────
-- 11 individuales por equipo, solo de su álbum en esta liga. Niveles:
--   1) exclusivas del bombo  2) compartidas del bombo (sorteo)
--   3) exclusivas caras      4) compartidas caras  (las caras, de más barata a más cara)
-- Dentro de los niveles del bombo se elige la que acerca más al objetivo común.
-- Después, intercambios dentro del mismo nivel para entrar en el ±10 %.
create function public.repartir_desde_album(p_liga uuid, p_semilla bigint) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_cfg      jsonb := config_liga(p_liga);
  v_n_obj    int := coalesce((v_cfg ->> 'plantilla_inicial')::int, 11);
  v_tol      numeric := coalesce((v_cfg ->> 'plantilla_inicial_tolerancia')::numeric, 0.10);
  v_blindaje interval := make_interval(days => coalesce((v_cfg ->> 'blindaje_dias')::int, 7));
  v_caras    uuid[] := individuales_caras(coalesce((v_cfg ->> 'plantilla_inicial_excluir_top')::numeric, 0.20));
  v_obj      numeric := objetivo_plantilla(p_liga);
  v_eqs      uuid[];
  v_cnt      int[];
  v_sum      numeric[];
  v_progreso boolean;
  v_pick     uuid;
  v_valor    int;
  v_idx      int;
  v_res      jsonb := '[]';
  e          uuid;
  r          record;
  v_a uuid; v_b uuid; v_va int; v_vb int; v_bdif numeric; v_dif numeric;
begin
  create temp table if not exists pg_temp.slr_reparto (
    carta_id uuid primary key, valor int, cara boolean, interesados uuid[], equipo uuid, orden text
  ) on commit drop;
  delete from pg_temp.slr_reparto;

  insert into pg_temp.slr_reparto (carta_id, valor, cara, interesados, orden)
  select c.id, d.valor, d.id = any(v_caras), array_agg(distinct eq.id), hash_semilla(p_semilla, 'carta:' || c.id)
  from cartas c
  join disenos_carta d on d.id = c.diseno_id
  join album a on a.liga_id = c.liga_id and a.diseno_id = c.diseno_id
  join equipos eq on eq.liga_id = c.liga_id and eq.usuario_id = a.usuario_id
  where c.liga_id = p_liga and d.tipo = 'individual' and d.activo
  group by c.id, d.valor, d.id;

  v_eqs := array(select eq.id from equipos eq where eq.liga_id = p_liga order by eq.id);
  v_cnt := array_fill(0, array[cardinality(v_eqs)]);
  v_sum := array_fill(0::numeric, array[cardinality(v_eqs)]);

  for v_nivel in 1..4 loop
    for v_ronda in 1..v_n_obj loop
      v_progreso := false;
      -- En cada ronda, un orden de equipos sorteado con la semilla
      for e in select x from unnest(v_eqs) x order by hash_semilla(p_semilla, 'ronda:' || v_nivel || ':' || v_ronda || ':' || x) loop
        v_idx := array_position(v_eqs, e);
        continue when v_cnt[v_idx] >= v_n_obj;
        select rp.carta_id, rp.valor into v_pick, v_valor
        from pg_temp.slr_reparto rp
        where rp.equipo is null and e = any(rp.interesados)
          and rp.cara = (v_nivel >= 3)
          and (cardinality(rp.interesados) = 1) = (v_nivel in (1, 3))
        order by case when v_nivel >= 3 then rp.valor::numeric
                      else abs(v_sum[v_idx] + rp.valor - v_obj * (v_cnt[v_idx] + 1) / v_n_obj) end,
                 rp.orden
        limit 1;
        continue when v_pick is null;
        update pg_temp.slr_reparto rp set equipo = e where rp.carta_id = v_pick;
        v_cnt[v_idx] := v_cnt[v_idx] + 1;
        v_sum[v_idx] := v_sum[v_idx] + v_valor;
        v_progreso := true;
        v_pick := null;
      end loop;
      exit when not v_progreso;
    end loop;
  end loop;

  -- Ajuste de valor: intercambios dentro del mismo nivel (exclusiva por
  -- exclusiva, compartida por compartida, sin tocar las caras)
  for v_idx in 1..cardinality(v_eqs) loop
    e := v_eqs[v_idx];
    for paso in 1..30 loop
      exit when v_cnt[v_idx] = 0 or abs(v_sum[v_idx] - v_obj) <= v_tol * v_obj;
      v_bdif := abs(v_sum[v_idx] - v_obj);
      v_a := null;
      for r in
        select x.carta_id as a, x.valor as va, y.carta_id as b, y.valor as vb
        from pg_temp.slr_reparto x
        join pg_temp.slr_reparto y on y.equipo is null and e = any(y.interesados) and not y.cara
                                  and (cardinality(y.interesados) = 1) = (cardinality(x.interesados) = 1)
        where x.equipo = e and not x.cara
      loop
        v_dif := abs(v_sum[v_idx] - r.va + r.vb - v_obj);
        if v_dif < v_bdif then v_bdif := v_dif; v_a := r.a; v_b := r.b; v_va := r.va; v_vb := r.vb; end if;
      end loop;
      exit when v_a is null;
      update pg_temp.slr_reparto rp set equipo = null where rp.carta_id = v_a;
      update pg_temp.slr_reparto rp set equipo = e where rp.carta_id = v_b;
      v_sum[v_idx] := v_sum[v_idx] - v_va + v_vb;
    end loop;
  end loop;

  update cartas c
     set equipo_id = rp.equipo, blindada_hasta = now() + v_blindaje, multiplicador_clausula = 1.5, adquirida_en = now()
    from pg_temp.slr_reparto rp
   where rp.carta_id = c.id and rp.equipo is not null;

  for v_idx in 1..cardinality(v_eqs) loop
    v_res := v_res || jsonb_build_object(
      'equipo_id', v_eqs[v_idx], 'cartas', v_cnt[v_idx], 'valor_total', v_sum[v_idx],
      'caras', (select count(*) from pg_temp.slr_reparto rp where rp.equipo = v_eqs[v_idx] and rp.cara),
      'compartidas', (select count(*) from pg_temp.slr_reparto rp where rp.equipo = v_eqs[v_idx] and cardinality(rp.interesados) > 1),
      'dentro', abs(v_sum[v_idx] - v_obj) <= v_tol * v_obj);
  end loop;
  return jsonb_build_object('objetivo', round(v_obj, 2), 'equipos', v_res);
end $$;

-- ── Cierres de mercado ─────────────────────────────────────────────────────
-- Cancela las subastas abiertas de una liga (sin coste para nadie)
create function public.cancelar_subastas_liga(p_liga uuid, p_motivo text) returns int
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  r record;
  n int := 0;
begin
  for r in update subastas s set estado = 'cancelada' where s.liga_id = p_liga and s.estado = 'abierta'
           returning s.id, s.carta_id loop
    n := n + 1;
    update pujas p set estado = 'anulada' where p.subasta_id = r.id;
    perform notificar(p.equipo_id, 'subasta_cancelada',
      format('Se ha cancelado la subasta de %s (%s): tu puja no se cobra', nombre_carta(r.carta_id), p_motivo),
      jsonb_build_object('subasta_id', r.id, 'carta_id', r.carta_id))
    from pujas p where p.subasta_id = r.id;
  end loop;
  return n;
end $$;

-- Avisa a todos los equipos de una liga
create function public.notificar_liga(p_liga uuid, p_tipo text, p_texto text, p_datos jsonb default '{}') returns void
language sql volatile set search_path = public, extensions as $$
  select notificar(e.id, p_tipo, p_texto, p_datos) from equipos e where e.liga_id = p_liga
$$;

-- ── Clasificación con desempates ───────────────────────────────────────────
-- Puntos, diferencia de goles, goles a favor, resultado entre ellos (puntos y
-- diferencia en los partidos entre los empatados) y sorteo con la semilla de la temporada.
create function public.clasificacion_temporada(p_temporada uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  with t as (select * from temporadas where id = p_temporada),
  base as (select c.*, c.gf - c.gc as dg from clasificacion c where c.temporada_id = p_temporada),
  jugados as (
    select p.local_id, p.visitante_id, p.goles_local as gl, p.goles_visitante as gv
    from partidos p join jornadas j on j.id = p.jornada_id
    where p.temporada_id = p_temporada and p.tipo = 'liga' and j.estado = 'publicada'
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

revoke execute on function
  public.semilla_aleatoria(), public.hash_semilla(bigint, text), public.dia_semana(text),
  public.momento_local(date, text, text), public.primera_fecha_jornada(uuid, timestamptz),
  public.fechar_jornada(uuid, date), public.recolocar_jornadas(uuid, date), public.temporada_actual(uuid),
  public.alineaciones_cerradas(uuid), public.individuales_caras(numeric), public.objetivo_plantilla(uuid),
  public.generar_calendario(uuid, timestamptz), public.carta_motor(uuid, uuid), public.canterano(uuid, int, uuid),
  public.congelar_alineacion(uuid, uuid), public.repartir_desde_album(uuid, bigint),
  public.cancelar_subastas_liga(uuid, text), public.notificar_liga(uuid, text, text, jsonb),
  public.clasificacion_temporada(uuid)
from public, anon, authenticated;
