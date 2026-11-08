/* ═══════════════════════════════════════════════
   SHITS LEAGUE — agujero-app.js
   La temporada «???» mientras es la próxima: en vez de la temporada, el agujero a
   pantalla completa (js/agujero.js), encima de todo salvo los modales. No cambia la
   temporada que se está viendo: al salir, todo sigue donde estaba.
   La fase la dice el ajuste «agujero» de Supabase (panel de admin). Los votos están
   en el Apps Script, que es quien sabe el recuento.
   Se entra por #agujero: así vuelve el botón atrás y abren las notificaciones.
═══════════════════════════════════════════════ */

const AGUJERO_KEY = 'SL_AGUJERO';
const AGUJERO_DEFECTO = { fase: 'agujero', pregunta: '¿Quieres temporada 26/27?', resultado: null };
const FASES_AGUJERO = ['agujero', 'votacion', 'cerrada'];

function leerAgujeroGuardado() {
  try { return { ...AGUJERO_DEFECTO, ...JSON.parse(localStorage.getItem(AGUJERO_KEY) || '{}') }; } catch { return { ...AGUJERO_DEFECTO }; }
}
let agujeroAjuste = leerAgujeroGuardado();
let agujeroVoto = null;
let agujeroEnviando = 0;      // con un voto en camino, lo que se lea del servidor ya es viejo
let agujeroVista = null;      // { capa, raiz, control, firma }
let agujeroPedido = false;
let moduloAgujero = null;

function guardarAgujero() {
  try { localStorage.setItem(AGUJERO_KEY, JSON.stringify(agujeroAjuste)); } catch { /* la próxima vez, del servidor */ }
}

// La fase y la pregunta del servidor; false si no se ha podido saber
async function pedirAjusteAgujero(ms = 4000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const { url, key } = SUPABASE_PUBLICO;
    const r = await fetch(`${url}/rest/v1/ajustes?clave=eq.agujero&select=valor`, { headers: { apikey: key }, signal: c.signal });
    if (!r.ok) return false;
    const v = (await r.json())?.[0]?.valor;
    if (!FASES_AGUJERO.includes(v?.fase)) return false;
    agujeroAjuste = { ...agujeroAjuste, fase: v.fase, pregunta: v.pregunta || AGUJERO_DEFECTO.pregunta };
    guardarAgujero();
    return true;
  } catch { return false; } finally { clearTimeout(t); }
}

function opcionesAgujero() {
  const { fase, pregunta, resultado } = agujeroAjuste;
  const t = temporadaAgujero();
  return {
    fase,
    pregunta: escaparApp(pregunta),
    voto: agujeroVoto,
    sesion: !!getSessionPlayer(),
    resultado: fase === 'cerrada' ? resultado : null,
    beta: !!t && puedeAbrirTemporada(t),
    onLogin: () => openSessionModal(),
    onEntrar: () => { const id = temporadaAgujero()?.id; cerrarAgujero(); if (id) switchSeason(id); },
    onVoto: votarAgujero,
  };
}
// Lo que obliga a montarlo otra vez. El voto no: se pinta sin volver a empezar
const firmaAgujero = o => JSON.stringify([o.fase, o.pregunta, o.sesion, o.resultado, o.beta]);

async function votarAgujero(si) {
  const antes = agujeroVoto;
  agujeroVoto = si;
  agujeroEnviando++;
  try {
    await postScript({ action: 'votarAgujero', codigo: getSessionCode(), voto: si });
  } catch (e) {
    agujeroVoto = antes;
    agujeroVista?.control?.votado(antes);
    avisoApp(e.message);
  } finally {
    agujeroEnviando--;
  }
}

async function pintarAgujero() {
  moduloAgujero ??= import('./agujero.js');
  const { montarAgujero } = await moduloAgujero;
  if (!agujeroPedido || !agujeroVista) return;
  const o = opcionesAgujero();
  agujeroVista.control?.destruir();
  agujeroVista.control = montarAgujero(agujeroVista.raiz, o);
  agujeroVista.firma = firmaAgujero(o);
}

// El estado real: al abrirlo, al volver a primer plano y al cambiar de sesión
async function actualizarAgujero() {
  if (!agujeroPedido) return;
  await pedirAjusteAgujero();
  if (!temporadaAgujero()) { cerrarAgujero(); return; }   // ya ha empezado
  if (agujeroAjuste.fase !== 'agujero') {
    try {
      const r = await postScript({ action: 'agujeroEstado', codigo: getSessionCode() || '' });
      if (!agujeroEnviando) agujeroVoto = r.voto;
      agujeroAjuste.resultado = r.resultado;
      guardarAgujero();
    } catch (e) { console.warn('[agujero] No se ha podido leer el estado:', e.message); }
  }
  if (!agujeroPedido || !agujeroVista) return;
  if (agujeroVista.firma !== firmaAgujero(opcionesAgujero())) await pintarAgujero();
  else if (agujeroAjuste.fase === 'votacion' && !agujeroEnviando) agujeroVista.control?.votado(agujeroVoto);
}

function mostrarAgujero() {
  if (!temporadaAgujero()) {
    if (location.hash === '#agujero') history.replaceState(history.state, '', `#${STATE.activeTab}`);
    return;
  }
  agujeroPedido = true;
  if (agujeroVista) return;
  const capa = document.createElement('div');
  capa.className = 'agujero-capa';
  capa.innerHTML = `<div class="agujero-raiz"></div>
    <select class="agujero-selector" aria-label="Temporada">${TEMPORADAS.filter(temporadaEnSelector).map(t => `
      <option value="${t.id}"${esAgujero(t) ? ' selected' : ''}>${t.etiqueta}</option>`).join('')}
    </select>`;
  document.body.appendChild(capa);
  capa.querySelector('select').addEventListener('change', e => {
    const id = e.target.value;
    cerrarAgujero();
    elegirTemporada(id);
  });
  agujeroVista = { capa, raiz: capa.querySelector('.agujero-raiz'), control: null, firma: '' };
  pintarAgujero().catch(e => console.warn('[agujero] No se ha podido montar:', e.message));
  actualizarAgujero();
}

// Sale y para la animación y el sonido. Lo que estaba debajo sigue igual
function cerrarAgujero() {
  agujeroPedido = false;
  agujeroVista?.control?.destruir();
  agujeroVista?.capa.remove();
  agujeroVista = null;
  if (location.hash === '#agujero') history.replaceState(history.state, '', `#${STATE.activeTab}`);
}

// Desde el selector: con entrada en el historial, para que el botón atrás vuelva
function abrirAgujero() {
  if (location.hash === '#agujero') mostrarAgujero();
  else location.hash = 'agujero';
}

function initAgujero() {
  window.addEventListener('hashchange', () => {
    if (location.hash === '#agujero') mostrarAgujero();
    else if (agujeroPedido) cerrarAgujero();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) actualizarAgujero(); });
  if (location.hash === '#agujero') mostrarAgujero();
}
