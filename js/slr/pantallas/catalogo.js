/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — catálogo de cartas (desde Perfil, solo el admin)
   Todos los diseños del juego como en el álbum, pero todos y sin herramientas
   de gestión: los activos (interruptor para ver también los inactivos), con
   el total y el recuento por tipo, rareza y tier; filtros (tipo, rareza, tier,
   colección, perfil, acabado, color, libre / con dueño), buscador y orden
   (valor, OVR, nombre, rareza, tier, fecha de creación). Misma carga que el álbum (bloques al hacer scroll,
   precarga, vista previa y esqueleto).
   Datos: disenos_carta (lectura pública; los del catálogo común y los creados
   en esta liga de prueba) y el ejemplar de cada uno en la liga, para saber el
   dueño. Tocar una carta abre su detalle normal (con «Editar carta» del admin
   en modo pruebas); un diseño sin ejemplar en la liga (desactivado antes de un
   reinicio) abre una ficha del diseño con lo mismo.
   Edición múltiple (modo pruebas): «Seleccionar» (o Ctrl/Cmd+clic, Mayús+clic,
   pulsación larga) y «Editar» abre edicion-multiple.js con las seleccionadas.
═══════════════════════════════════════════════ */
import { leer } from '../api.js';
import { esc, hoja, miles, monedas, scrollDeHoja, toast } from '../ui.js';
import { cartaHTML, normalizarCarta, lineaCarta, TIPOS, ACABADOS, RAREZAS, sinAcentos, claveBusqueda } from '../carta.js';
import { listaColecciones, coleccion } from '../colecciones.js';
import { PERFILES, COLORES } from '../generador.js';
import { configLiga } from '../rush.js';
import { rejillaPorBloques } from '../bloques.js';
import { abrirDetalle, barras, poderes } from './detalle.js';
import { abrirEditorCarta } from './editor-carta.js';
import { seleccionMultiple } from '../seleccion.js';
import { abrirEdicionMultiple } from './edicion-multiple.js';

