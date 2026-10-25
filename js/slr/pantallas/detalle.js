/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — detalle de carta (hoja a pantalla completa)
   Carta grande, stats en barras, poderes explicados, valor, cláusula, dueño
   e historial. Si es tuya: cambiar el multiplicador de la cláusula (con el
   coste de subirla antes de confirmar), ponerla en venta (o retirarla) y
   vender al banco. Si es de otro: hacer una oferta, proponer un intercambio
   y pagar su cláusula (si no está blindada; si lo está, cuánto le queda).
   Toda adquisición pasa antes por «Haz hueco».
═══════════════════════════════════════════════ */
import { rpc, leer, accion } from '../api.js';
import { esc, miles, monedas, hoja, cerrarCapa, confirmar, conEspera, toast, fechaCorta, diaHora, faltan } from '../ui.js';
import { cartaHTML, normalizarCarta, describirPoder, lineaCarta } from '../carta.js';
import { estaTocada, configLiga, motivoCierre } from '../rush.js';
import { chipsEstado } from './plantilla.js';
import { abrirEditorCarta } from './editor-carta.js';
import { TACTICA, ESTAMINA, barraEnergia } from '../tactica.js';
import { asegurarHueco } from '../hueco.js';
import { hojaImporte } from './mercado.js';

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

