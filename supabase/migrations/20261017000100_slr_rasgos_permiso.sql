-- slr_generar_cartas (pública, para el test del gemelo SQL/JS) llama a generar_rasgos,
-- que no es security definer: necesita poder ejecutarla igual que generar_stats
grant execute on function public.generar_rasgos(text, bigint) to anon, authenticated;
