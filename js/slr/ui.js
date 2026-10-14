/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — utilidades de interfaz
   Escape de HTML, formatos, toasts, hojas (bottom sheets) y confirmaciones.
   Las hojas son "capas": cada una añade una entrada al historial, así el
   botón atrás de Android (o el gesto) cierra primero la capa de arriba.
═══════════════════════════════════════════════ */

/* ── HTML y formatos ─────────────────────────────────────────────────────── */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

// 5000 → "5.000" (toLocaleString no agrupa los números de 4 cifras en español)
export const miles = n => String(Math.round(n ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const monedas = n => `<span class="slr-monedas">${miles(n)}</span>`;
export const conSigno = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${miles(Math.abs(n))}`;

const TZ = 'Europe/Madrid';
const fmt = opciones => new Intl.DateTimeFormat('es-ES', { timeZone: TZ, ...opciones });
const F_DIA_HORA = fmt({ weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const F_FECHA    = fmt({ day: 'numeric', month: 'short' });
const F_CORTA    = fmt({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const F_HORA     = fmt({ hour: '2-digit', minute: '2-digit' });

export const diaHora   = iso => F_DIA_HORA.format(new Date(iso));
export const fechaCorta = iso => F_FECHA.format(new Date(iso));
export const fechaHora = iso => F_CORTA.format(new Date(iso));
export const hora      = iso => F_HORA.format(new Date(iso));

// "3 d 4 h", "5 h 12 min", "12 min"
export function faltan(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return 'ya';
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d} d ${h % 24} h`;
  if (h > 0) return `${h} h ${min % 60} min`;
  return `${Math.max(1, min)} min`;
}

export const iniciales = nombre => (nombre || '?')
  .split(/[\s·&/+-]+/).filter(Boolean).slice(0, 3).map(p => p[0]).join('').toUpperCase();

export function crear(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ── Raíz del modo Rush ──────────────────────────────────────────────────── */
let raiz = null;
export function fijarRaiz(el) { raiz = el; }
const contenedor = () => raiz ?? document.body;

/* ── Toasts ──────────────────────────────────────────────────────────────── */
export function toast(texto, tipo = 'info') {
  let zona = contenedor().querySelector(':scope > .slr-toasts');
  if (!zona) zona = contenedor().appendChild(crear('<div class="slr-toasts" role="status" aria-live="polite"></div>'));
  const t = crear(`<div class="slr-toast slr-toast--${tipo}">${esc(texto)}</div>`);
  zona.appendChild(t);
  // Como mucho 3 a la vez: los más antiguos se van
  while (zona.children.length > 3) zona.firstElementChild.remove();
  setTimeout(() => t.classList.add('slr-toast--fuera'), tipo === 'error' ? 5200 : 3200);
  setTimeout(() => t.remove(), tipo === 'error' ? 5600 : 3600);
}

/* ── Capas e historial ───────────────────────────────────────────────────── */
// Pila de capas abiertas. Profundidad del historial: 0 = Rush abierto sin capas.
const capas = [];

export function abrirCapa(el, alCerrar) {
  contenedor().appendChild(el);
  capas.push({ el, alCerrar });
  history.pushState({ slr: capas.length }, '');
  requestAnimationFrame(() => el.classList.add('abierta'));
}

// Cierra la capa de arriba pasando por el historial (como el botón atrás)
export function cerrarCapa() {
  if (capas.length) history.back();
}

// popstate: deja abiertas tantas capas como diga la entrada del historial
export function ajustarCapas(profundidad) {
  while (capas.length > profundidad) {
    const { el, alCerrar } = capas.pop();
    el.classList.remove('abierta');
    el.classList.add('cerrando');
    setTimeout(() => el.remove(), 260);
    alCerrar?.();
  }
}
export const capasAbiertas = () => capas.length;

/* ── Hojas ───────────────────────────────────────────────────────────────── */
// completa: ocupa toda la pantalla (detalle de carta); si no, sube desde abajo
export function hoja(html, { titulo = '', completa = false, clase = '', alCerrar } = {}) {
  const el = crear(`
    <div class="slr-hoja ${completa ? 'slr-hoja--completa' : ''} ${clase}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="slr-hoja__fondo"></div>
      <div class="slr-hoja__caja">
        <div class="slr-hoja__cabecera">
          <span class="slr-hoja__titulo">${esc(titulo)}</span>
          <button class="slr-hoja__cerrar" type="button" aria-label="Cerrar">✕</button>
        </div>
        <div class="slr-hoja__cuerpo">${html}</div>
      </div>
    </div>`);
  el.querySelector('.slr-hoja__fondo').addEventListener('click', cerrarCapa);
  el.querySelector('.slr-hoja__cerrar').addEventListener('click', cerrarCapa);
  abrirCapa(el, alCerrar);
  return el;
}

// Elemento que hace scroll en una hoja: en PC las hojas completas son un panel
// amplio y el scroll es el de toda la capa; en móvil, el del cuerpo de la hoja
export function scrollDeHoja(el) {
  return getComputedStyle(el).overflowY === 'auto' ? el : el.querySelector('.slr-hoja__cuerpo');
}

// Devuelve una promesa: true si se confirma. escribir: palabra que hay que teclear.
export function confirmar({ titulo, texto, ok = 'Confirmar', peligro = false, escribir = null }) {
  return new Promise(resolve => {
    let resultado = false;
    const el = hoja(`
      <p class="slr-confirmar__texto">${texto}</p>
      ${escribir ? `<label class="slr-confirmar__escribir">Escribe <b>${esc(escribir)}</b> para confirmar
        <input class="slr-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>` : ''}
      <div class="slr-botones">
        <button class="slr-btn slr-btn--fantasma" data-no type="button">Cancelar</button>
        <button class="slr-btn ${peligro ? 'slr-btn--peligro' : ''}" data-si type="button" ${escribir ? 'disabled' : ''}>${esc(ok)}</button>
      </div>`, { titulo, clase: 'slr-confirmar', alCerrar: () => resolve(resultado) });
    const si = el.querySelector('[data-si]');
    el.querySelector('input')?.addEventListener('input', e => { si.disabled = e.target.value.trim().toUpperCase() !== escribir; });
    el.querySelector('[data-no]').addEventListener('click', cerrarCapa);
    si.addEventListener('click', () => { resultado = true; cerrarCapa(); });
  });
}

// Pone un botón en espera mientras dura una acción
export async function conEspera(boton, accion) {
  if (boton.disabled) return;
  boton.disabled = true;
  boton.classList.add('slr-esperando');
  try { return await accion(); } finally {
    boton.disabled = false;
    boton.classList.remove('slr-esperando');
  }
}
