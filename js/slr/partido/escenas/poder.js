/* Poder: antes de su fase entra la carta, desde el lado de su equipo, con el nombre del
   poder (su barra arrancará inclinada hacia ese lado). */
import { cartaPartido, poner } from './comun.js';
import { esc } from '../../ui.js';
import { leer } from '../config.js';

export function carta(ctx) {
  const T = ctx.T.poder, d = ctx.d, lado = ctx.lado(d.equipo);
  const total = Math.max(T.total, T.entrada + leer(`poder ${d.poder}`) + 400);
  const c = cartaPartido(ctx, d.carta, `slr-pt-carta--poder slr-pt-carta--${lado}`);
  const nombre = poner(ctx, `<div class="slr-pt-poder slr-pt-poder--${lado}" style="--c:${ctx.color(d.equipo)}"><small>⚡ PODER</small><b>${esc(d.poder)}</b></div>`);
  const desde = lado === 'arriba' ? '-160%' : '160%';
  const o = x => x / total;
  ctx.linea.anim(c, [
    { transform: `translate3d(-50%, ${desde}, 0) rotate(${lado === 'arriba' ? 10 : -10}deg)`, opacity: 0, offset: 0 },
    { transform: 'translate3d(-50%, 0, 0) rotate(0deg) scale(1.06)', opacity: 1, offset: o(T.entrada) },
    { transform: 'translate3d(-50%, 0, 0) scale(1)', opacity: 1, offset: 1 - o(400) },
    { transform: `translate3d(-50%, ${lado === 'arriba' ? '-20%' : '20%'}, 0) scale(.92)`, opacity: 0, offset: 1 },
  ], { dur: total, easing: 'cubic-bezier(.2,.8,.3,1)' });
  ctx.linea.anim(nombre, [
    { opacity: 0, transform: 'translate3d(-50%, 10px, 0) scale(.8)', offset: 0 },
    { opacity: 0, transform: 'translate3d(-50%, 10px, 0) scale(.8)', offset: o(T.entrada * 0.6) },
    { opacity: 1, transform: 'translate3d(-50%, 0, 0) scale(1.05)', offset: o(T.entrada) },
    { opacity: 1, transform: 'translate3d(-50%, 0, 0) scale(1)', offset: 1 - o(400) },
    { opacity: 0, transform: 'translate3d(-50%, -6px, 0) scale(1)', offset: 1 },
  ], { dur: total });
  ctx.linea.en(T.entrada, () => {
    ctx.sonar('poder', { carta: d.carta, poder: d.poder });
    const [x, y] = ctx.centro(c);
    ctx.fx.chispas(x, y, 30, { color: ctx.color(d.equipo), fuerza: 10 });
  });
}
