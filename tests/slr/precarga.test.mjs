// Tests de la app «instalada como un juego» (fase 1 del repaso de rendimiento):
// · la lista de precarga (precarga.js) está al día, la genera herramientas/precarga.mjs,
//   tiene todo lo que usa la web y nada de tests/, docs/, supabase/…;
// · dos partes: la Shits League normal (se instala con la app) y Rush (se descarga al pulsar
//   JUGAR), sin repetir nada y sin que la Shits League normal tire de nada de Rush;
// · el cambio de versión: qué errores de Supabase significan «el código guardado es viejo»
//   (incluida una función que ya no existe) y que api.js entonces fuerza la actualización.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { generar, archivosDeLaWeb, importsDe, cierreDeImports, esDeRush, RAIZ } from '../../herramientas/precarga.mjs';
import { createHash } from 'node:crypto';

const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const PRECARGA = (() => { const self = {}; new Function('self', generar())(self); return self.PRECARGA; })();
const rutas = new Set([...PRECARGA.archivos, ...PRECARGA.rush].map(a => a[0]));

test('precarga.js está al día (se genera con herramientas/precarga.mjs, nunca a mano)', () => {
  assert.equal(leer('precarga.js'), generar(), 'ejecuta: node herramientas/precarga.mjs');
  // Y el despliegue lo vuelve a generar antes de publicar
  assert.match(leer('.github/workflows/static.yml'), /node herramientas\/precarga\.mjs/);
  assert.match(leer('sw.js'), /importScripts\('precarga\.js'\)/);
});

test('la lista tiene todo lo que usa la web y nada que no', () => {
  for (const r of rutas) {
    assert.ok(existsSync(join(RAIZ, r)), `${r} existe`);
    assert.doesNotMatch(r, /^(tests|docs|supabase|push|herramientas|node_modules|\.github|\.claude)\//, r);
    assert.ok(!['sw.js', 'precarga.js'].includes(r), r);
    assert.doesNotMatch(r, /\.(pdf|jpg|jpeg|md|mjs|sql)$/i, r);
  }
  assert.ok(rutas.has('index.html') && rutas.has('manifest.json'));
  for (const r of archivosDeLaWeb()) assert.ok(rutas.has(r));
  // Todo lo que index.html carga, sus iconos y el manifest
  const html = leer('index.html');
  for (const [, ruta] of html.matchAll(/(?:src|href)="([^":#]+)"/g)) {
    if (['sw.js'].includes(ruta)) continue;
    assert.ok(rutas.has(ruta), `index.html → ${ruta}`);
  }
  for (const i of JSON.parse(leer('manifest.json')).icons) assert.ok(rutas.has(i.src), `manifest → ${i.src}`);
  // Todos los .js de js/ y los .css de css/ (y sus @import)
  for (const r of rutas) {
    if (!r.endsWith('.css')) continue;
    for (const [, url] of leer(r).matchAll(/@import url\('([^']+)'\)/g)) {
      if (/^https?:/.test(url)) continue;
      assert.ok(rutas.has(join(r, '..', url).replace(/\\/g, '/')), `${r} → ${url}`);
    }
  }
  // Cada import estático de cada módulo está en la lista (si no, se pediría a la red)
  for (const r of rutas) if (r.endsWith('.js')) for (const i of importsDe(r)) assert.ok(rutas.has(i), `${r} importa ${i}`);
});

test('cada archivo con su tamaño y su resumen; la versión cambia si cambia cualquiera', () => {
  for (const [r, bytes, resumen] of [...PRECARGA.archivos, ...PRECARGA.rush]) {
    assert.ok(Number.isInteger(bytes) && bytes > 0, r);
    assert.match(resumen, /^[0-9a-f]{12}$/, r);
  }
  assert.match(PRECARGA.version, /^[0-9a-f]{12}$/);
  // Lo mismo en Windows (CRLF) que en el despliegue (LF): el resumen es del texto con LF
  const js = PRECARGA.archivos.find(a => a[0] === 'js/app.js');
  assert.equal(js[1], Buffer.byteLength(leer('js/app.js')));
});

test('dos partes: la Shits League normal (con la app) y Rush (al pulsar JUGAR), sin repetir nada', () => {
  const rush = new Set(PRECARGA.rush.map(a => a[0]));
  const todo = [...PRECARGA.archivos, ...PRECARGA.rush].map(a => a[0]);
  assert.equal(new Set(todo).size, todo.length, 'ningún archivo en las dos');
  assert.deepEqual([...todo].sort(), archivosDeLaWeb());
  // Rush: su código (con todo lo que importa), su CSS con los acabados, sus iconos y lo de assets/ que solo usa Rush
  for (const r of cierreDeImports(['js/slr/config.js', 'js/slr/rush.js'])) assert.ok(rush.has(r), `${r} (módulo de Rush)`);
  for (const r of ['css/slr.css', 'js/slr/partido/ajustes.js', 'css/acabados/foil.css', 'assets/slr-muestra-sin-fondo.png']) assert.ok(rush.has(r), r);
  for (const r of todo) if (esDeRush(r)) assert.ok(rush.has(r), r);
  // La Shits League normal: nada de Rush (ni lo que se carga antes de JUGAR: la portada es rush-panel.js)
  for (const [r] of PRECARGA.archivos) assert.ok(!esDeRush(r) && r !== 'assets/slr-muestra-sin-fondo.png', `${r} es de Rush`);
  for (const r of ['index.html', 'js/app.js', 'js/rush-panel.js', 'js/version.js', 'css/main.css', 'css/rush-panel.css', 'assets/logo-s-green.png']) assert.ok(PRECARGA.archivos.some(a => a[0] === r), r);
  // Ningún archivo de la Shits League normal importa ni cita nada de Rush
  for (const [r] of PRECARGA.archivos) {
    if (r.endsWith('.js')) for (const i of importsDe(r)) assert.ok(!rush.has(i), `${r} importa ${i}`);
    if (/\.(css|html)$/.test(r)) assert.doesNotMatch(leer(r), /(?:href|src|url\()\s*=?\s*["']?(?:\.\.\/)?(?:js\/slr\/|css\/slr\.css|css\/acabados\/|img\/slr\/)/, r);
  }
});

test('versiones: versionRush solo cambia si cambia algo de Rush', () => {
  assert.match(PRECARGA.versionRush, /^[0-9a-f]{12}$/);
  const hash = xs => createHash('sha256').update(JSON.stringify(xs)).digest('hex').slice(0, 12);
  assert.equal(PRECARGA.versionRush, hash(PRECARGA.rush));
  // version es la de todo: cambia con cualquier archivo, de las dos partes y de los sonidos
  const todo = [...PRECARGA.archivos, ...PRECARGA.rush].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  assert.equal(PRECARGA.version, hash([...todo, ...PRECARGA.audio]));
});

test('sonidos: todos los de audio/, con su resumen, fuera de las dos descargas', () => {
  const enDisco = readdirSync(join(RAIZ, 'audio/partido')).filter(f => /\.mp3$/.test(f)).map(f => `audio/partido/${f}`).sort();
  assert.deepEqual(PRECARGA.audio.map(a => a[0]), enDisco);
  for (const [r, bytes, h] of PRECARGA.audio) {
    assert.equal(bytes, readFileSync(join(RAIZ, r)).length, r);
    assert.match(h, /^[0-9a-f]{12}$/, r);
  }
  for (const [r] of [...PRECARGA.archivos, ...PRECARGA.rush]) assert.ok(!r.startsWith('audio/'), `${r}: no va ni con la app ni con JUGAR`);
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
