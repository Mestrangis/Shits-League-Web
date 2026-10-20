-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — cobros pendientes (sin destripar el resultado)
--   El bonus de sorpresa y el de ojo clínico dicen el resultado: a las personas
--   se les pagan al ver su partido (slr_marcar_visto) o, como tarde, al cerrar
--   la jornada siguiente. Mientras, no salen en el saldo ni en los movimientos.
--   Los bots del modo pruebas (usuarios internos) cobran al momento, como antes.
--   Se apartan de jornadas.cobros (se lee en público) al publicar.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.cobros_pendientes (
  id         bigint generated always as identity primary key,
  equipo_id  uuid not null references public.equipos(id) on delete cascade,
  partido_id uuid references public.partidos(id) on delete cascade,
  jornada_id uuid not null references public.jornadas(id) on delete cascade,
  tipo       text not null,
  importe    int not null check (importe <> 0),
  referencia text,
  creado_en  timestamptz not null default now()
);
create index cobros_pendientes_equipo_idx on public.cobros_pendientes(equipo_id);
alter table public.cobros_pendientes enable row level security;   -- privada

create function public.es_bonus_destripador(p_tipo text) returns boolean
language sql immutable as $$ select p_tipo in ('bonus_sorpresa', 'bonus_ojo_clinico') $$;

-- Al publicar: los bonus de las personas pasan a pendientes y salen de jornadas.cobros
create function public.apartar_bonus(p_jornada uuid) returns int
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_n int;
begin
  insert into cobros_pendientes (equipo_id, partido_id, jornada_id, tipo, importe, referencia)
  select e.id,
         (select p.id from partidos p where p.jornada_id = p_jornada and e.id in (p.local_id, p.visitante_id) limit 1),
         p_jornada, x ->> 'tipo', (x ->> 'importe')::int, x ->> 'referencia'
  from jornadas j
  cross join lateral jsonb_array_elements(coalesce(j.cobros, '[]')) x
  join equipos e on e.id = (x ->> 'equipo_id')::uuid
  join usuarios u on u.id = e.usuario_id
  where j.id = p_jornada and es_bonus_destripador(x ->> 'tipo') and not u.interno and coalesce((x ->> 'importe')::int, 0) <> 0;
  get diagnostics v_n = row_count;
  update jornadas j set cobros = (
    select coalesce(jsonb_agg(x), '[]')
    from jsonb_array_elements(coalesce(j.cobros, '[]')) x
    where not (es_bonus_destripador(x ->> 'tipo') and not coalesce((
      select u.interno from equipos e join usuarios u on u.id = e.usuario_id where e.id = (x ->> 'equipo_id')::uuid), true)))
  where j.id = p_jornada;
  return v_n;
end $$;

-- Paga lo pendiente de un equipo (de un partido o todo). Devuelve el total
create function public.pagar_pendientes(p_equipo uuid, p_partido uuid) returns int
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  c       record;
  v_total int := 0;
begin
  for c in delete from cobros_pendientes cp
           where cp.equipo_id = p_equipo and (p_partido is null or cp.partido_id = p_partido)
           returning cp.* loop
    perform mover_dinero(c.equipo_id, c.importe, c.tipo, c.referencia);
    v_total := v_total + c.importe;
  end loop;
  return v_total;
end $$;

create or replace function public.publicar_jornada(p_jornada uuid) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_j jornadas;
begin
  select * into v_j from jornadas j where j.id = p_jornada for update;
  if v_j.estado <> 'simulada' then
    return false;
  end if;
  perform gastar_energia_jornada(p_jornada);
  -- Sin destripar: el bonus de sorpresa y el de ojo clínico de las personas se pagan al ver el partido
  perform apartar_bonus(p_jornada);
  return publicar_jornada_base(p_jornada);
end $$;

create or replace function public.cerrar_jornada(p_jornada uuid) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_j jornadas;
  r   record;
begin
  select * into v_j from jornadas j where j.id = p_jornada for update;
  if v_j.estado <> 'programada' then
    return false;
  end if;
  -- Como tarde al cerrar la jornada siguiente: se paga lo que quedara pendiente de antes
  for r in select distinct cp.equipo_id from cobros_pendientes cp join equipos e on e.id = cp.equipo_id
           where e.liga_id = v_j.liga_id and cp.jornada_id <> p_jornada loop
    perform pagar_pendientes(r.equipo_id, null);
  end loop;
  for r in select e.id from equipos e join usuarios u on u.id = e.usuario_id
           where e.liga_id = v_j.liga_id and u.interno loop
    insert into alineaciones_tacticas as a (equipo_id, tactica, plan_b, gestion, cambios_avanzados, guardada_en)
    values (r.id, (array['posesion', 'contraataque', 'presion'])[1 + floor(random() * 3)::int], null, 'normal', '[]', now())
    on conflict (equipo_id) do update
      set tactica = excluded.tactica, plan_b = null, gestion = 'normal', cambios_avanzados = '[]', guardada_en = now();
  end loop;
  -- Cartas de más al cierre: el banco se queda con las de menos valor, con aviso
  for r in select e.id from equipos e where e.liga_id = v_j.liga_id and exceso_plantilla(e.id) > 0 loop
    declare
      v_vendidas text[] := '{}';
      v_total    int := 0;
      c          record;
    begin
      for c in select x.id from cartas x join disenos_carta d on d.id = x.diseno_id
               where x.equipo_id = r.id order by d.valor, x.id limit exceso_plantilla(r.id) loop
        v_vendidas := v_vendidas || nombre_carta(c.id);
        v_total := v_total + vender_carta_banco(r.id, c.id, 'cierre de jornada con cartas de más');
      end loop;
      perform notificar(r.id, 'hueco_automatico',
        format('Se cerró la jornada con cartas de más: el banco se ha quedado con %s por %s', array_to_string(v_vendidas, ', '), fmt(v_total)),
        jsonb_build_object('cartas', to_jsonb(v_vendidas), 'cobrado', v_total));
    end;
  end loop;
  return cerrar_jornada_base(p_jornada);
end $$;

-- Marcar como visto: además, cobra lo que tuviera pendiente de ese partido
create or replace function public.slr_marcar_visto(token text, partido_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario uuid := sesion_usuario(slr_marcar_visto.token);
  v_p       partidos;
  v_eq      uuid;
  v_cobro   int := 0;
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
  select e.id into v_eq from equipos e where e.id in (v_p.local_id, v_p.visitante_id) and e.usuario_id = v_usuario;
  if v_eq is not null then
    v_cobro := pagar_pendientes(v_eq, v_p.id);
  end if;
  return jsonb_build_object('visto', true, 'cobrado', v_cobro, 'sin_ver', partido_sin_ver(v_usuario, v_p.liga_id));
end $$;

revoke execute on function public.es_bonus_destripador(text), public.apartar_bonus(uuid), public.pagar_pendientes(uuid, uuid) from public, anon, authenticated;
