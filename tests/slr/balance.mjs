// Balance del motor: 10.000 partidos con las semillas 1..10000. Solo informa.
//   node tests/slr/balance.mjs
// Referencia de la especificación (sección 5): ~2,3 goles por partido, ~20 % de empates.
import { simularPartido, VERSION } from '../../js/slr/motor-v1.0.0.js';
import { marcosFC, losDelFondo, conPrefijo } from './cartas-prueba.mjs';

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

console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
