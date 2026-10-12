/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — OVR y valor de una carta
   Especificación, sección 3.5. No forma parte del motor de partido: aquí
   sí se usa Math.exp (el valor se calcula en el catálogo, no en partidos).
═══════════════════════════════════════════════ */

export const BONUS_PODER = Object.freeze({
  'simple':     0.15,
  'fuerte':     0.35,
  'muy fuerte': 0.60,
});

// OVR = 0,60·s1 + 0,25·s2 + 0,15·s3 con las stats de mayor a menor. Sin redondear.
export function calcularOVR(carta) {
  const [s1, s2, s3] = [carta.ATA, carta.DEF, carta.CON].sort((a, b) => b - a);
  return 0.60 * s1 + 0.25 * s2 + 0.15 * s3;
}

// Valor = round(100 · e^(0,08·(OVR − 50)) · (1 + Σ bonus de poderes))
export function calcularValor(carta) {
  let bonus = 0;
  for (const poder of carta.poderes || []) {
    if (!(poder.nivel in BONUS_PODER)) throw new Error(`[valor] nivel de poder desconocido "${poder.nivel}"`);
    bonus += BONUS_PODER[poder.nivel];
  }
  return Math.round(100 * Math.exp(0.08 * (calcularOVR(carta) - 50)) * (1 + bonus));
}
