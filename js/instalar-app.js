/* ═══════════════════════════════════════════════
   SHITS LEAGUE — instalar-app.js
   Instalar la app y activar las notificaciones, solo en móvil:
   · en qué situación está cada uno, leído del estado REAL en cada apertura y al volver
     a primer plano. Lo único guardado es la fecha del último aviso de «bloqueadas»;
   · la alarma (js/alarma.js), que sale sola, y el aviso de arriba y el perfil, que la abren;
   · el estado de cada móvil, que se envía al Apps Script para la lista del admin.
   detectarDispositivo, situacionApp, planAlarma y textoNotificaciones no tocan el navegador:
   las prueba tests/slr/instalar-app.test.mjs.
═══════════════════════════════════════════════ */

const BLOQUEADAS_KEY = 'SL_AVISO_BLOQUEADAS';     // la fecha de la última alarma de «bloqueadas»
const BLOQUEADAS_CADA_MS = 7 * 86400000;
const REAPERTURA_MS = 30 * 60000;                // una app no se recarga: tanto tiempo fuera cuenta como abrirla otra vez
const DISPOSITIVO_KEY = 'SL_DISPOSITIVO';
const SILENCIO_KEY = 'slr_partido_silencio';   // el botón de sonido de Rush: quien lo quitó no quiere ruidos

/* ── En qué situación está ───────────────────────────────────────────────── */
// Móvil: iPhone o Android con «Mobile». Los iPad se presentan como Mac, con pantalla táctil.
function detectarDispositivo({ ua = '', plataforma = '', toques = 0 } = {}) {
  const ipad = /iPad/.test(ua) || (plataforma === 'MacIntel' && toques > 1);
  if (ipad) return { movil: false, plataforma: 'otra' };
  if (/iPhone|iPod/.test(ua)) return { movil: true, plataforma: 'iphone' };
  if (/Android/.test(ua)) return { movil: /Mobile/.test(ua), plataforma: 'android' };
  return { movil: false, plataforma: 'otra' };
}

// Qué le toca a este móvil, en cualquier momento:
//   alarmas: las que salen solas al abrir, por orden ('iphone', 'instalar', 'abrir', 'notificaciones', 'bloqueadas')
//   aviso: lo fijo de arriba ('iphone', 'instalar', 'notificaciones', 'bloqueadas' o null)
//   suscribir: tiene el permiso pero OneSignal no lo tiene suscrito (suscrito: null es que aún no se sabe)
function situacionApp({ movil, plataforma, instalada, permiso, suscrito, yaInstalada }) {
  if (!movil) return { alarmas: [], aviso: null, suscribir: false };
  // En iPhone, sin instalar no hay notificaciones que valgan: solo se pide instalar
  if (plataforma === 'iphone' && !instalada) return { alarmas: ['iphone'], aviso: 'iphone', suscribir: false };
  const suscribir = permiso === 'granted' && suscrito === false;
  // Ya la tiene: que la abra. El permiso del navegador y el de la app son el mismo
  if (!instalada && yaInstalada) return { alarmas: ['abrir'], aviso: null, suscribir };
  // En el navegador solo se pide instalar: las notificaciones se piden dentro de la app
  if (!instalada) return { alarmas: ['instalar'], aviso: 'instalar', suscribir };
  if (permiso === 'default') return { alarmas: ['notificaciones'], aviso: 'notificaciones', suscribir };
  if (permiso === 'denied') return { alarmas: ['bloqueadas'], aviso: 'bloqueadas', suscribir };
  return { alarmas: [], aviso: null, suscribir };
}

// Cómo se abre cada alarma. caso: las instrucciones que enseña
function planAlarma(tipo, { plataforma }) {
  const bloqueadas = plataforma === 'iphone' ? 'bloqueadas-iphone' : 'bloqueadas-android';
  if (tipo === 'iphone') return { modo: 'iphone', accion: 'nada' };
  if (tipo === 'abrir') return { modo: 'abrir', accion: 'nada', caso: 'abrir' };
  // Sin el evento del navegador (puede llegar mientras está abierta), lanzarInstalar enseña los pasos a mano
  if (tipo === 'instalar') return { modo: 'instalar', accion: 'instalar', caso: 'instalar' };
  if (tipo === 'notificaciones') return { modo: 'notificaciones', accion: 'permiso', caso: bloqueadas };
  return { modo: 'bloqueadas', accion: 'nada', caso: bloqueadas };
}

