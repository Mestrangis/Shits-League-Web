/* ═══════════════════════════════════════════════
   SHITS LEAGUE — mvp.js
   Votación del MVP de cada jornada oficial: reglas (quién vota, cuándo está
   abierta, quién gana), pestaña MVP y bloque «Pendientes» de Inicio.
   Los votos están en la hoja MVPs y se escriben con el Apps Script (votarMVP),
   que comprueba todo otra vez. La columna «mvp» de Jornadas manda sobre los votos.
═══════════════════════════════════════════════ */

const MVP_DIAS       = 3;              // días después del partido que sigue abierta
const MVP_FLAG       = 'mvp_votado_';  // localStorage: voto enviado, para pintar rápido
const MVP_ESPERA_MS  = 60000;          // lo enviado que la hoja aún no devuelve se mantiene este rato
const MVP_PUNTOS     = 3;
const MVP_PULSADO_MS = 450;            // mantener pulsada una carta quita un punto

let mvpElegida  = null;    // jornada que se está viendo; null: la de por defecto
let mvpReparto  = { jornada: null, puntos: {} };   // clave del candidato → puntos
let mvpEnviando = null;    // jornada cuyo voto se está enviando
let pendientesHtml = null; // lo último pintado en «Pendientes» (no repintar si es igual)

/* ── Nombres ─────────────────────────────────────────────────────────────── */
// Sin tildes, mayúsculas ni emojis: «De la Mano 🏆» y «De la Mano» son el mismo jugador
function claveMVP(nombre) {
  return normalizarNombre(String(nombre ?? '')).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
}

function canonMVP(nombre) {
  const r = resolverNombre(nombre);
  if (r) return r;
  const k = claveMVP(nombre);
  return STATE.jugadoresBase.find(j => claveMVP(j.nombre) === k)?.nombre || String(nombre ?? '').trim();
}

const jugadorSesionMVP = () => { const n = getSessionPlayer(); return n ? canonMVP(n) : null; };
const fichaMVP = nombre => STATE.jugadoresBase.find(j => j.nombre === nombre);

/* ── Reglas ──────────────────────────────────────────────────────────────── */
const jornadasOficiales = () => STATE.jornadas
  .filter(j => !j.amistoso && j.numero != null)
  .sort((a, b) => a.numero - b.numero);

// Los datos guardados de antes de esta versión no llevan con_resultado: tenían resultado
const tieneResultado = j => j.con_resultado !== false;

// Los que jugaron, sin repetir y con el nombre canónico
function plantillaMVP(j) {
  const vistos = new Map();
  [...j.jugadores_local, ...j.jugadores_visitante].forEach(n => {
    const c = canonMVP(n);
    if (!vistos.has(claveMVP(c))) vistos.set(claveMVP(c), c);
  });
  return [...vistos.values()];
}

// El primer momento en que ya está cerrada por la fecha: acaba el tercer día después del partido
function finPlazoMVP(j) {
  const f = parseFechaVoto(j.fecha);
  return f ? new Date(f.getFullYear(), f.getMonth(), f.getDate() + MVP_DIAS + 1) : null;
}

function mvpAbierta(j, ahora = new Date()) {
  if (j.amistoso || !tieneResultado(j)) return false;
  const fin = finPlazoMVP(j);
  if (!fin || ahora >= fin) return false;
  // Por número: las fechas de la hoja no siempre van en orden
  return !jornadasOficiales().some(o => o.numero > j.numero && tieneResultado(o));
}

