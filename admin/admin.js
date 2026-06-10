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

  renderStatsTable();
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

// ── Amistoso toggle (oculta el número de jornada) ────────────────────────────
function bindAmistoso() {
  document.getElementById('p-amistoso').addEventListener('change', function () {
    const numField = document.getElementById('p-numero');
    numField.disabled = this.checked;
    if (this.checked) numField.value = '';
  });
}

// ── Stats table ───────────────────────────────────────────────────────────────
function renderStatsTable() {
  const el = document.getElementById('stats-table');
  if (!JUGADORES.length) {
    el.innerHTML = '<p class="empty">No se pudieron cargar los jugadores. Revisa la conexión con Sheets.</p>';
    return;
  }
  el.innerHTML = JUGADORES.map(function (j) {
    return '<div class="stats-row" data-nombre="' + j.nombre + '">' +
      '<div class="stats-row__name">' +
        '<span>' + j.bandera + '</span>' +
        '<strong>' + j.nombre + '</strong>' +
        '<span class="stats-row__pos">' + j.pos + '</span>' +
      '</div>' +
      '<div class="stats-row__inputs">' +
        '<label class="stats-input-label">' +
          '<span>⚽</span>' +
          '<input type="number" class="stats-input" name="goles" min="0" max="20" value="0">' +
        '</label>' +
        '<label class="stats-input-label">' +
          '<span>🅰️</span>' +
          '<input type="number" class="stats-input" name="asistencias" min="0" max="20" value="0">' +
        '</label>' +
      '</div>' +
    '</div>';
  }).join('');
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
      '<input type="radio" class="team-player__cap" name="cap-' + team + '" data-nombre="' + j.nombre + '" disabled title="Capitán ★">' +
    '</label>';
  }).join('');

  el.querySelectorAll('.team-player__check').forEach(function (chk) {
    chk.addEventListener('change', function () {
      const row = chk.closest('.team-player');
      const cap = row.querySelector('.team-player__cap');
      cap.disabled = !chk.checked;
      if (!chk.checked && cap.checked) cap.checked = false;
    });
  });
}

// Devuelve { jugadores: [...nombres], capitan: 'nombre' | '' }
function getTeamSelection(team) {
  const el = document.getElementById('team-' + team);
  const jugadores = [];
  let capitan = '';
  el.querySelectorAll('.team-player__check:checked').forEach(function (chk) {
    jugadores.push(chk.dataset.nombre);
  });
  const capInput = el.querySelector('.team-player__cap:checked');
  if (capInput) capitan = capInput.dataset.nombre;
  return { jugadores, capitan };
}

function resetTeamPlayers() {
  ['local', 'visitante'].forEach(function (team) {
    const el = document.getElementById('team-' + team);
    el.querySelectorAll('.team-player__check').forEach(function (chk) { chk.checked = false; });
    el.querySelectorAll('.team-player__cap').forEach(function (cap) { cap.checked = false; cap.disabled = true; });
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
      if (!localSel.capitan)              throw new Error('Marca el capitán del equipo local');
      if (!visitanteSel.capitan)          throw new Error('Marca el capitán del equipo visitante');

      // 1. Jornada
      setStatus(status, '📋 Guardando jornada…');
      await gasPost({
        action:           'addJornada',
        numero:           amistoso ? '' : (numero ? parseInt(numero) : ''),
        fecha,
        local,            goles_local,
        visitante,        goles_visitante,
        jugadores_local:     localSel.jugadores,
        capitan_local:       localSel.capitan,
        jugadores_visitante: visitanteSel.jugadores,
        capitan_visitante:   visitanteSel.capitan,
        mensaje,          video_url,
        imagen_url,
        amistoso:         amistoso ? 'TRUE' : 'FALSE',
      });

      // 2. Goles, asistencias y MVP — solo si NO es amistoso
      if (!amistoso) {
        const rows = document.querySelectorAll('#stats-table .stats-row');
        const golesData = [], asistenciasData = [];
        rows.forEach(function (row) {
          const nombre      = row.dataset.nombre;
          const goles       = parseInt(row.querySelector('[name="goles"]').value)       || 0;
          const asistencias = parseInt(row.querySelector('[name="asistencias"]').value) || 0;
          if (goles       > 0) golesData.push({ nombre, goles });
          if (asistencias > 0) asistenciasData.push({ nombre, asistencias });
        });

        if (golesData.length) {
          setStatus(status, '⚽ Guardando goles…');
          await gasPost({
            action: 'addGoles',
            goles: golesData.map(function (d) { return { nombre: d.nombre, cantidad: d.goles }; }),
          });
        }
        if (asistenciasData.length) {
          setStatus(status, '🅰️ Guardando asistencias…');
          await gasPost({
            action: 'addAsistencias',
            asistencias: asistenciasData.map(function (d) { return { nombre: d.nombre, cantidad: d.asistencias }; }),
          });
        }

        // 3. MVP
        if (mvp) {
          setStatus(status, '🏆 Guardando MVP…');
          await gasPost({ action: 'addMvp', nombre: mvp });
        }
      }

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
  // Reset stats inputs a 0 (reset nativo los pone a '' para number, así que lo forzamos)
  document.querySelectorAll('#stats-table .stats-input').forEach(function (inp) {
    inp.value = '0';
  });
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
          '<label>PJ<input type="number" class="jf-pj" value="' + j.stats.pj + '" min="0"></label>' +
          '<label>MVP<input type="number" class="jf-mvp" value="' + j.stats.mvp + '" min="0"></label>' +
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
          pj:      parseInt(card.querySelector('.jf-pj').value)       || 0,
          mvp:     parseInt(card.querySelector('.jf-mvp').value)      || 0,
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
