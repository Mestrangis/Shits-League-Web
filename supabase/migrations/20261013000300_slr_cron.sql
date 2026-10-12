-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — tareas programadas del mercado (paso 3)
-- Un único job cada 5 minutos. slr_tareas_mercado es idempotente: si se
-- ejecuta dos veces no resuelve dos veces ni abre dos tandas.
-- No procesa las ligas de prueba (es_prueba): esas solo con slr_prueba_tareas.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- cron.schedule con el mismo nombre actualiza el job si ya existe
select cron.schedule(
  'slr-tareas-mercado',
  '*/5 * * * *',
  $$select public.slr_tareas_mercado(now())$$
);
