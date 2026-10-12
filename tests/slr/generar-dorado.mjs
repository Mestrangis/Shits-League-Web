// Genera el test dorado: Marcos FC contra Los del Fondo con la semilla 12345.
//   node tests/slr/generar-dorado.mjs
// Solo se regenera A PROPÓSITO: si el JSON cambia, es una versión nueva del motor
// (archivo motor-vX.Y.Z.js nuevo), nunca un cambio sobre la versión publicada.
import { writeFileSync } from 'node:fs';
import { simularPartido, VERSION } from '../../js/slr/motor-v1.0.0.js';
import { marcosFC, losDelFondo } from './cartas-prueba.mjs';

export const SEMILLA_DORADA = 12345;

const salida = simularPartido(marcosFC(), losDelFondo(), SEMILLA_DORADA);
const ruta = new URL('./dorado-semilla-12345.json', import.meta.url);
writeFileSync(ruta, JSON.stringify(salida, null, 2) + '\n');

console.log(`Motor v${VERSION} · semilla ${SEMILLA_DORADA} → ${salida.goles.join('-')} · ${salida.eventos.length} eventos`);
console.log(`Guardado en ${ruta.pathname}`);
