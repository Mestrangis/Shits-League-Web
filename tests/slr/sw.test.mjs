// Tests del service worker (sw.js) en Node, con Cache Storage, fetch y clientes de mentira:
// · instalación: precarga la Shits League normal (y NADA de Rush), avisa y, la primera vez, se
//   activa sola; al actualizar solo descarga lo que ha cambiado (lo igual lo copia);
// · Rush: se descarga solo al pedirlo la página (JUGAR), con su progreso; en una versión nueva
//   se pone al día en segundo plano solo si ya estaba descargado;
// · una versión nueva publicada a mitad de la primera descarga de Rush: la descarga termina
//   bien y la nueva, al activarse, copia lo igual de ella;
// · la web sale de la caché («primero la caché»), las navegaciones dan index.html y lo que
//   no está en la lista va a la red; Supabase y Google no se tocan;
// · fotos de las cartas: caché propia, pedidas con CORS, y solo las 600 más recientes;
// · sonidos de los partidos: no se precargan; al pedirlos se guardan con su resumen y, si
//   cambian en una versión nueva, se vuelven a descargar.
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

// Un service worker «arrancado» con sus listas; caches puede venir de una versión anterior.
// retraso(ruta): promesa que hace esperar a esa descarga (para probar cosas a mitad)
const resumen = xs => createHash('sha256').update(JSON.stringify(xs)).digest('hex').slice(0, 12);
function arrancar(archivos, { rush = [], audio = [], caches = almacen(), contenido = r => `contenido de ${r}`, retraso = null, cacheName = 'shits-league-v40' } = {}) {
  const oyentes = {}, mensajes = [], pedidos = [];
  const PRECARGA = { version: resumen([...archivos, ...rush, ...audio]), versionRush: resumen(rush), archivos, rush, audio };
  const self = {
    registration: { scope: BASE },
    addEventListener: (t, f) => { oyentes[t] = f; },
    skipWaiting: () => { self.salto = true; },
    clients: { matchAll: async () => [{ postMessage: m => mensajes.push(m) }], claim: async () => {} },
  };
  const fetchFalso = async (q, op = {}) => {
    const url = typeof q === 'string' ? q : q.url;
    pedidos.push({ url, mode: op.mode ?? q.mode, cache: op.cache, priority: op.priority });
    if (url.includes('cloudinary')) return new Response('foto', { status: 200 });
    const ruta = url.slice(BASE.length) || 'index.html';
    await retraso?.(ruta);
    return new Response(contenido(ruta), { status: 200 });
  };
  const codigo = CODIGO.replace(/const CACHE_NAME = '[^']+'/, `const CACHE_NAME = '${cacheName}'`);
  const ctx = { self, caches, fetch: fetchFalso, Response, Request, Headers, URL, Map, Set, Promise, Math, JSON, String, Array, decodeURIComponent, console,
    importScripts: () => { self.PRECARGA = PRECARGA; } };
  vm.runInNewContext(codigo, ctx);
  const evento = (tipo, datos = {}) => {
    let espera = null, respuesta = null;
    const e = { ...datos, waitUntil: p => { espera = p; }, respondWith: p => { respuesta = p; } };
    oyentes[tipo](e);
    return { espera, respuesta: respuesta && Promise.resolve(respuesta) };
  };
  const estado = () => new Promise(res => evento('message', { data: { tipo: 'estado' }, ports: [{ postMessage: res }] }));
  const descargarRush = (fondo = false) => evento('message', { data: { tipo: 'descargarRush', fondo } }).espera;
  const red = () => pedidos.filter(p => p.url.startsWith(BASE)).map(p => p.url.slice(BASE.length));
  return { self, caches, mensajes, pedidos, evento, estado, descargarRush, red, PRECARGA };
}
const cacheDe = (sw, parte) => sw.caches.c.get([...sw.caches.c.keys()].find(k => k.includes(`-${parte}-`)));
const LISTA = [['index.html', 10, 'aaaaaaaaaaaa'], ['js/app.js', 20, 'bbbbbbbbbbbb'], ['css/main.css', 30, 'cccccccccccc'], ['js/rush-panel.js', 40, 'dddddddddddd']];
const RUSH = [['js/slr/rush.js', 100, '111111111111'], ['js/slr/api.js', 200, '222222222222'], ['css/slr.css', 300, '333333333333'], ['img/slr/x.svg', 400, '444444444444']];
const cambiar = (lista, ruta) => lista.map(a => (a[0] === ruta ? [a[0], a[1] + 1, 'eeeeeeeeeeee'] : a));
const peticion = (url, extra = {}) => ({ url, method: 'GET', mode: 'cors', ...extra });
const pausa = (ms = 20) => new Promise(r => setTimeout(r, ms));
function cerrojo() { let soltar; const p = new Promise(r => { soltar = r; }); return { p, soltar }; }

