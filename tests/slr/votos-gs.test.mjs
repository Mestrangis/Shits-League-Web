// apps-script/votos.gs: votarMVP por fecha con todas sus comprobaciones y «votar» sin cambios
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearGas, fila, CAB_JUGADORES, CAB_JORNADAS, CAB_VOTACIONES, CAB_MVPS } from './gas-falso.mjs';

const jornada = d => fila(CAB_JORNADAS, { goles_local: 3, goles_visitante: 2, amistoso: 'FALSE', local: 'A', visitante: 'B', ...d });
const FICHAS = [CAB_JUGADORES,
  fila(CAB_JUGADORES, { nombre: 'Markis', alias: 'Marcos' }),
  fila(CAB_JUGADORES, { nombre: 'Nico', alias: 'Nicolás' }),
  fila(CAB_JUGADORES, { nombre: 'De la Mano 🏆', alias: 'Jorge' }),
  fila(CAB_JUGADORES, { nombre: 'Pablín', alias: 'Pablo' }),
  fila(CAB_JUGADORES, { nombre: 'Mateo' })];
const F = '2026-11-01';

function montar(extra = []) {
  return crearGas({
    Jugadores: FICHAS,
    Jornadas: [CAB_JORNADAS,
      jornada({ numero: 1, fecha: '2025-01-10', jugadores_local: 'Markis, Nico', jugadores_visitante: 'Pablín, Mateo' }),
      jornada({ numero: '', fecha: '2026-10-30', amistoso: 'TRUE', jugadores_local: 'Markis', jugadores_visitante: 'Nico' }),
      // El mismo número que la de 2025: otra temporada
      jornada({ numero: 1, fecha: F, jugadores_local: 'Markis, Nico', jugadores_visitante: 'De la Mano, Pablín, Borja ' }),
      ...extra],
    Votaciones: [CAB_VOTACIONES, fila(CAB_VOTACIONES, { id: '1', fecha: '2030-01-01', jugadores_si: 'Nico', jugadores_no: '' })],
  });
}
const voto = (d = {}) => ({ action: 'votarMVP', fecha: F, votante: 'Marcos', votos: [{ nombre: 'Nico', puntos: 2 }, { nombre: 'Pablo', puntos: 1 }], ...d });

test('guarda la fecha del partido, la jornada como dato y los nombres canónicos; crea la hoja la primera vez', () => {
  const g = montar();
  const r = g.votar(voto());
  assert.equal(r.ok, true);
  assert.equal(r.mensaje, 'Voto guardado');
  assert.equal(g.hojas.MVPs[0].join(), 'fecha_partido,jornada,votante,voto_1,puntos_1,voto_2,puntos_2,voto_3,puntos_3,fecha_voto');
  assert.equal(g.hojas.MVPs[1].slice(0, 9).join(), `${F},1,Markis,Nico,2,Pablín,1,,`);
  assert.match(g.hojas.MVPs[1][9], /^\d{4}-\d{2}-\d{2} /);
});

test('el mismo número en dos temporadas: el voto va al partido de esa fecha y no choca con el otro', () => {
  const g = crearGas({ Jugadores: FICHAS, Jornadas: [CAB_JORNADAS,
    jornada({ numero: 1, fecha: '2025-01-10', goles_local: '', goles_visitante: '', jugadores_local: 'Markis', jugadores_visitante: 'Nico' }),
    jornada({ numero: 1, fecha: F, jugadores_local: 'Markis', jugadores_visitante: 'Nico' })],
    MVPs: [CAB_MVPS, fila(CAB_MVPS, { fecha_partido: '2025-01-10', jornada: 1, votante: 'Markis', voto_1: 'Nico', puntos_1: 3 })] });
  assert.equal(g.votar(voto({ votos: [{ nombre: 'Nico', puntos: 3 }] })).ok, true, 'votar en otra fecha no es repetir');
  assert.match(g.votar(voto({ votos: [{ nombre: 'Nico', puntos: 3 }] })).error, /Ya has votado/);
});

test('sin plazo de días: un partido de hace meses sigue abierto si es el último', () => {
  const g = crearGas({ Jugadores: FICHAS, Jornadas: [CAB_JORNADAS, jornada({ numero: 3, fecha: '2020-03-01', jugadores_local: 'Markis, Nico', jugadores_visitante: 'Pablo' })] });
  assert.equal(g.votar(voto({ fecha: '2020-03-01' })).ok, true);
});

