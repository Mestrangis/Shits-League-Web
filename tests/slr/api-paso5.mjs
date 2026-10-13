// Prueba de la API real de SLR: acceso de la beta y modo pruebas del admin.
//   node tests/slr/api-paso5.mjs
// Bot Uno administra una liga de prueba (modo_beta siempre activo en las de
// prueba) con 3 bots del modo pruebas; juega una temporada entera a golpe de
// slr_admin_jugar_jornada, un amistoso contra un bot y reinicia la liga.
// Al final borra la liga de prueba aunque algo falle.
import { env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado, cartasLiga } from './api-util.mjs';
import { SUPABASE_URL, SUPABASE_KEY } from '../../js/slr/config.js';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO');
const dormir = ms => new Promise(r => setTimeout(r, ms));
const U = { codigo: env.SLR_BOT_UNO_CODIGO }, D = { codigo: env.SLR_BOT_DOS_CODIGO };
let L = null;

async function amistoso(token, rival) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/slr-simular`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'amistoso', token, rival_equipo_id: rival }),
  });
  return { status: r.status, datos: await r.json() };
}

// Juega la siguiente jornada como el botón de la interfaz: repite hasta 'publicada'
async function jugarJornada() {
  for (let i = 0; i < 60; i++) {
    const r = await rpcOk('slr_admin_jugar_jornada', { token: U.token, liga_id: L });
    if (r.estado !== 'simulando') return r;
    await dormir(1500);
  }
  throw new Error('La simulación no termina');
}

const equiposLiga = async () => (await leer(`equipos?select=id,nombre,saldo,usuario_id,usuarios(nombre,es_bot,interno)&liga_id=eq.${L}&order=creado_en`)).datos;

try {
  seccion('Acceso');
  for (const b of [U, D]) {
    const l = await rpcOk('slr_login', { codigo: b.codigo });
    b.token = l.token;
    check(l.tiene_acceso === true && !!l.token, `${l.usuario.nombre}: los bots de los tests tienen acceso (slr_login devuelve tiene_acceso)`);
  }
  const yo = await rpcOk('slr_yo', { token: U.token });
  check(yo.tiene_acceso === true && yo.usuario.beta === false, 'slr_yo devuelve tiene_acceso (los bots no necesitan beta)');
  const aj = (await leer('ajustes?select=clave,valor&clave=eq.rush_publico')).datos[0];
  check(aj?.valor === false, 'ajustes.rush_publico existe y es false (beta cerrada)');
  const beta = (await leer('usuarios?select=nombre&beta=eq.true&order=nombre')).datos.map(u => u.nombre);
  check(beta.join() === 'Marcos,Nicolás', `beta = true solo para ${beta.join(' y ')}`);

  seccion('Liga de prueba y bots del modo pruebas');
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 5 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  const cfg = (await leer(`ligas?select=config&id=eq.${L}`)).datos[0].config;
  check(cfg.modo_beta === true, 'las ligas de prueba nacen en modo pruebas');
  const u = await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  U.equipo = u.equipo.id;
  await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' });
  rechaza(await rpc('slr_admin_anadir_bot', { token: D.token, liga_id: L }), 'administrador', 'añadir bot: solo el admin');
  rechaza(await rpc('slr_admin_jugar_jornada', { token: U.token, liga_id: L }), 'temporada en marcha', 'jugar jornada sin temporada: rechazado');

  const bots = [];
  for (let i = 0; i < 4; i++) bots.push(await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L }));
  let eqs = await equiposLiga();
  const internos = eqs.filter(e => e.usuarios.interno);
  check(internos.length === 4 && new Set(internos.map(e => e.nombre)).size === 4, `4 bots añadidos: ${internos.map(e => e.nombre).join(', ')}`);
  const cs = await cartasLiga(L);
  check(internos.every(e => cs.filter(c => c.equipo_id === e.id).length === 11), 'cada bot recibe su plantilla inicial de 11 cartas');
  const als = (await leer(`alineaciones?select=equipo_id,formacion,automatica&equipo_id=in.(${internos.map(e => e.id).join(',')})`)).datos;
  check(als.length === 4 && als.every(a => a.formacion === '2-2-2'), 'y su alineación 2-2-2 por defecto');
  const quitado = await rpcOk('slr_admin_quitar_bot', { token: U.token, liga_id: L });
  eqs = await equiposLiga();
  check(quitado.quitado === bots[3].nombre && eqs.filter(e => e.usuarios.interno).length === 3, `quitar bot: se va el último (${quitado.quitado})`);
  const libresTras = (await cartasLiga(L)).filter(c => c.equipo_id === bots[3].equipo_id).length;
  check(libresTras === 0, 'sus cartas quedan libres');
  const usuarioBorrado = (await leer(`usuarios?select=id&nombre=like.*${encodeURIComponent(bots[3].nombre)}*`)).datos.length;
  check(usuarioBorrado === 0, 'y su usuario interno desaparece');

  seccion('Temporada completa a golpe de botón');
  const t = await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });
  check(t.jornadas === 5, `temporada con 5 equipos (2 bots de test + 3 bots): ${t.jornadas} jornadas`);
  rechaza(await rpc('slr_admin_anadir_bot', { token: U.token, liga_id: L }), 'antes de empezar', 'con la temporada en marcha no se añaden bots');
  const bot0 = eqs.find(e => e.usuarios.interno);
  const saldo0 = Object.fromEntries((await equiposLiga()).map(e => [e.id, e.saldo]));
  let jugadas = 0, ultima;
  do {
    ultima = await jugarJornada();
    if (ultima.estado === 'publicada') jugadas++;
  } while (ultima.estado === 'publicada' && !ultima.fin_temporada && jugadas < 10);
  check(jugadas === 5 && ultima.fin_temporada, `las 5 jornadas se juegan al momento y la temporada termina sola (${jugadas})`);
  const js = (await leer(`jornadas?select=numero,estado,publicada_en&liga_id=eq.${L}&order=numero`)).datos;
  check(js.length === 5 && js.every(j => j.estado === 'publicada' && j.publicada_en), 'todas publicadas');
  const lg = (await leer(`ligas?select=estado&id=eq.${L}`)).datos[0];
  check(lg.estado === 'entre_temporadas', 'la liga queda entre temporadas');
  const fin = (await equiposLiga());
  check(fin.every(e => e.saldo >= saldo0[e.id] + 4000), 'cobros reales: cada equipo cobra al menos 4 salarios (uno descansa cada jornada)');
  const clas = (await rpcOk('slr_clasificacion', { token: U.token, liga_id: L })).clasificacion;
  check(clas.length === 5 && clas.reduce((s, f) => s + f.pj, 0) === 20, `clasificación final con 10 partidos: ${clas.map(f => `${f.posicion}. ${f.equipo} ${f.puntos}`).join(' · ')}`);
  const alBot = (await leer(`alineaciones?select=automatica,guardada_en&equipo_id=eq.${bot0.id}`)).datos[0];
  check(alBot.automatica === true && new Date(alBot.guardada_en) > new Date(js[0].publicada_en) - 60000, 'la alineación de los bots se regenera sola antes de cada cierre');
  const repetir = await rpcOk('slr_admin_jugar_jornada', { token: U.token, liga_id: L }).catch(e => ({ error: e.message }));
  check(!!repetir.error || repetir.estado === 'sin_jornadas', 'sin temporada en marcha ya no hay jornada que jugar');

  seccion('Amistoso contra un bot');
  const am = await amistoso(U.token, bot0.id);
  check(am.status === 200 && am.datos.goles?.length === 2, `amistoso Bot Uno FC – ${bot0.nombre}: ${am.datos.goles?.join('-')}`);
  const pa = (await leer(`partidos?select=tipo,goles_local&id=eq.${am.datos.partido_id}`)).datos[0];
  check(pa?.tipo === 'amistoso', 'el amistoso queda guardado y visible');

  seccion('Reiniciar beta');
  rechaza(await rpc('slr_admin_reiniciar_beta', { token: D.token, liga_id: L }), 'administrador', 'reiniciar: solo el admin');
  const r = await rpcOk('slr_admin_reiniciar_beta', { token: U.token, liga_id: L });
  const nDisenos = (await leer('disenos_carta?select=id&activo=eq.true')).datos.length;
  const tras = {
    liga: (await leer(`ligas?select=estado,temporada,config,nombre&id=eq.${L}`)).datos[0],
    equipos: (await equiposLiga()).length,
    cartas: await cartasLiga(L),
    temporadas: (await leer(`temporadas?select=id&liga_id=eq.${L}`)).datos.length,
    partidos: (await leer(`partidos?select=id&liga_id=eq.${L}`)).datos.length,
    album: (await leer(`album?select=diseno_id&liga_id=eq.${L}`)).datos.length,
    historial: (await leer(`historial?select=tipo&liga_id=eq.${L}`)).datos.map(h => h.tipo),
    internos: (await leer(`usuarios?select=id&interno=eq.true`)).datos.length,
  };
  check(tras.liga.estado === 'preparacion' && tras.liga.temporada === 1, 'la liga vuelve a preparación');
  check(tras.liga.config.modo_beta === true && tras.liga.nombre.startsWith('Prueba paso 5'), 'la liga y su configuración se conservan');
  check(tras.equipos === 0 && tras.temporadas === 0 && tras.partidos === 0 && tras.album === 0, 'sin equipos, temporadas, partidos ni álbum');
  check(tras.cartas.length === nDisenos && tras.cartas.every(c => !c.equipo_id) && r.cartas === nDisenos, `un ejemplar libre de cada diseño (${tras.cartas.length})`);
  check(tras.historial.join() === 'beta_reiniciada', 'el historial empieza de cero (solo el aviso del reinicio)');
  check(tras.internos === 0, 'los usuarios internos de los bots se borran');
  const m = await rpc('slr_movimientos', { token: U.token, equipo_id: U.equipo });
  check(!m.ok, 'los movimientos del equipo ya no existen');
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
