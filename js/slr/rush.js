/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — modo Rush (pantalla completa)
   Lo carga js/rush-panel.js al pulsar JUGAR: abrir({ jugador, reautenticar, sesionPerdida, sinAcceso, alSalir }).
   · Capa por encima de la app, con barra superior (saldo, avisos, salir) e
     inferior (Equipo, Plantilla, Mercado, Liga, Perfil). "Equipo" es el editor
     de alineación con el próximo rival, la cuenta atrás y el último resultado.
   · history.pushState al entrar: el botón atrás cierra primero las hojas
     abiertas y después sale de Rush, sin cerrar la app.
   · El estado del jugador (liga, equipo, cartas, calendario…) vive en `datos`
     y cada pantalla lo pinta; tras una acción se recarga lo necesario.
═══════════════════════════════════════════════ */
import { rpc, leer, configurarSesion, borrarToken, ErrorSesion } from './api.js';
import { esc, miles, crear, fijarRaiz, ajustarCapas, capasAbiertas, toast, hoja, cerrarCapa, fechaHora } from './ui.js';
import { normalizarCarta, iniciarAcabados, pararAcabados } from './carta.js';
import { fijarColecciones } from './colecciones.js';
import { guardado, pedir, invalidar, esFresco, fijarAmbito } from './datos-pantallas.js';
import { DATOS_FRESCOS_MS } from './config.js';
import * as previa from './pantallas/previa.js';
import * as plantilla from './pantallas/plantilla.js';
import * as mercado from './pantallas/mercado.js';
import * as liga from './pantallas/liga.js';
import * as perfil from './pantallas/perfil.js';
import * as alineacion from './pantallas/alineacion.js';
import { abrirEleccionPendiente } from './pantallas/apertura.js';
import { abrirHacerHueco } from './hueco.js';
import { cargarIndice } from './imagenes.js';
import { precargarFotos, fotosDelMercado } from './precarga-fotos.js';

const ES_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

