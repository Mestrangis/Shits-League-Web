// Catálogo BETA leído de su migración (sin red), con los poderes de cada
// versión aplicados igual que sus migraciones:
//   1.2.0 → 20261014000000_slr_motor_v120.sql (probabilidad ~0,15, efecto por nivel)
//   1.3.0 → 20261015000000_slr_tiers_y_motor_v130.sql (además, probabilidades
//           [p1, p2, p3] del generador en vez de probabilidad)
// Lo usan balance.mjs (activaciones por partido) y api-paso6/7 (que comprueban
// que la base de datos tiene exactamente estos poderes).
import { readFileSync } from 'node:fs';
import { PROBABILIDADES } from '../../js/slr/generador.js';

const MIGRACION = new URL('../../supabase/migrations/20261012230300_slr_catalogo_beta.sql', import.meta.url);

// Efecto de cada nivel en la v1.2.0 (los de tirador son multiplicadores y no cambian)
export const EFECTO_NIVEL = { simple: 0.20, fuerte: 0.30, 'muy fuerte': 0.40 };

// Probabilidad nueva: el 60 % de la anterior, entre 0,10 y 0,20, a dos decimales
// (0,25 → 0,15 · 0,30 → 0,18 · 0,20 → 0,12). "siempre" se queda igual.
export function poderV120(p) {
  if (p.probabilidad === 'siempre') return { ...p };
  const probabilidad = Math.min(0.20, Math.max(0.10, Math.round(p.probabilidad * 60) / 100));
  const efecto = p.momento === 'tirador' ? p.efecto : (EFECTO_NIVEL[p.nivel] ?? p.efecto);
  return { ...p, probabilidad, efecto };
}

// v1.3.0: sin `probabilidad`, con las probabilidades del generador según el nivel
export function poderV130(p) {
  if (p.probabilidad === 'siempre') return { ...p };
  const { probabilidad, ...resto } = poderV120(p);
  return { ...resto, probabilidades: [...PROBABILIDADES[p.nivel]] };
}

const des = s => s.replace(/''/g, "'");
const FILA = /^\s*\('([0-9a-f-]{36})', '((?:[^']|'')*)', array\[.*?\]::text\[\], '(\w+)', (\d+), (\d+), (\d+), '((?:[^']|'')*)'::jsonb/;

// [{ id, nombre, tipo, ATA, DEF, CON, poderes }] con los poderes de la versión pedida
export function catalogoBeta({ version = '1.3.0' } = {}) {
  const filas = [];
  for (const linea of readFileSync(MIGRACION, 'utf8').split(/\r?\n/)) {
    const m = FILA.exec(linea);
    if (!m) continue;
    const poderes = JSON.parse(des(m[7]));
    filas.push({
      id: m[1], nombre: des(m[2]), tipo: m[3], ATA: +m[4], DEF: +m[5], CON: +m[6],
      poderes: version === '1.1.0' ? poderes : poderes.map(version === '1.2.0' ? poderV120 : poderV130),
    });
  }
  if (filas.length < 250) throw new Error(`Catálogo beta incompleto: ${filas.length} cartas`);
  return filas;
}