const TIERS = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
const ORDEN_TIPO = { especial: 0, grupo: 1, trio: 2, duo: 3, individual: 4 };
const ORDEN_RAREZA = { legendaria: 0, epica: 1, rara: 2, comun: 3 };
const ORDENES = {
  valor:  ['Valor', (a, b) => b.valor - a.valor],
  ovr:    ['OVR', (a, b) => b.ovr - a.ovr || b.valor - a.valor],
  nombre: ['Nombre', (a, b) => a.nombre.localeCompare(b.nombre, 'es')],
  rareza: ['Rareza', (a, b) => ORDEN_RAREZA[a.rareza] - ORDEN_RAREZA[b.rareza] || b.valor - a.valor],
  tier:   ['Tier', (a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || b.valor - a.valor],
  fecha:  ['Más recientes', (a, b) => new Date(b.creado_en) - new Date(a.creado_en)],
};

// Se recuerdan mientras dura la sesión
const filtro = { texto: '', tipo: '', rareza: '', tier: '', coleccion: '', perfil: '', acabado: '', color: '', estado: '', orden: 'valor', inactivas: false };

// buscar: el texto con el que se abre (p. ej. una persona, desde el detalle de una carta)
export async function abrirCatalogo(ctx, { buscar = null } = {}) {
  if (buscar != null) filtro.texto = buscar;
  const { datos } = ctx;
  const liga = datos.liga.id, miEquipo = datos.equipo?.id;
  const CAMPOS = 'id,nombre,tipo,acabado,color,tier,rareza,coleccion_id,perfil,personas,ata,def,con,valor,poderes,imagen_url,texto,activo,liga_prueba_id,creado_en';
  let todas = [], nombreEquipo = new Map(), visiblesAhora = [];
  // También tras una edición múltiple
  async function cargarDatos() {
    const [disenos, ejemplares, equipos] = await Promise.all([
      leer(`disenos_carta?select=${CAMPOS}&or=(liga_prueba_id.is.null,liga_prueba_id.eq.${liga})&limit=5000`),
      leer(`cartas?select=id,diseno_id,equipo_id&liga_id=eq.${liga}&limit=5000`),
      leer(`equipos?select=id,nombre&liga_id=eq.${liga}`),
    ]);
    const ejemplarDe = new Map(ejemplares.map(c => [c.diseno_id, c]));
    nombreEquipo = new Map(equipos.map(e => [e.id, e.nombre]));
    todas = disenos.map(d => {
      const ej = ejemplarDe.get(d.id);
      // Las creadas en esta liga de prueba nacen inactivas (no llegan a las ligas reales), pero aquí juegan
      return { ...normalizarCarta(d), id: ej?.id ?? `diseno-${d.id}`, diseno_id: d.id, activo: d.activo || !!d.liga_prueba_id, creado_en: d.creado_en,
               ejemplar: !!ej, dueno: ej?.equipo_id ?? null, clave: claveBusqueda(normalizarCarta(d)) };
    });
  }
  await cargarDatos();

  const opciones = (lista, actual) => lista.map(([v, t]) => `<option value="${esc(v)}" ${v === actual ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const el = hoja(`
    <div class="slr-catalogo">
      <div class="slr-catalogo__resumen" data-resumen></div>
      <input class="slr-input" type="search" data-f="texto" placeholder="Buscar por nombre o persona" autocomplete="off" value="${esc(filtro.texto)}">
      <div class="slr-filtros slr-filtros--catalogo">
        <label><span>Tipo</span><select class="slr-input" data-f="tipo">${opciones([['', 'Todos'], ...Object.entries(TIPOS)], filtro.tipo)}</select></label>
        <label><span>Rareza</span><select class="slr-input" data-f="rareza">${opciones([['', 'Todas'], ...Object.entries(RAREZAS)], filtro.rareza)}</select></label>
        <label><span>Colección</span><select class="slr-input" data-f="coleccion">${opciones([['', 'Todas'], ['-', 'Sin colección'], ...listaColecciones().map(k => [k.id, k.nombre])], filtro.coleccion)}</select></label>
        <label><span>Tier</span><select class="slr-input" data-f="tier">${opciones([['', 'Todos'], ...TIERS.map(t => [t, t])], filtro.tier)}</select></label>
        <label><span>Perfil</span><select class="slr-input" data-f="perfil">${opciones([['', 'Todos'], ...Object.entries(PERFILES)], filtro.perfil)}</select></label>
        <label><span>Acabado</span><select class="slr-input" data-f="acabado">${opciones([['', 'Todos'], ['normal', 'Normal'], ...Object.entries(ACABADOS)], filtro.acabado)}</select></label>
        <label><span>Color</span><select class="slr-input" data-f="color">${opciones([['', 'Todos'], ['-', 'El del tipo'], ...Object.entries(COLORES)], filtro.color)}</select></label>
        <label><span>Estado</span><select class="slr-input" data-f="estado">${opciones([['', 'Todas'], ['libre', 'Libres'], ['dueno', 'Con dueño']], filtro.estado)}</select></label>
        <label><span>Orden</span><select class="slr-input" data-f="orden">${opciones(Object.entries(ORDENES).map(([k, [t]]) => [k, t]), filtro.orden)}</select></label>
      </div>
      <label class="slr-interruptor"><input type="checkbox" data-inactivas ${filtro.inactivas ? 'checked' : ''}>Incluir las inactivas</label>
      <p class="slr-plantillas-admin__total" data-total></p>
      <div class="slr-seleccion-barra" data-barra-seleccion></div>
      <div class="slr-rejilla slr-rejilla--catalogo" data-rejilla></div>
    </div>`, { titulo: 'Catálogo de cartas', completa: true });

  const rejilla = el.querySelector('[data-rejilla]');
  const quien = c => !c.ejemplar ? 'Sin ejemplar en la liga' : !c.dueno ? 'Libre' : c.dueno === miEquipo ? 'Tuya' : nombreEquipo.get(c.dueno) ?? 'Otro equipo';
  const ficha = c => `
    <button class="slr-ficha slr-ficha--catalogo${c.activo ? '' : ' es-inactiva'}" type="button" data-id="${esc(c.id)}" data-sel-id="${esc(c.diseno_id)}">
      ${cartaHTML(c, { tam: 's' })}
      <span class="slr-ficha__album">
        <span>${esc(RAREZAS[c.rareza])} · ${c.tier ? `Tier ${esc(c.tier)} · ` : ''}${esc(PERFILES[c.perfil] ?? c.perfil ?? '')}${coleccion(c.coleccion_id) ? ` · ${esc(coleccion(c.coleccion_id).nombre)}` : ''}${c.activo ? '' : ' · <b class="slr-rival">Inactiva</b>'}</span>
        <span class="${c.dueno === miEquipo ? 'slr-propio' : ''}">${esc(quien(c))} · ${miles(c.valor)}</span>
      </span>
    </button>`;
  const bloques = rejillaPorBloques({ rejilla, cuerpo: scrollDeHoja(el), ficha, todasDeGolpe: 60, bloque: 30 });

  // Arriba: total y recuento por tipo y por tier de las que entran (activas o todas)
  function resumen(base) {
    const cuenta = (campo, claves, nombres = {}) => claves.map(k => [k, base.filter(c => c[campo] === k).length])
      .filter(([, n]) => n).map(([k, n]) => `<span><b>${n}</b> ${esc(nombres[k] ?? k)}</span>`).join('');
    const inactivas = todas.filter(c => !c.activo).length;
    el.querySelector('[data-resumen]').innerHTML = `
      <p class="slr-catalogo__total"><b>${miles(base.length)}</b> ${base.length === 1 ? 'carta' : 'cartas'}
        <small>${filtro.inactivas ? `incluidas ${inactivas} inactivas` : `activas${inactivas ? ` · ${inactivas} inactivas ocultas` : ''}`}</small></p>
      <div class="slr-catalogo__cuentas"><small>Tipo</small>${cuenta('tipo', Object.keys(TIPOS), TIPOS)}</div>
      <div class="slr-catalogo__cuentas"><small>Rareza</small>${cuenta('rareza', Object.keys(RAREZAS), RAREZAS)}</div>
      <div class="slr-catalogo__cuentas"><small>Tier</small>${cuenta('tier', TIERS)}</div>`;
  }

  function pintar() {
    const base = todas.filter(c => filtro.inactivas || c.activo);
    resumen(base);
    const t = sinAcentos(filtro.texto.trim());
    const lista = base.filter(c =>
      (!t || c.clave.includes(t)) &&
      (!filtro.tipo || c.tipo === filtro.tipo) &&
      (!filtro.rareza || c.rareza === filtro.rareza) &&
      (!filtro.coleccion || (filtro.coleccion === '-' ? !c.coleccion_id : c.coleccion_id === filtro.coleccion)) &&
      (!filtro.tier || c.tier === filtro.tier) &&
      (!filtro.perfil || c.perfil === filtro.perfil) &&
      (!filtro.acabado || c.acabado === filtro.acabado) &&
      (!filtro.color || (filtro.color === '-' ? !c.color : c.color === filtro.color)) &&
      (!filtro.estado || (filtro.estado === 'libre' ? c.ejemplar && !c.dueno : !!c.dueno)))
      .sort((a, b) => ORDENES[filtro.orden][1](a, b) || ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.nombre.localeCompare(b.nombre, 'es'));
    el.querySelector('[data-total]').textContent = lista.length === base.length
      ? `Mostrando todas (${miles(lista.length)})` : `${miles(lista.length)} de ${miles(base.length)} con estos filtros`;
    visiblesAhora = lista.map(c => c.diseno_id);
    bloques.poner(lista, '<p class="slr-suave">Ninguna carta con esos filtros.</p>');
  }

  // Edición múltiple: solo con el modo pruebas (como el resto de herramientas de admin)
  const barraSel = el.querySelector('[data-barra-seleccion]');
  if (configLiga().modo_beta === true) {
    seleccionMultiple({
      contenedor: rejilla, barra: barraSel, visibles: () => visiblesAhora,
      alAccion: ids => abrirEdicionMultiple(ctx, ids, { alTerminar: async () => { await cargarDatos(); pintar(); } }),
    });
  } else barraSel.hidden = true;

  rejilla.addEventListener('click', e => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    const c = id && todas.find(x => x.id === id);
    if (!c) return;
    if (c.ejemplar) abrirDetalle(c.id, ctx).catch(() => {});
    else fichaDiseno(c, ctx);
  });
  let espera = null;
  el.querySelectorAll('[data-f]').forEach(campo => campo.addEventListener(campo.tagName === 'SELECT' ? 'change' : 'input', () => {
    filtro[campo.dataset.f] = campo.value;
    clearTimeout(espera);
    espera = setTimeout(pintar, campo.tagName === 'SELECT' ? 0 : 150);
  }));
  el.querySelector('[data-inactivas]').addEventListener('change', e => { filtro.inactivas = e.target.checked; pintar(); });
  pintar();
}

// Diseño sin ejemplar en esta liga: la carta, sus stats y poderes, y editar
function fichaDiseno(c, ctx) {
  const puedeEditar = !!ctx.datos.liga?.es_admin && configLiga().modo_beta === true;
  const el = hoja(`
    <div class="slr-detalle">
      <div class="slr-detalle__carta">${cartaHTML(c, { tam: 'l' })}</div>
      <div class="slr-detalle__info">
        <p class="slr-detalle__tipo">${lineaCarta(c)}${c.activo ? '' : ' <b class="slr-rival">Inactiva</b>'}</p>
        <div class="slr-stats">${barras(c)}</div>
        <div class="slr-cifras"><div><small>Valor</small><b>${monedas(c.valor)}</b></div>
          <div><small>Tier</small><b>${esc(c.tier ?? '—')}</b></div><div><small>Ejemplar</small><b>No hay en esta liga</b></div></div>
        ${c.texto ? `<p class="slr-detalle__texto">${esc(c.texto)}</p>` : ''}
        <h3 class="slr-subtitulo">Poderes</h3>
        ${poderes(c.poderes)}
        ${puedeEditar ? '<button class="slr-btn slr-btn--pruebas slr-detalle__editar" type="button" data-editar-carta>✎ Editar carta (modo pruebas)</button>' : ''}
      </div>
    </div>`, { titulo: c.nombre, completa: true });
  el.querySelector('[data-editar-carta]')?.addEventListener('click', () =>
    abrirEditorCarta(ctx, { disenoId: c.diseno_id }).catch(e => toast(e.message, 'error')));
}
