-- Quién descubre cada carta: el PRIMERO de la liga en tenerla en su plantilla, sea como sea
-- (sobre, subasta, compra, cláusula, intercambio, reparto inicial o el modo pruebas).
-- · Por liga y «ronda»: la temporada en juego o en preparación (la 1.ª incluye la preparación,
--   cuando se reparten las plantillas al unirse). En una temporada nueva (las cartas vuelven al
--   bombo y se reparten desde el álbum) se puede volver a descubrir. La ronda es el número de la
--   última temporada creada (mínimo 1): al empezar la 2.ª, la temporada se crea antes de repartir.
-- · Lo apunta un trigger en cartas al pasar a un equipo (cualquier vía); las candidatas de un sobre
--   de elección solo se reservan (no tienen dueño): solo cuenta la elegida.
-- · Relleno: las que ya están repartidas, del álbum (el primero por primera_vez_en).

create or replace function public.ronda_descubrimiento(p_liga uuid) returns int
language sql stable security definer set search_path = public, extensions as $$
  select greatest(1, coalesce((select max(t.numero) from temporadas t where t.liga_id = p_liga), 1))
$$;

create table public.descubrimientos (
  liga_id        uuid not null references public.ligas(id) on delete cascade,
  ronda          int not null,
  diseno_id      uuid not null references public.disenos_carta(id) on delete cascade,
  usuario_id     uuid not null references public.usuarios(id) on delete cascade,
  equipo_id      uuid references public.equipos(id) on delete set null,
  descubierta_en timestamptz not null default now(),
  primary key (liga_id, ronda, diseno_id)
);
create index descubrimientos_usuario_idx on public.descubrimientos(liga_id, usuario_id);
alter table public.descubrimientos enable row level security;
create policy lectura_publica on public.descubrimientos for select to anon, authenticated using (true);

create or replace function public.apuntar_descubrimiento() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.equipo_id is null or (tg_op = 'UPDATE' and old.equipo_id is not distinct from new.equipo_id) then
    return new;
  end if;
  insert into descubrimientos (liga_id, ronda, diseno_id, usuario_id, equipo_id)
  select new.liga_id, ronda_descubrimiento(new.liga_id), new.diseno_id, e.usuario_id, e.id
  from equipos e where e.id = new.equipo_id
  on conflict do nothing;
  return new;
end $$;
create trigger cartas_descubrimiento after insert or update of equipo_id on public.cartas
  for each row execute function public.apuntar_descubrimiento();

-- Relleno: las que ya se han tenido, del álbum (el primero de cada liga por primera_vez_en)
insert into public.descubrimientos (liga_id, ronda, diseno_id, usuario_id, equipo_id, descubierta_en)
select distinct on (a.liga_id, a.diseno_id) a.liga_id, public.ronda_descubrimiento(a.liga_id), a.diseno_id, a.usuario_id,
       (select e.id from public.equipos e where e.liga_id = a.liga_id and e.usuario_id = a.usuario_id), a.primera_vez_en
from public.album a
order by a.liga_id, a.diseno_id, a.primera_vez_en, a.usuario_id
on conflict do nothing;

create or replace function public.carta_sobre(p_carta uuid, p_usuario uuid, p_nueva boolean) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select carta_json(p_carta) || jsonb_build_object('nueva', p_nueva,
    -- Descubrimiento: la ha descubierto este usuario ahora mismo (en esta compra) o nadie la
    -- tiene todavía (las candidatas de un sobre de elección: si la eliges, es tuya la primera)
    'descubrimiento', coalesce((select x.usuario_id = p_usuario and x.descubierta_en = now()
                                from descubrimientos x
                                where x.liga_id = c.liga_id and x.ronda = ronda_descubrimiento(c.liga_id) and x.diseno_id = c.diseno_id), true),
    'coleccion', (select jsonb_build_object('id', k.id, 'nombre', k.nombre, 'color', k.color, 'emblema_url', k.emblema_url,
                    'total', (select count(*) from disenos_carta d2 where d2.coleccion_id = k.id and d2.activo),
                    'tengo', (select count(*) from album a join disenos_carta d2 on d2.id = a.diseno_id
                              where a.usuario_id = p_usuario and a.liga_id = c.liga_id and d2.coleccion_id = k.id))
                  from colecciones k where k.id = d.coleccion_id))
  from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = p_carta
$$;

create or replace function public.slr_carta(token text, carta_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_carta.token);
  v_carta   uuid := slr_carta.carta_id;
  v_liga    uuid := liga_de_carta(v_carta);
  v_c       cartas;
begin
  if not exists (select 1 from equipos e where e.liga_id = v_liga and e.usuario_id = v_usuario)
     and not exists (select 1 from ligas l where l.id = v_liga and l.admin_id = v_usuario) then
    raise exception 'No perteneces a la liga de esa carta' using errcode = 'P0001';
  end if;
  select * into v_c from cartas c where c.id = v_carta;
  return carta_json(v_carta) || jsonb_build_object(
    'liga_id', v_liga,
    'dueno', case when v_c.equipo_id is null then null else jsonb_build_object(
               'equipo_id', v_c.equipo_id, 'equipo', (select e.nombre from equipos e where e.id = v_c.equipo_id),
               'usuario', nombre_dueno(v_c.equipo_id)) end,
    'multiplicador_clausula', v_c.multiplicador_clausula,
    'clausula', case when v_c.equipo_id is null then null else clausula_carta(v_carta) end,
    'blindada', v_c.blindada_hasta is not null and v_c.blindada_hasta > now(),
    'blindada_hasta', v_c.blindada_hasta,
    'reservada', v_c.reservada_por is not null,
    'en_venta', (select jsonb_build_object('venta_id', v.id, 'precio', v.precio)
                 from ventas v where v.carta_id = v_carta and v.estado = 'activa'),
    'en_subasta', (select jsonb_build_object('subasta_id', s.id, 'cierra_en', s.cierra_en)
                   from subastas s where s.carta_id = v_carta and s.estado = 'abierta'),
    -- Quién la descubrió (el primero de la liga en tenerla, en esta ronda), y en el historial
    -- como primer movimiento: una carta descubierta nunca sale «sin movimientos»
    'descubrimiento', (select jsonb_build_object('usuario', u.nombre, 'usuario_id', x.usuario_id, 'equipo', e.nombre,
                                                 'fecha', x.descubierta_en, 'tuyo', x.usuario_id = v_usuario)
                       from descubrimientos x join usuarios u on u.id = x.usuario_id left join equipos e on e.id = x.equipo_id
                       where x.liga_id = v_liga and x.ronda = ronda_descubrimiento(v_liga) and x.diseno_id = v_c.diseno_id),
    'historial', coalesce((
      select jsonb_agg(m order by (m ->> 'fecha')::timestamptz, m ->> 'tipo' <> 'descubrimiento')
      from (
        select jsonb_build_object('tipo', h.tipo, 'texto', h.texto, 'fecha', h.creado_en) m
        from historial h
        where h.liga_id = v_liga and (h.datos ->> 'carta_id' = v_carta::text or h.datos -> 'cartas' ? v_carta::text)
        union all
        select jsonb_build_object('tipo', 'descubrimiento', 'texto', format('%s la descubrió', u.nombre), 'fecha', x.descubierta_en)
        from descubrimientos x join usuarios u on u.id = x.usuario_id
        where x.liga_id = v_liga and x.ronda = ronda_descubrimiento(v_liga) and x.diseno_id = v_c.diseno_id
      ) t), '[]')
  );
end $$;

revoke execute on function public.apuntar_descubrimiento() from public, anon, authenticated;
