// Fórmulas del motor contra los números de la sección 14 de la especificación.
// El partido narrado allí está hecho a mano (no sale de ninguna semilla), así que
// aquí se comprueban sus fuerzas y probabilidades una a una.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  duelo, linea, mulberry32, fuerzaPosesion, fuerzaAtaque, fuerzaDefensa, probabilidadesTirador,
} from '../../js/slr/motor-v1.0.0.js';
import { marcosFC, losDelFondo } from './cartas-prueba.mjs';

const TOL_FUERZA = 0.05;
const TOL_PROB   = 0.005;

function cerca(real, esperado, tol, que) {
  assert.ok(Math.abs(real - esperado) <= tol, `${que}: ${real} no está a ±${tol} de ${esperado}`);
}

// Alineación de Marcos con Pichichi cansado a ATA 80
function marcosConPichichi80() {
  const m = marcosFC();
  m.del = m.del.map(c => (c.id === 'm-pichichi' ? { ...c, ATA: 80 } : c));
  return m;
}

const prob = (ruleta, id) => ruleta.find(c => c.id === id).p;

test('posesión: Marcos 178.3 contra Fondo 141.4 → P(Marcos) 0.614', () => {
  const fM = fuerzaPosesion(marcosFC()), fF = fuerzaPosesion(losDelFondo());
  cerca(fM, 178.3, TOL_FUERZA, 'posesión Marcos');
  cerca(fF, 141.4, TOL_FUERZA, 'posesión Fondo');
  cerca(duelo(fM, fF), 0.614, TOL_PROB, 'P(Marcos)');
});

test('ocasión: ataque Marcos 161.0 contra defensa Fondo 151.3 → 0.531', () => {
  const a = fuerzaAtaque(marcosFC()), d = fuerzaDefensa(losDelFondo());
  cerca(a, 161.0, TOL_FUERZA, 'ataque Marcos');
  cerca(d, 151.3, TOL_FUERZA, 'defensa Fondo');
  cerca(duelo(a, d), 0.531, TOL_PROB, 'P(llegan)');
});

test('ocasión: ataque Fondo 151.8 contra defensa Marcos 99.8 → 0.698', () => {
  const a = fuerzaAtaque(losDelFondo()), d = fuerzaDefensa(marcosFC());
  cerca(a, 151.8, TOL_FUERZA, 'ataque Fondo');
  cerca(d, 99.8, TOL_FUERZA, 'defensa Marcos');
  cerca(duelo(a, d), 0.698, TOL_PROB, 'P(llegan)');
});

test('contraataque de Fondo: 151.8 × 1.15 = 174.57 contra 99.8 → 0.754', () => {
  const a = fuerzaAtaque(losDelFondo()) * 1.15, d = fuerzaDefensa(marcosFC());
  cerca(a, 174.57, TOL_FUERZA, 'ataque con contra');
  cerca(duelo(a, d), 0.754, TOL_PROB, 'P(llegan)');
});

test('ruleta de Fondo: Bala 0.409, Óscar 0.345, El Capi 0.136, Carlos 0.110', () => {
  const r = probabilidadesTirador(losDelFondo());
  cerca(prob(r, 'f-bala'),   0.409, TOL_PROB, 'Bala');
  cerca(prob(r, 'f-oscar'),  0.345, TOL_PROB, 'Óscar');
  cerca(prob(r, 'f-capi'),   0.136, TOL_PROB, 'El Capi');
  cerca(prob(r, 'f-carlos'), 0.110, TOL_PROB, 'Carlos');
  cerca(r.reduce((s, c) => s + c.p, 0), 1, 1e-12, 'suma');
});

test('chut: Carlos 63 contra El Muro 81 → 0.377', () => {
  cerca(duelo(63, 81), 0.377, TOL_PROB, 'P(gol)');
});

