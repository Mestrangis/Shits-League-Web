// Balance del motor: 10.000 partidos por escenario con las semillas 1..10000. Solo informa.
//   node tests/slr/balance.mjs            (motor actual)
//   node tests/slr/balance.mjs 1.1.0      (una versión concreta)
// Referencia de la especificación (sección 5): ~2,3 goles por partido, ~20 % de empates.
import { motorDe } from '../../js/slr/motores.js';
import { calcularValor, calcularOVR } from '../../js/slr/valor.js';
import { marcosFC, losDelFondo, conPrefijo } from './cartas-prueba.mjs';
import { catalogoBeta } from './catalogo-beta.mjs';

const { simularPartido, mulberry32, VERSION } = motorDe(process.argv[2]);
const N = 10000;
const pct = x => (100 * x).toFixed(1).padStart(5) + ' %';

function medir(A, B) {
  let goles = 0, empates = 0, ganaA = 0, ganaB = 0, conLesion = 0, lesiones = 0, cansancios = 0;
  const marcadores = new Map();
  for (let s = 1; s <= N; s++) {
    const r = simularPartido(A, B, s);
    const [a, b] = r.goles;
    goles += a + b;
    if (a > b) ganaA++; else if (b > a) ganaB++; else empates++;
    const nLes = r.eventos.filter(e => e.tipo === 'lesion').length;
    lesiones += nLes;
    if (nLes) conLesion++;
    cansancios += r.eventos.filter(e => e.tipo === 'cansancio').length;
    const k = `${a}-${b}`;
    marcadores.set(k, (marcadores.get(k) ?? 0) + 1);
  }
  return {
    goles: goles / N, pA: ganaA / N, pEmpate: empates / N, pB: ganaB / N,
    conLesion: conLesion / N, lesiones: lesiones / N, cansancios: cansancios / N,
    top: [...marcadores].sort((x, y) => y[1] - x[1]).slice(0, 6),
  };
}

const t0 = Date.now();
console.log(`Motor v${VERSION} · ${N.toLocaleString('es-ES')} partidos por escenario (semillas 1..${N})\n`);

// Dos espejos: el resultado depende mucho de la formación de las cartas de prueba
// (Marcos FC juega 1-3-2 con un solo defensa; Los del Fondo, 2-2-2)
for (const [titulo, al] of [['Marcos FC contra Marcos FC (1-3-2)', marcosFC()], ['Los del Fondo contra Los del Fondo (2-2-2)', losDelFondo()]]) {
  const espejo = medir(conPrefijo(al, 'A:'), conPrefijo(al, 'B:'));
  console.log(`(a) Equipos espejo: ${titulo}`);
  console.log(`    Goles por partido          ${espejo.goles.toFixed(2)}   (referencia ~2,3)`);
  console.log(`    Empates                   ${pct(espejo.pEmpate)}   (referencia ~20 %)`);
  console.log(`    Gana A / gana B           ${pct(espejo.pA)} / ${pct(espejo.pB)}   (A solo saca primero)`);
  console.log(`    Partidos con lesión       ${pct(espejo.conLesion)}`);
  console.log(`    Lesiones / cansancios     ${espejo.lesiones.toFixed(3)} / ${espejo.cansancios.toFixed(2)} por partido`);
  console.log(`    Marcadores más frecuentes ${espejo.top.map(([k, v]) => `${k} (${pct(v / N).trim()})`).join(', ')}\n`);
}

const mf = medir(marcosFC(), losDelFondo());
console.log('(b) Marcos FC contra Los del Fondo');
console.log(`    pA / pEmpate / pB         ${pct(mf.pA)} / ${pct(mf.pEmpate)} / ${pct(mf.pB)}   (sección 14, a mano: 45 % / 22 % / 33 %)`);
console.log(`    Goles por partido          ${mf.goles.toFixed(2)}`);
console.log(`    Partidos con lesión       ${pct(mf.conLesion)}`);

