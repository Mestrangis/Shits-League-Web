/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: piezas comunes de las escenas
   Iconos planos (balón, bota, portería), rótulos grandes, franjas, cartas y la
   barra de porcentajes. Todo se monta antes de empezar y se anima solo con
   transform y opacity sobre la línea de tiempo de la escena (ctx.linea).

   ctx (lo prepara el reproductor para cada escena):
     escenario · linea · d (datos de la escena) · T (tiempos) · rng · fx
     sonar(nombre) · lado(letra) → 'izq'|'der' · color(letra) · equipo(letra)
     carta(id) · centro(el) → [x, y] · temblor(fuerza, en, dur) · marcador(goles, letra)
═══════════════════════════════════════════════ */
import { esc } from '../../ui.js';
import { cartaHTML } from '../../carta.js';
import { iconoTactica } from '../../tactica.js';

export function nodo(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export const poner = (ctx, html) => ctx.escenario.appendChild(nodo(html));

export const BALON = `<svg class="slr-pt-balon__svg" viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="32" cy="32" r="29" fill="#fff"/>
  <path fill="#0b2416" d="M32 20l9 6.5-3.4 10.6H26.4L23 26.5z"/>
  <path fill="#0b2416" d="M8.5 25.5l7-1 4.5 9.5-4.5 8-6.2-2.2A24 24 0 0 1 8.5 25.5zM55.5 25.5l-7-1-4.5 9.5 4.5 8 6.2-2.2a24 24 0 0 0 .8-14.3zM24 54.5l3-7.4h10l3 7.4a24 24 0 0 1-16 0zM22 9.5l4 6.5 6-3 6 3 4-6.5a24 24 0 0 0-20 0z"/>
  <circle cx="32" cy="32" r="29" fill="none" stroke="#0b2416" stroke-width="2.5"/></svg>`;

export const BOTA = `<svg viewBox="0 0 96 64" aria-hidden="true"><path fill="currentColor"
  d="M14 4h26v24c6 2 14 4 26 5 14 1 24 6 26 14 1 5-2 9-8 9H22c-6 0-10-3-10-8V22l-6-2V8c0-2 2-4 4-4z"/>
  <path fill="#0b2416" opacity=".35" d="M12 50h80v6H12z"/><circle cx="26" cy="60" r="3" fill="currentColor"/><circle cx="44" cy="60" r="3" fill="currentColor"/><circle cx="62" cy="60" r="3" fill="currentColor"/><circle cx="80" cy="60" r="3" fill="currentColor"/></svg>`;

export const PORTERIA = `<svg class="slr-pt-porteria__svg" viewBox="0 0 160 70" preserveAspectRatio="none" aria-hidden="true">
  <g class="slr-pt-porteria__red" stroke="rgba(255,255,255,.35)" stroke-width="1.2" fill="none">
    ${Array.from({ length: 15 }, (_, i) => `<path d="M${10 + i * 10} 6V68"/>`).join('')}
    ${Array.from({ length: 6 }, (_, i) => `<path d="M8 ${10 + i * 11}H152"/>`).join('')}
  </g>
  <path d="M6 70V4h148v66" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/></svg>`;

export function balon(ctx, clase = '') {
  return poner(ctx, `<div class="slr-pt-balon ${clase}">${BALON}</div>`);
}

// Una carta de la animación (con su foto si la tenemos)
export function cartaPartido(ctx, id, clase = '') {
  const c = ctx.carta(id);
  const html = c?.ata != null ? cartaHTML(c, { tam: 's', energia: false }) : `<div class="slr-pt-carta__falsa"><b>${esc(c?.nombre ?? '?')}</b></div>`;
  return poner(ctx, `<div class="slr-pt-carta ${clase}" data-carta-partido="${esc(id)}">${html}</div>`);
}

// Rótulo grande: aparece de golpe, se queda y se va
export function rotulo(ctx, texto, { en = 0, dur = 700, clase = '', sub = '', color = '' } = {}) {
  const el = poner(ctx, `<div class="slr-pt-rotulo ${clase}"${color ? ` style="--c:${color}"` : ''}><b>${esc(texto)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`);
  ctx.linea.anim(el, [
    { opacity: 0, transform: 'translate(-50%, -50%) scale(.3) rotate(-6deg)' },
    { opacity: 1, transform: 'translate(-50%, -50%) scale(1.12) rotate(-3deg)', offset: 0.18 },
    { opacity: 1, transform: 'translate(-50%, -50%) scale(1) rotate(-3deg)', offset: 0.3 },
    { opacity: 1, transform: 'translate(-50%, -50%) scale(1.04) rotate(-3deg)', offset: 0.82 },
    { opacity: 0, transform: 'translate(-50%, -50%) scale(1.25) rotate(-3deg)' },
  ], { en, dur, easing: 'cubic-bezier(.2,.8,.3,1)' });
  return el;
}

// Franja que cruza la pantalla (saque, contraataque)
export function franja(ctx, html, { en = 0, dur = 900, color = '#fff', clase = '' } = {}) {
  const el = poner(ctx, `<div class="slr-pt-franja ${clase}" style="--c:${color}"><div class="slr-pt-franja__dentro">${html}</div></div>`);
  ctx.linea.anim(el, [
    { transform: 'translate3d(-110%, -50%, 0) skewX(-12deg)', opacity: 1 },
    { transform: 'translate3d(-2%, -50%, 0) skewX(-12deg)', opacity: 1, offset: 0.28 },
    { transform: 'translate3d(2%, -50%, 0) skewX(-12deg)', opacity: 1, offset: 0.72 },
    { transform: 'translate3d(110%, -50%, 0) skewX(-12deg)', opacity: 1 },
  ], { en, dur, easing: 'cubic-bezier(.3,.7,.4,1)' });
  return el;
}

// Foto del dueño del equipo (la pinta renderAvatar de la app; si no, sus iniciales)
export function foto(ctx, letra, clase = '') {
  const eq = ctx.equipo(letra);
  const el = nodo(`<span class="slr-pt-foto ${clase}" style="--c:${ctx.color(letra)}"><span class="avatar">${esc((eq.nombre ?? '?').slice(0, 1))}</span></span>`);
  if (eq.dueno && typeof window.renderAvatar === 'function') window.renderAvatar(el.querySelector('.avatar'), eq.dueno);
  return el;
}

export const tacticaHTML = t => (t ? `<span class="slr-pt-tactica">${iconoTactica(t)}<small>${esc({ posesion: 'Posesión', contraataque: 'Contraataque', presion: 'Presión' }[t] ?? t)}</small></span>` : '');

// Temblor (solo transform): fotogramas que se van calmando
export function framesTemblor(fuerza) {
  const f = [];
  for (let k = 0; k <= 8; k++) {
    const a = k === 8 ? 0 : fuerza * (1 - k / 9);
    f.push({ transform: `translate3d(${(k % 2 ? 1 : -1) * a}px, ${((k * 7) % 3 - 1) * a * 0.6}px, 0) rotate(${(k % 2 ? -1 : 1) * a * 0.4}deg)` });
  }
  return f;
}
export function tiembla(ctx, el, { en = 0, dur = 500, fuerza = 4, iter = 1 } = {}) {
  return ctx.linea.anim(el, framesTemblor(fuerza), { en, dur, easing: 'linear', iter, fill: 'none' });
}

/* ── Barra de porcentajes ──────────────────────────────────────────────────
   pIzq: probabilidad de que gane el de la izquierda (la real del evento).
   Los dos lados se empujan; al final el ganador aplasta la barra con una
   llamarada de su color. Sorpresa (ganó el que tenía menos del 40 %): en el
   último momento va hacia el favorito y se da la vuelta. Poderes: arranca
   inclinada hacia el lado del que lo activó. Devuelve el ms en que termina. */
export function barra(ctx, { pIzq, ganaIzq, en = 0, dur = 1600, sorpresa = false, inclina = 0, titulo = '' }) {
  const T = ctx.T.barra;
  const izq = ctx.lados.izq, der = ctx.lados.der;
  const el = poner(ctx, `
    <div class="slr-pt-barra" style="--izq:${ctx.color(izq)};--der:${ctx.color(der)}">
      ${titulo ? `<p class="slr-pt-barra__titulo">${esc(titulo)}</p>` : ''}
      <div class="slr-pt-barra__pista">
        <i class="slr-pt-barra__der"></i><i class="slr-pt-barra__izq"></i>
        <i class="slr-pt-barra__corte"><b></b></i>
      </div>
      <div class="slr-pt-barra__nums"><b>${Math.round(pIzq * 100)} %</b><b>${100 - Math.round(pIzq * 100)} %</b></div>
    </div>`);
  const relleno = el.querySelector('.slr-pt-barra__izq'), corte = el.querySelector('.slr-pt-barra__corte');
  // Recorrido: inicio → pelea alrededor de pIzq → (sorpresa: casi gana el favorito) → aplasta
  const x0 = Math.min(0.85, Math.max(0.15, 0.5 + inclina * 0.16));
  const pts = [[0, x0]];
  const nPelea = 7, finPelea = T.pelea - (sorpresa ? T.sorpresa : 0);
  for (let k = 1; k <= nPelea; k++) {
    const amp = 0.13 * (1 - k / (nPelea + 1)) * (0.7 + ctx.rng() * 0.6);
    pts.push([finPelea * k / nPelea, Math.min(0.94, Math.max(0.06, pIzq + (k % 2 ? 1 : -1) * amp))]);
  }
  if (sorpresa) pts.push([T.pelea, ganaIzq ? 0.12 : 0.88]);
  pts.push([1, ganaIzq ? 1 : 0]);
  const fx = x => ({ transform: `scaleX(${x.toFixed(3)})` });
  const fc = x => ({ transform: `translate3d(${((x - 1) * 100).toFixed(2)}%, 0, 0)` });
  const opciones = { en: en + T.aparece, dur: dur - T.aparece, easing: 'linear' };
  ctx.linea.anim(relleno, pts.map(([o, x]) => ({ ...fx(x), offset: o, easing: o >= T.pelea - 0.001 ? 'cubic-bezier(.5,0,.2,1)' : 'ease-in-out' })), opciones);
  ctx.linea.anim(corte, pts.map(([o, x]) => ({ ...fc(x), offset: o, easing: o >= T.pelea - 0.001 ? 'cubic-bezier(.5,0,.2,1)' : 'ease-in-out' })), opciones);
  ctx.linea.anim(el, [{ opacity: 0, transform: 'translate(-50%, 12px) scale(.92)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], { en, dur: T.aparece });
  // Temblor de la barra mientras pelean
  tiembla(ctx, el.querySelector('.slr-pt-barra__pista'), { en: en + T.aparece, dur: (dur - T.aparece) * T.pelea, fuerza: 2.5 });
  const fin = en + dur;
  if (sorpresa) {
    const t = en + T.aparece + (dur - T.aparece) * T.pelea;
    ctx.linea.en(t, () => ctx.sonar('sorpresa'));
    rotulo(ctx, '¡SORPRESA!', { en: t, dur: 900, clase: 'slr-pt-rotulo--sorpresa', color: ctx.color(ganaIzq ? izq : der) });
  }
  // Llamarada del ganador al aplastar
  ctx.linea.en(fin - 40, () => {
    const r = el.querySelector('.slr-pt-barra__pista').getBoundingClientRect();
    const color = ctx.color(ganaIzq ? izq : der);
    for (let k = 0; k < 5; k++) ctx.fx.fuego(r.left + r.width * (ganaIzq ? 0.55 + k * 0.1 : 0.05 + k * 0.1), r.top + r.height / 2, 9, { color, ancho: r.width * 0.12 });
    ctx.fx.chispas(ganaIzq ? r.right : r.left, r.top + r.height / 2, 18, { color, fuerza: 8 });
  });
  ctx.linea.anim(el.querySelector('.slr-pt-barra__pista'), [{ transform: 'scale(1)' }, { transform: 'scaleY(1.6)' }, { transform: 'scale(1)' }], { en: fin - 60, dur: T.llamarada, easing: 'ease-out', fill: 'none' });
  return fin + T.llamarada;
}

// Inclinación inicial de la barra por los poderes de esa fase: +1 hacia la izquierda, −1 hacia la derecha
export function inclinacion(ctx, poderes = []) {
  let s = 0;
  for (const p of poderes) s += ctx.lado(p.equipo) === 'izq' ? 1 : -1;
  return Math.max(-1, Math.min(1, s));
}
