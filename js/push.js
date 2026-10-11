/* ═══════════════════════════════════════════════
   SHITS LEAGUE — push.js
   Notificaciones push con OneSignal (Web SDK v16).
   Las notificaciones se envían desde el panel web de OneSignal:
   votaciones de fecha, highlights, próximos partidos, texto libre.
═══════════════════════════════════════════════ */

// ⚠️ Pega aquí el App ID de OneSignal (Settings → Keys & IDs).
// Mientras esté vacío, OneSignal no se carga y no se muestra ningún aviso.
const ONESIGNAL_APP_ID = 'c3052327-e9b2-4f3a-8a86-964ab853ec62';
// Safari Web ID (Settings → Push & In-App → Web), necesario para Safari en macOS antiguos
const ONESIGNAL_SAFARI_WEB_ID = 'web.onesignal.auto.6a76584b-4903-4cb9-b550-82d6a06974fc';

const ONESIGNAL_SDK_URL      = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
const PUSH_DISMISSED_KEY     = 'PUSH_PROMPT_DISMISSED';
const PUSH_REPROMPT_DAYS     = 7; // tras "Ahora no", días hasta volver a preguntar
const PUSH_PROMPT_DELAY_MS   = 1500;

// Ruta del sitio (en GitHub Pages es /Shits-League-Web/, en local /).
// El worker de OneSignal vive en su propia subcarpeta para no chocar con sw.js.
const SITE_BASE = location.pathname.replace(/[^/]*$/, '');

window.OneSignalDeferred = window.OneSignalDeferred || [];

/* ── Carga e inicialización del SDK ──────────────────────────────────────── */
function initPush() {
  if (!ONESIGNAL_APP_ID) return;

  OneSignalDeferred.push(async OneSignal => {
    try {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        safari_web_id: ONESIGNAL_SAFARI_WEB_ID,
        serviceWorkerPath:  `${SITE_BASE.slice(1)}push/onesignal/OneSignalSDKWorker.js`,
        serviceWorkerParam: { scope: `${SITE_BASE}push/onesignal/` },
        notifyButton: { enable: false },
      });
    } catch (e) {
      // En localhost falla siempre: la app de OneSignal solo admite el dominio de producción
      console.warn('[push] OneSignal no disponible:', e.message);
      return;
    }
    const jugador = getSessionPlayer();
    if (jugador) pushVincularJugador(jugador);
    if (debeMostrarPrePrompt(OneSignal)) {
      setTimeout(() => openModal('pushModal'), PUSH_PROMPT_DELAY_MS);
    }
  });

  const s = document.createElement('script');
  s.src = ONESIGNAL_SDK_URL;
  s.defer = true;
  document.head.appendChild(s);

  document.getElementById('pushAcceptBtn').addEventListener('click', aceptarPush);
  document.getElementById('pushLaterBtn').addEventListener('click', posponerPush);
}

/* ── Pantalla previa al prompt nativo ────────────────────────────────────── */
function debeMostrarPrePrompt(OneSignal) {
  if (!OneSignal.Notifications.isPushSupported()) return false;
  // 'granted' → ya aceptó; 'denied' → el navegador ya no deja volver a preguntar
  if (Notification.permission !== 'default') return false;

  let dismissed = 0;
  try { dismissed = parseInt(localStorage.getItem(PUSH_DISMISSED_KEY)) || 0; } catch {}
  return Date.now() - dismissed > PUSH_REPROMPT_DAYS * 86400000;
}

function marcarPrePromptVisto() {
  try { localStorage.setItem(PUSH_DISMISSED_KEY, String(Date.now())); } catch {}
}

function aceptarPush() {
  // Si cierra el prompt nativo sin elegir, no insistimos hasta pasados unos días
  marcarPrePromptVisto();
  closeModal('pushModal');
  OneSignalDeferred.push(OneSignal => OneSignal.Notifications.requestPermission());
}

function posponerPush() {
  marcarPrePromptVisto();
  closeModal('pushModal');
}

/* ── Vincular el dispositivo al jugador logueado ─────────────────────────── */
// Permite segmentar envíos por jugador desde el panel (External ID = nombre)
function pushVincularJugador(nombre) {
  if (!ONESIGNAL_APP_ID) return;
  OneSignalDeferred.push(async OneSignal => {
    try {
      if (nombre) await OneSignal.login(nombre);
      else        await OneSignal.logout();
    } catch (e) {
      console.warn('[push] No se pudo vincular el jugador:', e);
    }
  });
}