// Una fila por votante (si se repite en la hoja, vale la primera)
function votosDe(j) {
  const vistos = new Set();
  return (STATE.mvps || []).filter(f => {
    if (f.jornada !== j.numero) return false;
    const k = claveMVP(canonMVP(f.votante));
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).map(f => ({ ...f, votante: canonMVP(f.votante), votos: f.votos.map(v => ({ nombre: canonMVP(v.nombre), puntos: v.puntos })) }));
}

// Todos los candidatos con sus puntos, ya en orden de desempate:
// puntos → votantes distintos → veces con los 3 puntos de un mismo votante
function rankingMVP(j) {
  const filas = new Map();
  const fila = nombre => {
    const k = claveMVP(nombre);
    if (!filas.has(k)) filas.set(k, { nombre, puntos: 0, votantes: [], tres: 0 });
    return filas.get(k);
  };
  plantillaMVP(j).forEach(fila);
  votosDe(j).forEach(v => v.votos.forEach(x => {
    const f = fila(x.nombre);
    f.puntos += x.puntos;
    f.votantes.push({ nombre: v.votante, puntos: x.puntos });
    if (x.puntos === 3) f.tres++;
  }));
  return [...filas.values()].sort((a, b) =>
    b.puntos - a.puntos || b.votantes.length - a.votantes.length || b.tres - a.tres || a.nombre.localeCompare(b.nombre, 'es'));
}

const empatanMVP = (a, b) => a.puntos === b.puntos && a.votantes.length === b.votantes.length && a.tres === b.tres;

// { nombre, manual } | { porDecidir: [nombres] } | null
function resultadoMVP(j, ahora = new Date()) {
  if (j.amistoso) return null;
  if (j.mvp) return { nombre: canonMVP(j.mvp), manual: true };
  if (mvpAbierta(j, ahora)) return null;
  const r = rankingMVP(j);
  if (!r[0]?.puntos) return null;
  if (r[1] && empatanMVP(r[0], r[1])) return { porDecidir: r.filter(x => empatanMVP(x, r[0])).map(x => x.nombre) };
  return { nombre: r[0].nombre, manual: false };
}

const nombreMVP = j => resultadoMVP(j)?.nombre || '';

const miVoto = (j, jugador) => votosDe(j).find(v => claveMVP(v.votante) === claveMVP(jugador)) || null;
const jugoMVP = (j, jugador) => !!jugador && plantillaMVP(j).some(n => claveMVP(n) === claveMVP(jugador));

// sin-datos | sin-resultado | votar | votado | en-curso | cerrada | sin-votos
function estadoMVP(j, jugador, ahora = new Date()) {
  if (!tieneResultado(j)) return 'sin-resultado';
  if (STATE.mvps === null) return 'sin-datos';
  if (mvpAbierta(j, ahora)) {
    if (!jugoMVP(j, jugador)) return 'en-curso';
    return miVoto(j, jugador) ? 'votado' : 'votar';
  }
  return votosDe(j).length ? 'cerrada' : 'sin-votos';
}

const pendienteMVP = jugador => jornadasOficiales().filter(j => estadoMVP(j, jugador) === 'votar');

/* ── Lo votado en este dispositivo ───────────────────────────────────────── */
function leerVotados() {
  const lista = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith(MVP_FLAG)) continue;
      try { lista.push({ clave: k, ...JSON.parse(localStorage.getItem(k)) }); } catch { /* una marca rota no cuenta */ }
    }
  } catch { /* sin almacenamiento */ }
  return lista;
}

// Suma a las filas lo enviado desde aquí que aún no devuelven. La verdad es la hoja: con filas
// recién leídas (frescas), lo que no aparece pasado un rato se olvida, y lo que sí, se apunta
function combinarMVPs(filas, frescas = false) {
  const hay = (jornada, votante) => filas.some(f => f.jornada === jornada && claveMVP(f.votante) === claveMVP(votante));
  const resultado = [...filas];
  leerVotados().forEach(v => {
    if (hay(v.jornada, v.votante)) return;
    if (frescas && Date.now() - v.t > MVP_ESPERA_MS) {
      try { localStorage.removeItem(v.clave); } catch { /* nada */ }
      return;
    }
    resultado.push({ jornada: v.jornada, votante: v.votante, votos: v.votos, fecha: '' });
  });
  const yo = frescas && jugadorSesionMVP();
  if (yo) filas.filter(f => claveMVP(f.votante) === claveMVP(yo)).forEach(f => {
    try {
      if (!localStorage.getItem(MVP_FLAG + f.jornada)) {
        localStorage.setItem(MVP_FLAG + f.jornada, JSON.stringify({ jornada: f.jornada, votante: f.votante, votos: f.votos, t: 0 }));
      }
    } catch { /* nada */ }
  });
  return resultado;
}

