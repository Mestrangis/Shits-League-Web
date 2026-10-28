/* ═══════════════════════════════════════════════
   SHITS LEAGUE — Service Worker
   La app se instala como un juego, en dos partes (lista generada en precarga.js
   por herramientas/precarga.mjs):
   · La Shits League normal (PRECARGA.archivos): se descarga al instalar la app.
   · Shits League Rush (PRECARGA.rush): NO se descarga hasta que se pulsa JUGAR
     por primera vez (la página manda «descargarRush» y enseña el progreso). Nada
     de Rush compite con la Shits League normal.
   Las dos se sirven desde su caché («primero la caché»). Al actualizar solo se
   descarga lo que ha cambiado (lo igual se copia de la versión anterior).
   · Una versión nueva se descarga en segundo plano (Rush también, pero solo si
     ya estaba descargado, y poco a poco) y espera: se aplica sola la próxima vez
     que se abra la app (js/version.js), sin preguntar.
   · Fotos de las cartas (Cloudinary): caché propia, «primero la caché», con
     las 600 más recientes (el resto se borra).
   · Supabase, Google y el resto: directos a la red (los datos de Rush los
     guarda la propia app).
   Sube CACHE_NAME para forzar una caché nueva (lo que no ha cambiado se copia).
═══════════════════════════════════════════════ */

const CACHE_NAME = 'shits-league-v41';
importScripts('precarga.js');   // self.PRECARGA = { version, versionRush, archivos, rush }: [ruta, bytes, resumen]
const P = self.PRECARGA;

const CACHE_APP = `${CACHE_NAME}-app-${P.version}`;
const CACHE_RUSH = `${CACHE_NAME}-rush-${P.versionRush}`;
const CACHE_FOTOS = 'slr-fotos-cartas';
const CACHE_FUENTES = 'sl-fuentes';
const MAX_FOTOS = 600;
const LISTA = '__precarga__.json';    // marca de «esta caché está entera», con su lista
const VIEJAS = '__viejas__.json';     // en la de Rush: cachés viejas que se borran cuando esté entera
const BASE = new URL('./', self.registration.scope).href;
const RUTAS_APP = new Set(P.archivos.map(([r]) => r));
const RUTAS_RUSH = new Set(P.rush.map(([r]) => r));
const DE_LA_APP = /^shits-league-v\d+-(app|rush)-/;
const json = d => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });

async function avisar(datos) {
  const ps = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const p of ps) p.postMessage({ tipo: 'precarga', version: P.version, ...datos });
}

/* ── Cachés de otras versiones ────────────────────────────────────────────── */
// Las enteras (con su lista): de dónde copiar lo que no ha cambiado
async function anteriores() {
  const out = [];
  for (const nombre of await caches.keys()) {
    if (!DE_LA_APP.test(nombre) || nombre === CACHE_APP || nombre === CACHE_RUSH) continue;
    const cache = await caches.open(nombre);
    const l = await cache.match(LISTA).then(r => r?.json()).catch(() => null);
    if (!l) continue;
    // [ruta, bytes, resumen] (las de antes de separar Rush lo tenían todo en archivos)
    const entradas = [...(l.archivos ?? []), ...(l.rush ?? [])].filter(Array.isArray);
    out.push({ nombre, cache, entradas, nueva: !!l.versionRush, conRush: entradas.some(a => a[0] === 'js/slr/rush.js') });
  }
  return out;
}
const entera = nombre => caches.open(nombre).then(c => c.match(LISTA)).then(r => !!r);

/* ── Llenar una caché con su lista ────────────────────────────────────────── */
// Copia lo igual de una versión anterior y descarga lo demás. ritmo: { trabajadores, prioridad }
// (se puede acelerar a mitad: ritmo.acelerar()). alArchivo(bytes) por cada uno que queda guardado.
async function llenar(nombre, lista, ritmo, alArchivo) {
  const cache = await caches.open(nombre);
  const iguales = new Map();   // `${ruta}|${resumen}` → caché anterior con ese contenido
  for (const a of await anteriores()) for (const [r, , h] of a.entradas) if (!iguales.has(`${r}|${h}`)) iguales.set(`${r}|${h}`, a.cache);
  const pendientes = [];
  for (const a of lista) {
    if (await cache.match(BASE + a[0])) alArchivo?.(a[1]);    // reintento: ya estaba
    else pendientes.push(a);
  }
  let i = 0;
  const trabajador = async () => {
    while (i < pendientes.length) {
      const [ruta, bytes, h] = pendientes[i++];
      const url = BASE + ruta;
      let res = await iguales.get(`${ruta}|${h}`)?.match(url);
      if (!res) {
        res = await fetch(url, { cache: 'no-cache', priority: ritmo.prioridad });
        if (!res.ok) throw new Error(`${ruta}: ${res.status}`);
        // Una respuesta que viene de una redirección (p. ej. /index.html → /) no se puede
        // servir a una navegación: se guarda una copia limpia
        if (res.redirected) res = new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
      }
      await cache.put(url, res);
      alArchivo?.(bytes);
    }
  };
  const trabajando = Array.from({ length: ritmo.trabajadores }, trabajador);
  ritmo.acelerar = n => { ritmo.prioridad = 'auto'; for (let k = 0; k < n; k++) trabajando.push(trabajador()); };
  // Promise.all de una lista que puede crecer
  for (let k = 0; k < trabajando.length; k++) await trabajando[k];
}

