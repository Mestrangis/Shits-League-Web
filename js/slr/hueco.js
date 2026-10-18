/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — «Haz hueco»
   Antes de cualquier adquisición que te dejaría con más cartas de las
   permitidas (pujar, comprar, ofertar, clausular, intercambiar, abrir un
   sobre), una hoja con tus cartas y lo que te da el banco por cada una (60 %
   del valor). Eliges una, confirmas la venta y la operación original sigue.
   asegurarHueco(ctx, n) → true si ya cabe (o tras vender), false si se cancela.
═══════════════════════════════════════════════ */
import { rpc } from './api.js';
import { esc, miles, hoja, cerrarHasta, confirmar, toast } from './ui.js';
import { cartaHTML } from './carta.js';
import { configLiga } from './rush.js';

// Cartas que ocupan la plantilla: las tuyas y, si hay, la elección de sobre pendiente
export function plantillaOcupada(ctx) {
  return ctx.datos.cartas.length + (ctx.datos.sobrePendiente ? 1 : 0);
}
export const plantillaMaxima = () => configLiga().plantilla_maxima ?? 15;

export async function asegurarHueco(ctx, n = 1, { que = 'esta operación' } = {}) {
  while (plantillaOcupada(ctx) + n > plantillaMaxima()) {
    const falta = plantillaOcupada(ctx) + n - plantillaMaxima();
    const vendida = await elegirVenta(ctx, falta, que);
    if (!vendida) return false;
  }
  return true;
}

function elegirVenta(ctx, falta, que) {
  const pct = configLiga().venta_banco ?? 0.6;
  const cartas = [...ctx.datos.cartas].sort((a, b) => a.valor - b.valor || a.ovr - b.ovr);
  return new Promise(resolve => {
    let hecho = false;
    const el = hoja(`
      <div class="slr-hueco-hoja" data-haz-hueco>
        <p class="slr-confirmar__texto">Tienes la plantilla llena (${plantillaOcupada(ctx)}/${plantillaMaxima()}).
          Para ${esc(que)} necesitas ${falta === 1 ? 'un hueco' : `${falta} huecos`}: vende ${falta === 1 ? 'una carta' : 'cartas'} al banco
          (te paga el ${Math.round(pct * 100)} % de su valor).</p>
        <ul class="slr-lista-cartas slr-hueco-hoja__lista">
          ${cartas.map(c => `<li><button type="button" data-vender-id="${esc(c.id)}">
            ${cartaHTML(c, { tam: 'xs', ancho: 56 })}
            <span class="slr-lista-cartas__texto"><b>${esc(c.nombre)}</b>
              <span class="slr-lista-cartas__stats">OVR ${c.ovr} · valor ${miles(c.valor)}</span>
              ${c.en_venta ? '<small>En venta: se retira</small>' : ''}</span>
            <span class="slr-lista-cartas__stat"><b>${miles(Math.round(c.valor * pct))}</b><small>banco</small></span>
          </button></li>`).join('')}
        </ul>
      </div>`, { titulo: 'Haz hueco', alCerrar: () => resolve(hecho) });   // al cerrar (tras el historial): la siguiente hoja no se cierra con esta
    el.querySelectorAll('[data-vender-id]').forEach(b => b.addEventListener('click', async () => {
      const c = cartas.find(x => x.id === b.dataset.venderId);
      const precio = Math.round(c.valor * pct);
      const ok = await confirmar({ titulo: 'Vender al banco',
        texto: `Vendes a <b>${esc(c.nombre)}</b> por <b>${miles(precio)}</b> para hacer hueco. No se puede deshacer.`,
        ok: `Vender por ${miles(precio)}`, peligro: true });
      if (!ok) return;
      try {
        await rpc('slr_vender_banco', { carta_id: c.id });
        toast(`${c.nombre} vendida por ${miles(precio)}`, 'ok');
        await ctx.recargar('yo', 'cartas', 'alineacion');
        hecho = true;
        cerrarHasta(el);
      } catch { /* el toast ya lo ha dicho */ }
    }));
  });
}
