/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — Mercado
   Sub-pestañas: Subastas · En venta · Ofertas · Sobres.
   · Subastas: las del día con cuenta atrás; hoja de puja (mínima, saldo, puja
     ciega, hueco al resolverse); se marcan las que tienen tu puja.
   · En venta: cartas de otros a precio fijo; comprar con confirmación.
   · Ofertas: recibidas y enviadas (aceptar, rechazar, contraofertar, retirar)
     y lo mismo con los intercambios.
   · Sobres: la tienda (tienda.js).
   Cada carta enseña lo que importa para decidir (rareza, tier, OVR, stats,
   perfil, estamina, táctica favorita, colección y sinergia, energía si tiene
   dueño). Buscador por nombre o persona (sin mayúsculas ni tildes), filtros por
   rareza, colección, perfil y táctica, y orden por precio.
   Con el mercado cerrado, banner con el motivo y todo deshabilitado.
   Toda adquisición pasa antes por «Haz hueco» (hueco.js).
═══════════════════════════════════════════════ */
import { rpc, accion } from '../api.js';
import { esc, miles, monedas, hoja, cerrarCapa, cerrarHasta, confirmar, conEspera, toast, faltan, diaHora } from '../ui.js';
import { cartaHTML, normalizarCarta, RAREZAS, coincideBusqueda } from '../carta.js';
import { listaColecciones, coleccion } from '../colecciones.js';
import { PERFILES } from '../generador.js';
import { TACTICA, ESTAMINA, barraEnergia } from '../tactica.js';
import { asegurarHueco, plantillaOcupada, plantillaMaxima } from '../hueco.js';
import { abrirDetalle } from './detalle.js';
import { pintarTienda } from './tienda.js';
import { fotosDelMercado } from '../precarga-fotos.js';
import { guardar } from '../datos-pantallas.js';

const SUBS = { subastas: 'Subastas', sobres: 'Sobres', venta: 'En venta', ofertas: 'Ofertas' };
const ORDEN_RAREZA = ['comun', 'rara', 'epica', 'legendaria'];
const CIERRE = {
  pausa: ['Liga en pausa', 'El mercado vuelve cuando se reanude la liga.'],
  jornada: ['Jornada en juego', 'El mercado abre de nuevo cuando se publique la jornada.'],
  entre_temporadas: ['Temporada terminada', 'El mercado abre cuando empiece la siguiente.'],
};
let sub = 'subastas';
const filtros = { texto: '', rareza: '', coleccion: '', perfil: '', tactica: '', orden: 'tiempo' };
let reloj = null;
let filtrosAbiertos = null;   // null: abiertos en PC y plegados en el móvil
let vista = null;             // el contenedor del Mercado pintado ahora

/* ── Piezas comunes ─────────────────────────────────────────────────────── */
export function bannerCierre(motivo) {
  if (!motivo) return '';
  const [t, d] = CIERRE[motivo] ?? ['Mercado cerrado', ''];
  return `<div class="slr-banner slr-banner--cierre" data-mercado-cerrado><b>🔒 Mercado cerrado · ${esc(t)}</b><span>${esc(d)}</span></div>`;
}

export function bannerProgresion(p) {
  if (!p?.activa) return '';
  const chips = ORDEN_RAREZA.map(r => `<span class="slr-chip-rareza slr-chip-rareza--${r} ${p.desbloqueadas.includes(r) ? '' : 'es-bloqueada'}">
    ${p.desbloqueadas.includes(r) ? '' : '🔒 '}${RAREZAS[r]}</span>`).join('');
  const sig = p.siguiente ? `Las ${RAREZAS[p.siguiente.rareza].toLowerCase()}s llegan en la jornada ${p.siguiente.jornada}` : '';
  const entran = Object.entries(p.entran ?? {}).filter(([, n]) => n > 0)
    .map(([r, n]) => `${n} ${n === 1 ? RAREZAS[r].toLowerCase() : `${RAREZAS[r].toLowerCase()}s`}`);
  const quedan = Object.entries(p.por_entrar ?? {}).filter(([, n]) => n > 0)
    .map(([r, n]) => `${n} ${RAREZAS[r].toLowerCase()}${n === 1 ? '' : 's'}`);
  return `<div class="slr-progresion" data-progresion>
    <div class="slr-progresion__chips"><small>Jornada ${p.jornada}</small>${chips}</div>
    ${sig ? `<p>⏳ ${esc(sig)}</p>` : ''}
    ${entran.length ? `<p>✨ Esta jornada entran ${entran.join(' y ')} nuevas${quedan.length ? ` (quedan ${quedan.join(' y ')} por entrar)` : ''}</p>` : ''}
  </div>`;
}

