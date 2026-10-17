// Informe de balance del motor v2.0.0 (tácticas, cruce, sinergias, energía,
// cambios en el descanso). No es un test: imprime los números.
//   node tests/slr/balance-v2.mjs [partidos por caso, por defecto 20000]
// Cada enfrentamiento se juega la mitad de las veces con los equipos cambiados
// de lado (quien saca primero no influye). Equipos "de 70": 2-2-2 con todas las
// stats a 70, sin poderes, con 3 suplentes de 66.
import {
  simularPartido, aplicarEnergia, factorEnergia, CONFIG,
} from '../../js/slr/motor-v2.0.0.js';
import { generarStats } from '../../js/slr/generador.js';

const N = Number(process.argv[2] ?? 20000);
const pct = x => `${(100 * x).toFixed(1)} %`;
const carta = (id, v, extra = {}) => ({ id, nombre: id, ATA: v, DEF: v, CON: v, poderes: [], ...extra });
function equipo(p, v = 70, extra = {}, porCarta = {}) {
  const c = k => carta(p + k, v, porCarta[k] ?? {});
  return { formacion: '2-2-2', por: c('por'), def: [c('d1'), c('d2')], med: [c('m1'), c('m2')], del: [c('a1'), c('a2')],
    banquillo: [carta(p + 'b1', v - 4), carta(p + 'b2', v - 4), carta(p + 'b3', v - 4)], orden_manual: false, capitan_id: null, ...extra };
}

// X contra Y: % de victorias, empates y derrotas de X, goles por partido
function enfrentar(fx, fy, n = N, opciones = {}) {
  let g = 0, e = 0, p = 0, goles = 0, cambios = [0, 0], planB = [0, 0];
  for (let i = 0; i < n; i++) {
    const xA = i % 2 === 0;
    const r = xA ? simularPartido(fx('A'), fy('B'), 1000 + i, opciones) : simularPartido(fy('A'), fx('B'), 1000 + i, opciones);
    const [gx, gy] = xA ? r.goles : [r.goles[1], r.goles[0]];
    if (gx > gy) g++; else if (gx < gy) p++; else e++;
    goles += gx + gy;
    const [lx, ly] = xA ? ['A', 'B'] : ['B', 'A'];
    cambios[0] += r.cambios_descanso[lx]; cambios[1] += r.cambios_descanso[ly];
    planB[0] += r.plan_b[lx] ? 1 : 0; planB[1] += r.plan_b[ly] ? 1 : 0;
  }
  return { g: g / n, e: e / n, p: p / n, goles: goles / n, cambios: cambios.map(x => x / n), planB: planB.map(x => x / n) };
}
const linea = r => `gana ${pct(r.g)} · empata ${pct(r.e)} · pierde ${pct(r.p)} · ${r.goles.toFixed(2)} goles/partido`;

console.log(`\nMOTOR v2.0.0 · ${N} partidos por caso\n`);

/* 1. Tácticas entre equipos iguales de 70 */
console.log('1. Equipos iguales de 70 (con cruce): fila contra columna');
const T = CONFIG.TACTICAS;
const matriz = {};
for (const x of T) for (const y of T) {
  matriz[x + y] = enfrentar(p => equipo(p, 70, { tactica: x }), p => equipo(p, 70, { tactica: y }));
}
for (const x of T) console.log(`   ${x.padEnd(13)} ${T.map(y => `${y}: ${pct(matriz[x + y].g)}/${pct(matriz[x + y].e)}/${pct(matriz[x + y].p)}`).join('  ·  ')}`);
const ganaCruce = [['contraataque', 'posesion'], ['posesion', 'presion'], ['presion', 'contraataque']].map(([a, b]) => matriz[a + b]);
const media = k => ganaCruce.reduce((s, r) => s + r[k], 0) / 3;
console.log(`   → quien gana el cruce: gana ${pct(media('g'))} · empata ${pct(media('e'))} · pierde ${pct(media('p'))}   (objetivo ~49 / 24)`);
const misma = T.map(t => matriz[t + t]);
const mediaM = k => misma.reduce((s, r) => s + r[k], 0) / 3;
console.log(`   → misma táctica: ${pct(mediaM('g'))} / ${pct(mediaM('e'))} / ${pct(mediaM('p'))}   (objetivo ~37 / 26 / 37)`);
console.log(`   → goles por partido: ${T.map(t => `${t} ${matriz[t + t].goles.toFixed(2)}`).join(' · ')} · media de los 9 cruces ${(Object.values(matriz).reduce((s, r) => s + r.goles, 0) / 9).toFixed(2)}   (objetivo ~3)`);

