-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — temporadas (paso 4), parte 3: jornadas, cobros,
-- administración de temporadas, Edge Function del motor y lecturas.
--
-- Ciclo de una jornada (tareas idempotentes con estado):
--   programada → cerrada (congela alineaciones y genera semillas)
--             → simulada (la Edge Function slr-simular corre el motor y guarda
--                         resultados y cobros calculados)
--             → publicada (se pagan los cobros, se aplican las lesiones y todo
--                          se hace visible a la vez)
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_net with schema extensions;

-- URL de la Edge Function (pública; el secreto va en Vault, nunca aquí)
create function public.url_funcion_simular() returns text
language sql immutable as $$
  select 'https://vtqhefwspnqsjskqkxqg.supabase.co/functions/v1/slr-simular'
$$;

-- ── Utilidades de alineaciones congeladas ──────────────────────────────────
create function public.ids_titulares(p_al jsonb) returns text[]
language sql immutable as $$
  select array[p_al -> 'por' ->> 'id']
      || coalesce(array(select x ->> 'id' from jsonb_array_elements(p_al -> 'def') x), '{}')
      || coalesce(array(select x ->> 'id' from jsonb_array_elements(p_al -> 'med') x), '{}')
      || coalesce(array(select x ->> 'id' from jsonb_array_elements(p_al -> 'del') x), '{}')
$$;

create function public.ids_alineacion(p_al jsonb) returns text[]
language sql immutable as $$
  select ids_titulares(p_al)
      || coalesce(array(select x ->> 'id' from jsonb_array_elements(p_al -> 'banquillo') x), '{}')
$$;

create function public.exigir_admin(p_usuario uuid, p_liga uuid) returns void
language plpgsql stable set search_path = public, extensions as $$
begin
  if not exists (select 1 from ligas l where l.id = p_liga and l.admin_id = p_usuario) then
    raise exception 'Solo el administrador de la liga puede hacer esto' using errcode = 'P0001';
  end if;
end $$;

create function public.exigir_miembro(p_usuario uuid, p_liga uuid) returns void
language plpgsql stable set search_path = public, extensions as $$
begin
  if not exists (select 1 from equipos e where e.liga_id = p_liga and e.usuario_id = p_usuario)
     and not exists (select 1 from ligas l where l.id = p_liga and l.admin_id = p_usuario) then
    raise exception 'No perteneces a esta liga' using errcode = 'P0001';
  end if;
end $$;

-- ── 1. Cierre ──────────────────────────────────────────────────────────────
create function public.cerrar_jornada(p_jornada uuid) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_j jornadas;
  r   record;
begin
  select * into v_j from jornadas j where j.id = p_jornada for update;
  if v_j.estado <> 'programada' then
    return false;
  end if;
  for r in select p.id, p.local_id, p.visitante_id from partidos p where p.jornada_id = p_jornada loop
    update partidos p
       set alineaciones_congeladas = jsonb_build_object(
             'local', congelar_alineacion(r.local_id, p_jornada),
             'visitante', congelar_alineacion(r.visitante_id, p_jornada)),
           semilla = semilla_aleatoria()          -- criptográfica, generada ahora
     where p.id = r.id;
  end loop;
  update jornadas j set estado = 'cerrada' where j.id = p_jornada;
  return true;
end $$;

-- ── 2. Simulación: petición asíncrona a la Edge Function (pg_net) ──────────
create function public.pedir_simulacion(p_jornada uuid) returns bigint
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_secreto text;
  v_id      bigint;
begin
  select ds.decrypted_secret into v_secreto from vault.decrypted_secrets ds where ds.name = 'slr_cron_secreto';
  if v_secreto is null then
    raise warning '[slr] Falta el secreto slr_cron_secreto en Vault: no se puede simular';
    return null;
  end if;
  select net.http_post(
           url := url_funcion_simular(),
           body := jsonb_build_object('accion', 'jornada', 'jornada_id', p_jornada),
           headers := jsonb_build_object('Content-Type', 'application/json', 'x-slr-secreto', v_secreto),
           timeout_milliseconds := 60000)
    into v_id;
  update jornadas j set simulacion_pedida_en = now() where j.id = p_jornada;
  return v_id;
end $$;

-- Ojo clínico (7.4) de un lado de un partido: titulares no lesionados, sus
-- últimos 3 partidos oficiales con este equipo (este incluido), r = PR real /
-- PR esperado; si r > 1,25, bonus 100 × (r − 1) con tope 300. Máximo 3 cartas.
create function public.ojo_clinico(p_partido uuid, p_lado text) returns jsonb
language plpgsql stable set search_path = public, extensions as $$
declare
  v_p      partidos;
  v_cfg    jsonb;
  v_eq     uuid;
  v_cierre timestamptz;
  v_les    text[];
  v_lista  jsonb := '[]';
  v_real   numeric;
  v_esp    numeric;
  v_r      numeric;
  v_bonus  int;
  c        text;