test('la fecha se entiende en cualquier formato de la hoja y se guarda igual', () => {
  const g = crearGas({ Jugadores: FICHAS, Jornadas: [CAB_JORNADAS, jornada({ numero: 3, fecha: '1/11/2026', jugadores_local: 'Markis, Nico', jugadores_visitante: 'Pablo' })] });
  assert.equal(g.votar(voto()).ok, true);
  assert.equal(g.hojas.MVPs[1][0], F);
});

test('cerrada por un partido oficial de fecha posterior jugado; por número no, sin resultado no, amistoso no', () => {
  assert.match(montar([jornada({ numero: 2, fecha: '2026-11-08' })]).votar(voto()).error, /cerrada/);
  // Número menor (temporada nueva) pero fecha posterior: cierra
  assert.match(montar([jornada({ numero: 1, fecha: '2026-11-08' })]).votar(voto()).error, /cerrada/);
  // Número mayor pero fecha anterior: no cierra
  assert.equal(montar([jornada({ numero: 9, fecha: '2026-10-01' })]).votar(voto()).ok, true);
  assert.equal(montar([jornada({ numero: 2, fecha: '2026-11-08', goles_local: '', goles_visitante: '' })]).votar(voto()).ok, true);
  assert.equal(montar([jornada({ numero: '', fecha: '2026-11-08', amistoso: 'TRUE' })]).votar(voto()).ok, true);
  // Un partido viejo, con otro jugado después, no se puede votar
  assert.match(montar().votar(voto({ fecha: '2025-01-10', votos: [{ nombre: 'Nico', puntos: 3 }] })).error, /cerrada/);
});

test('solo con ficha: el sustituto ni vota ni es votado', () => {
  const g = montar();
  assert.match(g.votar(voto({ votante: 'Borja', votos: [{ nombre: 'Nico', puntos: 3 }] })).error, /con ficha/);
  assert.match(g.votar(voto({ votos: [{ nombre: 'Borja', puntos: 3 }] })).error, /con ficha/);
  assert.match(g.votar(voto({ votos: [{ nombre: 'Nico', puntos: 2 }, { nombre: 'Borja', puntos: 1 }] })).error, /con ficha/);
  assert.ok(!g.hojas.MVPs);
});

test('«De la Mano» en Jornadas y «De la Mano 🏆» en Jugadores son el mismo; Jorge vota con su alias', () => {
  const g = montar();
  assert.equal(g.votar(voto({ votante: 'Jorge' })).ok, true);
  assert.equal(g.hojas.MVPs[1][2], 'De la Mano 🏆');
  assert.equal(g.votar(voto({ votos: [{ nombre: 'De la Mano', puntos: 3 }] })).ok, true);
  assert.equal(g.hojas.MVPs[2][3], 'De la Mano 🏆');
});

const rechazos = [
  ['partido que no existe', voto({ fecha: '2026-01-01' }), /no existe/],
  ['sin fecha', voto({ fecha: '' }), /no existe/],
  ['amistoso', voto({ fecha: '2026-10-30' }), /amistosos/],
  ['no jugó', voto({ votante: 'Mateo' }), /jugaron/],
  ['votarse a sí mismo', voto({ votos: [{ nombre: 'Markis', puntos: 3 }] }), /ti mismo/],
  ['votarse con su alias', voto({ votos: [{ nombre: 'Marcos', puntos: 3 }] }), /ti mismo/],
  ['votado con ficha que no jugó', voto({ votos: [{ nombre: 'Mateo', puntos: 3 }] }), /jugaron/],
  ['suman 2', voto({ votos: [{ nombre: 'Nico', puntos: 2 }] }), /exactamente 3/],
  ['suman 4', voto({ votos: [{ nombre: 'Nico', puntos: 3 }, { nombre: 'Pablo', puntos: 1 }] }), /exactamente 3/],
  ['puntos 0', voto({ votos: [{ nombre: 'Nico', puntos: 3 }, { nombre: 'Pablo', puntos: 0 }] }), /1, 2 o 3/],
  ['puntos en texto', voto({ votos: [{ nombre: 'Nico', puntos: '3' }] }), /1, 2 o 3/],
  ['el mismo dos veces', voto({ votos: [{ nombre: 'Nico', puntos: 2 }, { nombre: 'Nicolás', puntos: 1 }] }), /dos veces/],
  ['más de tres', voto({ votos: ['Nico', 'Pablo', 'Jorge', 'Mateo'].map(nombre => ({ nombre, puntos: 1 })) }), /entre uno y tres/],
  ['sin votos', voto({ votos: [] }), /entre uno y tres/],
];
for (const [que, datos, error] of rechazos) {
  test(`rechaza: ${que}`, () => {
    const g = montar();
    const r = g.votar(datos);
    assert.equal(r.ok, false);
    assert.match(r.error, error);
    assert.ok(!g.hojas.MVPs, 'no escribe nada');
  });
}