test('posesión con Cerebro y Batuta activos: 205.0 contra 162.6 → P(Fondo) 0.386', () => {
  const fM = fuerzaPosesion(marcosFC()) * 1.15, fF = fuerzaPosesion(losDelFondo()) * 1.15;
  cerca(fM, 205.0, TOL_FUERZA, 'posesión Marcos');
  cerca(fF, 162.6, TOL_FUERZA, 'posesión Fondo');
  cerca(duelo(fF, fM), 0.386, TOL_PROB, 'P(Fondo)');
});

test('Pichichi cansado a 80: ataque 158.2 (no 157.9) × 1.15 × 1.25 = 227.4 contra 151.3 → 0.693', () => {
  const base = fuerzaAtaque(marcosConPichichi80());
  cerca(base, 158.2, TOL_FUERZA, 'ataque Marcos con Pichichi a 80');
  const a = base * 1.15 * 1.25, d = fuerzaDefensa(losDelFondo());
  cerca(a, 227.4, TOL_FUERZA, 'ataque con contra y Todos para uno');
  cerca(duelo(a, d), 0.693, TOL_PROB, 'P(llegan)');
});

test('ruleta de Marcos con Pichichi a 80 y su ×2', () => {
  const r = probabilidadesTirador(marcosConPichichi80(), { 'm-pichichi': 2 });
  cerca(prob(r, 'm-pichichi'), 0.470, TOL_PROB, 'Pichichi');
  cerca(prob(r, 'm-mosq'),     0.311, TOL_PROB, 'Mosqueteros');
  cerca(prob(r, 'm-rayo'),     0.085, TOL_PROB, 'Rayo');
  cerca(prob(r, 'm-cerebro'),  0.068, TOL_PROB, 'El Cerebro');
  cerca(prob(r, 'm-zurdo'),    0.066, TOL_PROB, 'Zurdo');
});

test('chut: Pichichi 80 contra Manos 84 → 0.476', () => {
  cerca(duelo(80, 84), 0.476, TOL_PROB, 'P(gol)');
});

test('linea: pesos 1 / 0,7 / 0,5, el cuarto no suma y no muta la entrada', () => {
  const v = [74, 86, 79];
  cerca(linea(v), 178.3, 1e-9, 'tres medios');
  assert.deepEqual(v, [74, 86, 79], 'linea ha mutado su entrada');
  assert.equal(linea([99]), 99);
  cerca(linea([70, 70]), 119, 1e-9, 'dos de 70');
  assert.equal(linea([90, 80, 70, 60]), linea([90, 80, 70]), 'el cuarto valor no debe sumar');
  assert.equal(linea([]), 0);
});

test('duelo(70, 70) = 0.5 y ejemplos de la sección 5.2', () => {
  assert.equal(duelo(70, 70), 0.5);
  cerca(duelo(80, 70), 0.57, 0.005, '80 contra 70');
  cerca(duelo(90, 70), 0.62, 0.005, '90 contra 70');
  cerca(duelo(99, 60), 0.73, 0.005, '99 contra 60');
});

test('mulberry32: misma semilla, misma secuencia; distinta semilla, distinta secuencia', () => {
  const sec = (s, n = 20) => { const r = mulberry32(s); return Array.from({ length: n }, r); };
  assert.deepEqual(sec(12345), sec(12345));
  assert.notDeepEqual(sec(12345), sec(12346));
  for (const x of sec(1, 1000)) assert.ok(x >= 0 && x < 1, `fuera de [0, 1): ${x}`);
  // La semilla se trata como entero de 32 bits sin signo
  assert.deepEqual(sec(-1), sec(4294967295));
});

test('el motor no usa funciones prohibidas para el determinismo', () => {
  const fuente = readFileSync(new URL('../../js/slr/motor-v1.0.0.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')   // sin comentarios de bloque
    .replace(/\/\/.*$/gm, '');          // sin comentarios de línea
  for (const prohibido of ['Math.random', 'Math.pow', 'Math.exp', 'Math.log', '**', 'Date.now', 'new Date']) {
    assert.ok(!fuente.includes(prohibido), `el motor usa ${prohibido}`);
  }
});
