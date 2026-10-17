// Prueba de la API real de SLR: cartas por tiers y formulario "Nueva carta".
//   node tests/slr/api-paso7.mjs
// · El catálogo tiene tier y perfil en todas las cartas y los poderes beta con
//   probabilidades [p1, p2, p3].
// · slr_admin_guardar_diseno desde una liga de prueba: stats y poderes vacíos
//   se generan en el servidor igual que en js/slr/generador.js (misma semilla);
//   los que vienen rellenos se respetan; la carta nace inactiva, con ejemplar
//   solo en esa liga; se puede editar y dar a un equipo; no se pueden editar
//   cartas de otras ligas; al borrar la liga se borra la carta.
// · Se juega una jornada con el motor v1.3.0 y se reproduce igual.
import { env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado } from './api-util.mjs';
import { motorDe, MOTOR_ACTUAL } from '../../js/slr/motores.js';
import { generarStats, generarPoderes, PROBABILIDADES } from '../../js/slr/generador.js';
import { calcularValor } from '../../js/slr/valor.js';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO');
const dormir = ms => new Promise(r => setTimeout(r, ms));
const U = { codigo: env.SLR_BOT_UNO_CODIGO }, D = { codigo: env.SLR_BOT_DOS_CODIGO };
let L = null, disenoId = null;
const resumen = (st, ps) => JSON.stringify({ st: [st.ATA ?? st.ata, st.DEF ?? st.def, st.CON ?? st.con],
  ps: ps.map(p => [p.nombre, p.momento, p.nivel, p.efecto, (p.probabilidades ?? []).map(Number)]) });

async function jugarJornada() {
  for (let i = 0; i < 60; i++) {
    const r = await rpcOk('slr_admin_jugar_jornada', { token: U.token, liga_id: L });
    if (r.estado !== 'simulando') return r;
    await dormir(1500);
  }
  throw new Error('La simulación no termina');
}

for (const b of [U, D]) b.token = (await rpcOk('slr_login', { codigo: b.codigo })).token;

