// Tests del motor v2.0.0: tácticas (bonus, cruce, plan B), táctica favorita,
// sinergias de colección, energía (fuera del motor), cambios en el descanso
// (gestión y cambios avanzados), resultado (tácticas por tramo, participación),
// determinismo y test dorado. Las versiones anteriores siguen en sus archivos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  simularPartido, VERSION, CONFIG, factorEnergia, aplicarEnergia, ganaCruce, sinergia, bonusContraataque,
} from '../../js/slr/motor-v2.0.0.js';
import * as v13 from '../../js/slr/motor-v1.3.0.js';
import { MOTOR_ACTUAL } from '../../js/slr/motores.js';
import { marcosFCv2, losDelFondoV2 } from './cartas-prueba.mjs';

const dorado = JSON.parse(readFileSync(new URL('./dorado-v2.0.0-semilla-12345.json', import.meta.url), 'utf8'));
const comoJSON = x => JSON.parse(JSON.stringify(x));
const cerca = (real, esperado, tol, que) =>
  assert.ok(Math.abs(real - esperado) <= tol, `${que}: ${real} no está a ±${tol} de ${esperado}`);

const carta = (id, v = 70, extra = {}) => ({ id, nombre: id, ATA: v, DEF: v, CON: v, poderes: [], ...extra });
function neutro(p, v = 70, extra = {}, cartas = {}) {
  const c = (id) => carta(p + id, v, cartas[id] ?? {});
  return { formacion: '2-2-2', por: c('por'), def: [c('d1'), c('d2')], med: [c('m1'), c('m2')], del: [c('a1'), c('a2')],
    banquillo: [c('b1'), c('b2'), c('b3')], orden_manual: false, capitan_id: null, ...extra };
}
// Generador que devuelve los valores dados y después siempre `resto`
function secuencia(valores, resto = 0.5) {
  let i = 0;
  const g = () => (i < valores.length ? valores[i++] : resto);
  return g;
}
// Sin goles ni lesiones ni cansancio: el que saca nunca gana la posesión (0,99) y no se llega al área
const quieto = () => secuencia([], 0.99);
const POS_BASE = 70 * 1 + 70 * 0.7;                        // dos MED de 70
const ATA_BASE = 70 + 70 * 0.7 + 0.3 * 70 * 0.5;           // dos DEL + MED al 30 %
const ev = (r, tipo) => r.eventos.filter(e => e.tipo === tipo);

/* ── Versión ─────────────────────────────────────────────────────────────── */
test('versión 2.0.0 con sus números; el motor actual sigue siendo la 1.3.0 hasta la fase 2', () => {
  assert.equal(VERSION, '2.0.0');
  assert.equal(MOTOR_ACTUAL.VERSION, '1.3.0');
  assert.deepEqual([...CONFIG.TACTICAS], ['posesion', 'contraataque', 'presion']);
  assert.equal(CONFIG.TACTICA_POSESION, 1.06);
  assert.equal(CONFIG.CONTRAATAQUE_CONTRA, 1.25);
  assert.equal(CONFIG.DEFENSA_CONTRA, 1.04);
  assert.equal(CONFIG.PRESION_ROBO, 1.06);
  assert.equal(CONFIG.BONUS_CRUCE, 1.06);
  assert.equal(CONFIG.MULT_TACTICA_FAVORITA, 1.05);
  assert.deepEqual([...CONFIG.SINERGIA], [1, 1, 1.02, 1.04, 1.06]);
  assert.equal(CONFIG.BONUS_SAQUE, v13.CONFIG.BONUS_SAQUE);
  assert.equal(CONFIG.EXPONENTE_DUELO, v13.CONFIG.EXPONENTE_DUELO);
});

/* ── Energía ─────────────────────────────────────────────────────────────── */
test('energía: ≥70 ×1, 50–69 ×0,95, 30–49 ×0,88, <30 ×0,75; aplicarEnergia redondea con mínimo 1', () => {
  assert.equal(factorEnergia(100), 1); assert.equal(factorEnergia(70), 1);
  assert.equal(factorEnergia(69), 0.95); assert.equal(factorEnergia(50), 0.95);
  assert.equal(factorEnergia(49), 0.88); assert.equal(factorEnergia(30), 0.88);
  assert.equal(factorEnergia(29), 0.75); assert.equal(factorEnergia(0), 0.75);
  assert.equal(factorEnergia(), 1);
  const c = aplicarEnergia({ id: 'x', ATA: 70, DEF: 61, CON: 1, energia: 40 });
  assert.deepEqual([c.ATA, c.DEF, c.CON], [62, 54, 1]);       // 61,6 → 62 · 53,68 → 54 · mínimo 1
  assert.equal(aplicarEnergia({ id: 'y', ATA: 70, DEF: 70, CON: 70 }).ATA, 70);
});

