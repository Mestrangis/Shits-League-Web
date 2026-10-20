/* Chut: el balón sale disparado hacia la portería (arriba si atacas tú, abajo si ataca el
   rival), choca con la carta del portero y, mientras pelea la barra, empuja temblando
   contra ella como si intentara pasarla; tiembla todo. Después, «gol» o «parada»; las
   tres escenas comparten la colocación (montarChut). */
import { poner, cartaPartido, PORTERIA, barra, inclinacion, vibra, balonEn, medidas, caja, en } from './comun.js';

export function montarChut(ctx, { tirador = true, claseBalon = '' } = {}) {
  const d = ctx.d, s = ctx.hacia(d.equipo);           // −1: la portería está arriba
  const donde = s < 0 ? 'arriba' : 'abajo';
  const { W, H } = medidas(ctx);
  const porteria = poner(ctx, `<div class="slr-pt-porteria slr-pt-porteria--${donde}">${PORTERIA}</div>`);
  const portero = cartaPartido(ctx, d.portero, `slr-pt-carta--portero slr-pt-carta--portero-${donde}`);
  const tir = tirador && d.tirador ? cartaPartido(ctx, d.tirador, `slr-pt-carta--tirador slr-pt-carta--tirador-${donde === 'arriba' ? 'abajo' : 'arriba'}`) : null;
  const pc = caja(ctx, portero), gc = caja(ctx, porteria);
  const contactoY = pc.y - s * pc.h * 0.5;            // la cara del portero que mira al campo
  const salidaY = s < 0 ? H * 0.9 : H * 0.1;
  const b = balonEn(ctx, W / 2, salidaY, claseBalon);
  return { porteria, portero, tir, b, s, W, H, pc, gc, contactoY, salidaY };
}

export function disparo(ctx) {
  const d = ctx.d, T = ctx.T.chut[d.completo ? 'completo' : 'rapido'];
  ctx.cespedAtaque(d.equipo, 'rapido');
  const { portero, tir, b, s, W, contactoY, salidaY } = montarChut(ctx);
  ctx.linea.anim(portero, [{ opacity: 0, transform: `translate3d(-50%, ${s * 30}%, 0) scale(.8)` }, { opacity: 1, transform: 'translate3d(-50%, 0, 0) scale(1)' }], { dur: 340 });
  if (tir) ctx.linea.anim(tir, [{ opacity: 0, transform: `translate3d(0, ${-s * 30}%, 0)` }, { opacity: 1, transform: 'translate3d(0, 0, 0)' }], { dur: 300 });
  // El balón vuela hasta el portero
  const golpe = 150 + T.disparo;
  ctx.linea.anim(b, [{ transform: en(W / 2, salidaY, ' scale(1) rotate(0deg)') }, { transform: en(W / 2, contactoY, ` scale(.9) rotate(${-s * 900}deg)`) }],
    { en: 150, dur: T.disparo, easing: 'cubic-bezier(.5,0,.2,1)' });
  ctx.linea.en(170, () => ctx.sonar('chut'));
  ctx.linea.en(golpe, () => {
    const [x, y] = ctx.centro(b);
    ctx.fx.chispas(x, y, 30, { color: '#ffffff', fuerza: 11 });
    ctx.temblor(6, 0, 320);
  });
  // Tensión: el balón empuja contra el portero, todo tiembla, cada vez más
  const barraEn = golpe + 120;
  const pelea = T.barra * ctx.T.barra.pelea;
  const n = Math.max(6, Math.round(pelea / 70));
  ctx.linea.anim(b, Array.from({ length: n + 1 }, (_, k) => {
    const f = k / n, empuje = s * (4 + 10 * f) * (k % 2 ? 1 : 0.3), lado = (k % 3 - 1) * (3 + 5 * f);
    return { transform: en(W / 2 + lado, contactoY + empuje, ` scale(.9) rotate(${(k % 2 ? 1 : -1) * 6 * f}deg)`) };
  }), { en: barraEn, dur: pelea, easing: 'linear', fill: 'none' });
  vibra(ctx, portero.firstElementChild, { en: barraEn, dur: pelea, fuerza: 4 });
  for (let k = 0; k < 6; k++) ctx.linea.en(barraEn + pelea * k / 6, () => ctx.temblor(2 + k, 0, 320));
  // El tirador se aparta cuando sale la barra (si no, la tapa)
  if (tir) ctx.linea.anim(tir, [{ opacity: 1 }, { opacity: 0 }], { en: barraEn, dur: 260, fill: 'forwards' });
  const pAbajo = ctx.lado(d.equipo) === 'abajo' ? d.p : 1 - d.p;
  const ganaAbajo = ctx.lado(d.gol ? d.equipo : d.defensor) === 'abajo';
  const pGanador = d.gol ? d.p : 1 - d.p;
  barra(ctx, { pAbajo, ganaAbajo, en: barraEn, dur: T.barra, sorpresa: pGanador < 0.4, inclina: inclinacion(ctx, d.poderes), titulo: 'Chut', arriba: s > 0 });
}
