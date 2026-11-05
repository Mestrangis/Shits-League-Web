/* ═══════════════════════════════════════════════
   SHITS LEAGUE — session.js
   Login por código único. Cada jugador tiene un código; en ajustes.js
   solo se guarda su hash SHA-256 (herramientas/huella-codigo.html). El login no bloquea nada:
   identifica al jugador para funcionalidades futuras.
═══════════════════════════════════════════════ */

const SESSION_KEY = 'SESSION_PLAYER';
// El código se guarda tras un login correcto para que Rush (rush-panel.js)
// pueda abrir su sesión del servidor sin volver a pedirlo nunca
const SESSION_CODE_KEY = 'SESSION_CODE';

/* ── Estado de sesión ────────────────────────────────────────────────────── */
// Jugador logueado o null. localStorage puede no estar disponible (modo privado)
function getSessionPlayer() {
  try { return localStorage.getItem(SESSION_KEY) || null; } catch { return null; }
}

function setSessionPlayer(nombre) {
  try {
    if (nombre) localStorage.setItem(SESSION_KEY, nombre);
    else        localStorage.removeItem(SESSION_KEY);
  } catch { /* sin persistencia: la sesión dura lo que la pestaña */ }
  renderSessionButton(nombre);
  if (typeof pushVincularJugador === 'function') pushVincularJugador(nombre);
  if (typeof onSessionChange === 'function') onSessionChange(nombre);
}

function getSessionCode() {
  try { return localStorage.getItem(SESSION_CODE_KEY) || null; } catch { return null; }
}

function setSessionCode(codigo) {
  try {
    if (codigo) localStorage.setItem(SESSION_CODE_KEY, codigo);
    else        localStorage.removeItem(SESSION_CODE_KEY);
  } catch { /* sin persistencia */ }
}

async function sha256(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Devuelve el nombre del jugador si el código es válido, si no null
async function identificarCodigo(codigo) {
  const limpio = (codigo || '').trim().toLowerCase();
  if (!limpio) return null;
  return JUGADORES_CODIGOS[await sha256(limpio)] || null;
}

/* ── UI ──────────────────────────────────────────────────────────────────── */
// Rellena un contenedor .avatar con la foto del jugador, o su inicial si no
// tiene foto o la imagen no carga
function renderAvatar(el, nombre) {
  const url = JUGADORES_FOTOS[nombre];
  el.innerHTML = '';
  const inicial = () => { el.textContent = nombre[0].toUpperCase(); };
  if (!url) { inicial(); return; }

  const img = document.createElement('img');
  img.src = url;
  img.alt = nombre;
  img.addEventListener('error', inicial, { once: true });
  el.appendChild(img);
}

function renderSessionButton(nombre) {
  const btn = document.getElementById('sessionBtn');
  if (!btn) return;
  btn.classList.toggle('session-btn--logged', !!nombre);
  btn.setAttribute('aria-label', nombre ? `Sesión de ${nombre}` : 'Iniciar sesión');
  btn.innerHTML = nombre
    ? `<span class="avatar session-btn__avatar"></span><span class="session-btn__name">${nombre}</span>`
    : `<span class="session-btn__label">ENTRAR</span>`;
  if (nombre) renderAvatar(btn.querySelector('.avatar'), nombre);
}

function openSessionModal() {
  const nombre = getSessionPlayer();
  document.getElementById('sessionLogin').hidden  = !!nombre;
  document.getElementById('sessionLogged').hidden = !nombre;
  if (nombre) {
    document.getElementById('sessionLoggedName').textContent = nombre;
    renderAvatar(document.getElementById('sessionAvatar'), nombre);
  }
  openModal('sessionModal');
  if (!nombre) setTimeout(() => document.getElementById('sessionCode').focus(), 50);
}

function resetLoginForm() {
  document.getElementById('sessionCode').value = '';
  document.getElementById('sessionError').hidden = true;
}

async function tryLogin() {
  const input = document.getElementById('sessionCode');
  const error = document.getElementById('sessionError');
  let nombre = null;
  try {
    nombre = await identificarCodigo(input.value);
  } catch (e) {
    // crypto.subtle solo existe en contextos seguros (https / localhost)
    console.warn('[session] No se pudo verificar el código:', e);
  }

  // Rush: en localhost también valen los códigos de los bots (solo contra el servidor)
  let esBot = false;
  if (!nombre && typeof rushIdentificarBot === 'function') {
    nombre = await rushIdentificarBot(input.value);
    esBot = !!nombre;
  }

  const fallo = texto => {
    error.textContent = texto;
    error.hidden = false;
    input.select();
  };
  if (!nombre) return fallo('Código incorrecto');

  // Rush abre su sesión con el mismo código al cambiar la sesión (app.js →
  // rushVerificarAcceso), sin esperar: si el servidor falla, Shits League entra igual
  if (esBot) rushConfirmarBot();

  setSessionCode(input.value.trim());
  setSessionPlayer(nombre);
  resetLoginForm();
  closeModal('sessionModal');
}

function logout() {
  if (typeof rushCerrarSesion === 'function') rushCerrarSesion();
  setSessionCode(null);
  setSessionPlayer(null);
  closeModal('sessionModal');
}

function initSession() {
  // Sesiones de antes de guardar el código: se cierran sin aviso y el jugador
  // se identifica otra vez con el modal de siempre (ya será la última)
  if (getSessionPlayer() && !getSessionCode()) {
    if (typeof rushCerrarSesion === 'function') rushCerrarSesion();
    setSessionPlayer(null);
  }
  renderSessionButton(getSessionPlayer());

  document.getElementById('sessionBtn').addEventListener('click', openSessionModal);
  document.getElementById('sessionLoginBtn').addEventListener('click', tryLogin);
  document.getElementById('sessionCode').addEventListener('keydown', e => {
    if (e.key === 'Enter') tryLogin();
  });
  document.getElementById('sessionCode').addEventListener('input', () => {
    document.getElementById('sessionError').hidden = true;
  });
  document.getElementById('sessionLogoutBtn').addEventListener('click', logout);
}
