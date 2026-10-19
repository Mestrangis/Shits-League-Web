// Prueba de la API real de SLR: partidos vistos (reproducción animada sin destripar).
//   node tests/slr/api-paso19.mjs
// · slr_partido dice si el partido es tuyo y si ya lo has visto.
// · slr_sin_ver: tu último partido de liga publicado que no has visto (o nada).
// · Hasta verlo, para ti la clasificación sigue como estaba antes de esa jornada;
//   para los demás, no (cada uno con lo suyo).
// · slr_marcar_visto es idempotente y vale en todos los dispositivos (está en el servidor).
// Liga de prueba de Bot Uno con Bot Dos y 2 bots; se borra al terminar.
import { env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO');
const U = { codigo: env.SLR_BOT_UNO_CODIGO }, D = { codigo: env.SLR_BOT_DOS_CODIGO };
let L = null;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const pjDe = (clas, eq) => clas.clasificacion.find(f => f.equipo_id === eq)?.pj;
const jugar = async () => { let r; do { r = await rpcOk('slr_admin_jugar_jornada', { token: U.token, liga_id: L }); if (r.estado === 'simulando') await dormir(1500); } while (r.estado === 'simulando'); };

try {
  U.token = (await rpcOk('slr_login', { codigo: U.codigo })).token;
  D.token = (await rpcOk('slr_login', { codigo: D.codigo })).token;
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 19 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  U.eq = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  D.eq = (await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' })).equipo.id;
  for (let i = 0; i < 2; i++) await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L });
  await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });

  seccion('Antes de jugar');
  check((await rpcOk('slr_sin_ver', { token: U.token, liga_id: L })).sin_ver === null, 'nada sin ver');

  seccion('Jornada 1 publicada');
  await jugar();
  const mio = (await leer(`partidos?select=id,jornada_id,local_id,visitante_id&liga_id=eq.${L}&tipo=eq.liga&or=(local_id.eq.${U.eq},visitante_id.eq.${U.eq})`)).datos[0];
  const delDos = (await leer(`partidos?select=id&liga_id=eq.${L}&tipo=eq.liga&or=(local_id.eq.${D.eq},visitante_id.eq.${D.eq})`)).datos[0];
  const sv = (await rpcOk('slr_sin_ver', { token: U.token, liga_id: L })).sin_ver;
  check(sv?.partido_id === mio.id && sv.numero === 1, `Bot Uno: su partido de la J1 sin ver (${sv?.partido_id?.slice(0, 8)})`);
  const p = await rpcOk('slr_partido', { token: U.token, partido_id: mio.id });
  check(p.mio === true && p.visto === false, 'slr_partido: es suyo y no lo ha visto');
  const ajeno = await rpcOk('slr_partido', { token: U.token, partido_id: delDos.id === mio.id ? mio.id : delDos.id });
  if (delDos.id !== mio.id) check(ajeno.mio === false, 'el partido de otro: no es suyo');
  // Clasificación: Bot Uno no ve la J1; Bot Dos tampoco la suya
  const cU = await rpcOk('slr_clasificacion', { token: U.token, liga_id: L });
  check(cU.clasificacion.every(f => f.pj === 0) && cU.sin_ver?.numero === 1, `para Bot Uno, la clasificación sigue como antes de la J1 (PJ: ${cU.clasificacion.map(f => f.pj).join(',')})`);

  seccion('Bot Dos lo ve; Bot Uno todavía no');
  rechaza(await rpc('slr_marcar_visto', { token: D.token, partido_id: '00000000-0000-0000-0000-000000000000' }), 'no existe', 'marcar un partido que no existe: rechazado');
  const v = await rpcOk('slr_marcar_visto', { token: D.token, partido_id: delDos.id });
  check(v.visto && v.sin_ver === null, 'Bot Dos marca su partido como visto: ya no tiene nada sin ver');
  const cD = await rpcOk('slr_clasificacion', { token: D.token, liga_id: L });
  check(pjDe(cD, D.eq) === 1 && !cD.sin_ver && cD.clasificacion.reduce((s, f) => s + f.pj, 0) >= 2, `para Bot Dos, la J1 ya cuenta (PJ: ${cD.clasificacion.map(f => f.pj).join(',')})`);
  check((await rpcOk('slr_clasificacion', { token: U.token, liga_id: L })).clasificacion.every(f => f.pj === 0), 'para Bot Uno, sigue oculta (cada uno con lo suyo)');
  // Mismo orden y mismos puntos que la clasificación normal una vez visto
  const vista = (await leer(`clasificacion?select=equipo_id,pj,puntos&liga_id=eq.${L}`)).datos;
  check(cD.clasificacion.every(f => vista.find(x => x.equipo_id === f.equipo_id)?.puntos === f.puntos), 'vista la jornada: los mismos puntos que la clasificación de siempre');

  seccion('Bot Uno lo ve (dos veces: idempotente)');
  await rpcOk('slr_marcar_visto', { token: U.token, partido_id: mio.id });
  const v2 = await rpcOk('slr_marcar_visto', { token: U.token, partido_id: mio.id });
  check(v2.sin_ver === null, 'visto: nada pendiente');
  check((await rpcOk('slr_partido', { token: U.token, partido_id: mio.id })).visto === true, 'slr_partido: visto');
  check(pjDe(await rpcOk('slr_clasificacion', { token: U.token, liga_id: L }), U.eq) === 1, 'y su clasificación ya cuenta la J1');

  seccion('Jornada 2: solo cuenta el último partido');
  await jugar();
  const sv2 = (await rpcOk('slr_sin_ver', { token: U.token, liga_id: L })).sin_ver;
  check(sv2?.numero === 2, 'sin ver: el de la J2');
  const c2 = await rpcOk('slr_clasificacion', { token: U.token, liga_id: L });
  check(pjDe(c2, U.eq) === 1, `la clasificación de Bot Uno se queda en la J1 (PJ ${pjDe(c2, U.eq)})`);

  seccion('Fuera de la liga');
  const otra = await rpcOk('slr_crear_liga_prueba', { token: D.token, nombre: `Otra paso 19 · ${Date.now()}` });
  rechaza(await rpc('slr_sin_ver', { token: U.token, liga_id: otra.id }), '', 'slr_sin_ver de una liga ajena: rechazado');
  await rpc('slr_borrar_liga', { token: D.token, liga_id: otra.id });
} catch (e) {
  resultado.fallos++;
  console.log(`\n  ✖ Error inesperado: ${e.message}`);
} finally {
  if (L) {
    const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
    check(b.ok, 'liga de prueba borrada', b.mensaje);
  }
  for (const x of [U, D]) if (x.token) await rpc('slr_logout', { token: x.token });
  console.log(`\n${resultado.total - resultado.fallos}/${resultado.total} comprobaciones correctas` +
    `${resultado.fallos ? ` · ${resultado.fallos} FALLOS` : ''}`);
  process.exitCode = resultado.fallos ? 1 : 0;
}
