/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: sonido
   Cada momento de la animación lanza un aviso con nombre: sonar('gol').
   · SONIDOS: cada nombre, su lista de archivos (audio/partido/). Si hay varios,
     cada vez uno al azar, sin repetir el mismo dos veces seguidas.
   · Web Audio: cada archivo se decodifica una vez y suena sin retraso, pudiendo
     solaparse. Volumen = general × el de ese sonido (ajustes.js, «sonido»).
   · Se descargan en segundo plano después de entrar en Rush (precargarSonidos,
     desde rush.js; el service worker los guarda en su caché). NO van en la
     descarga de JUGAR: si un partido empieza antes de que estén, no suenan.
   · «ambiente»: la grada, muy bajita y en bucle durante la reproducción, con
     fundido al empezar y al acabar; se para al pausar, al cerrar y al silenciar.
   · En iPhone el audio se «desbloquea» con el primer toque del usuario.
   · El silencio se recuerda en el navegador. Nada de vibración.
═══════════════════════════════════════════════ */
import { AJUSTES } from './config.js';

const A = n => `audio/partido/${n}.mp3`;
const varios = (n, k) => Array.from({ length: k }, (_, i) => A(`${n}_${i + 1}`));
export const SONIDOS = {
  silbato_inicio: [A('silbato_inicio')],
  saque: [A('saque')],
  patada: varios('patada', 3),
  bote: varios('bote', 2),
  choque: varios('choque', 3),
  regate: varios('regate', 2),
  robo: [A('robo')],
  contraataque: [A('contraataque')],
  corte: varios('corte', 3),
  ruleta: [A('ruleta')],
  chut: varios('chut', 3),
  fuego: varios('fuego', 2),
  gol: varios('gol', 3),
  parada: varios('parada', 3),
  sorpresa: [A('sorpresa')],
  poder: varios('poder', 2),
  lesion: [A('lesion')],
  plan_b: [A('plan_b')],
  silbato_descanso: [A('silbato_descanso')],
  silbato_final: [A('silbato_final')],
  ambiente: [A('ambiente')],
};
// Las rutas son desde la raíz de la web (este archivo está en js/slr/partido/)
const url = ruta => new URL(`../../../${ruta}`, import.meta.url).href;

const CLAVE = 'slr_partido_silencio';
let silencio = (() => { try { return localStorage.getItem(CLAVE) === '1'; } catch { return false; } })();
// Para enganchar otra cosa (tests…): OYENTES recibe cada aviso aunque no haya archivo;
// AL_SONAR, cada sonido que de verdad suena ({ nombre, url, volumen })
export const OYENTES = new Set();
export const AL_SONAR = new Set();

const buffers = new Map();   // url → AudioBuffer (ya decodificado)
const ultimo = new Map();    // nombre → índice de la última variación que sonó
const activos = new Set();   // fuentes sonando (para cortarlas al silenciar)
let ac = null;

const Contexto = globalThis.AudioContext ?? globalThis.webkitAudioContext;
function contexto() {
  if (!ac && Contexto) ac = new Contexto();
  return ac;
}
const volumen = nombre => (AJUSTES.sonido?.general ?? 1) * (AJUSTES.sonido?.[nombre] ?? 1);

/* ── Desbloqueo (iPhone y Safari): con el primer toque ─────────────────────── */
// El contexto se crea parado; un toque del usuario lo pone en marcha (y un sonido vacío,
// que es lo que pide iOS). Se quita en cuanto suena.
const GESTOS = ['pointerdown', 'touchend', 'click', 'keydown'];
export function desbloquear() {
  const c = contexto();
  if (!c) return;
  if (c.state !== 'running') c.resume?.().catch(() => {});
  try {
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, 22050);
    s.connect(c.destination);
    s.start(0);
  } catch { /* nada */ }
  if (c.state === 'running') for (const g of GESTOS) globalThis.document?.removeEventListener(g, desbloquear, true);
}
if (globalThis.document) for (const g of GESTOS) document.addEventListener(g, desbloquear, { capture: true, passive: true });
// Con la app en segundo plano no suena nada (y al volver, sigue donde iba)
globalThis.document?.addEventListener('visibilitychange', () => {
  if (!ac) return;
  if (document.visibilityState === 'hidden') ac.suspend?.().catch(() => {}); else ac.resume?.().catch(() => {});
});

