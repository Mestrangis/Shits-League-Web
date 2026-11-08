/* ═══════════════════════════════════════════════
   SHITS LEAGUE — app.js
═══════════════════════════════════════════════ */

let STATE = {
  jugadores:        [],
  jornadas:         [],
  activeTab:        'inicio',
  proximosPartidos: [],
  votaciones:       [],
  mvps:             null, // filas de la hoja MVPs; null: aún no se han podido leer
  season:           temporadaEnCursoId,
  alias:            {}, // nombre normalizado (propio o alias) → nombre canónico
  jugadoresBase:    [], // jugadores tal cual vienen de la hoja (sin stats)
  ultimaCarga:      0,  // Date.now() de la última carga correcta de Jugadores + Jornadas
};

/* ── Datos ───────────────────────────────────────────────────────────────── */
// La última respuesta de Sheets, guardada en el navegador: al arrancar se pinta con ella al
// momento y lo fresco llega detrás (antes, nada se veía hasta que respondía Sheets)
// Una por temporada: nada se mezcla. La 24/26 conserva la clave de cuando era la única.
const claveDatos = () => (STATE.season === '24-26' ? 'SL_DATOS' : `SL_DATOS_${STATE.season}`);
function guardarDatos() {
  try {
    localStorage.setItem(claveDatos(), JSON.stringify({
      t: Date.now(), jugadores: STATE.jugadoresBase, jornadas: STATE.jornadas,
      proximos: STATE.proximosPartidos, votaciones: STATE.votaciones, mvps: STATE.mvps,
    }));
  } catch { /* sin espacio o sin almacenamiento: la próxima vez, por la red */ }
}
function restaurarDatos() {
  try {
    const d = JSON.parse(localStorage.getItem(claveDatos()) || 'null');
    if (!d?.jugadores?.length || !d?.jornadas) return false;
    STATE.jugadoresBase = d.jugadores;
    STATE.jornadas = d.jornadas;
    STATE.alias = construirAlias(STATE.jugadoresBase);
    STATE.mvps = d.mvps ?? null;
    STATE.jugadores = calcularStats(STATE.jugadoresBase, STATE.jornadas);
    STATE.proximosPartidos = d.proximos ?? [];
    STATE.votaciones = d.votaciones ?? [];
    return true;
  } catch { return false; }
}

async function loadData() {
  const temporada = STATE.season;
  const archivo = modoTemporada(temporadaPorId(temporada)) === 'archivo';
  mvpLeyendo++;
  // Todo desde Sheets en paralelo — cero archivos locales de datos.
  // El archivo no tiene Inicio ni Partidos: ni próximos partidos ni votaciones
  const [jugadores, jornadas, proximos, votaciones, mvps] = await Promise.all([
    fetchJugadores(),
    fetchJornadas(),
    archivo ? [] : fetchProximosPartidos(5),
    archivo ? [] : fetchVotaciones(),
    leerMVPs(),
  ]);
  // Se ha cambiado de temporada mientras tanto: esto era de la otra
  if (temporada !== STATE.season) return;

  // Si una lectura falla (null) se conservan los datos que ya había: un
  // refresco sin conexión no debe dejar la web vacía
  if (jornadas)  STATE.jornadas      = jornadas;
  if (jugadores) STATE.jugadoresBase = jugadores;
  STATE.alias     = construirAlias(STATE.jugadoresBase);
  mvpLeyendo--;
  if (mvps) STATE.mvps = mvps;
  STATE.jugadores = calcularStats(STATE.jugadoresBase, STATE.jornadas);
  if (proximos)  STATE.proximosPartidos = proximos;
  // No pisar un voto optimista que el Apps Script quizá aún no ha escrito
  if (votaciones && Date.now() - ultimoVotoEnviado > VOTO_PENDIENTE_MS) STATE.votaciones = votaciones;
  if (jugadores && jornadas) { STATE.ultimaCarga = Date.now(); guardarDatos(); }
}

/* ── Recarga y refresco automático ───────────────────────────────────────── */
const VOTACIONES_REFRESCO_MS = 30000;          // votación abierta y visible
const DATOS_CADUCAN_MS       = 5 * 60000;      // resto de pestañas con stats
const TABS_CON_CADUCIDAD     = ['resumen', 'clasificacion', 'goleadores', 'asistentes'];

