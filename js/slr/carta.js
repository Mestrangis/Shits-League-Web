/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — componente carta
   Reutilizable (plantilla, alineación, mercado, sobres, álbum):
     cartaHTML(carta, opciones) → HTML de la carta
     iniciarAcabados(raiz)      → movimiento 3D de todas las cartas y efectos de los acabados
     normalizarCarta(fila)      → acepta carta_json o una fila de /cartas con disenos_carta
     describirPoder(poder)      → texto claro de un poder
   Acabados (especificación complementaria 2.1 y 2.2):
     foil       gradiente iridiscente (color-dodge) que sigue el dedo o la
                inclinación del móvil; en reposo, animación suave de 4 s
     brillante  destello dorado pulsante
     plateada   tono metálico plateado con brillo
   Todas las cartas se inclinan en 3D siguiendo el ratón (PC) o el giroscopio
   (móvil: todas las visibles a la vez); el brillo es solo de los acabados.
   Sin imagen (catálogo beta), un marcador con iniciales y silueta del color
   del tipo. Solo depende de ui.js (esc, iniciales); los estilos están en
   css/slr.css bajo .slr-carta.
═══════════════════════════════════════════════ */
import { esc, iniciales } from './ui.js';

export const TIPOS = { individual: 'Individual', duo: 'Dúo', trio: 'Trío', unica: 'Única' };
export const ACABADOS = { normal: 'Normal', foil: 'Foil', brillante: 'Brillante', plateada: 'Plateada' };

// OVR: 60 % la mejor stat, 25 % la media, 15 % la peor (igual que ovr() en la base de datos)
export function ovr(ata, def, con) {
  const v = [ata, def, con].sort((a, b) => b - a);
  return Math.round(0.6 * v[0] + 0.25 * v[1] + 0.15 * v[2]);
}

export function normalizarCarta(f) {
  const d = f.disenos_carta ?? f;
  return {
    id: f.id,
    diseno_id: f.diseno_id ?? d.id,
    nombre: d.nombre,
    tipo: d.tipo,
    acabado: d.acabado ?? 'normal',
    personas: d.personas ?? [],
    ata: d.ata, def: d.def, con: d.con,
    ovr: ovr(d.ata, d.def, d.con),
    valor: d.valor,
    poderes: d.poderes ?? [],
    imagen_url: d.imagen_url ?? null,
    texto: d.texto ?? null,
  };
}

/* ── Poderes en lenguaje claro ───────────────────────────────────────────── */
const MOMENTOS = {
  posesion:        ['Posesión', 'Al disputar cada balón', e => `+${pct(e)} a la fuerza de posesión de su equipo`],
  ocasion_ataque:  ['Ataque', 'Cuando su equipo ataca', e => `+${pct(e)} a la fuerza de ataque de su equipo`],
  ocasion_defensa: ['Defensa', 'Cuando su equipo defiende', e => `+${pct(e)} a la fuerza defensiva de su equipo`],
  tirador:         ['Tirador', 'Al elegir quién chuta', e => `multiplica por ${num(e)} sus opciones de ser el tirador`],
  chut:            ['Chut', 'Cuando chuta él', e => `+${pct(e)} a su ATA en ese chut`],
  parada:          ['Parada', 'Cuando para de portero', e => `+${pct(e)} a su DEF en esa parada`],
};
const pct = e => `${Math.round(e * 100)} %`;
const num = e => String(Math.round(e * 100) / 100).replace('.', ',');

export function describirPoder(p) {
  const [corto, momento, efecto] = MOMENTOS[p.momento] ?? [p.momento, p.momento, e => `efecto ${num(e)}`];
  const prob = p.probabilidad === 'siempre'
    ? 'Siempre'
    : `${Math.round(p.probabilidad * 100)} % de las veces (×1,5 si es el capitán)`;
  return { nombre: p.nombre, corto, momento, probabilidad: prob, efecto: efecto(p.efecto), nivel: p.nivel };
}

