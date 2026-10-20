/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: piezas comunes de las escenas
   Composición vertical: el rival arriba y tu equipo (o el local) abajo; quien
   ataca va hacia la portería contraria. Los iconos son SVG sueltos en
   img/slr/partido/ (trazo de un color, grosor uniforme): se pintan como
   máscara con el color del texto, así que se cambian sin tocar el código.
   Rótulos, franjas, cartas y la barra de porcentajes. Todo se monta antes de
   empezar y se anima solo con transform y opacity sobre ctx.linea.
   Los tiempos, textos y efectos salen de ajustes.js (vía config.js).

   ctx (lo prepara el reproductor para cada escena):
     escenario · linea · d (datos de la escena) · T (tiempos) · A (todos los ajustes) · rng · fx
     sonar(nombre) · lados { abajo, arriba } · lado(letra) → 'abajo'|'arriba' · hacia(letra) → −1 sube | 1 baja
     color(letra) · equipo(letra) · carta(id) · centro(el) → [x, y] · texto(clave)
     temblor(fuerza, en, dur) · marcador(goles, letra) · cesped(sentido, ritmo)
═══════════════════════════════════════════════ */
import { esc } from '../../ui.js';
import { cartaHTML } from '../../carta.js';
import { iconoTactica } from '../../tactica.js';
import { leer, AJUSTES } from '../config.js';

