/* Ataque contra defensa (sin barra): el balón rueda y aparecen temblando las cartas de la
   defensa rival. Después viene «pase» (el ataque pasa) o «corte» (la defensa lo corta);
   las tres escenas comparten la colocación (montar). */
import { balon, cartaPartido, tiembla } from './comun.js';

// Balón y defensas en su sitio. desde: el balón empieza en el lado del atacante (true) o ya en medio
export function montar(ctx, { desde = false } = {}) {
  const d = ctx.d, ladoAta = ctx.lado(d.equipo), sig = ladoAta === 'izq' ? 1 : -1;
  const defs = new Map();
  const n = d.defensas.length || 1;
  d.defensas.forEach((x, i) => {
    const el = cartaPartido(ctx, x.carta, `slr-pt-carta--defensa slr-pt-carta--${ladoAta === 'izq' ? 'der' : 'izq'}`);
    el.style.setProperty('--fila', `${(100 * (i + 1)) / (n + 1)}%`);
    defs.set(x.carta, el);
  });
  const b = balon(ctx, 'slr-pt-balon--ataque');
  const medio = `translate3d(${-sig * 4}vw, 0, 0)`;
  const inicio = `translate3d(${-sig * 36}vw, 0, 0)`;
  b.style.transform = desde ? inicio : medio;
  return { b, defs, sig, medio, inicio };
}

export function rueda(ctx) {
  const d = ctx.d, dur = ctx.T.ataque[d.completo ? 'completo' : 'rapido'];
  const { b, defs, sig, medio, inicio } = montar(ctx, { desde: true });
  ctx.linea.anim(b, [{ transform: `${inicio} rotate(0deg)` }, { transform: `${medio} rotate(${sig * 540}deg)` }], { dur: dur * 0.85, easing: 'cubic-bezier(.25,.8,.35,1)' });
  let k = 0;
  for (const el of defs.values()) {
    ctx.linea.anim(el, [{ opacity: 0, transform: `translate3d(${sig * 30}%, -50%, 0) scale(.8)` }, { opacity: 1, transform: 'translate3d(0, -50%, 0) scale(1)' }],
      { en: k * 90, dur: 320, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    tiembla(ctx, el.firstElementChild, { en: 320 + k * 60, dur: dur - 320, fuerza: 3 });
    k++;
  }
  if (d.contraataque) ctx.linea.en(0, () => ctx.temblor(2, 0, 200));
  ctx.linea.en(dur, () => {});
}
