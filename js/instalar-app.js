/* ═══════════════════════════════════════════════
   SHITS LEAGUE — instalar-app.js
   Instalar la app y activar las notificaciones, solo en móvil:
   · en qué situación está cada uno;
   · la tarjeta de Inicio y las líneas del perfil, que abren la alarma (js/alarma.js);
   · el estado de cada móvil, que se envía al Apps Script para la lista del admin.
   Las cuatro primeras funciones no tocan el navegador: las prueba tests/slr/instalar-app.test.mjs.
═══════════════════════════════════════════════ */

const APP_LUEGO_KEY = 'SL_AVISO_APP_LUEGO';
const APP_LUEGO_MS = 3 * 86400000;
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

// El siguiente paso: 'instalar', 'notificaciones' o null si no hay nada que hacer. Sin saber aún si
// OneSignal lo tiene suscrito (suscrito: null), no se molesta a quien ya dio el permiso.
function pasoApp({ movil, instalada, permiso, suscrito }) {
  if (!movil) return null;
  if (!instalada) return 'instalar';
  if (permiso === 'default' || permiso === 'denied') return 'notificaciones';
  return permiso === 'granted' && suscrito === false ? 'notificaciones' : null;
}

// Qué hace el toque. caso: las instrucciones que se enseñan si sale mal
function planApp({ paso, plataforma, instalada, permiso, hayEventoInstalar }) {
  if (paso === 'instalar') {
    if (plataforma === 'iphone') return { modo: 'iphone', accion: 'nada' };
    return hayEventoInstalar ? { modo: 'instalar', accion: 'instalar', caso: 'instalar' } : { modo: 'instalar', accion: 'mal', caso: 'instalar' };
  }
  if (paso !== 'notificaciones') return null;
  if (permiso === 'granted') return { accion: 'suscribir' };
  const caso = plataforma === 'iphone' ? 'bloqueadas-iphone' : instalada ? 'bloqueadas-android-app' : 'bloqueadas-android-chrome';
  return { modo: 'notificaciones', accion: permiso === 'denied' ? 'mal' : 'permiso', caso };
}

function textoNotificaciones({ permiso, suscrito }) {
  if (permiso === 'denied') return 'bloqueadas';
  return permiso === 'granted' && suscrito ? 'activadas' : 'desactivadas';
}

/* ── El estado de este móvil ─────────────────────────────────────────────── */
let eventoInstalar = null;
let suscritoOneSignal = null;

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
  return { movil, plataforma, instalada, permiso, suscrito: suscritoOneSignal, hayEventoInstalar: !!eventoInstalar };
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

const alarmaPospuesta = () => {
  try { return Date.now() - (Number(localStorage.getItem(APP_LUEGO_KEY)) || 0) < APP_LUEGO_MS; } catch { return false; }
};
const posponerAlarma = () => { try { localStorage.setItem(APP_LUEGO_KEY, String(Date.now())); } catch { /* sin persistencia */ } };

/* ── La alarma ───────────────────────────────────────────────────────────── */
// Se carga en cuanto hay tarjeta: al tocarla ya está y la sirena sale dentro del propio toque
let alarmaModulo = null;
const cargarAlarma = () => (alarmaModulo ??= import('./alarma.js'));

const pasosAlarma = lista => `<ol class="al__pasos">${lista.map((p, i) => `<li><i>${i + 1}</i><span>${p}</span></li>`).join('')}</ol>`;
const INSTRUCCIONES_APP = {
  instalar: pasosAlarma(['Toca el menú <b>⋮</b> del navegador, arriba a la derecha', 'Toca <b>Instalar app</b> o <b>Añadir a pantalla de inicio</b>', 'Abre la app desde el <b>icono nuevo</b>']),
  'bloqueadas-android-app': pasosAlarma(['Mantén pulsado el <b>icono</b> de la app', 'Toca <b>Información de la aplicación</b>', 'Entra en <b>Notificaciones</b> y <b>actívalas</b>']),
  'bloqueadas-android-chrome': pasosAlarma(['Toca el <b>candado</b> de la barra de direcciones', 'Entra en <b>Permisos</b> y luego en <b>Notificaciones</b>', 'Elige <b>Permitir</b>']),
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
  mal: async () => 'mal',
  nada: async () => 'nada',
};

async function hacerPasoApp() {
  const e = estadoApp();
  const plan = planApp({ ...e, paso: pasoApp(e) });
  if (!plan) return;
  if (plan.accion === 'suscribir') {
    await pushSuscribir();
    refrescarEstadoApp();
    return;
  }
  const { mostrarAlarma } = await cargarAlarma();
  const r = await mostrarAlarma({
    modo: plan.modo,
    accion: ACCIONES_ALARMA[plan.accion],
    instrucciones: INSTRUCCIONES_APP[plan.caso] ?? '',
    sonidos: SONIDOS_ALARMA(),
    silencio: alarmaEnSilencio(),
  });
  // Recién instalada sigue en el navegador hasta que se abra desde el icono: no se le insiste
  if (r === 'luego' || (plan.modo === 'instalar' && r === 'ok')) posponerAlarma();
  refrescarEstadoApp();
}

/* ── La tarjeta de Inicio ────────────────────────────────────────────────── */
const TITULOS_PASO = {
  instalar: { titulo: 'Instala la app', texto: 'Va más rápido y te llegan los avisos' },
  notificaciones: { titulo: 'Activa las notificaciones', texto: 'Para enterarte de los partidos y del MVP' },
};

