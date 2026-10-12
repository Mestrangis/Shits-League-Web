// La Edge Function slr-simular usa una copia del motor (la CLI de Supabase solo
// empaqueta lo que hay en supabase/functions). Tiene que ser idéntica byte a
// byte al original; si no, regenerarla con node supabase/seed/copiar-motor.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MOTOR = 'motor-v1.1.0.js';

test(`supabase/functions/_shared/${MOTOR} es idéntico byte a byte a js/slr/${MOTOR}`, () => {
  const original = readFileSync(new URL(`../../js/slr/${MOTOR}`, import.meta.url));
  const copia = readFileSync(new URL(`../../supabase/functions/_shared/${MOTOR}`, import.meta.url));
  assert.ok(original.equals(copia), 'la copia del motor de la Edge Function no coincide con el original');
});

test('la Edge Function importa exactamente esa versión del motor', () => {
  const funcion = readFileSync(new URL('../../supabase/functions/slr-simular/index.ts', import.meta.url), 'utf8');
  assert.ok(funcion.includes(`'../_shared/${MOTOR}'`), 'la función no importa ../_shared/' + MOTOR);
});
