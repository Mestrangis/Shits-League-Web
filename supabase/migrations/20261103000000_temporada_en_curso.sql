-- La temporada en curso de la Shits League: la lee la web al arrancar (la tabla ajustes es de
-- lectura pública). «Empezar la temporada» la cambia y abre Rush a todos, todo a la vez;
-- deshacerlo devuelve las dos cosas. Solo desde el Modo pruebas, y nunca un bot.
insert into public.ajustes (clave, valor, descripcion) values
  ('temporada_en_curso', '"24-26"', 'Temporada por defecto de la Shits League (js/temporadas.js). La cambia el botón del Modo pruebas.');

create function public.slr_admin_empezar_temporada(token text, liga_id uuid, temporada text, rush_publico boolean)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_admin_empezar_temporada.token);
begin
  perform exigir_modo_beta(v_usuario, slr_admin_empezar_temporada.liga_id);
  if exists (select 1 from usuarios u where u.id = v_usuario and u.es_bot) then
    raise exception 'Los bots no pueden empezar una temporada' using errcode = 'P0001';
  end if;
  if slr_admin_empezar_temporada.temporada !~ '^\d{2}-\d{2}$' then
    raise exception 'Temporada no válida' using errcode = 'P0001';
  end if;
  update ajustes a set valor = to_jsonb(slr_admin_empezar_temporada.temporada), actualizado_en = now()
   where a.clave = 'temporada_en_curso';
  update ajustes a set valor = to_jsonb(slr_admin_empezar_temporada.rush_publico), actualizado_en = now()
   where a.clave = 'rush_publico';
  return jsonb_build_object('temporada', slr_admin_empezar_temporada.temporada, 'rush_publico', slr_admin_empezar_temporada.rush_publico);
end $$;
revoke all on function public.slr_admin_empezar_temporada(text, uuid, text, boolean) from public;
grant execute on function public.slr_admin_empezar_temporada(text, uuid, text, boolean) to anon, authenticated;
