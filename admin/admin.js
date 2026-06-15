/* ═══════════════════════════════════════════════
   SHITS LEAGUE — admin.js
═══════════════════════════════════════════════ */

// ── Auth guard ────────────────────────────────────────────────────────────────
if (sessionStorage.getItem('sl_admin') !== '1') {
  window.location.replace('../');
}

document.getElementById('btn-logout').addEventListener('click', function () {
  sessionStorage.removeItem('sl_admin');
  window.location.href = '../';
});

// ── State ─────────────────────────────────────────────────────────────────────
let JUGADORES = [];

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  initBubbles();
  prefillFecha();

  try {
    JUGADORES = await fetchJugadores() || [];
  } catch (e) {
    console.error('[admin] fetchJugadores:', e);
  }

  renderMvpSelect();
  renderTeamPlayers('local');
  renderTeamPlayers('visitante');
  renderJugadoresGrid();
  bindPartidoForm();
  bindUploadResultado();
  bindAmistoso();
}

function prefillFecha() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('p-fecha').value = today;
}

function initBubbles() {
  const container = document.getElementById('bubbles');
  if (!container) return;
  [
    { size: 90,  top: '8%',  left: '6%',   op: .10, blur: 2, dur: 9,  delay: 0   },
    { size: 54,  top: '22%', right: '9%',  op: .13, blur: 0, dur: 7,  delay: .8  },
    { size: 34,  top: '55%', left: '3%',   op: .14, blur: 0, dur: 11, delay: .4  },
    { size: 110, top: '70%', right: '5%',  op: .07, blur: 4, dur: 13, delay: 1.2 },
    { size: 46,  top: '85%', left: '14%',  op: .10, blur: 0, dur: 8,  delay: .2  },
  ].forEach(function (b) {
    const el = document.createElement('span');
    el.className = 'bubble';
    el.style.cssText = [
      'width:' + b.size + 'px', 'height:' + b.size + 'px', 'top:' + b.top,
      b.left ? 'left:' + b.left : 'right:' + b.right,
      'opacity:' + b.op,
      b.blur ? 'filter:blur(' + b.blur + 'px)' : '',
      'animation-duration:' + b.dur + 's',
      'animation-delay:' + b.delay + 's',
    ].filter(Boolean).join(';');
    container.appendChild(el);
  });
}

// ── Amistoso toggle (oculta el número de jornada y los capitanes) ────────────
function bindAmistoso() {
  document.getElementById('p-amistoso').addEventListener('change', function () {
    const checked  = this.checked;
    const numField = document.getElementById('p-numero');
    numField.disabled = checked;
    if (checked) numField.value = '';

    document.body.classList.toggle('is-amistoso', checked);
    ['local', 'visitante'].forEach(function (team) {
      const el = document.getElementById('team-' + team);
      el.querySelectorAll('.team-player__cap').forEach(function (cap) {
        if (checked) cap.checked = false;
      });
    });
  });
}

// ── MVP select ────────────────────────────────────────────────────────────────
function renderMvpSelect() {
  const sel = document.getElementById('p-mvp');
  JUGADORES.forEach(function (j) {
    const opt = document.createElement('option');
    opt.value = j.nombre;
    opt.textContent = j.bandera + ' ' + j.nombre;
    sel.appendChild(opt);
  });
}

