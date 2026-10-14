// Tests del motor v1.2.0: lo que cambia respecto a la v1.1.0 (exponente 3,
// pesos de posesión, ventaja de saque, poderes una vez por partido), el test
// dorado (semilla 12345) y las propiedades generales.
// Los de la v1.1.0 siguen en dorado-v1.1.0.test.mjs y formulas-v1.1.0.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  simularPartido, simularPronostico, VERSION, CONFIG, duelo, dueloCubico, dueloCuadratico, linea,
  fuerzaPosesion, fuerzaAtaque, fuerzaDefensa, mulberry32,
} from '../../js/slr/motor-v1.2.0.js';
import { MOTORES, MOTOR_ACTUAL, motorDe } from '../../js/slr/motores.js';
import { marcosFC, losDelFondo, conPrefijo } from './cartas-prueba.mjs';

const dorado = JSON.parse(readFileSync(new URL('./dorado-v1.2.0-semilla-12345.json', import.meta.url), 'utf8'));
const comoJSON = x => JSON.parse(JSON.stringify(x));
const cerca = (real, esperado, tol, que) =>
  assert.ok(Math.abs(real - esperado) <= tol, `${que}: ${real} no está a ±${tol} de ${esperado}`);

// Equipo 2-2-2 con todas las stats iguales y sin poderes
const carta = (id, v = 70, poderes = []) => ({ id, nombre: id, ATA: v, DEF: v, CON: v, poderes });
function neutro(p, v = 70) {
  return { formacion: '2-2-2', por: carta(p + 'por', v), def: [carta(p + 'd1', v), carta(p + 'd2', v)],
    med: [carta(p + 'm1', v), carta(p + 'm2', v)], del: [carta(p + 'a1', v), carta(p + 'a2', v)],
    banquillo: [], orden_manual: false, capitan_id: null };
}
// Generador que siempre devuelve el mismo número y cuenta cuántos se piden
function constante(x) {
  const g = () => { g.n++; return x; };
  g.n = 0;
  return g;
}

/* ── Versión y registro de motores ───────────────────────────────────────── */
test('versión 1.2.0, motor actual y la 1.1.0 sigue disponible', () => {
  assert.equal(VERSION, '1.2.0');
  assert.equal(MOTOR_ACTUAL.VERSION, '1.2.0');
  assert.equal(motorDe('1.1.0').VERSION, '1.1.0');
  assert.equal(motorDe(null).VERSION, '1.2.0');
  assert.deepEqual(Object.keys(MOTORES).sort(), ['1.1.0', '1.2.0']);
  assert.throws(() => motorDe('9.9.9'), /No existe el motor/);
});

test('constantes nuevas en CONFIG', () => {
  assert.equal(CONFIG.EXPONENTE_DUELO, 3);
  assert.deepEqual(CONFIG.PESOS_LINEA_POSESION, [1.0, 0.7, 0.2]);
  assert.deepEqual(CONFIG.PESOS_LINEA, [1.0, 0.7, 0.5]);
  assert.equal(CONFIG.BONUS_SAQUE, 1.15);
  assert.equal(CONFIG.PODER_UNA_VEZ, true);
  assert.ok(Object.isFrozen(CONFIG) && Object.isFrozen(CONFIG.PESOS_LINEA_POSESION));
});

/* ── a) Exponente 3 ──────────────────────────────────────────────────────── */
test('duelo cúbico: a³ / (a³ + b³); el de los penaltis sigue cuadrático', () => {
  assert.equal(duelo, dueloCubico);
  assert.equal(duelo(70, 70), 0.5);
  cerca(duelo(75, 65), 75 ** 3 / (75 ** 3 + 65 ** 3), 1e-15, '75 contra 65');
  cerca(duelo(80, 70), 0.599, 0.001, '80 contra 70');
  cerca(duelo(2, 1), 8 / 9, 1e-15, '2 contra 1');
  cerca(dueloCuadratico(80, 70), 0.566, 0.001, 'cuadrático 80 contra 70');
});