let recargaEnCurso = null;
let timerVotaciones = null;

// Vuelve a leer todo y re-renderiza el hero y la pestaña activa; el resto de
// pestañas se re-renderizan al visitarlas
function recargarDatos() {
  if (recargaEnCurso) return recargaEnCurso;
  const temporada = STATE.season;
  const recarga = (async () => {
    try {
      await loadData();
      if (temporada !== STATE.season) return;
      aplicarOrdenTabs();
      initHero();
      document.querySelectorAll('.tab-panel:not(#panel-rush)').forEach(p => { p.dataset.rendered = ''; });
      renderTabIfNeeded(STATE.activeTab);
      prepararVecinas();
    } catch (e) {
      console.warn('[app] No se pudieron recargar los datos:', e);
    } finally {
      if (recargaEnCurso === recarga) recargaEnCurso = null;
    }
  })();
  return (recargaEnCurso = recarga);
}

function recargarSiCaducado() {
  if (TABS_CON_CADUCIDAD.includes(STATE.activeTab)
      && Date.now() - STATE.ultimaCarga > DATOS_CADUCAN_MS) recargarDatos();
}

function rerenderPanel(name) {
  const panel = document.getElementById(`panel-${name}`);
  if (!panel?.dataset.rendered) return;
  panel.dataset.rendered = '';
  renderTabIfNeeded(name);
}

// No pisa un arrastre en curso ni un voto recién enviado; solo re-renderiza si
// algo ha cambiado (evita recargar las imágenes cada 30 s)
async function refrescarVotaciones() {
  const ocupado = () => document.querySelector('.voto-card.is-dragging')
    || Date.now() - ultimoVotoEnviado < VOTO_PENDIENTE_MS;
  if (ocupado()) return;
  const temporada = STATE.season;
  const nuevas = await fetchVotaciones();
  if (!nuevas || ocupado() || temporada !== STATE.season) return;
  if (JSON.stringify(nuevas) === JSON.stringify(STATE.votaciones)) return;
  STATE.votaciones = nuevas;
  aplicarOrdenTabs();
  rerenderPanel('votacion');
}

