/* Quién chuta: las cartas candidatas (evento «tirador») parpadean como una ruleta,
   cada vez más despacio, y se para en la que chuta, que aparece en grande. */
import { cartaPartido } from './comun.js';

export function ruleta(ctx) {
  const d = ctx.d, T = ctx.T.tirador, dur = T[d.completo ? 'completo' : 'rapido'];
  const ids = d.candidatos.map(c => c.carta);
  const fila = ctx.escenario.appendChild(document.createElement('div'));
  fila.className = 'slr-pt-ruleta';
  fila.style.setProperty('--n', ids.length);
  const cartas = ids.map(id => {
    const el = cartaPartido(ctx, id, 'slr-pt-carta--ruleta');
    fila.appendChild(el);
    el.insertAdjacentHTML('beforeend', `<i class="slr-pt-ruleta__luz" style="--c:${ctx.color(d.equipo)}"></i>`);
    return el;
  });
  const fin = ids.indexOf(d.elegido);
  // Pasos de la ruleta: dan vueltas y terminan en el elegido; cada paso un poco más lento
  const n = Math.max(ids.length * 2, (d.completo ? T.pasos : Math.ceil(T.pasos / 2)));
  const pasos = n - ((n - fin) % ids.length) + 1;
  const giro = dur - T.grande;
  const tiempos = Array.from({ length: pasos }, (_, k) => k / (pasos - 1));
  const at = f => giro * (1 - (1 - f) ** 1.8);   // va frenando
  tiempos.forEach((f, k) => {
    const i = k % ids.length, t = at(f), sig = at(tiempos[k + 1] ?? 1) - t;
    const ultimo = k === pasos - 1;
    ctx.linea.anim(cartas[i].querySelector('.slr-pt-ruleta__luz'), ultimo
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { en: t, dur: ultimo ? 120 : Math.max(60, sig), fill: ultimo ? 'forwards' : 'none' });
    if (k % 3 === 0 || ultimo) ctx.linea.en(t, () => ctx.sonar('ruleta', { ultimo }));
  });
  // El elegido, en grande; los demás se apagan
  cartas.forEach((el, i) => {
    if (i === fin) {
      const desp = (i - (ids.length - 1) / 2) * 100;
      ctx.linea.anim(el, [{ transform: 'translate3d(0, 0, 0) scale(1)' }, { transform: `translate3d(${-desp}%, 8%, 0) scale(1.75)` }],
        { en: giro, dur: T.grande, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    } else {
      ctx.linea.anim(el, [{ opacity: 1 }, { opacity: 0 }], { en: giro, dur: T.grande * 0.6 });
    }
  });
  ctx.linea.en(giro + T.grande * 0.6, () => {
    const [x, y] = ctx.centro(cartas[fin]);
    ctx.fx.chispas(x, y, 24, { color: ctx.color(d.equipo), fuerza: 9 });
  });
  ctx.linea.en(dur, () => {});
}
