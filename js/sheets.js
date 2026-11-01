/* ═══════════════════════════════════════════════
   SHITS LEAGUE — sheets.js
   Lee todos los datos desde Google Sheets API pública.
   Los votos se escriben via Google Apps Script (postVoto).
═══════════════════════════════════════════════ */

const SHEETS_ID  = '1EHGrFt2Y3QDCOdSV3fVgWvspzXYcir4SmDxOezdSLRY';
const SHEETS_KEY = 'AIzaSyC5TLnk-zGTAia4HZNvv77PgY2FtXYfhdc';

// Nombre exacto de las pestañas en el spreadsheet
const SHEET_JUGADORES = 'Jugadores';
const SHEET_JORNADAS  = 'Jornadas';
const SHEET_VOTACIONES = 'Votaciones';
const SHEET_MVPS = 'MVPs';

// Apps Script de votaciones (solo escritura de votos; apps-script/votos.gs)
const VOTOS_GAS_URL    = 'https://script.google.com/macros/s/AKfycbyEujGUhTzs9F9a-5sLUr47yUMmMLBUL8wTnUxk8aRoPlyR_0ukfgSXtUjm8M-MWadkSA/exec';
const VOTOS_GAS_SECRET = 'pissleague';

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
      con_resultado:   r.goles_local !== '' && r.goles_visitante !== '',
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

// ── Votaciones ────────────────────────────────────────────────────────────
// Pestaña: id | fecha | hora | lugar | imagen_url | jugadores_si | jugadores_no
async function fetchVotaciones() {
  try {
    const rows = await sheetsFetch(SHEET_VOTACIONES);
    return rows.filter(r => r.id).map(r => ({
      id:           r.id,
      fecha:        r.fecha      || '',
      hora:         r.hora       || '',
      lugar:        r.lugar      || '',
      imagen:       r.imagen_url || '',
      jugadores_si: splitNombres(r.jugadores_si),
      jugadores_no: splitNombres(r.jugadores_no),
    }));
  } catch (e) {
    console.warn('[sheets] fetchVotaciones:', e);
    return null;
  }
}

// ── MVPs ──────────────────────────────────────────────────────────────────
// Pestaña: jornada | votante | voto_1 | puntos_1 | voto_2 | puntos_2 | voto_3 | puntos_3 | fecha_voto
// Devuelve null si no se ha podido leer. Sin la hoja todavía (HTTP 400): aún no hay votos.
async function fetchMVPs() {
  try {
    const rows = await sheetsFetch(SHEET_MVPS);
    return rows.filter(r => r.jornada && r.votante).map(r => ({
      jornada: parseInt(r.jornada),
      votante: r.votante,
      votos:   [1, 2, 3].filter(i => r[`voto_${i}`]).map(i => ({ nombre: r[`voto_${i}`], puntos: parseInt(r[`puntos_${i}`]) || 0 })),
      fecha:   r.fecha_voto || '',
    }));
  } catch (e) {
    if (String(e.message).includes('HTTP 400')) return [];
    console.warn('[sheets] fetchMVPs:', e);
    return null;
  }
}

// Texto plano: no necesita preflight y el Apps Script deja leer su respuesta.
// Lanza un error con un mensaje para el jugador si no se ha guardado; delServidor: lo ha rechazado él
async function postScript(datos) {
  let res;
  try {
    res = await fetch(VOTOS_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ secret: VOTOS_GAS_SECRET, ...datos }),
    });
  } catch {
    throw new Error('No se ha podido enviar. Revisa la conexión e inténtalo otra vez.');
  }
  const r = await res.json().catch(() => null);
  if (!r) throw new Error('No se ha podido confirmar el voto. Inténtalo otra vez.');
  if (!r.ok) throw Object.assign(new Error(r.error || 'No se ha podido guardar el voto.'), { delServidor: true });
  return r;
}

// voto: 'si' | 'no'
function postVoto(id, nombre, voto) {
  return postScript({ action: 'votar', id, nombre, voto });
}

// votos: [{ nombre, puntos }]
function postVotoMVP(jornada, votante, votos) {
  return postScript({ action: 'votarMVP', jornada, votante, votos });
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
