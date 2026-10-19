/* Duelo de control (en cada jugada): una entrada de la variante y después la barra
   con la probabilidad real (p del evento). Variantes:
   · botas: dos botas entran por los lados, golpean el balón a la vez y salta fuego
   · bote: el balón bota de un lado a otro, cada vez más rápido, y se queda en uno
   · escudos: las fotos de los dos equipos chocan en el centro y saltan rayos */
import { balon, poner, BOTA, foto, barra, inclinacion, tiembla } from './comun.js';

// pIzq, quién gana y tiempos del duelo
function datos(ctx) {
  const d = ctx.d, T = ctx.T.control[d.completo ? 'completo' : 'rapido'];
  const pIzq = ctx.lado(d.saca) === 'izq' ? d.p : 1 - d.p;
  return { T, pIzq, ganaIzq: ctx.lado(d.ganador) === 'izq' };
}
function conBarra(ctx, intro) {
  const d = ctx.d, { T, pIzq, ganaIzq } = datos(ctx);
  barra(ctx, { pIzq, ganaIzq, en: intro, dur: T.barra, sorpresa: d.sorpresa, inclina: inclinacion(ctx, d.poderes), titulo: 'Control del balón' });
}

export function botas(ctx) {
  const { T } = datos(ctx);
  const b = balon(ctx, 'slr-pt-balon--centro');
  const golpe = T.intro * 0.55;
  const bota = lado => {
    const el = poner(ctx, `<div class="slr-pt-bota slr-pt-bota--${lado}" style="color:${ctx.color(ctx.lados[lado])}">${BOTA}</div>`);
    const fuera = lado === 'izq' ? '-70vw' : '70vw', cerca = lado === 'izq' ? '-6px' : '6px';
    const giro = lado === 'izq' ? '' : ' scaleX(-1)';
    ctx.linea.anim(el, [
      { transform: `translate3d(${fuera}, -50%, 0)${giro}`, offset: 0 },
      { transform: `translate3d(${cerca}, -50%, 0)${giro} rotate(-8deg)`, offset: golpe / T.intro },
      { transform: `translate3d(${lado === 'izq' ? '-18%' : '18%'}, -50%, 0)${giro}`, offset: Math.min(0.85, golpe / T.intro + 0.18) },
      { transform: `translate3d(${fuera}, -50%, 0)${giro}`, opacity: 0 },
    ], { dur: T.intro, easing: 'cubic-bezier(.5,0,.3,1)' });
  };
  bota('izq'); bota('der');
  tiembla(ctx, b, { en: golpe, dur: 380, fuerza: 6 });
  ctx.linea.anim(b, [{ opacity: 1 }, { opacity: 0 }], { en: T.intro - 120, dur: 160 });
  ctx.linea.en(golpe, () => {
    ctx.sonar('patada');
    const [x, y] = ctx.centro(b);
    ctx.fx.fuego(x, y, 30, { ancho: 50 });
    ctx.fx.chispas(x, y, 24, { color: '#ffd23a', fuerza: 11 });
    ctx.temblor(5, 0, 300);
  });
  conBarra(ctx, T.intro);
}

export function bote(ctx) {
  const { T, ganaIzq } = datos(ctx);
  const b = balon(ctx, 'slr-pt-balon--centro');
  // Botes de un lado a otro, cada vez más rápidos (offsets que se van juntando)
  const n = ctx.d.completo ? 7 : 4;
  const frames = [{ transform: 'translate3d(0, 0, 0) rotate(0deg)', offset: 0 }];
  let o = 0;
  const pasos = Array.from({ length: n }, (_, k) => 1 / (k + 1.6));
  const total = pasos.reduce((s, x) => s + x, 0);
  for (let k = 0; k < n; k++) {
    const ultimo = k === n - 1;
    const lado = ultimo ? (ganaIzq ? -1 : 1) : (k % 2 ? 1 : -1);
    const mitad = o + pasos[k] / total / 2;
    o += pasos[k] / total;
    frames.push({ transform: `translate3d(${lado * 6}vw, -46px, 0) rotate(${k * 180 + 90}deg)`, offset: Math.min(0.999, mitad) });
    frames.push({ transform: `translate3d(${lado * (ultimo ? 30 : 26)}vw, 0, 0) rotate(${k * 180 + 180}deg)`, offset: Math.min(1, o) });
  }
  ctx.linea.anim(b, frames, { dur: T.intro * 0.92, easing: 'linear' });
  ctx.linea.anim(b, [{ opacity: 1 }, { opacity: 0 }], { en: T.intro - 100, dur: 140 });
  for (let k = 1; k <= Math.min(3, n); k++) ctx.linea.en(T.intro * 0.92 * k / n, () => ctx.sonar('bote'));
  ctx.linea.en(T.intro * 0.9, () => {
    const [x, y] = ctx.centro(b);
    ctx.fx.chispas(x, y, 16, { color: ctx.color(ctx.d.ganador), fuerza: 7 });
  });
  conBarra(ctx, T.intro);
}

export function escudos(ctx) {
  const { T } = datos(ctx);
  const choque = T.intro * 0.5;
  const uno = lado => {
    const l = ctx.lados[lado];
    const el = poner(ctx, `<div class="slr-pt-escudo slr-pt-escudo--${lado}"></div>`);
    el.appendChild(foto(ctx, l, 'slr-pt-foto--grande'));
    const fuera = lado === 'izq' ? '-60vw' : '60vw', junto = lado === 'izq' ? '-38%' : '38%', rebote = lado === 'izq' ? '-80%' : '80%';
    ctx.linea.anim(el, [
      { transform: `translate3d(${fuera}, -50%, 0) scale(.8)`, offset: 0 },
      { transform: `translate3d(${junto}, -50%, 0) scale(1.08)`, offset: choque / T.intro },
      { transform: `translate3d(${rebote}, -50%, 0) scale(1)`, offset: Math.min(0.9, choque / T.intro + 0.2) },
      { transform: `translate3d(${rebote}, -50%, 0) scale(1)`, opacity: 0 },
    ], { dur: T.intro, easing: 'cubic-bezier(.6,0,.4,1)' });
  };
  uno('izq'); uno('der');
  ctx.linea.en(choque, () => {
    ctx.sonar('choque');
    const [x, y] = ctx.centro(ctx.escenario);
    ctx.fx.explotar(x, y * 0.92, '#ffffff');
    ctx.fx.chispas(x, y * 0.92, 30, { color: ctx.color(ctx.lados.izq), fuerza: 10 });
    ctx.fx.chispas(x, y * 0.92, 30, { color: ctx.color(ctx.lados.der), fuerza: 10 });
    ctx.temblor(6, 0, 320);
  });
  conBarra(ctx, T.intro);
}