/* ── Marcado ─────────────────────────────────────────────────────────────── */
// Cloudinary a medida, como imagenOptimizada() de js/ui.js
function imagen(url, ancho) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  const w = Math.max(100, Math.ceil(ancho * (window.devicePixelRatio || 1) / 100) * 100);
  return url.replace(/(\/image\/upload\/)/, `$1c_fill,ar_5:7,g_face,w_${w},f_auto,q_auto/`);
}

const SILUETA = `<svg class="slr-carta__silueta" viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="36" r="17"/><path d="M14 100c0-22 16-36 36-36s36 14 36 36z"/></svg>`;

function arte(c, ancho) {
  if (c.imagen_url) {
    return `<img class="slr-carta__img" src="${esc(imagen(c.imagen_url, ancho))}" alt="" loading="lazy" decoding="async">`;
  }
  const personas = c.personas.length ? c.personas : [c.nombre];
  const siluetas = personas.slice(0, 3).map(() => SILUETA).join('');
  return `<div class="slr-carta__marcador slr-carta__marcador--${Math.min(3, personas.length)}">
      <div class="slr-carta__siluetas">${siluetas}</div>
      <span class="slr-carta__iniciales">${esc(iniciales(c.nombre))}</span>
    </div>`;
}

// tam: 'xs' (huecos del campo) | 's' (cuadrícula) | 'l' (detalle). ancho: px aprox. para la imagen.
// stats: false oculta ATA/DEF/CON (en 'xs' se muestra solo la stat indicada en destacar)
export function cartaHTML(c, { tam = 's', ancho = 160, destacar = null, capitan = false, tocada = false } = {}) {
  const stats = [['ATA', c.ata], ['DEF', c.def], ['CON', c.con]];
  return `
    <div class="slr-carta slr-carta--${tam} slr-carta--${esc(c.tipo)} slr-carta--${esc(c.acabado)}${tocada ? ' slr-carta--tocada' : ''}"
         data-carta="${esc(c.id)}" data-acabado="${esc(c.acabado)}">
      <div class="slr-carta__marco"><div class="slr-carta__cara">
        <div class="slr-carta__arte">${arte(c, ancho)}</div>
        <div class="slr-carta__velo"></div>
        <div class="slr-carta__cabeza">
          <span class="slr-carta__ovr">${c.ovr}</span>
          <span class="slr-carta__tipo">${esc(TIPOS[c.tipo] ?? c.tipo)}</span>
        </div>
        ${capitan ? '<span class="slr-carta__capitan" title="Capitán">C</span>' : ''}
        ${tocada ? '<span class="slr-carta__tocada-marca" title="Tocada: juega al 85 %">+</span>' : ''}
        <div class="slr-carta__pie">
          <span class="slr-carta__nombre">${esc(c.nombre)}</span>
          <span class="slr-carta__stats">
            ${stats.map(([k, v]) => `<span class="${destacar === k ? 'es-destacada' : ''}"><b>${v}</b>${k}</span>`).join('')}
          </span>
        </div>
        <div class="slr-carta__acabado" aria-hidden="true"><i class="slr-carta__capa"></i></div>
        <div class="slr-carta__destello" aria-hidden="true"><i class="slr-carta__capa"></i></div>
      </div></div>
    </div>`;
}

/* ── Movimiento 3D y acabados ────────────────────────────────────────────── */
// Rendimiento (ver tests/slr/banco/medir.mjs):
//  · los eventos solo guardan la posición; se aplica una vez por frame (rAF);
//  · lo único que se escribe son dos variables (--x, --y en [0, 1]) en el marco
//    de cada carta; el CSS las convierte en transform (inclinación y capas del
//    acabado) y opacity: nada de background-position, filtros ni sombras;
//  · will-change solo mientras hay interacción (clase is-activa);
//  · un único listener de deviceorientation para toda la pantalla, que solo
//    mueve las cartas visibles (IntersectionObserver); las animaciones de
//    reposo de las que no se ven quedan en pausa;
//  · al aparecer, cada carta se "precalienta" dos frames (capas creadas y
//    rasterizadas) para que la primera pasada del ratón no dé tirones.
const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let io = null, mo = null;
const visibles = new Set();
let inclinacion = 'sin-pedir';      // 'sin-pedir' | 'pidiendo' | 'activa' | 'denegada'
let giro = null;                     // { x, y } del giroscopio, o null
let puntero = null;                  // { carta, x, y, r } bajo el ratón o el dedo
let programado = 0;
const soltando = new Map();          // carta → temporizador para quitar is-activa