// ── Selectores de jugadores por equipo (con capitán) ─────────────────────────
function renderTeamPlayers(team) {
  const el = document.getElementById('team-' + team);
  if (!JUGADORES.length) {
    el.innerHTML = '<p class="empty">No se pudieron cargar los jugadores.</p>';
    return;
  }

  el.innerHTML = JUGADORES.map(function (j) {
    return '<label class="team-player">' +
      '<input type="checkbox" class="team-player__check" data-team="' + team + '" data-nombre="' + j.nombre + '">' +
      '<span class="team-player__name">' + j.bandera + ' ' + j.nombre + '</span>' +
      '<span class="team-player__stat" title="Goles">⚽<input type="number" class="team-player__goles" min="0" max="20" value="0" disabled></span>' +
      '<span class="team-player__stat" title="Asistencias">🅰️<input type="number" class="team-player__asis" min="0" max="20" value="0" disabled></span>' +
      '<input type="radio" class="team-player__cap" name="cap-' + team + '" data-nombre="' + j.nombre + '" disabled title="Capitán ★">' +
    '</label>';
  }).join('');

  el.querySelectorAll('.team-player__check').forEach(function (chk) {
    chk.addEventListener('change', function () {
      const row    = chk.closest('.team-player');
      const cap    = row.querySelector('.team-player__cap');
      const goles  = row.querySelector('.team-player__goles');
      const asis   = row.querySelector('.team-player__asis');
      cap.disabled   = !chk.checked || document.body.classList.contains('is-amistoso');
      goles.disabled = !chk.checked;
      asis.disabled  = !chk.checked;
      if (!chk.checked) {
        if (cap.checked) cap.checked = false;
        goles.value = '0';
        asis.value  = '0';
      }
    });
  });
}

// Devuelve { jugadores, capitan, goleadores, asistentes }
// goleadores/asistentes: arrays de "Nombre:cantidad" (solo cantidad > 0)
function getTeamSelection(team) {
  const el = document.getElementById('team-' + team);
  const jugadores   = [];
  const goleadores  = [];
  const asistentes  = [];
  let capitan = '';

  el.querySelectorAll('.team-player__check:checked').forEach(function (chk) {
    const row    = chk.closest('.team-player');
    const nombre = chk.dataset.nombre;
    jugadores.push(nombre);

    const goles = parseInt(row.querySelector('.team-player__goles').value) || 0;
    const asis  = parseInt(row.querySelector('.team-player__asis').value)  || 0;
    if (goles > 0) goleadores.push(nombre + ':' + goles);
    if (asis  > 0) asistentes.push(nombre + ':' + asis);
  });

  const capInput = el.querySelector('.team-player__cap:checked');
  if (capInput) capitan = capInput.dataset.nombre;

  return { jugadores, capitan, goleadores, asistentes };
}

function resetTeamPlayers() {
  ['local', 'visitante'].forEach(function (team) {
    const el = document.getElementById('team-' + team);
    el.querySelectorAll('.team-player__check').forEach(function (chk) { chk.checked = false; });
    el.querySelectorAll('.team-player__cap').forEach(function (cap) { cap.checked = false; cap.disabled = true; });
    el.querySelectorAll('.team-player__goles, .team-player__asis').forEach(function (inp) {
      inp.value = '0';
      inp.disabled = true;
    });
  });
}

