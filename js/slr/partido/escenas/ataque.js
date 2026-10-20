/* Ataque contra defensa (sin barra): la cámara sigue al balón. El balón se queda en un
   sitio fijo de su campo, rodando y girando todo el tiempo con una microvibración,
   mientras el césped corre por debajo y la defensa rival se acerca (grande, a lo
   ancho, temblando). Después viene «pase» o «corte»; las tres escenas comparten la
   colocación (montar) y el balón rodando (rodar). */
import { poner, cartaPartido, tiembla, balonEn, medidas, caja, en } from './comun.js';

// Defensas en su fila y el balón en su sitio fijo (en el campo del que ataca)
export function montar(ctx) {
  const d = ctx.d, s = ctx.hacia(d.equipo);   // −1: el balón sube (atacas hacia arriba)
  const { W, H } = medidas(ctx);
  const fila = poner(ctx, `<div class="slr-pt-defensas slr-pt-defensas--${s < 0 ? 'arriba' : 'abajo'}" style="--n:${Math.max(1, d.defensas.length)}"></div>`);
  const defs = new Map();
  for (const x of d.defensas) {
    const el = cartaPartido(ctx, x.carta, 'slr-pt-carta--defensa');
    fila.appendChild(el);
    defs.set(x.carta, el);
  }
  const cajas = new Map([...defs].map(([id, el]) => [id, caja(ctx, el)]));
  const fijoY = s < 0 ? H * 0.72 : H * 0.28;
  const b = balonEn(ctx, W / 2, fijoY);
  return { b, defs, cajas, s, W, H, fijoY, fila };
}

// El balón rodando en su sitio: gira sin parar y vibra un poco (sensación de velocidad)
export function rodar(ctx, b, { x, y, s, dur, en: desde = 0 }) {
  const vueltas = Math.max(1, dur / 450);
  ctx.linea.anim(b, [{ transform: en(x, y, ' rotate(0deg)') }, { transform: en(x, y, ` rotate(${(-s * 360 * vueltas).toFixed(0)}deg)`) }],
    { en: desde, dur, easing: 'linear', fill: desde ? 'forwards' : 'both' });
  const m = ctx.A.efectos.microvibracion * ctx.A.efectos.temblor;
  if (m > 0) {
    const n = Math.max(4, Math.round(dur / 45));
    ctx.linea.anim(b.firstElementChild, Array.from({ length: n + 1 }, (_, k) => ({ transform: k === n ? 'translate3d(0,0,0)'
      : `translate3d(${((k * 7) % 3 - 1) * m}px, ${(k % 2 ? 1 : -1) * m}px, 0)` })), { en: desde, dur, easing: 'linear', fill: 'none' });
  }
}

export function rueda(ctx) {
  const d = ctx.d, dur = ctx.T.ataque[d.completo ? 'completo' : 'rapido'];
  const { b, defs, s, W, fijoY } = montar(ctx);
  rodar(ctx, b, { x: W / 2, y: fijoY, s, dur });
  // La defensa se acerca desde su campo (la cámara avanza hacia ella)
  let k = 0;
  for (const el of defs.values()) {
    ctx.linea.anim(el, [{ opacity: 0, transform: `translate3d(0, ${s * 60}%, 0) scale(.8)` }, { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }],
      { en: k * 140, dur: dur * 0.7, easing: 'cubic-bezier(.2,.8,.3,1)' });
    tiembla(ctx, el.firstElementChild, { en: dur * 0.5, dur: dur * 0.5, fuerza: 3 });
    k++;
  }
  if (d.contraataque) ctx.linea.en(0, () => ctx.temblor(3, 0, 260));
  ctx.linea.en(dur, () => {});
}
