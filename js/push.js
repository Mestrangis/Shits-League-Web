/* ═══════════════════════════════════════════════
   SHITS LEAGUE — push.js
   Notificaciones push con OneSignal (Web SDK v16). Los avisos automáticos de OneSignal
   están quitados: la pregunta solo sale desde nuestra alarma (js/instalar-app.js).
   Las notificaciones las envía el Apps Script (apps-script/votos.gs).
═══════════════════════════════════════════════ */

// Pega aquí el App ID de OneSignal (Settings → Keys & IDs).
// Mientras esté vacío, OneSignal no se carga.
const ONESIGNAL_APP_ID = 'c3052327-e9b2-4f3a-8a86-964ab853ec62';
// Safari Web ID (Settings → Push & In-App → Web), necesario para Safari en macOS antiguos
const ONESIGNAL_SAFARI_WEB_ID = 'web.onesignal.auto.6a76584b-4903-4cb9-b550-82d6a06974fc';

const ONESIGNAL_SDK_URL      = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';

// Ruta del sitio (en GitHub Pages es /Shits-League-Web/, en local /).
// El worker de OneSignal vive en su propia subcarpeta para no chocar con sw.js.
const SITE_BASE = location.pathname.replace(/[^/]*$/, '');

window.OneSignalDeferred = window.OneSignalDeferred || [];

// Se cumple con OneSignal ya iniciado, o con null si no está disponible
let pushResolver = () => {};
const pushListo = new Promise(r => { pushResolver = r; });

/* ── Carga e inicialización del SDK ──────────────────────────────────────── */
function initPush() {
  if (!ONESIGNAL_APP_ID) { pushResolver(null); return; }

  OneSignalDeferred.push(async OneSignal => {
    try {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        safari_web_id: ONESIGNAL_SAFARI_WEB_ID,
        serviceWorkerPath:  `${SITE_BASE.slice(1)}push/onesignal/OneSignalSDKWorker.js`,
        serviceWorkerParam: { scope: `${SITE_BASE}push/onesignal/` },
        notifyButton: { enable: false },
        promptOptions: { slidedown: { prompts: [] } },
        welcomeNotification: { disable: true },
      });
    } catch (e) {
      // En localhost falla siempre: la app de OneSignal solo admite el dominio de producción
      console.warn('[push] OneSignal no disponible:', e.message);
      pushResolver(null);
      return;
    }
    const jugador = getSessionPlayer();
    if (jugador) pushVincularJugador(jugador);
    // Suscrito de verdad: con token. optedIn sin token no recibe nada
    const avisar = () => appCambioPush(pushBien(OneSignal));
    OneSignal.User.PushSubscription.addEventListener('change', avisar);
    OneSignal.Notifications.addEventListener('permissionChange', avisar);
    pushResolver(OneSignal);
    avisar();
  });

  // El SDK, en el primer rato libre (como mucho a los 4 s): no compite con lo que se está
  // viendo al arrancar (las notificaciones no tienen prisa)
  (window.requestIdleCallback ?? (f => setTimeout(f, 2000)))(() => {
    const s = document.createElement('script');
    s.src = ONESIGNAL_SDK_URL;
    s.async = true;
    document.head.appendChild(s);
  }, { timeout: 4000 });
}

/* ── Pedir el permiso (desde la alarma) ──────────────────────────────────── */
const pushConTiempo = () => Promise.race([pushListo, new Promise(r => setTimeout(() => r(null), 10000))]);

// 'ok' si se concede, 'mal' si se deniega, 'nada' si cierra la ventanita sin elegir
async function pushPedirPermiso() {
  const OneSignal = await pushConTiempo();
  if (!OneSignal) return 'nada';
  await OneSignal.Notifications.requestPermission();
  const permiso = typeof Notification === 'undefined' ? 'default' : Notification.permission;
  return permiso === 'granted' ? 'ok' : permiso === 'denied' ? 'mal' : 'nada';
}

// Lo que dice OneSignal ahora mismo (suscrito y con token); null si no está disponible
async function pushSuscritoAhora() {
  const OneSignal = await pushConTiempo();
  return OneSignal ? pushBien(OneSignal) : null;
}

/* ── Autorreparación ─────────────────────────────────────────────────────── */
// Con el permiso dado y OneSignal sin suscribir o sin token: optIn, esperar al token y volver a
// vincular el nombre. Si sigue sin token, fuera la suscripción del navegador (puede ser de otra
// clave de OneSignal) y otra vez optIn. Si sale bien, no se ve nada; si no, queda el error
const PUSH_ERROR_KEY = 'SL_PUSH_ULTIMO_ERROR';
const pushToken = OneSignal => OneSignal.User.PushSubscription.token || '';
const pushBien = OneSignal => OneSignal.User.PushSubscription.optedIn === true && !!pushToken(OneSignal);

