/* Gol: el balón entra, la red se hunde, la pantalla tiembla y sale «GOL» en grande con
   el goleador; el marcador de arriba se actualiza con un golpe.
   Variantes: red (la red se hunde mucho), chilena (el goleador gira y el balón entra en
   parábola), ardiendo (el balón deja una estela de fuego). */
import { rotulo } from './comun.js';
import { montarChut } from './chut.js';

function base(ctx, { tiro, golpe, extra }) {
  const d = ctx.d, T = ctx.T.gol;
  const m = montarChut(ctx);
  m.portero.style.opacity = '0.9';
  m.portero.style.transform = 'translate3d(-50%, 0, 0)';
  // El portero se queda atrás, vencido
  ctx.linea.anim(m.portero, [{ transform: 'translate3d(-50%, 0, 0) rotate(0deg)' }, { transform: `translate3d(${ctx.lado(d.defensor) === 'izq' ? '-95%' : '-5%'}, 6%, 0) rotate(${ctx.lado(d.defensor) === 'izq' ? -24 : 24}deg) scale(.9)`, opacity: 0.55 }],
    { dur: golpe, easing: 'ease-out' });
  ctx.linea.anim(m.b, tiro, { dur: golpe, easing: 'cubic-bezier(.4,0,.2,1)' });
  // La red se hunde
  const red = m.porteria.querySelector('.slr-pt-porteria__red');
  ctx.linea.anim(red, [{ transform: 'translate3d(0, 0, 0) scale(1)' }, { transform: `translate3d(0, -6px, 0) scale(1.05, ${extra.hundir ?? 0.8})` }, { transform: 'translate3d(0, 0, 0) scale(1)' }],
    { en: golpe, dur: 600, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
  const color = ctx.color(d.equipo);
  ctx.linea.en(golpe, () => {
    ctx.sonar('gol', { equipo: d.equipo });
    const [x, y] = ctx.centro(m.b);
    ctx.fx.explotar(x, y, color);
    ctx.fx.chispas(x, y, 40, { color, fuerza: 13 });
    ctx.fx.chispas(x, y, 20, { color: '#ffffff', fuerza: 9 });
    ctx.temblor(12, 0, T.temblor);
  });
  ctx.linea.en(golpe + T.golpe, () => ctx.marcador(d.marcadorTras, d.equipo), { estado: true });
  rotulo(ctx, 'GOL', { en: golpe + 80, dur: T.total - golpe - 80, clase: 'slr-pt-rotulo--gol', color, sub: ctx.carta(d.tirador)?.nombre ?? '' });
  ctx.linea.en(T.total, () => {});
  return m;
}

export function red(ctx) {
  base(ctx, {
    golpe: 380, extra: { hundir: 0.62 },
    tiro: [{ transform: 'translate3d(-50%, -41vh, 0) scale(.62)' }, { transform: 'translate3d(-50%, -50vh, 0) scale(.5) rotate(540deg)' }],
  });
}

export function chilena(ctx) {
  const m = base(ctx, {
    golpe: 560, extra: { hundir: 0.8 },
    tiro: [{ transform: 'translate3d(-50%, -41vh, 0) scale(.62)' }, { transform: 'translate3d(10%, -60vh, 0) scale(.55) rotate(300deg)', offset: 0.45 },
      { transform: 'translate3d(-40%, -50vh, 0) scale(.48) rotate(720deg)' }],
  });
  if (m.tir) ctx.linea.anim(m.tir, [{ transform: 'translate3d(0, 0, 0) rotate(0deg)' }, { transform: 'translate3d(0, -20%, 0) rotate(-360deg)' }, { transform: 'translate3d(0, 0, 0) rotate(-360deg)' }],
    { dur: 560, easing: 'cubic-bezier(.4,0,.2,1)' });
}

export function ardiendo(ctx) {
  const golpe = 420;
  const m = base(ctx, {
    golpe, extra: { hundir: 0.72 },
    tiro: [{ transform: 'translate3d(-50%, -41vh, 0) scale(.62)' }, { transform: 'translate3d(-50%, -50vh, 0) scale(.5) rotate(900deg)' }],
  });
  m.b.classList.add('es-ardiendo');
  for (let k = 0; k <= 6; k++) {
    ctx.linea.en(golpe * k / 6, () => { const [x, y] = ctx.centro(m.b); ctx.fx.fuego(x, y + 8, 12, { ancho: 18, fuerza: 4 }); });
  }
}