/* ── Tácticas ────────────────────────────────────────────────────────────── */
test('cruce: contraataque > posesión > presión > contraataque; misma táctica, nadie', () => {
  assert.equal(ganaCruce('contraataque', 'posesion'), 0);
  assert.equal(ganaCruce('posesion', 'presion'), 0);
  assert.equal(ganaCruce('presion', 'contraataque'), 0);
  assert.equal(ganaCruce('posesion', 'contraataque'), 1);
  for (const t of CONFIG.TACTICAS) assert.equal(ganaCruce(t, t), null);
  assert.equal(bonusContraataque('posesion'), 1.0);
  assert.equal(bonusContraataque('contraataque'), 1.25);
  assert.equal(bonusContraataque('presion'), 1.15);
});

test('posesión ×1,06 a la posesión; presión ×1,06 solo cuando saca el rival; cruce ×1,06', () => {
  // Posesión contra posesión: ×1,06 los dos; el que saca, además ×1,15
  let r = simularPartido(neutro('A'), neutro('B'), 1, { rng: quieto() });
  let p = ev(r, 'posesion')[0];
  cerca(p.fuerzas[0], POS_BASE * 1.06 * 1.15, 1e-9, 'A saca, posesión');
  cerca(p.fuerzas[1], POS_BASE * 1.06, 1e-9, 'B, posesión');
  // Presión (A) contra presión (B): jugada 1 saca A → B presiona; jugada 2 saca B → A presiona
  r = simularPartido(neutro('A', 70, { tactica: 'presion' }), neutro('B', 70, { tactica: 'presion' }), 1, { rng: quieto() });
  const [j1, j2] = ev(r, 'posesion');
  cerca(j1.fuerzas[0], POS_BASE * 1.15, 1e-9, 'A saca: sin presión');
  cerca(j1.fuerzas[1], POS_BASE * 1.06, 1e-9, 'B presiona');
  cerca(j2.fuerzas[0], POS_BASE * 1.06, 1e-9, 'A presiona');
  // Cruce: posesión (A) gana a presión (B): A ×1,06 ×1,06 en posesión
  r = simularPartido(neutro('A'), neutro('B', 70, { tactica: 'presion' }), 1, { rng: quieto() });
  assert.equal(r.cruce[0], 'A');
  cerca(ev(r, 'posesion')[0].fuerzas[0], POS_BASE * 1.06 * 1.06 * 1.15, 1e-9, 'A posesión + cruce + saque');
  cerca(ev(r, 'posesion')[0].fuerzas[1], POS_BASE * 1.06, 1e-9, 'B presión (saca A)');
});

test('contraataque: sus contras ×1,25 y su defensa ×1,04; los de posesión, sin bonus (×1,0)', () => {
  // Jugada 1: saca A y pierde (0,99) → contra de B
  const r = simularPartido(neutro('A'), neutro('B', 70, { tactica: 'contraataque' }), 1, { rng: quieto() });
  const o = ev(r, 'ocasion');
  // B (contraataque) gana el cruce a A (posesión): ×1,06 en ataque
  cerca(o[0].fuerzaAtaque, ATA_BASE * 1.25 * 1.06, 1e-9, 'contra de B');
  // Jugada 2: saca B y pierde → contra de A (posesión: ×1,0) contra la defensa de B (×1,04 y cruce)
  const DEF_BASE = 70 + 70 * 0.7 + 0.3 * 70 * 0.5;
  cerca(o[1].fuerzaAtaque, ATA_BASE * 1.0, 1e-9, 'contra de A en posesión, sin bonus');
  cerca(o[1].fuerzaDefensa, DEF_BASE * 1.04 * 1.06, 1e-9, 'defensa de B: bloque bajo y cruce');
});

test('táctica favorita: ATA/DEF/CON ×1,05 redondeado si su equipo juega esa táctica', () => {
  const fav = { m1: { tactica_favorita: 'posesion' }, m2: { tactica_favorita: 'presion' } };
  const r = simularPartido(neutro('A', 70, {}, fav), neutro('B'), 1, { rng: quieto() });
  // m1 juega su táctica: CON 70 → 74 (73,5 redondeado); m2 no
  cerca(ev(r, 'posesion')[0].fuerzas[0], (74 * 1 + 70 * 0.7) * 1.06 * 1.15, 1e-9, 'm1 con su favorita');
});