begin
  select * into v_p from partidos p where p.id = p_partido;
  v_cfg := coalesce(config_liga(v_p.liga_id) -> 'ojo_clinico', '{}');
  v_eq := case p_lado when 'local' then v_p.local_id else v_p.visitante_id end;
  v_cierre := (select j.cierre_en from jornadas j where j.id = v_p.jornada_id);
  v_les := array(select jsonb_array_elements_text(coalesce(v_p.lesiones, '[]')));

  foreach c in array ids_titulares(v_p.alineaciones_congeladas -> p_lado) loop
    continue when c like 'canterano-%' or c = any(v_les);
    select sum(coalesce((x.pr ->> c)::numeric, 0)), sum(coalesce((x.pr_esperado ->> c)::numeric, 0))
      into v_real, v_esp
    from (
      select p2.pr, p2.pr_esperado
      from partidos p2 join jornadas j2 on j2.id = p2.jornada_id
      where p2.tipo = 'liga' and p2.goles_local is not null and j2.cierre_en <= v_cierre
        and ((p2.local_id = v_eq and c = any(ids_titulares(p2.alineaciones_congeladas -> 'local')))
          or (p2.visitante_id = v_eq and c = any(ids_titulares(p2.alineaciones_congeladas -> 'visitante'))))
      order by j2.cierre_en desc
      limit coalesce((v_cfg ->> 'partidos')::int, 3)
    ) x;
    continue when coalesce(v_esp, 0) <= 0;
    v_r := v_real / v_esp;
    continue when v_r <= coalesce((v_cfg ->> 'umbral')::numeric, 1.25);
    v_bonus := least(coalesce((v_cfg ->> 'tope')::int, 300), round(coalesce((v_cfg ->> 'factor')::numeric, 100) * (v_r - 1))::int);
    continue when v_bonus <= 0;
    v_lista := v_lista || jsonb_build_object('equipo_id', v_eq, 'tipo', 'bonus_ojo_clinico', 'importe', v_bonus,
                                             'referencia', 'partido:' || p_partido || ';carta:' || c,
                                             'carta_id', c, 'r', round(v_r, 3));
  end loop;
  return coalesce((select jsonb_agg(x order by (x ->> 'importe')::int desc)
                   from (select x from jsonb_array_elements(v_lista) x
                         order by (x ->> 'importe')::int desc limit coalesce((v_cfg ->> 'cartas')::int, 3)) s), '[]');
end $$;

-- Cobros de una jornada simulada: salario (todos, también quien descansa),
-- participación (alineación guardada o confirmada desde la jornada anterior),
-- sorpresa (7.3) y ojo clínico (7.4). Se pagan al publicar.
create function public.calcular_cobros(p_jornada uuid) returns jsonb
language plpgsql stable set search_path = public, extensions as $$
declare
  v_j      jornadas;
  v_t      temporadas;
  v_cfg    jsonb;
  v_ref    timestamptz;
  v_cobros jsonb := '[]';
  v_ref_txt text := 'jornada:' || p_jornada;
  e        record;
  p        record;
  v_vic    numeric;
  v_emp    numeric;
  v_bonus  int;
begin
  select * into v_j from jornadas j where j.id = p_jornada;
  select * into v_t from temporadas t where t.id = v_j.temporada_id;
  v_cfg := config_liga(v_j.liga_id);
  v_vic := coalesce((v_cfg -> 'bonus_sorpresa' ->> 'victoria')::numeric, 600);
  v_emp := coalesce((v_cfg -> 'bonus_sorpresa' ->> 'empate')::numeric, 300);
  -- "Desde la jornada anterior": desde que se publicó la anterior (o desde el inicio de la temporada)
  select j2.publicada_en into v_ref from jornadas j2 where j2.temporada_id = v_j.temporada_id and j2.numero = v_j.numero - 1;
  v_ref := coalesce(v_ref, v_t.iniciada_en);

  for e in select eq.id from equipos eq where eq.liga_id = v_j.liga_id and eq.creado_en <= v_t.iniciada_en order by eq.id loop
    v_cobros := v_cobros || jsonb_build_object('equipo_id', e.id, 'tipo', 'salario',
                  'importe', coalesce((v_cfg ->> 'salario_jornada')::int, 1000), 'referencia', v_ref_txt);
    if exists (select 1 from alineaciones a where a.equipo_id = e.id and not a.automatica and a.guardada_en > v_ref) then
      v_cobros := v_cobros || jsonb_build_object('equipo_id', e.id, 'tipo', 'bonus_participacion',
                    'importe', coalesce((v_cfg ->> 'bonus_participacion')::int, 100), 'referencia', v_ref_txt);
    end if;
  end loop;

  for p in select * from partidos x where x.jornada_id = p_jornada order by x.id loop
    v_bonus := 0;
    if p.goles_local > p.goles_visitante then
      v_bonus := round(v_vic * (1 - p.p_local))::int;
      if v_bonus > 0 then v_cobros := v_cobros || jsonb_build_object('equipo_id', p.local_id, 'tipo', 'bonus_sorpresa',
                            'importe', v_bonus, 'referencia', 'partido:' || p.id); end if;
    elsif p.goles_visitante > p.goles_local then
      v_bonus := round(v_vic * (1 - p.p_visitante))::int;
      if v_bonus > 0 then v_cobros := v_cobros || jsonb_build_object('equipo_id', p.visitante_id, 'tipo', 'bonus_sorpresa',
                            'importe', v_bonus, 'referencia', 'partido:' || p.id); end if;
    elsif p.p_local < p.p_visitante then
      v_bonus := round(v_emp * (p.p_visitante - p.p_local))::int;
      if v_bonus > 0 then v_cobros := v_cobros || jsonb_build_object('equipo_id', p.local_id, 'tipo', 'bonus_sorpresa',
                            'importe', v_bonus, 'referencia', 'partido:' || p.id); end if;
    elsif p.p_visitante < p.p_local then
      v_bonus := round(v_emp * (p.p_local - p.p_visitante))::int;
      if v_bonus > 0 then v_cobros := v_cobros || jsonb_build_object('equipo_id', p.visitante_id, 'tipo', 'bonus_sorpresa',
                            'importe', v_bonus, 'referencia', 'partido:' || p.id); end if;
    end if;
    v_cobros := v_cobros || ojo_clinico(p.id, 'local') || ojo_clinico(p.id, 'visitante');
  end loop;
  return v_cobros;
end $$;

-- ── 3. Publicación ─────────────────────────────────────────────────────────
create function public.publicar_jornada(p_jornada uuid) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_j      jornadas;
  c        jsonb;
  p        record;
  e        record;
  v_les    text;
  v_eq     uuid;
  v_sig    uuid;
  v_lesion jsonb := '[]';
  v_texto  text;
  v_cobro  int;
