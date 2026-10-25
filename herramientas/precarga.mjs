// Genera precarga.js: la lista de TODOS los archivos de la web que el service worker
// precarga (sw.js), con su tamaño y un resumen de su contenido, y los módulos de Rush
// que se pueden pedir de golpe (modulepreload).
//   node herramientas/precarga.mjs           → escribe precarga.js
//   node herramientas/precarga.mjs --comprobar → falla si precarga.js no está al día
// Lo lanza el despliegue (.github/workflows/static.yml) y lo comprueba un test
// (tests/slr/precarga.test.mjs). Nunca se edita a mano.
//
// Qué entra: index.html, manifest.json, todo js/ (.js), css/ (.css), img/ y las imágenes
// PNG/SVG de assets/ que cita la web (index.html, manifest.json, CSS o JS: logos, iconos…)
// de hasta 300 KB. Qué no: tests/, docs/, supabase/, push/ (el worker de OneSignal),
// herramientas/, sw.js y precarga.js, ni las fotos JPG y los PDF de assets/ (se piden al verlos).
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEXTO = /\.(js|mjs|css|html|json|svg|txt)$/i;
const IMAGEN = /\.(png|svg|webp|jpg|jpeg|gif|ico)$/i;

const leerNormalizado = ruta => {
  const b = readFileSync(join(RAIZ, ruta));
  // El mismo resultado en Windows (CRLF) y en el despliegue (LF)
  return TEXTO.test(ruta) ? Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : b;
};
const todos = dir => readdirSync(join(RAIZ, dir)).flatMap(n => {
  const r = posix.join(dir, n);
  return statSync(join(RAIZ, r)).isDirectory() ? todos(r) : [r];
});

// Las imágenes PNG/SVG de assets/ que cita la web (hasta 300 KB)
function assetsDeLaWeb() {
  const fuentes = ['index.html', 'manifest.json', ...todos('css').filter(f => f.endsWith('.css')), ...todos('js').filter(f => f.endsWith('.js'))]
    .map(f => leerNormalizado(f).toString('utf8'));
  return todos('assets').filter(f => /\.(png|svg)$/i.test(f) && statSync(join(RAIZ, f)).size <= 300 * 1024
    && fuentes.some(t => t.includes(f) || t.includes(f.slice('assets/'.length))));
}

export function archivosDeLaWeb() {
  const lista = [
    'index.html', 'manifest.json',
    ...todos('js').filter(f => f.endsWith('.js')),
    ...todos('css').filter(f => f.endsWith('.css')),
    ...todos('img').filter(f => IMAGEN.test(f)),
    ...assetsDeLaWeb(),
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

export function generar() {
  const archivos = archivosDeLaWeb().map(ruta => {
    const b = leerNormalizado(ruta);
    return [ruta, b.length, createHash('sha256').update(b).digest('hex').slice(0, 12)];
  });
  const version = createHash('sha256').update(JSON.stringify(archivos)).digest('hex').slice(0, 12);
  // Lo que pide Rush al pulsar JUGAR (rush-panel.js): config.js y rush.js con sus imports
  const rush = cierreDeImports(['js/slr/config.js', 'js/slr/rush.js']);
  // Lo que Rush necesita para funcionar (la primera vez, JUGAR solo espera a esto): sus
  // módulos, su CSS (con los acabados que importa), sus iconos y los ajustes de la
  // reproducción. Lo demás (lo de la Shits League normal, que la página ya ha pedido, y
  // los logos) se descarga después, en segundo plano
  const critico = [...new Set([...rush, 'js/slr/partido/ajustes.js', 'css/slr.css',
    ...archivos.map(a => a[0]).filter(r => r.startsWith('css/acabados/') || r.startsWith('img/slr/'))])].sort();
  return `// Generado por herramientas/precarga.mjs: NO se edita a mano.\n` +
    `// archivos: [ruta, bytes, resumen del contenido] · rush: módulos que se cargan al entrar en Rush\n` +
    `// critico: lo que Rush necesita para funcionar (se descarga primero)\n` +
    `self.PRECARGA = ${JSON.stringify({ version, archivos, rush, critico }, null, 1).replace(/\n\s+(?=["\d\]])/g, ' ').replace(/\[ /g, '[')};\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const texto = generar();
  const destino = join(RAIZ, 'precarga.js');
  if (process.argv.includes('--comprobar')) {
    const actual = existsSync(destino) ? readFileSync(destino, 'utf8').replace(/\r\n/g, '\n') : '';
    if (actual !== texto) { console.error('precarga.js no está al día: node herramientas/precarga.mjs'); process.exit(1); }
    console.log('precarga.js al día');
  } else {
    writeFileSync(destino, texto);
    const p = {};
    new Function('self', texto)(p);
    console.log(`precarga.js: ${p.PRECARGA.archivos.length} archivos, ${Math.round(p.PRECARGA.archivos.reduce((s, a) => s + a[1], 0) / 1024)} KB · versión ${p.PRECARGA.version}`);
  }
}
