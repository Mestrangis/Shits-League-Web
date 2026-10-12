-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — correcciones del paso 3 (encontradas con api-paso3.mjs)
-- ═══════════════════════════════════════════════════════════════════════════

-- slr_pujar: "on conflict (subasta_id, equipo_id)" chocaba con el parámetro
-- subasta_id (referencia ambigua). Se usa el nombre de la restricción.
create or replace function public.slr_pujar(token text, subasta_id uuid, importe int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_pujar.token);
  v_id      uuid := slr_pujar.subasta_id;
  v_importe int := slr_pujar.importe;
  v_sub     subastas;
  v_eq      equipos;
  v_minimo  int;
begin
  select * into v_sub from subastas s where s.id = v_id;
  if not found then
    raise exception 'Esa subasta no existe' using errcode = 'P0001';
  end if;
  v_eq := preparar_operacion(v_usuario, v_sub.liga_id);
  if v_sub.estado <> 'abierta' or v_sub.cierra_en <= now() then
    raise exception 'La subasta ya está cerrada' using errcode = 'P0001';
  end if;
  v_minimo := valor_carta(v_sub.carta_id);
  if v_importe is null or v_importe < v_minimo then
    raise exception 'La puja mínima es el valor de la carta: %', fmt(v_minimo) using errcode = 'P0001';
  end if;
  -- Se permite pujar por encima del saldo: solo se comprueba al resolver
  insert into pujas as p (subasta_id, equipo_id, importe)
  values (v_id, v_eq.id, v_importe)
  on conflict on constraint pujas_pkey do update set importe = excluded.importe, actualizada_en = now();
  return jsonb_build_object('subasta_id', v_id, 'importe', v_importe, 'cierra_en', v_sub.cierra_en);
end $$;
