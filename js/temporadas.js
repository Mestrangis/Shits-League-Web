/* ═══════════════════════════════════════════════
   SHITS LEAGUE — temporadas.js
   Las temporadas de la liga, de la más nueva a la más vieja. Añadir una es añadir
   una entrada aquí (y su hoja en apps-script/votos.gs).
     hoja:     ID de su Google Sheet (Jugadores, Jornadas, Votaciones, MVPs). Sin ID, vacía.
     imagenes: solo unas imágenes, sin hoja (las temporadas de antes de la web).
     rush:     Rush existe en esta temporada.
   Qué es cada una lo dice el ajuste temporada_en_curso de Supabase (el botón «Empezar la
   temporada» del Modo pruebas):
     · la en curso: la de por defecto, con todas las pestañas;
     · las más nuevas: próximas, igual que una en curso pero solo para los usuarios beta;
     · las más viejas: archivo, solo el historial, sin votar.
═══════════════════════════════════════════════ */

const TEMPORADAS = [
  { id: '26-27', etiqueta: 'Temporada 26/27', corta: '26/27', hoja: '', rush: true },
  { id: '24-26', etiqueta: 'Temporada 24/26', corta: '24/26', hoja: '1EHGrFt2Y3QDCOdSV3fVgWvspzXYcir4SmDxOezdSLRY' },
  { id: '23-24', etiqueta: 'Temporada 23/24', corta: '23/24', imagenes: [
    { src: 'assets/clasificación23-24.png', alt: 'Clasificación 23-24' },
    { src: 'assets/goles23-24.png',         alt: 'Goleadores 23-24' },
    { src: 'assets/Draft 2024.jpg',         alt: 'Draft 2024' },
  ] },
];

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
let temporadaEnCursoId = leerEnCursoGuardada() ?? TEMPORADA_EN_CURSO_INICIAL;

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