/* ── Textos ──────────────────────────────────────────────────────────────── */
function faltaMVP(j, ahora = new Date()) {
  const fin = finPlazoMVP(j);
  const min = fin ? Math.max(1, Math.ceil((fin - ahora) / 60000)) : 0;
  if (min >= 1440) {
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60);
    return `Se cierra en ${d} ${d === 1 ? 'día' : 'días'}${h ? ` y ${h} h` : ''}`;
  }
  if (min >= 60) return `Se cierra en ${Math.floor(min / 60)} h ${min % 60} min`;
  return `Se cierra en ${min} min`;
}

const textoVoto = votos => votos.map(v => `${v.nombre} ${v.puntos}`).join(' · ');

function fotoMVP(nombre, clase) {
  const img = fichaMVP(nombre)?.img;
  return img
    ? `<img class="${clase}" ${attrsImagen(img)} alt="" draggable="false" decoding="async">`
    : `<span class="${clase} ${clase}--vacia" aria-hidden="true">${nombre.slice(0, 1).toUpperCase()}</span>`;
}

/* ── Pestaña MVP ─────────────────────────────────────────────────────────── */
function jornadaVistaMVP(jugador) {
  const lista = jornadasOficiales();
  const elegida = mvpElegida != null && lista.find(j => j.numero === mvpElegida);
  return elegida || pendienteMVP(jugador)[0] || lista[lista.length - 1] || null;
}

function renderMVP(jugador) {
  const j = jornadaVistaMVP(jugador);
  if (!j) return `<div class="sh"><span class="sh__title">MVP</span><span class="sh__line"></span></div>
    <div class="empty">Todavía no hay partidos.</div>`;

  const lista = jornadasOficiales();
  const i = lista.indexOf(j);
  const flecha = (dir, destino, texto) => `<button class="mvp-nav__flecha" type="button" data-mvp-ir="${destino?.numero ?? ''}"
    aria-label="${texto}" ${destino ? '' : 'disabled'}>${dir}</button>`;

  return `
    <div class="mvp-nav">
      ${flecha('←', lista[i - 1], 'Jornada anterior')}
      <div class="mvp-nav__centro">
        <div class="mvp-nav__titulo">JORNADA ${j.numero} · MVP</div>
        <div class="mvp-nav__fecha">${fmtFechaLarga(j.fecha)}</div>
      </div>
      ${flecha('→', lista[i + 1], 'Jornada siguiente')}
    </div>
    <div class="mvp-vista" data-estado="${estadoMVP(j, jugador)}">${renderEstadoMVP(j, jugador)}</div>
  `;
}

function renderEstadoMVP(j, jugador) {
  const manual = j.mvp ? bannerMVP(j) : '';
  switch (estadoMVP(j, jugador)) {
    case 'sin-datos':
      return `<div class="mvp-aviso">No se han podido leer los votos. <button class="mvp-enlace" type="button" data-mvp-reintentar>Reintentar</button></div>`;
    case 'sin-resultado':
      return `<div class="empty">Este partido aún no tiene resultado.</div>`;
    case 'votar':
      return manual + renderVotarMVP(j, jugador);
    case 'votado':
      return manual + renderVotadoMVP(j, jugador);
    case 'en-curso':
      return manual + renderEnCursoMVP(j, jugador);
    case 'cerrada':
      return renderCerradaMVP(j);
    default:
      return `<div class="mvp-aviso">No hubo votación.</div>${manual}`;
  }
}

