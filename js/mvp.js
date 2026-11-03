/* ═══════════════════════════════════════════════
   SHITS LEAGUE — mvp.js
   Votación del MVP de cada partido oficial: reglas (quién vota, cuándo está
   abierta, quién gana), pestaña MVP y bloque «Pendientes» de Inicio.
   Cada votación es la de la FECHA de un partido (los números de jornada se repiten
   entre temporadas). La verdad es la hoja MVPs: se lee fresca al abrir la pestaña y
   el aviso de Inicio, y se escribe con el Apps Script (votarMVP), que comprueba todo
   otra vez. La columna «mvp» de Jornadas manda sobre los votos.
═══════════════════════════════════════════════ */

const MVP_PUNTOS     = 3;
const MVP_PULSADO_MS = 450;   // mantener pulsada una carta quita un punto
const MVP_CIERRE     = 'Se cierra cuando voten todos o cuando se juegue el siguiente partido';

let mvpElegida  = null;    // fecha del partido que se está viendo; null: el de por defecto
let mvpReparto  = { fecha: null, puntos: {} };   // clave del candidato → puntos
let mvpEnviando = null;    // fecha del partido cuyo voto se está enviando
let mvpLeyendo  = 0;       // lecturas de la hoja en marcha: mientras tanto, la rueda
let mvpEpoca    = 0;       // sube al votar: una lectura empezada antes ya no vale
let pendientesPila = null, pendientesMvp = null;   // lo último pintado en «Pendientes»

// El «ya he votado» que se guardaba en el móvil: ya no se usa, la verdad es la hoja
try {
  Object.keys(localStorage).filter(k => k.startsWith('mvp_votado_')).forEach(k => localStorage.removeItem(k));
} catch { /* sin almacenamiento */ }

/* ── Nombres ─────────────────────────────────────────────────────────────── */
// Sin tildes, mayúsculas ni emojis: «De la Mano 🏆» y «De la Mano» son el mismo jugador
function claveMVP(nombre) {
  return normalizarNombre(String(nombre ?? '')).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
}

// Nombre canónico de quien tiene ficha en Jugadores (por nombre o alias); null si no la tiene
function fichaMVP(nombre) {
  const r = resolverNombre(nombre);
  if (r) return r;
  const k = claveMVP(nombre);
  return STATE.jugadoresBase.find(j => claveMVP(j.nombre) === k)?.nombre || null;
}

const jugadorSesionMVP = () => { const n = getSessionPlayer(); return n ? fichaMVP(n) : null; };
const fotoDeFicha = nombre => STATE.jugadoresBase.find(j => j.nombre === nombre)?.img;

/* ── Reglas ──────────────────────────────────────────────────────────────── */
const fechaValida = f => /^\d{4}-\d{2}-\d{2}$/.test(f ?? '');

// Los partidos oficiales por orden de fecha (las fechas AAAA-MM-DD se comparan como texto:
// sin horas ni zonas horarias de por medio)
const partidosOficiales = () => STATE.jornadas
  .filter(j => !j.amistoso && fechaValida(j.fecha))
  .sort((a, b) => a.fecha.localeCompare(b.fecha));

// Los datos guardados de antes no llevan con_resultado: tenían resultado
const tieneResultado = j => j.con_resultado !== false;

// Los que pueden votar y ser votados: los del partido con ficha, sin repetir
function plantillaMVP(j) {
  const vistos = new Map();
  [...j.jugadores_local, ...j.jugadores_visitante].forEach(n => {
    const c = fichaMVP(n);
    if (c && !vistos.has(claveMVP(c))) vistos.set(claveMVP(c), c);
  });
  return [...vistos.values()];
}

const enPlantilla = (j, nombre) => plantillaMVP(j).some(n => claveMVP(n) === claveMVP(nombre));

// Fecha del partido de una fila. Las filas de antes de la columna fecha_partido solo llevan el
// número: valen mientras la hoja no se ha convertido (el script lo hace con el siguiente voto)
function fechaDeFila(f) {
  if (f.fecha_partido) return f.fecha_partido;
  return partidosOficiales().find(j => j.numero === f.jornada)?.fecha ?? '';
}

// Una fila por votante con ficha que jugó (si se repite en la hoja, vale la primera),
// y solo los votos a jugadores con ficha que jugaron
function votosDe(j) {
  const vistos = new Set();
  const validas = [];
  (STATE.mvps || []).forEach(f => {
    if (fechaDeFila(f) !== j.fecha) return;
    const votante = fichaMVP(f.votante);
    if (!votante || !enPlantilla(j, votante) || vistos.has(claveMVP(votante))) return;
    vistos.add(claveMVP(votante));
    validas.push({ ...f, votante, votos: f.votos
      .map(v => ({ nombre: fichaMVP(v.nombre), puntos: v.puntos }))
      .filter(v => v.nombre && enPlantilla(j, v.nombre)) });
  });
  return validas;
}