function textoNotificaciones({ permiso, suscrito }) {
  if (permiso === 'denied') return 'bloqueadas';
  return permiso === 'granted' && suscrito ? 'activadas' : 'desactivadas';
}

/* ── El estado de este móvil ─────────────────────────────────────────────── */
let eventoInstalar = null;
let suscritoOneSignal = null;
let yaInstalada = false;     // Android, en el navegador: la app está instalada en este móvil

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();        // sin la barrita del navegador: se ofrece desde nuestra tarjeta
  eventoInstalar = e;
  pintarAvisoApp();
});

function estadoApp() {
  const n = navigator;
  const { movil, plataforma } = detectarDispositivo({ ua: n.userAgent, plataforma: n.platform, toques: n.maxTouchPoints });
  const instalada = window.matchMedia('(display-mode: standalone)').matches || n.standalone === true;
  const permiso = typeof Notification === 'undefined' ? 'no_disponible' : Notification.permission;
  return { movil, plataforma, instalada, permiso, suscrito: suscritoOneSignal, yaInstalada };
}

// Solo Chrome en Android sabe decirlo. Si no lo sabe, se le trata como a quien no la tiene: es mejor
// insistirle de más que decirle a alguien sin la app que ya la tiene (por eso tampoco vale como
// pista que no llegue beforeinstallprompt: no llega por muchas otras razones)
async function mirarAppInstalada() {
  if (yaInstalada || !navigator.getInstalledRelatedApps) return;
  try { yaInstalada = (await navigator.getInstalledRelatedApps()).length > 0; } catch { /* no se sabe */ }
}

function idDispositivo() {
  try {
    let id = localStorage.getItem(DISPOSITIVO_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(DISPOSITIVO_KEY, id);
    }
    return id;
  } catch { return ''; }
}

function tocaAvisoBloqueadas() {
  try { return Date.now() - (Number(localStorage.getItem(BLOQUEADAS_KEY)) || 0) >= BLOQUEADAS_CADA_MS; } catch { return false; }
}
const apuntarAvisoBloqueadas = () => { try { localStorage.setItem(BLOQUEADAS_KEY, String(Date.now())); } catch { /* sin persistencia */ } };

/* ── La alarma ───────────────────────────────────────────────────────────── */
// Se carga en cuanto hay aviso: al tocarlo ya está y la sirena sale dentro del propio toque
let alarmaModulo = null;
const cargarAlarma = () => (alarmaModulo ??= import('./alarma.js'));

const pasosAlarma = lista => `<ol class="al__pasos">${lista.map((p, i) => `<li><i>${i + 1}</i><span>${p}</span></li>`).join('')}</ol>`;
const INSTRUCCIONES_APP = {
  instalar: pasosAlarma(['Toca el menú <b>⋮</b> del navegador, arriba a la derecha', 'Toca <b>Instalar app</b> o <b>Añadir a pantalla de inicio</b>', 'Abre la app desde el <b>icono nuevo</b>']),
  'bloqueadas-android': pasosAlarma(['Abre los <b>Ajustes</b> del móvil', 'Entra en <b>Aplicaciones</b> y luego en <b>Shits League</b>', 'Toca <b>Notificaciones</b> y <b>actívalas</b>']),
  // Abrirla desde la web no es fiable (intents, enlaces): se explica cómo
  abrir: pasosAlarma(['Abre el icono de <b>Shits League</b> en tu pantalla de inicio', 'O en Chrome: menú <b>⋮</b> → <b>Abrir en Shits League</b>']),
  'bloqueadas-iphone': pasosAlarma(['Abre los <b>Ajustes</b> del iPhone', 'Entra en <b>Notificaciones</b> y luego en <b>Shits League</b>', 'Activa <b>Permitir notificaciones</b>']),
};

const urlSonido = f => new URL(`audio/alarma/${f}`, document.baseURI).href;
const SONIDOS_ALARMA = () => ({ sirena: urlSonido('alarma-sirena.mp3'), boom: urlSonido('alarma-boom.mp3') });
function alarmaEnSilencio() {
  try { return localStorage.getItem(SILENCIO_KEY) === '1'; } catch { return false; }
}

