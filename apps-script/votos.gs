// Apps Script de las votaciones de la Shits League: se pega entero en el editor de Apps Script.
// La clave privada de OneSignal NO está aquí: va en las propiedades del script (ONESIGNAL_API_KEY).
const SECRET   = 'pissleague';
const ZONA     = 'Europe/Madrid';
// La hoja de cada temporada, de la más vieja a la más nueva (las mismas que js/temporadas.js)
const HOJAS = {
  '24-26': '1EHGrFt2Y3QDCOdSV3fVgWvspzXYcir4SmDxOezdSLRY',
  '26-27': '1UW3JRsjC8DHPsMwz9LjyRrqPo2SVTBUtiLkpL8LqCIg',
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
    if (body.action === 'estadoDispositivo') return json(estadoDispositivo(body));
    if (body.action === 'votarAgujero') return json(votarAgujero(body));
    if (body.action === 'agujeroEstado') return json(agujeroEstado(body));
    if (['listaDispositivos', 'notificacionPrueba', 'simulacroAvisos', 'agujeroRecuento', 'avisarAgujero'].includes(body.action)) {
      const admin = adminDe(body);
      if (!admin) return json({ ok: false, error: 'Solo para el admin' });
      if (body.action === 'listaDispositivos') return json(listaDispositivos());
      if (body.action === 'notificacionPrueba') return json(notificacionPrueba(admin));
      if (body.action === 'agujeroRecuento') return json({ ok: true, ...recuentoAgujero() });
      if (body.action === 'avisarAgujero') return json(avisarAgujero());
      return json(ejecutarAvisos(Date.now(), true));
    }
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

/* ── Dispositivos: quién tiene la app instalada y las notificaciones ─────────────────── */
const ONESIGNAL_APP_ID = 'c3052327-e9b2-4f3a-8a86-964ab853ec62';
const URL_APP = 'https://mestrangis.github.io/Shits-League-Web/';
const ICONO_APP = URL_APP + 'assets/icon-192.png';
const INSIGNIA_APP = URL_APP + 'assets/insignia-96.png';   // la de la barra de estado en Android
// El mismo que ajustes.js (calendario): este script no puede leer ese archivo
const CALENDARIO_ID = '38a5afd4c120a661ffbf3e4392af235b395891931485fb16ebca3e152524e5c0@group.calendar.google.com';
// Huella del código de cada admin. La web solo enseña los botones (ajustes.js → admins): quien manda es esto
const HUELLAS_ADMIN = { '52e617dd6d2f75cb3bd76ca2eced4c582d83b6198ceb13a2ba6f6239164e51d2': 'Marcos' };

// Lista de todos los jugadores registrados (nombre canónico = el del login, igual que en ajustes.js)
const TODOS_LOS_JUGADORES = [
  'Marcos','Alberto','Puebla','Carlos','David','Enzo','Fernando',
  'Gonzalo','Hugo','Nacho','Javier','Jorge','Luis','Mateo',
  'Nicolás','Pablo','Pelayo','Víctor'
];
const CABECERA_DISPOSITIVOS = ['usuario', 'dispositivo', 'plataforma', 'instalada', 'permiso', 'suscrito', 'fecha'];

const fechaHoraMadrid = d => Utilities.formatDate(d, ZONA, 'yyyy-MM-dd HH:mm:ss');

// La hoja de la temporada en curso; si no se puede saber, la más nueva que tenga hoja
function libroActual() {
  const curso = temporadaEnCurso();
  const id = curso && HOJAS[curso] ? curso : Object.keys(HOJAS).filter(k => HOJAS[k]).pop();
  return id ? SpreadsheetApp.openById(HOJAS[id]) : null;
}

function hojaDispositivos(libro) {
  const sh = libro.getSheetByName('Dispositivos') || libro.insertSheet('Dispositivos');
  const valores = sh.getDataRange().getDisplayValues();
  if (!valores.length || valores[0].every(c => String(c).trim() === '')) {
    sh.getRange(1, 7, sh.getMaxRows(), 1).setNumberFormat('@');   // la fecha, como texto
    sh.appendRow(CABECERA_DISPOSITIVOS);
  }
  return sh;
}

function estadoDispositivo(body) {
  const usuario = TODOS_LOS_JUGADORES.find(n => claveNombre(n) === claveNombre(body.nombre));
  if (!usuario) return { ok: false, error: 'Ese usuario no existe' };
  const dispositivo = String(body.dispositivo || '').slice(0, 64);
  if (!dispositivo) return { ok: false, error: 'Falta el dispositivo' };
  const libro = libroActual();
  if (!libro) return { ok: false, error: 'No hay hoja' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = hojaDispositivos(libro);
    const fila = [usuario, dispositivo, String(body.plataforma || '').slice(0, 16), body.instalada ? 'si' : 'no',
      String(body.permiso || '').slice(0, 16), body.suscrito ? 'si' : 'no', fechaHoraMadrid(new Date())];
    const i = sh.getDataRange().getDisplayValues().findIndex((f, k) => k > 0 && f[0] === usuario && f[1] === dispositivo);
    if (i < 0) sh.appendRow(fila);
    else sh.getRange(i + 1, 1, 1, fila.length).setValues([fila]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// La huella del código, como en el login; '' sin código
function huellaDe(body) {
  const texto = String(body.codigo || '').trim().toLowerCase();
  if (!texto) return '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}
// { nombre del admin } si el código es de un admin; null si no
const adminDe = body => HUELLAS_ADMIN[huellaDe(body)] || null;

// Cada usuario: instalada en algún móvil, las notificaciones de su mejor móvil y la última vez
function listaDispositivos() {
  const libro = libroActual();
  const sh = libro && libro.getSheetByName('Dispositivos');
  const filas = sh ? filasDe(sh) : [];
  const usuarios = TODOS_LOS_JUGADORES.map(nombre => {
    const suyas = filas.filter(f => f.usuario === nombre);
    const activas = suyas.some(f => f.permiso === 'granted' && f.suscrito === 'si');
    return {
      nombre,
      dispositivos: suyas.length,
      instalada: suyas.some(f => f.instalada === 'si'),
      notificaciones: !suyas.length ? 'sin datos' : activas ? 'activadas' : suyas.some(f => f.permiso === 'denied') ? 'bloqueadas' : 'desactivadas',
      ultima: suyas.map(f => f.fecha).sort().pop() || '',
    };
  });
  return { ok: true, usuarios };
}

/* ── Notificaciones ──────────────────────────────────────────────────────────────────── */
const SEGMENTOS_TODOS = ['Subscribed Users', 'Total Subscriptions'];   // según la cuenta, se llama de una forma u otra
const AVISOS_POR_PASADA = 12;   // tope de seguridad: el resto, en la siguiente pasada

function postOneSignal(payload) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ONESIGNAL_API_KEY');
  if (!apiKey) return { error: 'Falta la propiedad del script ONESIGNAL_API_KEY' };
  const r = UrlFetchApp.fetch('https://api.onesignal.com/notifications?c=push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Key ' + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  let datos = {};
  try { datos = JSON.parse(r.getContentText()); } catch (err) { /* sin cuerpo */ }
  if (r.getResponseCode() >= 300) return { error: `OneSignal ${r.getResponseCode()}: ${r.getContentText().slice(0, 200)}` };
  return datos;
}

// a: 'todos' o una lista de nombres del login. ok: enviado, o nadie a quien enviárselo con esos nombres
function enviarNotificacion(aviso) {
  const url = URL_APP + (aviso.url || '');
  const payload = {
    app_id: ONESIGNAL_APP_ID,
    target_channel: 'push',
    headings: { en: aviso.titulo || 'Shits League', es: aviso.titulo || 'Shits League' },
    contents: { en: aviso.cuerpo, es: aviso.cuerpo },
    web_url: url,
    chrome_web_icon: ICONO_APP,
    chrome_web_badge: INSIGNIA_APP,
    firefox_icon: ICONO_APP,
  };
  if (aviso.imagen) payload.chrome_web_image = aviso.imagen;
  if (aviso.a !== 'todos') {
    const r = postOneSignal({ ...payload, include_aliases: { external_id: aviso.a } });
    return r.error ? { ok: false, error: r.error } : { ok: true, id: r.id || '' };
  }
  let ultimo = '';
  for (const segmento of SEGMENTOS_TODOS) {
    const r = postOneSignal({ ...payload, included_segments: [segmento] });
    if (r.id) return { ok: true, id: r.id };
    ultimo = r.error || JSON.stringify(r.errors || r).slice(0, 200);
  }
  return { ok: false, error: ultimo };
}

function notificacionPrueba(admin) {
  const r = enviarNotificacion({ a: [admin], cuerpo: 'Notificación de prueba: te llegan bien.', url: '#inicio' });
  if (!r.ok) return { ok: false, error: r.error };
  return r.id ? { ok: true, mensaje: 'Enviada' } : { ok: false, error: 'OneSignal no conoce ningún móvil tuyo suscrito' };
}

/* ── La votación del agujero (temporada «???») ───────────────────────────────────────── */
// La cuenta sale del código, no de un nombre que venga en el mensaje: así es un voto por cuenta y
// nadie lee el de otro. Los votos, en las propiedades del script y no en una pestaña: las hojas se
// pueden leer con la clave pública, y hasta el cierre solo el admin debe verlos. Al cierre, con nombres.
const HUELLAS_JUGADORES = {
  '52e617dd6d2f75cb3bd76ca2eced4c582d83b6198ceb13a2ba6f6239164e51d2': 'Marcos',
  '6ad5b293d45a59fb605bb5555c2f1abb80463cacd7046dee9fbd161fa0c3eb9e': 'Alberto',
  'a662bf96c60de6f68c3772bf36a5d922b2ff6d039d776fe1abafc65a8327785b': 'Puebla',
  '0d0b9410216b3406881bddffcefd6babb1f96aa19719769e8ae63eed86e24444': 'Carlos',
  '23c069f629c80803552eb3e0f10a5481b1a41d09ddb7199d010accd1905c4bca': 'David',
  '26c0b5509c547b71161a295bbd759fcb6b2ec0fb776af9b2600943ceb163c82c': 'Enzo',
  '43745fe52a3546971a01544920739623969434c9f9beaca11e8100d5ffd37f4c': 'Fernando',
  '173cd8246dfac4269ee0e673f26756a03501ee2ccf7400bf7479f491c31b3111': 'Gonzalo',
  '2b72d3756802cffd53fad1e07da805e541294bf4d03f35bea19ed1d4ac10d3d6': 'Hugo',
  '38579e0cb7462626ac97dce05058c92b1533d77e0f28ae984d52917f4fb7b8e0': 'Nacho',
  'a3d6d6994972d54c31de9c8e9a75b7412fbabd884ff93bfa17da4025f75c9644': 'Javier',
  '45d09ae39c7cadf013dc1e6b8ec35cc61cae18c855110fbc04e724af62cdce8f': 'Jorge',
  '85eb7d8e2ed8c2bef9c0fdd1834d8432ca86abe82f03bd170ed557a3503d4089': 'Luis',
  '373286b822b86542cdb57ef5d2920e6988e6846f38bf733ac978ae4a730252f7': 'Mateo',
  'e76a092c92cc697a7f9b0783f6f00f8ec845f1d284f72d6f28da44ad02102013': 'Nicolás',
  '88180852b6a0cfcd3094d1794f63892b4d0918defac49b3f3f6e8ffb51d0dbd2': 'Pablo',
  '7b3762adf5389fc70848e60c00208af6768bd03877bc199549aec5254737d753': 'Pelayo',
  '327bef5f4505da8ef5b97fed057a33a6c4376efc9b07daee6086cbe69f202af7': 'Víctor',
};
const PREFIJO_VOTO_AGUJERO = 'agv:';
const AVISO_AGUJERO = 'agujero:votacion';
const TEXTO_AVISO_AGUJERO = 'Algo se mueve en el vacío…';

// { fase, pregunta } del ajuste de Supabase; null si no se ha podido saber
function ajusteAgujero() {
  try {
    const r = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/ajustes?clave=eq.agujero&select=valor`, {
      headers: { apikey: SUPABASE_KEY }, muteHttpExceptions: true,
    });
    if (r.getResponseCode() !== 200) return null;
    return JSON.parse(r.getContentText())[0]?.valor || null;
  } catch (err) {
    return null;
  }
}

// Los nombres de cada lado, en el orden de la lista. Solo lo ven el admin y, al cierre, todos
function recuentoAgujero() {
  const todas = PropertiesService.getScriptProperties().getProperties();
  const voto = n => todas[PREFIJO_VOTO_AGUJERO + n];
  return {
    si: TODOS_LOS_JUGADORES.filter(n => voto(n) === 'si'),
    no: TODOS_LOS_JUGADORES.filter(n => voto(n) === 'no'),
    faltan: TODOS_LOS_JUGADORES.filter(n => !voto(n)),
  };
}

function votarAgujero(body) {
  const jugador = HUELLAS_JUGADORES[huellaDe(body)];
  if (!jugador) return { ok: false, error: 'Inicia sesión para votar' };
  if (typeof body.voto !== 'boolean') return { ok: false, error: 'Voto inválido' };
  if (ajusteAgujero()?.fase !== 'votacion') return { ok: false, error: 'La votación no está abierta' };
  PropertiesService.getScriptProperties().setProperty(PREFIJO_VOTO_AGUJERO + jugador, body.voto ? 'si' : 'no');
  return { ok: true };
}

// Tu voto, y el recuento solo con la votación cerrada
function agujeroEstado(body) {
  const jugador = HUELLAS_JUGADORES[huellaDe(body)];
  const guardado = jugador ? PropertiesService.getScriptProperties().getProperty(PREFIJO_VOTO_AGUJERO + jugador) : null;
  const { si, no } = recuentoAgujero();
  return {
    ok: true,
    voto: guardado === null ? null : guardado === 'si',
    resultado: ajusteAgujero()?.fase === 'cerrada' ? { si, no } : null,
  };
}

// Al abrir la votación, desde el panel. Si no se puede, lo envía la siguiente pasada (calcularAvisos)
function avisarAgujero() {
  if (ajusteAgujero()?.fase !== 'votacion') return { ok: true, enviado: false };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(PREFIJO_AVISO + AVISO_AGUJERO)) return { ok: true, enviado: false };
    const r = enviarNotificacion({ a: 'todos', url: '#agujero', cuerpo: TEXTO_AVISO_AGUJERO });
    if (!r.ok) return { ok: false, error: r.error };
    props.setProperty(PREFIJO_AVISO + AVISO_AGUJERO, String(Date.now()));
    return { ok: true, enviado: true };
  } finally {
    lock.releaseLock();
  }
}

/* ── Qué toca avisar ─────────────────────────────────────────────────────────────────── */
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MIN = 60000, HORA = 60 * MIN, DIA = 24 * HORA;

const sinEmojis = s => String(s || '').replace(/[^\p{L}\p{N} .,:'’()\-–]/gu, '').replace(/\s+/g, ' ').trim();
// 'viernes 27 nov' a partir de AAAA-MM-DD
function fechaEnTexto(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  return `${DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MESES_CORTOS[m - 1]}`;
}
function relojMadrid(fecha) {
  const [dia, hora] = Utilities.formatDate(fecha, ZONA, "yyyy-MM-dd'T'HH:mm").split('T');
  return { dia, hora, h: Number(hora.slice(0, 2)) };
}
const sumaDias = (fecha, n) => {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const hayNoche = ahora => { const { h } = relojMadrid(ahora); return h >= 23 || h < 9; };
// «Sábado 14 nov · 18:00 · Polideportivo X»
function textoPartido(inicio, todoElDia, lugar) {
  const { dia, hora } = relojMadrid(inicio);
  const fecha = fechaEnTexto(dia);
  return [fecha.charAt(0).toUpperCase() + fecha.slice(1), todoElDia ? '' : hora, sinEmojis(lugar)].filter(Boolean).join(' · ');
}

// El nombre del login de quien sale en la hoja: por su ficha (nombre o alias) o directamente
function resolvedorDeLogin(jugadores) {
  const login = {};
  TODOS_LOS_JUGADORES.forEach(n => { login[claveNombre(n)] = n; });
  jugadores.forEach(p => {
    const todos = [p.nombre, ...String(p.alias || '').split(',')];
    const suyo = todos.map(a => login[claveNombre(a)]).find(Boolean);
    if (suyo) todos.forEach(a => { if (claveNombre(a)) login[claveNombre(a)] = suyo; });
  });
  return n => login[claveNombre(n)] || null;
}

const listaNombres = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

// Las reglas del MVP, las mismas que js/mvp.js
function reglasMVP(jugadores, oficiales, mvps) {
  const fichas = {};
  jugadores.forEach(p => { [p.nombre, ...String(p.alias || '').split(',')].forEach(a => { if (claveNombre(a)) fichas[claveNombre(a)] = p.nombre; }); });
  const ficha = n => fichas[claveNombre(n)] || null;
  const plantilla = j => {
    const vistos = new Map();
    nombresDe(j).map(ficha).filter(Boolean).forEach(n => { if (!vistos.has(claveNombre(n))) vistos.set(claveNombre(n), n); });
    return [...vistos.values()];
  };
  const votosDe = j => {
    const enPlantilla = new Set(plantilla(j).map(claveNombre));
    const vistos = new Set(), votos = [];
    mvps.forEach(f => {
      const fecha = normalizarFecha(f.fecha_partido) || (oficiales.find(o => o.numero === f.jornada) || {}).fecha;
      const votante = ficha(f.votante);
      if (fecha !== j.fecha || !votante || !enPlantilla.has(claveNombre(votante)) || vistos.has(claveNombre(votante))) return;
      vistos.add(claveNombre(votante));
      votos.push({ votante, puntos: [1, 2, 3].map(i => [ficha(f['voto_' + i]), Number(f['puntos_' + i]) || 0]).filter(x => x[0] && x[1]) });
    });
    return votos;
  };
  const abierta = j => !oficiales.some(o => o.fecha > j.fecha && conResultado(o)) && votosDe(j).length < plantilla(j).length;
  // El nombre del MVP si ya está decidido; '' si sigue abierta, sin votos o empatado
  const ganador = j => {
    if (j.mvp) return ficha(j.mvp) || j.mvp;
    if (abierta(j)) return '';
    const filas = new Map(plantilla(j).map(n => [claveNombre(n), { nombre: n, puntos: 0, votantes: 0, tres: 0 }]));
    votosDe(j).forEach(v => v.puntos.forEach(([n, p]) => {
      const f = filas.get(claveNombre(n));
      if (!f) return;
      f.puntos += p; f.votantes++; if (p === 3) f.tres++;
    }));
    const r = [...filas.values()].sort((a, b) => b.puntos - a.puntos || b.votantes - a.votantes || b.tres - a.tres);
    if (!r[0] || !r[0].puntos) return '';
    if (r[1] && r[1].puntos === r[0].puntos && r[1].votantes === r[0].votantes && r[1].tres === r[0].tres) return '';
    return r[0].nombre;
  };
  return { plantilla, votosDe, abierta, ganador };
}

// Los eventos futuros del calendario; null si no se ha podido leer. Con CalendarApp, porque la
// clave de la web solo vale desde la web. Si no lo tiene añadido, se suscribe a él una vez.
function leerCalendario(ahora) {
  try {
    const cal = CalendarApp.getCalendarById(CALENDARIO_ID) || CalendarApp.subscribeToCalendar(CALENDARIO_ID);
    if (!cal) return null;
    return cal.getEvents(ahora, new Date(ahora.getTime() + 90 * DIA)).map(e => ({
      id: e.isRecurringEvent && e.isRecurringEvent() ? `${e.getId()}@${e.getStartTime().getTime()}` : e.getId(), titulo: e.getTitle(), lugar: e.getLocation(), inicio: e.getStartTime(), todoElDia: e.isAllDayEvent(),
    }));
  } catch (err) {
    console.warn('Calendario: ' + err.message);
    return null;
  }
}

function leerDatosAvisos(ahora) {
  const temporada = temporadaEnCurso();
  if (!temporada || !HOJAS[temporada]) return null;   // si no se sabe, no se avisa de nada dudoso
  const libro = SpreadsheetApp.openById(HOJAS[temporada]);
  const filas = n => { const sh = libro.getSheetByName(n); return sh ? filasDe(sh) : []; };
  return {
    temporada,
    jugadores: filas('Jugadores'),
    jornadas: filas('Jornadas').map(x => ({ ...x, fecha: normalizarFecha(x.fecha) })).filter(x => x.fecha),
    votaciones: filas('Votaciones').map(x => ({ ...x, fecha: normalizarFecha(x.fecha) })).filter(x => x.fecha),
    mvps: filas('MVPs'),
    eventos: leerCalendario(ahora),
    agujero: ajusteAgujero(),
  };
}

// Todo lo que toca avisar según los datos. enviados: { clave: cuándo se envió, en ms }. Cada aviso:
// { clave, grupo, a, titulo, cuerpo, url, imagen, urgente, tambien, fijar, borrar }. tambien: claves que
// quedan cubiertas al enviarlo; fijar ({ clave: valor }) y borrar ([clave]): lo que se apunta al enviarlo,
// o ya, si estaba enviado (calfecha:<id> es la hora con la que se anunció cada partido, en ms)
const PLAZOS_RECORDATORIO = { semana: 7 * DIA, dia: DIA, hora: HORA };
function calcularAvisos(ahora, datos, enviados) {
  const avisos = [];
  const { jugadores, jornadas, votaciones, mvps, eventos, temporada } = datos;
  const { dia: hoy } = relojMadrid(ahora);
  const login = resolvedorDeLogin(jugadores);
  const logins = nombres => [...new Set(nombres.map(login).filter(Boolean))];
  const noVotaron = v => {
    const votaron = new Set(logins([...listaNombres(v.jugadores_si), ...listaNombres(v.jugadores_no)]));
    return TODOS_LOS_JUGADORES.filter(n => !votaron.has(n));
  };
  const nuevo = (clave, resto) => { if (!enviados[clave]) avisos.push({ clave, grupo: 'hoja', ...resto }); };

  /* El calendario */
  (eventos || []).forEach(ev => {
    const inicio = ev.inicio.getTime();
    const falta = inicio - ahora.getTime();
    if (falta <= 0) return;
    const { dia, hora } = relojMadrid(ev.inicio);
    const horaTexto = ev.todoElDia ? '' : hora;
    const detalles = [horaTexto, sinEmojis(ev.lugar)].filter(Boolean).join(', ');
    const votacion = votaciones.find(v => v.fecha === dia);
    const url = '#inicio';   // todo lo del calendario abre Inicio, haya votación o no

    const tipo = !ev.todoElDia && falta <= HORA ? 'hora' : falta > 12 * HORA && falta <= DIA ? 'dia' : falta > 6 * DIA && falta <= 7 * DIA ? 'semana' : null;
    const claveRec = t => `rec:${t}:${ev.id}:${inicio}`;
    const claveNuevo = `cal:${ev.id}`, claveFecha = `calfecha:${ev.id}`;
    // Con esta hora, los recordatorios cuyo momento ya ha pasado (a 3 días, el de la semana) no se
    // envían: quedan como enviados. Los que aún no han llegado, normales
    const pasados = Object.keys(PLAZOS_RECORDATORIO).filter(t => falta <= PLAZOS_RECORDATORIO[t]).map(claveRec);
    const fijar = { [claveFecha]: inicio };
    if (!enviados[claveNuevo]) {
      avisos.push({ clave: claveNuevo, grupo: 'cal', a: 'todos', url: '#inicio', tambien: pasados, fijar,
        titulo: 'Partido nuevo', cuerpo: textoPartido(ev.inicio, ev.todoElDia, ev.lugar) });
      return;
    }
    const anunciada = enviados[claveFecha];
    // Uno anunciado antes de apuntar su hora: se apunta, sin avisar
    if (!anunciada) { avisos.push({ clave: claveNuevo, grupo: 'cal', a: 'todos', fijar }); return; }
    if (anunciada !== inicio) {
      // Hasta que se avise del cambio, nada de recordatorios con la hora nueva
      avisos.push({ clave: `calcambio:${ev.id}:${inicio}`, grupo: 'cal', a: 'todos', url: '#inicio', tambien: pasados, fijar,
        titulo: 'Cambio de hora', cuerpo: textoPartido(ev.inicio, ev.todoElDia, ev.lugar) });
      return;
    }
    if (!tipo || enviados[claveRec(tipo)]) return;

    const cuando = tipo === 'hora' ? 'En una hora' : dia === hoy ? 'Hoy' : dia === sumaDias(hoy, 1) ? 'Mañana' : `El ${fechaEnTexto(dia)}`;
    const deCuando = dia === hoy ? 'de hoy' : dia === sumaDias(hoy, 1) ? 'de mañana' : `del ${fechaEnTexto(dia)}`;
    const hayPartido = `${cuando} hay partido${detalles ? `: ${detalles}` : ''}`;
    const urgente = tipo === 'hora';
    if (!votacion) {
      avisos.push({ clave: claveRec(tipo), grupo: 'cal', a: 'todos', url, urgente, cuerpo: hayPartido });
      return;
    }
    const si = logins(listaNombres(votacion.jugadores_si)), pendientes = noVotaron(votacion);
    if (si.length) avisos.push({ clave: `${claveRec(tipo)}:si`, grupo: 'cal', a: si, url, urgente, cuerpo: hayPartido, tambien: [claveRec(tipo)] });
    if (pendientes.length) avisos.push({ clave: `${claveRec(tipo)}:pend`, grupo: 'cal', a: pendientes, url, urgente, cuerpo: `¿Vienes al partido ${deCuando}?`, tambien: [claveRec(tipo)] });
  });

  // Anunciado, aún por jugar y ya no está en el calendario: cancelado. Sin calendario leído, nada
  if (eventos) {
    const siguen = new Set(eventos.map(ev => ev.id));
    Object.keys(enviados).filter(k => k.startsWith('calfecha:')).forEach(k => {
      const id = k.slice('calfecha:'.length), inicio = enviados[k];
      if (siguen.has(id) || inicio <= ahora.getTime()) return;
      const cuando = new Date(inicio);
      avisos.push({ clave: `calcancel:${id}:${inicio}`, grupo: 'cal', a: 'todos', url: '#inicio', borrar: [k],
        titulo: 'Partido cancelado', cuerpo: textoPartido(cuando, relojMadrid(cuando).hora === '00:00', '') });
    });
  }

  /* El agujero */
  if (datos.agujero?.fase === 'votacion') nuevo(AVISO_AGUJERO, { a: 'todos', url: '#agujero', cuerpo: TEXTO_AVISO_AGUJERO });

  /* Votaciones de asistencia */
  votaciones.filter(v => v.fecha >= hoy && v.id).forEach(v => {
    const clave = `${temporada}:vot:${v.id}`;
    const detalles = [fechaEnTexto(v.fecha), v.hora, sinEmojis(v.lugar)].filter(Boolean).join(', ');
    nuevo(clave, { a: 'todos', url: '#votacion', cuerpo: `Nueva votación de asistencia: ${detalles}` });
    if (enviados[clave] && ahora.getTime() - enviados[clave] >= DIA) {
      const pendientes = noVotaron(v);
      if (pendientes.length) nuevo(`${temporada}:votrec:${v.id}`, { a: pendientes, url: '#votacion', cuerpo: `Aún no has dicho si vienes al partido del ${fechaEnTexto(v.fecha)}` });
    }
  });

  /* Resultados y resúmenes */
  const oficiales = jornadas.filter(j => j.amistoso !== 'TRUE');
  const nombreJornada = j => (j.amistoso === 'TRUE' ? 'el amistoso' : `la Jornada ${j.numero}`);
  oficiales.filter(conResultado).forEach(j => {
    nuevo(`${temporada}:res:${j.fecha}`, { a: 'todos', url: `#partido=${j.fecha}`, imagen: j.imagen_url || '',
      cuerpo: `Jornada ${j.numero}: ${sinEmojis(j.local)} ${j.goles_local}–${j.goles_visitante} ${sinEmojis(j.visitante)}` });
  });
  jornadas.filter(j => j.video_url).forEach(j => {
    nuevo(`${temporada}:vid:${j.fecha}`, { a: 'todos', url: `#partido=${j.fecha}`, cuerpo: `Ya está el resumen de ${nombreJornada(j)}` });
  });

  /* MVP */
  const mvp = reglasMVP(jugadores, oficiales, mvps);
  oficiales.filter(conResultado).forEach(j => {
    const url = `#mvp=${j.fecha}`;
    if (mvp.abierta(j)) {
      const clave = `${temporada}:mvpab:${j.fecha}`;
      const jugaron = logins(mvp.plantilla(j));
      if (jugaron.length) nuevo(clave, { a: jugaron, url, cuerpo: `Ya puedes votar al MVP de la Jornada ${j.numero}` });
      if (enviados[clave] && ahora.getTime() - enviados[clave] >= DIA) {
        const votaron = new Set(mvp.votosDe(j).map(v => claveNombre(v.votante)));
        const faltan = logins(mvp.plantilla(j).filter(n => !votaron.has(claveNombre(n))));
        if (faltan.length) nuevo(`${temporada}:mvprec:${j.fecha}`, { a: faltan, url, cuerpo: `Aún no has votado al MVP de la Jornada ${j.numero}` });
      }
    }
    const ganador = mvp.ganador(j);
    if (ganador) nuevo(`${temporada}:mvpdec:${j.fecha}`, { a: 'todos', url, cuerpo: `MVP de la Jornada ${j.numero}: ${sinEmojis(ganador)}` });
  });
  return avisos;
}

/* ── La pasada del activador ─────────────────────────────────────────────────────────── */
const PREFIJO_AVISO = 'av:';

function leerEnviados(props) {
  const todas = props.getProperties(), enviados = {};
  Object.keys(todas).forEach(k => { if (k.startsWith(PREFIJO_AVISO)) enviados[k.slice(PREFIJO_AVISO.length)] = Number(todas[k]) || 1; });
  return enviados;
}

// La primera vez con una temporada (o con el calendario) no se avisa de lo que ya había: se apunta
// Lo que apunta un aviso al enviarse (o ya enviado): su hora, sus partidos cancelados
function apuntarEstado(aviso, props, enviados) {
  Object.keys(aviso.fijar || {}).forEach(c => { props.setProperty(PREFIJO_AVISO + c, String(aviso.fijar[c])); enviados[c] = aviso.fijar[c]; });
  (aviso.borrar || []).forEach(c => { props.deleteProperty(PREFIJO_AVISO + c); delete enviados[c]; });
}

function apuntarLoQueYaHabia(avisos, props, enviados, datos, ahora) {
  const marcar = clave => { props.setProperty(PREFIJO_AVISO + clave, String(ahora)); enviados[clave] = ahora; };
  const inicial = { hoja: `iniciado:${datos.temporada}`, cal: 'iniciado:calendario' };
  const apuntados = [];
  Object.keys(inicial).forEach(grupo => {
    if (enviados[inicial[grupo]] || (grupo === 'cal' && !datos.eventos)) return;
    avisos.filter(a => a.grupo === grupo).forEach(a => {
      marcar(a.clave);
      (a.tambien || []).forEach(marcar);
      apuntarEstado(a, props, enviados);
      apuntados.push(a.clave);
    });
    marcar(inicial[grupo]);
  });
  return apuntados;
}

// simulacro: devuelve lo que se enviaría ahora, sin enviar ni apuntar nada
function ejecutarAvisos(ms, simulacro = false) {
  const ahora = new Date(ms);
  const datos = leerDatosAvisos(ahora);
  if (!datos) return { ok: false, error: 'No se sabe qué temporada está en curso' };
  const props = PropertiesService.getScriptProperties();
  const enviados = leerEnviados(props);
  const avisos = calcularAvisos(ahora, datos, enviados);
  const noche = hayNoche(ahora);

  if (simulacro) {
    const inicial = !enviados[`iniciado:${datos.temporada}`];
    return {
      ok: true, noche, temporada: datos.temporada, calendario: datos.eventos ? 'leído' : 'sin acceso',
      primeraVez: inicial,
      avisos: inicial ? [] : avisos.filter(a => !enviados[a.clave] && (a.grupo !== 'cal' || enviados['iniciado:calendario'])).map(a => ({
        titulo: a.titulo || '', cuerpo: a.cuerpo, a: a.a, url: a.url, imagen: a.imagen || '', espera: noche && !a.urgente,
      })),
    };
  }

  const apuntados = apuntarLoQueYaHabia(avisos, props, enviados, datos, ms);
  avisos.filter(a => enviados[a.clave]).forEach(a => apuntarEstado(a, props, enviados));
  const pendientes = avisos.filter(a => !enviados[a.clave] && (a.urgente || !noche)).slice(0, AVISOS_POR_PASADA);
  const resultado = [];
  pendientes.forEach(a => {
    const r = enviarNotificacion(a);
    if (r.ok) {
      [a.clave, ...(a.tambien || [])].forEach(c => props.setProperty(PREFIJO_AVISO + c, String(ms)));
      apuntarEstado(a, props, enviados);
    } else console.warn(`No se ha podido enviar «${a.cuerpo}»: ${r.error}`);
    resultado.push({ cuerpo: a.cuerpo, ok: r.ok });
  });
  return { ok: true, enviados: resultado, apuntados: apuntados.length };
}

// Lo que llama el activador
function comprobarAvisos() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;   // otra pasada en marcha
  try {
    console.log(JSON.stringify(ejecutarAvisos(Date.now())));
  } finally {
    lock.releaseLock();
  }
}

// Por si queda el activador de antes: ahora el recordatorio va dentro de comprobarAvisos
function recordatorioVotacion() {
  comprobarAvisos();
}

// Ejecútala UNA vez a mano desde el editor: pide los permisos y deja un solo activador, cada 15 minutos
function instalarActivador() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['comprobarAvisos', 'recordatorioVotacion'].includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('comprobarAvisos').timeBased().everyMinutes(15).create();
  console.log('Activador creado. Calendario: ' + (leerCalendario(new Date()) ? 'leído' : 'SIN ACCESO'));
}
