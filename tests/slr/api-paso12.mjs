// Prueba de la API real de SLR: progresión por jornadas y sobres nuevos (mercado, fases 1 y 2).
//   node tests/slr/api-paso12.mjs
// · Tramos: J1–3 comunes y raras, J4–5 también épicas, J6+ también legendarias.
// · Dosificación: cada épica/legendaria libre tiene su jornada de entrada (6 y 2 por jornada).
// · Las tandas de subastas solo sacan lo que ya puede salir.
// · Interruptor: «auto» la apaga en modo beta o en preparación; el Modo pruebas la fuerza.
// · Sobres: sencillo, básico, elección, de posición y de colección; precio por tramo,
//   progresión, perfil y colección; agotado; hueco; elección pendiente; historial solo
//   con épicas o legendarias; edición por liga sin tocar los de por defecto.
// Liga de prueba de Bot Uno con 3 bots; se borra al terminar.
import { env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO');
const U = { codigo: env.SLR_BOT_UNO_CODIGO }, D = { codigo: env.SLR_BOT_DOS_CODIGO };
const R = ['comun', 'rara', 'epica', 'legendaria'];
let L = null;
const dia = n => new Date(Date.UTC(2031, 0, 1 + n, 12)).toISOString();
let reloj = 0;

// Vende al banco las cartas más baratas de Bot Uno hasta dejar k huecos libres
async function hueco(k) {
  const mias = (await leer(`cartas?select=id,disenos_carta(valor)&equipo_id=eq.${U.equipo}`)).datos.sort((a, b) => a.disenos_carta.valor - b.disenos_carta.valor);
  for (const c of mias.slice(0, Math.max(0, mias.length - (15 - k)))) await rpcOk('slr_vender_banco', { token: U.token, carta_id: c.id });
}
const cartas = async () => (await leer(`cartas?select=id,equipo_id,libera_jornada,disenos_carta(rareza)&liga_id=eq.${L}&limit=5000`)).datos;
// Abre n tandas (días nuevos) y devuelve las rarezas y turnos de entrada de lo que ha salido
async function tandas(n) {
  const porId = new Map((await cartas()).map(c => [c.id, c]));
  const salidas = [];
  for (let i = 0; i < n; i++) {
    reloj += 2;   // dos días: la tanda anterior ya está resuelta
    await rpcOk('slr_prueba_tareas', { token: U.token, liga_id: L, ahora: dia(reloj), simular: false });
    const subs = (await leer(`subastas?select=carta_id,estado&liga_id=eq.${L}&estado=eq.abierta`)).datos;
    const ahora = new Map((await cartas()).map(c => [c.id, c]));
    for (const s of subs) salidas.push(ahora.get(s.carta_id) ?? porId.get(s.carta_id));
  }
  return salidas;
}

try {
  for (const b of [U, D]) b.token = (await rpcOk('slr_login', { codigo: b.codigo })).token;
  seccion('Liga de prueba');
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 12 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  for (let i = 0; i < 3; i++) await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L });
  const cfg = (await leer(`ligas?select=config&id=eq.${L}`)).datos[0].config;
  check(cfg.progresion?.activa === 'auto' && cfg.progresion.tramos.length === 3 &&
        cfg.progresion.cupos.epica.por_jornada === 6 && cfg.progresion.cupos.legendaria.por_jornada === 2,
    'ligas.config.progresion: auto, 3 tramos y dosificación 6 épicas / 2 legendarias por jornada');
  const libres0 = (await cartas()).filter(c => !c.equipo_id);
  const nLib = r => libres0.filter(c => c.disenos_carta.rareza === r).length;
  console.log(`  (bombo: ${R.map(r => `${nLib(r)} ${r}`).join(', ')})`);

  seccion('Interruptor');
  rechaza(await rpc('slr_admin_progresion', { token: D.token, liga_id: L, activa: 'true', jornada: 1 }), 'administrador', 'solo el admin la toca');
  rechaza(await rpc('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'quizas' }), 'auto, true o false', 'valor no válido: rechazado');
  let e = await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'auto' });
  check(e.activa === false && e.desbloqueadas.length === 4, '«auto» en una liga en modo beta y en preparación: apagada, sale todo');

  seccion('Jornadas 1–3: comunes y raras');
  e = await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'true', jornada: 2 });
  check(e.activa && JSON.stringify(e.desbloqueadas) === '["comun","rara"]' && e.siguiente?.rareza === 'epica' && e.siguiente?.jornada === 4,
    `J2: comunes y raras; las épicas llegan en la J${e.siguiente?.jornada}`);
  const turnos = (await cartas()).filter(c => !c.equipo_id && ['epica', 'legendaria'].includes(c.disenos_carta.rareza));
  const ep = turnos.filter(c => c.disenos_carta.rareza === 'epica').map(c => c.libera_jornada).sort((a, b) => a - b);
  const lg = turnos.filter(c => c.disenos_carta.rareza === 'legendaria').map(c => c.libera_jornada).sort((a, b) => a - b);
  const esperado = (n, desde, por) => Array.from({ length: n }, (_, k) => desde + Math.floor(k / por));
  check(JSON.stringify(ep) === JSON.stringify(esperado(ep.length, 4, 6)) && JSON.stringify(lg) === JSON.stringify(esperado(lg.length, 6, 2)),
    `turnos de entrada: épicas ${ep.join(',') || '—'} · legendarias ${lg.join(',') || '—'}`);
  let s = await tandas(6);
  check(s.length > 0 && s.every(c => ['comun', 'rara'].includes(c.disenos_carta.rareza)),
    `6 tandas en la J2: ${s.length} cartas, todas comunes o raras`);

  seccion('Jornadas 4–5: también épicas');
  e = await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'true', jornada: 4 });
  check(JSON.stringify(e.desbloqueadas) === '["comun","rara","epica"]' && e.siguiente?.rareza === 'legendaria' && e.siguiente?.jornada === 6,
    'J4: entran las épicas; las legendarias llegan en la J6');
  check((e.entran?.epica ?? 0) === Math.min(6, ep.length), `«esta jornada entran» ${e.entran?.epica ?? 0} épicas`);
  s = await tandas(8);
  check(s.every(c => c.disenos_carta.rareza !== 'legendaria' && (c.libera_jornada == null || c.libera_jornada <= 4)),
    `8 tandas en la J4: ${s.filter(c => c.disenos_carta.rareza === 'epica').length} épicas y ninguna legendaria ni carta de turno posterior`);

  seccion('Jornada 6 en adelante: también legendarias, dosificadas');
  e = await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'true', jornada: 6 });
  check(e.desbloqueadas.length === 4 && !e.siguiente, 'J6: todo desbloqueado');
  check((e.entran?.legendaria ?? 0) === Math.min(2, lg.length) && (e.por_entrar?.legendaria ?? 0) === Math.max(0, lg.length - 2),
    `entran ${e.entran?.legendaria ?? 0} legendarias y quedan ${e.por_entrar?.legendaria ?? 0} por entrar`);
  s = await tandas(10);
  check(s.every(c => c.libera_jornada == null || c.libera_jornada <= 6), `10 tandas en la J6: ninguna carta con turno posterior a la J6`);

  seccion('Sobres: tienda');
  U.equipo = (await leer(`equipos?select=id&liga_id=eq.${L}&nombre=eq.Bot%20Uno%20FC`)).datos[0].id;
  await rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: U.equipo, importe: 60000 });
  await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'true', jornada: 2 });
  let t = await rpcOk('slr_tienda', { token: U.token, liga_id: L });
  const tipo = k => t.tipos.find(x => x.tipo === k);
  check(t.tipos.map(x => x.tipo).join() === 'sencillo,basico,eleccion,posicion,coleccion', `5 sobres: ${t.tipos.map(x => x.nombre).join(', ')}`);
  check(tipo('sencillo').precio === 500 && tipo('basico').precio === 1500 && tipo('eleccion').precio === 950,
    'J2: precios del primer tramo (sencillo 500, básico 1.500, elección 950)');
  check(Object.keys(tipo('basico').probabilidades).sort().join() === 'comun,rara' &&
        Math.abs(Object.values(tipo('basico').probabilidades).reduce((a, b) => a + b, 0) - 1) < 0.001,
    `probabilidades renormalizadas entre lo que puede salir: ${JSON.stringify(tipo('basico').probabilidades)}`);
  check(t.coleccion_semana?.id && t.coleccion_semana.total > 0, `colección de la semana: ${t.coleccion_semana?.nombre} (${t.coleccion_semana?.tengo}/${t.coleccion_semana?.total})`);
  check(tipo('posicion').por_perfil && Object.keys(tipo('posicion').por_perfil).length === 4, `de posición, cuántas quedan por perfil: ${JSON.stringify(tipo('posicion').por_perfil)}`);
  check(t.pendiente === null && 'dorso_url' in t && t.cerrado === false, 'sin elección pendiente, con dorso y mercado abierto');

  seccion('Sobres: comprar con progresión');
  const historial0 = (await leer(`historial?select=id&liga_id=eq.${L}&tipo=eq.sobre`)).datos.length;
  await hueco(3);
  const b1 = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'basico' });
  check(b1.cartas.length === 3 && b1.precio === 1500 && b1.cartas.every(c => ['comun', 'rara'].includes(c.rareza)) && b1.mejor_rareza,
    `básico en J2: ${b1.cartas.map(c => `${c.nombre} (${c.rareza})`).join(', ')}; mejor ${b1.mejor_rareza}`);
  check(b1.cartas.every(c => typeof c.nueva === 'boolean') && b1.cartas.some(c => c.nueva), 'cada carta dice si es nueva en tu álbum');
  check((await leer(`historial?select=id&liga_id=eq.${L}&tipo=eq.sobre`)).datos.length === historial0, 'sin épica ni legendaria: no va al historial público');
  rechaza(await rpc('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'posicion' }), 'Elige el perfil', 'de posición sin perfil: rechazado');
  await hueco(1);
  const pos = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'posicion', perfil: 'defensa' });
  check(pos.cartas.length === 1 && ['defensa', 'equilibrado'].includes(pos.cartas[0].perfil) && pos.precio === 550,
    `de posición (defensa): ${pos.cartas[0].nombre}, perfil ${pos.cartas[0].perfil}, 550`);
  await hueco(1);
  const col = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'coleccion' });
  check(col.cartas[0].coleccion?.id === t.coleccion_semana.id && col.cartas[0].coleccion.tengo >= 1,
    `de colección: ${col.cartas[0].nombre} de ${col.cartas[0].coleccion?.nombre} (${col.cartas[0].coleccion?.tengo}/${col.cartas[0].coleccion?.total})`);
  rechaza(await rpc('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'premium' }), 'no válido', 'el premium ya no existe');

  seccion('Sobres: elección pendiente');
  await hueco(1);
  const el = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'eleccion' });
  check(el.pendiente_eleccion && el.cartas.length === 3 && el.cartas.some(c => c.rareza !== 'comun') && el.caduca_en,
    `elección: 3 candidatas (${el.cartas.map(c => c.rareza).join(', ')}), al menos una rara o mejor`);
  const pend = await rpcOk('slr_sobre_pendiente', { token: U.token, liga_id: L });
  check(pend?.sobre_id === el.sobre_id && pend.candidatas.length === 3, 'la elección pendiente se recupera (al recargar)');
  t = await rpcOk('slr_tienda', { token: U.token, liga_id: L });
  check(t.pendiente?.sobre_id === el.sobre_id, 'y sale en la tienda');
  const elegida = await rpcOk('slr_elegir_carta_sobre', { token: U.token, sobre_id: el.sobre_id, carta_id: el.cartas[2].id });
  check(elegida.carta.id === el.cartas[2].id && !(await rpcOk('slr_sobre_pendiente', { token: U.token, liga_id: L })), 'elegida la tercera: ya no hay pendiente');

  seccion('Sobres: J6, admin, historial y agotado');
  await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'true', jornada: 6 });
  t = await rpcOk('slr_tienda', { token: U.token, liga_id: L });
  check(tipo('basico').precio === 2000 && tipo('eleccion').precio === 2100, 'J6: precios del último tramo (básico 2.000, elección 2.100)');
  rechaza(await rpc('slr_admin_guardar_sobre', { token: D.token, liga_id: L, tipo: 'sencillo', datos: { precios: [1, 1, 1] } }), 'administrador', 'editar sobres: solo el admin');
  rechaza(await rpc('slr_admin_guardar_sobre', { token: U.token, liga_id: L, tipo: 'sencillo', datos: { pesos: { mitica: 5 } } }), 'Pesos no válidos', 'pesos no válidos: rechazados');
  rechaza(await rpc('slr_admin_guardar_sobre', { token: U.token, liga_id: L, tipo: 'sencillo', datos: { precios: [100, 200] } }), 'tres números', 'precios: hacen falta tres');
  const ed = await rpcOk('slr_admin_guardar_sobre', { token: U.token, liga_id: L, tipo: 'sencillo',
    datos: { nombre: 'Sencillo dorado', precios: [300, 300, 300], pesos: { legendaria: 100 } } });
  check(ed.liga_id === L && ed.nombre === 'Sencillo dorado', 'el admin edita el sencillo para su liga');
  const def = (await leer('tipos_sobre?select=nombre,precios&liga_id=is.null&tipo=eq.sencillo')).datos[0];
  check(def.nombre === 'Sencillo' && def.precios.join() === '500,600,650', 'el sencillo por defecto no cambia');
  t = await rpcOk('slr_tienda', { token: U.token, liga_id: L });
  if (tipo('sencillo').quedan > 0) {
    await hueco(1);
    const leg = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'sencillo' });
    check(leg.cartas[0].rareza === 'legendaria' && leg.precio === 300, `sencillo «solo legendarias»: ${leg.cartas[0].nombre}`);
    const h = (await leer(`historial?select=texto&liga_id=eq.${L}&tipo=eq.sobre&order=id.desc&limit=1`)).datos[0];
    check(/legendaria/.test(h?.texto ?? ''), `con legendaria va al historial público: «${h?.texto}»`);
  }
  // Agota el sencillo «solo legendarias»: en la J6 solo pueden salir las de turno 6
  for (let i = 0; i < 6; i++) { await hueco(1); const x = await rpc('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'sencillo' }); if (!x.ok) break; }
  t = await rpcOk('slr_tienda', { token: U.token, liga_id: L });
  check(tipo('sencillo').agotado && tipo('sencillo').quedan === 0, 'sin legendarias que puedan salir: el sencillo sale AGOTADO');
  rechaza(await rpc('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'sencillo' }), 'agotado', 'y no se puede comprar');
  const otra = (await leer(`colecciones?select=id,nombre&liga_prueba_id=is.null&id=neq.${t.coleccion_semana.id}&limit=1`)).datos[0];
  if (otra) {
    rechaza(await rpc('slr_admin_coleccion_semana', { token: D.token, liga_id: L, coleccion_id: otra.id }), 'administrador', 'cambiar la colección de la semana: solo el admin');
    await rpcOk('slr_admin_coleccion_semana', { token: U.token, liga_id: L, coleccion_id: otra.id });
    t = await rpcOk('slr_tienda', { token: U.token, liga_id: L });
    check(t.coleccion_semana?.id === otra.id, `el admin cambia la colección de la semana a ${otra.nombre}`);
  }
  await rpcOk('slr_admin_dorso', { token: U.token, liga_id: L, url: 'https://res.cloudinary.com/x/dorso.png' });
  t = await rpcOk('slr_tienda', { token: U.token, liga_id: L });
  check(t.dorso_url === 'https://res.cloudinary.com/x/dorso.png', 'el dorso de la liga se cambia desde el admin');

  seccion('Sobres: hueco');
  await hueco(2);
  t = await rpcOk('slr_tienda', { token: U.token, liga_id: L });
  const tengo = (await leer(`cartas?select=id&equipo_id=eq.${U.equipo}`)).datos.length;
  check(t.plantilla.ocupada === tengo && t.plantilla.maxima === 15, `plantilla ${t.plantilla.ocupada}/${t.plantilla.maxima}`);
  if (tengo > 12) rechaza(await rpc('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'basico' }), 'No tienes hueco', 'sin 3 huecos, el básico no se compra');

  seccion('Apagada: sale todo');
  await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'false' });
  e = await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'false' });
  check(e.activa === false && e.desbloqueadas.length === 4, 'con false, todas las rarezas');
} catch (err) {
  resultado.fallos++;
  console.log(`\n  ✖ Error inesperado: ${err.message}`);
} finally {
  if (L) {
    const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
    check(b.ok, 'liga de prueba borrada', b.mensaje);
  }
  for (const b of [U, D]) if (b.token) await rpc('slr_logout', { token: b.token });
  console.log(`\n${resultado.total - resultado.fallos}/${resultado.total} comprobaciones correctas` +
    `${resultado.fallos ? ` · ${resultado.fallos} FALLOS` : ''}`);
  process.exitCode = resultado.fallos ? 1 : 0;
}
