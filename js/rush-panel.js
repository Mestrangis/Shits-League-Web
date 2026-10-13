/* ═══════════════════════════════════════════════
   SHITS LEAGUE — rush-panel.js
   Pestaña "Rush": portada ligera de Shits League Rush y el puente con la
   sesión de Shits League (session.js). Aquí no hay nada del juego: el modo
   Rush (js/slr/rush.js + css/slr.css) se carga al pulsar JUGAR.
═══════════════════════════════════════════════ */

const RUSH_TOKEN_KEY = 'SLR_TOKEN';
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
  if (!r.ok) throw Object.assign(new Error(datos?.message || `Error en ${funcion}`), { status: r.status });
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

/* ── Puente con session.js ───────────────────────────────────────────────── */
// Tras un código válido de Shits League: abre también la sesión de Rush con el
// mismo código. Nunca lanza: si el servidor falla, Shits League entra igual.
async function rushActivar(codigo, nombre) {
  try {
    const r = await rushRpc('slr_login', { codigo: (codigo || '').trim() });
    if (!rushMismoNombre(r.usuario?.nombre, nombre)) {
      rushRpc('slr_logout', { token: r.token }).catch(() => {});
      return false;
    }
    rushGuardarToken(r.token);
    return true;
  } catch (e) {
    console.warn('[rush] No se pudo activar Rush:', e.message);
    return false;
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

function rushCerrarSesion() {
  const token = rushToken();
  rushGuardarToken(null);
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
        <span class="rush-portada__punto"></span><span id="rushEstadoTexto">Cargando…</span>
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

// Pide el código (modal de sesión de siempre) y, al acertar, entra al juego
function rushPedirCodigo() {
  rushGuardarToken(null);
  openSessionModal({ alActivarRush: rushJugar });
}

async function rushJugar() {
  if (!getSessionPlayer()) { openSessionModal(); return; }
  if (!rushToken()) { rushPedirCodigo(); return; }

  const btn = document.getElementById('rushJugar');
  if (btn) { btn.disabled = true; btn.textContent = 'CARGANDO…'; }
  try {
    const [mod] = await Promise.all([
      rushModulo ??= import(rushRuta('js/slr/rush.js')),
      rushCargarCss(),
    ]);
    await mod.abrir({
      jugador: getSessionPlayer(),
      pedirCodigo: rushPedirCodigo,
      alSalir: () => rerenderPanel('rush'),
    });
  } catch (e) {
    console.error('[rush] No se pudo abrir Rush:', e);
  } finally {
    if (btn?.isConnected) { btn.disabled = false; btn.textContent = 'JUGAR'; }
  }
}