begin
  select * into v_j from jornadas j where j.id = p_jornada for update;
  if v_j.estado <> 'simulada' then
    return false;
  end if;

  -- Cobros calculados en la simulación
  for c in select x from jsonb_array_elements(coalesce(v_j.cobros, '[]')) x loop
    if (c ->> 'importe')::int <> 0 then
      perform mover_dinero((c ->> 'equipo_id')::uuid, (c ->> 'importe')::int, c ->> 'tipo', c ->> 'referencia');
    end if;
  end loop;

  -- Lesiones: la carta queda tocada en la siguiente jornada que juegue su equipo
  for p in select * from partidos x where x.jornada_id = p_jornada loop
    for v_les in select jsonb_array_elements_text(coalesce(p.lesiones, '[]')) loop
      continue when v_les like 'canterano-%';
      v_eq := case when v_les = any(ids_alineacion(p.alineaciones_congeladas -> 'local')) then p.local_id else p.visitante_id end;
      select j2.id into v_sig
      from jornadas j2 join partidos p2 on p2.jornada_id = j2.id
      where j2.temporada_id = v_j.temporada_id and j2.numero > v_j.numero and j2.estado = 'programada'
        and (p2.local_id = v_eq or p2.visitante_id = v_eq)
      order by j2.numero limit 1;
      update cartas ca set tocada_en_jornada = v_sig where ca.id = v_les::uuid;
      v_lesion := v_lesion || jsonb_build_object('equipo_id', v_eq, 'carta_id', v_les, 'nombre', nombre_carta(v_les::uuid),
                                                 'tocada_en_jornada', v_sig);
    end loop;
    perform apuntar_historial(v_j.liga_id, 'partido',
      format('Jornada %s: %s %s-%s %s', v_j.numero, (select x.nombre from equipos x where x.id = p.local_id),
             p.goles_local, p.goles_visitante, (select x.nombre from equipos x where x.id = p.visitante_id)),
      jsonb_build_object('partido_id', p.id, 'jornada_id', p_jornada));
  end loop;

  update jornadas j set estado = 'publicada', publicada_en = now() where j.id = p_jornada;

  -- Avisos: resultado, dinero cobrado y lesiones de cada equipo
  for e in select eq.id from equipos eq where eq.liga_id = v_j.liga_id loop
    select coalesce(sum((x ->> 'importe')::int), 0) into v_cobro
    from jsonb_array_elements(coalesce(v_j.cobros, '[]')) x where (x ->> 'equipo_id')::uuid = e.id;
    select format('Jornada %s: %s %s-%s %s', v_j.numero, (select x.nombre from equipos x where x.id = p2.local_id),
                  p2.goles_local, p2.goles_visitante, (select x.nombre from equipos x where x.id = p2.visitante_id))
      into v_texto
    from partidos p2 where p2.jornada_id = p_jornada and e.id in (p2.local_id, p2.visitante_id);
    v_texto := coalesce(v_texto, format('Jornada %s: descansas', v_j.numero)) || '. Has cobrado ' || fmt(v_cobro) || '.';
    perform notificar(e.id, 'jornada_publicada', v_texto, jsonb_build_object(
      'jornada_id', p_jornada, 'numero', v_j.numero, 'cobrado', v_cobro,
      'cobros', (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(coalesce(v_j.cobros, '[]')) x
                 where (x ->> 'equipo_id')::uuid = e.id),
      'lesiones', (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(v_lesion) x
                   where (x ->> 'equipo_id')::uuid = e.id)));
  end loop;

  -- ¿Era la última? La temporada termina sola
  if not exists (select 1 from jornadas j where j.temporada_id = v_j.temporada_id and j.estado in ('programada', 'cerrada', 'simulada')) then
    perform terminar_temporada_interna(v_j.liga_id, false);
  end if;
  return true;
end $$;