test('no se vota dos veces, tampoco con el alias; con todos votados, nadie más escribe', () => {
  const g = montar();
  assert.equal(g.votar(voto()).ok, true);
  assert.match(g.votar(voto({ votante: 'markis' })).error, /Ya has votado/);
  assert.equal(g.votar(voto({ votante: 'Nico', votos: [{ nombre: 'Markis', puntos: 3 }] })).ok, true);
  assert.equal(g.votar(voto({ votante: 'Jorge', votos: [{ nombre: 'Markis', puntos: 3 }] })).ok, true);
  assert.equal(g.votar(voto({ votante: 'Pablo', votos: [{ nombre: 'Markis', puntos: 3 }] })).ok, true);
  assert.match(g.votar(voto({ votante: 'Pablo', votos: [{ nombre: 'Markis', puntos: 3 }] })).error, /Ya has votado/);
  assert.equal(g.hojas.MVPs.length, 5);
});

test('sin resultado no se puede votar', () => {
  const g = crearGas({ Jugadores: FICHAS, Jornadas: [CAB_JORNADAS,
    jornada({ numero: 2, fecha: F, goles_local: '', goles_visitante: '', jugadores_local: 'Marcos, Nico', jugadores_visitante: 'Pablo' })] });
  assert.match(g.votar(voto()).error, /resultado/);
});

test('la hoja borrada se crea otra vez; vacía, recibe su cabecera, y se vuelve a poder votar', () => {
  const g = montar();
  assert.equal(g.votar(voto()).ok, true);
  delete g.hojas.MVPs;
  assert.equal(g.votar(voto()).ok, true);
  assert.equal(g.hojas.MVPs.length, 2);
  g.hojas.MVPs = [];
  assert.equal(g.votar(voto()).ok, true);
  assert.equal(g.hojas.MVPs[0][0], 'fecha_partido');
  assert.equal(g.hojas.MVPs.length, 2);
  g.hojas.MVPs = [['', '', '']];
  assert.equal(g.votar(voto()).ok, true);
});

test('la hoja de antes (sin fecha_partido) se convierte sin perder nada', () => {
  const g = montar();
  g.hojas.Jornadas = [CAB_JORNADAS, jornada({ numero: 17, fecha: F, jugadores_local: 'Markis, Nico', jugadores_visitante: 'Pablín, Borja' })];
  g.hojas.MVPs = [['jornada', 'votante', 'voto_1', 'puntos_1', 'voto_2', 'puntos_2', 'voto_3', 'puntos_3', 'fecha_voto'],
    ['17', 'Nico', 'Borja', '3', '', '', '', '', '2026-11-02 13:12:06']];
  assert.match(g.votar(voto({ votante: 'Nico', votos: [{ nombre: 'Markis', puntos: 3 }] })).error, /Ya has votado/, 'su voto sigue contando');
  assert.equal(g.hojas.MVPs[0].join(), 'fecha_partido,jornada,votante,voto_1,puntos_1,voto_2,puntos_2,voto_3,puntos_3,fecha_voto');
  assert.equal(g.hojas.MVPs[1].join(), `${F},17,Nico,Borja,3,,,,,2026-11-02 13:12:06`);
  assert.equal(g.votar(voto()).ok, true);
  assert.equal(g.hojas.MVPs[2].slice(0, 3).join(), `${F},17,Markis`);
});

