/* ═══════════════════════════════════════════════
   SHITS LEAGUE — Service Worker
   Network-first: siempre intenta red primero, cae a caché
   solo si no hay conexión. Incrementa CACHE_NAME en cada
   cambio relevante para forzar limpieza de cachés viejas.
═══════════════════════════════════════════════ */

const CACHE_NAME = 'shits-league-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
