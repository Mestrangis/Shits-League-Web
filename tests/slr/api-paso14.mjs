// Prueba de la API real de SLR: sobres con la plantilla llena.
//   node tests/slr/api-paso14.mjs
// · Con 15 cartas, el sobre se compra y se abre: la plantilla queda por encima.
// · Mientras sobren cartas: ni otras operaciones de mercado ni la alineación;
//   sí vender al banco (una o varias con slr_hacer_hueco, al menos las que sobran).
// · slr_hueco_pendiente: cuántas sobran y cuáles son las del último sobre.
// · Al cierre de la jornada, el banco se queda con las de menos valor, con aviso.
// · El resto de adquisiciones sigue pidiendo hueco antes.
// Liga de prueba de Bot Uno con 3 bots; se borra al terminar.
import { env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO');
const U = { codigo: env.SLR_BOT_UNO_CODIGO };
let L = null;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const mias = async () => (await leer(`cartas?select=id,disenos_carta(valor)&equipo_id=eq.${U.equipo}`)).datos;

try {
  U.token = (await rpcOk('slr_login', { codigo: U.codigo })).token;
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 14 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  U.equipo = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  for (let i = 0; i < 3; i++) await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L });
  await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });
  await rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: U.equipo, importe: 50000 });
  await rpcOk('slr_admin_tanda_nueva', { token: U.token, liga_id: L });
  const libres = (await leer(`cartas?select=id&liga_id=eq.${L}&equipo_id=is.null&reservada_por=is.null&limit=40`)).datos;
  for (const c of libres.slice(0, 15 - (await mias()).length)) await rpcOk('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: c.id, equipo_id: U.equipo });
  check((await mias()).length === 15, 'Bot Uno con 15 cartas (el máximo)');

  seccion('Sobre con la plantilla llena');
  const b = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'basico' });
  check(b.cartas.length === 3 && b.sobran === 3 && b.maxima === 15, `el básico se abre igual: 18 cartas, sobran ${b.sobran}`);
  const hp = await rpcOk('slr_hueco_pendiente', { token: U.token, liga_id: L });
  check(hp.sobran === 3 && hp.nuevas.length === 3 && b.cartas.every(c => hp.nuevas.includes(c.id)), 'slr_hueco_pendiente: sobran 3 y las nuevas son las del sobre');

  seccion('Bloqueos mientras sobren');
  rechaza(await rpc('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'sencillo' }), 'Primero haz hueco', 'otro sobre: no');
  const m = await rpcOk('slr_mercado', { token: U.token, liga_id: L });
  rechaza(await rpc('slr_pujar', { token: U.token, subasta_id: m.subastas[0].id, importe: m.subastas[0].puja_minima }), 'Primero haz hueco', 'pujar: no');
  const al = (await leer(`alineaciones?select=*&equipo_id=eq.${U.equipo}`)).datos[0];
  rechaza(await rpc('slr_guardar_alineacion', { token: U.token, equipo_id: U.equipo, formacion: al.formacion, huecos: al.huecos, banquillo: al.banquillo,
    orden_manual: al.orden_manual, capitan_id: al.capitan_id }), 'Primero haz hueco', 'guardar la alineación: no');
  rechaza(await rpc('slr_confirmar_alineacion', { token: U.token, equipo_id: U.equipo }), 'Primero haz hueco', 'confirmar la alineación: no');
  rechaza(await rpc('slr_guardar_tacticas', { token: U.token, equipo_id: U.equipo, tacticas: { tactica: 'presion' } }), 'Primero haz hueco', 'tácticas: no');

  seccion('Hacer hueco');
  const ordenadas = (await mias()).sort((x, y) => x.disenos_carta.valor - y.disenos_carta.valor);
  rechaza(await rpc('slr_hacer_hueco', { token: U.token, liga_id: L, cartas: [ordenadas[0].id] }), 'elige al menos', 'vender menos de las que sobran de golpe: no');
  const v1 = await rpcOk('slr_vender_banco', { token: U.token, carta_id: ordenadas[0].id });
  check(v1.sobran === 2, 'vender una al banco sí se puede (sobran 2)');
  // Se descarta una nueva y otra vieja
  const h = await rpcOk('slr_hacer_hueco', { token: U.token, liga_id: L, cartas: [b.cartas[0].id, ordenadas[1].id] });
  check(h.vendidas === 2 && h.sobran === 0 && h.cobrado > 0, `slr_hacer_hueco: 2 vendidas por ${h.cobrado}, ya no sobra ninguna`);
  check((await mias()).length === 15, 'te quedas en 15');
  await rpcOk('slr_guardar_tacticas', { token: U.token, equipo_id: U.equipo, tacticas: { tactica: 'presion' } });
  check(true, 'y vuelve a poder tocar la alineación');

  seccion('El resto de adquisiciones sigue pidiendo hueco antes');
  // (pujar sí se puede con la plantilla llena: el hueco se mira al resolverse, y la web pide «Haz hueco» antes)
  const bot = (await leer(`equipos?select=id&liga_id=eq.${L}&id=neq.${U.equipo}&limit=1`)).datos[0];
  const ajena = (await leer(`cartas?select=id&equipo_id=eq.${bot.id}&limit=1`)).datos[0];
  await rpcOk('slr_prueba_desblindar', { token: U.token, liga_id: L, carta_id: ajena.id });
  rechaza(await rpc('slr_pagar_clausula', { token: U.token, carta_id: ajena.id }), 'llena', 'pagar una cláusula con 15: plantilla llena (hay que hacer hueco antes)');

  seccion('Cierre de jornada con cartas de más');
  const b2 = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'basico' });
  check(b2.sobran === 3, 'otro básico: sobran 3');
  const antes = (await mias()).sort((x, y) => x.disenos_carta.valor - y.disenos_carta.valor || (x.id < y.id ? -1 : 1));
  const baratas = antes.slice(0, 3).map(c => c.id);
  let r;
  for (let i = 0; i < 60; i++) { r = await rpcOk('slr_admin_jugar_jornada', { token: U.token, liga_id: L }); if (r.estado !== 'simulando') break; await dormir(1500); }
  const despues = await mias();
  check(despues.length === 15 && baratas.every(id => !despues.some(c => c.id === id)), 'al cerrar la jornada, el banco se queda con las 3 de menos valor');
  const aviso = (await rpcOk('slr_notificaciones', { token: U.token })).notificaciones.find(n => n.tipo === 'hueco_automatico');
  check(/cartas de más/.test(aviso?.datos?.texto ?? ''), `con aviso: «${aviso?.datos?.texto}»`);
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
