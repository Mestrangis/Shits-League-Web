/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — cliente de la API
   · rpc(): funciones slr_* de Postgres (/rest/v1/rpc/*) con el token de sesión
   · leer(): lecturas públicas de tablas (/rest/v1/tabla?…)
   · funcion(): Edge Function slr-simular (pronóstico, amistosos)
   Los mensajes de error del servidor se muestran tal cual en un toast.
   Rush nunca pide el código: ante un 403 (sesión caducada) se abre otra
   sesión en silencio con el código guardado y se repite la llamada una vez.
   Si el código ya no vale, sesionPerdida() cierra la sesión de Shits League.
   Sin acceso a la beta (error RUSH0 del servidor), sinAcceso() cierra Rush.
   Si el servidor ya no entiende la llamada (una función o columna que no
   existe: el código guardado es viejo), se actualiza la app (js/version.js).
   · accion(): las que mueven dinero o cartas, con un identificador por intento
     (slr_con_intento): si llega dos veces, el servidor no la repite.
   · Que nunca parezca que no pasa nada: toda llamada que cambia algo pone en
     «cargando» (desactivado, con un spinner) el botón que se acaba de tocar,
     hasta que hay respuesta, y no se puede tocar dos veces.
═══════════════════════════════════════════════ */
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { toast } from './ui.js';

export const TOKEN_KEY = 'SLR_TOKEN';

/* ── El botón de la acción, en «cargando» ────────────────────────────────── */
// Las que solo leen (o van solas, sin botón): no marcan nada. Cualquier otra, sí
export const LECTURAS = new Set(['slr_yo', 'slr_partido', 'slr_notificaciones', 'slr_clasificacion', 'slr_sobre_pendiente',
  'slr_sin_ver', 'slr_movimientos', 'slr_mis_tacticas', 'slr_mercado', 'slr_hueco_pendiente', 'slr_carta', 'slr_calendario',
  'slr_admin_bombo', 'slr_admin_cartas', 'slr_tienda', 'slr_rush_inicio', 'slr_rush_liga', 'slr_admin_progresion',
  'slr_marcar_visto', 'slr_anular_intento']);
let pulsado = null;   // { boton, t }: el último botón tocado
export function _pulsado(boton, t = Date.now()) { pulsado = boton ? { boton, t } : null; }   // y para las pruebas
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => { const b = e.target?.closest?.('button'); if (b) _pulsado(b); }, true);
}
// Pone en «cargando» el botón tocado hace un momento (si no lo está ya); devuelve cómo quitarlo
export function marcarBoton() {
  const p = pulsado;
  if (!p || Date.now() - p.t > 2000 || p.boton.isConnected === false || p.boton.classList?.contains('slr-esperando')) return () => {};
  const b = p.boton;
  b.disabled = true;
  b.classList.add('slr-esperando');
  b.setAttribute?.('aria-busy', 'true');
  return () => { b.disabled = false; b.classList.remove('slr-esperando'); b.removeAttribute?.('aria-busy'); };
}

// Peticiones a Supabase en curso (la precarga de fotos en segundo plano espera a que no haya)
let enCurso = 0;
export const enVuelo = () => enCurso;
async function pedir(url, opciones) {
  enCurso++;
  try { return await fetch(url, opciones); } finally { enCurso--; }
}

export class ErrorSesion extends Error {}

let ganchos = { reautenticar: async () => 'perdida', perdida: () => {}, sinAcceso: () => {} };
export function configurarSesion({ reautenticar, sesionPerdida, sinAcceso }) {
  ganchos = { reautenticar, perdida: sesionPerdida, sinAcceso };
}
const SIN_ACCESO = 'Shits League Rush está en beta cerrada y todavía no tienes acceso.';

export function token() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function borrarToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* sin persistencia */ }
}

async function leerRespuesta(r) {
  const texto = await r.text();
  let datos;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = { message: texto }; }
  // Versión vieja: la app se actualiza y se recarga (el error se enseña igual por si no hay versión nueva)
  if (!r.ok && globalThis.SLVersion?.esErrorDeVersion(r.status, datos)) {
    globalThis.SLVersion.forzarActualizacion();
    return { ...datos, message: 'La app se está actualizando a la última versión…' };
  }
  return datos;
}

