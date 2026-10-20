// Prueba de la API real de SLR: cobros pendientes (el dinero no destripa el resultado).
//   node tests/slr/api-paso20.mjs
// El bonus de sorpresa y el de ojo clínico de las personas no se pagan al publicar:
// se pagan al ver el partido (slr_marcar_visto devuelve lo cobrado) o, como tarde, al
// cerrar la jornada siguiente. Mientras, no salen en el saldo ni en los movimientos, y
// tampoco en jornadas.cobros (que se lee en público). Los bots cobran al momento.
// Liga de prueba con Bot Uno (ve sus partidos), Bot Dos (no los ve) y 4 bots; se borra al terminar.
import { env, exigirEnv, rpc, rpcOk, leer, check, seccion, resultado } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO');
const U = { codigo: env.SLR_BOT_UNO_CODIGO }, D = { codigo: env.SLR_BOT_DOS_CODIGO };
let L = null;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const BONUS = ['bonus_sorpresa', 'bonus_ojo_clinico'];
const jugar = async () => { let r; do { r = await rpcOk('slr_admin_jugar_jornada', { token: U.token, liga_id: L }); if (r.estado === 'simulando') await dormir(1500); } while (r.estado === 'simulando'); };
const movs = async x => rpcOk('slr_movimientos', { token: x.token, equipo_id: x.eq });
const saldo = async x => (await leer(`equipos?select=saldo&id=eq.${x.eq}`)).datos[0].saldo;
const bonusDe = (lista, partido) => lista.filter(m => BONUS.includes(m.tipo) && (m.referencia ?? '').includes(partido));

try {
  U.token = (await rpcOk('slr_login', { codigo: U.codigo })).token;
  D.token = (await rpcOk('slr_login', { codigo: D.codigo })).token;
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 20 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  U.eq = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  D.eq = (await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' })).equipo.id;
  for (let i = 0; i < 4; i++) await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L });
  await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });
  const humanos = new Set([U.eq, D.eq]);

  let cobradoU = 0, pagadosAlCerrar = 0, bonusBots = 0, retenidos = 0;
  let anteriorD = null;   // partido de Bot Dos de la jornada anterior (sin ver)
  for (let k = 1; k <= 5; k++) {
    seccion(`Jornada ${k}`);
    const sU0 = await saldo(U);
    await jugar();
    const j = (await leer(`jornadas?select=id,numero,cobros&liga_id=eq.${L}&estado=eq.publicada&order=numero.desc&limit=1`)).datos[0];
    const partidos = (await leer(`partidos?select=id,local_id,visitante_id,goles_local,goles_visitante&jornada_id=eq.${j.id}`)).datos;
    const de = eq => partidos.find(p => [p.local_id, p.visitante_id].includes(eq));
    // En público (jornadas.cobros): ningún bonus de personas; los de los bots, sí
    const enPublico = (j.cobros ?? []).filter(c => BONUS.includes(c.tipo));
    check(!enPublico.some(c => humanos.has(c.equipo_id)), `jornadas.cobros sin bonus de personas (${enPublico.length} de bots)`);
    bonusBots += enPublico.length;
    // Bot Uno: nada de bonus en sus movimientos hasta verlo
    const pU = de(U.eq);
    if (pU) {
      check(!bonusDe(await movs(U), pU.id).length, 'Bot Uno: sin bonus en sus movimientos antes de ver el partido');
      const antes = await saldo(U);
      const v = await rpcOk('slr_marcar_visto', { token: U.token, partido_id: pU.id });
      const despues = await saldo(U);
      check(despues - antes === v.cobrado, `al verlo cobra lo pendiente: ${v.cobrado} (saldo ${antes} → ${despues})`);
      const filas = bonusDe(await movs(U), pU.id);
      check(filas.reduce((s, m) => s + m.importe, 0) === v.cobrado, `y salen sus movimientos (${filas.map(m => m.tipo).join(', ') || 'ninguno'})`);
      const v2 = await rpcOk('slr_marcar_visto', { token: U.token, partido_id: pU.id });
      check(v2.cobrado === 0, 'verlo otra vez no cobra dos veces');
      cobradoU += v.cobrado;
      if (v.cobrado) retenidos++;
    } else console.log(`  (Bot Uno descansa; saldo ${sU0} → ${await saldo(U)})`);
    // Bot Dos (no ve nada): lo de su partido anterior se paga al cerrar esta jornada; lo de esta, todavía no
    const mD = await movs(D);
    const pD = de(D.eq);
    if (pD) check(!bonusDe(mD, pD.id).length, 'Bot Dos: el bonus de este partido, todavía no');
    if (anteriorD) {
      const pagados = bonusDe(mD, anteriorD.id);
      pagadosAlCerrar += pagados.length;
      if (pagados.length) console.log(`  · Bot Dos cobra al cerrar esta jornada lo de la anterior: ${pagados.map(m => `${m.tipo} ${m.importe}`).join(', ')}`);
    }
    anteriorD = pD ?? null;
  }
  seccion('Resumen');
  check(retenidos > 0 && cobradoU > 0, `Bot Uno cobró ${cobradoU} en ${retenidos} partidos al verlos`);
  check(pagadosAlCerrar > 0, `Bot Dos cobró al cerrar la jornada siguiente (${pagadosAlCerrar} cobros)`);
  check(bonusBots > 0, `los bots cobran al momento (${bonusBots} bonus en público)`);
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
