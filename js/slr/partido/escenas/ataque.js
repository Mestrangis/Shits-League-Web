/* Ataque contra defensa (sin barra): el césped corre hacia el ataque, el balón avanza y
   las cartas de la defensa rival esperan en su campo (arriba si atacas tú, abajo si
   ataca el rival), grandes y a lo ancho, temblando. Después viene «pase» (el ataque pasa)
   o «corte» (la defensa lo corta); las tres escenas comparten la colocación (montar). */
import { poner, cartaPartido, tiembla, balonEn, medidas, caja, en } from './comun.js';

// Defensas en su fila y balón (en el lado del atacante si desde; si no, ya en medio)
export function montar(ctx, { desde = false } = {}) {
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
  const filaY = cajas.size ? [...cajas.values()][0].y : (s < 0 ? H * 0.2 : H * 0.8);
  const altoCarta = cajas.size ? [...cajas.values()][0].h : H * 0.3;
  // El balón se para delante de la defensa
  const medioY = filaY - s * (altoCarta / 2 + H * 0.12);
  const inicioY = s < 0 ? H * 0.94 : H * 0.06;
  const b = balonEn(ctx, W / 2, desde ? inicioY : medioY);
  return { b, defs, cajas, s, W, H, medioY, inicioY, fila };
}

export function rueda(ctx) {
  const d = ctx.d, dur = ctx.T.ataque[d.completo ? 'completo' : 'rapido'];
  ctx.cespedAtaque(d.equipo, 'rapido');
  const { b, defs, s, W, medioY, inicioY } = montar(ctx, { desde: true });
  ctx.linea.anim(b, [{ transform: en(W / 2, inicioY, ' rotate(0deg)') }, { transform: en(W / 2, medioY, ` rotate(${-s * 720}deg)`) }],
    { dur: dur * 0.8, easing: 'cubic-bezier(.25,.8,.35,1)' });
  let k = 0;
  for (const el of defs.values()) {
    ctx.linea.anim(el, [{ opacity: 0, transform: `translate3d(0, ${s * 40}%, 0) scale(.85)` }, { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }],
      { en: k * 140, dur: 450, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    tiembla(ctx, el.firstElementChild, { en: 450 + k * 80, dur: dur - 450, fuerza: 3 });
    k++;
  }
  if (d.contraataque) ctx.linea.en(0, () => ctx.temblor(3, 0, 260));
  ctx.linea.en(dur, () => {});
}
