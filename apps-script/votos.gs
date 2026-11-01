// Apps Script de las votaciones de la Shits League: se pega entero en el editor de Apps Script.
// La clave privada de OneSignal NO está aquí: va en las propiedades del script (ONESIGNAL_API_KEY).
const SECRET   = 'pissleague';
const SHEET_ID = '1EHGrFt2Y3QDCOdSV3fVgWvspzXYcir4SmDxOezdSLRY';
const ZONA     = 'Europe/Madrid';
const MVP_DIAS = 3;   // la votación del MVP dura hasta 3 días después de la fecha del partido
const CABECERA_MVPS = ['jornada', 'votante', 'voto_1', 'puntos_1', 'voto_2', 'puntos_2', 'voto_3', 'puntos_3', 'fecha_voto'];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return json({ ok: false, error: 'Unauthorized' });
    if (body.action === 'votar') return json(votar(body));
    if (body.action === 'votarMVP') return json(votarMVP(body));
    return json({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    return json({ ok: false, error: 'No se ha podido guardar. Inténtalo otra vez.' });
  }
}

function votar(body) {
  if (body.voto !== 'si' && body.voto !== 'no') return { ok: false, error: 'Voto inválido' };
  if (!body.nombre) return { ok: false, error: 'Falta el nombre' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh   = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Votaciones');
    const data = sh.getDataRange().getValues();
    const head = data[0].map(h => String(h).trim());
    const cId = head.indexOf('id'), cSi = head.indexOf('jugadores_si'), cNo = head.indexOf('jugadores_no');
    if (cId < 0 || cSi < 0 || cNo < 0) return { ok: false, error: 'Faltan columnas en Votaciones' };

    const i = data.findIndex((r, k) => k > 0 && String(r[cId]).trim() === String(body.id).trim());
    if (i < 0) return { ok: false, error: 'Votación no encontrada' };

    const norm   = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const quitar = str => String(str || '').split(',').map(s => s.trim())
                            .filter(s => s && norm(s) !== norm(body.nombre));
    const si = quitar(data[i][cSi]);
    const no = quitar(data[i][cNo]);
    (body.voto === 'si' ? si : no).push(body.nombre);

    sh.getRange(i + 1, cSi + 1).setValue(si.join(', '));
    sh.getRange(i + 1, cNo + 1).setValue(no.join(', '));
    return { ok: true, mensaje: 'Voto guardado' };
  } finally {
    lock.releaseLock();
  }
}

/* ── MVP ─────────────────────────────────────────────────────────────────── */
// Sin tildes, mayúsculas ni emojis: «De la Mano 🏆» y «De la Mano» son el mismo jugador
function claveNombre(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
}

// Filas de una hoja como objetos, con los valores tal como se ven (los mismos que lee la web)
function filasDe(sh) {
  const [cabecera, ...filas] = sh.getDataRange().getDisplayValues();
  const head = (cabecera || []).map(h => String(h).trim());
  return filas.map(f => Object.fromEntries(head.map((h, i) => [h, String(f[i] ?? '').trim()])));
}

const conResultado = j => j.goles_local !== '' && j.goles_visitante !== '';
const nombresDe = j => (j.jugadores_local + ',' + j.jugadores_visitante).split(',').map(s => s.trim()).filter(Boolean);

function sumarDias(iso, dias) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

