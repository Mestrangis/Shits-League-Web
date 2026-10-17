// Prueba de la API real de SLR (paso 4): temporadas, jornadas y partidos.
//   node tests/slr/api-paso4.mjs
// Tres bots en una liga de prueba (impar: cada jornada descansa uno). El tiempo
// se simula con slr_prueba_tareas; la simulación la hace la Edge Function real.
// Al final borra las ligas de prueba aunque algo falle.
import {
  env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado,
  cartasLiga, invariantes, bomboInicial,
} from './api-util.mjs';
import { SUPABASE_URL, SUPABASE_KEY } from '../../js/slr/config.js';
import { motorDe, MOTOR_ACTUAL } from '../../js/slr/motores.js';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO', 'SLR_BOT_TRES_CODIGO', 'SLR_CRON_SECRETO');

const bots = [
  { nombre: 'Bot Uno', codigo: env.SLR_BOT_UNO_CODIGO },
  { nombre: 'Bot Dos', codigo: env.SLR_BOT_DOS_CODIGO },
  { nombre: 'Bot Tres', codigo: env.SLR_BOT_TRES_CODIGO },
];
const [B1, B2, B3] = bots;
const ligas = [];
let L;
const DIA = 86400000;

/* ── Utilidades ──────────────────────────────────────────────────────────── */
const tareas = (ahora, simular = true) => rpcOk('slr_prueba_tareas', { token: B1.token, liga_id: L, ahora, simular });
const calendario = async () => (await rpcOk('slr_calendario', { token: B1.token, liga_id: L })).jornadas;
const botDe = equipo => bots.find(b => b.equipo === equipo);
const movimientos = async b => rpcOk('slr_movimientos', { token: b.token, equipo_id: b.equipo });
const saldoDe = async b => (await leer(`equipos?select=saldo&id=eq.${b.equipo}`)).datos[0].saldo;
const misCartas = async b => (await cartasLiga(L)).filter(c => c.equipo_id === b.equipo);
const notifs = async b => (await rpcOk('slr_notificaciones', { token: b.token })).notificaciones;

