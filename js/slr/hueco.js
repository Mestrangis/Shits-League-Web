/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — «Haz hueco»
   · Antes de una adquisición en la que sabes qué carta entra (pujar, comprar,
     ofertar, clausular, intercambiar), una hoja con tus cartas y lo que te da
     el banco por cada una (60 % del valor). Eliges una, confirmas la venta y
     la operación original sigue. asegurarHueco(ctx, n) → true si ya cabe (o
     tras vender), false si se cancela.
   · Los sobres se abren aunque te pases: al terminar, abrirHacerHueco() enseña
     TODAS tus cartas (las del sobre marcadas «¡NUEVA!») y eliges cuáles vender
     hasta quedarte en el máximo (slr_hacer_hueco, todas de una vez). Mientras
     sobren, el servidor no deja hacer otras operaciones ni tocar la alineación;
     la hoja reaparece en cualquier pantalla (rush.js).
═══════════════════════════════════════════════ */
import { rpc } from './api.js';
import { esc, miles, monedas, hoja, cerrarHasta, confirmar, toast } from './ui.js';
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

// Tras un sobre que te deja con cartas de más: elige cuáles vender (varias)
let abiertaHacerHueco = false;
export function abrirHacerHueco(ctx, { sobran, maxima = plantillaMaxima(), nuevas = [] }, { alTerminar } = {}) {
  if (abiertaHacerHueco || !(sobran > 0)) return;
  abiertaHacerHueco = true;
  const pct = configLiga().venta_banco ?? 0.6;
  const esNueva = new Set(nuevas);
  const cartas = [...ctx.datos.cartas].sort((a, b) => (esNueva.has(b.id) - esNueva.has(a.id)) || a.valor - b.valor || a.ovr - b.ovr);
  const elegidas = new Set();
  const el = hoja(`
    <div class="slr-hueco-hoja slr-hueco-hoja--sobre" data-hacer-hueco>
      <p class="slr-confirmar__texto">Tienes <b>${ctx.datos.cartas.length}</b> cartas y el máximo es ${maxima}: elige al menos
        <b>${sobran}</b> para vender al banco (te paga el ${Math.round(pct * 100)} % de su valor). Puedes quedarte con las nuevas y vender otras.</p>
      <p class="slr-suave">Hasta que hagas hueco no puedes hacer otras operaciones de mercado ni cambiar la alineación. Si llega el cierre
        de la jornada sin hacerlo, el banco se queda con las de menos valor.</p>
      <ul class="slr-lista-cartas slr-hueco-hoja__lista">
        ${cartas.map(c => `<li><button type="button" class="slr-hueco-hoja__fila" data-elegir-venta="${esc(c.id)}" aria-pressed="false">
          <span class="slr-hueco-hoja__marca" aria-hidden="true"></span>
          ${cartaHTML(c, { tam: 'xs', ancho: 56 })}
          <span class="slr-lista-cartas__texto"><b>${esc(c.nombre)}</b>
            <span class="slr-lista-cartas__stats">OVR ${c.ovr} · valor ${miles(c.valor)}</span>
            ${esNueva.has(c.id) ? '<b class="slr-nueva">¡NUEVA!</b>' : ''}</span>
          <span class="slr-lista-cartas__stat"><b>${miles(Math.round(c.valor * pct))}</b><small>banco</small></span>
        </button></li>`).join('')}
      </ul>
      <div class="slr-hueco-hoja__pie"><span data-resumen-hueco></span>
        <button class="slr-btn slr-btn--grande slr-btn--peligro" type="button" data-vender-elegidas disabled>Vender</button></div>
    </div>`, { titulo: 'Haz hueco', alCerrar: () => { abiertaHacerHueco = false; alTerminar?.(); } });
  const boton = el.querySelector('[data-vender-elegidas]');
  const pintar = () => {
    const total = cartas.filter(c => elegidas.has(c.id)).reduce((x, c) => x + Math.round(c.valor * pct), 0);
    const faltan = Math.max(0, sobran - elegidas.size);
    el.querySelector('[data-resumen-hueco]').innerHTML = faltan
      ? `Elige ${faltan} ${faltan === 1 ? 'más' : 'más'} (${elegidas.size}/${sobran})`
      : `${elegidas.size} ${elegidas.size === 1 ? 'carta' : 'cartas'} · cobras ${monedas(total)}`;
    boton.disabled = faltan > 0;
    boton.textContent = faltan ? 'Vender' : `Vender ${elegidas.size} por ${miles(total)}`;
  };
  el.querySelectorAll('[data-elegir-venta]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.elegirVenta;
    elegidas.has(id) ? elegidas.delete(id) : elegidas.add(id);
    b.setAttribute('aria-pressed', String(elegidas.has(id)));
    b.classList.toggle('es-elegida', elegidas.has(id));
    pintar();
  }));
  boton.addEventListener('click', async () => {
    const lista = cartas.filter(c => elegidas.has(c.id));
    const ok = await confirmar({ titulo: 'Vender al banco',
      texto: `Vendes ${lista.map(c => `<b>${esc(c.nombre)}</b>`).join(', ')} al banco. No se puede deshacer.`, ok: boton.textContent, peligro: true });
    if (!ok) return;
    try {
      const r = await rpc('slr_hacer_hueco', { liga_id: ctx.datos.liga.id, cartas: lista.map(c => c.id) });
      toast(`${r.vendidas} ${r.vendidas === 1 ? 'carta vendida' : 'cartas vendidas'} por ${miles(r.cobrado)}`, 'ok');
      await ctx.recargar('yo', 'cartas', 'alineacion');
      ctx.datos.huecoPendiente = null;
      cerrarHasta(el);
    } catch { /* el toast ya lo ha dicho */ }
  });
  pintar();
}
