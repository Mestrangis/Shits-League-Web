/* ═══════════════════════════════════════════════
   SHITS LEAGUE — rush-panel.js
   Pestaña "Rush": portada ligera de Shits League Rush y el puente con la
   sesión de Shits League (session.js). Aquí no hay nada del juego: el modo
   Rush (js/slr/rush.js + css/slr.css) se carga al pulsar JUGAR.
   Rush está en beta: la pestaña solo aparece con sesión y acceso. El acceso lo
   dice el servidor (slr_login → tiene_acceso) al iniciar sesión y se guarda en
   localStorage; al arrancar se usa lo guardado.
   · NADA de Rush (código, Supabase, fotos) se pide antes de pulsar JUGAR: la
     Shits League normal carga sola, sin competir. El estado de la portada es el
     que guardó Rush la última vez (localStorage).
   · Al pulsar JUGAR se comprueba version.json (js/version.js): si Rush no es de
     esa versión, «Descargando Shits League Rush…» con el porcentaje (solo de lo
     que ha cambiado); si ya está, entra directo. Si la Shits League también era
     vieja, se recarga y se entra sola (rushTrasRecarga).
═══════════════════════════════════════════════ */

const RUSH_TOKEN_KEY = 'SLR_TOKEN';
const RUSH_ACCESO_KEY = 'RUSH_ACCESO';   // { jugador, acceso }: último valor conocido
// Solo en local se aceptan los códigos de los bots de prueba (validados en el servidor)
const RUSH_ES_LOCAL  = ['localhost', '127.0.0.1'].includes(location.hostname);

const rushRuta = ruta => new URL(ruta, document.baseURI).href;
let rushConfigPromesa = null;
const rushConfig = () => (rushConfigPromesa ??= import(rushRuta('js/slr/config.js')));

/* ── Token de Rush ───────────────────────────────────────────────────────── */
function rushToken() {
  try { return localStorage.getItem(RUSH_TOKEN_KEY) || null; } catch { return null; }
}
function rushGuardarToken(token) {
  try {
    if (token) localStorage.setItem(RUSH_TOKEN_KEY, token);
    else       localStorage.removeItem(RUSH_TOKEN_KEY);
  } catch { /* sin persistencia */ }
}

async function rushRpc(funcion, args) {
  const { SUPABASE_URL, SUPABASE_KEY } = await rushConfig();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcion}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const datos = await r.json().catch(() => null);
  if (!r.ok) {
    // El código guardado es más viejo que el servidor: se actualiza la app
    if (window.SLVersion?.esErrorDeVersion(r.status, datos)) window.SLVersion.forzarActualizacion();
    throw Object.assign(new Error(datos?.message || `Error en ${funcion}`), { status: r.status });
  }
  return datos;
}

// Mismo nombre ignorando mayúsculas y tildes ("Nicolás" = "nicolas")
function rushMismoNombre(a, b) {
  const n = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return !!a && n(a) === n(b);
}

/* ── Acceso (beta) ───────────────────────────────────────────────────────── */
function rushAccesoGuardado() {
  try {
    const a = JSON.parse(localStorage.getItem(RUSH_ACCESO_KEY) || 'null');
    return a && a.jugador === getSessionPlayer() ? a.acceso : null;
  } catch { return null; }
}

// Muestra u oculta la pestaña; si se oculta estando en ella, se vuelve a Inicio
function rushMostrarPestana(visible) {
  const tab = document.querySelector('.tab[data-tab="rush"]');
  if (!tab || tab.hidden === !visible) return;
  tab.hidden = !visible;
  if (!visible && typeof STATE !== 'undefined' && STATE.activeTab === 'rush') switchTab('inicio');
}

function rushGuardarAcceso(acceso) {
  try {
    if (getSessionPlayer()) localStorage.setItem(RUSH_ACCESO_KEY, JSON.stringify({ jugador: getSessionPlayer(), acceso: !!acceso }));
    else localStorage.removeItem(RUSH_ACCESO_KEY);
  } catch { /* sin persistencia */ }
  rushMostrarPestana(!!acceso && !!getSessionPlayer());
}

/* ── Lo de la entrada a Rush, pedido al pulsar JUGAR ─────────────────────────
   slr_rush_inicio es UNA llamada con el jugador, la liga, el calendario y todo lo
   que Rush necesita al entrar. Se pide nada más pulsar JUGAR (a la vez que se
   carga el código) y Rush la usa sin volver a pedirla (rush.js → tomarPrecarga). */