function bannerMVP(j) {
  const r = resultadoMVP(j);
  if (!r) return '';
  if (r.porDecidir) return `<div class="mvp-banner mvp-banner--decidir">MVP por decidir<small>Empate entre ${r.porDecidir.join(', ')}</small></div>`;
  return `<div class="mvp-banner">
    ${fotoMVP(r.nombre, 'mvp-banner__foto')}
    <span>🏆 ${r.nombre}</span>
    ${r.manual && votosDe(j).length ? '<small>Fijado a mano</small>' : ''}
  </div>`;
}

const puntosUsados = () => Object.values(mvpReparto.puntos).reduce((s, p) => s + p, 0);

function renderVotarMVP(j, jugador) {
  if (mvpReparto.jornada !== j.numero) mvpReparto = { jornada: j.numero, puntos: {} };
  const candidatos = plantillaMVP(j).filter(n => claveMVP(n) !== claveMVP(jugador));
  const enviando = mvpEnviando === j.numero;
  return `
    <div class="mvp-reparto">
      <div class="mvp-falta" data-falta>${faltaMVP(j)}</div>
      <div class="mvp-quedan" data-quedan></div>
      <div class="mvp-cartas">
        ${candidatos.map(n => `
          <div class="mvp-carta" data-candidato="${claveMVP(n)}" data-nombre="${n}" role="button" tabindex="0" aria-label="Dar un punto a ${n}">
            <button class="mvp-carta__menos" type="button" data-menos aria-label="Quitar un punto a ${n}">−</button>
            <span class="mvp-carta__puntos" data-puntos>0</span>
            ${fotoMVP(n, 'mvp-carta__foto')}
            <span class="mvp-carta__nombre">${n}</span>
          </div>`).join('')}
      </div>
      <p class="mvp-pista">Toca para dar un punto · mantén pulsado para quitarlo</p>
      <button class="dialog-box__btn mvp-enviar" type="button" data-enviar ${enviando ? 'disabled' : ''}>${enviando ? 'enviando…' : 'Enviar voto'}</button>
    </div>`;
}

function pintarReparto(root) {
  const zona = root.querySelector('.mvp-reparto');
  if (!zona) return;
  const quedan = MVP_PUNTOS - puntosUsados();
  zona.querySelector('[data-quedan]').textContent = !quedan ? 'Puntos repartidos'
    : quedan === 1 ? 'Te queda 1 punto' : `Te quedan ${quedan} puntos`;
  zona.querySelectorAll('.mvp-carta').forEach(c => {
    const p = mvpReparto.puntos[c.dataset.candidato] || 0;
    c.querySelector('[data-puntos]').textContent = p;
    c.classList.toggle('mvp-carta--con', p > 0);
    c.classList.toggle('mvp-carta--apagada', !quedan && !p);
  });
  if (mvpEnviando !== mvpReparto.jornada) zona.querySelector('[data-enviar]').disabled = quedan !== 0;
}

function filaRanking(f, i, { abierta, ganador }) {
  const cuerpo = `
    <span class="mvp-fila__pos">${i + 1}</span>
    ${fotoMVP(f.nombre, 'mvp-fila__foto')}
    <span class="mvp-fila__nombre">${ganador ? '🏆 ' : ''}${f.nombre}</span>
    <span class="mvp-fila__puntos">${f.puntos}<small>pts</small></span>`;
  const clase = `mvp-fila${ganador ? ' mvp-fila--ganador' : ''}`;
  // Mientras está abierta no se ve quién votó a quién
  if (abierta || !f.votantes.length) return `<div class="${clase}"><div class="mvp-fila__linea">${cuerpo}</div></div>`;
  return `<details class="${clase}">
    <summary class="mvp-fila__linea">${cuerpo}</summary>
    <div class="mvp-fila__desglose">
      ${f.votantes.map(v => `<div class="mvp-quien">${fotoMVP(v.nombre, 'mvp-quien__foto')}<span>${v.nombre}</span><b>${v.puntos}</b></div>`).join('')}
    </div>
  </details>`;
}