/* ── (c) Equipos de cartas iguales: ¿gana el mejor? ──────────────────────── */
// Todas las cartas con ATA = DEF = CON = nivel, 2-2-2, sin poderes ni capitán.
function iguales(nivel, p) {
  const c = id => ({ id: p + id, nombre: id, ATA: nivel, DEF: nivel, CON: nivel, poderes: [] });
  return {
    formacion: '2-2-2', por: c('por'), def: [c('d1'), c('d2')], med: [c('m1'), c('m2')], del: [c('a1'), c('a2')],
    banquillo: [c('b1'), c('b2'), c('b3')], orden_manual: false, capitan_id: null,
  };
}

// El mejor juega N partidos de local (saca primero) y N de visitante
function mejorContraPeor(alto, bajo) {
  const M = iguales(alto, 'M:'), P = iguales(bajo, 'P:');
  let gana = 0, empata = 0, posesiones = 0, contrasRecibidos = 0, contrasPropios = 0, goles = 0;
  for (const mLocal of [true, false]) {
    const m = mLocal ? 'A' : 'B';
    for (let s = 1; s <= N; s++) {
      const r = mLocal ? simularPartido(M, P, s) : simularPartido(P, M, s);
      const [gm, gp] = mLocal ? r.goles : [r.goles[1], r.goles[0]];
      if (gm > gp) gana++; else if (gm === gp) empata++;
      goles += gm + gp;
      for (const e of r.eventos) {
        if (e.tipo !== 'posesion') continue;
        if (e.ganador === m) { posesiones++; if (e.contraataque) contrasPropios++; }
        else if (e.contraataque) contrasRecibidos++;
      }
    }
  }
  const T = 2 * N;
  return { gana: gana / T, empata: empata / T, pierde: 1 - (gana + empata) / T, posesiones: posesiones / T,
    contrasRecibidos: contrasRecibidos / T, contrasPropios: contrasPropios / T, goles: goles / T };
}

console.log('\n(c) Cartas todas iguales, 2-2-2, sin poderes (el mejor juega la mitad de local y la mitad de visitante)');
for (const [alto, bajo] of [[75, 65], [72, 68]]) {
  const r = mejorContraPeor(alto, bajo);
  console.log(`    ${alto} contra ${bajo}: gana el mejor ${pct(r.gana)} · empate ${pct(r.empata)} · pierde ${pct(r.pierde)} · ${r.goles.toFixed(2)} goles`);
  console.log(`      posesiones del mejor ${r.posesiones.toFixed(2)} de 10 · contraataques que recibe ${r.contrasRecibidos.toFixed(2)} · que hace ${r.contrasPropios.toFixed(2)}`);
}
const e70 = mejorContraPeor(70, 70);
console.log(`    Espejo 70 contra 70: ${e70.goles.toFixed(2)} goles por partido · empates ${pct(e70.empata)}`);

/* ── (d) Poderes activados por partido con el catálogo beta ──────────────── */
// Plantilla inicial como el servidor: 11 individuales del bombo (sin el 20 %
// más caro) con valor cerca de 11 × la media del bombo; alineación por defecto
// (la mejor 2-2-2, capitán el de más OVR). Con dúos y tríos: además los dúos
// y tríos indicados, al azar, que entran en la alineación si son mejores.
const catalogo = catalogoBeta({ version: VERSION === '1.1.0' ? '1.1.0' : '1.2.0' })
  .map(c => ({ ...c, valor: calcularValor(c), ovr: calcularOVR(c) }));
const individuales = catalogo.filter(c => c.tipo === 'individual').sort((a, b) => b.valor - a.valor || (a.id < b.id ? -1 : 1));
const bombo = individuales.slice(Math.round(individuales.length * 0.20));
const objetivo = 11 * bombo.reduce((s, c) => s + c.valor, 0) / bombo.length;
const duos = catalogo.filter(c => c.tipo === 'duo'), trios = catalogo.filter(c => c.tipo === 'trio');

