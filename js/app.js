/* ═══════════════════════════════════════════════
   SHITS LEAGUE — app.js
═══════════════════════════════════════════════ */

let STATE = {
  jugadores:        [],
  jornadas:         [],
  activeTab:        'inicio',
  proximosPartidos: [],
  votaciones:       [],
  season:           '25-26',
  alias:            {}, // nombre normalizado (propio o alias) → nombre canónico
};

/* ── Datos ───────────────────────────────────────────────────────────────── */
async function loadData() {
  // Todo desde Sheets en paralelo — cero archivos locales de datos
  const [jugadores, jornadas, proximos, votaciones] = await Promise.all([
    fetchJugadores(),
    fetchJornadas(),
    fetchProximosPartidos(5),
    fetchVotaciones(),
  ]);

  STATE.jornadas         = jornadas  || [];
  STATE.alias            = construirAlias(jugadores || []);
  STATE.jugadores        = calcularStats(jugadores || [], STATE.jornadas);
  STATE.proximosPartidos = proximos || [];
  STATE.votaciones       = votaciones || [];
}

/* ── Normalización de nombres ────────────────────────────────────────────── */
// Minúsculas, sin tildes/diacríticos y sin espacios sobrantes
function normalizarNombre(str) {
  return (str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Mapa nombre normalizado (propio o alias) → nombre canónico
function construirAlias(jugadores) {
  const alias = {};
  jugadores.forEach(j => {
    alias[normalizarNombre(j.nombre)] = j.nombre;
    (j.alias || []).forEach(a => { alias[normalizarNombre(a)] = j.nombre; });
  });
  return alias;
}

// Nombre canónico o null si no corresponde a ningún jugador registrado
function resolverNombre(nombre) {
  return STATE.alias[normalizarNombre(nombre)] || null;
}

// Para mostrar: nombre canónico si se conoce, si no el original de la hoja
function nombreCanonico(nombre) {
  return resolverNombre(nombre) || nombre;
}

/* ── Cálculo de estadísticas ─────────────────────────────────────────────── */
// Jornadas es la única fuente de verdad. Recorremos las jornadas de liga
// (los amistosos no cuentan para ninguna stat, tampoco PJ) y derivamos
// las stats de cada jugador.
// jugadores no registrados (alias desconocido) se ignoran sin romper el cálculo.
function calcularStats(jugadores, jornadas) {
  const stats = {};
  jugadores.forEach(j => {
    stats[j.nombre] = { pj: 0, victorias: 0, empates: 0, derrotas: 0, pts: 0, mvp: 0, goles: 0, asistencias: 0 };
  });

  function aplicarResultado(nombres, capitan, resultado) {
    nombres.forEach(nombreRaw => {
      const nombre = resolverNombre(nombreRaw);
      const s = nombre && stats[nombre];
      if (!s) return;
      const esCapitan = nombre === resolverNombre(capitan);
      if (resultado === 'win') {
        s.victorias++;
        s.pts += esCapitan ? 7 : 3;
      } else if (resultado === 'draw') {
        s.empates++;
        s.pts += esCapitan ? 4 : 1;
      } else {
        s.derrotas++;
        s.pts += esCapitan ? 2 : 0;
      }
    });
  }

  jornadas.forEach(j => {
    if (j.amistoso) return; // PJ y el resto de stats solo cuentan en jornadas de liga

    [...j.jugadores_local, ...j.jugadores_visitante].forEach(nombreRaw => {
      const nombre = resolverNombre(nombreRaw);
      if (nombre) stats[nombre].pj++;
    });

    const gl = j.goles_local, gv = j.goles_visitante;
    let resultLocal, resultVisitante;
    if (gl > gv)      { resultLocal = 'win';  resultVisitante = 'loss'; }
    else if (gl < gv) { resultLocal = 'loss'; resultVisitante = 'win';  }
    else              { resultLocal = 'draw'; resultVisitante = 'draw'; }

    aplicarResultado(j.jugadores_local,     j.capitan_local,     resultLocal);
    aplicarResultado(j.jugadores_visitante, j.capitan_visitante, resultVisitante);

    const mvp = resolverNombre(j.mvp);
    if (mvp) stats[mvp].mvp++;

    j.goleadores.forEach(g => { const n = resolverNombre(g.nombre); if (n) stats[n].goles += g.cantidad; });
    j.asistentes.forEach(a => { const n = resolverNombre(a.nombre); if (n) stats[n].asistencias += a.cantidad; });
  });

  return jugadores.map(j => ({ ...j, stats: stats[j.nombre] }));
}

/* ── Hero section (siempre visible) ─────────────────────────────────────── */
function initHero() {
  const el = document.getElementById('hero-section');
  if (!el) return;
  el.innerHTML = renderHeroSection(STATE.jugadores, STATE.jornadas);
}

/* ── Tabs ────────────────────────────────────────────────────────────────── */
const TABS = ['inicio', 'votacion', 'resumen', 'clasificacion', 'goleadores', 'asistentes', 'plantilla'];

// '#votacion' → 'votacion'; null si el hash no es una pestaña.
// Permite que las notificaciones enlacen a una pestaña concreta.
function tabDesdeHash() {
  const name = decodeURIComponent(location.hash.slice(1)).toLowerCase();
  return TABS.includes(name) ? name : null;
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    tab.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(tab.dataset.tab); }
    });
  });
}

