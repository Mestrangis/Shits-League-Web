// Genera version.json, la etiqueta de versión de la app: la versión, el commit y la fecha del
// despliegue y la huella (resumen del contenido y tamaño) de cada archivo, en tres partes:
//   · app: la Shits League normal; se instala con la app.
//   · rush: Shits League Rush (js/slr/, css/slr.css, css/acabados/, img/slr/ y lo de
//     assets/ que solo cita Rush); se descarga al pulsar JUGAR.
//   · audio: los sonidos de los partidos (audio/); no se precargan, se guardan al pedirlos.
// La app lo pide siempre sin caché (js/version.js) y el service worker comprueba cada
// archivo que descarga contra su huella (sw.js).
//   node herramientas/precarga.mjs   → escribe version.json (no está en el repo: lo genera
//   el despliegue, .github/workflows/static.yml, y cada banco de pruebas antes de empezar)
//
// Qué entra: index.html, manifest.json, todo js/ (.js), css/ (.css), img/ y las imágenes
// PNG/SVG de assets/ que cita la web (index.html, manifest.json, CSS o JS: logos, iconos…)
// de hasta 300 KB (las que solo cita Rush van con Rush). Qué no: tests/, docs/, supabase/, push/
// (el worker de OneSignal), herramientas/, sw.js y version.json, ni las fotos JPG y los PDF de
// assets/ (se piden al verlos).
// Huella de los textos con saltos de línea LF (igual en Windows que en el despliegue: sw.js
// también los cuenta así).
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, relative, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEXTO = /\.(js|mjs|css|html|json|svg|txt)$/i;
const IMAGEN = /\.(png|svg|webp|jpg|jpeg|gif|ico)$/i;
const SONIDO = /\.(mp3|ogg|m4a|wav)$/i;

const leerNormalizado = ruta => {
  const b = readFileSync(join(RAIZ, ruta));
  // El mismo resultado en Windows (CRLF) y en el despliegue (LF)
  return TEXTO.test(ruta) ? Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : b;
};
const todos = dir => readdirSync(join(RAIZ, dir)).flatMap(n => {
  const r = posix.join(dir, n);
  return statSync(join(RAIZ, r)).isDirectory() ? todos(r) : [r];
});

// ¿Es de Rush? (lo que solo se usa dentro del juego)
export const esDeRush = ruta => /^(js\/slr\/|css\/slr\.css$|css\/acabados\/|img\/slr\/)/.test(ruta);

// Las imágenes PNG/SVG de assets/ que cita la web (hasta 300 KB), con quién las cita
function assetsDeLaWeb() {
  const fuentes = ['index.html', 'manifest.json', ...todos('css').filter(f => f.endsWith('.css')), ...todos('js').filter(f => f.endsWith('.js'))]
    .map(f => [f, leerNormalizado(f).toString('utf8')]);
  return todos('assets').filter(f => /\.(png|svg)$/i.test(f) && statSync(join(RAIZ, f)).size <= 300 * 1024)
    .map(f => [f, fuentes.filter(([, t]) => t.includes(f) || t.includes(f.slice('assets/'.length))).map(([g]) => g)])
    .filter(([, quien]) => quien.length);
}
// Lo de assets/ que solo cita Rush va con Rush
const assetsDeRush = () => new Set(assetsDeLaWeb().filter(([, quien]) => quien.every(esDeRush)).map(([f]) => f));

export function archivosDeLaWeb() {
  const lista = [
    'index.html', 'manifest.json',
    ...todos('js').filter(f => f.endsWith('.js')),
    ...todos('css').filter(f => f.endsWith('.css')),
    ...todos('img').filter(f => IMAGEN.test(f)),
    ...assetsDeLaWeb().map(([f]) => f),
  ];
  return [...new Set(lista)].sort();
}

// Imports estáticos de un módulo (import … from '…', import '…', export … from '…'), resueltos
const IMPORTS = /(?:^|[;\n}])\s*(?:import\s+(?:[^'"()]*?\s+from\s+)?|export\s+[^'"()]*?\s+from\s+)['"]([^'"]+)['"]/g;
export function importsDe(ruta) {
  const texto = leerNormalizado(ruta).toString('utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...texto.matchAll(IMPORTS)].map(m => m[1]).filter(s => s.startsWith('.'))
    .map(s => posix.normalize(posix.join(posix.dirname(ruta), s)));
}
// Todos los módulos que se cargan, sin import() dinámicos, desde los de partida
export function cierreDeImports(desde) {
  const vistos = new Set();
  const pila = [...desde];
  while (pila.length) {
    const r = pila.pop();
    if (vistos.has(r)) continue;
    vistos.add(r);
    pila.push(...importsDe(r));
  }
  return [...vistos].sort();
}

// La etiqueta de versión (version.json): la huella [resumen, bytes] de cada archivo de
// cada parte. version: la del contenido de todo (dos despliegues con lo mismo, la misma
// versión); commit y fecha: los del despliegue (git, o SL_COMMIT / SL_FECHA).
const huellas = rutas => Object.fromEntries(rutas.map(ruta => {
  const b = TEXTO.test(ruta) ? leerNormalizado(ruta) : readFileSync(join(RAIZ, ruta));
  return [ruta, [createHash('sha256').update(b).digest('hex').slice(0, 12), b.length]];
}));
function git(args) {
  try { return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}
export function generar({ commit, fecha } = {}) {
  const deRush = assetsDeRush();
  const todas = archivosDeLaWeb();
  const rush = todas.filter(r => esDeRush(r) || deRush.has(r));
  const app = todas.filter(r => !rush.includes(r));
  const audio = (existsSync(join(RAIZ, 'audio')) ? todos('audio') : []).filter(f => SONIDO.test(f)).sort();
  const m = { app: huellas(app), rush: huellas(rush), audio: huellas(audio) };
  return {
    version: resumen([m.app, m.rush, m.audio]),
    commit: commit ?? process.env.SL_COMMIT ?? (git(['rev-parse', '--short=7', 'HEAD']) || 'local'),
    fecha: fecha ?? process.env.SL_FECHA ?? (git(['log', '-1', '--format=%cI']) || new Date().toISOString()),
    ...m,
  };
}
const resumen = xs => createHash('sha256').update(JSON.stringify(xs)).digest('hex').slice(0, 12);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const v = generar();
  writeFileSync(join(RAIZ, 'version.json'), JSON.stringify(v) + '\n');
  const kb = o => Math.round(Object.values(o).reduce((s, a) => s + a[1], 0) / 1024);
  console.log(`version.json: ${v.version} (${v.commit}, ${v.fecha}) · Shits League ${Object.keys(v.app).length} archivos (${kb(v.app)} KB) · Rush ${Object.keys(v.rush).length} (${kb(v.rush)} KB) · sonidos ${Object.keys(v.audio).length}`);
}