function renderVotadoMVP(j, jugador) {
  const v = votosDe(j), total = plantillaMVP(j).length;
  return `
    <div class="mvp-cuenta"><b>${v.length} de ${total}</b> han votado · <span data-falta>${faltaMVP(j)}</span></div>
    <div class="mvp-tuvoto">Tu voto: <b>${textoVoto(miVoto(j, jugador).votos)}</b></div>
    <div class="mvp-ranking">${rankingMVP(j).map((f, i) => filaRanking(f, i, { abierta: true })).join('')}</div>`;
}

function renderEnCursoMVP(j, jugador) {
  const v = votosDe(j), total = plantillaMVP(j).length;
  return `
    <div class="mvp-aviso">
      Votación en curso · <b>${v.length} de ${total}</b> han votado
      <small data-falta>${faltaMVP(j)}</small>
      ${jugador ? '' : '<button class="votacion-login__btn mvp-login" type="button" data-mvp-login>INICIAR SESIÓN</button>'}
    </div>`;
}

function renderCerradaMVP(j) {
  const v = votosDe(j), total = plantillaMVP(j).length;
  const r = resultadoMVP(j);
  const noVotaron = plantillaMVP(j).filter(n => !v.some(x => claveMVP(x.votante) === claveMVP(n)));
  return `
    ${bannerMVP(j)}
    <div class="mvp-cuenta"><b>${v.length} de ${total}</b> votaron</div>
    <div class="mvp-ranking">${rankingMVP(j).map((f, i) => filaRanking(f, i, { ganador: r?.nombre && claveMVP(f.nombre) === claveMVP(r.nombre) })).join('')}</div>
    <div class="sh mvp-sub"><span class="sh__title">VOTOS DE CADA UNO</span><span class="sh__line"></span></div>
    <div class="mvp-votos">
      ${v.map(x => `<div class="mvp-quien">${fotoMVP(x.votante, 'mvp-quien__foto')}<span>${x.votante}</span><em>${textoVoto(x.votos)}</em></div>`).join('')}
    </div>
    ${noVotaron.length ? `<p class="mvp-pista">No votaron: ${noVotaron.join(', ')}</p>` : ''}`;
}

/* ── Pintar y moverse ────────────────────────────────────────────────────── */
function repintarMVP() {
  const panel = document.getElementById('panel-mvp');
  if (panel?.dataset.rendered) { panel.dataset.rendered = ''; renderTabIfNeeded('mvp'); }
}

function abrirMVP(numero) {
  mvpElegida = numero;
  if (STATE.activeTab === 'mvp') repintarMVP();
  else switchTab('mvp');
  document.querySelector('.main').scrollIntoView({ block: 'start', behavior: 'instant' });
}

/* ── Enviar el voto ──────────────────────────────────────────────────────── */
function confirmarVotoMVP() {
  const zona = document.querySelector('.mvp-reparto');
  if (!zona || puntosUsados() !== MVP_PUNTOS || mvpEnviando != null) return;
  const nombres = Object.fromEntries([...zona.querySelectorAll('.mvp-carta')].map(c => [c.dataset.candidato, c.dataset.nombre]));
  const votos = Object.entries(mvpReparto.puntos)
    .map(([k, p]) => ({ nombre: nombres[k], puntos: p })).sort((a, b) => b.puntos - a.puntos);
  const jornada = mvpReparto.jornada;
  document.getElementById('mvpConfirmarTexto').textContent = `${textoVoto(votos)}. Una vez enviado no se puede cambiar.`;
  document.getElementById('mvpConfirmarSi').onclick = () => { closeModal('mvpModal'); enviarVotoMVP(jornada, votos); };
  openModal('mvpModal');
}