window.rushPrecarga = null;   // { ambito, t, promesa, llegada }: llegada, cuándo respondió
const rushAmbito = () => `${getSessionPlayer()}|${RUSH_ES_LOCAL ? 'prueba' : 'principal'}`;
function rushPedirInicio(token) {
  const promesa = rushRpc('slr_rush_inicio', { token, prueba: RUSH_ES_LOCAL });
  const p = { ambito: rushAmbito(), t: Date.now(), promesa, llegada: null };
  promesa.then(() => { p.llegada = Date.now(); }, () => {});
  window.rushPrecarga = p;
  promesa.catch(() => { if (window.rushPrecarga?.promesa === promesa) window.rushPrecarga = null; });
  return promesa;
}

// Al iniciar sesión (app.js → onSessionChange): ¿tiene acceso a la beta? Una sola llamada
// (slr_login). Al arrancar NO se llama (vale lo guardado), salvo si no se sabe (app.js); si
// el acceso se ha perdido, lo descubre Rush al pulsar JUGAR
async function rushVerificarAcceso() {
  const jugador = getSessionPlayer();
  // Sin código guardado es una sesión antigua: session.js la cierra
  if (!jugador || !getSessionCode()) { rushMostrarPestana(false); return; }
  rushMostrarPestana(rushAccesoGuardado() === true);
  try {
    if (await rushReautenticar() === 'perdida') rushSesionPerdida();
  } catch (e) {
    console.warn('[rush] No se pudo comprobar el acceso:', e.message);   // se queda lo guardado
  }
}

// Solo en localhost: un código que no es de Shits League puede ser de un bot.
// Devuelve el nombre del bot o null. Su token queda pendiente hasta que
// session.js compruebe que encaja con la sesión (rushConfirmarBot).
let rushBotPendiente = null;
async function rushIdentificarBot(codigo) {
  rushBotPendiente = null;
  if (!RUSH_ES_LOCAL || !(codigo || '').trim()) return null;
  try {
    const r = await rushRpc('slr_login', { codigo: codigo.trim() });
    rushBotPendiente = r.token;
    return r.usuario?.nombre || null;
  } catch { return null; }
}
function rushConfirmarBot() {
  if (!rushBotPendiente) return false;
  rushGuardarToken(rushBotPendiente);
  rushBotPendiente = null;
  return true;
}

// Sesión de Rush en silencio con el código guardado (SESSION_CODE). Rush nunca
// pide el código: lo usa sin token y ante un 403.
//   'ok'         → token nuevo guardado
//   'sin_acceso' → el código vale pero el jugador no está en la beta
//   'perdida'    → el código ya no vale (o es de otra persona): hay que volver a entrar
//   lanza        → sin conexión (no se cierra la sesión por eso)
let rushReautenticando = null;
function rushReautenticar() {
  return (rushReautenticando ??= (async () => {
    const codigo = getSessionCode(), nombre = getSessionPlayer();
    if (!codigo || !nombre) return 'perdida';
    try {
      const r = await rushRpc('slr_login', { codigo });
      if (!rushMismoNombre(r.usuario?.nombre, nombre)) {
        if (r.token) rushRpc('slr_logout', { token: r.token }).catch(() => {});
        return 'perdida';
      }
      if (!r.tiene_acceso) { rushGuardarAcceso(false); return 'sin_acceso'; }
      rushGuardarToken(r.token);
      rushGuardarAcceso(true);
      return 'ok';
    } catch (e) {
      if (e.status === 403) return 'perdida';   // «Código incorrecto»
      throw e;
    }
  })().finally(() => { rushReautenticando = null; }));
}

// El servidor dice que ya no hay acceso (beta): se cierra Rush y se quita la pestaña
async function rushSinAcceso() {
  if (rushModulo) (await rushModulo).salir();
  rushGuardarAcceso(false);
}

// El código guardado ya no sirve: se cierra la sesión y se entra de nuevo con
// el modal normal de Shits League
async function rushSesionPerdida() {
  if (rushModulo) (await rushModulo).salir();
  logout();
  openSessionModal();
}

