// Prueba de la API real de SLR: tipo, rareza y colecciones.
//   node tests/slr/api-paso10.mjs
// · disenos_carta.rareza sale del tier (F/E/D común, C/B rara, A épica, S legendaria).
// · Colecciones (modo pruebas, solo el admin): crear, editar, nombre único, borrar
//   (sus cartas se quedan sin colección), y solo dentro de su liga de prueba.
// · Nombre de carta único dentro de su colección (y entre las que no tienen).
// · Tipos grupo y especial.
// · Sobres por rareza: el básico nunca da legendarias (peso 0); la garantía
//   premium da al menos una rara o superior; las subastas de la tanda solo
//   sacan rarezas con peso; la configuración tiene los pesos por rareza.
import { env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO');
const U = { codigo: env.SLR_BOT_UNO_CODIGO }, D = { codigo: env.SLR_BOT_DOS_CODIGO };
let L = null, L2 = null;
const RAREZA = { F: 'comun', E: 'comun', D: 'comun', C: 'rara', B: 'rara', A: 'epica', S: 'legendaria' };
const ORDEN = ['comun', 'rara', 'epica', 'legendaria'];
for (const b of [U, D]) b.token = (await rpcOk('slr_login', { codigo: b.codigo })).token;

try {
  seccion('Rareza (columna generada)');
  {
    const ds = (await leer('disenos_carta?select=tier,rareza&limit=5000')).datos;
    check(ds.length > 0 && ds.every(d => d.rareza === RAREZA[d.tier]), `las ${ds.length} cartas: rareza = la de su tier`);
  }

  seccion('Liga de prueba');
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 10 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  U.equipo = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  D.equipo = (await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' })).equipo.id;
  const cfg = (await leer(`ligas?select=config&id=eq.${L}`)).datos[0].config;
  check(JSON.stringify(Object.keys(cfg.pesos_mercado).sort()) === JSON.stringify([...ORDEN].sort()) &&
        cfg.sobres.basico.pesos.legendaria === 0 && cfg.sobres.premium.pesos.rara === 30 && cfg.sobres.eleccion.pesos.legendaria === 5,
    `pesos por rareza en la configuración: básico ${Object.values(cfg.sobres.basico.pesos).join('/')}, premium ${Object.values(cfg.sobres.premium.pesos).join('/')}, ` +
    `elección ${Object.values(cfg.sobres.eleccion.pesos).join('/')}, subastas ${Object.values(cfg.pesos_mercado).join('/')}`);

  seccion('Colecciones');
  const EMBLEMA = 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1/emblema-de-prueba.png';
  rechaza(await rpc('slr_admin_guardar_coleccion', { token: D.token, liga_id: L, coleccion: { nombre: 'Dormidito' } }), 'administrador', 'solo el admin crea colecciones');
  rechaza(await rpc('slr_admin_guardar_coleccion', { token: U.token, liga_id: L, coleccion: { nombre: 'X' } }), 'entre 2 y 40', 'nombre demasiado corto: rechazado');
  const k1 = await rpcOk('slr_admin_guardar_coleccion', { token: U.token, liga_id: L, coleccion: { nombre: 'Dormidito', color: 'morado', emblema_url: EMBLEMA, descripcion: 'Dormidos' } });
  check(k1.id && k1.color === 'morado' && k1.liga_prueba_id === L && k1.cartas === 0, 'creada «Dormidito» (morado, con emblema), ligada a la liga de prueba');
  rechaza(await rpc('slr_admin_guardar_coleccion', { token: U.token, liga_id: L, coleccion: { nombre: 'dormidito' } }), 'Ya hay una colección', 'nombre repetido (sin mirar mayúsculas): rechazado');
  rechaza(await rpc('slr_admin_guardar_coleccion', { token: U.token, liga_id: L, coleccion: { nombre: 'Rara', color: 'fucsia' } }), 'check', 'color fuera de la paleta: rechazado');
  const k2 = await rpcOk('slr_admin_guardar_coleccion', { token: U.token, liga_id: L, coleccion: { nombre: 'Down', color: 'naranja' } });
  const k1b = await rpcOk('slr_admin_guardar_coleccion', { token: U.token, liga_id: L, coleccion: { id: k1.id, nombre: 'Dormiditos', color: 'azul', emblema_url: EMBLEMA } });
  check(k1b.id === k1.id && k1b.nombre === 'Dormiditos' && k1b.color === 'azul', 'editar: nombre y color cambiados');
  const publica = (await leer(`colecciones?select=id,nombre&id=eq.${k1.id}`)).datos;
  check(publica.length === 1, 'la tabla colecciones se lee sin sesión (lectura pública)');

  seccion('Cartas con colección: nombre único dentro de cada colección');
  const base = { tipo: 'individual', perfil: 'atacante', tier: 'D', semilla_stats: 7, semilla_poderes: 8 };
  const m1 = await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Mateo', coleccion_id: k1.id } });
  const m2 = await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Mateo', coleccion_id: k2.id } });
  check(m1.id && m2.id, '«Mateo» en Dormiditos y «Mateo» en Down: se puede');
  rechaza(await rpc('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'mateo', coleccion_id: k1.id } }),
    'Ya hay una carta «mateo» en la colección Dormiditos', 'otro «mateo» en Dormiditos: rechazado con un mensaje claro');
  await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Mateo Suelto' } });
  rechaza(await rpc('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Mateo Suelto' } }),
    'sin colección', 'dos «Mateo Suelto» sin colección: rechazado');
  const [d1] = (await leer(`disenos_carta?select=coleccion_id,rareza,tier&id=eq.${m1.id}`)).datos;
  check(d1.coleccion_id === k1.id && d1.rareza === 'comun', 'guardada con su colección y rareza común (tier D)');
  const leg = await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Leyenda', tier: 'S', coleccion_id: k2.id } });
  check((await leer(`disenos_carta?select=rareza&id=eq.${leg.id}`)).datos[0].rareza === 'legendaria', 'tier S → legendaria');
  for (const tipo of ['grupo', 'especial']) {
    const r = await rpc('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: `Tipo ${tipo}`, tipo } });
    check(r.ok, `tipo «${tipo}» admitido`, r.mensaje);
  }
  rechaza(await rpc('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Tipo raro', tipo: 'cuarteto' } }), 'tipo_check', 'tipo inexistente: rechazado');
  const cj = await rpcOk('slr_carta', { token: U.token, carta_id: m1.carta_id });
  check(cj.coleccion_id === k1.id && cj.rareza === 'comun', 'slr_carta (carta_json) trae coleccion_id y rareza');
  const adm = await rpcOk('slr_admin_cartas', { token: U.token, liga_id: L });
  check(adm.cartas.find(c => c.id === m1.carta_id)?.coleccion_id === k1.id, 'slr_admin_cartas también');

  seccion('Colección de una liga de prueba: solo en esa liga');
  const otra = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 10 b · ${new Date().toISOString().slice(0, 16)}` });
  L2 = otra.id;
  rechaza(await rpc('slr_admin_guardar_diseno', { token: U.token, liga_id: L2, diseno: { ...base, nombre: 'Intrusa', coleccion_id: k1.id } }),
    'liga de prueba', 'usarla en una carta de otra liga: rechazado');
  rechaza(await rpc('slr_admin_guardar_coleccion', { token: U.token, liga_id: L2, coleccion: { id: k1.id, nombre: 'Robada' } }),
    'solo se editan', 'editarla desde otra liga: rechazado');

  seccion('Borrar colección');
  await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Leyenda Suelta' } });
  const choque = await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Leyenda Suelta', coleccion_id: k2.id } });
  rechaza(await rpc('slr_admin_borrar_coleccion', { token: U.token, liga_id: L, coleccion_id: k2.id }), 'mismo nombre',
    'si al quedarse sin colección chocara un nombre: no se borra');
  await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, id: choque.id, nombre: 'Leyenda Down', coleccion_id: k2.id } });
  const b = await rpcOk('slr_admin_borrar_coleccion', { token: U.token, liga_id: L, coleccion_id: k2.id });
  check(b.borrada === 'Down' && b.cartas_sin_coleccion === 3, `borrada «Down»: sus ${b.cartas_sin_coleccion} cartas se quedan sin colección`);
  check((await leer(`disenos_carta?select=coleccion_id&id=eq.${m2.id}`)).datos[0].coleccion_id === null && (await leer(`colecciones?select=id&id=eq.${k2.id}`)).datos.length === 0,
    'y siguen existiendo, sin colección');

  seccion('Sobres por rareza');
  const libres = async () => (await leer(`cartas?select=id,equipo_id,disenos_carta(rareza,activo)&liga_id=eq.${L}&limit=5000`)).datos
    .filter(c => !c.equipo_id && c.disenos_carta.activo);
  const rarezasLibres = new Set((await libres()).map(c => c.disenos_carta.rareza));
  check(true, `rarezas con cartas libres en la liga: ${[...rarezasLibres].join(', ')}`);
  const darDinero = (eq, importe) => rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: eq, importe });
  const vender = async (eq, token) => {
    for (const c of (await leer(`cartas?select=id&equipo_id=eq.${eq}`)).datos) await rpcOk('slr_vender_banco', { token, carta_id: c.id });
  };
  await darDinero(D.equipo, 300000);
  await vender(D.equipo, D.token);
  const basicas = [];
  for (let i = 0; i < 8; i++) {
    const s = await rpcOk('slr_comprar_sobre', { token: D.token, liga_id: L, tipo: 'basico' });
    basicas.push(...s.cartas.map(c => c.rareza));
    await vender(D.equipo, D.token);
  }
  check(basicas.length === 24 && !basicas.includes('legendaria'), `24 cartas de sobres básicos, ninguna legendaria (peso 0): ${[...new Set(basicas)].join(', ')}`);
  // Garantía premium: con el contador en 2, la primera carta es rara o superior (si queda alguna libre)
  let vista = false;
  for (let i = 0; i < 60 && !vista; i++) {
    const cont = (await leer(`equipos?select=contador_garantia_premium&id=eq.${D.equipo}`)).datos[0].contador_garantia_premium;
    const hayRara = (await libres()).some(c => c.disenos_carta.rareza !== 'comun');
    const s = await rpcOk('slr_comprar_sobre', { token: D.token, liga_id: L, tipo: 'premium' });
    if (cont >= 2 && hayRara) {
      vista = true;
      check(s.garantia_aplicada && s.cartas[0].rareza !== 'comun', `garantía premium: con el contador en ${cont}, la primera carta es ${s.cartas[0].rareza}`);
    }
    await vender(D.equipo, D.token);
  }
  if (!vista) check(rarezasLibres.size === 1, 'no hubo ocasión de ver la garantía (no quedan raras o superiores libres)');
} catch (e) {
  resultado.fallos++;
  console.log(`\n  ✖ Error inesperado: ${e.message}`);
} finally {
  for (const l of [L, L2]) if (l) {
    const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: l });
    check(b.ok, 'liga de prueba borrada (con sus colecciones y cartas)', b.mensaje);
  }
  if (L) check((await leer(`colecciones?select=id&liga_prueba_id=eq.${L}`)).datos.length === 0, 'sin colecciones de la liga de prueba');
  for (const b of [U, D]) if (b.token) await rpc('slr_logout', { token: b.token });
  console.log(`\n${resultado.total - resultado.fallos}/${resultado.total} comprobaciones correctas` +
    `${resultado.fallos ? ` · ${resultado.fallos} FALLOS` : ''}`);
  process.exitCode = resultado.fallos ? 1 : 0;
}
