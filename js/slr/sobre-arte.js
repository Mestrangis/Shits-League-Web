/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — arte de los sobres y del dorso de las cartas
   · sobreHTML(tipo, { nombre, imagen_url, coleccion, cartas }): la imagen del
     tipo (PNG vertical ~600×1000, transparente si tiene forma propia) o un
     diseño provisional generado por código, distinto por tipo. El sobre de
     colección usa el emblema y el color de la colección de la semana.
     El brillo laminado (sigue al dedo, al ratón o a la inclinación) lo pone
     la app encima: capa .slr-sobre__lamina con --x / --y.
   · dorsoHTML(rareza, dorsoUrl): el dorso de una carta (5:7) con el color de
     su rareza; sin imagen, uno provisional.
═══════════════════════════════════════════════ */
import { esc } from './ui.js';
import { urlEmblema } from './colecciones.js';

export const COLOR_RAREZA = { comun: '#C9D2CD', rara: '#4D9BFF', epica: '#B26CFF', legendaria: '#FFC94A' };
export const COLOR_COLECCION = {
  verde: '#1FE065', morado: '#B67CFF', azul: '#4D8DFF', rojo: '#FF4D5E',
  naranja: '#FF8A2A', dorado: '#FFC94A', plata: '#DCE4EC', negro: '#9AA39E',
};

const ESTILO = {
  sencillo:  { c1: '#2BEA74', c2: '#06371B', lema: 'UNA CARTA' },
  basico:    { c1: '#4D9BFF', c2: '#0A1F4D', lema: 'TRES CARTAS' },
  eleccion:  { c1: '#B26CFF', c2: '#250A4A', lema: 'TÚ ELIGES' },
  posicion:  { c1: '#FF8A3D', c2: '#4A1A02', lema: 'TU PUESTO' },
  coleccion: { c1: '#FFC94A', c2: '#3D2A00', lema: 'COLECCIÓN' },
};

// Iconos provisionales (SVG en línea, sin imágenes)
const ICONO = {
  sencillo: '<rect x="34" y="22" width="32" height="46" rx="4"/><path d="M42 36h16M42 44h10"/>',
  basico: '<rect x="22" y="28" width="28" height="40" rx="4" transform="rotate(-12 36 48)"/><rect x="36" y="24" width="28" height="40" rx="4"/><rect x="50" y="28" width="28" height="40" rx="4" transform="rotate(12 64 48)"/>',
  eleccion: '<rect x="20" y="26" width="20" height="30" rx="3"/><rect x="40" y="22" width="20" height="30" rx="3"/><rect x="60" y="26" width="20" height="30" rx="3"/><path d="M42 62l6 6 12-12" stroke-width="5"/>',
  posicion: '<rect x="22" y="20" width="56" height="60" rx="4"/><path d="M22 50h56M40 20v10h20V20M40 80V70h20v10"/><circle cx="50" cy="50" r="7"/>',
  coleccion: '<path d="M50 18l9 19 21 3-15 15 4 21-19-10-19 10 4-21-15-15 21-3z"/>',
};

export function sobreHTML(tipo, { nombre = '', imagen_url = null, coleccion = null, cartas = null, tam = 'm' } = {}) {
  const e = ESTILO[tipo] ?? ESTILO.basico;
  const colorCol = tipo === 'coleccion' && coleccion ? (COLOR_COLECCION[coleccion.color] ?? e.c1) : null;
  const c1 = colorCol ?? e.c1;
  const estilo = `--c1:${c1};--c2:${e.c2}`;
  const emblema = tipo === 'coleccion' && coleccion?.emblema_url
    ? `<i class="slr-sobre__emblema" style="--emblema:url(&quot;${esc(urlEmblema(coleccion.emblema_url, 256))}&quot;)"></i>` : '';
  const interior = imagen_url
    ? `<img class="slr-sobre__img" src="${esc(imagen_url)}" alt="" draggable="false">`
    : `<div class="slr-sobre__cuerpo">
        <span class="slr-sobre__marca">SHITS LEAGUE · RUSH</span>
        <span class="slr-sobre__lema">${esc(tipo === 'coleccion' && coleccion ? coleccion.nombre.toUpperCase() : e.lema)}</span>
        ${emblema || `<svg class="slr-sobre__icono" viewBox="0 0 100 100" aria-hidden="true">${ICONO[tipo] ?? ICONO.basico}</svg>`}
        <b class="slr-sobre__nombre">${esc(nombre)}</b>
        ${cartas ? `<small class="slr-sobre__cartas">${cartas} ${cartas === 1 ? 'carta' : 'cartas'}</small>` : ''}
      </div>`;
  return `<div class="slr-sobre slr-sobre--${esc(tipo)} slr-sobre--${tam}${imagen_url ? ' slr-sobre--imagen' : ''}" style="${estilo}" data-sobre-tipo="${esc(tipo)}">
    ${interior}
    <div class="slr-sobre__lamina" aria-hidden="true"></div>
  </div>`;
}

export function dorsoHTML(rareza, dorsoUrl = null) {
  return `<div class="slr-dorso slr-dorso--${esc(rareza ?? 'comun')}" style="--r:${COLOR_RAREZA[rareza] ?? COLOR_RAREZA.comun}">
    ${dorsoUrl ? `<img class="slr-dorso__img" src="${esc(dorsoUrl)}" alt="" draggable="false">`
      : `<div class="slr-dorso__dibujo"><span>SL</span><b>RUSH</b></div>`}
    <div class="slr-dorso__brillo" aria-hidden="true"></div>
  </div>`;
}

// Brillo laminado que sigue al puntero (y a la inclinación del móvil si se permite)
export function laminar(el) {
  const capa = el.querySelector('.slr-sobre__lamina') ?? el;
  let pend = null;
  const poner = (x, y) => {
    if (pend) return;
    pend = requestAnimationFrame(() => { el.style.setProperty('--x', x.toFixed(3)); el.style.setProperty('--y', y.toFixed(3)); pend = null; });
  };
  const mover = e => {
    const r = el.getBoundingClientRect();
    poner(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  const inclinar = e => { if (e.gamma != null) poner(0.5 + Math.max(-30, Math.min(30, e.gamma)) / 60, 0.5 + Math.max(-30, Math.min(30, (e.beta ?? 45) - 45)) / 60); };
  window.addEventListener('pointermove', mover);
  window.addEventListener('deviceorientation', inclinar);
  capa.dataset.laminado = '1';
  return () => {
    window.removeEventListener('pointermove', mover);
    window.removeEventListener('deviceorientation', inclinar);
    if (pend) cancelAnimationFrame(pend);
  };
}
