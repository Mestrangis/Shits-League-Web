/* Duelo de control (en cada jugada): la barra con la probabilidad real (p del evento)
   y, A LA VEZ, la animación de la variante; su desenlace cae justo cuando el ganador
   aplasta la barra. Composición vertical: el rival arriba y tú abajo.
   · botas: entran por los lados (la tuya por la izquierda), pisan el balón y forcejean;
     al final la del ganador se lo lleva hacia su campo y salta fuego
   · bote: el balón bota de arriba abajo, cada vez más rápido, y se queda en el lado del que gana
   · escudos: las fotos de los dos equipos se empujan en el centro; al final el ganador
     echa al otro y saltan rayos */
import { pieza, foto, barra, inclinacion, balonEn, en, centrada, medidas, poner } from './comun.js';

function empezar(ctx) {
  const d = ctx.d, dur = ctx.T.control[d.completo ? 'completo' : 'rapido'];
  const pAbajo = ctx.lado(d.saca) === 'abajo' ? d.p : 1 - d.p;
  const ganaAbajo = ctx.lado(d.ganador) === 'abajo';
  const tb = barra(ctx, { pAbajo, ganaAbajo, en: 0, dur, sorpresa: d.sorpresa, inclina: inclinacion(ctx, d.poderes), titulo: ctx.texto('control') });
  ctx.linea.en(tb.fin, () => {});
  return { tb, ganaAbajo };
}
// Reparte n momentos entre a y b (forcejeo)
const pasos = (a, b, n) => Array.from({ length: n + 1 }, (_, k) => a + (b - a) * k / n);