try {
  seccion('Catálogo por tiers');
  {
    const ds = (await leer('disenos_carta?select=id,tier,perfil,color,poderes,beta&limit=5000')).datos;
    check(ds.length > 0 && ds.every(d => 'SABCDEF'.includes(d.tier) && d.tier.length === 1 && d.perfil),
      `todas las cartas (${ds.length}) con tier y perfil`);
    const reparto = Object.fromEntries('SABCDEF'.split('').map(t => [t, ds.filter(d => d.tier === t).length]));
    check(true, `reparto por tier: ${Object.entries(reparto).map(([t, n]) => `${t} ${n}`).join(' · ')}`);
    const sorteados = ds.filter(d => d.beta).flatMap(d => d.poderes).filter(p => p.probabilidad !== 'siempre');
    check((!ds.some(d => d.beta) || sorteados.length > 40) && sorteados.every(p => p.probabilidades?.join() === PROBABILIDADES[p.nivel].join() && !('probabilidad' in p)),
      `poderes beta con probabilidades [${PROBABILIDADES.simple.join(', ')}] (${sorteados.length})`);
  }

  seccion('Liga de prueba');
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 7 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  U.equipo = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  D.equipo = (await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' })).equipo.id;
  for (let i = 0; i < 2; i++) await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L });
  const real = (await leer('ligas?select=id&es_prueba=eq.false')).datos.map(l => l.id);

  seccion('Nueva carta: generada en el servidor');
  {
    const semillas = { semilla_stats: 123456789, semilla_poderes: 987654321 };
    const base = { nombre: 'Prueba Generada', tipo: 'trio', perfil: 'atacante', tier: 'S', acabado: 'foil', color: 'naranja', ...semillas };
    rechaza(await rpc('slr_admin_guardar_diseno', { token: D.token, liga_id: L, diseno: base }), 'administrador', 'solo el admin crea cartas');
    const r = await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: base });
    disenoId = r.id;
    const js = { st: generarStats('S', 'atacante', 'trio', semillas.semilla_stats), ps: generarPoderes('S', 'atacante', semillas.semilla_poderes) };
    check(resumen(r, r.poderes) === resumen(js.st, js.ps),
      `stats y poderes vacíos → los genera el servidor igual que el JS: ${r.ata}/${r.def}/${r.con}, ${r.poderes.map(p => p.nombre).join(' + ')}`);
    const [d] = (await leer(`disenos_carta?select=*&id=eq.${r.id}`)).datos;
    check(d.activo === false && d.liga_prueba_id === L && d.tier === 'S' && d.color === 'naranja' && d.acabado === 'foil',
      'desde una liga de prueba: inactiva, ligada a la liga, con tier, color y acabado');
    check(d.valor === calcularValor({ ATA: d.ata, DEF: d.def, CON: d.con, poderes: d.poderes }), `valor calculado por el trigger (${d.valor})`);
    const cs = (await leer(`cartas?select=liga_id,equipo_id&diseno_id=eq.${r.id}`)).datos;
    check(cs.length === 1 && cs[0].liga_id === L && r.carta_id && !real.includes(cs[0].liga_id), 'ejemplar solo en esta liga (no llega a la liga real)');

    // Excepciones de Marcos: lo que viene relleno se respeta
    const manual = await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: {
      id: r.id, ...base, ata: 99, def: 40, con: 60,
      poderes: [{ nombre: 'Mi poder', momento: 'chut', nivel: 'muy fuerte', efecto: 0.4, probabilidades: [0.5, 0.2, 0.05] }] } });
    check(manual.ata === 99 && manual.def === 40 && manual.poderes.length === 1 && manual.poderes[0].nombre === 'Mi poder',
      'editar con stats y poderes a mano: se respetan');
    const sinPoderes = await rpcOk('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { id: r.id, ...base, ata: 99, def: 40, con: 60, poderes: [] } });
    check(sinPoderes.poderes.length === 0, 'poderes = [] es "sin poderes" (no se generan)');
    rechaza(await rpc('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { ...base, nombre: 'Prueba Mal Formada', poderes: [{ nombre: 'Mal', momento: 'chut', nivel: 'simple', efecto: 0.2, probabilidades: [0.1, 0.5] }] } }),
      'no puede ser mayor', 'probabilidades crecientes: rechazadas con un mensaje claro');
    const beta = (await leer('disenos_carta?select=id&liga_prueba_id=is.null&limit=1')).datos[0];
    rechaza(await rpc('slr_admin_guardar_diseno', { token: U.token, liga_id: L, diseno: { id: beta.id, ...base } }),
      'solo se editan las cartas creadas en ella', 'desde una liga de prueba no se tocan las cartas del catálogo');

    const dar = await rpcOk('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: r.carta_id, equipo_id: U.equipo });
    check(dar.ahora === 'Bot Uno FC', 'se puede dar a un equipo');
    const sj = await rpcOk('slr_carta', { token: U.token, carta_id: r.carta_id });
    check(sj.color === 'naranja' && sj.tier === 'S' && sj.perfil === 'atacante', 'slr_carta devuelve color, tier y perfil');
  }

  seccion(`Una jornada con el motor v${MOTOR_ACTUAL.VERSION}`);
  {
    await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });
    const j = await jugarJornada();
    check(j.estado === 'publicada', `jornada ${j.jornada} publicada`);
    const ps = (await leer(`partidos?select=id,semilla,goles_local,goles_visitante,version_motor,alineaciones_congeladas&liga_id=eq.${L}&tipo=eq.liga&goles_local=not.is.null`)).datos;
    for (const p of ps) {
      const r = motorDe(p.version_motor).simularPartido(p.alineaciones_congeladas.local, p.alineaciones_congeladas.visitante, p.semilla);
      const prog = r.eventos.filter(e => e.tipo === 'poder' && e.programada != null);
      check(p.version_motor === MOTOR_ACTUAL.VERSION && r.goles.join() === `${p.goles_local},${p.goles_visitante}`,
        `${p.goles_local}-${p.goles_visitante} con el motor ${p.version_motor}, reproducido igual (${prog.length} activaciones programadas)`);
    }
  }
} catch (e) {
  resultado.fallos++;
  console.log(`\n  ✖ Error inesperado: ${e.message}`);
} finally {
  if (L) {
    const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
    check(b.ok, 'liga de prueba borrada', b.mensaje);
    if (disenoId) check((await leer(`disenos_carta?select=id&id=eq.${disenoId}`)).datos.length === 0, 'y con ella la carta creada en la prueba');
  }
  for (const b of [U, D]) if (b.token) await rpc('slr_logout', { token: b.token });
  console.log(`\n${resultado.total - resultado.fallos}/${resultado.total} comprobaciones correctas` +
    `${resultado.fallos ? ` · ${resultado.fallos} FALLOS` : ''}`);
  process.exitCode = resultado.fallos ? 1 : 0;
}
