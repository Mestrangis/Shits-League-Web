/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — tienda de sobres (Mercado → Sobres)
   Los cinco sobres con su precio de este tramo, cuántas cartas traen, la
   probabilidad de cada rareza (entre lo que puede salir), cuántas quedan
   cuando importa y AGOTADO en gris si no se pueden llenar. El de posición
   pide el perfil; el de colección enseña la colección de la semana.
   Comprar: confirmación → apertura (apertura.js). El sobre se abre aunque la
   plantilla pase del máximo; al terminar, si sobran cartas, «Haz hueco» con
   todas (las nuevas marcadas) para elegir cuáles vender (hueco.js).
   Con mala conexión: al confirmar sale ya la pantalla negra («Preparando
   sobre…») y todos los «Comprar» se desactivan. Cada compra lleva un intento
   (identificador): si la petición llega dos veces, el servidor no cobra otra
   vez. Si falla por la red o tarda más de 15 s, se pregunta al servidor por el
   intento: si la compra se hizo, se abre ese sobre; si no, se anula y se avisa
   de que no se ha cobrado nada. Si ni eso se puede saber, el intento se guarda
   y se resuelve al volver a la tienda.
═══════════════════════════════════════════════ */
import { rpc, nuevoIntento, ErrorSesion } from '../api.js';
import { esc, miles, monedas, hoja, cerrarHasta, confirmar, toast } from '../ui.js';
import { RAREZAS } from '../carta.js';
import { sobreHTML } from '../sobre-arte.js';
import { abrirApertura, abrirEleccionPendiente, abrirEspera } from './apertura.js';
import { bannerProgresion } from './mercado.js';
import { pintarPendiente, comprobarPendiente } from '../rush.js';

// Espera máxima de una compra antes de preguntar por ella (los tests la acortan)
export const AJUSTES_COMPRA = { espera: 15000 };
const NO_COBRADO = 'No se ha podido comprar el sobre, no se te ha cobrado nada';
const CLAVE_PENDIENTE = 'slr_compra_pendiente';
let comprando = false;
const dormir = ms => new Promise(res => setTimeout(res, ms));
// La promesa o, pasado el tope, un error «de red» (no se sabe si llegó)
const conTope = (p, ms) => Promise.race([p, dormir(ms).then(() => { throw Object.assign(new Error('Tarda demasiado'), { red: true }); })]);

// Todos los «Comprar» desactivados mientras hay una compra en curso
function bloquearCompras(si) {
  comprando = si;
  document.querySelectorAll('[data-comprar-sobre]').forEach(b => {
    if (si) { if (!('antes' in b.dataset)) b.dataset.antes = b.disabled ? '1' : ''; b.disabled = true; }
    else if ('antes' in b.dataset) { b.disabled = b.dataset.antes === '1'; delete b.dataset.antes; }
  });
}

const PERFIL = { portero: ['🧤', 'Portero'], defensa: ['🛡️', 'Defensa'], control: ['🎯', 'Control'], atacante: ['⚡', 'Ataque'] };
const pct = p => `${p >= 0.1 ? Math.round(p * 100) : (Math.round(p * 1000) / 10).toString().replace('.', ',')} %`;

function probabilidades(t) {
  return `<span class="slr-probs">${['comun', 'rara', 'epica', 'legendaria'].filter(r => t.probabilidades[r] > 0)
    .map(r => `<span class="slr-chip-rareza slr-chip-rareza--${r}">${RAREZAS[r]} ${pct(t.probabilidades[r])}</span>`).join('')}</span>`;
}

function quedan(t, tienda) {
  if (t.tipo === 'coleccion' && tienda.coleccion_semana) {
    return `Colección de la semana: <b>${esc(tienda.coleccion_semana.nombre)}</b> (${tienda.coleccion_semana.tengo}/${tienda.coleccion_semana.total} en tu álbum) ·
      ${t.quedan ? `quedan ${t.quedan} ${t.quedan === 1 ? 'carta' : 'cartas'}` : 'no queda ninguna'}`;
  }
  if (t.tipo === 'posicion' && t.por_perfil) {
    return Object.entries(PERFIL).map(([k, [ic]]) => `${ic} ${t.por_perfil[k] ?? 0}`).join(' · ');
  }
  return t.quedan <= 10 ? `Quedan ${t.quedan} ${t.quedan === 1 ? 'carta' : 'cartas'} que pueden salir` : '';
}

