/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — herramienta de plantillas (modo pruebas, solo admin)
   Todas las cartas de la liga (slr_admin_cartas) con buscador por nombre,
   filtros (tipo, acabado, estado: libre / con dueño / de un equipo) y orden
   (valor por defecto, OVR, nombre o tipo). Paginada: 24 / 48 / 96 por página
   o todas (se recuerda en localStorage), con botones de página y el total; las
   fotos de la página siguiente se precargan. Cada carta se puede dar a un equipo o dejar
   libre: todo pasa por slr_admin_mover_carta, que respeta el límite de 15,
   apunta la entrada del álbum (vía 'admin'), la quita de alineaciones, cancela
   ventas, ofertas, intercambios y subastas y lo deja en el historial: no hay
   que tocar las tablas cartas o equipos a mano.
═══════════════════════════════════════════════ */
import { rpc } from '../api.js';
import { esc, hoja, cerrarCapa, conEspera, toast, monedas, miles, scrollDeHoja } from '../ui.js';
import { cartaHTML, normalizarCarta, TIPOS, ACABADOS, RAREZAS } from '../carta.js';
import { listaColecciones } from '../colecciones.js';
import { precargar, urlFoto } from '../imagenes.js';

const TAMANOS = [24, 48, 96, 0];          // 0 = todas
const CLAVE_TAMANO = 'SLR_PLANTILLAS_POR_PAGINA';
function tamanoGuardado() {
  try { const n = Number(localStorage.getItem(CLAVE_TAMANO) ?? 24); return TAMANOS.includes(n) ? n : 24; } catch { return 24; }
}
function guardarTamano(n) {
  try { localStorage.setItem(CLAVE_TAMANO, String(n)); } catch { /* sin persistencia */ }
}
const ORDEN_TIPO = { especial: 0, grupo: 1, unica: 1, trio: 2, duo: 3, individual: 4 };
const ORDENES = {
  valor:  { texto: 'Valor',  cmp: (a, b) => b.valor - a.valor },
  ovr:    { texto: 'OVR',    cmp: (a, b) => b.ovr - a.ovr || b.valor - a.valor },
  nombre: { texto: 'Nombre', cmp: (a, b) => a.nombre.localeCompare(b.nombre, 'es') },
  tipo:   { texto: 'Tipo',   cmp: (a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || b.valor - a.valor },
};
const sinAcentos = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Estado de la herramienta entre aperturas (dentro de la misma sesión)
const filtros = { texto: '', tipo: '', rareza: '', coleccion: '', acabado: '', estado: '', orden: 'valor' };
let pagina = 1;

export async function abrirPlantillas(ctx) {
  const liga = ctx.datos.liga.id;
  let datos = await rpc('slr_admin_cartas', { liga_id: liga });
  let cartas = [], equipos = [], porEquipo = new Map(), visibles = [];
  let porPagina = tamanoGuardado();

  function preparar() {
    equipos = datos.equipos;
    porEquipo = new Map(equipos.map(e => [e.id, e]));
    cartas = datos.cartas.map(c => {
      const n = normalizarCarta(c);
      return { ...n, equipo_id: c.equipo_id, clave: sinAcentos(c.nombre) };
    });
    if (filtros.estado.startsWith('eq:') && !porEquipo.has(filtros.estado.slice(3))) filtros.estado = '';
  }
  preparar();

  const opciones = (lista, actual) => lista.map(([v, t]) => `<option value="${esc(v)}" ${v === actual ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const opcionesEstado = () => opciones([['', 'Todas'], ['libre', 'Libres'], ['dueno', 'Con dueño'],
    ...equipos.map(e => [`eq:${e.id}`, `De ${e.nombre}`])], filtros.estado);

  const el = hoja(`
    <div class="slr-plantillas-admin">
      <input class="slr-input" type="search" data-f="texto" placeholder="Buscar carta por nombre" autocomplete="off" value="${esc(filtros.texto)}">
      <div class="slr-filtros">
        <label><span>Tipo</span><select class="slr-input" data-f="tipo">${opciones([['', 'Todos'], ...Object.entries(TIPOS)], filtros.tipo)}</select></label>
        <label><span>Rareza</span><select class="slr-input" data-f="rareza">${opciones([['', 'Todas'], ...Object.entries(RAREZAS)], filtros.rareza)}</select></label>
        <label><span>Colección</span><select class="slr-input" data-f="coleccion">${opciones([['', 'Todas'], ['-', 'Sin colección'], ...listaColecciones().map(k => [k.id, k.nombre])], filtros.coleccion)}</select></label>
        <label><span>Acabado</span><select class="slr-input" data-f="acabado">${opciones([['', 'Todos'], ['normal', 'Normal'], ...Object.entries(ACABADOS)], filtros.acabado)}</select></label>
        <label><span>Orden</span><select class="slr-input" data-f="orden">${opciones(Object.entries(ORDENES).map(([k, o]) => [k, o.texto]), filtros.orden)}</select></label>
        <label><span>Estado</span><select class="slr-input" data-f="estado">${opcionesEstado()}</select></label>
      </div>
      <div class="slr-paginas-cabeza">
        <p class="slr-plantillas-admin__total" data-total></p>
        <label class="slr-por-pagina"><span>Por página</span><select class="slr-input" data-por-pagina>
          ${TAMANOS.map(n => `<option value="${n}" ${n === porPagina ? 'selected' : ''}>${n || 'Todas'}</option>`).join('')}</select></label>
      </div>
      <nav class="slr-paginas" data-paginas aria-label="Páginas"></nav>
      <ul class="slr-plantillas" data-resultados></ul>
      <nav class="slr-paginas" data-paginas aria-label="Páginas"></nav>
    </div>`, { titulo: 'Plantillas (modo pruebas)', completa: true });
  const lista = el.querySelector('[data-resultados]');

  function filtrar() {
    const t = sinAcentos(filtros.texto.trim());
    visibles = cartas.filter(c =>
      (!t || c.clave.includes(t)) &&
      (!filtros.tipo || c.tipo === filtros.tipo) &&
      (!filtros.rareza || c.rareza === filtros.rareza) &&
      (!filtros.coleccion || (filtros.coleccion === '-' ? !c.coleccion_id : c.coleccion_id === filtros.coleccion)) &&
      (!filtros.acabado || c.acabado === filtros.acabado) &&
      (filtros.estado === '' || (filtros.estado === 'libre' ? !c.equipo_id
        : filtros.estado === 'dueno' ? !!c.equipo_id : c.equipo_id === filtros.estado.slice(3))))
      .sort(ORDENES[filtros.orden].cmp);
    const libres = visibles.filter(c => !c.equipo_id).length;
    el.querySelector('[data-total]').textContent =
      `${miles(visibles.length)} ${visibles.length === 1 ? 'carta' : 'cartas'} de ${miles(cartas.length)} · ${miles(libres)} ${libres === 1 ? 'libre' : 'libres'}`;
    pintarPagina();
  }

  const paginas = () => porPagina ? Math.max(1, Math.ceil(visibles.length / porPagina)) : 1;
  const trozo = p => porPagina ? visibles.slice((p - 1) * porPagina, p * porPagina) : visibles;

  // ‹ 1 … 4 5 [6] 7 8 … 20 ›
  function botonesPaginas() {
    const n = paginas();
    if (n <= 1) return '';
    const nums = [...new Set([1, n, pagina - 2, pagina - 1, pagina, pagina + 1, pagina + 2])].filter(x => x >= 1 && x <= n).sort((a, b) => a - b);
    const partes = [];
    nums.forEach((x, i) => {
      if (i && x - nums[i - 1] > 1) partes.push('<span class="slr-paginas__hueco">…</span>');
      partes.push(`<button type="button" data-pag="${x}" class="${x === pagina ? 'activo' : ''}" ${x === pagina ? 'aria-current="page"' : ''}>${x}</button>`);
    });
    return `<button type="button" data-pag="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>
      ${partes.join('')}
      <button type="button" data-pag="${pagina + 1}" ${pagina === n ? 'disabled' : ''} aria-label="Siguiente">›</button>
      <span class="slr-paginas__texto">Página ${pagina} de ${n}</span>`;
  }

  function fila(c) {
    const eq = c.equipo_id ? porEquipo.get(c.equipo_id) : null;
    return `<li class="slr-plantillas__fila" data-carta="${esc(c.id)}">
      <div class="slr-plantillas__carta">${cartaHTML(c, { tam: 'xs', destacar: 'ATA' })}</div>
      <span class="slr-plantillas__texto"><b>${esc(c.nombre)}</b>
        <span class="slr-plantillas__cifras"><span>OVR <b>${c.ovr}</b></span><span>${monedas(c.valor)}</span><span>${esc(TIPOS[c.tipo])}${c.acabado !== 'normal' ? ` · ${esc(ACABADOS[c.acabado] ?? c.acabado)}` : ''}</span></span>
        ${eq ? `<small>En <b class="slr-plantillas__dueno">${esc(eq.nombre)}</b> · ${eq.bot ? 'bot' : esc(eq.usuario)}</small>`
             : '<small class="slr-propio">Libre</small>'}</span>
      <span class="slr-plantillas__acciones">
        <button class="slr-btn slr-btn--mini" type="button" data-dar>Dar a…</button>
        ${c.equipo_id ? '<button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-libre>Dejar libre</button>' : ''}
      </span>
    </li>`;
  }

  function pintarPagina() {
    pagina = Math.min(Math.max(1, pagina), paginas());
    const filas = trozo(pagina);
    lista.innerHTML = filas.length ? filas.map(fila).join('') : '<li class="slr-suave">Ninguna carta con esos filtros.</li>';
    const nav = botonesPaginas();
    el.querySelectorAll('[data-paginas]').forEach(n => { n.innerHTML = nav; n.hidden = !nav; });
    // Fotos de la página siguiente, en segundo plano y al ancho de las de esta
    if (pagina < paginas()) {
      const ancho = lista.querySelector('.slr-carta')?.getBoundingClientRect().width || 90;
      precargar(trozo(pagina + 1).filter(c => c.imagen_url).map(c => urlFoto(c.imagen_url, ancho)));
    }
  }

  const cuerpo = scrollDeHoja(el);
  el.querySelectorAll('[data-paginas]').forEach(nav => nav.addEventListener('click', e => {
    const b = e.target.closest('[data-pag]');
    if (!b || b.disabled) return;
    pagina = Number(b.dataset.pag);
    pintarPagina();
    // Si se ha pulsado abajo (o la lista empieza más arriba), al principio de la lista
    const arriba = lista.getBoundingClientRect().top - cuerpo.getBoundingClientRect().top + cuerpo.scrollTop - 120;
    if (cuerpo.scrollTop > arriba) cuerpo.scrollTop = Math.max(0, arriba);
  }));
  el.querySelector('[data-por-pagina]').addEventListener('change', e => {
    porPagina = Number(e.target.value);
    guardarTamano(porPagina);
    pagina = 1;
    pintarPagina();
  });

  // Acciones por delegación (las filas se añaden por páginas)
  lista.addEventListener('click', e => {
    const id = e.target.closest('[data-carta]')?.dataset.carta;
    if (!id) return;
    if (e.target.closest('[data-dar]')) elegirEquipo(id);
    const libre = e.target.closest('[data-libre]');
    if (libre) conEspera(libre, async () => {
      const r = await rpc('slr_admin_mover_carta', { liga_id: liga, carta_id: id, equipo_id: null });
      toast(`${r.nombre} queda libre`, 'ok');
      await despues();
    }).catch(() => {});
  });

  // "Dar a…": nombre entero del equipo, su dueño y las cartas que ocupa
  function elegirEquipo(cartaId) {
    const c = cartas.find(x => x.id === cartaId);
    const h = hoja(`
      <p class="slr-suave slr-dar__carta">${esc(c.nombre)}${c.equipo_id ? ` · ahora en ${esc(porEquipo.get(c.equipo_id)?.nombre ?? '')}` : ' · libre'}</p>
      <ul class="slr-lista-equipos">${equipos.map(e => {
        const llena = e.cartas >= datos.maximo, suya = e.id === c.equipo_id;
        return `<li><button type="button" data-equipo="${esc(e.id)}" ${llena || suya ? 'disabled' : ''}>
          <span class="slr-lista-equipos__texto"><b>${e.bot ? '🤖 ' : ''}${esc(e.nombre)}</b><small>${e.bot ? 'bot de pruebas' : esc(e.usuario)}</small></span>
          <span class="slr-lista-equipos__cartas ${llena ? 'es-llena' : ''}"><b>${e.cartas}/${datos.maximo}</b><small>${suya ? 'ya la tiene' : llena ? 'llena' : 'cartas'}</small></span>
        </button></li>`;
      }).join('')}</ul>`, { titulo: 'Dar a…' });
    h.querySelectorAll('[data-equipo]').forEach(b => b.addEventListener('click', () => conEspera(b, async () => {
      const r = await rpc('slr_admin_mover_carta', { liga_id: liga, carta_id: cartaId, equipo_id: b.dataset.equipo });
      toast(`${r.nombre} → ${r.ahora}`, 'ok');
      cerrarCapa();
      await despues();
    }).catch(() => {})));
  }

  // Lo propio puede haber cambiado (plantilla, alineación, saldo): se recarga
  async function despues() {
    const scroll = cuerpo.scrollTop;
    await ctx.recargar('cartas', 'alineacion');
    datos = await rpc('slr_admin_cartas', { liga_id: liga });
    preparar();
    el.querySelector('[data-f="estado"]').innerHTML = opcionesEstado();
    filtrar();                    // se queda en la misma página
    cuerpo.scrollTop = scroll;
  }

  let espera = null;
  el.querySelectorAll('[data-f]').forEach(c => c.addEventListener(c.tagName === 'SELECT' ? 'change' : 'input', () => {
    filtros[c.dataset.f] = c.value;
    pagina = 1;
    clearTimeout(espera);
    espera = setTimeout(filtrar, c.tagName === 'SELECT' ? 0 : 150);
  }));
  filtrar();
}
