/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — precarga de las fotos de las cartas en segundo plano
   Cuando no hay nada importante cargando (ni datos ni fotos que se están
   viendo), descarga de pocas en pocas las fotos pequeñas que probablemente se
   verán. Pasan por el service worker, que las guarda en su caché de fotos.
   Orden (lo de un grupo antes que lo del siguiente):
     1. las cartas del usuario · 2. las del rival de la jornada ·
     3. las del mercado y la subasta del día · 4. solo el admin: el catálogo entero
   El álbum completo no se precarga. Con el ahorro de datos activado
   (navigator.connection.saveData), nada.
═══════════════════════════════════════════════ */
import { urlCarta, yaGuardada, guardarComoCacheada, fotosCargando } from './imagenes.js';
import { enVuelo } from './api.js';

// Algo importante cargando: datos de Supabase o fotos que se están viendo
const ocupado = () => enVuelo() > 0 || fotosCargando() > 0;

export const GRUPOS = ['propias', 'rival', 'mercado', 'catalogo'];
const A_LA_VEZ = 2;

const colas = new Map(GRUPOS.map(g => [g, []]));
const vistas = new Set();            // URLs ya en alguna cola (o descargadas)
let activas = 0, programado = false;
let entorno = {                      // lo que cambia en las pruebas
  ahorro: () => !!globalThis.navigator?.connection?.saveData,
  ocioso: cb => (globalThis.requestIdleCallback ?? (f => setTimeout(f, 200)))(cb, { timeout: 3000 }),
  // El service worker la guarda al pasar: aquí no hace falta leerla (se suelta sin tocar el hilo principal)
  descargar: url => fetch(url, { mode: 'cors', credentials: 'omit', priority: 'low' }).then(r => { r.body?.cancel().catch(() => {}); if (!r.ok) throw new Error(r.status); }),
  ocupado,
};
export function _entorno(e) { entorno = { ...entorno, ...e }; }
export function _reiniciar() { for (const c of colas.values()) c.length = 0; vistas.clear(); activas = 0; programado = false; }

// Añade las fotos (imagen_url de las cartas) de un grupo. Se pueden pasar repetidas: cada foto va una vez
export function precargarFotos(grupo, imagenes) {
  if (!colas.has(grupo) || entorno.ahorro()) return;
  const cola = colas.get(grupo);
  for (const img of imagenes) {
    const url = img && urlCarta(img, 'pequena');
    if (!url || vistas.has(url) || yaGuardada(url)) continue;
    vistas.add(url);
    cola.push(url);
  }
  programar();
}

// La foto de una carta tal como llega del servidor (con o sin disenos_carta)
export const imagenDe = j => (j?.disenos_carta ?? j)?.imagen_url;
// Las del mercado y la subasta del día (slr_mercado)
export function fotosDelMercado(m) {
  precargarFotos('mercado', [...(m?.subastas ?? []), ...(m?.ventas ?? [])].map(x => imagenDe(x.carta)));
}

// Lo que queda por descargar, en orden (para las pruebas y para depurar)
export const pendientes = () => GRUPOS.flatMap(g => colas.get(g).map(url => ({ grupo: g, url })));

function siguiente() {
  for (const g of GRUPOS) { const c = colas.get(g); if (c.length) return c.shift(); }
  return null;
}
function programar() {
  if (programado || activas >= A_LA_VEZ || !pendientes().length) return;
  programado = true;
  entorno.ocioso(trabajar);
}
function trabajar() {
  programado = false;
  // Si la app está cargando algo importante, se espera a otro rato libre
  if (entorno.ocupado()) { programar(); return; }
  while (activas < A_LA_VEZ) {
    const url = siguiente();
    if (!url) return;
    activas++;
    entorno.descargar(url).then(() => guardarComoCacheada(url), () => {}).finally(() => { activas--; programar(); });
  }
}
