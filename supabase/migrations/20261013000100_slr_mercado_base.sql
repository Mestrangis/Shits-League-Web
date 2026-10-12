-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — mercado (paso 3), parte 1: esquema y utilidades internas
-- Especificación: secciones 7, 8 y 9 + complementaria §1–3. Decisiones en
-- docs/slr/DECISIONES.md.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Esquema ────────────────────────────────────────────────────────────────
-- Ligas de prueba: solo las mueve slr_prueba_tareas (el cron no las toca)
alter table public.ligas add column es_prueba boolean not null default false;
grant select (es_prueba) on public.ligas to anon, authenticated;

alter table public.sobres_abiertos
  add column liga_id uuid not null references public.ligas(id) on delete cascade,
  add column caduca_en timestamptz,                         -- sobre de elección
  add column garantia_aplicada boolean not null default false;
create index sobres_abiertos_liga_idx on public.sobres_abiertos(liga_id);
create index sobres_pendientes_idx on public.sobres_abiertos(equipo_id) where estado = 'pendiente_eleccion';

-- Reserva de las candidatas de un sobre de elección (complementaria §3.2)
alter table public.cartas add column reservada_por uuid references public.sobres_abiertos(id) on delete set null;
create index cartas_reservada_por_idx on public.cartas(reservada_por) where reservada_por is not null;

-- Tandas diarias de subastas: una por liga y día local
create table public.tandas_mercado (
  liga_id     uuid not null references public.ligas(id) on delete cascade,
  fecha       date not null,
  abierta_en  timestamptz not null,
  cartas      int not null default 0,
  primary key (liga_id, fecha)
);
alter table public.tandas_mercado enable row level security;
revoke all on public.tandas_mercado from anon, authenticated;
grant select on public.tandas_mercado to anon, authenticated;
create policy lectura_publica on public.tandas_mercado for select to anon, authenticated using (true);

alter table public.subastas add column tanda date not null;
create index subastas_tanda_idx on public.subastas(liga_id, tanda);
create unique index subastas_carta_abierta_uq on public.subastas(carta_id) where estado = 'abierta';

alter table public.pujas add column estado text not null default 'activa'
  check (estado in ('activa', 'ganadora', 'perdedora', 'anulada'));

create unique index ventas_carta_activa_uq on public.ventas(carta_id) where estado = 'activa';
create index ofertas_pendientes_idx on public.ofertas(liga_id, caduca_en) where estado = 'pendiente';
create index intercambios_pendientes_idx on public.intercambios(liga_id, caduca_en) where estado = 'pendiente';
create index intercambios_cartas_de_idx on public.intercambios using gin (cartas_de);
create index intercambios_cartas_para_idx on public.intercambios using gin (cartas_para);
create index historial_datos_carta_idx on public.historial ((datos ->> 'carta_id'));

-- ═══════════════════════════════════════════════════════════════════════════
-- Utilidades internas (no se pueden llamar desde fuera)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1186 → '1.186'
create function public.fmt(p_n bigint) returns text
language sql immutable as $$
  select replace(to_char(p_n, 'FM999,999,999,990'), ',', '.')
$$;

