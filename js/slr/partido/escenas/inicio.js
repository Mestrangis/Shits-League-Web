/* Inicio: los dos equipos frente a frente con «VS», sus fotos y sus tácticas. Silbato. */
import { poner, foto, tacticaHTML, rotulo } from './comun.js';
import { esc } from '../../ui.js';

export function vs(ctx) {
  const T = ctx.T.inicio, d = ctx.d;
  const lado = letra => {
    const el = poner(ctx, `<div class="slr-pt-vs slr-pt-vs--${ctx.lado(letra)}" style="--c:${ctx.color(letra)}">
      <b class="slr-pt-vs__nombre">${esc(ctx.equipo(letra).nombre ?? '')}</b>
      ${tacticaHTML(d.tacticas?.[letra])}</div>`);
    el.prepend(foto(ctx, letra, 'slr-pt-foto--grande'));
    const desde = ctx.lado(letra) === 'izq' ? '-120%' : '120%';
    ctx.linea.anim(el, [{ transform: `translate3d(${desde}, 0, 0)`, opacity: 0 }, { transform: 'translate3d(0, 0, 0)', opacity: 1 }],
      { dur: T.entrada, easing: 'cubic-bezier(.2,.9,.25,1.15)' });
    ctx.linea.anim(el, [{ opacity: 1 }, { opacity: 0 }], { en: T.total - 280, dur: 280 });
    return el;
  };
  lado(ctx.lados.izq);
  lado(ctx.lados.der);
  rotulo(ctx, 'VS', { en: T.entrada - 120, dur: T.total - T.entrada, clase: 'slr-pt-rotulo--vs' });
  ctx.linea.en(T.entrada - 80, () => {
    const [x, y] = ctx.centro(ctx.escenario);
    ctx.fx.chispas(x, y, 30, { color: '#ffffff', fuerza: 10 });
  });
  ctx.linea.en(T.silbato, () => ctx.sonar('silbato_inicio'));
  ctx.linea.en(T.total, () => {});
}