function pintarAvisoApp() {
  const el = document.getElementById('instalarAviso');
  if (!el) return;
  const paso = pasoApp(estadoApp());
  if (!paso || alarmaPospuesta()) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  cargarAlarma().catch(() => { alarmaModulo = null; });
  const t = TITULOS_PASO[paso];
  el.innerHTML = `
    <button class="instalar-aviso__toque" type="button" data-app-paso>
      <b>${t.titulo}</b><span>${t.texto}</span>
    </button>
    <button class="instalar-aviso__luego" type="button" data-app-luego>Luego</button>`;
  el.hidden = false;
}

/* ── El perfil ───────────────────────────────────────────────────────────── */
function pintarPerfilApp() {
  const caja = document.getElementById('sessionApp');
  if (!caja) return;
  const e = estadoApp();
  caja.hidden = !e.movil;
  if (e.movil) {
    const paso = pasoApp(e);
    const notif = textoNotificaciones(e);
    caja.innerHTML = `
      <p class="perfil-app__linea">App: <b>${e.instalada ? 'instalada' : 'sin instalar'}</b></p>
      <p class="perfil-app__linea">Notificaciones: <b class="perfil-app__${notif}">${notif}</b></p>
      ${paso ? `<button class="dialog-box__btn" type="button" data-app-paso>${TITULOS_PASO[paso].titulo.toUpperCase()}</button>` : ''}`;
  }
  pintarPerfilAdmin();
}

/* ── Para el admin ───────────────────────────────────────────────────────── */
// Solo enseña los botones: quien comprueba que eres admin es el Apps Script, con tu código
const esAdminLiga = () => AJUSTES_LIGA.admins.includes(getSessionPlayer());
const escaparApp = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function pintarPerfilAdmin() {
  const caja = document.getElementById('sessionAdmin');
  if (!caja) return;
  caja.hidden = !esAdminLiga();
  if (caja.hidden) return;
  caja.innerHTML = `
    <h3 class="perfil-admin__titulo">Admin</h3>
    <button class="dialog-box__btn dialog-box__btn--ghost" type="button" data-admin-accion="lista">QUIÉN LO TIENE ACTIVADO</button>
    <button class="dialog-box__btn dialog-box__btn--ghost" type="button" data-admin-accion="prueba">ENVIARME UNA NOTIFICACIÓN DE PRUEBA</button>
    <button class="dialog-box__btn dialog-box__btn--ghost" type="button" data-admin-accion="simulacro">SIMULACRO DE AVISOS</button>
    ${temporadaProxima() ? `<button class="dialog-box__btn" type="button" data-admin-temporada="empezar">EMPEZAR LA ${nombreTemporadaAdmin(temporadaProxima()).toUpperCase()}</button>` : ''}
    ${temporadaAnteriorAlCurso() && !temporadaAnteriorAlCurso().imagenes ? `<button class="dialog-box__btn dialog-box__btn--ghost" type="button" data-admin-temporada="deshacer">DESHACER: VOLVER A LA ${nombreTemporadaAdmin(temporadaAnteriorAlCurso()).toUpperCase()}</button>` : ''}
    <div class="perfil-admin__salida" data-admin-salida></div>`;
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
    <b>${escaparApp(a.cuerpo)}</b>
    <span>A: ${a.a === 'todos' ? 'todos' : escaparApp(a.a.join(', '))}</span>
    ${a.espera ? '<small>Espera a las 9:00</small>' : ''}
  </li>`).join('')}</ul>`;
}

async function accionAdmin(accion, salida) {
  salida.textContent = 'Un momento…';
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
  const datos = { action: 'estadoDispositivo', nombre, dispositivo: idDispositivo(), plataforma: e.plataforma, instalada: e.instalada, permiso: e.permiso, suscrito: !!e.suscrito };
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

// Cuando OneSignal dice algo nuevo (push.js)
function appCambioPush(suscrito) {
  suscritoOneSignal = suscrito;
  const e = estadoApp();
  // Dio el permiso pero no está suscrito: se suscribe sin preguntar
  if (e.movil && e.permiso === 'granted' && suscrito === false) pushSuscribir();
  refrescarEstadoApp();
}

function initInstalarApp() {
  document.addEventListener('click', e => {
    if (e.target.closest('[data-app-paso]')) { hacerPasoApp(); return; }
    if (e.target.closest('[data-app-luego]')) { posponerAlarma(); pintarAvisoApp(); return; }
    const salidaAdmin = () => document.querySelector('[data-admin-salida]');
    const temporada = e.target.closest('[data-admin-temporada]');
    if (temporada) { pedirConfirmarTemporada(temporada.dataset.adminTemporada, salidaAdmin()); return; }
    const si = e.target.closest('[data-admin-si]');
    if (si) { cambiarTemporadaAdmin(si.dataset.adminSi, salidaAdmin()); return; }
    if (e.target.closest('[data-admin-no]')) { salidaAdmin().innerHTML = ''; return; }
    const admin = e.target.closest('[data-admin-accion]');
    if (admin) accionAdmin(admin.dataset.adminAccion, admin.parentElement.querySelector('[data-admin-salida]'));
  });
  window.addEventListener('appinstalled', () => { eventoInstalar = null; posponerAlarma(); pintarAvisoApp(); });
  pintarAvisoApp();
  // Al abrir la app, con lo que diga OneSignal o, si tarda, con lo que se sepa
  Promise.race([pushListo, new Promise(r => setTimeout(r, 8000))]).then(() => enviarEstadoApp());
}