test('sinergias: 2 → ×1,02, 3 → ×1,04, 4 o más → ×1,06; sin colección no cuentan', () => {
  const cs = (...cols) => cols.map((k, i) => ({ id: 'c' + i, coleccion_id: k }));
  assert.equal(sinergia(cs(null, null, null)).mult, 1);
  assert.equal(sinergia(cs('x', null)).mult, 1);
  assert.deepEqual(sinergia(cs('x', 'x', null, 'y')), { coleccion: 'x', cartas: 2, mult: 1.02 });
  assert.equal(sinergia(cs('x', 'x', 'x', 'y', 'y')).mult, 1.04);
  assert.equal(sinergia(cs('x', 'x', 'x', 'x', 'x', 'x', 'x')).mult, 1.06);
  // En el partido: posesión de A con 3 de la misma colección
  const col = { por: { coleccion_id: 'k' }, d1: { coleccion_id: 'k' }, m1: { coleccion_id: 'k' } };
  const r = simularPartido(neutro('A', 70, {}, col), neutro('B'), 1, { rng: quieto() });
  cerca(ev(r, 'posesion')[0].fuerzas[0], POS_BASE * 1.06 * 1.04 * 1.15, 1e-9, 'A con sinergia ×3');
  assert.deepEqual(ev(r, 'tacticas')[0].sinergias.A, { coleccion: 'k', cartas: 3, mult: 1.04 });
});

/* ── Descanso ────────────────────────────────────────────────────────────── */
test('plan B: con el marcador del descanso, el equipo cambia de táctica para las jugadas 6–10', () => {
  const r = simularPartido(neutro('A', 70, { plan_b: { condicion: 'empatando', tactica: 'contraataque' } }),
    neutro('B', 70, { plan_b: { condicion: 'perdiendo', tactica: 'presion' } }), 1, { rng: quieto() });
  assert.deepEqual(r.tacticas, { A: ['posesion', 'contraataque'], B: ['posesion', 'posesion'] });
  assert.deepEqual(r.plan_b, { A: true, B: false });
  assert.deepEqual(r.cruce, [null, 'A']);
  const pb = ev(r, 'plan_b');
  assert.equal(pb.length, 1);
  assert.deepEqual({ equipo: pb[0].equipo, de: pb[0].de, a: pb[0].a, jugada: pb[0].jugada }, { equipo: 'A', de: 'posesion', a: 'contraataque', jugada: 5 });
  // La jugada 6 ya juega con el plan B (posesión de A sin el ×1,06 de posesión; B pierde el cruce)
  const j6 = ev(r, 'posesion')[5];
  cerca(j6.fuerzas[0], POS_BASE * 1.06, 1e-9, 'A en contraataque gana el cruce (saca B)');
});

test('gestión: reservón cambia a los 2 con menos energía; normal, 1 si hay alguno < 50; a tope, ninguno', () => {
  const energias = { por: { energia: 90 }, d1: { energia: 45 }, d2: { energia: 80 }, m1: { energia: 60 }, m2: { energia: 30 }, a1: { energia: 100 }, a2: { energia: 75 } };
  const banquillo = p => [carta(p + 'b1', 60), carta(p + 'b2', 72), carta(p + 'b3', 66)];
  const conBanco = (p, gestion) => ({ ...neutro(p, 70, { gestion }, energias), banquillo: banquillo(p) });
  let r = simularPartido(conBanco('A', 'reservon'), conBanco('B', 'a_tope'), 1, { rng: quieto() });
  const cambios = ev(r, 'cambio');
  assert.deepEqual(cambios.map(c => [c.equipo, c.sale, c.entra, c.motivo]), [['A', 'Am2', 'Ab2', 'reservon'], ['A', 'Ad1', 'Ab3', 'reservon']]);
  assert.deepEqual(r.cambios_descanso, { A: 2, B: 0 });
  assert.deepEqual(r.participacion.A.parcial.sort(), ['Ab2', 'Ab3', 'Ad1', 'Am2'].sort());
  assert.equal(r.participacion.A.completo.length, 5);
  assert.equal(r.participacion.B.completo.length, 7);
  r = simularPartido(conBanco('A', 'normal'), neutro('B'), 1, { rng: quieto() });
  assert.deepEqual(ev(r, 'cambio').map(c => [c.sale, c.motivo]), [['Am2', 'cansado']]);
  // Normal sin nadie por debajo de 50: ningún cambio
  r = simularPartido(neutro('A', 70, { gestion: 'normal' }), neutro('B'), 1, { rng: quieto() });
  assert.equal(ev(r, 'cambio').length, 0);
});