const hanVotadoTodos = j => votosDe(j).length >= plantillaMVP(j).length;

// Abierta: el último partido oficial jugado, hasta que voten todos o se juegue el siguiente
function mvpAbierta(j) {
  if (j.amistoso || !tieneResultado(j) || !fechaValida(j.fecha)) return false;
  if (partidosOficiales().some(o => o.fecha > j.fecha && tieneResultado(o))) return false;
  return !hanVotadoTodos(j);
}

// Todos los candidatos con sus puntos, ya en orden de desempate:
// puntos → votantes distintos → veces con los 3 puntos de un mismo votante
function rankingMVP(j) {
  const filas = new Map(plantillaMVP(j).map(nombre => [claveMVP(nombre), { nombre, puntos: 0, votantes: [], tres: 0 }]));
  votosDe(j).forEach(v => v.votos.forEach(x => {
    const f = filas.get(claveMVP(x.nombre));
    f.puntos += x.puntos;
    f.votantes.push({ nombre: v.votante, puntos: x.puntos });
    if (x.puntos === 3) f.tres++;
  }));
  return [...filas.values()].sort((a, b) =>
    b.puntos - a.puntos || b.votantes.length - a.votantes.length || b.tres - a.tres || a.nombre.localeCompare(b.nombre, 'es'));
}

const empatanMVP = (a, b) => a.puntos === b.puntos && a.votantes.length === b.votantes.length && a.tres === b.tres;

// { nombre, manual } | { porDecidir: [nombres] } | null
function resultadoMVP(j) {
  if (j.amistoso) return null;
  if (j.mvp) return { nombre: fichaMVP(j.mvp) || j.mvp, manual: true };
  if (mvpAbierta(j)) return null;
  const r = rankingMVP(j);
  if (!r[0]?.puntos) return null;
  if (r[1] && empatanMVP(r[0], r[1])) return { porDecidir: r.filter(x => empatanMVP(x, r[0])).map(x => x.nombre) };
  return { nombre: r[0].nombre, manual: false };
}

const nombreMVP = j => resultadoMVP(j)?.nombre || '';

const miVoto = (j, jugador) => votosDe(j).find(v => claveMVP(v.votante) === claveMVP(jugador)) || null;

// sin-datos | sin-resultado | votar | votado | en-curso | cerrada | sin-votos
function estadoMVP(j, jugador) {
  if (!tieneResultado(j)) return 'sin-resultado';
  if (STATE.mvps === null) return 'sin-datos';
  if (mvpAbierta(j)) {
    if (!jugador || !enPlantilla(j, jugador)) return 'en-curso';
    return miVoto(j, jugador) ? 'votado' : 'votar';
  }
  return votosDe(j).length ? 'cerrada' : 'sin-votos';
}

const pendienteMVP = jugador => partidosOficiales().filter(j => estadoMVP(j, jugador) === 'votar');

/* ── Leer la hoja ────────────────────────────────────────────────────────── */
// null: no se ha podido leer, o se ha votado mientras tanto (lo leído ya no vale)
async function leerMVPs() {
  const epoca = mvpEpoca;
  const filas = await fetchMVPs();
  return epoca === mvpEpoca ? filas : null;
}

// Al abrir la pestaña o el aviso de Inicio: con la rueda hasta que llega la hoja
async function leerHojaMVP() {
  if (mvpEnviando != null) return;
  mvpLeyendo++;
  repintarMVP();
  actualizarPendientes();
  const filas = await leerMVPs();
  mvpLeyendo--;
  if (filas && JSON.stringify(filas) !== JSON.stringify(STATE.mvps)) { aplicarMVPs(filas); return; }
  if (!filas && mvpEnviando == null && !mvpLeyendo && STATE.activeTab === 'mvp') avisoApp('No se han podido actualizar los votos.');
  repintarMVP();
  actualizarPendientes();
}

function aplicarMVPs(filas) {
  STATE.mvps = filas;
  STATE.jugadores = calcularStats(STATE.jugadoresBase, STATE.jornadas);
  guardarDatos();
  aplicarOrdenTabs();
  initHero();
  document.querySelectorAll('.tab-panel:not(#panel-rush)').forEach(p => { p.dataset.rendered = ''; });
  renderTabIfNeeded(STATE.activeTab);
  prepararVecinas();
}

// Cada 30 s con la pestaña abierta, sin rueda: solo repinta si algo ha cambiado (los puntos repartidos se conservan)
async function refrescarMVPs() {
  if (mvpEnviando != null) return;
  const filas = await leerMVPs();
  if (filas && mvpEnviando == null && JSON.stringify(filas) !== JSON.stringify(STATE.mvps)) aplicarMVPs(filas);
}

