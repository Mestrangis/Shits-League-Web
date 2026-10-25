// Tests de la app «instalada como un juego» (fase 1 del repaso de rendimiento):
// · la lista de precarga (precarga.js) está al día, la genera herramientas/precarga.mjs,
//   tiene todo lo que usa la web y nada de tests/, docs/, supabase/…;
// · los módulos de Rush que se piden de golpe (modulepreload) son el cierre de sus imports;
// · el cambio de versión: qué errores de Supabase significan «el código guardado es viejo»
//   (incluida una función que ya no existe) y que api.js entonces fuerza la actualización.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { generar, archivosDeLaWeb, importsDe, cierreDeImports, RAIZ } from '../../herramientas/precarga.mjs';

const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const PRECARGA = (() => { const self = {}; new Function('self', generar())(self); return self.PRECARGA; })();
const rutas = new Set(PRECARGA.archivos.map(a => a[0]));

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
  for (const [r, bytes, resumen] of PRECARGA.archivos) {
    assert.ok(Number.isInteger(bytes) && bytes > 0, r);
    assert.match(resumen, /^[0-9a-f]{12}$/, r);
  }
  assert.match(PRECARGA.version, /^[0-9a-f]{12}$/);
  // Lo mismo en Windows (CRLF) que en el despliegue (LF): el resumen es del texto con LF
  const js = PRECARGA.archivos.find(a => a[0] === 'js/app.js');
  assert.equal(js[1], Buffer.byteLength(leer('js/app.js')));
});

test('Rush: los módulos que se piden de golpe son todos los que carga al entrar', () => {
  assert.deepEqual(PRECARGA.rush, cierreDeImports(['js/slr/config.js', 'js/slr/rush.js']));
  assert.ok(PRECARGA.rush.includes('js/slr/rush.js') && PRECARGA.rush.includes('js/slr/api.js') && PRECARGA.rush.includes('js/slr/pantallas/mercado.js'));
  for (const r of PRECARGA.rush) assert.ok(rutas.has(r), r);
  // Los import() dinámicos no cuentan: ajustes.js se carga con un import() protegido (config.js del partido)
  assert.ok(!PRECARGA.rush.includes('js/slr/partido/ajustes.js') && rutas.has('js/slr/partido/ajustes.js'));
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
