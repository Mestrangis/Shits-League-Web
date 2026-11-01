// apps-script/votos.gs: votarMVP con todas sus comprobaciones y «votar» sin cambios
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearGas, fila, dia, CAB_JUGADORES, CAB_JORNADAS, CAB_VOTACIONES } from './gas-falso.mjs';

const jornada = d => fila(CAB_JORNADAS, { goles_local: 3, goles_visitante: 2, amistoso: 'FALSE', local: 'A', visitante: 'B', ...d });

function montar(extra = []) {
  return crearGas({
    Jugadores: [CAB_JUGADORES,
      fila(CAB_JUGADORES, { nombre: 'Markis', alias: 'Marcos' }),
      fila(CAB_JUGADORES, { nombre: 'Nico', alias: 'Nicolás' }),
      fila(CAB_JUGADORES, { nombre: 'De la Mano 🏆', alias: 'Jorge' }),
      fila(CAB_JUGADORES, { nombre: 'Pablín', alias: 'Pablo' })],
    Jornadas: [CAB_JORNADAS,
      jornada({ numero: 1, fecha: dia(-30), jugadores_local: 'Markis, Nico', jugadores_visitante: 'Pablín, Borja' }),
      jornada({ numero: '', fecha: dia(-1), amistoso: 'TRUE', jugadores_local: 'Markis', jugadores_visitante: 'Nico' }),
      jornada({ numero: 2, fecha: dia(-1), jugadores_local: 'Markis, Nico', jugadores_visitante: 'De la Mano, Pablín, Víctor' }),
      ...extra],
    Votaciones: [CAB_VOTACIONES, fila(CAB_VOTACIONES, { id: '1', fecha: dia(5), jugadores_si: 'Nico', jugadores_no: '' })],
  });
}
const voto = (d = {}) => ({ action: 'votarMVP', jornada: 2, votante: 'Marcos', votos: [{ nombre: 'Nico', puntos: 2 }, { nombre: 'Pablo', puntos: 1 }], ...d });

test('guarda el voto con los nombres canónicos y crea la hoja la primera vez', () => {
  const g = montar();
  const r = g.votar(voto());
  assert.equal(r.ok, true);
  assert.equal(r.mensaje, 'Voto guardado');
  assert.equal(g.hojas.MVPs[0].join(), 'jornada,votante,voto_1,puntos_1,voto_2,puntos_2,voto_3,puntos_3,fecha_voto');
  assert.equal(g.hojas.MVPs[1].slice(0, 8).join(), '2,Markis,Nico,2,Pablín,1,,');
  assert.match(g.hojas.MVPs[1][8], /^\d{4}-\d{2}-\d{2} /);
});

test('reparto válido con uno, dos y tres votados', () => {
  const g = montar();
  assert.equal(g.votar(voto({ votante: 'Nico', votos: [{ nombre: 'Markis', puntos: 3 }] })).ok, true);
  assert.equal(g.votar(voto({ votante: 'Marcos', votos: [{ nombre: 'Nico', puntos: 1 }, { nombre: 'Pablo', puntos: 1 }, { nombre: 'Víctor', puntos: 1 }] })).ok, true);
});

test('«De la Mano» en Jornadas y «De la Mano 🏆» en Jugadores son el mismo; Jorge vota con su alias', () => {
  const g = montar();
  assert.equal(g.votar(voto({ votante: 'Jorge' })).ok, true);
  assert.equal(g.hojas.MVPs[1][1], 'De la Mano 🏆');
  assert.equal(g.votar(voto({ votante: 'Marcos', votos: [{ nombre: 'De la Mano', puntos: 3 }] })).ok, true);
  assert.equal(g.hojas.MVPs[2][2], 'De la Mano 🏆');
});

test('jugador sin ficha en Jugadores (solo en Jornadas), sin distinguir tildes', () => {
  const g = montar();
  assert.equal(g.votar(voto({ votante: 'Victor' })).ok, true);
});

