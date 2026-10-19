/* Saque: una franja cruza rápido con la foto del dueño, el nombre del equipo y «ATACA». */
import { franja, foto } from './comun.js';
import { esc } from '../../ui.js';

export function cruce(ctx) {
  const T = ctx.T.saque, l = ctx.d.equipo;
  const el = franja(ctx, `<span class="slr-pt-franja__foto"></span><b>${esc(ctx.equipo(l).nombre ?? '')}</b><em>ATACA</em>`,
    { dur: T.cruce, color: ctx.color(l), clase: `slr-pt-franja--${ctx.lado(l)}` });
  el.querySelector('.slr-pt-franja__foto').replaceWith(foto(ctx, l));
  ctx.linea.en(80, () => ctx.sonar('saque', { equipo: l }));
  ctx.linea.en(T.total, () => {});
}
