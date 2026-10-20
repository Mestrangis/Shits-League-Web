/* El ataque pasa: el balón cruza rápido entre los defensas, con estela, y se va por su
   campo; los defensas se apartan. */
import { poner, BALON, en } from './comun.js';
import { montar } from './ataque.js';

export function estela(ctx) {
  const d = ctx.d, dur = ctx.T.pase[d.completo ? 'completo' : 'rapido'];
  ctx.cespedAtaque(d.equipo, 'rapido');
  const { b, defs, cajas, s, W, H, medioY } = montar(ctx);
  // Por qué hueco pasa: entre dos defensas (o por un lado si solo hay uno)
  const xs = [...cajas.values()].map(c => c.x).sort((a, b2) => a - b2);
  const huecos = xs.length > 1 ? xs.slice(1).map((x, i) => (x + xs[i]) / 2) : [xs[0] + (ctx.rng() < 0.5 ? -1 : 1) * W * 0.28];
  const hx = huecos[Math.floor(ctx.rng() * huecos.length)] ?? W / 2;
  const finY = s < 0 ? -H * 0.15 : H * 1.15;
  const viaje = dur * 0.55;
  const tray = [{ transform: en(W / 2, medioY, ' rotate(0deg)') }, { transform: en(hx, medioY + (finY - medioY) * 0.45, ` rotate(${-s * 540}deg)`), offset: 0.45 },
    { transform: en(hx, finY, ` rotate(${-s * 1080}deg)`) }];
  // Estela: balones fantasma que siguen al de verdad con retraso y se apagan
  for (let k = 4; k >= 1; k--) {
    const f = poner(ctx, `<div class="slr-pt-balon slr-pt-balon--libre slr-pt-balon--fantasma" style="--o:${(0.55 - k * 0.11).toFixed(2)}">${BALON}</div>`);
    ctx.linea.anim(f, tray, { en: k * 45, dur: viaje, easing: 'cubic-bezier(.6,0,.2,1)' });
  }
  ctx.linea.anim(b, tray, { dur: viaje, easing: 'cubic-bezier(.6,0,.2,1)' });
  // Los defensas se apartan del hueco
  for (const [id, el] of defs) {
    el.style.opacity = '1';
    const lado = cajas.get(id).x < hx ? -1 : 1;
    // Se apartan hacia atrás y se encogen (sin salirse de la pantalla)
    ctx.linea.anim(el, [{ transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)' }, { transform: `translate3d(${lado * 2}%, ${s * 8}%, 0) rotate(${lado * 6}deg) scale(.9)` }],
      { en: viaje * 0.3, dur: 380, easing: 'ease-out' });
  }
  ctx.linea.en(viaje * 0.4, () => {
    ctx.sonar('regate');
    const [x, y] = ctx.centro(b);
    ctx.fx.chispas(x, y, 18, { color: ctx.color(d.equipo), fuerza: 8, dir: s < 0 ? -Math.PI / 2 : Math.PI / 2, abertura: 1.2 });
  });
  ctx.linea.en(dur, () => {});
}