// Intervalo de 30 s solo con la pestaña Votación o MVP activa y la página visible
function actualizarRefrescoVotaciones() {
  const toca = (STATE.activeTab === 'votacion' || STATE.activeTab === 'mvp')
    && document.visibilityState === 'visible';
  if (toca && !timerVotaciones) {
    timerVotaciones = setInterval(() => (STATE.activeTab === 'mvp' ? refrescarMVPs() : refrescarVotaciones()), VOTACIONES_REFRESCO_MS);
  } else if (!toca && timerVotaciones) {
    clearInterval(timerVotaciones);
    timerVotaciones = null;
  }
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

  const p = puntuacionVista();
  function aplicarResultado(nombres, capitan, resultado) {
    nombres.forEach(nombreRaw => {
      const nombre = resolverNombre(nombreRaw);
      const s = nombre && stats[nombre];
      if (!s) return;
      const esCapitan = nombre === resolverNombre(capitan);
      if (resultado === 'win') {
        s.victorias++;
        if (p) s.pts += esCapitan ? p.capitanVictoria : p.victoria;
      } else if (resultado === 'draw') {
        s.empates++;
        if (p) s.pts += esCapitan ? p.capitanEmpate : p.empate;
      } else {
        s.derrotas++;
        if (p) s.pts += esCapitan ? p.capitanDerrota : p.derrota;
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

    const mvp = nombreMVP(j);
    if (stats[mvp]) stats[mvp].mvp++;

    j.goleadores.forEach(g => { const n = resolverNombre(g.nombre); if (n) stats[n].goles += g.cantidad; });
    j.asistentes.forEach(a => { const n = resolverNombre(a.nombre); if (n) stats[n].asistencias += a.cantidad; });
  });

  return jugadores.map(j => ({ ...j, stats: stats[j.nombre] }));
}

/* ── Hero section (siempre visible) ─────────────────────────────────────── */
function initHero() {
  const el = document.getElementById('hero-section');
  if (!el) return;
  // Un arrastre en «Pendientes» no se corta: lo nuevo se pinta con el siguiente refresco
  if (el.querySelector('.voto-card.is-dragging')) return;
  el.innerHTML = renderHeroSection(STATE.jornadas);
  pintarAvisoApp();
  pendientesPila = pendientesMvp = null;
  actualizarPendientes();
}

// Bloques de Inicio que llevan a otra parte, con el mismo aspecto: abren su pestaña o el partido
function initBloquesInicio() {
  const activar = el => {
    if (el.dataset.abrirMvp) {
      closeModal('modal');
      abrirMVP(el.dataset.abrirMvp);
    } else if (el.dataset.abrirPartido) {
      openModalPartido(el.dataset.abrirPartido, el.dataset.fecha);
    } else if (el.dataset.ir) {
      switchTab(el.dataset.ir);
    }
  };
  const SELECTOR = '[data-abrir-mvp], [data-abrir-partido], [data-ir]';
  document.addEventListener('click', e => {
    const el = e.target.closest(SELECTOR);
    if (el) activar(el);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.matches?.(SELECTOR) && e.target.tagName !== 'BUTTON') { e.preventDefault(); activar(e.target); }
  });
}

// Aviso breve abajo de la pantalla
let avisoTimer = 0;
function avisoApp(texto, tipo = 'error') {
  let el = document.getElementById('avisoApp');
  if (!el) {
    el = document.createElement('div');
    el.id = 'avisoApp';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = texto;
  el.className = `aviso-app aviso-app--${tipo} visible`;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.remove('visible'), 4000);
}

/* ── Tabs ────────────────────────────────────────────────────────────────── */
// Los enlaces de las notificaciones a algo concreto: #partido=AAAA-MM-DD y #mvp=AAAA-MM-DD.
// Se quitan al abrirse, y si los datos aún no están, se vuelve a mirar cuando lleguen.
function abrirEnlaceDeHash() {
  const m = location.hash.match(/^#(partido|mvp)=(\d{4}-\d{2}-\d{2})$/);
  if (!m) return;
  const j = STATE.jornadas.find(x => x.fecha === m[2]);
  if (!j) return;
  history.replaceState(history.state, '', location.pathname + location.search);
  if (m[1] === 'mvp') abrirMVP(m[2]);
  else openModalPartido(j.amistoso ? 'ami' : 'oficial', m[2]);
}

// '#votacion' → 'votacion'; null si el hash no es una pestaña.
// Permite que las notificaciones enlacen a una pestaña concreta.
function tabDesdeHash() {
  const name = decodeURIComponent(location.hash.slice(1)).toLowerCase();
  return tabsVisibles().includes(name) ? name : null;
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    tab.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(tab.dataset.tab); }
    });
  });
}

// animar: se desliza hasta la página nueva (paginas.js); desdeX: dónde la ha dejado el dedo
function switchTab(name, { animar = true, desdeX = 0 } = {}) {
  if (name === STATE.activeTab) return;
  const anterior = STATE.activeTab;
  STATE.activeTab = name;
  if (anterior === 'mvp') mvpElegida = null;   // al volver, la jornada de por defecto
  if (name === 'mvp') document.getElementById('panel-mvp').dataset.rendered = '';   // siempre con el partido que toca
  // La pestaña MVP y el aviso de Inicio, con la hoja recién leída
  if (name === 'mvp' || (name === 'inicio' && getSessionPlayer())) leerHojaMVP();

  marcarTab(name);
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `panel-${name}`)
  );

  if (anterior === 'inicio') salirDeInicio();
  renderTabIfNeeded(name);
  if (name === 'inicio') entrarEnInicio();
  moverPaginas(anterior, name, { animar, desdeX });
  // Conservando el estado: con el juego abierto, es por donde Rush sabe qué cerrar al ir atrás
  history.replaceState(history.state, '', `#${name}`);
  actualizarRefrescoVotaciones();
  recargarSiCaducado();
}

/* ── Pull-to-refresh (solo pantallas táctiles) ───────────────────────────── */
// ¿Está arriba del todo lo que se ve?
const enLoAlto = () => (paginaDe(STATE.activeTab)?.scrollTop ?? 0) <= 0;

// En la PWA de iOS no existe el gesto nativo; en Chrome Android el nativo está
// desactivado con overscroll-behavior-y (recargaría la página entera).
const PTR_UMBRAL = 70;  // px hacia abajo
const PTR_MIN_MS = 600; // tiempo mínimo visible del spinner

