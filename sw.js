/* ═══════════════════════════════════════════════
   SHITS LEAGUE — Service Worker
   La app se instala como un juego:
   · Precarga TODOS los archivos de la web (lista generada en precarga.js por
     herramientas/precarga.mjs) en una caché versionada y los sirve desde ahí
     («primero la caché»). Al actualizar solo se descarga lo que ha cambiado.
   · Una versión nueva se descarga en segundo plano y espera: se aplica la
     próxima vez que se abra la app, o al tocar «Actualizar» (js/version.js).
     La primera vez (sin versión anterior) se activa en cuanto termina.
   · Mientras descarga, cuenta el progreso a las páginas (pantalla «Descargando
     Shits League Rush…» de rush-panel.js).
   · Fotos de las cartas (Cloudinary): caché propia, «primero la caché», con
     las 600 más recientes (el resto se borra).
   · Supabase, Google y el resto: directos a la red (los datos de Rush los
     guarda la propia app).
   Sube CACHE_NAME para forzar una caché nueva entera.
═══════════════════════════════════════════════ */

const CACHE_NAME = 'shits-league-v38';
importScripts('precarga.js');   // self.PRECARGA = { version, archivos: [[ruta, bytes, resumen]], rush }

const PREFIJO_APP = `${CACHE_NAME}-app-`;
const CACHE_APP = PREFIJO_APP + self.PRECARGA.version;
const CACHE_FOTOS = 'slr-fotos-cartas';
const CACHE_FUENTES = 'sl-fuentes';
const MAX_FOTOS = 600;
const LISTA = '__precarga__.json';                 // la lista de esa versión, dentro de su caché
const BASE = new URL('./', self.registration.scope).href;
const RUTAS = new Set(self.PRECARGA.archivos.map(([r]) => r));

/* ── Progreso a las páginas ───────────────────────────────────────────────── */
let progreso = null;   // { hechos, total, bytes, totalBytes } mientras se precarga
async function avisar(datos) {
  const ps = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const p of ps) p.postMessage({ tipo: 'precarga', version: self.PRECARGA.version, ...datos });
}

/* ── Instalación: la caché de esta versión, entera ───────────────────────── */
async function precargar() {
  const cache = await caches.open(CACHE_APP);
  // Lo que ya está igual en una versión anterior se copia sin descargarlo
  const anteriores = (await caches.keys()).filter(k => k.startsWith(PREFIJO_APP) && k !== CACHE_APP);
  const iguales = new Map();   // ruta → caché anterior con el mismo contenido
  for (const nombre of anteriores) {
    const vieja = await caches.open(nombre);
    const lista = await vieja.match(LISTA).then(r => r?.json()).catch(() => null);
    for (const [ruta, , resumen] of lista?.archivos ?? []) {
      const nueva = self.PRECARGA.archivos.find(a => a[0] === ruta);
      if (nueva && nueva[2] === resumen) iguales.set(ruta, vieja);
    }
  }
  const pendientes = [];
  for (const a of self.PRECARGA.archivos) {
    if (await cache.match(BASE + a[0])) continue;              // reintento: ya estaba
    pendientes.push(a);
  }
  const totalBytes = self.PRECARGA.archivos.reduce((s, a) => s + a[1], 0);
  progreso = { hechos: self.PRECARGA.archivos.length - pendientes.length, total: self.PRECARGA.archivos.length, bytes: 0, totalBytes };
  progreso.bytes = self.PRECARGA.archivos.filter(a => !pendientes.includes(a)).reduce((s, a) => s + a[1], 0);
  avisar(progreso);
  // De seis en seis y con prioridad baja: no quita ancho de banda a la web
  let i = 0;
  const trabajador = async () => {
    while (i < pendientes.length) {
      const [ruta, bytes] = pendientes[i++];
      const url = BASE + ruta;
      let res = await iguales.get(ruta)?.match(url);
      if (!res) {
        res = await fetch(url, { cache: 'no-cache', priority: 'low' });
        if (!res.ok) throw new Error(`${ruta}: ${res.status}`);
        // Una respuesta que viene de una redirección (p. ej. /index.html → /) no se puede
        // servir a una navegación: se guarda una copia limpia
        if (res.redirected) res = new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
      }
      await cache.put(url, res);
      progreso.hechos++;
      progreso.bytes += bytes;
      avisar(progreso);
    }
  };
  await Promise.all(Array.from({ length: 6 }, trabajador));
  await cache.put(LISTA, new Response(JSON.stringify(self.PRECARGA), { headers: { 'Content-Type': 'application/json' } }));
  progreso = null;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      await precargar();
    } catch (e) {
      progreso = null;
      await avisar({ error: String(e.message || e) });
      throw e;   // la instalación falla: el navegador lo reintentará
    }
    // La primera vez (o viniendo del service worker antiguo, sin precarga) se usa ya;
    // si hay una versión anterior instalada, espera a la próxima vez que se abra la app
    const hayAnterior = (await caches.keys()).some(k => k.startsWith(PREFIJO_APP) && k !== CACHE_APP);
    if (!hayAnterior) self.skipWaiting();
    await avisar({ lista: true, espera: hayAnterior });
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Fuera las cachés de otras versiones (menos las fotos y las fuentes)
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_APP && k !== CACHE_FOTOS && k !== CACHE_FUENTES).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const m = event.data || {};
  if (m.tipo === 'activar') self.skipWaiting();
  if (m.tipo === 'estado') {
    // ¿Está esta versión entera en la caché? (el navegador puede haber borrado algo)
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_APP);
      const completa = !progreso && !!(await cache.match(LISTA));
      event.ports[0]?.postMessage({ version: self.PRECARGA.version, completa, progreso, rush: self.PRECARGA.rush });
    })());
  }
});

