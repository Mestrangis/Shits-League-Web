// js/mvp.js: votación por fecha, cuándo está abierta, solo con ficha, estados y desempates
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const raiz = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

function cargar(previo = {}) {
  const almacen = new Map(Object.entries(previo));
  const nodo = () => ({ addEventListener() {}, classList: { toggle() {}, add() {}, remove() {} }, dataset: {} });
  const localStorage = new Proxy({
    get length() { return almacen.size; },
    key: i => [...almacen.keys()][i],
    getItem: k => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
    removeItem: k => almacen.delete(k),
  }, { ownKeys: () => [...almacen.keys()], getOwnPropertyDescriptor: (t, k) => ({ enumerable: true, configurable: true, value: almacen.get(k) }) });
  const contexto = vm.createContext({
    console, Intl, localStorage,
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, body: nodo(), visibilityState: 'visible' },
    window: { matchMedia: () => ({ matches: false }), addEventListener() {} },
    location: { hash: '' }, history: { replaceState() {} },
  });
  for (const f of ['js/temporadas.js', 'js/ui.js', 'js/sheets.js', 'js/session.js', 'js/votacion.js', 'js/mvp.js', 'js/app.js']) vm.runInContext(raiz(f), contexto);
  return {
    ev: codigo => vm.runInContext(codigo, contexto),
    almacen,
    poner(datos) { contexto.__d = datos; vm.runInContext(`Object.assign(STATE, __d); STATE.alias = construirAlias(STATE.jugadoresBase);`, contexto); },
  };
}

const J = (numero, fecha, extra = {}) => ({ numero, fecha, amistoso: false, mvp: '', con_resultado: true, goles_local: 1, goles_visitante: 0, goleadores: [], asistentes: [],
  jugadores_local: ['Markis', 'Nico', 'Enzo'], jugadores_visitante: ['Pablín', 'De la Mano', 'Borja'], local: 'A', visitante: 'B', ...extra });
const BASE = [{ nombre: 'Markis', alias: ['Marcos'] }, { nombre: 'Nico', alias: ['Nicolás'] }, { nombre: 'Enzo', alias: [] }, { nombre: 'Pablín', alias: ['Pablo'] }, { nombre: 'De la Mano 🏆', alias: ['Jorge'] }, { nombre: 'Mateo', alias: [] }];
const fila = (fecha_partido, votante, ...pares) => ({ fecha_partido, jornada: null, votante, votos: pares.map(([nombre, puntos]) => ({ nombre, puntos })), fecha_voto: '' });
const F = '2026-11-01';

function con(jornadas, mvps = []) {
  const a = cargar();
  a.poner({ jornadas, mvps, jugadoresBase: BASE, votaciones: [] });
  return a;
}
const uno = fecha => `STATE.jornadas.find(j => j.fecha === '${fecha}')`;

test('normalizarFecha: formatos de la hoja, sin zonas horarias', () => {
  const a = cargar();
  for (const [entra, sale] of [['2026-11-01', F], ['2026-11-1', F], ['1/11/2026', F], ['01/11/2026 20:00', F], ['2026-11-01 20:00:00', F], ['', ''], ['mañana', 'mañana']]) {
    assert.equal(a.ev(`normalizarFecha(${JSON.stringify(entra)})`), sale, entra);
  }
});

test('abierta: el último partido por fecha, sin plazo de días', () => {
  assert.equal(con([J(3, '2020-03-01')]).ev(`mvpAbierta(${uno('2020-03-01')})`), true, 'hace años, pero es el último');
  const dos = con([J(1, '2026-01-01'), J(2, F)]);
  assert.equal(dos.ev(`mvpAbierta(${uno(F)})`), true);
  assert.equal(dos.ev(`mvpAbierta(${uno('2026-01-01')})`), false);
});

test('manda la fecha, no el número: temporada nueva con el número repetido o menor', () => {
  const a = con([J(17, '2026-06-01'), J(1, F)]);
  assert.equal(a.ev(`mvpAbierta(${uno(F)})`), true);
  assert.equal(a.ev(`mvpAbierta(${uno('2026-06-01')})`), false);
  // El número mayor no cierra un partido más reciente (J9 y J10 cambiadas en la hoja real)
  assert.equal(con([J(9, '2025-04-14'), J(10, '2025-04-10')]).ev(`mvpAbierta(${uno('2025-04-14')})`), true);
});

test('los votos de un J1 no se mezclan con los del J1 de otra temporada', () => {
  const a = con([J(1, '2025-01-10'), J(1, F)], [fila('2025-01-10', 'Markis', ['Nico', 3])]);
  assert.equal(a.ev(`votosDe(${uno('2025-01-10')}).length`), 1);
  assert.equal(a.ev(`votosDe(${uno(F)}).length`), 0);
  assert.equal(a.ev(`estadoMVP(${uno(F)}, 'Markis')`), 'votar');
  assert.equal(a.ev(`nombreMVP(${uno('2025-01-10')})`), 'Nico');
});

