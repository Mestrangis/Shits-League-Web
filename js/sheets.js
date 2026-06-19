/* ═══════════════════════════════════════════════
   SHITS LEAGUE — sheets.js
   Lee todos los datos desde Google Sheets API pública.
   Escribe via Google Apps Script (gasPost).
═══════════════════════════════════════════════ */

const SHEETS_ID  = '1EHGrFt2Y3QDCOdSV3fVgWvspzXYcir4SmDxOezdSLRY';
const SHEETS_KEY = 'AIzaSyC5TLnk-zGTAia4HZNvv77PgY2FtXYfhdc';
const GAS_URL    = 'https://script.google.com/macros/s/AKfycbx98ycukj9M4_EMaxg4yJ6NxuGrx80fvDQ-mgD-uXHEeAmgb1PSCm9ePDCpgJ3T4ergCg/exec';
const GAS_SECRET = 'pissleague89216420874';

// Nombre exacto de las pestañas en el spreadsheet
const SHEET_JUGADORES = 'Jugadores';
const SHEET_JORNADAS  = 'Jornadas';

// ── Core ──────────────────────────────────────────────────────────────────

function sheetsUrl(sheetName) {
  return `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/${encodeURIComponent(sheetName)}?key=${SHEETS_KEY}`;
}

// Fila 1 = cabeceras → devuelve array de objetos
function parseSheet(data) {
  const [headers, ...rows] = data.values || [];
  if (!headers) return [];
  return rows
    .filter(row => row.some(c => c !== ''))  // ignora filas vacías
    .map(row => Object.fromEntries(
      headers.map((h, i) => [h.trim(), (row[i] ?? '').toString().trim()])
    ));
}

async function sheetsFetch(sheetName) {
  const res = await fetch(sheetsUrl(sheetName), { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer "${sheetName}"`);
  return parseSheet(await res.json());
}

// ── Jugadores ─────────────────────────────────────────────────────────────
// Pestaña: nombre | rating | pos | bandera | carta_url | alias
async function fetchJugadores() {
  try {
    const rows = await sheetsFetch(SHEET_JUGADORES);
    return rows.map(r => ({
      nombre:  r.nombre  || '',
      media:   parseInt(r.rating) || 0,
      pos:     r.pos     || '',
      bandera: r.bandera || '🏳️',
      img:     r.carta_url || '',
      alias:   splitNombres(r.alias),
    }));
  } catch (e) {
    console.warn('[sheets] fetchJugadores:', e);
    return null;
  }
}

// ── Jornadas ──────────────────────────────────────────────────────────────
// Pestaña: numero | fecha | local | goles_local | visitante | goles_visitante |
//          jugadores_local | capitan_local | jugadores_visitante | capitan_visitante |
//          goleadores | asistentes | mensaje | video_url | amistoso | imagen_url | mvp
async function fetchJornadas() {
  try {
    const rows = await sheetsFetch(SHEET_JORNADAS);
    return rows.map(r => ({
      numero:          r.numero ? parseInt(r.numero) : null,
      fecha:           r.fecha        || '',
      local:           r.local        || '',
      goles_local:     parseInt(r.goles_local)     || 0,
      visitante:       r.visitante    || '',
      goles_visitante: parseInt(r.goles_visitante) || 0,
      jugadores_local:     splitNombres(r.jugadores_local),
      capitan_local:       r.capitan_local     || '',
      jugadores_visitante: splitNombres(r.jugadores_visitante),
      capitan_visitante:   r.capitan_visitante || '',
      goleadores:      splitPares(r.goleadores),
      asistentes:      splitPares(r.asistentes),
      mensaje:         r.mensaje      || '',
      video_url:       r.video_url    || null,
      amistoso:        r.amistoso === 'TRUE',
      imagen:          r.imagen_url   || null,
      mvp:             r.mvp          || '',
    }));
  } catch (e) {
    console.warn('[sheets] fetchJornadas:', e);
    return null;
  }
}

function splitNombres(str) {
  return (str || '').split(',').map(s => s.trim()).filter(Boolean);
}

// "Nico:2,Markis:1" → [{ nombre: 'Nico', cantidad: 2 }, { nombre: 'Markis', cantidad: 1 }]
function splitPares(str) {
  return (str || '').split(',').map(s => s.trim()).filter(Boolean).map(par => {
    const [nombre, cantidad] = par.split(':');
    return { nombre: (nombre || '').trim(), cantidad: parseInt(cantidad) || 0 };
  });
}

// ── Escritura via Apps Script ─────────────────────────────────────────────
async function gasPost(payload) {
  await fetch(GAS_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ secret: GAS_SECRET, ...payload }),
  });
  return { ok: true };
}
