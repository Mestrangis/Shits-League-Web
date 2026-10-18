-- SHITS LEAGUE RUSH — colección de la semana: redacción del aviso al elegirla a mano

create or replace function public.slr_admin_coleccion_semana(token text, liga_id uuid, coleccion_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  v_liga  uuid := slr_admin_coleccion_semana.liga_id;
  v_col   uuid := slr_admin_coleccion_semana.coleccion_id;
  v_max   text;
  v_aviso text;
  v_sig   jsonb;
begin
  perform exigir_modo_beta(sesion_usuario(slr_admin_coleccion_semana.token), v_liga);
  if v_col is null then
    delete from colecciones_semana cs where cs.liga_id = v_liga and cs.semana = semana_liga(v_liga);
    v_col := coleccion_semana(v_liga);
    return jsonb_build_object('coleccion_id', v_col, 'semana', semana_liga(v_liga), 'sorteada', true);
  end if;
  if not exists (select 1 from colecciones k where k.id = v_col and (k.liga_prueba_id is null or k.liga_prueba_id = v_liga)) then
    raise exception 'Esa colección no existe en esta liga' using errcode = 'P0001';
  end if;
  if not coleccion_desbloqueada(v_liga, v_col) then
    v_max := rareza_maxima_coleccion(v_liga, v_col);
    select jsonb_build_object('jornada', (t ->> 'desde')::int) into v_sig
    from jsonb_array_elements(config_liga(v_liga) -> 'progresion' -> 'tramos') t
    where t -> 'rarezas' ? v_max order by (t ->> 'desde')::int limit 1;
    v_aviso := format('Esta colección tiene cartas %s, que aún no están desbloqueadas (jornada %s; llegan en la jornada %s). Queda elegida igual, porque la has puesto a mano.',
      case v_max when 'legendaria' then 'legendarias' when 'epica' then 'épicas' else v_max || 's' end,
      jornada_progresion(v_liga), coalesce(v_sig ->> 'jornada', '?'));
  end if;
  insert into colecciones_semana (liga_id, semana, coleccion_id, manual) values (v_liga, semana_liga(v_liga), v_col, true)
  on conflict (liga_id, semana) do update set coleccion_id = excluded.coleccion_id, manual = true, elegida_en = now();
  perform apuntar_historial(v_liga, 'coleccion_semana',
    format('Colección de la semana: %s (elegida por el administrador)', (select k.nombre from colecciones k where k.id = v_col)),
    jsonb_build_object('coleccion_id', v_col, 'manual', true, 'aviso', v_aviso));
  return jsonb_build_object('coleccion_id', v_col, 'semana', semana_liga(v_liga), 'aviso', v_aviso);
end $$;
