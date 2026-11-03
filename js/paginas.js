/* ═══════════════════════════════════════════════
   SHITS LEAGUE — paginas.js
   Las pestañas como páginas de un carril: cada una tiene su propio scroll vertical
   y se pasa de una a otra moviendo el carril, solo con transform. Al deslizar, la
   pantalla sigue al dedo. Rush queda fuera: se entra y se sale con su botón.
   La cabecera (hero) va dentro de la página de Inicio; la barra de pestañas flota
   encima: debajo de la cabecera en Inicio y arriba del todo en el resto.
═══════════════════════════════════════════════ */

const PAGINAS_MS        = 220;    // lo que tarda en asentarse
const GESTO_INICIO_PX   = 10;     // hasta aquí aún no se sabe si es horizontal
const GESTO_DISTANCIA   = 0.35;   // parte del ancho que hay que recorrer para pasar de página…
const GESTO_VELOCIDAD   = 0.35;   // …o velocidad al soltar (px/ms)
const GESTO_RECIENTE_MS = 100;
// Donde el gesto horizontal ya tiene otro dueño o es para escribir (las zonas con
// scroll horizontal propio se miran aparte, en dueñoDelGesto)
const GESTO_EXCLUIR = '.voto-card--swipe, .mvp-cartas, .modal, iframe, input, textarea, .slr';

const paginaDe = name => document.querySelector(`.pagina[data-pagina="${name}"]`);
const tabDe = name => document.querySelector(`.tab[data-tab="${name}"]`);
const estaEnRush = () => document.body.classList.contains('en-rush');

let gestoActivo = false;
let terminarTransicion = () => {};
let heroAlto = 0;

/* ── Orden de las pestañas ───────────────────────────────────────────────── */
// Partidos solo si hay alguno que votar. MVP después de Partidos mientras haya una votación
// en curso; si no, al final, entre Asistentes y Plantilla
function ordenTabs() {
  const partidos = votacionesFuturas().length > 0;
  const enCurso = partidosOficiales().some(mvpAbierta);
  return ['rush', 'inicio',
    ...(partidos ? ['votacion'] : []),
    ...(enCurso ? ['mvp'] : []),
    'resumen', 'clasificacion', 'goleadores', 'asistentes',
    ...(enCurso ? [] : ['mvp']),
    'plantilla'];
}

// Las que se ven (la de Rush depende de la sesión y del acceso a la beta)
const tabsVisibles = () => ordenTabs().filter(t => !tabDe(t)?.hidden);
// Las que se recorren deslizando
const tabsDeslizables = () => ordenTabs().filter(t => t !== 'rush');

function aplicarOrdenTabs() {
  if (gestoActivo) return;   // al soltar, con el orden nuevo
  const orden = ordenTabs();
  tabDe('votacion').hidden = !orden.includes('votacion');
  const inner = document.querySelector('.tabs__inner');
  const ahora = [...inner.querySelectorAll('.tab')].map(t => t.dataset.tab).filter(t => t !== 'votacion' || orden.includes(t));
  if (ahora.join() !== orden.join()) orden.forEach(t => inner.appendChild(tabDe(t)));
  if (!orden.includes(STATE.activeTab) && STATE.activeTab !== 'rush') { switchTab('inicio', { animar: false }); return; }
  colocarPaginas();
  pintarIndicador();
}

/* ── Entrar y salir de Rush ──────────────────────────────────────────────── */
// Rush usa el scroll de la ventana y las páginas no están: cada una recupera el suyo al volver
let scrollsAlEntrarEnRush = null;
function cambiarARush(enRush) {
  if (enRush) {
    scrollsAlEntrarEnRush = [...document.querySelectorAll('.pagina')].map(p => [p, p.scrollTop]);
  }
  document.body.classList.toggle('en-rush', enRush);
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (!enRush) {
    scrollsAlEntrarEnRush?.forEach(([p, y]) => { p.scrollTop = y; });
    scrollsAlEntrarEnRush = null;
  }
}