/* ── Textos ──────────────────────────────────────────────────────────────── */
const textoVoto = votos => votos.map(v => `${v.nombre} ${v.puntos}`).join(' · ') || '—';

function fotoMVP(nombre, clase) {
  const img = fotoDeFicha(nombre);
  return img
    ? `<img class="${clase}" ${attrsImagen(img)} alt="" draggable="false" decoding="async">`
    : `<span class="${clase} ${clase}--vacia" aria-hidden="true">${nombre.slice(0, 1).toUpperCase()}</span>`;
}

/* ── Pestaña MVP ─────────────────────────────────────────────────────────── */
function partidoVistoMVP(jugador) {
  const lista = partidosOficiales();
  return lista.find(j => j.fecha === mvpElegida) || pendienteMVP(jugador)[0] || lista[lista.length - 1] || null;
}

function renderMVP(jugador) {
  // Como vecina al deslizar, también la rueda: nada de enseñar votos sin leer antes la hoja
  if (mvpLeyendo || STATE.activeTab !== 'mvp') return `<div class="mvp-rueda" role="status" aria-label="Cargando los votos"></div>`;
  const j = partidoVistoMVP(jugador);
  if (!j) return `<div class="sh"><span class="sh__title">MVP</span><span class="sh__line"></span></div>
    <div class="empty">Todavía no hay partidos.</div>`;

  const lista = partidosOficiales();
  const i = lista.indexOf(j);
  const flecha = (dir, destino, texto) => `<button class="mvp-nav__flecha" type="button" data-mvp-ir="${destino?.fecha ?? ''}"
    aria-label="${texto}" ${destino ? '' : 'disabled'}>${dir}</button>`;

  return `
    <div class="mvp-nav">
      ${flecha('←', lista[i - 1], 'Partido anterior')}
      <div class="mvp-nav__centro">
        <div class="mvp-nav__titulo">JORNADA ${j.numero ?? '—'} · MVP</div>
        <div class="mvp-nav__fecha">${fmtFechaLarga(j.fecha)}</div>
      </div>
      ${flecha('→', lista[i + 1], 'Partido siguiente')}
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
  if (mvpReparto.fecha !== j.fecha) mvpReparto = { fecha: j.fecha, puntos: {} };
  const candidatos = plantillaMVP(j).filter(n => claveMVP(n) !== claveMVP(jugador));
  const enviando = mvpEnviando === j.fecha;
  return `
    <div class="mvp-reparto">
      <div class="mvp-falta">${MVP_CIERRE}</div>
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
  if (mvpEnviando !== mvpReparto.fecha) zona.querySelector('[data-enviar]').disabled = quedan !== 0;
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
    <div class="mvp-cuenta"><b>${v.length} de ${total}</b> han votado<small>${MVP_CIERRE}</small></div>
    <div class="mvp-tuvoto">Tu voto: <b>${textoVoto(miVoto(j, jugador).votos)}</b></div>
    <div class="mvp-ranking">${rankingMVP(j).map((f, i) => filaRanking(f, i, { abierta: true })).join('')}</div>`;
}

function renderEnCursoMVP(j, jugador) {
  const v = votosDe(j), total = plantillaMVP(j).length;
  return `
    <div class="mvp-aviso">
      Votación en curso · <b>${v.length} de ${total}</b> han votado
      <small>${MVP_CIERRE}</small>
      ${jugador || getSessionPlayer() ? '' : '<button class="votacion-login__btn mvp-login" type="button" data-mvp-login>INICIAR SESIÓN</button>'}
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

function abrirMVP(fecha) {
  mvpElegida = fecha;
  if (STATE.activeTab === 'mvp') repintarMVP();
  else switchTab('mvp');
}

/* ── Enviar el voto ──────────────────────────────────────────────────────── */
function confirmarVotoMVP() {
  const zona = document.querySelector('.mvp-reparto');
  if (!zona || puntosUsados() !== MVP_PUNTOS || mvpEnviando != null) return;
  const nombres = Object.fromEntries([...zona.querySelectorAll('.mvp-carta')].map(c => [c.dataset.candidato, c.dataset.nombre]));
  const votos = Object.entries(mvpReparto.puntos)
    .map(([k, p]) => ({ nombre: nombres[k], puntos: p })).sort((a, b) => b.puntos - a.puntos);
  const fecha = mvpReparto.fecha;
  document.getElementById('mvpConfirmarTexto').textContent = `${textoVoto(votos)}. Una vez enviado no se puede cambiar.`;
  document.getElementById('mvpConfirmarSi').onclick = () => { closeModal('mvpModal'); enviarVotoMVP(fecha, votos); };
  openModal('mvpModal');
}

async function enviarVotoMVP(fecha, votos) {
  const votante = jugadorSesionMVP();
  if (!votante) return;
  mvpEnviando = fecha;
  const boton = document.querySelector('.mvp-enviar');
  if (boton) { boton.disabled = true; boton.textContent = 'enviando…'; }
  try {
    const j = partidosOficiales().find(x => x.fecha === fecha);
    await postVotoMVP(fecha, j?.numero, votante, votos);
    mvpEnviando = null;
    mvpEpoca++;
    mvpReparto = { fecha: null, puntos: {} };
    // Lo que ha confirmado el script, hasta la siguiente lectura de la hoja
    aplicarMVPs([...(STATE.mvps || []), { fecha_partido: fecha, jornada: j?.numero ?? null, votante, votos, fecha_voto: '' }]);
    avisoApp('Voto guardado', 'ok');
  } catch (e) {
    mvpEnviando = null;
    avisoApp(e.message);
    repintarMVP();
    // Si el script lo ha rechazado (ya votado, ya cerrada…), lo que hay que ver es lo de la hoja
    if (e.delServidor) leerHojaMVP();
  }
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
    if (ir) { if (ir.dataset.mvpIr) { mvpElegida = ir.dataset.mvpIr; repintarMVP(); } return; }
    if (e.target.closest('[data-mvp-reintentar]')) { leerHojaMVP(); return; }
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
  return votacionesFuturas().filter(v => !votoDe(v, jugador));
}

function pilaPendientes(sesion) {
  const votos = votacionesPendientes(sesion);
  if (!votos.length) return '';
  return `
    <div class="pendientes__pila">
      ${votos.length > 1 ? `<article class="voto voto--detras" aria-hidden="true">${renderVotoInner(votos[1], null)}</article>` : ''}
      <article class="voto voto--compacta" data-id="${votos[0].id}">${renderVotoInner(votos[0], sesion)}</article>
    </div>`;
}

function mvpPendientes(sesion) {
  const yo = fichaMVP(sesion);
  if (!yo) return '';
  // Leyendo la hoja: la rueda solo a quien puede tener el voto pendiente
  if (mvpLeyendo) {
    const ultimo = partidosOficiales().filter(tieneResultado).pop();
    return ultimo && enPlantilla(ultimo, yo) ? `<div class="pendiente-mvp pendiente-mvp--rueda"><span class="mvp-rueda mvp-rueda--mini" role="status" aria-label="Comprobando el voto del MVP"></span></div>` : '';
  }
  return pendienteMVP(yo).map(j => `
    <div class="pendiente-mvp">
      <span>Vota el MVP de la Jornada ${j.numero ?? '—'}</span>
      <button class="pendiente-mvp__btn" type="button" data-abrir-mvp="${j.fecha}">Votar →</button>
    </div>`).join('');
}

// Solo si hay algo: sin nada no queda ni el contenedor. Las cartas ocupan el sitio del marcador
// del último partido hasta que se hayan votado todas. Si la cabecera ya ha quedado por encima
// de la pantalla, la página no salta al cambiar de altura.
function actualizarPendientes() {
  const hero = document.getElementById('hero-section');
  if (!hero || hero.querySelector('.voto-card.is-dragging')) return;
  const sesion = getSessionPlayer();
  const pila = sesion ? pilaPendientes(sesion) : '';
  const mvp = sesion ? mvpPendientes(sesion) : '';
  if (pila === pendientesPila && mvp === pendientesMvp) return;

  const pagina = paginaDe('inicio');
  const actual = hero.querySelector('#pendientes');
  const antes = hero.offsetHeight;
  const fuera = pagina.scrollTop >= antes;
  hero.classList.toggle('hero-section--cartas', !!pila);

  if (actual && pila === pendientesPila && (pila || mvp)) {
    // Solo cambia el aviso del MVP: las cartas no se vuelven a pintar
    actual.querySelector('[data-pendiente-mvp]').innerHTML = mvp;
  } else {
    actual?.remove();
    if (pila || mvp) {
      hero.insertAdjacentHTML('beforeend', `<section class="pendientes" id="pendientes">
        <div class="sh"><span class="sh__title">PENDIENTES</span><span class="sh__line"></span></div>
        ${pila}<div class="pendientes__mvp" data-pendiente-mvp>${mvp}</div>
      </section>`);
      const nuevo = hero.querySelector('#pendientes');
      ajustarImagenes(nuevo);
      predecodificarImagenes(nuevo);
    }
  }
  pendientesPila = pila;
  pendientesMvp = mvp;
  if (fuera) pagina.scrollTop += hero.offsetHeight - antes;
}
