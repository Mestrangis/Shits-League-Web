// Prueba de la API real de SLR: sobre de posición por la stat más alta y sorteo
// por rareza en los sobres de posición y de colección.
//   node tests/slr/api-paso18.mjs
// · La posición de una carta es SOLO su stat más alta: Ataque (ATA), Control
//   (CON), Portero y Defensa (DEF, las mismas cartas). Con empate, vale para las dos.
// · Primero se sortea la rareza con los pesos del sobre y luego la carta dentro de
//   esa rareza (si no queda de esa rareza, la inferior; si no hay inferior, la
//   superior). Con 13 cartas y una legendaria, la legendaria sale ~3 % (su peso),
//   no 1 de cada 13. Se sortea 10.000 veces cada grupo (sin dar cartas).
// Liga de prueba de Bot Uno; se borra al terminar.
import { env, exigirEnv, rpc, rpcOk, leer, check, seccion, resultado } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO');
const U = { codigo: env.SLR_BOT_UNO_CODIGO };
let L = null;
const R = ['comun', 'rara', 'epica', 'legendaria'];
const N = 10000;
const pct = x => `${(100 * (x ?? 0)).toFixed(1)} %`;
const POS = { portero: 'def', defensa: 'def', control: 'con', atacante: 'ata' };
const encaja = (pos, d) => d[POS[pos]] >= Math.max(d.ata, d.def, d.con);

// La regla: pesos completos; si no hay de esa rareza, la inferior; si no, la superior
function esperada(pesos, hay) {
  const cands = R.filter(r => (pesos[r] ?? 0) > 0), total = cands.reduce((s, r) => s + pesos[r], 0), res = {};
  if (!cands.some(r => hay.has(r))) return res;
  cands.forEach((r, i) => {
    const dest = hay.has(r) ? r : [...cands.slice(0, i)].reverse().find(x => hay.has(x)) ?? cands.slice(i + 1).find(x => hay.has(x));
    res[dest] = (res[dest] ?? 0) + pesos[r] / total;
  });
  return res;
}
// Lo que saldría si se sorteara la carta directamente (1 de cada N cartas)
const porCarta = cartas => Object.fromEntries(R.map(r => [r, cartas.filter(c => c.rareza === r).length / cartas.length]));
async function sorteo(args) {
  const total = {};
  for (let hechos = 0; hechos < N; hechos += 1000) {
    const r = await rpcOk('slr_prueba_sorteo', { ...args, n: 1000 });
    for (const [k, v] of Object.entries(r)) total[k] = (total[k] ?? 0) + v;
  }
  return Object.fromEntries(Object.entries(total).map(([k, v]) => [k, v / N]));
}
const fmt = x => R.filter(r => x[r]).map(r => `${r} ${pct(x[r])}`).join(', ');
// 4 desviaciones típicas de una proporción con N sorteos (y al menos 0,4 puntos)
const cerca = (obs, esp) => R.every(r => Math.abs((obs[r] ?? 0) - (esp[r] ?? 0)) <= Math.max(0.004, 4 * Math.sqrt((esp[r] ?? 0) * (1 - (esp[r] ?? 0)) / N)));

