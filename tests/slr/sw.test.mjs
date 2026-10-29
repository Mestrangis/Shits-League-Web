// Tests del service worker (sw.js) en Node, con Cache Storage, fetch, crypto y clientes de mentira.
// El «servidor» es un despliegue (versión A o B) detrás de una caché intermedia que puede servir
// archivos viejos (como la de GitHub Pages, max-age=600):
// · instalar una parte: solo lo de esa parte, saltándose las cachés (cache: 'reload' y ?v=huella),
//   comprobando cada archivo contra su huella; si no cuadra, otra vez; si sigue sin cuadrar, la
//   parte no se da por instalada (ni se puede activar);
// · de A a B: lo igual se copia (comprobado), solo se baja lo que ha cambiado, el progreso es solo
//   de eso; al activar B no sobrevive nada de A (Rush de A, solo hasta tener el de B);
// · una sola versión activa: la app y Rush siempre de la misma (nunca un archivo de otra);
// · verificar repara lo guardado que no cuadra; reparar lo borra todo;
// · viniendo de un worker de antes de version.json: se aplica ya y recarga las páginas;
// · sonidos (comprobados, con su caché) y fotos de las cartas (las 600 más recientes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';

const CODIGO = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
const BASE = 'https://ejemplo.test/app/';
const h12 = t => createHash('sha256').update(t).digest('hex').slice(0, 12);

class Cache {
  constructor() { this.m = new Map(); }
  async match(q, op = {}) {
    let u = typeof q === 'string' ? q : q.url;
    if (op.ignoreSearch) u = u.split('?')[0];
    const r = this.m.get(u); return r ? r.clone() : undefined;
  }
  async put(q, r) { const u = typeof q === 'string' ? q : q.url; this.m.delete(u); this.m.set(u, r.clone()); }
  async delete(q) { return this.m.delete(typeof q === 'string' ? q : q.url); }
  async keys() { return [...this.m.keys()].map(url => ({ url })); }
}
function almacen() {
  const c = new Map();
  return {
    c,
    async open(n) { if (!c.has(n)) c.set(n, new Cache()); return c.get(n); },
    async keys() { return [...c.keys()]; },
    async has(n) { return c.has(n); },
    async delete(n) { return c.delete(n); },
    async match(q, { cacheName, ignoreSearch } = {}) {
      for (const [n, cache] of c) if (!cacheName || n === cacheName) { const r = await cache.match(q, { ignoreSearch }); if (r) return r; }
      return undefined;
    },
  };
}

// Un despliegue: { ruta: contenido } de la app y de Rush → su version.json
function desplegar(app, rush, { audio = {}, commit = 'c0ffee1' } = {}) {
  const huellas = o => Object.fromEntries(Object.entries(o).map(([r, t]) => [r, [h12(t), Buffer.byteLength(t)]]));
  const m = { app: huellas(app), rush: huellas(rush), audio: huellas(audio) };
  return { version: h12(JSON.stringify([m.app, m.rush, m.audio])), commit, fecha: '2026-10-29T10:00:00Z', ...m, contenido: { ...app, ...rush, ...audio } };
}
const A = desplegar(
  { 'index.html': 'inicio A', 'js/app.js': 'app A', 'css/main.css': 'css', 'js/rush-panel.js': 'panel' },
  { 'js/slr/rush.js': 'rush A', 'js/slr/api.js': 'api', 'css/slr.css': 'slr css', 'img/slr/x.svg': 'svg' });
const B = desplegar(
  { 'index.html': 'inicio B', 'js/app.js': 'app B', 'css/main.css': 'css', 'js/rush-panel.js': 'panel' },
  { 'js/slr/rush.js': 'rush B', 'js/slr/api.js': 'api', 'css/slr.css': 'slr css', 'img/slr/x.svg': 'svg' }, { commit: 'beef002' });
const sinContenido = m => { const { contenido, ...x } = m; return x; };

