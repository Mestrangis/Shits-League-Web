/* La defensa corta: una carta de la defensa (la elige el azar de la animación, con más
   peso para más DEF) se adelanta con «¡CORTADO!». Variantes: entrada, despeje, choque. */
import { rotulo, tiembla } from './comun.js';
import { montar } from './ataque.js';

function preparar(ctx) {
  const d = ctx.d, dur = ctx.T.corte[d.completo ? 'completo' : 'rapido'];
  const m = montar(ctx);
  for (const el of m.defs.values()) el.style.opacity = '1', el.style.transform = 'translate3d(0, -50%, 0)';
  const id = d.corta ?? d.defensas[0]?.carta;
  const el = m.defs.get(id) ?? [...m.defs.values()][0];
  if (el) el.classList.add('es-corta');
  return { ...m, el, dur, golpe: dur * 0.32 };
}
const cortado = (ctx, en) => {
  rotulo(ctx, '¡CORTADO!', { en, dur: ctx.T.corte.rotulo + 300, clase: 'slr-pt-rotulo--corte', color: ctx.color(ctx.d.defensor) });
  ctx.linea.en(en, () => ctx.sonar('corte'));
};
// La carta sale hacia el balón (hacia el centro, a la altura del balón)
const salida = (sig, extra = '') => [
  { transform: 'translate3d(0, -50%, 0) scale(1)' },
  { transform: `translate3d(${-sig * 70}%, -50%, 0) scale(1.22)${extra}`, offset: 0.7 },
  { transform: `translate3d(${-sig * 62}%, -50%, 0) scale(1.18)${extra}` },
];

export function entrada(ctx) {
  const { b, el, sig, medio, dur, golpe } = preparar(ctx);
  if (el) ctx.linea.anim(el, salida(sig, ` rotate(${-sig * 14}deg)`), { dur: golpe + 120, easing: 'cubic-bezier(.4,0,.2,1)' });
  ctx.linea.anim(b, [{ transform: medio }, { transform: medio, offset: golpe / dur }, { transform: `translate3d(${-sig * 30}vw, 18px, 0) rotate(${-sig * 420}deg)` }],
    { dur, easing: 'cubic-bezier(.2,.7,.3,1)' });
  ctx.linea.en(golpe, () => { const [x, y] = ctx.centro(b); ctx.fx.chispas(x, y, 18, { color: ctx.color(ctx.d.defensor), fuerza: 8 }); });
  cortado(ctx, golpe);
}

export function despeje(ctx) {
  const { b, el, sig, medio, dur, golpe } = preparar(ctx);
  if (el) ctx.linea.anim(el, salida(sig), { dur: golpe + 120, easing: 'cubic-bezier(.4,0,.2,1)' });
  ctx.linea.anim(b, [{ transform: medio }, { transform: medio, offset: golpe / dur },
    { transform: `translate3d(${-sig * 10}vw, -70vh, 0) rotate(${-sig * 900}deg) scale(.5)` }], { dur, easing: 'cubic-bezier(.2,.8,.4,1)' });
  ctx.linea.en(golpe, () => { const [x, y] = ctx.centro(b); ctx.fx.chispas(x, y, 22, { color: '#ffffff', fuerza: 10, dir: -Math.PI / 2, abertura: 1.4 }); });
  cortado(ctx, golpe + 80);
}

export function choque(ctx) {
  const { b, el, sig, medio, dur, golpe } = preparar(ctx);
  if (el) {
    ctx.linea.anim(el, salida(sig), { dur: golpe + 80, easing: 'cubic-bezier(.6,0,.4,1)' });
    tiembla(ctx, el.firstElementChild, { en: golpe, dur: 420, fuerza: 7 });
  }
  ctx.linea.anim(b, [{ transform: medio }, { transform: medio, offset: golpe / dur },
    { transform: `translate3d(${-sig * 12}vw, 30px, 0) rotate(${-sig * 200}deg)`, offset: Math.min(0.95, golpe / dur + 0.2) },
    { transform: `translate3d(${-sig * 16}vw, 40px, 0) rotate(${-sig * 240}deg)`, opacity: 0.0 }], { dur, easing: 'ease-out' });
  ctx.linea.en(golpe, () => {
    const [x, y] = ctx.centro(b);
    ctx.fx.explotar(x, y, ctx.color(ctx.d.defensor));
    ctx.fx.chispas(x, y, 30, { color: ctx.color(ctx.d.defensor), fuerza: 11 });
    ctx.temblor(7, 0, 360);
  });
  cortado(ctx, golpe);
}
