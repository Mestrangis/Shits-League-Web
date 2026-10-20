// Tests de Linea.cuadros (js/slr/partido/linea.js): lo que se pinta por programa (las
// viñetas) recibe fn(0) al iniciar, sus ms locales en cada avanzar(), nada en pausa y
// fn(dur) al terminar (tap y «Saltar»), con el ×2 incluido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Linea } from '../../js/slr/partido/linea.js';

test('cuadros: 0 al iniciar, ms locales al avanzar, dur al terminar', () => {
  const l = new Linea();
  const vistos = [], tarde = [];
  l.cuadros(ms => vistos.push(ms), { dur: 1000 });
  l.cuadros(ms => tarde.push(ms), { en: 400, dur: 300 });
  assert.equal(l.dur, 1000);
  l.iniciar(1);
  assert.equal(vistos[0], 0);
  l.avanzar(250);
  assert.equal(vistos.at(-1), 250);
  assert.equal(tarde.at(-1), 0, 'antes de su momento, en su primer fotograma');
  l.avanzar(250);
  assert.equal(tarde.at(-1), 100, 'ms locales: 500 − 400');
  l.pausar();
  const n = vistos.length;
  l.avanzar(300);
  assert.equal(vistos.length, n, 'en pausa no se pinta');
  l.reanudar();
  // Tap / «Saltar»: al último fotograma
  l.terminar(true);
  assert.equal(vistos.at(-1), 1000);
  assert.equal(tarde.at(-1), 300);
  assert.ok(l.terminada);
});

test('cuadros: al llegar al final por sí sola, también el último fotograma; nunca pasa de dur', () => {
  const l = new Linea();
  const vistos = [];
  l.cuadros(ms => vistos.push(ms), { dur: 600 });
  l.iniciar(2);
  l.avanzar(500 * 2);   // el reproductor pasa los ms ya multiplicados por la velocidad
  assert.ok(l.terminada);
  assert.ok(vistos.every(ms => ms >= 0 && ms <= 600));
  assert.equal(vistos.at(-1), 600);
});