-- ── Temporadas ─────────────────────────────────────────────────────────────
create function public.terminar_temporada_interna(p_liga uuid, p_antes boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_t    temporadas;
  v_clas jsonb;
begin
  perform 1 from ligas l where l.id = p_liga for update;
  select * into v_t from temporadas t where t.liga_id = p_liga and t.estado in ('en_curso', 'pausada')
  order by t.numero desc limit 1 for update;
  if not found then
    raise exception 'No hay ninguna temporada en marcha' using errcode = 'P0001';
  end if;
  if p_antes and exists (select 1 from jornadas j where j.temporada_id = v_t.id and j.estado in ('cerrada', 'simulada')) then
    raise exception 'Hay una jornada en juego: espera a que se publique para terminar la temporada' using errcode = 'P0001';
  end if;

  update jornadas j set estado = 'cancelada' where j.temporada_id = v_t.id and j.estado = 'programada';
  v_clas := clasificacion_temporada(v_t.id);
  update temporadas t set estado = 'terminada', terminada_en = now(), terminada_antes = p_antes, clasificacion_final = v_clas
   where t.id = v_t.id;
  update ligas l set estado = 'entre_temporadas', pausada_en = null where l.id = p_liga;
  perform cancelar_subastas_liga(p_liga, 'fin de temporada');

  perform apuntar_historial(p_liga, 'temporada',
    format('Termina la temporada %s%s. Campeón: %s', v_t.numero, case when p_antes then ' (antes de tiempo)' else '' end,
           coalesce(v_clas -> 0 ->> 'equipo', '—')),
    jsonb_build_object('temporada_id', v_t.id, 'clasificacion', v_clas));
  perform notificar_liga(p_liga, 'temporada_terminada',
    format('Ha terminado la temporada %s. Campeón: %s', v_t.numero, coalesce(v_clas -> 0 ->> 'equipo', '—')),
    jsonb_build_object('temporada_id', v_t.id));
  return jsonb_build_object('temporada_id', v_t.id, 'numero', v_t.numero, 'terminada_antes', p_antes, 'clasificacion', v_clas);
end $$;

-- Nueva temporada (a partir de la 2.ª): todo libre, saldos a 5.000 y reparto desde el álbum
create function public.reiniciar_para_temporada(p_liga uuid, p_temporada uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_t       temporadas;
  v_cfg     jsonb := config_liga(p_liga);
  v_inicial int := coalesce((v_cfg ->> 'saldo_inicial')::int, 5000);
  v_rep     jsonb;
  e         record;
  x         jsonb;
begin
  select * into v_t from temporadas t where t.id = p_temporada;

  -- 1) Se cancela todo lo pendiente y todas las cartas quedan libres
  update ventas v set estado = 'cancelada', resuelta_en = now() where v.liga_id = p_liga and v.estado = 'activa';
  update ofertas o set estado = 'cancelada' where o.liga_id = p_liga and o.estado = 'pendiente';
  update intercambios i set estado = 'cancelado' where i.liga_id = p_liga and i.estado = 'pendiente';
  perform cancelar_subastas_liga(p_liga, 'nueva temporada');
  update sobres_abiertos s set estado = 'cancelado' where s.liga_id = p_liga and s.estado = 'pendiente_eleccion';
  update cartas c
     set equipo_id = null, blindada_hasta = null, multiplicador_clausula = 1.5, tocada_en_jornada = null,
         reservada_hasta = null, reservada_por = null, adquirida_en = null
   where c.liga_id = p_liga;

  -- 2) Saldos al inicial, con su movimiento para que el libro cuadre
  for e in select eq.id, eq.saldo from equipos eq where eq.liga_id = p_liga loop
    if v_inicial - e.saldo <> 0 then
      perform mover_dinero(e.id, v_inicial - e.saldo, 'reinicio_temporada', 'temporada:' || v_t.numero);
    end if;
  end loop;
  update equipos eq set contador_garantia_premium = 0 where eq.liga_id = p_liga;

  -- 3) Plantillas desde el álbum y 4) alineación por defecto
  delete from alineaciones a using equipos eq where a.equipo_id = eq.id and eq.liga_id = p_liga;
  v_rep := repartir_desde_album(p_liga, v_t.semilla_reparto);
  for e in select eq.id from equipos eq where eq.liga_id = p_liga loop
    perform crear_alineacion_por_defecto(e.id);
  end loop;

  for x in select y from jsonb_array_elements(v_rep -> 'equipos') y loop
    if (x ->> 'cartas')::int < coalesce((v_cfg ->> 'plantilla_inicial')::int, 11) or not (x ->> 'dentro')::boolean then
      perform apuntar_historial(p_liga, 'reparto',
        format('%s recibe %s cartas de su álbum por un valor de %s (objetivo %s)', nombre_dueno((x ->> 'equipo_id')::uuid),
               x ->> 'cartas', fmt((x ->> 'valor_total')::numeric::bigint), fmt((v_rep ->> 'objetivo')::numeric::bigint)),
        x);
    end if;
  end loop;
  return v_rep;
end $$;

