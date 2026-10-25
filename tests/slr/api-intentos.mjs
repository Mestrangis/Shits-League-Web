// Prueba de la API real (repaso de rendimiento, fase 4): slr_con_intento.
//   node tests/slr/api-intentos.mjs
// Con una liga de prueba (Bot Uno y Bot Dos) que se borra al terminar:
// · el mismo intento dos veces (un reintento con mala conexión): se hace UNA vez y la
//   segunda devuelve lo mismo, sin cobrar ni mover cartas otra vez;
// · si la acción falla, no queda nada guardado: el mismo intento se puede volver a probar;
// · un intento ajeno, una función que no está en la lista o sin intento: rechazados.
import { env, rpc, rpcOk, leer } from './api-util.mjs';
import { randomUUID } from 'node:crypto';

let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const U = { token: (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token };
const D = { token: (await rpcOk('slr_login', { codigo: env.SLR_BOT_DOS_CODIGO })).token };
const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: 'Prueba intentos (api)' });
const L = liga.id;
const con = (q, intento, funcion, args) => rpc('slr_con_intento', { token: q.token, intento, funcion, args });
const saldo = async eq => (await leer(`equipos?select=saldo&id=eq.${eq}`)).datos[0].saldo;
try {
  U.equipo = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  D.equipo = (await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' })).equipo.id;
  await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });
  for (const e of [U, D]) await rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: e.equipo, importe: 30000 });
  await rpcOk('slr_prueba_tareas', { token: U.token, liga_id: L, ahora: new Date().toISOString(), simular: false });   // la tanda de subastas de hoy
  const deD = (await leer(`cartas?select=id,disenos_carta(valor)&equipo_id=eq.${D.equipo}`)).datos;
  const carta = deD[0], precio = carta.disenos_carta.valor + 50;

  console.log('\nPoner en venta, dos veces el mismo intento');
  const i1 = randomUUID();
  const v1 = await con(D, i1, 'slr_poner_en_venta', { carta_id: carta.id, precio });
  const v2 = await con(D, i1, 'slr_poner_en_venta', { carta_id: carta.id, precio });
  const ventas = (await leer(`ventas?select=id&carta_id=eq.${carta.id}&estado=eq.activa`)).datos;
  check(v1.ok && v2.ok && igual(v1.datos, v2.datos), 'la segunda vez devuelve lo mismo (sin «esa carta ya está en venta»)', `${v1.mensaje} | ${v2.mensaje}`);
  check(ventas.length === 1, `una sola venta (${ventas.length})`);
  // Sin intento, la de siempre se queja de que ya está en venta
  const sin = await rpc('slr_poner_en_venta', { token: D.token, carta_id: carta.id, precio });
  check(!sin.ok && /ya está en venta/i.test(sin.mensaje), `la función de siempre, con otro intento, sí se queja («${sin.mensaje}»)`);

  console.log('\nComprar, dos veces el mismo intento');
  const antesU = await saldo(U.equipo), antesD = await saldo(D.equipo);
  const i2 = randomUUID();
  const c1 = await con(U, i2, 'slr_comprar_venta', { venta_id: ventas[0].id });
  const c2 = await con(U, i2, 'slr_comprar_venta', { venta_id: ventas[0].id });
  const despuesU = await saldo(U.equipo), despuesD = await saldo(D.equipo);
  const dueno = (await leer(`cartas?select=equipo_id&id=eq.${carta.id}`)).datos[0].equipo_id;
  check(c1.ok && c2.ok && igual(c1.datos, c2.datos), 'la segunda vez devuelve lo mismo', `${c1.mensaje} | ${c2.mensaje}`);
  check(antesU - despuesU === precio && dueno === U.equipo, `se cobra UNA vez (${antesU} → ${despuesU}, precio ${precio}) y la carta es de Bot Uno`);
  check(despuesD > antesD, `el vendedor cobra una vez (${antesD} → ${despuesD})`);
  const otraVez = await con(U, randomUUID(), 'slr_comprar_venta', { venta_id: ventas[0].id });
  check(!otraVez.ok, `con otro intento, la venta ya no está («${otraVez.mensaje}»)`);
  const ajeno = await con(D, i2, 'slr_comprar_venta', { venta_id: ventas[0].id });
  check(!ajeno.ok && /no es tuyo/.test(ajeno.mensaje), `el intento de otro: rechazado («${ajeno.mensaje}»)`);

  console.log('\nSi falla, no se guarda: el mismo intento se puede volver a probar');
  const sub = (await rpcOk('slr_mercado', { token: U.token, liga_id: L })).subastas[0];
  if (sub) {
    const i3 = randomUUID();
    const baja = await con(U, i3, 'slr_pujar', { subasta_id: sub.id, importe: 1 });
    const buena = await con(U, i3, 'slr_pujar', { subasta_id: sub.id, importe: sub.puja_minima });
    check(!baja.ok && buena.ok, `una puja demasiado baja falla («${baja.mensaje}») y con el mismo intento, bien pujada, entra`);
    const i4 = randomUUID();
    const r1 = await con(U, i4, 'slr_retirar_puja', { subasta_id: sub.id });
    const r2 = await con(U, i4, 'slr_retirar_puja', { subasta_id: sub.id });
    check(r1.ok && r2.ok && r1.datos === true && r2.datos === true, 'retirar la puja dos veces con el mismo intento: true las dos (la segunda no falla)');
  } else check(false, 'hay una subasta en la tanda de hoy');

  console.log('\nRechazos');
  const rara = await con(U, randomUUID(), 'slr_admin_reiniciar_beta', { liga_id: L });
  check(!rara.ok && /no se puede hacer así/.test(rara.mensaje), `una función que no está en la lista («${rara.mensaje}»)`);
  const sinIntento = await rpc('slr_con_intento', { token: U.token, intento: null, funcion: 'slr_pujar', args: {} });
  check(!sinIntento.ok && /Falta el identificador/.test(sinIntento.mensaje), 'sin intento');
  const sinSesion = await rpc('slr_con_intento', { token: 'no-vale', intento: randomUUID(), funcion: 'slr_pujar', args: {} });
  check(!sinSesion.ok, 'sin sesión válida');
} catch (e) {
  mal++;
  console.log(`\n  ✖ Error inesperado: ${e.stack ?? e.message}`);
} finally {
  const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
  check(b.ok, 'liga de prueba borrada', b.mensaje);
  for (const q of [U, D]) await rpc('slr_logout', { token: q.token });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
  process.exitCode = mal ? 1 : 0;
}
