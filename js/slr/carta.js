/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — componente carta
   Reutilizable (plantilla, alineación, mercado, sobres, álbum):
     cartaHTML(carta, opciones) → HTML de la carta
     iniciarAcabados(raiz)      → movimiento 3D de todas las cartas y efectos de los acabados
     normalizarCarta(fila)      → acepta carta_json o una fila de /cartas con disenos_carta
     describirPoder(poder)      → texto claro de un poder
   Acabados (especificación complementaria 2.1 y 2.2): registro en
   js/slr/acabados/ (un módulo JS y un CSS por acabado, mismo contrato).
   Con imagen_url, la foto ocupa toda la carta (5:7, a sangre, recortada por
   Cloudinary) y la app pinta encima el OVR, el nombre, el tipo y las stats.
   Carga (js/slr/imagenes.js): al pintarse, cada carta pide su foto sin
   esperar al scroll (las visibles primero); mientras, esqueleto con brillo,
   luego la vista previa borrosa y por último la foto con un fundido.
   Todas las cartas se inclinan en 3D siguiendo el ratón (PC) o el giroscopio
   (móvil: todas las visibles a la vez); el brillo es solo de los acabados.
   Sin imagen, un marcador con iniciales y siluetas. Con una foto PNG sin
   fondo, el fondo de la carta se ve detrás.
   Modelo (docs/slr/CARTAS.md):
   · MARCO = rareza (común gris metálico, rara azul, épica morado, legendaria
     dorado con brillo), en .slr-carta__borde: se distingue también en pequeño.
   · FONDO = color propio de la carta (anulación manual) o, si no tiene, el de
     su colección; si tampoco, el verde neutro.
   · TIPO = icono pequeño bajo la media (siluetas 1/2/3/grupo, estrella para
     especial): solo descriptivo.
   · COLECCIÓN = emblema en la esquina de arriba a la derecha, tintado con el
     color de la colección (mask-image); en la carta grande, además, su nombre
     en pequeño bajo el nombre de la carta.
   El nombre se ajusta a su largo (--n): letra más pequeña hasta un mínimo y,
   si aun así no cabe, dos líneas.
   Interacción (iniciarAcabados): sin menú de "guardar imagen" ni arrastre del
   navegador. Con el ratón (arrastrar) o el dedo (mantener pulsado 300 ms) la
   carta se levanta: una copia sube a una capa en <body> (nunca la corta su
   contenedor), sigue al puntero inclinándose con la velocidad y al soltar
   vuelve a su sitio con un rebote. Un toque o clic corto abre la carta. En la
   alineación (huecos y cartas libres) manda su propio arrastre.
   Solo depende de ui.js (esc, iniciales); los estilos están en
   css/slr.css bajo .slr-carta.
═══════════════════════════════════════════════ */
import { esc, iniciales, bloquearSeleccion, desbloquearSeleccion } from './ui.js';
import { acabado, listaAcabados } from './acabados/index.js';
import { urlFoto, cargarFotos } from './imagenes.js';
import { coleccion, urlEmblema } from './colecciones.js';
import { TACTICA } from './tactica.js';
import { tramoEnergia } from './energia.js';

export const TIPOS = { individual: 'Individual', duo: 'Dúo', trio: 'Trío', grupo: 'Grupo', especial: 'Especial' };
// Rareza: sale del tier (igual que la columna generada disenos_carta.rareza)
export const RAREZAS = { comun: 'Común', rara: 'Rara', epica: 'Épica', legendaria: 'Legendaria' };
export const rarezaDeTier = t => ({ S: 'legendaria', A: 'epica', B: 'rara', C: 'rara' })[t] ?? 'comun';
// Nombres de los acabados registrados ({ foil: 'Foil', … })
export const ACABADOS = Object.fromEntries(listaAcabados().map(a => [a.id, a.nombre]));

