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
import { cargarColecciones } from './colecciones.js';
import * as previa from './pantallas/previa.js';
import * as plantilla from './pantallas/plantilla.js';
import * as mercado from './pantallas/mercado.js';
import * as liga from './pantallas/liga.js';
import * as perfil from './pantallas/perfil.js';
import * as alineacion from './pantallas/alineacion.js';
import { abrirEleccionPendiente } from './pantallas/apertura.js';
import { abrirHacerHueco } from './hueco.js';
import { cargarIndice } from './imagenes.js';
import { precargarFotos, fotosDelMercado, imagenDe } from './precarga-fotos.js';

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

/* ── Carga ───────────────────────────────────────────────────────────────── */
function mismoNombre(a, b) {
  const n = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return !!a && n(a) === n(b);
}

async function cargarYo() {
  let yo = await rpc('slr_yo', {}, { silencioso: true });
  if (!mismoNombre(yo.usuario.nombre, datos.jugador)) {
    // La sesión de Rush es de otra persona: otra sesión en silencio con el
    // código guardado; si tampoco encaja, se cierra la sesión de Shits League
    borrarToken();
    if (await opciones.reautenticar() === 'ok') yo = await rpc('slr_yo', {}, { silencioso: true });
    if (!mismoNombre(yo.usuario.nombre, datos.jugador)) {
      borrarToken();
      opciones.sesionPerdida();
      throw new ErrorSesion('La sesión de Rush no coincide con la de Shits League');
    }
  }
  if (!yo.tiene_acceso) {
    opciones.sinAcceso();
    throw new ErrorSesion('Sin acceso a la beta de Rush');
  }
  datos.yo = yo;
  const prueba = ES_LOCAL ? yo.ligas.find(l => l.es_prueba) : null;
  datos.liga = prueba ?? (yo.liga_principal ? { ...yo.liga_principal, es_prueba: false } : null);
  datos.equipo = datos.liga ? yo.equipos.find(e => e.liga_id === datos.liga.id) ?? null : null;
}

async function cargarCartas() {
  const eq = datos.equipo.id;
  const [filas, ventas] = await Promise.all([
    leer(`cartas?select=id,diseno_id,equipo_id,multiplicador_clausula,blindada_hasta,tocada_en_jornada,adquirida_en,energia,` +
      `disenos_carta(nombre,tipo,acabado,color,tier,rareza,coleccion_id,perfil,personas,ata,def,con,valor,poderes,imagen_url,texto,estamina,tactica_favorita)&equipo_id=eq.${eq}`),
    leer(`ventas?select=id,carta_id,precio&vendedor_id=eq.${eq}&estado=eq.activa`),
  ]);
  datos.cartas = filas.map(f => ({
    ...normalizarCarta(f),
    multiplicador: Number(f.multiplicador_clausula),
    clausula: Math.round(f.disenos_carta.valor * Number(f.multiplicador_clausula)),
    blindada_hasta: f.blindada_hasta && new Date(f.blindada_hasta) > Date.now() ? f.blindada_hasta : null,
    tocada_en_jornada: f.tocada_en_jornada,
    adquirida_en: f.adquirida_en,
    en_venta: ventas.find(v => v.carta_id === f.id) ?? null,
  }));
}

async function cargarLiga() {
  const id = datos.liga.id;
  // Todo a la vez (antes iban en tres tandas: liga → temporada → calendario)
  const [[info], [temporada], cal, publicadas] = await Promise.all([
    leer(`ligas?select=id,nombre,estado,temporada,config,pausada_en&id=eq.${id}`),
    leer(`temporadas?select=id,numero,estado,iniciada_en,terminada_en&liga_id=eq.${id}&order=numero.desc&limit=1`),
    datos.equipo ? rpc('slr_calendario', { liga_id: id }) : null,
    datos.equipo ? leer(`jornadas?select=id,publicada_en&liga_id=eq.${id}&limit=500`) : [],
    cargarColecciones(id),            // para el fondo, el emblema y el nombre de la colección de cada carta
    datos.equipo ? rpc('slr_sin_ver', { liga_id: id }, { silencioso: true }).catch(() => null) : null,
  ]).then(r => { datos.sinVer = r[5]?.sin_ver ?? null; return r; });
  datos.ligaInfo = info;
  datos.temporada = temporada ?? null;
  if (!datos.equipo) { datos.jornadas = []; return; }
  // slr_calendario no trae publicada_en (hace falta para saber si la alineación está confirmada)
  datos.jornadas = (cal.temporada && cal.temporada.id === temporada?.id ? cal.jornadas : [])
    .map(j => ({ ...j, publicada_en: publicadas.find(p => p.id === j.id)?.publicada_en ?? null }));
}

