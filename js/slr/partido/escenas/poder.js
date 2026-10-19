/* Poder: antes de su fase entra la carta con el nombre del poder (su barra arrancará inclinada). */
import { cartaPartido, poner } from './comun.js';
import { esc } from '../../ui.js';

export function carta(ctx) {
  const T = ctx.T.poder, d = ctx.d, lado = ctx.lado(d.equipo);
  const c = cartaPartido(ctx, d.carta, `slr-pt-carta--poder slr-pt-carta--${lado}`);
  const nombre = poner(ctx, `<div class="slr-pt-poder slr-pt-poder--${lado}" style="--c:${ctx.color(d.equipo)}"><small>⚡ PODER</small><b>${esc(d.poder)}</b></div>`);
  const desde = lado === 'izq' ? '-130%' : '130%';
  ctx.linea.anim(c, [
    { transform: `translate3d(${desde}, -50%, 0) rotate(${lado === 'izq' ? -14 : 14}deg)`, opacity: 0 },
    { transform: 'translate3d(0, -50%, 0) rotate(0deg) scale(1.06)', opacity: 1, offset: 0.25 },
    { transform: 'translate3d(0, -50%, 0) scale(1)', opacity: 1, offset: 0.8 },
    { transform: `translate3d(${lado === 'izq' ? '-30%' : '30%'}, -50%, 0) scale(.9)`, opacity: 0 },
  ], { dur: T.total, easing: 'cubic-bezier(.2,.8,.3,1)' });
  ctx.linea.anim(nombre, [
    { opacity: 0, transform: 'translate3d(0, 10px, 0) scale(.8)' },
    { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1.05)', offset: 0.3 },
    { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)', offset: 0.8 },
    { opacity: 0, transform: 'translate3d(0, -6px, 0) scale(1)' },
  ], { dur: T.total });
  ctx.linea.en(T.entrada, () => {
    ctx.sonar('poder', { carta: d.carta, poder: d.poder });
    const [x, y] = ctx.centro(c);
    ctx.fx.chispas(x, y, 26, { color: ctx.color(d.equipo), fuerza: 9 });
  });
}
