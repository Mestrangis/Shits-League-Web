-- Las cartas que llegan de un sobre pueden dejar la plantilla por encima del máximo
-- (el trigger lo impedía); el resto de vías sigue limitado.
create or replace function public.comprobar_plantilla_maxima() returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  v_max int;
  v_n   int;
begin
  if new.equipo_id is null then return new; end if;
  -- Una carta que llega de un sobre puede pasar del máximo: luego hay que hacer hueco
  if coalesce(current_setting('slr.sobre_excede', true), '') = '1' then return new; end if;
  select coalesce((config ->> 'plantilla_maxima')::int, 15) into v_max from ligas where id = new.liga_id;
  select count(*) into v_n from cartas where equipo_id = new.equipo_id;
  if v_n > v_max then
    raise exception 'La plantilla no puede superar % cartas', v_max using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.adquirir_carta(p_carta uuid, p_equipo uuid, p_via text) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_liga uuid := liga_de_carta(p_carta);
  v_dias int := coalesce((config_liga(v_liga) ->> 'blindaje_dias')::int, 7);
begin
  -- Las cartas de un sobre entran aunque la plantilla pase del máximo (después, «Haz hueco»)
  if p_via like 'sobre%' then
    perform set_config('slr.sobre_excede', '1', true);
  end if;
  perform cancelar_pendientes_carta(p_carta);
  update cartas c
     set equipo_id = p_equipo, blindada_hasta = now() + make_interval(days => v_dias),
         multiplicador_clausula = 1.5, adquirida_en = now(),
         reservada_hasta = null, reservada_por = null
   where c.id = p_carta;
  insert into album (usuario_id, liga_id, diseno_id, via_adquisicion)
  select e.usuario_id, c.liga_id, c.diseno_id, p_via
  from cartas c join equipos e on e.id = p_equipo
  where c.id = p_carta
  on conflict do nothing;
end $$;
