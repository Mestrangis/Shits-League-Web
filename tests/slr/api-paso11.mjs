// Prueba de la API real de SLR: motor v2.0.0, fase 2 (servidor).
//   node tests/slr/api-paso11.mjs
// · Rasgos del diseño (estamina, táctica favorita): generados, en el formulario y
//   en la edición múltiple.
// · Tácticas guardadas: validación, privadas (nadie más las lee) y en la misma
//   llamada que la alineación.
// · Amistoso: el rival juega con sus tácticas públicas; solo quien lo jugó ve la
//   crónica; no gasta energía.
// · Jornadas de liga: tácticas, cruce y participación guardadas; la energía se
//   gasta y se recupera según la regla (también quien descansa); los bots eligen
//   táctica al azar y rotan con «Sugerir alineación».
// · Una carta que cambia de dueño conserva su energía; nueva temporada: todas a 100.
// Liga de prueba con Bot Uno (admin), Bot Dos y 3 bots: se borra al terminar.
import { env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado } from './api-util.mjs';
import { SUPABASE_URL, SUPABASE_KEY } from '../../js/slr/config.js';
import { energiaTras, sugerirAlineacion } from '../../js/slr/energia.js';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO');
const dormir = ms => new Promise(r => setTimeout(r, ms));
const U = { codigo: env.SLR_BOT_UNO_CODIGO }, D = { codigo: env.SLR_BOT_DOS_CODIGO };
const TACTICAS = ['posesion', 'contraataque', 'presion'];
let L = null;