function anotarErrorPush(donde, e) {
  const texto = `${new Date().toLocaleString('es-ES')} · ${donde}: ${e?.name && e.name !== 'Error' ? `${e.name}: ` : ''}${e?.message ?? e}`;
  console.warn('[push]', texto);
  try { localStorage.setItem(PUSH_ERROR_KEY, texto); } catch { /* sin persistencia */ }
}
const ultimoErrorPush = () => { try { return localStorage.getItem(PUSH_ERROR_KEY) || ''; } catch { return ''; } };

// true cuando llega el token (evento change), false si pasan ms
function esperarToken(OneSignal, ms = 15000) {
  if (pushToken(OneSignal)) return Promise.resolve(true);
  const sub = OneSignal.User.PushSubscription;
  return new Promise(res => {
    const oir = e => { if (e?.current?.token || pushToken(OneSignal)) fin(true); };
    const fin = v => { clearTimeout(t); sub.removeEventListener('change', oir); res(v); };
    const t = setTimeout(() => fin(!!pushToken(OneSignal)), ms);
    sub.addEventListener('change', oir);
  });
}

// El worker de OneSignal (push/onesignal/), no el de la app (sw.js, en la raíz)
async function registroOneSignal() {
  const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
  return regs.find(r => new URL(r.scope).pathname === `${SITE_BASE}push/onesignal/`) ?? null;
}

let pushReparando = null;
// 'bien', 'reparada', 'sin permiso', 'sin OneSignal' o 'sin token'
function pushReparar() {
  return (pushReparando ??= repararPush().finally(() => { pushReparando = null; }));
}
async function repararPush() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return 'sin permiso';
  const OneSignal = await pushConTiempo();
  if (!OneSignal) { anotarErrorPush('OneSignal', 'no se ha cargado'); return 'sin OneSignal'; }
  if (pushBien(OneSignal)) return 'bien';
  const intentar = async () => {
    try { await OneSignal.User.PushSubscription.optIn(); } catch (e) { anotarErrorPush('optIn', e); }
    if (!(await esperarToken(OneSignal))) return false;
    const nombre = getSessionPlayer();
    if (nombre) {
      try { await OneSignal.login(nombre); OneSignal.User.addTag('player_name', nombre); } catch (e) { anotarErrorPush('login', e); }
    }
    return pushBien(OneSignal);
  };
  if (await intentar()) return 'reparada';
  try {
    const reg = await registroOneSignal();
    if (!reg) anotarErrorPush('worker', `no hay worker de OneSignal en ${SITE_BASE}push/onesignal/`);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch (e) { anotarErrorPush('unsubscribe', e); }
  if (await intentar()) return 'reparada';
  anotarErrorPush('reparación', `sigue sin token (optedIn: ${OneSignal.User.PushSubscription.optedIn}, id: ${OneSignal.User.PushSubscription.id ?? 'ninguno'})`);
  return 'sin token';
}

// Para el panel de admin: cómo está ESTE dispositivo
async function pushDiagnostico() {
  const OneSignal = await Promise.race([pushListo, new Promise(r => setTimeout(() => r(null), 3000))]);
  const sub = OneSignal?.User.PushSubscription;
  let workers = [], navegador = 'no se sabe';
  try {
    workers = ((await navigator.serviceWorker?.getRegistrations?.()) ?? [])
      .map(r => `${r.scope} (${(r.active ?? r.waiting ?? r.installing)?.scriptURL.split('/').pop() ?? 'sin worker'})`);
    const reg = await registroOneSignal();
    navegador = reg ? ((await reg.pushManager.getSubscription()) ? 'sí' : 'no') : 'sin worker de OneSignal';
  } catch (e) { navegador = `error: ${e.message}`; }
  return {
    permiso: typeof Notification === 'undefined' ? 'no disponible' : Notification.permission,
    standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    onesignal: !!OneSignal,
    optedIn: sub ? String(sub.optedIn) : '—',
    id: sub?.id || '—',
    token: sub ? !!sub.token : false,
    externalId: OneSignal?.User.externalId || '—',
    navegador,
    workers,
    error: ultimoErrorPush() || '—',
  };
}

/* ── Vincular el dispositivo al jugador logueado ─────────────────────────── */
// Permite enviar a personas concretas: External ID = nombre canónico (el del login), que es
// a quien se dirige el Apps Script, y tag player_name = nombre.
// En v16 los tags son del usuario, no del dispositivo: al cerrar sesión NO se
// borra el tag (se le quitaría también en sus otros dispositivos); basta con
// logout(), que desvincula este dispositivo y lo deja como anónimo sin tags.
function pushVincularJugador(nombre) {
  if (!ONESIGNAL_APP_ID) return;
  OneSignalDeferred.push(async OneSignal => {
    try {
      if (nombre) {
        await OneSignal.login(nombre);
        OneSignal.User.addTag('player_name', nombre);
      } else {
        await OneSignal.logout();
      }
    } catch (e) {
      console.warn('[push] No se pudo vincular el jugador:', e);
    }
  });
}
