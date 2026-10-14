// El generador de cartas existe dos veces: en SQL (generar_stats / generar_poderes,
// que usa el trigger de disenos_carta) y en js/slr/generador.js (vista previa del
// formulario). Este test pide al servidor (slr_generar_cartas, necesita red) los
// mismos casos y comprueba que dan exactamente lo mismo; y que las stats caen en
// el rango de su tier con la forma de su perfil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, PERFILES, MAX_STAT, generarStats, generarPoderes, ovr100, tierDeStats, perfilDeStats } from '../../js/slr/generador.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../../js/slr/config.js';

const casos = [];
let k = 1;
for (const tier of Object.keys(TIERS)) for (const perfil of Object.keys(PERFILES)) for (const tipo of Object.keys(MAX_STAT)) {
  for (let i = 0; i < 4; i++, k++) {
    casos.push({ tier, perfil, tipo, semilla_stats: (k * 2654435761) % 2147483646, semilla_poderes: (k * 40503 + 7) % 2147483646 });
  }
}

const resumen = (stats, poderes) => JSON.stringify({
  stats: [stats.ATA, stats.DEF, stats.CON],
  poderes: poderes.map(p => [p.nombre, p.momento, p.nivel, p.efecto, p.probabilidades.map(Number)]),
});

test(`SQL y JS generan lo mismo (${casos.length} casos: todos los tiers, perfiles y tipos)`, async () => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/slr_generar_cartas`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ casos }),
  });
  assert.ok(r.ok, `slr_generar_cartas: ${r.status}`);
  const sql = await r.json();
  assert.equal(sql.length, casos.length);
  const distintos = casos.filter((c, i) =>
    resumen(generarStats(c.tier, c.perfil, c.tipo, c.semilla_stats), generarPoderes(c.tier, c.perfil, c.semilla_poderes))
    !== resumen(sql[i].stats, sql[i].poderes));
  assert.equal(distintos.length, 0, `distintos: ${JSON.stringify(distintos.slice(0, 3))}`);
});

test('stats en el rango del tier, entre 1 y el máximo del tipo, con la forma del perfil', () => {
  for (const tier of Object.keys(TIERS)) for (const perfil of Object.keys(PERFILES)) for (const tipo of Object.keys(MAX_STAT)) {
    for (let s = 1; s <= 200; s++) {
      const st = generarStats(tier, perfil, tipo, s * 7919);
      const [lo, hi] = TIERS[tier];
      const o = ovr100(st);
      assert.ok(o >= 100 * lo && o < 100 * hi, `${tier} ${perfil} ${tipo} ${s}: OVR ${o / 100}`);
      assert.equal(tierDeStats(st), tier);
      for (const v of Object.values(st)) assert.ok(Number.isInteger(v) && v >= 1 && v <= MAX_STAT[tipo]);
      const max = Math.max(st.ATA, st.DEF, st.CON);
      if (perfil === 'atacante') assert.equal(st.ATA, max);
      if (perfil === 'defensa') assert.equal(st.DEF, max);
      if (perfil === 'control') assert.equal(st.CON, max);
      if (perfil === 'portero') {
        // DEF la más alta y ATA la más baja; muy baja (30 menos) salvo en S, donde con la
        // DEF topada no se llega al OVR del tier sin subir el resto
        assert.equal(st.DEF, max);
        assert.equal(st.ATA, Math.min(st.ATA, st.DEF, st.CON));
        if (tier !== 'S') { assert.ok(st.DEF - st.ATA >= 30, 'portero: ATA muy baja'); assert.equal(perfilDeStats(st), 'portero'); }
      }
      if (perfil === 'equilibrado') assert.ok(max - Math.min(st.ATA, st.DEF, st.CON) <= 8);
    }
  }
});

test('poderes por tier: S 2 fuertes, A 1 fuerte, B 1 simple, C ~40 % 1 simple, D–F ninguno', () => {
  const n = (t, p, s) => generarPoderes(t, p, s);
  for (let s = 1; s <= 300; s++) {
    assert.deepEqual(n('S', 'atacante', s).map(p => p.nivel), ['fuerte', 'fuerte']);
    assert.deepEqual(n('A', 'defensa', s).map(p => p.nivel), ['fuerte']);
    assert.deepEqual(n('B', 'control', s).map(p => p.nivel), ['simple']);
    for (const t of ['D', 'E', 'F']) assert.equal(n(t, 'equilibrado', s).length, 0);
    const [a, b] = n('S', 'atacante', s);
    assert.notEqual(a.nombre, b.nombre);
    assert.deepEqual([a.momento, b.momento].sort(), ['chut', 'ocasion_ataque']);
    assert.equal(n('S', 'portero', s)[0].momento, 'parada');
    assert.equal(n('A', 'control', s)[0].momento, 'posesion');
  }
  let conPoder = 0;
  for (let s = 1; s <= 2000; s++) conPoder += n('C', 'control', s).length;
  assert.ok(Math.abs(conPoder / 2000 - 0.4) < 0.05, `C con poder: ${conPoder / 20} %`);
});
