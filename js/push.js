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
    const avisar = () => appCambioPush(OneSignal.User.PushSubscription.optedIn === true);
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

// Con el permiso ya dado, no pregunta nada
async function pushSuscribir() {
  const OneSignal = await pushConTiempo();
  if (!OneSignal) return;
  try { await OneSignal.User.PushSubscription.optIn(); } catch (e) { console.warn('[push] No se pudo suscribir:', e); }
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
