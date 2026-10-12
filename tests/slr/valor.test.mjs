// Valor de las cartas del catálogo de ejemplo (sección 3.5 de la especificación).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularOVR, calcularValor } from '../../js/slr/valor.js';
import { CARTAS } from './cartas-prueba.mjs';

const ESPERADO = [
  ['m-mosq',     85.95, 2661],
  ['f-cerrojo',  78.1,  1278],
  ['m-cerebro',  74.65, 826],
  ['m-pichichi', 72.1,  791],
  ['m-pitbull',  69.9,  491],
];

for (const [id, ovr, valor] of ESPERADO) {
  test(`${CARTAS[id].nombre}: OVR ${ovr}, valor ${valor}`, () => {
    assert.ok(Math.abs(calcularOVR(CARTAS[id]) - ovr) < 1e-9, `OVR ${calcularOVR(CARTAS[id])}`);
    assert.equal(calcularValor(CARTAS[id]), valor);
  });
}

test('Pitbull no tiene poderes', () => {
  assert.equal(CARTAS['m-pitbull'].poderes.length, 0);
});

test('el OVR no se redondea y no depende del orden de las stats', () => {
  const a = calcularOVR({ ATA: 61, DEF: 52, CON: 86 });
  const b = calcularOVR({ ATA: 86, DEF: 61, CON: 52 });
  assert.equal(a, b);
  assert.ok(!Number.isInteger(a));
});

test('un nivel de poder desconocido es un error', () => {
  assert.throws(() => calcularValor({ ATA: 50, DEF: 50, CON: 50, poderes: [{ nivel: 'legendario' }] }));
});