/* ── Descarga (en segundo plano, tras entrar en Rush) ──────────────────────── */
let precarga = null;
export function precargarSonidos() {
  if (precarga || !Contexto) return precarga ?? Promise.resolve();
  const urls = [...new Set(Object.values(SONIDOS).flat())].map(url);
  let i = 0;
  const trabajador = async () => {
    while (i < urls.length) {
      const u = urls[i++];
      if (buffers.has(u)) continue;
      try {
        const r = await fetch(u, { priority: 'low' });
        if (!r.ok) continue;
        const datos = await r.arrayBuffer();
        // (con la forma de callback también vale en Safari viejo)
        const b = await new Promise((res, rej) => { const p = contexto().decodeAudioData(datos, res, rej); p?.catch?.(rej); });
        buffers.set(u, b);
        if (u === url(SONIDOS.ambiente[0]) && ambiente.querido) arrancarAmbiente();
      } catch { /* ese no sonará */ }
    }
  };
  precarga = Promise.all([trabajador(), trabajador()]);
  return precarga;
}
export const estadoSonidos = () => ({
  cargados: buffers.size, total: new Set(Object.values(SONIDOS).flat()).size,
  contexto: ac?.state ?? null, activos: activos.size, ambiente: !!ambiente.fuente, silencio,
});

/* ── Sonar ─────────────────────────────────────────────────────────────────── */
// Una variación al azar, sin repetir la última
function elegir(nombre) {
  const lista = SONIDOS[nombre];
  if (!lista?.length) return null;
  let k = Math.floor(Math.random() * lista.length);
  if (lista.length > 1 && k === ultimo.get(nombre)) k = (k + 1 + Math.floor(Math.random() * (lista.length - 1))) % lista.length;
  ultimo.set(nombre, k);
  return url(lista[k]);
}
function reproducirBuffer(b, vol, { bucle = false, fundido = 0 } = {}) {
  const c = contexto();
  const s = c.createBufferSource();
  s.buffer = b;
  s.loop = bucle;
  const g = c.createGain();
  if (fundido) { g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(vol, c.currentTime + fundido); }
  else g.gain.value = vol;
  s.connect(g).connect(c.destination);
  s.start();
  const f = { s, g };
  activos.add(f);
  s.onended = () => activos.delete(f);
  return f;
}
function cortar(f, fundido = 0) {
  if (!f) return;
  const c = contexto();
  try {
    if (fundido) {
      f.g.gain.cancelScheduledValues(c.currentTime);
      f.g.gain.setValueAtTime(f.g.gain.value, c.currentTime);
      f.g.gain.linearRampToValueAtTime(0, c.currentTime + fundido);
      f.s.stop(c.currentTime + fundido);
    } else f.s.stop();
  } catch { /* ya parada */ }
  activos.delete(f);
}

export const silenciado = () => silencio;
export function silenciar(si) {
  silencio = !!si;
  try { localStorage.setItem(CLAVE, silencio ? '1' : '0'); } catch { /* sin almacenamiento */ }
  if (silencio) { for (const f of [...activos]) cortar(f); ambiente.fuente = null; }
  else if (ambiente.querido && !ambiente.pausado) arrancarAmbiente();
}

export function sonar(nombre, datos = {}) {
  for (const f of OYENTES) { try { f(nombre, datos); } catch { /* nada */ } }
  if (silencio || nombre === 'ambiente') return;
  const vol = volumen(nombre);
  if (!(vol > 0)) return;                      // 0 = no suena
  const u = elegir(nombre);
  const b = u && buffers.get(u);
  if (!b || !contexto()) return;               // aún sin descargar: no suena (nunca tarde)
  try { reproducirBuffer(b, vol); } catch { return; }
  for (const f of AL_SONAR) { try { f({ nombre, url: u, volumen: vol }); } catch { /* nada */ } }
}

/* ── Ambiente (la grada, en bucle) ─────────────────────────────────────────── */
const FUNDIDO_ENTRA = 1.5, FUNDIDO_SALE = 0.8;
const ambiente = { querido: false, pausado: false, fuente: null };
function arrancarAmbiente() {
  if (silencio || ambiente.fuente || ambiente.pausado || !ambiente.querido) return;
  const vol = volumen('ambiente');
  const b = buffers.get(url(SONIDOS.ambiente[0]));
  if (!(vol > 0) || !b || !contexto()) return;
  try { ambiente.fuente = reproducirBuffer(b, vol, { bucle: true, fundido: FUNDIDO_ENTRA }); } catch { return; }
  for (const f of AL_SONAR) { try { f({ nombre: 'ambiente', url: url(SONIDOS.ambiente[0]), volumen: vol }); } catch { /* nada */ } }
}
function pararFuenteAmbiente() { cortar(ambiente.fuente, FUNDIDO_SALE); ambiente.fuente = null; }
// Al abrir el reproductor y al cerrarlo
export function empezarAmbiente() { ambiente.querido = true; ambiente.pausado = false; arrancarAmbiente(); }
export function pararAmbiente() { ambiente.querido = false; ambiente.pausado = false; pararFuenteAmbiente(); }
// Pausa (⏸ del muestrario, o la app en segundo plano)
export function pausarAmbiente(si) {
  ambiente.pausado = !!si;
  if (si) pararFuenteAmbiente(); else arrancarAmbiente();
}
