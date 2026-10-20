/* Parada: el portero se queda con un brillo de victoria y, por encima de todo, un gráfico
   animado distinto en cada variante, además del rótulo:
   · puños: dos guantes cerrados golpean el balón y lo despejan («¡DE PUÑOS!»)
   · atrapada: dos guantes abiertos agarran el balón y lo sujetan («¡A LAS MANOS!»)
   · estirada: un brazo estirado toca el balón in extremis con la punta del guante y lo
     desvía («¡PARADÓN!») */
import { rotulo, poner, PUNO, GUANTE, BRAZO, en } from './comun.js';
import { montarChut } from './chut.js';

function base(ctx, texto) {
  const d = ctx.d, T = ctx.T.parada;
  ctx.cesped(null);
  const m = montarChut(ctx, { tirador: false });
  const color = ctx.color(d.defensor);
  // El balón llega a la cara del portero y se queda ahí para el gesto
  m.b.style.transform = en(m.W / 2, m.contactoY, ' scale(1.15)');
  const brillo = poner(ctx, `<div class="slr-pt-brillo slr-pt-brillo--${m.s < 0 ? 'arriba' : 'abajo'}" style="--c:${color}"></div>`);
  ctx.linea.anim(brillo, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.5)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.35 },
    { opacity: 0.7, transform: 'translate(-50%, -50%) scale(1.1)' }], { en: T.gesto * 0.6, dur: T.total - T.gesto * 0.6, easing: 'ease-out' });
  ctx.linea.anim(m.portero, [{ transform: 'translate3d(-50%, 0, 0) scale(1)' }, { transform: `translate3d(-50%, ${-m.s * 12}%, 0) scale(1.25)` }],
    { en: T.gesto * 0.6, dur: 600, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
  const fin = rotulo(ctx, texto, { en: T.gesto, dur: T.total - T.gesto, clase: `slr-pt-rotulo--parada slr-pt-rotulo--${m.s < 0 ? 'abajo' : 'arriba'}`, color, sub: ctx.carta(d.portero)?.nombre ?? '' });
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
  const m = base(ctx, '¡DE PUÑOS!');
  const { W, H, s, contactoY, T, color } = m;
  const golpe = T.gesto * 0.45;
  // Dos puños desde la portería: retroceden, golpean el balón y se quedan
  for (const lado of [-1, 1]) {
    const p = poner(ctx, `<div class="slr-pt-guante slr-pt-guante--puno" style="color:${color}">${PUNO}</div>`);
    const x = W / 2 + lado * 22, y = contactoY + s * 52;
    const gira = s < 0 ? 180 : 0;   // los nudillos hacia el balón
    ctx.linea.anim(p, [
      { transform: `${en(x, y + s * 90)} translate(-50%, -50%) rotate(${gira + lado * 8}deg) scale(.6)`, opacity: 0, offset: 0 },
      { transform: `${en(x, y + s * 40)} translate(-50%, -50%) rotate(${gira}deg) scale(1)`, opacity: 1, offset: 0.25 },
      { transform: `${en(x, y)} translate(-50%, -50%) rotate(${gira}deg) scale(1.1)`, opacity: 1, offset: golpe / T.gesto },
      { transform: `${en(x, y + s * 22)} translate(-50%, -50%) rotate(${gira}deg) scale(1)`, opacity: 1, offset: 1 },
    ], { dur: T.gesto, easing: 'cubic-bezier(.6,0,.3,1)' });
  }
  // El balón sale despejado hacia el campo y a un lado, fuera de la pantalla
  const lado = ctx.rng() < 0.5 ? -1 : 1;
  ctx.linea.anim(m.b, [{ transform: en(W / 2, contactoY, ' scale(1.15) rotate(0deg)'), offset: 0 }, { transform: en(W / 2, contactoY, ' scale(1.15) rotate(0deg)'), offset: golpe / T.gesto },
    { transform: en(W / 2 + lado * W * 0.7, contactoY - s * H * 0.75, ` scale(.7) rotate(${lado * 1200}deg)`), offset: 1 }], { dur: T.gesto * 1.4, easing: 'cubic-bezier(.15,.7,.35,1)' });
  golpeo(ctx, golpe, m.b, color);
}

export function atrapada(ctx) {
  const m = base(ctx, '¡A LAS MANOS!');
  const { W, contactoY, T, color, s } = m;
  const cierra = T.gesto * 0.5;
  // Dos guantes abiertos llegan por los lados y se cierran sobre el balón
  for (const lado of [-1, 1]) {
    const g = poner(ctx, `<div class="slr-pt-guante slr-pt-guante--abierto" style="color:${color}">${GUANTE}</div>`);
    const w = g.getBoundingClientRect().width;
    const x = W / 2 + lado * w * 0.42;
    const giro = lado * (s < 0 ? 100 : 80);
    ctx.linea.anim(g, [
      { transform: `${en(x + lado * W * 0.5, contactoY)} translate(-50%, -50%) rotate(${giro + lado * 30}deg) scale(.8)`, opacity: 0, offset: 0 },
      { transform: `${en(x + lado * w * 0.4, contactoY)} translate(-50%, -50%) rotate(${giro + lado * 15}deg) scale(1)`, opacity: 1, offset: 0.35 },
      { transform: `${en(x, contactoY)} translate(-50%, -50%) rotate(${giro}deg) scale(1.05)`, opacity: 1, offset: cierra / T.gesto },
      { transform: `${en(x, contactoY)} translate(-50%, -50%) rotate(${giro}deg) scale(1)`, opacity: 1, offset: 1 },
    ], { dur: T.gesto, easing: 'cubic-bezier(.5,0,.3,1.2)' });
  }
  // El balón, agarrado: un apretón y se queda quieto
  ctx.linea.anim(m.b, [{ transform: en(W / 2, contactoY, ' scale(1.15)') }, { transform: en(W / 2, contactoY, ' scale(1.02, .9)'), offset: 0.4 }, { transform: en(W / 2, contactoY, ' scale(1.08)') }],
    { en: cierra, dur: 420, easing: 'ease-out' });
  golpeo(ctx, cierra, m.b, color);
}

export function estirada(ctx) {
  const m = base(ctx, '¡PARADÓN!');
  const { W, H, s, contactoY, T, color } = m;
  const toca = T.gesto * 0.55;
  const lado = ctx.rng() < 0.5 ? -1 : 1;   // de qué lado sale el brazo
  // El brazo entra en diagonal desde un lado y la punta del guante llega justo al balón
  const brazo = poner(ctx, `<div class="slr-pt-brazo" style="color:${color}">${BRAZO}</div>`);
  const bw = brazo.getBoundingClientRect().width;
  const ang = lado < 0 ? (s < 0 ? 18 : -18) : (s < 0 ? 162 : -162);   // apunta al balón desde su lado
  const rad = ang * Math.PI / 180;
  // Centro del brazo para que la punta (su extremo derecho antes de girar) toque el balón
  const cx = W / 2 - Math.cos(rad) * bw * 0.46, cy = contactoY - Math.sin(rad) * bw * 0.46;
  const lejos = 0.9;
  ctx.linea.anim(brazo, [
    { transform: `${en(cx - Math.cos(rad) * bw * lejos, cy - Math.sin(rad) * bw * lejos)} translate(-50%, -50%) rotate(${ang}deg)`, opacity: 0, offset: 0 },
    { transform: `${en(cx - Math.cos(rad) * bw * 0.25, cy - Math.sin(rad) * bw * 0.25)} translate(-50%, -50%) rotate(${ang}deg)`, opacity: 1, offset: 0.3 },
    { transform: `${en(cx, cy)} translate(-50%, -50%) rotate(${ang}deg)`, opacity: 1, offset: toca / T.gesto },
    { transform: `${en(cx - Math.cos(rad) * 10, cy - Math.sin(rad) * 10)} translate(-50%, -50%) rotate(${ang + (lado < 0 ? -4 : 4)}deg)`, opacity: 1, offset: 1 },
  ], { dur: T.gesto, easing: 'cubic-bezier(.5,0,.25,1)' });
  // El balón, desviado por la punta del guante hacia el otro lado, fuera de la pantalla
  ctx.linea.anim(m.b, [{ transform: en(W / 2, contactoY, ' scale(1.15) rotate(0deg)'), offset: 0 }, { transform: en(W / 2, contactoY, ' scale(1.15) rotate(0deg)'), offset: toca / T.gesto },
    { transform: en(W / 2 - lado * W * 0.75, contactoY + s * H * 0.08, ` scale(.8) rotate(${-lado * 900}deg)`), offset: 1 }], { dur: T.gesto * 1.5, easing: 'cubic-bezier(.15,.7,.35,1)' });
  golpeo(ctx, toca, m.b, color);
}
