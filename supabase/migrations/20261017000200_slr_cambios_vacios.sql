-- El motor v2 trata cambios_avanzados como «hay cambios programados» en cuanto
-- existe (aunque sea una lista vacía) y entonces no aplica la gestión. Al motor le
-- llega null cuando no hay ninguno; la web sigue viendo [] en slr_mis_tacticas.
create or replace function public.tacticas_motor(p_equipo uuid, p_privadas boolean) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when p_privadas
              then g || jsonb_build_object('cambios_avanzados',
                          case when jsonb_array_length(coalesce(g -> 'cambios_avanzados', '[]')) = 0 then null
                               else g -> 'cambios_avanzados' end)
              else jsonb_build_object('tactica', ultima_tactica_publicada(p_equipo), 'plan_b', null,
                                      'gestion', 'normal', 'cambios_avanzados', null) end
  from (select tacticas_guardadas(p_equipo) as g) t
$$;