test('cambios avanzados: sustituyen a la gestión, con condición, en orden y como mucho 3', () => {
  const al = neutro('A', 70, {
    gestion: 'reservon',
    cambios_avanzados: [
      { sale: 'Aa1', entra: 'Ab1', condicion: 'siempre' },
      { sale: 'Am1', entra: 'Ab2', condicion: 'ganando' },               // 0-0: no
      { sale: 'Ad1', entra: 'Ab3', condicion: 'energia_menor', umbral: 50 },
    ],
  }, { d1: { energia: 40 } });
  const r = simularPartido(al, neutro('B'), 1, { rng: quieto() });
  assert.deepEqual(ev(r, 'cambio').map(c => [c.sale, c.entra, c.motivo, c.condicion]),
    [['Aa1', 'Ab1', 'programado', 'siempre'], ['Ad1', 'Ab3', 'programado', 'energia_menor']]);
  assert.throws(() => simularPartido(neutro('A', 70, { cambios_avanzados: [1, 2, 3, 4].map(() => ({ sale: 'x', entra: 'y', condicion: 'siempre' })) }), neutro('B'), 1),
    /como mucho 3/);
  assert.throws(() => simularPartido(neutro('A', 70, { tactica: 'catenaccio' }), neutro('B'), 1), /táctica no válida/);
  assert.throws(() => simularPartido(neutro('A', 70, { gestion: 'loco' }), neutro('B'), 1), /gestión no válida/);
  assert.throws(() => simularPartido(neutro('A', 70, { plan_b: { condicion: 'siempre', tactica: 'presion' } }), neutro('B'), 1), /plan B no válida/);
});

test('los cambios del descanso cuentan dentro del máximo de 3 (con las lesiones)', () => {
  const al = { ...neutro('A', 70, { gestion: 'reservon' }), banquillo: [carta('Ab1'), carta('Ab2'), carta('Ab3'), carta('Ab4')] };
  const r = simularPartido(al, neutro('B'), 7);
  const lesiones = ev(r, 'lesion').filter(l => l.equipo === 'A' && l.suplente).length;
  assert.ok(lesiones + r.cambios_descanso.A <= CONFIG.MAX_CAMBIOS);
});

/* ── Resultado, determinismo y dorado ────────────────────────────────────── */
test('determinista: misma semilla, mismo resultado; las tácticas por tramo vienen en el resultado', () => {
  const a = simularPartido(marcosFCv2(aplicarEnergia), losDelFondoV2(aplicarEnergia), 99);
  const b = simularPartido(marcosFCv2(aplicarEnergia), losDelFondoV2(aplicarEnergia), 99);
  assert.deepEqual(comoJSON(a), comoJSON(b));
  assert.equal(a.tacticas.A.length, 2);
  assert.equal(a.cruce.length, 2);
});

test('el descanso no consume números del PRNG (mismo número de llamadas que sin cambios ni plan B)', () => {
  const cuenta = () => { let n = 0; const r = secuencia([], 0.99); const g = () => { n++; return r(); }; g.n = () => n; return g; };
  const g1 = cuenta(), g2 = cuenta();
  simularPartido(neutro('A'), neutro('B'), 1, { rng: g1 });
  simularPartido(neutro('A', 70, { gestion: 'reservon', plan_b: { condicion: 'empatando', tactica: 'presion' } }), neutro('B'), 1, { rng: g2 });
  assert.equal(g1.n(), g2.n());
});

test('dorado: Marcos FC contra Los del Fondo (v2, semilla 12345) da exactamente lo guardado', () => {
  const r = simularPartido(marcosFCv2(aplicarEnergia), losDelFondoV2(aplicarEnergia), 12345);
  assert.deepEqual(comoJSON(r), dorado);
  assert.equal(r.version, '2.0.0');
  assert.deepEqual(r.cambios_descanso, { A: 2, B: 1 });
});

test('las versiones anteriores no cambian (v1.3.0 con su dorado)', () => {
  const d13 = JSON.parse(readFileSync(new URL('./dorado-v1.3.0-semilla-12345.json', import.meta.url), 'utf8'));
  assert.equal(d13.version, '1.3.0');
  assert.equal(v13.VERSION, '1.3.0');
});