test('instalación: la Shits League normal entera y NADA de Rush; la primera vez se activa sola', async () => {
  const sw = arrancar(LISTA, { rush: RUSH });
  await sw.evento('install').espera;
  const cache = cacheDe(sw, 'app');
  for (const [r] of LISTA) assert.ok(await cache.match(BASE + r), r);
  assert.deepEqual(sw.red().sort(), LISTA.map(a => a[0]).sort(), 'solo lo de la Shits League normal');
  assert.ok(sw.pedidos.every(p => p.cache === 'no-cache'), 'sin fiarse de la caché HTTP');
  assert.ok(sw.pedidos.every(p => p.priority === 'low'), 'con prioridad baja: no compite con la página');
  assert.ok(!cacheDe(sw, 'rush'), 'ni siquiera se abre la caché de Rush');
  assert.ok(sw.mensajes.some(m => m.lista && m.espera === false));
  assert.ok(sw.self.salto, 'sin versión anterior: skipWaiting');
  const e = await sw.estado();
  assert.equal(e.completa, true);
  assert.deepEqual({ lista: e.rush.lista, descargando: e.rush.descargando, anterior: e.rush.anterior }, { lista: false, descargando: false, anterior: false });
});

test('Rush se descarga al pedirlo la página (JUGAR), con su progreso, y después sale de la caché', async () => {
  const sw = arrancar(LISTA, { rush: RUSH });
  await sw.evento('install').espera;
  await sw.evento('activate').espera;
  // Antes de descargarlo, lo de Rush va a la red (sin guardarse)
  sw.pedidos.length = 0;
  const r0 = await sw.evento('fetch', { request: peticion(BASE + 'js/slr/rush.js') }).respuesta;
  assert.equal(await r0.text(), 'contenido de js/slr/rush.js');
  assert.deepEqual(sw.red(), ['js/slr/rush.js']);
  sw.pedidos.length = 0;
  sw.mensajes.length = 0;
  await sw.descargarRush();
  assert.deepEqual(sw.red().sort(), RUSH.map(a => a[0]).sort());
  assert.ok(sw.pedidos.every(p => p.priority === 'auto'), 'la ha pedido el usuario: sin frenar');
  const prog = sw.mensajes.filter(m => m.rush?.bytes != null).map(m => m.rush);
  assert.equal(prog.length, RUSH.length);
  assert.equal(prog.at(-1).bytes, 1000);
  assert.equal(prog.at(-1).totalBytes, 1000);
  assert.ok(prog.every((m, i) => i === 0 || m.bytes >= prog[i - 1].bytes), 'el progreso solo sube');
  assert.ok(sw.mensajes.at(-1).rush.lista, 'y al final, «lista»');
  assert.equal((await sw.estado()).rush.lista, true);
  sw.pedidos.length = 0;
  const r1 = await sw.evento('fetch', { request: peticion(BASE + 'css/slr.css') }).respuesta;
  assert.equal(await r1.text(), 'contenido de css/slr.css');
  assert.equal(sw.pedidos.length, 0, 'de la caché');
  // Pedirla otra vez no descarga nada
  await sw.descargarRush();
  assert.equal(sw.pedidos.length, 0);
});