// ── Partido form submit ───────────────────────────────────────────────────────
function bindPartidoForm() {
  document.getElementById('form-partido').addEventListener('submit', async function (e) {
    e.preventDefault();

    const btn    = document.getElementById('btn-guardar-partido');
    const status = document.getElementById('partido-status');
    const label  = btn.querySelector('span');

    btn.disabled  = true;
    label.textContent = 'Guardando…';
    status.textContent = '';
    status.className   = 'status-msg';

    try {
      const amistoso      = document.getElementById('p-amistoso').checked;
      const numero        = document.getElementById('p-numero').value;
      const fecha         = document.getElementById('p-fecha').value;
      const local         = document.getElementById('p-local').value.trim();
      const visitante     = document.getElementById('p-visitante').value.trim();
      const goles_local   = parseInt(document.getElementById('p-goles-local').value)   || 0;
      const goles_visitante = parseInt(document.getElementById('p-goles-visitante').value) || 0;
      const mensaje       = document.getElementById('p-mensaje').value.trim();
      const video_url     = document.getElementById('p-video').value.trim();
      const imagen_url    = document.getElementById('p-imagen').value.trim();
      const mvp           = document.getElementById('p-mvp').value;

      if (!fecha)     throw new Error('La fecha es obligatoria');
      if (!local)     throw new Error('El nombre del equipo local es obligatorio');
      if (!visitante) throw new Error('El nombre del equipo visitante es obligatorio');

      const localSel     = getTeamSelection('local');
      const visitanteSel = getTeamSelection('visitante');

      if (!localSel.jugadores.length)     throw new Error('Selecciona al menos un jugador del equipo local');
      if (!visitanteSel.jugadores.length) throw new Error('Selecciona al menos un jugador del equipo visitante');
      if (!amistoso && !localSel.capitan)     throw new Error('Marca el capitán del equipo local');
      if (!amistoso && !visitanteSel.capitan) throw new Error('Marca el capitán del equipo visitante');

      const goleadores = [].concat(localSel.goleadores, visitanteSel.goleadores).join(',');
      const asistentes = [].concat(localSel.asistentes, visitanteSel.asistentes).join(',');

      // Jornada
      setStatus(status, '📋 Guardando jornada…');
      await gasPost({
        action:           'addJornada',
        numero:           amistoso ? '' : (numero ? parseInt(numero) : ''),
        fecha,
        local,            goles_local,
        visitante,        goles_visitante,
        jugadores_local:     localSel.jugadores,
        capitan_local:       amistoso ? '' : localSel.capitan,
        jugadores_visitante: visitanteSel.jugadores,
        capitan_visitante:   amistoso ? '' : visitanteSel.capitan,
        goleadores,       asistentes,
        mensaje,          video_url,
        imagen_url,
        amistoso:         amistoso ? 'TRUE' : 'FALSE',
        mvp,
      });

      setStatus(status, '✅ Partido guardado correctamente', 'ok');
      resetPartidoForm();

    } catch (err) {
      setStatus(status, '❌ ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      label.textContent = 'GUARDAR PARTIDO';
    }
  });
}

function setStatus(el, msg, type) {
  el.textContent = msg;
  el.className   = 'status-msg' + (type ? ' status-msg--' + type : '');
}

function resetPartidoForm() {
  document.getElementById('form-partido').reset();
  prefillFecha();
  document.body.classList.remove('is-amistoso');
  resetTeamPlayers();
  // Reset imagen preview
  const preview = document.getElementById('upload-resultado-preview');
  preview.innerHTML = '';
  preview.hidden = true;
  document.querySelector('#upload-resultado-zone .upload-zone__text').textContent = 'Arrastra aquí o haz clic para subir';
}

// ── Upload imagen resultado ───────────────────────────────────────────────────
function bindUploadResultado() {
  const zone      = document.getElementById('upload-resultado-zone');
  const fileInput = document.getElementById('upload-resultado-file');
  const urlInput  = document.getElementById('p-imagen');
  const preview   = document.getElementById('upload-resultado-preview');
  const zoneText  = zone.querySelector('.upload-zone__text');

  zone.addEventListener('click', function () { fileInput.click(); });

  zone.addEventListener('dragover', function (e) {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', function () {
    zone.classList.remove('drag-over');
  });
  zone.addEventListener('drop', function (e) {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleResultadoFile(file);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files[0]) handleResultadoFile(fileInput.files[0]);
  });

  async function handleResultadoFile(file) {
    zoneText.textContent = '⏳ Subiendo…';
    try {
      const url = await uploadResultado(file);
      urlInput.value = url;
      preview.innerHTML = '<img src="' + url + '" alt="Preview resultado">';
      preview.hidden    = false;
      zoneText.textContent = '✅ Imagen subida';
    } catch (err) {
      zoneText.textContent = '❌ Error al subir — revisa el preset de Cloudinary';
      console.error('[admin] uploadResultado:', err);
    }
  }
}

