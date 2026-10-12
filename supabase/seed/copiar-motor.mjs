// Copia el motor a supabase/functions/_shared para que la Edge Function lo
// empaquete (la CLI solo sube lo que hay dentro de supabase/functions).
//   node supabase/seed/copiar-motor.mjs
// La copia tiene que ser idéntica byte a byte al original:
// tests/slr/motor-copia.test.mjs falla si no lo es.
import { copyFileSync, mkdirSync } from 'node:fs';

export const MOTOR = 'motor-v1.1.0.js';
const origen = new URL(`../../js/slr/${MOTOR}`, import.meta.url);
const destino = new URL(`../functions/_shared/${MOTOR}`, import.meta.url);

mkdirSync(new URL('../functions/_shared/', import.meta.url), { recursive: true });
copyFileSync(origen, destino);
console.log(`Copiado js/slr/${MOTOR} → supabase/functions/_shared/${MOTOR}`);
