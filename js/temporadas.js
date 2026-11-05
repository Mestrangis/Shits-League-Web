/* ═══════════════════════════════════════════════
   SHITS LEAGUE — temporadas.js
   Qué es cada temporada. La lista (TEMPORADAS) y los enlaces se editan en ajustes.js, en
   la raíz, y llegan por js/lector-ajustes.js.
   Qué es cada una lo dice el ajuste temporada_en_curso de Supabase (el botón «Empezar la
   temporada» del Modo pruebas):
     · la en curso: la de por defecto, con todas las pestañas;
     · las más nuevas: próximas, igual que una en curso pero solo para los usuarios beta;
     · las más viejas: archivo, solo el historial, sin votar.
═══════════════════════════════════════════════ */

// Lo mismo que js/slr/config.js (público), que es de Rush y no se carga hasta pulsar JUGAR.
// tests/slr/temporadas.test.mjs comprueba que coinciden.
const SUPABASE_PUBLICO = { url: 'https://vtqhefwspnqsjskqkxqg.supabase.co', key: 'sb_publishable_VOrswpNPw1A9U4QoKEWdGQ_Rwr0DR4H' };
const TEMPORADA_EN_CURSO_INICIAL = '24-26';
const TEMPORADA_EN_CURSO_KEY = 'SL_TEMPORADA_EN_CURSO';

const temporadaPorId = id => TEMPORADAS.find(t => t.id === id);

function leerEnCursoGuardada() {
  try {
    const id = localStorage.getItem(TEMPORADA_EN_CURSO_KEY);
    return temporadaPorId(id) ? id : null;
  } catch { return null; }
}
// Si la inicial ya no está en ajustes.js, la más nueva con datos
const enCursoInicial = () => (temporadaPorId(TEMPORADA_EN_CURSO_INICIAL) ? TEMPORADA_EN_CURSO_INICIAL : (TEMPORADAS.find(t => !t.imagenes) ?? TEMPORADAS[0]).id);
let temporadaEnCursoId = leerEnCursoGuardada() ?? enCursoInicial();

// Lo que dice el servidor (null si no se ha podido saber). Una lectura pequeña, sin nada más de Rush
async function pedirTemporadaEnCurso(ms = 4000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const { url, key } = SUPABASE_PUBLICO;
    const r = await fetch(`${url}/rest/v1/ajustes?clave=eq.temporada_en_curso&select=valor`, { headers: { apikey: key }, signal: c.signal });
    if (!r.ok) return null;
    const id = (await r.json())?.[0]?.valor;
    return temporadaPorId(id) ? id : null;
  } catch { return null; } finally { clearTimeout(t); }
}

function guardarTemporadaEnCurso(id) {
  temporadaEnCursoId = id;
  try { localStorage.setItem(TEMPORADA_EN_CURSO_KEY, id); } catch { /* la próxima vez, otra vez del servidor */ }
}

// 'imagenes' | 'proxima' | 'en_curso' | 'archivo'
function modoTemporada(t) {
  if (t.imagenes) return 'imagenes';
  const i = TEMPORADAS.indexOf(t), curso = TEMPORADAS.findIndex(x => x.id === temporadaEnCursoId);
  return i < curso ? 'proxima' : i === curso ? 'en_curso' : 'archivo';
}
const temporadaProxima = () => TEMPORADAS[TEMPORADAS.findIndex(t => t.id === temporadaEnCursoId) - 1] ?? null;
const temporadaAnteriorAlCurso = () => TEMPORADAS[TEMPORADAS.findIndex(t => t.id === temporadaEnCursoId) + 1] ?? null;

// ¿Esta sesión puede abrir la temporada? Las próximas, solo los usuarios beta
function puedeAbrirTemporada(t) {
  return modoTemporada(t) !== 'proxima' || (!!getSessionPlayer() && rushAccesoGuardado() === true);
}
// ¿Sale en el selector? Sin sesión aún no se sabe si es beta: sale, y al elegirla se pide el código
const temporadaEnSelector = t => puedeAbrirTemporada(t) || (modoTemporada(t) === 'proxima' && !getSessionPlayer());

// La temporada con Rush que puede abrir esta sesión
const temporadaConRush = () => TEMPORADAS.find(t => t.rush && puedeAbrirTemporada(t)) ?? null;
