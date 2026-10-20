/* Parada: la viñeta (VINETAS.parada.punos · atrapada · estirada, en vinetas.js), siempre
   detrás del chut (trasChut), en la misma caja cuadrada, con el color del equipo del
   portero. En momentos.impacto: sonido de parada, un temblor pequeño y el rótulo de la
   parada con el nombre del portero, debajo de la viñeta. */
import { rotulo, montarVineta, cartaVineta } from './comun.js';
import { VINETAS } from '../vinetas.js';

function parada(ctx, variante, clave) {
  const d = ctx.d, color = ctx.color(d.defensor);
  const { v } = montarVineta(ctx, VINETAS.parada[variante], {
    color, escala: ctx.A.vinetas[`parada_${variante}`], trasChut: true,
    cartas: { tirador: cartaVineta(ctx, d.tirador), portero: cartaVineta(ctx, d.portero) },
  });
  const { impacto } = v.momentos;
  ctx.linea.en(impacto, () => { ctx.sonar('parada'); ctx.temblor(4, 0, 300); });
  const fin = rotulo(ctx, ctx.texto(clave), { en: impacto, clase: 'slr-pt-rotulo--parada slr-pt-rotulo--vineta', color, sub: ctx.carta(d.portero)?.nombre ?? '' });
  ctx.linea.en(Math.max(v.dur, fin), () => {});
}

export const punos = ctx => parada(ctx, 'punos', 'puños');
export const atrapada = ctx => parada(ctx, 'atrapada', 'atrapada');
export const estirada = ctx => parada(ctx, 'estirada', 'estirada');