async function enviarVotoMVP(jornada, votos) {
  const votante = jugadorSesionMVP();
  if (!votante) return;
  mvpEnviando = jornada;
  const boton = document.querySelector('.mvp-enviar');
  if (boton) { boton.disabled = true; boton.textContent = 'enviando…'; }
  try {
    await postVotoMVP(jornada, votante, votos);
    try {
      localStorage.setItem(MVP_FLAG + jornada, JSON.stringify({ jornada, votante, votos, t: Date.now() }));
    } catch { /* la hoja lo dirá la próxima vez */ }
    mvpEnviando = null;
    mvpReparto = { jornada: null, puntos: {} };
    aplicarMVPs(combinarMVPs(STATE.mvps || []));
    avisoApp('Voto guardado', 'ok');
  } catch (e) {
    mvpEnviando = null;
    avisoApp(e.message);
    repintarMVP();
    // Si el servidor lo ha rechazado (ya votado, ya cerrada…), lo que hay que ver es lo de la hoja
    if (e.delServidor) refrescarMVPs();
  }
}

/* ── Datos nuevos ────────────────────────────────────────────────────────── */
function aplicarMVPs(filas) {
  STATE.mvps = filas;
  STATE.jugadores = calcularStats(STATE.jugadoresBase, STATE.jornadas);
  guardarDatos();
  initHero();
  document.querySelectorAll('.tab-panel:not(#panel-rush)').forEach(p => { p.dataset.rendered = ''; });
  renderTabIfNeeded(STATE.activeTab);
}

// Cada 30 s con la pestaña abierta: solo repinta si algo ha cambiado (los puntos repartidos se conservan)
async function refrescarMVPs() {
  if (mvpEnviando != null) return;
  const leidas = await fetchMVPs();
  if (leidas === null || mvpEnviando != null) return;
  const filas = combinarMVPs(leidas, true);
  if (JSON.stringify(filas) !== JSON.stringify(STATE.mvps)) { aplicarMVPs(filas); return; }
  const panel = document.getElementById('panel-mvp');
  const yo = jugadorSesionMVP();
  const j = jornadaVistaMVP(yo);
  if (!j || !panel) return;
  const pintado = panel.querySelector('.mvp-vista')?.dataset.estado;
  if (pintado && pintado !== estadoMVP(j, yo)) { aplicarMVPs(filas); return; }
  panel.querySelectorAll('[data-falta]').forEach(el => { el.textContent = faltaMVP(j); });
}

/* ── Eventos (delegados en el panel) ─────────────────────────────────────── */
function cambiarPuntos(clave, d) {
  const actual = mvpReparto.puntos[clave] || 0;
  if (d > 0 && puntosUsados() >= MVP_PUNTOS) return;
  if (d < 0 && !actual) return;
  const nuevo = actual + d;
  if (nuevo) mvpReparto.puntos[clave] = nuevo;
  else delete mvpReparto.puntos[clave];
  pintarReparto(document.getElementById('panel-mvp'));
}

