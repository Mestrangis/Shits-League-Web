/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — álbum (desde Perfil)
   Todas las cartas que has tenido alguna vez en esta liga (tabla album), aunque
   ya no sean tuyas, sin huecos vacíos: "X de Y desbloqueadas", filtros por tipo
   y acabado, orden por fecha o valor, y en cada carta cómo y cuándo la
   conseguiste y quién la tiene ahora. Tocar una carta abre su detalle.
═══════════════════════════════════════════════ */
import { leer } from '../api.js';
import { esc, hoja, fechaCorta, miles } from '../ui.js';
import { cartaHTML, normalizarCarta, TIPOS, ACABADOS } from '../carta.js';
import { abrirDetalle } from './detalle.js';

const VIAS = {
  inicial: 'Plantilla inicial', sobre_basico: 'Sobre básico', sobre_premium: 'Sobre premium', sobre_eleccion: 'Sobre de elección',
  subasta: 'Subasta', compra: 'Compra', clausula: 'Cláusula', intercambio: 'Intercambio', admin: 'Modo pruebas',
};

export async function abrirAlbum(ctx) {
  const { datos } = ctx;
  const liga = datos.liga.id, yo = datos.yo.usuario.id, miEquipo = datos.equipo?.id;
  const [entradas, total, equipos] = await Promise.all([
    leer(`album?select=diseno_id,via_adquisicion,primera_vez_en&usuario_id=eq.${yo}&liga_id=eq.${liga}`),
    leer('disenos_carta?select=id&activo=eq.true'),
    leer(`equipos?select=id,nombre&liga_id=eq.${liga}`),
  ]);
  const ids = entradas.map(e => e.diseno_id);
  const cartas = ids.length
    ? await leer(`cartas?select=id,diseno_id,equipo_id,disenos_carta(nombre,tipo,acabado,color,tier,perfil,personas,ata,def,con,valor,poderes,imagen_url,texto)` +
        `&liga_id=eq.${liga}&diseno_id=in.(${ids.join(',')})`)
    : [];
  const items = cartas.map(f => {
    const e = entradas.find(x => x.diseno_id === f.diseno_id);
    return { ...normalizarCarta(f), via: e.via_adquisicion, fecha: e.primera_vez_en, dueno: f.equipo_id };
  });
  const quien = id => (!id ? 'Libre' : id === miEquipo ? 'Tuya' : equipos.find(e => e.id === id)?.nombre ?? 'Otro equipo');

  const filtro = { tipo: '', acabado: '', orden: 'fecha' };
  const tipos = [...new Set(items.map(c => c.tipo))];
  const acabados = [...new Set(items.map(c => c.acabado))];
  const chips = (campo, valores, nombres) => `
    <div class="slr-segmentos slr-segmentos--chips" data-filtro="${campo}">
      <button type="button" data-v="" class="activo">Todos</button>
      ${valores.map(v => `<button type="button" data-v="${esc(v)}">${esc(nombres[v] ?? v)}</button>`).join('')}
    </div>`;

  const el = hoja(`
    <div class="slr-album">
      <p class="slr-album__contador"><b>${items.length}</b> de <b>${total.length}</b> desbloqueadas
        <span><i style="width:${total.length ? Math.round(100 * items.length / total.length) : 0}%"></i></span></p>
      ${items.length ? `
        ${chips('tipo', tipos, TIPOS)}
        ${acabados.length > 1 ? chips('acabado', acabados, ACABADOS) : ''}
        <div class="slr-segmentos" data-orden>
          <button type="button" data-v="fecha" class="activo">Más recientes</button><button type="button" data-v="valor">Más valiosas</button>
        </div>
        <div class="slr-rejilla" data-rejilla></div>`
      : '<div class="slr-vacio"><b>Álbum vacío</b><p>Cada carta que consigas se queda aquí para siempre, aunque luego la vendas.</p></div>'}
    </div>`, { titulo: 'Álbum', completa: true });

  const rejilla = el.querySelector('[data-rejilla]');
  function pintarRejilla() {
    if (!rejilla) return;
    const lista = items
      .filter(c => (!filtro.tipo || c.tipo === filtro.tipo) && (!filtro.acabado || c.acabado === filtro.acabado))
      .sort((a, b) => (filtro.orden === 'valor' ? b.valor - a.valor : new Date(b.fecha) - new Date(a.fecha)) || a.nombre.localeCompare(b.nombre));
    rejilla.innerHTML = lista.map(c => `
      <button class="slr-ficha" type="button" data-id="${esc(c.id)}">
        ${cartaHTML(c, { tam: 's' })}
        <span class="slr-ficha__album">
          <span>${esc(VIAS[c.via] ?? c.via)} · ${esc(fechaCorta(c.fecha))}</span>
          <span class="${c.dueno === miEquipo ? 'slr-propio' : ''}">${c.dueno === miEquipo ? '✓ Tuya' : `Ahora: ${esc(quien(c.dueno))}`} · ${miles(c.valor)}</span>
        </span>
      </button>`).join('') || '<p class="slr-suave">Ninguna carta con esos filtros.</p>';
    rejilla.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => abrirDetalle(b.dataset.id, ctx).catch(() => {})));
  }
  el.querySelectorAll('[data-filtro]').forEach(g => g.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    g.querySelectorAll('button').forEach(x => x.classList.toggle('activo', x === b));
    filtro[g.dataset.filtro] = b.dataset.v;
    pintarRejilla();
  })));
  el.querySelectorAll('[data-orden] button').forEach(b => b.addEventListener('click', () => {
    el.querySelectorAll('[data-orden] button').forEach(x => x.classList.toggle('activo', x === b));
    filtro.orden = b.dataset.v;
    pintarRejilla();
  }));
  pintarRejilla();
}