create function public.iniciar_temporada_interna(p_liga uuid, p_ahora timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_l       ligas;
  v_t       temporadas;
  v_num     int;
  v_n       int;
  v_rep     jsonb;
  v_primera timestamptz;
begin
  select * into v_l from ligas l where l.id = p_liga for update;
  if v_l.estado not in ('preparacion', 'entre_temporadas') then
    raise exception 'La temporada ya está en marcha (o la liga está en pausa)' using errcode = 'P0001';
  end if;
  select count(*) into v_n from equipos e where e.liga_id = p_liga;
  if v_n < 2 then
    raise exception 'Hacen falta al menos 2 equipos para empezar una temporada' using errcode = 'P0001';
  end if;
  select coalesce(max(t.numero), 0) + 1 into v_num from temporadas t where t.liga_id = p_liga;

  insert into temporadas (liga_id, numero, semilla_calendario, semilla_desempate, semilla_reparto, iniciada_en)
  values (p_liga, v_num, semilla_aleatoria(), semilla_aleatoria(),
          case when v_l.estado = 'entre_temporadas' then semilla_aleatoria() end, now())
  returning * into v_t;

  -- En la 1.ª temporada las plantillas son las de al unirse; después, desde el álbum
  if v_l.estado = 'entre_temporadas' then
    v_rep := reiniciar_para_temporada(p_liga, v_t.id);
  end if;

  perform generar_calendario(v_t.id, p_ahora);
  update ligas l set estado = 'en_curso', temporada = v_num, pausada_en = null where l.id = p_liga;
  select min(j.cierre_en) into v_primera from jornadas j where j.temporada_id = v_t.id;

  perform apuntar_historial(p_liga, 'temporada',
    format('Empieza la temporada %s: %s jornadas, la primera el %s', v_num,
           (select count(*) from jornadas j where j.temporada_id = v_t.id),
           to_char(v_primera at time zone coalesce(v_l.config ->> 'zona_horaria', 'Europe/Madrid'), 'DD/MM')),
    jsonb_build_object('temporada_id', v_t.id));
  perform notificar_liga(p_liga, 'temporada_iniciada', format('Empieza la temporada %s', v_num),
    jsonb_build_object('temporada_id', v_t.id));
  return jsonb_build_object('temporada_id', v_t.id, 'numero', v_num,
                            'jornadas', (select count(*) from jornadas j where j.temporada_id = v_t.id),
                            'primera_jornada', v_primera, 'reparto', v_rep);
end $$;

-- ── Pausa ──────────────────────────────────────────────────────────────────
create function public.pausar_liga(p_liga uuid, p_ahora timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_l ligas;
  v_t temporadas;
  v_n int;
begin
  select * into v_l from ligas l where l.id = p_liga for update;
  if v_l.estado <> 'en_curso' then
    raise exception 'Solo se puede pausar una liga con la temporada en marcha' using errcode = 'P0001';
  end if;
  v_t := temporada_actual(p_liga);
  if exists (select 1 from jornadas j where j.temporada_id = v_t.id and j.estado in ('cerrada', 'simulada')) then
    raise exception 'Hay una jornada en juego: espera a que se publique para pausar' using errcode = 'P0001';
  end if;
  update ligas l set estado = 'pausada', pausada_en = p_ahora where l.id = p_liga;
  update temporadas t set estado = 'pausada' where t.id = v_t.id;
  v_n := cancelar_subastas_liga(p_liga, 'liga en pausa');
  perform apuntar_historial(p_liga, 'pausa', 'La liga se pausa: mercado cerrado y calendario congelado',
    jsonb_build_object('subastas_canceladas', v_n));
  perform notificar_liga(p_liga, 'liga_pausada', 'La liga está en pausa: el mercado está cerrado y el calendario congelado');
  return jsonb_build_object('estado', 'pausada', 'subastas_canceladas', v_n, 'pausada_en', p_ahora);
end $$;

create function public.reanudar_liga(p_liga uuid, p_ahora timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_l       ligas;
  v_t       temporadas;
  v_d       interval;
  v_tz      text;
  v_proxima date;
begin
  select * into v_l from ligas l where l.id = p_liga for update;
  if v_l.estado <> 'pausada' then
    raise exception 'La liga no está en pausa' using errcode = 'P0001';
  end if;
  v_t := temporada_actual(p_liga);
  v_tz := coalesce(v_l.config ->> 'zona_horaria', 'Europe/Madrid');
  v_d := greatest(p_ahora - v_l.pausada_en, interval '0');

  -- Blindajes vigentes y caducidades se alargan lo que duró la pausa
  update cartas c set blindada_hasta = c.blindada_hasta + v_d where c.liga_id = p_liga and c.blindada_hasta > v_l.pausada_en;
  update cartas c set reservada_hasta = c.reservada_hasta + v_d where c.liga_id = p_liga and c.reservada_por is not null;
  update ofertas o set caduca_en = o.caduca_en + v_d where o.liga_id = p_liga and o.estado = 'pendiente';
  update intercambios i set caduca_en = i.caduca_en + v_d where i.liga_id = p_liga and i.estado = 'pendiente';
  update sobres_abiertos s set caduca_en = s.caduca_en + v_d where s.liga_id = p_liga and s.estado = 'pendiente_eleccion';

  -- La próxima jornada, al primer domingo con 24 h por delante; las demás, semana a semana
  v_proxima := primera_fecha_jornada(p_liga, p_ahora);
  perform recolocar_jornadas(v_t.id, v_proxima);

  -- Las subastas vuelven en la siguiente medianoche: hoy cuenta como día ya servido
  insert into tandas_mercado (liga_id, fecha, abierta_en, cartas)
  values (p_liga, (p_ahora at time zone v_tz)::date, p_ahora, 0)
  on conflict do nothing;

  update ligas l set estado = 'en_curso', pausada_en = null where l.id = p_liga;
  update temporadas t set estado = 'en_curso' where t.id = v_t.id;
  perform apuntar_historial(p_liga, 'pausa',
    format('La liga se reanuda tras %s; la próxima jornada es el %s', justify_interval(date_trunc('minute', v_d)),
           to_char(v_proxima, 'DD/MM')),
    jsonb_build_object('duracion_segundos', extract(epoch from v_d)));
  perform notificar_liga(p_liga, 'liga_reanudada',
    format('La liga se reanuda. Próxima jornada: %s. Las subastas vuelven a medianoche', to_char(v_proxima, 'DD/MM')));
  return jsonb_build_object('estado', 'en_curso', 'pausa', v_d, 'proxima_jornada', v_proxima);
end $$;

-- ── Tareas programadas de jornada ──────────────────────────────────────────
-- Idempotente. Para cada liga en curso (sin p_liga: todas menos las de prueba):
-- cierra las jornadas vencidas, pide su simulación y publica las simuladas.
create function public.slr_tareas_jornadas(p_ahora timestamptz default now(), p_liga uuid default null,
                                           p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  l     record;
  j     record;
  v_t   temporadas;
  v_res jsonb := '{"cerradas":0,"simulaciones_pedidas":0,"publicadas":0}';
begin
  for l in select lg.id from ligas lg
           where lg.estado = 'en_curso'
             and (case when p_liga is null then not lg.es_prueba else lg.id = p_liga end)
  loop
    v_t := temporada_actual(l.id);
    for j in select x.id from jornadas x where x.temporada_id = v_t.id and x.estado = 'programada' and x.cierre_en <= p_ahora
             order by x.numero loop
      if cerrar_jornada(j.id) then
        v_res := jsonb_set(v_res, '{cerradas}', to_jsonb((v_res ->> 'cerradas')::int + 1));
      end if;
    end loop;
    if p_simular then
      for j in select x.id from jornadas x where x.temporada_id = v_t.id and x.estado = 'cerrada'
                 and (x.simulacion_pedida_en is null or x.simulacion_pedida_en < now() - interval '2 minutes')
               order by x.numero loop
        perform pedir_simulacion(j.id);
        v_res := jsonb_set(v_res, '{simulaciones_pedidas}', to_jsonb((v_res ->> 'simulaciones_pedidas')::int + 1));
      end loop;
    end if;
    for j in select x.id from jornadas x where x.temporada_id = v_t.id and x.estado = 'simulada' and x.publicacion_en <= p_ahora
             order by x.numero loop
      if publicar_jornada(j.id) then
        v_res := jsonb_set(v_res, '{publicadas}', to_jsonb((v_res ->> 'publicadas')::int + 1));
      end if;
    end loop;
  end loop;
  return v_res;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Interfaz con la Edge Function slr-simular (solo service_role)
-- ═══════════════════════════════════════════════════════════════════════════
create function public.motor_jornada_pendiente(p_jornada uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_estado text;
begin
  select j.estado into v_estado from jornadas j where j.id = p_jornada;
  if v_estado is distinct from 'cerrada' then
    return jsonb_build_object('estado', v_estado, 'partidos', '[]'::jsonb);
  end if;
  return jsonb_build_object('estado', v_estado, 'partidos', coalesce((
    select jsonb_agg(jsonb_build_object('partido_id', p.id, 'semilla', p.semilla,
                                        'local', p.alineaciones_congeladas -> 'local',
                                        'visitante', p.alineaciones_congeladas -> 'visitante') order by p.id)
    from partidos p where p.jornada_id = p_jornada), '[]'));
end $$;

-- Guarda los resultados de una jornada y calcula sus cobros. Idempotente:
-- si la jornada ya no está cerrada, no hace nada.
create function public.motor_guardar_jornada(p_jornada uuid, p_resultados jsonb, p_version text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_j     jornadas;
  r       jsonb;
  v_falta int;
  v_total int;
begin
  select * into v_j from jornadas j where j.id = p_jornada for update;
  if not found then
    raise exception 'Jornada no encontrada' using errcode = 'P0001';
  end if;
  if v_j.estado <> 'cerrada' then
    return jsonb_build_object('ya_simulada', true, 'estado', v_j.estado);
  end if;
  for r in select x from jsonb_array_elements(p_resultados) x loop
    update partidos p
       set goles_local = (r -> 'goles' ->> 0)::int, goles_visitante = (r -> 'goles' ->> 1)::int,
           p_local = (r ->> 'pA')::float8, p_visitante = (r ->> 'pB')::float8,
           pr = r -> 'pr', pr_esperado = r -> 'pr_esperado', lesiones = coalesce(r -> 'lesiones', '[]'),
           estadisticas = r -> 'estadisticas', version_motor = p_version, simulado_en = now()
     where p.id = (r ->> 'partido_id')::uuid and p.jornada_id = p_jornada;
  end loop;
  select count(*) filter (where p.goles_local is null), count(*) into v_falta, v_total from partidos p where p.jornada_id = p_jornada;
  if v_falta > 0 then
    raise exception 'Faltan los resultados de % partidos', v_falta using errcode = 'P0001';
  end if;
  update jornadas j set cobros = calcular_cobros(p_jornada), estado = 'simulada', simulada_en = now() where j.id = p_jornada;
  return jsonb_build_object('simulada', true, 'partidos', v_total);
end $$;

create function public.motor_preparar_amistoso(p_token text, p_rival uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(p_token);
  v_liga    uuid;
  v_eq      equipos;
  v_p       partidos;
begin
  select e.liga_id into v_liga from equipos e where e.id = p_rival;
  if v_liga is null then
    raise exception 'Ese equipo no existe' using errcode = 'P0001';
  end if;
  v_eq := equipo_en_liga(v_usuario, v_liga);
  if v_eq.id = p_rival then
    raise exception 'No puedes jugar un amistoso contra ti mismo' using errcode = 'P0001';
  end if;
  -- Amistoso: alineaciones guardadas, sin efecto de "tocada" ni consecuencias
  insert into partidos (liga_id, tipo, local_id, visitante_id, semilla, alineaciones_congeladas, creado_por)
  values (v_liga, 'amistoso', v_eq.id, p_rival, semilla_aleatoria(),
          jsonb_build_object('local', congelar_alineacion(v_eq.id, null), 'visitante', congelar_alineacion(p_rival, null)),
          v_usuario)
  returning * into v_p;
  return jsonb_build_object('partido_id', v_p.id, 'semilla', v_p.semilla,
                            'local', v_p.alineaciones_congeladas -> 'local', 'visitante', v_p.alineaciones_congeladas -> 'visitante');
end $$;

create function public.motor_guardar_amistoso(p_partido uuid, p_resultado jsonb, p_version text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_p partidos;
begin
  select * into v_p from partidos p where p.id = p_partido and p.tipo = 'amistoso' for update;
  if not found or v_p.goles_local is not null then
    return jsonb_build_object('ya_guardado', true);
  end if;
  update partidos p
     set goles_local = (p_resultado -> 'goles' ->> 0)::int, goles_visitante = (p_resultado -> 'goles' ->> 1)::int,
         pr = p_resultado -> 'pr', lesiones = coalesce(p_resultado -> 'lesiones', '[]'),
         estadisticas = p_resultado -> 'estadisticas', version_motor = p_version, simulado_en = now()
   where p.id = p_partido;
  perform notificar(v_p.visitante_id, 'amistoso',
    format('%s te ha retado a un amistoso: %s-%s', nombre_dueno(v_p.local_id),
           p_resultado -> 'goles' ->> 0, p_resultado -> 'goles' ->> 1),
    jsonb_build_object('partido_id', p_partido));
  return jsonb_build_object('partido_id', p_partido, 'goles', p_resultado -> 'goles');
end $$;

-- Próximo partido de un equipo con las alineaciones tal como se congelarían ahora
create function public.motor_preparar_pronostico(p_token text, p_equipo uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(p_token);
  v_liga    uuid;
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
  if not found then
    return jsonb_build_object('sin_partido', true);
  end if;
  return jsonb_build_object(
    'partido_id', r.partido_id, 'jornada', r.numero, 'cierre_en', r.cierre_en,
    'es_local', r.local_id = p_equipo,
    'rival_id', case when r.local_id = p_equipo then r.visitante_id else r.local_id end,
    'local', congelar_alineacion(r.local_id, r.jornada_id),
    'visitante', congelar_alineacion(r.visitante_id, r.jornada_id));
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- API (slr_*)
-- ═══════════════════════════════════════════════════════════════════════════
create function public.slr_iniciar_temporada(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_iniciar_temporada.token);
begin
  perform exigir_admin(v_usuario, slr_iniciar_temporada.liga_id);
  return iniciar_temporada_interna(slr_iniciar_temporada.liga_id, now());
end $$;

create function public.slr_terminar_temporada(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_terminar_temporada.token);
begin
  perform exigir_admin(v_usuario, slr_terminar_temporada.liga_id);
  return terminar_temporada_interna(slr_terminar_temporada.liga_id, true);
end $$;

create function public.slr_pausar(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_pausar.token);
begin
  perform exigir_admin(v_usuario, slr_pausar.liga_id);
  return pausar_liga(slr_pausar.liga_id, now());
end $$;

create function public.slr_reanudar(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_reanudar.token);
begin
  perform exigir_admin(v_usuario, slr_reanudar.liga_id);
  return reanudar_liga(slr_reanudar.liga_id, now());
end $$;

-- La próxima jornada pendiente y todas las siguientes se mueven una semana
create function public.slr_aplazar_jornada(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_aplazar_jornada.token);
  v_liga    uuid := slr_aplazar_jornada.liga_id;
  v_t       temporadas;
  v_primera record;
  r         record;
begin
  perform exigir_admin(v_usuario, v_liga);
  perform 1 from ligas l where l.id = v_liga and l.estado = 'en_curso' for update;
  if not found then
    raise exception 'Solo se puede aplazar con la temporada en marcha' using errcode = 'P0001';
  end if;
  v_t := temporada_actual(v_liga);
  select j.numero, j.fecha into v_primera from jornadas j where j.temporada_id = v_t.id and j.estado = 'programada'
  order by j.numero limit 1;
  if not found then
    raise exception 'No quedan jornadas pendientes' using errcode = 'P0001';
  end if;
  for r in select j.id, j.fecha from jornadas j where j.temporada_id = v_t.id and j.estado = 'programada' loop
    perform fechar_jornada(r.id, r.fecha + 7);
  end loop;
  perform apuntar_historial(v_liga, 'aplazamiento',
    format('Se aplaza la jornada %s al %s (y las siguientes una semana)', v_primera.numero, to_char(v_primera.fecha + 7, 'DD/MM')),
    jsonb_build_object('temporada_id', v_t.id, 'numero', v_primera.numero));
  perform notificar_liga(v_liga, 'jornada_aplazada',
    format('La jornada %s se aplaza una semana, al %s', v_primera.numero, to_char(v_primera.fecha + 7, 'DD/MM')));
  return jsonb_build_object('jornada', v_primera.numero, 'nueva_fecha', v_primera.fecha + 7);
end $$;

-- Confirma la alineación guardada sin cambiarla (cuenta para el bonus de participación)
create function public.slr_confirmar_alineacion(token text, equipo_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_confirmar_alineacion.token);
  v_equipo  uuid := slr_confirmar_alineacion.equipo_id;
  v_liga    uuid;
begin
  select e.liga_id into v_liga from equipos e where e.id = v_equipo and e.usuario_id = v_usuario;
  if v_liga is null then
    raise exception 'Ese equipo no es tuyo' using errcode = 'P0001';
  end if;
  if alineaciones_cerradas(v_liga) then
    raise exception 'Las alineaciones están cerradas hasta que se publique la jornada' using errcode = 'P0001';
  end if;
  update alineaciones a set guardada_en = now(), automatica = false where a.equipo_id = v_equipo;
  if not found then
    raise exception 'No tienes ninguna alineación guardada' using errcode = 'P0001';
  end if;
  return (select to_jsonb(a) from alineaciones a where a.equipo_id = v_equipo);
end $$;

-- ── Lecturas ───────────────────────────────────────────────────────────────
create function public.jornada_json(p_jornada uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', j.id, 'numero', j.numero, 'fecha', j.fecha, 'cierre_en', j.cierre_en, 'publicacion_en', j.publicacion_en,
    'estado', j.estado,
    'descansa', case when j.descansa_id is null then null
                else jsonb_build_object('equipo_id', j.descansa_id, 'equipo', (select e.nombre from equipos e where e.id = j.descansa_id)) end,
    'partidos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'local', jsonb_build_object('equipo_id', p.local_id, 'equipo', (select e.nombre from equipos e where e.id = p.local_id)),
               'visitante', jsonb_build_object('equipo_id', p.visitante_id, 'equipo', (select e.nombre from equipos e where e.id = p.visitante_id)))
             || case when j.estado = 'publicada' then jsonb_build_object(
                  'goles', jsonb_build_array(p.goles_local, p.goles_visitante),
                  'p_local', p.p_local, 'p_visitante', p.p_visitante) else '{}'::jsonb end
             order by p.id)
      from partidos p where p.jornada_id = j.id), '[]'))
  from jornadas j where j.id = p_jornada
$$;

create function public.slr_calendario(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_calendario.token);
  v_liga    uuid := slr_calendario.liga_id;
  v_t       temporadas;
begin
  perform exigir_miembro(v_usuario, v_liga);
  v_t := temporada_actual(v_liga);
  if v_t.id is null then
    return jsonb_build_object('temporada', null, 'jornadas', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'temporada', jsonb_build_object('id', v_t.id, 'numero', v_t.numero, 'estado', v_t.estado),
    'jornadas', coalesce((select jsonb_agg(jornada_json(j.id) order by j.numero) from jornadas j where j.temporada_id = v_t.id), '[]'));
end $$;

create function public.slr_jornada(token text, liga_id uuid, numero int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_jornada.token);
  v_liga    uuid := slr_jornada.liga_id;
  v_id      uuid;
begin
  perform exigir_miembro(v_usuario, v_liga);
  select j.id into v_id from jornadas j
  where j.temporada_id = (temporada_actual(v_liga)).id and j.numero = slr_jornada.numero;
  if v_id is null then
    raise exception 'Esa jornada no existe' using errcode = 'P0001';
  end if;
  return jornada_json(v_id);
end $$;

-- Datos para reproducir un partido: solo publicado (o amistoso)
create function public.slr_partido(token text, partido_id uuid) returns jsonb
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
    'pr', v_p.pr, 'pr_esperado', v_p.pr_esperado, 'lesiones', v_p.lesiones, 'estadisticas', v_p.estadisticas);
end $$;

-- Clasificación de una temporada (la actual si no se indica): la final guardada
-- si ya terminó; si no, la calculada en vivo con los desempates
create function public.slr_clasificacion(token text, liga_id uuid, temporada int default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_clasificacion.token);
  v_liga    uuid := slr_clasificacion.liga_id;
  v_t       temporadas;
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
  return jsonb_build_object(
    'temporada', jsonb_build_object('numero', v_t.numero, 'estado', v_t.estado, 'terminada_antes', v_t.terminada_antes),
    'clasificacion', coalesce(v_t.clasificacion_final, clasificacion_temporada(v_t.id)));
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Pruebas (solo el admin de una liga de prueba)
-- ═══════════════════════════════════════════════════════════════════════════
drop function public.slr_prueba_tareas(text, uuid, timestamptz);
create function public.slr_prueba_tareas(token text, liga_id uuid, ahora timestamptz, simular boolean default true) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_prueba_tareas.token);
  v_ahora   timestamptz := coalesce(slr_prueba_tareas.ahora, now());
begin
  perform exigir_admin_prueba(v_usuario, slr_prueba_tareas.liga_id);
  return slr_tareas_mercado(v_ahora, slr_prueba_tareas.liga_id)
      || slr_tareas_jornadas(v_ahora, slr_prueba_tareas.liga_id, coalesce(slr_prueba_tareas.simular, true));
end $$;

create function public.slr_prueba_pausar(token text, liga_id uuid, ahora timestamptz) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform exigir_admin_prueba(sesion_usuario(slr_prueba_pausar.token), slr_prueba_pausar.liga_id);
  return pausar_liga(slr_prueba_pausar.liga_id, slr_prueba_pausar.ahora);
end $$;

create function public.slr_prueba_reanudar(token text, liga_id uuid, ahora timestamptz) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform exigir_admin_prueba(sesion_usuario(slr_prueba_reanudar.token), slr_prueba_reanudar.liga_id);
  return reanudar_liga(slr_prueba_reanudar.liga_id, slr_prueba_reanudar.ahora);
end $$;

-- Partidos de jornadas cerradas (aún sin simular) con sus alineaciones congeladas
create function public.slr_prueba_partidos(token text, liga_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform exigir_admin_prueba(sesion_usuario(slr_prueba_partidos.token), slr_prueba_partidos.liga_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('partido_id', p.id, 'jornada', j.numero, 'jornada_id', j.id, 'estado', j.estado,
                                        'local_id', p.local_id, 'visitante_id', p.visitante_id,
                                        'semilla', p.semilla, 'alineaciones_congeladas', p.alineaciones_congeladas) order by j.numero)
    from partidos p join jornadas j on j.id = p.jornada_id
    where p.liga_id = slr_prueba_partidos.liga_id and j.estado = 'cerrada'), '[]');
end $$;

-- Fija la semilla de un partido cerrado aún sin simular (para forzar sucesos en los tests)
create function public.slr_prueba_fijar_semilla(token text, partido_id uuid, semilla bigint) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_p partidos;
begin
  select * into v_p from partidos p where p.id = slr_prueba_fijar_semilla.partido_id;
  perform exigir_admin_prueba(sesion_usuario(slr_prueba_fijar_semilla.token), v_p.liga_id);
  update partidos p set semilla = slr_prueba_fijar_semilla.semilla
   where p.id = v_p.id and exists (select 1 from jornadas j where j.id = p.jornada_id and j.estado = 'cerrada');
  return found;
end $$;

-- ── Permisos ───────────────────────────────────────────────────────────────
revoke execute on function
  public.url_funcion_simular(), public.ids_titulares(jsonb), public.ids_alineacion(jsonb),
  public.exigir_admin(uuid, uuid), public.exigir_miembro(uuid, uuid), public.cerrar_jornada(uuid),
  public.pedir_simulacion(uuid), public.ojo_clinico(uuid, text), public.calcular_cobros(uuid),
  public.publicar_jornada(uuid), public.terminar_temporada_interna(uuid, boolean),
  public.reiniciar_para_temporada(uuid, uuid), public.iniciar_temporada_interna(uuid, timestamptz),
  public.pausar_liga(uuid, timestamptz), public.reanudar_liga(uuid, timestamptz),
  public.slr_tareas_jornadas(timestamptz, uuid, boolean), public.jornada_json(uuid),
  public.motor_jornada_pendiente(uuid), public.motor_guardar_jornada(uuid, jsonb, text),
  public.motor_preparar_amistoso(text, uuid), public.motor_guardar_amistoso(uuid, jsonb, text),
  public.motor_preparar_pronostico(text, uuid)
from public, anon, authenticated;

-- La Edge Function usa la clave de servicio
grant execute on function
  public.motor_jornada_pendiente(uuid), public.motor_guardar_jornada(uuid, jsonb, text),
  public.motor_preparar_amistoso(text, uuid), public.motor_guardar_amistoso(uuid, jsonb, text),
  public.motor_preparar_pronostico(text, uuid)
to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'slr_iniciar_temporada(text, uuid)', 'slr_terminar_temporada(text, uuid)', 'slr_pausar(text, uuid)',
    'slr_reanudar(text, uuid)', 'slr_aplazar_jornada(text, uuid)', 'slr_confirmar_alineacion(text, uuid)',
    'slr_calendario(text, uuid)', 'slr_jornada(text, uuid, int)', 'slr_partido(text, uuid)',
    'slr_clasificacion(text, uuid, int)', 'slr_prueba_tareas(text, uuid, timestamptz, boolean)',
    'slr_prueba_pausar(text, uuid, timestamptz)', 'slr_prueba_reanudar(text, uuid, timestamptz)',
    'slr_prueba_partidos(text, uuid)', 'slr_prueba_fijar_semilla(text, uuid, bigint)'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- ── Cron: tareas de jornada cada 5 minutos ─────────────────────────────────
select cron.schedule('slr-tareas-jornadas', '*/5 * * * *', $$select public.slr_tareas_jornadas(now())$$);
