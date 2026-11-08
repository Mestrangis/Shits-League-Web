-- La temporada «???»: la fase del agujero y la pregunta de la votación. La lee la web y el Apps
-- Script (la tabla ajustes es de lectura pública). Los votos no están aquí: están en el Apps Script.
-- La cambia el panel de admin, con las mismas exigencias que el pistoletazo.
insert into public.ajustes (clave, valor, descripcion) values
  ('agujero', '{"fase": "agujero", "pregunta": "¿Quieres temporada 26/27?"}', 'Fase de la temporada «???» (js/agujero-app.js): agujero, votacion o cerrada, y la pregunta. La cambia el panel de admin.');

create function public.slr_admin_agujero(token text, liga_id uuid, fase text, pregunta text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_admin_agujero.token);
  v_valor jsonb;
begin
  perform exigir_modo_beta(v_usuario, slr_admin_agujero.liga_id);
  if exists (select 1 from usuarios u where u.id = v_usuario and u.es_bot) then
    raise exception 'Los bots no pueden cambiar la fase' using errcode = 'P0001';
  end if;
  if slr_admin_agujero.fase not in ('agujero', 'votacion', 'cerrada') then
    raise exception 'Fase no válida' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(slr_admin_agujero.pregunta, ''))) not between 1 and 120 then
    raise exception 'La pregunta tiene que tener entre 1 y 120 letras' using errcode = 'P0001';
  end if;
  v_valor := jsonb_build_object('fase', slr_admin_agujero.fase, 'pregunta', btrim(slr_admin_agujero.pregunta));
  update ajustes a set valor = v_valor, actualizado_en = now() where a.clave = 'agujero';
  return v_valor;
end $$;
revoke all on function public.slr_admin_agujero(text, uuid, text, text) from public;
grant execute on function public.slr_admin_agujero(text, uuid, text, text) to anon, authenticated;
