/* ═══════════════════════════════════════════════
   SHITS LEAGUE — Apps Script (Code.gs)
   Pega esto en el editor de Apps Script del spreadsheet
   y vuelve a desplegar (Deploy → Manage deployments → New version).
═══════════════════════════════════════════════ */

const SECRET = 'pissleague';

// Columnas de la pestaña "Jugadores" (1-indexed)
// nombre | rating | pos | bandera | pj | victorias | empates | derrotas | mvp | pts | carta_url
const COL_JUG = {
  nombre:    1,
  rating:    2,
  pos:       3,
  bandera:   4,
  pj:        5,
  victorias: 6,
  empates:   7,
  derrotas:  8,
  mvp:       9,
  pts:       10,
  carta_url: 11,
};

function doGet(e) {
  return json({ ok: true, status: 'Shits League API running' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return json({ ok: false, error: 'Unauthorized' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (body.action === 'addJornada')      addJornada(ss, body);
    if (body.action === 'addGoles')        addGoles(ss, body);
    if (body.action === 'addAsistencias')  addAsistencias(ss, body);
    if (body.action === 'updateJugador')   updateJugador(ss, body);
    if (body.action === 'addMvp')          addMvp(ss, body);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

// ── Añadir jornada + aplicar sistema de puntuación ───────────────────────────
function addJornada(ss, body) {
  const jugadoresLocal     = body.jugadores_local     || [];
  const jugadoresVisitante = body.jugadores_visitante || [];
  const capitanLocal       = body.capitan_local       || '';
  const capitanVisitante   = body.capitan_visitante   || '';

  // Pestaña Jornadas:
  // numero | fecha | local | goles_local | visitante | goles_visitante |
  // jugadores_local | capitan_local | jugadores_visitante | capitan_visitante |
  // mensaje | video_url | amistoso | imagen_url
  ss.getSheetByName('Jornadas').appendRow([
    body.numero, body.fecha, body.local, body.goles_local,
    body.visitante, body.goles_visitante,
    jugadoresLocal.join(','), capitanLocal,
    jugadoresVisitante.join(','), capitanVisitante,
    body.mensaje || '', body.video_url || '',
    body.amistoso ? 'TRUE' : 'FALSE',
    body.imagen_url || '',
  ]);

  if (body.amistoso) {
    // Amistoso: solo cuenta para partidos jugados, no afecta a la clasificación
    incrementPj(ss, jugadoresLocal.concat(jugadoresVisitante));
    return;
  }

  const gl = Number(body.goles_local), gv = Number(body.goles_visitante);
  let resultLocal, resultVisitante;
  if (gl > gv)      { resultLocal = 'win';  resultVisitante = 'loss'; }
  else if (gl < gv) { resultLocal = 'loss'; resultVisitante = 'win';  }
  else              { resultLocal = 'draw'; resultVisitante = 'draw'; }

  applyResultado(ss, jugadoresLocal,     capitanLocal,     resultLocal);
  applyResultado(ss, jugadoresVisitante, capitanVisitante, resultVisitante);
}

// ── Aplica victorias/empates/derrotas + puntos (con bonus capitán) ───────────
// Victoria → 3 pts jugador normal, 7 pts capitán
// Empate   → 1 pt  jugador normal, 4 pts capitán
// Derrota  → 0 pts jugador normal, 2 pts capitán
function applyResultado(ss, jugadores, capitan, resultado) {
  const sh   = ss.getSheetByName('Jugadores');
  const data = sh.getDataRange().getValues();

  jugadores.forEach(function (nombre) {
    const i = data.findIndex(function (r) { return r[0] === nombre; });
    if (i <= 0) return; // -1 = no encontrado, 0 = cabecera
    const r = i + 1;
    const isCapitan = nombre === capitan;
    let ptsGanados = 0;

    if (resultado === 'win') {
      ptsGanados = isCapitan ? 7 : 3;
      sh.getRange(r, COL_JUG.victorias).setValue(Number(data[i][COL_JUG.victorias - 1]) + 1);
    } else if (resultado === 'draw') {
      ptsGanados = isCapitan ? 4 : 1;
      sh.getRange(r, COL_JUG.empates).setValue(Number(data[i][COL_JUG.empates - 1]) + 1);
    } else {
      ptsGanados = isCapitan ? 2 : 0;
      sh.getRange(r, COL_JUG.derrotas).setValue(Number(data[i][COL_JUG.derrotas - 1]) + 1);
    }

    sh.getRange(r, COL_JUG.pts).setValue(Number(data[i][COL_JUG.pts - 1]) + ptsGanados);
    sh.getRange(r, COL_JUG.pj).setValue(Number(data[i][COL_JUG.pj - 1]) + 1);
  });
}

// ── Suma 1 a "pj" de cada jugador (usado en amistosos) ────────────────────────
function incrementPj(ss, jugadores) {
  const sh   = ss.getSheetByName('Jugadores');
  const data = sh.getDataRange().getValues();
  jugadores.forEach(function (nombre) {
    const i = data.findIndex(function (r) { return r[0] === nombre; });
    if (i > 0) sh.getRange(i + 1, COL_JUG.pj).setValue(Number(data[i][COL_JUG.pj - 1]) + 1);
  });
}

// ── Sumar goles ────────────────────────────────────────────────────────────────
// body.goles = [{ nombre, cantidad }, ...]
function addGoles(ss, body) {
  const sh   = ss.getSheetByName('Goles');
  const data = sh.getDataRange().getValues();
  (body.goles || []).forEach(function (item) {
    const i = data.findIndex(function (r) { return r[0] === item.nombre; });
    if (i > 0) sh.getRange(i + 1, 2).setValue(Number(data[i][1]) + Number(item.cantidad));
  });
}

// ── Sumar asistencias ────────────────────────────────────────────────────────
// body.asistencias = [{ nombre, cantidad }, ...]
function addAsistencias(ss, body) {
  const sh   = ss.getSheetByName('Asistencias');
  const data = sh.getDataRange().getValues();
  (body.asistencias || []).forEach(function (item) {
    const i = data.findIndex(function (r) { return r[0] === item.nombre; });
    if (i > 0) sh.getRange(i + 1, 2).setValue(Number(data[i][1]) + Number(item.cantidad));
  });
}

// ── Actualizar jugador (rating, pos, bandera, pj, mvp, carta_url) ─────────────
function updateJugador(ss, body) {
  const sh   = ss.getSheetByName('Jugadores');
  const data = sh.getDataRange().getValues();
  const i = data.findIndex(function (r) { return r[0] === body.nombre; });
  if (i <= 0) return;
  const r = i + 1;
  if (body.rating    !== undefined) sh.getRange(r, COL_JUG.rating).setValue(body.rating);
  if (body.pos       !== undefined) sh.getRange(r, COL_JUG.pos).setValue(body.pos);
  if (body.bandera   !== undefined) sh.getRange(r, COL_JUG.bandera).setValue(body.bandera);
  if (body.pj        !== undefined) sh.getRange(r, COL_JUG.pj).setValue(body.pj);
  if (body.mvp       !== undefined) sh.getRange(r, COL_JUG.mvp).setValue(body.mvp);
  if (body.carta_url !== undefined) sh.getRange(r, COL_JUG.carta_url).setValue(body.carta_url);
}

// ── Sumar 1 MVP a un jugador ───────────────────────────────────────────────────
function addMvp(ss, body) {
  const sh   = ss.getSheetByName('Jugadores');
  const data = sh.getDataRange().getValues();
  const i = data.findIndex(function (r) { return r[0] === body.nombre; });
  if (i > 0) sh.getRange(i + 1, COL_JUG.mvp).setValue(Number(data[i][COL_JUG.mvp - 1]) + 1);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
