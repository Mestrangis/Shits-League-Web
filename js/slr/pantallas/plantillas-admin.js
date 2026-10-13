/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — herramienta de plantillas (modo pruebas, solo admin)
   Buscar cualquier carta de la liga por nombre y darla a un equipo o dejarla
   libre. Todo pasa por slr_admin_mover_carta, que respeta el límite de 15,
   apunta la entrada del álbum (vía 'admin'), la quita de alineaciones, cancela
   ventas, ofertas, intercambios y subastas y lo deja en el historial: no hay
   que tocar las tablas cartas o equipos a mano.
═══════════════════════════════════════════════ */
import { rpc, leer } from '../api.js';
import { esc, hoja, cerrarCapa, conEspera, toast, miles } from '../ui.js';
import { cartaHTML, normalizarCarta } from '../carta.js';

export async function abrirPlantillas(ctx) {
  const liga = ctx.datos.liga.id;
  const equipos = await leer(`equipos?select=id,nombre&liga_id=eq.${liga}&order=nombre`);
  const el = hoja(`
    <form class="slr-buscador" data-buscar>
      <input class="slr-input" name="texto" placeholder="Buscar carta por nombre" autocomplete="off">
      <button class="slr-btn" type="submit">Buscar</button>
    </form>
    <ul class="slr-plantillas" data-resultados></ul>`, { titulo: 'Plantillas (modo pruebas)', completa: true });
  const lista = el.querySelector('[data-resultados]');
  const form = el.querySelector('[data-buscar]');

  async function buscar() {
    const r = await rpc('slr_admin_buscar_cartas', { liga_id: liga, texto: form.texto.value });
    lista.innerHTML = r.map(c => {
      const carta = normalizarCarta(c);
      return `<li class="slr-plantillas__fila" data-carta="${esc(c.id)}">
        <div class="slr-plantillas__carta">${cartaHTML(carta, { tam: 'xs', destacar: 'ATA' })}</div>
        <span class="slr-lista-cartas__texto"><b>${esc(c.nombre)}</b>
          <span class="slr-lista-cartas__stats">OVR ${carta.ovr} · ATA ${c.ata} · DEF ${c.def} · CON ${c.con} · ${miles(c.valor)}</span>
          <small class="${c.equipo_id ? '' : 'slr-propio'}">${c.equipo_id ? `En ${esc(c.equipo)}` : 'Libre'}</small></span>
        <span class="slr-plantillas__acciones">
          <button class="slr-btn slr-btn--mini" type="button" data-dar>Dar a…</button>
          ${c.equipo_id ? '<button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-libre>Dejar libre</button>' : ''}
        </span>
      </li>`;
    }).join('') || '<li class="slr-suave">Ninguna carta con ese nombre.</li>';
    lista.querySelectorAll('[data-dar]').forEach(b => b.addEventListener('click', () => elegirEquipo(b.closest('[data-carta]').dataset.carta)));
    lista.querySelectorAll('[data-libre]').forEach(b => b.addEventListener('click', () => conEspera(b, async () => {
      const r2 = await rpc('slr_admin_mover_carta', { liga_id: liga, carta_id: b.closest('[data-carta]').dataset.carta, equipo_id: null });
      toast(`${r2.nombre} queda libre`, 'ok');
      await despues();
    }).catch(() => {})));
  }

  function elegirEquipo(cartaId) {
    const h = hoja(`<ul class="slr-lista-cartas">${equipos.map(e => `
      <li><button type="button" data-equipo="${esc(e.id)}"><span class="slr-lista-cartas__texto"><b>${esc(e.nombre)}</b></span></button></li>`).join('')}</ul>`,
    { titulo: 'Dar a…' });
    h.querySelectorAll('[data-equipo]').forEach(b => b.addEventListener('click', () => conEspera(b, async () => {
      const r = await rpc('slr_admin_mover_carta', { liga_id: liga, carta_id: cartaId, equipo_id: b.dataset.equipo });
      toast(`${r.nombre} → ${r.ahora}`, 'ok');
      cerrarCapa();
      await despues();
    }).catch(() => {})));
  }

  // Lo propio puede haber cambiado (plantilla, alineación, saldo): se recarga
  async function despues() {
    await ctx.recargar('cartas', 'alineacion');
    await buscar();
  }

  form.addEventListener('submit', e => { e.preventDefault(); conEspera(form.querySelector('button'), buscar).catch(() => {}); });
  await buscar();
}
