/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — componente carta
   Reutilizable (plantilla, alineación, mercado, sobres, álbum):
     cartaHTML(carta, opciones) → HTML de la carta
     iniciarAcabados(raiz)      → efectos interactivos de los acabados
     normalizarCarta(fila)      → acepta carta_json o una fila de /cartas con disenos_carta
     describirPoder(poder)      → texto claro de un poder
   Acabados (especificación complementaria 2.1 y 2.2):
     foil       gradiente iridiscente (color-dodge) que sigue el dedo o la
                inclinación del móvil; en reposo, animación suave de 4 s
     brillante  destello dorado pulsante
     plateada   tono metálico plateado con brillo
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
      <div class="slr-carta__marco">
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
        <div class="slr-carta__acabado" aria-hidden="true"></div>
        <div class="slr-carta__destello" aria-hidden="true"></div>
      </div>
    </div>`;
}

/* ── Interacción de los acabados ─────────────────────────────────────────── */
const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let raizAcabados = null;
let inclinacion = 'sin-pedir'; // 'sin-pedir' | 'activa' | 'denegada'

function mover(carta, x, y) {
  // x, y en [0, 1]: posición del gradiente y una leve inclinación 3D
  carta.style.setProperty('--px', `${(x * 100).toFixed(1)}%`);
  carta.style.setProperty('--py', `${(y * 100).toFixed(1)}%`);
  if (!reducido()) {
    carta.style.setProperty('--rx', `${((0.5 - y) * 10).toFixed(2)}deg`);
    carta.style.setProperty('--ry', `${((x - 0.5) * 12).toFixed(2)}deg`);
  }
}
function soltar(carta) {
  carta.classList.remove('is-activa');
  for (const v of ['--px', '--py', '--rx', '--ry']) carta.style.removeProperty(v);
}

let marco = 0, ultima = null;
function alInclinar(e) {
  if (e.beta == null || e.gamma == null) return;
  ultima = e;
  if (marco) return;
  marco = requestAnimationFrame(() => {
    marco = 0;
    // gamma: izquierda/derecha (−90…90); beta: adelante/atrás (móvil en la mano ≈ 30–60)
    const x = Math.min(1, Math.max(0, (ultima.gamma + 30) / 60));
    const y = Math.min(1, Math.max(0, (ultima.beta - 15) / 60));
    raizAcabados?.querySelectorAll('.slr-carta--foil:not(.is-tocando)').forEach(c => {
      c.classList.add('is-activa');
      mover(c, x, y);
    });
  });
}

function activarInclinacion() {
  if (inclinacion !== 'sin-pedir' || reducido() || !('DeviceOrientationEvent' in window)) return;
  const pedir = DeviceOrientationEvent.requestPermission;
  if (typeof pedir !== 'function') {          // Android y escritorio: sin permiso
    inclinacion = 'activa';
    window.addEventListener('deviceorientation', alInclinar);
    return;
  }
  // iOS: hay que pedirlo dentro de un gesto del usuario; si no, solo el dedo
  inclinacion = 'denegada';
  pedir.call(DeviceOrientationEvent).then(r => {
    if (r === 'granted') {
      inclinacion = 'activa';
      window.addEventListener('deviceorientation', alInclinar);
    }
  }).catch(() => {});
}

export function iniciarAcabados(raiz) {
  raizAcabados = raiz;
  // En Android/escritorio la inclinación no pide permiso: se activa ya
  if (typeof window.DeviceOrientationEvent?.requestPermission !== 'function') activarInclinacion();

  raiz.addEventListener('pointerdown', e => {
    if (e.target.closest('.slr-carta--foil')) activarInclinacion();   // iOS: gesto del usuario
  });
  raiz.addEventListener('pointermove', e => {
    const carta = e.target.closest('.slr-carta--foil');
    if (!carta) return;
    const r = carta.getBoundingClientRect();
    carta.classList.add('is-activa', 'is-tocando');
    mover(carta, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });
  const fuera = e => {
    const carta = e.target.closest?.('.slr-carta--foil');
    if (carta && !carta.contains(e.relatedTarget)) {
      carta.classList.remove('is-tocando');
      soltar(carta);
    }
  };
  raiz.addEventListener('pointerout', fuera);
  raiz.addEventListener('pointercancel', fuera);
}

export function pararAcabados() {
  window.removeEventListener('deviceorientation', alInclinar);
  if (inclinacion === 'activa') inclinacion = 'sin-pedir';
  raizAcabados = null;
}
