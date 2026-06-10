/* ═══════════════════════════════════════════════
   SHITS LEAGUE — cloudinary.js
   Subida de imágenes via unsigned upload preset.
   No requiere backend ni auth.
═══════════════════════════════════════════════ */

const CLOUDINARY_CLOUD  = 'dnd3g3zgm';    // p.ej. 'shitsleague'
const CLOUDINARY_PRESET = 'ml_default'; // preset unsigned en Cloudinary

/**
 * Sube un File/Blob a Cloudinary.
 * @param {File} file       - el archivo a subir
 * @param {string} folder   - carpeta en Cloudinary ('cartas' | 'resultados')
 * @returns {Promise<string>} URL segura (https://res.cloudinary.com/...)
 */
async function cloudinaryUpload(file, folder) {
  const fd = new FormData();
  fd.append('file',           file);
  fd.append('upload_preset',  CLOUDINARY_PRESET);
  fd.append('folder',         folder);

  const res  = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
    { method: 'POST', body: fd }
  );
  const data = await res.json();

  if (!data.secure_url) {
    throw new Error(data.error?.message || 'Cloudinary upload failed');
  }
  return data.secure_url;
}

/** Sube la carta PNG de un jugador → carpeta /cartas/ */
async function uploadCarta(file) {
  return cloudinaryUpload(file, 'cartas');
}

/** Sube la imagen de resultado de un partido → carpeta /resultados/ */
async function uploadResultado(file) {
  return cloudinaryUpload(file, 'resultados');
}
