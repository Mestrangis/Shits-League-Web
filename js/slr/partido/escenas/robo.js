/* Robo: gana el control el que no sacaba: «¡ROBO!» y una franja roja de «CONTRAATAQUE».
   El césped se da la vuelta: ahora corre hacia el ataque del que roba. */
import { rotulo, franja } from './comun.js';
import { esc } from '../../ui.js';

export function franjaRoja(ctx) {
  const T = ctx.T.robo, l = ctx.d.equipo, nombre = ctx.equipo(l).nombre ?? '';
  ctx.cespedAtaque(l, 'rapido');
  const finRotulo = rotulo(ctx, '¡ROBO!', { dur: T.rotulo, clase: 'slr-pt-rotulo--robo', color: ctx.color(l), sub: nombre });
  const inicioFranja = finRotulo - 300;
  const { fin } = franja(ctx, `<b>CONTRAATAQUE</b><em>${esc(nombre)} ${ctx.hacia(l) < 0 ? '▲' : '▼'}</em>`,
    { en: inicioFranja, queda: T.franja, texto: `contraataque ${nombre}`, color: '#ff3b3b', clase: 'slr-pt-franja--roja' });
  ctx.linea.en(0, () => ctx.sonar('robo'));
  ctx.linea.en(inicioFranja, () => ctx.sonar('contraataque'));
  ctx.linea.en(fin, () => {});
}
