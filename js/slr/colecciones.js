/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — colecciones de cartas
   Caché de la tabla colecciones (lectura pública): las del catálogo común y,
   en una liga de prueba, las creadas en ella. La carga rush.js con la liga;
   carta.js la consulta para el fondo, el emblema y el nombre de la colección.
   Emblema: PNG o SVG monocromo con fondo transparente en Cloudinary; la app lo
   pinta tintado con el color de la colección (CSS mask-image).
═══════════════════════════════════════════════ */
import { leer } from './api.js';

let mapa = new Map();

export async function cargarColecciones(ligaId) {
  const filas = await leer(`colecciones?select=id,nombre,color,emblema_url,descripcion,liga_prueba_id,creada_en` +
    `&or=(liga_prueba_id.is.null,liga_prueba_id.eq.${ligaId})&order=nombre&limit=1000`);
  mapa = new Map(filas.map(k => [k.id, k]));
  return filas;
}

export const coleccion = id => (id ? mapa.get(id) ?? null : null);
export const listaColecciones = () => [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
// Para el muestrario y las vistas previas del gestor (sin guardar)
export function ponerColeccion(k) { mapa.set(k.id, k); }

// Cuadrado, ajustado sin recortar, con la transparencia (f_auto la conserva)
export function urlEmblema(url, px = 128) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url;
  return url.replace(/(\/image\/upload\/)/, `$1c_pad,ar_1:1,w_${px},b_transparent,f_auto,q_auto/`);
}
