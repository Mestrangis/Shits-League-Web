// apps-script/votos.gs sobre una hoja de prueba: los dispositivos y las notificaciones automáticas
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearGas, fila, CAB_JUGADORES, CAB_JORNADAS, CAB_VOTACIONES, CAB_MVPS } from './gas-falso.mjs';

const OTRA = 'HOJA-PRUEBA';
const raiz = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const hora = (s) => new Date(s).getTime();
// Miércoles 4 de noviembre de 2026, 12:00 en Madrid
const AHORA = hora('2026-11-04T12:00:00+01:00');
const J = d => fila(CAB_JORNADAS, { amistoso: 'FALSE', local: 'Azul', visitante: 'Rojo', ...d });
const FICHAS = () => [CAB_JUGADORES,
  fila(CAB_JUGADORES, { nombre: 'Markis', alias: 'Marcos' }),
  fila(CAB_JUGADORES, { nombre: 'Nico', alias: 'Nicolás' }),
  fila(CAB_JUGADORES, { nombre: 'De la Mano 🏆', alias: 'Jorge' }),
  fila(CAB_JUGADORES, { nombre: 'Mateo' })];

function montar({ jornadas = [], votaciones = [], mvps = [], eventos = [], sinCalendario = false } = {}) {
  const hojas = { Jugadores: FICHAS(), Jornadas: [CAB_JORNADAS, ...jornadas], Votaciones: [CAB_VOTACIONES, ...votaciones], MVPs: [CAB_MVPS, ...mvps] };
  const g = crearGas({}, { otra: { id: OTRA, hojas }, enCurso: '26-27', eventos, sinCalendario });
  return { ...g, libro: hojas, pasada: ms => g.avisos(ms), textos: () => g.envios.map(e => e.contents.es) };
}
// La primera pasada apunta lo que ya hay. Después, lo nuevo
const arrancado = d => { const g = montar(d); g.pasada(AHORA); g.envios.length = 0; return g; };
const evento = (id, cuando, lugar = 'Palau Deportes') => ({ id, inicio: hora(cuando), lugar });

test('la primera pasada no envía nada de lo que ya había', () => {
  const g = montar({
    jornadas: [J({ numero: 1, fecha: '2026-10-01', goles_local: 2, goles_visitante: 1, video_url: 'https://youtu.be/x', mvp: 'Nico' })],
    votaciones: [fila(CAB_VOTACIONES, { id: '1', fecha: '2026-12-01' })],
    eventos: [evento('e1', '2026-11-27T18:00:00+01:00')],
  });
  const r = g.pasada(AHORA);
  assert.equal(g.envios.length, 0);
  assert.ok(r.apuntados >= 4, JSON.stringify(r));
  g.pasada(AHORA + 15 * 60000);
  assert.equal(g.envios.length, 0, 'ni en la siguiente');
});

test('1. partido nuevo en el calendario: a todos, una sola vez, con su texto', () => {
  const g = arrancado();
  g.fijarEventos([evento('e1', '2026-11-27T18:00:00+01:00')]);
  g.pasada(AHORA);
  assert.deepEqual(g.textos(), ['Viernes 27 nov · 18:00 · Palau Deportes']);
  assert.ok(g.envios[0].included_segments.length);
  assert.equal(g.envios[0].headings.es, 'Partido nuevo');
  assert.ok(g.envios[0].web_url.endsWith('#inicio'));
  assert.ok(g.envios[0].chrome_web_icon.endsWith('assets/icon-192.png'));
  g.pasada(AHORA + 60000);
  assert.equal(g.envios.length, 1);
});

test('2. recordatorios sin votación: una semana, un día y una hora antes, a todos', () => {
  const partido = '2026-11-27T18:00:00+01:00';
  const g = arrancado({ eventos: [evento('e1', partido)] });
  const antes = ms => hora(partido) - ms;
  const D = 86400000, H = 3600000;
  g.pasada(antes(8 * D));
  assert.equal(g.envios.length, 0, 'aún no');
  g.pasada(antes(7 * D - H));
  assert.deepEqual(g.textos(), ['El viernes 27 nov hay partido: 18:00, Palau Deportes']);
  g.pasada(antes(7 * D - 2 * H));
  assert.equal(g.envios.length, 1, 'no se repite');
  g.envios.length = 0;
  g.pasada(antes(24 * H - 60000));
  assert.deepEqual(g.textos(), ['Mañana hay partido: 18:00, Palau Deportes']);
  g.envios.length = 0;
  g.pasada(antes(45 * 60000));
  assert.deepEqual(g.textos(), ['En una hora hay partido: 18:00, Palau Deportes']);
});

