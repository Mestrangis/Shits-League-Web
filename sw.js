/* ═══════════════════════════════════════════════
   SHITS LEAGUE — Service Worker
   Sin caché por ahora, solo registro de PWA.
═══════════════════════════════════════════════ */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {});
