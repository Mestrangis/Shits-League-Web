/* Parada: el portero se queda con un brillo de victoria y, por encima de todo, un gráfico
   animado distinto en cada variante (iconos de img/slr/partido/), además del rótulo:
   · puños: dos guantes cerrados (puno.svg) golpean el balón y lo despejan
   · atrapada: dos guantes abiertos (guante.svg) agarran el balón y lo sujetan
   · estirada: un brazo estirado (brazo.svg) toca el balón in extremis con la punta del
     guante y lo desvía */
import { rotulo, poner, pieza, en, centrada } from './comun.js';
import { montarChut } from './chut.js';

function base(ctx, clave) {
  const d = ctx.d, T = ctx.T.parada;
  const m = montarChut(ctx, { tirador: false });
  const color = ctx.color(d.defensor);
  // El balón llega a la cara del portero y se queda ahí para el gesto
  m.b.style.transform = en(m.W / 2, m.contactoY, ' scale(1.15)');
  const brillo = poner(ctx, `<div class="slr-pt-brillo slr-pt-brillo--${m.s < 0 ? 'arriba' : 'abajo'}" style="--c:${color}"></div>`);
  ctx.linea.anim(brillo, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.5)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.35 },
    { opacity: 0.7, transform: 'translate(-50%, -50%) scale(1.1)' }], { en: T.gesto * 0.6, dur: Math.max(400, T.total - T.gesto * 0.6), easing: 'ease-out' });
  // Durante el gesto la carta se atenúa (los guantes se leen mejor); después, en grande y con brillo
  ctx.linea.anim(m.portero, [{ transform: 'translate3d(-50%, 0, 0) scale(1)', opacity: 0.4 }, { transform: 'translate3d(-50%, 0, 0) scale(1)', opacity: 0.4, offset: 0.6 },
    { transform: `translate3d(-50%, ${-m.s * 12}%, 0) scale(1.25)`, opacity: 1 }], { dur: T.gesto + 500, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
  const fin = rotulo(ctx, ctx.texto(clave), { en: T.gesto, dur: T.total - T.gesto, clase: `slr-pt-rotulo--parada slr-pt-rotulo--${m.s < 0 ? 'abajo' : 'arriba'}`, color, sub: ctx.carta(d.portero)?.nombre ?? '' });
  ctx.linea.en(Math.max(fin, T.total), () => {});
  return { ...m, T, color };
}
const golpeo = (ctx, t, b, color) => ctx.linea.en(t, () => {
  ctx.sonar('parada');
  const [x, y] = ctx.centro(b);
  ctx.fx.chispas(x, y, 36, { color, fuerza: 12 });
  ctx.fx.chispas(x, y, 16, { color: '#ffffff', fuerza: 8 });
  ctx.temblor(7, 0, 360);
});

export function punos(ctx) {
  const m = base(ctx, 'puños');
  const { W, H, s, contactoY, T, color } = m;
  const golpe = T.gesto * 0.45;
  // Dos puños desde la portería: retroceden, golpean el balón y se quedan
  for (const lado of [-1, 1]) {
    const p = pieza(ctx, 'puno', { color });
    const ph = p.getBoundingClientRect().height;
    const x = W / 2 + lado * ph * 0.3, y = contactoY + s * ph * 0.62;
    const gira = s < 0 ? 180 : 0;   // los nudillos hacia el balón
    ctx.linea.anim(p, [
      { transform: centrada(x, y + s * ph * 0.9, ` rotate(${gira + lado * 8}deg) scale(.6)`), opacity: 0, offset: 0 },
      { transform: centrada(x, y + s * ph * 0.45, ` rotate(${gira}deg) scale(1)`), opacity: 1, offset: 0.3 },
      { transform: centrada(x, y, ` rotate(${gira}deg) scale(1.1)`), opacity: 1, offset: golpe / T.gesto },
      { transform: centrada(x, y + s * ph * 0.2, ` rotate(${gira}deg) scale(1)`), opacity: 1, offset: 1 },
    ], { dur: T.gesto, easing: 'cubic-bezier(.6,0,.3,1)' });
  }
  // El balón sale despejado hacia el campo y a un lado, fuera de la pantalla
  const lado = ctx.rng() < 0.5 ? -1 : 1;
  ctx.linea.anim(m.b, [{ transform: en(W / 2, contactoY, ' scale(1.15) rotate(0deg)') },
    { transform: en(W / 2 + lado * W * 0.7, contactoY - s * H * 0.75, ` scale(.7) rotate(${lado * 1200}deg)`) }],
  { en: golpe, dur: T.gesto * 0.9, easing: 'cubic-bezier(.15,.7,.35,1)', fill: 'forwards' });
  golpeo(ctx, golpe, m.b, color);
}

export function atrapada(ctx) {
  const m = base(ctx, 'atrapada');
  const { W, contactoY, T, color } = m;
  const cierra = T.gesto * 0.5;
  // Dos guantes abiertos llegan por los lados y se cierran sobre el balón (los dedos lo envuelven)
  for (const lado of [-1, 1]) {
    const g = pieza(ctx, 'guante', { color });
    const w = g.getBoundingClientRect().width;
    const x = W / 2 + lado * w * 0.42;
    const giro = -lado * 90;                        // los dedos hacia el balón
    const espejo = lado > 0 ? ' scaleX(-1)' : '';
    ctx.linea.anim(g, [
      { transform: centrada(x + lado * W * 0.5, contactoY, ` rotate(${giro + lado * 30}deg)${espejo} scale(.8)`), opacity: 0, offset: 0 },
      { transform: centrada(x + lado * w * 0.4, contactoY, ` rotate(${giro + lado * 15}deg)${espejo} scale(1)`), opacity: 1, offset: 0.35 },
      { transform: centrada(x, contactoY, ` rotate(${giro}deg)${espejo} scale(1.05)`), opacity: 1, offset: cierra / T.gesto },
      { transform: centrada(x, contactoY, ` rotate(${giro}deg)${espejo} scale(1)`), opacity: 1, offset: 1 },
    ], { dur: T.gesto, easing: 'cubic-bezier(.5,0,.3,1.2)' });
  }
  // El balón, agarrado: un apretón y se queda quieto
  ctx.linea.anim(m.b, [{ transform: en(W / 2, contactoY, ' scale(1.15)') }, { transform: en(W / 2, contactoY, ' scale(1.02, .9)'), offset: 0.4 }, { transform: en(W / 2, contactoY, ' scale(1.08)') }],
    { en: cierra, dur: 420, easing: 'ease-out', fill: 'forwards' });
  golpeo(ctx, cierra, m.b, color);
}

export function estirada(ctx) {
  const m = base(ctx, 'estirada');
  const { W, H, s, contactoY, T, color } = m;
  const toca = T.gesto * 0.55;
  const lado = ctx.rng() < 0.5 ? -1 : 1;   // de qué lado sale el brazo
  // El brazo entra en diagonal desde un lado y la punta del guante llega justo al balón
  const brazo = pieza(ctx, 'brazo', { color });
  const bw = brazo.getBoundingClientRect().width;
  const ang = lado < 0 ? (s < 0 ? 18 : -18) : (s < 0 ? 162 : -162);
  const rad = ang * Math.PI / 180;
  const cx = W / 2 - Math.cos(rad) * bw * 0.44, cy = contactoY - Math.sin(rad) * bw * 0.44;
  const voltea = lado > 0 ? ' scaleY(-1)' : '';   // el pulgar arriba también desde la derecha
  const pos = (d, extra = 0) => centrada(cx - Math.cos(rad) * d, cy - Math.sin(rad) * d, ` rotate(${ang + extra}deg)${voltea}`);
  ctx.linea.anim(brazo, [
    { transform: pos(bw * 0.9), opacity: 0, offset: 0 },
    { transform: pos(bw * 0.25), opacity: 1, offset: 0.3 },
    { transform: pos(0), opacity: 1, offset: toca / T.gesto },
    { transform: pos(10, lado < 0 ? -4 : 4), opacity: 1, offset: 1 },
  ], { dur: T.gesto, easing: 'cubic-bezier(.5,0,.25,1)' });
  // El balón, desviado por la punta del guante hacia el otro lado, fuera de la pantalla
  ctx.linea.anim(m.b, [{ transform: en(W / 2, contactoY, ' scale(1.15) rotate(0deg)') },
    { transform: en(W / 2 - lado * W * 0.75, contactoY + s * H * 0.08, ` scale(.8) rotate(${-lado * 900}deg)`) }],
  { en: toca, dur: T.gesto * 0.9, easing: 'cubic-bezier(.15,.7,.35,1)', fill: 'forwards' });
  golpeo(ctx, toca, m.b, color);
}
