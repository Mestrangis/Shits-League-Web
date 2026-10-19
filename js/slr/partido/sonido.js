/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: sonido (preparado)
   Cada momento de la animación lanza un aviso con nombre: sonar('gol').
   De momento no suena nada: el mapa está vacío. Para añadir sonidos, basta con
   poner los archivos (p. ej. en audio/partido/) y escribir su ruta aquí.
   El silencio se recuerda en el navegador.
═══════════════════════════════════════════════ */

export const SONIDOS = {
  silbato_inicio: '',
  saque: '',
  patada: '',
  bote: '',
  choque: '',
  robo: '',
  contraataque: '',
  sorpresa: '',
  regate: '',
  corte: '',
  ruleta: '',
  chut: '',
  parada: '',
  gol: '',
  poder: '',
  lesion: '',
  silbato_descanso: '',
  silbato_final: '',
};

const CLAVE = 'slr_partido_silencio';
let silencio = (() => { try { return localStorage.getItem(CLAVE) === '1'; } catch { return false; } })();
const audios = new Map();
// Para enganchar otra cosa (tests, vibración visual…): recibe cada aviso aunque no haya archivo
export const OYENTES = new Set();

export const silenciado = () => silencio;
export function silenciar(si) {
  silencio = !!si;
  try { localStorage.setItem(CLAVE, silencio ? '1' : '0'); } catch { /* sin almacenamiento */ }
}

export function sonar(nombre, datos = {}) {
  for (const f of OYENTES) { try { f(nombre, datos); } catch { /* nada */ } }
  const url = SONIDOS[nombre];
  if (silencio || !url) return;
  let a = audios.get(url);
  if (!a) { a = new Audio(url); a.preload = 'auto'; audios.set(url, a); }
  try { a.currentTime = 0; a.play().catch(() => {}); } catch { /* sin audio */ }
}
