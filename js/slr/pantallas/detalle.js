/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — detalle de carta (hoja a pantalla completa)
   Carta grande, stats en barras, poderes explicados, valor, cláusula, dueño
   e historial. Si es tuya: cambiar el multiplicador de la cláusula (con el
   coste de subirla antes de confirmar) y vender al banco.
═══════════════════════════════════════════════ */
import { rpc } from '../api.js';
import { esc, miles, monedas, hoja, cerrarCapa, confirmar, conEspera, toast, fechaCorta, diaHora } from '../ui.js';
import { cartaHTML, normalizarCarta, describirPoder, TIPOS, ACABADOS } from '../carta.js';
import { estaTocada, configLiga } from '../rush.js';
import { chipsEstado } from './plantilla.js';
import { abrirEditorCarta } from './editor-carta.js';

export const barras = c => [['ATA', c.ata], ['DEF', c.def], ['CON', c.con]].map(([k, v]) => `
  <div class="slr-barra-stat">
    <span>${k}</span><div><i style="width:${Math.min(100, v)}%"></i></div><b>${v}</b>
  </div>`).join('');

export function poderes(lista) {
  if (!lista.length) return '<p class="slr-suave">Sin poderes.</p>';
  return `<ul class="slr-poderes">${lista.map(describirPoder).map(p => `
    <li>
      <div class="slr-poderes__cabeza"><b>${esc(p.nombre)}</b><span>${esc(p.corto)}</span></div>
      <p>${esc(p.momento)}: ${esc(p.efecto)}.</p>
      <small>${esc(p.probabilidad)}</small>
    </li>`).join('')}</ul>`;
}

