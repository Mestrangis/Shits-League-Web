// Genera el test dorado de una versión del motor: Marcos FC contra Los del Fondo
// con la semilla 12345.
//   node tests/slr/generar-dorado.mjs            (motor actual)
//   node tests/slr/generar-dorado.mjs 1.2.0      (una versión concreta)
// Solo se genera A PROPÓSITO, una vez por versión: si el archivo ya existe y la
// salida no coincide, se niega (una versión publicada no cambia; cambiar reglas
// = motor-vX.Y.Z.js nuevo). --forzar lo sobrescribe igualmente.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { motorDe } from '../../js/slr/motores.js';
import { marcosFC, losDelFondo } from './cartas-prueba.mjs';

export const SEMILLA_DORADA = 12345;

const version = process.argv.slice(2).find(a => !a.startsWith('--'));
const { simularPartido, VERSION } = motorDe(version);
const salida = JSON.stringify(simularPartido(marcosFC(), losDelFondo(), SEMILLA_DORADA), null, 2) + '\n';
const ruta = new URL(`./dorado-v${VERSION}-semilla-${SEMILLA_DORADA}.json`, import.meta.url);

if (existsSync(ruta) && !process.argv.includes('--forzar')) {
  const igual = JSON.stringify(JSON.parse(readFileSync(ruta, 'utf8'))) === JSON.stringify(JSON.parse(salida));
  console.log(igual ? `El dorado de v${VERSION} ya existe y coincide: no se toca.`
    : `El dorado de v${VERSION} ya existe y NO coincide: el motor publicado ha cambiado. No se sobrescribe (usa --forzar si es a propósito).`);
  process.exit(igual ? 0 : 1);
}
writeFileSync(ruta, salida);
const r = JSON.parse(salida);
console.log(`Motor v${VERSION} · semilla ${SEMILLA_DORADA} → ${r.goles.join('-')} · ${r.eventos.length} eventos`);
console.log(`Guardado en ${ruta.pathname}`);
