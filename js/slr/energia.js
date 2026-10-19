/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — energía y tácticas (motor v2)
   Gemelos de lo que hace el servidor (migración 20261017000000_slr_motor_v2.sql):
   · factorEnergia: los tramos de CONFIG.ENERGIA del motor (factor_energia en SQL)
   · gastoPartido: lo que gasta una carta en un partido de liga (gastar_energia_jornada)
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
