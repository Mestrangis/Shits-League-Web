/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — apertura de sobres (versión básica de la fase 3)
   Resumen de las cartas obtenidas y elección pendiente. La animación completa
   llega en la fase 4.
═══════════════════════════════════════════════ */
import { rpc } from '../api.js';
import { esc, miles, hoja, cerrarHasta, toast, faltan } from '../ui.js';
import { cartaHTML, normalizarCarta, RAREZAS } from '../carta.js';

function resumenHTML(cartas) {
  const total = cartas.reduce((s, c) => s + (c.valor ?? 0), 0);
  return `<div class="slr-apertura-resumen" data-resumen-sobre>
    <ul class="slr-apertura-resumen__cartas">${cartas.map(j => {
      const c = normalizarCarta(j);
      return `<li>${cartaHTML(c, { tam: 's', ancho: 130, energia: false })}
        <span>${j.nueva ? '<b class="slr-nueva">¡NUEVA!</b>' : ''}<small class="slr-chip-rareza slr-chip-rareza--${esc(c.rareza)}">${esc(RAREZAS[c.rareza])}</small>
        ${j.coleccion ? `<small>${esc(j.coleccion.nombre)} ${j.coleccion.tengo}/${j.coleccion.total}</small>` : ''}</span></li>`;
    }).join('')}</ul>
    <p class="slr-apertura-resumen__total">Valor total: <b>${miles(total)}</b></p>
  </div>`;
}

export async function abrirApertura(ctx, r, opts = {}) {
  if (r.pendiente_eleccion) return abrirEleccionPendiente(ctx, { sobre_id: r.sobre_id, caduca_en: r.caduca_en, candidatas: r.cartas }, opts);
  hoja(resumenHTML(r.cartas), { titulo: `Sobre ${r.nombre ?? ''}`, alCerrar: () => opts.alTerminar?.() });
}

export function abrirEleccionPendiente(ctx, pend, opts = {}) {
  const el = hoja(`
    <p class="slr-confirmar__texto">Elige una carta. Quedan <b data-cuenta="${esc(pend.caduca_en)}">${faltan(pend.caduca_en)}</b>; si no eliges, te llevas la primera.</p>
    <div class="slr-eleccion">${pend.candidatas.map(j => `<button type="button" data-elegir="${esc(j.id)}">
      ${cartaHTML(normalizarCarta(j), { tam: 's', ancho: 130, energia: false })}${j.nueva ? '<b class="slr-nueva">¡NUEVA!</b>' : ''}</button>`).join('')}</div>`,
  { titulo: 'Sobre de elección', alCerrar: () => opts.alTerminar?.() });
  el.querySelectorAll('[data-elegir]').forEach(b => b.addEventListener('click', async () => {
    try {
      const r = await rpc('slr_elegir_carta_sobre', { sobre_id: pend.sobre_id, carta_id: b.dataset.elegir });
      ctx.datos.sobrePendiente = null;
      toast(`${r.carta.nombre} es tuya`, 'ok');
      await ctx.recargar('yo', 'cartas');
      cerrarHasta(el);
    } catch { /* toast */ }
  }));
}
