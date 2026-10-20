/* Gol: el balón entra de verdad (se ve dentro de la red), tiembla la pantalla y sale
   «GOL» en grande con el goleador; el marcador de arriba se actualiza con un golpe.
   · red: vista desde detrás de la portería (la cámara dentro de la red): el balón viene
     hacia ti y la red se hunde hacia la cámara
   · chilena: una pierna boca abajo (la chilena) golpea el balón y entra
   · ardiendo: trayectoria lenta, balón grande con estela de fuego y todo temblando */
import { poner, rotulo, RED_DETRAS, PIERNA, balonEn, medidas, en } from './comun.js';
import { montarChut } from './chut.js';

// Lo común al entrar: golpe, rayos, temblor, marcador y el rótulo. Devuelve el final
function celebrar(ctx, entra, b) {
  const d = ctx.d, T = ctx.T.gol, color = ctx.color(d.equipo);
  ctx.linea.en(entra, () => {
    ctx.sonar('gol', { equipo: d.equipo });
    const [x, y] = ctx.centro(b);
    ctx.fx.explotar(x, y, color);
    ctx.fx.chispas(x, y, 44, { color, fuerza: 14 });
    ctx.fx.chispas(x, y, 22, { color: '#ffffff', fuerza: 10 });
    ctx.temblor(14, 0, T.temblor);
  });
  ctx.linea.en(entra + T.golpe, () => ctx.marcador(d.marcadorTras, d.equipo), { estado: true });
  const fin = rotulo(ctx, 'GOL', { en: entra + 200, clase: 'slr-pt-rotulo--gol', color, sub: ctx.carta(d.tirador)?.nombre ?? '' });
  ctx.linea.en(Math.max(fin, entra + 2600), () => {});
}

// Portería de frente con el balón llegando dentro (por debajo de la red)
function deFrente(ctx, { claseBalon = '' } = {}) {
  const m = montarChut(ctx, { claseBalon });
  m.porteria.classList.add('es-delante');   // la red por encima del balón: se ve dentro
  m.portero.style.transform = 'translate3d(-50%, 0, 0)';
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
    { en: entra, dur: 700, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
}

export function red(ctx) {
  const T = ctx.T.gol;
  ctx.cesped(null);
  const { W, H } = medidas(ctx);
  // Cámara detrás de la portería: la red llena la pantalla; los palos en los bordes
  const capa = poner(ctx, `<div class="slr-pt-red"><div class="slr-pt-red__palos"></div>${RED_DETRAS}</div>`);
  const malla = capa.querySelector('.slr-pt-red__svg');
  const b = balonEn(ctx, W / 2, H * 0.42, 'slr-pt-balon--detras');
  const entra = T.red;
  // El balón viene de lejos (pequeño) hacia la cámara, con una curva, y choca contra la red
  ctx.linea.anim(b, [
    { transform: en(W * 0.42, H * 0.36, ' scale(.12) rotate(0deg)'), offset: 0 },
    { transform: en(W * 0.47, H * 0.4, ' scale(.5) rotate(300deg)'), offset: 0.55 },
    { transform: en(W * 0.5, H * 0.44, ' scale(3.2) rotate(620deg)'), offset: 0.92 },
    { transform: en(W * 0.5, H * 0.45, ' scale(2.8) rotate(640deg)'), offset: 1 },
  ], { dur: entra + 260, easing: 'cubic-bezier(.55,0,.35,1)' });
  // La red se hunde hacia la cámara y rebota
  ctx.linea.anim(malla, [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: 0.35 }, { transform: 'scale(.96)', offset: 0.7 }, { transform: 'scale(1.04)' }],
    { en: entra * 0.92, dur: 900, easing: 'ease-out' });
  ctx.linea.anim(capa, [{ opacity: 0 }, { opacity: 1 }], { dur: 300 });
  celebrar(ctx, entra * 0.92, b);
}

export function chilena(ctx) {
  const T = ctx.T.gol;
  ctx.cesped(null);
  const m = deFrente(ctx);
  const { W, H, s, salidaY, dentroY } = m;
  if (m.tir) m.tir.style.opacity = '0';
  // La pierna boca abajo, con la bota arriba (o abajo si se ataca hacia abajo), golpea el balón
  const golpeY = H * 0.5 + (salidaY - H * 0.5) * 0.35;   // a media altura, un poco hacia el tirador
  const pierna = poner(ctx, `<div class="slr-pt-pierna slr-pt-pierna--${s < 0 ? 'sube' : 'baja'}" style="color:${ctx.color(ctx.d.equipo)}">${PIERNA}</div>`);
  const ph = pierna.getBoundingClientRect().height;
  // Anclada por la cadera (abajo si se ataca hacia arriba): la bota queda en golpeY
  const base = y => `translate3d(${W / 2 - 20}px, ${y.toFixed(1)}px, 0) translate(-50%, ${s < 0 ? '0' : '-100%'})`;
  const piernaY = golpeY + s * ph * 0.15;
  const patada = T.chilena * 0.42;
  ctx.linea.anim(pierna, [
    { transform: `${base(piernaY - s * ph * 0.6)} rotate(${-s * 70}deg)`, opacity: 0, offset: 0 },
    { transform: `${base(piernaY)} rotate(${-s * 55}deg)`, opacity: 1, offset: 0.2 },
    { transform: `${base(piernaY)} rotate(${s * 25}deg)`, opacity: 1, offset: patada / T.chilena },
    { transform: `${base(piernaY)} rotate(${s * 40}deg)`, opacity: 1, offset: 0.85 },
    { transform: `${base(piernaY + s * ph * 0.15)} rotate(${s * 45}deg)`, opacity: 0, offset: 1 },
  ], { dur: T.chilena, easing: 'cubic-bezier(.5,0,.3,1)' });
  // El balón cae hacia la pierna, sale disparado y entra (por debajo de la red)
  const bolaY = golpeY + s * ph * 0.18;   // justo delante de la bota
  ctx.linea.anim(m.b, [
    { transform: en(W / 2 + 30, salidaY, ' scale(1)'), offset: 0 },
    { transform: en(W / 2, bolaY, ' scale(1) rotate(120deg)'), offset: patada / T.chilena },
    { transform: en(W / 2 + W * 0.12, dentroY, ' scale(.55) rotate(900deg)'), offset: 1 },
  ], { dur: T.chilena, easing: 'cubic-bezier(.4,0,.3,1)' });
  ctx.linea.en(patada, () => {
    ctx.sonar('chut');
    const [x, y] = ctx.centro(m.b);
    ctx.fx.chispas(x, y, 26, { color: '#ffd23a', fuerza: 11 });
    ctx.temblor(6, 0, 300);
  });
  vencido(ctx, m, T.chilena);
  celebrar(ctx, T.chilena, m.b);
}

export function ardiendo(ctx) {
  const T = ctx.T.gol;
  ctx.cespedAtaque(ctx.d.equipo, 'normal');
  const m = deFrente(ctx, { claseBalon: 'slr-pt-balon--grande es-ardiendo' });
  const { W, salidaY, dentroY } = m;
  const entra = T.ardiendo;
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
