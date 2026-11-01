// js/mvp.js: cuándo está abierta, estados, desempates y lo guardado en el dispositivo
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const raiz = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

function cargar() {
  const almacen = new Map();
  const nodo = () => ({ addEventListener() {}, classList: { toggle() {}, add() {}, remove() {} }, dataset: {} });
  const contexto = vm.createContext({
    console, Intl,
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, body: nodo(), visibilityState: 'visible' },
    window: { matchMedia: () => ({ matches: false }), addEventListener() {} },
    location: { hash: '' }, history: { replaceState() {} },
    localStorage: {
      get length() { return almacen.size; },
      key: i => [...almacen.keys()][i],
      getItem: k => (almacen.has(k) ? almacen.get(k) : null),
      setItem: (k, v) => almacen.set(k, String(v)),
      removeItem: k => almacen.delete(k),
    },
  });
  for (const f of ['js/ui.js', 'js/sheets.js', 'js/session.js', 'js/votacion.js', 'js/mvp.js', 'js/app.js']) vm.runInContext(raiz(f), contexto);
  return {
    ev: codigo => vm.runInContext(codigo, contexto),
    almacen,
    poner(datos) { contexto.__d = datos; vm.runInContext(`Object.assign(STATE, __d); STATE.alias = construirAlias(STATE.jugadoresBase);`, contexto); },
  };
}

const iso = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const J = (numero, offset, extra = {}) => ({ numero, fecha: iso(offset), amistoso: false, mvp: '', con_resultado: true, goles_local: 1, goles_visitante: 0, goleadores: [], asistentes: [],
  jugadores_local: ['Markis', 'Nico', 'Enzo'], jugadores_visitante: ['Pablín', 'De la Mano', 'Borja'], local: 'A', visitante: 'B', ...extra });
const BASE = [{ nombre: 'Markis', alias: ['Marcos'] }, { nombre: 'Nico', alias: ['Nicolás'] }, { nombre: 'Enzo', alias: [] }, { nombre: 'Pablín', alias: ['Pablo'] }, { nombre: 'De la Mano 🏆', alias: ['Jorge'] }];
const fila = (jornada, votante, ...pares) => ({ jornada, votante, votos: pares.map(([nombre, puntos]) => ({ nombre, puntos })), fecha: '' });

function con(jornadas, mvps = []) {
  const a = cargar();
  a.poner({ jornadas, mvps, jugadoresBase: BASE, votaciones: [] });
  return a;
}

test('abierta hasta acabar el tercer día; la fecha no manda sobre el número', () => {
  assert.equal(con([J(1, -3)]).ev('mvpAbierta(STATE.jornadas[0])'), true);
  assert.equal(con([J(1, -4)]).ev('mvpAbierta(STATE.jornadas[0])'), false);
  // Una oficial posterior con resultado la cierra aunque su fecha sea anterior (J9 y J10 en la hoja real)
  assert.equal(con([J(1, -1), J(2, -2)]).ev('mvpAbierta(STATE.jornadas[0])'), false);
  assert.equal(con([J(1, -1), J(2, 3, { con_resultado: false })]).ev('mvpAbierta(STATE.jornadas[0])'), true);
  assert.equal(con([J(1, -1), J(null, 0, { amistoso: true })]).ev('mvpAbierta(STATE.jornadas[0])'), true);
  assert.equal(con([J(1, -1, { con_resultado: false })]).ev('mvpAbierta(STATE.jornadas[0])'), false);
});

test('los datos guardados de antes (sin con_resultado) cuentan como con resultado', () => {
  const j = J(1, -1); delete j.con_resultado;
  assert.equal(con([j]).ev('mvpAbierta(STATE.jornadas[0])'), true);
});

