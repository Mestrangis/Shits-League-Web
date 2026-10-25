// Tests del service worker (sw.js) en Node, con Cache Storage, fetch y clientes de mentira:
// · instalación: precarga todos los archivos de la lista, avisa del progreso y, al
//   actualizar, solo descarga lo que ha cambiado (lo igual lo copia de la versión anterior);
// · la web sale de la caché («primero la caché»), las navegaciones dan index.html y lo que
//   no está en la lista va a la red; Supabase y Google no se tocan;
// · fotos de las cartas: caché propia, pedidas con CORS, y solo las 600 más recientes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const CODIGO = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
const BASE = 'https://ejemplo.test/app/';

class Cache {
  constructor() { this.m = new Map(); }
  async match(q) { const r = this.m.get(typeof q === 'string' ? q : q.url); return r ? r.clone() : undefined; }
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
    async delete(n) { return c.delete(n); },
    async match(q, { cacheName } = {}) {
      for (const [n, cache] of c) if (!cacheName || n === cacheName) { const r = await cache.match(q); if (r) return r; }
      return undefined;
    },
  };
}

// Un service worker «arrancado» con su lista; caches puede venir de una versión anterior
function arrancar(archivos, { caches = almacen(), contenido = r => `contenido de ${r}` } = {}) {
  const oyentes = {}, mensajes = [], pedidos = [];
  const PRECARGA = { version: createHash('sha256').update(JSON.stringify(archivos)).digest('hex').slice(0, 12), archivos, rush: [] };
  const self = {
    registration: { scope: BASE },
    addEventListener: (t, f) => { oyentes[t] = f; },
    skipWaiting: () => { self.salto = true; },
    clients: { matchAll: async () => [{ postMessage: m => mensajes.push(m) }], claim: async () => {} },
  };
  const fetchFalso = async (q, op = {}) => {
    const url = typeof q === 'string' ? q : q.url;
    pedidos.push({ url, mode: op.mode ?? q.mode, cache: op.cache });
    if (url.includes('cloudinary')) return new Response('foto', { status: 200 });
    const ruta = url.slice(BASE.length) || 'index.html';
    return new Response(contenido(ruta), { status: 200 });
  };
  const ctx = { self, caches, fetch: fetchFalso, Response, Request, URL, Map, Set, Promise, Math, JSON, String, Array, decodeURIComponent, console,
    importScripts: () => { self.PRECARGA = PRECARGA; } };
  vm.runInNewContext(CODIGO, ctx);
  const evento = (tipo, datos = {}) => {
    let espera = null, respuesta = null;
    const e = { ...datos, waitUntil: p => { espera = p; }, respondWith: p => { respuesta = p; } };
    oyentes[tipo](e);
    return { espera, respuesta: respuesta && Promise.resolve(respuesta) };
  };
  return { self, caches, mensajes, pedidos, evento, PRECARGA };
}
const LISTA = [['index.html', 10, 'aaaaaaaaaaaa'], ['js/app.js', 20, 'bbbbbbbbbbbb'], ['css/main.css', 30, 'cccccccccccc'], ['img/x.svg', 40, 'dddddddddddd']];
const peticion = (url, extra = {}) => ({ url, method: 'GET', mode: 'cors', ...extra });

test('instalación: precarga toda la lista, avisa del progreso y, la primera vez, se activa sola', async () => {
  const sw = arrancar(LISTA);
  await sw.evento('install').espera;
  const cache = sw.caches.c.get([...sw.caches.c.keys()].find(k => k.includes('-app-')));
  for (const [r] of LISTA) assert.ok(await cache.match(BASE + r), r);
  assert.equal(sw.pedidos.filter(p => p.url.startsWith(BASE)).length, LISTA.length);
  assert.ok(sw.pedidos.every(p => p.cache === 'no-cache'), 'sin fiarse de la caché HTTP');
  const prog = sw.mensajes.filter(m => m.bytes != null);
  assert.equal(prog.at(-1).bytes, 100);
  assert.equal(prog.at(-1).totalBytes, 100);
  assert.ok(prog.every((m, i) => i === 0 || m.bytes >= prog[i - 1].bytes));
  assert.ok(sw.mensajes.some(m => m.lista && m.espera === false));
  assert.ok(sw.self.salto, 'sin versión anterior: skipWaiting');
});

