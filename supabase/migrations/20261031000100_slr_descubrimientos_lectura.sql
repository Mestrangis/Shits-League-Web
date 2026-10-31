-- La tabla de descubrimientos se lee como las demás públicas (la política de lectura ya estaba;
-- faltaba el permiso)
grant select on public.descubrimientos to anon, authenticated;