async function funcion(cuerpo) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/slr-simular`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  });
  return { status: r.status, datos: await r.json() };
}
async function jugarJornada() {
  for (let i = 0; i < 60; i++) {
    const r = await rpcOk('slr_admin_jugar_jornada', { token: U.token, liga_id: L });
    if (r.estado !== 'simulando') return r;
    await dormir(1500);
  }
  throw new Error('La simulación no termina');
}
const cartas = async () => (await leer(`cartas?select=id,equipo_id,energia,disenos_carta(nombre,ata,def,con,estamina,tactica_favorita,perfil)` +
  `&liga_id=eq.${L}&limit=5000`)).datos;
const energias = async () => Object.fromEntries((await cartas()).map(c => [c.id, c.energia]));
const idsTitulares = al => [al.por, ...al.def, ...al.med, ...al.del].map(c => c.id);

// Energía esperada tras una jornada: lo jugado en cada partido publicado de esa jornada
function energiaEsperada(antes, lista, partidos) {
  const tramos = {};
  for (const p of partidos) {
    for (const [lado, clave] of [['A', 'local'], ['B', 'visitante']]) {
      const part = p.participacion[lado], tac = p.tacticas[lado], tit = idsTitulares(p.alineaciones_congeladas[clave]);
      for (const id of part.completo) tramos[id] = [tac[0], tac[1]];
      for (const id of part.parcial) tramos[id] = [tit.includes(id) ? tac[0] : tac[1]];
    }
  }
  return Object.fromEntries(lista.map(c => [c.id, energiaTras(antes[c.id], c.disenos_carta.estamina, tramos[c.id] ?? [])]));
}
async function comprobarEnergia(etiqueta, antes, jornadaId) {
  const ps = (await leer(`partidos?select=id,local_id,visitante_id,tacticas,participacion,energia,alineaciones_congeladas&jornada_id=eq.${jornadaId}`)).datos;
  const lista = await cartas();
  const esperada = energiaEsperada(antes, lista, ps);
  const mal = lista.filter(c => c.energia !== esperada[c.id]);
  check(mal.length === 0, `${etiqueta}: la energía de las ${lista.length} cartas de la liga sigue la regla (gasto por estamina y presión, +20 / +40)`,
    mal.slice(0, 3).map(c => `${c.disenos_carta.nombre}: ${antes[c.id]} → ${c.energia} (esperada ${esperada[c.id]})`).join(' · '));
  return { ps, lista };
}

try {
  for (const b of [U, D]) b.token = (await rpcOk('slr_login', { codigo: b.codigo })).token;

  seccion('Rasgos del catálogo');
  {
    const ds = (await leer('disenos_carta?select=perfil,estamina,tactica_favorita&liga_prueba_id=is.null&limit=5000')).datos;
    const TF = { atacante: 'contraataque', control: 'posesion', defensa: 'presion', portero: null };
    check(ds.length > 0 && ds.every(d => ['alta', 'media', 'baja'].includes(d.estamina)), `las ${ds.length} cartas tienen estamina`);
    check(ds.every(d => d.perfil === 'equilibrado' ? TACTICAS.includes(d.tactica_favorita) : d.tactica_favorita === TF[d.perfil]),
      'táctica favorita según el perfil (equilibrado: una al azar; portero: ninguna)');
    const n = k => ds.filter(d => d.estamina === k).length;
    check(n('media') > n('alta') && n('media') > n('baja'), `reparto: ${n('alta')} alta · ${n('media')} media · ${n('baja')} baja`);
  }

  seccion('Liga de prueba: Bot Uno, Bot Dos y 3 bots');
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 11 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  U.equipo = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  D.equipo = (await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' })).equipo.id;
  for (let i = 0; i < 3; i++) await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L });
  const bots = (await leer(`equipos?select=id,nombre,usuarios(interno)&liga_id=eq.${L}`)).datos.filter(e => e.usuarios.interno).map(e => e.id);
  check(bots.length === 3, '3 bots del modo pruebas');
  check((await cartas()).every(c => c.energia === 100), 'todas las cartas empiezan con 100 de energía');

  seccion('Formulario y edición múltiple: estamina y táctica favorita');
  {
    const base = { tipo: 'individual', perfil: 'atacante', tier: 'D', semilla_stats: 11, semilla_poderes: 12 };
    const g = await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Rasgos generados' } });
    check(g.estamina && g.tactica_favorita === 'contraataque', `sin rasgos: se generan (${g.estamina}, ${g.tactica_favorita})`);
    const m = await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Rasgos a mano', estamina: 'baja', tactica_favorita: '' } });
    check(m.estamina === 'baja' && m.tactica_favorita === null, 'a mano: estamina baja y sin táctica favorita');
    rechaza(await rpc('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Mala', estamina: 'infinita' } }), 'check', 'estamina no válida: rechazada');
    const e = await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, id: m.id, nombre: 'Rasgos a mano', tactica_favorita: 'presion' } });
    check(e.estamina === 'baja' && e.tactica_favorita === 'presion', 'editar: la táctica cambia y la estamina (sin tocar) se queda');
    const cuenta = await rpcOk('slr_admin_editar_disenos', { token: U.token, liga_id: L, ids: [g.id, m.id], cambios: { estamina: 'alta', tactica_favorita: 'posesion' }, solo_contar: true });
    check(cuenta.cambian === 2 && cuenta.por_campo.estamina === 2 && cuenta.por_campo.tactica_favorita === 2, `edición múltiple, recuento: ${JSON.stringify(cuenta.por_campo)}`);
    await rpcOk('slr_admin_editar_disenos', { token: U.token, liga_id: L, ids: [g.id, m.id], cambios: { estamina: 'alta', tactica_favorita: '' } });
    const tras = (await leer(`disenos_carta?select=estamina,tactica_favorita&id=in.(${g.id},${m.id})`)).datos;
    check(tras.every(d => d.estamina === 'alta' && d.tactica_favorita === null), 'edición múltiple aplicada (estamina alta, táctica favorita: ninguna)');
    rechaza(await rpc('slr_admin_editar_disenos', { token: U.token, liga_id: L, ids: [g.id], cambios: { tactica_favorita: 'catenaccio' } }), 'check', 'táctica favorita no válida: rechazada');
    for (const id of [g.id, m.id]) {
      const c = (await leer(`cartas?select=id&diseno_id=eq.${id}`)).datos[0];
      if (c) await rpc('slr_admin_borrar_disenos', { token: U.token, liga_id: L, ids: [id] });
    }
  }

  seccion('Tácticas: privadas y validadas');
  const mias = (await cartas()).filter(c => c.equipo_id === U.equipo);
  const ordenadas = [...mias].sort((a, b) => b.disenos_carta.def - a.disenos_carta.def);
  const [p0, d1, d2, m1, m2, a1, a2, b1, b2, b3] = ordenadas.map(c => c.id);
  const alin = { token: U.token, equipo_id: U.equipo, formacion: '2-2-2', huecos: { por: p0, def: [d1, d2], med: [m1, m2], del: [a1, a2] },
    banquillo: [b1, b2, b3], orden_manual: false, capitan_id: p0 };
  const porDefecto = await rpcOk('slr_mis_tacticas', { token: U.token, equipo_id: U.equipo });
  check(porDefecto.tactica === 'posesion' && porDefecto.gestion === 'normal' && porDefecto.plan_b === null && porDefecto.cambios_avanzados.length === 0,
    'sin guardar: posesión, gestión normal, sin plan B ni cambios');
  rechaza(await rpc('slr_mis_tacticas', { token: D.token, equipo_id: U.equipo }), 'no es tuyo', 'las tácticas de otro equipo no se pueden leer');
  const directa = await leer('alineaciones_tacticas?select=*');
  check(!directa.ok || directa.datos.length === 0, `la tabla alineaciones_tacticas no se lee desde fuera (HTTP ${directa.status})`);
  const G = t => rpc('slr_guardar_tacticas', { token: U.token, equipo_id: U.equipo, tacticas: t });
  rechaza(await G({ tactica: 'catenaccio' }), 'Táctica no válida', 'táctica desconocida: rechazada');
  rechaza(await G({ tactica: 'presion', plan_b: { condicion: 'perdiendo', tactica: 'presion' } }), 'distinta', 'plan B con la misma táctica: rechazado');
  rechaza(await G({ tactica: 'presion', plan_b: { condicion: 'al descanso', tactica: 'posesion' } }), 'Condición del plan B', 'condición del plan B desconocida: rechazada');
  rechaza(await G({ tactica: 'presion', gestion: 'a_medias' }), 'Gestión no válida', 'gestión desconocida: rechazada');
  rechaza(await G({ tactica: 'presion', ritmo: 'alto' }), 'desconocido', 'campo desconocido: rechazado');
  await rpcOk('slr_guardar_alineacion', alin);
  const cambio = (sale, entra, condicion = 'siempre', extra = {}) => ({ sale, entra, condicion, ...extra });
  rechaza(await G({ tactica: 'presion', cambios_avanzados: [cambio(b1, b2)] }), 'titular', 'cambio programado: el que sale tiene que ser titular');
  rechaza(await G({ tactica: 'presion', cambios_avanzados: [cambio(a1, a2)] }), 'banquillo', 'cambio programado: el que entra tiene que estar en el banquillo');
  rechaza(await G({ tactica: 'presion', cambios_avanzados: [cambio(a1, b1, 'energia_menor')] }), 'umbral', 'cambio por energía sin umbral: rechazado');
  rechaza(await G({ tactica: 'presion', cambios_avanzados: [cambio(a1, b1, 'siempre', { umbral: 40 })] }), 'umbral', 'umbral en un cambio que no es por energía: rechazado');
  rechaza(await G({ tactica: 'presion', cambios_avanzados: [cambio(a1, b1), cambio(a1, b2)] }), 'solo puede salir', 'la misma carta no sale dos veces');
  rechaza(await G({ tactica: 'presion', cambios_avanzados: [cambio(a1, b1), cambio(a2, b2), cambio(m1, b3), cambio(m2, b3)] }), 'Como mucho 3', 'más de 3 cambios: rechazado');
  const T = { tactica: 'presion', plan_b: { condicion: 'perdiendo', tactica: 'posesion' }, gestion: 'a_tope',
    cambios_avanzados: [cambio(a1, b1), cambio(d1, b2, 'energia_menor', { umbral: 61 })] };
  const juntas = await rpcOk('slr_guardar_alineacion', { ...alin, tacticas: T });
  check(juntas.tacticas.tactica === 'presion' && juntas.tacticas.gestion === 'a_tope' && juntas.tacticas.cambios_avanzados.length === 2 &&
        juntas.tacticas.cambios_avanzados[1].umbral === 61, 'alineación y tácticas en la misma llamada (presión, plan B, a tope, 2 cambios)');
  const pub = (await leer(`alineaciones?select=*&equipo_id=eq.${U.equipo}`)).datos[0];
  check(pub && !('tactica' in pub) && !('gestion' in pub) && !('plan_b' in pub), 'la alineación pública no lleva nada de las tácticas');
  await rpcOk('slr_guardar_tacticas', { token: D.token, equipo_id: D.equipo, tacticas: { tactica: 'contraataque', gestion: 'reservon' } });

  seccion('Amistoso antes de empezar: el rival con sus tácticas públicas');
  {
    const antes = await energias();
    const am = await funcion({ accion: 'amistoso', token: D.token, rival_equipo_id: U.equipo });
    check(am.status === 200 && am.datos.version === '2.0.0', `amistoso Bot Dos – Bot Uno con el motor ${am.datos.version}: ${am.datos.goles?.join('-')}`);
    const p = await rpcOk('slr_partido', { token: D.token, partido_id: am.datos.partido_id });
    const [loc, vis] = [p.alineaciones_congeladas.local, p.alineaciones_congeladas.visitante];
    check(loc.tactica === 'contraataque' && loc.gestion === 'reservon', 'quien juega el amistoso usa sus tácticas guardadas');
    check(vis.tactica === 'posesion' && vis.gestion === 'normal' && vis.plan_b === null && vis.cambios_avanzados === null,
      'el rival juega con las públicas (aún sin partidos: posesión, normal, sin plan B ni cambios): no se filtra «presión»');
    check(p.tacticas?.A?.length === 2 && p.participacion?.A?.completo, 'el amistoso guarda tácticas y participación');
    check(vis.por.energia === 100 && 'tactica_favorita' in vis.por && 'coleccion_id' in vis.por && vis.por.estamina,
      'las cartas del motor llevan energía, estamina, táctica favorita y colección');
    rechaza(await rpc('slr_partido', { token: U.token, partido_id: am.datos.partido_id }), 'solo la ve quien lo jugó', 'la crónica del amistoso solo la ve quien lo jugó');
    const despues = await energias();
    check(Object.keys(antes).every(k => antes[k] === despues[k]), 'el amistoso no gasta ni recupera energía');
  }

  seccion('Jornada 1');
  await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });
  const jornadas = (await leer(`jornadas?select=id,numero,descansa_id&liga_id=eq.${L}&order=numero`)).datos;
  let antes = await energias();
  let r = await jugarJornada();
  check(r.estado === 'publicada', 'jornada 1 publicada');
  let { ps, lista } = await comprobarEnergia('jornada 1', antes, jornadas[0].id);
  const pU = ps.find(p => U.equipo === p.local_id || U.equipo === p.visitante_id);
  check(ps.every(p => p.tacticas?.A?.length === 2 && p.tacticas?.B?.length === 2 && Array.isArray(p.tacticas.cruce) && p.participacion && p.energia),
    `los ${ps.length} partidos guardan tácticas por tramo, cruce, participación y energía gastada`);
  if (pU) {
    const lado = pU.local_id === U.equipo ? 'A' : 'B';
    const t = pU.tacticas[lado], planB = !!pU.tacticas.plan_b?.[lado];
    check(t[0] === 'presion' && (planB ? t[1] === 'posesion' : t[1] === 'presion'),
      `Bot Uno empieza con presión${planB ? ' y pasa a posesión (plan B: perdía al descanso)' : ' y sigue con ella'}`);
    const part = pU.participacion[lado];
    check(part.parcial.includes(a1) && part.parcial.includes(b1), 'el cambio programado «siempre» se hizo: sale el delantero y entra el suplente');
    const gasto = pU.energia[lado].find(x => x.id === p0);
    check(gasto && gasto.antes === 100 && gasto.gasto > 0, `energía gastada guardada (portero: −${gasto?.gasto})`);
  }
  const descansa = jornadas[0].descansa_id;
  check(descansa && lista.filter(c => c.equipo_id === descansa).every(c => c.energia === 100), 'quien descansa se queda a 100 (recupera como si no jugase)');
  const vistos = ps.flatMap(p => ['local', 'visitante'].map(k => p.alineaciones_congeladas[k])).filter(a => bots.includes(a.equipo_id));
  check(vistos.length > 0 && vistos.every(a => TACTICAS.includes(a.tactica) && a.gestion === 'normal' && a.plan_b === null && a.cambios_avanzados === null),
    `bots: táctica al azar (${vistos.map(a => a.tactica).join(', ')}), gestión normal, sin plan B ni cambios`);
  const p1 = await rpcOk('slr_partido', { token: D.token, partido_id: ps[0].id });
  check(p1.tacticas && p1.participacion && p1.energia, 'slr_partido devuelve tácticas, participación y energía');

  seccion('Tras la jornada 1');
  {
    const am = await funcion({ accion: 'amistoso', token: D.token, rival_equipo_id: U.equipo });
    const p = await rpcOk('slr_partido', { token: D.token, partido_id: am.datos.partido_id });
    const tU = pU ? pU.tacticas[pU.local_id === U.equipo ? 'A' : 'B'][0] : 'posesion';
    check(p.alineaciones_congeladas.visitante.tactica === tU && p.alineaciones_congeladas.visitante.gestion === 'normal',
      `en un amistoso, el rival usa la táctica con la que empezó su último partido publicado (${tU})`);
    const cansada = lista.find(c => c.equipo_id === U.equipo && c.energia < 100);
    if (cansada) {
      await rpcOk('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: cansada.id, equipo_id: D.equipo });
      const tras = (await leer(`cartas?select=energia,equipo_id&id=eq.${cansada.id}`)).datos[0];
      check(tras.equipo_id === D.equipo && tras.energia === cansada.energia, `una carta que cambia de dueño conserva su energía (${cansada.energia})`);
      await rpcOk('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: cansada.id, equipo_id: U.equipo });
    }
  }

  seccion('Jornada 2: los bots rotan con «Sugerir alineación»');
  antes = await energias();
  const listaAntes = await cartas();
  r = await jugarJornada();
  check(r.estado === 'publicada', 'jornada 2 publicada');
  ({ ps, lista } = await comprobarEnergia('jornada 2', antes, jornadas[1].id));
  {
    const quien = jornadas[1].descansa_id;
    const suyas = lista.filter(c => c.equipo_id === quien);
    check(suyas.every(c => c.energia === Math.min(100, antes[c.id] + 40)), 'quien descansa en la jornada 2 recupera 40 en todas sus cartas');
    let iguales = 0, total = 0;
    const difs = [];
    for (const al of ps.flatMap(p => [p.alineaciones_congeladas.local, p.alineaciones_congeladas.visitante]).filter(a => bots.includes(a.equipo_id))) {
      const propias = listaAntes.filter(c => c.equipo_id === al.equipo_id)
        .map(c => ({ id: c.id, ATA: c.disenos_carta.ata, DEF: c.disenos_carta.def, CON: c.disenos_carta.con, energia: c.energia }));
      const s = sugerirAlineacion(propias);
      total++;
      // Huecos que la plantilla no llena: canteranos
      const sug = [s.huecos.por, ...s.huecos.def, ...s.huecos.med, ...s.huecos.del];
      const real = idsTitulares(al).map(id => (String(id).startsWith('canterano-') ? null : id));
      if (JSON.stringify(sug) === JSON.stringify(real)) iguales++;
      else {
        const n = id => { const c = listaAntes.find(x => x.id === id); return c ? `${c.disenos_carta.nombre} ${c.disenos_carta.ata}/${c.disenos_carta.def}/${c.disenos_carta.con} e${c.energia}` : id; };
        difs.push(`sugerida [${sug.map(n).join(', ')}] · real [${real.map(n).join(', ')}]`);
      }
    }
    check(total > 0 && iguales === total, `la alineación de los bots es la de «Sugerir» con la energía (web y servidor coinciden: ${iguales}/${total})`, difs.join(' || '));
  }

  seccion('Nueva temporada: energía a 100');
  for (let i = 0; i < 10; i++) {
    r = await jugarJornada();
    if (r.fin_temporada || r.estado !== 'publicada') break;
  }
  check(r.fin_temporada, 'la temporada termina');
  check((await cartas()).some(c => c.energia < 100), 'al acabar la temporada hay cartas cansadas');
  await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });
  check((await cartas()).every(c => c.energia === 100), 'al empezar la temporada nueva, todas a 100');
} catch (e) {
  resultado.fallos++;
  console.log(`\n  ✖ Error inesperado: ${e.message}`);
} finally {
  if (L) {
    const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
    check(b.ok, 'liga de prueba borrada', b.mensaje);
  }
  for (const b of [U, D]) if (b.token) await rpc('slr_logout', { token: b.token });
  console.log(`\n${resultado.total - resultado.fallos}/${resultado.total} comprobaciones correctas` +
    `${resultado.fallos ? ` · ${resultado.fallos} FALLOS` : ''}`);
  process.exitCode = resultado.fallos ? 1 : 0;
}
