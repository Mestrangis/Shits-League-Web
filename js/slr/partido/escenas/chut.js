/* Chut: la viñeta del choque (VINETAS.chut.choque, en vinetas.js) en una caja cuadrada
   centrada y, debajo, la barra con la p del chut. La viñeta dura lo que la escena y el
   balón sale disparado justo cuando el ganador aplasta la barra (suelta = aplasta).
   No dice si es gol: lo cuenta la escena siguiente («gol» o «parada»), que empalma en
   la misma caja. */
import { barra, inclinacion, montarVineta, cartaVineta } from './comun.js';
import { VINETAS } from '../vinetas.js';

export function disparo(ctx) {
  const d = ctx.d, T = ctx.T.chut;
  const dur = d.completo ? T.barra_completo : T.barra_rapido;
  const pAbajo = ctx.lado(d.equipo) === 'abajo' ? d.p : 1 - d.p;
  const ganaAbajo = ctx.lado(d.gol ? d.equipo : d.defensor) === 'abajo';
  const pGanador = d.gol ? d.p : 1 - d.p;
  const tb = barra(ctx, { pAbajo, ganaAbajo, en: 0, dur, sorpresa: pGanador < ctx.A.ritmo.sorpresa, inclina: inclinacion(ctx, d.poderes), titulo: ctx.texto('chut'), claseSorpresa: 'slr-pt-rotulo--entre' });
  const { v } = montarVineta(ctx, VINETAS.chut.choque, {
    dur: tb.fin, suelta: tb.aplasta, p: d.p, color: ctx.color(d.equipo), colorRival: ctx.color(d.defensor),
    cartas: { tirador: cartaVineta(ctx, d.tirador), portero: cartaVineta(ctx, d.portero) },
  });
  ctx.linea.en(v.momentos.suelta, () => ctx.sonar('chut'));
  ctx.linea.en(Math.max(tb.fin, v.dur), () => {});
}
