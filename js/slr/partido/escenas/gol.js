/* Gol: el balón entra de verdad (se ve dentro de la red), tiembla la pantalla y sale
   «GOL» en grande con el goleador; el marcador de arriba se actualiza con un golpe.
   · red: la portería vista de lado, en el centro: el balón entra y la red se abomba con
     él (acaba como img/slr/partido/gol-red.svg)
   · chilena: la bota boca abajo, como en una chilena, golpea el balón y este entra
     haciendo un tirabuzón
   · ardiendo: trayectoria lenta, balón grande con estela de fuego y todo temblando */
import { poner, rotulo, icono, pieza, balonEn, medidas, caja, en, centrada } from './comun.js';
import { montarChut } from './chut.js';

// Lo común al entrar: golpe, rayos, temblor, marcador y el rótulo
function celebrar(ctx, entra, b, claseRotulo = '') {
  const d = ctx.d, T = ctx.T.gol, color = ctx.color(d.equipo);
  ctx.linea.en(entra, () => {
    ctx.sonar('gol', { equipo: d.equipo });
    const [x, y] = ctx.centro(b);
    ctx.fx.explotar(x, y, color);
    ctx.fx.chispas(x, y, 44, { color, fuerza: 14 });
    ctx.fx.chispas(x, y, 22, { color: '#ffffff', fuerza: 10 });
    ctx.temblor(14, 0, 900);
  });
  ctx.linea.en(entra + T.marcador, () => ctx.marcador(d.marcadorTras, d.equipo), { estado: true });
  const fin = rotulo(ctx, ctx.texto('gol'), { en: entra + 200, dur: T.celebracion, clase: `slr-pt-rotulo--gol ${claseRotulo}`, color, sub: ctx.carta(d.tirador)?.nombre ?? '' });
  ctx.linea.en(fin, () => {});
}

// Portería de frente con el balón llegando dentro (por debajo de la red)
function deFrente(ctx, { claseBalon = '' } = {}) {
  const m = montarChut(ctx, { claseBalon });
  m.porteria.classList.add('es-delante');   // la red por encima del balón: se ve dentro
  m.portero.style.transform = 'translate3d(-50%, 0, 0)';
  if (m.tir) m.tir.style.opacity = '0';
  const dentroY = m.gc.y + m.s * m.gc.h * 0.12;   // un poco hacia el fondo de la portería
  return { ...m, dentroY };
}
// El portero se queda atrás, vencido; la red se hunde al entrar
function vencido(ctx, m, entra) {
  const lado = ctx.rng() < 0.5 ? -1 : 1;
  ctx.linea.anim(m.portero, [{ transform: 'translate3d(-50%, 0, 0) rotate(0deg)', opacity: 1 },
    { transform: `translate3d(${-50 + lado * 70}%, 0, 0) rotate(${lado * 32}deg) scale(.9)`, opacity: 0.5 }], { dur: entra * 0.8, easing: 'ease-out' });
  const red = m.porteria.querySelector('.slr-pt-porteria__red');
  ctx.linea.anim(red, [{ transform: 'translate3d(0, 0, 0) scale(1)' }, { transform: `translate3d(0, ${-m.s * 7}px, 0) scale(1.06, .72)` }, { transform: 'translate3d(0, 0, 0) scale(1)' }],
    { en: entra, dur: 700, easing: 'cubic-bezier(.2,.9,.3,1.4)', fill: 'forwards' });
}

export function red(ctx) {
  const entra = ctx.T.gol.red;
  const { W } = medidas(ctx);
  // La portería de lado, en el centro: palo y larguero, la red recta y la red abombada (oculta)
  const p = poner(ctx, `<div class="slr-pt-golred">${icono('gol-red-red', 'slr-pt-golred__red')}${icono('gol-red-red-abombada', 'slr-pt-golred__abombada')}${icono('gol-red-porteria')}</div>`);
  const g = caja(ctx, p);
  // Coordenadas del dibujo (viewBox 160×120) → px del escenario
  const px = (vx, vy) => [g.x - g.w / 2 + g.w * vx / 160, g.y - g.h / 2 + g.h * vy / 120];
  const [x0, y0] = [-W * 0.1, px(0, 70)[1]];
  const [xP, yP] = px(42, 66);      // pasando por la boca de la portería
  const [xF, yF] = px(126, 62);     // dentro, contra la red abombada (como en gol-red.svg)
  const [xR, yR] = px(100, 64);     // llega a la red (aquí se abomba)
  const [xE, yE] = px(134, 63);     // empuja la red un poco más y vuelve
  const b = balonEn(ctx, x0, y0, 'slr-pt-balon--golred');
  ctx.linea.anim(b, [
    { transform: en(x0, y0, ' rotate(0deg)'), offset: 0 },
    { transform: en(xP, yP, ' rotate(600deg)'), offset: 0.5 },
    { transform: en(xR, yR, ' rotate(800deg)'), offset: 0.68 },
    { transform: en(xE, yE, ' rotate(980deg)'), offset: 0.9 },
    { transform: en(xF, yF, ' rotate(1000deg)'), offset: 1 },
  ], { dur: entra, easing: 'cubic-bezier(.35,0,.3,1)' });
  const toca = entra * 0.68;
  const recta = p.querySelector('.slr-pt-golred__red'), abombada = p.querySelector('.slr-pt-golred__abombada');
  ctx.linea.anim(recta, [{ opacity: 1 }, { opacity: 0 }], { en: toca, dur: 160, fill: 'forwards' });
  ctx.linea.anim(abombada, [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'scale(1.06)', offset: 0.5 }, { opacity: 1, transform: 'scale(1)' }],
    { en: toca, dur: 520, easing: 'cubic-bezier(.2,.9,.3,1.3)', fill: 'forwards' });
  ctx.linea.anim(p, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.9)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }], { dur: 300 });
  celebrar(ctx, toca, b, 'slr-pt-rotulo--bajo');
}