create function public.config_liga(p_liga uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select l.config from ligas l where l.id = p_liga
$$;

create function public.plantilla_maxima(p_liga uuid) returns int
language sql stable set search_path = public, extensions as $$
  select coalesce((config_liga(p_liga) ->> 'plantilla_maxima')::int, 15)
$$;

-- 'Pichichi' o 'Pichichi (foil)'
create function public.nombre_carta(p_carta uuid) returns text
language sql stable set search_path = public, extensions as $$
  select d.nombre || case when c.variante = 'normal' then '' else ' (' || c.variante || ')' end
  from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = p_carta
$$;

create function public.nombre_dueno(p_equipo uuid) returns text
language sql stable set search_path = public, extensions as $$
  select u.nombre from equipos e join usuarios u on u.id = e.usuario_id where e.id = p_equipo
$$;

create function public.valor_carta(p_carta uuid) returns int
language sql stable set search_path = public, extensions as $$
  select d.valor from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = p_carta
$$;

-- Cláusula = valor × multiplicador, redondeada
create function public.clausula_carta(p_carta uuid) returns int
language sql stable set search_path = public, extensions as $$
  select round(d.valor * c.multiplicador_clausula)::int
  from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = p_carta
$$;

-- Una carta está en el mercado si tiene una subasta abierta
create function public.en_subasta(p_carta uuid) returns boolean
language sql stable set search_path = public, extensions as $$
  select exists (select 1 from subastas s where s.carta_id = p_carta and s.estado = 'abierta')
$$;

create function public.carta_json(p_carta uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', c.id, 'diseno_id', d.id, 'nombre', d.nombre, 'tipo', d.tipo, 'variante', c.variante,
    'ata', d.ata, 'def', d.def, 'con', d.con, 'ovr', round(ovr(d.ata, d.def, d.con), 2),
    'poderes', d.poderes, 'valor', d.valor, 'imagen_url', d.imagen_url, 'beta', d.beta)
  from cartas c join disenos_carta d on d.id = c.diseno_id where c.id = p_carta
$$;

create function public.notificar(p_equipo uuid, p_tipo text, p_texto text, p_datos jsonb default '{}')
returns void
language sql volatile set search_path = public, extensions as $$
  insert into notificaciones (usuario_id, liga_id, tipo, datos)
  select e.usuario_id, e.liga_id, p_tipo, jsonb_build_object('texto', p_texto) || coalesce(p_datos, '{}')
  from equipos e where e.id = p_equipo
$$;

create function public.apuntar_historial(p_liga uuid, p_tipo text, p_texto text, p_datos jsonb default '{}')
returns void
language sql volatile set search_path = public, extensions as $$
  insert into historial (liga_id, tipo, texto, datos) values (p_liga, p_tipo, p_texto, coalesce(p_datos, '{}'))
$$;

-- Cartas que ocupan la plantilla: las propias + 1 por cada sobre de elección pendiente
-- (así la carta elegida siempre tiene sitio)
create function public.plantilla_ocupada(p_equipo uuid) returns int
language sql stable set search_path = public, extensions as $$
  select (select count(*) from cartas c where c.equipo_id = p_equipo)::int
       + (select count(*) from sobres_abiertos s where s.equipo_id = p_equipo and s.estado = 'pendiente_eleccion')::int
$$;

create function public.exigir_hueco(p_equipo uuid, p_entran int, p_salen int default 0) returns void
language plpgsql stable set search_path = public, extensions as $$
declare
  v_max int := plantilla_maxima((select e.liga_id from equipos e where e.id = p_equipo));
begin
  if plantilla_ocupada(p_equipo) - p_salen + p_entran > v_max then
    raise exception 'Tu plantilla está llena: no puedes pasar de % cartas. Vende alguna antes.', v_max
      using errcode = 'P0001';
  end if;
end $$;

-- Equipo del usuario en la liga, o error
create function public.equipo_en_liga(p_usuario uuid, p_liga uuid) returns public.equipos
language plpgsql stable set search_path = public, extensions as $$
declare
  v_eq equipos;
begin
  select * into v_eq from equipos e where e.liga_id = p_liga and e.usuario_id = p_usuario;
  if not found then
    raise exception 'No tienes equipo en esta liga' using errcode = 'P0001';
  end if;
  return v_eq;
end $$;

-- Liga a la que pertenece una carta, o error
create function public.liga_de_carta(p_carta uuid) returns uuid
language plpgsql stable set search_path = public, extensions as $$
declare
  v_liga uuid;
begin
  select c.liga_id into v_liga from cartas c where c.id = p_carta;
  if v_liga is null then
    raise exception 'Carta no encontrada' using errcode = 'P0001';
  end if;
  return v_liga;
end $$;

-- ── Traspasos ──────────────────────────────────────────────────────────────
-- Cancela las ventas, ofertas e intercambios pendientes de una carta y avisa
-- a los afectados. Se llama siempre que la carta cambia de dueño o vuelve al banco.
create function public.cancelar_pendientes_carta(p_carta uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  r record;
  v_nombre text := nombre_carta(p_carta);
begin
  for r in update ventas v set estado = 'cancelada', resuelta_en = now()
           where v.carta_id = p_carta and v.estado = 'activa' returning v.id, v.vendedor_id loop
    perform notificar(r.vendedor_id, 'venta_cancelada',
      format('Se ha cancelado tu venta de %s porque la carta ha cambiado de dueño', v_nombre),
      jsonb_build_object('venta_id', r.id, 'carta_id', p_carta));
  end loop;

  for r in update ofertas o set estado = 'cancelada'
           where o.carta_id = p_carta and o.estado = 'pendiente' returning o.id, o.de_id, o.para_id loop
    perform notificar(r.de_id, 'oferta_cancelada',
      format('Se ha cancelado la oferta por %s porque la carta ha cambiado de dueño', v_nombre),
      jsonb_build_object('oferta_id', r.id, 'carta_id', p_carta));
    perform notificar(r.para_id, 'oferta_cancelada',
      format('Se ha cancelado la oferta por %s porque la carta ha cambiado de dueño', v_nombre),
      jsonb_build_object('oferta_id', r.id, 'carta_id', p_carta));
  end loop;

  for r in update intercambios i set estado = 'cancelado'
           where i.estado = 'pendiente' and (i.cartas_de @> array[p_carta] or i.cartas_para @> array[p_carta])
           returning i.id, i.de_id, i.para_id loop
    perform notificar(r.de_id, 'intercambio_cancelado',
      format('Se ha cancelado un intercambio porque %s ha cambiado de dueño', v_nombre),
      jsonb_build_object('intercambio_id', r.id, 'carta_id', p_carta));
    perform notificar(r.para_id, 'intercambio_cancelado',
      format('Se ha cancelado un intercambio porque %s ha cambiado de dueño', v_nombre),
      jsonb_build_object('intercambio_id', r.id, 'carta_id', p_carta));
  end loop;
end $$;

-- La carta pasa a un equipo: blindaje, multiplicador 1,5, álbum y cancelaciones
create function public.adquirir_carta(p_carta uuid, p_equipo uuid, p_via text) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_liga uuid := liga_de_carta(p_carta);
  v_dias int := coalesce((config_liga(v_liga) ->> 'blindaje_dias')::int, 7);
begin
  perform cancelar_pendientes_carta(p_carta);
  update cartas c
     set equipo_id = p_equipo, blindada_hasta = now() + make_interval(days => v_dias),
         multiplicador_clausula = 1.5, adquirida_en = now(),
         reservada_hasta = null, reservada_por = null
   where c.id = p_carta;
  insert into album (usuario_id, liga_id, diseno_id, variante, via_adquisicion)
  select e.usuario_id, c.liga_id, c.diseno_id, c.variante, p_via
  from cartas c join equipos e on e.id = p_equipo
  where c.id = p_carta
  on conflict do nothing;
end $$;

-- La carta vuelve a ser libre (sin dueño, sin blindaje, multiplicador 1,5)
create function public.liberar_carta(p_carta uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  perform cancelar_pendientes_carta(p_carta);
  update cartas c
     set equipo_id = null, blindada_hasta = null, multiplicador_clausula = 1.5, adquirida_en = null
   where c.id = p_carta;
end $$;

-- ── Sobres de elección ─────────────────────────────────────────────────────
-- Entrega la carta elegida (o la primera si p_carta es null), libera las otras.
create function public.resolver_eleccion(p_sobre uuid, p_carta uuid) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_s       sobres_abiertos;
  v_elegida uuid;
begin
  select * into v_s from sobres_abiertos s where s.id = p_sobre for update;
  if not found then
    raise exception 'Sobre no encontrado' using errcode = 'P0001';
  end if;
  if v_s.estado <> 'pendiente_eleccion' then
    return v_s.elegida;
  end if;
  v_elegida := coalesce(p_carta, v_s.cartas[1]);
  if not (v_elegida = any(v_s.cartas)) then
    raise exception 'Esa carta no es una de las candidatas del sobre' using errcode = 'P0001';
  end if;

  update cartas c set reservada_hasta = null, reservada_por = null where c.reservada_por = p_sobre;
  update sobres_abiertos s set estado = 'abierto', elegida = v_elegida where s.id = p_sobre;
  perform adquirir_carta(v_elegida, v_s.equipo_id, 'sobre_eleccion');

  perform apuntar_historial(v_s.liga_id, 'sobre', format('%s elige a %s de un sobre de elección',
            nombre_dueno(v_s.equipo_id), nombre_carta(v_elegida)),
          jsonb_build_object('equipo_id', v_s.equipo_id, 'sobre_id', p_sobre, 'carta_id', v_elegida,
                             'automatica', p_carta is null));
  if p_carta is null then
    perform notificar(v_s.equipo_id, 'eleccion_automatica',
      format('Se acabó el tiempo para elegir: te llevas a %s, la primera candidata del sobre', nombre_carta(v_elegida)),
      jsonb_build_object('sobre_id', p_sobre, 'carta_id', v_elegida));
  end if;
  return v_elegida;
end $$;

-- Comprobaciones comunes antes de cualquier operación de mercado de un usuario:
-- es miembro, el mercado está abierto y no tiene un sobre de elección pendiente.
-- Devuelve su equipo.
create function public.preparar_operacion(p_usuario uuid, p_liga uuid) returns public.equipos
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_eq     equipos := equipo_en_liga(p_usuario, p_liga);
  v_estado text;
  r        record;
begin
  select l.estado into v_estado from ligas l where l.id = p_liga;
  if v_estado not in ('preparacion', 'en_curso') then
    raise exception 'El mercado de esta liga está cerrado' using errcode = 'P0001';
  end if;
  if liga_bloqueada(p_liga) then
    raise exception 'El mercado está cerrado hasta que se publique la jornada' using errcode = 'P0001';
  end if;
  -- Si su elección ya caducó, se resuelve ahora (sin esperar a la tarea programada)
  for r in select s.id from sobres_abiertos s
           where s.equipo_id = v_eq.id and s.estado = 'pendiente_eleccion' and s.caduca_en <= now() loop
    perform resolver_eleccion(r.id, null);
  end loop;
  if exists (select 1 from sobres_abiertos s where s.equipo_id = v_eq.id and s.estado = 'pendiente_eleccion') then
    raise exception 'Tienes un sobre de elección pendiente: elige tu carta antes de hacer otra operación de mercado'
      using errcode = 'P0001';
  end if;
  return v_eq;
end $$;

revoke execute on function
  public.fmt(bigint), public.config_liga(uuid), public.plantilla_maxima(uuid), public.nombre_carta(uuid),
  public.nombre_dueno(uuid), public.valor_carta(uuid), public.clausula_carta(uuid), public.en_subasta(uuid),
  public.carta_json(uuid), public.notificar(uuid, text, text, jsonb), public.apuntar_historial(uuid, text, text, jsonb),
  public.plantilla_ocupada(uuid), public.exigir_hueco(uuid, int, int), public.equipo_en_liga(uuid, uuid),
  public.liga_de_carta(uuid), public.cancelar_pendientes_carta(uuid), public.adquirir_carta(uuid, uuid, text),
  public.liberar_carta(uuid), public.resolver_eleccion(uuid, uuid), public.preparar_operacion(uuid, uuid)
from public, anon, authenticated;