// Mientras se arrastra, la rueda aparece y gira con el recorrido; al soltar sin
// llegar al umbral, se va
function ptrArrastre(dy) {
  const spinner = document.getElementById('ptrSpinner');
  const k = Math.min(1, dy / PTR_UMBRAL);
  spinner.style.opacity = String(k);
  spinner.style.transform = `scale(${(0.6 + 0.4 * k).toFixed(3)})`;
  spinner.style.rotate = `${Math.round(dy * 3)}deg`;
}
function ptrSoltar() {
  const s = document.getElementById('ptrSpinner').style;
  s.opacity = s.transform = s.rotate = '';
}

function initPullToRefresh() {
  if (!window.matchMedia('(pointer: coarse)').matches) return;

  let x0 = 0, y0 = 0, activo = false;

  document.addEventListener('touchstart', e => {
    activo = e.touches.length === 1
      && enLoAlto()                               // ya en lo alto de la página
      && !document.body.classList.contains('archivo')
      && !document.querySelector('.modal.open')
      && !e.target.closest('.slr, .agujero-capa');   // ni el modo Rush ni el agujero recargan la app
    if (!activo) return;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) { activo = false; ptrSoltar(); return; }
    if (!activo || document.getElementById('ptrSpinner').classList.contains('visible')) return;
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if (dy > 0 && dy > Math.abs(dx) && enLoAlto()) ptrArrastre(dy);
    else ptrSoltar();
  }, { passive: true });

  document.addEventListener('touchcancel', () => { activo = false; ptrSoltar(); }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!activo) return;
    activo = false;
    const t  = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (dy > PTR_UMBRAL && dy > Math.abs(dx) && enLoAlto()) refrescarPorGesto();
    else ptrSoltar();
  }, { passive: true });
}

async function refrescarPorGesto() {
  const spinner = document.getElementById('ptrSpinner');
  if (spinner.classList.contains('visible')) return;
  ptrSoltar();                          // del arrastre al giro en bucle
  spinner.classList.add('visible');
  await Promise.all([recargarDatos(), new Promise(r => setTimeout(r, PTR_MIN_MS))]);
  spinner.classList.remove('visible');
}

function renderTabIfNeeded(name) {
  const panel = document.getElementById(`panel-${name}`);
  if (!panel || panel.dataset.rendered) return;

  switch (name) {
    case 'inicio': {
      // Sin cambios no se repinta: ni parpadean las imágenes ni se corta el vídeo
      const html = renderInicio(STATE.proximosPartidos);
      if (html !== htmlInicio || !panel.children.length) {
        panel.innerHTML = html;
        htmlInicio = html;
      }
      break;
    }
    case 'votacion':
      panel.innerHTML = renderVotacion(getSessionPlayer());
      break;
    case 'mvp':
      panel.innerHTML = renderMVP(jugadorSesionMVP());
      pintarReparto(panel);
      break;
    case 'resumen':
      panel.innerHTML = renderResumen(STATE.jugadores, STATE.jornadas);
      break;
    case 'clasificacion':
      panel.innerHTML = tarjetaWrappedArchivo() + renderClasificacion(STATE.jugadores);
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
    case 'rush':
      panel.innerHTML = renderRushPanel();
      break;
  }

  panel.dataset.rendered = '1';
  ajustarImagenes(panel);
  bindPanel(panel, name);
}

/* ── Eventos de panel ────────────────────────────────────────────────────── */
function bindPanel(panel, name) {
  if (name === 'inicio') {
    prepararInicio(panel);
  }
  if (name === 'rush') bindRushPanel(panel);
  if (name === 'votacion') {
    predecodificarImagenes(panel);
    if (!panel.dataset.bound) {
      // Delegación: el panel se re-renderiza al cambiar la sesión, los listeners se quedan
      bindVotacion(panel);
      panel.dataset.bound = '1';
    }
  }
  if (name === 'mvp' && !panel.dataset.bound) {
    bindMVP(panel);
    panel.dataset.bound = '1';
  }
  if (name === 'resumen') {
    panel.querySelectorAll('.result-row').forEach(row => {
      const fn = () => openModalPartido(row.dataset.jornada, row.dataset.fecha);
      row.addEventListener('click', fn);
      row.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' '){e.preventDefault();fn();} });
    });
  }
  if (name === 'plantilla') {
    panel.querySelectorAll('.card-wrap__img').forEach(img => {
      const wrap = img.closest('.card-wrap');
      // load/error con la imagen ya en caché pueden haber ocurrido antes de llegar aquí
      if (img.complete && img.naturalWidth) wrap.classList.replace('card-wrap--cargando', 'card-wrap--lista');
      img.addEventListener('load', () => wrap.classList.replace('card-wrap--cargando', 'card-wrap--lista'), { once: true });
      // Si falla, queda el skeleton (sin shimmer) en vez de una imagen rota
      img.addEventListener('error', () => {
        wrap.classList.remove('card-wrap--cargando', 'card-wrap--lista');
        img.remove();
      }, { once: true });
    });
    panel.querySelectorAll('.card-wrap[data-nombre]').forEach(card => {
      const fn = () => openModalJugador(card.dataset.nombre);
      card.addEventListener('click', fn);
      card.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' '){e.preventDefault();fn();} });
    });
  }
}