// desde: 'derecha' | 'izquierda' → la pestaña entra deslizándose desde ese lado
// (solo cuando el cambio viene de un swipe; con click no hay animación)
function switchTab(name, { desde } = {}) {
  if (name === STATE.activeTab) return;
  const saliente = document.getElementById(`panel-${STATE.activeTab}`);
  STATE.activeTab = name;

  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === name)
  );
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `panel-${name}`)
  );

  renderTabIfNeeded(name);
  if (desde) deslizarPaneles(saliente, document.getElementById(`panel-${name}`), desde);
  history.replaceState(null, '', `#${name}`);

  // scroll tab into view on mobile
  document.querySelector(`.tab[data-tab="${name}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

/* ── Swipe entre pestañas (solo pantallas táctiles) ──────────────────────── */
const SWIPE_TAB_UMBRAL  = 60; // px horizontales mínimos
// Zonas donde el gesto horizontal ya tiene otro dueño (cards de votación,
// nav con scroll horizontal, modales, embeds) o es para escribir
const SWIPE_TAB_EXCLUIR = '.voto, .tabs, .topbar, .modal, iframe, input, textarea';

// Touch events y no pointer events: en cuanto el navegador empieza a hacer
// scroll manda pointercancel y no llegaría el pointerup. Pasivos: no bloquean el scroll.
function initSwipeTabs() {
  if (!window.matchMedia('(pointer: coarse)').matches) return;

  let x0 = 0, y0 = 0, activo = false;

  document.addEventListener('touchstart', e => {
    activo = e.touches.length === 1
      && STATE.season === '25-26'             // en temporadas archivadas no hay pestañas
      && !e.target.closest(SWIPE_TAB_EXCLUIR);
    if (!activo) return;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) activo = false; // zoom con dos dedos
  }, { passive: true });

  document.addEventListener('touchcancel', () => { activo = false; }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!activo) return;
    activo = false;
    const t  = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) <= SWIPE_TAB_UMBRAL || Math.abs(dx) <= Math.abs(dy)) return;

    // Dedo hacia la izquierda → siguiente pestaña, que entra por la derecha
    const i = TABS.indexOf(STATE.activeTab) + (dx < 0 ? 1 : -1);
    if (i < 0 || i >= TABS.length) return;
    switchTab(TABS[i], { desde: dx < 0 ? 'derecha' : 'izquierda' });
  }, { passive: true });
}

let terminarDeslizamiento = null;

// La saliente se queda superpuesta (position absolute) y se va hacia un lado
// mientras la entrante llega desde el contrario. Al acabar se limpian los
// transforms para no interferir con el scroll de la pestaña.
function deslizarPaneles(saliente, entrante, desde) {
  terminarDeslizamiento?.(); // si había otro deslizamiento a medias, se cierra ya

  const signo = desde === 'derecha' ? 1 : -1;
  saliente.classList.add('tab-panel--saliendo');
  entrante.style.transform = `translateX(${signo * 100}%)`;
  entrante.getBoundingClientRect(); // fija el punto de partida antes de animar

  saliente.classList.add('tab-panel--deslizando');
  entrante.classList.add('tab-panel--deslizando');
  saliente.style.transform = `translateX(${-signo * 100}%)`;
  entrante.style.transform = '';

  function limpiar() {
    clearTimeout(timer);
    entrante.removeEventListener('transitionend', alTerminar);
    saliente.classList.remove('tab-panel--saliendo', 'tab-panel--deslizando');
    entrante.classList.remove('tab-panel--deslizando');
    saliente.style.transform = '';
    entrante.style.transform = '';
    terminarDeslizamiento = null;
  }
  function alTerminar(e) {
    if (e.target === entrante && e.propertyName === 'transform') limpiar();
  }

  entrante.addEventListener('transitionend', alTerminar);
  const timer = setTimeout(limpiar, 450); // por si transitionend no llega
  terminarDeslizamiento = limpiar;
}

function renderTabIfNeeded(name) {
  const panel = document.getElementById(`panel-${name}`);
  if (!panel || panel.dataset.rendered) return;

  switch (name) {
    case 'inicio':
      panel.innerHTML = renderInicio(STATE.proximosPartidos);
      break;
    case 'votacion':
      panel.innerHTML = renderVotacion(STATE.votaciones, getSessionPlayer());
      break;
    case 'resumen':
      panel.innerHTML = renderResumen(STATE.jugadores, STATE.jornadas);
      break;
    case 'clasificacion':
      panel.innerHTML = renderClasificacion(STATE.jugadores);
      break;
    case 'goleadores':
      panel.innerHTML = renderGoleadores(STATE.jugadores);
      break;
    case 'asistentes':
      panel.innerHTML = renderAsistentes(STATE.jugadores);
      break;
    case 'plantilla':
      panel.innerHTML = renderPlantilla(STATE.jugadores);
      break;
  }

  panel.dataset.rendered = '1';
  bindPanel(panel, name);
}

/* ── Eventos de panel ────────────────────────────────────────────────────── */
function bindPanel(panel, name) {
  if (name === 'inicio') {
    startCountdown(STATE.proximosPartidos[0]?.fecha);
  }
  if (name === 'votacion') {
    predecodificarImagenes(panel);
    if (!panel.dataset.bound) {
      // Delegación: el panel se re-renderiza al cambiar la sesión, los listeners se quedan
      bindVotacion(panel);
      panel.dataset.bound = '1';
    }
  }
  if (name === 'resumen') {
    panel.querySelectorAll('.result-row').forEach(row => {
      const fn = () => openModalPartido(row.dataset.jornada, row.dataset.fecha);
      row.addEventListener('click', fn);
      row.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' '){e.preventDefault();fn();} });
    });
  }
  if (name === 'plantilla') {
    panel.querySelectorAll('.card-wrap').forEach(card => {
      const fn = () => openModalJugador(card.dataset.nombre);
      card.addEventListener('click', fn);
      card.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' '){e.preventDefault();fn();} });
    });
  }
}

/* ── Cuenta atrás (pestaña Inicio) ───────────────────────────────────────── */
function startCountdown(fechaIso) {
  const el = document.getElementById('countdown');
  if (!el || !fechaIso) return;

  const target = new Date(fechaIso).getTime();
  if (isNaN(target)) return;

  let timer = null;
  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      el.innerHTML = `<span class="countdown__unit"><span class="countdown__num">¡Ya!</span></span>`;
      if (timer) clearInterval(timer);
      return;
    }
    const dias  = Math.floor(diff / 86400000);
    const horas = Math.floor((diff % 86400000) / 3600000);
    const mins  = Math.floor((diff % 3600000) / 60000);
    const segs  = Math.floor((diff % 60000) / 1000);
    el.innerHTML = `
      <span class="countdown__unit"><span class="countdown__num">${dias}</span><span class="countdown__lbl">días</span></span>
      <span class="countdown__unit"><span class="countdown__num">${horas}</span><span class="countdown__lbl">horas</span></span>
      <span class="countdown__unit"><span class="countdown__num">${mins}</span><span class="countdown__lbl">min</span></span>
      <span class="countdown__unit"><span class="countdown__num">${segs}</span><span class="countdown__lbl">seg</span></span>
    `;
  }

  tick();
  timer = setInterval(tick, 1000);
}

/* ── Modal partido ───────────────────────────────────────────────────────── */
function openModalPartido(jornadaKey, fecha) {
  const j = jornadaKey === 'ami'
    ? STATE.jornadas.find(x => x.amistoso && x.fecha === fecha)
    : STATE.jornadas.find(x => String(x.numero) === String(jornadaKey));
  if (!j) return;
  document.getElementById('modalBox').innerHTML = buildModalPartido(j);
  openModal('modal');
}

/* ── Modal jugador ───────────────────────────────────────────────────────── */
function openModalJugador(nombre) {
  const j = STATE.jugadores.find(x => x.nombre === nombre);
  if (!j) return;
  document.getElementById('playerModalBox').innerHTML = buildModalJugador(j);
  openModal('playerModal');
}

/* ── Modal helpers ───────────────────────────────────────────────────────── */
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
  m.querySelector('.modal__backdrop')?.addEventListener('click', () => closeModal(id), { once: true });
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(m => closeModal(m.id));
});

/* ── Burbujas ────────────────────────────────────────────────────────────── */
function initBubbles() {
  const container = document.getElementById('bubbles');
  if (!container) return;
  [
    { size:90,  top:'8%',  left:'6%',   op:.12, blur:2, dur:9,  delay:0   },
    { size:54,  top:'22%', right:'9%',  op:.16, blur:0, dur:7,  delay:.8  },
    { size:34,  top:'48%', left:'3%',   op:.18, blur:0, dur:11, delay:.4  },
    { size:120, top:'64%', right:'5%',  op:.08, blur:4, dur:13, delay:1.2 },
    { size:46,  top:'80%', left:'14%',  op:.12, blur:0, dur:8,  delay:.2  },
  ].forEach(({ size, top, left, right, op, blur, dur, delay }) => {
    const el = document.createElement('span');
    el.className = 'bubble';
    el.style.cssText = [
      `width:${size}px`, `height:${size}px`, `top:${top}`,
      left  ? `left:${left}`   : `right:${right}`,
      `opacity:${op}`,
      blur  ? `filter:blur(${blur}px)` : '',
      `animation-duration:${dur}s`,
      `animation-delay:${delay}s`,
    ].filter(Boolean).join(';');
    container.appendChild(el);
  });
}

/* ── Selector de temporada ───────────────────────────────────────────────── */
const ARCHIVE_SEASONS = {
  '23-24': {
    label: 'TEMPORADA 23/24',
    images: [
      { src: 'assets/clasificación23-24.png', alt: 'Clasificación 23-24' },
      { src: 'assets/goles23-24.png',             alt: 'Goleadores 23-24' },
      { src: 'assets/Draft 2024.jpg',             alt: 'Draft 2024' },
    ],
  },
};

function initSeasonSelector() {
  const toggle = document.getElementById('seasonToggle');
  const dropdown = document.getElementById('seasonDropdown');
  if (!toggle || !dropdown) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => dropdown.classList.remove('open'));

  dropdown.querySelectorAll('.season-dropdown__item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('open');
      switchSeason(btn.dataset.season);
    });
  });
}

function switchSeason(season) {
  if (season === STATE.season) return;
  STATE.season = season;

  const label = document.getElementById('seasonLabel');
  const tabs = document.getElementById('tabs');
  const main = document.querySelector('.main');
  const hero = document.getElementById('hero-section');
  const archiveEl = document.getElementById('archiveSeason');
  const dropdown = document.getElementById('seasonDropdown');

  dropdown.querySelectorAll('.season-dropdown__item').forEach(b =>
    b.classList.toggle('active', b.dataset.season === season)
  );

  const archive = ARCHIVE_SEASONS[season];

  if (archive) {
    label.textContent = archive.label;
    tabs.style.display = 'none';
    hero.style.display = 'none';
    main.style.display = 'none';
    archiveEl.hidden = false;
    archiveEl.innerHTML = `
      <div class="sh">
        <span class="sh__title">${archive.label}</span>
        <span class="sh__line"></span>
      </div>
      <div class="archive-season__images">
        ${archive.images.map(img => `
          <div class="archive-season__img-wrap">
            <img src="${img.src}" alt="${img.alt}" loading="lazy">
          </div>
        `).join('')}
      </div>
    `;
  } else {
    label.textContent = 'TEMPORADA 25/26';
    tabs.style.display = '';
    hero.style.display = '';
    main.style.display = '';
    archiveEl.hidden = true;
    archiveEl.innerHTML = '';
  }
}

/* ── Init ────────────────────────────────────────────────────────────────── */
async function init() {
  initBubbles();
  initTabs();
  initSeasonSelector();
  initSession();
  initSwipeTabs();

  try {
    await loadData();
  } catch (e) {
    console.error('[app] Error cargando datos:', e);
  }

  initHero();
  renderTabIfNeeded('inicio');
  const tabInicial = tabDesdeHash();
  if (tabInicial) {
    switchTab(tabInicial);
    // Si se entra con hash (p. ej. desde una notificación), saltamos el hero
    document.querySelector('.main').scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  window.addEventListener('hashchange', () => {
    const tab = tabDesdeHash();
    if (tab) switchTab(tab);
  });
  initPush();
}

/* ── Cambio de sesión (login / logout) ───────────────────────────────────── */
// Lo llama session.js; re-renderiza lo que depende del jugador logueado
function onSessionChange() {
  const panel = document.getElementById('panel-votacion');
  if (panel?.dataset.rendered) {
    panel.dataset.rendered = '';
    renderTabIfNeeded('votacion');
  }
}

document.addEventListener('DOMContentLoaded', init);