test('cada temporada escribe en SU hoja', () => {
  const nueva = { Jugadores: FICHAS, Jornadas: [CAB_JORNADAS, jornada({ numero: 1, fecha: '2027-01-10', jugadores_local: 'Markis, Nico', jugadores_visitante: 'Pablín' })],
    Votaciones: [CAB_VOTACIONES, fila(CAB_VOTACIONES, { id: '1', fecha: '2030-01-01' })] };
  const vieja = () => ({ Jugadores: FICHAS, Jornadas: [CAB_JORNADAS, jornada({ numero: 1, fecha: F, jugadores_local: 'Markis, Nico', jugadores_visitante: 'Pablín' })],
    Votaciones: [CAB_VOTACIONES, fila(CAB_VOTACIONES, { id: '1', fecha: '2030-01-01' })] });
  const antigua = vieja();
  const g = crearGas(antigua, { otra: { id: 'H2627', hojas: nueva } });
  assert.equal(g.votar(voto({ temporada: '26-27', fecha: '2027-01-10' })).ok, true);
  assert.equal(nueva.MVPs.length, 2);
  assert.equal(antigua.MVPs, undefined, 'la otra hoja ni se toca');
  assert.equal(g.votar(voto({ temporada: '24-26' })).ok, true);
  assert.equal(antigua.MVPs.length, 2);
  // Una app de antes de las temporadas no manda ninguna: es la 24/26
  assert.equal(g.votar(voto({ votante: 'Nico', votos: [{ nombre: 'Markis', puntos: 3 }] })).ok, true);
  assert.equal(antigua.MVPs.length, 3);
  assert.equal(g.votar({ action: 'votar', temporada: '26-27', id: '1', nombre: 'Marcos', voto: 'si' }).ok, true);
  assert.equal(nueva.Votaciones[1][CAB_VOTACIONES.indexOf('jugadores_si')], 'Marcos');
  assert.equal(antigua.Votaciones[1][CAB_VOTACIONES.indexOf('jugadores_si')], '');
});

test('una temporada de archivo ya no se vota; una próxima, sí', () => {
  const vieja = { Jugadores: FICHAS, Jornadas: [CAB_JORNADAS, jornada({ numero: 1, fecha: F, jugadores_local: 'Markis, Nico', jugadores_visitante: 'Pablín' })], Votaciones: [CAB_VOTACIONES, fila(CAB_VOTACIONES, { id: '1', fecha: '2030-01-01' })] };
  const nueva = { Jugadores: FICHAS, Jornadas: [CAB_JORNADAS, jornada({ numero: 1, fecha: F, jugadores_local: 'Markis, Nico', jugadores_visitante: 'Pablín' })] };
  const g = crearGas(vieja, { otra: { id: 'H2627', hojas: nueva }, enCurso: '26-27' });
  assert.match(g.votar(voto({ temporada: '24-26' })).error, /terminado/);
  assert.match(g.votar({ action: 'votar', temporada: '24-26', id: '1', nombre: 'Marcos', voto: 'si' }).error, /terminado/);
  assert.equal(vieja.MVPs, undefined);
  assert.equal(g.votar(voto({ temporada: '26-27' })).ok, true);
  g.estado.enCurso = '24-26';
  assert.equal(g.votar(voto({ temporada: '24-26' })).ok, true);
  assert.equal(g.votar(voto({ temporada: '26-27', votante: 'Nico', votos: [{ nombre: 'Markis', puntos: 3 }] })).ok, true, 'antes del pistoletazo, los beta prueban en la nueva');
});

test('una temporada sin hoja o sin pestañas responde claro', () => {
  const g = montar();
  assert.match(g.votar(voto({ temporada: '26-27' })).error, /aún no tiene hoja/);
  assert.match(g.votar(voto({ temporada: '99-00' })).error, /no existe/);
  const h = crearGas({ Jugadores: FICHAS, Jornadas: [CAB_JORNADAS] }, { otra: { id: 'H2627', hojas: { Jugadores: FICHAS, Jornadas: [CAB_JORNADAS] } } });
  assert.match(h.votar({ action: 'votar', temporada: '26-27', id: '1', nombre: 'Marcos', voto: 'si' }).error, /aún no tiene votaciones/);
});

test('el secreto y un cuerpo roto responden JSON', () => {
  const g = montar();
  assert.equal(g.post(JSON.stringify({ secret: 'mal', ...voto() })).error, 'Unauthorized');
  assert.equal(g.post('esto no es json').ok, false);
  assert.match(g.votar({ action: 'otra' }).error, /desconocida/);
});

test('«votar» de siempre sigue funcionando y dice que se ha guardado', () => {
  const g = montar();
  assert.equal(g.votar({ action: 'votar', id: '1', nombre: 'Nicolás', voto: 'no' }).ok, true);
  assert.equal(g.hojas.Votaciones[1][CAB_VOTACIONES.indexOf('jugadores_no')], 'Nicolás');
  assert.equal(g.votar({ action: 'votar', id: '99', nombre: 'X', voto: 'si' }).error, 'Votación no encontrada');
});

test('el script no mira el reloj para decidir; la clave privada de OneSignal no está en el repo', () => {
  const texto = readFileSync(new URL('../../apps-script/votos.gs', import.meta.url), 'utf8');
  assert.doesNotMatch(texto, /MVP_DIAS|sumarDias/);
  assert.doesNotMatch(texto, /os_v2_/);
  assert.match(texto, /getProperty\('ONESIGNAL_API_KEY'\)/);
});
