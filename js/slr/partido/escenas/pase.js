/* El ataque pasa: el balón sigue rodando un momento y, de golpe, cruza rápido entre los
   defensas, con estela, y se va por su campo; los defensas se apartan. */
import { poner, icono, en } from './comun.js';
import { montar, rodar } from './ataque.js';

export function estela(ctx) {
  const d = ctx.d, dur = ctx.T.pase[d.completo ? 'completo' : 'rapido'];
  const { b, defs, cajas, s, W, H, fijoY } = montar(ctx);
  for (const el of defs.values()) el.style.opacity = '1';
  const arranca = dur * 0.3;
  rodar(ctx, b, { x: W / 2, y: fijoY, s, dur: arranca });
  // Por qué hueco pasa: entre dos defensas (o por un lado si solo hay uno)
  const xs = [...cajas.values()].map(c => c.x).sort((a, b2) => a - b2);
  const huecos = xs.length > 1 ? xs.slice(1).map((x, i) => (x + xs[i]) / 2) : [xs[0] + (ctx.rng() < 0.5 ? -1 : 1) * W * 0.28];
  const hx = huecos[Math.floor(ctx.rng() * huecos.length)] ?? W / 2;
  const finY = s < 0 ? -H * 0.15 : H * 1.15;
  const viaje = dur - arranca;
  const tray = [{ transform: en(W / 2, fijoY, ' rotate(0deg)') }, { transform: en(hx, fijoY + (finY - fijoY) * 0.45, ` rotate(${-s * 540}deg)`), offset: 0.45 },
    { transform: en(hx, finY, ` rotate(${-s * 1080}deg)`) }];
  // Estela: balones fantasma que siguen al de verdad con retraso y se apagan
  for (let k = 4; k >= 1; k--) {
    const f = poner(ctx, `<div class="slr-pt-balon slr-pt-balon--libre slr-pt-balon--fantasma" style="--o:${(0.55 - k * 0.11).toFixed(2)}">${icono('balon')}</div>`);
    f.style.opacity = '0';
    ctx.linea.anim(f, tray.map((x, i) => ({ ...x, opacity: i === 0 ? 0 : i === 1 ? 1 : 0 })), { en: arranca + k * 45, dur: viaje * 0.6, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' });
  }
  ctx.linea.anim(b, tray, { en: arranca, dur: viaje * 0.6, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' });
  // Los defensas se apartan hacia atrás y se encogen (sin salirse de la pantalla)
  for (const [id, el] of defs) {
    const lado = cajas.get(id).x < hx ? -1 : 1;
    ctx.linea.anim(el, [{ transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)' }, { transform: `translate3d(${lado * 2}%, ${s * 8}%, 0) rotate(${lado * 6}deg) scale(.9)` }],
      { en: arranca + viaje * 0.15, dur: 380, easing: 'ease-out' });
  }
  ctx.linea.en(arranca + viaje * 0.2, () => {
    ctx.sonar('regate');
    const [x, y] = ctx.centro(b);
    ctx.fx.chispas(x, y, 18, { color: ctx.color(d.equipo), fuerza: 8, dir: s < 0 ? -Math.PI / 2 : Math.PI / 2, abertura: 1.2 });
  });
  ctx.linea.en(dur, () => {});
}