const SECCIONES = [
  { id: 'equipo',    texto: 'Equipo',    modulo: alineacion,
    icono: '<rect x="3.5" y="3" width="17" height="18" rx="2"/><path d="M3.5 12h17"/><circle cx="12" cy="12" r="2.6"/><path d="M8.5 3v3.2h7V3M8.5 21v-3.2h7V21"/>' },
  { id: 'plantilla', texto: 'Plantilla', modulo: plantilla,
    icono: '<rect x="3" y="5" width="7" height="10" rx="1.5"/><rect x="14" y="5" width="7" height="10" rx="1.5"/><path d="M6.5 18.5h11"/>' },
  { id: 'mercado',   texto: 'Mercado',   modulo: mercado,
    icono: '<path d="M4 9h16l-1.5 10.5h-13z"/><path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2"/>' },
  { id: 'liga',      texto: 'Liga',      modulo: liga,
    icono: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 14v3.5M8.5 20h7"/>' },
  { id: 'perfil',    texto: 'Perfil',    modulo: perfil,
    icono: '<circle cx="12" cy="8.5" r="4"/><path d="M4 20.5c1.2-4 4.3-6 8-6s6.8 2 8 6"/>' },
];

/* ── Estado ──────────────────────────────────────────────────────────────── */
export const datos = {
  jugador: null,      // nombre de la sesión de Shits League
  yo: null,           // slr_yo
  liga: null,         // la liga que se juega (principal, o la de prueba en local)
  equipo: null,       // equipo propio en esa liga (o null)
  ligaInfo: null,     // fila pública de la liga (config, estado, pausada_en…)
  temporada: null,    // fila pública de la temporada actual
  jornadas: [],       // calendario de la temporada actual
  cartas: [],         // plantilla propia (normalizada + estado de mercado)
  alineacion: null,   // fila de alineaciones del equipo
};

let raiz = null, main = null, seccion = 'equipo', opciones = {}, pintando = 0;

/* ── Consultas derivadas (las usan varias pantallas) ─────────────────────── */
export const pendientes = () => datos.jornadas.filter(j => ['programada', 'cerrada', 'simulada'].includes(j.estado));
export const proximaJornada = () => pendientes()[0] ?? null;
export const enJuego = j => !!j && (j.estado !== 'programada' || new Date(j.cierre_en) <= Date.now());
export const ventanaCierre = () => enJuego(proximaJornada());
export const pausada = () => datos.ligaInfo?.estado === 'pausada';
// Alineación bloqueada: entre cierre y publicación, o con la liga en pausa
export const alineacionBloqueada = () => ventanaCierre() || pausada();
// Por qué está cerrado el mercado (null: abierto). El servidor manda; esto solo pinta
export function motivoCierre() {
  const e = datos.ligaInfo?.estado;
  if (e === 'pausada') return 'pausa';
  if (e === 'entre_temporadas' || e === 'terminada') return 'entre_temporadas';
  return ventanaCierre() ? 'jornada' : null;
}
export const miPartido = j => j?.partidos.find(p => [p.local.equipo_id, p.visitante.equipo_id].includes(datos.equipo?.id)) ?? null;
export const configLiga = () => datos.ligaInfo?.config ?? {};

// Una carta está tocada si su lesión afecta a una jornada aún sin publicar
export function estaTocada(carta) {
  if (!carta.tocada_en_jornada) return false;
  const j = datos.jornadas.find(x => x.id === carta.tocada_en_jornada);
  return !!j && j.estado !== 'publicada';
}

// Confirmada para la próxima jornada: guardada a mano después de publicarse la anterior
export function alineacionConfirmada() {
  const al = datos.alineacion, j = proximaJornada();
  if (!al || al.automatica || !j) return false;
  const anterior = datos.jornadas.find(x => x.numero === j.numero - 1);
  const ref = anterior?.publicada_en ?? datos.temporada?.iniciada_en;
  return !!ref && new Date(al.guardada_en) > new Date(ref);
}

/* ── Carga ───────────────────────────────────────────────────────────────────
   Todo lo de la entrada llega en UNA llamada (slr_rush_inicio): el jugador, la
   liga, la temporada, el calendario, las colecciones, las cartas, la alineación,
   las tácticas, los avisos y los pendientes. Es la clave 'base' de los datos
   guardados (datos-pantallas.js): las pantallas Equipo y Plantilla solo usan esto;
   Mercado, Liga y Perfil tienen además su propia llamada. */
function mismoNombre(a, b) {
  const n = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return !!a && n(a) === n(b);
}

// Lo que pidió la portada al pulsar JUGAR (rush-panel.js → rushPrecarga), si es de este jugador
// y aún viene de camino o llegó hace menos de 15 s: así no se pide dos veces
function tomarPrecarga() {
  const p = window.rushPrecarga;
  window.rushPrecarga = null;
  const fresca = !p?.llegada || Date.now() - p.llegada < DATOS_FRESCOS_MS;
  return p && p.ambito === `${datos.jugador}|${ES_LOCAL ? 'prueba' : 'principal'}` && fresca ? p : null;
}

// previo: lo de la precarga que ya ha llegado (se comprueba igual que lo pedido aquí)
async function cargarBase(previo = null) {
  const pre = previo ? null : tomarPrecarga();
  let b = previo ?? (pre ? await pre.promesa.catch(() => null) : null);
  b ??= await rpc('slr_rush_inicio', { prueba: ES_LOCAL }, { silencioso: true });
  if (!mismoNombre(b.yo.usuario.nombre, datos.jugador)) {
    // La sesión de Rush es de otra persona: otra sesión en silencio con el
    // código guardado; si tampoco encaja, se cierra la sesión de Shits League
    borrarToken();
    if (await opciones.reautenticar() === 'ok') b = await rpc('slr_rush_inicio', { prueba: ES_LOCAL }, { silencioso: true });
    if (!mismoNombre(b.yo.usuario.nombre, datos.jugador)) {
      borrarToken();
      opciones.sesionPerdida();
      throw new ErrorSesion('La sesión de Rush no coincide con la de Shits League');
    }
  }
  if (!b.yo.tiene_acceso) {
    opciones.sinAcceso();
    throw new ErrorSesion('Sin acceso a la beta de Rush');
  }
  guardarPortada(b);
  return b;
}

// El estado de la liga para la portada (rush-panel.js): la portada no pide nada antes de JUGAR
function guardarPortada(b) {
  const j = (b.calendario?.jornadas ?? []).find(x => ['programada', 'cerrada', 'simulada'].includes(x.estado));
  try {
    localStorage.setItem('RUSH_PORTADA', JSON.stringify({
      ambito: `${datos.jugador}|${ES_LOCAL ? 'prueba' : 'principal'}`,
      liga: b.liga ? { estado: b.liga.estado, temporada: b.liga.temporada } : null,
      jornada: j ? { numero: j.numero, estado: j.estado, cierre_en: j.cierre_en } : null,
    }));
  } catch { /* sin persistencia */ }
}

// Pone en `datos` lo que llega de slr_rush_inicio (fresco o guardado de la última vez)
export function aplicarBase(b) {
  const yo = b.yo;
  datos.yo = yo;
  const prueba = ES_LOCAL ? yo.ligas.find(l => l.es_prueba && l.id === b.liga_id) : null;
  datos.liga = prueba ?? (yo.liga_principal && yo.liga_principal.id === b.liga_id ? { ...yo.liga_principal, es_prueba: false } : null);
  datos.equipo = datos.liga ? yo.equipos.find(e => e.liga_id === datos.liga.id) ?? null : null;
  fijarColecciones(b.colecciones);   // para el fondo, el emblema y el nombre de la colección de cada carta
  datos.ligaInfo = b.liga ?? null;
  datos.temporada = b.temporada ?? null;
  datos.sinVer = b.sin_ver?.sin_ver ?? null;
  datos.fotosRival = b.fotos_rival ?? [];
  if (!datos.equipo) {
    Object.assign(datos, { jornadas: [], cartas: [], alineacion: null, tacticas: null, sobrePendiente: null, huecoPendiente: null });
    avisos = [];
    return;
  }
  // slr_calendario no trae publicada_en (hace falta para saber si la alineación está confirmada)
  const cal = b.calendario ?? {};
  datos.jornadas = (cal.temporada && cal.temporada.id === b.temporada?.id ? cal.jornadas : [])
    .map(j => ({ ...j, publicada_en: b.publicadas?.find(p => p.id === j.id)?.publicada_en ?? null }));
  datos.cartas = (b.cartas ?? []).map(f => ({
    ...normalizarCarta(f),
    multiplicador: Number(f.multiplicador_clausula),
    clausula: Math.round(f.disenos_carta.valor * Number(f.multiplicador_clausula)),
    blindada_hasta: f.blindada_hasta && new Date(f.blindada_hasta) > Date.now() ? f.blindada_hasta : null,
    tocada_en_jornada: f.tocada_en_jornada,
    adquirida_en: f.adquirida_en,
    en_venta: b.ventas?.find(v => v.carta_id === f.id) ?? null,
  }));
  datos.alineacion = b.alineacion ?? null;
  datos.tacticas = b.tacticas ?? { tactica: 'posesion', plan_b: null, gestion: 'normal', cambios_avanzados: [] };
  datos.sobrePendiente = b.sobre_pendiente ?? null;
  datos.huecoPendiente = b.hueco_pendiente?.sobran > 0 ? b.hueco_pendiente : null;
  avisos = (b.notificaciones?.notificaciones ?? []).filter(n => !n.liga_id || n.liga_id === datos.liga.id).slice(0, 40);
}

/* ── Partidos vistos (sin destripar) ────────────────────────────────────────
   datos.sinVer: tu último partido de liga publicado que aún no has visto
   ({ partido_id, jornada_id, numero }) o null. Hasta verlo, la web no enseña su
   resultado (avisos, calendario, Equipo, fichas) y la clasificación llega sin
   esa jornada (lo hace el servidor). */
export const sinVer = partidoId => !!datos.sinVer && (partidoId == null || datos.sinVer.partido_id === partidoId);
export async function marcarVisto(partidoId) {
  const r = await rpc('slr_marcar_visto', { partido_id: partidoId }, { silencioso: true }).catch(() => null);
  if (!r) return;
  const antes = datos.sinVer?.partido_id;
  datos.sinVer = r.sin_ver ?? null;
  // La clasificación ya cuenta ese partido
  invalidar('liga');
  // Lo que quedaba pendiente de ese partido (bonus de sorpresa y ojo clínico) ya se ha cobrado
  if (r.cobrado > 0) {
    toast(`Bonus del partido: +${miles(r.cobrado)}`, 'ok');
    await recargar().catch(() => {});
  }
  if (antes && antes !== datos.sinVer?.partido_id) pintar().catch(() => {});
}

// Datos frescos de la entrada (una llamada) tras una acción. Las partes ('yo', 'liga',
// 'cartas', 'alineacion') se aceptan por compatibilidad: llega todo junto. Lo guardado
// de las demás pantallas deja de contar como fresco (la acción puede haberlo cambiado).
export async function recargar() {
  invalidar('base', 'mercado', 'liga', 'perfil');
  const b = await pedir('base', cargarBase);
  aplicarBase(b);
  pintarBarra();
  pintarPendiente();
}

/* ── Pintado ─────────────────────────────────────────────────────────────── */
/* ── Avisos (campana) ────────────────────────────────────────────────────── */
// Cada aviso es una tarjeta con icono según el tipo. Si el servidor le ha
// guardado destino (destino_tipo + destino_id), al tocarla lleva a su sitio:
// carta → detalle · partido → crónica · movimientos → Perfil · liga → Liga.
let avisos = [];
const ICONOS_AVISO = {
  jornada_publicada: '⚽', venta_completada: '💰', clausula_recibida: '💰',
  subasta_ganada: '🔨', subasta_perdida: '🔨', puja_anulada: '🔨', subasta_cancelada: '🔨',
  oferta_recibida: '🤝', oferta_aceptada: '🤝', oferta_rechazada: '🤝', contraoferta: '🤝',
  oferta_caducada: '🤝', oferta_cancelada: '🤝', venta_cancelada: '🏷️',
  intercambio_recibido: '🔁', intercambio_aceptado: '🔁', intercambio_rechazado: '🔁',
  intercambio_caducado: '🔁', intercambio_cancelado: '🔁',
  eleccion_automatica: '🃏', admin_carta: '🃏',
  liga_pausada: '⏸️', liga_reanudada: '▶️', temporada_iniciada: '🏁', temporada_terminada: '🏆', jornada_aplazada: '📅',
};
async function cargarAvisos() {
  if (!datos.liga) return;
  const r = await rpc('slr_notificaciones', {}, { silencioso: true }).catch(() => null);
  if (!r) return;
  avisos = r.notificaciones.filter(n => !n.liga_id || n.liga_id === datos.liga.id).slice(0, 40);
  pintarCampana();
}
function pintarCampana() {
  const b = raiz?.querySelector('.slr-barra__avisos');
  if (!b) return;
  const n = avisos.filter(a => !a.leida).length;
  b.hidden = !datos.equipo;
  b.querySelector('b').textContent = n > 9 ? '9+' : n || '';
  b.classList.toggle('tiene', n > 0);
  b.setAttribute('aria-label', n ? `Avisos: ${n} sin leer` : 'Avisos');
}
function tarjetaAviso(n) {
  // El aviso de la jornada lleva el resultado y lo cobrado: mientras no veas el partido, no
  const oculto = n.tipo === 'jornada_publicada' && datos.sinVer && n.datos?.jornada_id === datos.sinVer.jornada_id;
  const texto = oculto ? `Jornada ${datos.sinVer.numero}: tu partido ya se ha jugado · ▶ Ver` : (n.datos?.texto ?? n.tipo);
  const dentro = `
    <span class="slr-aviso__icono" aria-hidden="true">${ICONOS_AVISO[n.tipo] ?? '🔔'}</span>
    <span class="slr-aviso__texto"><span>${esc(texto)}</span><time>${esc(fechaHora(n.creada_en))}</time></span>`;
  const clase = `slr-aviso ${n.leida ? '' : 'es-nuevo'}`;
  return n.destino_tipo
    ? `<li><button type="button" class="${clase}" data-aviso="${n.id}">${dentro}<span class="slr-aviso__flecha" aria-hidden="true">›</span></button></li>`
    : `<li><div class="${clase}">${dentro}</div></li>`;
}
// Al abrir la lista se marcan como leídos (se siguen viendo resaltados hasta cerrarla)
function abrirAvisos() {
  const nuevas = avisos.filter(a => !a.leida).map(a => a.id);
  const el = hoja(avisos.length ? `<ul class="slr-avisos">${avisos.map(tarjetaAviso).join('')}</ul>`
    : '<div class="slr-vacio"><b>Sin avisos</b><p>Aquí llegan los resultados, cobros, cláusulas y ofertas.</p></div>',
  { titulo: 'Avisos' });
  el.querySelectorAll('[data-aviso]').forEach(b => b.addEventListener('click', () => {
    const n = avisos.find(a => String(a.id) === b.dataset.aviso);
    if (n) irAlAviso(n).catch(() => {});
  }));
  if (!nuevas.length) return;
  avisos.forEach(a => { a.leida = true; });
  pintarCampana();
  rpc('slr_notificaciones', { marcar_leidas: nuevas }, { silencioso: true }).catch(() => {});
}

// Cierra la hoja de avisos y, cuando el historial ha vuelto, sigue
function trasCerrarAvisos(siguiente) {
  window.addEventListener('popstate', () => setTimeout(siguiente, 0), { once: true });
  cerrarCapa();
}

async function irAlAviso(n) {
  const ctx = { navegar, recargar, pintar, datos };
  if (n.destino_tipo === 'carta') {
    // Encima de los avisos: al cerrar el detalle se vuelve a la lista
    const { abrirDetalle } = await import('./pantallas/detalle.js');
    return abrirDetalle(n.destino_id, ctx);
  }
  if (n.destino_tipo === 'partido') {
    const { abrirCronica } = await import('./pantallas/cronica.js');
    return abrirCronica(n.destino_id, ctx);
  }
  if (n.destino_tipo === 'mercado') {
    // Ofertas e intercambios por responder, subastas perdidas: su sub-pestaña del Mercado
    return trasCerrarAvisos(async () => { mercado.irA(n.destino_id); await navegar('mercado'); });
  }
  if (n.destino_tipo === 'movimientos' || n.destino_tipo === 'liga') {
    trasCerrarAvisos(async () => {
      if (n.destino_tipo === 'liga') await recargar('liga');
      await navegar(n.destino_tipo === 'liga' ? 'liga' : 'perfil');
      const destino = main?.querySelector(n.destino_tipo === 'liga' ? '[data-estado-liga]' : '[data-movimientos]');
      if (!destino) return;
      destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
      destino.classList.add('es-destacado');
      setTimeout(() => destino.classList.remove('es-destacado'), 1800);
    });
  }
}

function pintarBarra() {
  pintarCampana();
  const saldo = raiz?.querySelector('.slr-barra__saldo');
  if (!saldo) return;
  saldo.hidden = !datos.equipo;
  saldo.innerHTML = datos.equipo ? `<span class="slr-monedas">${miles(datos.equipo.saldo)}</span>` : '';
  raiz.querySelector('.slr-nav').hidden = !datos.equipo;
}

export function navegar(id, { arriba = true } = {}) {
  seccion = id;
  raiz.querySelectorAll('.slr-nav__item').forEach(b => {
    const activa = b.dataset.seccion === id;
    b.classList.toggle('activa', activa);
    b.setAttribute('aria-current', activa ? 'page' : 'false');
  });
  return pintar({ arriba });
}

/* ── Pintar una pantalla con sus datos ───────────────────────────────────────
   Cada pantalla usa la clave 'base' (lo de la entrada) y, Mercado, Liga y Perfil,
   además la suya (su módulo exporta cargar(ctx): UNA llamada).
   · Datos de hace menos de 15 s (DATOS_FRESCOS_MS): se pinta tal cual, sin esperar.
   · Si no: lo de la última vez de fondo, atenuado y sin poder tocarlo, y en el
     centro la rueda de «arrastrar para recargar» de la Shits League (#ptrSpinner)
     hasta que llegan los frescos. La primera vez, sin nada guardado, solo la rueda.
   · Las pestañas de abajo funcionan siempre: lo que llegue tarde de una pantalla
     que ya no se ve no pinta nada (contador `pintando`).
   · Al terminar, se piden en segundo plano los datos de las otras pestañas. */
const modulo = id => (!datos.liga || !datos.equipo ? previa : SECCIONES.find(s => s.id === id).modulo);
const clavesDe = id => (datos.liga && datos.equipo && modulo(id).cargar ? ['base', id] : ['base']);
const cargadorDe = clave => (clave === 'base' ? cargarBase : () => modulo(clave).cargar({ datos }));

// La rueda de la Shits League, en el centro, por encima de Rush
function rueda(si) {
  const r = document.getElementById('ptrSpinner');
  if (!r) return;
  if (si) { r.dataset.rush = '1'; r.classList.add('visible'); }
  else if (r.dataset.rush) { delete r.dataset.rush; r.classList.remove('visible'); }
}

async function dibujar(n, id, dato, { atenuada = false, arriba = false } = {}) {
  const cont = crear(`<div class="slr-pantalla" data-seccion="${id}"></div>`);
  const ctx = { navegar, recargar, pintar, datos, pantalla: dato, invalidar };
  try {
    await modulo(id).pintar(cont, ctx);
  } catch (e) {
    if (e instanceof ErrorSesion) return false;
    console.error('[rush]', e);
    pintarError(cont, e);
  }
  if (n !== pintando || !main) return false;   // otra pantalla se pintó mientras tanto
  cont.classList.toggle('es-atenuada', atenuada);
  cont.inert = atenuada;
  if (atenuada) cont.setAttribute('aria-busy', 'true');
  main.replaceChildren(cont);
  if (arriba) main.scrollTop = 0;
  return true;
}
function pintarError(cont, e) {
  cont.innerHTML = `<div class="slr-vacio"><b>Algo ha fallado</b><p>${esc(e.message)}</p>
    <button class="slr-btn" type="button" data-reintentar>Reintentar</button></div>`;
  cont.querySelector('[data-reintentar]').addEventListener('click', () => pintar({ frescos: true }));
}

// frescos: pedirlo todo otra vez aunque lo guardado sea de hace menos de 15 s
export async function pintar({ arriba = false, frescos = false } = {}) {
  const n = ++pintando, id = seccion;
  rueda(false);
  const claves = clavesDe(id);
  const guardados = await Promise.all(claves.map(guardado));
  if (n !== pintando) return;
  const hayTodo = guardados.every(Boolean);
  const todoFresco = !frescos && hayTodo && guardados.every(esFresco);
  if (hayTodo) {
    aplicarBase(guardados[0].datos);
    pintarBarra();
    await dibujar(n, id, guardados[1]?.datos, { atenuada: !todoFresco, arriba });
    if (todoFresco) { precargarOtras(); return; }
  } else if (main) {
    main.replaceChildren();
  }
  if (n !== pintando) return;
  rueda(true);
  try {
    const nuevos = await Promise.all(claves.map((c, i) => (!frescos && esFresco(guardados[i]) ? guardados[i].datos : pedir(c, cargadorDe(c)))));
    if (n !== pintando) return;
    aplicarBase(nuevos[0]);
    pintarBarra();
    pintarPendiente();
    await dibujar(n, id, nuevos[1], { arriba: arriba && !hayTodo });
  } catch (e) {
    if (e instanceof ErrorSesion || n !== pintando) return;
    console.error('[rush]', e);
    if (!hayTodo) {
      const cont = crear(`<div class="slr-pantalla" data-seccion="${id}"></div>`);
      pintarError(cont, e);
      main?.replaceChildren(cont);
    } else {
      // Se queda lo de la última vez (ya se puede tocar) y se avisa
      const cont = main?.querySelector('.slr-pantalla');
      if (cont) { cont.classList.remove('es-atenuada'); cont.inert = false; cont.removeAttribute('aria-busy'); }
      toast(e.red ? 'Sin conexión: se ve lo de la última vez' : `No se pudieron actualizar los datos: ${e.message}`, 'error');
    }
  } finally {
    if (n === pintando) rueda(false);
  }
  precargarOtras();
}

// En segundo plano, de una en una: los datos de las otras pestañas principales que no estén frescos
let precargando = false;
function precargarOtras() {
  if (precargando || !datos.equipo) return;
  precargando = true;
  (window.requestIdleCallback ?? (cb => setTimeout(cb, 300)))(async () => {
    try {
      for (const s of SECCIONES) {
        for (const c of clavesDe(s.id)) {
          if (!raiz) return;
          if (esFresco(await guardado(c))) continue;
          await pedir(c, cargadorDe(c)).catch(() => {});
        }
      }
    } finally { precargando = false; }
  }, { timeout: 2000 });
}

/* ── Fotos en segundo plano ──────────────────────────────────────────────────
   Cuando no hay nada importante cargando, se bajan las fotos pequeñas que
   probablemente se verán: las propias, las del rival de la jornada, las del
   mercado y la subasta del día y, solo el admin, el catálogo (precarga-fotos.js). */
async function precargarFotosDeFondo() {
  if (!datos.equipo) return;
  precargarFotos('propias', datos.cartas.map(c => c.imagen_url));
  precargarFotos('rival', datos.fotosRival ?? []);   // llegan con slr_rush_inicio
  if (datos.mercado) fotosDelMercado(datos.mercado);
  if (datos.yo?.es_admin) {
    const d = await leer('disenos_carta?select=imagen_url&imagen_url=not.is.null&limit=5000').catch(() => []);
    precargarFotos('catalogo', d.map(x => x.imagen_url));
  }
}

/* ── Abrir y cerrar ──────────────────────────────────────────────────────── */
function alVolver(e) {
  const profundidad = e.state?.slr;
  if (typeof profundidad === 'number') ajustarCapas(profundidad);
  else cerrar();
}

function construir() {
  raiz = crear(`
    <div class="slr" id="slr" role="application" aria-label="Shits League Rush">
      <header class="slr-barra">
        <div class="slr-barra__logo"><span>SL</span><b>RUSH</b></div>
        <div class="slr-barra__saldo" hidden></div>
        <button class="slr-barra__avisos" type="button" aria-label="Avisos" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg><b></b>
        </button>
        <button class="slr-barra__salir" type="button">✕ Salir</button>
      </header>
      <main class="slr-main"></main>
      <nav class="slr-nav" hidden>
        ${SECCIONES.map(s => `
          <button class="slr-nav__item" type="button" data-seccion="${s.id}">
            <svg viewBox="0 0 24 24" aria-hidden="true">${s.icono}</svg><span>${s.texto}</span>
          </button>`).join('')}
      </nav>
    </div>`);
  main = raiz.querySelector('.slr-main');
  raiz.querySelector('.slr-barra__salir').addEventListener('click', salir);
  raiz.querySelector('.slr-barra__avisos').addEventListener('click', abrirAvisos);
  raiz.querySelectorAll('.slr-nav__item').forEach(b => b.addEventListener('click', () => navegar(b.dataset.seccion)));
  document.body.appendChild(raiz);
  fijarRaiz(raiz);
  iniciarAcabados(raiz);
  document.documentElement.classList.add('slr-abierto');
  history.pushState({ slr: 0 }, '');
  window.addEventListener('popstate', alVolver);
}

export function salir() {
  if (!raiz) return;
  history.go(-(capasAbiertas() + 1));   // el popstate cierra Rush
}

function cerrar() {
  if (!raiz) return;
  window.removeEventListener('popstate', alVolver);
  ajustarCapas(0);
  pararAcabados();
  raiz.remove();
  raiz = main = null;
  fijarRaiz(null);
  document.documentElement.classList.remove('slr-abierto');
  opciones.alSalir?.();
}

export async function abrir(op) {
  opciones = op;
  datos.jugador = op.jugador;
  configurarSesion({ reautenticar: op.reautenticar, sesionPerdida: op.sesionPerdida, sinAcceso: op.sinAcceso });
  // Lo guardado es de este jugador y de esta liga (principal, o la de prueba en local)
  fijarAmbito(`${op.jugador}|${ES_LOCAL ? 'prueba' : 'principal'}`);
  if (!raiz) construir();
  // El índice de la caché de fotos antes de pintar: las guardadas salen sin esqueleto.
  // pintar() enseña lo de la última vez (atenuado) o la rueda, y pide lo fresco
  // Si lo pedido al pulsar JUGAR ya ha llegado, cuenta como fresco: se pinta directamente
  const pre = tomarPrecarga();
  const yaLlego = pre?.llegada ? pre.promesa.then(b => pedir('base', () => cargarBase(b))).catch(() => {}) : null;
  if (pre && !yaLlego) window.rushPrecarga = pre;   // aún de camino: la recoge cargarBase
  await Promise.all([yaLlego, cargarIndice()]);
  await navegar(seccion);
  if (!raiz || !datos.equipo) return;
  pintarCampana();
  pintarPendiente();
  if (datos.huecoPendiente && !datos.sobrePendiente) abrirHuecoPendiente();
  precargarFotosDeFondo().catch(() => {});
}

/* ── Pendientes que reaparecen en cualquier pantalla: elección de sobre y
   «Haz hueco» tras un sobre (cartas de más). abrirHueco: abre ya la hoja ── */
export async function comprobarPendiente({ abrirHueco = false } = {}) {
  if (!datos.liga || !datos.equipo) return;
  const [p, h] = await Promise.all([
    rpc('slr_sobre_pendiente', { liga_id: datos.liga.id }, { silencioso: true }).catch(() => null),
    rpc('slr_hueco_pendiente', { liga_id: datos.liga.id }, { silencioso: true }).catch(() => null),
  ]);
  datos.sobrePendiente = p;
  datos.huecoPendiente = h?.sobran > 0 ? h : null;
  pintarPendiente();
  if (abrirHueco && datos.huecoPendiente && !datos.sobrePendiente) abrirHuecoPendiente();
}
function abrirHuecoPendiente() {
  abrirHacerHueco({ navegar, recargar, pintar, datos }, datos.huecoPendiente, { alTerminar: () => { comprobarPendiente(); pintar(); } });
}
export function pintarPendiente() {
  if (!raiz) return;
  raiz.querySelector('.slr-pendiente-global')?.remove();
  const h = datos.huecoPendiente;
  if (h && !datos.sobrePendiente) {
    const b = crear(`<button class="slr-pendiente-global slr-pendiente-global--hueco" type="button" data-hueco-global>📦 Te sobran ${h.sobran} ${h.sobran === 1 ? 'carta' : 'cartas'}: haz hueco <small>Elegir ›</small></button>`);
    b.addEventListener('click', abrirHuecoPendiente);
    raiz.appendChild(b);
    return;
  }
  const p = datos.sobrePendiente;
  if (!p || new Date(p.caduca_en) <= Date.now()) return;
  const b = crear(`<button class="slr-pendiente-global" type="button" data-pendiente-global>🎴 Tienes una elección de sobre pendiente <small>Elegir ›</small></button>`);
  b.addEventListener('click', () => abrirEleccionPendiente({ navegar, recargar, pintar, datos }, p,
    { dorso: datos.dorsoUrl ?? null, alTerminar: () => { comprobarPendiente({ abrirHueco: true }); pintar(); } }));
  raiz.appendChild(b);
}

export const recargarAvisos = cargarAvisos;