// Un worker «arrancado». servidor: { despliegue, viejo: ruta → veces que la caché intermedia
// aún da lo de antes, retraso(ruta) }
function arrancar({ caches = almacen(), servidor = { despliegue: A }, CACHE_NAME = 'shits-league-v43' } = {}) {
  const oyentes = {}, mensajes = [], pedidos = [], navegadas = [];
  const self = {
    registration: { scope: BASE },
    addEventListener: (t, f) => { oyentes[t] = f; },
    skipWaiting: () => { self.salto = true; },
    clients: { matchAll: async () => [{ url: BASE, postMessage: m => mensajes.push(m), navigate: async u => { navegadas.push(u); } }], claim: async () => {} },
  };
  const fetchFalso = async (q, op = {}) => {
    const url = new URL(typeof q === 'string' ? q : q.url);
    pedidos.push({ url: url.href, cache: op.cache, priority: op.priority, mode: op.mode ?? q.mode });
    if (url.hostname.includes('cloudinary')) return new Response('foto', { status: 200 });
    await servidor.retraso?.(url.pathname);
    const ruta = decodeURIComponent(url.pathname.slice(new URL(BASE).pathname.length)) || 'index.html';
    // La caché intermedia: las primeras veces, lo de antes
    if (servidor.viejo?.[ruta] > 0) { servidor.viejo[ruta]--; return new Response(`viejo ${ruta}`, { status: 200, headers: { 'Content-Type': 'text/plain' } }); }
    const t = servidor.despliegue.contenido[ruta];
    return t == null ? new Response('no', { status: 404 }) : new Response(t, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  };
  const codigo = CODIGO.replace(/const CACHE_NAME = '[^']+'/, `const CACHE_NAME = '${CACHE_NAME}'`);
  const ctx = { self, caches, fetch: fetchFalso, crypto: webcrypto, TextEncoder, TextDecoder, Response, Request, Headers, URL, Map, Set, Promise, Math, JSON,
    String, Array, Uint8Array, Object, Error, Date, decodeURIComponent, console };
  vm.runInNewContext(codigo, ctx);
  const evento = (tipo, datos = {}) => {
    let espera = null, respuesta = null;
    const e = { ...datos, waitUntil: p => { espera = p; }, respondWith: p => { respuesta = p; } };
    oyentes[tipo](e);
    return { espera, respuesta: respuesta && Promise.resolve(respuesta) };
  };
  const pedir = datos => new Promise(res => evento('message', { data: datos, ports: [{ postMessage: res }] }));
  const sw = {
    self, caches, mensajes, pedidos, navegadas, evento, servidor,
    estado: () => pedir({ tipo: 'estado' }),
    instalar: (m, partes, fondo = false) => evento('message', { data: { tipo: 'instalar', manifiesto: sinContenido(m), partes, fondo } }).espera,
    activar: v => pedir({ tipo: 'activar', version: v }),
    verificar: () => pedir({ tipo: 'verificar' }),
    reparar: () => pedir({ tipo: 'reparar' }),
    texto: async url => { const r = await evento('fetch', { request: { url: BASE + url, method: 'GET', mode: url === '' ? 'navigate' : 'cors' } }).respuesta; return r && (r.status === 200 ? r.text() : `(${r.status})`); },
    red: () => pedidos.filter(p => p.url.startsWith(BASE)).map(p => p.url.slice(BASE.length)),
    eventos: () => mensajes.filter(m => m.tipo === 'version'),
  };
  return sw;
}
const nombres = sw => [...sw.caches.c.keys()];

test('instalar la Shits League: solo esa parte, saltándose las cachés y comprobando cada archivo', async () => {
  const sw = arrancar();
  await sw.evento('install').espera;
  assert.ok(sw.self.salto, 'la primera vez se aplica ya');
  await sw.evento('activate').espera;
  assert.equal((await sw.estado()).activa, null, 'sin versión: todo de la red');
  await sw.instalar(A, ['app']);
  assert.deepEqual(sw.red().map(u => u.split('?')[0]).sort(), Object.keys(A.app).sort(), 'solo lo de la Shits League');
  assert.ok(sw.pedidos.every(p => p.cache === 'reload'), "cache: 'reload'");
  assert.ok(sw.red().every(u => /\?v=[0-9a-f]{12}$/.test(u)), 'y ?v=huella (también se salta la caché de GitHub Pages)');
  const prog = sw.eventos().filter(m => m.evento === 'progreso');
  assert.equal(prog.at(-1).bytes, prog.at(-1).totalBytes);
  assert.ok(sw.eventos().some(m => m.evento === 'lista'));
  assert.ok((await sw.activar(A.version)).ok);
  const e = await sw.estado();
  assert.deepEqual([e.activa.version, e.activa.commit, e.app, e.rush], [A.version, 'c0ffee1', true, false]);
  sw.pedidos.length = 0;
  assert.equal(await sw.texto('js/app.js'), 'app A');
  assert.equal(await sw.texto(''), 'inicio A', 'navegación → index.html');
  assert.equal(sw.pedidos.length, 0, 'de la caché');
});

test('si la caché intermedia da un archivo viejo, se vuelve a pedir; si sigue, la versión NO se instala', async () => {
  const sw = arrancar({ servidor: { despliegue: A, viejo: { 'js/app.js': 1 } } });
  await sw.instalar(A, ['app']);
  assert.equal(sw.red().filter(u => u.startsWith('js/app.js')).length, 2, 'pedido otra vez');
  assert.ok((await sw.activar(A.version)).ok);
  assert.equal(await sw.texto('js/app.js'), 'app A', 'y guardado el bueno');
  // Siempre viejo: error, sin marca de entera, y no se puede activar
  const sw2 = arrancar({ servidor: { despliegue: A, viejo: { 'js/app.js': 99 } } });
  await sw2.instalar(A, ['app']);
  const err = sw2.eventos().find(m => m.evento === 'error');
  assert.ok(err?.huella && /js\/app\.js/.test(err.error), err?.error);
  assert.equal((await sw2.activar(A.version)).ok, false, 'a medias no se activa');
  assert.equal((await sw2.estado()).activa, null);
});

test('de A a B: solo se baja lo que ha cambiado, y al activar B no sobrevive nada de A', async () => {
  const caches = almacen();
  const sw = arrancar({ caches });
  await sw.instalar(A, ['app', 'rush']);
  await sw.activar(A.version);
  // Se despliega B
  sw.servidor.despliegue = B;
  sw.pedidos.length = 0;
  sw.mensajes.length = 0;
  await sw.instalar(B, ['app']);
  assert.deepEqual(sw.red().map(u => u.split('?')[0]).sort(), ['index.html', 'js/app.js'], 'lo igual se copia de A (comprobado)');
  const prog = sw.eventos().filter(m => m.evento === 'progreso').at(-1);
  assert.equal(prog.totalBytes, Buffer.byteLength('inicio B') + Buffer.byteLength('app B'), 'el progreso es solo de lo que ha cambiado');
  // Mientras no se active, sigue A
  assert.equal(await sw.texto('js/app.js'), 'app A');
  await sw.activar(B.version);
  assert.equal(await sw.texto('js/app.js'), 'app B');
  assert.ok(!nombres(sw).some(n => n.includes(`-app-${A.version}`)), 'la Shits League de A, fuera');
  // Rush de B aún no está: la de A se queda (para copiar), pero NUNCA se sirve con B activa
  assert.ok(nombres(sw).some(n => n.includes(`-rush-${A.version}`)));
  sw.pedidos.length = 0;
  assert.equal(await sw.texto('js/slr/rush.js'), 'rush B', 'Rush siempre de la versión activa (de la red, con la huella de B)');
  assert.equal((await sw.estado()).rush, false);
  // JUGAR: Rush de B, solo lo cambiado
  sw.pedidos.length = 0;
  await sw.instalar(B, ['rush']);
  assert.deepEqual(sw.red().map(u => u.split('?')[0]), ['js/slr/rush.js']);
  assert.equal((await sw.estado()).rush, true);
  // Ya con Rush de B: fuera lo de A
  await sw.activar(B.version);
  assert.ok(!nombres(sw).some(n => n.includes(A.version)), `nada de A: ${nombres(sw).join(', ')}`);
  // Y todo lo guardado es de B
  for (const n of nombres(sw).filter(n => /-(app|rush)-/.test(n))) {
    for (const k of await caches.c.get(n).keys()) {
      if (k.url.endsWith('.json')) continue;
      const ruta = k.url.slice(BASE.length);
      assert.equal(await (await caches.c.get(n).match(k.url)).text(), B.contenido[ruta], ruta);
    }
  }
});

test('una copia de otra caché solo vale si su huella cuadra (una caché vieja con archivos rancios)', async () => {
  const caches = almacen();
  // Una caché de un worker de antes, con un app.js «viejo» guardado como si fuera el de A
  const vieja = await caches.open('shits-league-v42-app-0123456789ab');
  await vieja.put(BASE + 'js/app.js', new Response('app rancio'));
  await vieja.put(BASE + 'css/main.css', new Response('css'));
  const sw = arrancar({ caches });
  await sw.instalar(A, ['app']);
  const red = sw.red().map(u => u.split('?')[0]);
  assert.ok(red.includes('js/app.js'), 'el rancio no se copia: se descarga');
  assert.ok(!red.includes('css/main.css'), 'el bueno sí se copia');
  await sw.activar(A.version);
  assert.equal(await sw.texto('js/app.js'), 'app A');
});

test('verificar: lo guardado que no cuadra se vuelve a descargar (un archivo roto se repara solo)', async () => {
  const caches = almacen();
  const sw = arrancar({ caches });
  await sw.instalar(A, ['app', 'rush']);
  await sw.activar(A.version);
  const n = nombres(sw).find(x => x.includes(`-app-${A.version}`));
  await caches.c.get(n).put(BASE + 'js/app.js', new Response('roto'));
  assert.equal(await sw.texto('js/app.js'), 'roto');
  const r = await sw.verificar();
  assert.deepEqual([...r.reparados], ['js/app.js']);
  assert.equal(await sw.texto('js/app.js'), 'app A');
  assert.deepEqual([...(await sw.verificar()).reparados], [], 'ya está bien');
});

test('reparar: borra todas las cachés de código (y la versión activa)', async () => {
  const sw = arrancar();
  await sw.instalar(A, ['app', 'rush']);
  await sw.activar(A.version);
  await (await sw.caches.open('slr-fotos-cartas')).put('https://res.cloudinary.com/x', new Response('f'));
  assert.ok((await sw.reparar()).ok);
  assert.equal((await sw.estado()).activa, null);
  assert.ok(!nombres(sw).some(n => /-(app|rush)-/.test(n)), nombres(sw).join(', '));
  assert.ok(nombres(sw).includes('slr-fotos-cartas'), 'las fotos se quedan');
});

test('la misma versión con otro commit (sin cambios en la web): solo cambia la etiqueta', async () => {
  const sw = arrancar();
  await sw.instalar(A, ['app']);
  await sw.activar(A.version);
  await new Promise(res => sw.evento('message', { data: { tipo: 'etiqueta', version: A.version, commit: 'nuevo12', fecha: '2026-10-30T09:00:00Z' }, ports: [{ postMessage: res }] }));
  const e = await sw.estado();
  assert.deepEqual([e.activa.commit, e.activa.fecha], ['nuevo12', '2026-10-30T09:00:00Z']);
});

test('instalar dos veces lo mismo a la vez es la misma descarga; a mitad, «estado» da el progreso', async () => {
  let soltar;
  const parada = new Promise(r => { soltar = r; });
  const sw = arrancar({ servidor: { despliegue: A, retraso: p => (p.endsWith('x.svg') ? parada : null) } });
  const una = sw.instalar(A, ['rush']);
  const otra = sw.instalar(A, ['rush']);
  await new Promise(r => setTimeout(r, 30));
  const e = await sw.estado();
  assert.equal(e.instalando.length, 1);
  assert.equal(e.instalando[0].hechos, 3, 'tres de cuatro');
  soltar();
  await Promise.all([una, otra]);
  assert.equal(sw.red().length, 4, 'cada archivo una vez');
});

test('viniendo de un worker de antes de version.json: se aplica ya y recarga las páginas abiertas', async () => {
  const caches = almacen();
  await (await caches.open('shits-league-v42-app-0123456789ab')).put(BASE + 'js/app.js', new Response('viejo'));
  const sw = arrancar({ caches });
  await sw.evento('install').espera;
  assert.ok(sw.self.salto);
  await sw.evento('activate').espera;
  assert.deepEqual(sw.navegadas, [BASE]);
  // Uno nuevo de este tipo (con su estado) espera a que lo aplique la página
  await sw.instalar(A, ['app']);
  await sw.activar(A.version);
  const sw2 = arrancar({ caches, CACHE_NAME: 'shits-league-v44' });
  await sw2.evento('install').espera;
  assert.ok(!sw2.self.salto, 'espera: lo aplica version.js al abrir');
  await sw2.evento('activate').espera;
  assert.deepEqual(sw2.navegadas, [], 'y no recarga nada');
});

test('lo que no es de la versión: version.json, sw.js y lo de fuera de las listas van a la red', async () => {
  const sw = arrancar();
  await sw.instalar(A, ['app']);
  await sw.activar(A.version);
  assert.equal(sw.evento('fetch', { request: { url: BASE + 'version.json?t=1', method: 'GET', mode: 'cors' } }).respuesta, null);
  assert.equal(sw.evento('fetch', { request: { url: BASE + 'sw.js', method: 'GET', mode: 'cors' } }).respuesta, null);
  assert.equal(sw.evento('fetch', { request: { url: 'https://abc.supabase.co/rest/v1/cartas', method: 'GET', mode: 'cors' } }).respuesta, null);
  assert.equal(sw.evento('fetch', { request: { url: 'https://abc.supabase.co/rest/v1/rpc/x', method: 'POST', mode: 'cors' } }).respuesta, null);
});

test('sonidos: no se precargan; al pedirlos se guardan comprobados, y si cambian se vuelven a descargar', async () => {
  const conAudio = (m, t) => desplegar(Object.fromEntries(Object.entries(m.contenido).filter(([r]) => m.app[r])),
    Object.fromEntries(Object.entries(m.contenido).filter(([r]) => m.rush[r])), { audio: { 'audio/partido/gol_1.mp3': t } });
  const A2 = conAudio(A, 'gol uno'), B2 = conAudio(A, 'gol uno nuevo');
  const sw = arrancar({ servidor: { despliegue: A2 } });
  await sw.instalar(A2, ['app', 'rush']);
  assert.ok(!sw.red().some(u => u.startsWith('audio/')), 'ni con la app ni con JUGAR');
  await sw.activar(A2.version);
  sw.pedidos.length = 0;
  assert.equal(await sw.texto('audio/partido/gol_1.mp3'), 'gol uno');
  assert.equal(sw.pedidos[0].priority, 'low');
  await sw.texto('audio/partido/gol_1.mp3');
  assert.equal(sw.pedidos.length, 1, 'la segunda vez, de su caché');
  sw.servidor.despliegue = B2;
  await sw.instalar(B2, ['app']);
  await sw.activar(B2.version);
  assert.equal(await sw.texto('audio/partido/gol_1.mp3'), 'gol uno nuevo');
});

test('fotos de las cartas: con CORS, de la caché la segunda vez y solo las 600 más recientes', async () => {
  const sw = arrancar();
  const foto = n => `https://res.cloudinary.com/demo/image/upload/c_fill,ar_5:7,g_auto,w_400,f_auto,q_auto/v1/carta${n}.jpg`;
  const pedir = (u, extra = {}) => sw.evento('fetch', { request: { url: u, method: 'GET', mode: 'cors', ...extra } }).respuesta;
  const r1 = await pedir(foto(1), { mode: 'no-cors' });
  assert.equal(await r1.text(), 'foto');
  assert.equal(sw.pedidos.at(-1).mode, 'cors', 'pedida con CORS aunque la <img> no lo pida');
  const n = sw.pedidos.length;
  await pedir(foto(1));
  assert.equal(sw.pedidos.length, n, 'la segunda vez, de la caché');
  for (let i = 2; i <= 640; i++) await pedir(foto(i));
  await new Promise(r => setTimeout(r, 50));
  const keys = await (await sw.caches.open('slr-fotos-cartas')).keys();
  assert.ok(keys.length <= 620 && keys.length >= 600, `recortada (${keys.length})`);
  assert.ok(keys.some(k => k.url === foto(640)) && !keys.some(k => k.url === foto(2)), 'se quedan las más recientes');
  assert.equal(sw.evento('fetch', { request: { url: 'https://res.cloudinary.com/demo/image/upload/v1/emblema.png', method: 'GET', mode: 'cors' } }).respuesta, null);
});