test('se cierra al votar todos los que pueden (los sustitutos no cuentan)', () => {
  const votantes = ['Markis', 'Nico', 'Enzo', 'Pablín'];
  const votos = votantes.map(v => fila(F, v, [v === 'Nico' ? 'Enzo' : 'Nico', 3]));
  const faltaUno = con([J(1, F)], votos);
  assert.equal(faltaUno.ev(`plantillaMVP(${uno(F)}).length`), 5);
  assert.equal(faltaUno.ev(`mvpAbierta(${uno(F)})`), true);
  const todos = con([J(1, F)], [...votos, fila(F, 'De la Mano', ['Nico', 3])]);
  assert.equal(todos.ev(`mvpAbierta(${uno(F)})`), false);
  assert.equal(todos.ev(`estadoMVP(${uno(F)}, 'Mateo')`), 'cerrada');
  assert.equal(todos.ev(`nombreMVP(${uno(F)})`), 'Nico');
  // Borrar un voto en la hoja la reabre
  todos.ev(`STATE.mvps.pop()`);
  assert.equal(todos.ev(`mvpAbierta(${uno(F)})`), true);
  assert.equal(todos.ev(`nombreMVP(${uno(F)})`), '');
});

test('se cierra con un partido oficial posterior jugado; sin resultado o amistoso, no', () => {
  assert.equal(con([J(1, F), J(2, '2026-11-08')]).ev(`mvpAbierta(${uno(F)})`), false);
  assert.equal(con([J(1, F), J(2, '2026-11-08', { con_resultado: false })]).ev(`mvpAbierta(${uno(F)})`), true);
  assert.equal(con([J(1, F), J(null, '2026-11-08', { amistoso: true })]).ev(`mvpAbierta(${uno(F)})`), true);
  assert.equal(con([J(1, F, { con_resultado: false })]).ev(`mvpAbierta(${uno(F)})`), false);
});

test('solo con ficha: el sustituto no vota, no es votado y no cuenta', () => {
  const a = con([J(1, F)], [fila(F, 'Borja', ['Nico', 3]), fila(F, 'Markis', ['Borja', 2], ['Enzo', 1])]);
  assert.equal(a.ev(`plantillaMVP(${uno(F)}).join()`), 'Markis,Nico,Enzo,Pablín,De la Mano 🏆');
  assert.equal(a.ev(`votosDe(${uno(F)}).length`), 1, 'la fila del sustituto no cuenta');
  assert.equal(a.ev(`votosDe(${uno(F)})[0].votos.map(v => v.nombre).join()`), 'Enzo', 'el voto al sustituto no cuenta');
  assert.equal(a.ev(`rankingMVP(${uno(F)}).find(f => f.nombre === 'Nico').puntos`), 0);
  assert.ok(a.ev(`!rankingMVP(${uno(F)}).some(f => f.nombre === 'Borja')`));
  assert.equal(a.ev(`estadoMVP(${uno(F)}, fichaMVP('Borja'))`), 'en-curso');
});

test('estados', () => {
  const abierta = [J(1, F)];
  assert.equal(con(abierta).ev(`estadoMVP(${uno(F)}, 'Markis')`), 'votar');
  assert.equal(con(abierta, [fila(F, 'Markis', ['Nico', 3])]).ev(`estadoMVP(${uno(F)}, 'Markis')`), 'votado');
  assert.equal(con(abierta).ev(`estadoMVP(${uno(F)}, 'Mateo')`), 'en-curso');
  assert.equal(con(abierta).ev(`estadoMVP(${uno(F)}, null)`), 'en-curso');
  const viejos = [J(1, '2026-01-01'), J(2, F)];
  assert.equal(con(viejos, [fila('2026-01-01', 'Markis', ['Nico', 3])]).ev(`estadoMVP(${uno('2026-01-01')}, 'Mateo')`), 'cerrada');
  assert.equal(con(viejos).ev(`estadoMVP(${uno('2026-01-01')}, 'Markis')`), 'sin-votos');
  assert.equal(con([J(1, F, { con_resultado: false })]).ev(`estadoMVP(${uno(F)}, 'Markis')`), 'sin-resultado');
  const sin = con(abierta); sin.ev('STATE.mvps = null');
  assert.equal(sin.ev(`estadoMVP(${uno(F)}, 'Markis')`), 'sin-datos');
});

test('la hoja vacía o borrada es «sin votos»: se puede votar otra vez', () => {
  const a = con([J(1, F)], [fila(F, 'Markis', ['Nico', 3])]);
  assert.equal(a.ev(`estadoMVP(${uno(F)}, 'Markis')`), 'votado');
  a.ev('STATE.mvps = []');
  assert.equal(a.ev(`estadoMVP(${uno(F)}, 'Markis')`), 'votar');
});

test('el «ya he votado» del móvil de antes se borra y no cuenta', () => {
  const a = cargar({ mvp_votado_17: JSON.stringify({ jornada: 17, votante: 'Markis', votos: [], t: Date.now() }), SL_OTRA: '1' });
  assert.equal(a.almacen.has('mvp_votado_17'), false);
  assert.equal(a.almacen.has('SL_OTRA'), true);
  assert.doesNotMatch(raiz('js/mvp.js'), /localStorage\.setItem/);
});

