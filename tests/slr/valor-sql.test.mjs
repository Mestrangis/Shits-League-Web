// El valor de cada diseño lo calcula un trigger en SQL (valor_diseno, migración
// 20261013050000) con la misma fórmula que js/slr/valor.js. Este test compara
// los dos para todo el catálogo (lectura pública de disenos_carta: necesita red).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularValor } from '../../js/slr/valor.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../../js/slr/config.js';

test('el valor guardado (trigger SQL) coincide con valor.js en todo el catálogo', async () => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/disenos_carta?select=nombre,ata,def,con,poderes,valor&limit=10000`,
    { headers: { apikey: SUPABASE_KEY } });
  assert.ok(r.ok, `no se pudo leer el catálogo (${r.status})`);
  const disenos = await r.json();
  assert.ok(disenos.length > 100, `catálogo demasiado pequeño (${disenos.length})`);
  const distintos = disenos.filter(d => calcularValor({ ATA: d.ata, DEF: d.def, CON: d.con, poderes: d.poderes }) !== d.valor);
  assert.equal(distintos.length, 0,
    `${distintos.length} cartas con valor distinto: ${distintos.slice(0, 5).map(d =>
      `${d.nombre} (SQL ${d.valor}, JS ${calcularValor({ ATA: d.ata, DEF: d.def, CON: d.con, poderes: d.poderes })})`).join(', ')}`);
});