export function chilena(ctx) {
  const entra = ctx.T.gol.chilena;
  const m = deFrente(ctx);
  const { W, H, s, salidaY, dentroY } = m;
  // La bota boca abajo (la pierna por encima de la cabeza) golpea el balón hacia la portería
  const golpeY = H * 0.5 + (salidaY - H * 0.5) * 0.35;
  const patada = entra * 0.38;
  const bota = pieza(ctx, 'bota', { color: ctx.color(ctx.d.equipo) });
  const bw = bota.getBoundingClientRect().width;
  const bx = W / 2 + bw * 0.25, by = golpeY - s * bw * 0.12;
  const pose = ang => centrada(bx, by, ` rotate(${s < 0 ? 180 : 0}deg) scaleX(-1) rotate(${ang}deg) scale(1.35)`);
  ctx.linea.anim(bota, [
    { transform: pose(-70), opacity: 0, offset: 0 },
    { transform: pose(-55), opacity: 1, offset: 0.4 * patada / entra },
    { transform: pose(25), opacity: 1, offset: patada / entra },
    { transform: pose(38), opacity: 1, offset: Math.min(0.9, patada / entra + 0.25) },
    { transform: pose(40), opacity: 0, offset: 1 },
  ], { dur: entra, easing: 'cubic-bezier(.5,0,.3,1)' });
  // El balón cae hacia la bota y, tras la patada, entra haciendo un tirabuzón
  const bolaY = golpeY - s * bw * 0.05;
  const f = [{ transform: en(W / 2 + 40, salidaY, ' scale(1) rotate(0deg)'), offset: 0 }, { transform: en(W / 2, bolaY, ' scale(1) rotate(120deg)'), offset: patada / entra }];
  const vueltas = 6;
  for (let k = 1; k <= vueltas; k++) {
    const t = k / vueltas, ancho = W * 0.13 * (1 - t * 0.7);
    f.push({ transform: en(W / 2 + Math.sin(t * Math.PI * 3) * ancho, bolaY + (dentroY - bolaY) * t, ` scale(${((1 - 0.45 * t) * (k % 2 ? 1.12 : 0.9)).toFixed(3)}) rotate(${120 + k * 240}deg)`),
      offset: patada / entra + (1 - patada / entra) * t });
  }
  ctx.linea.anim(m.b, f, { dur: entra, easing: 'linear' });
  ctx.linea.en(patada, () => {
    ctx.sonar('chut');
    const [x, y] = ctx.centro(m.b);
    ctx.fx.chispas(x, y, 26, { color: '#ffd23a', fuerza: 11 });
    ctx.temblor(6, 0, 300);
  });
  vencido(ctx, m, entra);
  celebrar(ctx, entra, m.b);
}

export function ardiendo(ctx) {
  const entra = ctx.T.gol.ardiendo;
  const m = deFrente(ctx, { claseBalon: 'slr-pt-balon--grande es-ardiendo' });
  const { W, salidaY, dentroY } = m;
  // Trayectoria lenta con una curva, el balón grande y en llamas
  ctx.linea.anim(m.b, [
    { transform: en(W / 2, salidaY, ' scale(1) rotate(0deg)'), offset: 0 },
    { transform: en(W / 2 - W * 0.16, (salidaY + dentroY) / 2, ' scale(1.05) rotate(500deg)'), offset: 0.5 },
    { transform: en(W / 2 + W * 0.04, dentroY, ' scale(.7) rotate(1100deg)'), offset: 1 },
  ], { dur: entra, easing: 'cubic-bezier(.35,.1,.35,1)' });
  const pasos = Math.round(entra / 70);
  for (let k = 0; k <= pasos; k++) {
    ctx.linea.en(entra * k / pasos, () => { const [x, y] = ctx.centro(m.b); ctx.fx.fuego(x, y, 14, { ancho: 26, fuerza: 4.5 }); });
  }
  for (let k = 0; k < 6; k++) ctx.linea.en(entra * k / 6, () => ctx.temblor(3 + k, 0, 380));
  vencido(ctx, m, entra);
  celebrar(ctx, entra, m.b);
}
