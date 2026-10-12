// Prueba de la API real de SLR (paso 3): economía y mercado.
//   node tests/slr/api-paso3.mjs
// Tres bots en una liga de prueba; el tiempo se simula con slr_prueba_tareas.
// Al final borra las ligas de prueba aunque algo falle.
import { randomUUID } from 'node:crypto';
import {
  env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado,
  cartasLiga, subastasAbiertas, saldo, invariantes, horas,
} from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO', 'SLR_BOT_TRES_CODIGO');

const T0 = new Date();
const bots = [
  { nombre: 'Bot Uno', codigo: env.SLR_BOT_UNO_CODIGO },
  { nombre: 'Bot Dos', codigo: env.SLR_BOT_DOS_CODIGO },
  { nombre: 'Bot Tres', codigo: env.SLR_BOT_TRES_CODIGO },
];
const [B1, B2, B3] = bots;
const ligas = []; // [{ id, token del admin }] para borrarlas al final
let L;

const tareas = ahora => rpcOk('slr_prueba_tareas', { token: B1.token, liga_id: L, ahora });
const darDinero = (bot, importe) => rpcOk('slr_prueba_dar_dinero', { token: B1.token, liga_id: L, equipo_id: bot.equipo, importe });
const desblindar = carta => rpcOk('slr_prueba_desblindar', { token: B1.token, liga_id: L, carta_id: carta });
const misCartas = async bot => (await cartasLiga(L)).filter(c => c.equipo_id === bot.equipo);
const notifs = async bot => (await rpcOk('slr_notificaciones', { token: bot.token })).notificaciones;
const tieneNotif = async (bot, tipo, campo, valor) =>
  (await notifs(bot)).some(n => n.tipo === tipo && (!campo || n.datos[campo] === valor));

// Deja al bot con como mucho n cartas vendiendo al banco las de menos valor
async function bajarA(bot, n) {
  const cs = (await misCartas(bot)).sort((a, b) => a.disenos_carta.valor - b.disenos_carta.valor);
  for (const c of cs.slice(0, Math.max(0, cs.length - n))) await rpcOk('slr_vender_banco', { token: bot.token, carta_id: c.id });
}
// Sube al bot hasta n cartas con sobres básicos (y elección para afinar)
async function subirA(bot, n) {
  await darDinero(bot, 20000);
  while ((await misCartas(bot)).length + 3 <= n) await rpcOk('slr_comprar_sobre', { token: bot.token, liga_id: L, tipo: 'basico' });
  while ((await misCartas(bot)).length < n) {
    const s = await rpcOk('slr_comprar_sobre', { token: bot.token, liga_id: L, tipo: 'eleccion' });
    await rpcOk('slr_elegir_carta_sobre', { token: bot.token, sobre_id: s.sobre_id, carta_id: s.cartas[0].id });
  }
}