// 403: nueva sesión silenciosa. true → repetir la llamada; si no, lanza.
async function renovar(mensaje) {
  borrarToken();
  let r;
  try { r = await ganchos.reautenticar(); } catch {
    toast('Sin conexión con el servidor', 'error');
    throw new Error('Sin conexión');
  }
  if (r === 'ok') return true;
  if (r === 'sin_acceso') { ganchos.sinAcceso(); throw new ErrorSesion(SIN_ACCESO); }
  ganchos.perdida();
  throw new ErrorSesion(mensaje || 'Tu sesión ha caducado');
}

// Hace la petición; con un 403 renueva la sesión y la repite una sola vez
async function conSesion(hacer) {
  let r = await hacer();
  if (r.status === 403 && await renovar()) r = await hacer();
  if (r.status === 403) {
    ganchos.perdida();
    throw new ErrorSesion('Tu sesión ha caducado');
  }
  return r;
}

// silencioso: no muestra el toast (quien llama decide qué hacer con el error)
export async function rpc(fn, args = {}, opciones = {}) {
  const quitar = LECTURAS.has(fn) ? () => {} : marcarBoton();
  try { return await llamar(fn, args, opciones); } finally { quitar(); }
}
async function llamar(fn, args = {}, { silencioso = false } = {}) {
  let r;
  try {
    r = await conSesion(() => pedir(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token(), ...args }),
    }));
  } catch (e) {
    if (e instanceof ErrorSesion) throw e;
    if (e.message === 'Sin conexión') { e.red = true; throw e; }
    const err = new Error('Sin conexión con el servidor');
    err.red = true;   // de red: no se sabe si llegó (las compras lo preguntan con su intento)
    if (!silencioso) toast(err.message, 'error');
    throw err;
  }
  const datos = await leerRespuesta(r);
  if (datos?.code === 'RUSH0') { ganchos.sinAcceso(); throw new ErrorSesion(datos.message); }
  if (!r.ok) {
    const e = new Error(datos?.message || `Error en ${fn}`);
    if (!silencioso) toast(e.message, 'error');
    throw e;
  }
  return datos;
}

// Una acción que mueve dinero o cartas, con un identificador por intento (slr_con_intento). Si la
// conexión falla sin saber si ha llegado, se repite UNA vez con el MISMO intento: si ya se
// hizo, el servidor devuelve lo mismo que la primera vez, sin volver a hacerla
export async function accion(fn, args = {}, opciones = {}) {
  const quitar = marcarBoton();
  const intento = nuevoIntento();
  const pedirla = silencioso => llamar('slr_con_intento', { intento, funcion: fn, args }, { ...opciones, silencioso });
  try {
    try {
      return await pedirla(true);
    } catch (e) {
      if (e instanceof ErrorSesion) throw e;
      if (!e.red) { if (!opciones.silencioso) toast(e.message, 'error'); throw e; }
      await new Promise(r => setTimeout(r, 1200));
      return await pedirla(opciones.silencioso);
    }
  } finally { quitar(); }
}

// Identificador de un intento de compra (o de elección): si la petición llega dos veces, el servidor no cobra otra vez
export function nuevoIntento() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function leer(ruta) {
  const r = await pedir(`${SUPABASE_URL}/rest/v1/${ruta}`, { headers: { apikey: SUPABASE_KEY } });
  const datos = await leerRespuesta(r);
  if (!r.ok) {
    const e = new Error(datos?.message || 'No se pudieron leer los datos');
    toast(e.message, 'error');
    throw e;
  }
  return datos;
}

export async function funcion(cuerpo) {
  let r;
  try {
    r = await conSesion(() => pedir(`${SUPABASE_URL}/functions/v1/slr-simular`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token(), ...cuerpo }),
    }));
  } catch (e) {
    if (e instanceof ErrorSesion || e.message === 'Sin conexión') throw e;
    toast('Sin conexión con el servidor', 'error');
    throw new Error('Sin conexión');
  }
  const datos = await leerRespuesta(r);
  if (datos?.error === SIN_ACCESO) { ganchos.sinAcceso(); throw new ErrorSesion(datos.error); }
  if (!r.ok) {
    const e = new Error(datos?.error || 'Error en el servidor');
    toast(e.message, 'error');
    throw e;
  }
  return datos;
}
