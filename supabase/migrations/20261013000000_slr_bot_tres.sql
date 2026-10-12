-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — Bot Tres (paso 3)
-- GENERADO por supabase/seed/generar-usuarios.mjs: no editar a mano.
-- Tercer usuario de prueba. Solo el hash: el código en claro está en .env.local.
-- ═══════════════════════════════════════════════════════════════════════════

with nuevo as (
  insert into public.usuarios (nombre, avatar_url, es_bot)
  values ('Bot Tres', null, true)
  on conflict (nombre) do update set es_bot = true
  returning id
)
insert into public.codigos (usuario_id, codigo_hash)
select id, '6e532b51103f7a2cf16f5f906db1f8e35a45af298938c0210d34fd1c9728d525' from nuevo
on conflict (usuario_id) do update set codigo_hash = excluded.codigo_hash;
