// Tests de la etiqueta de versión (version.json, la genera herramientas/precarga.mjs):
// · tiene todo lo que usa la web (y nada de tests/, docs/, supabase/…), en dos partes que no
//   se repiten: la Shits League normal (app) y Rush (rush); y los sonidos (audio) aparte;
// · la huella [resumen, bytes] de cada archivo es la de su contenido (los textos con LF, igual
//   en Windows que en el despliegue), y la versión cambia si cambia cualquiera;
// · la genera el despliegue y no está en el repo;
// · el cambio de versión: qué errores de Supabase significan «el código guardado es viejo».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { generar, archivosDeLaWeb, importsDe, cierreDeImports, esDeRush, RAIZ } from '../../herramientas/precarga.mjs';

const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const V = generar({ commit: 'abc1234', fecha: '2026-10-29T10:00:00Z' });
const rutas = new Set([...Object.keys(V.app), ...Object.keys(V.rush)]);
const h12 = b => createHash('sha256').update(b).digest('hex').slice(0, 12);

test('la genera el despliegue (no está en el repo) y la pide la app sin caché', () => {
  assert.match(leer('.github/workflows/static.yml'), /node herramientas\/precarga\.mjs/);
  assert.match(leer('.gitignore'), /^version\.json$/m);
  assert.ok(!existsSync(join(RAIZ, 'precarga.js')), 'ya no hay precarga.js');
  assert.match(leer('js/version.js'), /cache: 'no-store'/);
  assert.match(leer('js/version.js'), /\?t=\$\{Date\.now\(\)\}/);
  assert.deepEqual(Object.keys(V).sort(), ['app', 'audio', 'commit', 'fecha', 'rush', 'version']);
  assert.equal(V.commit, 'abc1234');
  assert.equal(V.fecha, '2026-10-29T10:00:00Z');
});

