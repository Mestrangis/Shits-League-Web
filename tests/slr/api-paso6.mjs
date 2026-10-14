// Prueba de la API real de SLR (paso 6, motor v1.2.0 y siguientes): notificaciones con destino y la
// herramienta de plantillas.
//   node tests/slr/api-paso6.mjs               (crea una liga de prueba y la borra al final)
//   node tests/slr/api-paso6.mjs --conservar   (no la borra: para mirarla en la web)
//   node tests/slr/api-paso6.mjs --borrar ID   (borra una liga de prueba conservada)
// · El catálogo beta tiene los poderes de la versión actual (tests/slr/catalogo-beta.mjs).
// · Bot Uno administra una liga de prueba con Bot Dos y 2 bots del modo pruebas;
//   juega 2 jornadas: se simulan con el motor actual y se reproducen igual aquí.
// · Avisos: destino guardado (carta, partido, movimientos, liga) y los
//   amistosos ya no avisan.
// · Los partidos antiguos (v1.1.0) se siguen reproduciendo con su motor.
import { env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado, cartasLiga } from './api-util.mjs';
import { SUPABASE_URL, SUPABASE_KEY } from '../../js/slr/config.js';
import { motorDe, MOTOR_ACTUAL } from '../../js/slr/motores.js';
import { PROBABILIDADES } from '../../js/slr/generador.js';

const ACTUAL = MOTOR_ACTUAL.VERSION;
import { calcularValor } from '../../js/slr/valor.js';
import { catalogoBeta } from './catalogo-beta.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO');
const dormir = ms => new Promise(r => setTimeout(r, ms));
const U = { codigo: env.SLR_BOT_UNO_CODIGO }, D = { codigo: env.SLR_BOT_DOS_CODIGO };
const CONSERVAR = process.argv.includes('--conservar');
const BORRAR = process.argv.includes('--borrar') ? process.argv[process.argv.indexOf('--borrar') + 1] : null;
let L = null;

