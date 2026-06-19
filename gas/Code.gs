/* ═══════════════════════════════════════════════
   SHITS LEAGUE — Apps Script (Code.gs)
   Pega esto en el editor de Apps Script del spreadsheet
   y vuelve a desplegar (Deploy → Manage deployments → New version).
═══════════════════════════════════════════════ */

const SECRET = 'pissleague89216420874';

// Columnas de la pestaña "Jugadores" (1-indexed)
// nombre | rating | pos | bandera | carta_url
const COL_JUG = {
  nombre:    1,
  rating:    2,
  pos:       3,
  bandera:   4,
  carta_url: 5,
};

function doGet(e) {
  return json({ ok: true, status: 'Shits League API running' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return json({ ok: false, error: 'Unauthorized' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (body.action === 'addJornada')    addJornada(ss, body);
    if (body.action === 'updateJugador') updateJugador(ss, body);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

// ── Añadir jornada ────────────────────────────────────────────────────────
// Pestaña Jornadas:
// numero | fecha | local | goles_local | visitante | goles_visitante |
// jugadores_local | capitan_local | jugadores_visitante | capitan_visitante |
// goleadores | asistentes | mensaje | video_url | amistoso | imagen_url | mvp
function addJornada(ss, body) {
  const isAmistoso = body.amistoso === true || body.amistoso === 'TRUE';

  const sh  = ss.getSheetByName('Jornadas');
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, 17).setValues([[
    body.numero, body.fecha, body.local, body.goles_local,
    body.visitante, body.goles_visitante,
    (body.jugadores_local || []).join(','), body.capitan_local || '',
    (body.jugadores_visitante || []).join(','), body.capitan_visitante || '',
    body.goleadores || '', body.asistentes || '',
    body.mensaje || '', body.video_url || '',
    isAmistoso ? 'TRUE' : 'FALSE',
    body.imagen_url || '',
    body.mvp || '',
  ]]);

  // Forzar texto plano en fecha y amistoso (evita que Sheets las convierta
  // a fecha/booleano nativos, lo que rompe la lectura posterior vía API).
  sh.getRange(row, 2).setNumberFormat('@').setValue(String(body.fecha));
  sh.getRange(row, 15).setNumberFormat('@').setValue(isAmistoso ? 'TRUE' : 'FALSE');
}

// ── Actualizar jugador (rating, pos, bandera, carta_url) ─────────────────────
function updateJugador(ss, body) {
  const sh   = ss.getSheetByName('Jugadores');
  const data = sh.getDataRange().getValues();
  const i = data.findIndex(function (r) { return r[0] === body.nombre; });
  if (i <= 0) return;
  const r = i + 1;
  if (body.rating    !== undefined) sh.getRange(r, COL_JUG.rating).setValue(body.rating);
  if (body.pos       !== undefined) sh.getRange(r, COL_JUG.pos).setValue(body.pos);
  if (body.bandera   !== undefined) sh.getRange(r, COL_JUG.bandera).setValue(body.bandera);
  if (body.carta_url !== undefined) sh.getRange(r, COL_JUG.carta_url).setValue(body.carta_url);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
