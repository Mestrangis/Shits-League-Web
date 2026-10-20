/* Saque: una franja cruza con la foto del dueño, el nombre del equipo y «ATACA ▲/▼»;
   se queda en medio el tiempo de leerla. El césped empieza a correr hacia su ataque. */
import { franja, foto } from './comun.js';
import { esc } from '../../ui.js';

export function cruce(ctx) {
  const T = ctx.T.saque, l = ctx.d.equipo, nombre = ctx.equipo(l).nombre ?? '';
  const { el, fin } = franja(ctx, `<span class="slr-pt-franja__foto"></span><b>${esc(nombre)}</b><em>${esc(ctx.texto('ataca'))} ${ctx.hacia(l) < 0 ? '▲' : '▼'}</em>`,
    { entra: T.entra, queda: T.queda, sale: T.sale, texto: `${nombre} ataca`, color: ctx.color(l), clase: `slr-pt-franja--${ctx.lado(l)}` });
  el.querySelector('.slr-pt-franja__foto').replaceWith(foto(ctx, l));
  ctx.linea.en(80, () => ctx.sonar('saque', { equipo: l }));
  ctx.linea.en(fin, () => {});
}
