/* ═══════════════════════════════════════════════
   SHITS LEAGUE — session.js
   Login por código único. Cada jugador tiene un código; en el JS
   solo se guarda su hash SHA-256. El login no bloquea nada:
   identifica al jugador para funcionalidades futuras.
═══════════════════════════════════════════════ */

// SHA-256(código en minúsculas) → nombre del jugador
// Para añadir un jugador: node -e "console.log(require('crypto').createHash('sha256').update('codigo').digest('hex'))"
const JUGADORES_CODIGOS = {
  "52e617dd6d2f75cb3bd76ca2eced4c582d83b6198ceb13a2ba6f6239164e51d2": "Marcos",
  "6ad5b293d45a59fb605bb5555c2f1abb80463cacd7046dee9fbd161fa0c3eb9e": "Alberto",
  "a662bf96c60de6f68c3772bf36a5d922b2ff6d039d776fe1abafc65a8327785b": "Puebla",
  "0d0b9410216b3406881bddffcefd6babb1f96aa19719769e8ae63eed86e24444": "Carlos",
  "23c069f629c80803552eb3e0f10a5481b1a41d09ddb7199d010accd1905c4bca": "David",
  "26c0b5509c547b71161a295bbd759fcb6b2ec0fb776af9b2600943ceb163c82c": "Enzo",
  "43745fe52a3546971a01544920739623969434c9f9beaca11e8100d5ffd37f4c": "Fernando",
  "173cd8246dfac4269ee0e673f26756a03501ee2ccf7400bf7479f491c31b3111": "Gonzalo",
  "2b72d3756802cffd53fad1e07da805e541294bf4d03f35bea19ed1d4ac10d3d6": "Hugo",
  "38579e0cb7462626ac97dce05058c92b1533d77e0f28ae984d52917f4fb7b8e0": "Nacho",
  "a3d6d6994972d54c31de9c8e9a75b7412fbabd884ff93bfa17da4025f75c9644": "Javier",
  "45d09ae39c7cadf013dc1e6b8ec35cc61cae18c855110fbc04e724af62cdce8f": "Jorge",
  "85eb7d8e2ed8c2bef9c0fdd1834d8432ca86abe82f03bd170ed557a3503d4089": "Luis",
  "373286b822b86542cdb57ef5d2920e6988e6846f38bf733ac978ae4a730252f7": "Mateo",
  "e76a092c92cc697a7f9b0783f6f00f8ec845f1d284f72d6f28da44ad02102013": "Nicolás",
  "88180852b6a0cfcd3094d1794f63892b4d0918defac49b3f3f6e8ffb51d0dbd2": "Pablo",
  "7b3762adf5389fc70848e60c00208af6768bd03877bc199549aec5254737d753": "Pelayo",
  "327bef5f4505da8ef5b97fed057a33a6c4376efc9b07daee6086cbe69f202af7": "Víctor",
};

// Foto de perfil por jugador (URL). Vacía → se muestra el emoji 👤
const JUGADORES_FOTOS = {
  "Marcos":   "https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741814/DALL_E_2022-08-29_14.48.06_-_A_Capibara_DJ_in_a_discotheque_ezgybe.png",
  "Alberto":  "https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741813/pepe-bordalas-efe_ti5q4z.jpg",
  "Puebla":   "https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741814/IMG_20220617_204510_tdek5a.jpg",
  "Carlos":   "",
  "David":    "",
  "Enzo":     "",
  "Fernando": "",
  "Gonzalo":  "",
  "Hugo":     "",
  "Nacho":    "https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741813/IMG-20240508-WA0010_booqhn.jpg",
  "Javier":   "",
  "Jorge":    "https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741813/IMG-20240621-WA0008_mbjgmj.jpg",
  "Luis":     "",
  "Mateo":    "https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741812/apps.56233.14149010387777920.1f9829d6-41d4-4e5f-9e1d-eca24b9a3e17_fkoiil.ico",
  "Nicolás":  "https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741813/Captura_de_pantalla_2024-06-15_232610_jk5vm4.jpg",
  "Pablo":    "",
  "Pelayo":   "",
  "Víctor":   "",
};

const SESSION_KEY = 'SESSION_PLAYER';

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
// Rellena un contenedor .avatar con la foto del jugador, o el emoji si no
// tiene foto o la imagen no carga
function renderAvatar(el, nombre) {
  const url = JUGADORES_FOTOS[nombre];
  el.innerHTML = '';
  if (!url) { el.textContent = '👤'; return; }

  const img = document.createElement('img');
  img.src = url;
  img.alt = nombre;
  img.addEventListener('error', () => { el.textContent = '👤'; }, { once: true });
  el.appendChild(img);
}

function renderSessionButton(nombre) {
  const btn = document.getElementById('sessionBtn');
  if (!btn) return;
  btn.classList.toggle('session-btn--logged', !!nombre);
  btn.setAttribute('aria-label', nombre ? `Sesión de ${nombre}` : 'Iniciar sesión');
  btn.innerHTML = nombre
    ? `<span class="avatar session-btn__avatar"></span><span class="session-btn__name">${nombre}</span>`
    : `<span class="session-btn__icon">👤</span><span class="session-btn__label">ENTRAR</span>`;
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

  if (!nombre) {
    error.hidden = false;
    input.select();
    return;
  }
  setSessionPlayer(nombre);
  resetLoginForm();
  closeModal('sessionModal');
}

function logout() {
  setSessionPlayer(null);
  closeModal('sessionModal');
}

function initSession() {
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