export async function pintarTienda(cont, ctx, { mercado, alCambiar }) {
  cont.innerHTML = '<div class="slr-cargando-bloque"></div>';
  const tienda = await rpc('slr_tienda', { liga_id: ctx.datos.liga.id });
  ctx.datos.sobrePendiente = tienda.pendiente;
  ctx.datos.dorsoUrl = tienda.dorso_url;
  pintarPendiente();
  const cerrado = !!mercado?.cerrado;
  cont.innerHTML = `
    ${bannerProgresion(tienda.progresion)}
    ${tienda.pendiente ? `<button class="slr-banner slr-banner--info slr-pendiente" type="button" data-pendiente>
      <b>🎴 Tienes una elección pendiente</b><span>Elige tu carta antes de que se acabe el tiempo (si no, te llevas la primera).</span></button>` : ''}
    <div class="slr-tienda" data-tienda-lista>
      ${tienda.tipos.map(t => {
        const agotado = t.agotado, pobre = tienda.saldo < t.precio;
        const q = quedan(t, tienda);
        return `<article class="slr-tienda__sobre ${agotado ? 'es-agotado' : ''}" data-tipo="${esc(t.tipo)}">
          <div class="slr-tienda__arte">${sobreHTML(t.tipo, { nombre: t.nombre, imagen_url: t.imagen_url, coleccion: tienda.coleccion_semana, cartas: t.cartas, tam: 's' })}
            ${agotado ? '<span class="slr-agotado">AGOTADO</span>' : ''}</div>
          <div class="slr-tienda__info">
            <b class="slr-tienda__nombre">${esc(t.nombre)}</b>
            <p class="slr-suave">${esc(t.descripcion)}</p>
            ${probabilidades(t)}
            ${q ? `<p class="slr-tienda__quedan">${q}</p>` : ''}
            <div class="slr-tienda__comprar">
              <span class="slr-tienda__precio">${monedas(t.precio)}</span>
              <button class="slr-btn" type="button" data-comprar-sobre="${esc(t.tipo)}" ${agotado || cerrado || pobre ? 'disabled' : ''}>
                ${agotado ? 'Agotado' : pobre ? 'Sin saldo' : 'Comprar'}</button>
            </div>
          </div>
        </article>`;
      }).join('')}
    </div>
    <p class="slr-suave slr-tienda__nota">Solo salen cartas libres. Las probabilidades son las de cada carta del sobre ahora mismo.
      Con la temporada en marcha, las épicas y las legendarias entran poco a poco.</p>`;

  if (comprando) bloquearCompras(true);
  resolverPendiente(ctx, tienda, alCambiar);
  cont.querySelector('[data-pendiente]')?.addEventListener('click', () => abrirEleccionPendiente(ctx, tienda.pendiente, { dorso: tienda.dorso_url, alTerminar: alCambiar }));
  cont.querySelectorAll('[data-comprar-sobre]').forEach(b => b.addEventListener('click', () => {
    if (comprando) return;
    const t = tienda.tipos.find(x => x.tipo === b.dataset.comprarSobre);
    comprar(t, tienda, ctx, alCambiar).catch(() => {});
  }));
}

function elegirPerfil(t) {
  return new Promise(resolve => {
    let elegido = null;   // se resuelve al cerrar la hoja (tras el historial): así la siguiente no se cierra con ella
    const el = hoja(`
      <p class="slr-confirmar__texto">¿Qué posición quieres? Cada carta es de la posición de su stat más alta (portero y defensa: DEF); si empata, vale para las dos.</p>
      <div class="slr-perfiles">${Object.entries(PERFIL).map(([k, [ic, nombre]]) => {
        const n = t.por_perfil?.[k] ?? 0;
        return `<button class="slr-perfil-btn" type="button" data-perfil="${k}" ${n ? '' : 'disabled'}>
          <span>${ic}</span><b>${nombre}</b><small>${n ? `${n} ${n === 1 ? 'carta' : 'cartas'}` : 'AGOTADO'}</small></button>`;
      }).join('')}</div>`, { titulo: t.nombre, alCerrar: () => resolve(elegido) });
    el.querySelectorAll('[data-perfil]').forEach(b => b.addEventListener('click', () => { elegido = b.dataset.perfil; cerrarHasta(el); }));
  });
}