function bindMVP(panel) {
  let pulsado = 0, x0 = 0, y0 = 0, trasPulsado = false;
  const soltar = () => { clearTimeout(pulsado); pulsado = 0; };

  panel.addEventListener('pointerdown', e => {
    const carta = e.target.closest('.mvp-carta');
    if (!carta || e.button > 0 || e.target.closest('[data-menos]')) return;
    x0 = e.clientX; y0 = e.clientY; trasPulsado = false;
    soltar();
    pulsado = setTimeout(() => { trasPulsado = true; pulsado = 0; cambiarPuntos(carta.dataset.candidato, -1); }, MVP_PULSADO_MS);
  });
  panel.addEventListener('pointermove', e => {
    if (pulsado && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) soltar();
  }, { passive: true });
  ['pointerup', 'pointercancel'].forEach(t => panel.addEventListener(t, soltar));
  // Mantener pulsado no abre el menú del navegador sobre la foto
  panel.addEventListener('contextmenu', e => { if (e.target.closest('.mvp-carta')) e.preventDefault(); });

  panel.addEventListener('click', e => {
    const ir = e.target.closest('[data-mvp-ir]');
    if (ir) { if (ir.dataset.mvpIr) { mvpElegida = Number(ir.dataset.mvpIr); repintarMVP(); } return; }
    if (e.target.closest('[data-mvp-reintentar]')) { refrescarMVPs(); return; }
    if (e.target.closest('[data-mvp-login]')) { openSessionModal(); return; }
    if (e.target.closest('[data-enviar]')) { confirmarVotoMVP(); return; }
    const carta = e.target.closest('.mvp-carta');
    if (!carta) return;
    if (e.target.closest('[data-menos]')) { cambiarPuntos(carta.dataset.candidato, -1); return; }
    if (trasPulsado) { trasPulsado = false; return; }
    cambiarPuntos(carta.dataset.candidato, 1);
  });
  panel.addEventListener('keydown', e => {
    const carta = e.target.closest('.mvp-carta');
    if (carta && e.target === carta && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cambiarPuntos(carta.dataset.candidato, 1); }
  });
}

/* ── Pendientes en Inicio ────────────────────────────────────────────────── */
function votacionesPendientes(jugador) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return STATE.votaciones
    .filter(v => { const f = parseFechaVoto(v.fecha); return f && f >= hoy && !votoDe(v, jugador); })
    .sort((a, b) => parseFechaVoto(a.fecha) - parseFechaVoto(b.fecha));
}

function renderPendientes() {
  const sesion = getSessionPlayer();
  if (!sesion || STATE.activeTab !== 'inicio') return '';
  const votos = votacionesPendientes(sesion);
  const mvps = pendienteMVP(canonMVP(sesion));
  if (!votos.length && !mvps.length) return '';

  const pila = votos.length ? `
    <div class="pendientes__pila">
      ${votos.length > 1 ? `<article class="voto voto--detras" aria-hidden="true">${renderVotoInner(votos[1], null)}</article>` : ''}
      <article class="voto voto--compacta" data-id="${votos[0].id}">${renderVotoInner(votos[0], sesion)}</article>
    </div>
    <p class="pendientes__cuenta">¿Puedes? Desliza → sí · ← no${votos.length > 1 ? ` · quedan ${votos.length}` : ''}</p>` : '';

  const tarjetas = mvps.map(j => `
    <div class="pendiente-mvp">
      <span>Vota el MVP de la Jornada ${j.numero}</span>
      <button class="pendiente-mvp__btn" type="button" data-abrir-mvp="${j.numero}">Votar →</button>
    </div>`).join('');

  return `<section class="pendientes" id="pendientes">
    <div class="sh"><span class="sh__title">PENDIENTES</span><span class="sh__line"></span></div>
    ${pila}${tarjetas}
  </section>`;
}

// Solo se ve en Inicio y solo si hay algo: sin nada no queda ni el contenedor. Está por encima
// de las pestañas: si queda fuera de la pantalla, la página no salta al quitarlo o ponerlo
function actualizarPendientes() {
  const hero = document.getElementById('hero-section');
  if (!hero || hero.querySelector('.voto-card.is-dragging')) return;
  const html = renderPendientes();
  if (html === pendientesHtml) return;
  pendientesHtml = html;

  const actual = hero.querySelector('#pendientes');
  const main = document.querySelector('.main');
  const referencia = actual || hero.querySelector('.last-match');
  const fuera = referencia && referencia.getBoundingClientRect().bottom <= 0;
  const antes = main.getBoundingClientRect().top;

  actual?.remove();
  if (html) {
    hero.insertAdjacentHTML('beforeend', html);
    const nuevo = hero.querySelector('#pendientes');
    ajustarImagenes(nuevo);
    predecodificarImagenes(nuevo);
  }
  if (fuera) window.scrollBy({ top: main.getBoundingClientRect().top - antes, behavior: 'instant' });
}