// Motor v2: energía (del ejemplar), estamina y táctica favorita (del diseño)
export function rasgosCarta(c) {
  const est = ESTAMINA[c.estamina], fav = TACTICA[c.tactica_favorita];
  if (!est && c.energia == null) return '';
  return `<div class="slr-cifras slr-detalle__rasgos">
    ${c.energia != null ? `<div><small>Energía</small>${barraEnergia(c.energia, { aviso: true })}</div>` : ''}
    ${est ? `<div><small>Estamina</small><b>${est.icono} ${est.nombre}</b><em>−${est.gasto} por partido</em></div>` : ''}
    <div><small>Táctica favorita</small><b>${fav ? `${fav.icono} ${esc(fav.nombre)}` : 'Ninguna'}</b>${fav ? '<em>+5 % si su equipo la juega</em>' : ''}</div>
  </div>`;
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
  const cerrado = !!motivoCierre();

  const el = hoja(`
    <div class="slr-detalle">
      <div class="slr-detalle__carta">${cartaHTML(c, { tam: 'l', ancho: 300, tocada: propia && estaTocada(propia) })}</div>
      <div class="slr-detalle__info">
        <p class="slr-detalle__tipo">${lineaCarta(c)}</p>
        ${propia ? `<div class="slr-ficha__chips">${chipsEstado(propia)}</div>` : ''}
        <div class="slr-stats">${barras(c)}</div>
        ${rasgosCarta(c)}
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

          <h3 class="slr-subtitulo">Venta</h3>
          ${info.en_venta
            ? `<p class="slr-suave">En venta por <b>${miles(info.en_venta.precio)}</b>.</p>
               <button class="slr-btn slr-btn--fantasma" type="button" data-retirar-venta ${cerrado ? 'disabled' : ''}>Retirar de la venta</button>`
            : `<p class="slr-suave">Ponla a precio fijo: la compra el primero que la quiera (pagas un ${Math.round((cfg.impuesto_compraventa ?? 0.05) * 100)} % de impuesto al venderla).</p>
               <div class="slr-fila-accion"><input class="slr-input" type="number" inputmode="numeric" min="1" step="10" value="${Math.ceil(c.valor * 1.2 / 10) * 10}" data-precio-venta>
               <button class="slr-btn" type="button" data-poner-venta ${cerrado ? 'disabled' : ''}>Poner en venta</button></div>`}

          <h3 class="slr-subtitulo">Vender al banco</h3>
          <p class="slr-suave">El banco paga el ${Math.round((cfg.venta_banco ?? 0.6) * 100)} % del valor, al momento.</p>
          <button class="slr-btn slr-btn--peligro" type="button" data-vender>Vender por ${miles(precioBanco)}</button>` : ''}

        ${!esMia && info.dueno ? `
          <h3 class="slr-subtitulo">Fichar</h3>
          ${cerrado ? '<p class="slr-suave">🔒 El mercado está cerrado ahora mismo.</p>' : ''}
          <div class="slr-botones slr-detalle__fichar">
            <button class="slr-btn" type="button" data-ofertar ${cerrado ? 'disabled' : ''}>Hacer oferta</button>
            <button class="slr-btn slr-btn--fantasma" type="button" data-intercambio ${cerrado ? 'disabled' : ''}>Proponer intercambio</button>
          </div>
          ${info.blindada
            ? `<p class="slr-suave slr-detalle__blindada">🛡 Blindada: no se puede pagar su cláusula hasta dentro de <b>${esc(faltan(info.blindada_hasta))}</b>.</p>`
            : `<button class="slr-btn slr-btn--peligro" type="button" data-pagar-clausula ${cerrado ? 'disabled' : ''}>Pagar cláusula · ${miles(info.clausula)}</button>`}` : ''}

        ${puedeEditar ? '<button class="slr-btn slr-btn--pruebas slr-detalle__editar" type="button" data-editar-carta>✎ Editar carta (modo pruebas)</button>' : ''}

        <h3 class="slr-subtitulo">Historial</h3>
        ${info.historial.length ? `<ul class="slr-historial">${info.historial.slice().reverse().map(h => `
          <li><span>${esc(h.texto)}</span><time>${esc(fechaCorta(h.fecha))}</time></li>`).join('')}</ul>`
          : '<p class="slr-suave">Sin movimientos todavía.</p>'}
      </div>
    </div>`, { titulo: c.nombre, completa: true });

  el.querySelector('[data-editar-carta]')?.addEventListener('click', () =>
    abrirEditorCarta(ctx, { disenoId: info.diseno_id }).catch(e => toast(e.message, 'error')));

  const tras = async () => { await ctx.recargar('yo', 'cartas', 'alineacion'); cerrarCapa(); ctx.pintar(); await ctx.alCambiarMercado?.(); };
  if (!esMia) {
    if (info.dueno) enlazarFichar(el, c, info, ctx, tras);
    return;
  }
  el.querySelector('[data-poner-venta]')?.addEventListener('click', e => {
    const precio = Math.round(Number(el.querySelector('[data-precio-venta]').value));
    if (!(precio >= 1)) { toast('Pon un precio', 'error'); return; }
    conEspera(e.currentTarget, async () => {
      await accion('slr_poner_en_venta', { carta_id: c.id, precio });
      toast(`${c.nombre} en venta por ${miles(precio)}`, 'ok');
      await tras();
    }).catch(() => {});
  });
  el.querySelector('[data-retirar-venta]')?.addEventListener('click', e => conEspera(e.currentTarget, async () => {
    await accion('slr_retirar_venta', { venta_id: info.en_venta.venta_id });
    toast(`${c.nombre} ya no está en venta`, 'ok');
    await tras();
  }).catch(() => {}));

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
      const r = await accion('slr_cambiar_clausula', { carta_id: c.id, multiplicador: mult });
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
      await accion('slr_vender_banco', { carta_id: c.id });
      toast(`${c.nombre} vendida por ${miles(precioBanco)}`, 'ok');
      await ctx.recargar('yo', 'cartas', 'alineacion');
      cerrarCapa();
      ctx.pintar();
    }).catch(() => {});
  });
}

/* ── Fichar una carta ajena: oferta, intercambio y cláusula ─────────────── */
function enlazarFichar(el, c, info, ctx, tras) {
  const imp = configLiga().impuesto_compraventa ?? 0.05;
  el.querySelector('[data-ofertar]')?.addEventListener('click', async e => {
    const boton = e.currentTarget;
    const v = await hojaImporte({ titulo: `Oferta por ${c.nombre}`,
      texto: `Ofreces a <b>${esc(info.dueno.usuario ?? info.dueno.equipo)}</b> por <b>${esc(c.nombre)}</b> (valor ${miles(c.valor)}).
        El dinero no sale de tu saldo hasta que la acepte.`,
      valor: Math.ceil(c.valor * 1.1 / 10) * 10, ok: 'Enviar oferta',
      impuesto: x => `Si la acepta, recibe ${miles(Math.round(x * (1 - imp)))} (−${Math.round(imp * 100)} % de impuesto).` });
    if (v == null || !(await asegurarHueco(ctx, 1, { que: 'ofertar' }))) return;
    await conEspera(boton, async () => {
      await accion('slr_ofertar', { carta_id: c.id, importe: v });
      toast(`Oferta de ${miles(v)} enviada`, 'ok');
      await tras();
    }).catch(() => {});
  });
  el.querySelector('[data-pagar-clausula]')?.addEventListener('click', async e => {
    const boton = e.currentTarget;
    const ok = await confirmar({ titulo: 'Pagar cláusula',
      texto: `Pagas <b>${miles(info.clausula)}</b> y <b>${esc(c.nombre)}</b> pasa a ser tuya al momento, quiera o no ${esc(info.dueno.usuario ?? 'su dueño')}.`,
      ok: `Pagar ${miles(info.clausula)}`, peligro: true });
    if (!ok || !(await asegurarHueco(ctx, 1, { que: 'clausularla' }))) return;
    await conEspera(boton, async () => {
      await accion('slr_pagar_clausula', { carta_id: c.id });
      toast(`${c.nombre} es tuya`, 'ok');
      await tras();
    }).catch(() => {});
  });
  el.querySelector('[data-intercambio]')?.addEventListener('click', () => hojaIntercambio(c, info, ctx, tras).catch(() => {}));
}

// Intercambio: tus cartas y monedas por las suyas (y sus monedas), con el impuesto visible
async function hojaIntercambio(c, info, ctx, tras) {
  const imp = configLiga().impuesto_compraventa ?? 0.05;
  const suyas = (await leer(`cartas?select=id,diseno_id,equipo_id,energia,disenos_carta(nombre,tipo,acabado,color,tier,rareza,coleccion_id,perfil,personas,ata,def,con,valor,poderes,imagen_url,texto,estamina,tactica_favorita)&equipo_id=eq.${info.dueno.equipo_id}`))
    .map(normalizarCarta).sort((a, b) => b.ovr - a.ovr);
  const mias = [...ctx.datos.cartas].sort((a, b) => b.ovr - a.ovr);
  const sel = { mias: new Set(), suyas: new Set([c.id]) };
  const fila = (x, lado) => `<button type="button" class="slr-ic ${sel[lado].has(x.id) ? 'es-elegida' : ''}" data-ic="${lado}:${esc(x.id)}">
    ${cartaHTML(x, { tam: 'xs', ancho: 56 })}<span><b>${esc(x.nombre)}</b><small>OVR ${x.ovr} · ${miles(x.valor)}</small></span></button>`;
  const el = hoja(`<div class="slr-intercambio-hoja" data-hoja-intercambio>
      <div class="slr-intercambio-hoja__lados">
        <section><h3 class="slr-subtitulo">Das</h3><div data-lado="mias">${mias.map(x => fila(x, 'mias')).join('')}</div>
          <label class="slr-campo"><span>+ monedas tuyas</span><input class="slr-input" type="number" min="0" step="10" value="0" data-monedas="mias"></label></section>
        <section><h3 class="slr-subtitulo">Recibes de ${esc(info.dueno.usuario ?? info.dueno.equipo)}</h3><div data-lado="suyas">${suyas.map(x => fila(x, 'suyas')).join('')}</div>
          <label class="slr-campo"><span>+ monedas suyas</span><input class="slr-input" type="number" min="0" step="10" value="0" data-monedas="suyas"></label></section>
      </div>
      <p class="slr-intercambio-hoja__resumen" data-resumen-ic></p>
      <button class="slr-btn slr-btn--grande" type="button" data-enviar-ic>Proponer intercambio</button>
    </div>`, { titulo: 'Proponer intercambio', completa: true });
  const resumen = () => {
    const mm = Math.max(0, Math.round(Number(el.querySelector('[data-monedas="mias"]').value) || 0));
    const ms = Math.max(0, Math.round(Number(el.querySelector('[data-monedas="suyas"]').value) || 0));
    el.querySelector('[data-resumen-ic]').innerHTML = `Das <b>${sel.mias.size}</b> ${sel.mias.size === 1 ? 'carta' : 'cartas'}${mm ? ` y ${miles(mm)}` : ''};
      recibes <b>${sel.suyas.size}</b>${ms ? ` y ${miles(ms)} (te llegan ${miles(Math.round(ms * (1 - imp)))} tras el ${Math.round(imp * 100)} % de impuesto)` : ''}.
      ${mm ? `A la otra parte le llegan ${miles(Math.round(mm * (1 - imp)))} de tus ${miles(mm)}.` : ''}`;
    return { mm, ms };
  };
  el.querySelectorAll('[data-ic]').forEach(b => b.addEventListener('click', () => {
    const [lado, id] = b.dataset.ic.split(':');
    sel[lado].has(id) ? sel[lado].delete(id) : sel[lado].add(id);
    b.classList.toggle('es-elegida', sel[lado].has(id));
    resumen();
  }));
  el.querySelectorAll('[data-monedas]').forEach(i => i.addEventListener('input', resumen));
  resumen();
  el.querySelector('[data-enviar-ic]').addEventListener('click', async e => {
    const boton = e.currentTarget, { mm, ms } = resumen();
    if (!sel.mias.size || !sel.suyas.size) { toast('Elige al menos una carta de cada lado', 'error'); return; }
    if (!(await asegurarHueco(ctx, Math.max(0, sel.suyas.size - sel.mias.size), { que: 'el intercambio' }))) return;
    await conEspera(boton, async () => {
      await accion('slr_proponer_intercambio', { equipo_id: info.dueno.equipo_id, cartas_mias: [...sel.mias], cartas_suyas: [...sel.suyas],
        monedas_mias: mm, monedas_suyas: ms });
      toast('Intercambio propuesto', 'ok');
      cerrarCapa();
      await tras();
    }).catch(() => {});
  });
}
