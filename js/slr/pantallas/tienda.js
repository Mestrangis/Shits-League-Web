/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — tienda de sobres (Mercado → Sobres)
   Los cinco sobres con su precio de este tramo, cuántas cartas traen, la
   probabilidad de cada rareza (entre lo que puede salir), cuántas quedan
   cuando importa y AGOTADO en gris si no se pueden llenar. El de posición
   pide el perfil; el de colección enseña la colección de la semana.
   Comprar: confirmación → «Haz hueco» si hace falta → apertura (apertura.js).
═══════════════════════════════════════════════ */
import { rpc } from '../api.js';
import { esc, miles, monedas, hoja, cerrarHasta, confirmar, toast } from '../ui.js';
import { RAREZAS } from '../carta.js';
import { sobreHTML } from '../sobre-arte.js';
import { asegurarHueco } from '../hueco.js';
import { abrirApertura, abrirEleccionPendiente } from './apertura.js';
import { bannerProgresion, bannerCierre } from './mercado.js';

const PERFIL = { portero: ['🧤', 'Portero'], defensa: ['🛡️', 'Defensa'], control: ['🎯', 'Control'], atacante: ['⚡', 'Atacante'] };
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

  cont.querySelector('[data-pendiente]')?.addEventListener('click', () => abrirEleccionPendiente(ctx, tienda.pendiente, { dorso: tienda.dorso_url, alTerminar: alCambiar }));
  cont.querySelectorAll('[data-comprar-sobre]').forEach(b => b.addEventListener('click', () => {
    const t = tienda.tipos.find(x => x.tipo === b.dataset.comprarSobre);
    comprar(t, tienda, ctx, alCambiar).catch(() => {});
  }));
}

function elegirPerfil(t) {
  return new Promise(resolve => {
    let elegido = null;   // se resuelve al cerrar la hoja (tras el historial): así la siguiente no se cierra con ella
    const el = hoja(`
      <p class="slr-confirmar__texto">¿Qué puesto quieres? Las cartas equilibradas valen para cualquiera.</p>
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
  const n = t.tipo === 'eleccion' ? 1 : t.cartas;
  const ok = await confirmar({ titulo: `Sobre ${t.nombre}`,
    texto: `Compras un sobre <b>${esc(t.nombre)}</b>${perfil ? ` (${PERFIL[perfil][1].toLowerCase()})` : ''} por <b>${miles(t.precio)}</b>.
      Te quedarán ${miles(tienda.saldo - t.precio)}.`, ok: `Comprar por ${miles(t.precio)}` });
  if (!ok || !(await asegurarHueco(ctx, n, { que: 'abrir el sobre' }))) return;
  let r;
  try {
    r = await rpc('slr_comprar_sobre', { liga_id: ctx.datos.liga.id, tipo: t.tipo, perfil });
  } catch { return; }
  await ctx.recargar('yo', 'cartas');
  await abrirApertura(ctx, r, { tipo: t, coleccion: tienda.coleccion_semana, dorso: tienda.dorso_url, alTerminar: alCambiar });
}