test('posesión, ocasión y chut usan el duelo cúbico en el partido', () => {
  const cubo = (a, b) => (a * a * a) / (a * a * a + b * b * b);
  let n = 0;
  for (let s = 1; s <= 200; s++) {
    for (const e of simularPartido(marcosFC(), losDelFondo(), s).eventos) {
      if (e.tipo === 'posesion') {
        const [fS, fR] = e.saca === 'A' ? e.fuerzas : [e.fuerzas[1], e.fuerzas[0]];
        assert.equal(e.p, cubo(fS, fR)); n++;
      }
      if (e.tipo === 'ocasion') { assert.equal(e.p, cubo(e.fuerzaAtaque, e.fuerzaDefensa)); n++; }
      if (e.tipo === 'chut') { assert.equal(e.p, cubo(e.ata, e.def)); n++; }
    }
  }
  assert.ok(n > 2000);
});

test('penaltis: siguen con el duelo cuadrático y el portero al 55 %', () => {
  let vistos = 0;
  for (let s = 1; s <= 400 && vistos < 30; s++) {
    const r = simularPartido(marcosFC(), losDelFondo(), s, { modo: 'copa' });
    for (const e of r.eventos.filter(x => x.tipo === 'penalti')) {
      assert.equal(e.p, dueloCuadratico(e.ata, e.def));
      vistos++;
    }
  }
  assert.ok(vistos > 0, 'no hubo penaltis');
});

/* ── b) Pesos de posesión ────────────────────────────────────────────────── */
test('fuerza de posesión: CON de los MED con 1,0 / 0,7 / 0,2; ataque y defensa sin cambios', () => {
  const m = marcosFC(); // MED: CON 86, 79, 74
  cerca(fuerzaPosesion(m), 86 + 0.7 * 79 + 0.2 * 74, 1e-9, 'posesión con 3 medios');
  cerca(fuerzaPosesion(losDelFondo()), 84 + 0.7 * 82, 1e-9, 'posesión con 2 medios');
  // Ataque y defensa: igual que en la v1.1.0 (sección 14)
  cerca(fuerzaAtaque(m), 161.0, 0.05, 'ataque Marcos');
  cerca(fuerzaDefensa(losDelFondo()), 151.3, 0.05, 'defensa Fondo');
  assert.equal(fuerzaAtaque(m), motorDe('1.1.0').fuerzaAtaque(m));
  assert.equal(fuerzaDefensa(m), motorDe('1.1.0').fuerzaDefensa(m));
  // linea sin pesos usa los de ataque/defensa
  cerca(linea([74, 86, 79]), 178.3, 1e-9, 'linea por defecto');
  cerca(linea([74, 86, 79], CONFIG.PESOS_LINEA_POSESION), 156.1, 1e-9, 'linea de posesión');
});

/* ── c) Ventaja de saque ─────────────────────────────────────────────────── */
test('el que saca multiplica su fuerza de posesión × 1,15 (después de sus poderes)', () => {
  const base = fuerzaPosesion(neutro('A:'));
  for (let s = 1; s <= 50; s++) {
    const r = simularPartido(neutro('A:'), neutro('B:'), s);
    const e = r.eventos.find(x => x.tipo === 'posesion' && x.jugada === 1); // sin cansancio todavía
    const [fS, fR] = e.saca === 'A' ? e.fuerzas : [e.fuerzas[1], e.fuerzas[0]];
    assert.equal(fS, base * 1.15);
    assert.equal(fR, base);
    cerca(e.p, 1.15 ** 3 / (1.15 ** 3 + 1), 1e-12, 'P del que saca entre iguales');
  }
  // Con un poder de posesión activado en el que saca: base × (1 + efecto) × 1,15
  const A = neutro('A:');
  A.med[0].poderes = [{ nombre: 'Batuta', momento: 'posesion', probabilidad: 1, efecto: 0.2, nivel: 'simple' }];
  const r = simularPartido(A, neutro('B:'), 7);
  const e = r.eventos.find(x => x.tipo === 'posesion' && x.jugada === 1);
  assert.equal(e.saca, 'A');
  assert.equal(e.fuerzas[0], base * 1.2 * 1.15);
});

test('se alterna el saque: A en las impares y B en las pares', () => {
  const r = simularPartido(marcosFC(), losDelFondo(), 12345);
  for (const e of r.eventos.filter(x => x.tipo === 'posesion')) assert.equal(e.saca, e.jugada % 2 ? 'A' : 'B');
});

