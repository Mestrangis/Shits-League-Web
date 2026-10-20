/* Chut: la barra (la p del chut) y, A LA VEZ, el balón sale disparado hacia la portería
   (arriba si atacas tú, abajo si ataca el rival), choca con la carta del portero y
   empuja temblando contra ella, con chispas en el punto de choque y todo temblando
   cada vez más. Cuando el ganador aplasta la barra: si es gol, el balón se mete y el
   portero cede; si no, el balón rebota. Después, «gol» o «parada»; las tres escenas
   comparten la colocación (montarChut). */
import { poner, cartaPartido, icono, barra, inclinacion, vibra, balonEn, medidas, caja, en } from './comun.js';

export function montarChut(ctx, { tirador = true, claseBalon = '' } = {}) {
  const d = ctx.d, s = ctx.hacia(d.equipo);           // −1: la portería está arriba
  const donde = s < 0 ? 'arriba' : 'abajo';
  const { W, H } = medidas(ctx);
  const porteria = poner(ctx, `<div class="slr-pt-porteria slr-pt-porteria--${donde}">${icono('porteria-red', 'slr-pt-porteria__red')}${icono('porteria')}</div>`);
  const portero = cartaPartido(ctx, d.portero, `slr-pt-carta--portero slr-pt-carta--portero-${donde}`);
  const tir = tirador && d.tirador ? cartaPartido(ctx, d.tirador, `slr-pt-carta--tirador slr-pt-carta--tirador-${donde === 'arriba' ? 'abajo' : 'arriba'}`) : null;
  const pc = caja(ctx, portero), gc = caja(ctx, porteria);
  const contactoY = pc.y - s * pc.h * 0.5;            // la cara del portero que mira al campo
  const salidaY = s < 0 ? H * 0.9 : H * 0.1;
  const b = balonEn(ctx, W / 2, salidaY, claseBalon);
  return { porteria, portero, tir, b, s, W, H, pc, gc, contactoY, salidaY };
}

export function disparo(ctx) {
  const d = ctx.d, T = ctx.T.chut, completo = d.completo;
  const vuelo = completo ? T.disparo_completo : T.disparo_rapido;
  const dur = completo ? T.barra_completo : T.barra_rapido;
  const { portero, tir, b, s, W, contactoY, salidaY } = montarChut(ctx);
  const pAbajo = ctx.lado(d.equipo) === 'abajo' ? d.p : 1 - d.p;
  const ganaAbajo = ctx.lado(d.gol ? d.equipo : d.defensor) === 'abajo';
  const pGanador = d.gol ? d.p : 1 - d.p;
  const tb = barra(ctx, { pAbajo, ganaAbajo, en: 0, dur: Math.max(dur, vuelo + 600), sorpresa: pGanador < ctx.A.ritmo.sorpresa, inclina: inclinacion(ctx, d.poderes), titulo: ctx.texto('chut'), arriba: s > 0 });
  const A = tb.aplasta;
  ctx.linea.anim(portero, [{ opacity: 0, transform: `translate3d(-50%, ${s * 30}%, 0) scale(.8)` }, { opacity: 1, transform: 'translate3d(-50%, 0, 0) scale(1)' }], { dur: 340 });
  if (tir) {
    ctx.linea.anim(tir, [{ opacity: 0, transform: `translate3d(0, ${-s * 30}%, 0)` }, { opacity: 1, transform: 'translate3d(0, 0, 0)', offset: 0.5 }, { opacity: 0, transform: 'translate3d(0, 0, 0)' }],
      { dur: vuelo + 300 });
  }
  // 1) El balón vuela hasta el portero
  ctx.linea.anim(b, [{ transform: en(W / 2, salidaY, ' scale(1) rotate(0deg)') }, { transform: en(W / 2, contactoY, ` scale(.9) rotate(${-s * 900}deg)`) }],
    { dur: vuelo, easing: 'cubic-bezier(.5,0,.2,1)' });
  ctx.linea.en(30, () => ctx.sonar('chut'));
  ctx.linea.en(vuelo, () => {
    const [x, y] = ctx.centro(b);
    ctx.fx.chispas(x, y, 30, { color: '#ffffff', fuerza: 11 });
    ctx.temblor(6, 0, 320);
  });
  // 2) Mientras pelea la barra: empuja temblando contra el portero, con chispas en el choque
  const empuje = A - vuelo;
  const n = Math.max(6, Math.round(empuje / 70));
  ctx.linea.anim(b, Array.from({ length: n + 1 }, (_, k) => {
    const f = k / n, presion = s * (4 + 10 * f) * (k % 2 ? 1 : 0.3), lado = (k % 3 - 1) * (3 + 5 * f);
    return { transform: en(W / 2 + lado, contactoY + presion, ` scale(.9) rotate(${(k % 2 ? 1 : -1) * 6 * f}deg)`) };
  }), { en: vuelo, dur: empuje, easing: 'linear', fill: 'forwards' });
  vibra(ctx, portero.firstElementChild, { en: vuelo, dur: empuje, fuerza: 4 });
  for (let t = vuelo + 110; t < A; t += 130) {
    const f = (t - vuelo) / empuje;
    ctx.linea.en(t, () => {
      const r = portero.getBoundingClientRect();
      ctx.fx.chispas(r.left + r.width / 2, s < 0 ? r.bottom : r.top, Math.round(4 + 8 * f), { color: '#ffd23a', fuerza: 5 + 4 * f, vida: 30 });
    });
  }
  for (let k = 0; k < 6; k++) ctx.linea.en(vuelo + empuje * k / 6, () => ctx.temblor(2 + k, 0, 320));
  // 3) El desenlace, al aplastar la barra: entra (y el portero cede) o rebota
  if (d.gol) {
    ctx.linea.anim(b, [{ transform: en(W / 2, contactoY + s * 14, ' scale(.9)') }, { transform: en(W / 2, contactoY - s * -60, ' scale(.75) rotate(200deg)'), opacity: 0.4 }],
      { en: A, dur: 400, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    ctx.linea.anim(portero, [{ transform: 'translate3d(-50%, 0, 0) rotate(0deg)' }, { transform: `translate3d(-50%, ${s * 12}%, 0) rotate(${s * 14}deg) scale(.92)` }],
      { en: A, dur: 400, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  } else {
    ctx.linea.anim(b, [{ transform: en(W / 2, contactoY, ' scale(.9)') }, { transform: en(W / 2 + W * 0.06, contactoY - s * 70, ' scale(1) rotate(-160deg)') }],
      { en: A, dur: 420, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  }
  ctx.linea.en(A, () => { const [x, y] = ctx.centro(b); ctx.fx.chispas(x, y, 28, { color: ctx.color(d.gol ? d.equipo : d.defensor), fuerza: 11 }); ctx.temblor(8, 0, 360); });
  ctx.linea.en(tb.fin, () => {});
}