// ── Gestión de jugadores ──────────────────────────────────────────────────────
function renderJugadoresGrid() {
  const el = document.getElementById('jugadores-grid');
  if (!JUGADORES.length) {
    el.innerHTML = '<p class="empty">No se pudieron cargar los jugadores.</p>';
    return;
  }

  el.innerHTML = JUGADORES.map(function (j) {
    const cartaHtml = j.img
      ? '<img src="' + j.img + '" alt="' + j.nombre + '">'
      : '<div class="jugador-card__no-carta">Sin carta</div>';

    return '<div class="jugador-card" data-nombre="' + j.nombre + '">' +
      '<div class="jugador-card__carta">' +
        cartaHtml +
        '<button type="button" class="btn-upload-carta" data-nombre="' + j.nombre + '">📤 Subir carta</button>' +
        '<input type="file" class="file-carta" accept="image/png,image/webp,image/jpeg" hidden data-nombre="' + j.nombre + '">' +
      '</div>' +
      '<div class="jugador-card__fields">' +
        '<div class="jugador-card__nombre">' + j.bandera + ' ' + j.nombre + '</div>' +
        '<div class="jugador-card__inputs">' +
          '<label>Rating<input type="number" class="jf-rating" value="' + j.media + '" min="0" max="99"></label>' +
          '<label>Pos<input type="text" class="jf-pos" value="' + j.pos + '" maxlength="3"></label>' +
          '<label>Bandera<input type="text" class="jf-bandera" value="' + j.bandera + '" maxlength="8"></label>' +
        '</div>' +
        '<div class="jugador-card__actions">' +
          '<button type="button" class="btn-secondary save-jugador-btn" data-nombre="' + j.nombre + '">Guardar cambios</button>' +
          '<span class="jugador-save-status"></span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  bindJugadoresEvents(el);
}

function bindJugadoresEvents(grid) {
  // Upload carta buttons
  grid.querySelectorAll('.btn-upload-carta').forEach(function (btn) {
    btn.addEventListener('click', function () {
      grid.querySelector('.file-carta[data-nombre="' + btn.dataset.nombre + '"]').click();
    });
  });

  // File input change → upload a Cloudinary + update Sheets
  grid.querySelectorAll('.file-carta').forEach(function (input) {
    input.addEventListener('change', async function () {
      if (!input.files[0]) return;
      const nombre   = input.dataset.nombre;
      const card     = grid.querySelector('.jugador-card[data-nombre="' + nombre + '"]');
      const statusEl = card.querySelector('.jugador-save-status');

      statusEl.textContent = '📤 Subiendo carta…';
      statusEl.className   = 'jugador-save-status';

      try {
        const url = await uploadCarta(input.files[0]);

        // Actualizar preview
        const cartaContainer = card.querySelector('.jugador-card__carta');
        const imgEl = cartaContainer.querySelector('img');
        if (imgEl) {
          imgEl.src = url;
        } else {
          const noCartaEl = cartaContainer.querySelector('.jugador-card__no-carta');
          if (noCartaEl) noCartaEl.remove();
          cartaContainer.insertAdjacentHTML('afterbegin', '<img src="' + url + '" alt="' + nombre + '">');
        }

        // Guardar en Sheets
        await gasPost({ action: 'updateJugador', nombre, carta_url: url });
        statusEl.textContent = '✅ Carta actualizada';
        statusEl.className   = 'jugador-save-status status-ok';
      } catch (err) {
        statusEl.textContent = '❌ Error al subir: ' + err.message;
        statusEl.className   = 'jugador-save-status status-error';
        console.error('[admin] uploadCarta:', err);
      }
    });
  });

  // Guardar cambios (stats del jugador)
  grid.querySelectorAll('.save-jugador-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const nombre   = btn.dataset.nombre;
      const card     = grid.querySelector('.jugador-card[data-nombre="' + nombre + '"]');
      const statusEl = card.querySelector('.jugador-save-status');

      btn.disabled     = true;
      btn.textContent  = 'Guardando…';
      statusEl.textContent = '';

      try {
        await gasPost({
          action:  'updateJugador',
          nombre,
          rating:  parseInt(card.querySelector('.jf-rating').value)  || 0,
          pos:     card.querySelector('.jf-pos').value.trim(),
          bandera: card.querySelector('.jf-bandera').value.trim(),
        });
        statusEl.textContent = '✅ Guardado';
        statusEl.className   = 'jugador-save-status status-ok';
      } catch (err) {
        statusEl.textContent = '❌ Error: ' + err.message;
        statusEl.className   = 'jugador-save-status status-error';
      } finally {
        btn.disabled    = false;
        btn.textContent = 'Guardar cambios';
      }
    });
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
