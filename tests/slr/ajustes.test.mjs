// ajustes.js y js/lector-ajustes.js: lo mal escrito no rompe nada, y login y fotos son los de siempre
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const raiz = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

function cargar(ajustes) {
  const avisos = [];
  const ctx = vm.createContext({ console: { warn: m => avisos.push(m), error: m => avisos.push(m) } });
  if (ajustes !== undefined) { try { vm.runInContext(ajustes, ctx); } catch { /* como un error de escritura en el navegador */ } }
  vm.runInContext(raiz('js/lector-ajustes.js'), ctx);
  return { avisos, ev: c => JSON.parse(vm.runInContext(`JSON.stringify(${c})`, ctx)) };
}
const defecto = () => cargar('var AJUSTES = {};');

test('ajustes.js se lee sin avisos y hoy coincide con los valores por defecto', () => {
  const a = cargar(raiz('ajustes.js'));
  assert.deepEqual(a.avisos, []);
  assert.deepEqual(a.ev('AJUSTES_LIGA'), defecto().ev('AJUSTES_LIGA'));
});

test('login y fotos: 18 usuarios, cada huella es la de su código y cada foto la de su nombre', () => {
  const a = cargar(raiz('ajustes.js'));
  const codigos = a.ev('JUGADORES_CODIGOS');
  assert.equal(Object.keys(codigos).length, 18);
  for (const h of Object.keys(codigos)) assert.match(h, /^[0-9a-f]{64}$/);
  // La cuenta del login, con un usuario de prueba
  const huella = createHash('sha256').update('prueba').digest('hex');
  const b = cargar(`var AJUSTES = { usuarios: [{ nombre: 'Paco', huella: '${huella}', foto: 'https://x/y.png' }] };`);
  assert.equal(b.ev('JUGADORES_CODIGOS')[huella], 'Paco');
  assert.equal(b.ev('JUGADORES_FOTOS').Paco, 'https://x/y.png');
  assert.equal(a.ev('JUGADORES_FOTOS').Carlos, '');
  assert.ok(a.ev('JUGADORES_FOTOS').Marcos.startsWith('https://'));
});

for (const [que, texto] of [
  ['una comilla sin cerrar', "var AJUSTES = { textos: { eslogan: 'hola } };"],
  ['una coma de menos', "var AJUSTES = { enlaces: { acta: 'a' reglamento: 'b' } };"],
  ['una palabra sin comillas', 'var AJUSTES = { calendario: hola };'],
]) {
  test(`${que}: todo por defecto, y lo avisa`, () => {
    const a = cargar(texto);
    assert.equal(a.avisos.length, 1);
    assert.deepEqual(a.ev('AJUSTES_LIGA'), defecto().ev('AJUSTES_LIGA'));
  });
}

test('sin ajustes.js (no ha cargado): todo por defecto', () => {
  assert.equal(cargar().ev('TEMPORADAS.length'), 3);
});

test('una coma de más no es un error', () => {
  const a = cargar("var AJUSTES = { textos: { frase: 'Otra', }, };");
  assert.deepEqual(a.avisos, []);
  assert.equal(a.ev('AJUSTES_LIGA.textos.frase'), 'Otra');
});

test('un valor mal: solo ese vuelve al de por defecto, y lo avisa', () => {
  const a = cargar(`var AJUSTES = {
    textos: { eslogan: '', frase: 'Otra' },
    temporadas: [{ id: '24-26', nombre: 'Temporada 24/26', hoja: 'h', jornadas: 16, puntuacion: { victoria: 'tres', empate: 2 } }, { id: '26-27', nombre: 'Temporada 26/27', hoja: '', jornadas: null }],
    inicio: { tusPartidosALaVista: 0 },
    enlaces: { spotify: 7, acta: '' },
    calendario: '',
    temporada: [],
  };`);
  const d = defecto().ev('AJUSTES_LIGA'), l = a.ev('AJUSTES_LIGA');
  assert.equal(l.textos.eslogan, d.textos.eslogan);
  assert.equal(l.textos.frase, 'Otra');
  assert.equal(l.temporadas[0].puntuacion.victoria, 3, 'lo que está mal, el de por defecto');
  assert.equal(l.temporadas[0].puntuacion.empate, 2);
  assert.equal(l.temporadas[0].puntuacion.capitanEmpate, 2, 'sin capitán, lo mismo que los demás');
  assert.equal(l.temporadas[1].puntuacion, null, 'sin puntuación');
  assert.equal(l.inicio.tusPartidosALaVista, 5);
  assert.equal(l.enlaces.spotify, d.enlaces.spotify);
  assert.equal(l.enlaces.acta, '', 'vacío es que no salga');
  assert.equal(l.calendario, d.calendario);
  assert.equal(a.avisos.length, 6, a.avisos.join('\n'));   // el vacío del calendario y el ajuste que no existe, también
});

test('temporadas: se ignora la que no vale y se rellena lo demás', () => {
  const a = cargar(`var AJUSTES = { temporadas: [
    { nombre: 'Sin id' },
    { id: '24-26', jornadas: 'muchas', hoja: 5, nombre: '' },
    { id: '24-26', nombre: 'Repetida', hoja: '' },
    { id: '27-28', nombre: 'Temporada 27/28', jornadas: null, hoja: '', rush: true },
  ] };`);
  assert.deepEqual(a.ev('TEMPORADAS.map(t => t.id)'), ['24-26', '27-28']);
  const t = a.ev('TEMPORADAS[0]');
  assert.equal(t.jornadas, 16);
  assert.equal(t.etiqueta, 'Temporada 24/26');
  assert.equal(t.corta, '24/26');
  assert.ok(t.hoja.length > 10);
  assert.equal(a.ev('TEMPORADAS[1].corta'), '27/28');
  assert.ok(a.avisos.length >= 4);
});

test('usuarios: huella mala, la de por defecto o fuera; ninguno válido, los de por defecto', () => {
  const a = cargar(`var AJUSTES = { usuarios: [{ nombre: 'Marcos', huella: 'mal' }, { nombre: 'Nuevo', huella: 'mal' }] };`);
  assert.deepEqual(Object.values(a.ev('JUGADORES_CODIGOS')), ['Marcos']);
  assert.equal(a.avisos.length, 2);
  assert.equal(Object.keys(cargar('var AJUSTES = { usuarios: [] };').ev('JUGADORES_CODIGOS')).length, 18);
});