test('2. con votación: a los del sí y a los que no han votado, con textos distintos; a los del no, nada', () => {
  const partido = '2026-11-05T18:00:00+01:00';
  const g = arrancado({
    votaciones: [fila(CAB_VOTACIONES, { id: '9', fecha: '2026-11-05', jugadores_si: 'Marcos, Nicolás', jugadores_no: 'Mateo' })],
    eventos: [evento('e2', '2026-12-20T18:00:00+01:00')],
  });
  g.fijarEventos([{ ...evento('e1', partido), yaAvisado: true }]);
  g.pasada(AHORA - 3600000 * 2);   // apunta «nuevo»
  g.envios.length = 0;
  g.pasada(hora(partido) - 20 * 3600000);
  const si = g.envios.find(e => e.contents.es.startsWith('Mañana hay partido'));
  const pend = g.envios.find(e => e.contents.es.startsWith('¿Vienes'));
  assert.deepEqual(si.include_aliases.external_id, ['Marcos', 'Nicolás']);
  assert.equal(pend.contents.es, '¿Vienes al partido de mañana?');
  for (const n of ['Marcos', 'Nicolás', 'Mateo']) assert.ok(!pend.include_aliases.external_id.includes(n), n);
  assert.ok(pend.include_aliases.external_id.includes('Puebla'));
  assert.ok(si.web_url.endsWith('#votacion'));
});

test('un partido recién creado no lleva además el recordatorio de ese tramo', () => {
  const g = arrancado();
  g.fijarEventos([evento('e1', '2026-11-05T10:00:00+01:00')]);   // faltan 22 h
  g.pasada(AHORA);
  g.pasada(AHORA + 15 * 60000);
  assert.deepEqual(g.textos(), ['Jueves 5 nov · 10:00 · Palau Deportes']);
});

test('cambio de hora y partido cancelado: a todos, una vez, y los recordatorios con la hora nueva', () => {
  const g = arrancado({ eventos: [evento('e1', '2026-11-27T18:00:00+01:00')] });
  g.fijarEventos([evento('e1', '2026-11-06T20:00:00+01:00')]);   // a 2 días y 8 horas
  g.pasada(AHORA);
  assert.deepEqual(g.envios.map(e => [e.headings.es, e.contents.es]), [['Cambio de hora', 'Viernes 6 nov · 20:00 · Palau Deportes']]);
  g.pasada(AHORA + 60000);
  assert.equal(g.envios.length, 1, 'una vez, y sin el recordatorio de la semana, que ya ha pasado');
  g.envios.length = 0;
  g.fijarEventos([]);
  g.pasada(AHORA + 120000);
  assert.deepEqual(g.envios.map(e => [e.headings.es, e.contents.es]), [['Partido cancelado', 'Viernes 6 nov · 20:00']]);
  g.pasada(AHORA + 180000);
  assert.equal(g.envios.length, 1);
});

test('de noche no se envía nada, salvo el aviso de una hora; lo demás espera a las 9:00', () => {
  const noche = hora('2026-11-05T02:00:00+01:00');
  const g = arrancado();
  g.libro.Votaciones.push(fila(CAB_VOTACIONES, { id: '5', fecha: '2026-11-20', hora: '20:00', lugar: 'Campo' }));
  g.pasada(noche);
  assert.equal(g.envios.length, 0);
  g.fijarEventos([{ ...evento('e1', '2026-11-05T02:50:00+01:00') }]);
  g.pasada(hora('2026-11-04T20:00:00+01:00'));   // ya conocido, antes de la noche
  g.envios.length = 0;
  g.pasada(noche);
  assert.deepEqual(g.textos(), ['En una hora hay partido: 02:50, Palau Deportes']);
  g.envios.length = 0;
  g.libro.Votaciones.push(fila(CAB_VOTACIONES, { id: '6', fecha: '2026-11-21', hora: '20:00', lugar: 'Campo' }));
  g.pasada(hora('2026-11-05T22:59:00+01:00'));
  assert.ok(g.textos().some(t => t.startsWith('Nueva votación') && t.includes('21 nov')), 'a las 22:59 aún se envía');
  g.envios.length = 0;
  g.libro.Votaciones.push(fila(CAB_VOTACIONES, { id: '7', fecha: '2026-11-22' }));
  g.pasada(hora('2026-11-05T23:00:00+01:00'));
  assert.equal(g.envios.length, 0, 'a las 23:00, ya no');
  g.pasada(hora('2026-11-06T09:00:00+01:00'));
  assert.ok(g.textos().some(t => t.includes('22 nov')), 'a las 9:00, sí');
});

