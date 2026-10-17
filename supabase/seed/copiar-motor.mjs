// Copia los motores a supabase/functions/_shared para que la Edge Function los
// empaquete (la CLI solo sube lo que hay dentro de supabase/functions).
//   node supabase/seed/copiar-motor.mjs
// Se copian todas las versiones publicadas (la función elige la de cada partido
// según partidos.version_motor; los nuevos usan la actual). Las copias tienen que
// ser idénticas byte a byte: tests/slr/motor-copia.test.mjs falla si no lo son.
import { copyFileSync, mkdirSync } from 'node:fs';

export const MOTORES = ['motor-v1.1.0.js', 'motor-v1.2.0.js', 'motor-v1.3.0.js', 'motor-v2.0.0.js'];

mkdirSync(new URL('../functions/_shared/', import.meta.url), { recursive: true });
for (const motor of MOTORES) {
  copyFileSync(new URL(`../../js/slr/${motor}`, import.meta.url), new URL(`../functions/_shared/${motor}`, import.meta.url));
  console.log(`Copiado js/slr/${motor} → supabase/functions/_shared/${motor}`);
}