function votarMVP(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const libro = SpreadsheetApp.openById(SHEET_ID);

    // Nombre canónico de cualquier nombre o alias de la hoja Jugadores
    const alias = {};
    filasDe(libro.getSheetByName('Jugadores')).forEach(p => {
      [p.nombre, ...String(p.alias || '').split(',')].forEach(a => { if (claveNombre(a)) alias[claveNombre(a)] = p.nombre; });
    });
    const canonico = n => alias[claveNombre(n)] || String(n || '').trim();

    const jornadas = filasDe(libro.getSheetByName('Jornadas'));
    const numero = String(body.jornada ?? '').trim();
    const j = jornadas.find(x => x.numero !== '' && x.numero === numero);
    if (!j) return { ok: false, error: 'Esa jornada no existe' };
    if (j.amistoso === 'TRUE') return { ok: false, error: 'Los amistosos no tienen MVP' };

    // Abierta: con resultado, hasta 3 días después del partido y sin otra oficial posterior con resultado
    if (!conResultado(j)) return { ok: false, error: 'Ese partido aún no tiene resultado' };
    const hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
    const posterior = jornadas.some(x => x.amistoso !== 'TRUE' && Number(x.numero) > Number(numero) && conResultado(x));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j.fecha) || hoy > sumarDias(j.fecha, MVP_DIAS) || posterior) {
      return { ok: false, error: 'La votación de esa jornada ya está cerrada' };
    }

    const jugaron = new Set(nombresDe(j).map(n => claveNombre(canonico(n))));
    const votante = canonico(body.votante);
    const claveVotante = claveNombre(votante);
    if (!claveVotante || !jugaron.has(claveVotante)) return { ok: false, error: 'Solo votan los que jugaron ese partido' };

    const votos = Array.isArray(body.votos) ? body.votos : [];
    if (!votos.length || votos.length > 3) return { ok: false, error: 'Hay que votar a entre uno y tres jugadores' };
    const claves = votos.map(v => claveNombre(canonico(v.nombre)));
    if (new Set(claves).size !== claves.length) return { ok: false, error: 'No se puede votar dos veces al mismo jugador' };
    if (claves.includes(claveVotante)) return { ok: false, error: 'No puedes votarte a ti mismo' };
    if (claves.some(c => !c || !jugaron.has(c))) return { ok: false, error: 'Solo se puede votar a los que jugaron ese partido' };
    if (votos.some(v => ![1, 2, 3].includes(v.puntos))) return { ok: false, error: 'Cada votado lleva 1, 2 o 3 puntos' };
    if (votos.reduce((s, v) => s + v.puntos, 0) !== 3) return { ok: false, error: 'Los puntos tienen que sumar exactamente 3' };

    let sh = libro.getSheetByName('MVPs');
    if (!sh) {
      sh = libro.insertSheet('MVPs');
      sh.appendRow(CABECERA_MVPS);
    }
    const repetido = filasDe(sh).some(f => f.jornada === numero && claveNombre(canonico(f.votante)) === claveVotante);
    if (repetido) return { ok: false, error: 'Ya has votado en esta jornada' };

    const ordenados = votos.map(v => [canonico(v.nombre), v.puntos]).sort((a, b) => b[1] - a[1]);
    const celdas = [0, 1, 2].flatMap(i => ordenados[i] || ['', '']);
    sh.appendRow([Number(numero), votante, ...celdas, Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm:ss')]);
    return { ok: true, mensaje: 'Voto guardado' };
  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

const ONESIGNAL_APP_ID = 'c3052327-e9b2-4f3a-8a86-964ab853ec62';

// Lista de todos los jugadores registrados (nombre canónico = el del login)
const TODOS_LOS_JUGADORES = [
  'Marcos','Alberto','Puebla','Carlos','David','Enzo','Fernando',
  'Gonzalo','Hugo','Nacho','Javier','Jorge','Luis','Mateo',
  'Nicolás','Pablo','Pelayo','Víctor'
];

function recordatorioVotacion() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ONESIGNAL_API_KEY');
  if (!apiKey) throw new Error('Falta la propiedad del script ONESIGNAL_API_KEY');

  const sh   = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Votaciones');
  const data = sh.getDataRange().getValues();
  const head = data[0].map(h => String(h).trim());
  const cFecha = head.indexOf('fecha');
  const cSi    = head.indexOf('jugadores_si');
  const cNo    = head.indexOf('jugadores_no');

  const hoy     = new Date();
  const pendientes = new Set();

  for (let i = 1; i < data.length; i++) {
    const fecha = new Date(data[i][cFecha]);
    if (isNaN(fecha) || fecha < hoy) continue; // ignorar fechas pasadas

    const norm    = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
    const votados = [
      ...String(data[i][cSi]||'').split(','),
      ...String(data[i][cNo]||'').split(',')
    ].map(norm).filter(Boolean);

    TODOS_LOS_JUGADORES.forEach(j => {
      if (!votados.includes(norm(j))) pendientes.add(j);
    });
  }

  if (pendientes.size === 0) return; // todos han votado, no molestar

  // Mandar notificación a los que no han votado
  const payload = {
    app_id: ONESIGNAL_APP_ID,
    filters: [...pendientes].map((nombre, i) => {
      const f = [{ field: 'tag', key: 'player_name', relation: '=', value: nombre }];
      if (i > 0) f.unshift({ operator: 'OR' });
      return f;
    }).flat(),
    headings: { en: '⚽ Shits League', es: '⚽ Shits League' },
    contents: { en: '¡Aún no has votado las fechas del próximo partido!', es: '¡Aún no has votado las fechas del próximo partido!' },
    url: 'https://mestrangis.github.io/Shits-League-Web/#votacion',
  };

  UrlFetchApp.fetch('https://api.onesignal.com/notifications', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(payload),
  });
}
