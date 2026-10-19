/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: azar de la animación
   Nada de esto toca el motor ni sus números: es un PRNG propio con semilla
   «id del partido + número de jugada», así que la repetición es siempre igual.
   decorar(guion, …) elige con él la variante de cada escena (sin repetir la
   misma dos veces seguidas), los detalles al azar (qué defensa corta) y si la
   escena va en versión completa o rápida (config.js).
═══════════════════════════════════════════════ */
import { RITMO } from './config.js';

// FNV-1a de 32 bits
export function hash(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// mulberry32: (0, 1)
export function prng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngJugada = (partidoId, jugada) => prng(hash(`${partidoId}|${jugada ?? 0}`));

// Uno al azar con pesos (lista de [valor, peso])
export function conPesos(rng, lista) {
  const total = lista.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (!total) return lista[0]?.[0];
  let x = rng() * total;
  for (const [v, w] of lista) { x -= Math.max(0, w); if (x < 0) return v; }
  return lista[lista.length - 1][0];
}

const igualado = p => p >= RITMO.IGUALADO_MIN && p <= RITMO.IGUALADO_MAX;

// Variante de cada escena, detalles y ritmo. variantes: { tipo: [ids] } (escenas/registro.js)
export function decorar(guion, partidoId, variantes) {
  const ultima = {};
  const rngs = new Map();
  const rngDe = j => { if (!rngs.has(j)) rngs.set(j, rngJugada(partidoId, j)); return rngs.get(j); };
  for (const e of guion.escenas) {
    const rng = rngDe(e.jugada ?? 0);
    const ids = variantes[e.tipo] ?? [];
    if (ids.length) {
      const libres = ids.length > 1 ? ids.filter(v => v !== ultima[e.tipo]) : ids;
      e.variante = libres[Math.floor(rng() * libres.length)];
      ultima[e.tipo] = e.variante;
    }
    // Completa o rápida: duelos igualados y los últimos minutos con el marcador igualado
    if (e.p != null) {
      const final = (e.jugada ?? 0) >= RITMO.FINAL_DESDE_JUGADA
        && Math.abs((e.marcador?.[0] ?? 0) - (e.marcador?.[1] ?? 0)) <= RITMO.FINAL_DIFERENCIA_MAX;
      e.completo = igualado(e.p) || final;
    }
    // Qué defensa corta: más peso cuanto más DEF
    if (e.tipo === 'corte' && e.defensas?.length) {
      e.corta = conPesos(rng, e.defensas.map(d => [d.carta, Math.max(1, d.DEF ?? 1) ** 2]));
    }
    // Semilla propia de la escena para lo puramente visual (chispas…)
    e.semilla = Math.floor(rng() * 4294967296);
  }
  return guion;
}
