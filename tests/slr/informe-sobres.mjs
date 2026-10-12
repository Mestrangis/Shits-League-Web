// Informe: abre N sobres de cada tipo en una liga de prueba (API real) y cuenta
// cuántas cartas salen de cada tipo y el valor medio por sobre.
//   node tests/slr/informe-sobres.mjs [N=300]
// Cada bot abre un tipo de sobre en paralelo. Tras cada sobre vende al banco lo
// recibido para tener siempre sitio (las cartas vuelven al bombo). En los de
// elección se queda la candidata de más valor. Solo informa; al final borra la liga.
import { env, exigirEnv, rpc, rpcOk } from './api-util.mjs';

exigirEnv('SLR_BOT_UNO_CODIGO', 'SLR_BOT_DOS_CODIGO', 'SLR_BOT_TRES_CODIGO');
const N = Number(process.argv[2] ?? 300);
const PRECIO = { basico: 1500, premium: 4000, eleccion: 3000 };

const bots = [
  { codigo: env.SLR_BOT_UNO_CODIGO, tipo: 'basico' },
  { codigo: env.SLR_BOT_DOS_CODIGO, tipo: 'premium' },
  { codigo: env.SLR_BOT_TRES_CODIGO, tipo: 'eleccion' },
];

let liga = null, admin = null;
const t0 = Date.now();
try {
  for (const b of bots) b.token = (await rpcOk('slr_login', { codigo: b.codigo })).token;
  admin = bots[0].token;
  liga = await rpcOk('slr_crear_liga_prueba', { token: admin, nombre: `Informe sobres · ${new Date().toISOString().slice(0, 16)}` });
  for (const b of bots) {
    b.equipo = (await rpcOk('slr_unirse_liga', { token: b.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: `Sobres ${b.tipo}` })).equipo.id;
    await rpcOk('slr_prueba_dar_dinero', { token: admin, liga_id: liga.id, equipo_id: b.equipo, importe: N * PRECIO[b.tipo] });
  }

  await Promise.all(bots.map(async b => {
    b.stats = { cartas: 0, tipos: {}, valorRecibido: 0, valorCandidatas: 0, garantias: 0 };
    for (let i = 0; i < N; i++) {
      const s = await rpcOk('slr_comprar_sobre', { token: b.token, liga_id: liga.id, tipo: b.tipo });
      let recibidas = s.cartas;
      if (b.tipo === 'eleccion') {
        b.stats.valorCandidatas += s.cartas.reduce((acc, c) => acc + c.valor, 0) / s.cartas.length;
        const mejor = [...s.cartas].sort((x, y) => y.valor - x.valor)[0];
        await rpcOk('slr_elegir_carta_sobre', { token: b.token, sobre_id: s.sobre_id, carta_id: mejor.id });
        recibidas = [mejor];
      }
      if (s.garantia_aplicada) b.stats.garantias++;
      // Las candidatas cuentan para la distribución de lo que sale; el valor es lo recibido
      for (const c of s.cartas) {
        b.stats.cartas++;
        b.stats.tipos[c.tipo] = (b.stats.tipos[c.tipo] ?? 0) + 1;
      }
      b.stats.valorRecibido += recibidas.reduce((acc, c) => acc + c.valor, 0);
      for (const c of recibidas) await rpcOk('slr_vender_banco', { token: b.token, carta_id: c.id });
      if ((i + 1) % 100 === 0) process.stdout.write(`  ${b.tipo}: ${i + 1}/${N}\n`);
    }
  }));

  const pct = (n, total) => `${n} (${(100 * n / total).toFixed(1)} %)`;
  console.log(`\nInforme de sobres · ${N} de cada tipo · catálogo beta (250 individuales, 24 dúos, 8 tríos, 1 Única)\n`);
  for (const b of bots) {
    const s = b.stats;
    console.log(`Sobre ${b.tipo} (precio ${PRECIO[b.tipo].toLocaleString('es-ES')})${b.tipo === 'eleccion' ? ' — cuenta las 3 candidatas de cada sobre' : ''}`);
    console.log(`  Cartas: ${s.cartas}`);
    console.log(`  Tipo:     ${['individual', 'duo', 'trio', 'unica'].map(t => `${t} ${pct(s.tipos[t] ?? 0, s.cartas)}`).join(' · ')}`);
    const medio = s.valorRecibido / N;
    console.log(`  Valor medio recibido por sobre: ${medio.toFixed(0)} (${(100 * medio / PRECIO[b.tipo]).toFixed(0)} % del precio)` +
      (b.tipo === 'eleccion' ? ` · eligiendo la de más valor; valor medio de una candidata: ${(s.valorCandidatas / N).toFixed(0)}` : ''));
    if (b.tipo === 'premium') console.log(`  Garantía premium aplicada: ${s.garantias} veces`);
    console.log('');
  }
} catch (e) {
  console.log(`✖ ${e.message}`);
  process.exitCode = 1;
} finally {
  if (liga) await rpc('slr_borrar_liga', { token: admin, liga_id: liga.id });
  for (const b of bots) if (b.token) await rpc('slr_logout', { token: b.token });
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s; liga de prueba borrada)`);
}