test('3 y 4. votación nueva a todos; 24 h después, a quien no ha votado', () => {
  const g = arrancado();
  g.libro.Votaciones.push(fila(CAB_VOTACIONES, { id: '5', fecha: '2026-11-20', hora: '20:00', lugar: 'Campo', jugadores_si: 'Marcos', jugadores_no: 'Nico' }));
  g.pasada(AHORA);
  assert.deepEqual(g.textos(), ['Nueva votación de asistencia: viernes 20 nov, 20:00, Campo']);
  g.envios.length = 0;
  g.pasada(AHORA + 23 * 3600000);
  assert.equal(g.envios.length, 0);
  g.pasada(AHORA + 24 * 3600000);
  assert.equal(g.envios[0].contents.es, 'Aún no has dicho si vienes al partido del viernes 20 nov');
  const a = g.envios[0].include_aliases.external_id;
  assert.ok(!a.includes('Marcos') && !a.includes('Nicolás') && a.includes('Enzo'), 'por el alias de la ficha, también: ' + a);
  g.pasada(AHORA + 48 * 3600000);
  assert.equal(g.envios.length, 1, 'una sola vez');
});

test('5. resultado nuevo: a todos, con su foto y su enlace; sin emojis; los amistosos no', () => {
  const g = arrancado();
  g.libro.Jornadas.push(J({ numero: 8, fecha: '2026-11-03', local: 'Azul ⚽', goles_local: 1, goles_visitante: 3, imagen_url: 'https://x/foto.jpg', jugadores_local: 'Markis', jugadores_visitante: 'Nico' }));
  g.libro.Jornadas.push(J({ numero: '', fecha: '2026-11-02', amistoso: 'TRUE', goles_local: 9, goles_visitante: 9 }));
  g.pasada(AHORA);
  const res = g.envios.find(e => e.contents.es.startsWith('Jornada 8'));
  assert.equal(res.contents.es, 'Jornada 8: Azul 1–3 Rojo');
  assert.equal(res.chrome_web_image, 'https://x/foto.jpg');
  assert.ok(res.web_url.endsWith('#partido=2026-11-03'));
  assert.ok(!g.textos().some(t => t.includes('9–9')));
});

test('6. resumen subido: solo cuando la celda pasa de vacía a tener vídeo', () => {
  const g = arrancado({ jornadas: [J({ numero: 8, fecha: '2026-11-03', goles_local: 1, goles_visitante: 3 })] });
  g.pasada(AHORA);
  assert.equal(g.envios.length, 0);
  g.libro.Jornadas[1][CAB_JORNADAS.indexOf('video_url')] = 'https://youtu.be/x';
  g.pasada(AHORA + 60000);
  assert.deepEqual(g.textos(), ['Ya está el resumen de la Jornada 8']);
  g.envios.length = 0;
  g.pasada(AHORA + 120000);
  assert.equal(g.envios.length, 0);
});