test('estados de una jornada', () => {
  const abierta = [J(1, -1)];
  assert.equal(con(abierta).ev(`estadoMVP(STATE.jornadas[0], 'Markis')`), 'votar');
  assert.equal(con(abierta, [fila(1, 'Markis', ['Nico', 3])]).ev(`estadoMVP(STATE.jornadas[0], 'Markis')`), 'votado');
  assert.equal(con(abierta).ev(`estadoMVP(STATE.jornadas[0], 'Mateo')`), 'en-curso');
  assert.equal(con(abierta).ev(`estadoMVP(STATE.jornadas[0], null)`), 'en-curso');
  assert.equal(con([J(1, -9)], [fila(1, 'Markis', ['Nico', 3])]).ev(`estadoMVP(STATE.jornadas[0], 'Mateo')`), 'cerrada');
  assert.equal(con([J(1, -9)]).ev(`estadoMVP(STATE.jornadas[0], 'Markis')`), 'sin-votos');
  assert.equal(con([J(1, 2, { con_resultado: false })]).ev(`estadoMVP(STATE.jornadas[0], 'Markis')`), 'sin-resultado');
  const sin = con(abierta); sin.ev('STATE.mvps = null');
  assert.equal(sin.ev(`estadoMVP(STATE.jornadas[0], 'Markis')`), 'sin-datos');
});

test('«De la Mano» juega aunque su ficha sea «De la Mano 🏆»; Jorge entra con su alias', () => {
  const a = con([J(1, -1)]);
  assert.equal(a.ev(`jugoMVP(STATE.jornadas[0], canonMVP('Jorge'))`), true);
  assert.equal(a.ev(`plantillaMVP(STATE.jornadas[0]).join()`), 'Markis,Nico,Enzo,Pablín,De la Mano 🏆,Borja');
});

test('gana quien tiene más puntos', () => {
  const a = con([J(1, -9)], [fila(1, 'Markis', ['Nico', 2], ['Enzo', 1]), fila(1, 'Pablín', ['Nico', 3])]);
  assert.equal(a.ev('nombreMVP(STATE.jornadas[0])'), 'Nico');
});

test('empate a puntos: gana el de más votantes distintos', () => {
  // Nico 3 de un votante; Enzo 1+2 de dos votantes
  const a = con([J(1, -9)], [fila(1, 'Markis', ['Nico', 3]), fila(1, 'Pablín', ['Enzo', 1], ['Borja', 2]), fila(1, 'Borja', ['Enzo', 2], ['Markis', 1])]);
  assert.equal(a.ev('nombreMVP(STATE.jornadas[0])'), 'Enzo');
});

test('empate a puntos y votantes: gana el de más veces 3 puntos', () => {
  // Nico 3+1+1 (3 votantes), Enzo 2+2+1 (3 votantes)
  const a = con([J(1, -9)], [
    fila(1, 'Markis', ['Nico', 3]),
    fila(1, 'Pablín', ['Nico', 1], ['Enzo', 2]),
    fila(1, 'Borja', ['Nico', 1], ['Enzo', 2]),
    fila(1, 'De la Mano', ['Enzo', 1], ['Markis', 2]),
  ]);
  assert.equal(a.ev('nombreMVP(STATE.jornadas[0])'), 'Nico');
});

test('empate total: MVP por decidir, sin nombre y sin sumar a nadie, hasta fijarlo a mano', () => {
  const votos = [fila(1, 'Markis', ['Nico', 2], ['Enzo', 1]), fila(1, 'Pablín', ['Nico', 1], ['Enzo', 2])];
  const a = con([J(1, -9)], votos);
  assert.equal(a.ev('nombreMVP(STATE.jornadas[0])'), '');
  assert.equal(a.ev('resultadoMVP(STATE.jornadas[0]).porDecidir.join()'), 'Enzo,Nico');
  assert.equal(a.ev(`calcularStats(STATE.jugadoresBase, STATE.jornadas).find(j => j.nombre === 'Nico').stats.mvp`), 0);

  const b = con([J(1, -9, { mvp: 'Enzo' })], votos);
  assert.equal(b.ev('nombreMVP(STATE.jornadas[0])'), 'Enzo');
  assert.equal(b.ev('resultadoMVP(STATE.jornadas[0]).manual'), true);
});

