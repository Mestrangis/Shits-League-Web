/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — datos guardados de cada pantalla
   La última respuesta de cada pantalla (clave: 'base' para lo de la entrada,
   'mercado', 'liga', 'perfil'…) se guarda en memoria y en IndexedDB, por
   jugador y liga (ámbito):
   · De hace menos de DATOS_FRESCOS_MS (15 s, config.js): se enseña tal cual.
   · Más vieja: se enseña de fondo, atenuada, mientras llega la fresca (rush.js).
   · Al hacer una acción que cambia datos, se invalida (se sigue pudiendo
     enseñar de fondo, pero ya no cuenta como fresca).
   Una sola petición a la vez por clave: si ya se está pidiendo, se espera a esa.
═══════════════════════════════════════════════ */
import { DATOS_FRESCOS_MS } from './config.js';

const memoria = new Map();      // `${ámbito}|${clave}` → { t, datos }
const enCurso = new Map();      // `${ámbito}|${clave}` → promesa
let ambito = '';
let ahora = () => Date.now();
export function _reloj(f) { ahora = f; }   // pruebas

export function fijarAmbito(a) { ambito = a ?? ''; }
const k = clave => `${ambito}|${clave}`;

/* ── IndexedDB (si no hay, solo memoria) ───────────────────────────────── */
let db = null;
function abrirDb() {
  return (db ??= new Promise(res => {
    try {
      const pet = globalThis.indexedDB?.open('slr-datos', 1);
      if (!pet) { res(null); return; }
      pet.onupgradeneeded = () => pet.result.createObjectStore('pantallas');
      pet.onsuccess = () => res(pet.result);
      pet.onerror = () => res(null);
    } catch { res(null); }
  }));
}
async function idb(modo, hacer) {
  const base = await abrirDb();
  if (!base) return undefined;
  return new Promise(res => {
    try {
      const tx = base.transaction('pantallas', modo);
      const pet = hacer(tx.objectStore('pantallas'));
      tx.oncomplete = () => res(pet?.result);
      tx.onerror = tx.onabort = () => res(undefined);
    } catch { res(undefined); }
  });
}

/* ── API ───────────────────────────────────────────────────────────────── */
export const esFresco = e => !!e && e.t > 0 && ahora() - e.t < DATOS_FRESCOS_MS;

// La última respuesta guardada de esa pantalla ({ t, datos }) o null
export async function guardado(clave) {
  const m = memoria.get(k(clave));
  if (m) return m;
  const d = await idb('readonly', s => s.get(k(clave)));
  if (d && !memoria.has(k(clave))) memoria.set(k(clave), d);
  return memoria.get(k(clave)) ?? null;
}
// Lo que hay en memoria ahora mismo (sin esperar a IndexedDB)
export const enMemoria = clave => memoria.get(k(clave)) ?? null;

export function guardar(clave, datos) {
  const e = { t: ahora(), datos };
  memoria.set(k(clave), e);
  idb('readwrite', s => s.put(e, k(clave)));
  return e;
}

// Tras una acción: deja de ser fresca (se sigue pudiendo enseñar de fondo)
export function invalidar(...claves) {
  for (const c of claves) {
    const e = memoria.get(k(c));
    if (e) { e.t = 0; idb('readwrite', s => s.put(e, k(c))); }
  }
}

// Pide los datos frescos de una pantalla (una sola petición a la vez por clave) y los guarda
export function pedir(clave, cargar) {
  const id = k(clave);
  if (enCurso.has(id)) return enCurso.get(id);
  const ambitoAntes = ambito;
  const p = Promise.resolve().then(cargar).then(datos => {
    if (ambito === ambitoAntes) guardar(clave, datos);
    return datos;
  }).finally(() => enCurso.delete(id));
  enCurso.set(id, p);
  return p;
}

// Todo fuera (al cerrar la sesión)
export async function olvidarTodo() {
  memoria.clear();
  await idb('readwrite', s => s.clear());
}