export async function abrirDetalle(cartaId, ctx) {
  const { datos } = ctx;
  const propia = datos.cartas.find(c => c.id === cartaId);
  const info = await rpc('slr_carta', { carta_id: cartaId });
  const c = { ...normalizarCarta(info), ...(propia ?? {}) };
  const esMia = info.dueno?.equipo_id === datos.equipo?.id;
  const cfg = configLiga();
  const cl = cfg.clausula ?? {};
  const [mMin, mMax, paso, costeSubida] = [cl.multiplicador_min ?? 1.5, cl.multiplicador_max ?? 3, cl.paso ?? 0.1, cl.coste_subida ?? 0.2];
  const precioBanco = Math.round(c.valor * (cfg.venta_banco ?? 0.6));
  const puedeEditar = !!datos.liga?.es_admin && cfg.modo_beta === true && !!info.diseno_id;

  const el = hoja(`
    <div class="slr-detalle">
      <div class="slr-detalle__carta">${cartaHTML(c, { tam: 'l', ancho: 300, tocada: propia && estaTocada(propia) })}</div>
      <div class="slr-detalle__info">
        <p class="slr-detalle__tipo">${esc(TIPOS[c.tipo])}${c.acabado !== 'normal' ? ` · <span class="slr-acabado-${esc(c.acabado)}">${esc(ACABADOS[c.acabado])}</span>` : ''}</p>
        ${propia ? `<div class="slr-ficha__chips">${chipsEstado(propia)}</div>` : ''}
        <div class="slr-stats">${barras(c)}</div>
        <div class="slr-cifras">
          <div><small>Valor</small><b>${monedas(c.valor)}</b></div>
          <div><small>Cláusula</small><b>${info.clausula != null ? monedas(info.clausula) : '—'}</b>
            ${info.multiplicador_clausula ? `<em>×${String(info.multiplicador_clausula).replace('.', ',')}</em>` : ''}</div>
          <div><small>Dueño</small><b class="${esMia ? 'slr-propio' : 'slr-rival'}">${info.dueno ? esc(info.dueno.equipo) : 'Libre'}</b>
            ${info.dueno ? `<em>${esc(info.dueno.usuario ?? '')}</em>` : ''}</div>
        </div>
        ${info.blindada ? `<p class="slr-suave">Blindada hasta el ${esc(diaHora(info.blindada_hasta))}: nadie puede pagar su cláusula.</p>` : ''}
        ${c.texto ? `<p class="slr-detalle__texto">${esc(c.texto)}</p>` : ''}

        <h3 class="slr-subtitulo">Poderes</h3>
        ${poderes(c.poderes)}

        ${esMia ? `
          <h3 class="slr-subtitulo">Cláusula</h3>
          <div class="slr-clausula">
            <button class="slr-paso" type="button" data-menos aria-label="Bajar multiplicador">−</button>
            <div class="slr-clausula__valor"><b data-mult></b><small data-clausula></small></div>
            <button class="slr-paso" type="button" data-mas aria-label="Subir multiplicador">+</button>
          </div>
          <p class="slr-clausula__coste" data-coste></p>
          <button class="slr-btn" type="button" data-guardar-clausula disabled>Cambiar cláusula</button>

          <h3 class="slr-subtitulo">Vender al banco</h3>
          <p class="slr-suave">El banco paga el ${Math.round((cfg.venta_banco ?? 0.6) * 100)} % del valor, al momento.</p>
          <button class="slr-btn slr-btn--peligro" type="button" data-vender>Vender por ${miles(precioBanco)}</button>` : ''}

        ${puedeEditar ? '<button class="slr-btn slr-btn--pruebas slr-detalle__editar" type="button" data-editar-carta>✎ Editar carta (modo pruebas)</button>' : ''}

        <h3 class="slr-subtitulo">Historial</h3>
        ${info.historial.length ? `<ul class="slr-historial">${info.historial.slice().reverse().map(h => `
          <li><span>${esc(h.texto)}</span><time>${esc(fechaCorta(h.fecha))}</time></li>`).join('')}</ul>`
          : '<p class="slr-suave">Sin movimientos todavía.</p>'}
      </div>
    </div>`, { titulo: c.nombre, completa: true });

  el.querySelector('[data-editar-carta]')?.addEventListener('click', () =>
    abrirEditorCarta(ctx, { disenoId: info.diseno_id }).catch(e => toast(e.message, 'error')));

  if (!esMia) return;

  // Multiplicador de cláusula: subir cuesta el 20 % del aumento; bajar es gratis
  const actual = Number(info.multiplicador_clausula);
  let mult = actual;
  const pintarClausula = () => {
    const nueva = Math.round(c.valor * mult), antes = Math.round(c.valor * actual);
    const coste = nueva > antes ? Math.round((nueva - antes) * costeSubida) : 0;
    el.querySelector('[data-mult]').textContent = `×${mult.toFixed(1).replace('.', ',')}`;
    el.querySelector('[data-clausula]').textContent = `${miles(nueva)} de cláusula`;
    el.querySelector('[data-coste]').innerHTML = mult === actual ? 'Sube la cláusula para que sea más caro quitártela.'
      : coste ? `Subirla cuesta <b>${miles(coste)}</b> (el 20 % del aumento, para el banco).` : 'Bajarla es gratis.';
    el.querySelector('[data-guardar-clausula]').disabled = mult === actual;
    el.querySelector('[data-menos]').disabled = mult <= mMin + 1e-9;
    el.querySelector('[data-mas]').disabled = mult >= mMax - 1e-9;
    return coste;
  };
  pintarClausula();
  el.querySelector('[data-menos]').addEventListener('click', () => { mult = Math.max(mMin, Math.round((mult - paso) * 10) / 10); pintarClausula(); });
  el.querySelector('[data-mas]').addEventListener('click', () => { mult = Math.min(mMax, Math.round((mult + paso) * 10) / 10); pintarClausula(); });
  el.querySelector('[data-guardar-clausula]').addEventListener('click', async e => {
    const boton = e.currentTarget;   // después de un await ya no existe
    const coste = pintarClausula();
    const ok = await confirmar({
      titulo: 'Cambiar cláusula',
      texto: `La cláusula de <b>${esc(c.nombre)}</b> pasará a ${miles(Math.round(c.valor * mult))}` +
        (coste ? `. Te cuesta <b>${miles(coste)}</b>.` : '. Es gratis.'),
      ok: coste ? `Pagar ${miles(coste)}` : 'Cambiar',
    });
    if (!ok) return;
    await conEspera(boton, async () => {
      const r = await rpc('slr_cambiar_clausula', { carta_id: c.id, multiplicador: mult });
      toast(`Cláusula de ${c.nombre}: ${miles(r.clausula)}`, 'ok');
      await ctx.recargar('yo', 'cartas');
      cerrarCapa();
      ctx.pintar();
    }).catch(() => {});
  });
  el.querySelector('[data-vender]').addEventListener('click', async e => {
    const boton = e.currentTarget;   // después de un await ya no existe
    const ok = await confirmar({
      titulo: 'Vender al banco',
      texto: `Vendes a <b>${esc(c.nombre)}</b> por <b>${miles(precioBanco)}</b>. La carta queda libre y no se puede deshacer.`,
      ok: `Vender por ${miles(precioBanco)}`, peligro: true,
    });
    if (!ok) return;
    await conEspera(boton, async () => {
      await rpc('slr_vender_banco', { carta_id: c.id });
      toast(`${c.nombre} vendida por ${miles(precioBanco)}`, 'ok');
      await ctx.recargar('yo', 'cartas', 'alineacion');
      cerrarCapa();
      ctx.pintar();
    }).catch(() => {});
  });
}