test('a mano manda sobre los votos y también con alias', () => {
  const a = con([J(1, -9, { mvp: 'Nicolás' })], [fila(1, 'Markis', ['Enzo', 3])]);
  assert.equal(a.ev('nombreMVP(STATE.jornadas[0])'), 'Nico');
  assert.equal(a.ev(`calcularStats(STATE.jugadoresBase, STATE.jornadas).find(j => j.nombre === 'Nico').stats.mvp`), 1);
});

test('abierta no hay MVP por votos; amistoso nunca', () => {
  assert.equal(con([J(1, -1)], [fila(1, 'Markis', ['Enzo', 3])]).ev('nombreMVP(STATE.jornadas[0])'), '');
  assert.equal(con([J(null, -9, { amistoso: true, mvp: 'Enzo' })]).ev('nombreMVP(STATE.jornadas[0])'), '');
});

test('una fila repetida en la hoja cuenta una vez', () => {
  const a = con([J(1, -9)], [fila(1, 'Markis', ['Nico', 3]), fila(1, 'Marcos', ['Enzo', 3])]);
  assert.equal(a.ev('votosDe(STATE.jornadas[0]).length'), 1);
  assert.equal(a.ev('nombreMVP(STATE.jornadas[0])'), 'Nico');
});

test('lo votado en el dispositivo: rápido al pintar, pero la verdad es la hoja', () => {
  const a = con([J(1, -1)]);
  const voto = { jornada: 1, votante: 'Markis', votos: [{ nombre: 'Nico', puntos: 3 }] };
  // Recién enviado: se mantiene aunque la hoja aún no lo devuelva
  a.almacen.set('mvp_votado_1', JSON.stringify({ ...voto, t: Date.now() }));
  assert.equal(a.ev('combinarMVPs([], true).length'), 1);
  // Enviado hace rato y la hoja no lo tiene: se olvida
  a.almacen.set('mvp_votado_1', JSON.stringify({ ...voto, t: Date.now() - 120000 }));
  assert.equal(a.ev('combinarMVPs([]).length'), 1, 'sin leer la hoja, sigue valiendo');
  assert.equal(a.ev('combinarMVPs([], true).length'), 0);
  assert.equal(a.almacen.has('mvp_votado_1'), false);
  // La hoja dice que ha votado (desde otro dispositivo): se apunta
  a.almacen.set('SESSION_PLAYER', 'Marcos');
  a.poner({ mvps: [] });
  a.ev(`combinarMVPs([${JSON.stringify({ ...voto, fecha: '' })}], true)`);
  assert.equal(a.almacen.has('mvp_votado_1'), true);
});

test('una marca rota no rompe nada', () => {
  const a = con([J(1, -1)]);
  a.almacen.set('mvp_votado_1', '{roto');
  assert.equal(a.ev('combinarMVPs([]).length'), 0);
});

test('jornada por defecto: la pendiente; si no, la última oficial', () => {
  const a = con([J(1, -9), J(2, -1), J(null, 0, { amistoso: true })]);
  assert.equal(a.ev(`jornadaVistaMVP('Markis').numero`), 2);
  assert.equal(a.ev(`jornadaVistaMVP('Mateo').numero`), 2);
  assert.equal(con([]).ev(`jornadaVistaMVP('Markis')`), null);
});

test('el MVP de los votos cuenta en la ficha del jugador', () => {
  const a = con([J(1, -9), J(2, -8, { mvp: 'Nico' })], [fila(1, 'Markis', ['Nico', 3])]);
  assert.equal(a.ev(`calcularStats(STATE.jugadoresBase, STATE.jornadas).find(j => j.nombre === 'Nico').stats.mvp`), 2);
});
