// Tests del archivo de ajustes de la reproducción (js/slr/partido/ajustes.js) y de su
// carga (config.js): ajustes.js trae exactamente los valores por defecto, cada valor no
// válido se cambia por el de por defecto con un aviso (sin romper nada) y los textos se
// eligen con el azar de la animación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AJUSTES as USUARIO } from '../../js/slr/partido/ajustes.js';
import { AJUSTES, POR_DEFECTO, ESQUEMA, validar, leer, texto } from '../../js/slr/partido/config.js';
import { prng } from '../../js/slr/partido/azar.js';

test('ajustes.js trae los valores por defecto y se carga sin avisos', () => {
  const avisos = [];
  const a = validar(USUARIO, ESQUEMA, '', avisos);
  assert.deepEqual(avisos, []);
  assert.deepEqual(a, POR_DEFECTO);
  assert.deepEqual(AJUSTES, POR_DEFECTO);
});

test('un valor no válido usa el de por defecto y avisa; nunca se rompe', () => {
  const malos = {
    tiempos: { saque: { queda: -5, entra: 'mucho' }, control: { completo: 999999 }, nada: 3 },
    textos: { gol: [], robo: '', sorpresa: ['¡SORPRESA!', ''], cortado: '¡FUERA!' },
    fondo: { franja: 0, escenas: { gol: 'volando' } },
    barra: 'rápida',
    efectos: { temblor: NaN, particulas: Infinity },
    inventado: { x: 1 },
  };
  const avisos = [];
  const a = validar(malos, ESQUEMA, '', avisos);
  assert.equal(a.tiempos.saque.queda, POR_DEFECTO.tiempos.saque.queda);
  assert.equal(a.tiempos.saque.entra, POR_DEFECTO.tiempos.saque.entra);
  assert.equal(a.tiempos.control.completo, POR_DEFECTO.tiempos.control.completo);
  assert.deepEqual(a.textos.gol, POR_DEFECTO.textos.gol);
  assert.deepEqual(a.textos.robo, POR_DEFECTO.textos.robo);
  assert.deepEqual(a.textos.sorpresa, POR_DEFECTO.textos.sorpresa);
  assert.deepEqual(a.textos.cortado, ['¡FUERA!'], 'un texto suelto vale como lista de uno');
  assert.equal(a.fondo.franja, POR_DEFECTO.fondo.franja);
  assert.equal(a.fondo.escenas.gol, POR_DEFECTO.fondo.escenas.gol);
  assert.deepEqual(a.barra, POR_DEFECTO.barra, 'un grupo que no es un grupo: el de por defecto entero');
  assert.equal(a.efectos.temblor, POR_DEFECTO.efectos.temblor);
  assert.equal(a.efectos.particulas, POR_DEFECTO.efectos.particulas);
  for (const k of ['tiempos.saque.queda', 'tiempos.saque.entra', 'tiempos.control.completo', 'tiempos.nada', 'textos.gol', 'textos.robo', 'textos.sorpresa',
    'fondo.franja', 'fondo.escenas.gol', 'barra', 'efectos.temblor', 'efectos.particulas', 'inventado']) {
    assert.ok(avisos.some(x => x.startsWith(k)), `avisa de ${k}: ${avisos.join(' | ')}`);
  }
  // Lo que falta, del de por defecto
  assert.equal(validar({}).tiempos.final, POR_DEFECTO.tiempos.final);
  assert.equal(validar(null).ritmo.sorpresa, POR_DEFECTO.ritmo.sorpresa);
});

test('los enteros se redondean y los rangos se respetan', () => {
  const a = validar({ tiempos: { tirador: { pasos: 12.6 } }, barra: { empujones: 3.2 } });
  assert.equal(a.tiempos.tirador.pasos, 13);
  assert.equal(a.barra.empujones, 3);
  // Todos los valores por defecto están dentro de su rango
  const recorrer = (e, v, ruta) => {
    for (const [k, x] of Object.entries(e)) {
      if (x && x.tipo === 'numero') assert.ok(v[k] >= x.min && v[k] <= x.max, `${ruta}${k}`);
      else if (x && !x.tipo) recorrer(x, v[k], `${ruta}${k}.`);
    }
  };
  recorrer(ESQUEMA, POR_DEFECTO, '');
});

test('lectura y textos: mínimo más algo por palabra; los textos, al azar con la semilla', () => {
  assert.equal(leer(''), AJUSTES.lectura.minimo);
  assert.equal(leer('a b c'), AJUSTES.lectura.minimo + 3 * AJUSTES.lectura.por_palabra);
  assert.equal(texto('gol', prng(1)), 'GOL');
  // Con varias frases, la misma semilla da la misma y salen todas
  const lista = ['¡PARADÓN!', '¡QUÉ MANOS!', '¡MURALLA!'];
  const a = validar({ textos: { estirada: lista } });
  assert.deepEqual(a.textos.estirada, lista);
  const elige = rng => lista[Math.floor(rng() * lista.length)];
  assert.equal(elige(prng(7)), elige(prng(7)));
  assert.equal(new Set(Array.from({ length: 50 }, (_, k) => elige(prng(k)))).size, 3);
});
