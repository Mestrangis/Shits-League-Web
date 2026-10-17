-- slr_mis_tacticas llama a sesion_usuario, que renueva la sesión (escribe): no puede ser stable
alter function public.slr_mis_tacticas(text, uuid) volatile;
