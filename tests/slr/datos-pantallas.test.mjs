// Tests de los datos guardados de cada pantalla (js/slr/datos-pantallas.js, fase 3):
// · frescos durante DATOS_FRESCOS_MS (15 s, configurable en config.js) y viejos después;
// · invalidar tras una acción: dejan de ser frescos pero se pueden enseñar de fondo;
// · una sola petición a la vez por pantalla; lo que falla no se guarda;
// · cada jugador y liga (ámbito) con lo suyo; lo que llega tarde de otro ámbito no se guarda.
// (Que una respuesta tardía no pinte en otra pantalla se prueba en el navegador: banco/datos.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATOS_FRESCOS_MS } from '../../js/slr/config.js';
import { guardado, guardar, pedir, invalidar, esFresco, fijarAmbito, olvidarTodo, _reloj } from '../../js/slr/datos-pantallas.js';

let t = 1_000_000;
_reloj(() => t);

test('el umbral es de 15 s y está en config.js', () => {
  assert.equal(DATOS_FRESCOS_MS, 15000);
});

test('frescos menos de 15 s; después se pueden enseñar, pero ya no cuentan como frescos', async () => {
  await olvidarTodo();
  fijarAmbito('Bot Uno|prueba');
  assert.equal(await guardado('mercado'), null);
  guardar('mercado', { saldo: 100 });
  t += DATOS_FRESCOS_MS - 1;
  assert.ok(esFresco(await guardado('mercado')));
  t += 1;
  const e = await guardado('mercado');
  assert.ok(!esFresco(e));
  assert.deepEqual(e.datos, { saldo: 100 }, 'lo de la última vez sigue ahí');
});

test('invalidar tras una acción: deja de ser fresco aunque sea de hace un momento', async () => {
  fijarAmbito('Bot Uno|prueba');
  guardar('liga', { x: 1 });
  guardar('perfil', { y: 2 });
  assert.ok(esFresco(await guardado('liga')));
  invalidar('liga');
  assert.ok(!esFresco(await guardado('liga')));
  assert.deepEqual((await guardado('liga')).datos, { x: 1 });
  assert.ok(esFresco(await guardado('perfil')), 'las demás pantallas, igual');
});

test('una sola petición a la vez por pantalla; lo que falla no se guarda', async () => {
  fijarAmbito('Bot Uno|prueba');
  let llamadas = 0, soltar;
  const cargar = () => { llamadas++; return new Promise(r => { soltar = r; }); };
  const a = pedir('mercado2', cargar), b = pedir('mercado2', cargar);
  await new Promise(r => setImmediate(r));
  assert.equal(llamadas, 1);
  soltar({ ok: 1 });
  assert.deepEqual(await a, { ok: 1 });
  assert.deepEqual(await b, { ok: 1 });
  assert.ok(esFresco(await guardado('mercado2')), 'guardado al llegar');
  await assert.rejects(pedir('roto', () => Promise.reject(new Error('sin red'))), /sin red/);
  assert.equal(await guardado('roto'), null);
  // Después de fallar, se puede volver a pedir
  assert.deepEqual(await pedir('roto', async () => ({ bien: true })), { bien: true });
});

test('cada jugador y liga con lo suyo; lo que llega tarde de otro ámbito no se guarda', async () => {
  fijarAmbito('Ana|principal');
  guardar('base', { de: 'Ana' });
  fijarAmbito('Luis|principal');
  assert.equal(await guardado('base'), null, 'Luis no ve lo de Ana');
  let soltar;
  const p = pedir('base', () => new Promise(r => { soltar = r; }));
  await new Promise(r => setImmediate(r));
  fijarAmbito('Ana|principal');       // se cambia de jugador mientras tanto
  soltar({ de: 'Luis' });
  await p;
  assert.deepEqual((await guardado('base')).datos, { de: 'Ana' });
  fijarAmbito('Luis|principal');
  assert.equal(await guardado('base'), null, 'la respuesta de Luis no se guardó en el ámbito de Ana ni se perdió en el de Luis a medias');
});