export function nodo(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export const poner = (ctx, html) => ctx.escenario.appendChild(nodo(html));

/* ── Iconos (img/slr/partido/*.svg) ────────────────────────────────────── */
export const ICONOS = ['balon', 'bota', 'puno', 'guante', 'brazo', 'porteria', 'porteria-red', 'gol-red-porteria', 'gol-red-red', 'gol-red-red-abombada'];
export const urlIcono = nombre => `img/slr/partido/${nombre}.svg`;
export const icono = (nombre, clase = '') => `<i class="slr-pt-ico slr-pt-ico--${nombre} ${clase}" aria-hidden="true"></i>`;

export function balon(ctx, clase = '') {
  return poner(ctx, `<div class="slr-pt-balon ${clase}">${icono('balon')}</div>`);
}

// Una carta de la animación (con su foto si la tenemos)
export function cartaPartido(ctx, id, clase = '') {
  const c = ctx.carta(id);
  const html = c?.ata != null ? cartaHTML(c, { tam: 's', energia: false }) : `<div class="slr-pt-carta__falsa"><b>${esc(c?.nombre ?? '?')}</b></div>`;
  return poner(ctx, `<div class="slr-pt-carta ${clase}" data-carta-partido="${esc(id)}">${html}</div>`);
}

/* ── Textos: se quedan al menos leer(texto) ────────────────────────────── */
// Rótulo grande: aparece de golpe, se queda y se va. Devuelve el ms en que termina
export function rotulo(ctx, texto, { en = 0, dur = 0, clase = '', sub = '', color = '' } = {}) {
  const el = poner(ctx, `<div class="slr-pt-rotulo ${clase}"${color ? ` style="--c:${color}"` : ''}><b>${esc(texto)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`);
  const total = Math.max(dur, leer(`${texto} ${sub}`) + 500);
  const o = x => x / total;   // entra en 0,35 s y sale en 0,3 s, sea cual sea su duración
  ctx.linea.anim(el, [
    { opacity: 0, transform: 'translate(-50%, -50%) scale(.3) rotate(-6deg)', offset: 0 },
    { opacity: 1, transform: 'translate(-50%, -50%) scale(1.12) rotate(-3deg)', offset: o(220) },
    { opacity: 1, transform: 'translate(-50%, -50%) scale(1) rotate(-3deg)', offset: o(350) },
    { opacity: 1, transform: 'translate(-50%, -50%) scale(1.04) rotate(-3deg)', offset: 1 - o(300) },
    { opacity: 0, transform: 'translate(-50%, -50%) scale(1.2) rotate(-3deg)', offset: 1 },
  ], { en, dur: total, easing: 'cubic-bezier(.2,.8,.3,1)' });
  return en + total;
}

// Franja que cruza la pantalla y se queda en medio el tiempo de leerla (saque, contraataque)
export function franja(ctx, html, { en = 0, entra = 350, queda = 0, sale = 350, texto = '', color = '#fff', clase = '' } = {}) {
  const el = poner(ctx, `<div class="slr-pt-franja ${clase}" style="--c:${color}"><div class="slr-pt-franja__dentro">${html}</div></div>`);
  const q = Math.max(queda, leer(texto));
  const total = entra + q + sale;
  ctx.linea.anim(el, [
    { transform: 'translate3d(-115%, -50%, 0) skewX(-12deg)', offset: 0 },
    { transform: 'translate3d(-2%, -50%, 0) skewX(-12deg)', offset: entra / total },
    { transform: 'translate3d(2%, -50%, 0) skewX(-12deg)', offset: (entra + q) / total },
    { transform: 'translate3d(115%, -50%, 0) skewX(-12deg)', offset: 1 },
  ], { en, dur: total, easing: 'cubic-bezier(.3,.7,.4,1)' });
  return { el, fin: en + total };
}

// Foto del dueño del equipo (la pinta renderAvatar de la app; si no, su inicial)
export function foto(ctx, letra, clase = '') {
  const eq = ctx.equipo(letra);
  const el = nodo(`<span class="slr-pt-foto ${clase}" style="--c:${ctx.color(letra)}"><span class="avatar">${esc((eq.nombre ?? '?').slice(0, 1))}</span></span>`);
  if (eq.dueno && typeof window.renderAvatar === 'function') window.renderAvatar(el.querySelector('.avatar'), eq.dueno);
  return el;
}

export const tacticaHTML = t => (t ? `<span class="slr-pt-tactica">${iconoTactica(t)}<small>${esc({ posesion: 'Posesión', contraataque: 'Contraataque', presion: 'Presión' }[t] ?? t)}</small></span>` : '');

/* ── Temblores (la fuerza se multiplica por efectos.temblor) ───────────── */
const fuerzaTemblor = f => f * AJUSTES.efectos.temblor;
export function framesTemblor(fuerza, pasos = 8) {
  const F = fuerzaTemblor(fuerza);
  const f = [];
  for (let k = 0; k <= pasos; k++) {
    const a = k === pasos ? 0 : F * (1 - k / (pasos + 1));
    f.push({ transform: `translate3d(${(k % 2 ? 1 : -1) * a}px, ${((k * 7) % 3 - 1) * a * 0.6}px, 0) rotate(${(k % 2 ? -1 : 1) * a * 0.4}deg)` });
  }
  return f;
}
export function tiembla(ctx, el, { en = 0, dur = 500, fuerza = 4, iter = 1 } = {}) {
  return ctx.linea.anim(el, framesTemblor(fuerza), { en, dur, easing: 'linear', iter, fill: 'none' });
}
// Temblor sostenido (sin calmarse) durante dur
export function vibra(ctx, el, { en = 0, dur = 1000, fuerza = 3 } = {}) {
  const F = fuerzaTemblor(fuerza);
  const n = Math.max(4, Math.round(dur / 55));
  const f = Array.from({ length: n + 1 }, (_, k) => ({ transform: k === n ? 'translate3d(0,0,0)'
    : `translate3d(${(k % 2 ? 1 : -1) * F}px, ${((k * 5) % 3 - 1) * F * 0.7}px, 0)` }));
  return ctx.linea.anim(el, f, { en, dur, easing: 'linear', fill: 'none' });
}

/* ── Barra de porcentajes ──────────────────────────────────────────────────
   pAbajo: probabilidad de que gane el de abajo (la real del evento); su color va
   a la izquierda, como en el marcador. Los dos lados se empujan; en «aplasta» el
   ganador aplasta la barra con una llamarada de su color: la animación de la
   escena va A LA VEZ y su desenlace se pone en ese mismo momento. Sorpresa (ganó
   el que tenía poco): en el último momento va hacia el favorito y se da la vuelta.
   Poderes: arranca inclinada hacia el lado del que lo activó.
   Devuelve { inicio, pelea: [desde, hasta], aplasta, fin }. */
export function barra(ctx, { pAbajo, ganaAbajo, en = 0, dur = 1600, sorpresa = false, inclina = 0, titulo = '', arriba = false }) {
  const T = ctx.A.barra;
  const ab = ctx.lados.abajo, ar = ctx.lados.arriba;
  const el = poner(ctx, `
    <div class="slr-pt-barra ${arriba ? 'slr-pt-barra--arriba' : ''}" style="--izq:${ctx.color(ab)};--der:${ctx.color(ar)}">
      ${titulo ? `<p class="slr-pt-barra__titulo">${esc(titulo)}</p>` : ''}
      <div class="slr-pt-barra__pista">
        <i class="slr-pt-barra__der"></i><i class="slr-pt-barra__izq"></i>
        <i class="slr-pt-barra__corte"><b></b></i>
      </div>
      <div class="slr-pt-barra__nums"><b>${Math.round(pAbajo * 100)} %</b><b>${100 - Math.round(pAbajo * 100)} %</b></div>
    </div>`);
  const relleno = el.querySelector('.slr-pt-barra__izq'), corte = el.querySelector('.slr-pt-barra__corte');
  const x0 = Math.min(0.85, Math.max(0.15, 0.5 + inclina * 0.16));
  const pts = [[0, x0]];
  const nPelea = T.empujones, finPelea = T.pelea - (sorpresa ? T.sorpresa : 0);
  for (let k = 1; k <= nPelea; k++) {
    const amp = 0.12 * (1 - k / (nPelea + 1)) * (0.7 + ctx.rng() * 0.6);
    pts.push([finPelea * k / nPelea, Math.min(0.94, Math.max(0.06, pAbajo + (k % 2 ? 1 : -1) * amp))]);
  }
  if (sorpresa) pts.push([T.pelea, ganaAbajo ? 0.12 : 0.88]);
  pts.push([1, ganaAbajo ? 1 : 0]);
  const curva = o => (o >= T.pelea - 0.001 ? 'cubic-bezier(.5,0,.2,1)' : 'ease-in-out');
  const util = dur - T.aparece;
  const opciones = { en: en + T.aparece, dur: util, easing: 'linear' };
  ctx.linea.anim(relleno, pts.map(([o, x]) => ({ transform: `scaleX(${x.toFixed(3)})`, offset: o, easing: curva(o) })), opciones);
  ctx.linea.anim(corte, pts.map(([o, x]) => ({ transform: `translate3d(${((x - 1) * 100).toFixed(2)}%, 0, 0)`, offset: o, easing: curva(o) })), opciones);
  ctx.linea.anim(el, [{ opacity: 0, transform: 'translate(-50%, 12px) scale(.92)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], { en, dur: T.aparece });
  const pelea = [en + T.aparece, en + T.aparece + util * T.pelea];
  vibra(ctx, el.querySelector('.slr-pt-barra__pista'), { en: pelea[0], dur: pelea[1] - pelea[0], fuerza: 2 });
  const aplasta = en + dur;
  let finRotulo = aplasta;
  if (sorpresa) {
    const t = pelea[1];
    ctx.linea.en(t, () => ctx.sonar('sorpresa'));
    finRotulo = rotulo(ctx, ctx.texto('sorpresa'), { en: t, clase: `slr-pt-rotulo--sorpresa ${arriba ? 'slr-pt-rotulo--abajo' : ''}`, color: ctx.color(ganaAbajo ? ab : ar) });
  }
  // Llamarada del ganador al aplastar
  ctx.linea.en(aplasta - 40, () => {
    const r = el.querySelector('.slr-pt-barra__pista').getBoundingClientRect();
    const color = ctx.color(ganaAbajo ? ab : ar);
    for (let k = 0; k < 5; k++) ctx.fx.fuego(r.left + r.width * (ganaAbajo ? 0.55 + k * 0.1 : 0.05 + k * 0.1), r.top + r.height / 2, 9, { color, ancho: r.width * 0.12 });
    ctx.fx.chispas(ganaAbajo ? r.right : r.left, r.top + r.height / 2, 18, { color, fuerza: 8 });
  });
  ctx.linea.anim(el.querySelector('.slr-pt-barra__pista'), [{ transform: 'scale(1)' }, { transform: 'scaleY(1.6)' }, { transform: 'scale(1)' }], { en: aplasta - 60, dur: T.llamarada, easing: 'ease-out', fill: 'none' });
  return { inicio: en, pelea, aplasta, fin: Math.max(aplasta + T.llamarada, finRotulo) };
}

// Inclinación inicial de la barra por los poderes de esa fase: +1 hacia el de abajo, −1 hacia el de arriba
export function inclinacion(ctx, poderes = []) {
  let s = 0;
  for (const p of poderes) s += ctx.lado(p.equipo) === 'abajo' ? 1 : -1;
  return Math.max(-1, Math.min(1, s));
}

/* ── Geometría (px dentro del escenario) ───────────────────────────────── */
export function medidas(ctx) {
  const r = ctx.escenario.getBoundingClientRect();
  return { W: r.width, H: r.height };
}
// Centro y tamaño de un elemento dentro del escenario (medir ANTES de animarlo)
export function caja(ctx, el) {
  const e = ctx.escenario.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left - e.left + r.width / 2, y: r.top - e.top + r.height / 2, w: r.width, h: r.height };
}
// transform para piezas «libres» (su centro en x, y del escenario)
export const en = (x, y, extra = '') => `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)${extra}`;
export function balonEn(ctx, x, y, clase = '') {
  const b = balon(ctx, `slr-pt-balon--libre ${clase}`);
  b.style.transform = en(x, y);
  return b;
}
// Un icono suelto (bota, guantes…): la pieza se coloca con transform y su centro en x, y con translate(-50%, -50%)
export function pieza(ctx, nombre, { clase = '', color = '' } = {}) {
  return poner(ctx, `<div class="slr-pt-pieza slr-pt-pieza--${nombre} ${clase}"${color ? ` style="color:${color}"` : ''}>${icono(nombre)}</div>`);
}
export const centrada = (x, y, extra = '') => `${en(x, y)} translate(-50%, -50%)${extra}`;