/* ── d) Poderes una vez por partido ──────────────────────────────────────── */
test('cada poder sorteado se activa como mucho una vez por partido; "siempre" sin límite', () => {
  let siempreRepetido = false;
  for (let s = 1; s <= 2000; s++) {
    const vistos = new Map();
    for (const e of simularPartido(marcosFC(), losDelFondo(), s).eventos.filter(x => x.tipo === 'poder')) {
      const k = `${e.carta}|${e.poder}`;
      vistos.set(k, (vistos.get(k) ?? 0) + 1);
      if (e.poder === 'Pichichi' && vistos.get(k) > 1) siempreRepetido = true;
      else assert.ok(vistos.get(k) === 1, `semilla ${s}: ${k} se activa más de una vez`);
    }
  }
  assert.ok(siempreRepetido, 'Pichichi ("siempre") debería activarse varias veces en algún partido');
});

test('un poder ya activado no se sortea más: no consume números del PRNG', () => {
  // Con un generador constante (0,5) el desarrollo del partido no depende de
  // cuántos números se consuman, así que se pueden contar exactamente.
  const sin = constante(0.5);
  simularPartido(neutro('A:'), neutro('B:'), 1, { rng: sin });

  // Poder de posesión con probabilidad 1 y efecto 0: se activa en el primer
  // sorteo (1 número) y en las 9 jugadas siguientes no se vuelve a sortear
  const A = neutro('A:');
  A.med[0].poderes = [{ nombre: 'Seguro', momento: 'posesion', probabilidad: 1, efecto: 0, nivel: 'simple' }];
  const con = constante(0.5);
  const r = simularPartido(A, neutro('B:'), 1, { rng: con });
  assert.equal(con.n - sin.n, 1, 'el poder solo debe consumir el número de su primer sorteo');
  assert.equal(r.eventos.filter(e => e.tipo === 'poder').length, 1);

  // Si no llega a activarse (probabilidad 0,3 < 0,5), se sortea en las 10 jugadas
  const B = neutro('A:');
  B.med[0].poderes = [{ nombre: 'Nunca', momento: 'posesion', probabilidad: 0.3, efecto: 0.2, nivel: 'simple' }];
  const nunca = constante(0.5);
  simularPartido(B, neutro('B:'), 1, { rng: nunca });
  assert.equal(nunca.n - sin.n, CONFIG.JUGADAS);

  // "siempre" no consume números y se aplica en cada ocasión
  const C = neutro('A:');
  C.del[0].poderes = [{ nombre: 'Chupón', momento: 'tirador', probabilidad: 'siempre', efecto: 2, nivel: 'simple' }];
  const siempre = constante(0.5);
  const rc = simularPartido(C, neutro('B:'), 1, { rng: siempre });
  assert.equal(siempre.n, sin.n);
  const ocasionesA = rc.estadisticas.ocasiones[0];
  assert.equal(rc.eventos.filter(e => e.tipo === 'poder').length, ocasionesA);
});

test('el capitán sigue multiplicando la probabilidad de sus poderes × 1,5', () => {
  const poder = { nombre: 'Batuta', momento: 'posesion', probabilidad: 0.15, efecto: 0.2, nivel: 'simple' };
  const A = neutro('A:');
  A.med[0].poderes = [poder];
  // Con el generador a 0,2: 0,2 < 0,15 no; 0,2 < 0,225 sí
  const sinCap = simularPartido(A, neutro('B:'), 1, { rng: constante(0.2) });
  const conCap = simularPartido({ ...A, capitan_id: 'A:m1' }, neutro('B:'), 1, { rng: constante(0.2) });
  assert.equal(sinCap.eventos.filter(e => e.tipo === 'poder').length, 0);
  assert.equal(conCap.eventos.filter(e => e.tipo === 'poder').length, 1);
});

