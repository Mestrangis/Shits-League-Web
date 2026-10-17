// Tests del motor v1.3.0: poderes repartidos (1, 2 o 3 activaciones programadas
// al empezar, tope de 2 por jugada, pendientes), test dorado (semilla 12345) y
// propiedades generales. Los de las versiones anteriores siguen en sus archivos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  simularPartido, simularPronostico, VERSION, CONFIG, probabilidadesPoder, activacionesEsperadas, mulberry32,
} from '../../js/slr/motor-v1.3.0.js';
import { MOTORES, MOTOR_ACTUAL, motorDe } from '../../js/slr/motores.js';
import { marcosFC, losDelFondo } from './cartas-prueba.mjs';
import { PROBABILIDADES } from '../../js/slr/generador.js';

const dorado = JSON.parse(readFileSync(new URL('./dorado-v1.3.0-semilla-12345.json', import.meta.url), 'utf8'));
const comoJSON = x => JSON.parse(JSON.stringify(x));
const cerca = (real, esperado, tol, que) =>
  assert.ok(Math.abs(real - esperado) <= tol, `${que}: ${real} no está a ±${tol} de ${esperado}`);

const carta = (id, v = 70, poderes = []) => ({ id, nombre: id, ATA: v, DEF: v, CON: v, poderes });
function neutro(p, v = 70) {
  return { formacion: '2-2-2', por: carta(p + 'por', v), def: [carta(p + 'd1', v), carta(p + 'd2', v)],
    med: [carta(p + 'm1', v), carta(p + 'm2', v)], del: [carta(p + 'a1', v), carta(p + 'a2', v)],
    banquillo: [], orden_manual: false, capitan_id: null };
}
const poder = (nombre, momento, probabilidades, efecto = 0.2) => ({ nombre, momento, nivel: 'simple', efecto, probabilidades });
// Generador que devuelve primero los valores dados y después siempre `resto`; cuenta los números pedidos
function secuencia(valores, resto = 0.5) {
  let i = 0;
  const g = () => { g.n++; return i < valores.length ? valores[i++] : resto; };
  g.n = 0;
  return g;
}
const programados = r => r.eventos.filter(e => e.tipo === 'poder' && e.programada != null);

/* ── Versión ─────────────────────────────────────────────────────────────── */
test('versión 1.3.0 (la actual ya es la 2.0.0); 1.1.0 y 1.2.0 siguen disponibles', () => {
  assert.equal(VERSION, '1.3.0');
  assert.equal(MOTOR_ACTUAL.VERSION, '2.0.0');
  assert.deepEqual(Object.keys(MOTORES).sort(), ['1.1.0', '1.2.0', '1.3.0', '2.0.0']);
  assert.equal(motorDe('1.3.0').VERSION, '1.3.0');
  assert.equal(motorDe('1.2.0').VERSION, '1.2.0');
  assert.equal(CONFIG.MAX_ACTIVACIONES, 3);
  assert.equal(CONFIG.MAX_PODERES_JUGADA, 2);
  assert.equal(CONFIG.TOPE_PROB_CAPITAN, 0.95);
  assert.equal(CONFIG.EXPONENTE_DUELO, 3);
  assert.equal(CONFIG.BONUS_SAQUE, 1.15);
  assert.ok(!('PODER_UNA_VEZ' in CONFIG));
});

/* ── a) Probabilidades ───────────────────────────────────────────────────── */
test('probabilidades [p1, p2, p3], compatibilidad [p, p/2,5, p/6] y capitán ×1,5 con tope 0,95', () => {
  assert.deepEqual(probabilidadesPoder({ probabilidades: [0.4, 0.18, 0.07] }), [0.4, 0.18, 0.07]);
  const compat = probabilidadesPoder({ probabilidad: 0.3 });
  cerca(compat[0], 0.3, 1e-12, 'p1'); cerca(compat[1], 0.12, 1e-12, 'p2'); cerca(compat[2], 0.05, 1e-12, 'p3');
  const cap = probabilidadesPoder({ probabilidades: [0.8, 0.4, 0.1] }, true);
  cerca(cap[0], 0.95, 1e-12, 'p1 capitán (tope)'); cerca(cap[1], 0.6, 1e-12, 'p2 capitán'); cerca(cap[2], 0.15, 1e-12, 'p3 capitán');
  // Se fuerza p1 ≥ p2 ≥ p3 y faltan = 0
  assert.deepEqual(probabilidadesPoder({ probabilidades: [0.2, 0.5] }), [0.2, 0.2, 0]);
  cerca(activacionesEsperadas({ probabilidades: PROBABILIDADES.simple }), 0.65, 1e-12, 'esperanza por defecto');
});