/* ── Peticiones ───────────────────────────────────────────────────────────── */
const ES_FOTO_CARTA = url => url.hostname === 'res.cloudinary.com' && url.pathname.includes('/image/upload/c_fill,ar_5:7');

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La web: desde la caché de esta versión
  if (url.href.startsWith(BASE)) {
    const ruta = req.mode === 'navigate' ? 'index.html' : decodeURIComponent(url.pathname.slice(new URL(BASE).pathname.length));
    if (req.mode === 'navigate' || RUTAS.has(ruta)) {
      event.respondWith((async () => {
        const res = await caches.match(BASE + (ruta || 'index.html'), { cacheName: CACHE_APP, ignoreSearch: true });
        return res || fetch(req);
      })());
    }
    return;   // lo demás de la web (sw.js, precarga.js, fotos del archivo…): red normal
  }

  // Fotos de las cartas: caché propia con las más recientes
  if (ES_FOTO_CARTA(url)) {
    event.respondWith(fotoCarta(req));
    return;
  }

  // Fuentes de Google: no cambian
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_FUENTES);
      const r = await cache.match(req);
      if (r) return r;
      const n = await fetch(req);
      if (n.ok || n.type === 'opaque') cache.put(req, n.clone());
      return n;
    })());
  }
  // Supabase, Google Sheets, OneSignal…: directo a la red
});

/* ── Fotos de las cartas ──────────────────────────────────────────────────── */
let nuevasFotos = 0, recortando = null;
async function fotoCarta(req) {
  const cache = await caches.open(CACHE_FOTOS);
  const r = await cache.match(req.url);
  if (r) return r;
  // Siempre con CORS (no opacas: se sabe si ha ido bien y ocupan lo que pesan)
  let n;
  try {
    n = await fetch(req.url, { mode: 'cors', credentials: 'omit', priority: req.priority ?? 'auto' });
  } catch {
    return fetch(req);   // sin CORS: como la pida la página, sin guardarla
  }
  if (n.ok) {
    await cache.put(req.url, n.clone());
    if (++nuevasFotos >= 20 && !recortando) recortando = recortarFotos().finally(() => { recortando = null; });
  }
  return n;
}
// Deja las MAX_FOTOS más recientes (keys() van por orden de llegada)
async function recortarFotos() {
  nuevasFotos = 0;
  const cache = await caches.open(CACHE_FOTOS);
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_FOTOS))) await cache.delete(k);
}