const marcoDe = carta => carta.firstElementChild;
// Elementos que se mueven con --x/--y: el marco y, en el foil, sus dos capas.
// Las variables son no heredables (@property en css/slr.css): cambiarlas solo
// recalcula esos elementos, no los ~25 que tiene cada carta.
const movibles = new WeakMap();
function moviblesDe(carta) {
  let m = movibles.get(carta);
  if (!m) {
    m = [marcoDe(carta), ...(carta.classList.contains('slr-carta--foil') ? carta.querySelectorAll('.slr-carta__capa') : [])];
    movibles.set(carta, m);
  }
  return m;
}
function escribir(carta, x, y) {
  const vx = x.toFixed(3), vy = y.toFixed(3);
  for (const el of moviblesDe(carta)) {
    el.style.setProperty('--x', vx);
    el.style.setProperty('--y', vy);
  }
}
function borrar(carta) {
  for (const el of moviblesDe(carta)) {
    el.style.removeProperty('--x');
    el.style.removeProperty('--y');
  }
}
function activar(carta) {
  clearTimeout(soltando.get(carta));
  soltando.delete(carta);
  carta.classList.add('is-activa');
}
function reposar(carta) {
  borrar(carta);
  // will-change se quita cuando la carta ha terminado de volver a su sitio
  clearTimeout(soltando.get(carta));
  soltando.set(carta, setTimeout(() => { carta.classList.remove('is-activa'); soltando.delete(carta); }, 500));
}

function programar() {
  if (!programado) programado = requestAnimationFrame(aplicar);
}
// Posición suavizada del giroscopio (los sensores tiemblan): se acerca un 25 %
// por frame al último valor y deja de pedir frames cuando llega
let suave = null;
function aplicar() {
  programado = 0;
  if (puntero?.carta.isConnected) escribir(puntero.carta, puntero.x, puntero.y);
  if (giro && !reducido()) {
    suave ??= { ...giro };
    suave.x += (giro.x - suave.x) * 0.25;
    suave.y += (giro.y - suave.y) * 0.25;
    for (const c of visibles) {
      if (!c.isConnected) { visibles.delete(c); continue; }
      if (c !== puntero?.carta) escribir(c, suave.x, suave.y);
    }
    if (Math.abs(giro.x - suave.x) + Math.abs(giro.y - suave.y) > 0.002) programar();
  }
}

function alInclinar(e) {
  if (e.beta == null || e.gamma == null) return;
  // gamma: izquierda/derecha (−90…90); beta: adelante/atrás (el móvil en la mano ≈ 30–60)
  const primera = !giro;
  giro = {
    x: Math.min(1, Math.max(0, (e.gamma + 30) / 60)),
    y: Math.min(1, Math.max(0, (e.beta - 15) / 60)),
  };
  if (primera) for (const c of visibles) activar(c);
  programar();
}