async function funcion(cuerpo) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/slr-simular`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  });
  return { status: r.status, datos: await r.json() };
}

async function jugarJornada() {
  for (let i = 0; i < 60; i++) {
    const r = await rpcOk('slr_admin_jugar_jornada', { token: U.token, liga_id: L });
    if (r.estado !== 'simulando') return r;
    await dormir(1500);
  }
  throw new Error('La simulación no termina');
}

const avisos = async b => (await rpcOk('slr_notificaciones', { token: b.token })).notificaciones.filter(n => n.liga_id === L);

for (const b of [U, D]) b.token = (await rpcOk('slr_login', { codigo: b.codigo })).token;

if (BORRAR) {
  const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: BORRAR });
  console.log(b.ok ? `Liga ${BORRAR} borrada` : `No se pudo borrar: ${b.mensaje}`);
  process.exit(b.ok ? 0 : 1);
}

try {
  seccion(`Catálogo beta con los poderes de la v${ACTUAL}`);
  {
    const bd = (await leer('disenos_carta?select=id,ata,def,con,poderes,valor&beta=eq.true&limit=5000')).datos;
    const porId = new Map(bd.map(d => [d.id, d]));
    const esperado = catalogoBeta().filter(c => porId.has(c.id));
    const clave = ps => JSON.stringify(ps.map(p => [p.nombre, p.momento, p.probabilidad, p.probabilidades, p.efecto, p.nivel]));
    const conPoder = esperado.filter(c => c.poderes.length);
    const iguales = conPoder.filter(c => clave(porId.get(c.id).poderes) === clave(c.poderes));
    check(conPoder.length > 40 && iguales.length === conPoder.length,
      `poderes de las ${conPoder.length} cartas beta con poder iguales al cálculo de catalogo-beta.mjs (${iguales.length})`,
      conPoder.filter(c => !iguales.includes(c)).map(c => c.nombre).slice(0, 5).join(', '));
    const todos = bd.flatMap(d => d.poderes);
    const sorteados = todos.filter(p => p.probabilidad !== 'siempre');
    check(sorteados.every(p => p.probabilidad === undefined && p.probabilidades?.join() === PROBABILIDADES[p.nivel].join()),
      `probabilidades [p1, p2, p3] del generador (${PROBABILIDADES.simple.join(' / ')})`);
    check(sorteados.filter(p => p.momento !== 'tirador').every(p => p.efecto === { simple: 0.2, fuerte: 0.3, 'muy fuerte': 0.4 }[p.nivel]),
      'efectos: simple +0,20, fuerte +0,30, muy fuerte +0,40');
    check(todos.filter(p => p.probabilidad === 'siempre').every(p => p.momento === 'tirador' && p.efecto === 2), 'los "siempre" de tirador no cambian (×2)');
    check(bd.every(d => d.valor === calcularValor({ ATA: d.ata, DEF: d.def, CON: d.con, poderes: d.poderes })), 'el valor sigue cuadrando con valor.js');
  }

  seccion('Partidos antiguos: se reproducen con el motor con el que se jugaron');
  {
    // Columnas de lectura pública (slr_partido exige ser de la liga)
    const ps = (await leer('partidos?select=id,semilla,goles_local,goles_visitante,version_motor,alineaciones_congeladas' +
      '&version_motor=eq.1.1.0&order=simulado_en.desc&limit=30')).datos;
    let bien = 0, distintos = 0;
    for (const d of ps) {
      const goles = `${d.goles_local},${d.goles_visitante}`, al = d.alineaciones_congeladas;
      const r = motorDe(d.version_motor).simularPartido(al.local, al.visitante, d.semilla);
      if (r.version === '1.1.0' && r.goles.join() === goles) bien++;
      if (motorDe('1.2.0').simularPartido(al.local, al.visitante, d.semilla).goles.join() !== goles) distintos++;
    }
    check(ps.length > 0 && bien === ps.length, `${bien}/${ps.length} partidos de la v1.1.0 dan el mismo resultado con motor-v1.1.0.js`);
    check(distintos > 0, `(con la v1.2.0, ${distintos} de ellos darían otro resultado: por eso cada partido guarda su versión)`);
  }

  seccion('Liga de prueba');
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 6 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  U.equipo = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  D.equipo = (await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion,
    nombre_equipo: 'CD Pueblanueva de los Infantes' })).equipo.id;
  for (let i = 0; i < 2; i++) await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L });
  check(true, `liga ${L.slice(0, 8)}… con Bot Uno FC, un equipo de nombre largo y 2 bots`);

  seccion('Herramienta de plantillas: todas las cartas');
  let cartaD;
  {
    rechaza(await rpc('slr_admin_cartas', { token: D.token, liga_id: L }), 'administrador', 'slr_admin_cartas: solo el admin');
    const r = await rpcOk('slr_admin_cartas', { token: U.token, liga_id: L });
    const cs = await cartasLiga(L);
    check(r.cartas.length === cs.length && r.cartas.length > 200, `devuelve las ${r.cartas.length} cartas de la liga (antes solo 40)`);
    check(r.cartas.every((c, i) => i === 0 || r.cartas[i - 1].valor >= c.valor), 'ordenadas por valor, de mayor a menor');
    check(r.cartas.every(c => c.nombre && c.tipo && c.acabado && 'equipo_id' in c && Number.isInteger(c.valor)), 'cada una con nombre, tipo, acabado, valor y dueño');
    const eqD = r.equipos.find(e => e.id === D.equipo);
    check(r.maximo === 15 && r.equipos.length === 4 && eqD?.usuario === 'Bot Dos' && eqD.cartas === cs.filter(c => c.equipo_id === D.equipo).length,
      `equipos con nombre entero, dueño y cartas: «${eqD?.nombre}» de ${eqD?.usuario}, ${eqD?.cartas}/${r.maximo}`);
    check(r.equipos.filter(e => e.bot).length === 2, 'los bots del modo pruebas vienen marcados');
    // Una libre para Bot Dos: aviso con destino a la carta
    cartaD = r.cartas.find(c => !c.equipo_id).id;
    await rpcOk('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: cartaD, equipo_id: D.equipo });
    const n = (await avisos(D)).find(x => x.tipo === 'admin_carta');
    check(n?.destino_tipo === 'carta' && n.destino_id === cartaD, 'carta recibida → aviso con destino «carta» y su id');
  }

  seccion('Avisos de dinero: venta completada → movimientos');
  {
    const v = await rpcOk('slr_poner_en_venta', { token: D.token, carta_id: cartaD, precio: 100 });
    await rpcOk('slr_comprar_venta', { token: U.token, venta_id: v.venta_id });
    const n = (await avisos(D)).find(x => x.tipo === 'venta_completada');
    check(n?.destino_tipo === 'movimientos' && n.destino_id === D.equipo, 'venta completada → destino «movimientos» del equipo que cobra');
  }

  seccion(`Temporada: 2 jornadas con el motor v${ACTUAL}`);
  await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });
  const ini = (await avisos(U)).find(x => x.tipo === 'temporada_iniciada');
  check(ini?.destino_tipo === 'liga' && ini.destino_id === L, 'temporada iniciada → destino «liga»');
  for (let k = 1; k <= 2; k++) {
    const j = await jugarJornada();
    check(j.estado === 'publicada', `jornada ${j.jornada} publicada`);
    const ps = (await leer(`partidos?select=id,jornada_id,local_id,visitante_id&liga_id=eq.${L}&tipo=eq.liga&goles_local=not.is.null`)).datos;
    const deEsta = [];
    for (const p of ps) {
      const d = await rpcOk('slr_partido', { token: U.token, partido_id: p.id });
      if (d.jornada !== j.jornada) continue;
      deEsta.push(p);
      const m = motorDe(d.version_motor);
      const real = m.simularPartido(d.alineaciones_congeladas.local, d.alineaciones_congeladas.visitante, d.semilla);
      const pron = m.simularPronostico(d.alineaciones_congeladas.local, d.alineaciones_congeladas.visitante, d.semilla, 200);
      check(d.version_motor === ACTUAL && real.goles.join() === d.goles.join() && pron.pA === d.p_local,
        `J${j.jornada}: ${d.goles.join('-')} con el motor ${d.version_motor}, reproducido igual (y su pronóstico)`);
    }
    const n = (await avisos(U)).find(x => x.tipo === 'jornada_publicada' && x.datos.numero === j.jornada);
    const mio = deEsta.find(p => [p.local_id, p.visitante_id].includes(U.equipo));
    check(n && (mio ? n.destino_tipo === 'partido' && n.destino_id === mio.id : ['movimientos', 'liga'].includes(n.destino_tipo)),
      `aviso de la jornada ${j.jornada} → ${mio ? 'crónica de su partido' : `descansa: ${n?.destino_tipo}`}`);
  }

  seccion('Pausa y reanudación');
  await rpcOk('slr_pausar', { token: U.token, liga_id: L });
  await rpcOk('slr_reanudar', { token: U.token, liga_id: L });
  const pausa = (await avisos(D)).filter(x => ['liga_pausada', 'liga_reanudada'].includes(x.tipo));
  check(pausa.length === 2 && pausa.every(x => x.destino_tipo === 'liga' && x.destino_id === L), 'pausa y reanudación → destino «liga»');

  seccion('Amistosos sin aviso');
  {
    const antes = (await avisos(D)).length;
    const am = await funcion({ accion: 'amistoso', token: U.token, rival_equipo_id: D.equipo });
    const d = am.status === 200 ? await rpcOk('slr_partido', { token: U.token, partido_id: am.datos.partido_id }) : null;
    const r = d && motorDe(d.version_motor).simularPartido(d.alineaciones_congeladas.local, d.alineaciones_congeladas.visitante, d.semilla);
    check(d?.version_motor === ACTUAL && r.goles.join() === d.goles.join(), `amistoso ${d?.goles.join('-')} con el motor ${d?.version_motor}, reproducido igual`);
    const despues = await avisos(D);
    check(despues.length === antes && !despues.some(x => x.tipo === 'amistoso'), 'el rival del amistoso no recibe ningún aviso');
  }
  const sinDestino = (await avisos(D)).filter(x => !x.destino_tipo).map(x => x.tipo);
  check(sinDestino.every(t => t.startsWith('intercambio')), `todos los avisos de la prueba tienen destino${sinDestino.length ? ` salvo: ${sinDestino.join(', ')}` : ''}`);
} catch (e) {
  resultado.fallos++;
  console.log(`\n  ✖ Error inesperado: ${e.message}`);
} finally {
  if (L && !CONSERVAR) {
    const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
    check(b.ok, 'liga de prueba borrada', b.mensaje);
  }
  if (L && CONSERVAR) console.log(`\nLiga conservada: ${L}  (bórrala con node tests/slr/api-paso6.mjs --borrar ${L})`);
  if (!CONSERVAR) for (const b of [U, D]) if (b.token) await rpc('slr_logout', { token: b.token });
  console.log(`\n${resultado.total - resultado.fallos}/${resultado.total} comprobaciones correctas` +
    `${resultado.fallos ? ` · ${resultado.fallos} FALLOS` : ''}`);
  process.exitCode = resultado.fallos ? 1 : 0;
}