try {
  U.token = (await rpcOk('slr_login', { codigo: U.codigo })).token;
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 18 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  U.eq = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'false' });
  const pesosDe = async tipo => (await leer(`tipos_sobre?select=pesos&tipo=eq.${tipo}&liga_id=is.null`)).datos[0].pesos;
  const PESOS_POS = await pesosDe('posicion'), PESOS_COL = await pesosDe('coleccion');
  console.log(`  Pesos: posición ${JSON.stringify(PESOS_POS)} · colección ${JSON.stringify(PESOS_COL)}`);

  const libres = () => leer(`cartas?select=id,disenos_carta(nombre,rareza,coleccion_id,activo,ata,def,con)&liga_id=eq.${L}&equipo_id=is.null&limit=5000`)
    .then(r => r.datos.filter(c => c.disenos_carta.activo).map(c => ({ id: c.id, ...c.disenos_carta })));
  let cartas = await libres();

  seccion('Tienda: cuántas cartas hay en cada posición (por la stat más alta)');
  const t = await rpcOk('slr_tienda', { token: U.token, liga_id: L });
  const pp = t.tipos.find(x => x.tipo === 'posicion').por_perfil;
  const cuenta = pos => cartas.filter(c => (PESOS_POS[c.rareza] ?? 0) > 0 && encaja(pos, c)).length;
  check(Object.keys(POS).every(p => pp[p] === cuenta(p)), `por_perfil ${JSON.stringify(pp)} = cuenta por stats ${JSON.stringify(Object.fromEntries(Object.keys(POS).map(p => [p, cuenta(p)])))}`);
  check(pp.portero === pp.defensa, 'portero y defensa: las mismas cartas');
  const empates = cartas.filter(c => [c.ata, c.def, c.con].filter(x => x === Math.max(c.ata, c.def, c.con)).length > 1);
  console.log(`  (${empates.length} cartas con empate en la stat más alta: cuentan para más de una posición)`);

  seccion(`Sobre de posición: ${N} sorteos por posición`);
  for (const pos of ['portero', 'control', 'atacante']) {
    const grupo = cartas.filter(c => encaja(pos, c));
    const hay = new Set(grupo.map(c => c.rareza));
    const s = await sorteo({ token: U.token, liga_id: L, pesos: PESOS_POS, filtro: { perfil: pos }, n: N });
    const e = esperada(PESOS_POS, hay), u = porCarta(grupo);
    check(cerca(s, e), `${pos} (${grupo.length} cartas: ${R.map(r => grupo.filter(c => c.rareza === r).length).join('/')}): sale ${fmt(s)}; ` +
      `esperado ${fmt(e)} (carta a carta sería ${fmt(u)})`);
  }

  seccion(`Sobre de colección: ${N} sorteos por colección`);
  const cols = new Map();
  for (const c of cartas) if (c.coleccion_id) { if (!cols.has(c.coleccion_id)) cols.set(c.coleccion_id, []); cols.get(c.coleccion_id).push(c); }
  const nombres = Object.fromEntries((await leer('colecciones?select=id,nombre&liga_prueba_id=is.null')).datos.map(k => [k.id, k.nombre]));
  // Las que más se distinguen: con una legendaria entre pocas cartas, y la que más difiere de «carta a carta»
  const lista = [...cols].map(([id, g]) => {
    const e = esperada(PESOS_COL, new Set(g.map(c => c.rareza))), u = porCarta(g);
    return { id, g, e, u, dif: R.reduce((m, r) => Math.max(m, Math.abs((e[r] ?? 0) - u[r])), 0) };
  }).sort((a, b) => b.dif - a.dif);
  const conLeg = lista.find(x => x.g.some(c => c.rareza === 'legendaria'));
  for (const x of [...new Set([conLeg, lista[0], lista[1]].filter(Boolean))]) {
    const s = await sorteo({ token: U.token, liga_id: L, pesos: PESOS_COL, filtro: { coleccion_id: x.id }, n: N });
    check(cerca(s, x.e), `«${nombres[x.id] ?? x.id}» (${x.g.length} cartas: ${R.map(r => x.g.filter(c => c.rareza === r).length).join('/')}): sale ${fmt(s)}; ` +
      `esperado ${fmt(x.e)} (carta a carta sería ${fmt(x.u)})`);
    if (x === conLeg) {
      const leg = x.g.filter(c => c.rareza === 'legendaria').length;
      check(Math.abs((s.legendaria ?? 0) - x.e.legendaria) < Math.abs((s.legendaria ?? 0) - leg / x.g.length) || Math.abs(x.e.legendaria - leg / x.g.length) < 0.005,
        `la legendaria sale ${pct(s.legendaria)}: su peso (${pct(x.e.legendaria)}), no ${leg} de cada ${x.g.length} (${pct(leg / x.g.length)})`);
    }
  }

  seccion('Comprando de verdad: cada carta del sobre de posición tiene esa stat como la más alta');
  await rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: U.eq, importe: 60000 });
  const malas = [];
  let compradas = 0;
  for (const pos of ['atacante', 'control', 'defensa', 'portero']) {
    for (let k = 0; k < 5; k++) {
      const r = await rpcOk('slr_comprar_sobre', { token: U.token, liga_id: L, tipo: 'posicion', perfil: pos });
      const id = r.cartas[0].id;
      const d = (await leer(`cartas?select=disenos_carta(nombre,ata,def,con)&id=eq.${id}`)).datos[0].disenos_carta;
      compradas++;
      if (!encaja(pos, d)) malas.push(`${pos}: ${d.nombre} ${d.ata}/${d.def}/${d.con}`);
      await rpcOk('slr_vender_banco', { token: U.token, carta_id: id });
    }
  }
  check(!malas.length, `${compradas} sobres de posición: todas de su stat más alta`, malas.join(' | '));
} catch (e) {
  resultado.fallos++;
  console.log(`\n  ✖ Error inesperado: ${e.message}`);
} finally {
  if (L) {
    const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
    check(b.ok, 'liga de prueba borrada', b.mensaje);
  }
  if (U.token) await rpc('slr_logout', { token: U.token });
  console.log(`\n${resultado.total - resultado.fallos}/${resultado.total} comprobaciones correctas` +
    `${resultado.fallos ? ` · ${resultado.fallos} FALLOS` : ''}`);
  process.exitCode = resultado.fallos ? 1 : 0;
}
