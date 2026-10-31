// Prueba de la API real: quién descubre cada carta (el primero de la liga en tenerla).
//   node tests/slr/api-descubrimientos.mjs
// Con una liga de prueba (Bot Uno y Bot Dos) que se borra al terminar:
// · reparto inicial: las de cada uno, descubiertas por él;
// · sobre básico: todas las cartas, descubiertas y en el álbum de quien lo abre, también las que
//   luego suelta con «Haz hueco»; en la respuesta, descubrimiento: true;
// · sobre de elección: las candidatas ni se descubren ni entran en el álbum; solo la elegida, y
//   aunque luego la suelte con «Haz hueco»;
// · comprada después por otro: sigue siendo de quien la descubrió;
// · el detalle (slr_carta): «descubrimiento» y, en el historial, «X la descubrió» el primero;
// · en otro sobre, una carta que ya descubrió otro: descubrimiento: false.
// (Subasta, cláusula, intercambio y el relleno desde el álbum, probados en una transacción que se
// deshace: DECISIONES.md. Todas las vías pasan por el mismo trigger.)
import { env, rpc, rpcOk, leer } from './api-util.mjs';

let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };

const U = { token: (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token };
const D = { token: (await rpcOk('slr_login', { codigo: env.SLR_BOT_DOS_CODIGO })).token };
const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: 'Prueba descubrimientos (api)' });
const L = liga.id;
const desc = async () => new Map((await leer(`descubrimientos?select=diseno_id,usuario_id,ronda,descubierta_en&liga_id=eq.${L}`)).datos.map(x => [x.diseno_id, x]));
const album = async u => new Set((await leer(`album?select=diseno_id&liga_id=eq.${L}&usuario_id=eq.${u}`)).datos.map(x => x.diseno_id));
const disenoDe = async ids => new Map((await leer(`cartas?select=id,diseno_id&id=in.(${ids.join(',')})`)).datos.map(x => [x.id, x.diseno_id]));
try {
  console.log('\nreparto inicial');
  U.equipo = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  D.equipo = (await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' })).equipo.id;
  U.usuario = (await rpcOk('slr_yo', { token: U.token })).usuario.id;
  D.usuario = (await rpcOk('slr_yo', { token: D.token })).usuario.id;
  let d = await desc();
  const deU = (await leer(`cartas?select=diseno_id&equipo_id=eq.${U.equipo}`)).datos;
  const deD = (await leer(`cartas?select=diseno_id&equipo_id=eq.${D.equipo}`)).datos;
  check(deU.length >= 10 && deU.every(c => d.get(c.diseno_id)?.usuario_id === U.usuario), `las de Bot Uno (${deU.length}), descubiertas por Bot Uno`);
  check(deD.every(c => d.get(c.diseno_id)?.usuario_id === D.usuario), 'las de Bot Dos, por Bot Dos');
  check([...d.values()].every(x => x.ronda === 1), 'ronda 1 (la 1.ª temporada, con su preparación)');

  await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });
  for (const e of [U, D]) await rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: e.equipo, importe: 60000 });

  console.log('\nsobre básico (y «Haz hueco»)');
  const s1 = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'basico' });
  const s2 = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'basico' });
  const delSobre = [...s1.cartas, ...s2.cartas];
  check(delSobre.every(c => c.descubrimiento === true), `en la respuesta, todas son descubrimiento (${delSobre.map(c => c.descubrimiento).join(', ')})`);
  check(s2.sobran > 0, `con dos sobres, sobran ${s2.sobran}: «Haz hueco»`);
  const soltar = s2.cartas.slice(0, s2.sobran).map(c => c.id);
  await rpcOk('slr_hacer_hueco', { token: U.token, liga_id: L, cartas: soltar });
  d = await desc();
  const alU = await album(U.usuario);
  const dis = await disenoDe(delSobre.map(c => c.id));
  check(delSobre.every(c => d.get(dis.get(c.id))?.usuario_id === U.usuario && alU.has(dis.get(c.id))), 'todas descubiertas por Bot Uno y en su álbum');
  check(soltar.every(id => d.get(dis.get(id))?.usuario_id === U.usuario && alU.has(dis.get(id))), 'también las que ha soltado con «Haz hueco»');
  const libre = (await leer(`cartas?select=equipo_id&id=eq.${soltar[0]}`)).datos[0].equipo_id;
  check(libre === null, 'y la soltada ya no es suya');

  console.log('\nsobre de elección (y «Haz hueco»)');
  const e1 = await rpcOk('slr_comprar_sobre', { token: D.token, liga_id: L, tipo: 'eleccion' });
  const cand = e1.cartas.map(c => c.id);
  const disC = await disenoDe(cand);
  d = await desc();
  let alD = await album(D.usuario);
  check(e1.pendiente_eleccion && cand.length >= 2, `${cand.length} candidatas, pendiente de elegir`);
  check(cand.every(id => !d.has(disC.get(id)) && !alD.has(disC.get(id))), 'las candidatas: ni descubiertas ni en el álbum');
  check(e1.cartas.every(c => c.descubrimiento === true), 'y marcadas como descubrimiento si la eliges (nadie la tiene)');
  const elegida = cand[1];
  await rpcOk('slr_elegir_carta_sobre', { token: D.token, sobre_id: e1.sobre_id, carta_id: elegida });
  d = await desc();
  alD = await album(D.usuario);
  check(d.get(disC.get(elegida))?.usuario_id === D.usuario && alD.has(disC.get(elegida)), 'la elegida: descubierta por Bot Dos y en su álbum');
  check(cand.filter(id => id !== elegida).every(id => !d.has(disC.get(id)) && !alD.has(disC.get(id))), 'las no elegidas: ni descubiertas ni en el álbum');
  // Una segunda elección, con la plantilla llena: «Haz hueco» soltando la elegida
  while (((await leer(`cartas?select=id&equipo_id=eq.${D.equipo}`)).datos.length) < 15) await rpcOk('slr_comprar_sobre', { token: D.token, liga_id: L, tipo: 'basico' });
  const e2 = await rpcOk('slr_comprar_sobre', { token: D.token, liga_id: L, tipo: 'eleccion' });
  const elegida2 = e2.cartas[0].id;
  const r2 = await rpcOk('slr_elegir_carta_sobre', { token: D.token, sobre_id: e2.sobre_id, carta_id: elegida2 });
  const hueco = await rpcOk('slr_hueco_pendiente', { token: D.token, liga_id: L });
  check(hueco?.sobran > 0, `con la plantilla llena, sobran ${hueco?.sobran}`, JSON.stringify(r2).slice(0, 120));
  await rpcOk('slr_hacer_hueco', { token: D.token, liga_id: L, cartas: [elegida2] });
  const disE2 = await disenoDe(e2.cartas.map(c => c.id));
  d = await desc();
  alD = await album(D.usuario);
  check(d.get(disE2.get(elegida2))?.usuario_id === D.usuario && alD.has(disE2.get(elegida2)), 'la elegida, soltada con «Haz hueco»: sigue descubierta y en el álbum');
  check(e2.cartas.slice(1).every(c => !d.has(disE2.get(c.id)) && !alD.has(disE2.get(c.id))), 'y las otras candidatas, nada');

  console.log('\nde mano en mano');
  // Bot Dos vende una carta suya a Bot Uno: sigue siendo de Bot Dos
  const venta = (await leer(`cartas?select=id,diseno_id,disenos_carta(valor)&equipo_id=eq.${D.equipo}&id=neq.${elegida}&limit=1`)).datos[0];
  await rpcOk('slr_poner_en_venta', { token: D.token, carta_id: venta.id, precio: venta.disenos_carta.valor + 30 });
  const v = (await leer(`ventas?select=id&carta_id=eq.${venta.id}&estado=eq.activa`)).datos[0];
  // (Bot Uno tiene la plantilla llena: una carta suya, fuera)
  const sobra = (await leer(`cartas?select=id&equipo_id=eq.${U.equipo}&limit=1`)).datos[0];
  await rpcOk('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: sobra.id, equipo_id: null });
  await rpcOk('slr_comprar_venta', { token: U.token, venta_id: v.id });
  d = await desc();
  check(d.get(venta.diseno_id)?.usuario_id === D.usuario, 'comprada por Bot Uno: sigue descubierta por Bot Dos');
  const info = await rpcOk('slr_carta', { token: U.token, carta_id: venta.id });
  check(info.descubrimiento?.usuario === 'Bot Dos' && info.descubrimiento.tuyo === false && !!info.descubrimiento.fecha, `el detalle: «Descubierta por ${info.descubrimiento?.usuario}»`);
  check(info.historial[0]?.texto === 'Bot Dos la descubrió' && info.historial.length >= 2, `el historial empieza por «${info.historial[0]?.texto}» (${info.historial.length} movimientos)`);
  const mia = await rpcOk('slr_carta', { token: U.token, carta_id: soltar[0] });
  check(mia.descubrimiento?.tuyo === true, 'una que descubrí yo: «tuyo»');
  check(mia.historial.length >= 1 && mia.historial[0].tipo === 'descubrimiento', 'nunca «Sin movimientos todavía» en una descubierta');
} catch (e) {
  mal++;
  console.log(`\n  ✖ Error inesperado: ${e.stack ?? e.message}`);
} finally {
  const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
  check(b.ok, 'liga de prueba borrada', b.mensaje);
  for (const x of [U, D]) await rpc('slr_logout', { token: x.token });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
  process.exitCode = mal ? 1 : 0;
}