test('a mitad de descarga, «estado» da el progreso; si el worker se para, se retoma sin repetir lo guardado', async () => {
  const c = cerrojo();
  const caches = almacen();
  const sw = arrancar(LISTA, { rush: RUSH, caches, retraso: r => (r === 'img/slr/x.svg' ? c.p : null) });
  await sw.evento('install').espera;
  sw.descargarRush();
  await pausa();
  const e = await sw.estado();
  assert.equal(e.rush.descargando, true);
  assert.equal(e.rush.progreso.bytes, 600, 'tres de cuatro');
  // El navegador para el worker: uno nuevo (misma versión) retoma lo que falta
  const otro = arrancar(LISTA, { rush: RUSH, caches });
  await otro.descargarRush();
  assert.deepEqual(otro.red(), ['img/slr/x.svg']);
  assert.equal((await otro.estado()).rush.lista, true);
  c.soltar();
});

test('versión nueva: solo lo que ha cambiado; Rush NO se descarga si no se había descargado; espera a la próxima vez', async () => {
  const v1 = arrancar(LISTA, { rush: RUSH });
  await v1.evento('install').espera;
  await v1.evento('activate').espera;
  const v2 = arrancar(cambiar(LISTA, 'js/app.js'), { rush: cambiar(RUSH, 'js/slr/api.js'), caches: v1.caches });
  await v2.evento('install').espera;
  assert.deepEqual(v2.red(), ['js/app.js']);
  assert.ok(!v2.self.salto, 'hay versión anterior: espera');
  assert.ok(v2.mensajes.some(m => m.lista && m.espera === true));
  // Al activarse, fuera la caché de la versión anterior (las fotos se quedan)
  await (await v2.caches.open('slr-fotos-cartas')).put('https://res.cloudinary.com/x', new Response('f'));
  await v2.evento('activate').espera;
  const nombres = await v2.caches.keys();
  assert.equal(nombres.filter(n => n.includes('-app-')).length, 1);
  assert.ok(nombres.includes('slr-fotos-cartas'));
  assert.equal((await v2.estado()).rush.anterior, false, 'no había Rush: no hay nada que poner al día');
});

test('versión nueva con Rush ya descargado: se pone al día en segundo plano (solo lo cambiado, poco a poco)', async () => {
  const v1 = arrancar(LISTA, { rush: RUSH });
  await v1.evento('install').espera;
  await v1.evento('activate').espera;
  await v1.descargarRush();
  const v2 = arrancar(LISTA, { rush: cambiar(RUSH, 'js/slr/api.js'), caches: v1.caches });
  await v2.evento('install').espera;
  assert.deepEqual(v2.red(), ['js/slr/api.js'], 'lo de la Shits League normal, copiado; de Rush, solo lo cambiado');
  assert.ok(v2.pedidos.every(p => p.priority === 'low'), 'en segundo plano');
  assert.ok(!v2.self.salto);
  // Mientras espera, la versión activa sigue sirviendo su Rush entero
  const r = await v1.evento('fetch', { request: peticion(BASE + 'js/slr/api.js') }).respuesta;
  assert.equal(await r.text(), 'contenido de js/slr/api.js');
  await v2.evento('activate').espera;
  assert.equal((await v2.estado()).rush.lista, true, 'al aplicarse, Rush ya está: JUGAR entra directo');
  assert.equal((await v2.caches.keys()).filter(n => n.includes('-rush-')).length, 1, 'la caché vieja de Rush, fuera');
});

test('viniendo del service worker de antes (una sola caché con todo): se aplica ya y Rush se copia sin descargarlo', async () => {
  const caches = almacen();
  const todo = [...LISTA, ...RUSH].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const vieja = await caches.open('shits-league-v39-app-0123456789ab');
  for (const [r] of todo) await vieja.put(BASE + r, new Response(`contenido de ${r}`));
  await vieja.put('__precarga__.json', new Response(JSON.stringify({ version: '0123456789ab', archivos: todo, rush: ['js/slr/rush.js'], critico: [] })));
  const sw = arrancar(LISTA, { rush: RUSH, caches });
  await sw.evento('install').espera;
  assert.deepEqual(sw.red(), [], 'nada a la red: todo era igual');
  assert.ok(sw.self.salto, 'el de antes no sabe aplicar versiones solo: esta se aplica ya');
  await sw.evento('activate').espera;
  assert.equal((await sw.estado()).rush.lista, true);
  assert.ok(!(await caches.keys()).includes('shits-league-v39-app-0123456789ab'));
});

