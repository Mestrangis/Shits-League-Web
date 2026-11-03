// Apps Script de las votaciones de la Shits League: se pega entero en el editor de Apps Script.
// La clave privada de OneSignal NO está aquí: va en las propiedades del script (ONESIGNAL_API_KEY).
const SECRET   = 'pissleague';
const ZONA     = 'Europe/Madrid';
// La hoja de cada temporada, de la más vieja a la más nueva (las mismas que js/temporadas.js)
const HOJAS = {
  '24-26': '1EHGrFt2Y3QDCOdSV3fVgWvspzXYcir4SmDxOezdSLRY',
  '26-27': '',
};
// De dónde sale la temporada en curso: la lectura pública de Supabase, sin nada secreto
const SUPABASE_URL = 'https://vtqhefwspnqsjskqkxqg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VOrswpNPw1A9U4QoKEWdGQ_Rwr0DR4H';
const CABECERA_MVPS = ['fecha_partido', 'jornada', 'votante', 'voto_1', 'puntos_1', 'voto_2', 'puntos_2', 'voto_3', 'puntos_3', 'fecha_voto'];

// La temporada en curso; null si no se ha podido saber
function temporadaEnCurso() {
  try {
    const r = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/ajustes?clave=eq.temporada_en_curso&select=valor`, {
      headers: { apikey: SUPABASE_KEY }, muteHttpExceptions: true,
    });
    if (r.getResponseCode() !== 200) return null;
    const id = JSON.parse(r.getContentText())[0]?.valor;
    return HOJAS[id] !== undefined ? id : null;
  } catch (err) {
    return null;
  }
}

// El libro en el que se vota; { error } si esa temporada no admite votos. Sin temporada en el
// mensaje es una app de antes de las temporadas: la 24/26. Una de archivo ya no se vota.
function libroDeVotos(body) {
  const id = body.temporada || '24-26';
  if (HOJAS[id] === undefined) return { error: 'Esa temporada no existe' };
  if (!HOJAS[id]) return { error: 'Esa temporada aún no tiene hoja' };
  const orden = Object.keys(HOJAS);
  const curso = temporadaEnCurso();
  if (curso && orden.indexOf(id) < orden.indexOf(curso)) return { error: 'Esa temporada ya ha terminado: no se puede votar' };
  return { libro: SpreadsheetApp.openById(HOJAS[id]) };
}

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
  const { libro, error } = libroDeVotos(body);
  if (error) return { ok: false, error };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh   = libro.getSheetByName('Votaciones');
    if (!sh) return { ok: false, error: 'Esa temporada aún no tiene votaciones' };
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
// Cada votación es la de la FECHA de un partido oficial: los números de jornada se repiten
// entre temporadas. No hay relojes: solo se comparan fechas como texto AAAA-MM-DD.

// Sin tildes, mayúsculas ni emojis: «De la Mano 🏆» y «De la Mano» son el mismo jugador
function claveNombre(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
}

// AAAA-MM-DD a partir de AAAA-M-D o D/M/AAAA, con hora detrás o sin ella; '' si no es una fecha
function normalizarFecha(valor) {
  const s = String(valor || '').trim();
  const dos = n => String(n).padStart(2, '0');
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${dos(m[2])}-${dos(m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${dos(m[2])}-${dos(m[1])}` : '';
}

// Filas de una hoja como objetos, con los valores tal como se ven (los mismos que lee la web)
function filasDe(sh) {
  const [cabecera, ...filas] = sh.getDataRange().getDisplayValues();
  const head = (cabecera || []).map(h => String(h).trim());
  return filas.map(f => Object.fromEntries(head.map((h, i) => [h, String(f[i] ?? '').trim()])));
}

const conResultado = j => j.goles_local !== '' && j.goles_visitante !== '';
const nombresDe = j => (j.jugadores_local + ',' + j.jugadores_visitante).split(',').map(s => s.trim()).filter(Boolean);

// La hoja MVPs lista para escribir: la crea si no está y le pone la cabecera si está vacía. La de
// antes (sin fecha_partido) gana esa columna, rellena por el número de jornada de cada fila.
// La fecha va como texto: si no, Sheets la convierte y la enseña según el idioma de la hoja.
function hojaMVPs(libro, oficiales) {
  const sh = libro.getSheetByName('MVPs') || libro.insertSheet('MVPs');
  const valores = sh.getDataRange().getDisplayValues();
  const vacia = !valores.length || valores[0].every(c => String(c).trim() === '');
  if (vacia) {
    sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@');
    sh.appendRow(CABECERA_MVPS);
  } else if (String(valores[0][0]).trim() !== 'fecha_partido') {
    sh.insertColumnBefore(1);
    sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@');
    sh.getRange(1, 1).setValue('fecha_partido');
    valores.slice(1).forEach((f, i) => {
      const j = oficiales.find(x => x.numero === String(f[0]).trim());
      sh.getRange(i + 2, 1).setValue(j ? j.fecha : '');
    });
  }
  return sh;
}

function votarMVP(body) {
  const { libro, error } = libroDeVotos(body);
  if (error) return { ok: false, error };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // Los que tienen ficha en Jugadores, por nombre o alias → su nombre canónico
    const fichas = {};
    filasDe(libro.getSheetByName('Jugadores')).forEach(p => {
      [p.nombre, ...String(p.alias || '').split(',')].forEach(a => { if (claveNombre(a)) fichas[claveNombre(a)] = p.nombre; });
    });
    const ficha = n => fichas[claveNombre(n)] || null;

    const jornadas = filasDe(libro.getSheetByName('Jornadas')).map(x => ({ ...x, fecha: normalizarFecha(x.fecha) }));
    const oficiales = jornadas.filter(x => x.amistoso !== 'TRUE' && x.fecha);
    const fecha = normalizarFecha(body.fecha);
    const j = fecha && oficiales.find(x => x.fecha === fecha);
    if (!j) {
      const amistoso = fecha && jornadas.some(x => x.amistoso === 'TRUE' && x.fecha === fecha);
      return { ok: false, error: amistoso ? 'Los amistosos no tienen MVP' : 'Ese partido no existe' };
    }

    // Abierta: el último partido oficial jugado. Si todos han votado, el votante ya es uno de ellos
    if (!conResultado(j)) return { ok: false, error: 'Ese partido aún no tiene resultado' };
    if (oficiales.some(x => x.fecha > fecha && conResultado(x))) return { ok: false, error: 'La votación de ese partido ya está cerrada' };

    // Solo los jugadores del partido con ficha
    const jugaron = new Set(nombresDe(j).map(ficha).filter(Boolean).map(claveNombre));
    const votante = ficha(body.votante);
    if (!votante || !jugaron.has(claveNombre(votante))) return { ok: false, error: 'Solo votan los jugadores con ficha que jugaron ese partido' };

    const votos = Array.isArray(body.votos) ? body.votos : [];
    if (!votos.length || votos.length > 3) return { ok: false, error: 'Hay que votar a entre uno y tres jugadores' };
    const votados = votos.map(v => ficha(v.nombre));
    const claves = votados.map(claveNombre);
    if (new Set(claves).size !== claves.length) return { ok: false, error: 'No se puede votar dos veces al mismo jugador' };
    if (claves.includes(claveNombre(votante))) return { ok: false, error: 'No puedes votarte a ti mismo' };
    if (votados.some(n => !n || !jugaron.has(claveNombre(n)))) return { ok: false, error: 'Solo se puede votar a jugadores con ficha que jugaron ese partido' };
    if (votos.some(v => ![1, 2, 3].includes(v.puntos))) return { ok: false, error: 'Cada votado lleva 1, 2 o 3 puntos' };
    if (votos.reduce((s, v) => s + v.puntos, 0) !== 3) return { ok: false, error: 'Los puntos tienen que sumar exactamente 3' };

    const sh = hojaMVPs(libro, oficiales);
    const repetido = filasDe(sh).some(f => normalizarFecha(f.fecha_partido) === fecha && claveNombre(ficha(f.votante) || f.votante) === claveNombre(votante));
    if (repetido) return { ok: false, error: 'Ya has votado en este partido' };

    const ordenados = votos.map((v, i) => [votados[i], v.puntos]).sort((a, b) => b[1] - a[1]);
    const celdas = [0, 1, 2].flatMap(i => ordenados[i] || ['', '']);
    sh.appendRow([fecha, j.numero, votante, ...celdas, Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm:ss')]);
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

  // Las fechas de la temporada en curso; si no se puede saber, no se avisa de nada dudoso
  const curso = temporadaEnCurso();
  if (!curso || !HOJAS[curso]) return;
  const sh   = SpreadsheetApp.openById(HOJAS[curso]).getSheetByName('Votaciones');
  if (!sh) return;
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