function rushCerrarSesion() {
  const token = rushToken();
  rushGuardarToken(null);
  try { localStorage.removeItem(RUSH_ACCESO_KEY); } catch { /* sin persistencia */ }
  if (token) rushRpc('slr_logout', { token }).catch(() => {});
}

/* ── Panel ───────────────────────────────────────────────────────────────── */
function renderRushPanel() {
  const conSesion = !!getSessionPlayer();
  return `
    <section class="rush-portada">
      <div class="rush-portada__fondo" aria-hidden="true"></div>
      <div class="rush-portada__marca">
        <span class="rush-portada__shits">SHITS LEAGUE</span>
        <span class="rush-portada__rush">RUSH</span>
      </div>
      <p class="rush-portada__lema">El juego de cartas de la liga: ficha a los de siempre, monta tu once y cada domingo el motor juega la jornada.</p>
      <div class="rush-portada__estado" id="rushEstado">
        <span class="rush-portada__punto"></span><span id="rushEstadoTexto"></span>
      </div>
      <button class="rush-portada__jugar" id="rushJugar" type="button" ${conSesion ? '' : 'disabled'}>
        ${conSesion ? 'JUGAR' : 'Inicia sesión para jugar'}
      </button>
      ${conSesion ? '' : '<button class="rush-portada__entrar" id="rushEntrar" type="button">ENTRAR CON MI CÓDIGO</button>'}
    </section>`;
}

function bindRushPanel(panel) {
  panel.querySelector('#rushJugar')?.addEventListener('click', rushJugar);
  panel.querySelector('#rushEntrar')?.addEventListener('click', () => openSessionModal());
  rushCargarEstado(panel);
}

/* ── Estado de la portada: el que guardó Rush la última vez (rush.js) ──────── */
const RUSH_FECHA = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const RUSH_PORTADA_KEY = 'RUSH_PORTADA';   // { ambito, liga: { estado, temporada }, jornada: { numero, estado, cierre_en } | null }

function rushCargarEstado(panel) {
  const texto = panel.querySelector('#rushEstadoTexto');
  const caja  = panel.querySelector('#rushEstado');
  let g = null;
  try { g = JSON.parse(localStorage.getItem(RUSH_PORTADA_KEY) || 'null'); } catch { /* sin persistencia */ }
  // Sin nada guardado (aún no se ha entrado nunca), sin línea de estado
  if (!g || g.ambito !== rushAmbito() || !getSessionPlayer()) { caja.hidden = true; return; }
  const { liga, jornada: j } = g;
  let estado = 'Todavía no hay liga', clase = 'apagada';
  if (liga?.estado === 'preparacion') {
    estado = 'Liga en preparación: apúntate antes de que empiece'; clase = 'abierta';
  } else if (liga?.estado === 'pausada') {
    estado = 'Liga en pausa'; clase = 'pausa';
  } else if (liga?.estado === 'entre_temporadas') {
    estado = `Entre temporadas · la temporada ${liga.temporada} ha terminado`; clase = 'abierta';
  } else if (liga?.estado === 'en_curso') {
    clase = 'viva';
    if (!j) estado = `Temporada ${liga.temporada} en marcha`;
    else if (j.estado !== 'programada' || new Date(j.cierre_en) <= new Date()) estado = `Jornada ${j.numero} en juego · resultados a las 21:00`;
    else estado = `Jornada ${j.numero} · ${RUSH_FECHA.format(new Date(j.cierre_en))}`;
  }
  texto.textContent = estado;
  caja.dataset.estado = clase;
}

