-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — nombre de carta repetido: mensaje claro
-- El índice único disenos_carta_nombre_key (20261016000000) ya lo impide, pero
-- su error no se entiende; el trigger lo comprueba antes y lo dice en castellano.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.disenos_carta_antes() returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  g jsonb;
begin
  new.nombre := trim(new.nombre);
  if coalesce(new.nombre, '') = '' then
    raise exception 'La carta necesita un nombre' using errcode = 'P0001';
  end if;
  new.personas := coalesce(new.personas, '{}');
  -- Una colección creada en una liga de prueba solo vale para las cartas de esa liga
  if new.coleccion_id is not null and exists (select 1 from colecciones k where k.id = new.coleccion_id
      and k.liga_prueba_id is not null and k.liga_prueba_id is distinct from new.liga_prueba_id) then
    raise exception 'Esa colección es de una liga de prueba: no se puede usar en esta carta' using errcode = 'P0001';
  end if;
  -- Nombre único dentro de su colección (y entre las que no tienen), con un mensaje claro
  if exists (select 1 from disenos_carta o
             where lower(o.nombre) = lower(new.nombre) and o.id <> new.id
               and o.coleccion_id is not distinct from new.coleccion_id
               and o.liga_prueba_id is not distinct from new.liga_prueba_id) then
    raise exception 'Ya hay una carta «%» %', new.nombre,
      coalesce('en la colección ' || (select k.nombre from colecciones k where k.id = new.coleccion_id), 'sin colección')
      using errcode = 'P0001';
  end if;
  if new.ata is null or new.def is null or new.con is null then
    if new.tier is null or new.perfil is null then
      raise exception 'Pon las tres stats (ata, def, con) o el tier y el perfil para que se generen' using errcode = 'P0001';
    end if;
    new.semilla_stats := coalesce(new.semilla_stats, 1 + floor(random() * 2147483646)::bigint);
    g := generar_stats(new.tier, new.perfil, new.tipo, new.semilla_stats);
    new.ata := coalesce(new.ata, (g ->> 'ATA')::int);
    new.def := coalesce(new.def, (g ->> 'DEF')::int);
    new.con := coalesce(new.con, (g ->> 'CON')::int);
  end if;
  new.tier := coalesce(new.tier, tier_de_stats(new.ata, new.def, new.con));
  new.perfil := coalesce(new.perfil, perfil_de_stats(new.ata, new.def, new.con));
  if new.poderes is null or new.poderes = 'null'::jsonb then
    new.semilla_poderes := coalesce(new.semilla_poderes, 1 + floor(random() * 2147483646)::bigint);
    new.poderes := generar_poderes(new.tier, new.perfil, new.semilla_poderes);
  end if;
  perform validar_poderes(new.poderes);
  new.valor := valor_diseno(new.ata, new.def, new.con, new.poderes);
  return new;
end $$;