export function botas(ctx) {
  const { tb, ganaAbajo } = empezar(ctx);
  const { W, H } = medidas(ctx);
  const cx = W / 2, cy = H * 0.42, A = tb.aplasta;
  const b = balonEn(ctx, cx, cy);
  const bb = b.getBoundingClientRect().width;
  const llegan = tb.pelea[0] + 250;
  const golpes = pasos(llegan, A - 120, 7);
  const bota = lado => {
    const izq = lado === 'izq';
    const l = izq ? ctx.lados.abajo : ctx.lados.arriba;      // la tuya (abajo) por la izquierda, como en el marcador
    const gana = izq === ganaAbajo;
    const el = pieza(ctx, 'bota', { color: ctx.color(l) });
    const w = el.getBoundingClientRect().width;
    const espejo = izq ? '' : ' scaleX(-1)';
    const pegada = cx + (izq ? -1 : 1) * (w * 0.42 + bb * 0.35);
    const fuera = cx + (izq ? -1 : 1) * (W * 0.5 + w);
    const t = (x, y = cy + bb * 0.1, extra = '') => ({ transform: centrada(x, y, `${espejo}${extra}`) });
    const f = [{ ...t(fuera), offset: 0 }, { ...t(pegada, undefined, ' rotate(-6deg)'), offset: llegan / A }];
    // Forcejeo: empujan y ceden, cada vez con más fuerza
    golpes.slice(1).forEach((g, k) => f.push({ ...t(pegada + (izq ? 1 : -1) * (k % 2 ? -1 : 1) * (3 + k), undefined, ` rotate(${k % 2 ? -4 : -9}deg)`), offset: g / A }));
    f.push({ ...t(pegada, undefined, ' rotate(-6deg)'), offset: 1 });
    ctx.linea.anim(el, f, { dur: A, easing: 'ease-in-out' });
    // El desenlace: la del ganador chuta (gira) y se queda; la otra sale despedida
    ctx.linea.anim(el, gana
      ? [t(pegada, undefined, ' rotate(-6deg)'), t(pegada + (izq ? 1 : -1) * bb * 0.3, undefined, ' rotate(-28deg)'), t(pegada, undefined, ' rotate(-10deg)')]
      : [t(pegada, undefined, ' rotate(-6deg)'), { ...t(fuera, cy - H * 0.05, ' rotate(30deg)'), opacity: 0 }],
    { en: A, dur: 600, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  };
  bota('izq'); bota('der');
  // El balón tiembla entre las dos botas y, al final, se va hacia el campo del ganador
  ctx.linea.anim(b, golpes.map((g, k) => ({ transform: en(cx + (k % 2 ? 1 : -1) * (2 + k * 0.6), cy, ` rotate(${k * 25}deg)`), offset: g / A })), { dur: A, easing: 'linear' });
  ctx.linea.anim(b, [{ transform: en(cx, cy) }, { transform: en(cx, cy + (ganaAbajo ? 1 : -1) * H * 0.2, ' rotate(540deg)'), opacity: 0.2 }],
    { en: A, dur: 650, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  ctx.linea.en(llegan, () => { ctx.sonar('patada'); const [x, y] = ctx.centro(b); ctx.fx.chispas(x, y, 14, { color: '#ffffff', fuerza: 7 }); ctx.temblor(3, 0, 200); });
  ctx.linea.en(A, () => {
    ctx.sonar('patada');
    const [x, y] = ctx.centro(b);
    ctx.fx.fuego(x, y, 34, { ancho: 60 });
    ctx.fx.chispas(x, y, 26, { color: '#ffd23a', fuerza: 11 });
    ctx.temblor(7, 0, 380);
  });
}

export function bote(ctx) {
  const { tb, ganaAbajo } = empezar(ctx);
  const { W, H } = medidas(ctx);
  const cx = W / 2, arriba = H * 0.16, abajo = H * 0.62, medio = H * 0.4, A = tb.aplasta;
  const b = balonEn(ctx, cx, medio);
  // Botes de un lado a otro, cada vez más rápidos; el último cae en el campo del ganador justo en A
  const n = ctx.d.completo ? 9 : 5;
  const largos = Array.from({ length: n }, (_, k) => 1 / (k + 1.6));
  const total = largos.reduce((s, x) => s + x, 0);
  const frames = [{ transform: en(cx, medio, ' rotate(0deg) scale(1)'), offset: 0 }];
  let o = 0;
  for (let k = 0; k < n; k++) {
    const ultimo = k === n - 1;
    const destino = ultimo ? (ganaAbajo ? abajo : arriba) : (k % 2 ? abajo : arriba);
    const lateral = (k % 2 ? 1 : -1) * W * 0.12;
    const mitad = o + largos[k] / total / 2;
    o += largos[k] / total;
    frames.push({ transform: en(cx + lateral, (medio + destino) / 2, ` rotate(${k * 180 + 90}deg) scale(1.2)`), offset: Math.min(0.999, mitad) });
    frames.push({ transform: en(cx, destino, ` rotate(${k * 180 + 180}deg) scale(1)`), offset: Math.min(1, o) });
  }
  ctx.linea.anim(b, frames, { dur: A, easing: 'linear' });
  let t = 0;
  for (let k = 0; k < n - 1; k++) { t += largos[k] / total; if (k % 2 === 0) ctx.linea.en(A * t, () => ctx.sonar('bote')); }
  ctx.linea.en(A, () => {
    const [x, y] = ctx.centro(b);
    ctx.fx.chispas(x, y, 22, { color: ctx.color(ctx.d.ganador), fuerza: 9 });
    ctx.temblor(4, 0, 260);
  });
}

export function escudos(ctx) {
  const { tb, ganaAbajo } = empezar(ctx);
  const { W, H } = medidas(ctx);
  const cx = W / 2, cy = H * 0.4, A = tb.aplasta;
  const llegan = tb.pelea[0] + 300;
  const empujes = pasos(llegan, A - 100, 6);
  const uno = lado => {
    const l = ctx.lados[lado];
    const gana = (lado === 'abajo') === ganaAbajo;
    const el = poner(ctx, '<div class="slr-pt-escudo"></div>');
    el.appendChild(foto(ctx, l, 'slr-pt-foto--grande'));
    const r = el.getBoundingClientRect().height;
    const s = lado === 'arriba' ? -1 : 1;
    const t = (y, extra = '') => ({ transform: centrada(cx, y, extra) });
    const junto = cy + s * r * 0.45;
    const f = [{ ...t(cy + s * H * 0.7, ' scale(.8)'), offset: 0 }, { ...t(junto, ' scale(1.05)'), offset: llegan / A }];
    // Se empujan: ahora uno, ahora el otro
    empujes.slice(1).forEach((g, k) => f.push({ ...t(junto + s * (k % 2 ? 1 : -1) * (4 + k * 1.5), ` scale(${k % 2 ? 1 : 1.08})`), offset: g / A }));
    f.push({ ...t(junto, ' scale(1.05)'), offset: 1 });
    ctx.linea.anim(el, f, { dur: A, easing: 'ease-in-out' });
    // El desenlace: el ganador avanza; el otro sale despedido
    ctx.linea.anim(el, gana ? [t(junto, ' scale(1.05)'), t(cy + s * r * 0.15, ' scale(1.2)'), t(cy + s * r * 0.3, ' scale(1.1)')]
      : [t(junto, ' scale(1.05)'), { ...t(cy + s * H * 0.6, ' scale(.7) rotate(25deg)'), opacity: 0 }], { en: A, dur: 600, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  };
  uno('arriba'); uno('abajo');
  const choque = () => { const e = ctx.escenario.getBoundingClientRect(); return [e.left + cx, e.top + cy]; };
  ctx.linea.en(llegan, () => { ctx.sonar('choque'); const [x, y] = choque(); ctx.fx.chispas(x, y, 20, { color: '#ffffff', fuerza: 8 }); ctx.temblor(4, 0, 260); });
  ctx.linea.en(A, () => {
    ctx.sonar('choque');
    const [x, y] = choque();
    ctx.fx.explotar(x, y, ctx.color(ctx.d.ganador));
    ctx.fx.chispas(x, y, 30, { color: ctx.color(ctx.lados.abajo), fuerza: 10 });
    ctx.fx.chispas(x, y, 30, { color: ctx.color(ctx.lados.arriba), fuerza: 10 });
    ctx.temblor(8, 0, 420);
  });
}