test('filas de antes de fecha_partido: se reconocen por el número', () => {
  const a = con([J(17, F)], [{ jornada: 17, votante: 'Nico', votos: [{ nombre: 'Enzo', puntos: 3 }], fecha_voto: '' }]);
  assert.equal(a.ev(`estadoMVP(${uno(F)}, 'Nico')`), 'votado');
});

test('gana quien tiene más puntos', () => {
  const a = con([J(1, '2026-01-01'), J(2, F)], [fila('2026-01-01', 'Markis', ['Nico', 2], ['Enzo', 1]), fila('2026-01-01', 'Pablín', ['Nico', 3])]);
  assert.equal(a.ev(`nombreMVP(${uno('2026-01-01')})`), 'Nico');
});

const D = '2026-01-01', cerrado = votos => con([J(1, D), J(2, F)], votos);

test('empate a puntos: gana el de más votantes distintos', () => {
  // Nico 3 de un votante; Enzo 1+2 de dos votantes
  const a = cerrado([fila(D, 'Markis', ['Nico', 3]), fila(D, 'Pablín', ['Enzo', 1], ['Jorge', 2]), fila(D, 'Nico', ['Enzo', 2], ['Pablín', 1])]);
  assert.equal(a.ev(`nombreMVP(${uno(D)})`), 'Enzo');
});

test('empate a puntos y votantes: gana el de más veces 3 puntos', () => {
  // Nico 3+1+1 (3 votantes), Enzo 2+2+1 (3 votantes)
  const a = cerrado([fila(D, 'Markis', ['Nico', 3]), fila(D, 'Pablín', ['Nico', 1], ['Enzo', 2]),
    fila(D, 'Jorge', ['Nico', 1], ['Enzo', 2]), fila(D, 'Nico', ['Enzo', 1], ['Markis', 2])]);
  assert.equal(a.ev(`nombreMVP(${uno(D)})`), 'Nico');
});

test('empate total: MVP por decidir, sin sumar a nadie, hasta fijarlo a mano', () => {
  const votos = [fila(D, 'Markis', ['Nico', 2], ['Enzo', 1]), fila(D, 'Pablín', ['Nico', 1], ['Enzo', 2])];
  const a = cerrado(votos);
  assert.equal(a.ev(`nombreMVP(${uno(D)})`), '');
  assert.equal(a.ev(`resultadoMVP(${uno(D)}).porDecidir.join()`), 'Enzo,Nico');
  assert.equal(a.ev(`calcularStats(STATE.jugadoresBase, STATE.jornadas).find(j => j.nombre === 'Nico').stats.mvp`), 0);
  const b = con([J(1, D, { mvp: 'Enzo' }), J(2, F)], votos);
  assert.equal(b.ev(`nombreMVP(${uno(D)})`), 'Enzo');
  assert.equal(b.ev(`resultadoMVP(${uno(D)}).manual`), true);
});

test('a mano manda sobre los votos, también con alias', () => {
  const a = con([J(1, D, { mvp: 'Nicolás' }), J(2, F)], [fila(D, 'Markis', ['Enzo', 3])]);
  assert.equal(a.ev(`nombreMVP(${uno(D)})`), 'Nico');
  assert.equal(a.ev(`calcularStats(STATE.jugadoresBase, STATE.jornadas).find(j => j.nombre === 'Nico').stats.mvp`), 1);
});

test('abierta no hay MVP por votos; amistoso nunca', () => {
  assert.equal(con([J(1, F)], [fila(F, 'Markis', ['Enzo', 3])]).ev(`nombreMVP(${uno(F)})`), '');
  assert.equal(con([J(null, F, { amistoso: true, mvp: 'Enzo' })]).ev(`nombreMVP(${uno(F)})`), '');
});

test('una fila repetida en la hoja cuenta una vez', () => {
  const a = cerrado([fila(D, 'Markis', ['Nico', 3]), fila(D, 'Marcos', ['Enzo', 3])]);
  assert.equal(a.ev(`votosDe(${uno(D)}).length`), 1);
  assert.equal(a.ev(`nombreMVP(${uno(D)})`), 'Nico');
});

test('partido por defecto: el pendiente; si no, el último oficial por fecha', () => {
  const a = con([J(5, '2026-01-01'), J(1, F), J(null, '2026-12-01', { amistoso: true })]);
  assert.equal(a.ev(`partidoVistoMVP('Markis').fecha`), F);
  assert.equal(a.ev(`partidoVistoMVP('Mateo').fecha`), F);
  assert.equal(a.ev(`partidosOficiales().map(j => j.numero).join()`), '5,1');
  assert.equal(con([]).ev(`partidoVistoMVP('Markis')`), null);
});

test('el último partido de Inicio y el detalle van por fecha', () => {
  const ui = raiz('js/ui.js');
  assert.doesNotMatch(ui, /b\.numero - a\.numero/);
  assert.doesNotMatch(raiz('js/app.js'), /String\(x\.numero\)/);
});
