// Prueba de la API real de SLR: colección de la semana y progresión.
//   node tests/slr/api-paso16.mjs
// Una colección solo sale como colección de la semana si la rareza más alta de
// TODAS sus cartas (libres o no) está desbloqueada: con la progresión activa, con
// legendarias no antes de la J6 y con épicas no antes de la J4. Sin progresión,
// cualquiera. El admin puede ponerla a mano igual, pero con aviso.
// Liga de prueba de Bot Uno; se borra al terminar.
import { env, exigirEnv, rpc, rpcOk, leer, check, seccion, resultado } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO');
const U = { codigo: env.SLR_BOT_UNO_CODIGO };
let L = null;
const RANGO = { comun: 1, rara: 2, epica: 3, legendaria: 4 };

try {
  U.token = (await rpcOk('slr_login', { codigo: U.codigo })).token;
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 16 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });

  // Rareza más alta de cada colección (todas sus cartas activas del catálogo)
  const disenos = (await leer('disenos_carta?select=rareza,coleccion_id&activo=eq.true&liga_prueba_id=is.null&coleccion_id=not.is.null&limit=5000')).datos;
  const maxima = new Map();
  for (const d of disenos) if (RANGO[d.rareza] > (RANGO[maxima.get(d.coleccion_id)] ?? 0)) maxima.set(d.coleccion_id, d.rareza);
  const nombres = Object.fromEntries((await leer('colecciones?select=id,nombre&liga_prueba_id=is.null')).datos.map(k => [k.id, k.nombre]));
  const cuantas = r => [...maxima.values()].filter(x => x === r).length;
  console.log(`  Colecciones por rareza más alta: ${Object.keys(RANGO).map(r => `${r} ${cuantas(r)}`).join(', ')}`);

  async function sorteos(n) {
    const salen = new Map();
    for (let i = 0; i < n; i++) {
      const r = await rpcOk('slr_admin_coleccion_semana', { token: U.token, liga_id: L, coleccion_id: null });
      if (r.sorteada !== true) throw new Error('el sorteo no marca sorteada');
      if (r.coleccion_id) salen.set(r.coleccion_id, (salen.get(r.coleccion_id) ?? 0) + 1);
    }
    return salen;
  }
  const peor = salen => [...salen.keys()].reduce((m, id) => Math.max(m, RANGO[maxima.get(id)] ?? 0), 0);
  const rareza = n => Object.keys(RANGO).find(r => RANGO[r] === n) ?? 'ninguna';
  const N = 30;

  for (const [jornada, tope] of [[2, 'rara'], [4, 'epica'], [6, 'legendaria']]) {
    seccion(`Progresión activa, jornada ${jornada}`);
    await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'true', jornada });
    const salen = await sorteos(N);
    check(salen.size > 0 && peor(salen) <= RANGO[tope],
      `${N} sorteos: salen ${salen.size} colecciones distintas; la más alta tiene ${rareza(peor(salen))} (tope ${tope})`);
    const t = await rpcOk('slr_tienda', { token: U.token, liga_id: L });
    const col = t.coleccion_semana?.id ?? t.coleccion?.id ?? null;
    if (col) check(RANGO[maxima.get(col)] <= RANGO[tope], `la tienda enseña «${nombres[col]}» (${maxima.get(col)})`);
  }

  seccion('Progresión apagada: cualquiera');
  await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'false' });
  const libre = await sorteos(N);
  check(libre.size > 0, `${N} sorteos: salen ${libre.size} colecciones distintas; la más alta tiene ${rareza(peor(libre))}`);
  if (cuantas('legendaria') >= 3) check(peor(libre) === 4, 'salen colecciones con legendarias');

  seccion('A mano: se aplica aunque no cumpla, con aviso');
  await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'true', jornada: 2 });
  const conLeg = [...maxima].find(([, r]) => r === 'legendaria')?.[0];
  const conEpi = [...maxima].find(([, r]) => r === 'epica')?.[0];
  const baja = [...maxima].find(([, r]) => RANGO[r] <= 2)?.[0];
  if (conLeg) {
    const r = await rpcOk('slr_admin_coleccion_semana', { token: U.token, liga_id: L, coleccion_id: conLeg });
    check(r.coleccion_id === conLeg && /legendarias/.test(r.aviso ?? '') && /jornada 6/.test(r.aviso), `«${nombres[conLeg]}» en la J2: ${r.aviso}`);
    const fila = (await leer(`colecciones_semana?select=coleccion_id,manual&liga_id=eq.${L}&semana=eq.${r.semana}`)).datos[0];
    check(fila?.coleccion_id === conLeg && fila.manual, 'queda elegida (manual)');
  }
  if (conEpi) {
    const r = await rpcOk('slr_admin_coleccion_semana', { token: U.token, liga_id: L, coleccion_id: conEpi });
    check(/épicas/.test(r.aviso ?? '') && /jornada 4/.test(r.aviso), `«${nombres[conEpi]}» en la J2: ${r.aviso}`);
    await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'true', jornada: 4 });
    const r4 = await rpcOk('slr_admin_coleccion_semana', { token: U.token, liga_id: L, coleccion_id: conEpi });
    check(r4.aviso == null, `en la J4, sin aviso`);
  }
  if (baja) {
    await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'true', jornada: 1 });
    const r = await rpcOk('slr_admin_coleccion_semana', { token: U.token, liga_id: L, coleccion_id: baja });
    check(r.aviso == null, `«${nombres[baja]}» (${maxima.get(baja)}) en la J1: sin aviso`);
  }
  if (conLeg) {
    await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'false' });
    const r = await rpcOk('slr_admin_coleccion_semana', { token: U.token, liga_id: L, coleccion_id: conLeg });
    check(r.aviso == null, 'sin progresión, con legendarias: sin aviso');
  }
} catch (e) {
  resultado.fallos++;
  console.log(`\n  ✖ Error inesperado: ${e.message}`);
} finally {
  if (L) {
    const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
    check(b.ok, 'liga de prueba borrada', b.mensaje);
  }
  if (U.token) await rpc('slr_logout', { token: U.token });
  console.log(`\n${resultado.total - resultado.fallos}/${resultado.total} comprobaciones correctas` +
    `${resultado.fallos ? ` · ${resultado.fallos} FALLOS` : ''}`);
  process.exitCode = resultado.fallos ? 1 : 0;
}
