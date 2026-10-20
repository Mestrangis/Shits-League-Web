// Tests del adaptador de la reproducción de partidos (js/slr/partido/guion.js) y del azar
// de la animación (azar.js): con partidos simulados de todas las versiones del motor y
// cientos de semillas, nunca falla, el marcador del guion coincide con el del partido, los
// eventos desconocidos se ignoran y la misma semilla da el mismo guion y las mismas variantes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOTORES } from '../../js/slr/motores.js';
import { crearGuion } from '../../js/slr/partido/guion.js';
import { decorar } from '../../js/slr/partido/azar.js';
import { VARIANTES } from '../../js/slr/partido/escenas/registro.js';
import { marcosFC, losDelFondo, marcosFCv2, losDelFondoV2 } from './cartas-prueba.mjs';

const TIPOS = new Set(Object.keys(VARIANTES));
const equipos = { A: { id: 'eqA', nombre: 'Marcos FC', dueno: 'Marcos' }, B: { id: 'eqB', nombre: 'Los del Fondo', dueno: 'Pablo' } };
const alineaciones = v => (v.startsWith('2') ? { local: marcosFCv2(), visitante: losDelFondoV2() } : { local: marcosFC(), visitante: losDelFondo() });

function partido(version, semilla, opciones) {
  const al = alineaciones(version);
  const r = MOTORES[version].simularPartido(al.local, al.visitante, semilla, opciones);
  return { r, al, p: { id: `p-${version}-${semilla}`, version_motor: version, goles: r.goles, pr: r.pr } };
}
const guionDe = (version, semilla, extra = {}) => {
  const { r, al, p } = partido(version, semilla);
  return { r, g: crearGuion({ partido: p, alineaciones: al, eventos: r.eventos, equipos, ...extra }) };
};

test('todas las versiones (v1.1.0 a v2.0.0), cientos de semillas: nunca falla y el marcador coincide', () => {
  for (const version of Object.keys(MOTORES)) {
    let goles = 0, cortes = 0, robos = 0, poderes = 0, descansos = 0;
    for (let s = 1; s <= 300; s++) {
      const { r, g } = guionDe(version, s * 7919);
      assert.deepEqual(g.final.marcadorGuion, r.goles, `${version} semilla ${s}: el marcador del guion`);
      assert.deepEqual(g.final.goles, r.goles);
      const tipos = g.escenas.map(e => e.tipo);
      assert.equal(tipos[0], 'inicio');
      assert.equal(tipos.at(-1), 'final');
      for (const t of tipos) assert.ok(TIPOS.has(t), `${version}: tipo de escena con variantes: ${t}`);
      assert.equal(tipos.filter(t => t === 'saque').length, 10, 'una escena de saque por jugada');
      assert.equal(tipos.filter(t => t === 'control').length, 10, 'un duelo de control por jugada');
      assert.equal(tipos.filter(t => t === 'gol').length, r.goles[0] + r.goles[1], 'una escena de gol por gol');
      assert.equal(tipos.filter(t => t === 'descanso').length, 1, 'un descanso (también en las versiones sin evento de descanso)');
      // El último gol deja el marcador final; cada gol suma uno al anterior
      for (const e of g.escenas.filter(x => x.tipo === 'gol')) {
        assert.equal(e.marcadorTras[0] + e.marcadorTras[1], e.marcador[0] + e.marcador[1] + 1);
      }
      // Probabilidades y cartas: las del evento
      for (const e of g.escenas) {
        if (e.p != null) assert.ok(e.p > 0 && e.p < 1, `p en (0, 1): ${e.tipo} ${e.p}`);
        if (e.tipo === 'control') assert.equal(e.robo, e.ganador !== e.saca);
        if (e.tipo === 'tirador') assert.ok(e.candidatos.some(c => c.carta === e.elegido));
        if (e.tipo === 'corte' || e.tipo === 'ataque') assert.ok(e.defensas.length >= 1 && e.defensas.every(d => d.DEF > 0));
      }
      goles += r.goles[0] + r.goles[1];
      cortes += tipos.filter(t => t === 'corte').length;
      robos += tipos.filter(t => t === 'robo').length;
      poderes += tipos.filter(t => t === 'poder').length;
      descansos += g.escenas.filter(e => e.tipo === 'descanso' && !e.sintetico).length;
    }
    assert.ok(goles > 0 && cortes > 0 && robos > 0, `${version}: hay goles (${goles}), cortes (${cortes}) y robos (${robos})`);
    if (version.startsWith('2')) assert.equal(descansos, 300, 'v2: el descanso sale del evento del motor');
    else assert.equal(descansos, 0, 'v1: el descanso lo pone el adaptador');
    assert.ok(poderes >= 0);
  }
});

test('el partido manda: el resultado guardado y la mejor carta (más PR)', () => {
  const { r, al, p } = partido('2.0.0', 4242);
  const g = crearGuion({ partido: p, alineaciones: al, eventos: r.eventos, equipos });
  const mejor = Object.entries(r.pr).sort((a, b) => b[1] - a[1])[0];
  assert.equal(g.final.mejor.carta, mejor[0]);
  assert.ok(['A', 'B'].includes(g.final.mejor.equipo));
  // Sin PR en el partido, el que se pase aparte
  const g2 = crearGuion({ partido: { ...p, pr: null }, alineaciones: al, eventos: r.eventos, equipos, pr: { [mejor[0]]: 1 } });
  assert.equal(g2.final.mejor.carta, mejor[0]);
});