async function lanzarInstalar() {
  const evento = eventoInstalar;
  if (!evento) return 'mal';
  evento.prompt();
  const { outcome } = await evento.userChoice;
  eventoInstalar = null;
  return outcome === 'accepted' ? 'ok' : 'mal';
}

const ACCIONES_ALARMA = {
  instalar: lanzarInstalar,
  permiso: () => pushPedirPermiso(),
  nada: async () => 'nada',
};

// Abre esa alarma y dice cómo ha acabado; null si ya hay una abierta o no se ha podido cargar
let alarmaAbierta = false;
async function abrirAlarma(tipo) {
  if (alarmaAbierta) return null;
  alarmaAbierta = true;
  try {
    const plan = planAlarma(tipo, estadoApp());
    const { mostrarAlarma } = await cargarAlarma();
    const r = await mostrarAlarma({
      modo: plan.modo,
      accion: ACCIONES_ALARMA[plan.accion],
      instrucciones: INSTRUCCIONES_APP[plan.caso] ?? '',
      sonidos: SONIDOS_ALARMA(),
      silencio: alarmaEnSilencio(),
    });
    if (tipo === 'instalar' && r === 'ok') yaInstalada = true;
    // Al bloquearlas acaba de ver los pasos: la semana empieza a contar
    if (tipo === 'bloqueadas' || (tipo === 'notificaciones' && r === 'mal')) apuntarAvisoBloqueadas();
    return r;
  } catch (e) {
    alarmaModulo = null;
    console.warn('[app] No se ha podido abrir la alarma:', e.message);
    return null;
  } finally {
    alarmaAbierta = false;
    refrescarEstadoApp();
  }
}

// Las que salen solas. En cada una se mira otra vez qué toca
async function lanzarAlarmas() {
  // Con un navegador automático (los bancos de pruebas), no: taparía todo lo que prueban
  if (navigator.webdriver || document.visibilityState !== 'visible') return;
  for (const tipo of situacionApp(estadoApp()).alarmas) {
    if (tipo === 'bloqueadas' && !tocaAvisoBloqueadas()) continue;
    const r = await abrirAlarma(tipo);
    if (r === null) return;
  }
}

/* ── El aviso de arriba ──────────────────────────────────────────────────── */
const INSTALA_LA_APP = { titulo: 'Instala la app', texto: 'Va más rápido y te llegan los avisos' };
const AVISOS_APP = {
  iphone: INSTALA_LA_APP,
  instalar: INSTALA_LA_APP,
  notificaciones: { titulo: 'Activa las notificaciones', texto: 'Para enterarte de los partidos y del MVP' },
  bloqueadas: { titulo: 'Tienes las notificaciones bloqueadas', icono: 'campana-no', clase: ' instalar-aviso--mal' },
};

function pintarAvisoApp() {
  const el = document.getElementById('instalarAviso');
  if (!el) return;
  const { aviso } = situacionApp(estadoApp());
  el.className = `instalar-aviso${AVISOS_APP[aviso]?.clase ?? ''}`;
  if (!aviso) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const t = AVISOS_APP[aviso];
  const dentro = `${t.icono ? icono(t.icono) : ''}<span class="instalar-aviso__textos"><b>${t.titulo}</b>${t.texto ? `<span>${t.texto}</span>` : ''}</span>`;
  cargarAlarma().catch(() => { alarmaModulo = null; });
  el.innerHTML = `<button class="instalar-aviso__toque" type="button" data-app-paso="${aviso}">${dentro}</button>`;
  el.hidden = false;
}

/* ── El perfil ───────────────────────────────────────────────────────────── */
function pintarPerfilApp() {
  const caja = document.getElementById('sessionApp');
  if (!caja) return;
  const e = estadoApp();
  caja.hidden = !e.movil;
  if (e.movil) {
    const { aviso } = situacionApp(e);
    const notif = textoNotificaciones(e);
    caja.innerHTML = `
      <p class="perfil-app__linea">App: <b>${e.instalada || e.yaInstalada ? 'instalada' : 'sin instalar'}</b></p>
      <p class="perfil-app__linea">Notificaciones: <b class="perfil-app__${notif}">${notif}</b></p>
      ${aviso ? `<button class="dialog-box__btn" type="button" data-app-paso="${aviso}">${AVISOS_APP[aviso].titulo.toUpperCase()}</button>` : ''}`;
  }
  pintarPerfilAdmin();
}

