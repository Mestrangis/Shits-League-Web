/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — Plantilla
   Cuadrícula de cartas propias con OVR, stats, valor, cláusula y estado
   (blindada, tocada, en venta) y energía. Orden por OVR, valor, una stat o
   energía. Buscador por nombre o persona (sin mayúsculas ni tildes). Tocar una
   carta abre su detalle.
═══════════════════════════════════════════════ */
import { esc, miles, fechaCorta } from '../ui.js';
import { cartaHTML, coincideBusqueda } from '../carta.js';
import { estaTocada, configLiga } from '../rush.js';
import { abrirDetalle } from './detalle.js';
import { barraEnergia } from '../tactica.js';

const ORDENES = { ovr: 'OVR', valor: 'Valor', ata: 'ATA', def: 'DEF', con: 'CON', energia: 'Energía' };
let orden = 'ovr', busqueda = '';

export function chipsEstado(c) {
  const chips = [];
  if (c.blindada_hasta) chips.push(`<span class="slr-chip slr-chip--blindada">🛡 Hasta ${esc(fechaCorta(c.blindada_hasta))}</span>`);
  if (estaTocada(c)) chips.push('<span class="slr-chip slr-chip--tocada">Tocada · 85 %</span>');
  if (c.en_venta) chips.push(`<span class="slr-chip slr-chip--venta">En venta · ${miles(c.en_venta.precio)}</span>`);
  return chips.join('');
}

export async function pintar(cont, ctx) {
  const { datos } = ctx;
  const maximo = configLiga().plantilla_maxima ?? 15;
  const cartas = [...datos.cartas].sort((a, b) => b[orden] - a[orden] || b.ovr - a.ovr || a.nombre.localeCompare(b.nombre));

  cont.innerHTML = `
    <header class="slr-cabecera">
      <h1 class="slr-titulo">Plantilla <small>${cartas.length}/${maximo}</small></h1>
      <div class="slr-segmentos" role="group" aria-label="Ordenar por">
        ${Object.entries(ORDENES).map(([k, v]) => `<button type="button" data-orden="${k}" class="${k === orden ? 'activo' : ''}">${v}</button>`).join('')}
      </div>
    </header>
    ${cartas.length ? `<input class="slr-input slr-plantilla__buscar" type="search" data-buscar placeholder="Buscar por nombre o persona" autocomplete="off" value="${esc(busqueda)}">
    <div class="slr-rejilla">
      ${cartas.map(c => `
        <button class="slr-ficha" type="button" data-id="${esc(c.id)}" ${coincideBusqueda(c, busqueda) ? '' : 'hidden'}>
          ${cartaHTML(c, { tam: 's', tocada: estaTocada(c), blindada: !!c.blindada_hasta, enVenta: !!c.en_venta, destacar: ORDENES[orden] })}
          <span class="slr-ficha__datos">
            <span><small>Valor</small><b>${miles(c.valor)}</b></span>
            <span><small>Cláusula</small><b>${miles(c.clausula)}</b></span>
          </span>
          ${c.energia != null ? `<span class="slr-ficha__energia">${barraEnergia(c.energia, { aviso: true })}</span>` : ''}
          <span class="slr-ficha__chips">${chipsEstado(c)}</span>
        </button>`).join('')}
    </div>
    <p class="slr-suave" data-sin-resultados ${cartas.some(c => coincideBusqueda(c, busqueda)) ? 'hidden' : ''}>Ninguna carta con esa búsqueda.</p>` : '<div class="slr-vacio"><b>No tienes cartas</b><p>Consíguelas en el mercado cuando abra.</p></div>'}`;

  cont.querySelectorAll('[data-orden]').forEach(b => b.addEventListener('click', () => {
    orden = b.dataset.orden;
    pintar(cont, ctx);
  }));
  cont.querySelectorAll('.slr-ficha').forEach(b => b.addEventListener('click', () => abrirDetalle(b.dataset.id, ctx)));
  // Al escribir solo se ocultan las que no coinciden (sin repintar: no se pierde el foco)
  const porId = new Map(cartas.map(c => [c.id, c]));
  cont.querySelector('[data-buscar]')?.addEventListener('input', e => {
    busqueda = e.target.value;
    let alguna = false;
    cont.querySelectorAll('.slr-ficha').forEach(b => { const si = coincideBusqueda(porId.get(b.dataset.id), busqueda); b.hidden = !si; alguna ||= si; });
    cont.querySelector('[data-sin-resultados]').hidden = alguna;
  });
}
