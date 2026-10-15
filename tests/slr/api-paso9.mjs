// Prueba de la API real de SLR: reparto entre temporadas con el bombo corto.
//   node tests/slr/api-paso9.mjs
// · El reparto de la temporada 2 sale de los álbumes; a quien le faltan cartas
//   se le completa con individuales libres del bombo (sin las caras), que entran
//   en su álbum. Si aun así no llega, se queda con las que haya y recibe aviso.
// Montaje (sirve con cualquier catálogo): Bot Dos y Bot Tres se unen, se añaden
// bots hasta que no quede una plantilla entera y Bot Uno se une el último, con
// lo que sobra. Al quitar el último bot, sus cartas quedan libres y fuera de
// todos los álbumes: son el bombo con el que se completa a Bot Uno.
import { env, exigirEnv, rpc, rpcOk, leer, check, seccion, resultado, bomboInicial } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO', 'SLR_BOT_TRES_CODIGO');
const U = { codigo: env.SLR_BOT_UNO_CODIGO, nombre: 'Bot Uno FC' };
const D = { codigo: env.SLR_BOT_DOS_CODIGO, nombre: 'Bot Dos FC' };
const T = { codigo: env.SLR_BOT_TRES_CODIGO, nombre: 'Bot Tres FC' };
let L = null;

const individuales = async eq => (await leer(`cartas?select=id,diseno_id,disenos_carta(tipo,valor)&equipo_id=eq.${eq}`)).datos
  .filter(c => c.disenos_carta.tipo === 'individual');
const albumDe = async b => (await leer(`album?select=diseno_id,via_adquisicion&liga_id=eq.${L}&usuario_id=eq.${b.usuario}&limit=1000`)).datos;

for (const b of [U, D, T]) {
  const l = await rpcOk('slr_login', { codigo: b.codigo });
  b.token = l.token; b.usuario = l.usuario.id;
}

try {
  seccion('Montaje: Bot Uno se une el último, con el bombo casi vacío');
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 9 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  for (const b of [D, T]) b.equipo = (await rpcOk('slr_unirse_liga', { token: b.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: b.nombre })).equipo.id;
  // Bots hasta que en el bombo (con las caras) no quede una plantilla entera
  let bot, n = 0;
  for (let b = await rpcOk('slr_admin_bombo', { token: U.token, liga_id: L }); b.bombo + b.caras >= 11 && n < 40;
       b = await rpcOk('slr_admin_bombo', { token: U.token, liga_id: L }), n++)
    bot = await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L });
  const u = await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: U.nombre });
  U.equipo = u.equipo.id;
  check(u.cartas < 11 && u.aviso, `Bot Uno empieza con ${u.cartas} cartas y aviso (${n} bots; el último se llevó ${bot?.cartas})`);
  await rpcOk('slr_admin_quitar_bot', { token: U.token, liga_id: L });
  const b0 = await rpcOk('slr_admin_bombo', { token: U.token, liga_id: L });
  check(b0.bombo > 0, `al quitar el último bot quedan libres ${b0.bombo} individuales del bombo y ${b0.caras} caras, fuera de todos los álbumes`);
  const albumU0 = await albumDe(U);
  const caras = (await bomboInicial()).caras;

  seccion('Temporada 1 y temporada 2');
  await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });
  await rpcOk('slr_terminar_temporada', { token: U.token, liga_id: L });
  const t2 = await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });
  check(t2.numero === 2, 'temporada 2 iniciada (reparto desde los álbumes)');

  seccion('Reparto');
  for (const b of [D, T]) {
    const mias = await individuales(b.equipo);
    const album = new Set((await albumDe(b)).map(a => a.diseno_id));
    check(mias.length === 11 && mias.every(c => album.has(c.diseno_id)), `${b.nombre}: 11 individuales de su álbum`);
  }
  const mias = await individuales(U.equipo);
  const deAntes = new Set(albumU0.map(a => a.diseno_id));
  const nuevas = mias.filter(c => !deAntes.has(c.diseno_id));
  const esperado = Math.min(11, albumU0.length + b0.bombo);
  check(mias.length === esperado, `Bot Uno: ${mias.length} cartas = ${albumU0.length} de su álbum + ${nuevas.length} del bombo (esperado ${esperado})`);
  check(nuevas.length > 0 && nuevas.every(c => !caras.has(c.diseno_id)), 'las del bombo no son caras');
  const albumU1 = await albumDe(U);
  check(nuevas.every(c => albumU1.some(a => a.diseno_id === c.diseno_id && a.via_adquisicion === 'inicial')),
    'y entran en su álbum (vía «inicial»)');
  const avisos = (await rpcOk('slr_notificaciones', { token: U.token })).notificaciones.filter(n => n.tipo === 'plantilla_incompleta');
  if (esperado < 11) check(avisos.length >= 2, `aun así no llega a 11: se queda con ${mias.length} y recibe otro aviso`);
  else check(true, 'llega a 11: sin aviso nuevo');
  const [al] = (await leer(`alineaciones?select=huecos&equipo_id=eq.${U.equipo}`)).datos;
  const puestos = [al.huecos.por, ...al.huecos.def, ...al.huecos.med, ...al.huecos.del];
  check(puestos.filter(Boolean).length === Math.min(7, mias.length), 'su alineación por defecto usa las cartas nuevas');
} catch (e) {
  resultado.fallos++;
  console.log(`\n  ✖ Error inesperado: ${e.message}`);
} finally {
  if (L) {
    const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
    check(b.ok, 'liga de prueba borrada', b.mensaje);
  }
  for (const b of [U, D, T]) if (b.token) await rpc('slr_logout', { token: b.token });
  console.log(`\n${resultado.total - resultado.fallos}/${resultado.total} comprobaciones correctas` +
    `${resultado.fallos ? ` · ${resultado.fallos} FALLOS` : ''}`);
  process.exitCode = resultado.fallos ? 1 : 0;
}
