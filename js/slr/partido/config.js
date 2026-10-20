/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: tiempos y ritmo
   Todos los tiempos de la animación, en milisegundos a velocidad ×1. Las
   escenas no llevan números propios: reparten estos.
   Partido entero: unos 3–4 minutos (para ir más rápido: tap, ×2 y «Saltar»).
   Regla de lectura: un texto se queda en pantalla al menos leer(texto) ms y la
   escena no termina antes (solo el tap la adelanta).
═══════════════════════════════════════════════ */

export const RITMO = Object.freeze({
  // Duelo igualado (versión completa) si la probabilidad está entre estos dos
  IGUALADO_MIN: 0.40,
  IGUALADO_MAX: 0.60,
  // Últimos minutos con el marcador igualado: siempre completa
  FINAL_DESDE_JUGADA: 8,
  FINAL_DIFERENCIA_MAX: 1,
  // «¡SORPRESA!» si gana el que tenía menos de esto
  SORPRESA_P: 0.40,
});

// Lectura: 1,5 s como mínimo y algo más por cada palabra
export const LECTURA = Object.freeze({ BASE: 1500, POR_PALABRA: 250 });
export const leer = texto => LECTURA.BASE + LECTURA.POR_PALABRA * String(texto ?? '').trim().split(/\s+/).filter(Boolean).length;

export const TIEMPOS = Object.freeze({
  inicio: { total: 6500, entrada: 1100, silbato: 1700 },
  // La franja del saque: entra, se queda (al menos lo que se tarda en leerla) y sale
  saque: { entra: 450, queda: 2600, sale: 450 },
  poder: { total: 3200, entrada: 700 },

  // Duelo de control: la entrada de la variante y después la barra
  control: {
    completo: { intro: 2600, barra: 3600 },
    rapido: { intro: 1200, barra: 1700 },
  },
  // Barra de porcentajes: parte de su tiempo en la que pelea; el resto, el golpe final
  barra: { aparece: 380, pelea: 0.74, sorpresa: 0.22, llamarada: 650, empujones: 6 },
  robo: { rotulo: 2000, franja: 2600 },

  // Ataque contra defensa: el balón sube (o baja) y tiemblan los defensas
  ataque: { completo: 2700, rapido: 1600 },
  pase: { completo: 2200, rapido: 1500 },
  corte: { completo: 2000, rapido: 1400 },     // hasta el golpe; después, el rótulo

  tirador: { completo: 3800, rapido: 2200, grande: 1000, pasos: 16 },
  chut: {
    completo: { disparo: 1300, barra: 3800 },
    rapido: { disparo: 900, barra: 1800 },
  },
  // Gol: hasta que entra (según la variante) y después el «GOL»
  gol: { red: 2000, chilena: 2600, ardiendo: 2800, golpe: 300, temblor: 900 },
  parada: { gesto: 1500, total: 4400 },

  lesion: { total: 3400 },
  descanso: { total: 7000 },
  final: { total: 8000 },

  // Entre escenas, y el reloj: cuántos ms tarda en avanzar un minuto como mucho
  hueco: 250,
  minuto_max: 1800,
  // Césped: ms por franja (lo que tarda en pasar una franja de 64 px)
  cesped: { lento: 1400, normal: 520, rapido: 260 },
});
