// Prueba de la API real de SLR: borrar diseños del catálogo (modo pruebas).
//   node tests/slr/api-paso8.mjs
// · slr_admin_borrar_disenos solo para el admin con modo pruebas, con un filtro
//   que pida beta = true o ids (un filtro vacío no borra nada).
// · Desde una liga de prueba solo alcanza a las cartas creadas en ella: el
//   catálogo común (y la liga real) no se tocan.
// · solo_contar devuelve el recuento exacto sin borrar nada.
// · Al borrar: fuera de la alineación (también la capitanía), ofertas, álbum,
//   historial y avisos que la mencionan, ejemplar y diseño; el resto intacto;
//   el dueño recibe un aviso.
// · slr_admin_reiniciar_beta sigue funcionando y no recrea lo borrado; quita
//   los bots y vuelve a unir a las personas con plantilla nueva.
// · Bombo corto (catálogo con pocas individuales): unirse, añadir bots y
//   reiniciar no fallan; quien se queda corto recibe un aviso y una alineación
//   con las cartas que tenga; slr_admin_bombo cuenta las plantillas que quedan.
import { env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO', 'SLR_BOT_TRES_CODIGO');
const U = { codigo: env.SLR_BOT_UNO_CODIGO }, D = { codigo: env.SLR_BOT_DOS_CODIGO }, T = { codigo: env.SLR_BOT_TRES_CODIGO };
let L = null;
const menciona = (filas, id) => filas.filter(f => JSON.stringify(f.datos ?? {}).includes(id));

for (const b of [U, D, T]) b.token = (await rpcOk('slr_login', { codigo: b.codigo })).token;

try {
  seccion('Liga de prueba con dos cartas propias');
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 8 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  U.equipo = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  D.equipo = (await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' })).equipo.id;
  const base = { tipo: 'individual', perfil: 'atacante', tier: 'C', semilla_stats: 11, semilla_poderes: 22 };
  const A = await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Prueba Borrable' } });
  const B = await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Prueba Superviviente' } });
  await rpcOk('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: A.carta_id, equipo_id: U.equipo });
  check(true, `«${A.nombre}» y «${B.nombre}» creadas; la primera, en Bot Uno FC`);

  // Alineación con la carta borrable de delantero y de capitana
  const mias = (await leer(`cartas?select=id&equipo_id=eq.${U.equipo}&id=neq.${A.carta_id}`)).datos.map(c => c.id);
  const huecos = { por: mias[0], def: [mias[1], mias[2]], med: [mias[3], mias[4]], del: [mias[5], A.carta_id] };
  await rpcOk('slr_guardar_alineacion', { token: U.token, equipo_id: U.equipo, formacion: '2-2-2', huecos,
    banquillo: mias.slice(6, 9), orden_manual: false, capitan_id: A.carta_id });
  const oferta = await rpc('slr_ofertar', { token: D.token, carta_id: A.carta_id, importe: 300 });
  check(oferta.ok, 'Bot Dos ofrece por ella (oferta pendiente)', oferta.mensaje);
  const album = (await leer(`album?select=diseno_id&liga_id=eq.${L}&diseno_id=eq.${A.id}`)).datos;
  check(album.length === 1, 'está en el álbum de Bot Uno');

  seccion('Permisos y filtro');
  rechaza(await rpc('slr_admin_borrar_disenos', { token: D.token, filtro: { liga_id: L, ids: [A.id] } }), 'administrador', 'quien no es admin: rechazado');
  rechaza(await rpc('slr_admin_borrar_disenos', { token: U.token, filtro: { liga_id: L } }), 'beta = true o una lista de ids', 'filtro vacío: rechazado');
  rechaza(await rpc('slr_admin_borrar_disenos', { token: U.token, filtro: { ids: [A.id] } }), 'falta la liga', 'sin liga: rechazado');
  const real = (await leer('ligas?select=id&es_prueba=eq.false')).datos.map(l => l.id);
  if (real.length) rechaza(await rpc('slr_admin_borrar_disenos', { token: U.token, filtro: { liga_id: real[0], beta: true }, solo_contar: true }),
    'administrador', 'desde la liga real sin ser su admin: rechazado');
  const betaAqui = await rpcOk('slr_admin_borrar_disenos', { token: U.token, filtro: { liga_id: L, beta: true, sin_foto: true }, solo_contar: true });
  check(betaAqui.disenos === 0, 'desde una liga de prueba, beta = true no alcanza al catálogo común (0 diseños)');
  const ajena = await rpcOk('slr_admin_borrar_disenos', { token: U.token,
    filtro: { liga_id: L, ids: [(await leer('disenos_carta?select=id&liga_prueba_id=is.null&limit=1')).datos[0].id] }, solo_contar: true });
  check(ajena.disenos === 0, 'ni siquiera pidiendo un diseño común por id');

  seccion('Recuento sin borrar (solo_contar)');
  const cuenta = await rpcOk('slr_admin_borrar_disenos', { token: U.token, filtro: { liga_id: L, ids: [A.id] }, solo_contar: true });
  check(cuenta.solo_contar && cuenta.disenos === 1 && cuenta.cartas === 1, `1 diseño y 1 ejemplar (${JSON.stringify(cuenta.borrado)})`);
  check(cuenta.equipos.length === 1 && cuenta.equipos[0].equipo_id === U.equipo && cuenta.equipos[0].pierde === 1,
    `Bot Uno FC pierde 1 y se queda con ${cuenta.equipos[0]?.quedan}`);
  check(cuenta.borrado.alineaciones === 1 && cuenta.borrado.ofertas === 1 && cuenta.borrado.album === 1 && cuenta.borrado.historial >= 1,
    'cuenta la alineación, la oferta, el álbum y el historial');
  const otraVez = await rpcOk('slr_admin_borrar_disenos', { token: U.token, filtro: { liga_id: L, ids: [A.id] }, solo_contar: true });
  check((await leer(`disenos_carta?select=id&id=eq.${A.id}`)).datos.length === 1 &&
        (await leer(`cartas?select=id&id=eq.${A.carta_id}`)).datos.length === 1 &&
        JSON.stringify(otraVez.borrado) === JSON.stringify(cuenta.borrado),
    'y no borra nada (diseño y ejemplar siguen; un segundo recuento da lo mismo)');

  seccion('Borrado');
  const hist0 = (await leer(`historial?select=datos&liga_id=eq.${L}&limit=1000`)).datos;
  const r = await rpcOk('slr_admin_borrar_disenos', { token: U.token, filtro: { liga_id: L, ids: [A.id] } });
  check(!r.solo_contar && JSON.stringify(r.borrado) === JSON.stringify(cuenta.borrado), 'el resumen coincide con el recuento previo');
  check((await leer(`disenos_carta?select=id&id=eq.${A.id}`)).datos.length === 0, 'diseño borrado');
  check((await leer(`cartas?select=id&diseno_id=eq.${A.id}`)).datos.length === 0, 'ejemplar borrado');
  check((await leer(`album?select=diseno_id&diseno_id=eq.${A.id}`)).datos.length === 0, 'entrada del álbum borrada');
  const [al] = (await leer(`alineaciones?select=huecos,banquillo,capitan_id&equipo_id=eq.${U.equipo}`)).datos;
  check(!JSON.stringify(al).includes(A.carta_id) && al.huecos.del[1] === null && al.capitan_id === null && al.huecos.del[0] === mias[5],
    'fuera de la alineación: su hueco vacío, sin capitán, el resto igual');
  const hist = (await leer(`historial?select=datos,tipo&liga_id=eq.${L}&limit=1000`)).datos;
  check(menciona(hist0, A.id).length + menciona(hist0, A.carta_id).length > 0 &&
        menciona(hist, A.id).length === 0 && menciona(hist, A.carta_id).length === 0, 'historial sin menciones a la carta');
  check(hist.some(h => h.tipo === 'admin_disenos_borrados'), 'y apunta el borrado en el historial');
  // ofertas y notificaciones no son de lectura pública: se miran con las funciones de cada bot
  const avisos = b => rpcOk('slr_notificaciones', { token: b.token }).then(x => x.notificaciones);
  const [aU, aD] = [await avisos(U), await avisos(D)];
  check(menciona([...aU, ...aD], A.carta_id).length === 0, 'avisos sin menciones a la carta (también el de la oferta de Bot Dos)');
  check(aU.some(n => n.tipo === 'cartas_retiradas'), 'el dueño recibe el aviso de «cartas retiradas»');
  check((await leer(`disenos_carta?select=id&id=eq.${B.id}`)).datos.length === 1 &&
        (await leer(`cartas?select=id&diseno_id=eq.${B.id}`)).datos.length === 1, `«${B.nombre}» intacta`);
  const otra = await rpcOk('slr_admin_borrar_disenos', { token: U.token, filtro: { liga_id: L, ids: [A.id] } });
  check(otra.disenos === 0, 'repetir el borrado no hace nada');

  seccion('Reiniciar beta tras borrar');
  const activos = (await leer('disenos_carta?select=id&activo=eq.true&liga_prueba_id=is.null&limit=5000')).datos.length;
  await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L });
  const re = await rpcOk('slr_admin_reiniciar_beta', { token: U.token, liga_id: L });
  check(re.cartas === activos + 1, `un ejemplar por diseño activo del catálogo común (${activos}) y de la carta creada en la liga`);
  check((await leer(`cartas?select=id&diseno_id=eq.${A.id}`)).datos.length === 0, 'sin rastro de la carta borrada');
  const eqs = (await leer(`equipos?select=id,nombre,saldo,usuario_id&liga_id=eq.${L}&order=creado_en`)).datos;
  check(re.bots_quitados === 1 && eqs.map(e => e.nombre).join() === 'Bot Uno FC,Bot Dos FC',
    'los bots se van; Bot Uno FC y Bot Dos FC vuelven a estar, por orden de llegada');
  check(re.equipos.every(e => e.cartas === 11 && !e.aviso) && eqs.every(e => e.saldo === 5000),
    `con plantilla nueva (${re.equipos.map(e => `${e.nombre}: ${e.cartas}`).join(', ')}) y saldo inicial`);
  U.equipo = eqs[0].id; D.equipo = eqs[1].id;
  const [al2] = (await leer(`alineaciones?select=huecos,capitan_id&equipo_id=eq.${U.equipo}`)).datos;
  check(al2 && al2.capitan_id && al2.huecos.por && [...al2.huecos.def, ...al2.huecos.med, ...al2.huecos.del].every(Boolean),
    'y alineación 2-2-2 completa con capitán');

  seccion('Bombo corto: nadie falla, se avisa');
  // Se añaden bots hasta agotar las individuales libres (catálogo actual: pocas individuales)
  let b0 = await rpcOk('slr_admin_bombo', { token: U.token, liga_id: L });
  check(b0.equipos === Math.floor(b0.bombo / b0.por_equipo) && b0.individuales_catalogo >= b0.bombo + b0.caras,
    `contador: ${b0.equipos} plantillas con ${b0.bombo} individuales en el bombo (+${b0.caras} caras)`);
  rechaza(await rpc('slr_admin_bombo', { token: D.token, liga_id: L }), 'administrador', 'el contador es solo para el admin');
  const bots = [];
  for (let i = 0; i < 40; i++) {
    const r = await rpc('slr_admin_anadir_bot', { token: U.token, liga_id: L });
    if (!check(r.ok, `añadir bot ${i + 1}: sin error`, r.mensaje)) break;
    bots.push(r.datos);
    if (r.datos.cartas === 0) break;
  }
  // Si las individuales libres no son múltiplo de 11, uno se queda a medias (depende del catálogo)
  const resto = (b0.bombo + b0.caras) % b0.por_equipo;
  const completos = bots.filter(b => !b.aviso), corto = bots.find(b => b.aviso && b.cartas > 0), vacio = bots.find(b => b.cartas === 0);
  check(completos.every(b => b.cartas === 11) && !!corto === resto > 0 && vacio,
    `bots: ${bots.map(b => b.cartas).join(' · ')} cartas (completos, ${resto ? `uno a medias con ${resto}` : 'ninguno a medias: el catálogo da plantillas exactas'} y uno sin cartas)`);
  check((resto === 0 || /Plantilla inicial incompleta/.test(corto?.aviso ?? '')) && /0 de 11/.test(vacio?.aviso ?? ''), `aviso claro: «${vacio?.aviso}»`);
  const caras = await rpcOk('slr_admin_bombo', { token: U.token, liga_id: L });
  check(caras.bombo === 0 && caras.caras === 0 && caras.equipos === 0, 'el contador queda a 0 (también las caras se han repartido)');
  for (const b of [corto, vacio].filter(Boolean)) {
    const [a] = (await leer(`alineaciones?select=huecos,capitan_id&equipo_id=eq.${b.equipo_id}`)).datos;
    const puestos = a ? [a.huecos.por, ...a.huecos.def, ...a.huecos.med, ...a.huecos.del] : [];
    check(a && puestos.length === 7 && puestos.filter(Boolean).length === Math.min(7, b.cartas),
      `${b.nombre}: alineación con sus ${b.cartas} cartas colocadas y el resto de huecos vacíos`);
  }
  const hist2 = (await leer(`historial?select=tipo,datos&liga_id=eq.${L}&tipo=eq.plantilla_incompleta`)).datos;
  check(hist2.length === (corto ? 2 : 1), `queda en el historial de la liga (${corto ? 2 : 1} equipos cortos)`);
  // Una persona que se une sin cartas: sin error, aviso en la respuesta y en su campana
  const t = await rpcOk('slr_unirse_liga', { token: T.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Tres FC' });
  check(t.cartas === 0 && /0 de 11/.test(t.aviso ?? ''), `persona sin cartas: se une igual, con aviso («${t.aviso?.slice(0, 60)}…»)`);
  const campana = (await rpcOk('slr_notificaciones', { token: T.token })).notificaciones;
  check(campana.some(n => n.tipo === 'plantilla_incompleta'), 'y el aviso queda en su campana');
  const re2 = await rpcOk('slr_admin_reiniciar_beta', { token: U.token, liga_id: L });
  check(re2.bots_quitados === bots.length && re2.equipos.map(e => e.nombre).join() === 'Bot Uno FC,Bot Dos FC,Bot Tres FC',
    `reiniciar quita los ${bots.length} bots y conserva a las tres personas`);
  check(re2.equipos.every(e => !e.error) && re2.equipos.slice(0, 2).every(e => e.cartas === 11),
    `y las reparte por orden de llegada: ${re2.equipos.map(e => `${e.nombre} ${e.cartas}${e.aviso ? ' (aviso)' : ''}`).join(', ')}`);
  check(re2.bombo && typeof re2.bombo.equipos === 'number', `devuelve el bombo que queda (${re2.bombo?.equipos} plantillas)`);
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