/* ── Cuenta atrás (pestaña Inicio) ───────────────────────────────────────── */
let countdownTimer = null; // uno solo: Inicio se re-renderiza al recargar datos

function startCountdown(fechaIso) {
  clearInterval(countdownTimer);
  const el = document.getElementById('countdown');
  if (!el || !fechaIso) return;

  const target = new Date(fechaIso).getTime();
  if (isNaN(target)) return;

  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      el.innerHTML = `<span class="countdown__unit"><span class="countdown__num">¡Ya!</span></span>`;
      clearInterval(countdownTimer);
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
  countdownTimer = setInterval(tick, 1000);
}

/* ── Modal partido ───────────────────────────────────────────────────────── */
// Por la fecha: los números de jornada se repiten entre temporadas
function openModalPartido(jornadaKey, fecha) {
  const j = STATE.jornadas.find(x => x.fecha === fecha && !!x.amistoso === (jornadaKey === 'ami'));
  if (!j) return;
  const box = document.getElementById('modalBox');
  box.innerHTML = buildModalPartido(j);
  ajustarImagenes(box);
  openModal('modal');
}

/* ── Modal jugador ───────────────────────────────────────────────────────── */
function openModalJugador(nombre) {
  const j = STATE.jugadores.find(x => x.nombre === nombre);
  if (!j) return;
  const box = document.getElementById('playerModalBox');
  box.innerHTML = buildModalJugador(j);
  ajustarImagenes(box);
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
let temporadaElegida = false;      // la ha elegido el jugador: un cambio del servidor no le mueve
let temporadaTrasLogin = null;     // la que se pidió sin sesión

function pintarSelector() {
  const t = temporadaPorId(STATE.season);
  const label = document.getElementById('seasonLabel');
  label.innerHTML = `<span class="season-larga">${t.etiqueta.toUpperCase()}</span><span class="season-corta">${t.corta}</span>`;
  const dropdown = document.getElementById('seasonDropdown');
  dropdown.innerHTML = TEMPORADAS.filter(temporadaEnSelector).map(x => `
    <button class="season-dropdown__item${x.id === STATE.season ? ' active' : ''}" type="button" data-season="${x.id}">${x.etiqueta}</button>
  `).join('');
}

function initSeasonSelector() {
  const toggle = document.getElementById('seasonToggle');
  const dropdown = document.getElementById('seasonDropdown');
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => dropdown.classList.remove('open'));
  dropdown.addEventListener('click', e => {
    const btn = e.target.closest('.season-dropdown__item');
    if (!btn) return;
    e.stopPropagation();
    dropdown.classList.remove('open');
    elegirTemporada(btn.dataset.season);
  });
  pintarSelector();
}

function elegirTemporada(id) {
  const t = temporadaPorId(id);
  // También desde dentro de la temporada: así vuelven al agujero los beta
  if (esAgujero(t)) { abrirAgujero(); return; }
  if (puedeAbrirTemporada(t)) { switchSeason(id); return; }
  // Sin sesión: hace falta el código para saber si es beta
  if (!getSessionPlayer()) { temporadaTrasLogin = id; openSessionModal(); }
}

