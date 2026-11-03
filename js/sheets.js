/* ═══════════════════════════════════════════════
   SHITS LEAGUE — sheets.js
   Lee todos los datos desde Google Sheets API pública.
   Los votos se escriben via Google Apps Script (postVoto).
═══════════════════════════════════════════════ */

const SHEETS_KEY = 'AIzaSyC5TLnk-zGTAia4HZNvv77PgY2FtXYfhdc';

// Nombre exacto de las pestañas en el spreadsheet
const SHEET_JUGADORES = 'Jugadores';
const SHEET_JORNADAS  = 'Jornadas';
const SHEET_VOTACIONES = 'Votaciones';
const SHEET_MVPS = 'MVPs';

// Apps Script de votaciones (solo escritura de votos; apps-script/votos.gs): uno solo para todas
// las temporadas, que escribe en la hoja de la temporada que le llega
const VOTOS_GAS_URL    = 'https://script.google.com/macros/s/AKfycbzt5vjAG01F8_rYXtWqpXg6pfkzWSzTeC8hKhAIX2JHEHHzXold1nghD1ZtHJBV0j6dzw/exec';
const VOTOS_GAS_SECRET = 'pissleague';

// ── Core ──────────────────────────────────────────────────────────────────

// Cada temporada lee SU hoja (js/temporadas.js)
const hojaDeLaTemporada = () => temporadaPorId(STATE.season)?.hoja || '';

function sheetsUrl(sheetName) {
  return `https://sheets.googleapis.com/v4/spreadsheets/${hojaDeLaTemporada()}/values/${encodeURIComponent(sheetName)}?key=${SHEETS_KEY}`;
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

// Una temporada sin hoja o una pestaña que aún no existe (HTTP 400) es lo mismo que sin datos
async function sheetsFetch(sheetName) {
  if (!hojaDeLaTemporada()) return [];
  const res = await fetch(sheetsUrl(sheetName), { cache: 'no-store' });
  if (res.status === 400) return [];
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
      fecha:           normalizarFecha(r.fecha),
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
// Pestaña: fecha_partido | jornada | votante | voto_1 | puntos_1 | voto_2 | puntos_2 | voto_3 | puntos_3 | fecha_voto
// Devuelve null si no se ha podido leer. El número de jornada
// es solo informativo: las filas de antes de fecha_partido solo lo llevan a él (mvp.js → fechaDeFila).
async function fetchMVPs() {
  try {
    const rows = await sheetsFetch(SHEET_MVPS);
    return rows.filter(r => (r.fecha_partido || r.jornada) && r.votante).map(r => ({
      fecha_partido: normalizarFecha(r.fecha_partido),
      jornada: r.jornada ? parseInt(r.jornada) : null,
      votante: r.votante,
      votos:   [1, 2, 3].filter(i => r[`voto_${i}`]).map(i => ({ nombre: r[`voto_${i}`], puntos: parseInt(r[`puntos_${i}`]) || 0 })),
      fecha_voto: r.fecha_voto || '',
    }));
  } catch (e) {
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
      body: JSON.stringify({ secret: VOTOS_GAS_SECRET, temporada: STATE.season, ...datos }),
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

// votos: [{ nombre, puntos }]. La jornada, informativa: con ella aún responde un script sin publicar
function postVotoMVP(fecha, jornada, votante, votos) {
  return postScript({ action: 'votarMVP', fecha, jornada, votante, votos });
}

// AAAA-MM-DD a partir de AAAA-M-D o D/M/AAAA, con hora detrás o sin ella. Sin objetos Date: una
// fecha de partido no tiene zona horaria. Lo que no se entiende se queda como está.
function normalizarFecha(valor) {
  const s = String(valor ?? '').trim();
  const dos = n => n.padStart(2, '0');
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${dos(m[2])}-${dos(m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${dos(m[2])}-${dos(m[1])}` : s;
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