// Lo que importa de una carta para decidir, junto a la carta
export function infoCarta(c, ctx, { energia = true } = {}) {
  const est = ESTAMINA[c.estamina], fav = TACTICA[c.tactica_favorita], col = coleccion(c.coleccion_id);
  const mias = col ? ctx.datos.cartas.filter(x => x.coleccion_id === col.id && x.id !== c.id).length : 0;
  return `<div class="slr-minfo">
    <b class="slr-minfo__nombre">${esc(c.nombre)}</b>
    <span class="slr-minfo__linea"><span class="slr-chip-rareza slr-chip-rareza--${esc(c.rareza)}">${esc(RAREZAS[c.rareza] ?? '')}</span>
      <span>Tier ${esc(c.tier ?? '?')} · OVR <b>${c.ovr}</b></span></span>
    <span class="slr-minfo__stats">ATA ${c.ata} · DEF ${c.def} · CON ${c.con}</span>
    <span class="slr-minfo__linea slr-minfo__rasgos">
      ${c.perfil ? `<span>${esc(PERFILES[c.perfil] ?? c.perfil)}</span>` : ''}
      ${est ? `<span title="Estamina">${est.icono} ${est.nombre}</span>` : ''}
      ${fav ? `<span title="Táctica favorita">${fav.icono} ${esc(fav.nombre)}</span>` : ''}
    </span>
    ${col ? `<span class="slr-minfo__col slr-col-${esc(col.color ?? '')}">◆ ${esc(col.nombre)}${mias ? ` <em>· te daría sinergia ×${mias + 1}</em>` : ''}</span>` : ''}
    ${energia && c.energia != null ? barraEnergia(c.energia, { aviso: true }) : ''}
  </div>`;
}

function filaCarta(c, ctx, derecha, { marcada = false, energia = true, atributos = '' } = {}) {
  return `<li class="slr-mitem ${marcada ? 'es-marcada' : ''}" ${atributos}>
    <button class="slr-mitem__carta" type="button" data-detalle="${esc(c.id)}">${cartaHTML(c, { tam: 's', ancho: 120, energia })}</button>
    ${infoCarta(c, ctx, { energia })}
    <div class="slr-mitem__accion">${derecha}</div>
  </li>`;
}

