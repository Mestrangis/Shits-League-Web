/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: tiempos y ritmo
   Todos los tiempos de la animación, en milisegundos a velocidad ×1. Las
   escenas no llevan números propios: reparten estos.
   Objetivo: 6 s una jugada cortada, 14 s una con gol; unos 2 min el partido.
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

export const TIEMPOS = Object.freeze({
  inicio: { total: 3400, entrada: 650, vs: 400, silbato: 900 },
  saque: { total: 1150, cruce: 950 },
  poder: { total: 1350, entrada: 380, salida: 300 },

  // Duelo de control: la entrada de la variante y después la barra
  control: {
    completo: { intro: 1450, barra: 1650 },
    rapido: { intro: 520, barra: 620 },
  },
  // Barra de porcentajes: parte de su tiempo en la que pelea; el resto, el golpe final
  barra: { aparece: 220, pelea: 0.72, sorpresa: 0.22, llamarada: 380 },
  robo: { total: 1350, rotulo: 520, franja: 700 },

  ataque: { completo: 1100, rapido: 650 },     // el balón rueda y tiemblan los defensas
  pase: { completo: 900, rapido: 600 },
  corte: { completo: 1250, rapido: 850, rotulo: 520 },

  tirador: { completo: 1700, rapido: 950, grande: 450, pasos: 16 },
  chut: {
    completo: { disparo: 650, barra: 1650 },
    rapido: { disparo: 450, barra: 650 },
  },
  gol: { total: 2700, golpe: 260, temblor: 520 },
  parada: { total: 1800 },

  lesion: { total: 1500 },
  descanso: { total: 3700 },
  final: { total: 4200 },

  // Entre escenas, y el reloj: cuántos ms tarda en avanzar un minuto como mucho
  hueco: 120,
  minuto_max: 900,
});
