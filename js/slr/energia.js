/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — energía, tácticas y «Sugerir alineación» (motor v2)
   Gemelos de lo que hace el servidor (migración 20261017000000_slr_motor_v2.sql):
   · factorEnergia: los tramos de CONFIG.ENERGIA del motor (factor_energia en SQL)
   · gastoPartido: lo que gasta una carta en un partido de liga (gastar_energia_jornada)
   · sugerirAlineacion: crear_alineacion_por_defecto con la energía (lo que usan
     los bots y el botón «Sugerir alineación»)
   Para que coincidan con el SQL, las comparaciones van en enteros (factor × 100).
═══════════════════════════════════════════════ */
import { CONFIG } from './motor-v2.0.0.js';

export const ENERGIA_MAX = 100;
export const GASTO_ESTAMINA = Object.freeze({ alta: 22, media: 30, baja: 40 });
export const RECUPERA = 20;            // todas, tras cada jornada de liga
export const RECUPERA_SIN_JUGAR = 20;  // más, las que no jugaron
export const MULT_PRESION = 1.3;
export const GESTIONES = Object.freeze({
  reservon: { nombre: 'Reservón', frase: 'Al descanso salen los 2 titulares con menos energía: gastan la mitad.' },
  normal:   { nombre: 'Normal', frase: 'Al descanso sale el más cansado si baja de 50 de energía.' },
  a_tope:   { nombre: 'A tope', frase: 'Nadie sale por cansancio: juegan los mejores todo el partido.' },
});

// Factor × 100 (100 / 95 / 88 / 75) y factor
export function factor100(energia = ENERGIA_MAX) {
  for (const [desde, f] of CONFIG.ENERGIA) if ((energia ?? ENERGIA_MAX) >= desde) return Math.round(f * 100);
  return Math.round(CONFIG.ENERGIA[CONFIG.ENERGIA.length - 1][1] * 100);
}
export const factorEnergia = energia => factor100(energia) / 100;

// Tramo para pintar: color y aviso («Cansado: −12 %»)
export function tramoEnergia(energia = ENERGIA_MAX) {
  const f = factor100(energia);
  if (f === 100) return { clase: 'llena', texto: 'En forma', penal: 0 };
  if (f >= 95) return { clase: 'media', texto: `Algo cansado: −${100 - f} %`, penal: 100 - f };
  if (f >= 88) return { clase: 'cansada', texto: `Cansado: −${100 - f} %`, penal: 100 - f };
  return { clase: 'agotada', texto: `Agotado: −${100 - f} %`, penal: 100 - f };
}

// Gasto × 20 en enteros: completo = base·(f1+f2)/2; solo un tramo = base·f/2 (f×10: 10 o 13)
function gasto20(estamina, tramos) {
  const base = GASTO_ESTAMINA[estamina] ?? GASTO_ESTAMINA.media;
  const f10 = t => (t === 'presion' ? 13 : 10);
  return base * tramos.reduce((s, t) => s + f10(t), 0);
}
// Energía tras una jornada de liga. tramos: tácticas de los tramos que jugó ([] si no jugó)
export function energiaTras(energia, estamina, tramos) {
  const num = 20 * (energia + RECUPERA + (tramos.length ? 0 : RECUPERA_SIN_JUGAR)) - gasto20(estamina, tramos);
  return Math.max(0, Math.min(ENERGIA_MAX, Math.floor((num + 10) / 20)));
}
export const gastoPartido = (estamina, tramos) => gasto20(estamina, tramos) / 20;

// OVR × 100 (60·s1 + 25·s2 + 15·s3)
function ovr100(c) {
  const [s1, s2, s3] = [c.ATA, c.DEF, c.CON].sort((a, b) => b - a);
  return 60 * s1 + 25 * s2 + 15 * s3;
}

// «Sugerir alineación»: 2-2-2 con la mejor stat de cada hueco × factor de energía
// (POR y DEF por DEF, MED por CON, DEL por ATA), banquillo los 3 siguientes por
// OVR × factor y capitán el titular de mayor OVR × factor. Desempates: OVR × factor
// e id. No mira al rival ni la táctica. cartas: [{ id, ATA, DEF, CON, energia }]
export function sugerirAlineacion(cartas) {
  const libres = cartas.map(c => ({ c, f: factor100(c.energia), o: ovr100(c) }));
  const cmp = stat => (a, b) => b.c[stat] * b.f - a.c[stat] * a.f || b.o * b.f - a.o * a.f || (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0);
  const usadas = new Set();
  const elegir = (stat, n) => libres.filter(x => !usadas.has(x)).sort(cmp(stat)).slice(0, n).map(x => { usadas.add(x); return x; });
  const por = elegir('DEF', 1), def = elegir('DEF', 2), med = elegir('CON', 2), del = elegir('ATA', 2);
  const titulares = [...por, ...def, ...med, ...del];
  const porOvr = (a, b) => b.o * b.f - a.o * a.f || (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0);
  const banquillo = libres.filter(x => !usadas.has(x)).sort(porOvr).slice(0, 3);
  const capitan = [...titulares].sort(porOvr)[0];
  const ids = l => l.map(x => x.c.id);
  const relleno = (l, n) => [...ids(l), ...Array(Math.max(0, n - l.length)).fill(null)];
  return {
    formacion: '2-2-2',
    huecos: { por: por[0]?.c.id ?? null, def: relleno(def, 2), med: relleno(med, 2), del: relleno(del, 2) },
    banquillo: ids(banquillo),
    capitan_id: capitan?.c.id ?? null,
  };
}