/* ── Rush de la versión de version.json (al pulsar JUGAR) ──────────────────── */
const rushMb = b => (b / 1048576).toFixed(1).replace('.', ',');
// Resuelve { ok } cuando Rush está guardado en la versión de version.json. Si hay algo que
// descargar (la primera vez o con una versión nueva: solo lo que ha cambiado), «Descargando
// Shits League Rush…» con el %. Si la Shits League también era vieja, version.js recarga y
// se entra después (SL_ENTRAR_RUSH)
async function rushPreparar(panel) {
  const v = window.SLVersion;
  if (!v?.prepararRush) return { ok: true };
  const portada = panel?.querySelector('.rush-portada');
  let caja = null;
  const pintar = d => {
    if (!d?.totalBytes) return;
    if (!caja) {
      caja = document.createElement('div');
      caja.className = 'rush-descarga';
      caja.setAttribute('role', 'status');
      caja.innerHTML = `<b class="rush-descarga__titulo">Descargando Shits League Rush…</b>
        <span class="rush-descarga__barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></span>
        <small class="rush-descarga__texto">Preparando…</small>
        <small class="rush-descarga__nota">Solo la primera vez y con cada versión nueva (solo lo que ha cambiado).</small>`;
      portada?.appendChild(caja);
      portada?.classList.add('rush-portada--descargando');
    }
    const pct = Math.min(100, Math.round(100 * d.bytes / Math.max(1, d.totalBytes)));
    caja.querySelector('i').style.width = `${pct}%`;
    caja.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(pct));
    caja.querySelector('.rush-descarga__texto').textContent = `${pct} % · ${rushMb(d.bytes)} de ${rushMb(d.totalBytes)} MB`;
  };
  try {
    return await v.prepararRush(pintar);
  } finally {
    caja?.remove();
    portada?.classList.remove('rush-portada--descargando');
  }
}

// Tras una recarga para aplicar una versión nueva al pulsar JUGAR: se entra sola
function rushTrasRecarga() {
  let entrar = false;
  try { entrar = sessionStorage.getItem('SL_ENTRAR_RUSH') === '1'; sessionStorage.removeItem('SL_ENTRAR_RUSH'); } catch { /* */ }
  if (!entrar || !getSessionPlayer()) return;
  if (typeof switchTab === 'function') switchTab('rush');
  rushJugar();
}

/* ── Entrar al modo Rush ─────────────────────────────────────────────────── */
let rushModulo = null;

function rushCargarCss() {
  if (document.getElementById('slrCss')) return Promise.resolve();
  return new Promise(resolve => {
    const link = Object.assign(document.createElement('link'), { id: 'slrCss', rel: 'stylesheet', href: rushRuta('css/slr.css') });
    link.onload = link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

async function rushJugar() {
  if (!getSessionPlayer()) { openSessionModal(); return; }

  const btn = document.getElementById('rushJugar');
  if (btn) { btn.disabled = true; btn.textContent = 'CARGANDO…'; }
  try {
    // Rush de la versión de version.json: si falta algo, se descarga (el %, en la portada)
    const listo = await rushPreparar(document.getElementById('panel-rush'));
    if (!listo.ok) {
      if (btn?.isConnected) { btn.textContent = 'REINTENTAR'; btn.disabled = false; }
      const est = document.getElementById('rushEstado');
      if (est) { est.hidden = false; est.dataset.estado = 'apagada'; est.querySelector('#rushEstadoTexto').textContent = listo.mensaje; }
      return;
    }
    if (!rushToken()) {
      const r = await rushReautenticar();
      if (r === 'perdida') { rushSesionPerdida(); return; }
      if (r === 'sin_acceso') return;          // la pestaña ya se ha ocultado
    }
    // La primera vez en esta página, lo de la entrada (una llamada) a la vez que se carga el
    // código; después, Rush ya tiene lo suyo guardado y lo pide él si hace falta
    if (!rushModulo) rushPedirInicio(rushToken()).catch(() => {});
    const [mod] = await Promise.all([
      rushModulo ??= import(rushRuta('js/slr/rush.js')),
      rushCargarCss(),
    ]);
    await mod.abrir({
      jugador: getSessionPlayer(),
      reautenticar: rushReautenticar,
      sesionPerdida: rushSesionPerdida,
      sinAcceso: rushSinAcceso,
      alSalir: () => rerenderPanel('rush'),
    });
  } catch (e) {
    console.error('[rush] No se pudo abrir Rush:', e);
    // El código guardado no arranca (un archivo roto, a medias…) y hay red: se repara solo
    if (navigator.onLine && /SyntaxError|import|module/i.test(`${e?.name} ${e?.message}`)) {
      window.SLVersion?.reparar({ auto: true, entrarRush: true });
    }
    if (btn?.isConnected) { btn.textContent = 'SIN CONEXIÓN · REINTENTAR'; btn.disabled = false; }
    return;
  }
  if (btn?.isConnected) { btn.disabled = false; btn.textContent = 'JUGAR'; }
}

// Primer pintado de la pestaña con lo guardado (el script va al final del body)
rushMostrarPestana(!!getSessionPlayer() && !!getSessionCode() && rushAccesoGuardado() === true);
