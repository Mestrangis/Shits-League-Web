/* ═══════════════════════════════════════════════
   SHITS LEAGUE — sheets.js
   Lee clasificación/goles/asistencias desde Google Sheets API pública.
   La hoja debe estar publicada en "Compartir → Publicar en la web".
═══════════════════════════════════════════════ */

// TODO: reemplaza con el ID real de tu hoja de cálculo
const SHEETS_ID  = 'TU_SPREADSHEET_ID';
const SHEETS_KEY = 'TU_API_KEY';

// Nombre exacto de las hojas dentro del spreadsheet
const SHEET_CLASIFICACION = 'Clasificacion';
const SHEET_GOLES         = 'Goles';
const SHEET_ASISTENCIAS   = 'Asistencias';

function sheetsUrl(sheetName) {
  return `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/${encodeURIComponent(sheetName)}?key=${SHEETS_KEY}`;
}

// Devuelve array de objetos a partir de la respuesta de Sheets API
// Asume que la primera fila son cabeceras
function parseSheet(data) {
  const [headers, ...rows] = data.values || [];
  if (!headers) return [];
  return rows.map(row =>
    Object.fromEntries(headers.map((h, i) => [h.trim(), row[i]?.trim() ?? '']))
  );
}

// Carga los datos de clasificación desde Sheets.
// Si falla o no está configurado, devuelve null para usar los datos locales.
async function fetchClasificacion() {
  if (SHEETS_ID === 'TU_SPREADSHEET_ID') return null;
  try {
    const res  = await fetch(sheetsUrl(SHEET_CLASIFICACION));
    const json = await res.json();
    return parseSheet(json);
  } catch (e) {
    console.warn('[sheets] No se pudo cargar la clasificación:', e);
    return null;
  }
}

async function fetchGoles() {
  if (SHEETS_ID === 'TU_SPREADSHEET_ID') return null;
  try {
    const res  = await fetch(sheetsUrl(SHEET_GOLES));
    const json = await res.json();
    return parseSheet(json);
  } catch (e) {
    console.warn('[sheets] No se pudo cargar goles:', e);
    return null;
  }
}

async function fetchAsistencias() {
  if (SHEETS_ID === 'TU_SPREADSHEET_ID') return null;
  try {
    const res  = await fetch(sheetsUrl(SHEET_ASISTENCIAS));
    const json = await res.json();
    return parseSheet(json);
  } catch (e) {
    console.warn('[sheets] No se pudo cargar asistencias:', e);
    return null;
  }
}
