/* La defensa corta: una carta de la defensa (la elige el azar de la animación, con más
   peso para más DEF) va a por el balón, que sigue rodando hasta que llega, y «¡CORTADO!».
   Tres variantes distintas:
   · entrada: la carta se lanza deslizándose hacia el balón y se lo queda (el balón va con ella)
   · despeje: la carta lo golpea y el balón sale disparado fuera de la pantalla, girando
   · choque: la carta y el balón chocan; rayos, chispas y temblor */
import { rotulo, tiembla, en } from './comun.js';
import { montar, rodar } from './ataque.js';

function preparar(ctx, golpeFraccion) {
  const d = ctx.d, dur = ctx.T.corte[d.completo ? 'completo' : 'rapido'];
  const m = montar(ctx);
  for (const el of m.defs.values()) el.style.opacity = '1';
  const id = d.corta ?? d.defensas[0]?.carta;
  const el = m.defs.get(id) ?? [...m.defs.values()][0];
  const c = m.cajas.get(id) ?? [...m.cajas.values()][0];
  if (el) el.classList.add('es-corta');
  const golpe = dur * golpeFraccion;
  rodar(ctx, m.b, { x: m.W / 2, y: m.fijoY, s: m.s, dur: golpe });   // rueda hasta que llega la defensa
  return { ...m, el, c, dur, golpe };
}
const cortado = (ctx, t) => {
  ctx.linea.en(t, () => ctx.sonar('corte'));
  return rotulo(ctx, ctx.texto('cortado'), { en: t, clase: `slr-pt-rotulo--corte slr-pt-rotulo--${ctx.hacia(ctx.d.equipo) < 0 ? 'abajo' : 'arriba'}`, color: ctx.color(ctx.d.defensor) });
};
const fin = (ctx, t) => ctx.linea.en(t, () => {});
const desde = (golpe, dur) => ({ en: golpe, dur: Math.max(400, dur - golpe), fill: 'forwards' });

// Entrada: se lanza en plancha hacia el balón y se lo queda
export function entrada(ctx) {
  const { b, el, c, s, W, fijoY, dur, golpe } = preparar(ctx, 0.55);
  const dx = W / 2 - c.x, dy = fijoY - c.y + s * c.h * 0.3;
  const extra = -s * c.h * 0.25;   // sigue deslizando un poco hacia su campo con el balón
  if (el) {
    ctx.linea.anim(el, [
      { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)', offset: 0 },
      { transform: `translate3d(${dx * 0.3}px, ${dy * 0.15 - s * 18}px, 0) rotate(${dx < 0 ? 8 : -8}deg) scale(1.08)`, offset: 0.35 * golpe / dur },
      { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${dx < 0 ? -78 : 78}deg) scale(1.12)`, offset: golpe / dur },
      { transform: `translate3d(${dx}px, ${dy + extra}px, 0) rotate(${dx < 0 ? -82 : 82}deg) scale(1.12)`, offset: 1 },
    ], { dur, easing: 'cubic-bezier(.45,0,.25,1)' });
  }
  // La carta llega y se lo lleva pegado
  ctx.linea.anim(b, [{ transform: en(W / 2, fijoY, ' rotate(0deg)') }, { transform: en(W / 2, fijoY + extra * 0.9, ' rotate(-90deg)') }],
    { ...desde(golpe, dur), easing: 'cubic-bezier(.3,.7,.3,1)' });
  ctx.linea.en(golpe, () => {
    const [x, y] = ctx.centro(b);
    ctx.fx.chispas(x, y, 22, { color: ctx.color(ctx.d.defensor), fuerza: 8 });
    ctx.temblor(4, 0, 260);
  });
  fin(ctx, Math.max(dur, cortado(ctx, golpe)));
}

// Despeje: le pega y el balón sale disparado fuera de la pantalla, girando
export function despeje(ctx) {
  const { b, el, c, s, W, H, fijoY, dur, golpe } = preparar(ctx, 0.4);
  const dx = (W / 2 - c.x) * 0.6, dy = (fijoY - c.y) * 0.45;
  if (el) {
    ctx.linea.anim(el, [
      { transform: 'translate3d(0, 0, 0) rotate(0deg)', offset: 0 },
      { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${-s * 14}deg) scale(1.15)`, offset: golpe / dur },
      { transform: `translate3d(${dx * 0.7}px, ${dy * 0.6}px, 0) rotate(${-s * 6}deg) scale(1.1)`, offset: Math.min(0.9, golpe / dur + 0.2) },
      { transform: `translate3d(${dx * 0.5}px, ${dy * 0.5}px, 0) rotate(0deg) scale(1.08)`, offset: 1 },
    ], { dur, easing: 'cubic-bezier(.5,0,.3,1)' });
  }
  const lado = ctx.rng() < 0.5 ? -1 : 1;
  ctx.linea.anim(b, [
    { transform: en(W / 2, fijoY, ' rotate(0deg) scale(1)') },
    { transform: en(W / 2 + lado * W * 0.45, fijoY - s * H * 0.25, ` rotate(${lado * 900}deg) scale(.9)`), offset: 0.5 },
    { transform: en(W / 2 + lado * W * 0.9, fijoY - s * H * 0.45, ` rotate(${lado * 1440}deg) scale(.7)`) },
  ], { ...desde(golpe, dur), easing: 'cubic-bezier(.15,.7,.35,1)' });
  ctx.linea.en(golpe, () => {
    const [x, y] = ctx.centro(b);
    ctx.fx.chispas(x, y, 26, { color: '#ffffff', fuerza: 12, dir: lado > 0 ? -0.6 : Math.PI + 0.6, abertura: 1.2 });
    ctx.temblor(5, 0, 300);
  });
  fin(ctx, Math.max(dur, cortado(ctx, golpe + 120)));
}

// Choque: la carta y el balón chocan, rayos y temblor
export function choque(ctx) {
  const { b, el, c, s, W, fijoY, dur, golpe } = preparar(ctx, 0.4);
  const dx = (W / 2 - c.x) * 0.7, dy = (fijoY - c.y) + s * c.h * 0.55;
  if (el) {
    ctx.linea.anim(el, [{ transform: 'translate3d(0, 0, 0) scale(1)' }, { transform: `translate3d(${dx}px, ${dy}px, 0) scale(1.2)`, offset: golpe / dur },
      { transform: `translate3d(${dx * 0.85}px, ${dy * 0.85}px, 0) scale(1.15)` }], { dur, easing: 'cubic-bezier(.6,0,.4,1)' });
    tiembla(ctx, el.firstElementChild, { en: golpe, dur: 520, fuerza: 8 });
  }
  ctx.linea.anim(b, [{ transform: en(W / 2, fijoY) }, { transform: en(W / 2 + W * 0.08, fijoY + s * 40, ' rotate(200deg)'), offset: 0.5 },
    { transform: en(W / 2 + W * 0.1, fijoY + s * 54, ' rotate(240deg)'), opacity: 0 }], { ...desde(golpe, dur), easing: 'ease-out' });
  ctx.linea.en(golpe, () => {
    const [x, y] = ctx.centro(b);
    ctx.fx.explotar(x, y, ctx.color(ctx.d.defensor));
    ctx.fx.chispas(x, y, 32, { color: ctx.color(ctx.d.defensor), fuerza: 12 });
    ctx.temblor(9, 0, 460);
  });
  fin(ctx, Math.max(dur, cortado(ctx, golpe)));
}
