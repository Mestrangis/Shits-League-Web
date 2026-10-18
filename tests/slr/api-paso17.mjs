// Prueba de la API real de SLR: compras de sobres idempotentes.
//   node tests/slr/api-paso17.mjs
// Cada intento de compra lleva un identificador del cliente: si llega dos veces
// (o a la vez), se cobra una sola y se devuelve el mismo sobre. Lo mismo al
// elegir la carta del sobre de Elección. slr_anular_intento: si la compra ya se
// hizo devuelve el sobre; si no, la anula y la que llegue tarde no cobra.
// Liga de prueba de Bot Uno; se borra al terminar.
import { randomUUID } from 'node:crypto';
import { env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO');
const U = { codigo: env.SLR_BOT_UNO_CODIGO };
const D = { codigo: env.SLR_BOT_DOS_CODIGO };
let L = null;
const saldo = async eq => (await leer(`equipos?select=saldo&id=eq.${eq}`)).datos[0].saldo;
const cartasDe = async eq => (await leer(`cartas?select=id&equipo_id=eq.${eq}`)).datos.length;

try {
  U.token = (await rpcOk('slr_login', { codigo: U.codigo })).token;
  D.token = (await rpcOk('slr_login', { codigo: D.codigo })).token;
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 17 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  U.eq = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  D.eq = (await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' })).equipo.id;
  await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'false' });
  await rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: U.eq, importe: 50000 });
  // Hueco de sobra para varios sobres
  for (const x of (await leer(`cartas?select=id&equipo_id=eq.${U.eq}`)).datos.slice(0, 12)) await rpcOk('slr_vender_banco', { token: U.token, carta_id: x.id });

  seccion('Comprar dos veces con el mismo intento');
  const i1 = randomUUID();
  const s0 = await saldo(U.eq), c0 = await cartasDe(U.eq);
  const a = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'basico', intento: i1 });
  const b = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'basico', intento: i1 });
  const s1 = await saldo(U.eq), c1 = await cartasDe(U.eq);
  check(a.sobre_id === b.sobre_id && b.repetida === true, `el segundo devuelve el mismo sobre (${a.sobre_id.slice(0, 8)}…, repetida)`);
  check(JSON.stringify(a.cartas.map(c => c.id)) === JSON.stringify(b.cartas.map(c => c.id)), 'con las mismas cartas');
  check(s0 - s1 === a.precio, `se cobra una vez (${s0} → ${s1}, precio ${a.precio})`);
  check(c1 - c0 === a.cartas.length, `las cartas entran una vez (+${c1 - c0})`);

  seccion('A la vez (cuatro peticiones con el mismo intento)');
  const i2 = randomUUID();
  const s2 = await saldo(U.eq);
  const varias = await Promise.all(Array.from({ length: 4 }, () => rpc('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'sencillo', intento: i2 })));
  const s3 = await saldo(U.eq);
  check(varias.every(r => r.ok) && new Set(varias.map(r => r.datos.sobre_id)).size === 1, 'las cuatro devuelven el mismo sobre');
  check(s2 - s3 === varias[0].datos.precio, `se cobra una vez (${s2} → ${s3})`);
  check(varias.filter(r => r.datos.repetida).length === 3, 'tres marcadas como repetidas');

  seccion('Intentos distintos sí son compras distintas; sin intento, como antes');
  const c = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'sencillo', intento: randomUUID() });
  check(c.sobre_id !== varias[0].datos.sobre_id && !c.repetida, 'otro intento: otro sobre');
  const s4 = await saldo(U.eq);
  await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'sencillo' });
  await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'sencillo' });
  check(s4 - await saldo(U.eq) === 2 * c.precio, 'sin intento se cobran las dos (compatibilidad)');

  seccion('Otro jugador no puede usar tu intento');
  await rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: D.eq, importe: 5000 });
  rechaza(await rpc('slr_comprar_sobre', { token: D.token, liga_id: L, tipo: 'basico', intento: i1 }), 'no es tuyo', 'Bot Dos con el intento de Bot Uno: rechazado');
  rechaza(await rpc('slr_anular_intento', { token: D.token, liga_id: L, intento: i1 }), 'no es tuyo', 'ni anularlo');

  seccion('Anular un intento (el cliente se cansó de esperar)');
  const an = await rpcOk('slr_anular_intento', { token: U.token, liga_id: L, intento: i1 });
  check(an.comprado && an.respuesta.sobre_id === a.sobre_id, 'si ya se compró: devuelve el sobre comprado');
  const i3 = randomUUID();
  const s5 = await saldo(U.eq);
  const an2 = await rpcOk('slr_anular_intento', { token: U.token, liga_id: L, intento: i3 });
  check(an2.anulada === true, 'si no se compró: queda anulada');
  rechaza(await rpc('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'basico', intento: i3 }), 'no se te ha cobrado nada', 'la compra que llega tarde se rechaza');
  check(await saldo(U.eq) === s5, 'y no se cobra');
  check((await rpcOk('slr_anular_intento', { token: U.token, liga_id: L, intento: i3 })).anulada, 'anular otra vez: sigue anulada');

  seccion('Elección: elegir dos veces con el mismo intento');
  const e = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'eleccion', intento: randomUUID() });
  check(e.pendiente_eleccion && e.cartas.length === 3, 'sobre de elección con 3 candidatas');
  const ie = randomUUID(), cE = await cartasDe(U.eq);
  const [e1, e2] = await Promise.all([
    rpc('slr_elegir_carta_sobre', { token: U.token, sobre_id: e.sobre_id, carta_id: e.cartas[1].id, intento: ie }),
    rpc('slr_elegir_carta_sobre', { token: U.token, sobre_id: e.sobre_id, carta_id: e.cartas[1].id, intento: ie })]);
  check(e1.ok && e2.ok && e1.datos.carta.id === e.cartas[1].id && e2.datos.carta.id === e1.datos.carta.id, 'a la vez: las dos devuelven la misma carta');
  check(!!e1.datos.repetida !== !!e2.datos.repetida, 'una de las dos marcada como repetida');
  const e3 = await rpcOk('slr_elegir_carta_sobre', { token: U.token, sobre_id: e.sobre_id, carta_id: e.cartas[1].id, intento: ie });
  check(e3.carta.id === e.cartas[1].id && e3.repetida, 'después, el mismo intento: el mismo resultado');
  check(await cartasDe(U.eq) - cE === 1, 'entra una sola carta');
  rechaza(await rpc('slr_elegir_carta_sobre', { token: U.token, sobre_id: e.sobre_id, carta_id: e.cartas[0].id, intento: randomUUID() }),
    'ya está resuelto', 'otro intento con el sobre ya resuelto: rechazado');
  rechaza(await rpc('slr_elegir_carta_sobre', { token: U.token, sobre_id: e.sobre_id, carta_id: e.cartas[0].id, intento: i1 }),
    'no es de este sobre', 'un intento de compra no vale para elegir');
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
