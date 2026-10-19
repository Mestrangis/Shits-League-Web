// Prueba de la API real de SLR: sorteo de rareza con los pesos completos.
//   node tests/slr/api-paso15.mjs
// La rareza se sortea con los pesos completos del sobre; si no queda ninguna carta
// libre de esa rareza en el filtro (colección o perfil), se baja a la inferior (y
// así sucesivamente); si no hay nada por debajo, la superior que quede. Antes se
// renormalizaba entre las que quedaban y en un grupo pequeño lo bueno salía mucho más.
// Con las colecciones y perfiles reales del catálogo: la regla se calcula aquí para
// cada composición y se compara con slr_prueba_sorteo (sortea sin dar cartas) y con
// las probabilidades de la tienda. Liga de prueba de Bot Uno; se borra al terminar.
import { env, exigirEnv, rpc, rpcOk, leer, check, rechaza, seccion, resultado } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO');
const U = { codigo: env.SLR_BOT_UNO_CODIGO };
let L = null;
const R = ['comun', 'rara', 'epica', 'legendaria'];
const PESOS_COL = { comun: 55, rara: 30, epica: 12, legendaria: 3 };
const PESOS_BAS = { comun: 72, rara: 22, epica: 5, legendaria: 1 };
const pct = x => `${(100 * (x ?? 0)).toFixed(1)} %`;

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
// La regla vieja: renormalizar entre las que quedan
const vieja = (pesos, hay) => {
  const t = R.filter(r => hay.has(r)).reduce((s, r) => s + (pesos[r] ?? 0), 0);
  return Object.fromEntries(R.filter(r => hay.has(r)).map(r => [r, (pesos[r] ?? 0) / t]));
};
async function sorteo(args) {
  const total = {};
  for (let hechos = 0; hechos < args.n; hechos += 1000) {
    const r = await rpcOk('slr_prueba_sorteo', { ...args, n: Math.min(1000, args.n - hechos) });
    for (const [k, v] of Object.entries(r)) total[k] = (total[k] ?? 0) + v;
  }
  return Object.fromEntries(Object.entries(total).map(([k, v]) => [k, v / args.n]));
}
const cerca = (a, b, tol) => R.every(r => Math.abs((a[r] ?? 0) - (b[r] ?? 0)) <= tol);

