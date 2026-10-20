/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: piezas comunes de las escenas
   Composición vertical: el rival arriba y tu equipo (o el local) abajo; quien
   ataca va hacia la portería contraria (arriba o abajo). Iconos planos (balón,
   bota, pierna de chilena, guantes, brazo, portería), rótulos, franjas, cartas
   y la barra de porcentajes. Todo se monta antes de empezar y se anima solo
   con transform y opacity sobre la línea de tiempo de la escena (ctx.linea).

   ctx (lo prepara el reproductor para cada escena):
     escenario · linea · d (datos de la escena) · T (tiempos) · rng · fx · sonar(nombre)
     lados { abajo, arriba } · lado(letra) → 'abajo'|'arriba' · hacia(letra) → −1 (sube) | 1 (baja)
     color(letra) · equipo(letra) · carta(id) · centro(el) → [x, y]
     temblor(fuerza, en, dur) · marcador(goles, letra) · cesped(sentido, ritmo)
═══════════════════════════════════════════════ */
import { esc } from '../../ui.js';
import { cartaHTML } from '../../carta.js';
import { iconoTactica } from '../../tactica.js';
import { leer } from '../config.js';

export function nodo(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export const poner = (ctx, html) => ctx.escenario.appendChild(nodo(html));

/* ── Iconos planos ─────────────────────────────────────────────────────── */
export const BALON = `<svg class="slr-pt-balon__svg" viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="32" cy="32" r="29" fill="#fff"/>
  <path fill="#0b2416" d="M32 20l9 6.5-3.4 10.6H26.4L23 26.5z"/>
  <path fill="#0b2416" d="M8.5 25.5l7-1 4.5 9.5-4.5 8-6.2-2.2A24 24 0 0 1 8.5 25.5zM55.5 25.5l-7-1-4.5 9.5 4.5 8 6.2-2.2a24 24 0 0 0 .8-14.3zM24 54.5l3-7.4h10l3 7.4a24 24 0 0 1-16 0zM22 9.5l4 6.5 6-3 6 3 4-6.5a24 24 0 0 0-20 0z"/>
  <circle cx="32" cy="32" r="29" fill="none" stroke="#0b2416" stroke-width="2.5"/></svg>`;

// Bota de lado (la puntera a la derecha); se gira para que apunte arriba o abajo
export const BOTA = `<svg viewBox="0 0 96 64" aria-hidden="true"><path fill="currentColor"
  d="M14 4h26v24c6 2 14 4 26 5 14 1 24 6 26 14 1 5-2 9-8 9H22c-6 0-10-3-10-8V22l-6-2V8c0-2 2-4 4-4z"/>
  <path fill="#0b2416" opacity=".35" d="M12 50h80v6H12z"/><circle cx="26" cy="60" r="3" fill="currentColor"/><circle cx="44" cy="60" r="3" fill="currentColor"/><circle cx="62" cy="60" r="3" fill="currentColor"/><circle cx="80" cy="60" r="3" fill="currentColor"/></svg>`;

// Pierna de chilena: media, espinillera y bota boca abajo (la pierna arriba del todo)
export const PIERNA = `<svg viewBox="0 0 80 220" aria-hidden="true">
  <rect x="22" y="0" width="34" height="120" rx="14" fill="currentColor"/>
  <rect x="22" y="40" width="34" height="10" fill="#fff" opacity=".85"/><rect x="22" y="58" width="34" height="10" fill="#fff" opacity=".85"/>
  <rect x="25" y="112" width="28" height="44" rx="10" fill="#fff"/>
  <path fill="#f4f4f4" stroke="#041009" stroke-width="2" d="M20 150h36v22c0 5 3 9 8 11 8 3 13 9 13 16 0 6-4 10-10 10H34c-8 0-14-6-14-14z"/>
  <path fill="currentColor" opacity=".55" d="M24 196h46v6H24z"/></svg>`;

// Guante cerrado (puño)
export const PUNO = `<svg viewBox="0 0 64 76" aria-hidden="true">
  <rect x="10" y="6" width="46" height="40" rx="14" fill="currentColor"/>
  <path d="M21 8v22M32 8v22M43 8v22" stroke="#041009" stroke-width="3" opacity=".35" stroke-linecap="round"/>
  <rect x="4" y="22" width="14" height="22" rx="7" fill="currentColor" stroke="#041009" stroke-opacity=".3" stroke-width="2"/>
  <rect x="14" y="44" width="38" height="28" rx="6" fill="#fff"/><rect x="14" y="52" width="38" height="5" fill="#041009" opacity=".25"/></svg>`;

// Guante abierto (palma, cuatro dedos y pulgar)
export const GUANTE = `<svg viewBox="0 0 70 92" aria-hidden="true">
  ${[0, 1, 2, 3].map(k => `<rect x="${14 + k * 11}" y="${k === 0 || k === 3 ? 10 : 2}" width="10" height="40" rx="5" fill="currentColor"/>`).join('')}
  <rect x="12" y="32" width="48" height="34" rx="12" fill="currentColor"/>
  <rect x="0" y="34" width="16" height="30" rx="8" fill="currentColor" transform="rotate(-28 8 49)"/>
  <rect x="16" y="64" width="40" height="26" rx="6" fill="#fff"/><rect x="16" y="72" width="40" height="5" fill="#041009" opacity=".25"/></svg>`;

// Brazo estirado: manga, muñequera y guante abierto en la punta (hacia la derecha)
export const BRAZO = `<svg viewBox="0 0 260 70" aria-hidden="true">
  <rect x="0" y="18" width="180" height="34" rx="16" fill="currentColor" opacity=".8"/>
  <rect x="168" y="20" width="22" height="30" rx="4" fill="#fff"/>
  <g transform="translate(188 0)">
    ${[0, 1, 2, 3].map(k => `<rect x="34" y="${6 + k * 14}" width="38" height="11" rx="5.5" fill="currentColor"/>`).join('')}
    <rect x="4" y="8" width="40" height="54" rx="12" fill="currentColor"/>
    <rect x="16" y="56" width="26" height="12" rx="6" fill="currentColor" transform="rotate(30 29 62)"/></g></svg>`;

// Portería de frente (la red en su propio grupo, para hundirla)
export const PORTERIA = `<svg class="slr-pt-porteria__svg" viewBox="0 0 160 70" preserveAspectRatio="none" aria-hidden="true">
  <g class="slr-pt-porteria__red" stroke="rgba(255,255,255,.38)" stroke-width="1.2" fill="none">
    ${Array.from({ length: 15 }, (_, i) => `<path d="M${10 + i * 10} 6V68"/>`).join('')}
    ${Array.from({ length: 6 }, (_, i) => `<path d="M8 ${10 + i * 11}H152"/>`).join('')}
  </g>
  <path d="M6 70V4h148v66" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/></svg>`;

// La red vista desde detrás de la portería (cámara dentro de la red): malla que llena la pantalla
export const RED_DETRAS = `<svg class="slr-pt-red__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <g stroke="rgba(255,255,255,.55)" stroke-width=".45" fill="none">
    ${Array.from({ length: 13 }, (_, i) => `<path d="M${4 + i * 7.6} 0V100"/>`).join('')}
    ${Array.from({ length: 13 }, (_, i) => `<path d="M0 ${4 + i * 7.6}H100"/>`).join('')}
  </g></svg>`;

export function balon(ctx, clase = '') {
  return poner(ctx, `<div class="slr-pt-balon ${clase}">${BALON}</div>`);
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
export function franja(ctx, html, { en = 0, entra = 450, queda = 0, sale = 450, texto = '', color = '#fff', clase = '' } = {}) {
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

// Temblor (solo transform): fotogramas que se van calmando
export function framesTemblor(fuerza, pasos = 8) {
  const f = [];
  for (let k = 0; k <= pasos; k++) {
    const a = k === pasos ? 0 : fuerza * (1 - k / (pasos + 1));
    f.push({ transform: `translate3d(${(k % 2 ? 1 : -1) * a}px, ${((k * 7) % 3 - 1) * a * 0.6}px, 0) rotate(${(k % 2 ? -1 : 1) * a * 0.4}deg)` });
  }
  return f;
}
export function tiembla(ctx, el, { en = 0, dur = 500, fuerza = 4, iter = 1 } = {}) {
  return ctx.linea.anim(el, framesTemblor(fuerza), { en, dur, easing: 'linear', iter, fill: 'none' });
}
// Temblor sostenido (sin calmarse) durante dur: para la tensión del chut
export function vibra(ctx, el, { en = 0, dur = 1000, fuerza = 3 } = {}) {
  const n = Math.max(4, Math.round(dur / 55));
  const f = Array.from({ length: n + 1 }, (_, k) => ({ transform: k === n ? 'translate3d(0,0,0)'
    : `translate3d(${(k % 2 ? 1 : -1) * fuerza}px, ${((k * 5) % 3 - 1) * fuerza * 0.7}px, 0)` }));
  return ctx.linea.anim(el, f, { en, dur, easing: 'linear', fill: 'none' });
}

/* ── Barra de porcentajes ──────────────────────────────────────────────────
   pAbajo: probabilidad de que gane el de abajo (la real del evento); su color va
   a la izquierda, como en el marcador. Los dos lados se empujan; al final el
   ganador aplasta la barra con una llamarada de su color. Sorpresa (ganó el que
   tenía menos del 40 %): en el último momento va hacia el favorito y se da la
   vuelta. Poderes: arranca inclinada hacia el lado del que lo activó.
   arriba: la barra en la parte de arriba (cuando lo de abajo está ocupado). */
export function barra(ctx, { pAbajo, ganaAbajo, en = 0, dur = 1600, sorpresa = false, inclina = 0, titulo = '', arriba = false }) {
  const T = ctx.T.barra;
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
  // Recorrido: inicio → pelea alrededor de pAbajo → (sorpresa: casi gana el favorito) → aplasta
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
  const opciones = { en: en + T.aparece, dur: dur - T.aparece, easing: 'linear' };
  ctx.linea.anim(relleno, pts.map(([o, x]) => ({ transform: `scaleX(${x.toFixed(3)})`, offset: o, easing: curva(o) })), opciones);
  ctx.linea.anim(corte, pts.map(([o, x]) => ({ transform: `translate3d(${((x - 1) * 100).toFixed(2)}%, 0, 0)`, offset: o, easing: curva(o) })), opciones);
  ctx.linea.anim(el, [{ opacity: 0, transform: 'translate(-50%, 12px) scale(.92)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], { en, dur: T.aparece });
  // La barra tiembla mientras pelean
  vibra(ctx, el.querySelector('.slr-pt-barra__pista'), { en: en + T.aparece, dur: (dur - T.aparece) * T.pelea, fuerza: 2 });
  const fin = en + dur;
  let finRotulo = fin;
  if (sorpresa) {
    const t = en + T.aparece + (dur - T.aparece) * T.pelea;
    ctx.linea.en(t, () => ctx.sonar('sorpresa'));
    finRotulo = rotulo(ctx, '¡SORPRESA!', { en: t, clase: `slr-pt-rotulo--sorpresa ${arriba ? 'slr-pt-rotulo--abajo' : ''}`, color: ctx.color(ganaAbajo ? ab : ar) });
  }
  // Llamarada del ganador al aplastar
  ctx.linea.en(fin - 40, () => {
    const r = el.querySelector('.slr-pt-barra__pista').getBoundingClientRect();
    const color = ctx.color(ganaAbajo ? ab : ar);
    for (let k = 0; k < 5; k++) ctx.fx.fuego(r.left + r.width * (ganaAbajo ? 0.55 + k * 0.1 : 0.05 + k * 0.1), r.top + r.height / 2, 9, { color, ancho: r.width * 0.12 });
    ctx.fx.chispas(ganaAbajo ? r.right : r.left, r.top + r.height / 2, 18, { color, fuerza: 8 });
  });
  ctx.linea.anim(el.querySelector('.slr-pt-barra__pista'), [{ transform: 'scale(1)' }, { transform: 'scaleY(1.6)' }, { transform: 'scale(1)' }], { en: fin - 60, dur: T.llamarada, easing: 'ease-out', fill: 'none' });
  return Math.max(fin + T.llamarada, finRotulo);
}

// Inclinación inicial de la barra por los poderes de esa fase: +1 hacia el de abajo, −1 hacia el de arriba
export function inclinacion(ctx, poderes = []) {
  let s = 0;
  for (const p of poderes) s += ctx.lado(p.equipo) === 'abajo' ? 1 : -1;
  return Math.max(-1, Math.min(1, s));
}

/* ── Geometría (px dentro del escenario) ───────────────────────────────── */
// Tamaño del escenario
export function medidas(ctx) {
  const r = ctx.escenario.getBoundingClientRect();
  return { W: r.width, H: r.height };
}
// Centro y tamaño de un elemento dentro del escenario (medir ANTES de animarlo)
export function caja(ctx, el) {
  const e = ctx.escenario.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left - e.left + r.width / 2, y: r.top - e.top + r.height / 2, w: r.width, h: r.height };
}
// transform para el balón «libre» (su centro en x, y del escenario)
export const en = (x, y, extra = '') => `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)${extra}`;
// Balón colocado por coordenadas (centro en x, y)
export function balonEn(ctx, x, y, clase = '') {
  const b = balon(ctx, `slr-pt-balon--libre ${clase}`);
  b.style.transform = en(x, y);
  return b;
}
