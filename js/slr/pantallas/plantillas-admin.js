/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — herramienta de plantillas (modo pruebas, solo admin)
   Todas las cartas de la liga (slr_admin_cartas) con buscador por nombre,
   filtros (tipo, acabado, estado: libre / con dueño / de un equipo) y orden
   (valor por defecto, OVR, nombre o tipo). La lista se pinta por páginas de 30
   y carga más al acercarse al final (o con «Ver más»). Cada carta se puede dar a un equipo o dejar
   libre: todo pasa por slr_admin_mover_carta, que respeta el límite de 15,
   apunta la entrada del álbum (vía 'admin'), la quita de alineaciones, cancela
   ventas, ofertas, intercambios y subastas y lo deja en el historial: no hay
   que tocar las tablas cartas o equipos a mano.
═══════════════════════════════════════════════ */
import { rpc } from '../api.js';
import { esc, hoja, cerrarCapa, conEspera, toast, monedas, scrollDeHoja } from '../ui.js';
import { cartaHTML, normalizarCarta, TIPOS, ACABADOS } from '../carta.js';

const POR_PAGINA = 30;
const ORDEN_TIPO = { unica: 0, trio: 1, duo: 2, individual: 3 };
const ORDENES = {
  valor:  { texto: 'Valor',  cmp: (a, b) => b.valor - a.valor },
  ovr:    { texto: 'OVR',    cmp: (a, b) => b.ovr - a.ovr || b.valor - a.valor },
  nombre: { texto: 'Nombre', cmp: (a, b) => a.nombre.localeCompare(b.nombre, 'es') },
  tipo:   { texto: 'Tipo',   cmp: (a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || b.valor - a.valor },
};
const sinAcentos = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Estado de la herramienta entre aperturas (dentro de la misma sesión)
const filtros = { texto: '', tipo: '', acabado: '', estado: '', orden: 'valor' };

export async function abrirPlantillas(ctx) {
  const liga = ctx.datos.liga.id;
  let datos = await rpc('slr_admin_cartas', { liga_id: liga });
  let cartas = [], equipos = [], porEquipo = new Map(), visibles = [], pintadas = 0;

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
        <label><span>Acabado</span><select class="slr-input" data-f="acabado">${opciones([['', 'Todos'], ['normal', 'Normal'], ...Object.entries(ACABADOS)], filtros.acabado)}</select></label>
        <label><span>Orden</span><select class="slr-input" data-f="orden">${opciones(Object.entries(ORDENES).map(([k, o]) => [k, o.texto]), filtros.orden)}</select></label>
        <label><span>Estado</span><select class="slr-input" data-f="estado">${opcionesEstado()}</select></label>
      </div>
      <p class="slr-plantillas-admin__total" data-total></p>
      <ul class="slr-plantillas" data-resultados></ul>
      <div class="slr-plantillas-admin__mas" data-mas><button class="slr-btn slr-btn--fantasma" type="button">Ver más</button></div>
    </div>`, { titulo: 'Plantillas (modo pruebas)', completa: true });
  const lista = el.querySelector('[data-resultados]');
  const mas = el.querySelector('[data-mas]');

  function filtrar() {
    const t = sinAcentos(filtros.texto.trim());
    visibles = cartas.filter(c =>
      (!t || c.clave.includes(t)) &&
      (!filtros.tipo || c.tipo === filtros.tipo) &&
      (!filtros.acabado || c.acabado === filtros.acabado) &&
      (filtros.estado === '' || (filtros.estado === 'libre' ? !c.equipo_id
        : filtros.estado === 'dueno' ? !!c.equipo_id : c.equipo_id === filtros.estado.slice(3))))
      .sort(ORDENES[filtros.orden].cmp);
    pintadas = 0;
    lista.innerHTML = visibles.length ? '' : '<li class="slr-suave">Ninguna carta con esos filtros.</li>';
    const libres = visibles.filter(c => !c.equipo_id).length;
    el.querySelector('[data-total]').textContent =
      `${visibles.length} ${visibles.length === 1 ? 'carta' : 'cartas'} de ${cartas.length} · ${libres} ${libres === 1 ? 'libre' : 'libres'}`;
    pintarPagina();
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
    const trozo = visibles.slice(pintadas, pintadas + POR_PAGINA);
    pintadas += trozo.length;
    lista.insertAdjacentHTML('beforeend', trozo.map(fila).join(''));
    mas.hidden = pintadas >= visibles.length;
  }

  // Scroll infinito: a menos de 400 px del final se pinta otra página
  const cuerpo = scrollDeHoja(el);
  cuerpo.addEventListener('scroll', () => {
    if (pintadas < visibles.length && cuerpo.scrollTop + cuerpo.clientHeight > cuerpo.scrollHeight - 400) pintarPagina();
  }, { passive: true });
  mas.querySelector('button').addEventListener('click', pintarPagina);

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
    const scroll = cuerpo.scrollTop, ya = pintadas;
    await ctx.recargar('cartas', 'alineacion');
    datos = await rpc('slr_admin_cartas', { liga_id: liga });
    preparar();
    el.querySelector('[data-f="estado"]').innerHTML = opcionesEstado();
    filtrar();
    while (pintadas < Math.min(ya, visibles.length)) pintarPagina();
    cuerpo.scrollTop = scroll;
  }

  let espera = null;
  el.querySelectorAll('[data-f]').forEach(c => c.addEventListener(c.tagName === 'SELECT' ? 'change' : 'input', () => {
    filtros[c.dataset.f] = c.value;
    clearTimeout(espera);
    espera = setTimeout(filtrar, c.tagName === 'SELECT' ? 0 : 150);
  }));
  filtrar();
}