async function comprar(t, tienda, ctx, alCambiar) {
  let perfil = null;
  if (t.tipo === 'posicion') {
    perfil = await elegirPerfil(t);
    if (!perfil) return;
  }
  const ok = await confirmar({ titulo: `Sobre ${t.nombre}`,
    texto: `Compras un sobre <b>${esc(t.nombre)}</b>${perfil ? ` (${PERFIL[perfil][1].toLowerCase()})` : ''} por <b>${miles(t.precio)}</b>.
      Te quedarán ${miles(tienda.saldo - t.precio)}.`, ok: `Comprar por ${miles(t.precio)}` });
  if (!ok || comprando) return;
  if (navigator.onLine === false) { toast(`${NO_COBRADO} (no hay conexión)`, 'error'); return; }
  const liga = ctx.datos.liga.id, intento = nuevoIntento();
  bloquearCompras(true);
  const espera = abrirEspera();
  let r;
  try {
    r = await comprarConIntento(liga, { tipo: t.tipo, perfil, intento });
  } catch (e) {
    bloquearCompras(false);
    espera.cerrar();
    if (!(e instanceof ErrorSesion)) toast(e.message, 'error');
    alCambiar?.();
    return;
  }
  bloquearCompras(false);
  await abrirComprado(ctx, r, t, tienda, alCambiar, espera);
}

async function abrirComprado(ctx, r, t, tienda, alCambiar, espera = null) {
  await ctx.recargar('yo', 'cartas').catch(() => {});
  if (r.pendiente_eleccion) { ctx.datos.sobrePendiente = { sobre_id: r.sobre_id, caduca_en: r.caduca_en, candidatas: r.cartas }; pintarPendiente(); }
  await abrirApertura(ctx, r, { tipo: t, coleccion: tienda.coleccion_semana, dorso: tienda.dorso_url, espera,
    alTerminar: () => { comprobarPendiente({ abrirHueco: true }); alCambiar?.(); } });
}

// La compra con su intento. Si el servidor dice que no (agotado, saldo…), no se ha cobrado.
// Si falla la red o pasan 15 s, se pregunta por el intento: comprado → ese sobre; si no, se anula.
async function comprarConIntento(liga, { tipo, perfil, intento }) {
  const limite = Date.now() + AJUSTES_COMPRA.espera;
  let llegada = null;
  const peticion = rpc('slr_comprar_sobre', { liga_id: liga, tipo, perfil, intento }, { silencioso: true });
  peticion.then(x => { llegada = x; }, () => {});
  try {
    return await conTope(peticion, AJUSTES_COMPRA.espera);
  } catch (e) {
    if (e instanceof ErrorSesion) throw e;
    if (!e.red) throw new Error(`${NO_COBRADO}: ${e.message}`);
  }
  // Si mientras tanto llega la respuesta de la compra, vale esa
  const compraOk = peticion.then(x => ({ comprado: true, respuesta: x }), () => new Promise(() => {}));
  do {
    if (llegada) return llegada;
    try {
      const a = await conTope(Promise.race([rpc('slr_anular_intento', { liga_id: liga, intento }, { silencioso: true }), compraOk]),
        Math.max(6000, limite - Date.now()));
      if (a.comprado) return a.respuesta;
      throw new Error(NO_COBRADO);
    } catch (e) {
      if (!e.red) throw e;
    }
    if (llegada) return llegada;
    await dormir(1500);
  } while (Date.now() < limite);
  if (llegada) return llegada;
  try { localStorage.setItem(CLAVE_PENDIENTE, JSON.stringify({ liga, intento, tipo })); } catch { /* sin almacenamiento */ }
  throw new Error('No se ha podido comprar el sobre por la conexión. Si llegó a hacerse, se abrirá cuando vuelvas a la tienda con conexión.');
}

// Una compra que se quedó sin saber (sin conexión): si se hizo, se abre ese sobre; si no, se anula
async function resolverPendiente(ctx, tienda, alCambiar) {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(CLAVE_PENDIENTE) || 'null'); } catch { return; }
  if (!p || p.liga !== ctx.datos.liga.id || comprando) return;
  let a;
  try { a = await rpc('slr_anular_intento', { liga_id: p.liga, intento: p.intento }, { silencioso: true }); }
  catch (e) { if (e.red) return; a = null; }
  try { localStorage.removeItem(CLAVE_PENDIENTE); } catch { /* sin almacenamiento */ }
  if (!a?.comprado) { if (a?.anulada) toast('La compra que se quedó a medias no llegó a hacerse: no se te ha cobrado nada', 'info'); return; }
  toast('Tu compra sí llegó a hacerse: aquí tienes el sobre', 'ok');
  const t = tienda.tipos.find(x => x.tipo === a.respuesta.tipo) ?? { tipo: a.respuesta.tipo, nombre: a.respuesta.nombre };
  await abrirComprado(ctx, a.respuesta, t, tienda, alCambiar);
}