/* ── Colocar las páginas ─────────────────────────────────────────────────── */
// La activa en el centro y sus vecinas a los lados, ya pintadas; el resto no se pinta
function colocarPaginas() {
  const orden = tabsDeslizables();
  const i = orden.indexOf(STATE.activeTab);
  document.querySelectorAll('.pagina').forEach(p => {
    const slot = orden.indexOf(p.dataset.pagina) - i;
    const visible = i >= 0 && orden.includes(p.dataset.pagina) && Math.abs(slot) <= 1;
    p.style.visibility = visible ? 'visible' : 'hidden';
    if (visible) p.style.transform = `translate3d(${slot * 100}%,0,0)`;
  });
  const pista = document.getElementById('pista');
  pista.style.transition = '';
  pista.style.transform = 'translate3d(0,0,0)';
}

function vecinasDe(name) {
  const orden = tabsDeslizables();
  const i = orden.indexOf(name);
  return i < 0 ? [null, null] : [orden[i - 1] ?? null, orden[i + 1] ?? null];
}

// Las de al lado ya pintadas cuando llegue el gesto, en un rato libre
function prepararVecinas() {
  const pedir = window.requestIdleCallback ?? (f => setTimeout(f, 200));
  pedir(() => {
    if (gestoActivo || estaEnRush()) return;
    vecinasDe(STATE.activeTab).forEach(n => { if (n) renderTabIfNeeded(n); });
  });
}

/* ── La barra de pestañas ────────────────────────────────────────────────── */
function marcarTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    const activa = t.dataset.tab === name;
    t.classList.toggle('active', activa);
    t.setAttribute('aria-selected', String(activa));
  });
}

function pintarIndicadorEn(x, ancho) {
  document.querySelector('.tabs__indicador').style.transform = `translate3d(${x}px,0,0) scaleX(${ancho})`;
}
function pintarIndicador(name = STATE.activeTab) {
  const t = tabDe(name);
  if (t && !t.hidden) pintarIndicadorEn(t.offsetLeft, t.offsetWidth);
}

// Dónde se queda el scroll de la barra para que esa pestaña salga centrada
function scrollDeTab(name) {
  const nav = document.getElementById('tabs');
  const t = tabDe(name);
  return t ? Math.max(0, t.offsetLeft + t.offsetWidth / 2 - nav.clientWidth / 2) : 0;
}
function centrarTab(name, suave = true) {
  document.getElementById('tabs').scrollTo({ left: scrollDeTab(name), behavior: suave ? 'smooth' : 'instant' });
}

// A qué altura va la barra en cada página: en Inicio, debajo de la cabecera hasta que esta se va
const alturaTabs = name => (name === 'inicio' ? Math.max(0, heroAlto - paginaDe('inicio').scrollTop) : 0);
function pintarTabsEn(y) {
  document.getElementById('tabs').style.transform = `translate3d(0,${y}px,0)`;
}
function pintarTabs() {
  if (!gestoActivo) pintarTabsEn(alturaTabs(STATE.activeTab));
}

/* ── Pasar de una página a otra ──────────────────────────────────────────── */
// desdeX: dónde ha dejado el dedo el carril
function moverPaginas(anterior, name, { animar = true, desdeX = 0 } = {}) {
  terminarTransicion();
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animar || sinMovimiento || name === 'rush' || anterior === 'rush') {
    colocarPaginas();
    pintarIndicador();
    pintarTabs();
    centrarTab(name, false);
    prepararVecinas();
    if (anterior === 'mvp') rehacerMVP();
    return;
  }

  const orden = tabsDeslizables();
  const dir = orden.indexOf(name) > orden.indexOf(anterior) ? 1 : -1;
  const pista = document.getElementById('pista');
  // Aunque no sea su vecina, entra por el lado: las de en medio no se ven
  document.querySelectorAll('.pagina').forEach(p => {
    const n = p.dataset.pagina;
    p.style.visibility = n === anterior || n === name ? 'visible' : 'hidden';
    if (n === anterior) p.style.transform = 'translate3d(0,0,0)';
    if (n === name) p.style.transform = `translate3d(${dir * 100}%,0,0)`;
  });
  pista.style.transition = 'none';
  pista.style.transform = `translate3d(${desdeX}px,0,0)`;
  void getComputedStyle(pista).transform;   // el punto de partida, antes de animar

  document.body.classList.add('asentando');
  pista.style.transition = `transform ${PAGINAS_MS}ms ease-out`;
  pista.style.transform = `translate3d(${-dir * 100}%,0,0)`;
  pintarIndicador();
  pintarTabs();
  centrarTab(name);

  esperarFin(pista, () => {
    colocarPaginas();
    prepararVecinas();
    if (anterior === 'mvp') rehacerMVP();
  });
}