// Búsqueda de cartas (todos los buscadores): por el nombre y por las personas que salen en
// ella, sin distinguir mayúsculas ni tildes («nico» encuentra a Nicolás)
export const sinAcentos = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const claveBusqueda = c => sinAcentos([c.nombre, ...(c.personas ?? [])].join(' · '));
export const coincideBusqueda = (c, texto) => {
  const t = sinAcentos(String(texto ?? '').trim());
  return !t || (c.clave ?? claveBusqueda(c)).includes(t);
};

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
    color: d.color ?? null,
    tier: d.tier ?? null,
    rareza: d.rareza ?? rarezaDeTier(d.tier),
    coleccion_id: d.coleccion_id ?? null,
    perfil: d.perfil ?? null,
    personas: d.personas ?? [],
    ata: d.ata, def: d.def, con: d.con,
    ovr: ovr(d.ata, d.def, d.con),
    valor: d.valor,
    poderes: d.poderes ?? [],
    imagen_url: d.imagen_url ?? null,
    texto: d.texto ?? null,
    estamina: d.estamina ?? null,
    tactica_favorita: d.tactica_favorita ?? null,
    energia: f.energia ?? null,          // del ejemplar (cartas.energia); null en el catálogo
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

// Probabilidades [p1, p2, p3] (igual que probabilidadesPoder del motor v1.3.0)
export function probabilidadesDe(p) {
  if (Array.isArray(p.probabilidades)) return [0, 1, 2].map(k => p.probabilidades[k] ?? 0);
  return [p.probabilidad, p.probabilidad / 2.5, p.probabilidad / 6];
}

export function describirPoder(p) {
  const [corto, momento, efecto] = MOMENTOS[p.momento] ?? [p.momento, p.momento, e => `efecto ${num(e)}`];
  const [p1, p2, p3] = p.probabilidad === 'siempre' ? [] : probabilidadesDe(p);
  const prob = p.probabilidad === 'siempre'
    ? 'Siempre'
    : `Se activa en el ${pct(p1)} de los partidos (2 veces en el ${pct(p2)}, 3 en el ${pct(p3)}), repartido por el partido · ×1,5 si es el capitán`;
  return { nombre: p.nombre, corto, momento, probabilidad: prob, efecto: efecto(p.efecto), nivel: p.nivel };
}

/* ── Marcado ─────────────────────────────────────────────────────────────── */
// Cloudinary: recorte 5:7 al ancho fijo más cercano (js/slr/imagenes.js)
export const imagenCarta = urlFoto;

const SILUETA = `<svg class="slr-carta__silueta" viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="36" r="17"/><path d="M14 100c0-22 16-36 36-36s36 14 36 36z"/></svg>`;

