// Tests de las acciones de Rush (fase 4 del repaso de rendimiento):
// · todas pasan por api.js (rpc / accion / funcion): nada llama a Supabase por su cuenta,
//   así que todas ponen en «cargando» el botón que se acaba de tocar;
// · las que mueven dinero o cartas van por accion() (slr_con_intento) y son exactamente las
//   que la función del servidor admite;
// · el botón: desactivado con su spinner hasta que hay respuesta (también si falla), y las
//   lecturas no lo tocan;
// · accion(): un identificador por intento; si la red falla sin saber si ha llegado, se
//   repite UNA vez con el MISMO intento; si el servidor dice que no, no se repite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const todos = d => readdirSync(join(RAIZ, d)).flatMap(n => { const r = `${d}/${n}`; return statSync(join(RAIZ, r)).isDirectory() ? todos(r) : [r]; });
const JS = todos('js/slr').filter(f => f.endsWith('.js'));
const leer = f => readFileSync(join(RAIZ, f), 'utf8');
const SQL = leer('supabase/migrations/20261025000100_slr_acciones_con_intento.sql');
const DEL_SERVIDOR = [...SQL.matchAll(/when '(slr_[a-z_]+)'/g)].map(m => m[1]).sort();

test('ninguna acción llama a Supabase por su cuenta: todas pasan por api.js', () => {
  for (const f of JS) {
    if (f === 'js/slr/api.js') continue;
    assert.doesNotMatch(leer(f), /\/rest\/v1\/rpc\/|functions\/v1\//, `${f} no hace fetch directo a Supabase`);
  }
});

test('las que mueven dinero o cartas van por accion() y son las que admite slr_con_intento', () => {
  const usadas = new Set();
  for (const f of JS) {
    const t = leer(f);
    for (const fn of DEL_SERVIDOR) assert.ok(!t.includes(`rpc('${fn}'`), `${f}: ${fn} debe ir por accion()`);
    for (const m of t.matchAll(/accion\('(slr_[a-z_]+)'/g)) { usadas.add(m[1]); assert.ok(DEL_SERVIDOR.includes(m[1]), `${f}: ${m[1]} no está en slr_con_intento`); }
  }
  // Las de mercado, cláusulas, intercambios, banco y hueco, al menos
  for (const fn of ['slr_comprar_venta', 'slr_pujar', 'slr_poner_en_venta', 'slr_aceptar_oferta', 'slr_pagar_clausula', 'slr_proponer_intercambio', 'slr_vender_banco', 'slr_hacer_hueco'])
    assert.ok(usadas.has(fn), `${fn} se usa con intento`);
});

/* ── El botón y los reintentos (api.js con fetch y botones de mentira) ───── */
const api = await import('../../js/slr/api.js');
function boton() {
  const clases = new Set(), attrs = {};
  return { disabled: false, isConnected: true, classList: { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c) },
    setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: k => { delete attrs[k]; }, clases, attrs };
}
const respuesta = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status });

test('una acción pone el botón en «cargando» hasta que responde (también si falla); las lecturas no', async () => {
  const fetchAntes = globalThis.fetch;
  try {
    let soltar;
    globalThis.fetch = () => new Promise(r => { soltar = r; });
    const b = boton();
    api._pulsado(b);
    const p = api.rpc('slr_renombrar_equipo', { nombre: 'x' }, { silencioso: true });
    await new Promise(r => setImmediate(r));
    assert.ok(b.disabled && b.clases.has('slr-esperando') && b.attrs['aria-busy'] === 'true', 'al momento, desactivado y con spinner');
    soltar(respuesta({ ok: true }));
    await p;
    assert.ok(!b.disabled && !b.clases.has('slr-esperando'), 'al responder, como estaba');
    // Si falla, también vuelve
    api._pulsado(b);
    globalThis.fetch = async () => respuesta({ code: 'P0001', message: 'No' }, 400);
    await assert.rejects(api.rpc('slr_renombrar_equipo', {}, { silencioso: true }));
    assert.ok(!b.disabled && !b.clases.has('slr-esperando'));
    // Una lectura no toca el botón
    api._pulsado(b);
    globalThis.fetch = () => new Promise(r => { soltar = r; });
    const l = api.rpc('slr_mercado', {}, { silencioso: true });
    await new Promise(r => setImmediate(r));
    assert.ok(!b.disabled);
    soltar(respuesta({}));
    await l;
    // Un botón tocado hace más de 2 s no cuenta (la acción no viene de él)
    api._pulsado(b, Date.now() - 5000);
    globalThis.fetch = async () => respuesta({});
    const q = api.rpc('slr_renombrar_equipo', {}, { silencioso: true });
    assert.ok(!b.disabled);
    await q;
  } finally { globalThis.fetch = fetchAntes; api._pulsado(null); }
});

test('mientras está en «cargando», no se puede tocar dos veces (el segundo toque no hace otra acción)', async () => {
  const fetchAntes = globalThis.fetch;
  try {
    let pedidas = 0, soltar;
    globalThis.fetch = () => { pedidas++; return new Promise(r => { soltar = r; }); };
    const b = boton();
    api._pulsado(b);
    const p = api.accion('slr_pujar', { subasta_id: 'x', importe: 10 }, { silencioso: true });
    await new Promise(r => setImmediate(r));
    assert.ok(b.disabled, 'desactivado: el navegador no entrega el segundo clic');
    assert.equal(pedidas, 1);
    soltar(respuesta({ ok: true }));
    await p;
  } finally { globalThis.fetch = fetchAntes; api._pulsado(null); }
});

test('accion(): un intento; con un fallo de red se repite UNA vez con el MISMO intento', async () => {
  const fetchAntes = globalThis.fetch;
  try {
    const cuerpos = [];
    let veces = 0;
    globalThis.fetch = async (url, op) => {
      cuerpos.push({ url, cuerpo: JSON.parse(op.body) });
      if (++veces === 1) throw new TypeError('Failed to fetch');   // ¿llegó? no se sabe
      return respuesta({ hecho: true });
    };
    const r = await api.accion('slr_comprar_venta', { venta_id: 'v1' }, { silencioso: true });
    assert.deepEqual(r, { hecho: true });
    assert.equal(cuerpos.length, 2);
    assert.ok(cuerpos.every(c => c.url.endsWith('/rest/v1/rpc/slr_con_intento')));
    assert.equal(cuerpos[0].cuerpo.funcion, 'slr_comprar_venta');
    assert.deepEqual(cuerpos[0].cuerpo.args, { venta_id: 'v1' });
    assert.match(cuerpos[0].cuerpo.intento, /^[0-9a-f-]{36}$/);
    assert.equal(cuerpos[1].cuerpo.intento, cuerpos[0].cuerpo.intento, 'el mismo intento: el servidor no la repite si ya llegó');
    // Otra acción, otro intento
    await api.accion('slr_comprar_venta', { venta_id: 'v2' }, { silencioso: true });
    assert.notEqual(cuerpos.at(-1).cuerpo.intento, cuerpos[0].cuerpo.intento);
    // Si el servidor dice que no, no se repite (y se enseña el motivo)
    cuerpos.length = 0;
    globalThis.fetch = async (url, op) => { cuerpos.push(JSON.parse(op.body)); return respuesta({ code: 'P0001', message: 'No tienes saldo suficiente' }, 400); };
    await assert.rejects(api.accion('slr_comprar_venta', { venta_id: 'v3' }, { silencioso: true }), /saldo suficiente/);
    assert.equal(cuerpos.length, 1);
  } finally { globalThis.fetch = fetchAntes; }
});
