/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — una alineación dibujada en un campo
   Para alineaciones ya jugadas (partidos.alineaciones_congeladas): crónica de un
   partido y ficha de un equipo. Cada carta lleva la stat que usa en su puesto
   (POR y DEF → DEF, MED → CON, DEL → ATA) y la marca de capitán; tocarla abre
   su detalle (los Canteranos no son cartas: no se abren).
═══════════════════════════════════════════════ */
import { esc } from './ui.js';
import { abrirDetalle } from './pantallas/detalle.js';

const STAT = { por: 'DEF', def: 'DEF', med: 'CON', del: 'ATA' };

function ficha(c, linea, capitan) {
  const canterano = String(c.id).startsWith('canterano-');
  return `
    <button class="slr-mini ${capitan ? 'es-capitan' : ''} ${c.tocada ? 'es-tocada' : ''}" type="button"
            ${canterano ? 'disabled' : `data-carta-id="${esc(c.id)}"`} title="${esc(c.nombre)}">
      <b>${c[STAT[linea]]}</b><small>${STAT[linea]}</small>
      <span>${esc(c.nombre)}</span>
      ${capitan ? '<i class="slr-mini__c">C</i>' : ''}
    </button>`;
}

// al: { formacion, por, def[], med[], del[], banquillo[], capitan_id }
// clase: 'slr-propio' | 'slr-rival' | '' (color del equipo)
export function campoHTML(al, { titulo = '', clase = '', nota = '' } = {}) {
  if (!al?.por) return '<p class="slr-suave">Sin alineación.</p>';
  const fila = l => `<div class="slr-campito__fila">${(l === 'por' ? [al.por] : al[l]).map(c => ficha(c, l, al.capitan_id === c.id)).join('')}</div>`;
  return `
    <div class="slr-campito ${clase}">
      ${titulo ? `<div class="slr-campito__cabeza"><b class="${clase}">${esc(titulo)}</b><span>${esc(al.formacion)}${nota ? ` · ${esc(nota)}` : ''}</span></div>` : ''}
      <div class="slr-campito__cesped">
        <div class="slr-campito__lineas" aria-hidden="true"></div>
        ${fila('del')}${fila('med')}${fila('def')}${fila('por')}
      </div>
      ${al.banquillo?.length ? `<p class="slr-campito__banco"><small>Banquillo</small>
        ${al.banquillo.map(c => `<button type="button" class="slr-campito__suplente" data-carta-id="${esc(c.id)}">${esc(c.nombre)}</button>`).join('')}</p>` : ''}
    </div>`;
}

export function enlazarCampo(el, ctx) {
  el.querySelectorAll('[data-carta-id]').forEach(b => b.addEventListener('click', () => abrirDetalle(b.dataset.cartaId, ctx).catch(() => {})));
}
