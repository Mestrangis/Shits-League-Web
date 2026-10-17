// El generador de cartas existe dos veces: en SQL (generar_stats / generar_poderes,
// que usa el trigger de disenos_carta) y en js/slr/generador.js (vista previa del
// formulario). Este test pide al servidor (slr_generar_cartas, necesita red) los
// mismos casos y comprueba que dan exactamente lo mismo; y que las stats caen en
// el rango de su tier con la forma de su perfil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, PERFILES, MAX_STAT_CARTA, generarStats, generarPoderes, generarRasgos, ovr100, tierDeStats, perfilDeStats } from '../../js/slr/generador.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../../js/slr/config.js';

const TIPOS = ['individual', 'duo', 'trio', 'grupo', 'especial'];

const casos = [];
let k = 1;
for (const tier of Object.keys(TIERS)) for (const perfil of Object.keys(PERFILES)) for (const tipo of TIPOS) {
  for (let i = 0; i < 4; i++, k++) {
    casos.push({ tier, perfil, tipo, semilla_stats: (k * 2654435761) % 2147483646, semilla_poderes: (k * 40503 + 7) % 2147483646 });
  }
}

const resumen = (stats, poderes, rasgos) => JSON.stringify({
  stats: [stats.ATA, stats.DEF, stats.CON],
  rasgos: [rasgos.estamina, rasgos.tactica_favorita],
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
    resumen(generarStats(c.tier, c.perfil, c.tipo, c.semilla_stats), generarPoderes(c.tier, c.perfil, c.semilla_poderes),
      generarRasgos(c.perfil, c.semilla_stats))
    !== resumen(sql[i].stats, sql[i].poderes, sql[i].rasgos));
  assert.equal(distintos.length, 0, `distintos: ${JSON.stringify(distintos.slice(0, 3))}`);
});

test('stats en el rango del tier, entre 1 y 101, con la forma del perfil', () => {
  for (const tier of Object.keys(TIERS)) for (const perfil of Object.keys(PERFILES)) for (const tipo of TIPOS) {
    for (let s = 1; s <= 200; s++) {
      const st = generarStats(tier, perfil, tipo, s * 7919);
      const [lo, hi] = TIERS[tier];
      const o = ovr100(st);
      assert.ok(o >= 100 * lo && o < 100 * hi, `${tier} ${perfil} ${tipo} ${s}: OVR ${o / 100}`);
      assert.equal(tierDeStats(st), tier);
      for (const v of Object.values(st)) assert.ok(Number.isInteger(v) && v >= 1 && v <= MAX_STAT_CARTA);
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

test('rasgos: estamina ~25/50/25 (porteros más alta) y táctica favorita según el perfil', () => {
  const n = { alta: 0, media: 0, baja: 0 }, porteros = { alta: 0, media: 0, baja: 0 };
  const azar = { posesion: 0, contraataque: 0, presion: 0 };
  for (let s = 1; s <= 4000; s++) {
    const perfil = Object.keys(PERFILES)[s % 5];
    const r = generarRasgos(perfil, s * 7919);
    (perfil === 'portero' ? porteros : n)[r.estamina]++;
    if (perfil === 'atacante') assert.equal(r.tactica_favorita, 'contraataque');
    if (perfil === 'control') assert.equal(r.tactica_favorita, 'posesion');
    if (perfil === 'defensa') assert.equal(r.tactica_favorita, 'presion');
    if (perfil === 'portero') assert.equal(r.tactica_favorita, null);
    if (perfil === 'equilibrado') azar[r.tactica_favorita]++;
  }
  const total = 3200;
  assert.ok(Math.abs(n.alta / total - 0.20) < 0.04 && Math.abs(n.media / total - 0.52) < 0.04, JSON.stringify(n));
  assert.ok(porteros.alta / 800 > 0.4, `porteros con estamina alta: ${porteros.alta}/800`);
  for (const t of Object.values(azar)) assert.ok(t > 200, `equilibrado al azar: ${JSON.stringify(azar)}`);
});
