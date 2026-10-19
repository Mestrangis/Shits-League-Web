/* Chut: el balón sale disparado hacia la portería, la carta del portero choca con él y
   vuelve la barra de porcentajes (la p del chut). Después, «gol» o «parada»; las tres
   escenas comparten la colocación (montarChut). */
import { poner, balon, cartaPartido, PORTERIA, barra, inclinacion, tiembla } from './comun.js';

export function montarChut(ctx, { tirador = true } = {}) {
  const d = ctx.d;
  const porteria = poner(ctx, `<div class="slr-pt-porteria">${PORTERIA}</div>`);
  const portero = cartaPartido(ctx, d.portero, 'slr-pt-carta--portero');
  const tir = tirador && d.tirador ? cartaPartido(ctx, d.tirador, `slr-pt-carta--tirador slr-pt-carta--${ctx.lado(d.equipo)}`) : null;
  const b = balon(ctx, 'slr-pt-balon--chut');
  return { porteria, portero, tir, b };
}

export function disparo(ctx) {
  const d = ctx.d, T = ctx.T.chut[d.completo ? 'completo' : 'rapido'];
  const { portero, tir, b } = montarChut(ctx);
  ctx.linea.anim(portero, [{ opacity: 0, transform: 'translate3d(-50%, -30%, 0) scale(.8)' }, { opacity: 1, transform: 'translate3d(-50%, 0, 0) scale(1)' }], { dur: 260 });
  if (tir) ctx.linea.anim(tir, [{ opacity: 0, transform: 'translate3d(0, 30%, 0)' }, { opacity: 1, transform: 'translate3d(0, 0, 0)' }], { dur: 220 });
  // El balón sube hasta el portero (golpe) y rebota un poco
  ctx.linea.anim(b, [
    { transform: 'translate3d(-50%, 0, 0) scale(1) rotate(0deg)' },
    { transform: 'translate3d(-50%, -44vh, 0) scale(.62) rotate(720deg)', offset: 0.85 },
    { transform: 'translate3d(-50%, -41vh, 0) scale(.62) rotate(760deg)' },
  ], { en: 120, dur: T.disparo, easing: 'cubic-bezier(.5,0,.2,1)' });
  const golpe = 120 + T.disparo * 0.85;
  ctx.linea.en(140, () => ctx.sonar('chut'));
  ctx.linea.en(golpe, () => {
    const [x, y] = ctx.centro(b);
    ctx.fx.chispas(x, y, 26, { color: '#ffffff', fuerza: 10 });
    ctx.temblor(4, 0, 260);
  });
  tiembla(ctx, portero.firstElementChild, { en: golpe, dur: 400, fuerza: 5 });
  // El tirador se aparta cuando sale la barra (si no, tapa su porcentaje)
  if (tir) ctx.linea.anim(tir, [{ opacity: 1 }, { opacity: 0 }], { en: 120 + T.disparo, dur: 220, fill: 'forwards' });
  const pIzq = ctx.lado(d.equipo) === 'izq' ? d.p : 1 - d.p;
  const ganaIzq = ctx.lado(d.gol ? d.equipo : d.defensor) === 'izq';
  const pGanador = d.gol ? d.p : 1 - d.p;
  barra(ctx, { pIzq, ganaIzq, en: 120 + T.disparo, dur: T.barra, sorpresa: pGanador < 0.4, inclina: inclinacion(ctx, d.poderes), titulo: 'Chut' });
}
