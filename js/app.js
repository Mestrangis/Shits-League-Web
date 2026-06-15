/* ═══════════════════════════════════════════════
   SHITS LEAGUE — app.js
═══════════════════════════════════════════════ */

let STATE = {
  jugadores:  [],
  jornadas:   [],
  activeTab:  'resumen',
};

/* ── Datos ───────────────────────────────────────────────────────────────── */
async function loadData() {
  // Todo desde Sheets en paralelo — cero archivos locales de datos
  const [jugadores, jornadas] = await Promise.all([
    fetchJugadores(),
    fetchJornadas(),
  ]);

  STATE.jornadas  = jornadas  || [];
  STATE.jugadores = calcularStats(jugadores || [], STATE.jornadas);
}

/* ── Normalización de nombres ────────────────────────────────────────────── */
// Minúsculas, sin tildes/diacríticos y sin espacios sobrantes
function normalizarNombre(str) {
  return (str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/* ── Cálculo de estadísticas ─────────────────────────────────────────────── */
// Jornadas es la única fuente de verdad. Recorremos todas las jornadas
// (incluyendo amistosos para el PJ) y derivamos las stats de cada jugador.
// jugadores no registrados (alias desconocido) se ignoran sin romper el cálculo.
function calcularStats(jugadores, jornadas) {
  const stats = {};
  const alias = {}; // nombre normalizado (propio o alias) → nombre canónico

  jugadores.forEach(j => {
    stats[j.nombre] = { pj: 0, victorias: 0, empates: 0, derrotas: 0, pts: 0, mvp: 0, goles: 0, asistencias: 0 };
    alias[normalizarNombre(j.nombre)] = j.nombre;
    (j.alias || []).forEach(a => { alias[normalizarNombre(a)] = j.nombre; });
  });

  function resolver(nombre) {
    return alias[normalizarNombre(nombre)] || null;
  }

  function aplicarResultado(nombres, capitan, resultado) {
    nombres.forEach(nombreRaw => {
      const nombre = resolver(nombreRaw);
      const s = nombre && stats[nombre];
      if (!s) return;
      const esCapitan = nombre === resolver(capitan);
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
    // PJ cuenta en cualquier jornada, incluidos amistosos
    [...j.jugadores_local, ...j.jugadores_visitante].forEach(nombreRaw => {
      const nombre = resolver(nombreRaw);
      if (nombre) stats[nombre].pj++;
    });

    if (j.amistoso) return; // el resto de stats solo cuenta en jornadas de liga

    const gl = j.goles_local, gv = j.goles_visitante;
    let resultLocal, resultVisitante;
    if (gl > gv)      { resultLocal = 'win';  resultVisitante = 'loss'; }
    else if (gl < gv) { resultLocal = 'loss'; resultVisitante = 'win';  }
    else              { resultLocal = 'draw'; resultVisitante = 'draw'; }

    aplicarResultado(j.jugadores_local,     j.capitan_local,     resultLocal);
    aplicarResultado(j.jugadores_visitante, j.capitan_visitante, resultVisitante);

    const mvp = resolver(j.mvp);
    if (mvp) stats[mvp].mvp++;

    j.goleadores.forEach(g => { const n = resolver(g.nombre); if (n) stats[n].goles += g.cantidad; });
    j.asistentes.forEach(a => { const n = resolver(a.nombre); if (n) stats[n].asistencias += a.cantidad; });
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
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    tab.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(tab.dataset.tab); }
    });
  });
}

function switchTab(name) {
  if (name === STATE.activeTab) return;
  STATE.activeTab = name;

  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === name)
  );
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `panel-${name}`)
  );

  renderTabIfNeeded(name);

  // scroll tab into view on mobile
  document.querySelector(`.tab[data-tab="${name}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function renderTabIfNeeded(name) {
  const panel = document.getElementById(`panel-${name}`);
  if (!panel || panel.dataset.rendered) return;

  switch (name) {
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
  if (e.key === 'Escape') { closeModal('modal'); closeModal('playerModal'); }
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

/* ── Init ────────────────────────────────────────────────────────────────── */
async function init() {
  initBubbles();
  initTabs();

  try {
    await loadData();
  } catch (e) {
    console.error('[app] Error cargando datos:', e);
  }

  initHero();
  renderTabIfNeeded('resumen');
}

document.addEventListener('DOMContentLoaded', init);