/* ── Para el admin ───────────────────────────────────────────────────────── */
// Solo enseña los botones: quien comprueba que eres admin es el Apps Script, con tu código
const esAdminLiga = () => AJUSTES_LIGA.admins.includes(getSessionPlayer());
const escaparApp = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Secciones desplegables, cerradas por defecto; se recuerda cuáles quedaron abiertas. El esqueleto se
   pinta una vez: lo que hay dentro de cada sección (una lista abierta, lo que se está escribiendo)
   sobrevive a los refrescos del estado del móvil, y cada resultado sale debajo de su botón. */
const ADMIN_SECCIONES_KEY = 'SL_ADMIN_SECCIONES';
function seccionesAdminAbiertas() {
  try { return JSON.parse(localStorage.getItem(ADMIN_SECCIONES_KEY) || '[]'); } catch { return []; }
}
const seccionAdmin = (id, titulo, cuerpo) => `
  <details class="perfil-admin__seccion" data-admin-seccion="${id}"${seccionesAdminAbiertas().includes(id) ? ' open' : ''}>
    <summary>${titulo}</summary>
    <div class="perfil-admin__cuerpo">${cuerpo}</div>
  </details>`;
const botonAdmin = (accion, texto) => `
  <button class="dialog-box__btn dialog-box__btn--ghost" type="button" data-admin-accion="${accion}">${texto}</button>`;
const salidaDe = accion => `<div class="perfil-admin__salida" data-salida-de="${accion}"></div>`;
const seccionAdminAbierta = id => !!document.querySelector(`[data-admin-seccion="${id}"]`)?.open;

function alCambiarSeccionAdmin(e) {
  const id = e.target.dataset?.adminSeccion;
  if (!id) return;
  const abiertas = [...document.querySelectorAll('[data-admin-seccion]')].filter(d => d.open).map(d => d.dataset.adminSeccion);
  try { localStorage.setItem(ADMIN_SECCIONES_KEY, JSON.stringify(abiertas)); } catch { /* sin persistencia */ }
  if (!e.target.open) return;
  if (id === 'dispositivo') pintarDiagnostico();
  if (id === 'temporada') leerRecuentoAdmin();
}

function pintarPerfilAdmin() {
  const caja = document.getElementById('sessionAdmin');
  if (!caja) return;
  caja.hidden = !esAdminLiga();
  if (caja.hidden) return;
  if (!caja.dataset.pintado) {
    caja.dataset.pintado = '1';
    caja.addEventListener('toggle', alCambiarSeccionAdmin, true);   // toggle no burbujea
    caja.innerHTML = `
      <h3 class="perfil-admin__titulo">Admin</h3>
      ${seccionAdmin('temporada', 'Temporada', `
        <div data-admin-agujero-caja></div>
        ${salidaDe('agujero')}
        <div data-admin-recuento></div>
        <div data-admin-pistoletazo-caja></div>
        <div class="perfil-admin__salida" data-admin-salida></div>`)}
      ${seccionAdmin('notificaciones', 'Notificaciones', `
        ${botonAdmin('prueba', 'ENVIARME UNA NOTIFICACIÓN DE PRUEBA')}
        ${salidaDe('prueba')}
        ${botonAdmin('simulacro', 'SIMULACRO DE AVISOS')}
        <p class="perfil-admin__nota">Muestra qué avisos automáticos del calendario se enviarían ahora, sin enviar ninguno</p>
        ${salidaDe('simulacro')}
        ${botonAdmin('lista', 'QUIÉN TIENE LA APP Y LAS NOTIFICACIONES')}
        ${salidaDe('lista')}`)}
      ${seccionAdmin('dispositivo', 'Este dispositivo', `
        ${botonAdmin('reparar', 'REPARAR NOTIFICACIONES')}
        ${salidaDe('reparar')}
        <div class="perfil-admin__diagnostico" data-admin-diagnostico>Mirando este dispositivo…</div>`)}`;
    firmaTemporadaAdmin = '';
    setInterval(() => {
      const abierto = document.getElementById('sessionModal')?.classList.contains('open');
      if (abierto && !document.hidden && seccionAdminAbierta('temporada')) leerRecuentoAdmin();
    }, RECUENTO_CADA_MS);
  }
  pintarTemporadaAdmin();
  if (seccionAdminAbierta('dispositivo')) pintarDiagnostico();
  if (seccionAdminAbierta('temporada')) leerRecuentoAdmin();
  leerAgujeroAdmin();
}

