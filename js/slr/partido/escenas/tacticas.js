/* Tácticas (motor v2): las viñetas VINETAS.tacticas.* (vinetas.js) en la caja cuadrada
   centrada, enganchadas a la línea con Linea.cuadros.
   · cruce: el choque de las dos tácticas, justo después del «VS» (y otra vez al descanso
     si alguien activa el plan B). Gana el lado del equipo del cruce; el premio es el
     BONUS_CRUCE del motor del partido («+6 %» con ×1,06). Sonido «choque».
   · planb: el plan B de un equipo al descanso (la táctica que tenía → la nueva). Sonido «plan_b». */
import { montarVineta } from './comun.js';
import { VINETAS } from '../vinetas.js';

const ventaja = bonus => (Number.isFinite(bonus) ? `+${Math.round((bonus - 1) * 100)} %` : undefined);

export function choque(ctx) {
  const d = ctx.d, ab = ctx.lados.abajo, ar = ctx.lados.arriba;
  const { v } = montarVineta(ctx, VINETAS.tacticas.choque, {
    abajo: { tactica: d.tacticas[ab], color: ctx.color(ab) },
    arriba: { tactica: d.tacticas[ar], color: ctx.color(ar) },
    gana: d.cruce ? ctx.lado(d.cruce) : null,
    ventaja: ventaja(d.bonus),
    escala: ctx.A.vinetas.tacticas_choque,
  });
  ctx.linea.en(v.momentos.choque, () => ctx.sonar('choque'));
  ctx.linea.en(v.dur, () => {});
}

export function cambio(ctx) {
  const d = ctx.d;
  const { v } = montarVineta(ctx, VINETAS.tacticas.cambio, {
    equipo: { de: d.de, a: d.a, color: ctx.color(d.equipo), nombre: ctx.equipo(d.equipo).nombre ?? '' },
    lado: ctx.lado(d.equipo),
    condicion: d.condicion ?? '',
    escala: ctx.A.vinetas.tacticas_cambio,
  });
  ctx.linea.en(v.momentos.cambio, () => ctx.sonar('plan_b'));
  ctx.linea.en(v.dur, () => {});
}
