/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — fotos de las cartas
   · URLs de Cloudinary con pocos anchos fijos (ANCHOS × DPR, redondeado al
     siguiente): pocas transformaciones distintas y más aciertos de caché.
     Siempre f_auto (respeta la transparencia de los PNG) y q_auto.
   · Vista previa (blur-up): una versión diminuta (w_24, borrosa) que llega en
     un instante y da los colores reales mientras carga la buena.
   · Precarga: al pintar una pantalla se piden TODAS sus fotos, sin esperar al
     scroll: primero las que se ven (prioridad alta) y luego el resto (baja).
     precargar(urls) adelanta las de la página siguiente.
   · Caché: las URLs ya descargadas y decodificadas se recuerdan; al volver a
     una pantalla la foto se pone sin fundido (sale de la caché del navegador).
     El service worker no toca las peticiones a Cloudinary (sw.js).
═══════════════════════════════════════════════ */

export const ANCHOS = [160, 240, 320, 480, 640, 960];
const MINI = 'c_fill,ar_5:7,g_auto,w_24,f_auto,q_auto:low,e_blur:400';

const dpr = () => Math.min(3, window.devicePixelRatio || 1);
const deCloudinary = url => typeof url === 'string' && url.includes('res.cloudinary.com') && url.includes('/image/upload/');
const transformar = (url, t) => url.replace(/(\/image\/upload\/)/, `$1${t}/`);

// Ancho de la petición: el ancho en pantalla × DPR, redondeado al siguiente fijo
export function anchoFijo(anchoCss) {
  const px = Math.max(1, anchoCss) * dpr();
  return ANCHOS.find(a => a >= px) ?? ANCHOS[ANCHOS.length - 1];
}

// Recorte 5:7 centrado en lo importante (g_auto)
export function urlFoto(url, anchoCss) {
  return deCloudinary(url) ? transformar(url, `c_fill,ar_5:7,g_auto,w_${anchoFijo(anchoCss)},f_auto,q_auto`) : url;
}
export function urlMini(url) {
  return deCloudinary(url) ? transformar(url, MINI) : null;
}

/* ── Caché ───────────────────────────────────────────────────────────────── */
const listas = new Set();        // URLs descargadas y decodificadas
const guardadas = [];            // las últimas Image, para que el navegador no las suelte
const MAX_GUARDADAS = 400;
export const yaCargada = url => listas.has(url);
function recordar(url, im) {
  listas.add(url);
  if (im) {
    guardadas.push(im);
    if (guardadas.length > MAX_GUARDADAS) guardadas.shift();
  }
}

/* ── Cola: primero las visibles, luego el resto con prioridad baja ───────── */
let tardias = [];
let programada = false;
function vaciarTardias() {
  programada = false;
  const lote = tardias;
  tardias = [];
  for (const f of lote) f();
}
function enCola(alta, f) {
  if (alta) { f(); return; }
  tardias.push(f);
  if (!programada) {
    programada = true;
    // Después de que las visibles hayan salido (y sin competir con el pintado)
    (window.requestIdleCallback ?? (cb => setTimeout(cb, 50)))(vaciarTardias, { timeout: 300 });
  }
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
// Ancho de reserva si la carta aún no tiene tamaño (p. ej. en una hoja que se abre)
const ANCHO_TAM = { xs: 90, s: 170, l: 380 };

const enPantalla = r => r.width > 0 && r.bottom > -40 && r.top < innerHeight + 40 && r.right > 0 && r.left < innerWidth;

// Varias cartas a la vez: primero se miden todas y luego se tocan (medir después
// de escribir obligaría a recalcular la maquetación una vez por carta)
export function cargarFotos(cartas) {
  const con = [...cartas].filter(c => c.querySelector('img.slr-carta__img[data-foto]'));
  const rects = con.map(c => c.getBoundingClientRect());
  con.forEach((c, i) => cargarFotoCarta(c, rects[i]));
}

// Estados de la carta (clases): sin nada → esqueleto con brillo; con-mini → la
// vista previa borrosa; con-foto → la buena (fundido de 250 ms); sin-foto → falló
export function cargarFotoCarta(carta, rect = carta.getBoundingClientRect()) {
  const img = carta.querySelector('img.slr-carta__img[data-foto]');
  if (!img) return;
  const base = img.dataset.foto;
  img.removeAttribute('data-foto');
  const tam = carta.className.match(/slr-carta--(xs|s|l)\b/)?.[1] ?? 's';
  const url = urlFoto(base, rect.width || ANCHO_TAM[tam]);

  const fallo = () => carta.classList.add('slr-carta--sin-foto');
  if (listas.has(url)) {
    // Ya decodificada: al momento, sin fundido
    carta.classList.add('con-foto', 'sin-fundido');
    img.src = url;
    return;
  }
  const mini = carta.querySelector('img.slr-carta__mini');
  const urlM = urlMini(base);
  if (mini && urlM) {
    mini.addEventListener('load', () => carta.classList.add('con-mini'), { once: true });
    mini.src = urlM;
  }
  img.addEventListener('load', () => {
    img.decode().catch(() => {}).then(() => {
      recordar(url);
      carta.classList.add('con-foto');
    });
  }, { once: true });
  img.addEventListener('error', fallo, { once: true });
  const alta = enPantalla(rect);
  enCola(alta, () => {
    img.fetchPriority = alta ? 'high' : 'low';
    img.src = url;
  });
}
