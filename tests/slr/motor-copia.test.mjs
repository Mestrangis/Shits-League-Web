// La Edge Function slr-simular usa copias de los motores (la CLI de Supabase solo
// empaqueta lo que hay en supabase/functions). Tienen que ser idénticas byte a
// byte a los originales; si no, regenerarlas con node supabase/seed/copiar-motor.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOTORES } from '../../js/slr/motores.js';

const ARCHIVOS = Object.keys(MOTORES).map(v => `motor-v${v}.js`);
const funcion = () => readFileSync(new URL('../../supabase/functions/slr-simular/index.ts', import.meta.url), 'utf8');

for (const motor of ARCHIVOS) {
  test(`supabase/functions/_shared/${motor} es idéntico byte a byte a js/slr/${motor}`, () => {
    const original = readFileSync(new URL(`../../js/slr/${motor}`, import.meta.url));
    const copia = readFileSync(new URL(`../../supabase/functions/_shared/${motor}`, import.meta.url));
    assert.ok(original.equals(copia), `la copia de ${motor} de la Edge Function no coincide con el original`);
  });

  test(`la Edge Function importa ${motor}`, () => {
    assert.ok(funcion().includes(`'../_shared/${motor}'`), 'la función no importa ../_shared/' + motor);
  });
}

test('la Edge Function simula los partidos nuevos con el motor actual (2.0.0)', () => {
  assert.match(funcion(), /const MOTOR_ACTUAL = '2\.0\.0'/);
});