/* ── Instalación: la Shits League normal (y Rush, si ya estaba descargado) ── */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const antes = await anteriores();
    try {
      // Con prioridad baja: no quita ancho de banda a lo que esté cargando la página
      await llenar(CACHE_APP, P.archivos, { trabajadores: 4, prioridad: 'low' });
      await (await caches.open(CACHE_APP)).put(LISTA, json({ version: P.version, versionRush: P.versionRush, archivos: P.archivos }));
      // Rush ya estaba descargado (en otra versión): la nueva también, en segundo plano y poco a poco
      if (antes.some(a => a.conRush) && !(await entera(CACHE_RUSH))) await bajarRush({ fondo: true }).catch(() => {});
    } catch (e) {
      await avisar({ error: String(e.message || e) });
      throw e;   // la instalación falla: el navegador lo reintentará
    }
    // La primera vez (o viniendo del service worker de antes de separar Rush, que no sabe
    // aplicar versiones solo) se usa ya; si no, espera a la próxima vez que se abra la app
    const espera = antes.some(a => a.nueva);
    if (!espera) self.skipWaiting();
    await avisar({ lista: true, espera });
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Fuera las cachés de otras versiones (menos las fotos y las fuentes). Si Rush aún no
    // está entero en esta versión, se queda la última Rush entera: de ahí se copiará lo igual
    const rushEntero = await entera(CACHE_RUSH);
    const fuente = rushEntero ? null : (await anteriores()).filter(a => a.conRush).at(-1)?.nombre;
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![CACHE_APP, CACHE_RUSH, CACHE_FOTOS, CACHE_FUENTES, fuente].includes(k)).map(k => caches.delete(k)));
    if (fuente) await (await caches.open(CACHE_RUSH)).put(VIEJAS, json([fuente]));
    await self.clients.claim();
  })());
});

/* ── Rush: se descarga al pulsar JUGAR por primera vez ────────────────────── */
let descarga = null;   // { promesa, ritmo, progreso } mientras se descarga
function bajarRush({ fondo = false } = {}) {
  if (descarga) {
    // Ya se estaba bajando en segundo plano y ahora la quiere la página: a toda prisa
    if (!fondo && descarga.ritmo.trabajadores < 6) { descarga.ritmo.trabajadores = 6; descarga.ritmo.acelerar?.(4); }
    return descarga.promesa;
  }
  const ritmo = { trabajadores: fondo ? 2 : 6, prioridad: fondo ? 'low' : 'auto' };
  const progreso = { hechos: 0, total: P.rush.length, bytes: 0, totalBytes: P.rush.reduce((s, a) => s + a[1], 0) };
  const d = descarga = { ritmo, progreso };
  d.promesa = (async () => {
    const cache = await caches.open(CACHE_RUSH);
    if (await cache.match(LISTA)) return;
    await llenar(CACHE_RUSH, P.rush, ritmo, bytes => { progreso.hechos++; progreso.bytes += bytes; avisar({ rush: { ...progreso } }); });
    await cache.put(LISTA, json({ versionRush: P.versionRush, rush: P.rush }));
    // Las viejas que se guardaban para copiar, ya sobran
    const viejas = await cache.match(VIEJAS).then(r => r?.json()).catch(() => null);
    for (const n of viejas ?? []) await caches.delete(n);
    await cache.delete(VIEJAS);
    await avisar({ rush: { lista: true } });
  })().catch(async e => { await avisar({ rush: { error: String(e.message || e) } }); throw e; })
    .finally(() => { if (descarga === d) descarga = null; });
  return d.promesa;
}

self.addEventListener('message', event => {
  const m = event.data || {};
  if (m.tipo === 'activar') self.skipWaiting();
  if (m.tipo === 'descargarRush') event.waitUntil(bajarRush({ fondo: !!m.fondo }).catch(() => {}));
  if (m.tipo === 'estado') {
    // ¿Está cada parte entera en la caché? (el navegador puede haber borrado algo)
    event.waitUntil((async () => {
      const rushLista = await entera(CACHE_RUSH);
      event.ports[0]?.postMessage({
        version: P.version, completa: await entera(CACHE_APP),
        rush: { lista: rushLista, descargando: !!descarga, progreso: descarga ? { ...descarga.progreso } : null,
          // Rush ya estaba descargado en una versión anterior (se pone al día en segundo plano)
          anterior: !rushLista && (await anteriores()).some(a => a.conRush) },
      });
    })());
  }
});

/* ── Peticiones ───────────────────────────────────────────────────────────── */
const ES_FOTO_CARTA = url => url.hostname === 'res.cloudinary.com' && url.pathname.includes('/image/upload/c_fill,ar_5:7');

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La web: desde la caché de su parte (Rush, si aún no está descargado, de la red)
  if (url.href.startsWith(BASE)) {
    const ruta = req.mode === 'navigate' ? 'index.html' : decodeURIComponent(url.pathname.slice(new URL(BASE).pathname.length));
    const cacheName = req.mode === 'navigate' || RUTAS_APP.has(ruta) ? CACHE_APP : RUTAS_RUSH.has(ruta) ? CACHE_RUSH : null;
    if (cacheName) {
      event.respondWith((async () => {
        const res = await caches.match(BASE + (ruta || 'index.html'), { cacheName, ignoreSearch: true });
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
