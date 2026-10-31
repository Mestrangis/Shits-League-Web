/* ═══════════════════════════════════════════════
   SHITS LEAGUE — Service Worker
   La app se instala como un juego, por versiones. Quien decide qué versión toca
   es la página (js/version.js), con la etiqueta version.json (que pide siempre
   sin caché): aquí se instala lo que se pide y se sirve la versión activa.
   · Cada versión, en dos cachés: la Shits League normal (app) y Rush (rush).
     Se instala parte a parte («instalar»): lo que ya estaba igual en otra caché
     se copia; lo demás se descarga saltándose TODAS las cachés intermedias
     (cache: 'reload' y ?v=<huella>: ni la del navegador ni la de GitHub Pages,
     max-age=600) y cada archivo se comprueba contra su huella de version.json.
     Si no coincide, se pide otra vez; si sigue sin coincidir, la parte no se da
     por instalada.
   · Una sola versión activa («activar»): la app y Rush se sirven SIEMPRE de la
     misma versión (Rush de su caché o, si aún no está descargado, de la red con
     la huella de esa versión): nunca se mezclan archivos de dos versiones.
   · «verificar»: vuelve a comprobar lo guardado de la versión activa y repara lo
     que no cuadre. «reparar»: borra todas las cachés de código (la página lo
     vuelve a instalar todo).
   · Sonidos de los partidos (audio/): no se precargan; al pedirlos se guardan
     en su caché, comprobados contra su huella.
   · Fotos de las cartas (Cloudinary): caché propia, «primero la caché», con
     las 600 más recientes (el resto se borra).
   · Supabase, Google y el resto: directos a la red.
   Sube CACHE_NAME para empezar con cachés nuevas (lo igual se copia, comprobado).
═══════════════════════════════════════════════ */

const CACHE_NAME = 'shits-league-v44';
const CACHE_ESTADO = `${CACHE_NAME}-estado`;   // ACTIVA: la etiqueta de la versión que manda
const CACHE_FOTOS = 'slr-fotos-cartas';
const CACHE_FUENTES = 'sl-fuentes';
const CACHE_AUDIO = 'slr-audio';
const MAX_FOTOS = 600;
const ACTIVA = '__activa__.json';
const ENTERA = '__entera__.json';                   // marca de «esta parte está entera», con la etiqueta
const BASE = new URL('./', self.registration.scope).href;
const DE_CODIGO = /^shits-league-v\d+-(app|rush)-/;   // de este worker y de los de antes
const TEXTO = /\.(js|mjs|css|html|json|svg|txt)$/i;
const cacheDe = (parte, version) => `${CACHE_NAME}-${parte}-${version}`;
const json = d => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });

async function avisar(datos) {
  const ps = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const p of ps) p.postMessage({ tipo: 'version', ...datos });
}