// La alineación es pública; las tácticas guardadas (motor v2) solo las lee su dueño
async function cargarAlineacion() {
  const [[al], tac] = await Promise.all([
    leer(`alineaciones?equipo_id=eq.${datos.equipo.id}`),
    rpc('slr_mis_tacticas', { equipo_id: datos.equipo.id }, { silencioso: true }).catch(() => null),
  ]);
  datos.alineacion = al ?? null;
  datos.tacticas = tac ?? { tactica: 'posesion', plan_b: null, gestion: 'normal', cambios_avanzados: [] };
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
  // Lo que quedaba pendiente de ese partido (bonus de sorpresa y ojo clínico) ya se ha cobrado
  if (r.cobrado > 0) {
    toast(`Bonus del partido: +${miles(r.cobrado)}`, 'ok');
    await recargar('yo').catch(() => {});
  }
  if (antes && antes !== datos.sinVer?.partido_id) pintar().catch(() => {});
}

// partes: 'yo', 'liga', 'cartas', 'alineacion' (sin partes, todo)
export async function recargar(...partes) {
  const todo = !partes.length, toca = p => todo || partes.includes(p);
  if (toca('yo')) await cargarYo();
  if (!datos.liga) return;
  const tareas = [];
  if (toca('liga')) tareas.push(cargarLiga());
  if (datos.equipo && toca('cartas')) tareas.push(cargarCartas());
  if (datos.equipo && toca('alineacion')) tareas.push(cargarAlineacion());
  await Promise.all(tareas);
  pintarBarra();
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

export async function pintar({ arriba = false } = {}) {
  const n = ++pintando;
  const cont = crear(`<div class="slr-pantalla" data-seccion="${seccion}"></div>`);
  const ctx = { navegar, recargar, pintar, datos };
  try {
    if (!datos.liga || !datos.equipo) await previa.pintar(cont, ctx);
    else await SECCIONES.find(s => s.id === seccion).modulo.pintar(cont, ctx);
  } catch (e) {
    if (e instanceof ErrorSesion) return;
    console.error('[rush]', e);
    cont.innerHTML = `<div class="slr-vacio"><b>Algo ha fallado</b><p>${esc(e.message)}</p>
      <button class="slr-btn" type="button" data-reintentar>Reintentar</button></div>`;
    cont.querySelector('[data-reintentar]').addEventListener('click', () => recargar().then(() => pintar()));
  }
  if (n !== pintando || !main) return;  // otra pantalla se pintó mientras tanto
  main.replaceChildren(cont);
  if (arriba) main.scrollTop = 0;
}

function pintarCargando(texto = 'Cargando…') {
  main.innerHTML = `<div class="slr-cargando"><span class="slr-balon"></span>${esc(texto)}</div>`;
}

/* ── Fotos en segundo plano ──────────────────────────────────────────────────
   Cuando no hay nada importante cargando, se bajan las fotos pequeñas que
   probablemente se verán: las propias, las del rival de la jornada, las del
   mercado y la subasta del día y, solo el admin, el catálogo (precarga-fotos.js). */
async function precargarFotosDeFondo() {
  if (!datos.equipo) return;
  precargarFotos('propias', datos.cartas.map(c => c.imagen_url));
  const p = miPartido(proximaJornada());
  const rival = p && (p.local.equipo_id === datos.equipo.id ? p.visitante.equipo_id : p.local.equipo_id);
  if (rival) {
    const filas = await leer(`cartas?select=disenos_carta(imagen_url)&equipo_id=eq.${rival}`).catch(() => []);
    precargarFotos('rival', filas.map(imagenDe));
  }
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
  if (!raiz) construir();
  pintarCargando();
  try {
    // El índice de la caché de fotos antes de pintar: las guardadas salen sin esqueleto
    await Promise.all([recargar(), cargarIndice()]);
  } catch (e) {
    if (e instanceof ErrorSesion) return;      // sesionPerdida ya ha cerrado la sesión
    main.innerHTML = `<div class="slr-vacio"><b>No se pudo cargar Rush</b><p>${esc(e.message)}</p></div>`;
    toast(e.message, 'error');
    return;
  }
  await navegar(seccion);
  cargarAvisos();
  comprobarPendiente({ abrirHueco: true });
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
