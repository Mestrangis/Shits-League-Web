// js/temporadas.js: la configuración y qué es cada temporada según la que está en curso
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const raiz = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

function cargar({ sesion = null, acceso = null, enCurso = null } = {}) {
  const ctx = vm.createContext({
    console, localStorage: { getItem: k => (k === 'SL_TEMPORADA_EN_CURSO' ? enCurso : null), setItem() {} },
    getSessionPlayer: () => sesion, rushAccesoGuardado: () => acceso,
  });
  for (const f of ['ajustes.js', 'js/lector-ajustes.js', 'js/temporadas.js']) vm.runInContext(raiz(f), ctx);
  return { ev: c => vm.runInContext(c, ctx) };
}
const modos = a => a.ev(`TEMPORADAS.map(t => t.id + ':' + modoTemporada(t)).join()`);
const selector = a => a.ev(`TEMPORADAS.filter(temporadaEnSelector).map(t => t.id).join()`);

test('la URL y la clave pública son las de js/slr/config.js', () => {
  const config = raiz('js/slr/config.js');
  const a = cargar();
  assert.ok(config.includes(a.ev('SUPABASE_PUBLICO.url')));
  assert.ok(config.includes(a.ev('SUPABASE_PUBLICO.key')));
  assert.ok(a.ev('SUPABASE_PUBLICO.key').startsWith('sb_publishable_'), 'solo la clave pública');
});

test('las hojas son las mismas en la web y en el Apps Script', () => {
  const gs = raiz('apps-script/votos.gs');
  const a = cargar();
  for (const id of a.ev(`TEMPORADAS.filter(t => !t.imagenes).map(t => t.id).join()`).split(',')) {
    assert.ok(gs.includes(`'${id}': '${a.ev(`temporadaPorId('${id}').hoja`)}'`), id);
  }
});

test('antes del pistoletazo: 24/26 en curso, 26/27 próxima', () => {
  assert.equal(modos(cargar()), '26-27:proxima,24-26:en_curso,23-24:imagenes');
  assert.equal(cargar().ev('temporadaProxima().id'), '26-27');
});

test('después: 26/27 en curso, 24/26 archivo', () => {
  const a = cargar({ enCurso: '26-27' });
  assert.equal(modos(a), '26-27:en_curso,24-26:archivo,23-24:imagenes');
  assert.equal(a.ev('temporadaProxima()'), null);
  assert.equal(a.ev('temporadaAnteriorAlCurso().id'), '24-26');
});

test('una temporada guardada que no existe no vale', () => {
  assert.equal(cargar({ enCurso: '99-00' }).ev('temporadaEnCursoId'), '24-26');
});

test('quién ve la próxima', () => {
  assert.equal(selector(cargar()), '26-27,24-26,23-24', 'sin sesión sale, y al elegirla se pide el código');
  assert.equal(cargar().ev(`puedeAbrirTemporada(temporadaPorId('26-27'))`), false, 'pero no se abre');
  assert.equal(selector(cargar({ sesion: 'Hugo', acceso: false })), '26-27,24-26,23-24', 'sin beta sale, con el agujero');
  assert.equal(cargar({ sesion: 'Hugo', acceso: false }).ev(`puedeAbrirTemporada(temporadaPorId('26-27'))`), false, 'pero no se abre');
  assert.equal(cargar({ enCurso: '26-27' }).ev('temporadaAgujero()'), null, 'tras el pistoletazo ya no hay agujero');
  assert.equal(selector(cargar({ sesion: 'Marcos', acceso: true })), '26-27,24-26,23-24');
  assert.equal(cargar({ sesion: 'Marcos', acceso: true }).ev(`temporadaConRush().id`), '26-27');
  assert.equal(cargar({ sesion: 'Hugo', acceso: false }).ev(`temporadaConRush()`), null);
});

test('después del pistoletazo la ven todos', () => {
  assert.equal(selector(cargar({ enCurso: '26-27', sesion: 'Hugo', acceso: false })), '26-27,24-26,23-24');
  assert.equal(cargar({ enCurso: '26-27' }).ev(`temporadaConRush().id`), '26-27');
});