/* 2. Cada táctica por sí sola (sin el bonus del cruce) */
console.log('\n2. Cada táctica por sí sola, SIN el bonus del cruce (objetivo: ninguna a más de ±3 puntos de otra)');
let peor = 0;
for (const [x, y] of [['posesion', 'contraataque'], ['posesion', 'presion'], ['contraataque', 'presion']]) {
  const r = enfrentar(p => equipo(p, 70, { tactica: x }), p => equipo(p, 70, { tactica: y }), N, { sinCruce: true });
  const dif = 100 * (r.g - r.p);
  peor = Math.max(peor, Math.abs(dif));
  console.log(`   ${x} contra ${y}: ${linea(r)} → diferencia ${dif >= 0 ? '+' : ''}${dif.toFixed(1)} puntos`);
}
console.log(`   → la mayor diferencia: ${peor.toFixed(1)} puntos`);

/* 3. Equipo +6 que pierde el cruce */
console.log('\n3. Equipo de 76 contra uno de 70');
const fuerteMisma = enfrentar(p => equipo(p, 76, { tactica: 'posesion' }), p => equipo(p, 70, { tactica: 'posesion' }));
const fuertePierde = T.map(t => enfrentar(p => equipo(p, 76, { tactica: t }), p => equipo(p, 70, { tactica: Object.keys(CONFIG.GANA_A).find(k => CONFIG.GANA_A[k] === t) })));
console.log(`   misma táctica: ${linea(fuerteMisma)}   (objetivo ~62 %)`);
console.log(`   perdiendo el cruce: gana ${pct(fuertePierde.reduce((s, r) => s + r.g, 0) / 3)} (${T.map((t, i) => `${t} ${pct(fuertePierde[i].g)}`).join(' · ')})   (objetivo ~50 %)`);

/* 4. Sinergias */
console.log('\n4. Sinergias: equipo con k titulares de la misma colección contra el mismo equipo sin colección (misma táctica)');
const ORDEN = ['por', 'd1', 'd2', 'm1', 'm2', 'a1', 'a2'];
for (const k of [2, 3, 4, 7]) {
  const col = Object.fromEntries(ORDEN.slice(0, k).map(h => [h, { coleccion_id: 'dormidito' }]));
  const r = enfrentar(p => equipo(p, 70, {}, col), p => equipo(p, 70));
  console.log(`   ${k} cartas (×${CONFIG.SINERGIA[Math.min(k, 4)]}): ${linea(r)}`);
}