// Soltar sin llegar: vuelve a su sitio
function volverAlSitio(desdeX) {
  const pista = document.getElementById('pista');
  document.body.classList.add('asentando');
  pista.style.transition = `transform ${PAGINAS_MS}ms ease-out`;
  pista.style.transform = 'translate3d(0,0,0)';
  marcarTab(STATE.activeTab);
  pintarIndicador();
  pintarTabs();
  centrarTab(STATE.activeTab);
  if (!desdeX) void pista.offsetWidth;
  esperarFin(pista, () => { colocarPaginas(); aplicarOrdenTabs(); });
}

function esperarFin(pista, alAcabar) {
  let hecho = false;
  const fin = () => {
    if (hecho) return;
    hecho = true;
    clearTimeout(reserva);
    pista.removeEventListener('transitionend', alTerminar);
    document.body.classList.remove('asentando');
    terminarTransicion = () => {};
    alAcabar();
  };
  const alTerminar = e => { if (e.target === pista) fin(); };
  const reserva = setTimeout(fin, PAGINAS_MS + 120);   // por si transitionend no llega
  pista.addEventListener('transitionend', alTerminar);
  terminarTransicion = fin;
}

// La de MVP, al irse de ella, deja la rueda: al volver se lee la hoja otra vez
function rehacerMVP() {
  const panel = document.getElementById('panel-mvp');
  if (STATE.activeTab !== 'mvp' && panel.dataset.rendered) { panel.dataset.rendered = ''; renderTabIfNeeded('mvp'); }
}

/* ── El gesto ────────────────────────────────────────────────────────────── */
// ¿Lo que hay bajo el dedo se desliza por su cuenta?
function dueñoDelGesto(el) {
  if (el.closest(GESTO_EXCLUIR)) return true;
  for (let n = el; n && !n.classList?.contains('pagina'); n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
  }
  return false;
}