// Icono del tipo (24×24, currentColor): una, dos, tres o cuatro siluetas; estrella para especial
const persona = (x, y, e) => `<circle cx="${x}" cy="${y}" r="${3.1 * e}"/><path d="M${x - 5.6 * e} ${y + 10 * e}c0-3.6 2.5-6 ${5.6 * e}-6s${5.6 * e} 2.4 ${5.6 * e} 6z"/>`;
export const ICONOS_TIPO = {
  individual: persona(12, 8, 1.15),
  duo: persona(8, 9, .9) + persona(16, 9, .9),
  trio: persona(5.5, 10, .72) + persona(18.5, 10, .72) + persona(12, 8, .85),
  grupo: persona(5, 7, .62) + persona(12, 6, .62) + persona(19, 7, .62) + persona(8.5, 13, .62) + persona(15.5, 13, .62),
  especial: '<path d="M12 2.5l2.7 6.3 6.8.6-5.2 4.5 1.6 6.7L12 17.1l-5.9 3.5 1.6-6.7-5.2-4.5 6.8-.6z"/>',
};
export const iconoTipo = tipo => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONOS_TIPO[tipo] ?? ICONOS_TIPO.individual}</svg>`;
const PERSONAS_TIPO = { individual: 1, duo: 2, trio: 3, grupo: 3, especial: 0 };

function arte(c) {
  if (c.imagen_url) {
    // Sin src: lo pone cargarFotoCarta al pintarse (en el tamaño pequeño o el grande;
    // si ya está en la caché, sin esqueleto). Las iniciales solo se ven si la foto falla.
    return `<img class="slr-carta__img" data-foto="${esc(c.imagen_url)}" alt="" decoding="async" draggable="false">
      <span class="slr-carta__iniciales slr-carta__iniciales--foto">${esc(iniciales(c.nombre))}</span>`;
  }
  const n = c.personas.length || (PERSONAS_TIPO[c.tipo] ?? 1);
  const siluetas = Array.from({ length: Math.min(3, n) }, () => SILUETA).join('');
  return `<div class="slr-carta__marcador slr-carta__marcador--${Math.min(3, n)}">
      <div class="slr-carta__siluetas">${siluetas}</div>
      <span class="slr-carta__iniciales">${esc(iniciales(c.nombre))}</span>
    </div>`;
}

// Largo "visual" del nombre para ajustar la letra (Anton en mayúsculas: las
// estrechas cuentan menos y las anchas más). Mínimo 8: los cortos no crecen.
function largoNombre(nombre) {
  let n = 0;
  for (const ch of String(nombre ?? '').toUpperCase()) {
    n += 'IJ1. \'-'.includes(ch) ? 0.55 : 'MWÑ'.includes(ch) ? 1.3 : 1;
  }
  return Math.max(8, Math.round(n * 10) / 10);
}

// tam: 'xs' (huecos del campo) | 's' (cuadrícula) | 'l' (detalle). destacar: la stat
// del hueco (en 'xs' solo se ve esa). Marcas de estado (en la franja de abajo, para
// no tapar la cara): capitan, tocada, blindada, enVenta. energia: barra fina abajo si
// la carta trae energía (las del equipo). encaja: su táctica favorita es la elegida.
export function cartaHTML(c, { tam = 's', destacar = null, capitan = false, tocada = false, blindada = false, enVenta = false,
                               energia = true, encaja = false } = {}) {
  const stats = [['ATA', c.ata], ['DEF', c.def], ['CON', c.con]];
  const def = acabado(c.acabado);
  const rareza = c.rareza ?? rarezaDeTier(c.tier);
  const col = c.coleccion ?? coleccion(c.coleccion_id);
  const color = c.color ?? col?.color ?? null;          // el de la carta manda sobre el de la colección
  const emblema = col?.emblema_url
    ? `<span class="slr-carta__emblema" title="${esc(col.nombre)}"><i style="--emblema:url(&quot;${esc(urlEmblema(col.emblema_url))}&quot;)"></i></span>` : '';
  const marcas = [
    capitan && '<span class="slr-carta__marca slr-carta__marca--capitan" title="Capitán">C</span>',
    tocada && '<span class="slr-carta__marca slr-carta__marca--tocada" title="Tocada: juega al 85 %">+</span>',
    blindada && '<span class="slr-carta__marca slr-carta__marca--blindada" title="Blindada">🛡</span>',
    enVenta && '<span class="slr-carta__marca slr-carta__marca--venta" title="En venta">€</span>',
  ].filter(Boolean).join('');
  const fav = TACTICA[c.tactica_favorita];
  const tramo = energia && c.energia != null ? tramoEnergia(c.energia) : null;
  return `
    <div class="slr-carta slr-carta--${tam} slr-carta--${esc(c.tipo)} slr-carta--r-${esc(rareza)} slr-carta--${esc(def.id)}${color ? ` slr-carta--color-${esc(color)}` : ''}${col?.color ? ` slr-carta--col-${esc(col.color)}` : ''}${c.imagen_url ? ' slr-carta--con-imagen' : ''}${tocada ? ' slr-carta--tocada' : ''}${encaja ? ' slr-carta--encaja' : ''}"
         data-carta="${esc(c.id)}" data-acabado="${esc(def.id)}"${def.sigue ? ' data-sigue' : ''}>
      <div class="slr-carta__marco"><div class="slr-carta__cara">
        <div class="slr-carta__arte">${arte(c)}</div>
        <div class="slr-carta__velo"></div>
        <div class="slr-carta__borde" aria-hidden="true"><i></i></div>
        <div class="slr-carta__cabeza">
          <span class="slr-carta__media">
            <span class="slr-carta__ovr">${c.ovr}</span>
            <span class="slr-carta__tipo" title="${esc(TIPOS[c.tipo] ?? c.tipo)}">${iconoTipo(c.tipo)}</span>
            ${fav ? `<span class="slr-carta__favorita" title="Táctica favorita: ${esc(fav.nombre)}">${fav.icono}</span>` : ''}
          </span>
          ${emblema}
        </div>
        <div class="slr-carta__pie">
          ${marcas ? `<span class="slr-carta__marcas">${marcas}</span>` : ''}
          <span class="slr-carta__nombre" style="--n:${largoNombre(c.nombre)}">${esc(c.nombre)}</span>
          ${tam === 'l' && col ? `<span class="slr-carta__coleccion">${esc(col.nombre)}</span>` : ''}
          <span class="slr-carta__stats">
            ${stats.map(([k, v]) => `<span class="${destacar === k ? 'es-destacada' : ''}"><b>${v}</b>${k}</span>`).join('')}
          </span>
        </div>
        ${tramo ? `<div class="slr-carta__energia slr-energia--${tramo.clase}" title="Energía ${c.energia} · ${esc(tramo.texto)}"><i style="width:${Math.max(0, Math.min(100, c.energia))}%"></i></div>` : ''}
        <div class="slr-carta__acabado" aria-hidden="true"><i class="slr-carta__capa"></i></div>
        <div class="slr-carta__destello" aria-hidden="true"><i class="slr-carta__capa"></i></div>
      </div></div>
    </div>`;
}

// Línea de la ficha: tipo (con su icono), rareza, acabado y colección (con su emblema)
export function lineaCarta(c) {
  const r = c.rareza ?? rarezaDeTier(c.tier);
  const col = c.coleccion ?? coleccion(c.coleccion_id);
  const def = acabado(c.acabado);
  return `<span class="slr-linea-carta">
    <span class="slr-chip-tipo">${iconoTipo(c.tipo)}${esc(TIPOS[c.tipo] ?? c.tipo)}</span>
    <span class="slr-chip-rareza slr-chip-rareza--${esc(r)}">${esc(RAREZAS[r])}</span>
    ${def.id !== 'normal' ? `<span class="slr-acabado-${esc(def.id)}">${esc(ACABADOS[def.id] ?? def.id)}</span>` : ''}
    ${col ? `<span class="slr-chip-coleccion${col.color ? ` slr-col-${esc(col.color)}` : ''}">${col.emblema_url
      ? `<i style="--emblema:url(&quot;${esc(urlEmblema(col.emblema_url, 64))}&quot;)"></i>` : ''}${esc(col.nombre)}</span>` : ''}
  </span>`;
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
    // El marco siempre; las capas solo si su acabado sigue el movimiento (registro)
    m = [marcoDe(carta), ...(carta.hasAttribute('data-sigue') ? carta.querySelectorAll('.slr-carta__capa') : [])];
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
  acabado(carta.dataset.acabado).alMover?.(carta, x, y);   // hook opcional del acabado
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

const cartasDe = nodo => nodo.matches?.('.slr-carta') ? [nodo] : [...(nodo.querySelectorAll?.('.slr-carta') ?? [])];

function observar(cartas) {
  cargarFotos(cartas);       // todas, sin esperar al scroll (visibles primero)
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
  observar(cartasDe(raiz));
  // Las pantallas se pintan de nuevo a menudo: se observan las cartas que aparecen
  // (todas las de un mismo cambio juntas, para medirlas de una vez)
  mo = new MutationObserver(cambios => {
    const nuevas = [];
    for (const c of cambios) for (const n of c.addedNodes) if (n.nodeType === 1) nuevas.push(...cartasDe(n));
    if (nuevas.length) observar(nuevas);
  });
  mo.observe(raiz, { childList: true, subtree: true });

  raiz.addEventListener('pointerdown', e => {
    if (e.target.closest('.slr-carta')) activarInclinacion(true);   // iOS: dentro de un gesto del usuario
  });
  enlazarInteraccion(raiz);
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

/* ── Interacción: levantar la carta (ratón o pulsación larga) ────────────── */
// En la alineación las cartas se arrastran para colocarlas (alineacion.js); en las listas con
// selección múltiple (seleccion.js) la pulsación larga selecciona en vez de levantar
const CON_ARRASTRE_PROPIO = '.slr-hueco, .slr-libre, .slr-campo-juego, .slr-quietas, .slr-seleccionable';
const PULSACION_MS = 300;                 // dedo: mantener pulsado para levantar
const UMBRAL_DEDO = 10, UMBRAL_RATON = 5;
let levantada = null;   // { carta, id, tipo, x0, y0, dx, dy, ultX, ultT, giro, activa, frame, temporizador, copia }
let anularClicHasta = 0;
let capa = null;        // portal en <body>: la carta levantada nunca la corta su contenedor

function capaArrastre() {
  if (!capa?.isConnected) {
    capa = document.createElement('div');
    capa.className = 'slr-capa-arrastre';
    capa.setAttribute('aria-hidden', 'true');
    document.body.appendChild(capa);
  }
  return capa;
}

// Bloquea el scroll del dedo mientras la carta está levantada
function bloquearScroll(e) { if (levantada?.activa) e.preventDefault(); }

// La carta original deja su hueco (invisible) y una copia sube a la capa del body
function levantar() {
  const l = levantada;
  l.activa = true;
  if (!l.bloqueo) { bloquearSeleccion(); l.bloqueo = true; }
  const r = l.carta.getBoundingClientRect();
  const copia = l.carta.cloneNode(true);
  copia.classList.add('is-levantada');
  copia.classList.remove('is-activa');
  Object.assign(copia.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  capaArrastre().appendChild(copia);
  l.copia = copia;
  l.carta.classList.add('is-origen');
  pintarLevantada();
}

function pintarLevantada() {
  const l = levantada;
  if (!l?.copia) return;
  l.frame = 0;
  l.copia.style.transform = `translate3d(${l.dx}px, ${l.dy}px, 0) rotate(${l.giro.toFixed(2)}deg) scale(1.06)`;
}

function soltarLevantada() {
  const l = levantada;
  levantada = null;
  clearTimeout(l.temporizador);
  document.removeEventListener('touchmove', bloquearScroll);
  if (l.frame) cancelAnimationFrame(l.frame);
  if (l.bloqueo) desbloquearSeleccion();
  if (!l.activa) return;
  anularClicHasta = Date.now() + 400;      // ha sido un arrastre, no un toque ni un clic
  const { copia, carta } = l;
  copia.classList.add('is-volviendo');
  copia.style.transform = '';               // vuelve a su sitio con rebote
  setTimeout(() => { copia.remove(); carta.classList.remove('is-origen'); }, 620);
}

function enlazarInteraccion(raiz) {
  // Sin menú de "guardar/copiar imagen" ni arrastre de imágenes del navegador
  raiz.addEventListener('contextmenu', e => { if (e.target.closest('.slr-carta')) e.preventDefault(); });
  raiz.addEventListener('dragstart', e => { if (e.target.closest?.('.slr-carta') || e.target.tagName === 'IMG') e.preventDefault(); });
  raiz.addEventListener('click', e => {
    if (Date.now() < anularClicHasta && e.isTrusted) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  raiz.addEventListener('pointerdown', e => {
    const carta = e.target.closest('.slr-carta');
    if (!carta || e.button > 0 || levantada || carta.closest(CON_ARRASTRE_PROPIO)) return;
    const raton = e.pointerType === 'mouse';
    levantada = { carta, id: e.pointerId, tipo: e.pointerType, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0,
                  ultX: e.clientX, ultT: performance.now(), giro: 0, activa: false, frame: 0, copia: null };
    if (!raton) {
      // Mantener pulsado no selecciona texto ni saca el menú de copiar
      bloquearSeleccion(); levantada.bloqueo = true;
      // Antes de que empiece el scroll, para poder cancelarlo si la carta se levanta
      document.addEventListener('touchmove', bloquearScroll, { passive: false });
      levantada.temporizador = setTimeout(() => { if (levantada && !levantada.activa) levantar(); }, PULSACION_MS);
    }
  });
  raiz.addEventListener('pointermove', e => {
    const l = levantada;
    if (!l || e.pointerId !== l.id) return;
    if (!l.activa) {
      const d = Math.hypot(e.clientX - l.x0, e.clientY - l.y0);
      if (l.tipo === 'mouse' && d >= UMBRAL_RATON) levantar();
      else if (l.tipo !== 'mouse' && d > UMBRAL_DEDO) { soltarLevantada(); return; }   // era un scroll
      if (!l.activa) return;
    }
    // Inclinación según la velocidad horizontal (px/ms), suavizada
    const ahora = performance.now();
    const v = (e.clientX - l.ultX) / Math.max(8, ahora - l.ultT);
    l.giro = l.giro * 0.7 + Math.max(-18, Math.min(18, v * 22)) * 0.3;
    l.ultX = e.clientX; l.ultT = ahora;
    l.dx = e.clientX - l.x0; l.dy = e.clientY - l.y0;
    if (!l.frame) l.frame = requestAnimationFrame(pintarLevantada);
  }, { passive: true });
  const fin = e => { if (levantada && e.pointerId === levantada.id) soltarLevantada(); };
  // En la ventana: con el ratón fuera de la raíz o el dedo fuera de la carta también se suelta
  window.addEventListener('pointerup', fin);
  window.addEventListener('pointercancel', fin);
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
