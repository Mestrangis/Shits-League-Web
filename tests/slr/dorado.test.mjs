// Test dorado y propiedades generales del motor.
// El dorado fija la salida completa de un partido (semilla 12345): cualquier
// cambio de comportamiento, por pequeño que sea, lo rompe. Si el cambio es
// intencionado, es una versión nueva del motor (ver generar-dorado.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simularPartido, simularPronostico, VERSION, CONFIG } from '../../js/slr/motor-v1.1.0.js';
import { marcosFC, losDelFondo } from './cartas-prueba.mjs';

const dorado = JSON.parse(readFileSync(new URL('./dorado-v1.1.0-semilla-12345.json', import.meta.url), 'utf8'));

// Ida y vuelta por JSON: así se compara exactamente lo que se guardaría
const comoJSON = x => JSON.parse(JSON.stringify(x));

test('v1.1.0, semilla 12345: la salida es idéntica al archivo dorado', () => {
  assert.deepEqual(comoJSON(simularPartido(marcosFC(), losDelFondo(), 12345)), dorado);
});

test('dos ejecuciones seguidas dan exactamente lo mismo', () => {
  const a = simularPartido(marcosFC(), losDelFondo(), 12345);
  const b = simularPartido(marcosFC(), losDelFondo(), 12345);
  assert.deepEqual(a, b);
});

test('las alineaciones de entrada no se modifican', () => {
  const A = marcosFC(), B = losDelFondo();
  const antesA = structuredClone(A), antesB = structuredClone(B);
  // Varias semillas para que haya cansancio (y con suerte alguna lesión)
  for (let s = 1; s <= 300; s++) simularPartido(A, B, s);
  assert.deepEqual(A, antesA);
  assert.deepEqual(B, antesB);
});

test('la posesión usa el duelo lineal y el resto el cuadrático', () => {
  const r = simularPartido(marcosFC(), losDelFondo(), 12345);
  assert.equal(CONFIG.POSESION_K, 1);
  for (const e of r.eventos) {
    if (e.tipo === 'posesion') {
      const [fSaca, fRival] = e.saca === 'A' ? e.fuerzas : [e.fuerzas[1], e.fuerzas[0]];
      assert.equal(e.p, fSaca / (fSaca + fRival));
    }
    if (e.tipo === 'ocasion') {
      const a2 = e.fuerzaAtaque * e.fuerzaAtaque, d2 = e.fuerzaDefensa * e.fuerzaDefensa;
      assert.equal(e.p, a2 / (a2 + d2));
    }
  }
});

test('estructura de la salida', () => {
  const r = simularPartido(marcosFC(), losDelFondo(), 12345);
  assert.equal(r.version, VERSION);
  assert.equal(r.penaltis, null);
  for (const k of ['posesiones', 'ocasiones', 'cortes', 'tiros', 'goles', 'paradas']) {
    assert.equal(r.estadisticas[k].length, 2, k);
  }
  assert.deepEqual(r.estadisticas.goles, r.goles);
  const e = r.eventos;
  assert.equal(e.filter(x => x.tipo === 'inicio_jugada').length, CONFIG.JUGADAS);
  assert.equal(e.at(-1).tipo, 'fin_partido');
  for (const ev of e) {
    assert.ok('jugada' in ev && 'minuto' in ev && 'tipo' in ev, JSON.stringify(ev));
    assert.ok(ev.minuto >= 2 && ev.minuto <= 90, `minuto ${ev.minuto}`);
  }
});

test('invariantes en 2.000 partidos', () => {
  for (let s = 1; s <= 2000; s++) {
    const r = simularPartido(marcosFC(), losDelFondo(), s);
    const est = r.estadisticas;
    for (const i of [0, 1]) {
      assert.equal(est.posesiones[0] + est.posesiones[1], CONFIG.JUGADAS);
      assert.equal(est.tiros[i], est.ocasiones[i], 'cada ocasión lograda acaba en tiro');
      assert.equal(est.goles[i] + est.paradas[1 - i], est.tiros[i], 'cada tiro es gol o parada');
    }
    assert.equal(est.ocasiones[0] + est.ocasiones[1] + est.cortes[0] + est.cortes[1], CONFIG.JUGADAS);

    // Minutos crecientes por jugada
    const minutos = r.eventos.filter(x => x.tipo === 'inicio_jugada').map(x => x.minuto);
    for (let j = 1; j < minutos.length; j++) assert.ok(minutos[j] > minutos[j - 1]);

    // Las probabilidades de la ruleta suman 1
    for (const t of r.eventos.filter(x => x.tipo === 'tirador')) {
      const suma = t.candidatos.reduce((acc, c) => acc + c.p, 0);
      assert.ok(Math.abs(suma - 1) < 1e-12);
    }

    // Stats tras el cansancio: enteros y como mínimo 1
    for (const c of r.eventos.filter(x => x.tipo === 'cansancio')) {
      assert.ok(Number.isInteger(c.valor) && c.valor >= 1);
    }

    // Cambios: como máximo 3 por equipo y cada suplente una sola vez
    for (const eq of ['A', 'B']) {
      const entran = r.eventos.filter(x => x.tipo === 'lesion' && x.equipo === eq && x.suplente).map(x => x.suplente);
      assert.ok(entran.length <= CONFIG.MAX_CAMBIOS);
      assert.equal(new Set(entran).size, entran.length);
    }
  }
});

