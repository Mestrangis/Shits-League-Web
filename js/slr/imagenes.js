/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — fotos de las cartas
   · Solo DOS tamaños por foto (recorte 5:7, f_auto y q_auto de Cloudinary):
       pequeña (400 px de ancho): listas, plantilla, mercado, alineación, reproducción…
       grande (1000 px): el detalle de la carta y la apertura de sobres
     Nítidas en un móvil de pantalla densa (una carta de lista mide ~130 px CSS:
     ×3 = 390 px; la del detalle, hasta ~330: ×3 = 990 px). La misma carta es
     siempre la misma URL: una sola descarga.
   · El service worker las guarda en su caché de fotos («primero la caché», las
     600 más recientes). Aquí se lleva un índice de lo que ya está guardado: esas
     salen directamente, sin el esqueleto de carga.
   · Al pintar una pantalla se piden todas sus fotos: primero las que se ven
     (prioridad alta) y luego el resto (baja). precargar(urls) adelanta las de la
     página siguiente; la precarga en segundo plano está en precarga-fotos.js.
═══════════════════════════════════════════════ */

export const TAMANOS = Object.freeze({ pequena: 400, grande: 1000 });
export const CACHE_FOTOS = 'slr-fotos-cartas';   // la misma que en sw.js

const deCloudinary = url => typeof url === 'string' && url.includes('res.cloudinary.com') && url.includes('/image/upload/');
const transformar = (url, t) => url.replace(/(\/image\/upload\/)/, `$1${t}/`);

// La URL de la foto de una carta en uno de los dos tamaños
export function urlCarta(url, tam = 'pequena') {
  return deCloudinary(url) ? transformar(url, `c_fill,ar_5:7,g_auto,w_${TAMANOS[tam] ?? TAMANOS.pequena},f_auto,q_auto`) : url;
}
// Por el ancho en pantalla (CSS): las de más de 220 px, grandes
export const urlFoto = (url, anchoCss = 0) => urlCarta(url, anchoCss > 220 ? 'grande' : 'pequena');

/* ── Lo que ya está descargado ───────────────────────────────────────────── */
const listas = new Set();        // URLs descargadas y decodificadas en esta sesión
const enCache = new Set();       // URLs guardadas en la caché del service worker
const guardadas = [];            // las últimas Image, para que el navegador no las suelte
const MAX_GUARDADAS = 400;
export const yaCargada = url => listas.has(url);
export const yaGuardada = url => listas.has(url) || enCache.has(url);
export const guardarComoCacheada = url => { enCache.add(url); };
function recordar(url, im) {
  listas.add(url);
  enCache.add(url);
  if (im) {
    guardadas.push(im);
    if (guardadas.length > MAX_GUARDADAS) guardadas.shift();
  }
}
// Lee una vez la caché de fotos del service worker (al abrir Rush)
let indice = null;
export function cargarIndice() {
  return (indice ??= (async () => {
    try {
      if (!globalThis.caches || !(await caches.has(CACHE_FOTOS))) return;
      for (const k of await (await caches.open(CACHE_FOTOS)).keys()) enCache.add(k.url);
    } catch { /* sin Cache Storage: todo por la red */ }
  })());
}

/* ── Fotos que se están viendo y cargan (la precarga en segundo plano espera) ── */
let cargando = 0;
export const fotosCargando = () => cargando;

/* ── Cola: primero las visibles, luego el resto con prioridad baja ───────── */
let tardias = [];
let programada = false;
// Por trozos, mientras quede tiempo libre en el fotograma: cientos de fotos de golpe
// (la lista completa de la herramienta de admin) serían una tarea larga
function vaciarTardias(plazo) {
  programada = false;
  const hasta = performance.now() + 8;
  while (tardias.length && (plazo?.timeRemaining ? plazo.timeRemaining() > 1 : performance.now() < hasta)) tardias.shift()();
  if (tardias.length) programar();
}
function programar() {
  if (programada) return;
  programada = true;
  // Después de que las visibles hayan salido (y sin competir con el pintado)
  (window.requestIdleCallback ?? (cb => setTimeout(cb, 50)))(vaciarTardias, { timeout: 300 });
}
function enCola(alta, f) {
  if (alta) { f(); return; }
  tardias.push(f);
  programar();
}