test('fórmula de activaciones: r < p3 → 3, < p2 → 2, < p1 → 1, si no 0 (un número por poder)', () => {
  const probs = [0.6, 0.3, 0.1];
  for (const [r, n] of [[0.05, 3], [0.2, 2], [0.5, 1], [0.7, 0]]) {
    const A = neutro('A:');
    A.med[0].poderes = [poder('Batuta', 'posesion', probs)];
    // El primer número decide la cantidad; los siguientes, las jugadas (0,5 → la del medio de las libres)
    const rng = secuencia([r], 0.5);
    const res = simularPartido(A, neutro('B:'), 1, { rng });
    assert.equal(programados(res).length, n, `r = ${r}`);
  }
});

/* ── b) Reparto por jugadas ──────────────────────────────────────────────── */
test('cada activación va a una jugada distinta de 1 a 10 y nunca se aplica antes de su jugada', () => {
  let vistos = 0;
  for (let s = 1; s <= 1500; s++) {
    const A = neutro('A:');
    A.med[0].poderes = [poder('Batuta', 'posesion', [1, 1, 1])];   // 3 activaciones seguras, posesión siempre ocurre
    const r = simularPartido(A, neutro('B:'), s);
    const ev = programados(r);
    assert.equal(ev.length, 3, `semilla ${s}`);
    const jugadas = ev.map(e => e.programada);
    assert.equal(new Set(jugadas).size, 3, 'jugadas repetidas');
    for (const e of ev) {
      assert.ok(e.programada >= 1 && e.programada <= 10);
      assert.equal(e.jugada, e.programada, 'la posesión ocurre siempre: se aplica en su jugada');
    }
    vistos += 3;
  }
  assert.ok(vistos > 0);
});

test('el reparto de jugadas es uniforme (cada jugada ~10 %)', () => {
  const cuenta = new Array(11).fill(0);
  for (let s = 1; s <= 3000; s++) {
    const A = neutro('A:');
    A.med[0].poderes = [poder('Batuta', 'posesion', [1, 0, 0])];
    for (const e of programados(simularPartido(A, neutro('B:'), s))) cuenta[e.programada]++;
  }
  for (let j = 1; j <= 10; j++) cerca(cuenta[j] / 3000, 0.1, 0.02, `jugada ${j}`);
});

/* ── c) Pendientes ───────────────────────────────────────────────────────── */
test('si su momento no ocurre en su jugada, queda pendiente para la siguiente ocasión', () => {
  let atrasadas = 0, total = 0;
  for (let s = 1; s <= 1500; s++) {
    const A = neutro('A:');
    A.del[0].poderes = [poder('Cañonero', 'chut', [1, 1, 0])];
    const r = simularPartido(A, neutro('B:'), s);
    for (const e of programados(r)) {
      total++;
      assert.ok(e.jugada >= e.programada, 'nunca antes de su jugada');
      const chut = r.eventos.find(x => x.tipo === 'chut' && x.jugada === e.jugada);
      assert.ok(chut && chut.tirador === 'A:a1', `semilla ${s}: se aplica cuando chuta esa carta`);
      if (e.jugada > e.programada) atrasadas++;
    }
    assert.ok(programados(r).length <= 2, 'lo pendiente al final se pierde');
  }
  assert.ok(atrasadas > 0 && total > 0, `debería haber activaciones atrasadas (${atrasadas} de ${total})`);
});

test('poder de parada: solo cuando ese portero recibe un chut', () => {
  for (let s = 1; s <= 800; s++) {
    const B = neutro('B:');
    B.por.poderes = [poder('Paradón', 'parada', [1, 1, 1])];
    const r = simularPartido(neutro('A:'), B, s);
    for (const e of programados(r)) {
      const chut = r.eventos.find(x => x.tipo === 'chut' && x.jugada === e.jugada);
      assert.ok(chut && chut.portero === 'B:por' && chut.equipo === 'A');
    }
  }
});