test('copa: la tanda de penaltis va al final y no cambia el marcador del partido', () => {
  let con = 0;
  for (let s = 1; s <= 200 && con < 3; s++) {
    const al = alineaciones('2.0.0');
    const r = MOTORES['2.0.0'].simularPartido(al.local, al.visitante, s, { modo: 'copa' });
    if (!r.penaltis) continue;
    con++;
    const g = crearGuion({ partido: { id: 'c', version_motor: '2.0.0', goles: r.goles, penaltis: r.penaltis }, alineaciones: al, eventos: r.eventos, equipos });
    assert.deepEqual(g.final.marcadorGuion, r.goles);
    assert.deepEqual(g.final.penaltis, r.penaltis.goles);
    assert.ok(g.final.tanda.length >= 2);
  }
  assert.ok(con > 0, 'alguna copa con penaltis');
});

test('los eventos desconocidos o mal formados se ignoran sin romper nada', () => {
  const { r, al, p } = partido('2.0.0', 777);
  const limpio = crearGuion({ partido: p, alineaciones: al, eventos: r.eventos, equipos });
  const ruido = [];
  for (const e of r.eventos) {
    ruido.push(e);
    ruido.push({ jugada: e.jugada, minuto: e.minuto, tipo: 'tormenta', fuerza: 9 });
    ruido.push({ jugada: e.jugada, tipo: 'poder', momento: 'baile' });   // poder de un momento que no existe
  }
  ruido.push(null, 42, 'texto', { tipo: 'posesion' }, { tipo: 'chut', equipo: 'A' }, { tipo: 'ocasion' });
  const sucio = crearGuion({ partido: p, alineaciones: al, eventos: ruido, equipos });
  assert.deepEqual(sucio.escenas.map(e => e.tipo), limpio.escenas.map(e => e.tipo));
  assert.deepEqual(sucio.final, limpio.final);
  // Sin eventos ni alineaciones: un guion mínimo (inicio y final)
  const vacio = crearGuion({ partido: { id: 'x', goles: [0, 0] } });
  assert.deepEqual(vacio.escenas.map(e => e.tipo), ['inicio', 'final']);
});

test('tu equipo abajo (ataca hacia arriba); si no juegas, el local', () => {
  const { r, al, p } = partido('2.0.0', 5);
  assert.deepEqual(crearGuion({ partido: p, alineaciones: al, eventos: r.eventos, equipos, yo: 'eqB' }).lados, { abajo: 'B', arriba: 'A' });
  assert.deepEqual(crearGuion({ partido: p, alineaciones: al, eventos: r.eventos, equipos, yo: 'eqA' }).lados, { abajo: 'A', arriba: 'B' });
  assert.deepEqual(crearGuion({ partido: p, alineaciones: al, eventos: r.eventos, equipos, yo: 'otro' }).lados, { abajo: 'A', arriba: 'B' });
});

test('la misma semilla da el mismo guion y las mismas variantes; sin repetir la misma seguida', () => {
  for (const version of Object.keys(MOTORES)) {
    for (const s of [1, 99, 12345]) {
      const a = decorar(guionDe(version, s).g, `p-${s}`, VARIANTES);
      const b = decorar(guionDe(version, s).g, `p-${s}`, VARIANTES);
      assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
      const ultima = {};
      for (const e of a.escenas) {
        assert.ok(VARIANTES[e.tipo].includes(e.variante), `variante registrada: ${e.tipo}/${e.variante}`);
        if (VARIANTES[e.tipo].length > 1) assert.notEqual(e.variante, ultima[e.tipo], `${e.tipo}: no se repite seguida`);
        ultima[e.tipo] = e.variante;
        if (e.tipo === 'corte') assert.ok(e.defensas.some(d => d.carta === e.corta), 'corta una de las defensas');
      }
    }
  }
  // Otro partido (otro id): otras variantes en algún sitio
  const x = decorar(guionDe('2.0.0', 3).g, 'uno', VARIANTES).escenas.map(e => e.variante).join();
  const y = decorar(guionDe('2.0.0', 3).g, 'otro', VARIANTES).escenas.map(e => e.variante).join();
  assert.notEqual(x, y);
});

test('ritmo: duelos igualados completos, muy claros rápidos; al final con el marcador igualado, completos', () => {
  const g = decorar(guionDe('2.0.0', 2024).g, 'r', VARIANTES);
  for (const e of g.escenas.filter(x => x.tipo === 'control')) {
    const igualado = e.p >= 0.4 && e.p <= 0.6;
    const final = e.jugada >= 8 && Math.abs(e.marcador[0] - e.marcador[1]) <= 1;
    assert.equal(e.completo, igualado || final, `jugada ${e.jugada}, p ${e.p.toFixed(2)}`);
  }
});

test('qué defensa corta: más a menudo la de más DEF', () => {
  const g = crearGuion({ partido: { id: 'd' }, eventos: [], equipos });
  const cuenta = { fuerte: 0, flojo: 0 };
  for (let k = 0; k < 2000; k++) {
    const esc = { tipo: 'corte', jugada: k, defensas: [{ carta: 'fuerte', DEF: 90 }, { carta: 'flojo', DEF: 45 }] };
    decorar({ escenas: [esc] }, `d${k}`, VARIANTES);
    cuenta[esc.corta]++;
  }
  assert.ok(cuenta.fuerte > cuenta.flojo * 2.5, JSON.stringify(cuenta));   // (90/45)² = 4
  assert.ok(g.escenas.length === 2);
});
