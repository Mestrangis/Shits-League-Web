// Prueba de la API real (repaso de rendimiento, fase 3): cada pantalla en UNA llamada.
//   node tests/slr/api-pantallas.mjs
// slr_rush_inicio y slr_rush_liga devuelven exactamente lo que daban las llamadas sueltas
// de antes (slr_yo, lecturas de la liga, el calendario, las cartas…), con una liga de
// prueba del bot que se borra al terminar.
import { env, rpc, rpcOk, leer } from './api-util.mjs';

let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
// Igual en contenido (jsonb guarda las claves en otro orden que PostgREST)
const canon = x => (Array.isArray(x) ? x.map(canon) : x && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canon(x[k])])) : x);
const igual = (a, b) => {
  const s = JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  if (!s && process.env.DETALLE) {
    const [x, y] = [JSON.stringify(canon(a)), JSON.stringify(canon(b))];
    let i = 0;
    while (i < x.length && x[i] === y[i]) i++;
    console.log(`      difiere en: …${x.slice(Math.max(0, i - 60), i + 80)}…  ≠  …${y.slice(Math.max(0, i - 60), i + 80)}…`);
  }
  return s;
};
const porId = xs => [...xs].sort((a, b) => String(a.id).localeCompare(String(b.id)));
const dormir = ms => new Promise(r => setTimeout(r, ms));