test('7 y 8. MVP: abierta a los que jugaron con ficha, recordatorio a los que faltan, y decidido a todos', () => {
  const g = arrancado();
  g.libro.Jornadas.push(J({ numero: 8, fecha: '2026-11-03', goles_local: 1, goles_visitante: 3, jugadores_local: 'Markis, Nico', jugadores_visitante: 'De la Mano, Borja' }));
  g.pasada(AHORA);
  const abierta = g.envios.find(e => e.contents.es.startsWith('Ya puedes votar'));
  assert.deepEqual(abierta.include_aliases.external_id, ['Marcos', 'Nicolás', 'Jorge'], 'por su login; Borja no tiene ficha');
  assert.ok(abierta.web_url.endsWith('#mvp=2026-11-03'));

  g.libro.MVPs.push(fila(CAB_MVPS, { fecha_partido: '2026-11-03', jornada: 8, votante: 'Markis', voto_1: 'Nico', puntos_1: 3 }));
  g.envios.length = 0;
  g.pasada(AHORA + 24 * 3600000);
  const rec = g.envios.find(e => e.contents.es.startsWith('Aún no has votado'));
  assert.deepEqual(rec.include_aliases.external_id, ['Nicolás', 'Jorge']);
  assert.equal(g.envios.filter(e => e.contents.es.startsWith('MVP de')).length, 0, 'aún abierta');

  g.libro.MVPs.push(fila(CAB_MVPS, { fecha_partido: '2026-11-03', jornada: 8, votante: 'Nico', voto_1: 'Markis', puntos_1: 1, voto_2: 'De la Mano', puntos_2: 2 }));
  g.libro.MVPs.push(fila(CAB_MVPS, { fecha_partido: '2026-11-03', jornada: 8, votante: 'Jorge', voto_1: 'Nico', puntos_1: 3 }));
  g.envios.length = 0;
  g.pasada(AHORA + 25 * 3600000);
  assert.deepEqual(g.textos(), ['MVP de la Jornada 8: Nico']);
  assert.ok(g.envios[0].included_segments.length);
});

test('8. un MVP empatado no se anuncia; el fijado a mano, sí y sin emojis', () => {
  const g = arrancado();
  g.libro.Jornadas.push(J({ numero: 8, fecha: '2026-11-03', goles_local: 1, goles_visitante: 3, jugadores_local: 'Markis', jugadores_visitante: 'Nico' }));
  g.libro.MVPs.push(fila(CAB_MVPS, { fecha_partido: '2026-11-03', jornada: 8, votante: 'Markis', voto_1: 'Nico', puntos_1: 3 }));
  g.libro.MVPs.push(fila(CAB_MVPS, { fecha_partido: '2026-11-03', jornada: 8, votante: 'Nico', voto_1: 'Markis', puntos_1: 3 }));
  g.pasada(AHORA);
  assert.ok(!g.textos().some(t => t.startsWith('MVP de')), 'empate total');
  g.libro.Jornadas[1][CAB_JORNADAS.indexOf('mvp')] = 'Jorge';
  g.pasada(AHORA + 60000);
  assert.ok(g.textos().includes('MVP de la Jornada 8: De la Mano'));
});

test('un envío fallido se reintenta; sin temporada conocida no se envía nada', () => {
  const g = arrancado();
  g.libro.Votaciones.push(fila(CAB_VOTACIONES, { id: '5', fecha: '2026-11-20' }));
  g.fallarEnvios(true);
  g.pasada(AHORA);
  g.fallarEnvios(false);
  g.envios.length = 0;
  g.pasada(AHORA + 60000);
  assert.equal(g.envios.length, 1);
  g.estado.enCurso = null;
  g.libro.Votaciones.push(fila(CAB_VOTACIONES, { id: '6', fecha: '2026-11-21' }));
  g.envios.length = 0;
  assert.equal(g.pasada(AHORA + 120000).ok, false);
  assert.equal(g.envios.length, 0);
});

test('sin acceso al calendario sigue lo demás; al recuperarlo no anuncia lo que ya había', () => {
  const g = arrancado({ sinCalendario: true });
  g.libro.Votaciones.push(fila(CAB_VOTACIONES, { id: '5', fecha: '2026-11-20' }));
  g.pasada(AHORA);
  assert.equal(g.envios.length, 1);
  g.envios.length = 0;
  g.fijarEventos([evento('e1', '2026-11-27T18:00:00+01:00')]);
  g.pasada(AHORA + 60000);
  assert.equal(g.envios.length, 0);
});

test('simulacro: lista lo que se enviaría, sin enviar ni apuntar', () => {
  const g = arrancado();
  g.libro.Votaciones.push(fila(CAB_VOTACIONES, { id: '5', fecha: '2026-11-20', lugar: 'Campo' }));
  const s = g.simulacro(AHORA);
  assert.equal(s.avisos.length, 1);
  assert.equal(s.avisos[0].a, 'todos');
  assert.equal(s.avisos[0].espera, false);
  assert.equal(g.envios.length, 0);
  assert.equal(g.simulacro(hora('2026-11-05T02:00:00+01:00')).avisos[0].espera, true, 'de noche, espera');
  g.pasada(AHORA);
  assert.equal(g.envios.length, 1, 'el simulacro no lo había apuntado');
});

