// Tests de las escenas de tácticas del guion (js/slr/partido/guion.js): el cruce justo
// después del inicio (motor v2, con el BONUS_CRUCE del motor), el plan B al descanso
// (una escena por equipo que cambia y después otro cruce, antes del resumen), nada de
// eso en los motores v1.x, y las cartas del medio campo del duelo de control.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearGuion } from '../../js/slr/partido/guion.js';
import { MOTORES, MOTOR_ACTUAL } from '../../js/slr/motores.js';
import { VARIANTES } from '../../js/slr/partido/escenas/registro.js';
import { marcosFC, losDelFondo, marcosFCv2, losDelFondoV2 } from './cartas-prueba.mjs';

const guionDe = (motor, A, B, semilla) => {
  const r = motor.simularPartido(A, B, semilla);
  return { r, g: crearGuion({ partido: { id: 'p', version_motor: motor.VERSION, goles: r.goles, pr: r.pr }, alineaciones: { local: A, visitante: B },
    eventos: r.eventos, equipos: { A: { id: 'a' }, B: { id: 'b' } }, yo: 'a', bonusCruce: motor.CONFIG?.BONUS_CRUCE ?? null }) };
};
const tipos = g => g.escenas.map(e => e.tipo);

test('las escenas nuevas tienen su variante en el registro', () => {
  assert.deepEqual(VARIANTES.cruce, ['choque']);
  assert.deepEqual(VARIANTES.planb, ['cambio']);
});

test('motor v2: el cruce de tácticas va justo después del inicio, con el cruce y el premio del motor', () => {
  for (let s = 1; s <= 50; s++) {
    const { r, g } = guionDe(MOTOR_ACTUAL, marcosFCv2(), losDelFondoV2(), s);
    const ev = r.eventos.find(e => e.tipo === 'tacticas');
    assert.deepEqual(tipos(g).slice(0, 3), ['inicio', 'cruce', 'saque']);
    const c = g.escenas[1];
    assert.deepEqual(c.tacticas, ev.tacticas);
    assert.equal(c.cruce, ev.cruce);
    assert.equal(c.bonus, MOTOR_ACTUAL.CONFIG.BONUS_CRUCE);
    assert.equal(c.momento, 'inicio');
  }
});

test('motores v1.x (sin tácticas): ni cruce ni plan B', () => {
  for (const [v, m] of Object.entries(MOTORES)) {
    if (v.startsWith('2')) continue;
    for (let s = 1; s <= 30; s++) {
      const { g } = guionDe(m, marcosFC(), losDelFondo(), s);
      assert.ok(!tipos(g).includes('cruce') && !tipos(g).includes('planb'), `${v}, semilla ${s}`);
    }
  }
});

test('plan B: una escena por equipo que cambia y después el cruce nuevo, antes del resumen del descanso', () => {
  const A = { ...marcosFCv2(), tactica: 'posesion', plan_b: { condicion: 'empatando', tactica: 'contraataque' } };
  const B = { ...losDelFondoV2(), tactica: 'contraataque', plan_b: { condicion: 'empatando', tactica: 'presion' } };
  let conPlanB = 0, sinPlanB = 0;
  for (let s = 1; s <= 120; s++) {
    const { r, g } = guionDe(MOTOR_ACTUAL, A, B, s);
    const planes = r.eventos.filter(e => e.tipo === 'plan_b');
    const desc = r.eventos.find(e => e.tipo === 'descanso');
    const t = tipos(g), iD = t.indexOf('descanso');
    const antes = g.escenas.slice(0, iD).filter(e => e.jugada === desc.jugada && ['planb', 'cruce'].includes(e.tipo));
    if (!planes.length) {
      sinPlanB++;
      assert.equal(t.filter(x => x === 'planb').length, 0);
      assert.equal(t.filter(x => x === 'cruce').length, 1, 'sin plan B, solo el cruce del principio');
      continue;
    }
    conPlanB++;
    assert.deepEqual(antes.map(e => e.tipo), [...planes.map(() => 'planb'), 'cruce'], `semilla ${s}: ${t.join(' ')}`);
    planes.forEach((p, k) => {
      assert.deepEqual({ equipo: antes[k].equipo, de: antes[k].de, a: antes[k].a, condicion: antes[k].condicion }, { equipo: p.equipo, de: p.de, a: p.a, condicion: p.condicion });
    });
    const c = antes.at(-1);
    assert.deepEqual(c.tacticas, desc.tacticas);
    assert.equal(c.cruce, desc.cruce);
    assert.equal(c.momento, 'descanso');
    assert.equal(t[iD - 1], 'cruce', 'el cruce nuevo, justo antes del resumen');
  }
  assert.ok(conPlanB > 0 && sinPlanB > 0, `partidos con plan B (${conPlanB}) y sin él (${sinPlanB})`);
});

test('duelo de control: las cartas del medio campo de cada equipo que están jugando en ese momento', () => {
  for (let s = 1; s <= 80; s++) {
    const A = marcosFCv2(), B = losDelFondoV2();
    const { r, g } = guionDe(MOTOR_ACTUAL, A, B, s);
    // Los medios titulares, siguiendo los cambios y lesiones del motor
    const med = { A: A.med.map(c => c.id), B: B.med.map(c => c.id) };
    let k = 0;
    for (const e of r.eventos) {
      const sale = e.tipo === 'cambio' ? e.sale : e.tipo === 'lesion' && e.suplente ? e.carta : null;
      if (sale) { const i = med[e.equipo].indexOf(sale); if (i >= 0) med[e.equipo][i] = e.tipo === 'cambio' ? e.entra : e.suplente; }
      if (e.tipo === 'posesion') {
        const esc = g.escenas.filter(x => x.tipo === 'control')[k++];
        assert.deepEqual(esc.medios, med, `semilla ${s}, jugada ${e.jugada}`);
      }
    }
  }
  // Sin medios: cualquier titular menos el portero
  const A = { ...marcosFCv2() }, B = losDelFondoV2();
  A.del = [...A.del, ...A.med]; A.med = []; A.formacion = '2-0-4';
  const g = crearGuion({ alineaciones: { local: A, visitante: B }, eventos: [{ jugada: 1, minuto: 2, tipo: 'posesion', saca: 'A', ganador: 'A', p: 0.6 }] });
  const c = g.escenas.find(e => e.tipo === 'control');
  assert.deepEqual(c.medios.A, [...A.def, ...A.del].map(x => x.id));
  assert.ok(!c.medios.A.includes(A.por.id));
});
