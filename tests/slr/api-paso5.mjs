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

async function funcionSimular(cuerpo) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/slr-simular`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  });
  return { status: r.status, datos: await r.json() };
}

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
  // Marcos puede dar acceso a más gente desde el Table Editor: solo se exige el punto de partida
  check(beta.includes('Marcos') && beta.includes('Nicolás'), `beta = true para Marcos y Nicolás (ahora: ${beta.join(', ')})`);

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
  // Con el catálogo corto no hay individuales para todos: los últimos se quedan cortos, sin error y con aviso
  check(bots.every(b => cs.filter(c => c.equipo_id === b.equipo_id).length === b.cartas && (b.cartas === 11 || /incompleta/.test(b.aviso ?? ''))),
    `cada bot recibe su plantilla inicial (${bots.map(b => b.cartas).join(' · ')}; las incompletas, con aviso)`);
  const als = (await leer(`alineaciones?select=equipo_id,formacion,automatica&equipo_id=in.(${internos.map(e => e.id).join(',')})`)).datos;
  check(als.length === 4 && als.every(a => a.formacion === '2-2-2'), 'y su alineación 2-2-2 por defecto');
  const quitado = await rpcOk('slr_admin_quitar_bot', { token: U.token, liga_id: L });
  eqs = await equiposLiga();
  check(quitado.quitado === bots[3].nombre && eqs.filter(e => e.usuarios.interno).length === 3, `quitar bot: se va el último (${quitado.quitado})`);
  const libresTras = (await cartasLiga(L)).filter(c => c.equipo_id === bots[3].equipo_id).length;
  check(libresTras === 0, 'sus cartas quedan libres');
  const usuarioBorrado = (await leer(`usuarios?select=id&nombre=like.*${encodeURIComponent(bots[3].nombre)}*`)).datos.length;
  check(usuarioBorrado === 0, 'y su usuario interno desaparece');

  seccion('Herramienta de plantillas (modo pruebas)');
  {
    rechaza(await rpc('slr_admin_buscar_cartas', { token: D.token, liga_id: L, texto: '' }), 'administrador', 'buscar cartas: solo el admin');
    const libres = await rpcOk('slr_admin_buscar_cartas', { token: U.token, liga_id: L, texto: '' });
    check(libres.length === 40 && libres.every(c => c.nombre && 'equipo_id' in c), 'buscar sin texto: las primeras 40 cartas con su dueño');
    // Una carta de Bot Dos que esté en su alineación y en venta
    D.equipo = (await equiposLiga()).find(e => e.nombre === 'Bot Dos FC').id;
    const alD = (await leer(`alineaciones?equipo_id=eq.${D.equipo}`)).datos[0];
    const cartaD = alD.huecos.def[0];
    await rpcOk('slr_poner_en_venta', { token: D.token, carta_id: cartaD, precio: 999 });
    const nombreD = (await leer(`cartas?select=disenos_carta(nombre)&id=eq.${cartaD}`)).datos[0].disenos_carta.nombre;
    const busca = await rpcOk('slr_admin_buscar_cartas', { token: U.token, liga_id: L, texto: nombreD.slice(0, 6).toLowerCase() });
    check(busca.some(c => c.id === cartaD && c.equipo === 'Bot Dos FC'), `buscar por nombre («${nombreD.slice(0, 6)}») la encuentra en Bot Dos FC`);
    const m = await rpcOk('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: cartaD, equipo_id: U.equipo });
    const c1 = (await leer(`cartas?select=equipo_id,blindada_hasta&id=eq.${cartaD}`)).datos[0];
    check(m.antes === 'Bot Dos FC' && m.ahora === 'Bot Uno FC' && c1.equipo_id === U.equipo, 'dar a otro equipo: pasa de Bot Dos FC a Bot Uno FC');
    const alD2 = (await leer(`alineaciones?equipo_id=eq.${D.equipo}`)).datos[0];
    check(alD2.huecos.def[0] === null && !alD2.banquillo.includes(cartaD), 'sale de la alineación guardada de su antiguo dueño (hueco vacío)');
    const venta = (await leer(`ventas?select=estado&carta_id=eq.${cartaD}&order=creada_en.desc&limit=1`)).datos[0];
    check(venta.estado === 'cancelada', 'su venta se cancela');
    const alb = (await leer(`album?select=via_adquisicion&usuario_id=eq.${yo.usuario.id}&liga_id=eq.${L}`)).datos;
    check(alb.some(a => a.via_adquisicion === 'admin'), 'entra en el álbum de Bot Uno con la vía «admin»');
    const hist = (await leer(`historial?select=tipo,texto&liga_id=eq.${L}&tipo=eq.admin_carta`)).datos;
    check(hist.length === 1 && /de Bot Dos FC a Bot Uno FC/.test(hist[0].texto), `y queda en el historial: «${hist[0]?.texto}»`);
    // Límite de 15: Bot Uno tiene 12; tres más llegan a 15 y la cuarta se rechaza
    const libresAhora = (await rpcOk('slr_admin_buscar_cartas', { token: U.token, liga_id: L, texto: '' })).filter(c => !c.equipo_id);
    for (const c of libresAhora.slice(0, 3)) await rpcOk('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: c.id, equipo_id: U.equipo });
    rechaza(await rpc('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: libresAhora[3].id, equipo_id: U.equipo }), '15', 'con 15 cartas no cabe otra');
    for (const c of libresAhora.slice(0, 3)) await rpcOk('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: c.id, equipo_id: null });
    const libre = await rpcOk('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: cartaD, equipo_id: null });
    const c2 = (await leer(`cartas?select=equipo_id,blindada_hasta,multiplicador_clausula&id=eq.${cartaD}`)).datos[0];
    check(libre.ahora === null && c2.equipo_id === null && c2.blindada_hasta === null && Number(c2.multiplicador_clausula) === 1.5, 'dejar libre: sin dueño, sin blindaje y cláusula ×1,5');
  }

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

  seccion('Pronóstico contra un rival elegido (sin temporada en marcha)');
  const pr = await funcionSimular({ accion: 'pronostico', token: U.token, equipo_id: U.equipo, rival_equipo_id: bot0.id });
  const suma = pr.datos.p_ganar + pr.datos.p_empate + pr.datos.p_perder;
  check(pr.status === 200 && Math.abs(suma - 1) < 1e-9 && pr.datos.rival_id === bot0.id && pr.datos.simulaciones === 200,
    `contra ${bot0.nombre}: ${Math.round(100 * pr.datos.p_ganar)} / ${Math.round(100 * pr.datos.p_empate)} / ${Math.round(100 * pr.datos.p_perder)} %`);
  const sinRival = await funcionSimular({ accion: 'pronostico', token: U.token, equipo_id: U.equipo });
  check(sinRival.datos.sin_partido === true, 'sin rival y sin próximo partido: «sin partido», como antes');
  const propio = await funcionSimular({ accion: 'pronostico', token: U.token, equipo_id: U.equipo, rival_equipo_id: U.equipo });
  check(propio.status === 400 && /rival de tu liga/.test(propio.datos.error), 'contra sí mismo: rechazado');

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
    historial: (await leer(`historial?select=tipo&liga_id=eq.${L}&order=id`)).datos.map(h => h.tipo),
    internos: (await leer(`usuarios?select=id&interno=eq.true`)).datos.length,
  };
  check(tras.liga.estado === 'preparacion' && tras.liga.temporada === 1, 'la liga vuelve a preparación');
  check(tras.liga.config.modo_beta === true && tras.liga.nombre.startsWith('Prueba paso 5'), 'la liga y su configuración se conservan');
  // Las personas (Bot Uno y Bot Dos, que no son internos) vuelven a unirse con plantilla nueva; los bots se van
  const personas = await equiposLiga();
  check(personas.map(e => e.nombre).join() === 'Bot Uno FC,Bot Dos FC' && r.equipos.every(e => e.cartas === 11) && r.bots_quitados === 3,
    `quedan las dos personas con 11 cartas cada una; los 3 bots que quedaban se van`);
  check(tras.temporadas === 0 && tras.partidos === 0 && tras.album === 22, 'sin temporadas ni partidos; álbum solo con las plantillas nuevas');
  check(tras.cartas.length === nDisenos && r.cartas === nDisenos &&
        tras.cartas.filter(c => c.equipo_id).length === 22 && tras.cartas.filter(c => c.equipo_id).every(c => personas.some(e => e.id === c.equipo_id)),
    `un ejemplar de cada diseño (${tras.cartas.length}); solo 22 con dueño`);
  check(tras.historial[0] === 'beta_reiniciada' && tras.historial.slice(1).every(t => t === 'equipo_unido') && tras.historial.length === 3,
    'el historial empieza de cero (el reinicio y las dos vueltas)');
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