test('dispositivos: una fila por usuario y móvil, que se actualiza; solo usuarios que existen', () => {
  const g = montar();
  const est = d => g.votar({ action: 'estadoDispositivo', nombre: 'Marcos', dispositivo: 'm1', plataforma: 'android', instalada: true, permiso: 'granted', suscrito: true, ...d });
  assert.equal(est().ok, true);
  assert.equal(g.libro.Dispositivos[0].join(), 'usuario,dispositivo,plataforma,instalada,permiso,suscrito,fecha');
  assert.equal(g.libro.Dispositivos[1].slice(0, 6).join(), 'Marcos,m1,android,si,granted,si');
  est({ suscrito: false });
  assert.equal(g.libro.Dispositivos.length, 2, 'la misma fila');
  assert.equal(g.libro.Dispositivos[1][5], 'no');
  est({ dispositivo: 'm2' });
  assert.equal(g.libro.Dispositivos.length, 3);
  assert.equal(est({ nombre: 'Intruso' }).ok, false);
  assert.equal(est({ nombre: 'nicolas', dispositivo: 'n1' }).ok, true);
  assert.equal(g.libro.Dispositivos.at(-1)[0], 'Nicolás', 'el nombre canónico');
});

test('admin: lista y prueba solo con el código de un admin', () => {
  const g = montar();
  g.fijarHuellaAdmin('codigo-de-prueba');
  g.votar({ action: 'estadoDispositivo', nombre: 'Marcos', dispositivo: 'm1', plataforma: 'android', instalada: true, permiso: 'granted', suscrito: true });
  g.votar({ action: 'estadoDispositivo', nombre: 'Nicolás', dispositivo: 'n1', plataforma: 'iphone', instalada: true, permiso: 'denied', suscrito: false });
  for (const action of ['listaDispositivos', 'notificacionPrueba', 'simulacroAvisos']) {
    assert.equal(g.votar({ action }).ok, false, action);
    assert.equal(g.votar({ action, codigo: 'otro' }).ok, false, action);
  }
  const l = g.votar({ action: 'listaDispositivos', codigo: '  CODIGO-de-prueba ' });
  const de = n => l.usuarios.find(u => u.nombre === n);
  assert.equal(l.usuarios.length, 18);
  assert.equal(de('Marcos').notificaciones, 'activadas');
  assert.equal(de('Nicolás').notificaciones, 'bloqueadas');
  assert.equal(de('Puebla').notificaciones, 'sin datos');
  assert.match(de('Marcos').ultima, /^\d{4}-\d{2}-\d{2} /);
  assert.equal(g.votar({ action: 'notificacionPrueba', codigo: 'codigo-de-prueba' }).ok, true);
  assert.deepEqual(g.envios.at(-1).include_aliases.external_id, ['Marcos'], 'solo a ti');
  assert.ok(Array.isArray(g.votar({ action: 'simulacroAvisos', codigo: 'codigo-de-prueba' }).avisos));
});

test('script y web dicen lo mismo: calendario, usuarios y admins', () => {
  const gs = raiz('apps-script/votos.gs'), ajustes = raiz('ajustes.js');
  const id = ajustes.match(/calendario: '([^']+)'/)[1];
  assert.ok(gs.includes(`CALENDARIO_ID = '${id}'`));
  const nombres = [...ajustes.matchAll(/\{ nombre: '([^']+)',\s+huella: '([0-9a-f]{64})'/g)].map(m => ({ nombre: m[1], huella: m[2] }));
  assert.equal(nombres.length, 18);
  for (const { nombre } of nombres) assert.ok(gs.includes(`'${nombre}'`), nombre);
  const admins = ajustes.match(/admins: \[([^\]]*)\]/)[1].match(/'[^']+'/g).map(s => s.slice(1, -1));
  for (const a of admins) {
    const { huella } = nombres.find(n => n.nombre === a);
    assert.ok(gs.includes(`'${huella}': '${a}'`), `${a} también en HUELLAS_ADMIN`);
  }
  assert.ok(!/⚽|🏆/.test(gs.slice(gs.indexOf('── Notificaciones'))), 'sin emojis en los textos');
});
