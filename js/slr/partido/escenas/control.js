/* Duelo de control (en cada jugada): una entrada de la variante y después la barra con la
   probabilidad real (p del evento). Composición vertical: el rival arriba y tú abajo.
   · botas: una bota baja desde arriba y otra sube desde abajo; golpean el balón a la vez y salta fuego
   · bote: el balón bota de arriba abajo, cada vez más rápido, y se queda en el lado del que gana
   · escudos: las fotos de los dos equipos chocan en el centro y saltan rayos */
import { poner, BOTA, foto, barra, inclinacion, balonEn, en, medidas } from './comun.js';

function datos(ctx) {
  const d = ctx.d, T = ctx.T.control[d.completo ? 'completo' : 'rapido'];
  const pAbajo = ctx.lado(d.saca) === 'abajo' ? d.p : 1 - d.p;
  return { T, pAbajo, ganaAbajo: ctx.lado(d.ganador) === 'abajo' };
}
function conBarra(ctx, intro) {
  const d = ctx.d, { T, pAbajo, ganaAbajo } = datos(ctx);
  barra(ctx, { pAbajo, ganaAbajo, en: intro, dur: T.barra, sorpresa: d.sorpresa, inclina: inclinacion(ctx, d.poderes), titulo: 'Control del balón' });
}

export function botas(ctx) {
  const { T } = datos(ctx);
  const { W, H } = medidas(ctx);
  const cx = W / 2, cy = H * 0.4;
  const b = balonEn(ctx, cx, cy);
  const golpe = T.intro * 0.5;
  const bota = lado => {
    const el = poner(ctx, `<div class="slr-pt-bota" style="color:${ctx.color(ctx.lados[lado])}">${BOTA}</div>`);
    const w = el.getBoundingClientRect().width, bb = b.getBoundingClientRect().width;
    // La bota girada: la puntera mira al balón (arriba: hacia abajo; abajo: hacia arriba)
    const s = lado === 'arriba' ? -1 : 1, giro = lado === 'arriba' ? 90 : -90;
    const pegada = cy + s * (w / 2 + bb * 0.35), lejos = cy + s * H * 0.75;
    const t = y => `translate3d(${cx}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${giro}deg)`;
    ctx.linea.anim(el, [
      { transform: t(lejos), offset: 0 },
      { transform: `${t(pegada)} rotate(${-s * 6}deg)`, offset: golpe / T.intro },
      { transform: t(pegada + s * H * 0.06), offset: Math.min(0.85, golpe / T.intro + 0.18) },
      { transform: t(lejos), opacity: 0, offset: 1 },
    ], { dur: T.intro, easing: 'cubic-bezier(.5,0,.3,1)' });
  };
  bota('arriba'); bota('abajo');
  ctx.linea.anim(b, [{ transform: en(cx, cy, ' scale(1)') }, { transform: en(cx, cy, ' scale(1.25) rotate(40deg)'), offset: 0.5 }, { transform: en(cx, cy, ' scale(1)') }],
    { en: golpe, dur: 420, easing: 'ease-out' });
  ctx.linea.anim(b, [{ opacity: 1 }, { opacity: 0 }], { en: T.intro - 150, dur: 200, fill: 'forwards' });
  ctx.linea.en(golpe, () => {
    ctx.sonar('patada');
    const [x, y] = ctx.centro(b);
    ctx.fx.fuego(x, y, 34, { ancho: 60 });
    ctx.fx.chispas(x, y, 26, { color: '#ffd23a', fuerza: 11 });
    ctx.temblor(7, 0, 380);
  });
  conBarra(ctx, T.intro);
}

export function bote(ctx) {
  const { T, ganaAbajo } = datos(ctx);
  const { W, H } = medidas(ctx);
  const cx = W / 2, arriba = H * 0.16, abajo = H * 0.62, medio = H * 0.4;
  const b = balonEn(ctx, cx, medio);
  // Botes de un lado a otro, cada vez más rápidos (los offsets se van juntando)
  const n = ctx.d.completo ? 7 : 4;
  const pasos = Array.from({ length: n }, (_, k) => 1 / (k + 1.6));
  const total = pasos.reduce((s, x) => s + x, 0);
  const frames = [{ transform: en(cx, medio, ' rotate(0deg) scale(1)'), offset: 0 }];
  let o = 0;
  for (let k = 0; k < n; k++) {
    const ultimo = k === n - 1;
    const destino = ultimo ? (ganaAbajo ? abajo : arriba) : (k % 2 ? abajo : arriba);
    const lateral = (k % 2 ? 1 : -1) * W * 0.12;
    const mitad = o + pasos[k] / total / 2;
    o += pasos[k] / total;
    frames.push({ transform: en(cx + lateral, (medio + destino) / 2, ` rotate(${k * 180 + 90}deg) scale(1.2)`), offset: Math.min(0.999, mitad) });
    frames.push({ transform: en(cx, destino, ` rotate(${k * 180 + 180}deg) scale(1)`), offset: Math.min(1, o) });
  }
  ctx.linea.anim(b, frames, { dur: T.intro * 0.92, easing: 'linear' });
  ctx.linea.anim(b, [{ opacity: 1 }, { opacity: 0 }], { en: T.intro - 120, dur: 160, fill: 'forwards' });
  let t = 0;
  for (let k = 0; k < n; k++) { t += pasos[k] / total; if (k < 4) ctx.linea.en(T.intro * 0.92 * t, () => ctx.sonar('bote')); }
  ctx.linea.en(T.intro * 0.9, () => {
    const [x, y] = ctx.centro(b);
    ctx.fx.chispas(x, y, 18, { color: ctx.color(ctx.d.ganador), fuerza: 8 });
  });
  conBarra(ctx, T.intro);
}

export function escudos(ctx) {
  const { T } = datos(ctx);
  const { W, H } = medidas(ctx);
  const cx = W / 2, cy = H * 0.4;
  const choque = T.intro * 0.5;
  const uno = lado => {
    const l = ctx.lados[lado];
    const el = poner(ctx, '<div class="slr-pt-escudo"></div>');
    el.appendChild(foto(ctx, l, 'slr-pt-foto--grande'));
    const r = el.getBoundingClientRect().height;
    const s = lado === 'arriba' ? -1 : 1;
    const t = (y, extra = '') => `translate3d(${cx}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)${extra}`;
    ctx.linea.anim(el, [
      { transform: t(cy + s * H * 0.7, ' scale(.8)'), offset: 0 },
      { transform: t(cy + s * r * 0.42, ' scale(1.1)'), offset: choque / T.intro },
      { transform: t(cy + s * r * 0.95, ' scale(1)'), offset: Math.min(0.9, choque / T.intro + 0.2) },
      { transform: t(cy + s * r * 0.95, ' scale(1)'), opacity: 0, offset: 1 },
    ], { dur: T.intro, easing: 'cubic-bezier(.6,0,.4,1)' });
  };
  uno('arriba'); uno('abajo');
  ctx.linea.en(choque, () => {
    ctx.sonar('choque');
    const e = ctx.escenario.getBoundingClientRect();
    const x = e.left + cx, y = e.top + cy;
    ctx.fx.explotar(x, y, '#ffffff');
    ctx.fx.chispas(x, y, 30, { color: ctx.color(ctx.lados.abajo), fuerza: 10 });
    ctx.fx.chispas(x, y, 30, { color: ctx.color(ctx.lados.arriba), fuerza: 10 });
    ctx.temblor(8, 0, 420);
  });
  conBarra(ctx, T.intro);
}
