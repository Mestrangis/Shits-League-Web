/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — versiones del motor
   Cada partido guarda la versión con la que se simuló (partidos.version_motor)
   y se reproduce siempre con esa. Los partidos nuevos usan MOTOR_ACTUAL.
   Una versión publicada no se borra mientras haya partidos jugados con ella.
═══════════════════════════════════════════════ */
import * as v1_1_0 from './motor-v1.1.0.js';
import * as v1_2_0 from './motor-v1.2.0.js';
import * as v1_3_0 from './motor-v1.3.0.js';

export const MOTORES = Object.freeze({ '1.1.0': v1_1_0, '1.2.0': v1_2_0, '1.3.0': v1_3_0 });
export const MOTOR_ACTUAL = v1_3_0;

// Motor de una versión ("1.1.0"); sin versión, el actual. Error si no existe.
export function motorDe(version) {
  if (version == null) return MOTOR_ACTUAL;
  const m = MOTORES[version];
  if (!m) throw new Error(`No existe el motor ${version}`);
  return m;
}