/* ── La sección Temporada ────────────────────────────────────────────────── */
// Se vuelve a pintar solo si cambia algo, y nunca lo que se está escribiendo
let firmaTemporadaAdmin = '';
function pintarTemporadaAdmin() {
  const agujero = document.querySelector('[data-admin-agujero-caja]');
  if (!agujero) return;
  const proxima = temporadaProxima(), anterior = temporadaAnteriorAlCurso();
  const firma = JSON.stringify([proxima?.id, anterior?.id, temporadaAgujero()?.id, agujeroAjuste.fase, agujeroAjuste.pregunta]);
  if (firma === firmaTemporadaAdmin || agujero.contains(document.activeElement)) return;
  firmaTemporadaAdmin = firma;
  agujero.innerHTML = temporadaAgujero() ? htmlAgujeroAdmin() : '';
  document.querySelector('[data-admin-pistoletazo-caja]').innerHTML = `
    ${proxima || (anterior && !anterior.imagenes) ? '<h4 class="perfil-admin__subtitulo perfil-admin__subtitulo--aparte">Pistoletazo</h4>' : ''}
    ${proxima ? `<button class="dialog-box__btn" type="button" data-admin-temporada="empezar">EMPEZAR LA ${nombreTemporadaAdmin(proxima).toUpperCase()}</button>` : ''}
    ${anterior && !anterior.imagenes ? `<button class="dialog-box__btn dialog-box__btn--ghost" type="button" data-admin-temporada="deshacer">DESHACER: VOLVER A LA ${nombreTemporadaAdmin(anterior).toUpperCase()}</button>` : ''}`;
}

function htmlAgujeroAdmin() {
  const { fase, pregunta } = agujeroAjuste;
  const opcion = (valor, texto) => `<option value="${valor}"${valor === fase ? ' selected' : ''}>${texto}</option>`;
  return `<h4 class="perfil-admin__subtitulo">Temporada ???</h4>
    <select class="dialog-box__input" data-admin-agujero-fase aria-label="Fase">
      ${opcion('agujero', 'Agujero')}${opcion('votacion', 'Votación')}${opcion('cerrada', 'Cerrada')}
    </select>
    <input class="dialog-box__input" type="text" maxlength="120" data-admin-agujero-pregunta value="${escaparApp(pregunta)}" aria-label="Pregunta">
    <button class="dialog-box__btn" type="button" data-admin-agujero-guardar>GUARDAR LA FASE</button>`;
}

// La guardada se pinta ya; la del servidor, una vez, al abrir el panel por primera vez
let agujeroAdminLeido = false;
async function leerAgujeroAdmin() {
  if (agujeroAdminLeido || !temporadaAgujero()) return;
  agujeroAdminLeido = true;
  if (await pedirAjusteAgujero()) pintarTemporadaAdmin();
}

// El recuento en vivo, con los nombres: mientras se ve la sección, cada poco
const RECUENTO_CADA_MS = 15000;
let recuentoLeidoEn = 0;
async function leerRecuentoAdmin({ ya = false } = {}) {
  const caja = document.querySelector('[data-admin-recuento]');
  if (!caja) return;
  if (!temporadaAgujero()) { caja.innerHTML = ''; return; }
  if (!ya && Date.now() - recuentoLeidoEn < 5000) return;
  recuentoLeidoEn = Date.now();
  try {
    const r = await postScript({ action: 'agujeroRecuento', codigo: getSessionCode() });
    const fila = (clase, titulo, nombres) => `<li class="${clase}"><b>${titulo} · ${nombres.length}</b><span>${nombres.map(escaparApp).join(', ') || 'Nadie'}</span></li>`;
    caja.innerHTML = `<h4 class="perfil-admin__subtitulo perfil-admin__subtitulo--aparte">Recuento en vivo</h4>
      <ul class="perfil-admin__lista">
        ${fila('es-si', 'SÍ', r.si)}${fila('es-no', 'NO', r.no)}${fila('es-falta', 'Faltan por votar', r.faltan)}
      </ul>`;
  } catch (e) {
    caja.textContent = e.message;
  }
}