try {
  U.token = (await rpcOk('slr_login', { codigo: U.codigo })).token;
  const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: `Prueba paso 15 · ${new Date().toISOString().slice(0, 16)}` });
  L = liga.id;
  await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'false' });
  rechaza(await rpc('slr_prueba_sorteo', { token: U.token, liga_id: L, pesos: PESOS_BAS, n: 0 }), 'entre 1 y', 'slr_prueba_sorteo: n fuera de rango');

  // Composición de las cartas libres por colección y por perfil
  const libres = (await leer(`cartas?select=id,disenos_carta(rareza,perfil,coleccion_id,activo,ata,def,con)&liga_id=eq.${L}&equipo_id=is.null&limit=5000`)).datos
    .filter(c => c.disenos_carta.activo);
  const grupos = new Map();
  for (const c of libres) {
    const d = c.disenos_carta;
    if (d.coleccion_id) { if (!grupos.has(d.coleccion_id)) grupos.set(d.coleccion_id, new Set()); grupos.get(d.coleccion_id).add(d.rareza); }
  }
  const nombres = Object.fromEntries((await leer('colecciones?select=id,nombre&liga_prueba_id=is.null')).datos.map(k => [k.id, k.nombre]));
  // La colección donde más cambia la regla (lo bueno salía de más) y una con épica o legendaria
  const lista = [...grupos].map(([id, hay]) => {
    const e = esperada(PESOS_COL, hay), v = vieja(PESOS_COL, hay);
    const buena = r => (r.epica ?? 0) + (r.legendaria ?? 0);
    return { id, hay, e, v, dif: buena(v) - buena(e) };
  }).sort((a, b) => b.dif - a.dif);

  seccion('Colecciones del catálogo: la regla nueva frente a la vieja');
  const n = 4000;
  for (const g of lista.slice(0, 2)) {
    const s = await sorteo({ token: U.token, liga_id: L, pesos: PESOS_COL, filtro: { coleccion_id: g.id }, n });
    const fmt = x => R.filter(r => x[r]).map(r => `${r} ${pct(x[r])}`).join(', ');
    check(cerca(s, g.e, 0.03), `«${nombres[g.id] ?? g.id}» (${[...g.hay].join('+')}): sale ${fmt(s)}; esperado ${fmt(g.e)}` +
      `${g.dif > 0.001 ? ` (con la regla vieja: ${fmt(g.v)})` : ''}`);
  }
  check(lista[0].dif > 0, `había algo que corregir: en «${nombres[lista[0].id]}» lo bueno salía ${pct(lista[0].dif)} de más`);

  seccion('Perfiles (sobre de posición)');
  for (const perfil of ['portero', 'atacante']) {
    const st = { portero: 'def', atacante: 'ata' }[perfil];   // la posición es la stat más alta
    const hay = new Set(libres.filter(({ disenos_carta: d }) => d[st] >= Math.max(d.ata, d.def, d.con)).map(c => c.disenos_carta.rareza));
    const s = await sorteo({ token: U.token, liga_id: L, pesos: PESOS_COL, filtro: { perfil }, n });
    const e = esperada(PESOS_COL, hay);
    check(cerca(s, e, 0.03), `${perfil}: ${R.map(r => `${r} ${pct(s[r])}`).join(', ')} (esperado ${R.map(r => pct(e[r])).join(' / ')})`);
  }

  seccion('Tienda: probabilidades con la misma regla');
  const g0 = lista[0];
  await rpcOk('slr_admin_coleccion_semana', { token: U.token, liga_id: L, coleccion_id: g0.id });
  const t = await rpcOk('slr_tienda', { token: U.token, liga_id: L });
  const col = t.tipos.find(x => x.tipo === 'coleccion');
  check(cerca(col.probabilidades, g0.e, 0.0011), `de colección con «${nombres[g0.id]}»: ${JSON.stringify(col.probabilidades)}`);
  const pos = t.tipos.find(x => x.tipo === 'basico');
  check(cerca(pos.probabilidades, { comun: 0.72, rara: 0.22, epica: 0.05, legendaria: 0.01 }, 0.0011), `básico con todo el catálogo: ${JSON.stringify(pos.probabilidades)}`);

  seccion('Sin filtro, candidata forzada y progresión');
  const s5 = await sorteo({ token: U.token, liga_id: L, pesos: PESOS_BAS, n });
  check(cerca(s5, { comun: 0.72, rara: 0.22, epica: 0.05, legendaria: 0.01 }, 0.03), `básico: ${R.map(r => `${r} ${pct(s5[r])}`).join(', ')} (72/22/5/1)`);
  const s6 = await sorteo({ token: U.token, liga_id: L, pesos: PESOS_COL, minima: 'rara', n: 2000 });
  check(!s6.comun && cerca(s6, esperada({ rara: 30, epica: 12, legendaria: 3 }, new Set(R)), 0.04), `candidata forzada «rara o mejor»: ${R.map(r => `${r} ${pct(s6[r])}`).join(', ')}`);
  await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'true', jornada: 2 });
  const s7 = await sorteo({ token: U.token, liga_id: L, pesos: PESOS_COL, n: 2000 });
  check(!s7.epica && !s7.legendaria && cerca(s7, { comun: 55 / 85, rara: 30 / 85 }, 0.04),
    `progresión en la J2: entre las desbloqueadas (común ${pct(s7.comun)}, rara ${pct(s7.rara)}; 55/85 y 30/85)`);
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