function filtrosHTML() {
  const op = (obj, sel, todos) => `<option value="">${todos}</option>` +
    Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const activos = ['rareza', 'coleccion', 'perfil', 'tactica'].filter(k => filtros[k]).length;
  return `<input class="slr-input slr-mercado__buscar" type="search" data-buscar placeholder="Buscar por nombre o persona" autocomplete="off" value="${esc(filtros.texto)}">
  <details class="slr-mfiltros-plegable" ${filtrosAbiertos ?? (matchMedia('(min-width: 900px)').matches) ? 'open' : ''} data-filtros-plegable>
    <summary>Filtros y orden${activos ? ` <i class="slr-insignia">${activos}</i>` : ''}</summary>
    <div class="slr-filtros slr-mfiltros" data-filtros>
    <label><span>Rareza</span><select class="slr-input" data-f="rareza">${op(RAREZAS, filtros.rareza, 'Todas')}</select></label>
    <label><span>Colección</span><select class="slr-input" data-f="coleccion">${op(Object.fromEntries(listaColecciones().map(k => [k.id, k.nombre])), filtros.coleccion, 'Todas')}</select></label>
    <label><span>Perfil</span><select class="slr-input" data-f="perfil">${op(PERFILES, filtros.perfil, 'Todos')}</select></label>
    <label><span>Táctica favorita</span><select class="slr-input" data-f="tactica">${op(Object.fromEntries(Object.entries(TACTICA).map(([k, t]) => [k, t.nombre])), filtros.tactica, 'Todas')}</select></label>
    <label><span>Orden</span><select class="slr-input" data-f="orden">
      ${[['tiempo', sub === 'subastas' ? 'Cierre' : 'Recientes'], ['precio_asc', 'Precio ↑'], ['precio_desc', 'Precio ↓'], ['ovr', 'OVR']]
        .map(([k, v]) => `<option value="${k}" ${k === filtros.orden ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
  </div></details>`;
}
function filtrar(lista, precio) {
  const r = lista.filter(({ c }) => coincideBusqueda(c, filtros.texto) && (!filtros.rareza || c.rareza === filtros.rareza)
    && (!filtros.coleccion || c.coleccion_id === filtros.coleccion)
    && (!filtros.perfil || c.perfil === filtros.perfil || (c.perfil === 'equilibrado' && filtros.perfil !== 'equilibrado'))
    && (!filtros.tactica || c.tactica_favorita === filtros.tactica));
  if (filtros.orden === 'precio_asc') r.sort((a, b) => precio(a) - precio(b));
  if (filtros.orden === 'precio_desc') r.sort((a, b) => precio(b) - precio(a));
  if (filtros.orden === 'ovr') r.sort((a, b) => b.c.ovr - a.c.ovr);
  return r;
}
const carta = j => normalizarCarta(j);
const deshab = m => (m.cerrado ? 'disabled' : '');

// Acciones de la lista en marcha, por el selector de su botón. Si el Mercado se
// repinta a mitad (al acabar la puja de antes mientras confirmas una compra, p. ej.),
// el botón nuevo sale también en «cargando» y no admite otro toque.
const enCurso = new Set();
const selectorDe = b => { const a = [...b.attributes].find(x => x.name.startsWith('data-')); return `[${a.name}="${CSS.escape(a.value)}"]`; };
function marcarEnCurso() {
  for (const sel of enCurso) vista?.querySelectorAll(sel).forEach(b => {
    if ('estabaDesactivado' in b.dataset) return;
    b.dataset.estabaDesactivado = b.disabled ? '1' : '';
    b.disabled = true;
    b.classList.add('slr-esperando');
  });
}
async function esperar(b, accion) {
  const sel = selectorDe(b);
  if (enCurso.has(sel)) return;
  enCurso.add(sel);
  marcarEnCurso();
  try { return await accion(); } finally {
    enCurso.delete(sel);
    vista?.querySelectorAll(sel).forEach(x => {
      if (!('estabaDesactivado' in x.dataset)) return;
      x.disabled = x.dataset.estabaDesactivado === '1';
      delete x.dataset.estabaDesactivado;
      x.classList.remove('slr-esperando');
    });
  }
}

/* ── Subastas ───────────────────────────────────────────────────────────── */
function vistaSubastas(m, ctx) {
  const lista = filtrar(m.subastas.map(s => ({ s, c: carta(s.carta) })), x => x.s.mi_puja ?? x.s.puja_minima);
  return `${bannerProgresion(m.progresion)}${filtrosHTML()}
    ${lista.length ? `<ul class="slr-mlista">${lista.map(({ s, c }) => filaCarta(c, ctx, `
      <span class="slr-mitem__precio"><small>Puja mínima</small>${monedas(s.puja_minima)}</span>
      <span class="slr-mitem__tiempo" data-cuenta="${esc(s.cierra_en)}">⏱ ${faltan(s.cierra_en)}</span>
      ${s.mi_puja != null ? `<span class="slr-chip slr-chip--mipuja">Tu puja: ${miles(s.mi_puja)}</span>` : ''}
      <button class="slr-btn slr-btn--mini" type="button" data-pujar="${esc(s.id)}" ${deshab(m)}>${s.mi_puja != null ? 'Modificar' : 'Pujar'}</button>`,
      { marcada: s.mi_puja != null, energia: false, atributos: `data-subasta="${esc(s.id)}"` })).join('')}</ul>`
      : `<div class="slr-vacio"><b>${m.subastas.length ? 'Ninguna subasta con estos filtros' : 'No hay subastas abiertas'}</b>
          <p>Cada día a las 00:00 sale una tanda nueva de 8 cartas durante 24 horas.</p></div>`}`;
}

function hojaPuja(s, m, ctx, repintar) {
  const c = carta(s.carta);
  const tengo = plantillaOcupada(ctx), max = plantillaMaxima();
  const el = hoja(`
    <div class="slr-puja" data-hoja-puja>
      <div class="slr-puja__carta">${cartaHTML(c, { tam: 's', ancho: 150, energia: false })}</div>
      ${infoCarta(c, ctx, { energia: false })}
      <div class="slr-cifras">
        <div><small>Puja mínima</small><b>${miles(s.puja_minima)}</b><em>su valor</em></div>
        <div><small>Tu saldo</small><b>${miles(m.saldo)}</b></div>
        <div><small>Cierra</small><b data-cuenta="${esc(s.cierra_en)}">${faltan(s.cierra_en)}</b><em>${esc(diaHora(s.cierra_en))}</em></div>
      </div>
      <label class="slr-campo"><span>${s.mi_puja != null ? 'Tu puja (puedes cambiarla)' : 'Tu puja'}</span>
        <input class="slr-input slr-puja__importe" type="number" inputmode="numeric" min="${s.puja_minima}" step="10" value="${s.mi_puja ?? s.puja_minima}" data-importe></label>
      <div class="slr-puja__rapidos">${[0, 10, 25, 50].map(p => `<button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-mas="${p}">${p ? `+${p} %` : 'Mínima'}</button>`).join('')}</div>
      <ul class="slr-avisos">
        <li>🙈 <b>La puja es ciega:</b> nadie ve cuánto pujas hasta que se resuelve. Gana la más alta.</li>
        <li>📦 <b>Necesitarás hueco al resolverse:</b> ahora tienes ${tengo}/${max}. Si cuando cierre tienes la plantilla llena o no te llega el saldo, tu puja se anula.</li>
      </ul>
      <div class="slr-botones">
        <button class="slr-btn slr-btn--grande" type="button" data-confirmar-puja ${deshab(m)}>${s.mi_puja != null ? 'Modificar puja' : 'Pujar'}</button>
        ${s.mi_puja != null ? `<button class="slr-btn slr-btn--fantasma slr-btn--peligro" type="button" data-retirar-puja ${deshab(m)}>Retirar puja</button>` : ''}
      </div>
    </div>`, { titulo: 'Subasta' });
  const inp = el.querySelector('[data-importe]');
  el.querySelectorAll('[data-mas]').forEach(b => b.addEventListener('click', () => {
    inp.value = Math.ceil((s.puja_minima * (1 + Number(b.dataset.mas) / 100)) / 10) * 10;
  }));
  el.querySelector('[data-confirmar-puja]').addEventListener('click', async e => {
    const boton = e.currentTarget, importe = Math.round(Number(inp.value));
    if (!(importe >= s.puja_minima)) { toast(`La puja mínima es ${miles(s.puja_minima)}`, 'error'); return; }
    if (s.mi_puja == null && !(await asegurarHueco(ctx, 1, { que: 'pujar' }))) return;
    await conEspera(boton, async () => {
      await accion('slr_pujar', { subasta_id: s.id, importe });
      toast(`Puja de ${miles(importe)} por ${c.nombre}`, 'ok');
      cerrarHasta(el);
      await repintar();
    }).catch(() => {});
  });
  el.querySelector('[data-retirar-puja]')?.addEventListener('click', e => conEspera(e.currentTarget, async () => {
    await accion('slr_retirar_puja', { subasta_id: s.id });
    toast('Puja retirada', 'ok');
    cerrarHasta(el);
    await repintar();
  }).catch(() => {}));
}

/* ── En venta ───────────────────────────────────────────────────────────── */
function vistaVenta(m, ctx) {
  const lista = filtrar(m.ventas.map(v => ({ v, c: carta(v.carta) })), x => x.v.precio);
  return `${filtrosHTML()}
    ${lista.length ? `<ul class="slr-mlista">${lista.map(({ v, c }) => filaCarta(c, ctx, `
      <span class="slr-mitem__precio"><small>Precio</small>${monedas(v.precio)}</span>
      <span class="slr-mitem__quien">${v.mia ? '<b class="slr-propio">Tuya</b>' : `de <b class="slr-rival">${esc(v.vendedor.usuario ?? '')}</b>`}</span>
      ${v.mia ? `<button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-retirar-venta="${esc(v.id)}" ${deshab(m)}>Retirar</button>`
        : `<button class="slr-btn slr-btn--mini" type="button" data-comprar="${esc(v.id)}" ${deshab(m) || (m.saldo < v.precio ? 'disabled' : '')}>Comprar</button>`}`,
      { atributos: `data-venta="${esc(v.id)}"` })).join('')}</ul>`
      : `<div class="slr-vacio"><b>${m.ventas.length ? 'Ninguna carta con estos filtros' : 'Nadie vende nada ahora mismo'}</b>
          <p>Pon una carta tuya en venta desde su detalle.</p></div>`}`;
}

async function comprarVenta(v, m, ctx, repintar, boton) {
  const c = carta(v.carta);
  const ok = await confirmar({ titulo: 'Comprar carta',
    texto: `Compras a <b>${esc(c.nombre)}</b> a ${esc(v.vendedor.usuario ?? 'su dueño')} por <b>${miles(v.precio)}</b>.
      Te quedarán ${miles(m.saldo - v.precio)}.`, ok: `Comprar por ${miles(v.precio)}` });
  if (!ok || !(await asegurarHueco(ctx, 1, { que: 'comprarla' }))) return;
  await esperar(boton, async () => {
    await accion('slr_comprar_venta', { venta_id: v.id });
    toast(`${c.nombre} es tuya`, 'ok');
    await ctx.recargar('yo', 'cartas');
    await repintar();
  }).catch(() => {});
}

/* ── Ofertas e intercambios ─────────────────────────────────────────────── */
function cartasMini(lista) {
  return `<span class="slr-mini-cartas">${(lista ?? []).map(j => {
    const c = carta(j);
    return `<button type="button" data-detalle="${esc(c.id)}" title="${esc(c.nombre)}">${cartaHTML(c, { tam: 'xs', ancho: 54, energia: false })}</button>`;
  }).join('')}</span>`;
}
function vistaOfertas(m, ctx) {
  const imp = m.impuesto ?? 0.05, neto = x => Math.round(x * (1 - imp));
  const pct = Math.round(imp * 100);
  const rec = m.ofertas_recibidas.map(o => { const c = carta(o.carta); return filaCarta(c, ctx, `
    <span class="slr-mitem__precio"><small>${o.contraoferta_de ? 'Contraoferta de' : 'Te ofrece'} ${esc(o.de)}</small>${monedas(o.importe)}</span>
    <small class="slr-suave">Recibirías ${miles(neto(o.importe))} (−${pct} % de impuesto) · caduca en ${faltan(o.caduca_en)}</small>
    <span class="slr-botones">
      <button class="slr-btn slr-btn--mini" type="button" data-aceptar-oferta="${esc(o.id)}" ${deshab(m)}>Aceptar</button>
      <button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-contraofertar="${esc(o.id)}" ${deshab(m)}>Contraofertar</button>
      <button class="slr-btn slr-btn--mini slr-btn--fantasma slr-btn--peligro" type="button" data-rechazar-oferta="${esc(o.id)}" ${deshab(m)}>Rechazar</button>
    </span>`, { atributos: `data-oferta="${esc(o.id)}"` }); }).join('');
  const env = m.ofertas_enviadas.map(o => { const c = carta(o.carta); return filaCarta(c, ctx, `
    <span class="slr-mitem__precio"><small>${o.contraoferta_de ? 'Tu contraoferta a' : 'Ofreces a'} ${esc(o.para)}</small>${monedas(o.importe)}</span>
    <small class="slr-suave">Caduca en ${faltan(o.caduca_en)}</small>
    <button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-retirar-oferta="${esc(o.id)}" ${deshab(m)}>Retirar</button>`,
    { atributos: `data-oferta="${esc(o.id)}"` }); }).join('');
  const inter = enviado => m.intercambios.filter(i => i.enviado === enviado).map(i => {
    const [das, recibes, mDas, mRecibes] = i.enviado ? [i.cartas_de, i.cartas_para, i.monedas_de, i.monedas_para] : [i.cartas_para, i.cartas_de, i.monedas_para, i.monedas_de];
    return `<li class="slr-intercambio" data-intercambio="${esc(i.id)}">
      <p class="slr-intercambio__quien">${i.enviado ? `Propuesto a <b>${esc(i.para)}</b>` : `<b>${esc(i.de)}</b> te propone`} · caduca en ${faltan(i.caduca_en)}</p>
      <div class="slr-intercambio__lados">
        <div><small>Das</small>${cartasMini(das)}${mDas ? `<span>+ ${monedas(mDas)}</span>` : ''}</div>
        <span class="slr-intercambio__flecha">⇄</span>
        <div><small>Recibes</small>${cartasMini(recibes)}${mRecibes ? `<span>+ ${monedas(mRecibes)} <em>(${miles(neto(mRecibes))} tras el ${pct} %)</em></span>` : ''}</div>
      </div>
      <div class="slr-botones">${i.enviado
        ? `<button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-retirar-intercambio="${esc(i.id)}" ${deshab(m)}>Retirar</button>`
        : `<button class="slr-btn slr-btn--mini" type="button" data-aceptar-intercambio="${esc(i.id)}" data-neto="${(recibes?.length ?? 0) - (das?.length ?? 0)}" ${deshab(m)}>Aceptar</button>
           <button class="slr-btn slr-btn--mini slr-btn--fantasma slr-btn--peligro" type="button" data-rechazar-intercambio="${esc(i.id)}" ${deshab(m)}>Rechazar</button>`}</div>
    </li>`;
  }).join('');
  const bloque = (t, html, vacio) => `<h3 class="slr-subtitulo">${t}</h3>${html ? `<ul class="slr-mlista">${html}</ul>` : `<p class="slr-suave">${vacio}</p>`}`;
  return `
    ${bloque('Ofertas recibidas', rec, 'Nadie te ha ofrecido nada por tus cartas.')}
    ${bloque('Ofertas enviadas', env, 'Ofrece por una carta ajena desde su detalle.')}
    ${bloque('Intercambios recibidos', inter(false), 'Ninguno.')}
    ${bloque('Intercambios enviados', inter(true), 'Propón uno desde el detalle de una carta ajena.')}`;
}

export function hojaImporte({ titulo, texto, valor, minimo = 1, ok, impuesto = null }) {
  return new Promise(resolve => {
    let valorFinal = null;   // se resuelve al cerrar la hoja (tras el historial)
    const el = hoja(`
      <p class="slr-confirmar__texto">${texto}</p>
      <label class="slr-campo"><span>Importe</span>
        <input class="slr-input" type="number" inputmode="numeric" min="${minimo}" step="10" value="${valor}" data-importe-hoja></label>
      ${impuesto != null ? `<p class="slr-suave" data-neto></p>` : ''}
      <div class="slr-botones"><button class="slr-btn slr-btn--grande" type="button" data-ok-importe>${esc(ok)}</button></div>`,
    { titulo, alCerrar: () => resolve(valorFinal) });
    const inp = el.querySelector('[data-importe-hoja]');
    const neto = () => { if (impuesto != null) el.querySelector('[data-neto]').textContent = impuesto(Math.round(Number(inp.value) || 0)); };
    inp.addEventListener('input', neto); neto();
    el.querySelector('[data-ok-importe]').addEventListener('click', () => {
      const v = Math.round(Number(inp.value));
      if (!(v >= minimo)) { toast(`Como mínimo ${miles(minimo)}`, 'error'); return; }
      valorFinal = v; cerrarHasta(el);
    });
  });
}

/* ── Pantalla ───────────────────────────────────────────────────────────── */
// Los datos de la pantalla, en UNA llamada (rush.js los guarda y decide cuándo pedirlos)
export const cargar = ({ datos }) => rpc('slr_mercado', { liga_id: datos.liga.id }, { silencioso: true });

export async function pintar(cont, ctx) {
  vista = cont;
  clearInterval(reloj);
  reloj = setInterval(() => {
    if (!cont.isConnected) { clearInterval(reloj); return; }
    cont.querySelectorAll('[data-cuenta]').forEach(e => { e.textContent = (e.textContent.startsWith('⏱') ? '⏱ ' : '') + faltan(e.dataset.cuenta); });
  }, 30000);
  let m = ctx.pantalla;
  const usar = datos => { m = datos; ctx.datos.mercado = m; fotosDelMercado(m); };
  // Tras una acción: los datos nuevos (guardados para la próxima vez) y, si se sigue aquí, se repinta
  const repintar = async () => {
    usar(await cargar(ctx));
    guardar('mercado', m);
    if (cont.isConnected) dibujar();
  };
  function dibujar() {
    const n = { ofertas: m.ofertas_recibidas.length + m.intercambios.filter(i => !i.enviado).length, subastas: m.subastas.filter(s => s.mi_puja != null).length };
    cont.innerHTML = `
      <header class="slr-cabecera slr-mercado__cabeza">
        <h1 class="slr-titulo">Mercado</h1>
        <span class="slr-mercado__saldo">${monedas(m.saldo)}<small>${m.plantilla.ocupada}/${m.plantilla.maxima} cartas</small></span>
      </header>
      <div class="slr-segmentos slr-msubs" role="tablist">
        ${Object.entries(SUBS).map(([k, v]) => `<button type="button" role="tab" data-sub="${k}" class="${k === sub ? 'activo' : ''}">${v}${n[k] ? ` <i class="slr-insignia">${n[k]}</i>` : ''}</button>`).join('')}
      </div>
      ${bannerCierre(m.cerrado)}
      <div class="slr-mercado__vista ${m.cerrado ? 'es-cerrado' : ''}" data-vista-mercado>
        ${sub === 'subastas' ? vistaSubastas(m, ctx) : sub === 'venta' ? vistaVenta(m, ctx) : sub === 'ofertas' ? vistaOfertas(m, ctx) : '<div data-tienda></div>'}
      </div>`;
    enlazar();
    marcarEnCurso();
    if (sub === 'sobres') pintarTienda(cont.querySelector('[data-tienda]'), ctx, { mercado: m, alCambiar: repintar }).catch(e => toast(e.message, 'error'));
  }
  function enlazar() {
    const buscar = (lista, id) => lista.find(x => x.id === id);
    cont.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', () => { sub = b.dataset.sub; dibujar(); }));
    cont.querySelectorAll('[data-f]').forEach(s => s.addEventListener('change', () => { filtros[s.dataset.f] = s.value; dibujar(); }));
    cont.querySelector('[data-filtros-plegable]')?.addEventListener('toggle', e => { filtrosAbiertos = e.currentTarget.open; });
    // Al escribir se repinta la lista: el buscador conserva el foco y el cursor
    cont.querySelector('[data-buscar]')?.addEventListener('input', e => {
      filtros.texto = e.target.value;
      const pos = e.target.selectionStart;
      dibujar();
      const b = cont.querySelector('[data-buscar]');
      if (b) { b.focus(); b.setSelectionRange(pos, pos); }
    });
    cont.querySelectorAll('[data-detalle]').forEach(b => b.addEventListener('click', () => abrirDetalle(b.dataset.detalle, { ...ctx, alCambiarMercado: repintar }).catch(() => {})));
    cont.querySelectorAll('[data-pujar]').forEach(b => b.addEventListener('click', () => hojaPuja(buscar(m.subastas, b.dataset.pujar), m, ctx, repintar)));
    cont.querySelectorAll('[data-comprar]').forEach(b => b.addEventListener('click', () => comprarVenta(buscar(m.ventas, b.dataset.comprar), m, ctx, repintar, b)));
    cont.querySelectorAll('[data-retirar-venta]').forEach(b => b.addEventListener('click', () => esperar(b, async () => {
      await accion('slr_retirar_venta', { venta_id: b.dataset.retirarVenta });
      toast('Carta retirada de la venta', 'ok');
      await ctx.recargar('cartas'); await repintar();
    }).catch(() => {})));
    // Ofertas
    cont.querySelectorAll('[data-aceptar-oferta]').forEach(b => b.addEventListener('click', async () => {
      const o = buscar(m.ofertas_recibidas, b.dataset.aceptarOferta), c = carta(o.carta);
      const ok = await confirmar({ titulo: 'Aceptar oferta', texto: `Vendes a <b>${esc(c.nombre)}</b> a ${esc(o.de)} por <b>${miles(o.importe)}</b>
        (recibes ${miles(Math.round(o.importe * (1 - (m.impuesto ?? 0.05))))} tras el impuesto).`, ok: 'Aceptar' });
      if (!ok) return;
      await esperar(b, async () => {
        await accion('slr_aceptar_oferta', { oferta_id: o.id });
        toast(`${c.nombre} vendida a ${o.de}`, 'ok');
        await ctx.recargar('yo', 'cartas', 'alineacion'); await repintar();
      }).catch(() => {});
    }));
    cont.querySelectorAll('[data-rechazar-oferta]').forEach(b => b.addEventListener('click', () => esperar(b, async () => {
      await accion('slr_rechazar_oferta', { oferta_id: b.dataset.rechazarOferta });
      toast('Oferta rechazada', 'ok'); await repintar();
    }).catch(() => {})));
    cont.querySelectorAll('[data-retirar-oferta]').forEach(b => b.addEventListener('click', () => esperar(b, async () => {
      await accion('slr_retirar_oferta', { oferta_id: b.dataset.retirarOferta });
      toast('Oferta retirada', 'ok'); await repintar();
    }).catch(() => {})));
    cont.querySelectorAll('[data-contraofertar]').forEach(b => b.addEventListener('click', async () => {
      const o = buscar(m.ofertas_recibidas, b.dataset.contraofertar), c = carta(o.carta);
      const imp = m.impuesto ?? 0.05;
      const v = await hojaImporte({ titulo: 'Contraoferta', texto: `${esc(o.de)} ofrece <b>${miles(o.importe)}</b> por ${esc(c.nombre)}. ¿Cuánto pides?`,
        valor: Math.ceil((o.importe * 1.2) / 10) * 10, minimo: o.importe + 1, ok: 'Enviar contraoferta',
        impuesto: x => `Si la acepta, recibes ${miles(Math.round(x * (1 - imp)))} (−${Math.round(imp * 100)} % de impuesto).` });
      if (v == null) return;
      await esperar(b, async () => {
        await accion('slr_contraofertar', { oferta_id: o.id, importe: v });
        toast('Contraoferta enviada', 'ok'); await repintar();
      }).catch(() => {});
    }));
    // Intercambios
    cont.querySelectorAll('[data-aceptar-intercambio]').forEach(b => b.addEventListener('click', async () => {
      const neto = Number(b.dataset.neto);
      const ok = await confirmar({ titulo: 'Aceptar intercambio', texto: 'Las cartas y las monedas cambian de manos ahora mismo. No se puede deshacer.', ok: 'Aceptar' });
      if (!ok || (neto > 0 && !(await asegurarHueco(ctx, neto, { que: 'aceptar el intercambio' })))) return;
      await esperar(b, async () => {
        await accion('slr_aceptar_intercambio', { intercambio_id: b.dataset.aceptarIntercambio });
        toast('Intercambio hecho', 'ok');
        await ctx.recargar('yo', 'cartas', 'alineacion'); await repintar();
      }).catch(() => {});
    }));
    cont.querySelectorAll('[data-rechazar-intercambio]').forEach(b => b.addEventListener('click', () => esperar(b, async () => {
      await accion('slr_rechazar_intercambio', { intercambio_id: b.dataset.rechazarIntercambio });
      toast('Intercambio rechazado', 'ok'); await repintar();
    }).catch(() => {})));
    cont.querySelectorAll('[data-retirar-intercambio]').forEach(b => b.addEventListener('click', () => esperar(b, async () => {
      await accion('slr_retirar_intercambio', { intercambio_id: b.dataset.retirarIntercambio });
      toast('Intercambio retirado', 'ok'); await repintar();
    }).catch(() => {})));
  }
  if (m) { usar(m); dibujar(); } else await repintar();
}

// Para otras pantallas: abre el Mercado en una sub-pestaña
export function irA(s) { if (SUBS[s]) sub = s; }
