// Balance por formación: cada una contra todas (incluida ella misma). Solo informa.
//   node tests/slr/formaciones.mjs            (motor actual)
//   node tests/slr/formaciones.mjs 1.1.0      (una versión concreta)
// Cada cruce se juega con las semillas 1..10000 en los dos órdenes de local
// (20.000 partidos por cruce); el resultado de la fila suma ambos órdenes.
import { motorDe } from '../../js/slr/motores.js';

const { simularPartido, VERSION, CONFIG } = motorDe(process.argv[2]);

const N = 10000;
const FORMACIONES = CONFIG.FORMACIONES; // 2-2-2, 3-2-1, 1-3-2, 2-3-1, 1-2-3

const carta = (id, ATA, DEF, CON) => ({ id, nombre: id, ATA, DEF, CON, poderes: [] });

/* ── (a) Plantilla neutra: todo 70/70/70 ──────────────────────────────────── */
function neutra(formacion, p) {
  const [nDef, nMed, nDel] = formacion.split('-').map(Number);
  const serie = (pref, n) => Array.from({ length: n }, (_, i) => carta(`${p}${pref}${i + 1}`, 70, 70, 70));
  return {
    formacion,
    por: carta(`${p}por`, 70, 70, 70),
    def: serie('def', nDef),
    med: serie('med', nMed),
    del: serie('del', nDel),
    banquillo: serie('ban', 3),
    orden_manual: false,
    capitan_id: null,
  };
}

/* ── (b) Plantilla realista: 1 portero, 3 defensas, 3 medios, 3 delanteros ── */
function plantillaRealista(p) {
  return [
    carta(`${p}portero`, 30, 80, 40),
    ...[1, 2, 3].map(i => carta(`${p}defensa${i}`,  45, 78, 60)),
    ...[1, 2, 3].map(i => carta(`${p}medio${i}`,    60, 55, 80)),
    ...[1, 2, 3].map(i => carta(`${p}delantero${i}`, 82, 40, 62)),
  ];
}

// POR = el portero; DEF = las de más DEF; MED = las de más CON de las que quedan;
// DEL = las de más ATA de las que quedan; banquillo = las sobrantes (hasta 3).
// En empate se respeta el orden de la plantilla.
function realista(formacion, p) {
  const [nDef, nMed, nDel] = formacion.split('-').map(Number);
  const [portero, ...resto] = plantillaRealista(p);
  let quedan = resto.map((c, orden) => ({ c, orden }));
  const tomar = (n, stat) => {
    const elegidas = [...quedan].sort((x, y) => (y.c[stat] - x.c[stat]) || (x.orden - y.orden)).slice(0, n);
    quedan = quedan.filter(x => !elegidas.includes(x));
    return elegidas.sort((x, y) => x.orden - y.orden).map(x => x.c);
  };
  const def = tomar(nDef, 'DEF');
  const med = tomar(nMed, 'CON');
  const del = tomar(nDel, 'ATA');
  return {
    formacion, por: portero, def, med, del,
    banquillo: quedan.slice(0, 3).map(x => x.c),
    orden_manual: false,
    capitan_id: null,
  };
}

/* ── Cruces ──────────────────────────────────────────────────────────────── */
// Resultado de la formación f contra g en ambos órdenes de local
function cruce(crear, f, g) {
  let gana = 0, empata = 0, pierde = 0, goles = 0;
  for (const fLocal of [true, false]) {
    const F = crear(f, 'F:'), G = crear(g, 'G:');
    for (let s = 1; s <= N; s++) {
      const r = fLocal ? simularPartido(F, G, s) : simularPartido(G, F, s);
      const [gf, gg] = fLocal ? r.goles : [r.goles[1], r.goles[0]];
      goles += gf + gg;
      if (gf > gg) gana++; else if (gf < gg) pierde++; else empata++;
    }
  }
  const total = 2 * N;
  return { v: gana / total, e: empata / total, d: pierde / total, goles: goles / total };
}

function informe(titulo, crear) {
  console.log(`\n${'═'.repeat(72)}\n${titulo}\n${'═'.repeat(72)}`);

  // Un cruce por pareja no ordenada; la fila contraria es el mismo cruce visto al revés
  const res = {};
  for (let i = 0; i < FORMACIONES.length; i++) {
    for (let j = i; j < FORMACIONES.length; j++) {
      const f = FORMACIONES[i], g = FORMACIONES[j];
      const r = cruce(crear, f, g);
      res[`${f}|${g}`] = r;
      res[`${g}|${f}`] = { v: r.d, e: r.e, d: r.v, goles: r.goles };
    }
  }

  const col = 15;
  const cabecera = 'fila \\ rival'.padEnd(12) + FORMACIONES.map(f => f.padStart(col)).join('');

  console.log('\nVictorias de la fila (empates entre paréntesis), en %:\n');
  console.log(cabecera);
  for (const f of FORMACIONES) {
    console.log(f.padEnd(12) + FORMACIONES.map(g => {
      const r = res[`${f}|${g}`];
      return `${(100 * r.v).toFixed(1)} (${(100 * r.e).toFixed(1)})`.padStart(col);
    }).join(''));
  }

  console.log('\nGoles por partido (los dos equipos):\n');
  console.log(cabecera);
  for (const f of FORMACIONES) {
    console.log(f.padEnd(12) + FORMACIONES.map(g => res[`${f}|${g}`].goles.toFixed(2).padStart(col)).join(''));
  }

  console.log('\nClasificación: puntos por partido contra las otras 4 (victoria 3, empate 1):\n');
  const tabla = FORMACIONES.map(f => {
    const rivales = FORMACIONES.filter(g => g !== f).map(g => res[`${f}|${g}`]);
    const media = k => rivales.reduce((s, r) => s + r[k], 0) / rivales.length;
    return { f, puntos: 3 * media('v') + media('e'), v: media('v'), e: media('e'), d: media('d') };
  }).sort((x, y) => y.puntos - x.puntos);
  console.log('   formación   pts/partido   victorias   empates   derrotas');
  tabla.forEach((t, i) => {
    console.log(`${i + 1}. ${t.f.padEnd(9)} ${t.puntos.toFixed(3).padStart(13)} ${(100 * t.v).toFixed(1).padStart(10)} % ${(100 * t.e).toFixed(1).padStart(7)} % ${(100 * t.d).toFixed(1).padStart(8)} %`);
  });
}

const t0 = Date.now();
console.log(`Motor v${VERSION} · ${N.toLocaleString('es-ES')} semillas × 2 órdenes de local = ${(2 * N).toLocaleString('es-ES')} partidos por cruce`);

informe('(a) Plantilla neutra: todas las cartas 70/70/70, sin poderes', neutra);

console.log('\nColocación de la plantilla realista por formación:');
for (const f of FORMACIONES) {
  const al = realista(f, '');
  const n = cs => cs.map(c => c.id).join(', ');
  console.log(`   ${f}: DEF [${n(al.def)}] · MED [${n(al.med)}] · DEL [${n(al.del)}] · banquillo [${n(al.banquillo)}]`);
}
informe('(b) Plantilla realista (portero 30/80/40, defensas 45/78/60, medios 60/55/80, delanteros 82/40/62)', realista);

console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
