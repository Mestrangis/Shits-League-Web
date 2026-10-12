// Prueba de la API real de SLR (paso 2) contra el proyecto de Supabase.
//   node tests/slr/api-paso2.mjs
// Usa js/slr/config.js (URL y clave pública) y los códigos de los bots de
// .env.local (SLR_BOT_UNO_CODIGO, SLR_BOT_DOS_CODIGO). Crea una liga de prueba
// y la borra al terminar, aunque algo falle.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { SUPABASE_URL, SUPABASE_KEY } from '../../js/slr/config.js';

/* ── Entorno ─────────────────────────────────────────────────────────────── */
const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
for (const k of ['SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO']) {
  if (!env[k]) { console.error(`Falta ${k} en .env.local`); process.exit(1); }
}

const BASE = `${SUPABASE_URL}/rest/v1`;
const CABECERAS = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };

async function pedir(metodo, ruta, cuerpo) {
  const r = await fetch(`${BASE}/${ruta}`, {
    method: metodo, headers: { ...CABECERAS, Prefer: 'return=representation' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let datos;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  return { ok: r.ok, status: r.status, datos, mensaje: datos?.message ?? '' };
}
const rpc = (fn, cuerpo) => pedir('POST', `rpc/${fn}`, cuerpo);
const leer = ruta => pedir('GET', ruta);

/* ── Mini runner ─────────────────────────────────────────────────────────── */
let fallos = 0, total = 0;
function check(condicion, que, detalle = '') {
  total++;
  if (condicion) console.log(`  ✔ ${que}`);
  else { fallos++; console.log(`  ✖ ${que}${detalle ? ` — ${detalle}` : ''}`); }
  return condicion;
}
function rechaza(r, contiene, que) {
  return check(!r.ok && r.mensaje.toLowerCase().includes(contiene.toLowerCase()), que,
    r.ok ? 'se aceptó' : `HTTP ${r.status}: ${r.mensaje}`);
}
const seccion = t => console.log(`\n${t}`);

const ovr = d => { const [a, b, c] = [d.ata, d.def, d.con].sort((x, y) => y - x); return 0.6 * a + 0.25 * b + 0.15 * c; };

// Media de valor de las individuales libres de la liga (calculada desde fuera)
async function mediaIndividualesLibres(liga) {
  const r = await leer(`cartas?select=id,disenos_carta!inner(tipo,valor)&liga_id=eq.${liga}&equipo_id=is.null&disenos_carta.tipo=eq.individual`);
  const valores = r.datos.map(c => c.disenos_carta.valor);
  return { n: valores.length, media: valores.reduce((s, v) => s + v, 0) / valores.length };
}

async function comprobarEquipo(nombreBot, token, usuarioId, liga, union, media) {
  const equipo = union.equipo;
  check(equipo.saldo === 5000, `${nombreBot}: saldo inicial 5.000`, `saldo ${equipo.saldo}`);

  const cartas = (await leer(`cartas?select=id,blindada_hasta,multiplicador_clausula,adquirida_en,diseno_id,disenos_carta(tipo,valor,ata,def,con)&equipo_id=eq.${equipo.id}`)).datos;
  check(cartas.length === 11, `${nombreBot}: 11 cartas en la plantilla`, `${cartas.length}`);
  check(cartas.every(c => c.disenos_carta.tipo === 'individual'), `${nombreBot}: todas individuales`);

  const objetivo = 11 * media;
  const total = cartas.reduce((s, c) => s + c.disenos_carta.valor, 0);
  check(Math.abs(total - objetivo) <= 0.10 * objetivo,
    `${nombreBot}: valor total ${total} dentro de ±10 % de 11 × media (${objetivo.toFixed(0)})`,
    `diferencia ${(100 * (total - objetivo) / objetivo).toFixed(1)} %`);
  check(union.plantilla_inicial.dentro === true && union.plantilla_inicial.valor_total === total,
    `${nombreBot}: la función informa del mismo valor total y de que cumple`);

  const dias = c => (new Date(c.blindada_hasta) - new Date(c.adquirida_en)) / 86400000;
  check(cartas.every(c => Math.abs(dias(c) - 7) < 0.01), `${nombreBot}: blindaje de 7 días en las 11`);
  check(cartas.every(c => Number(c.multiplicador_clausula) === 1.5), `${nombreBot}: multiplicador de cláusula 1,5`);

  const album = (await leer(`album?usuario_id=eq.${usuarioId}&liga_id=eq.${liga}`)).datos;
  check(album.length === 11 && album.every(a => a.via_adquisicion === 'inicial'),
    `${nombreBot}: 11 entradas en el álbum con vía «inicial»`, `${album.length}`);
  check(new Set(album.map(a => a.diseno_id)).size === 11 && cartas.every(c => album.some(a => a.diseno_id === c.diseno_id)),
    `${nombreBot}: el álbum tiene exactamente sus diseños`);

  // Alineación por defecto 2-2-2 con las mejores cartas para cada hueco
  const al = (await leer(`alineaciones?equipo_id=eq.${equipo.id}`)).datos[0];
  const porId = Object.fromEntries(cartas.map(c => [c.id, c.disenos_carta]));
  const tit = al ? [al.huecos.por, ...al.huecos.def, ...al.huecos.med, ...al.huecos.del] : [];
  check(al && al.formacion === '2-2-2' && al.huecos.def.length === 2 && al.huecos.med.length === 2 && al.huecos.del.length === 2,
    `${nombreBot}: alineación por defecto 2-2-2`);
  if (al) {
    const todas = [...tit, ...al.banquillo];
    check(new Set(todas).size === 10 && todas.every(id => porId[id]), `${nombreBot}: 7 titulares y 3 suplentes propios y sin repetir`);
    const maxDef = Math.max(...cartas.map(c => c.disenos_carta.def));
    check(porId[al.huecos.por].def === maxDef, `${nombreBot}: el portero es la carta de más DEF`);
    const maxOvrTit = Math.max(...tit.map(id => ovr(porId[id])));
    check(tit.includes(al.capitan_id) && ovr(porId[al.capitan_id]) === maxOvrTit, `${nombreBot}: capitán = titular de mayor OVR`);
  }

  // Saldo = suma de movimientos
  const movs = await rpc('slr_movimientos', { token, equipo_id: equipo.id });
  const saldoTabla = (await leer(`equipos?select=saldo&id=eq.${equipo.id}`)).datos[0].saldo;
  const suma = movs.datos.reduce((s, m) => s + m.importe, 0);
  check(movs.ok && suma === saldoTabla && movs.datos.at(-1).saldo_despues === saldoTabla,
    `${nombreBot}: saldo (${saldoTabla}) = suma de sus movimientos (${suma})`);
  check(movs.datos.length === 1 && movs.datos[0].tipo === 'saldo_inicial', `${nombreBot}: un movimiento «saldo_inicial»`);

  return { equipo, cartas, alineacion: al };
}

/* ── Prueba ──────────────────────────────────────────────────────────────── */
let ligaId = null, tokenAdmin = null;
const tokens = [];

try {
  seccion('Login');
  rechaza(await rpc('slr_login', { codigo: 'esto-no-es-un-codigo' }), 'Código incorrecto', 'código incorrecto: rechazado');
  const l1 = await rpc('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO });
  const l2 = await rpc('slr_login', { codigo: `  ${env.SLR_BOT_DOS_CODIGO.toUpperCase()} ` });
  check(l1.ok && l1.datos.usuario.nombre === 'Bot Uno', 'login de Bot Uno', l1.mensaje);
  check(l2.ok && l2.datos.usuario.nombre === 'Bot Dos', 'login de Bot Dos (con mayúsculas y espacios)', l2.mensaje);
  if (!l1.ok || !l2.ok) throw new Error('Sin login no se puede seguir');
  const [t1, t2] = [l1.datos.token, l2.datos.token];
  tokens.push(t1, t2);
  tokenAdmin = t1;
  const [u1, u2] = [l1.datos.usuario.id, l2.datos.usuario.id];
  const yo = await rpc('slr_yo', { token: t1 });
  check(yo.ok && yo.datos.usuario.id === u1, 'slr_yo devuelve el usuario de la sesión');

  seccion('Crear liga');
  const nDisenos = (await leer('disenos_carta?select=id&activo=eq.true')).datos.length;
  const liga = await rpc('slr_crear_liga', { token: t1, nombre: `Prueba API paso 2 · ${new Date().toISOString().slice(0, 16)}` });
  check(liga.ok, 'Bot Uno crea la liga', liga.mensaje);
  if (!liga.ok) throw new Error('Sin liga no se puede seguir');
  ligaId = liga.datos.id;
  check(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(liga.datos.codigo_invitacion), `código de invitación legible: ${liga.datos.codigo_invitacion}`);
  check(liga.datos.cartas === nDisenos, `un ejemplar de cada diseño activo (${liga.datos.cartas} de ${nDisenos})`);
  const libres = (await leer(`cartas?select=id&liga_id=eq.${ligaId}&equipo_id=is.null`)).datos.length;
  check(libres === nDisenos, 'todos los ejemplares nacen libres');
  check(!(await leer(`equipos?liga_id=eq.${ligaId}`)).datos.length, 'crear la liga no crea equipo');

  seccion('Unirse: Bot Uno');
  const m1 = await mediaIndividualesLibres(ligaId);
  const j1 = await rpc('slr_unirse_liga', { token: t1, codigo_invitacion: liga.datos.codigo_invitacion.toLowerCase(), nombre_equipo: 'Bots Uno FC' });
  check(j1.ok, 'Bot Uno se une (código en minúsculas)', j1.mensaje);
  const e1 = await comprobarEquipo('Bot Uno', t1, u1, ligaId, j1.datos, m1.media);

  seccion('Unirse: Bot Dos');
  const m2 = await mediaIndividualesLibres(ligaId);
  check(m2.n === m1.n - 11, `quedan ${m2.n} individuales libres (11 menos)`);
  const j2 = await rpc('slr_unirse_liga', { token: t2, codigo_invitacion: liga.datos.codigo_invitacion, nombre_equipo: 'Dos Bots CF' });
  check(j2.ok, 'Bot Dos se une', j2.mensaje);
  const e2 = await comprobarEquipo('Bot Dos', t2, u2, ligaId, j2.datos, m2.media);
  check(!e1.cartas.some(c => e2.cartas.some(d => d.id === c.id)), 'los dos equipos no comparten ninguna carta');
  rechaza(await rpc('slr_unirse_liga', { token: t2, codigo_invitacion: liga.datos.codigo_invitacion, nombre_equipo: 'Otra vez' }),
    'Ya tienes un equipo', 'unirse dos veces: rechazado');
  rechaza(await rpc('slr_unirse_liga', { token: t2, codigo_invitacion: 'ZZZZZZ', nombre_equipo: 'Nadie' }),
    'Código de invitación incorrecto', 'código de invitación inexistente: rechazado');

  const yo2 = await rpc('slr_yo', { token: t2 });
  check(yo2.ok && yo2.datos.ligas.some(l => l.id === ligaId && !l.es_admin && l.codigo_invitacion)
    && yo2.datos.equipos.some(e => e.id === e2.equipo.id && e.liga_id === ligaId && e.saldo === 5000),
    'slr_yo de Bot Dos: su liga (no admin, con código) y su equipo con saldo');

  const clas = await leer(`clasificacion?liga_id=eq.${ligaId}`);
  check(clas.ok && clas.datos.length === 2 && clas.datos.every(f => f.pj === 0 && f.puntos === 0),
    'la clasificación (vista pública) muestra los dos equipos a cero');

  seccion('Guardar alineación');
  const porStat = (stat, excluir, n) => e1.cartas.filter(c => !excluir.includes(c.id))
    .sort((a, b) => b.disenos_carta[stat] - a.disenos_carta[stat]).slice(0, n).map(c => c.id);
  const por = porStat('def', [], 1)[0];
  const def = porStat('def', [por], 1);
  const med = porStat('con', [por, ...def], 3);
  const del = porStat('ata', [por, ...def, ...med], 2);
  const banco = e1.cartas.map(c => c.id).filter(id => ![por, ...def, ...med, ...del].includes(id)).slice(0, 3);
  const valida = { token: t1, equipo_id: e1.equipo.id, formacion: '1-3-2', huecos: { por, def, med, del }, banquillo: banco, orden_manual: true, capitan_id: del[0] };
  const g = await rpc('slr_guardar_alineacion', valida);
  check(g.ok && g.datos.formacion === '1-3-2' && g.datos.orden_manual === true && g.datos.capitan_id === del[0], 'alineación 1-3-2 válida: guardada', g.mensaje);
  const leida = (await leer(`alineaciones?equipo_id=eq.${e1.equipo.id}`)).datos[0];
  check(leida.formacion === '1-3-2' && JSON.stringify(leida.huecos.med) === JSON.stringify(med), 'se lee tal cual se guardó');

  const ajena = e2.cartas[0].id;
  rechaza(await rpc('slr_guardar_alineacion', { ...valida, formacion: '3-1-2' }), 'Formación no permitida', 'formación 3-1-2: rechazada');
  rechaza(await rpc('slr_guardar_alineacion', { ...valida, formacion: '2-2-2' }), 'pide', 'huecos que no cuadran con la formación: rechazado');
  rechaza(await rpc('slr_guardar_alineacion', { ...valida, huecos: { por, def, med, del: [del[0], ajena] } }),
    'tienen que ser de tu equipo', 'carta de otro equipo: rechazada');
  rechaza(await rpc('slr_guardar_alineacion', { ...valida, huecos: { por, def, med, del: [del[0], del[0]] } }),
    'dos veces', 'carta repetida en los titulares: rechazada');
  rechaza(await rpc('slr_guardar_alineacion', { ...valida, banquillo: [banco[0], banco[1], del[1]] }),
    'dos veces', 'titular repetido en el banquillo: rechazado');
  rechaza(await rpc('slr_guardar_alineacion', { ...valida, capitan_id: banco[0] }), 'capitán', 'capitán en el banquillo: rechazado');
  rechaza(await rpc('slr_guardar_alineacion', { ...valida, banquillo: [...banco, ajena] }), 'como máximo 3', 'banquillo de 4: rechazado');
  rechaza(await rpc('slr_guardar_alineacion', { ...valida, token: randomUUID() }), 'Sesión no válida', 'token falso: rechazado');
  rechaza(await rpc('slr_guardar_alineacion', { ...valida, token: 'no-es-un-uuid' }), 'Sesión no válida', 'token con formato roto: rechazado');
  rechaza(await rpc('slr_guardar_alineacion', { ...valida, token: t2 }), 'no es tuyo', 'Bot Dos intenta guardar la alineación de Bot Uno: rechazado');
  const sigue = (await leer(`alineaciones?equipo_id=eq.${e1.equipo.id}`)).datos[0];
  check(sigue.guardada_en === leida.guardada_en, 'los intentos rechazados no han cambiado la alineación guardada');

  seccion('Seguridad: lecturas y escrituras directas');
  const vacioOError = r => !r.ok || (Array.isArray(r.datos) && r.datos.length === 0);
  for (const t of ['pujas', 'codigos', 'sesiones', 'movimientos', 'ofertas', 'intercambios', 'sobres_abiertos', 'notificaciones']) {
    const r = await leer(`${t}?select=*&limit=1`);
    check(vacioOError(r), `no se puede leer «${t}» directamente`, `HTTP ${r.status}`);
  }
  const cod = await leer(`ligas?select=codigo_invitacion&id=eq.${ligaId}`);
  check(!cod.ok, 'no se puede leer el código de invitación de las ligas', `HTTP ${cod.status}`);
  const ligaPublica = await leer(`ligas?select=id,nombre,estado&id=eq.${ligaId}`);
  check(ligaPublica.ok && ligaPublica.datos.length === 1, 'el resto de la liga sí es público');

  const escrituras = [
    ['POST', 'equipos', { liga_id: ligaId, usuario_id: u1, nombre: 'Pirata' }],
    ['PATCH', `equipos?id=eq.${e1.equipo.id}`, { saldo: 999999 }],
    ['POST', 'movimientos', { equipo_id: e1.equipo.id, tipo: 'regalo', importe: 1000, saldo_despues: 6000 }],
    ['PATCH', `cartas?id=eq.${ajena}`, { equipo_id: e1.equipo.id }],
    ['DELETE', `album?usuario_id=eq.${u1}`, undefined],
    ['POST', 'codigos', { usuario_id: u1, codigo_hash: '0'.repeat(64) }],
  ];
  for (const [metodo, ruta, cuerpo] of escrituras) {
    const r = await pedir(metodo, ruta, cuerpo);
    check(!r.ok || (Array.isArray(r.datos) && r.datos.length === 0), `${metodo} directo a ${ruta.split('?')[0]}: falla`, `HTTP ${r.status}`);
  }
  check((await leer(`equipos?select=saldo&id=eq.${e1.equipo.id}`)).datos[0].saldo === 5000, 'el saldo sigue en 5.000');
  check((await leer(`cartas?select=equipo_id&id=eq.${ajena}`)).datos[0].equipo_id === e2.equipo.id, 'la carta de Bot Dos sigue siendo suya');

  const interna = await rpc('mover_dinero', { p_equipo: e1.equipo.id, p_importe: 1000, p_tipo: 'regalo' });
  check(!interna.ok, 'la función interna mover_dinero no se puede llamar desde fuera', `HTTP ${interna.status}`);
  const interna2 = await rpc('sesion_usuario', { p_token: t1 });
  check(!interna2.ok, 'la función interna sesion_usuario no se puede llamar desde fuera', `HTTP ${interna2.status}`);

  seccion('Borrar la liga');
  rechaza(await rpc('slr_borrar_liga', { token: t2, liga_id: ligaId }), 'Solo el administrador', 'Bot Dos (no admin) no puede borrarla');
} catch (e) {
  fallos++;
  console.log(`\n  ✖ Error inesperado: ${e.message}`);
} finally {
  if (ligaId && tokenAdmin) {
    const b = await rpc('slr_borrar_liga', { token: tokenAdmin, liga_id: ligaId });
    check(b.ok && b.datos === true, 'Bot Uno (admin) borra la liga de prueba', b.mensaje);
    const resto = await Promise.all([
      leer(`ligas?select=id&id=eq.${ligaId}`), leer(`equipos?select=id&liga_id=eq.${ligaId}`),
      leer(`cartas?select=id&liga_id=eq.${ligaId}`), leer(`album?select=diseno_id&liga_id=eq.${ligaId}`),
    ]);
    check(resto.every(r => r.ok && r.datos.length === 0), 'no queda nada de la liga (liga, equipos, cartas, álbum)');
  }
  for (const t of tokens) await rpc('slr_logout', { token: t });
  if (tokens.length) {
    rechaza(await rpc('slr_yo', { token: tokens[0] }), 'Sesión no válida', 'tras el logout el token ya no vale');
  }
  console.log(`\n${total - fallos}/${total} comprobaciones correctas${fallos ? ` · ${fallos} FALLOS` : ''}`);
  process.exitCode = fallos ? 1 : 0;
}