// Quien comprueba que eres admin es el servidor, con tu sesión de Rush, como el pistoletazo
async function guardarAgujeroAdmin(salida) {
  const fase = document.querySelector('[data-admin-agujero-fase]').value;
  const pregunta = document.querySelector('[data-admin-agujero-pregunta]').value.trim();
  salida.textContent = 'Un momento…';
  try {
    if (await rushReautenticar() !== 'ok') throw new Error('No se ha podido abrir tu sesión de Rush. Vuelve a entrar con tu código.');
    const token = rushToken();
    const yo = await rushRpc('slr_yo', { token });
    const liga = (RUSH_ES_LOCAL && yo.ligas?.find(l => l.es_prueba)) || yo.liga_principal;
    if (!liga) throw new Error('No hay liga');
    await rushRpc('slr_admin_agujero', { token, liga_id: liga.id, fase, pregunta });
    agujeroAjuste = { ...agujeroAjuste, fase, pregunta };
    guardarAgujero();
    actualizarAgujero();
    pintarTemporadaAdmin();
    leerRecuentoAdmin({ ya: true });
    salida.textContent = 'Fase guardada.';
    if (fase !== 'votacion') return;
    // La envía el script, una sola vez. Si ahora no puede, la siguiente pasada de los avisos
    try {
      const r = await postScript({ action: 'avisarAgujero', codigo: getSessionCode() });
      salida.textContent = r.enviado ? 'Fase guardada. Notificación enviada a todos.' : 'Fase guardada. La notificación ya se había enviado.';
    } catch {
      salida.textContent = 'Fase guardada. La notificación saldrá con la siguiente pasada de los avisos.';
    }
  } catch (e) {
    salida.textContent = e.message;
  }
}

// Las notificaciones de ESTE dispositivo
async function pintarDiagnostico() {
  const d = await pushDiagnostico();
  const caja = document.querySelector('[data-admin-diagnostico]');
  if (!caja) return;
  const fila = (nombre, valor) => `<li><b>${nombre}</b><span>${escaparApp(valor)}</span></li>`;
  caja.innerHTML = `<ul class="perfil-admin__lista">
    ${fila('Notification.permission', d.permiso)}
    ${fila('Standalone (app instalada)', d.standalone ? 'sí' : 'no')}
    ${fila('OneSignal cargado', d.onesignal ? 'sí' : 'no')}
    ${fila('optedIn', d.optedIn)}
    ${fila('PushSubscription.id', d.id)}
    ${fila('Token', d.token ? 'sí' : 'no')}
    ${fila('external_id', d.externalId)}
    ${fila('Suscripción del navegador (worker de OneSignal)', d.navegador)}
    ${fila('Service workers', d.workers.join('\n') || 'ninguno')}
    ${fila('Último error de la reparación', d.error)}
  </ul>`;
}


/* ── El pistoletazo de la temporada ──────────────────────────────────────── */
// Por su id: el nombre público de una temporada puede estar oculto en ajustes.js
const nombreTemporadaAdmin = t => `temporada ${t.id.replace('-', '/')}`;

// Empezar: pasa a ser la temporada por defecto para todos y Rush se abre a todos. Deshacer, al revés
function pedirConfirmarTemporada(accion, salida) {
  const empezar = accion === 'empezar';
  const t = empezar ? temporadaProxima() : temporadaAnteriorAlCurso();
  const nombre = nombreTemporadaAdmin(t);
  salida.innerHTML = `
    <p><b>${empezar ? `¿Empezar la ${nombre}?` : `¿Volver a la ${nombre}?`}</b></p>
    <p>${empezar
    ? 'Pasa a ser la temporada por defecto para <b>todos</b> y Rush se abre a todo el mundo. La anterior queda de archivo. Se puede deshacer desde aquí.'
    : 'Vuelve a ser la temporada por defecto para <b>todos</b> y Rush vuelve a ser solo para los usuarios beta.'}</p>
    <button class="dialog-box__btn" type="button" data-admin-si="${accion}">${empezar ? 'EMPEZAR LA TEMPORADA' : 'DESHACER'}</button>
    <button class="dialog-box__btn dialog-box__btn--ghost" type="button" data-admin-no>CANCELAR</button>`;
}

