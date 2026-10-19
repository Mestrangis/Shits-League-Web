/* Parada: el portero queda en grande con un brillo de victoria y un rótulo.
   Variantes: estirada («¡PARADÓN!»), puños («¡DE PUÑOS!»), atrapada («¡A LAS MANOS!»). */
import { rotulo, poner } from './comun.js';
import { montarChut } from './chut.js';

function base(ctx, texto, { carta, balonFrames, golpe = 260 }) {
  const d = ctx.d, T = ctx.T.parada;
  const m = montarChut(ctx, { tirador: false });
  const color = ctx.color(d.defensor);
  const brillo = poner(ctx, `<div class="slr-pt-brillo" style="--c:${color}"></div>`);
  ctx.linea.anim(brillo, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.5)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.35 }, { opacity: 0.7, transform: 'translate(-50%, -50%) scale(1.1)' }],
    { en: golpe, dur: T.total - golpe, easing: 'ease-out' });
  ctx.linea.anim(m.portero, carta, { dur: T.total * 0.5, easing: 'cubic-bezier(.2,.9,.3,1.15)' });
  ctx.linea.anim(m.b, balonFrames, { dur: T.total * 0.55, easing: 'cubic-bezier(.2,.7,.3,1)' });
  ctx.linea.en(golpe, () => {
    ctx.sonar('parada');
    const [x, y] = ctx.centro(m.portero);
    ctx.fx.chispas(x, y, 34, { color, fuerza: 11 });
  });
  rotulo(ctx, texto, { en: golpe, dur: T.total - golpe, clase: 'slr-pt-rotulo--parada', color, sub: ctx.carta(d.portero)?.nombre ?? '' });
}

const grande = (extra = '') => `translate3d(-50%, 22vh, 0) scale(1.7)${extra}`;

export function estirada(ctx) {
  base(ctx, '¡PARADÓN!', {
    carta: [{ transform: 'translate3d(-50%, 0, 0) rotate(0deg)' }, { transform: 'translate3d(-90%, 2vh, 0) rotate(-28deg)', offset: 0.3 }, { transform: grande(' rotate(-6deg)') }],
    balonFrames: [{ transform: 'translate3d(-50%, -41vh, 0) scale(.62)' }, { transform: 'translate3d(160%, -58vh, 0) scale(.5) rotate(400deg)', opacity: 0 }],
  });
}

export function punos(ctx) {
  base(ctx, '¡DE PUÑOS!', {
    carta: [{ transform: 'translate3d(-50%, 0, 0) scale(1)' }, { transform: 'translate3d(-50%, -4vh, 0) scale(1.15)', offset: 0.25 }, { transform: grande() }],
    balonFrames: [{ transform: 'translate3d(-50%, -41vh, 0) scale(.62)' }, { transform: 'translate3d(-50%, -80vh, 0) scale(.4) rotate(-600deg)', opacity: 0 }],
    golpe: 200,
  });
}

export function atrapada(ctx) {
  base(ctx, '¡A LAS MANOS!', {
    carta: [{ transform: 'translate3d(-50%, 0, 0) scale(1)' }, { transform: 'translate3d(-50%, 1vh, 0) scale(1.08)', offset: 0.3 }, { transform: grande() }],
    balonFrames: [{ transform: 'translate3d(-50%, -41vh, 0) scale(.62)' }, { transform: 'translate3d(-50%, -38vh, 0) scale(.3)', opacity: 0, offset: 0.4 }, { transform: 'translate3d(-50%, -38vh, 0) scale(.2)', opacity: 0 }],
  });
}