test('una versión nueva publicada a mitad de la primera descarga de Rush: la descarga termina y la nueva copia de ella', async () => {
  const c = cerrojo();
  const v1 = arrancar(LISTA, { rush: RUSH, retraso: r => (r === 'img/slr/x.svg' ? c.p : null) });
  await v1.evento('install').espera;
  await v1.evento('activate').espera;
  const descarga = v1.descargarRush();             // JUGAR por primera vez…
  await pausa();
  // …y a mitad se publica una versión nueva (cambian app.js y api.js): se instala y espera
  const v2 = arrancar(cambiar(LISTA, 'js/app.js'), { rush: cambiar(RUSH, 'js/slr/api.js'), caches: v1.caches });
  await v2.evento('install').espera;
  assert.deepEqual(v2.red(), ['js/app.js'], 'la nueva no se mete con Rush: no estaba descargado entero');
  assert.ok(!v2.self.salto, 'y espera a la próxima vez');
  // La descarga en marcha termina bien, en su versión
  c.soltar();
  await descarga;
  assert.equal((await v1.estado()).rush.lista, true);
  assert.ok(v1.mensajes.some(m => m.rush?.lista));
  assert.ok(!v1.mensajes.some(m => m.rush?.error));
  // Próxima vez: se aplica la nueva. La Rush de la v1 se guarda para copiar de ella
  await v2.evento('activate').espera;
  const e = await v2.estado();
  assert.equal(e.rush.lista, false);
  assert.equal(e.rush.anterior, true, 'Rush ya estaba descargado: la página lo pone al día en segundo plano');
  v2.pedidos.length = 0;
  await v2.descargarRush(true);
  assert.deepEqual(v2.red(), ['js/slr/api.js'], 'solo lo que ha cambiado');
  assert.ok(v2.pedidos.every(p => p.priority === 'low'));
  assert.equal((await v2.estado()).rush.lista, true);
  assert.equal((await v2.caches.keys()).filter(n => /-(app|rush)-/.test(n)).length, 2, 'y la vieja, fuera');
});

test('si la página pide Rush mientras se bajaba en segundo plano, se acelera (y es la misma descarga)', async () => {
  const caches = almacen();
  const viejo = await caches.open('shits-league-v40-rush-0123456789ab');
  await viejo.put('__precarga__.json', new Response(JSON.stringify({ versionRush: '0123456789ab', rush: [['js/slr/rush.js', 1, 'zzzzzzzzzzzz']] })));
  const muchos = Array.from({ length: 12 }, (_, i) => [`js/slr/m${i}.js`, 10, `${i}`.padStart(12, '0')]);
  const c = cerrojo();
  const sw = arrancar(LISTA, { rush: muchos, caches, retraso: r => (r.startsWith('js/slr/') ? c.p : null) });
  const instalacion = sw.evento('install').espera;   // Rush ya estaba (otra versión): la instalación lo pone al día en segundo plano…
  await pausa();
  const enFondo = sw.red().filter(r => r.startsWith('js/slr/')).length;
  assert.equal(enFondo, 2, 'poco a poco: de dos en dos');
  sw.descargarRush(false);              // …y el usuario pulsa JUGAR
  await pausa();
  const ahora = sw.red().filter(r => r.startsWith('js/slr/')).length;
  assert.ok(ahora > enFondo, `más descargas a la vez (${enFondo} → ${ahora})`);
  c.soltar();
  await instalacion;
  assert.equal(new Set(sw.red()).size, sw.red().length, 'cada archivo una vez');
  assert.equal((await sw.estado()).rush.lista, true);
});