test('tiene todo lo que usa la web y nada que no', () => {
  for (const r of rutas) {
    assert.ok(existsSync(join(RAIZ, r)), `${r} existe`);
    assert.doesNotMatch(r, /^(tests|docs|supabase|push|herramientas|node_modules|\.github|\.claude)\//, r);
    assert.ok(!['sw.js', 'version.json'].includes(r), r);
    assert.doesNotMatch(r, /\.(pdf|jpg|jpeg|md|mjs|sql)$/i, r);
  }
  assert.ok(rutas.has('index.html') && rutas.has('manifest.json'));
  for (const r of archivosDeLaWeb()) assert.ok(rutas.has(r));
  const html = leer('index.html');
  for (const [, ruta] of html.matchAll(/(?:src|href)="([^":#]+)"/g)) assert.ok(rutas.has(ruta), `index.html → ${ruta}`);
  for (const i of JSON.parse(leer('manifest.json')).icons) assert.ok(rutas.has(i.src), `manifest → ${i.src}`);
  for (const r of rutas) {
    if (!r.endsWith('.css')) continue;
    for (const [, url] of leer(r).matchAll(/@import url\('([^']+)'\)/g)) {
      if (/^https?:/.test(url)) continue;
      assert.ok(rutas.has(join(r, '..', url).replace(/\\/g, '/')), `${r} → ${url}`);
    }
  }
  for (const r of rutas) if (r.endsWith('.js')) for (const i of importsDe(r)) assert.ok(rutas.has(i), `${r} importa ${i}`);
});

test('cada archivo con su huella (resumen del contenido con LF y bytes)', () => {
  for (const [r, [h, bytes]] of [...Object.entries(V.app), ...Object.entries(V.rush)]) {
    const b = /\.(js|mjs|css|html|json|svg|txt)$/i.test(r) ? Buffer.from(leer(r), 'utf8') : readFileSync(join(RAIZ, r));
    assert.equal(h, h12(b), r);
    assert.equal(bytes, b.length, r);
  }
  assert.match(V.version, /^[0-9a-f]{12}$/);
  // La versión es la del contenido de las tres partes
  assert.equal(V.version, h12(JSON.stringify([V.app, V.rush, V.audio])));
});

test('dos partes: la Shits League normal (con la app) y Rush (al pulsar JUGAR), sin repetir nada', () => {
  const app = Object.keys(V.app), rush = new Set(Object.keys(V.rush));
  assert.ok(!app.some(r => rush.has(r)), 'ningún archivo en las dos');
  assert.deepEqual([...app, ...rush].sort(), archivosDeLaWeb());
  for (const r of cierreDeImports(['js/slr/config.js', 'js/slr/rush.js'])) assert.ok(rush.has(r), `${r} (módulo de Rush)`);
  for (const r of ['css/slr.css', 'js/slr/partido/ajustes.js', 'css/acabados/foil.css', 'assets/slr-muestra-sin-fondo.png']) assert.ok(rush.has(r), r);
  for (const r of app) assert.ok(!esDeRush(r) && r !== 'assets/slr-muestra-sin-fondo.png', `${r} es de Rush`);
  for (const r of ['index.html', 'js/app.js', 'js/rush-panel.js', 'js/version.js', 'css/main.css', 'css/rush-panel.css', 'assets/logo-s-green.png']) assert.ok(V.app[r], r);
  for (const r of app) {
    if (r.endsWith('.js')) for (const i of importsDe(r)) assert.ok(!rush.has(i), `${r} importa ${i}`);
    if (/\.(css|html)$/.test(r)) assert.doesNotMatch(leer(r), /(?:href|src|url\()\s*=?\s*["']?(?:\.\.\/)?(?:js\/slr\/|css\/slr\.css|css\/acabados\/|img\/slr\/)/, r);
  }
});

test('sonidos: todos los de audio/, con su huella, fuera de las dos partes', () => {
  const enDisco = readdirSync(join(RAIZ, 'audio/partido')).filter(f => /\.mp3$/.test(f)).map(f => `audio/partido/${f}`).sort();
  assert.deepEqual(Object.keys(V.audio), enDisco);
  for (const [r, [h, bytes]] of Object.entries(V.audio)) {
    const b = readFileSync(join(RAIZ, r));
    assert.equal(bytes, b.length, r);
    assert.equal(h, h12(b), r);
  }
  for (const r of rutas) assert.ok(!r.startsWith('audio/'), r);
});

/* ── Cambio de versión ──────────────────────────────────────────────────── */
// js/version.js en un «navegador» sin service worker: lo que se prueba aquí es la regla
function cargarVersion() {
  const ventana = {};
  vm.runInNewContext(leer('js/version.js'), { window: ventana, navigator: {}, document: {}, console });
  return ventana.SLVersion;
}

test('qué errores de Supabase dicen que el código guardado es viejo', () => {
  const { esErrorDeVersion } = cargarVersion();
  // Una función que ya no existe (o con otros parámetros), una columna o relación que no existe
  assert.ok(esErrorDeVersion(404, { code: 'PGRST202', message: 'Could not find the function public.slr_algo(token) in the schema cache' }));
  assert.ok(esErrorDeVersion(400, { code: 'PGRST204', message: "Could not find the 'x' column" }));
  assert.ok(esErrorDeVersion(400, { code: 'PGRST200', message: 'Could not find a relationship' }));
  assert.ok(esErrorDeVersion(404, { code: '42883', message: 'function slr_algo(text) does not exist' }));
  assert.ok(esErrorDeVersion(400, { code: '42703', message: 'column x does not exist' }));
  // Los errores normales del juego no: sin saldo, sin acceso, sesión caducada…
  assert.ok(!esErrorDeVersion(400, { code: 'P0001', message: 'No tienes saldo suficiente' }));
  assert.ok(!esErrorDeVersion(403, { code: 'RUSH0', message: 'beta' }));
  assert.ok(!esErrorDeVersion(403, { message: 'Sesión caducada' }));
  assert.ok(!esErrorDeVersion(500, null));
});

test('api.js: con una función que ya no existe, fuerza la actualización (y avisa de que se actualiza)', async () => {
  const llamadas = [];
  globalThis.SLVersion = { esErrorDeVersion: cargarVersion().esErrorDeVersion, forzarActualizacion: () => { llamadas.push('forzar'); return Promise.resolve(true); } };
  const fetchAntes = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.slr_vieja' }), { status: 404 });
  try {
    const { rpc } = await import('../../js/slr/api.js');
    await assert.rejects(rpc('slr_vieja', {}, { silencioso: true }), /actualizando a la última versión/);
    assert.deepEqual(llamadas, ['forzar']);
    // Un error normal no la fuerza
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 'P0001', message: 'No tienes saldo' }), { status: 400 });
    await assert.rejects(rpc('slr_comprar', {}, { silencioso: true }), /No tienes saldo/);
    assert.deepEqual(llamadas, ['forzar']);
  } finally {
    globalThis.fetch = fetchAntes;
    delete globalThis.SLVersion;
  }
});