test('versión nueva: solo descarga lo que ha cambiado y espera a la próxima vez', async () => {
  const v1 = arrancar(LISTA);
  await v1.evento('install').espera;
  const nueva = LISTA.map(a => (a[0] === 'js/app.js' ? [a[0], 21, 'eeeeeeeeeeee'] : a));
  const v2 = arrancar(nueva, { caches: v1.caches });
  await v2.evento('install').espera;
  assert.deepEqual(v2.pedidos.map(p => p.url), [BASE + 'js/app.js']);
  assert.ok(!v2.self.salto, 'hay versión anterior: espera');
  assert.ok(v2.mensajes.some(m => m.lista && m.espera === true));
  // Al activarse, fuera la caché de la versión anterior (las fotos se quedan)
  await (await v2.caches.open('slr-fotos-cartas')).put('https://res.cloudinary.com/x', new Response('f'));
  await v2.evento('activate').espera;
  const nombres = await v2.caches.keys();
  assert.equal(nombres.filter(n => n.includes('-app-')).length, 1);
  assert.ok(nombres.includes('slr-fotos-cartas'));
});

test('la web sale de la caché; navegaciones → index.html; lo demás, a la red; Supabase no se toca', async () => {
  const sw = arrancar(LISTA);
  await sw.evento('install').espera;
  sw.pedidos.length = 0;
  for (const url of [BASE + 'js/app.js', BASE + 'css/main.css?v=2']) {
    const r = await sw.evento('fetch', { request: peticion(url) }).respuesta;
    assert.match(await r.text(), /contenido de (js\/app\.js|css\/main\.css)/);
  }
  const nav = await sw.evento('fetch', { request: peticion(BASE + 'algo#rush', { mode: 'navigate' }) }).respuesta;
  assert.equal(await nav.text(), 'contenido de index.html');
  assert.equal(sw.pedidos.length, 0, 'nada a la red');
  // sw.js, precarga.js o una foto del archivo: no se responden (red normal)
  assert.equal(sw.evento('fetch', { request: peticion(BASE + 'precarga.js') }).respuesta, null);
  assert.equal(sw.evento('fetch', { request: peticion('https://abc.supabase.co/rest/v1/cartas') }).respuesta, null);
  assert.equal(sw.evento('fetch', { request: peticion('https://abc.supabase.co/rest/v1/rpc/x', { method: 'POST' }) }).respuesta, null);
  assert.equal(sw.evento('fetch', { request: peticion('https://sheets.googleapis.com/v4/x') }).respuesta, null);
});

test('fotos de las cartas: con CORS, de la caché la segunda vez y solo las 600 más recientes', async () => {
  const sw = arrancar(LISTA);
  const foto = n => `https://res.cloudinary.com/demo/image/upload/c_fill,ar_5:7,g_auto,w_400,f_auto,q_auto/v1/carta${n}.jpg`;
  const r1 = await sw.evento('fetch', { request: peticion(foto(1), { mode: 'no-cors' }) }).respuesta;
  assert.equal(await r1.text(), 'foto');
  assert.equal(sw.pedidos.at(-1).mode, 'cors', 'pedida con CORS aunque la <img> no lo pida');
  const n = sw.pedidos.length;
  await sw.evento('fetch', { request: peticion(foto(1)) }).respuesta;
  assert.equal(sw.pedidos.length, n, 'la segunda vez, de la caché');
  for (let i = 2; i <= 640; i++) await sw.evento('fetch', { request: peticion(foto(i)) }).respuesta;
  await new Promise(r => setTimeout(r, 50));   // el recorte va en segundo plano
  const keys = await (await sw.caches.open('slr-fotos-cartas')).keys();
  assert.ok(keys.length <= 620 && keys.length >= 600, `recortada (${keys.length})`);
  assert.ok(keys.some(k => k.url === foto(640)) && !keys.some(k => k.url === foto(2)), 'se quedan las más recientes');
  // Otras imágenes de Cloudinary (no de cartas): no se guardan
  assert.equal(sw.evento('fetch', { request: peticion('https://res.cloudinary.com/demo/image/upload/v1/emblema.png') }).respuesta, null);
});

test('«estado»: la versión y si está entera en la caché', async () => {
  const sw = arrancar(LISTA);
  const pedir = () => new Promise(res => sw.evento('message', { data: { tipo: 'estado' }, ports: [{ postMessage: res }] }));
  assert.equal((await pedir()).completa, false);
  await sw.evento('install').espera;
  const e = await pedir();
  assert.equal(e.completa, true);
  assert.equal(e.version, sw.PRECARGA.version);
});
