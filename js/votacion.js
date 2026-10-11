/* ═══════════════════════════════════════════════
   SHITS LEAGUE — votacion.js
   Pestaña Votación: una card estilo Tinder por fecha propuesta.
   Swipe → (puedo) / ← (no puedo), o botones ✓ / ✗.
   Ver se puede sin sesión; votar requiere sesión (session.js).
═══════════════════════════════════════════════ */

const DIAS_SEMANA   = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
const SWIPE_UMBRAL  = 90; // px de arrastre horizontal para que cuente como voto

/* ── Helpers ─────────────────────────────────────────────────────────────── */
// Acepta 'YYYY-MM-DD' y 'DD/MM/YYYY' (formato con el que Sheets devuelve fechas en es-ES)
function parseFechaVoto(str) {
  let m = (str || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], m[2] - 1, +m[3]);
  m = (str || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], m[2] - 1, +m[1]);
  return null;
}

// 'si' | 'no' | null
function votoDe(v, nombre) {
  if (!nombre) return null;
  const n = normalizarNombre(nombre);
  if (v.jugadores_si.some(x => normalizarNombre(x) === n)) return 'si';
  if (v.jugadores_no.some(x => normalizarNombre(x) === n)) return 'no';
  return null;
}

function aplicarVoto(v, nombre, voto) {
  const n = normalizarNombre(nombre);
  v.jugadores_si = v.jugadores_si.filter(x => normalizarNombre(x) !== n);
  v.jugadores_no = v.jugadores_no.filter(x => normalizarNombre(x) !== n);
  (voto === 'si' ? v.jugadores_si : v.jugadores_no).push(nombre);
}

/* ── Render ──────────────────────────────────────────────────────────────── */
function renderVotacion(votaciones, jugador) {
  const lista = votaciones.slice().sort((a, b) =>
    (parseFechaVoto(a.fecha) || 0) - (parseFechaVoto(b.fecha) || 0)
  );

  const aviso = jugador
    ? `<p class="votacion-hint">Desliza la card → si puedes o ← si no puedes. También puedes usar los botones.</p>`
    : `<div class="votacion-login">
         <span>Inicia sesión para votar. Mientras tanto puedes ver cómo va la votación.</span>
         <button class="votacion-login__btn" type="button">INICIAR SESIÓN</button>
       </div>`;

  const cards = lista.length
    ? `<div class="votos-grid">${lista.map(v => `
        <article class="voto" data-id="${v.id}">${renderVotoInner(v, jugador)}</article>
      `).join('')}</div>`
    : `<div class="empty">No hay votaciones abiertas</div>`;

  return `
    <div class="sh">
      <span class="sh__title">VOTACIÓN</span>
      <span class="sh__line"></span>
      <span class="sh__sub">¿CUÁNDO JUGAMOS?</span>
    </div>
    ${aviso}
    ${cards}
  `;
}

function renderVotoInner(v, jugador) {
  const fecha = parseFechaVoto(v.fecha);
  const dia   = fecha ? DIAS_SEMANA[fecha.getDay()] : '';
  const fechaTxt = fecha
    ? `${fecha.getDate()} ${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`
    : v.fecha;
  const hora  = v.hora ? v.hora.slice(0, 5) : '';
  const voto  = votoDe(v, jugador);

  // Si la imagen no carga se quita y queda el fondo de la paleta
  const bg = v.imagen
    ? `<img class="voto-card__bg" src="${v.imagen}" alt="" draggable="false"
         onerror="this.parentNode.classList.remove('voto-card--img');this.remove()">`
    : '';
  const cardClass = [
    'voto-card',
    v.imagen ? 'voto-card--img' : '',
    voto ? `voto-card--${voto}` : '',
    jugador ? 'voto-card--swipe' : '',
  ].filter(Boolean).join(' ');

  const botones = jugador ? `
    <div class="voto__actions">
      <button class="voto-btn voto-btn--no" data-voto="no" type="button"
        aria-pressed="${voto === 'no'}" aria-label="No puedo">✗</button>
      <button class="voto-btn voto-btn--si" data-voto="si" type="button"
        aria-pressed="${voto === 'si'}" aria-label="Puedo">✓</button>
    </div>` : '';

  const nombres = arr => arr.length
    ? arr.map(n => `<span class="voto__nombre">${n}</span>`).join('')
    : '<span class="voto__nadie">Nadie todavía</span>';

  return `
    <div class="${cardClass}">
      ${bg}
      <span class="voto-card__stamp voto-card__stamp--si" aria-hidden="true">✓</span>
      <span class="voto-card__stamp voto-card__stamp--no" aria-hidden="true">✗</span>
      <div class="voto-card__lugar">${v.lugar || 'Lugar por decidir'}</div>
      <div class="voto-card__dia">${dia}</div>
      <div class="voto-card__fecha">${fechaTxt}${hora ? ` · ${hora}` : ''}</div>
    </div>
    ${botones}
    <div class="voto__resumen">
      <div class="voto__fila voto__fila--si">
        <span class="voto__count">✓ ${v.jugadores_si.length}</span>
        <div class="voto__nombres">${nombres(v.jugadores_si)}</div>
      </div>
      <div class="voto__fila voto__fila--no">
        <span class="voto__count">✗ ${v.jugadores_no.length}</span>
        <div class="voto__nombres">${nombres(v.jugadores_no)}</div>
      </div>
    </div>
  `;
}