async function funcion(cuerpo, secreto) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/slr-simular`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(secreto ? { 'x-slr-secreto': secreto } : {}) },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, datos: await r.json() };
}

async function esperarEstado(jornadaId, estado, maxMs = 120000) {
  const inicio = Date.now();
  while (Date.now() - inicio < maxMs) {
    const j = (await leer(`jornadas?select=estado&id=eq.${jornadaId}`)).datos[0];
    if (j?.estado === estado) return true;
    await new Promise(r => setTimeout(r, 3000));
  }
  return false;
}

// Fecha y hora en Madrid
function madrid(instante) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    weekday: 'short', hourCycle: 'h23',
  }).formatToParts(new Date(instante)).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, dia: p.weekday };
}
function instanteMadrid(fecha, hora) {
  const [y, m, d] = fecha.split('-').map(Number), [h, mi] = hora.split(':').map(Number);
  for (const off of [1, 2]) {
    const t = Date.UTC(y, m - 1, d, h - off, mi);
    if (madrid(t).hora === hora && madrid(t).fecha === fecha) return t;
  }
  throw new Error('sin instante');
}
// Primer domingo cuyo cierre (20:00 Madrid) quede al menos 24 h por delante
function domingoEsperado(ahora) {
  for (let k = 0; k <= 14; k++) {
    const f = madrid(ahora + k * DIA).fecha;
    const t = instanteMadrid(f, '20:00');
    if (madrid(t).dia === 'Sun' && t >= ahora + DIA) return f;
  }
}
const masDias = (fecha, n) => madrid(instanteMadrid(fecha, '12:00') + n * DIA).fecha;

const ids = al => [al.por.id, ...al.def.map(c => c.id), ...al.med.map(c => c.id), ...al.del.map(c => c.id)];

/* ── Prueba ──────────────────────────────────────────────────────────────── */
try {
  seccion('Preparación: tres bots, plantillas iniciales baratas y equilibradas');
  for (const b of bots) {
    const l = await rpcOk('slr_login', { codigo: b.codigo });
    b.token = l.token; b.usuario = l.usuario.id;
  }
  const liga = await rpcOk('slr_crear_liga_prueba', { token: B1.token, nombre: `Prueba paso 4 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id; ligas.push({ id: L, token: B1.token });
  const bombo = await bomboInicial();
  for (const b of bots) {
    const u = await rpcOk('slr_unirse_liga', { token: b.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: `${b.nombre} FC` });
    b.equipo = u.equipo.id; b.union = u;
  }
  const cs0 = await cartasLiga(L);
  // Con el catálogo corto el bombo no llega para los tres: el reparto tira de las caras
  // más baratas y el equilibrio de valor ya no se puede exigir
  const alcanza = bombo.bombo >= bombo.porEquipo * bots.length;
  if (!alcanza) check(true, `bombo corto (${bombo.bombo} individuales para ${bots.length} equipos): se completan con caras`);
  for (const b of bots) {
    const mias = cs0.filter(c => c.equipo_id === b.equipo);
    const total = mias.reduce((s, c) => s + c.disenos_carta.valor, 0);
    if (alcanza) {
      check(mias.length === 11 && mias.every(c => !bombo.caras.has(c.diseno_id)), `${b.nombre}: 11 cartas, ninguna del 20 % más caro`);
      check(Math.abs(total - bombo.objetivo) <= 0.1 * bombo.objetivo,
        `${b.nombre}: valor ${total} dentro de ±10 % del objetivo común ${bombo.objetivo.toFixed(0)}`);
    } else check(mias.length === 11, `${b.nombre}: 11 cartas (${mias.filter(c => bombo.caras.has(c.diseno_id)).length} caras), valor ${total}`);
  }
  if (!alcanza) check(cs0.filter(c => bots.some(b => b.equipo === c.equipo_id) && bombo.caras.has(c.diseno_id)).length === bombo.porEquipo * bots.length - bombo.bombo,
    'solo las caras imprescindibles');
  await invariantes(L, bots, 'inicio');

  /* ── Nadie se une con una temporada en marcha ──────────────────────────── */
  seccion('Altas con la temporada en marcha');
  {
    const l2 = await rpcOk('slr_crear_liga_prueba', { token: B1.token, nombre: `Prueba paso 4 (altas) · ${Date.now()}` });
    ligas.push({ id: l2.id, token: B1.token });
    await rpcOk('slr_unirse_liga', { token: B1.token, codigo_invitacion: l2.codigo_invitacion, nombre_equipo: 'Altas Uno' });
    await rpcOk('slr_unirse_liga', { token: B2.token, codigo_invitacion: l2.codigo_invitacion, nombre_equipo: 'Altas Dos' });
    await rpcOk('slr_iniciar_temporada', { token: B1.token, liga_id: l2.id });
    rechaza(await rpc('slr_unirse_liga', { token: B3.token, codigo_invitacion: l2.codigo_invitacion, nombre_equipo: 'Altas Tres' }),
      'temporada en marcha', 'unirse con la temporada en marcha: rechazado');
    await rpcOk('slr_pausar', { token: B1.token, liga_id: l2.id });
    rechaza(await rpc('slr_unirse_liga', { token: B3.token, codigo_invitacion: l2.codigo_invitacion, nombre_equipo: 'Altas Tres' }),
      'temporada en marcha', 'unirse con la temporada en pausa: rechazado');
  }

  /* ── 1. Calendario ─────────────────────────────────────────────────────── */
  seccion('1. Iniciar temporada y calendario');
  let J;
  {
    rechaza(await rpc('slr_iniciar_temporada', { token: B2.token, liga_id: L }), 'administrador', 'iniciar: solo el admin');
    const ahora = Date.now();
    const t = await rpcOk('slr_iniciar_temporada', { token: B1.token, liga_id: L });
    check(t.numero === 1 && t.jornadas === 3, 'temporada 1 con 3 jornadas (3 equipos: cada jornada descansa uno)');
    rechaza(await rpc('slr_iniciar_temporada', { token: B1.token, liga_id: L }), 'ya está en marcha', 'iniciar otra vez: rechazado');
    J = await calendario();
    const parejas = J.map(j => j.partidos.map(p => [p.local.equipo_id, p.visitante.equipo_id].sort().join('|'))).flat();
    check(J.every(j => j.partidos.length === 1 && j.descansa) && new Set(parejas).size === 3, 'cada jornada: 1 partido y 1 descanso; ningún rival repetido');
    check(new Set(J.map(j => j.descansa.equipo_id)).size === 3, 'cada equipo descansa exactamente una vez');
    const esperado = domingoEsperado(ahora);
    check(J[0].fecha === esperado && madrid(J[0].cierre_en).dia === 'Sun' && madrid(J[0].cierre_en).hora === '20:00'
      && madrid(J[0].publicacion_en).hora === '21:00' && new Date(J[0].cierre_en) - ahora >= DIA,
      `jornada 1: domingo ${J[0].fecha} a las 20:00 (Madrid), al menos 24 h por delante; publicación 21:00`);
    check(J[1].fecha === masDias(J[0].fecha, 7) && J[2].fecha === masDias(J[0].fecha, 14) &&
      J.every(j => madrid(j.cierre_en).hora === '20:00'), 'las siguientes, semana a semana a las 20:00');
    const yo = (await leer(`ligas?select=estado,temporada&id=eq.${L}`)).datos[0];
    check(yo.estado === 'en_curso' && yo.temporada === 1, 'la liga pasa a en_curso');
  }

  /* ── 2. Ciclo de la jornada 1 ──────────────────────────────────────────── */
  seccion('2. Jornada 1: cierre → simulación → publicación');
  const j1 = J[0];
  const P1 = j1.partidos[0];
  const A = botDe(P1.local.equipo_id), Bv = botDe(P1.visitante.equipo_id), R = botDe(j1.descansa.equipo_id);
  {
    // Amistoso y pronóstico antes de la jornada
    const pr = await funcion({ accion: 'pronostico', token: A.token, equipo_id: A.equipo });
    check(pr.status === 200 && pr.datos.jornada === 1 && Math.abs(pr.datos.p_ganar + pr.datos.p_empate + pr.datos.p_perder - 1) < 1e-9,
      `pronóstico de ${A.nombre} contra su próximo rival: ${Math.round(100 * pr.datos.p_ganar)} / ${Math.round(100 * pr.datos.p_empate)} / ${Math.round(100 * pr.datos.p_perder)} %`);
    const s2 = await saldoDe(Bv);
    const am = await funcion({ accion: 'amistoso', token: Bv.token, rival_equipo_id: R.equipo });
    // La crónica de un amistoso lleva las tácticas guardadas de quien lo juega: solo él la ve
    const pa = am.status === 200 ? await rpcOk('slr_partido', { token: Bv.token, partido_id: am.datos.partido_id }) : null;
    if (am.status === 200) rechaza(await rpc('slr_partido', { token: R.token, partido_id: am.datos.partido_id }), 'solo la ve quien lo jugó', 'el rival no abre la crónica del amistoso');
    const repro = pa && motorDe(pa.version_motor).simularPartido(pa.alineaciones_congeladas.local, pa.alineaciones_congeladas.visitante, pa.semilla);
    check(pa && pa.tipo === 'amistoso' && pa.version_motor === MOTOR_ACTUAL.VERSION && repro.goles.join() === pa.goles.join(),
      `amistoso ${Bv.nombre}–${R.nombre} ${pa?.goles.join('-')} (motor ${pa?.version_motor}): se reproduce igual con el motor`);
    check(await saldoDe(Bv) === s2, 'el amistoso no mueve dinero');
    check((await leer(`partidos?select=id&id=eq.${pa?.id}`)).datos.length === 1, 'el amistoso es visible');

    // Alineaciones: A guarda (y luego vende un titular), B confirma, R no hace nada
    const alA = (await leer(`alineaciones?equipo_id=eq.${A.equipo}`)).datos[0];
    await rpcOk('slr_guardar_alineacion', { token: A.token, equipo_id: A.equipo, formacion: alA.formacion, huecos: alA.huecos,
      banquillo: alA.banquillo, orden_manual: false, capitan_id: alA.capitan_id });
    await rpcOk('slr_confirmar_alineacion', { token: Bv.token, equipo_id: Bv.equipo });
    const vendida = alA.huecos.def[0];
    await rpcOk('slr_vender_banco', { token: A.token, carta_id: vendida });
    const csA = await cartasLiga(L);
    const banco = alA.banquillo.map(id => csA.find(c => c.id === id)).filter(c => c.equipo_id === A.equipo);
    const mejorDef = Math.max(...banco.map(c => c.disenos_carta.def));
    A.vendida = vendida;

    // Una venta entre usuarios ahora, para tener una carta en dos álbumes (temporada 2)
    const [comp] = await misCartas(R);
    const v = await rpcOk('slr_poner_en_venta', { token: R.token, carta_id: comp.id, precio: 50 });
    await rpcOk('slr_comprar_venta', { token: A.token, venta_id: v.venta_id });
    R.compartida = comp.diseno_id;

    // Antes del cierre el partido no se ve
    check((await leer(`partidos?select=id&id=eq.${P1.id}`)).datos.length === 0, 'antes del cierre el partido no es visible');
    rechaza(await rpc('slr_partido', { token: A.token, partido_id: P1.id }), 'no se ha publicado', 'slr_partido antes de publicar: rechazado');

    // Cierre (sin simular todavía)
    const saldos0 = Object.fromEntries(await Promise.all(bots.map(async b => [b.equipo, await saldoDe(b)])));
    const movs0 = Object.fromEntries(await Promise.all(bots.map(async b => [b.equipo, (await movimientos(b)).length])));
    const t1 = await tareas(j1.cierre_en, false);
    check(t1.cerradas === 1, 'cierre: la jornada pasa a cerrada');
    rechaza(await rpc('slr_vender_banco', { token: Bv.token, carta_id: (await misCartas(Bv))[0].id }), 'cerrado', 'mercado cerrado en la ventana de cierre');
    rechaza(await rpc('slr_confirmar_alineacion', { token: Bv.token, equipo_id: Bv.equipo }), 'cerradas', 'alineaciones cerradas en la ventana de cierre');
    const congelado = (await rpcOk('slr_prueba_partidos', { token: B1.token, liga_id: L })).find(p => p.partido_id === P1.id);
    const alCong = congelado.alineaciones_congeladas.local;
    check(!ids(alCong).includes(vendida) && !alCong.banquillo.some(c => c.id === vendida), 'la carta vendida no está en la alineación congelada');
    const sustituta = alCong.def[0];
    check(banco.some(c => c.id === sustituta.id) && sustituta.DEF === mejorDef,
      `su hueco DEF lo ocupa el mejor suplente para ese hueco (DEF ${mejorDef})`);

    // Simulación por la Edge Function
    await tareas(j1.cierre_en, true);
    check(await esperarEstado(j1.id, 'simulada'), 'la Edge Function simula la jornada (pg_net → slr-simular)');
    check((await leer(`partidos?select=id&id=eq.${P1.id}`)).datos.length === 0, 'simulada pero sin publicar: el partido sigue sin verse');
    check(bots.every(b => saldos0[b.equipo] !== undefined) && (await Promise.all(bots.map(saldoDe))).every((s, i) => s === saldos0[bots[i].equipo]),
      'los cobros todavía no se han pagado (se pagan al publicar)');
    const otra = await funcion({ accion: 'jornada', jornada_id: j1.id }, env.SLR_CRON_SECRETO);
    check(otra.status === 200 && otra.datos.ya_simulada === true, 'idempotencia: invocar otra vez la función no vuelve a simular');
    check((await funcion({ accion: 'jornada', jornada_id: j1.id })).status === 401, 'la función rechaza llamadas sin el secreto');

    // Publicación
    const t2 = await tareas(j1.publicacion_en);
    check(t2.publicadas === 1, 'publicación');
    const p = await rpcOk('slr_partido', { token: R.token, partido_id: P1.id });
    check(p.version_motor === MOTOR_ACTUAL.VERSION && p.semilla >= 0 && p.semilla < 2 ** 32, `publicado con motor ${p.version_motor} y semilla ${p.semilla}`);
    const real = motorDe(p.version_motor).simularPartido(p.alineaciones_congeladas.local, p.alineaciones_congeladas.visitante, p.semilla);
    check(real.goles.join() === p.goles.join(), `el partido reproducido con el motor da lo mismo: ${p.goles.join('-')}`);
    const pron = motorDe(p.version_motor).simularPronostico(p.alineaciones_congeladas.local, p.alineaciones_congeladas.visitante, p.semilla, 200);
    check(pron.pA === p.p_local && pron.pB === p.p_visitante, `el pronóstico de 200 simulaciones coincide (${p.p_local} / ${p.p_visitante})`);
    check((await leer(`partidos?select=id&id=eq.${P1.id}`)).datos.length === 1, 'ya es visible');

    // Cobros: salario a los tres, participación a A y B, sorpresa y ojo clínico
    const esperado = Object.fromEntries(bots.map(b => [b.equipo, { salario: 1000 }]));
    esperado[A.equipo].bonus_participacion = 100;
    esperado[Bv.equipo].bonus_participacion = 100;
    const [gl, gv] = p.goles;
    if (gl > gv) esperado[A.equipo].bonus_sorpresa = Math.round(600 * (1 - p.p_local));
    else if (gv > gl) esperado[Bv.equipo].bonus_sorpresa = Math.round(600 * (1 - p.p_visitante));
    else if (p.p_local < p.p_visitante) esperado[A.equipo].bonus_sorpresa = Math.round(300 * (p.p_visitante - p.p_local));
    else if (p.p_visitante < p.p_local) esperado[Bv.equipo].bonus_sorpresa = Math.round(300 * (p.p_local - p.p_visitante));
    for (const [lado, eq] of [['local', A.equipo], ['visitante', Bv.equipo]]) {
      const bonos = ids(p.alineaciones_congeladas[lado])
        .filter(id => !id.startsWith('canterano-') && !(p.lesiones ?? []).includes(id))
        .map(id => ({ r: (p.pr[id] ?? 0) / (p.pr_esperado[id] ?? 0) }))
        .filter(x => isFinite(x.r) && x.r > 1.25)
        .map(x => Math.min(300, Math.round(100 * (x.r - 1))))
        .sort((a, b) => b - a).slice(0, 3);
      if (bonos.length) esperado[eq].bonus_ojo_clinico = bonos.reduce((s, x) => s + x, 0);
    }
    for (const b of bots) {
      const nuevos = (await movimientos(b)).slice(movs0[b.equipo]);
      const porTipo = {};
      for (const m of nuevos) porTipo[m.tipo] = (porTipo[m.tipo] ?? 0) + m.importe;
      const exp = esperado[b.equipo];
      check(JSON.stringify(Object.keys(porTipo).sort()) === JSON.stringify(Object.keys(exp).sort())
        && Object.keys(exp).every(k => porTipo[k] === exp[k]),
        `${b.nombre}${b === R ? ' (descansa)' : ''}: cobra ${Object.entries(porTipo).map(([k, v]) => `${k} ${v}`).join(', ')}`,
        `esperado ${JSON.stringify(exp)}`);
      check(await saldoDe(b) === saldos0[b.equipo] + Object.values(porTipo).reduce((s, x) => s + x, 0), `${b.nombre}: el saldo sube lo cobrado`);
    }
    const clas = (await rpcOk('slr_clasificacion', { token: R.token, liga_id: L })).clasificacion;
    const ptsA = gl > gv ? 3 : gl === gv ? 1 : 0, ptsB = gv > gl ? 3 : gl === gv ? 1 : 0;
    const fila = eq => clas.find(f => f.equipo_id === eq);
    check(fila(A.equipo).puntos === ptsA && fila(Bv.equipo).puntos === ptsB && fila(R.equipo).pj === 0 && clas[0].posicion === 1,
      `clasificación: ${clas.map(f => `${f.posicion}. ${f.equipo} ${f.puntos}`).join(' · ')}`);
    check((await Promise.all(bots.map(notifs))).every(n => n.some(x => x.tipo === 'jornada_publicada')), 'los tres reciben el aviso del resultado y lo cobrado');

    // Idempotencia de las tareas
    const movs1 = await Promise.all(bots.map(async b => (await movimientos(b)).length));
    const t3 = await tareas(j1.publicacion_en);
    const movs2 = await Promise.all(bots.map(async b => (await movimientos(b)).length));
    check(t3.cerradas === 0 && t3.publicadas === 0 && movs1.join() === movs2.join(), 'idempotencia: repetir las tareas no paga ni publica otra vez');
  }
  await invariantes(L, bots, 'jornada 1');

  /* ── 3. Jornada 2 con lesión forzada ───────────────────────────────────── */
  seccion('3. Lesión en la jornada 2 → carta tocada en la siguiente que juegue su equipo');
  const [j2, j3] = [J[1], J[2]];
  let lesion;
  {
    // El equipo de la jornada 2 que también juega la 3
    const P2 = j2.partidos[0];
    const enJ3 = [j3.partidos[0].local.equipo_id, j3.partidos[0].visitante.equipo_id];
    const Z = [P2.local.equipo_id, P2.visitante.equipo_id].find(e => enJ3.includes(e));
    const ladoZ = Z === P2.local.equipo_id ? 'A' : 'B';
    await tareas(j2.cierre_en, false);
    const cong = (await rpcOk('slr_prueba_partidos', { token: B1.token, liga_id: L })).find(p => p.partido_id === P2.id);
    const { local, visitante } = cong.alineaciones_congeladas;
    let semilla = null;
    for (let s = 1; s < 500000 && semilla === null; s++) {
      const ev = motorDe().simularPartido(local, visitante, s).eventos.find(e => e.tipo === 'lesion' && e.equipo === ladoZ && !e.carta.startsWith('canterano-'));
      if (ev) { semilla = s; lesion = { carta: ev.carta, equipo: Z }; }
    }
    check(semilla !== null, `semilla ${semilla} con lesión de ${lesion?.carta.slice(0, 8)}… (${botDe(Z)?.nombre})`);
    await rpcOk('slr_prueba_fijar_semilla', { token: B1.token, partido_id: P2.id, semilla });
    await tareas(j2.cierre_en, true);
    check(await esperarEstado(j2.id, 'simulada'), 'jornada 2 simulada');
    await tareas(j2.publicacion_en);
    const p2 = await rpcOk('slr_partido', { token: B1.token, partido_id: P2.id });
    check(p2.semilla === semilla && p2.lesiones.includes(lesion.carta), 'el partido guarda la lesión');
    const carta = (await cartasLiga(L)).find(c => c.id === lesion.carta);
    lesion.base = carta.disenos_carta;
    const tocada = (await leer(`cartas?select=tocada_en_jornada&id=eq.${lesion.carta}`)).datos[0].tocada_en_jornada;
    check(tocada === j3.id, 'la carta queda tocada para la jornada 3 (la siguiente que juega su equipo)');
    const n = await notifs(botDe(Z));
    check(n.some(x => x.tipo === 'jornada_publicada' && x.datos.lesiones?.some(l => l.carta_id === lesion.carta)), 'su dueño recibe el aviso de la lesión');
  }
  await invariantes(L, bots, 'jornada 2');

  /* ── 4. Pausa y reanudación ────────────────────────────────────────────── */
  seccion('4. Pausa y reanudación');
  {
    // Una subasta abierta, una oferta pendiente y una carta recién blindada
    await tareas(new Date(new Date(j2.publicacion_en).getTime() + DIA).toISOString());
    check((await leer(`subastas?select=id&liga_id=eq.${L}&estado=eq.abierta`)).datos.length > 0, 'hay subastas abiertas antes de pausar');
    const objetivoOferta = (await misCartas(B3))[0];
    const of = await rpcOk('slr_ofertar', { token: B2.token, carta_id: objetivoOferta.id, importe: 77 });
    const cad0 = new Date(of.caduca_en).getTime();
    const sb = await rpcOk('slr_comprar_sobre', { token: B2.token, liga_id: L, tipo: 'basico' });
    const blind0 = new Date((await leer(`cartas?select=blindada_hasta&id=eq.${sb.cartas[0].id}`)).datos[0].blindada_hasta).getTime();

    rechaza(await rpc('slr_pausar', { token: B2.token, liga_id: L }), 'administrador', 'pausar: solo el admin');
    const pausa = new Date(Date.now() + 3600000);
    const reanudar = new Date(pausa.getTime() + 10 * DIA);
    await rpcOk('slr_prueba_pausar', { token: B1.token, liga_id: L, ahora: pausa.toISOString() });
    check((await leer(`ligas?select=estado&id=eq.${L}`)).datos[0].estado === 'pausada', 'la liga queda en pausa');
    check((await leer(`subastas?select=id&liga_id=eq.${L}&estado=eq.abierta`)).datos.length === 0, 'las subastas abiertas se cancelan');
    rechaza(await rpc('slr_vender_banco', { token: B2.token, carta_id: sb.cartas[0].id }), 'cerrado', 'mercado cerrado durante la pausa');
    const tp = await tareas(new Date(new Date(j3.cierre_en).getTime() + DIA).toISOString());
    check(tp.cerradas === 0 && tp.tandas_abiertas === 0, 'calendario congelado: en pausa no se cierra ninguna jornada ni se abren subastas');

    await rpcOk('slr_prueba_reanudar', { token: B1.token, liga_id: L, ahora: reanudar.toISOString() });
    const blind1 = new Date((await leer(`cartas?select=blindada_hasta&id=eq.${sb.cartas[0].id}`)).datos[0].blindada_hasta).getTime();
    check(blind1 - blind0 === 10 * DIA, 'el blindaje vigente se alarga los 10 días de pausa');
    const m = await rpcOk('slr_mercado', { token: B2.token, liga_id: L });
    const cad1 = new Date(m.ofertas_enviadas.find(o => o.id === of.oferta_id).caduca_en).getTime();
    check(cad1 - cad0 === 10 * DIA, 'la caducidad de la oferta pendiente también');
    const j3b = (await calendario())[2];
    const esperado = domingoEsperado(reanudar.getTime());
    check(j3b.fecha === esperado && madrid(j3b.cierre_en).hora === '20:00',
      `la jornada 3 pasa al primer domingo con 24 h por delante tras reanudar (${j3.fecha} → ${j3b.fecha})`);
    const n = await notifs(B3);
    check(n.some(x => x.tipo === 'liga_pausada') && n.some(x => x.tipo === 'liga_reanudada'), 'pausar y reanudar se notifican a todos');
    const madridHoy = madrid(reanudar.getTime()).fecha;
    const tanda = (await leer(`tandas_mercado?liga_id=eq.${L}&fecha=eq.${madridHoy}`)).datos[0];
    // Hoy cuenta como día servido: hay tanda de hoy (el cron no abrirá otra) y ninguna subasta abierta.
    // (Según el día en que se ejecute, la tanda de hoy puede venir ya de antes de la pausa.)
    const abiertasTras = (await leer(`subastas?select=id&liga_id=eq.${L}&estado=eq.abierta`)).datos.length;
    check(tanda && abiertasTras === 0, 'las subastas no se reabren hasta la siguiente medianoche', `tanda ${JSON.stringify(tanda)}, ${abiertasTras} abiertas`);
    await rpcOk('slr_retirar_oferta', { token: B2.token, oferta_id: of.oferta_id });
  }
  await invariantes(L, bots, 'pausa');

  /* ── 5. Aplazar ────────────────────────────────────────────────────────── */
  seccion('5. Aplazar la próxima jornada');
  let j3c;
  {
    const antes = (await calendario())[2];
    rechaza(await rpc('slr_aplazar_jornada', { token: B2.token, liga_id: L }), 'administrador', 'aplazar: solo el admin');
    const a = await rpcOk('slr_aplazar_jornada', { token: B1.token, liga_id: L });
    j3c = (await calendario())[2];
    check(a.jornada === 3 && j3c.fecha === masDias(antes.fecha, 7) && madrid(j3c.cierre_en).hora === '20:00',
      `la jornada 3 se mueve una semana (${antes.fecha} → ${j3c.fecha})`);
  }

  /* ── 6. Jornada 3: carta tocada, fin automático de la temporada ────────── */
  seccion('6. Jornada 3: carta tocada al 85 % y fin de temporada');
  {
    await tareas(j3c.cierre_en, false);
    rechaza(await rpc('slr_terminar_temporada', { token: B1.token, liga_id: L }), 'jornada en juego', 'terminar con una jornada en juego: rechazado');
    const cong = (await rpcOk('slr_prueba_partidos', { token: B1.token, liga_id: L }))[0];
    const al = cong.local_id === lesion.equipo ? cong.alineaciones_congeladas.local : cong.alineaciones_congeladas.visitante;
    const c = [al.por, ...al.def, ...al.med, ...al.del, ...al.banquillo].find(x => x.id === lesion.carta);
    const b = lesion.base;
    check(c && c.tocada && c.ATA === Math.round(b.ata * 0.85) && c.DEF === Math.round(b.def * 0.85) && c.CON === Math.round(b.con * 0.85),
      `la carta lesionada juega la jornada 3 al 85 %: ${b.ata}/${b.def}/${b.con} → ${c?.ATA}/${c?.DEF}/${c?.CON}`);
    await tareas(j3c.cierre_en, true);
    check(await esperarEstado(j3c.id, 'simulada'), 'jornada 3 simulada');
    await tareas(j3c.publicacion_en);
    const t = (await leer(`temporadas?liga_id=eq.${L}&numero=eq.1`)).datos[0];
    const lg = (await leer(`ligas?select=estado&id=eq.${L}`)).datos[0];
    check(t.estado === 'terminada' && t.terminada_antes === false && t.clasificacion_final.length === 3 && lg.estado === 'entre_temporadas',
      `al publicar la última jornada la temporada termina sola (campeón: ${t.clasificacion_final[0].equipo})`);
    check(t.clasificacion_final.reduce((s, f) => s + f.pj, 0) === 6, 'clasificación final con los 3 partidos (2 por equipo)');
    rechaza(await rpc('slr_comprar_sobre', { token: B3.token, liga_id: L, tipo: 'basico' }), 'cerrado', 'entre temporadas el mercado está cerrado');
    const pr = await funcion({ accion: 'pronostico', token: A.token, equipo_id: A.equipo });
    check(pr.datos.sin_partido === true, 'sin temporada en marcha, el pronóstico dice que no hay partido');
  }
  await invariantes(L, bots, 'fin temporada 1');

  /* ── 7. Temporada 2: reparto desde el álbum ────────────────────────────── */
  seccion('7. Temporada 2: reparto desde el álbum');
  {
    const albumAntes = {};
    const albumInd = {};
    const disenos = Object.fromEntries((await leer('disenos_carta?select=id,tipo,valor&activo=eq.true&limit=5000')).datos.map(d => [d.id, d]));
    for (const b of bots) {
      const a = (await leer(`album?select=diseno_id&usuario_id=eq.${b.usuario}&liga_id=eq.${L}`)).datos.map(x => x.diseno_id);
      albumAntes[b.equipo] = a.length;
      albumInd[b.equipo] = new Set(a.filter(d => disenos[d]?.tipo === 'individual'));
    }
    check([...bots].filter(b => albumInd[b.equipo].has(R.compartida)).length === 2, 'hay una individual en dos álbumes (compartida)');

    const t2 = await rpcOk('slr_iniciar_temporada', { token: B1.token, liga_id: L });
    check(t2.numero === 2 && t2.jornadas === 3, 'temporada 2 con calendario nuevo de 3 jornadas');
    const cs = await cartasLiga(L);
    const tieneOtro = (b, d) => bots.some(o => o !== b && albumInd[o.equipo].has(d));
    for (const b of bots) {
      const mias = cs.filter(c => c.equipo_id === b.equipo);
      const total = mias.reduce((s, c) => s + c.disenos_carta.valor, 0);
      const exclusivasBombo = [...albumInd[b.equipo]].filter(d => !tieneOtro(b, d) && !bombo.caras.has(d)).length;
      const compartidas = mias.filter(c => tieneOtro(b, c.diseno_id)).length;
      const caras = mias.filter(c => bombo.caras.has(c.diseno_id)).length;
      // Con el catálogo corto las compartidas no llegan para todos: quien se queda por debajo de 11
      // es porque no queda libre ninguna individual de su álbum
      const libresSuyas = cs.filter(c => !c.equipo_id && c.disenos_carta.tipo === 'individual' && albumInd[b.equipo].has(c.diseno_id)).length;
      check((mias.length === 11 || (!alcanza && mias.length < 11 && libresSuyas === 0)) &&
            mias.every(c => c.disenos_carta.tipo === 'individual' && albumInd[b.equipo].has(c.diseno_id)),
        `${b.nombre}: ${mias.length} individuales, todas de su álbum${mias.length < 11 ? ' (no queda libre ninguna más de su álbum)' : ''}`);
      check(compartidas === 0 || exclusivasBombo < 11, `${b.nombre}: prioridad a las exclusivas (${exclusivasBombo} exclusivas del bombo, ${compartidas} compartidas)`);
      check(caras === 0 || exclusivasBombo + compartidas < 11, `${b.nombre}: ${caras} caras (solo si no queda otra)`);
      if (alcanza) check(Math.abs(total - bombo.objetivo) <= 0.1 * bombo.objetivo, `${b.nombre}: valor ${total} dentro de ±10 % del objetivo ${bombo.objetivo.toFixed(0)}`);
      check(await saldoDe(b) === 5000 && (await movimientos(b)).some(m => m.tipo === 'reinicio_temporada'),
        `${b.nombre}: saldo reiniciado a 5.000 con un movimiento «reinicio_temporada»`);
      const a = (await leer(`album?select=diseno_id&usuario_id=eq.${b.usuario}&liga_id=eq.${L}`)).datos.length;
      check(a === albumAntes[b.equipo], `${b.nombre}: el álbum no cambia (${a} entradas)`);
      const al = (await leer(`alineaciones?equipo_id=eq.${b.equipo}`)).datos[0];
      check(al?.formacion === '2-2-2' && al.automatica === true, `${b.nombre}: alineación 2-2-2 por defecto`);
    }
    const repartidas = cs.filter(c => c.equipo_id).length;
    check((repartidas === 33 || (!alcanza && repartidas < 33)) && cs.every(c => !c.equipo_id || bots.some(b => b.equipo === c.equipo_id)),
      `sin duplicados: ${repartidas} cartas repartidas y el resto libres`);
    check(cs.every(c => !c.equipo_id || new Date(c.blindada_hasta) > new Date(Date.now() + 6.9 * DIA)), 'todas blindadas 7 días');
    check((await leer(`subastas?select=id&liga_id=eq.${L}&estado=eq.abierta`)).datos.length === 0, 'sin subastas abiertas al empezar');
    const clas = (await rpcOk('slr_clasificacion', { token: B1.token, liga_id: L })).clasificacion;
    check(clas.length === 3 && clas.every(f => f.pj === 0 && f.puntos === 0), 'clasificación de la temporada 2 a cero');
    const t1final = (await rpcOk('slr_clasificacion', { token: B1.token, liga_id: L, temporada: 1 })).clasificacion;
    check(t1final.reduce((s, f) => s + f.pj, 0) === 6, 'la clasificación final de la temporada 1 sigue guardada');
  }
  await invariantes(L, bots, 'temporada 2');

  /* ── 8. Terminar la temporada antes de tiempo ──────────────────────────── */
  seccion('8. Terminar la temporada antes de tiempo');
  {
    rechaza(await rpc('slr_terminar_temporada', { token: B2.token, liga_id: L }), 'administrador', 'terminar: solo el admin');
    const r = await rpcOk('slr_terminar_temporada', { token: B1.token, liga_id: L });
    const js = (await leer(`jornadas?select=estado&temporada_id=eq.${r.temporada_id}`)).datos;
    check(r.terminada_antes === true && js.length === 3 && js.every(j => j.estado === 'cancelada'), 'las 3 jornadas pendientes se cancelan');
    check(r.clasificacion.every(f => f.pj === 0), 'la clasificación final solo cuenta lo publicado (nada)');
    check((await leer(`ligas?select=estado&id=eq.${L}`)).datos[0].estado === 'entre_temporadas', 'la liga queda entre temporadas, esperando a slr_iniciar_temporada');
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