test('un poder con varias pendientes se aplica una vez por momento', () => {
  for (let s = 1; s <= 800; s++) {
    const A = neutro('A:');
    A.del[0].poderes = [poder('Cañonero', 'chut', [1, 1, 1])];
    const r = simularPartido(A, neutro('B:'), s);
    const porJugada = new Map();
    for (const e of programados(r)) porJugada.set(e.jugada, (porJugada.get(e.jugada) ?? 0) + 1);
    for (const n of porJugada.values()) assert.equal(n, 1);
  }
});

/* ── d) Tope por jugada ──────────────────────────────────────────────────── */
test('tope de 2 activaciones por jugada entre los dos equipos; el resto espera', () => {
  // 5 poderes de posesión seguros (×3) en cada equipo = 30 programadas; caben 20
  const conPoderes = p => {
    const e = neutro(p);
    e.med[0].poderes = ['P1', 'P2', 'P3'].map(n => poder(n, 'posesion', [1, 1, 1], 0));
    e.med[1].poderes = ['P4', 'P5'].map(n => poder(n, 'posesion', [1, 1, 1], 0));
    return e;
  };
  // Con el generador a 0,5 todo queda determinado: cada poder sale 3 veces y
  // sus jugadas son 6, 5 y 7 (la del medio de las libres cada vez). Llegan 30
  // activaciones a las jugadas 5-7: caben 2 por jugada de la 5 a la 10 (12), y
  // por el orden fijo se las lleva todas el equipo A; el resto se pierde.
  const r0 = simularPartido(conPoderes('A:'), conPoderes('B:'), 1, { rng: secuencia([], 0.5) });
  const ev0 = programados(r0);
  assert.equal(ev0.length, 12);
  assert.ok(ev0.every(e => e.equipo === 'A'));
  for (let j = 1; j <= 10; j++) assert.equal(ev0.filter(e => e.jugada === j).length, j >= 5 ? 2 : 0, `jugada ${j}`);
  assert.ok(ev0.filter(e => e.jugada > e.programada).length > 0, 'con el tope, algunas se atrasan');
  // Con semillas normales: nunca más de 2 por jugada ni más de 20 por partido
  for (let s = 1; s <= 200; s++) {
    const ev = programados(simularPartido(conPoderes('A:'), conPoderes('B:'), s));
    assert.ok(ev.length <= 20 && ev.length >= 15, `semilla ${s}: ${ev.length}`);
    for (let j = 1; j <= 10; j++) assert.ok(ev.filter(e => e.jugada === j).length <= 2, `jugada ${j}`);
  }
  for (let s = 1; s <= 2000; s++) {
    const r = simularPartido(marcosFC(), losDelFondo(), s);
    for (let j = 1; j <= 10; j++) assert.ok(programados(r).filter(e => e.jugada === j).length <= 2);
  }
});

test('los "siempre" (tirador) se aplican en cada ocasión, sin programa ni tope', () => {
  const A = neutro('A:');
  A.del[0].poderes = [{ nombre: 'Chupón', momento: 'tirador', probabilidad: 'siempre', efecto: 2, nivel: 'simple' }];
  const r = simularPartido(A, neutro('B:'), 3);
  const ev = r.eventos.filter(e => e.tipo === 'poder');
  assert.equal(ev.length, r.estadisticas.ocasiones[0]);
  assert.ok(ev.every(e => e.programada === undefined));
});

/* ── e) PRNG ─────────────────────────────────────────────────────────────── */
test('los poderes solo consumen números al programarse (1 + uno por activación)', () => {
  const sin = secuencia([], 0.5);
  simularPartido(neutro('A:'), neutro('B:'), 1, { rng: sin });
  const A = neutro('A:');
  A.med[0].poderes = [poder('Batuta', 'posesion', [1, 1, 1], 0)];
  const con = secuencia([], 0.5);
  simularPartido(A, neutro('B:'), 1, { rng: con });
  assert.equal(con.n - sin.n, 1 + 3);
  const B = neutro('A:');
  B.med[0].poderes = [poder('Nunca', 'posesion', [0.3, 0.1, 0.05])];
  const nunca = secuencia([], 0.5);
  simularPartido(B, neutro('B:'), 1, { rng: nunca });
  assert.equal(nunca.n - sin.n, 1, 'sin activaciones: solo el número de la cantidad');
});

test('el capitán multiplica las probabilidades (×1,5, tope 0,95)', () => {
  const A = neutro('A:');
  A.med[0].poderes = [poder('Batuta', 'posesion', [0.4, 0.18, 0.07])];
  // r = 0,5: sin capitán 0,5 ≥ 0,4 → 0; capitán 0,5 < 0,6 → 1
  assert.equal(programados(simularPartido(A, neutro('B:'), 1, { rng: secuencia([0.5]) })).length, 0);
  assert.equal(programados(simularPartido({ ...A, capitan_id: 'A:m1' }, neutro('B:'), 1, { rng: secuencia([0.5]) })).length, 1);
});