// Deja la app en esa temporada, sin mezclar nada: datos, pestañas y lo que se estaba votando.
// tab: la pestaña en la que abrir (si no, la de por defecto de la temporada)
function switchSeason(id, { tab, elegida = true } = {}) {
  if (id === STATE.season) return;
  STATE.season = id;
  temporadaElegida = elegida;
  const t = temporadaPorId(id);

  // Lo que estuviera en marcha era de la otra temporada
  salirDeInicio();
  videoElegido = null;
  tusPartidosTodos = false;
  recargaEnCurso = null;
  mvpEpoca++;
  mvpLeyendo = 0;
  mvpElegida = null;
  mvpReparto = { fecha: null, puntos: {} };
  ultimoVotoEnviado = 0;
  terminarTransicion();
  pintarSelector();

  const archivo = document.getElementById('archiveSeason');
  document.body.classList.toggle('archivo', !!t.imagenes);
  archivo.hidden = !t.imagenes;
  if (t.imagenes) {
    archivo.innerHTML = `
      <div class="sh">
        <span class="sh__title">${t.etiqueta.toUpperCase()}</span>
        <span class="sh__line"></span>
      </div>
      <div class="archive-season__images">
        ${t.imagenes.map(img => `
          <div class="archive-season__img-wrap">
            <img src="${img.src}" alt="${img.alt}" loading="lazy">
          </div>
        `).join('')}
      </div>
    `;
    actualizarRefrescoVotaciones();
    return;
  }
  archivo.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Con lo guardado de esta temporada, o vacía hasta que llegue lo fresco
  STATE.ultimaCarga = 0;
  if (!restaurarDatos()) {
    Object.assign(STATE, { jugadoresBase: [], jornadas: [], jugadores: [], proximosPartidos: [], votaciones: [], mvps: null, alias: {} });
  }
  document.querySelectorAll('.pagina').forEach(p => { p.scrollTop = 0; });
  document.querySelectorAll('.tab-panel').forEach(p => { p.dataset.rendered = ''; p.innerHTML = ''; });

  STATE.activeTab = tab && ordenTabs().includes(tab) ? tab : tabPorDefecto();
  aplicarOrdenTabs();
  marcarTab(STATE.activeTab);
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${STATE.activeTab}`));
  initHero();
  renderTabIfNeeded(STATE.activeTab);
  if (STATE.activeTab === 'inicio') entrarEnInicio();
  colocarPaginas();
  pintarIndicador();
  pintarTabs();
  centrarTab(STATE.activeTab, false);
  history.replaceState(history.state, '', `#${STATE.activeTab}`);
  actualizarRefrescoVotaciones();
  recargarDatos();
}

// Si la temporada que se ve ya no se puede ver (se ha cerrado la sesión, no es beta…), a la de por defecto
function revisarTemporadaVista() {
  pintarSelector();
  if (!puedeAbrirTemporada(temporadaPorId(STATE.season))) switchSeason(temporadaEnCursoId, { elegida: false });
}

// La temporada en curso del servidor. Si ha cambiado y nadie ha elegido otra, se pasa a ella
function fijarTemporadaEnCurso(id) {
  if (!id) return;
  const cambia = id !== temporadaEnCursoId;
  guardarTemporadaEnCurso(id);
  if (!cambia) return;
  if (!temporadaElegida) switchSeason(id, { elegida: false });
  else { aplicarOrdenTabs(); revisarTemporadaVista(); rerenderPanel('mvp'); }
  pintarSelector();
  rushMostrarPestana(rushAccesoGuardado() === true);
}

// La portada de Rush, esté en la temporada que esté (un enlace, volver tras una actualización…)
function abrirPortadaRush() {
  const t = temporadaConRush();
  if (!t) return false;
  if (t.id !== STATE.season) switchSeason(t.id, { tab: 'rush', elegida: false });
  else switchTab('rush', { animar: false });
  return true;
}

