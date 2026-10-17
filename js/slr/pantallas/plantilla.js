/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — Plantilla
   Cuadrícula de cartas propias con OVR, stats, valor, cláusula y estado
   (blindada, tocada, en venta) y energía. Orden por OVR, valor, una stat o
   energía. Tocar una carta abre su detalle.
═══════════════════════════════════════════════ */
import { esc, miles, fechaCorta } from '../ui.js';
import { cartaHTML } from '../carta.js';
import { estaTocada, configLiga } from '../rush.js';
import { abrirDetalle } from './detalle.js';
import { barraEnergia } from '../tactica.js';

const ORDENES = { ovr: 'OVR', valor: 'Valor', ata: 'ATA', def: 'DEF', con: 'CON', energia: 'Energía' };
let orden = 'ovr';

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
    ${cartas.length ? `<div class="slr-rejilla">
      ${cartas.map(c => `
        <button class="slr-ficha" type="button" data-id="${esc(c.id)}">
          ${cartaHTML(c, { tam: 's', tocada: estaTocada(c), blindada: !!c.blindada_hasta, enVenta: !!c.en_venta, destacar: ORDENES[orden] })}
          <span class="slr-ficha__datos">
            <span><small>Valor</small><b>${miles(c.valor)}</b></span>
            <span><small>Cláusula</small><b>${miles(c.clausula)}</b></span>
          </span>
          ${c.energia != null ? `<span class="slr-ficha__energia">${barraEnergia(c.energia, { aviso: true })}</span>` : ''}
          <span class="slr-ficha__chips">${chipsEstado(c)}</span>
        </button>`).join('')}
    </div>` : '<div class="slr-vacio"><b>No tienes cartas</b><p>Consíguelas en el mercado cuando abra.</p></div>'}`;

  cont.querySelectorAll('[data-orden]').forEach(b => b.addEventListener('click', () => {
    orden = b.dataset.orden;
    pintar(cont, ctx);
  }));
  cont.querySelectorAll('.slr-ficha').forEach(b => b.addEventListener('click', () => abrirDetalle(b.dataset.id, ctx)));
}
