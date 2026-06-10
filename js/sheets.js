/* ═══════════════════════════════════════════════
   SHITS LEAGUE — sheets.js
   Lee todos los datos desde Google Sheets API pública.
   Escribe via Google Apps Script (gasPost).
═══════════════════════════════════════════════ */

const SHEETS_ID  = '1EHGrFt2Y3QDCOdSV3fVgWvspzXYcir4SmDxOezdSLRY';
const SHEETS_KEY = 'AIzaSyC5TLnk-zGTAia4HZNvv77PgY2FtXYfhdc';
const GAS_URL    = 'https://script.google.com/macros/s/AKfycbxsRzPPbEqcqSTYIt8FLocST7wIYqqFIIjzMmacztn4IeIF7E9QNNj781qnPgqNLafphA/exec';
const GAS_SECRET = 'pissleague';

// Nombre exacto de las pestañas en el spreadsheet
const SHEET_JUGADORES     = 'Jugadores';
const SHEET_JORNADAS      = 'Jornadas';
const SHEET_GOLES         = 'Goles';
const SHEET_ASISTENCIAS   = 'Asistencias';
const SHEET_CLASIFICACION = 'Clasificacion'; // backup opcional

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
// Pestaña: nombre | rating | pos | bandera | pj | victorias | empates | derrotas | mvp | pts | carta_url
async function fetchJugadores() {
  try {
    const rows = await sheetsFetch(SHEET_JUGADORES);
    return rows.map(r => ({
      nombre:  r.nombre  || '',
      media:   parseInt(r.rating) || 0,
      pos:     r.pos     || '',
      bandera: r.bandera || '🏳️',
      img:     r.carta_url || '',
      stats: {
        pj:          parseInt(r.pj)        || 0,
        victorias:   parseInt(r.victorias) || 0,
        empates:     parseInt(r.empates)   || 0,
        derrotas:    parseInt(r.derrotas)  || 0,
        mvp:         parseInt(r.mvp)       || 0,
        pts:         parseInt(r.pts)       || 0,  // calculado por el sistema de V/E/D + bonus capitán
        goles:       0,  // se sobreescribe con pestaña Goles
        asistencias: 0,  // se sobreescribe con pestaña Asistencias
      },
    }));
  } catch (e) {
    console.warn('[sheets] fetchJugadores:', e);
    return null;
  }
}

// ── Jornadas ──────────────────────────────────────────────────────────────
// Pestaña: numero | fecha | local | goles_local | visitante | goles_visitante |
//          jugadores_local | capitan_local | jugadores_visitante | capitan_visitante |
//          mensaje | video_url | amistoso | imagen_url
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
      mensaje:         r.mensaje      || '',
      video_url:       r.video_url    || null,
      amistoso:        r.amistoso === 'TRUE',
      imagen:          r.imagen_url   || null,
    }));
  } catch (e) {
    console.warn('[sheets] fetchJornadas:', e);
    return null;
  }
}

function splitNombres(str) {
  return (str || '').split(',').map(s => s.trim()).filter(Boolean);
}

// ── Goles / Asistencias ───────────────────────────────────────────────────
// Pestaña Goles:       nombre | goles
// Pestaña Asistencias: nombre | asistencias
async function fetchGoles() {
  try { return await sheetsFetch(SHEET_GOLES); }
  catch (e) { console.warn('[sheets] fetchGoles:', e); return null; }
}

async function fetchAsistencias() {
  try { return await sheetsFetch(SHEET_ASISTENCIAS); }
  catch (e) { console.warn('[sheets] fetchAsistencias:', e); return null; }
}

async function fetchClasificacion() {
  try { return await sheetsFetch(SHEET_CLASIFICACION); }
  catch (e) { return null; }
}

// ── Escritura via Apps Script ─────────────────────────────────────────────
async function gasPost(payload) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ secret: GAS_SECRET, ...payload }),
  });
  return res.json();
}