/* ── Huella: sha-256 del contenido (los textos, con saltos de línea LF) ─────── */
async function huella(buf, ruta) {
  let b = buf;
  if (TEXTO.test(ruta)) b = new TextEncoder().encode(new TextDecoder().decode(buf).replace(/\r\n/g, '\n'));
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', b));
  return [...h.slice(0, 6)].map(x => x.toString(16).padStart(2, '0')).join('');
}
// Una respuesta limpia para guardar (sin redirecciones, con su tipo)
const guardable = (buf, res) => new Response(buf, { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream' } });
// De la red, saltándose las cachés intermedias, y comprobada; si no cuadra, otra vez
async function descargar(ruta, h, prioridad = 'auto') {
  for (let intento = 0; intento < 2; intento++) {
    const res = await fetch(`${BASE}${ruta}?v=${h}${intento ? `&r=${Date.now()}` : ''}`, { cache: 'reload', priority: prioridad });
    if (!res.ok) throw new Error(`${ruta}: ${res.status}`);
    const buf = await res.arrayBuffer();
    if (await huella(buf, ruta) === h) return guardable(buf, res);
  }
  throw Object.assign(new Error(`${ruta}: no coincide con su huella`), { huella: true });
}

/* ── La versión activa ────────────────────────────────────────────────────── */
let activa = null;   // promesa de la etiqueta activa (o null)
const leerActiva = () => (activa ??= caches.open(CACHE_ESTADO).then(c => c.match(ACTIVA)).then(r => r?.json() ?? null).catch(() => null));
// (sin abrirla si no existe: abrir una caché la crea)
const entera = async (parte, version) => (await caches.has(cacheDe(parte, version))) && !!(await (await caches.open(cacheDe(parte, version))).match(ENTERA));

/* ── Instalar una versión (partes: ['app'] y/o ['rush']) ──────────────────── */
const instalaciones = new Map();   // `${version}|${partes}` → { promesa, ritmo, progreso }
function instalar(m, partes, { fondo = false } = {}) {
  const clave = `${m.version}|${partes.join(',')}`;
  const ya = instalaciones.get(clave);
  if (ya) { if (!fondo && ya.ritmo.fondo) { ya.ritmo.fondo = false; ya.ritmo.acelerar?.(4); } return ya.promesa; }
  const ritmo = { fondo, acelerar: null };
  const progreso = { hechos: 0, total: 0, bytes: 0, totalBytes: 0 };
  const t = { ritmo, progreso };
  instalaciones.set(clave, t);
  t.promesa = (async () => {
    // Lo que falta en cada parte
    const tareas = [];
    for (const parte of partes) {
      if (await entera(parte, m.version)) continue;
      const cache = await caches.open(cacheDe(parte, m.version));
      for (const [ruta, [h, bytes]] of Object.entries(m[parte] ?? {})) {
        if (await cache.match(BASE + ruta)) continue;   // reintento: ya estaba (se comprobó al guardarlo)
        tareas.push({ parte, cache, ruta, h, bytes });
      }
    }
    // Lo igual en otra caché (de otra versión, o de un worker anterior): se copia si su huella cuadra
    const otras = (await caches.keys()).filter(k => DE_CODIGO.test(k) && !partes.some(p => k === cacheDe(p, m.version)));
    for (const k of otras) {
      const c = await caches.open(k);
      for (const x of tareas) {
        if (x.copiada) continue;
        const r = await c.match(BASE + x.ruta);
        if (!r) continue;
        const buf = await r.arrayBuffer();
        if (await huella(buf, x.ruta) === x.h) { await x.cache.put(BASE + x.ruta, guardable(buf, r)); x.copiada = true; }
      }
    }
    // Lo demás, de la red: el progreso es solo de esto (lo que ha cambiado)
    const pendientes = tareas.filter(x => !x.copiada);
    progreso.total = pendientes.length;
    progreso.totalBytes = pendientes.reduce((s, x) => s + x.bytes, 0);
    avisar({ evento: 'progreso', version: m.version, partes: clave, ...progreso });
    let i = 0;
    const trabajador = async () => {
      while (i < pendientes.length) {
        const x = pendientes[i++];
        await x.cache.put(BASE + x.ruta, await descargar(x.ruta, x.h, ritmo.fondo ? 'low' : 'auto'));
        progreso.hechos++;
        progreso.bytes += x.bytes;
        avisar({ evento: 'progreso', version: m.version, partes: clave, ...progreso });
      }
    };
    const trabajando = Array.from({ length: fondo ? 2 : 6 }, trabajador);
    ritmo.acelerar = n => { for (let k = 0; k < n; k++) trabajando.push(trabajador()); };
    for (let k = 0; k < trabajando.length; k++) await trabajando[k];
    // Entera: con la etiqueta (sin las otras partes, que no hacen falta para servir esta)
    for (const parte of partes) await (await caches.open(cacheDe(parte, m.version))).put(ENTERA, json(m));
    // Si es la versión activa (Rush al pulsar JUGAR), ya sobran las cachés de otras versiones
    const a = await leerActiva();
    if (a?.version === m.version) await limpiar(a);
    await avisar({ evento: 'lista', version: m.version, partes: clave });
  })().catch(async e => { await avisar({ evento: 'error', version: m.version, partes: clave, error: String(e.message || e), huella: !!e.huella }); throw e; })
    .finally(() => instalaciones.delete(clave));
  return t.promesa;
}

/* ── Activar una versión ya instalada (al menos la parte app) ─────────────── */
async function activar(version) {
  const r = await (await caches.open(cacheDe('app', version))).match(ENTERA);
  if (!r) throw new Error(`La versión ${version} no está instalada`);
  const m = await r.json();
  await (await caches.open(CACHE_ESTADO)).put(ACTIVA, json(m));
  activa = Promise.resolve(m);
  await limpiar(m);
}
// Fuera las cachés de código de otras versiones. Las de Rush se quedan mientras la de la
// versión activa no esté entera: de ahí se copia lo que no ha cambiado al pulsar JUGAR
async function limpiar(m) {
  const rushEntera = await entera('rush', m.version);
  for (const k of await caches.keys()) {
    if (!DE_CODIGO.test(k) || k === cacheDe('app', m.version) || k === cacheDe('rush', m.version)) continue;
    if (/-rush-/.test(k) && !rushEntera) continue;
    await caches.delete(k);
  }
}

/* ── Verificar lo guardado de la versión activa (y reparar lo que no cuadre) ── */
async function verificar() {
  const m = await leerActiva();
  if (!m) return { reparados: [] };
  const reparados = [];
  for (const parte of ['app', 'rush']) {
    if (!(await entera(parte, m.version))) continue;
    const cache = await caches.open(cacheDe(parte, m.version));
    for (const [ruta, [h]] of Object.entries(m[parte])) {
      const r = await cache.match(BASE + ruta);
      if (r && await huella(await r.arrayBuffer(), ruta) === h) continue;
      await cache.put(BASE + ruta, await descargar(ruta, h, 'low'));
      reparados.push(ruta);
    }
  }
  return { reparados };
}

/* ── Ciclo de vida ────────────────────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Viniendo de un worker de antes de version.json (o la primera vez): se aplica ya. Los de antes
    // solo aplicaban versiones al abrir la app de cero, y en el móvil eso puede tardar días
    const previo = (await caches.keys()).some(k => /^shits-league-v\d+-estado$/.test(k));
    if (!previo) self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const heredadas = keys.some(k => DE_CODIGO.test(k)) && !keys.some(k => /^shits-league-v\d+-estado$/.test(k));
    // Fuera lo que no es de ahora (las de código se limpian al activar una versión)
    const quedan = k => k === CACHE_ESTADO || [CACHE_FOTOS, CACHE_FUENTES, CACHE_AUDIO].includes(k) || DE_CODIGO.test(k);
    await Promise.all(keys.filter(k => !quedan(k)).map(k => caches.delete(k)));
    await self.clients.claim();
    // Las páginas abiertas con el código de antes de version.json: se recargan una vez para
    // pasar a este (si no, seguirían con el viejo hasta cerrar la app del todo)
    if (heredadas) for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate?.(c.url).catch(() => {});
  })());
});

self.addEventListener('message', event => {
  const m = event.data || {};
  const responder = d => event.ports[0]?.postMessage(d);
  const tarea = async f => { try { responder({ ok: true, ...(await f()) }); } catch (e) { responder({ ok: false, error: String(e.message || e) }); } };
  if (m.tipo === 'activar_worker') self.skipWaiting();
  if (m.tipo === 'estado') {
    event.waitUntil(tarea(async () => {
      const a = await leerActiva();
      const enCurso = [...instalaciones.entries()].map(([k, v]) => ({ partes: k, ...v.progreso }));
      return {
        activa: a ? { version: a.version, commit: a.commit, fecha: a.fecha } : null,
        app: a ? await entera('app', a.version) : false,
        rush: a ? await entera('rush', a.version) : false,
        instalando: enCurso, worker: CACHE_NAME,
      };
    }));
  }
  if (m.tipo === 'instalar') event.waitUntil(instalar(m.manifiesto, m.partes, { fondo: !!m.fondo }).catch(() => {}));
  if (m.tipo === 'activar') event.waitUntil(tarea(async () => { await activar(m.version); return {}; }));
  // La misma versión con otro commit (un despliegue sin cambios en la web): solo la etiqueta
  if (m.tipo === 'etiqueta') {
    event.waitUntil(tarea(async () => {
      const a = await leerActiva();
      if (!a || a.version !== m.version) return {};
      const n = { ...a, commit: m.commit, fecha: m.fecha };
      await (await caches.open(CACHE_ESTADO)).put(ACTIVA, json(n));
      activa = Promise.resolve(n);
      return {};
    }));
  }
  if (m.tipo === 'verificar') event.waitUntil(tarea(verificar));
  if (m.tipo === 'reparar') {
    event.waitUntil(tarea(async () => {
      for (const k of await caches.keys()) if (DE_CODIGO.test(k) || /^shits-league-v\d+-estado$/.test(k)) await caches.delete(k);
      activa = null;
      return {};
    }));
  }
});

/* ── Peticiones ───────────────────────────────────────────────────────────── */
const ES_FOTO_CARTA = url => url.hostname === 'res.cloudinary.com' && url.pathname.includes('/image/upload/c_fill,ar_5:7');

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La web: de la versión activa
  if (url.href.startsWith(BASE)) {
    const ruta = req.mode === 'navigate' ? 'index.html' : decodeURIComponent(url.pathname.slice(new URL(BASE).pathname.length));
    if (ruta === 'version.json' || ruta === 'sw.js' || url.searchParams.has('v')) return;   // siempre de la red
    event.respondWith(servir(req, ruta));
    return;
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

async function servir(req, ruta) {
  const m = await leerActiva();
  if (!m) return fetch(req);                       // sin versión instalada todavía: la red
  if (m.audio?.[ruta]) return sonidoPartido(ruta, m.audio[ruta][0]);
  const parte = m.app[ruta] ? 'app' : m.rush[ruta] ? 'rush' : null;
  if (!parte) return fetch(req);                   // lo demás de la web (fotos del archivo…)
  const r = await caches.match(BASE + ruta, { cacheName: cacheDe(parte, m.version), ignoreSearch: true });
  if (r) return r;
  // Aún no está (Rush sin descargar): de la red, pero de ESTA versión. Si la red ya tiene otra
  // (o no hay red), un error: nunca un archivo de otra versión (la página instala la nueva)
  try {
    return await descargar(ruta, m[parte][ruta][0]);
  } catch {
    return new Response('Este archivo no es de la versión instalada', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

/* ── Sonidos de los partidos ──────────────────────────────────────────────── */
// De su caché si es el de esta versión (misma huella); si no, de la red, comprobado, y se guarda
async function sonidoPartido(ruta, h) {
  const cache = await caches.open(CACHE_AUDIO);
  const url = BASE + ruta;
  const r = await cache.match(url);
  if (r && r.headers.get('x-huella') === h) return r;
  const res = await descargar(ruta, h, 'low');
  const guardada = new Response(await res.arrayBuffer(), { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type'), 'x-huella': h } });
  await cache.put(url, guardada.clone());
  return guardada;
}

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
