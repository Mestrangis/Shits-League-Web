/* Robo: gana el control el que no sacaba: «¡ROBO!» y una franja roja de «CONTRAATAQUE». */
import { rotulo, franja } from './comun.js';
import { esc } from '../../ui.js';

export function franjaRoja(ctx) {
  const T = ctx.T.robo, l = ctx.d.equipo;
  rotulo(ctx, '¡ROBO!', { dur: T.rotulo + 200, clase: 'slr-pt-rotulo--robo', color: ctx.color(l), sub: ctx.equipo(l).nombre ?? '' });
  franja(ctx, `<b>CONTRAATAQUE</b><em>${esc(ctx.equipo(l).nombre ?? '')}</em>`, { en: T.rotulo, dur: T.franja, color: '#ff3b3b', clase: 'slr-pt-franja--roja' });
  ctx.linea.en(0, () => ctx.sonar('robo'));
  ctx.linea.en(T.rotulo, () => ctx.sonar('contraataque'));
  ctx.linea.en(T.total, () => {});
}
