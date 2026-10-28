// Prueba de la API real: equipo nuevo sin cartas colocadas y alineación completada sola al cierre.
//   node tests/slr/api-alineacion-vacia.mjs
// Con una liga de prueba (Bot Uno, Bot Dos y dos bots) que se borra al terminar:
// · al unirse, la alineación está vacía (2-2-2 sin cartas, sin banquillo ni capitán);
// · Bot Uno llega al cierre con ella vacía: el servidor la completa con la regla de los bots
//   (7 titulares, 3 suplentes y capitán), le avisa (alineacion_completada → Equipo) y el partido
//   se juega sin Canteranos; no cuenta como guardada (sin bonus de participación);
// · Bot Dos la guarda completa: no se toca ni recibe aviso;
// · los bots (internos) no reciben ese aviso.
// La alineación incompleta (unas cartas sí y otras no) no se puede guardar desde la API: está
// probada en una transacción que se deshace (DECISIONES.md).
import { env, rpc, rpcOk, leer } from './api-util.mjs';

let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const dormir = ms => new Promise(r => setTimeout(r, ms));
const titulares = h => [h.por, ...h.def, ...h.med, ...h.del];

const t1 = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const t2 = (await rpcOk('slr_login', { codigo: env.SLR_BOT_DOS_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: t1, nombre: 'Prueba alineación vacía (api)' });
const L = liga.id;
try {
  console.log('\nal unirse');
  const u = await rpcOk('slr_unirse_liga', { token: t1, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  const d = await rpcOk('slr_unirse_liga', { token: t2, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' });
  for (let i = 0; i < 2; i++) await rpcOk('slr_admin_anadir_bot', { token: t1, liga_id: L });
  const al = u.alineacion;
  check(al.formacion === '2-2-2' && titulares(al.huecos).every(x => x === null), 'equipo nuevo: ninguna carta en el once', JSON.stringify(al.huecos));
  check(!al.banquillo?.length && al.capitan_id === null, 'ni en el banquillo, ni capitán');
  check(u.cartas >= 10, `con su plantilla de siempre (${u.cartas} cartas, todas sin colocar)`);
  const conf = await rpc('slr_confirmar_alineacion', { token: t1, equipo_id: u.equipo.id });
  check(!conf.ok && /Coloca tus cartas/.test(conf.mensaje ?? ''), `confirmarla vacía no se puede (no da el bonus): «${conf.mensaje}»`);

  // Bot Dos la guarda completa (con sus cartas, como la haría a mano)
  const ini2 = await rpcOk('slr_rush_inicio', { token: t2, prueba: true });
  const cartas = ini2.cartas.map(c => c.id);
  const huecos2 = { por: cartas[0], def: cartas.slice(1, 3), med: cartas.slice(3, 5), del: cartas.slice(5, 7) };
  await rpcOk('slr_guardar_alineacion', { token: t2, equipo_id: d.equipo.id, formacion: '2-2-2', huecos: huecos2, banquillo: cartas.slice(7, 10), capitan_id: cartas[3] });

  console.log('\nal cierre de la jornada 1');
  await rpcOk('slr_iniciar_temporada', { token: t1, liga_id: L });
  let r;
  do { r = await rpcOk('slr_admin_jugar_jornada', { token: t1, liga_id: L }); if (r.estado === 'simulando') await dormir(1500); } while (r.estado === 'simulando');

  const ini1 = await rpcOk('slr_rush_inicio', { token: t1, prueba: true });
  const a1 = ini1.alineacion;
  const propias = new Set(ini1.cartas.map(c => c.id));
  check(titulares(a1.huecos).every(x => x && propias.has(x)) && new Set(titulares(a1.huecos)).size === 7, 'Bot Uno (vacía): el servidor ha puesto 7 titulares suyos');
  check(a1.banquillo.length === 3 && a1.banquillo.every(x => propias.has(x) && !titulares(a1.huecos).includes(x)), 'y 3 suplentes');
  check(titulares(a1.huecos).includes(a1.capitan_id), 'y un capitán del once');
  check(a1.automatica === true, 'no cuenta como guardada por él (sin bonus de participación)');
  const n1 = (await rpcOk('slr_notificaciones', { token: t1 })).notificaciones.filter(n => n.liga_id === L && n.tipo === 'alineacion_completada');
  check(n1.length === 1 && /jornada 1 estaba incompleta: se ha completado sola \(7 cartas en el once, 3 en el banquillo y capitán\)/.test(n1[0]?.datos?.texto ?? ''),
    `con un aviso claro: «${n1[0]?.datos?.texto}»`);
  check(n1[0]?.destino_tipo === 'equipo' && n1[0]?.destino_id === u.equipo.id, 'que lleva a la pantalla Equipo');

  // El partido se ha jugado con sus cartas (sin Canteranos)
  const ps = (await leer(`partidos?select=local_id,visitante_id,alineaciones_congeladas,jornadas!inner(liga_id,numero)&jornadas.liga_id=eq.${L}&jornadas.numero=eq.1`)).datos ?? [];
  const p = ps.find(x => [x.local_id, x.visitante_id].includes(u.equipo.id));
  const mia = p && p.alineaciones_congeladas?.[p.local_id === u.equipo.id ? 'local' : 'visitante'];
  check(mia && mia.canteranos === 0, `el partido se juega con sus cartas (canteranos: ${mia?.canteranos})`, JSON.stringify(ps).slice(0, 200));

  const ini2b = await rpcOk('slr_rush_inicio', { token: t2, prueba: true });
  check(JSON.stringify(titulares(ini2b.alineacion.huecos)) === JSON.stringify(titulares(huecos2)) && ini2b.alineacion.capitan_id === cartas[3],
    'Bot Dos (completa): su alineación, tal cual');
  const n2 = (await rpcOk('slr_notificaciones', { token: t2 })).notificaciones.filter(n => n.liga_id === L && n.tipo === 'alineacion_completada');
  check(n2.length === 0, 'y sin aviso');
} catch (e) {
  mal++;
  console.log(`\n  ✖ Error inesperado: ${e.stack ?? e.message}`);
} finally {
  const b = await rpc('slr_borrar_liga', { token: t1, liga_id: L });
  check(b.ok, 'liga de prueba borrada', b.mensaje);
  await rpc('slr_logout', { token: t1 });
  await rpc('slr_logout', { token: t2 });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
  process.exitCode = mal ? 1 : 0;
}
