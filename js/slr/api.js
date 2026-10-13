/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — cliente de la API
   · rpc(): funciones slr_* de Postgres (/rest/v1/rpc/*) con el token de sesión
   · leer(): lecturas públicas de tablas (/rest/v1/tabla?…)
   · funcion(): Edge Function slr-simular (pronóstico, amistosos)
   Los mensajes de error del servidor se muestran tal cual en un toast.
   Un 403 (sesión caducada) borra el token y avisa con alCaducarSesion().
═══════════════════════════════════════════════ */
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { toast } from './ui.js';

export const TOKEN_KEY = 'SLR_TOKEN';

export class ErrorSesion extends Error {}

let caducada = () => {};
export function alCaducarSesion(fn) { caducada = fn; }

export function token() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function borrarToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* sin persistencia */ }
}

async function leerRespuesta(r) {
  const texto = await r.text();
  try { return texto ? JSON.parse(texto) : null; } catch { return { message: texto }; }
}

function sesionCaducada(mensaje) {
  borrarToken();
  caducada();
  return new ErrorSesion(mensaje || 'Tu sesión de Rush ha caducado');
}

// silencioso: no muestra el toast (quien llama decide qué hacer con el error)
export async function rpc(fn, args = {}, { silencioso = false } = {}) {
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token(), ...args }),
    });
  } catch {
    const e = new Error('Sin conexión con el servidor');
    if (!silencioso) toast(e.message, 'error');
    throw e;
  }
  const datos = await leerRespuesta(r);
  if (r.status === 403) throw sesionCaducada(datos?.message);
  if (!r.ok) {
    const e = new Error(datos?.message || `Error en ${fn}`);
    if (!silencioso) toast(e.message, 'error');
    throw e;
  }
  return datos;
}

export async function leer(ruta) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, { headers: { apikey: SUPABASE_KEY } });
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
    r = await fetch(`${SUPABASE_URL}/functions/v1/slr-simular`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token(), ...cuerpo }),
    });
  } catch {
    toast('Sin conexión con el servidor', 'error');
    throw new Error('Sin conexión');
  }
  const datos = await leerRespuesta(r);
  if (r.status === 403) throw sesionCaducada(datos?.error);
  if (!r.ok) {
    const e = new Error(datos?.error || 'Error en el servidor');
    toast(e.message, 'error');
    throw e;
  }
  return datos;
}
