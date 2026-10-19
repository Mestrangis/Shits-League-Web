/* El ataque pasa: el balón cruza rápido entre los defensas, con estela. */
import { poner, BALON } from './comun.js';
import { montar } from './ataque.js';

export function estela(ctx) {
  const d = ctx.d, dur = ctx.T.pase[d.completo ? 'completo' : 'rapido'];
  const { b, defs, sig, medio } = montar(ctx);
  for (const el of defs.values()) el.style.opacity = '1', el.style.transform = 'translate3d(0, -50%, 0)';
  const fin = `translate3d(${sig * 62}vw, 0, 0)`;
  const viaje = dur * 0.55;
  // Estela: tres balones fantasma que siguen al de verdad con retraso y se apagan
  for (let k = 3; k >= 1; k--) {
    const f = poner(ctx, `<div class="slr-pt-balon slr-pt-balon--ataque slr-pt-balon--fantasma" style="--o:${(0.5 - k * 0.12).toFixed(2)}">${BALON}</div>`);
    ctx.linea.anim(f, [{ transform: medio, opacity: 0 }, { transform: medio, opacity: 1, offset: 0.05 }, { transform: fin, opacity: 0 }],
      { en: k * 35, dur: viaje, easing: 'cubic-bezier(.6,0,.2,1)' });
  }
  ctx.linea.anim(b, [{ transform: `${medio} rotate(0deg)` }, { transform: `${fin} rotate(${sig * 900}deg)` }], { dur: viaje, easing: 'cubic-bezier(.6,0,.2,1)' });
  // Los defensas se apartan
  let k = 0;
  for (const el of defs.values()) {
    const arriba = k++ % 2 === 0 ? -1 : 1;
    ctx.linea.anim(el, [{ transform: 'translate3d(0, -50%, 0)' }, { transform: `translate3d(${-sig * 6}%, calc(-50% + ${arriba * 14}px), 0) rotate(${arriba * 8}deg)` }],
      { en: viaje * 0.3, dur: 260, easing: 'ease-out' });
  }
  ctx.linea.en(viaje * 0.35, () => {
    ctx.sonar('regate');
    const [x, y] = ctx.centro(b);
    ctx.fx.chispas(x, y, 14, { color: ctx.color(d.equipo), fuerza: 7, dir: sig > 0 ? 0 : Math.PI, abertura: 1.2 });
  });
  ctx.linea.en(dur, () => {});
}
