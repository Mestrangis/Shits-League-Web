/* ═══════════════════════════════════════════════
   SHITS LEAGUE — rush-panel.js
   Pestaña "Rush": portada ligera de Shits League Rush y el puente con la
   sesión de Shits League (session.js). Aquí no hay nada del juego: el modo
   Rush (js/slr/rush.js + css/slr.css) se carga al pulsar JUGAR.
   Rush está en beta: la pestaña solo aparece con sesión y acceso. El acceso lo
   dice el servidor (slr_yo / slr_login → tiene_acceso) y se guarda en
   localStorage para que al arrancar no parpadee.
   · La primera vez, la app se descarga entera en segundo plano (sw.js). Si se
     entra aquí antes de que acabe, «Descargando Shits League Rush…» con el
     porcentaje real, hasta que termina.
   · Al ver la portada se piden de golpe los módulos de Rush (modulepreload): al
     pulsar JUGAR ya están, en vez de descubrirse uno tras otro.
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

async function rushLeer(ruta) {
  const { SUPABASE_URL, SUPABASE_KEY } = await rushConfig();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, { headers: { apikey: SUPABASE_KEY } });
  if (!r.ok) throw new Error(`Error leyendo ${ruta}`);
  return r.json();
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

// Al arrancar y en cada cambio de sesión (app.js): primero lo guardado, sin
// esperar a la red, y luego lo que diga el servidor
async function rushVerificarAcceso() {
  const jugador = getSessionPlayer();
  // Sin código guardado es una sesión antigua: session.js la cierra
  if (!jugador || !getSessionCode()) { rushMostrarPestana(false); return; }
  rushMostrarPestana(rushAccesoGuardado() === true);
  try {
    const token = rushToken();
    if (token) {
      try {
        const yo = await rushRpc('slr_yo', { token });
        if (rushMismoNombre(yo.usuario?.nombre, jugador)) { rushGuardarAcceso(yo.tiene_acceso); return; }
      } catch (e) {
        if (e.status !== 403) throw e;
      }
      rushGuardarToken(null);
    }
    const r = await rushReautenticar();
    if (r === 'perdida') rushSesionPerdida();
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
  // Sin service worker al mando (primera vez): JUGAR espera a saber si la app ya está descargada
  const porComprobar = 'serviceWorker' in navigator && !navigator.serviceWorker.controller;
  return `
    <section class="rush-portada">
      <div class="rush-portada__fondo" aria-hidden="true"></div>
      <div class="rush-portada__marca">
        <span class="rush-portada__shits">SHITS LEAGUE</span>
        <span class="rush-portada__rush">RUSH</span>
      </div>
      <p class="rush-portada__lema">El juego de cartas de la liga: ficha a los de siempre, monta tu once y cada domingo el motor juega la jornada.</p>
      <div class="rush-portada__estado" id="rushEstado">
        <span class="rush-portada__punto"></span><span id="rushEstadoTexto">Cargando…</span>
      </div>
      <button class="rush-portada__jugar" id="rushJugar" type="button" ${conSesion && !porComprobar ? '' : 'disabled'}>
        ${conSesion ? 'JUGAR' : 'Inicia sesión para jugar'}
      </button>
      ${conSesion ? '' : '<button class="rush-portada__entrar" id="rushEntrar" type="button">ENTRAR CON MI CÓDIGO</button>'}
    </section>`;
}

function bindRushPanel(panel) {
  panel.querySelector('#rushJugar')?.addEventListener('click', rushJugar);
  panel.querySelector('#rushEntrar')?.addEventListener('click', () => openSessionModal());
  rushCargarEstado(panel);
  rushComprobarDescarga(panel);
}

/* ── Descarga de la app (primera vez) y módulos de Rush por adelantado ─────── */
const rushMb = b => (b / 1048576).toFixed(1).replace('.', ',');
async function rushComprobarDescarga(panel) {
  const v = window.SLVersion;
  if (!v) return;
  const e = await v.estado().catch(() => ({ lista: true }));
  const jugar = panel.querySelector('#rushJugar');
  if (e.lista) {
    if (jugar?.isConnected && getSessionPlayer()) jugar.disabled = false;
    rushPrecargarModulos(e.rush);
    return;
  }
  const portada = panel.querySelector('.rush-portada');
  if (!portada || portada.querySelector('.rush-descarga')) return;
  const caja = document.createElement('div');
  caja.className = 'rush-descarga';
  caja.setAttribute('role', 'status');
  caja.innerHTML = `<b class="rush-descarga__titulo">Descargando Shits League Rush…</b>
    <span class="rush-descarga__barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></span>
    <small class="rush-descarga__texto">Preparando…</small>
    <small class="rush-descarga__nota">Solo la primera vez: después se abre al momento, también sin conexión.</small>`;
  portada.appendChild(caja);
  portada.classList.add('rush-portada--descargando');
  if (jugar) jugar.disabled = true;
  const pintar = d => {
    if (!d || d.totalBytes == null) return;
    const pct = Math.min(100, Math.round(100 * d.bytes / Math.max(1, d.totalBytes)));
    caja.querySelector('i').style.width = `${pct}%`;
    caja.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(pct));
    caja.querySelector('.rush-descarga__texto').textContent = `${pct} % · ${rushMb(d.bytes)} de ${rushMb(d.totalBytes)} MB`;
  };
  pintar(e.progreso);
  const dejar = v.alProgreso(pintar);
  await v.rushListo();
  dejar();
  caja.remove();
  portada.classList.remove('rush-portada--descargando');
  if (jugar?.isConnected && getSessionPlayer()) jugar.disabled = false;
  rushPrecargarModulos((await v.estado().catch(() => ({}))).rush);
}

