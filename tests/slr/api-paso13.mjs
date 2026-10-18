// Prueba de la API real de SLR: mercado, fase 5 (avisos, historial y Modo pruebas).
//   node tests/slr/api-paso13.mjs
// · Modo pruebas: «Abrir tanda nueva ahora» y «Resolver subastas ahora».
// · Avisos con enlace: subasta ganada (a la carta) y perdida (al Mercado → Subastas),
//   oferta recibida y aceptada, intercambio recibido (al Mercado → Ofertas),
//   cláusula pagada por tu carta y carta vendida (a los movimientos).
// · Historial público: subasta resuelta, compra, cláusula e intercambio.
// Liga de prueba con Bot Uno (admin), Bot Dos y un bot; se borra al terminar.
import { env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO');
const U = { codigo: env.SLR_BOT_UNO_CODIGO }, D = { codigo: env.SLR_BOT_DOS_CODIGO };
let L = null;
const avisos = async b => (await rpcOk('slr_notificaciones', { token: b.token })).notificaciones.filter(n => !n.liga_id || n.liga_id === L);
const ultimo = async (b, tipo) => (await avisos(b)).find(n => n.tipo === tipo);
const historial = async tipo => (await leer(`historial?select=tipo,texto&liga_id=eq.${L}&tipo=eq.${tipo}&order=id.desc`)).datos;

try {
  for (const b of [U, D]) b.token = (await rpcOk('slr_login', { codigo: b.codigo })).token;
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 13 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  U.equipo = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  D.equipo = (await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' })).equipo.id;
  await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L });
  for (const b of [U, D]) await rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: b.equipo, importe: 40000 });
  for (const b of [U, D]) {   // hueco de sobra
    const cs = (await leer(`cartas?select=id&equipo_id=eq.${b.equipo}`)).datos;
    for (const c of cs.slice(0, 4)) await rpcOk('slr_vender_banco', { token: b.token, carta_id: c.id });
  }

  seccion('Modo pruebas: tanda nueva y resolver subastas');
  rechaza(await rpc('slr_admin_tanda_nueva', { token: D.token, liga_id: L }), 'administrador', 'abrir tanda: solo el admin');
  const t1 = await rpcOk('slr_admin_tanda_nueva', { token: U.token, liga_id: L });
  check(t1.cartas === 8, `tanda nueva al momento: ${t1.cartas} cartas (${t1.fecha})`);
  const t2 = await rpcOk('slr_admin_tanda_nueva', { token: U.token, liga_id: L });
  check(t2.fecha > t1.fecha, `otra más: la siguiente fecha libre (${t2.fecha})`);
  const m = await rpcOk('slr_mercado', { token: U.token, liga_id: L });
  const s = m.subastas[0];
  await rpcOk('slr_pujar', { token: U.token, subasta_id: s.id, importe: s.puja_minima + 200 });
  await rpcOk('slr_pujar', { token: D.token, subasta_id: s.id, importe: s.puja_minima + 50 });
  rechaza(await rpc('slr_admin_resolver_subastas', { token: D.token, liga_id: L }), 'administrador', 'resolver subastas: solo el admin');
  const res = await rpcOk('slr_admin_resolver_subastas', { token: U.token, liga_id: L });
  check(res.resueltas === m.subastas.length && res.con_ganador >= 1, `resueltas ${res.resueltas} (${res.con_ganador} con ganador)`);
  check((await leer(`subastas?select=id&liga_id=eq.${L}&estado=eq.abierta`)).datos.length === 0, 'no queda ninguna abierta');

  seccion('Avisos de subastas');
  const gan = await ultimo(U, 'subasta_ganada'), per = await ultimo(D, 'subasta_perdida');
  check(gan?.destino_tipo === 'carta' && gan.destino_id === s.carta.id, 'ganada: aviso que lleva a la carta');
  check(per?.destino_tipo === 'mercado' && per.destino_id === 'subastas', 'perdida: aviso que lleva al Mercado → Subastas');
  check((await historial('subasta')).some(h => /Bot Uno gana la subasta/.test(h.texto)), 'historial público: subasta resuelta');

  seccion('Ofertas, intercambios, cláusulas y ventas');
  const deU = (await leer(`cartas?select=id,disenos_carta(valor)&equipo_id=eq.${U.equipo}`)).datos;
  const deD = (await leer(`cartas?select=id,disenos_carta(valor)&equipo_id=eq.${D.equipo}`)).datos;
  const of = await rpcOk('slr_ofertar', { token: D.token, carta_id: deU[0].id, importe: deU[0].disenos_carta.valor + 100 });
  const rec = await ultimo(U, 'oferta_recibida');
  check(rec?.destino_tipo === 'mercado' && rec.destino_id === 'ofertas', 'oferta recibida: al Mercado → Ofertas');
  await rpcOk('slr_aceptar_oferta', { token: U.token, oferta_id: of.oferta_id ?? of.id });
  const acep = await ultimo(D, 'oferta_aceptada');
  check(acep?.destino_tipo === 'carta', 'oferta aceptada: aviso al que ofertó, con enlace a la carta');
  await rpcOk('slr_proponer_intercambio', { token: D.token, equipo_id: U.equipo, cartas_mias: [deD[0].id], cartas_suyas: [deU[1].id] });
  const ic = await ultimo(U, 'intercambio_recibido');
  check(ic?.destino_tipo === 'mercado' && ic.destino_id === 'ofertas', 'intercambio recibido: al Mercado → Ofertas');
  const ics = (await rpcOk('slr_mercado', { token: U.token, liga_id: L })).intercambios;
  await rpcOk('slr_aceptar_intercambio', { token: U.token, intercambio_id: ics[0].id });
  check((await historial('intercambio')).length >= 1, 'historial público: intercambio');
  // Cláusula: Bot Uno paga la de una carta de Bot Dos (desblindada)
  const objetivo = deD[deD.length - 1];
  await rpcOk('slr_prueba_desblindar', { token: U.token, liga_id: L, carta_id: objetivo.id });
  await rpcOk('slr_pagar_clausula', { token: U.token, carta_id: objetivo.id });
  const cl = await ultimo(D, 'clausula_recibida');
  check(cl?.destino_tipo === 'movimientos', 'cláusula pagada por tu carta: aviso a los movimientos');
  check((await historial('clausula')).length >= 1, 'historial público: cláusula');
  // Venta a precio fijo
  await rpcOk('slr_poner_en_venta', { token: D.token, carta_id: deD[1].id, precio: deD[1].disenos_carta.valor + 30 });
  const v = (await rpcOk('slr_mercado', { token: U.token, liga_id: L })).ventas[0];
  await rpcOk('slr_comprar_venta', { token: U.token, venta_id: v.id });
  const vend = await ultimo(D, 'venta_completada');
  check(vend?.destino_tipo === 'movimientos', 'carta vendida: aviso a los movimientos');
  check((await historial('compra')).length >= 1, 'historial público: compra');
} catch (e) {
  resultado.fallos++;
  console.log(`\n  ✖ Error inesperado: ${e.message}`);
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