/* ── Init ────────────────────────────────────────────────────────────────── */
async function init() {
  // Una versión nueva ya descargada se aplica antes de arrancar (version.js recarga la página)
  await window.SLVersion?.alArrancar;
  initBubbles();
  initTabs();
  initSeasonSelector();
  initSession();
  initPaginas();
  initPullToRefresh();
  initBloquesInicio();
  bindVotacion(document.getElementById('hero-section'));   // las cartas de «Pendientes»

  // Lo guardado de la última vez se pinta ya y lo fresco de Sheets llega detrás. Sin nada
  // guardado (la primera vez) se espera a Sheets. Nada de Rush compite con esto: Rush no
  // se pide hasta pulsar JUGAR (rush-panel.js)
  // La temporada en curso: la guardada ya y la del servidor detrás. La primera vez se espera un
  // poco, para no enseñar la temporada equivocada
  const enCursoGuardada = leerEnCursoGuardada();
  const enCursoFresca = pedirTemporadaEnCurso();
  if (!enCursoGuardada) {
    const id = await Promise.race([enCursoFresca, new Promise(r => setTimeout(r, 1500))]);
    if (id) { guardarTemporadaEnCurso(id); STATE.season = id; }
  }
  // Un enlace a Rush lleva a la temporada que lo tiene
  if (location.hash === '#rush' && temporadaConRush()) STATE.season = temporadaConRush().id;
  pintarSelector();
  STATE.activeTab = tabPorDefecto();
  const guardados = restaurarDatos();
  aplicarOrdenTabs();
  // «sl:cargada»: la Shits League ya tiene sus datos frescos. Entonces (y no antes) se registra
  // el service worker (version.js), que descarga la app en segundo plano
  const cargada = () => document.dispatchEvent(new Event('sl:cargada'));
  if (guardados) {
    recargarDatos().finally(cargada);
  } else {
    try {
      await loadData();
    } catch (e) {
      console.error('[app] Error cargando datos:', e);
    }
    cargada();
  }
  // El acceso a Rush es el guardado; solo si no se sabe (una sesión de antes de Rush) se
  // pregunta, y cuando la Shits League ya ha cargado
  if (typeof rushVerificarAcceso === 'function' && getSessionPlayer() && rushAccesoGuardado() === null) {
    document.addEventListener('sl:cargada', () => rushVerificarAcceso(), { once: true });
  }

  enCursoFresca.then(fijarTemporadaEnCurso);
  initHero();
  aplicarOrdenTabs();
  marcarTab(STATE.activeTab);
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${STATE.activeTab}`));
  renderTabIfNeeded(STATE.activeTab);
  if (STATE.activeTab === 'inicio') entrarEnInicio();
  // Con hash (p. ej. desde una notificación), después de saber qué pestañas hay
  const tabInicial = tabDesdeHash();
  if (tabInicial) switchTab(tabInicial, { animar: false });
  else colocarPaginas();
  window.addEventListener('hashchange', () => {
    const tab = tabDesdeHash();
    if (tab) switchTab(tab);
    abrirEnlaceDeHash();
  });
  abrirEnlaceDeHash();
  document.addEventListener('sl:cargada', abrirEnlaceDeHash, { once: true });
  document.addEventListener('visibilitychange', () => {
    actualizarRefrescoVotaciones();
    if (document.visibilityState !== 'visible') return;
    // Al volver a la app: votaciones al día y stats si llevan más de 5 min
    pedirTemporadaEnCurso().then(fijarTemporadaEnCurso);
    if (STATE.activeTab === 'votacion') refrescarVotaciones();
    if (STATE.activeTab === 'mvp' || (STATE.activeTab === 'inicio' && getSessionPlayer())) leerHojaMVP();
    recargarSiCaducado();
  });
  actualizarRefrescoVotaciones();
  initPush();
  initInstalarApp();
  initAgujero();
  // Recargada para aplicar una versión nueva al pulsar JUGAR: se entra en Rush sola
  if (typeof rushTrasRecarga === 'function') rushTrasRecarga();
}

/* ── Cambio de sesión (login / logout) ───────────────────────────────────── */
// Lo llama session.js; re-renderiza lo que depende del jugador logueado
async function onSessionChange() {
  rerenderPanel('inicio');
  rerenderPanel('clasificacion');
  rerenderPanel('votacion');
  rerenderPanel('mvp');
  rerenderPanel('rush');
  actualizarPendientes();
  const pedida = temporadaTrasLogin;
  temporadaTrasLogin = null;
  pintarSelector();
  if (typeof rushVerificarAcceso === 'function') await rushVerificarAcceso();
  revisarTemporadaVista();
  actualizarAgujero();   // con sesión ya se puede votar; y si es beta, entrar
  if (!pedida) return;
  if (puedeAbrirTemporada(temporadaPorId(pedida))) switchSeason(pedida);
  else if (getSessionPlayer()) avisoApp('Esa temporada aún no está disponible.');
}

document.addEventListener('DOMContentLoaded', init);