// Pide de golpe los módulos que carga Rush al entrar (y su CSS), una sola vez
let rushModulosPedidos = false;
function rushPrecargarModulos(lista) {
  if (rushModulosPedidos || !Array.isArray(lista) || !lista.length) return;
  rushModulosPedidos = true;
  const frag = document.createDocumentFragment();
  for (const ruta of lista) frag.appendChild(Object.assign(document.createElement('link'), { rel: 'modulepreload', href: rushRuta(ruta) }));
  if (!document.getElementById('slrCss')) frag.appendChild(Object.assign(document.createElement('link'), { rel: 'preload', as: 'style', href: rushRuta('css/slr.css') }));
  document.head.appendChild(frag);
}

const RUSH_FECHA = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

// Liga que verá el usuario: la principal o, en local, la liga de prueba del bot
async function rushLigaVisible() {
  const token = rushToken();
  if (token && getSessionPlayer()) {
    try {
      const yo = await rushRpc('slr_yo', { token });
      const prueba = RUSH_ES_LOCAL && yo.ligas.find(l => l.es_prueba);
      return prueba || yo.liga_principal;
    } catch { /* sin token válido: se cae a la lectura pública */ }
  }
  const [liga] = await rushLeer('ligas?select=id,nombre,estado,temporada&es_prueba=eq.false&order=creada_en&limit=1');
  return liga || null;
}

async function rushCargarEstado(panel) {
  const texto = panel.querySelector('#rushEstadoTexto');
  const caja  = panel.querySelector('#rushEstado');
  let estado = 'Sin conexión con Rush', clase = 'apagada';
  try {
    const liga = await rushLigaVisible();
    if (!liga) {
      estado = 'Todavía no hay liga';
    } else if (liga.estado === 'preparacion') {
      estado = 'Liga en preparación: apúntate antes de que empiece'; clase = 'abierta';
    } else if (liga.estado === 'pausada') {
      estado = 'Liga en pausa'; clase = 'pausa';
    } else if (liga.estado === 'entre_temporadas') {
      estado = `Entre temporadas · la temporada ${liga.temporada} ha terminado`; clase = 'abierta';
    } else if (liga.estado === 'en_curso') {
      const [j] = await rushLeer(`jornadas?select=numero,estado,cierre_en&liga_id=eq.${liga.id}` +
        '&estado=in.(programada,cerrada,simulada)&order=cierre_en&limit=1');
      clase = 'viva';
      if (!j) estado = `Temporada ${liga.temporada} en marcha`;
      else if (j.estado !== 'programada' || new Date(j.cierre_en) <= new Date()) estado = `Jornada ${j.numero} en juego · resultados a las 21:00`;
      else estado = `Jornada ${j.numero} · ${RUSH_FECHA.format(new Date(j.cierre_en))}`;
    }
  } catch (e) {
    console.warn('[rush] Estado de la liga:', e.message);
  }
  if (!texto.isConnected) return;
  texto.textContent = estado;
  caja.dataset.estado = clase;
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
    if (!rushToken()) {
      const r = await rushReautenticar();
      if (r === 'perdida') { rushSesionPerdida(); return; }
      if (r === 'sin_acceso') return;          // la pestaña ya se ha ocultado
    }
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
    if (btn?.isConnected) { btn.textContent = 'SIN CONEXIÓN · REINTENTAR'; btn.disabled = false; }
    return;
  }
  if (btn?.isConnected) { btn.disabled = false; btn.textContent = 'JUGAR'; }
}

// Primer pintado de la pestaña con lo guardado (el script va al final del body)
rushMostrarPestana(!!getSessionPlayer() && !!getSessionCode() && rushAccesoGuardado() === true);
