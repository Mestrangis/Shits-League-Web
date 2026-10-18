// Prueba de la API real de SLR: progresión por jornadas (mercado, fase 1).
//   node tests/slr/api-paso12.mjs
// · Tramos: J1–3 comunes y raras, J4–5 también épicas, J6+ también legendarias.
// · Dosificación: cada épica/legendaria libre tiene su jornada de entrada (6 y 2 por jornada).
// · Las tandas de subastas solo sacan lo que ya puede salir.
// · Interruptor: «auto» la apaga en modo beta o en preparación; el Modo pruebas la fuerza.
// Liga de prueba de Bot Uno con 3 bots; se borra al terminar.
import { env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO');
const U = { codigo: env.SLR_BOT_UNO_CODIGO }, D = { codigo: env.SLR_BOT_DOS_CODIGO };
const R = ['comun', 'rara', 'epica', 'legendaria'];
let L = null;
const dia = n => new Date(Date.UTC(2031, 0, 1 + n, 12)).toISOString();
let reloj = 0;

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
