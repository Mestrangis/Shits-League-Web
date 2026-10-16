// Utilidades comunes para los scripts que prueban la API real de SLR.
import { readFileSync } from 'node:fs';
import { SUPABASE_URL, SUPABASE_KEY } from '../../js/slr/config.js';

/* ── Entorno (.env.local) ────────────────────────────────────────────────── */
export const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => /^\w+=/.test(l))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

export function exigirEnv(...claves) {
  for (const k of claves) {
    if (!env[k]) { console.error(`Falta ${k} en .env.local`); process.exit(1); }
  }
}

/* ── API ─────────────────────────────────────────────────────────────────── */
const BASE = `${SUPABASE_URL}/rest/v1`;

export async function pedir(metodo, ruta, cuerpo) {
  const r = await fetch(`${BASE}/${ruta}`, {
    method: metodo,
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let datos;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  return { ok: r.ok, status: r.status, datos, mensaje: datos?.message ?? '' };
}
export const rpc = (fn, cuerpo) => pedir('POST', `rpc/${fn}`, cuerpo);
export const leer = ruta => pedir('GET', ruta);

// Llama y exige éxito: devuelve los datos o lanza con el mensaje del servidor
export async function rpcOk(fn, cuerpo) {
  const r = await rpc(fn, cuerpo);
  if (!r.ok) throw new Error(`${fn}: HTTP ${r.status} ${r.mensaje}`);
  return r.datos;
}

/* ── Mini runner ─────────────────────────────────────────────────────────── */
export const resultado = { total: 0, fallos: 0 };

export function check(condicion, que, detalle = '') {
  resultado.total++;
  if (condicion) console.log(`  ✔ ${que}`);
  else { resultado.fallos++; console.log(`  ✖ ${que}${detalle ? ` — ${detalle}` : ''}`); }
  return condicion;
}

export function rechaza(r, contiene, que) {
  return check(!r.ok && r.mensaje.toLowerCase().includes(contiene.toLowerCase()), que,
    r.ok ? `se aceptó: ${JSON.stringify(r.datos).slice(0, 120)}` : `HTTP ${r.status}: ${r.mensaje}`);
}

export const seccion = t => console.log(`\n${t}`);

/* ── Lecturas de estado ──────────────────────────────────────────────────── */
// Todas las cartas de una liga con su diseño
export async function cartasLiga(liga) {
  const r = await leer(`cartas?select=id,diseno_id,equipo_id,blindada_hasta,multiplicador_clausula,reservada_por,` +
    `disenos_carta(nombre,tipo,rareza,acabado,valor,ata,def,con)&liga_id=eq.${liga}&limit=5000`);
  if (!r.ok) throw new Error(`cartas: ${r.mensaje}`);
  return r.datos;
}

export async function subastasAbiertas(liga) {
  return (await leer(`subastas?select=id,carta_id,tanda,cierra_en,estado&liga_id=eq.${liga}&estado=eq.abierta`)).datos;
}

export async function saldo(equipo) {
  return (await leer(`equipos?select=saldo&id=eq.${equipo}`)).datos[0].saldo;
}

// Invariantes: saldo = suma de movimientos, ninguna carta repetida, nadie por encima de 15
export async function invariantes(liga, bots, etiqueta = '') {
  let ok = true;
  const detalles = [];
  for (const b of bots) {
    const movs = await rpc('slr_movimientos', { token: b.token, equipo_id: b.equipo });
    const s = await saldo(b.equipo);
    const suma = movs.datos.reduce((acc, m) => acc + m.importe, 0);
    if (!movs.ok || suma !== s) { ok = false; detalles.push(`${b.nombre}: saldo ${s} ≠ movimientos ${suma}`); }
  }
  const cartas = await cartasLiga(liga);
  const claves = cartas.map(c => c.diseno_id); // un ejemplar por diseño
  if (new Set(claves).size !== claves.length) { ok = false; detalles.push('ejemplar repetido'); }
  const porEquipo = {};
  for (const c of cartas) if (c.equipo_id) porEquipo[c.equipo_id] = (porEquipo[c.equipo_id] ?? 0) + 1;
  for (const [e, n] of Object.entries(porEquipo)) if (n > 15) { ok = false; detalles.push(`equipo ${e} con ${n} cartas`); }
  const conocidos = new Set(bots.map(b => b.equipo));
  if (cartas.some(c => c.equipo_id && !conocidos.has(c.equipo_id))) { ok = false; detalles.push('carta con dueño desconocido'); }
  return check(ok, `invariantes${etiqueta ? ` (${etiqueta})` : ''}: saldo = movimientos, sin ejemplares repetidos, plantillas ≤ 15 ` +
    `[${bots.map(b => `${b.nombre.split(' ')[1]} ${porEquipo[b.equipo] ?? 0}`).join(', ')}]`, detalles.join('; '));
}

export const horas = (fecha, h) => new Date(fecha.getTime() + h * 3600000).toISOString();

// Bombo de plantillas iniciales calculado desde fuera, con el mismo criterio que
// el servidor: las individuales activas sin el 20 % más caro (desempate por id).
// Objetivo común = 11 × valor medio del bombo.
export async function bomboInicial(excluir = 0.20, n = 11) {
  const ind = (await leer('disenos_carta?select=id,valor&tipo=eq.individual&activo=eq.true&limit=5000')).datos
    .sort((a, b) => b.valor - a.valor || (a.id < b.id ? -1 : 1));
  const nCaras = Math.round(ind.length * excluir);
  const caras = new Set(ind.slice(0, nCaras).map(d => d.id));
  const resto = ind.slice(nCaras);
  const objetivo = n * resto.reduce((s, d) => s + d.valor, 0) / resto.length;
  return { caras, objetivo, umbral: ind[nCaras - 1]?.valor, total: ind.length, bombo: resto.length, porEquipo: n };
}