test('un suplente que entra trae sus poderes sin usar', () => {
  let visto = false;
  for (let s = 1; s <= 30000 && !visto; s++) {
    const A = marcosFC();
    A.banquillo = A.banquillo.map(c => ({ ...c, poderes: [{ nombre: 'Refresco', momento: 'posesion', probabilidad: 1, efecto: 0, nivel: 'simple' }] }));
    const r = simularPartido(A, losDelFondo(), s);
    const les = r.eventos.find(e => e.tipo === 'lesion' && e.equipo === 'A' && e.suplente && e.hueco === 'med');
    if (!les || les.jugada === CONFIG.JUGADAS) continue;
    visto = true;
    const activ = r.eventos.filter(e => e.tipo === 'poder' && e.carta === les.suplente);
    assert.equal(activ.length, 1, `semilla ${s}: el suplente debe activar su poder una vez`);
    assert.ok(activ[0].jugada > les.jugada);
  }
  assert.ok(visto, 'no se encontró ninguna lesión de un medio con suplente');
});

/* ── Dorado y determinismo ───────────────────────────────────────────────── */
test('v1.2.0, semilla 12345: la salida es idéntica al archivo dorado', () => {
  assert.deepEqual(comoJSON(simularPartido(marcosFC(), losDelFondo(), 12345)), dorado);
  assert.equal(dorado.version, '1.2.0');
});

test('determinismo: misma semilla, mismo partido; distinta semilla, distinto', () => {
  assert.deepEqual(simularPartido(marcosFC(), losDelFondo(), 777), simularPartido(marcosFC(), losDelFondo(), 777));
  assert.notDeepEqual(simularPartido(marcosFC(), losDelFondo(), 777).eventos, simularPartido(marcosFC(), losDelFondo(), 778).eventos);
  const sec = s => Array.from({ length: 5 }, mulberry32(s));
  assert.deepEqual(sec(12345), sec(12345));
});

test('las alineaciones de entrada no se modifican (ni se marcan los poderes usados)', () => {
  const A = marcosFC(), B = losDelFondo();
  const antesA = structuredClone(A), antesB = structuredClone(B);
  for (let s = 1; s <= 300; s++) simularPartido(A, B, s);
  assert.deepEqual(A, antesA);
  assert.deepEqual(B, antesB);
});

test('invariantes en 2.000 partidos', () => {
  for (let s = 1; s <= 2000; s++) {
    const r = simularPartido(marcosFC(), losDelFondo(), s);
    const est = r.estadisticas;
    assert.equal(est.posesiones[0] + est.posesiones[1], CONFIG.JUGADAS);
    for (const i of [0, 1]) {
      assert.equal(est.tiros[i], est.ocasiones[i]);
      assert.equal(est.goles[i] + est.paradas[1 - i], est.tiros[i]);
    }
    assert.equal(est.ocasiones[0] + est.ocasiones[1] + est.cortes[0] + est.cortes[1], CONFIG.JUGADAS);
    assert.equal(r.eventos.at(-1).tipo, 'fin_partido');
  }
});

test('el mejor equipo gana bastante más (75 contra 65, cartas iguales)', () => {
  let gana = 0;
  for (let s = 1; s <= 2000; s++) {
    const r = simularPartido(neutro('M:', 75), neutro('P:', 65), s);
    if (r.goles[0] > r.goles[1]) gana++;
  }
  assert.ok(gana / 2000 > 0.65, `gana ${gana / 20} %`);
});

test('pronóstico reproducible y sumando 1', () => {
  const p1 = simularPronostico(marcosFC(), losDelFondo(), 12345, 50);
  assert.deepEqual(p1, simularPronostico(marcosFC(), losDelFondo(), 12345, 50));
  assert.ok(Math.abs(p1.pA + p1.pEmpate + p1.pB - 1) < 1e-12);
});

test('espejo: con un equipo copiado y prefijado los ids no chocan', () => {
  const r = simularPartido(conPrefijo(losDelFondo(), 'A:'), conPrefijo(losDelFondo(), 'B:'), 3);
  assert.equal(r.goles.length, 2);
});

test('el motor no usa funciones prohibidas para el determinismo', () => {
  const fuente = readFileSync(new URL('../../js/slr/motor-v1.2.0.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const prohibido of ['Math.random', 'Math.pow', 'Math.exp', 'Math.log', '**', 'Date.now', 'new Date']) {
    assert.ok(!fuente.includes(prohibido), `el motor usa ${prohibido}`);
  }
});