const t = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: t, nombre: 'Prueba pantallas (api)' });
const L = liga.id;
try {
  const U = (await rpcOk('slr_unirse_liga', { token: t, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  for (let i = 0; i < 3; i++) await rpcOk('slr_admin_anadir_bot', { token: t, liga_id: L });
  await rpcOk('slr_iniciar_temporada', { token: t, liga_id: L });
  let r;
  do { r = await rpcOk('slr_admin_jugar_jornada', { token: t, liga_id: L }); if (r.estado === 'simulando') await dormir(1500); } while (r.estado === 'simulando');

  console.log('\nslr_rush_inicio');
  const ini = await rpcOk('slr_rush_inicio', { token: t, prueba: true });
  check(ini.liga_id === L && ini.equipo_id === U, 'la liga de prueba y el equipo propio');
  const yo = await rpcOk('slr_yo', { token: t });
  check(igual(ini.yo, yo), 'yo = slr_yo');
  const [info] = (await leer(`ligas?select=id,nombre,estado,temporada,config,pausada_en&id=eq.${L}`)).datos;
  check(igual(ini.liga, info), 'la liga = lectura de ligas');
  const [temp] = (await leer(`temporadas?select=id,numero,estado,iniciada_en,terminada_en&liga_id=eq.${L}&order=numero.desc&limit=1`)).datos;
  check(igual(ini.temporada, temp), 'la temporada');
  check(igual(ini.calendario, await rpcOk('slr_calendario', { token: t, liga_id: L })), 'el calendario = slr_calendario');
  const pub = (await leer(`jornadas?select=id,publicada_en&liga_id=eq.${L}&limit=500`)).datos;
  check(igual(porId(ini.publicadas), porId(pub)), 'la fecha de publicación de cada jornada');
  const cols = (await leer(`colecciones?select=id,nombre,color,emblema_url,descripcion,liga_prueba_id,creada_en&or=(liga_prueba_id.is.null,liga_prueba_id.eq.${L})&order=nombre&limit=1000`)).datos;
  check(igual(porId(ini.colecciones), porId(cols)), `las colecciones (${cols.length})`);
  const cartas = (await leer(`cartas?select=id,diseno_id,equipo_id,multiplicador_clausula,blindada_hasta,tocada_en_jornada,adquirida_en,energia,` +
    `disenos_carta(nombre,tipo,acabado,color,tier,rareza,coleccion_id,perfil,personas,ata,def,con,valor,poderes,imagen_url,texto,estamina,tactica_favorita)&equipo_id=eq.${U}`)).datos;
  const norm = c => ({ ...c, multiplicador_clausula: Number(c.multiplicador_clausula) });
  check(igual(porId(ini.cartas).map(norm), porId(cartas).map(norm)), `las cartas propias con su diseño (${cartas.length})`);
  check(igual(ini.ventas, (await leer(`ventas?select=id,carta_id,precio&vendedor_id=eq.${U}&estado=eq.activa`)).datos), 'las cartas en venta');
  const [al] = (await leer(`alineaciones?equipo_id=eq.${U}`)).datos;
  check(igual(ini.alineacion, al), 'la alineación');
  check(igual(ini.tacticas, await rpcOk('slr_mis_tacticas', { token: t, equipo_id: U })), 'las tácticas');
  check(igual(ini.sin_ver, await rpcOk('slr_sin_ver', { token: t, liga_id: L })), 'el partido sin ver');
  check(igual(ini.notificaciones, await rpcOk('slr_notificaciones', { token: t })), 'los avisos');
  check(igual(ini.sobre_pendiente, await rpcOk('slr_sobre_pendiente', { token: t, liga_id: L })), 'el sobre pendiente');
  check(igual(ini.hueco_pendiente, await rpcOk('slr_hueco_pendiente', { token: t, liga_id: L })), 'el «haz hueco» pendiente');
  // El rival de la próxima jornada y sus fotos
  const cal = ini.calendario.jornadas.find(j => ['programada', 'cerrada', 'simulada'].includes(j.estado));
  const p = cal?.partidos.find(x => [x.local.equipo_id, x.visitante.equipo_id].includes(U));
  const rival = p && (p.local.equipo_id === U ? p.visitante.equipo_id : p.local.equipo_id);
  const fotos = rival ? (await leer(`cartas?select=disenos_carta(imagen_url)&equipo_id=eq.${rival}`)).datos.map(x => x.disenos_carta.imagen_url).filter(Boolean) : [];
  check(rival && igual([...ini.fotos_rival].sort(), [...fotos].sort()) && fotos.length > 0, `las fotos del rival de la jornada (${fotos.length})`);
  // Sin sesión válida: error de sesión, como slr_yo
  const malo = await rpc('slr_rush_inicio', { token: 'no-vale' });
  check(!malo.ok, 'con un token que no vale, error');

  console.log('\nslr_rush_liga');
  const lg = await rpcOk('slr_rush_liga', { token: t, liga_id: L });
  check(igual(lg.clasificacion, await rpcOk('slr_clasificacion', { token: t, liga_id: L })), 'la clasificación = slr_clasificacion');
  const eqs = (await leer(`equipos?select=id,nombre,creado_en,usuarios(nombre,interno)&liga_id=eq.${L}&order=creado_en`)).datos;
  check(igual(lg.equipos, eqs), `los equipos con su dueño (${eqs.length})`);
  const am = (await leer(`partidos?select=id,local_id,visitante_id,goles_local,goles_visitante,simulado_en,creado_por&liga_id=eq.${L}&tipo=eq.amistoso&order=simulado_en.desc&limit=8`)).datos;
  check(igual(lg.amistosos, am), 'los últimos amistosos');
  const fi = (await leer(`historial?select=id,tipo,texto,creado_en,datos&liga_id=eq.${L}&tipo=in.(compra,clausula,intercambio,subasta,sobre)&order=id.desc&limit=60`)).datos;
  check(igual(lg.fichajes, fi), `los fichajes (${fi.length})`);
} catch (e) {
  mal++;
  console.log(`\n  ✖ Error inesperado: ${e.stack ?? e.message}`);
} finally {
  const b = await rpc('slr_borrar_liga', { token: t, liga_id: L });
  check(b.ok, 'liga de prueba borrada', b.mensaje);
  await rpc('slr_logout', { token: t });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
  process.exitCode = mal ? 1 : 0;
}