try {
  /* ── Preparación ───────────────────────────────────────────────────────── */
  seccion('Preparación: tres bots en una liga de prueba');
  for (const b of bots) {
    const l = await rpcOk('slr_login', { codigo: b.codigo });
    b.token = l.token; b.usuario = l.usuario.id;
  }
  const liga = await rpcOk('slr_crear_liga_prueba', { token: B1.token, nombre: `Prueba paso 3 · ${T0.toISOString().slice(0, 16)}` });
  L = liga.id; ligas.push({ id: L, token: B1.token });
  check(liga.es_prueba === true, 'liga de prueba creada (es_prueba)');
  for (const b of bots) {
    const u = await rpcOk('slr_unirse_liga', { token: b.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: `${b.nombre} FC` });
    b.equipo = u.equipo.id;
  }
  check(true, 'los tres bots se unen con 11 cartas y 5.000');
  rechaza(await rpc('slr_prueba_dar_dinero', { token: B2.token, liga_id: L, equipo_id: B2.equipo, importe: 1000 }),
    'Solo el administrador', 'dar_dinero: solo el admin de la liga de prueba');
  await invariantes(L, bots, 'inicio');

  /* ── 1. Venta al banco ─────────────────────────────────────────────────── */
  seccion('1. Venta al banco');
  {
    const c = (await misCartas(B1))[0];
    const antes = await saldo(B1.equipo);
    const r = await rpcOk('slr_vender_banco', { token: B1.token, carta_id: c.id });
    check(r.precio === Math.round(c.disenos_carta.valor * 0.6), `60 % del valor (${c.disenos_carta.valor} → ${r.precio}), aunque esté blindada`);
    check(await saldo(B1.equipo) === antes + r.precio, 'el saldo sube lo cobrado');
    const ahora = (await cartasLiga(L)).find(x => x.id === c.id);
    check(ahora.equipo_id === null && ahora.blindada_hasta === null && Number(ahora.multiplicador_clausula) === 1.5,
      'la carta queda libre, sin blindaje y con multiplicador 1,5');
    const ajena = (await misCartas(B2))[0];
    rechaza(await rpc('slr_vender_banco', { token: B1.token, carta_id: ajena.id }), 'no es tuya', 'vender una carta ajena: rechazado');
  }
  await invariantes(L, bots, 'banco');

  /* ── 2. Ventas entre usuarios ──────────────────────────────────────────── */
  seccion('2. Ventas entre usuarios');
  {
    const c = (await misCartas(B1))[0];
    const v = await rpcOk('slr_poner_en_venta', { token: B1.token, carta_id: c.id, precio: 500 });
    rechaza(await rpc('slr_poner_en_venta', { token: B1.token, carta_id: c.id, precio: 600 }), 'ya está en venta', 'poner dos veces en venta: rechazado');
    rechaza(await rpc('slr_comprar_venta', { token: B1.token, venta_id: v.venta_id }), 'propia', 'comprar tu propia venta: rechazado');
    const [s1, s2] = [await saldo(B1.equipo), await saldo(B2.equipo)];
    await rpcOk('slr_comprar_venta', { token: B2.token, venta_id: v.venta_id });
    check(await saldo(B2.equipo) === s2 - 500 && await saldo(B1.equipo) === s1 + 475, 'comprador paga 500, vendedor recibe 475 (95 %)');
    const ahora = (await cartasLiga(L)).find(x => x.id === c.id);
    check(ahora.equipo_id === B2.equipo && new Date(ahora.blindada_hasta) > new Date(Date.now() + 6.9 * 86400000),
      'la carta pasa a Bot Dos con blindaje de 7 días');
    const alb = (await leer(`album?usuario_id=eq.${B2.usuario}&liga_id=eq.${L}&diseno_id=eq.${c.diseno_id}`)).datos[0];
    check(alb?.via_adquisicion === 'compra', 'entrada en el álbum con vía «compra»');
    check(await tieneNotif(B1, 'venta_completada', 'carta_id', c.id), 'el vendedor recibe una notificación');
    rechaza(await rpc('slr_comprar_venta', { token: B3.token, venta_id: v.venta_id }), 'no está activa', 'comprar una venta ya vendida: rechazado');

    const cara = (await misCartas(B2))[0];
    const v2 = await rpcOk('slr_poner_en_venta', { token: B2.token, carta_id: cara.id, precio: 999999 });
    rechaza(await rpc('slr_comprar_venta', { token: B3.token, venta_id: v2.venta_id }), 'Saldo insuficiente', 'comprar sin saldo: rechazado');
    check(await rpcOk('slr_retirar_venta', { token: B2.token, venta_id: v2.venta_id }) === true, 'el vendedor retira la venta');
    rechaza(await rpc('slr_comprar_venta', { token: B3.token, venta_id: v2.venta_id }), 'no está activa', 'comprar una venta retirada: rechazado');
  }
  await invariantes(L, bots, 'ventas');

  /* ── 3. Ofertas directas ───────────────────────────────────────────────── */
  seccion('3. Ofertas directas');
  {
    const c = (await misCartas(B1))[0];
    const o1 = await rpcOk('slr_ofertar', { token: B3.token, carta_id: c.id, importe: 300 });
    check(await tieneNotif(B1, 'oferta_recibida', 'oferta_id', o1.oferta_id), 'el dueño recibe la oferta');
    rechaza(await rpc('slr_ofertar', { token: B1.token, carta_id: c.id, importe: 300 }), 'propia', 'ofertar por tu propia carta: rechazado');
    const libre = (await cartasLiga(L)).find(x => !x.equipo_id);
    rechaza(await rpc('slr_ofertar', { token: B3.token, carta_id: libre.id, importe: 300 }), 'no tiene dueño', 'ofertar por una carta libre: rechazado');
    rechaza(await rpc('slr_aceptar_oferta', { token: B3.token, oferta_id: o1.oferta_id }), 'no es para ti', 'aceptar una oferta que no es para ti: rechazado');

    const o2 = await rpcOk('slr_contraofertar', { token: B1.token, oferta_id: o1.oferta_id, importe: 400 });
    const [s1, s3] = [await saldo(B1.equipo), await saldo(B3.equipo)];
    const acept = await rpcOk('slr_aceptar_oferta', { token: B3.token, oferta_id: o2.oferta_id });
    check(acept.comprador_id === B3.equipo && acept.vendedor_recibe === 380, 'contraoferta de 400 aceptada por el comprador: el dueño recibe 380');
    check(await saldo(B3.equipo) === s3 - 400 && await saldo(B1.equipo) === s1 + 380, 'saldos: −400 y +380');
    check((await cartasLiga(L)).find(x => x.id === c.id).equipo_id === B3.equipo, 'la carta pasa a Bot Tres');
    rechaza(await rpc('slr_aceptar_oferta', { token: B1.token, oferta_id: o1.oferta_id }), 'contraofertada', 'la oferta original ya no se puede aceptar');

    const d = (await misCartas(B2))[0];
    const o3 = await rpcOk('slr_ofertar', { token: B3.token, carta_id: d.id, importe: 999999 });
    rechaza(await rpc('slr_aceptar_oferta', { token: B2.token, oferta_id: o3.oferta_id }), 'no tiene saldo', 'aceptar una oferta de quien no tiene saldo: rechazado');
    await rpcOk('slr_rechazar_oferta', { token: B2.token, oferta_id: o3.oferta_id });
    check(await tieneNotif(B3, 'oferta_rechazada', 'oferta_id', o3.oferta_id), 'rechazar: el ofertante recibe la notificación');
  }
  await invariantes(L, bots, 'ofertas');

  /* ── 4. Intercambios ───────────────────────────────────────────────────── */
  seccion('4. Intercambios');
  {
    const [a] = await misCartas(B1);
    const [b1, b2] = await misCartas(B2);
    const n1 = (await misCartas(B1)).length, n2 = (await misCartas(B2)).length;
    const [s1, s2] = [await saldo(B1.equipo), await saldo(B2.equipo)];
    rechaza(await rpc('slr_proponer_intercambio', { token: B1.token, equipo_id: B2.equipo, cartas_mias: [b1.id], cartas_suyas: [b2.id] }),
      'no es tuya', 'ofrecer una carta que no es tuya: rechazado');
    rechaza(await rpc('slr_proponer_intercambio', { token: B1.token, equipo_id: B2.equipo, cartas_mias: [a.id], cartas_suyas: [] }),
      'al menos una carta', 'intercambio sin cartas de un lado: rechazado');
    const i1 = await rpcOk('slr_proponer_intercambio', {
      token: B1.token, equipo_id: B2.equipo, cartas_mias: [a.id], cartas_suyas: [b1.id, b2.id], monedas_mias: 200, monedas_suyas: 0 });
    const r = await rpcOk('slr_aceptar_intercambio', { token: B2.token, intercambio_id: i1.intercambio_id });
    check(r.para_recibe === 190, 'Bot Dos recibe 190 de las 200 monedas (5 % de impuesto)');
    check(await saldo(B1.equipo) === s1 - 200 && await saldo(B2.equipo) === s2 + 190, 'saldos: −200 y +190');
    const cs = await cartasLiga(L);
    check(cs.find(x => x.id === a.id).equipo_id === B2.equipo && [b1, b2].every(b => cs.find(x => x.id === b.id).equipo_id === B1.equipo),
      'las cartas cambian de manos');
    check((await misCartas(B1)).length === n1 + 1 && (await misCartas(B2)).length === n2 - 1, 'plantillas: +1 y −1');

    // Monedas en los dos lados y quien paga sin saldo
    const [x] = await misCartas(B2), [y] = await misCartas(B3);
    const i2 = await rpcOk('slr_proponer_intercambio', {
      token: B2.token, equipo_id: B3.equipo, cartas_mias: [x.id], cartas_suyas: [y.id], monedas_mias: 100, monedas_suyas: 60 });
    const [t2, t3] = [await saldo(B2.equipo), await saldo(B3.equipo)];
    await rpcOk('slr_aceptar_intercambio', { token: B3.token, intercambio_id: i2.intercambio_id });
    check(await saldo(B2.equipo) === t2 - 100 + 57 && await saldo(B3.equipo) === t3 - 60 + 95,
      'monedas en ambos lados: cada uno cobra el 95 % de lo que recibe');

    const [p] = await misCartas(B3), [q] = await misCartas(B1);
    const i3 = await rpcOk('slr_proponer_intercambio', {
      token: B3.token, equipo_id: B1.equipo, cartas_mias: [p.id], cartas_suyas: [q.id], monedas_mias: 999999 });
    rechaza(await rpc('slr_aceptar_intercambio', { token: B1.token, intercambio_id: i3.intercambio_id }),
      'no tiene saldo suficiente', 'aceptar un intercambio cuyo proponente no puede pagar: rechazado');
    await rpcOk('slr_rechazar_intercambio', { token: B1.token, intercambio_id: i3.intercambio_id });
    check(await tieneNotif(B3, 'intercambio_rechazado', 'intercambio_id', i3.intercambio_id), 'rechazar intercambio: el proponente recibe la notificación');
  }
  await invariantes(L, bots, 'intercambios');

  /* ── 5. Cláusulas ──────────────────────────────────────────────────────── */
  seccion('5. Cláusulas');
  {
    const k = (await misCartas(B1)).sort((a, b) => b.disenos_carta.valor - a.disenos_carta.valor)[0];
    rechaza(await rpc('slr_pagar_clausula', { token: B2.token, carta_id: k.id }), 'blindada', 'cláusula de una carta blindada: rechazado');
    rechaza(await rpc('slr_pagar_clausula', { token: B1.token, carta_id: k.id }), 'propia', 'pagar tu propia cláusula: rechazado');
    const of = await rpcOk('slr_ofertar', { token: B3.token, carta_id: k.id, importe: 200 });
    await desblindar(k.id);
    const clausula = Math.round(k.disenos_carta.valor * 1.5);
    const [s1, s2] = [await saldo(B1.equipo), await saldo(B2.equipo)];
    const r = await rpcOk('slr_pagar_clausula', { token: B2.token, carta_id: k.id });
    check(r.clausula === clausula && r.antiguo_recibe === Math.round(clausula * 0.9),
      `cláusula ${clausula}: el antiguo dueño recibe el 90 % (${r.antiguo_recibe}) y el banco el 10 %`);
    check(await saldo(B2.equipo) === s2 - clausula && await saldo(B1.equipo) === s1 + r.antiguo_recibe, 'saldos correctos');
    check((await cartasLiga(L)).find(x => x.id === k.id).equipo_id === B2.equipo, 'la carta pasa a Bot Dos (blindada de nuevo)');
    check(await tieneNotif(B1, 'clausula_recibida', 'carta_id', k.id), 'el antiguo dueño recibe una notificación');
    check(await tieneNotif(B3, 'oferta_cancelada', 'oferta_id', of.oferta_id), 'la oferta pendiente de Bot Tres sobre la carta se cancela y se le avisa');
    rechaza(await rpc('slr_aceptar_oferta', { token: B2.token, oferta_id: of.oferta_id }), 'no es para ti', 'esa oferta ya no se puede aceptar');
    const hist = (await leer(`historial?liga_id=eq.${L}&tipo=eq.clausula`)).datos;
    check(hist.some(h => h.texto.includes('ha clausulado a') && h.texto.includes(clausula.toLocaleString('de-DE'))),
      `historial: «${hist[0]?.texto}»`);

    // Cambiar el multiplicador
    const antes = await saldo(B2.equipo);
    const sube = await rpcOk('slr_cambiar_clausula', { token: B2.token, carta_id: k.id, multiplicador: 2.0 });
    const esperado = Math.round((Math.round(k.disenos_carta.valor * 2.0) - clausula) * 0.2);
    check(sube.coste === esperado && await saldo(B2.equipo) === antes - esperado, `subir a ×2,0 cuesta el 20 % del aumento (${esperado})`);
    const baja = await rpcOk('slr_cambiar_clausula', { token: B2.token, carta_id: k.id, multiplicador: 1.7 });
    check(baja.coste === 0 && baja.clausula === Math.round(k.disenos_carta.valor * 1.7), 'bajar a ×1,7 es gratis');
    rechaza(await rpc('slr_cambiar_clausula', { token: B2.token, carta_id: k.id, multiplicador: 3.5 }), 'entre', 'multiplicador 3,5: rechazado');
    rechaza(await rpc('slr_cambiar_clausula', { token: B2.token, carta_id: k.id, multiplicador: 1.55 }), 'pasos de 0,1', 'multiplicador 1,55: rechazado');
    rechaza(await rpc('slr_cambiar_clausula', { token: B1.token, carta_id: k.id, multiplicador: 2.0 }), 'no es tuya', 'cambiar la cláusula de una carta ajena: rechazado');
    B2.cartaClausulada = k.id;
  }
  await invariantes(L, bots, 'cláusulas');

  /* ── 6. Subastas ───────────────────────────────────────────────────────── */
  seccion('6. Subastas');
  let tanda0, tanda1;
  {
    const t = await tareas(T0.toISOString());
    tanda0 = await subastasAbiertas(L);
    const cs = await cartasLiga(L);
    check(t.tandas_abiertas === 1 && tanda0.length === 8, `se abre la tanda del día con 8 cartas`);
    check(tanda0.every(s => { const c = cs.find(x => x.id === s.carta_id); return !c.equipo_id && c.disenos_carta.tipo !== 'unica'; }),
      'todas libres y ninguna Única');
    check((await tareas(T0.toISOString())).tandas_abiertas === 0, 'idempotente: otra ejecución el mismo día no abre otra tanda');

    const valor = s => cs.find(x => x.id === s.carta_id).disenos_carta.valor;
    const [S1, S2, S3, S4] = tanda0;
    rechaza(await rpc('slr_pujar', { token: B2.token, subasta_id: S1.id, importe: valor(S1) - 1 }), 'puja mínima', 'puja por debajo del valor: rechazada');
    await rpcOk('slr_pujar', { token: B2.token, subasta_id: S1.id, importe: valor(S1) + 10 });
    const m3 = await rpcOk('slr_mercado', { token: B3.token, liga_id: L });
    const m2 = await rpcOk('slr_mercado', { token: B2.token, liga_id: L });
    check(m3.subastas.find(s => s.id === S1.id).mi_puja === null && m2.subastas.find(s => s.id === S1.id).mi_puja === valor(S1) + 10,
      'puja ciega: Bot Tres no ve la puja de Bot Dos; Bot Dos ve la suya');
    const directa = await leer(`pujas?subasta_id=eq.${S1.id}`);
    check(!directa.ok || directa.datos.length === 0, 'las pujas no se pueden leer directamente');

    // Empate: misma cantidad, gana la más antigua (todos con 0 puntos)
    await rpcOk('slr_pujar', { token: B2.token, subasta_id: S2.id, importe: valor(S2) + 50 });
    await new Promise(r => setTimeout(r, 1200));
    await rpcOk('slr_pujar', { token: B3.token, subasta_id: S2.id, importe: valor(S2) + 50 });
    // Ganador sin saldo: Bot Uno puja muy por encima de su saldo; pasa a Bot Tres
    await rpcOk('slr_pujar', { token: B1.token, subasta_id: S3.id, importe: 999999 });
    await rpcOk('slr_pujar', { token: B3.token, subasta_id: S3.id, importe: valor(S3) });
    // Puja retirada: S4 queda sin pujas
    await rpcOk('slr_pujar', { token: B2.token, subasta_id: S4.id, importe: valor(S4) });
    await rpcOk('slr_retirar_puja', { token: B2.token, subasta_id: S4.id });

    const saldo2 = await saldo(B2.equipo);
    const t2 = await tareas(horas(T0, 25));
    check(t2.subastas_resueltas === 8 && t2.tandas_abiertas === 1, '25 h después: se resuelven las 8 subastas y se abre la tanda siguiente');
    const res = (await leer(`subastas?select=id,estado,ganador_id,precio,carta_id&liga_id=eq.${L}&tanda=eq.${tanda0[0].tanda}`)).datos;
    const de = s => res.find(x => x.id === s.id);
    check(de(S1).ganador_id === B2.equipo && de(S1).precio === valor(S1) + 10, 'S1: gana Bot Dos y paga su puja');
    check(de(S2).ganador_id === B2.equipo, 'S2 (empate): gana la puja más antigua');
    check(de(S3).ganador_id === B3.equipo, 'S3: Bot Uno no tiene saldo, su puja se anula y gana Bot Tres');
    check(await tieneNotif(B1, 'puja_anulada'), 'Bot Uno recibe el aviso de puja anulada');
    check(de(S4).estado === 'desierta' && (await cartasLiga(L)).find(x => x.id === S4.carta_id).equipo_id === null,
      'S4 (sin pujas): desierta y la carta sigue libre');
    check(await saldo(B2.equipo) === saldo2 - (valor(S1) + 10) - (valor(S2) + 50), 'Bot Dos paga íntegras sus dos subastas al banco');
    const hist = (await leer(`historial?liga_id=eq.${L}&tipo=eq.subasta`)).datos;
    check(hist.length === 3 && hist.every(h => Array.isArray(h.datos.pujas)), 'historial: 3 subastas ganadas, con las pujas publicadas al resolverse');

    tanda1 = await subastasAbiertas(L);
    check(tanda1.length === 8 && !tanda1.some(s => tanda0.some(s0 => s0.carta_id === s.carta_id)),
      'ninguna carta sale dos tandas seguidas');

    // Ofertas caducadas (48 h): una oferta sobre una carta que no se mueve hasta entonces
    const destino = (await misCartas(B3))[0];
    const caduca = (await rpcOk('slr_ofertar', { token: B1.token, carta_id: destino.id, importe: 250 })).oferta_id;
    B1.ofertaQueCaduca = caduca;
    await tareas(horas(T0, 49));
    rechaza(await rpc('slr_aceptar_oferta', { token: B3.token, oferta_id: B1.ofertaQueCaduca }), 'caducad', 'aceptar una oferta caducada: rechazado');
    check(await tieneNotif(B1, 'oferta_caducada', 'oferta_id', B1.ofertaQueCaduca), 'el ofertante recibe el aviso de caducidad');
  }
  await invariantes(L, bots, 'subastas');

  /* ── 7. Sobres ─────────────────────────────────────────────────────────── */
  seccion('7. Sobres');
  {
    await bajarA(B1, 12);
    const antes = await cartasLiga(L);
    const enSubasta = new Set((await subastasAbiertas(L)).map(s => s.carta_id));
    const sb = await rpcOk('slr_comprar_sobre', { token: B1.token, liga_id: L, tipo: 'basico' });
    check(sb.precio === 1500 && sb.cartas.length === 3, 'sobre básico: 1.500 y 3 cartas');
    check(sb.cartas.every(c => { const a = antes.find(x => x.id === c.id); return !a || (!a.equipo_id && !enSubasta.has(c.id)); }),
      'ninguna tenía dueño ni estaba en subasta');
    const despues = await cartasLiga(L);
    check(sb.cartas.every(c => despues.find(x => x.id === c.id).equipo_id === B1.equipo), 'las 3 pasan a Bot Uno');
    const alb = (await leer(`album?usuario_id=eq.${B1.usuario}&liga_id=eq.${L}&via_adquisicion=eq.sobre_basico`)).datos;
    check(sb.cartas.every(c => alb.some(a => a.diseno_id === c.diseno_id)), 'entradas de álbum con vía «sobre_basico»');
    await subirA(B1, 13);
    rechaza(await rpc('slr_comprar_sobre', { token: B1.token, liga_id: L, tipo: 'basico' }), 'como mucho 12', 'sobre con 13 cartas: rechazado (hace falta tener 12 o menos)');
    rechaza(await rpc('slr_comprar_sobre', { token: B1.token, liga_id: L, tipo: 'oro' }), 'Tipo de sobre no válido', 'tipo de sobre inexistente: rechazado');

    await bajarA(B3, 11);
    const s3 = await saldo(B3.equipo);
    await darDinero(B3, -(s3 - 100));
    rechaza(await rpc('slr_comprar_sobre', { token: B3.token, liga_id: L, tipo: 'basico' }), 'Saldo insuficiente', 'sobre sin saldo: rechazado');
    await darDinero(B3, s3 - 100);

    // Garantía premium: se fuerza la primera carta a dúo o superior tras 2 sin especial
    await darDinero(B2, 200000);
    let vista = false, n = 0, contadorOk = true;
    while (!vista && n < 40) {
      await bajarA(B2, 12);
      const enSub = new Set((await subastasAbiertas(L)).map(s => s.carta_id));
      const cont = (await leer(`equipos?select=contador_garantia_premium&id=eq.${B2.equipo}`)).datos[0].contador_garantia_premium;
      const p = await rpcOk('slr_comprar_sobre', { token: B2.token, liga_id: L, tipo: 'premium' });
      n++;
      if (p.cartas.some(c => enSub.has(c.id))) contadorOk = false;
      const especial = p.cartas.some(c => c.tipo !== 'individual');
      const contDespues = (await leer(`equipos?select=contador_garantia_premium&id=eq.${B2.equipo}`)).datos[0].contador_garantia_premium;
      if (contDespues !== (especial ? 0 : cont + 1)) contadorOk = false;
      if (cont >= 2) {
        vista = true;
        check(p.garantia_aplicada && p.cartas[0].tipo !== 'individual',
          `garantía premium: con el contador en ${cont}, la primera carta es ${p.cartas[0].tipo} (sobre nº ${n})`);
      } else if (p.garantia_aplicada) contadorOk = false;
    }
    check(vista, 'se llegó a aplicar la garantía premium');
    check(contadorOk, `el contador vuelve a 0 con un dúo o mejor y si no suma 1; ninguna carta en subasta (${n} sobres premium)`);

    // Sobre de elección: manual
    await bajarA(B3, 13);
    await darDinero(B3, 10000);
    const e1 = await rpcOk('slr_comprar_sobre', { token: B3.token, liga_id: L, tipo: 'eleccion' });
    const libresEsp = (await cartasLiga(L)).some(c => !c.equipo_id && c.disenos_carta.tipo !== 'individual');
    check(e1.pendiente_eleccion && e1.cartas.length === 3, 'sobre de elección: 3 candidatas pendientes');
    check(!libresEsp || e1.cartas.some(c => c.tipo !== 'individual'), 'al menos una candidata es dúo o superior');
    const cs = await cartasLiga(L);
    check(e1.cartas.every(c => cs.find(x => x.id === c.id).reservada_por === e1.sobre_id), 'las 3 quedan reservadas');
    const yo = await rpcOk('slr_yo', { token: B3.token });
    check(yo.sobres_pendientes.some(s => s.id === e1.sobre_id && s.candidatas.length === 3), 'slr_yo devuelve el sobre pendiente');
    const miCarta = (await misCartas(B3))[0];
    rechaza(await rpc('slr_poner_en_venta', { token: B3.token, carta_id: miCarta.id, precio: 100 }), 'sobre de elección pendiente',
      'con una elección pendiente, otra operación de mercado: rechazada');
    rechaza(await rpc('slr_comprar_sobre', { token: B3.token, liga_id: L, tipo: 'basico' }), 'sobre de elección pendiente',
      'con una elección pendiente, comprar otro sobre: rechazado');
    rechaza(await rpc('slr_elegir_carta_sobre', { token: B3.token, sobre_id: e1.sobre_id, carta_id: randomUUID() }), 'candidatas',
      'elegir una carta que no es candidata: rechazado');
    const elegida = await rpcOk('slr_elegir_carta_sobre', { token: B3.token, sobre_id: e1.sobre_id, carta_id: e1.cartas[1].id });
    const cs2 = await cartasLiga(L);
    check(!elegida.automatica && cs2.find(x => x.id === e1.cartas[1].id).equipo_id === B3.equipo, 'elección manual: Bot Tres se lleva la segunda');
    check([0, 2].every(i => { const c = cs2.find(x => x.id === e1.cartas[i].id); return !c.equipo_id && !c.reservada_por; }),
      'las otras dos vuelven a estar libres y sin reserva');

    // Sobre de elección: automática por caducidad (10 min)
    const e2 = await rpcOk('slr_comprar_sobre', { token: B3.token, liga_id: L, tipo: 'eleccion' });
    const t = await tareas(new Date(Date.now() + 11 * 60000).toISOString());
    check(t.elecciones_resueltas === 1 && (await cartasLiga(L)).find(x => x.id === e2.cartas[0].id).equipo_id === B3.equipo,
      'elección automática al caducar: se entrega la primera candidata');
    check(await tieneNotif(B3, 'eleccion_automatica', 'sobre_id', e2.sobre_id), 'y se avisa al usuario');
    check((await rpcOk('slr_yo', { token: B3.token })).sobres_pendientes.length === 0, 'ya no queda ningún sobre pendiente');
  }
  await invariantes(L, bots, 'sobres');

  /* ── 8. Plantilla llena ────────────────────────────────────────────────── */
  seccion('8. Plantilla llena (15 cartas)');
  {
    await subirA(B3, 15);
    check((await misCartas(B3)).length === 15, 'Bot Tres tiene 15 cartas');
    rechaza(await rpc('slr_comprar_sobre', { token: B3.token, liga_id: L, tipo: 'eleccion' }), 'llena', 'sobre de elección con 15: rechazado');
    const venta = await rpcOk('slr_poner_en_venta', { token: B1.token, carta_id: (await misCartas(B1))[0].id, precio: 50 });
    rechaza(await rpc('slr_comprar_venta', { token: B3.token, venta_id: venta.venta_id }), 'llena', 'comprar una venta con 15: rechazado');
    const objetivo = (await misCartas(B1))[1];
    await desblindar(objetivo.id);
    rechaza(await rpc('slr_pagar_clausula', { token: B3.token, carta_id: objetivo.id }), 'llena', 'pagar una cláusula con 15: rechazado');
    const of = await rpcOk('slr_ofertar', { token: B3.token, carta_id: objetivo.id, importe: 100 });
    rechaza(await rpc('slr_aceptar_oferta', { token: B1.token, oferta_id: of.oferta_id }), 'llena', 'aceptar una oferta de quien tiene 15: rechazado');
    const [m1, m2] = await misCartas(B1);
    const [z] = await misCartas(B3);
    const ix = await rpcOk('slr_proponer_intercambio', { token: B1.token, equipo_id: B3.equipo, cartas_mias: [m1.id, m2.id], cartas_suyas: [z.id] });
    rechaza(await rpc('slr_aceptar_intercambio', { token: B3.token, intercambio_id: ix.intercambio_id }), 'llena',
      'intercambio 2 por 1 hacia quien tiene 15: rechazado');
    await rpcOk('slr_retirar_venta', { token: B1.token, venta_id: venta.venta_id });
  }
  await invariantes(L, bots, 'plantilla llena');

  /* ── 9. Mercado de otra liga ───────────────────────────────────────────── */
  seccion('9. Mercado de otra liga');
  {
    const otra = await rpcOk('slr_crear_liga_prueba', { token: B3.token, nombre: `Prueba paso 3 (otra) · ${T0.toISOString().slice(0, 16)}` });
    ligas.push({ id: otra.id, token: B3.token });
    await rpcOk('slr_prueba_tareas', { token: B3.token, liga_id: otra.id, ahora: T0.toISOString() });
    const sub = (await subastasAbiertas(otra.id))[0];
    rechaza(await rpc('slr_pujar', { token: B1.token, subasta_id: sub.id, importe: 999 }), 'No tienes equipo', 'pujar en una liga ajena: rechazado');
    rechaza(await rpc('slr_comprar_sobre', { token: B1.token, liga_id: otra.id, tipo: 'basico' }), 'No tienes equipo', 'comprar un sobre en una liga ajena: rechazado');
    const libre = (await cartasLiga(otra.id)).find(c => !c.equipo_id);
    rechaza(await rpc('slr_vender_banco', { token: B1.token, carta_id: libre.id }), 'No tienes equipo', 'operar con una carta de otra liga: rechazado');
    rechaza(await rpc('slr_mercado', { token: B1.token, liga_id: otra.id }), 'No tienes equipo', 'ver el mercado de una liga ajena: rechazado');
    rechaza(await rpc('slr_prueba_tareas', { token: B1.token, liga_id: otra.id, ahora: T0.toISOString() }), 'Solo el administrador',
      'tareas de prueba en una liga que no administras: rechazado');
  }

  /* ── 10. Lecturas ──────────────────────────────────────────────────────── */
  seccion('10. Lecturas');
  {
    const c = await rpcOk('slr_carta', { token: B1.token, carta_id: B2.cartaClausulada });
    check(c.dueno?.equipo_id === B2.equipo && c.clausula === Math.round(c.valor * 1.7) && c.blindada === true,
      'slr_carta: dueño, cláusula (×1,7) y blindaje');
    check(c.historial.some(h => h.tipo === 'clausula'), `slr_carta: historial de traspasos (${c.historial.map(h => h.tipo).join(', ')})`);
    const n = await rpcOk('slr_notificaciones', { token: B1.token });
    const primera = n.notificaciones.find(x => !x.leida);
    const n2 = await rpcOk('slr_notificaciones', { token: B1.token, marcar_leidas: [primera.id] });
    check(n.no_leidas > 0 && n2.no_leidas === n.no_leidas - 1 && n2.notificaciones.find(x => x.id === primera.id).leida,
      `slr_notificaciones: lista (${n.no_leidas} sin leer) y marca como leída`);
    const m = await rpcOk('slr_mercado', { token: B1.token, liga_id: L });
    check(Array.isArray(m.subastas) && Array.isArray(m.ventas) && Array.isArray(m.ofertas_enviadas) && Array.isArray(m.intercambios),
      `slr_mercado: ${m.subastas.length} subastas, ${m.ventas.length} ventas, ${m.ofertas_enviadas.length} ofertas enviadas, ${m.intercambios.length} intercambios`);
    for (const t of ['pujas', 'ofertas', 'intercambios', 'sobres_abiertos', 'notificaciones', 'movimientos']) {
      const r = await leer(`${t}?select=*&limit=1`);
      check(!r.ok || r.datos.length === 0, `«${t}» sigue sin poder leerse directamente`);
    }
  }
  await invariantes(L, bots, 'final');
} catch (e) {
  resultado.fallos++;
  console.log(`\n  ✖ Error inesperado: ${e.message}`);
} finally {
  for (const l of ligas) {
    const b = await rpc('slr_borrar_liga', { token: l.token, liga_id: l.id });
    check(b.ok, `liga de prueba borrada (${l.id.slice(0, 8)}…)`, b.mensaje);
  }
  for (const b of bots) if (b.token) await rpc('slr_logout', { token: b.token });
  console.log(`\n${resultado.total - resultado.fallos}/${resultado.total} comprobaciones correctas` +
    `${resultado.fallos ? ` · ${resultado.fallos} FALLOS` : ''}`);
  process.exitCode = resultado.fallos ? 1 : 0;
}