test('lesión con suplente: entra el de stat más alta para el hueco y acumula PR', () => {
  let visto = 0;
  for (let s = 1; s <= 20000 && visto < 5; s++) {
    const r = simularPartido(marcosFC(), losDelFondo(), s);
    const les = r.eventos.find(x => x.tipo === 'lesion' && x.suplente);
    if (!les) continue;
    visto++;
    // Primer cambio del equipo: el banquillo está completo
    const banquillo = (les.equipo === 'A' ? marcosFC() : losDelFondo()).banquillo;
    const stat = { por: 'DEF', def: 'DEF', med: 'CON', del: 'ATA' }[les.hueco];
    const mejor = banquillo.reduce((m, c) => (c[stat] > m[stat] ? c : m));
    assert.equal(les.suplente, mejor.id, `semilla ${s}`);
    assert.ok(les.suplente in r.pr, 'el suplente debe tener PR');
  }
  assert.ok(visto > 0, 'no se encontró ninguna lesión con suplente');
});

test('lesión con orden manual: entra el primero del banquillo', () => {
  const A = { ...marcosFC(), orden_manual: true };
  let visto = false;
  for (let s = 1; s <= 20000 && !visto; s++) {
    const r = simularPartido(A, losDelFondo(), s);
    const les = r.eventos.find(x => x.tipo === 'lesion' && x.equipo === 'A' && x.suplente);
    if (!les) continue;
    visto = true;
    assert.equal(les.suplente, A.banquillo[0].id);
  }
  assert.ok(visto);
});

test('lesión sin suplente: la carta sigue jugando con sus stats al 70 %', () => {
  // Sin banquillo. Se reconstruyen las stats de la carta lesionada a partir de
  // los eventos (base → cansancios → ×0,7) y se comparan con lo que el motor
  // emite después: cansancios de esa carta y chuts que para (si es el portero,
  // que en Marcos no tiene poderes de parada).
  const A = { ...marcosFC(), banquillo: [] };
  const base = Object.fromEntries([A.por, ...A.def, ...A.med, ...A.del].map(c => [c.id, c]));
  let comprobaciones = 0, lesiones = 0;
  for (let s = 1; s <= 40000 && comprobaciones < 5; s++) {
    const r = simularPartido(A, losDelFondo(), s);
    const i = r.eventos.findIndex(x => x.tipo === 'lesion' && x.equipo === 'A');
    if (i < 0) continue;
    lesiones++;
    const id = r.eventos[i].carta;
    assert.equal(r.eventos[i].suplente, null);

    const st = { ATA: base[id].ATA, DEF: base[id].DEF, CON: base[id].CON };
    let lesionado = false;
    r.eventos.forEach((e, k) => {
      if (e.tipo === 'cansancio' && e.carta === id) {
        const esperado = Math.max(1, st[e.stat] - 4);
        if (lesionado) { assert.equal(e.valor, esperado, `semilla ${s}`); comprobaciones++; }
        st[e.stat] = e.valor;
      }
      if (k === i) {
        for (const x of ['ATA', 'DEF', 'CON']) st[x] = Math.max(1, Math.round(st[x] * 0.7));
        lesionado = true;
      }
      if (lesionado && k > i && e.tipo === 'chut' && e.portero === id) {
        assert.equal(e.def, st.DEF, `semilla ${s}: el portero lesionado debe parar con DEF ${st.DEF}`);
        comprobaciones++;
      }
    });
  }
  assert.ok(lesiones > 0, 'no se encontró ninguna lesión');
  assert.ok(comprobaciones > 0, 'ninguna lesión tuvo eventos posteriores que comprobar');
});

test('copa: con empate hay penaltis, el marcador no cambia y siempre hay ganador', () => {
  let empates = 0;
  for (let s = 1; s <= 400; s++) {
    const liga = simularPartido(marcosFC(), losDelFondo(), s);
    const copa = simularPartido(marcosFC(), losDelFondo(), s, { modo: 'copa' });
    assert.deepEqual(copa.goles, liga.goles, 'los penaltis no suman al marcador');
    if (liga.goles[0] !== liga.goles[1]) {
      assert.equal(copa.penaltis, null);
      continue;
    }
    empates++;
    const p = copa.penaltis;
    assert.ok(p, `semilla ${s}: faltan los penaltis`);
    assert.notEqual(p.goles[0], p.goles[1], 'la tanda debe tener ganador');
    // Alternan empezando A
    p.tandas.forEach((t, k) => assert.equal(t.equipo, k % 2 === 0 ? 'A' : 'B'));
    const marcados = eq => p.tandas.filter(t => t.equipo === eq && t.gol).length;
    assert.deepEqual([marcados('A'), marcados('B')], p.goles);
  }
  assert.ok(empates > 0, 'no hubo ningún empate en 400 semillas');
});

test('formación no permitida o mal rellenada: error claro', () => {
  assert.throws(() => simularPartido({ ...marcosFC(), formacion: '3-1-2' }, losDelFondo(), 1), /formación no permitida/);
  assert.throws(() => simularPartido({ ...marcosFC(), formacion: '2-2-2' }, losDelFondo(), 1), /pide 2 DEF/);
});

test('pronóstico: probabilidades suman 1 y es reproducible', () => {
  const p1 = simularPronostico(marcosFC(), losDelFondo(), 12345, 50);
  const p2 = simularPronostico(marcosFC(), losDelFondo(), 12345, 50);
  assert.deepEqual(p1, p2);
  assert.ok(Math.abs(p1.pA + p1.pEmpate + p1.pB - 1) < 1e-12);
  assert.ok(p1.prEsperado['m-pichichi'] > 0);
});
