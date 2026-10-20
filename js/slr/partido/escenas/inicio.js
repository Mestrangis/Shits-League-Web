/* Inicio: los dos equipos frente a frente (el rival arriba y tú abajo) con «VS», sus
   fotos y sus tácticas. Silbato. */
import { poner, foto, tacticaHTML, rotulo } from './comun.js';
import { esc } from '../../ui.js';

export function vs(ctx) {
  const T = ctx.T.inicio, d = ctx.d;
  const bloque = letra => {
    const lado = ctx.lado(letra);
    const el = poner(ctx, `<div class="slr-pt-vs slr-pt-vs--${lado}" style="--c:${ctx.color(letra)}">
      <span class="slr-pt-vs__texto"><b class="slr-pt-vs__nombre">${esc(ctx.equipo(letra).nombre ?? '')}</b>${tacticaHTML(d.tacticas?.[letra])}</span></div>`);
    el.prepend(foto(ctx, letra, 'slr-pt-foto--grande'));
    const desde = lado === 'arriba' ? '-140%' : '140%';
    ctx.linea.anim(el, [{ transform: `translate3d(-50%, ${desde}, 0)`, opacity: 0 }, { transform: 'translate3d(-50%, 0, 0)', opacity: 1 }],
      { dur: T.entrada, easing: 'cubic-bezier(.2,.9,.25,1.12)' });
    ctx.linea.anim(el, [{ opacity: 1 }, { opacity: 0 }], { en: T.total - 400, dur: 400, fill: 'forwards' });
  };
  bloque(ctx.lados.arriba);
  bloque(ctx.lados.abajo);
  rotulo(ctx, 'VS', { en: T.entrada - 150, dur: T.total - T.entrada - 250, clase: 'slr-pt-rotulo--vs' });
  ctx.linea.en(T.entrada - 100, () => {
    const [x, y] = ctx.centro(ctx.escenario);
    ctx.fx.chispas(x, y, 34, { color: '#ffffff', fuerza: 10 });
    ctx.temblor(5, 0, 300);
  });
  ctx.linea.en(T.silbato, () => ctx.sonar('silbato_inicio'));
  ctx.linea.en(T.total, () => {});
}