function muestra(lista, n, rng, fuera = new Set()) {
  const l = lista.filter(c => !fuera.has(c.id));
  for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
  return l.slice(0, n);
}

function plantillaInicial(rng, fuera) {
  let mejor = null, dif = Infinity;
  for (let k = 0; k < 40 && dif > 0.1 * objetivo; k++) {
    const sel = muestra(bombo, 11, rng, fuera);
    const d = Math.abs(sel.reduce((s, c) => s + c.valor, 0) - objetivo);
    if (d < dif) { mejor = sel; dif = d; }
  }
  return mejor;
}

function alineacionPorDefecto(cartas, p) {
  let quedan = [...cartas];
  const tomar = (n, stat) => {
    const el = [...quedan].sort((a, b) => b[stat] - a[stat] || b.ovr - a.ovr).slice(0, n);
    quedan = quedan.filter(c => !el.includes(c));
    return el;
  };
  const por = tomar(1, 'DEF')[0], def = tomar(2, 'DEF'), med = tomar(2, 'CON'), del = tomar(2, 'ATA');
  const banquillo = tomar(3, 'ovr');
  const capitan = [por, ...def, ...med, ...del].sort((a, b) => b.ovr - a.ovr)[0];
  const m = c => ({ id: p + c.id, nombre: c.nombre, ATA: c.ATA, DEF: c.DEF, CON: c.CON, poderes: c.poderes });
  return { formacion: '2-2-2', por: m(por), def: def.map(m), med: med.map(m), del: del.map(m),
    banquillo: banquillo.map(m), orden_manual: false, capitan_id: p + capitan.id };
}

function poderesPorPartido(nDuos, nTrios) {
  const rng = mulberry32(20261014 + 10 * nDuos + nTrios);
  const PAREJAS = 200, SEMILLAS = 50;
  let partidos = 0, activados = 0, sorteados = 0, conPoder = 0, titularesConPoder = 0;
  for (let k = 0; k < PAREJAS; k++) {
    const usadas = new Set();
    const equipo = p => {
      const cartas = plantillaInicial(rng, usadas);
      cartas.push(...muestra(duos, nDuos, rng, usadas), ...muestra(trios, nTrios, rng, usadas));
      cartas.forEach(c => usadas.add(c.id));
      return alineacionPorDefecto(cartas, p);
    };
    const A = equipo('A:'), B = equipo('B:');
    for (const al of [A, B]) titularesConPoder += [al.por, ...al.def, ...al.med, ...al.del].filter(c => c.poderes.length).length;
    for (let s = 1; s <= SEMILLAS; s++) {
      const r = simularPartido(A, B, k * 1000 + s);
      const ev = r.eventos.filter(e => e.tipo === 'poder');
      partidos++;
      activados += ev.length;
      if (ev.length) conPoder++;
      sorteados += ev.filter(e => e.momento !== 'tirador').length;
    }
  }
  return { activados: activados / partidos, sorteados: sorteados / partidos, conPoder: conPoder / partidos,
    titularesConPoder: titularesConPoder / (2 * PAREJAS), partidos };
}

console.log('\n(d) Poderes activados por partido (los dos equipos), catálogo beta');
for (const [titulo, nDuos, nTrios] of [['Plantillas iniciales (11 individuales)', 0, 0],
  ['Con 1 dúo y 1 trío cada equipo', 1, 1], ['Con 2 dúos y 1 trío cada equipo', 2, 1]]) {
  const r = poderesPorPartido(nDuos, nTrios);
  console.log(`    ${titulo}: ${r.activados.toFixed(2)} por partido (${r.sorteados.toFixed(2)} sorteados, el resto "siempre")`);
  console.log(`      partidos con algún poder ${pct(r.conPoder)} · titulares con poder por equipo ${r.titularesConPoder.toFixed(2)} · ${r.partidos.toLocaleString('es-ES')} partidos`);
}

console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
