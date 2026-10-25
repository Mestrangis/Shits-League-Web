// Tests de las fotos de las cartas (fase 2 del repaso de rendimiento):
// · solo dos tamaños (pequeña y grande), siempre la misma URL para la misma carta;
// · la precarga en segundo plano: el orden (propias, rival, mercado, catálogo), una vez
//   cada foto, nada con el ahorro de datos, sin las ya guardadas, de dos en dos como mucho
//   y esperando mientras la app carga algo importante.
// (El límite de 600 de la caché del service worker está en sw.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAMANOS, urlCarta, urlFoto, guardarComoCacheada, yaGuardada } from '../../js/slr/imagenes.js';
import { precargarFotos, pendientes, fotosDelMercado, _entorno, _reiniciar } from '../../js/slr/precarga-fotos.js';

const foto = n => `https://res.cloudinary.com/demo/image/upload/v1/carta${n}.jpg`;

test('dos tamaños: pequeña (400) y grande (1000), nítidas con DPR 3', () => {
  assert.deepEqual({ ...TAMANOS }, { pequena: 400, grande: 1000 });
  assert.equal(urlCarta(foto(1)), 'https://res.cloudinary.com/demo/image/upload/c_fill,ar_5:7,g_auto,w_400,f_auto,q_auto/v1/carta1.jpg');
  assert.match(urlCarta(foto(1), 'grande'), /w_1000/);
  // Por ancho en pantalla: cualquier ancho de lista da la misma URL (antes eran seis anchos × DPR)
  const urls = new Set([60, 90, 120, 170, 200, 220].map(w => urlFoto(foto(1), w)));
  assert.equal(urls.size, 1);
  assert.match(urlFoto(foto(1), 300), /w_1000/);
  assert.ok(TAMANOS.pequena >= 130 * 3, 'una carta de lista (~130 px) a DPR 3');
  assert.ok(TAMANOS.grande >= 330 * 3, 'la del detalle (~330 px) a DPR 3');
  // Lo que no es de Cloudinary, tal cual
  assert.equal(urlCarta('assets/x.png'), 'assets/x.png');
});

function preparar({ ahorro = false, ocupado = () => false } = {}) {
  _reiniciar();
  const bajadas = [], colaOcio = [];
  let activas = 0, maxActivas = 0;
  const terminar = [];
  _entorno({
    ahorro: () => ahorro,
    ocioso: cb => colaOcio.push(cb),
    ocupado,
    descargar: url => { bajadas.push(url); activas++; maxActivas = Math.max(maxActivas, activas); return new Promise(res => terminar.push(() => { activas--; res(); })); },
  });
  // Un «rato libre»: lo programado hasta ahora (lo que se programe dentro, al siguiente)
  const ocio = async () => { for (const cb of colaOcio.splice(0)) cb(); await new Promise(r => setImmediate(r)); };
  const acabar = async () => { while (terminar.length) terminar.shift()(); await new Promise(r => setImmediate(r)); };
  return { bajadas, ocio, acabar, max: () => maxActivas };
}

test('precarga: propias, después el rival, el mercado y el catálogo; cada foto una vez', async () => {
  const p = preparar();
  precargarFotos('catalogo', [foto(9), foto(1)]);
  precargarFotos('mercado', [foto(5), foto(6)]);
  precargarFotos('propias', [foto(1), foto(2), foto(2), null]);   // la 1 ya estaba (en el catálogo): una sola vez
  precargarFotos('rival', [foto(3)]);
  assert.deepEqual(pendientes().map(x => x.grupo), ['propias', 'rival', 'mercado', 'mercado', 'catalogo', 'catalogo']);
  for (let k = 0; k < 10; k++) { await p.ocio(); await p.acabar(); }
  assert.deepEqual(p.bajadas.map(u => Number(u.match(/carta(\d+)/)[1])), [2, 3, 5, 6, 9, 1]);
  assert.ok(p.max() <= 2, 'de dos en dos como mucho');
  assert.ok(p.bajadas.every(u => /w_400/.test(u)), 'siempre la pequeña');
});

test('el orden de los grupos manda sobre el orden de llegada', async () => {
  const p = preparar();
  precargarFotos('catalogo', [foto(30), foto(31), foto(32)]);
  precargarFotos('mercado', [foto(20)]);
  precargarFotos('rival', [foto(10)]);
  precargarFotos('propias', [foto(101)]);
  for (let k = 0; k < 10; k++) { await p.ocio(); await p.acabar(); }
  assert.deepEqual(p.bajadas.map(u => Number(u.match(/carta(\d+)/)[1])), [101, 10, 20, 30, 31, 32]);
});

test('con el ahorro de datos, nada; las ya guardadas no se piden', async () => {
  let p = preparar({ ahorro: true });
  precargarFotos('propias', [foto(40), foto(41)]);
  await p.ocio();
  assert.equal(p.bajadas.length, 0);
  assert.equal(pendientes().length, 0);
  p = preparar();
  guardarComoCacheada(urlCarta(foto(42)));
  assert.ok(yaGuardada(urlCarta(foto(42))));
  precargarFotos('propias', [foto(42), foto(43)]);
  for (let k = 0; k < 4; k++) { await p.ocio(); await p.acabar(); }
  assert.deepEqual(p.bajadas.map(u => Number(u.match(/carta(\d+)/)[1])), [43]);
});

test('espera mientras la app carga algo importante (datos o fotos que se ven)', async () => {
  let ocupada = true;
  const p = preparar({ ocupado: () => ocupada });
  precargarFotos('propias', [foto(50)]);
  await p.ocio(); await p.ocio();
  assert.equal(p.bajadas.length, 0, 'nada mientras está ocupada');
  ocupada = false;
  await p.ocio();
  assert.equal(p.bajadas.length, 1);
});

test('mercado: las fotos de las subastas y de las ventas', () => {
  preparar();
  fotosDelMercado({ subastas: [{ carta: { disenos_carta: { imagen_url: foto(60) } } }], ventas: [{ carta: { imagen_url: foto(61) } }] });
  assert.deepEqual(pendientes().map(x => [x.grupo, Number(x.url.match(/carta(\d+)/)[1])]), [['mercado', 60], ['mercado', 61]]);
});
