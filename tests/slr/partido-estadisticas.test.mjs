// Tests de las estadísticas de la pantalla del partido (js/slr/partido/estadisticas.js):
// en partidos simulados con todas las versiones del motor (liga y copa) cuadran con lo
// que cuenta el propio motor (estadisticas, goles, PR) y con los eventos; quién jugó y
// en qué línea; y las notas (conversión de PR, nota esperada, orden y mejor carta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOTORES } from '../../js/slr/motores.js';
import { estadisticasPartido, jugadores, notasPartido, notaDePR, notaEsperada, NOTA_LINEA } from '../../js/slr/partido/estadisticas.js';
import { marcosFC, losDelFondo, marcosFCv2, losDelFondoV2 } from './cartas-prueba.mjs';

const equipos = v => (v === '2.0.0' ? [marcosFCv2(), losDelFondoV2()] : [marcosFC(), losDelFondo()]);
const ovr = c => { const v = [c.ATA, c.DEF, c.CON].sort((a, b) => b - a); return Math.round(0.6 * v[0] + 0.25 * v[1] + 0.15 * v[2]); };
const cuenta = (evs, f) => [0, 1].map(i => evs.filter(e => f(e, ['A', 'B'][i])).length);

for (const [version, motor] of Object.entries(MOTORES)) {
  test(`motor ${version}: las estadísticas cuadran con el motor y con los eventos (300 partidos de liga y 100 de copa)`, () => {
    let conCambios = 0, conPenaltis = 0;
    for (let s = 1; s <= 400; s++) {
      const [A, B] = equipos(version);
      const r = motor.simularPartido(A, B, s, s > 300 ? { modo: 'copa' } : {});
      const ev = r.eventos;
      const e = estadisticasPartido(ev);
      const m = r.estadisticas;
      assert.deepEqual(e.controles, m.posesiones, `posesiones (semilla ${s})`);
      assert.deepEqual(e.ataques, m.ocasiones, 'ataques que superan la defensa');
      assert.deepEqual(e.cortes, m.cortes, 'cortes');
      assert.deepEqual(e.tiros, m.tiros, 'tiros');
      assert.deepEqual(e.paradas, m.paradas, 'paradas');
      assert.deepEqual(e.goles, r.goles, 'goles');
      assert.deepEqual(e.goleadores.map(g => g.equipo).sort(), [...'A'.repeat(r.goles[0]), ...'B'.repeat(r.goles[1])], 'un goleador por gol');
      assert.deepEqual(e.robos, cuenta(ev, (x, l) => x.tipo === 'posesion' && x.ganador === l && x.contraataque), 'robos = contraataques');
      assert.deepEqual(e.poderes, cuenta(ev, (x, l) => x.tipo === 'poder' && x.equipo === l), 'poderes');
      for (const i of [0, 1]) {
        const xg = ev.filter(x => x.tipo === 'chut' && x.equipo === 'AB'[i]).reduce((a, x) => a + x.p, 0);
        assert.ok(Math.abs(e.xg[i] - xg) < 1e-9, 'goles esperados');
        assert.ok(e.xg[i] <= e.tiros[i], 'nunca más goles esperados que tiros');
      }
      assert.ok(Math.abs(e.posesion[0] + e.posesion[1] - 1) < 1e-9);
      assert.equal(e.controles[0] + e.controles[1], ev.filter(x => x.tipo === 'posesion').length);
      // Goleadores: un tirador de su equipo, con el minuto del chut
      for (const g of e.goleadores) {
        const chut = ev.find(x => x.tipo === 'chut' && x.gol && x.jugada === g.jugada && x.equipo === g.equipo);
        assert.equal(g.carta, chut.tirador); assert.equal(g.minuto, chut.minuto);
      }
      // Penaltis: los de la tanda (solo en copa con empate)
      if (r.penaltis) { conPenaltis++; assert.deepEqual(e.penaltis, [...(r.penaltis.goles ?? r.penaltis)]); } else assert.equal(e.penaltis, null);
      // Quién jugó: exactamente las cartas con PR del motor, cada una en una línea de su equipo
      const j = jugadores({ local: A, visitante: B }, ev);
      assert.deepEqual(Object.keys(j.linea).sort(), Object.keys(r.pr).sort(), `jugaron = cartas con PR (semilla ${s})`);
      if (j.cambios.length) conCambios++;
      for (const c of j.cambios) assert.equal(j.linea[c.entra], j.linea[c.sale], 'el que entra juega en la línea del que sale');
      // Notas: una por carta que jugó, ordenadas, entre 0 y 10, una sola mejor
      const medias = Object.fromEntries(Object.entries(j.cartas).map(([id, c]) => [id, ovr(c)]));
      const n = notasPartido({ jugadores: j, pr: r.pr, medias });
      assert.equal(n.length, Object.keys(r.pr).length);
      assert.ok(n.every((x, k) => x.nota >= 0 && x.nota <= 10 && x.esperada >= 3 && x.esperada <= 8 && (k === 0 || n[k - 1].nota >= x.nota)));
      assert.equal(n.filter(x => x.mejor).length, 1);
      assert.ok(n[0].mejor);
    }
    assert.ok(conCambios > 0, 'algún partido con cambios o lesiones');
    assert.ok(conPenaltis > 0, 'algún partido con penaltis');
  });
}

test('notas: conversión de PR por línea, nota esperada por la media y diferencia', () => {
  // Una carta normal en su línea saca un 5; un punto de nota vale «escala» PR
  for (const [l, { ref, escala }] of Object.entries(NOTA_LINEA)) {
    assert.equal(notaDePR(ref, l), 5);
    assert.equal(notaDePR(ref + escala, l), 6);
  }
  assert.equal(notaDePR(-7, 'por'), 0, 'nunca por debajo de 0');
  assert.equal(notaDePR(24, 'del'), 10, 'nunca por encima de 10');
  assert.equal(notaDePR(undefined, 'def'), notaDePR(0, 'def'));
  // Esperada: 5 + (media − media de todas) / 10, entre 3 y 8
  assert.equal(notaEsperada(70, 70), 5);
  assert.equal(notaEsperada(85, 70), 6.5);
  assert.equal(notaEsperada(20, 70), 3);
  assert.equal(notaEsperada(120, 70), 8);
  const j = { A: {}, B: {}, linea: { a: 'del', b: 'por', c: 'def' }, equipo: { a: 'A', b: 'B', c: 'A' } };
  const n = notasPartido({ jugadores: j, pr: { a: 8.1, b: 2, c: 0.9 }, medias: { a: 80, b: 70, c: 60 } });
  assert.deepEqual(n.map(x => x.id), ['a', 'b', 'c'], 'ordenadas por nota (en empate, por PR)');
  assert.deepEqual(n.map(x => [x.nota, x.esperada, x.diferencia]), [[8, 6, 2], [5, 5, 0], [5, 4, 1]]);
  assert.ok(n[0].mejor && !n[1].mejor && !n[2].mejor);
});