test('la web sale de la caché; navegaciones → index.html; lo demás, a la red; Supabase no se toca', async () => {
  const sw = arrancar(LISTA, { rush: RUSH });
  await sw.evento('install').espera;
  await sw.descargarRush();
  sw.pedidos.length = 0;
  for (const url of [BASE + 'js/app.js', BASE + 'css/main.css?v=2', BASE + 'js/slr/rush.js']) {
    const r = await sw.evento('fetch', { request: peticion(url) }).respuesta;
    assert.match(await r.text(), /contenido de (js\/app\.js|css\/main\.css|js\/slr\/rush\.js)/);
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
  await pausa(50);   // el recorte va en segundo plano
  const keys = await (await sw.caches.open('slr-fotos-cartas')).keys();
  assert.ok(keys.length <= 620 && keys.length >= 600, `recortada (${keys.length})`);
  assert.ok(keys.some(k => k.url === foto(640)) && !keys.some(k => k.url === foto(2)), 'se quedan las más recientes');
  // Otras imágenes de Cloudinary (no de cartas): no se guardan
  assert.equal(sw.evento('fetch', { request: peticion('https://res.cloudinary.com/demo/image/upload/v1/emblema.png') }).respuesta, null);
});

test('«estado»: la versión y si cada parte está entera en la caché', async () => {
  const sw = arrancar(LISTA, { rush: RUSH });
  assert.equal((await sw.estado()).completa, false);
  await sw.evento('install').espera;
  const e = await sw.estado();
  assert.equal(e.completa, true);
  assert.equal(e.rush.lista, false);
  assert.equal(e.version, sw.PRECARGA.version);
  // Si el navegador borra la caché de Rush, deja de estar lista (JUGAR la vuelve a descargar)
  await sw.descargarRush();
  assert.equal((await sw.estado()).rush.lista, true);
  await sw.caches.delete([...sw.caches.c.keys()].find(k => k.includes('-rush-')));
  assert.equal((await sw.estado()).rush.lista, false);
});

test('sonidos: no se precargan; al pedirlos se guardan y, si cambian, se vuelven a descargar', async () => {
  const AUDIO = [['audio/partido/gol_1.mp3', 50, 'a0a0a0a0a0a0'], ['audio/partido/ambiente.mp3', 90, 'b0b0b0b0b0b0']];
  const v1 = arrancar(LISTA, { rush: RUSH, audio: AUDIO });
  await v1.evento('install').espera;
  await v1.evento('activate').espera;
  await v1.descargarRush();
  assert.ok(!v1.red().some(r => r.startsWith('audio/')), 'ni al instalar ni al descargar Rush (JUGAR)');
  v1.pedidos.length = 0;
  const pedir = sw => sw.evento('fetch', { request: peticion(BASE + 'audio/partido/gol_1.mp3') }).respuesta;
  assert.equal(await (await pedir(v1)).text(), 'contenido de audio/partido/gol_1.mp3');
  assert.deepEqual(v1.red(), ['audio/partido/gol_1.mp3'], 'la primera vez, de la red');
  assert.equal(v1.pedidos[0].priority, 'low', 'y sin quitar red a lo demás');
  await pedir(v1);
  assert.equal(v1.red().length, 1, 'la segunda, de su caché');
  // Versión nueva en la que cambia gol_1 (y ambiente no)
  const v2 = arrancar(LISTA, { rush: RUSH, audio: [['audio/partido/gol_1.mp3', 51, 'c0c0c0c0c0c0'], AUDIO[1]], caches: v1.caches, contenido: r => `nuevo ${r}` });
  await v2.evento('install').espera;
  await v2.evento('activate').espera;
  assert.ok((await v2.caches.keys()).includes('slr-audio'), 'la caché de sonidos sobrevive a la versión');
  assert.equal(await (await pedir(v2)).text(), 'nuevo audio/partido/gol_1.mp3', 'el que ha cambiado se vuelve a descargar');
});