/* 5. Temporada con cansancio */
// Reglas de la fase 2: gasto por carta según su estamina (alta 22, media 30, baja 40),
// ×1,3 con presión, ×0,5 si jugó solo una parte; después todas recuperan 20 y las que
// no jugaron, 20 más (tope 100, mínimo 0).
const GASTO = { alta: 22, media: 30, baja: 40 };
function prng(semilla) { let s = semilla >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Plantilla de 15 como las del juego: 2 porteros, 4 defensas, 4 de control, 4 atacantes y 1 equilibrado,
// tiers D/E/F; estamina ~25 % alta, 50 % media, 25 % baja (los porteros, alta)
function plantilla(p, semilla) {
  const r = prng(semilla);
  const perfiles = ['portero', 'portero', 'defensa', 'defensa', 'defensa', 'defensa', 'control', 'control', 'control', 'control', 'atacante', 'atacante', 'atacante', 'atacante', 'equilibrado'];
  const tiers = ['D', 'D', 'D', 'D', 'D', 'E', 'E', 'E', 'E', 'E', 'E', 'F', 'F', 'F', 'F'];
  return perfiles.map((perfil, i) => {
    const st = generarStats(tiers[(i * 7) % 15], perfil, 'individual', Math.floor(r() * 2 ** 31));
    const e = r();
    const estamina = perfil === 'portero' ? 'alta' : e < 0.25 ? 'alta' : e < 0.75 ? 'media' : 'baja';
    return { id: `${p}${i}`, nombre: `${p}${i}`, ...st, poderes: [], estamina, energia: 100 };
  });
}
// «Sugerir alineación»: 2-2-2 por hueco con la stat del hueco × energía; banquillo, los 3 siguientes por OVR × energía
const ovr = c => { const v = [c.ATA, c.DEF, c.CON].sort((a, b) => b - a); return 0.6 * v[0] + 0.25 * v[1] + 0.15 * v[2]; };
function sugerir(cartas, conEnergia) {
  const f = c => (conEnergia ? factorEnergia(c.energia) : 1);
  const libres = new Set(cartas);
  const elegir = (stat, n) => [...libres].sort((a, b) => b[stat] * f(b) - a[stat] * f(a)).slice(0, n).map(c => { libres.delete(c); return c; });
  const por = elegir('DEF', 1)[0], def = elegir('DEF', 2), med = elegir('CON', 2), del = elegir('ATA', 2);
  const banquillo = [...libres].sort((a, b) => ovr(b) * f(b) - ovr(a) * f(a)).slice(0, 3);
  return { por, def, med, del, banquillo };
}
const congelar = (al, extra) => ({
  formacion: '2-2-2', por: aplicarEnergia(al.por), def: al.def.map(aplicarEnergia), med: al.med.map(aplicarEnergia),
  del: al.del.map(aplicarEnergia), banquillo: al.banquillo.map(aplicarEnergia), orden_manual: false, capitan_id: null, ...extra,
});
function gastar(cartas, participacion, tactica) {
  const jugaron = new Map();
  for (const id of participacion.completo) jugaron.set(id, 1);
  for (const id of participacion.parcial) jugaron.set(id, 0.5);
  for (const c of cartas) {
    if (jugaron.has(c.id)) c.energia -= GASTO[c.estamina] * (tactica === 'presion' ? 1.3 : 1) * jugaron.get(c.id);
    c.energia += 20 + (jugaron.has(c.id) ? 0 : 20);
    c.energia = Math.max(0, Math.min(100, Math.round(c.energia)));
  }
}
function temporadas(n, gestionR, gestionF, tacticaR = 'posesion', tacticaF = 'posesion') {
  let g = 0, e = 0, p = 0, cambiosR = 0, cambiosF = 0, energiaFinR = 0, energiaFinF = 0, partidos = 0;
  for (let t = 0; t < n; t++) {
    const base = plantilla('x', 5000 + t);
    const R = base.map(c => ({ ...c, id: 'R' + c.id })), F = base.map(c => ({ ...c, id: 'F' + c.id }));
    const fijo = sugerir(F, false);          // siempre los mismos (los mejores sin mirar la energía)
    for (let j = 0; j < 17; j++) {
      const alR = congelar(sugerir(R, true), { tactica: tacticaR, gestion: gestionR });
      const alF = congelar({ por: fijo.por, def: fijo.def, med: fijo.med, del: fijo.del, banquillo: fijo.banquillo }, { tactica: tacticaF, gestion: gestionF });
      const rA = j % 2 === 0;
      const r = rA ? simularPartido(alR, alF, 70000 + t * 17 + j) : simularPartido(alF, alR, 70000 + t * 17 + j);
      const [lr, lf] = rA ? ['A', 'B'] : ['B', 'A'];
      const [gr, gf] = rA ? r.goles : [r.goles[1], r.goles[0]];
      if (gr > gf) g++; else if (gr < gf) p++; else e++;
      cambiosR += r.cambios_descanso[lr]; cambiosF += r.cambios_descanso[lf];
      partidos++;
      gastar(R, r.participacion[lr], tacticaR);
      gastar(F, r.participacion[lf], tacticaF);
    }
    energiaFinR += R.reduce((s, c) => s + c.energia, 0) / R.length;
    energiaFinF += [fijo.por, ...fijo.def, ...fijo.med, ...fijo.del].reduce((s, c) => s + c.energia, 0) / 7;
  }
  return { g: g / partidos, e: e / partidos, p: p / partidos, cambiosR: cambiosR / partidos, cambiosF: cambiosF / partidos,
    energiaR: energiaFinR / n, energiaTitularesF: energiaFinF / n };
}
const nTemp = Math.max(50, Math.round(N / 40));
console.log(`\n5. Temporada de 17 jornadas con cansancio (${nTemp} temporadas, plantillas iguales de 15, misma táctica)`);
for (const [gr, gf] of [['normal', 'normal'], ['normal', 'a_tope'], ['reservon', 'a_tope']]) {
  const r = temporadas(nTemp, gr, gf);
  console.log(`   rota (${gr}) contra siempre los mismos (${gf}): rota gana ${pct(r.g)} · empata ${pct(r.e)} · pierde ${pct(r.p)}` +
    ` · cambios al descanso ${r.cambiosR.toFixed(2)} / ${r.cambiosF.toFixed(2)} · energía media al final: plantilla que rota ${r.energiaR.toFixed(0)}, titulares fijos ${r.energiaTitularesF.toFixed(0)}`);
}
console.log('   (objetivo: quien rota ~55 %)');

/* 6. Gestión y plan B */
console.log('\n6. Cambios al descanso de media y plan B (equipos de 70 con energías variadas)');
const energias = s => { const r = prng(s); const out = {}; for (const h of ORDEN) out[h] = { energia: Math.round(30 + r() * 70) }; return out; };
for (const gestion of CONFIG.GESTIONES) {
  let total = 0;
  for (let i = 0; i < N / 4; i++) {
    const r = simularPartido(equipo('A', 70, { gestion }, energias(i)), equipo('B', 70, { gestion: 'a_tope' }), 300 + i);
    total += r.cambios_descanso.A;
  }
  console.log(`   ${gestion}: ${(total / (N / 4)).toFixed(2)} cambios al descanso de media (energías de 30 a 100)`);
}
for (const condicion of CONFIG.CONDICIONES_PLAN_B) {
  const r = enfrentar(p => equipo(p, 70, { plan_b: { condicion, tactica: 'contraataque' } }), p => equipo(p, 70), N / 2);
  console.log(`   plan B «${condicion} → contraataque»: se activa en el ${pct(r.planB[0])} de los partidos · ${linea(r)}`);
}