test('un suplente que entra pierde lo programado para jugadas ya jugadas', () => {
  let visto = 0;
  for (let s = 1; s <= 60000 && visto < 3; s++) {
    const A = marcosFC();
    A.banquillo = A.banquillo.map(c => ({ ...c, poderes: [poder('Refresco', 'posesion', [1, 1, 1], 0)] }));
    const r = simularPartido(A, losDelFondo(), s);
    const les = r.eventos.find(e => e.tipo === 'lesion' && e.equipo === 'A' && e.suplente);
    if (!les) continue;
    visto++;
    for (const e of programados(r).filter(x => x.carta === les.suplente)) {
      assert.ok(e.programada > les.jugada && e.jugada > les.jugada, `semilla ${s}`);
    }
    // Y nunca antes de entrar
    assert.ok(!r.eventos.some(e => e.tipo === 'poder' && e.carta === les.suplente && e.jugada <= les.jugada));
  }
  assert.ok(visto > 0, 'no se encontró ninguna lesión con suplente');
});

/* ── Dorado, determinismo e invariantes ──────────────────────────────────── */
test('v1.3.0, semilla 12345: la salida es idéntica al archivo dorado', () => {
  assert.deepEqual(comoJSON(simularPartido(marcosFC(), losDelFondo(), 12345)), dorado);
  assert.equal(dorado.version, '1.3.0');
});

test('determinismo y alineaciones de entrada intactas', () => {
  assert.deepEqual(simularPartido(marcosFC(), losDelFondo(), 777), simularPartido(marcosFC(), losDelFondo(), 777));
  const A = marcosFC(), B = losDelFondo();
  const antesA = structuredClone(A), antesB = structuredClone(B);
  for (let s = 1; s <= 300; s++) simularPartido(A, B, s);
  assert.deepEqual(A, antesA);
  assert.deepEqual(B, antesB);
  const sec = s => Array.from({ length: 5 }, mulberry32(s));
  assert.deepEqual(sec(1), sec(1));
});

test('sin poderes, el partido es idéntico al de la v1.2.0 (mismas reglas y mismo PRNG)', () => {
  for (let s = 1; s <= 300; s++) {
    const a = simularPartido(neutro('A:', 75), neutro('B:', 65), s);
    const b = motorDe('1.2.0').simularPartido(neutro('A:', 75), neutro('B:', 65), s);
    assert.deepEqual(a.eventos, b.eventos);
  }
});

test('invariantes en 2.000 partidos', () => {
  for (let s = 1; s <= 2000; s++) {
    const r = simularPartido(marcosFC(), losDelFondo(), s);
    const est = r.estadisticas;
    assert.equal(est.posesiones[0] + est.posesiones[1], CONFIG.JUGADAS);
    for (const i of [0, 1]) assert.equal(est.goles[i] + est.paradas[1 - i], est.tiros[i]);
    assert.equal(r.eventos.at(-1).tipo, 'fin_partido');
  }
});

test('el mejor equipo sigue ganando bastante más (75 contra 65)', () => {
  let gana = 0;
  for (let s = 1; s <= 2000; s++) {
    const [gm, gp] = simularPartido(neutro('M:', 75), neutro('P:', 65), s).goles;
    if (gm > gp) gana++;
  }
  assert.ok(gana / 2000 > 0.65, `gana ${gana / 20} %`);
});

test('pronóstico reproducible y sumando 1', () => {
  const p1 = simularPronostico(marcosFC(), losDelFondo(), 12345, 50);
  assert.deepEqual(p1, simularPronostico(marcosFC(), losDelFondo(), 12345, 50));
  assert.ok(Math.abs(p1.pA + p1.pEmpate + p1.pB - 1) < 1e-12);
});

test('el motor no usa funciones prohibidas para el determinismo', () => {
  const fuente = readFileSync(new URL('../../js/slr/motor-v1.3.0.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const prohibido of ['Math.random', 'Math.pow', 'Math.exp', 'Math.log', '**', 'Date.now', 'new Date']) {
    assert.ok(!fuente.includes(prohibido), `el motor usa ${prohibido}`);
  }
});