// Precarga en segundo plano (página siguiente): solo descarga y decodifica
export function precargar(urls) {
  for (const url of urls) {
    if (!url || listas.has(url)) continue;
    enCola(false, () => {
      const im = new Image();
      im.decoding = 'async';
      im.fetchPriority = 'low';
      im.src = url;
      im.decode().then(() => recordar(url, im), () => {});
    });
  }
}

// Descarga y decodifica ya (prioridad alta) y espera, como mucho msMax: para
// animaciones que no deben dar tirones al pintar una foto a medias (apertura)
export function asegurarFotos(urls, msMax = 2500) {
  const pendientes = [...new Set(urls.filter(u => u && !listas.has(u)))].map(url => new Promise(res => {
    const im = new Image();
    im.decoding = 'async';
    im.fetchPriority = 'high';
    im.src = url;
    im.decode().then(() => { recordar(url, im); res(); }, res);
  }));
  return Promise.race([Promise.all(pendientes), new Promise(res => setTimeout(res, msMax))]);
}

/* ── Una carta ───────────────────────────────────────────────────────────── */
const enPantalla = r => r.width > 0 && r.bottom > -40 && r.top < innerHeight + 40 && r.right > 0 && r.left < innerWidth;

// Varias cartas a la vez: primero se miden todas y luego se tocan (medir después
// de escribir obligaría a recalcular la maquetación una vez por carta)
// En las listas de hasta 60 cartas, todas las ya guardadas salen al momento. Las enormes
// (la herramienta de admin entera) no se miden: medirlas obliga a maquetar cientos de
// filas de golpe (unos 340 ms con 658). Las que se ven las adelanta el IntersectionObserver
// de carta.js (cargarFotoCarta al aparecer); el resto, en los ratos libres siguientes.
export const AL_MOMENTO_HASTA = 60;
const FUERA = { width: 0 };   // un rectángulo que no está en pantalla
export function cargarFotos(cartas) {
  const con = [...cartas].filter(c => c.querySelector('img.slr-carta__img[data-foto]'));
  if (con.length > AL_MOMENTO_HASTA) {
    for (const c of con) enCola(false, () => cargarFotoCarta(c, FUERA, false));
    return;
  }
  const rects = con.map(c => c.getBoundingClientRect());
  con.forEach((c, i) => cargarFotoCarta(c, rects[i]));
}

// Estados de la carta (clases): sin nada → esqueleto con brillo; con-foto → la foto
// (fundido de 250 ms; sin fundido ni esqueleto si ya estaba guardada); sin-foto → falló
export function cargarFotoCarta(carta, rect = carta.getBoundingClientRect(), guardadasAlMomento = true) {
  const img = carta.querySelector('img.slr-carta__img[data-foto]');
  if (!img) return;
  const base = img.dataset.foto;
  img.removeAttribute('data-foto');
  const url = urlCarta(base, /slr-carta--l\b/.test(carta.className) ? 'grande' : 'pequena');

  const fallo = () => carta.classList.add('slr-carta--sin-foto');
  const alta = enPantalla(rect);
  if (yaGuardada(url)) {
    // Ya en la caché (o decodificada): sin esqueleto ni fundido. Las que no se ven, por la
    // cola de baja prioridad (cientos de golpe serían una tarea larga en las listas grandes)
    img.addEventListener('error', fallo, { once: true });
    enCola(alta || guardadasAlMomento, () => {
      carta.classList.add('con-foto', 'sin-fundido');
      img.src = url;
    });
    return;
  }
  img.addEventListener('load', () => {
    if (alta) cargando--;
    img.decode().catch(() => {}).then(() => {
      recordar(url);
      carta.classList.add('con-foto');
    });
  }, { once: true });
  img.addEventListener('error', () => { if (alta) cargando--; fallo(); }, { once: true });
  enCola(alta, () => {
    if (alta) cargando++;
    img.fetchPriority = alta ? 'high' : 'low';
    img.src = url;
  });
}