function refrescarVoto(v) {
  const article = document.querySelector(`.voto[data-id="${CSS.escape(v.id)}"]`);
  if (article) article.innerHTML = renderVotoInner(v, getSessionPlayer());
}

/* ── Votar (optimista) ───────────────────────────────────────────────────── */
async function votar(id, voto) {
  const nombre = getSessionPlayer();
  const v = STATE.votaciones.find(x => x.id === id);
  if (!nombre || !v || votoDe(v, nombre) === voto) return;

  const antes = { si: [...v.jugadores_si], no: [...v.jugadores_no] };
  aplicarVoto(v, nombre, voto);
  refrescarVoto(v);

  try {
    await postVoto(id, nombre, voto);
  } catch (e) {
    // Solo falla si la petición ni siquiera salió (sin conexión): deshacemos
    console.warn('[votacion] No se pudo enviar el voto:', e);
    v.jugadores_si = antes.si;
    v.jugadores_no = antes.no;
    refrescarVoto(v);
  }
}

/* ── Eventos (delegados en el panel) ─────────────────────────────────────── */
function bindVotacion(panel) {
  panel.addEventListener('click', e => {
    const btn = e.target.closest('.voto-btn');
    if (btn) { votar(btn.closest('.voto').dataset.id, btn.dataset.voto); return; }
    if (e.target.closest('.votacion-login__btn')) openSessionModal();
  });
  panel.addEventListener('pointerdown', iniciarSwipe);
}

function iniciarSwipe(e) {
  const card = e.target.closest('.voto-card--swipe');
  if (!card || e.button > 0) return;

  const id = card.closest('.voto').dataset.id;
  const x0 = e.clientX, y0 = e.clientY;
  let dx = 0, arrastrando = false;

  function mover(ev) {
    dx = ev.clientX - x0;
    if (!arrastrando) {
      // Hasta que el gesto no sea claramente horizontal, dejamos hacer scroll
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(ev.clientY - y0)) return;
      arrastrando = true;
      card.classList.add('is-dragging');
      try { card.setPointerCapture(ev.pointerId); } catch { /* puntero ya liberado */ }
    }
    const p = Math.max(-1, Math.min(1, dx / SWIPE_UMBRAL));
    card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    card.style.setProperty('--drag-si', Math.max(0, p));
    card.style.setProperty('--drag-no', Math.max(0, -p));
  }

  function soltar() {
    card.removeEventListener('pointermove', mover);
    card.removeEventListener('pointerup', soltar);
    card.removeEventListener('pointercancel', soltar);
    if (!arrastrando) return;

    card.classList.remove('is-dragging');
    card.style.transform = '';
    card.style.removeProperty('--drag-si');
    card.style.removeProperty('--drag-no');
    if (Math.abs(dx) >= SWIPE_UMBRAL) votar(id, dx > 0 ? 'si' : 'no');
  }

  card.addEventListener('pointermove', mover);
  card.addEventListener('pointerup', soltar);
  card.addEventListener('pointercancel', soltar);
}