// Touch events: con touch-action: pan-y el navegador se queda el scroll vertical y nos manda
// solo el gesto horizontal; si empieza en vertical, avisa con touchcancel. Pasivos: no bloquean.
function initDeslizamiento() {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  const zona = document.getElementById('paginas');
  const pista = document.getElementById('pista');
  let g = null, marco = 0;

  function empezar(t) {
    terminarTransicion();
    const [antes, despues] = vecinasDe(STATE.activeTab);
    [antes, despues].forEach(n => { if (n) renderTabIfNeeded(n); });
    colocarPaginas();
    // Todo lo que hay que medir, ahora: durante el gesto no se lee nada de la página
    const nav = document.getElementById('tabs');
    const dato = n => (n ? {
      name: n, x: tabDe(n).offsetLeft, ancho: tabDe(n).offsetWidth, scroll: scrollDeTab(n), y: alturaTabs(n),
    } : null);
    g.ancho = zona.clientWidth;
    g.aqui = dato(STATE.activeTab);
    g.antes = dato(antes);
    g.despues = dato(despues);
    g.nav = nav;
    g.navScroll = nav.scrollLeft;
    g.marcada = STATE.activeTab;
    g.origen = t.clientX;
    g.dx = 0;
    gestoActivo = true;
    document.body.classList.add('deslizando');
  }

  function pintar() {
    marco = 0;
    if (!g?.activo) return;
    const hacia = g.dx < 0 ? g.despues : g.antes;
    // Sin página a ese lado, se resiste
    const x = hacia ? g.dx : g.dx * 0.25;
    g.x = x;
    pista.style.transform = `translate3d(${x}px,0,0)`;
    if (!hacia) return;
    const p = Math.min(1, Math.abs(x) / g.ancho);
    const entre = (a, b) => a + (b - a) * p;
    pintarIndicadorEn(entre(g.aqui.x, hacia.x), entre(g.aqui.ancho, hacia.ancho));
    pintarTabsEn(entre(g.aqui.y, hacia.y));
    g.nav.scrollLeft = entre(g.navScroll, hacia.scroll);
    const marcada = p > 0.5 ? hacia.name : g.aqui.name;
    if (marcada !== g.marcada) { g.marcada = marcada; marcarTab(marcada); }
  }

  zona.addEventListener('touchstart', e => {
    g = null;
    if (e.touches.length !== 1 || STATE.season !== '25-26' || estaEnRush()) return;
    if (document.querySelector('.modal.open') || dueñoDelGesto(e.target)) return;
    const t = e.touches[0];
    g = { x0: t.clientX, y0: t.clientY, activo: false, muestras: [] };
  }, { passive: true });

  zona.addEventListener('touchmove', e => {
    if (!g) return;
    if (e.touches.length > 1) { soltar(true); return; }
    const t = e.touches[0];
    if (!g.activo) {
      const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
      if (Math.hypot(dx, dy) < GESTO_INICIO_PX) return;
      // Solo si es claramente horizontal; si no, es scroll y este gesto ya no es nuestro
      if (Math.abs(dx) < Math.abs(dy) * 1.5) { g = null; return; }
      empezar(t);
      g.activo = true;
    }
    g.dx = t.clientX - g.origen;
    g.muestras.push([e.timeStamp, t.clientX]);
    if (g.muestras.length > 6) g.muestras.shift();
    if (!marco) marco = requestAnimationFrame(pintar);
  }, { passive: true });

  function soltar(cancelar, ahora = 0) {
    if (!g) return;
    const gesto = g;
    g = null;
    if (!gesto.activo) return;
    cancelAnimationFrame(marco);
    marco = 0;
    gestoActivo = false;
    document.body.classList.remove('deslizando');

    // La velocidad de lo último: si el dedo se ha parado antes de soltar, es 0
    const recientes = gesto.muestras.filter(m => ahora - m[0] < GESTO_RECIENTE_MS);
    const [a, b] = [recientes[0], recientes[recientes.length - 1]];
    const v = a && b && b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0;
    const x = gesto.x ?? 0;
    const hacia = gesto.dx < 0 ? gesto.despues : gesto.antes;
    // Una sacudida rápida vale, si va hacia esa página y no en sentido contrario
    const pasa = !cancelar && hacia && (Math.abs(x) > gesto.ancho * GESTO_DISTANCIA
      || (Math.abs(v) > GESTO_VELOCIDAD && Math.sign(v) === Math.sign(x)));
    if (pasa) switchTab(hacia.name, { desdeX: x });
    else volverAlSitio(x);
  }
  zona.addEventListener('touchend', e => { if (!e.touches.length) soltar(false, e.timeStamp); }, { passive: true });
  zona.addEventListener('touchcancel', () => soltar(true), { passive: true });
}

/* ── Arranque ────────────────────────────────────────────────────────────── */
function initPaginas() {
  const hero = document.getElementById('hero-section');
  const nav = document.getElementById('tabs');
  const inicio = paginaDe('inicio');
  // La altura de la cabecera y de la barra cambian con las cartas, los datos y las fuentes
  new ResizeObserver(() => {
    heroAlto = hero.offsetHeight;
    pintarTabs();
  }).observe(hero);
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--tabs-h', `${nav.offsetHeight}px`);
    pintarIndicador();
    centrarTab(STATE.activeTab, false);
  }).observe(nav);
  new ResizeObserver(() => pintarIndicador()).observe(document.querySelector('.tabs__inner'));
  inicio.addEventListener('scroll', () => { if (STATE.activeTab === 'inicio') pintarTabs(); }, { passive: true });
  initDeslizamiento();
  document.addEventListener('sl:cargada', prepararVecinas, { once: true });
}