// Quien comprueba que eres admin es el servidor, con tu sesión de Rush
async function cambiarTemporadaAdmin(accion, salida) {
  const empezar = accion === 'empezar';
  const t = empezar ? temporadaProxima() : temporadaAnteriorAlCurso();
  const nombre = nombreTemporadaAdmin(t);
  salida.textContent = 'Un momento…';
  try {
    // Una sesión recién abierta con tu código: la guardada puede haber caducado
    if (await rushReautenticar() !== 'ok') throw new Error('No se ha podido abrir tu sesión de Rush. Vuelve a entrar con tu código.');
    const token = rushToken();
    const yo = await rushRpc('slr_yo', { token });
    // En local, la liga de prueba, igual que Rush
    const liga = (RUSH_ES_LOCAL && yo.ligas?.find(l => l.es_prueba)) || yo.liga_principal;
    if (!liga) throw new Error('No hay liga');
    await rushRpc('slr_admin_empezar_temporada', { token, liga_id: liga.id, temporada: t.id, rush_publico: empezar });
    fijarTemporadaEnCurso(t.id);
    pintarPerfilAdmin();
    document.querySelector('[data-admin-salida]').textContent = empezar ? `La ${nombre} ha empezado.` : `De vuelta en la ${nombre}.`;
  } catch (e) {
    salida.textContent = e.message;
  }
}

function htmlListaAdmin(usuarios) {
  return `<ul class="perfil-admin__lista">${usuarios.map(u => {
    // Quien nunca ha enviado su estado no es que las tenga desactivadas: no se sabe
    if (u.notificaciones === 'sin datos') {
      return `<li class="es-sin-datos"><b>${escaparApp(u.nombre)}</b><span>Sin datos (no ha entrado desde el cambio)</span></li>`;
    }
    const bien = u.notificaciones === 'activadas';
    return `<li class="${bien ? '' : 'es-mal'}">
      <b>${escaparApp(u.nombre)}</b>
      <span>${u.instalada ? 'Instalada' : 'Sin instalar'} · ${escaparApp(u.notificaciones)} · ${escaparApp(u.ultima)}</span>
    </li>`;
  }).join('')}</ul>`;
}

function htmlSimulacro(r) {
  const cabeza = `<p>Temporada ${escaparApp(r.temporada)} · calendario: ${escaparApp(r.calendario)}${r.noche ? ' · es de noche' : ''}</p>`;
  if (r.primeraVez) return `${cabeza}<p>Es la primera pasada: solo apuntará lo que ya hay, sin enviar nada.</p>`;
  if (!r.avisos.length) return `${cabeza}<p>Ahora mismo no se enviaría nada.</p>`;
  return `${cabeza}<ul class="perfil-admin__lista">${r.avisos.map(a => `<li>
    <b>${a.titulo ? `${escaparApp(a.titulo)}: ` : ''}${escaparApp(a.cuerpo)}</b>
    <span>A: ${a.a === 'todos' ? 'todos' : escaparApp(a.a.join(', '))}</span>
    ${a.espera ? '<small>Espera a las 9:00</small>' : ''}
  </li>`).join('')}</ul>`;
}

async function accionAdmin(accion, salida) {
  salida.textContent = 'Un momento…';
  // Reinicio completo de OneSignal en este dispositivo: acaba recargando la página
  if (accion === 'reparar') {
    salida.textContent = 'Reparando…';
    avisoApp('Reparando…', 'ok');
    await pushReiniciar();
    return;
  }
  try {
    const codigo = getSessionCode();
    if (accion === 'lista') {
      salida.innerHTML = htmlListaAdmin((await postScript({ action: 'listaDispositivos', codigo })).usuarios);
    } else if (accion === 'prueba') {
      salida.textContent = (await postScript({ action: 'notificacionPrueba', codigo })).mensaje;
    } else {
      salida.innerHTML = htmlSimulacro(await postScript({ action: 'simulacroAvisos', codigo }));
    }
  } catch (e) {
    salida.textContent = e.message;
  }
}

