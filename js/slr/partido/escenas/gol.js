/* Gol: la viñeta (VINETAS.gol.red · chilena · ardiendo, en vinetas.js), siempre detrás
   del chut (trasChut), en la misma caja cuadrada. En momentos.golpe suena el chut (si
   la viñeta lo repite; en «ardiendo», además, el fuego); en momentos.impacto: sonido de gol, temblor, el marcador de
   arriba y el rótulo «GOL» con el goleador, debajo de la viñeta (sin taparla). */
import { rotulo, montarVineta, cartaVineta } from './comun.js';
import { VINETAS } from '../vinetas.js';

function gol(ctx, variante) {
  const d = ctx.d, T = ctx.T.gol, color = ctx.color(d.equipo);
  const { v } = montarVineta(ctx, VINETAS.gol[variante], {
    color, escala: ctx.A.vinetas[`gol_${variante}`], trasChut: true,
    cartas: { tirador: cartaVineta(ctx, d.tirador), portero: cartaVineta(ctx, d.portero) },
  });
  const { golpe, impacto } = v.momentos;
  if (golpe > 0) ctx.linea.en(golpe, () => { ctx.sonar('chut'); if (variante === 'ardiendo') ctx.sonar('fuego'); });
  ctx.linea.en(impacto, () => { ctx.sonar('gol', { equipo: d.equipo }); ctx.temblor(10, 0, 700); });
  ctx.linea.en(impacto + T.marcador, () => ctx.marcador(d.marcadorTras, d.equipo), { estado: true });
  const fin = rotulo(ctx, ctx.texto('gol'), { en: impacto, dur: T.celebracion, clase: 'slr-pt-rotulo--gol slr-pt-rotulo--vineta', color, sub: ctx.carta(d.tirador)?.nombre ?? '' });
  ctx.linea.en(Math.max(v.dur, fin), () => {});
}

export const red = ctx => gol(ctx, 'red');
export const chilena = ctx => gol(ctx, 'chilena');
export const ardiendo = ctx => gol(ctx, 'ardiendo');