// Sin requestPermission (navegadores antiguos) se escucha directamente. Con él,
// Chrome y Android lo conceden sin preguntar; iOS solo dentro de un gesto del
// usuario: si al montar lo rechaza, se vuelve a pedir al tocar una carta, y si
// el usuario dice que no, queda solo el dedo.
function activarInclinacion(enGesto = false) {
  if (inclinacion !== 'sin-pedir' || reducido() || !('DeviceOrientationEvent' in window)) return;
  const escuchar = () => {
    inclinacion = 'activa';
    window.addEventListener('deviceorientation', alInclinar);
  };
  const pedir = DeviceOrientationEvent.requestPermission;
  if (typeof pedir !== 'function') { escuchar(); return; }
  inclinacion = 'pidiendo';
  pedir.call(DeviceOrientationEvent).then(r => {
    if (r === 'granted') escuchar();
    else inclinacion = enGesto ? 'denegada' : 'sin-pedir';
  }).catch(() => { inclinacion = enGesto ? 'denegada' : 'sin-pedir'; });
}

// Precalentar: dos frames con las capas promocionadas para que el navegador las
// cree y rasterice antes de la primera interacción
function precalentar(carta) {
  if (carta.dataset.caliente) return;
  carta.dataset.caliente = '1';
  carta.classList.add('is-calentando');
  requestAnimationFrame(() => requestAnimationFrame(() => carta.classList.remove('is-calentando')));
}

function observar(nodo) {
  const cartas = nodo.matches?.('.slr-carta') ? [nodo] : nodo.querySelectorAll?.('.slr-carta') ?? [];
  for (const c of cartas) {
    if (io) io.observe(c);
    else { c.classList.add('is-visible'); visibles.add(c); }
  }
}

function alVisibilidad(entradas) {
  for (const e of entradas) {
    const c = e.target;
    c.classList.toggle('is-visible', e.isIntersecting);
    if (e.isIntersecting) {
      visibles.add(c);
      precalentar(c);
      if (giro) activar(c);
    } else {
      visibles.delete(c);
      if (c !== puntero?.carta) {
        c.classList.remove('is-activa');
        borrar(c);
      }
    }
  }
  if (giro) programar();
}

export function iniciarAcabados(raiz) {
  activarInclinacion();

  if ('IntersectionObserver' in window) io = new IntersectionObserver(alVisibilidad, { rootMargin: '40px' });
  observar(raiz);
  // Las pantallas se pintan de nuevo a menudo: se observan las cartas que aparecen
  mo = new MutationObserver(cambios => {
    for (const c of cambios) for (const n of c.addedNodes) if (n.nodeType === 1) observar(n);
  });
  mo.observe(raiz, { childList: true, subtree: true });

  raiz.addEventListener('pointerdown', e => {
    if (e.target.closest('.slr-carta')) activarInclinacion(true);   // iOS: dentro de un gesto del usuario
  });
  raiz.addEventListener('pointerover', e => {
    const carta = e.target.closest('.slr-carta');
    if (!carta || carta === puntero?.carta || carta.closest('.slr-quietas')) return;
    if (puntero) reposar(puntero.carta);
    // El rectángulo se mide una vez al entrar, no en cada movimiento
    puntero = { carta, x: 0.5, y: 0.5, r: carta.getBoundingClientRect() };
    activar(carta);
  });
  raiz.addEventListener('pointermove', e => {
    if (!puntero) return;
    const { r } = puntero;
    puntero.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    puntero.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    programar();
  }, { passive: true });
  const fuera = e => {
    if (!puntero) return;
    if (e.type === 'pointerout' && puntero.carta.contains(e.relatedTarget)) return;
    const { carta } = puntero;
    puntero = null;
    if (giro && visibles.has(carta)) programar(); else reposar(carta);
  };
  raiz.addEventListener('pointerout', fuera);
  raiz.addEventListener('pointercancel', fuera);
  // Con scroll, el rectángulo guardado deja de valer
  raiz.addEventListener('scroll', () => { if (puntero) puntero.r = puntero.carta.getBoundingClientRect(); },
    { capture: true, passive: true });
}

export function pararAcabados() {
  window.removeEventListener('deviceorientation', alInclinar);
  if (inclinacion === 'activa') inclinacion = 'sin-pedir';
  io?.disconnect();
  mo?.disconnect();
  io = mo = null;
  visibles.clear();
  giro = puntero = suave = null;
}