/* ── Enviar el estado ────────────────────────────────────────────────────── */
let ultimoEstadoEnviado = '';

async function enviarEstadoApp() {
  const nombre = getSessionPlayer();
  const e = estadoApp();
  // Desde local no: las pruebas no escriben en la hoja de verdad
  if (!nombre || !e.movil || ['localhost', '127.0.0.1'].includes(location.hostname)) return;
  const datos = { action: 'estadoDispositivo', nombre, dispositivo: idDispositivo(), plataforma: e.plataforma, instalada: e.instalada || e.yaInstalada, permiso: e.permiso, suscrito: !!e.suscrito };
  const firma = JSON.stringify(datos);
  if (firma === ultimoEstadoEnviado) return;
  ultimoEstadoEnviado = firma;
  try { await postScript(datos); } catch (err) { console.warn('[app] No se ha podido enviar el estado:', err.message); }
}

function refrescarEstadoApp() {
  pintarAvisoApp();
  pintarPerfilApp();
  enviarEstadoApp();
}

// Con el permiso dado y sin suscribir o sin token: se repara sin preguntar (push.js), y se vuelve a
// vincular a su nombre de login, que es a quien envía el Apps Script. Sin insistir a cada evento
let ultimoIntentoSuscribir = 0;
async function asegurarSuscripcion() {
  if (Date.now() - ultimoIntentoSuscribir < 30000) return;
  ultimoIntentoSuscribir = Date.now();
  await pushReparar();
}

// Cuando OneSignal dice algo nuevo (push.js)
function appCambioPush(suscrito) {
  suscritoOneSignal = suscrito;
  if (situacionApp(estadoApp()).suscribir) asegurarSuscripcion();
  refrescarEstadoApp();
}

// Lee el estado real: al abrir y al volver a primer plano (de los ajustes, por ejemplo)
async function revisarEstadoApp({ alarmas = false } = {}) {
  if (!estadoApp().movil) return;
  await mirarAppInstalada();
  refrescarEstadoApp();
  if (alarmas) lanzarAlarmas();
  const suscrito = await pushSuscritoAhora();
  if (suscrito !== null) appCambioPush(suscrito);
}

function initInstalarApp() {
  document.addEventListener('click', e => {
    const paso = e.target.closest('[data-app-paso]');
    if (paso) { abrirAlarma(paso.dataset.appPaso); return; }
    const salidaAdmin = () => document.querySelector('[data-admin-salida]');
    if (e.target.closest('[data-admin-agujero-guardar]')) { guardarAgujeroAdmin(document.querySelector('[data-salida-de="agujero"]')); return; }
    const temporada = e.target.closest('[data-admin-temporada]');
    if (temporada) { pedirConfirmarTemporada(temporada.dataset.adminTemporada, salidaAdmin()); return; }
    const si = e.target.closest('[data-admin-si]');
    if (si) { cambiarTemporadaAdmin(si.dataset.adminSi, salidaAdmin()); return; }
    if (e.target.closest('[data-admin-no]')) { salidaAdmin().innerHTML = ''; return; }
    const admin = e.target.closest('[data-admin-accion]');
    if (admin) accionAdmin(admin.dataset.adminAccion, document.querySelector(`[data-salida-de="${admin.dataset.adminAccion}"]`));
  });
  window.addEventListener('appinstalled', () => { eventoInstalar = null; yaInstalada = true; refrescarEstadoApp(); });
  let ocultaDesde = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { ocultaDesde = Date.now(); return; }
    const reapertura = ocultaDesde && Date.now() - ocultaDesde >= REAPERTURA_MS;
    ocultaDesde = 0;
    revisarEstadoApp({ alarmas: !!reapertura });
  });
  pintarAvisoApp();
  revisarEstadoApp({ alarmas: true });
  // Al abrir la app, con lo que diga OneSignal o, si tarda, con lo que se sepa
  Promise.race([pushListo, new Promise(r => setTimeout(r, 8000))]).then(() => enviarEstadoApp());
}