const rechazos = [
  ['jornada que no existe', voto({ jornada: 99 }), /no existe/],
  ['jornada vacía (los amistosos no tienen número)', voto({ jornada: '' }), /no existe/],
  ['no jugó', voto({ votante: 'Mateo' }), /jugaron/],
  ['votarse a sí mismo', voto({ votos: [{ nombre: 'Markis', puntos: 3 }] }), /ti mismo/],
  ['votarse con su alias', voto({ votos: [{ nombre: 'Marcos', puntos: 3 }] }), /ti mismo/],
  ['votado que no jugó', voto({ votos: [{ nombre: 'Mateo', puntos: 3 }] }), /jugaron/],
  ['suman 2', voto({ votos: [{ nombre: 'Nico', puntos: 2 }] }), /exactamente 3/],
  ['suman 4', voto({ votos: [{ nombre: 'Nico', puntos: 3 }, { nombre: 'Pablo', puntos: 1 }] }), /exactamente 3/],
  ['puntos 0', voto({ votos: [{ nombre: 'Nico', puntos: 3 }, { nombre: 'Pablo', puntos: 0 }] }), /1, 2 o 3/],
  ['puntos negativos', voto({ votos: [{ nombre: 'Nico', puntos: 4 }, { nombre: 'Pablo', puntos: -1 }] }), /1, 2 o 3/],
  ['puntos en texto', voto({ votos: [{ nombre: 'Nico', puntos: '3' }] }), /1, 2 o 3/],
  ['el mismo dos veces', voto({ votos: [{ nombre: 'Nico', puntos: 2 }, { nombre: 'Nicolás', puntos: 1 }] }), /dos veces/],
  ['más de tres', voto({ votos: ['Nico', 'Pablo', 'Víctor', 'Jorge'].map(nombre => ({ nombre, puntos: 1 })) }), /entre uno y tres/],
  ['sin votos', voto({ votos: [] }), /entre uno y tres/],
];
for (const [que, datos, error] of rechazos) {
  test(`rechaza: ${que}`, () => {
    const g = montar();
    const r = g.votar(datos);
    assert.equal(r.ok, false);
    assert.match(r.error, error);
    assert.ok(!g.hojas.MVPs || g.hojas.MVPs.length <= 1, 'no escribe nada');
  });
}

test('no se vota dos veces, tampoco con el alias', () => {
  const g = montar();
  assert.equal(g.votar(voto()).ok, true);
  const r = g.votar(voto({ votante: 'markis' }));
  assert.equal(r.ok, false);
  assert.match(r.error, /Ya has votado/);
  assert.equal(g.hojas.MVPs.length, 2);
});

test('el amistoso no se puede votar', () => {
  const g = montar([jornada({ numero: 5, fecha: dia(-1), amistoso: 'TRUE', jugadores_local: 'Markis', jugadores_visitante: 'Nico' })]);
  assert.match(g.votar(voto({ jornada: 5 })).error, /amistosos/);
});

test('cerrada: el 3.er día después del partido aún vale, el 4.º ya no', () => {
  const con = desfase => crearGas({
    Jugadores: [CAB_JUGADORES],
    Jornadas: [CAB_JORNADAS, jornada({ numero: 2, fecha: dia(desfase), jugadores_local: 'Marcos, Nico', jugadores_visitante: 'Pablo' })],
  });
  assert.equal(con(-3).votar(voto()).ok, true);
  assert.match(con(-4).votar(voto()).error, /cerrada/);
});

test('cerrada por una oficial posterior con resultado; sin resultado o amistosa, no', () => {
  const j2 = jornada({ numero: 2, fecha: dia(-1), jugadores_local: 'Marcos, Nico', jugadores_visitante: 'Pablo' });
  const base = extra => crearGas({ Jugadores: [CAB_JUGADORES], Jornadas: [CAB_JORNADAS, j2, ...extra] });
  assert.match(base([jornada({ numero: 3, fecha: dia(0) })]).votar(voto()).error, /cerrada/);
  assert.equal(base([jornada({ numero: 3, fecha: dia(3), goles_local: '', goles_visitante: '' })]).votar(voto()).ok, true);
  assert.equal(base([jornada({ numero: 3, fecha: dia(0), amistoso: 'TRUE' })]).votar(voto()).ok, true);
});

test('sin resultado no se puede votar', () => {
  const g = crearGas({ Jugadores: [CAB_JUGADORES], Jornadas: [CAB_JORNADAS,
    jornada({ numero: 2, fecha: dia(-1), goles_local: '', goles_visitante: '', jugadores_local: 'Marcos, Nico', jugadores_visitante: 'Pablo' })] });
  assert.match(g.votar(voto()).error, /resultado/);
});

test('el secreto y un cuerpo roto responden JSON', () => {
  const g = montar();
  assert.equal(g.post(JSON.stringify({ secret: 'mal', ...voto() })).error, 'Unauthorized');
  assert.equal(g.post('esto no es json').ok, false);
  assert.match(g.votar({ action: 'otra' }).error, /desconocida/);
});

test('«votar» de siempre sigue funcionando y dice que se ha guardado', () => {
  const g = montar();
  const r = g.votar({ action: 'votar', id: '1', nombre: 'Nicolás', voto: 'no' });
  assert.equal(r.ok, true);
  const v = g.hojas.Votaciones[1];
  assert.equal(v[CAB_VOTACIONES.indexOf('jugadores_no')], 'Nicolás');
  assert.equal(g.votar({ action: 'votar', id: '99', nombre: 'X', voto: 'si' }).error, 'Votación no encontrada');
  assert.equal(g.votar({ action: 'votar', id: '1', nombre: 'X', voto: 'quizá' }).error, 'Voto inválido');
});

test('la clave privada de OneSignal no está en el repo', () => {
  const texto = readFileSync(new URL('../../apps-script/votos.gs', import.meta.url), 'utf8');
  assert.doesNotMatch(texto, /os_v2_/);
  assert.match(texto, /getProperty\('ONESIGNAL_API_KEY'\)/);
});
