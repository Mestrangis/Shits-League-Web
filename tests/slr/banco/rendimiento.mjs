// Rendimiento de la apertura de Rush (pestaña Equipo) con una temporada entera.
//   node tests/slr/banco/rendimiento.mjs                 crea la liga, mide y la borra
//   node tests/slr/banco/rendimiento.mjs --conservar      crea la liga y la deja (imprime su id)
//   node tests/slr/banco/rendimiento.mjs --liga=ID        mide una liga ya creada (no la borra)
//   node tests/slr/banco/rendimiento.mjs --borrar=ID      borra esa liga
//   --jugadas=N   juega solo N jornadas (por defecto 16: temporada en curso con la última pendiente)
// Liga de prueba con 18 equipos (Bot Uno y 17 bots), temporada de 17 jornadas con
// 16 jugadas y la última por jugar (o --jugadas=N).
// Mide, en Chrome headless a 390×844 y sin caché, desde que se pulsa «Jugar»
// hasta que la pestaña Equipo está pintada (franja y campo), y lista las
// (la web se carga antes con caché; la caché se desactiva al pulsar «Jugar»)
// peticiones al servidor con su duración. Exige una mediana de menos de 2 s en 5 aperturas.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, rpcOk, rpc } from '../api-util.mjs';

const arg = n => process.argv.find(a => a.startsWith(`--${n}`))?.split('=')[1] ?? (process.argv.includes(`--${n}`) ? true : null);
const dormir = ms => new Promise(r => setTimeout(r, ms));
const LIMITE_MS = 2000;
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };

const t = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
if (arg('borrar')) {
  console.log((await rpc('slr_borrar_liga', { token: t, liga_id: arg('borrar') })).ok ? 'liga borrada' : 'no se pudo borrar');
  process.exit(0);
}

let L = arg('liga'), creada = false;
if (!L) {
  const t0 = Date.now();
  const liga = await rpcOk('slr_crear_liga_prueba', { token: t, nombre: 'Prueba rendimiento (banco)' });
  L = liga.id; creada = true;
  await rpcOk('slr_unirse_liga', { token: t, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  for (let i = 0; i < 17; i++) await rpcOk('slr_admin_anadir_bot', { token: t, liga_id: L });
  await rpcOk('slr_iniciar_temporada', { token: t, liga_id: L });
  const JUGADAS = Number(arg('jugadas') ?? 16);
  for (let j = 1; j <= JUGADAS; j++) {
    let r;
    do { r = await rpcOk('slr_admin_jugar_jornada', { token: t, liga_id: L }); if (r.estado === 'simulando') await dormir(1500); } while (r.estado === 'simulando');
    process.stdout.write(`J${r.jornada ?? j} `);
  }
  console.log(`\nLiga ${L}: 18 equipos y ${JUGADAS} de 17 jornadas jugadas en ${Math.round((Date.now() - t0) / 1000)} s`);
  if (arg('conservar')) { console.log(`Conservada: --liga=${L}`); process.exit(0); }
}

let ch;
try {
  ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--remote-debugging-port=9364',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rd-'))}`, '--headless=new', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const p = (await (await fetch('http://127.0.0.1:9364/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
    if (!ws) await dormir(200);
  }
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pend = new Map(); const peticiones = new Map(); let midiendo = false;
  ws.addEventListener('message', m => {
    const x = JSON.parse(m.data);
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); return; }
    if (!midiendo) return;
    if (x.method === 'Network.requestWillBeSent' && /supabase\.co/.test(x.params.request.url))
      peticiones.set(x.params.requestId, { url: x.params.request.url, metodo: x.params.request.method, cuerpo: x.params.request.postData, ini: x.params.timestamp });
    if (x.method === 'Network.loadingFinished' && peticiones.has(x.params.requestId)) {
      const p = peticiones.get(x.params.requestId); p.fin = x.params.timestamp; p.bytes = x.params.encodedDataLength;
    }
  });
  const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => (await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const esperar = async (e, ms) => { for (let i = 0; i < ms / 50; i++) { if (await ev(e)) return true; await dormir(50); } return false; };

  await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: 'http://localhost:3000/' });
  await dormir(1500);
  await ev(`localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', ${JSON.stringify(env.SLR_BOT_UNO_CODIGO)});
    localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true })); 0`);
  await cdp('Page.navigate', { url: 'http://localhost:3000/#rush' });
  // Page.reload no espera: se marca la página vieja y se espera al botón de la NUEVA
  // (si no, a veces se pulsaba el «Jugar» de la página que se estaba recargando)
  await ev('window.__paginaVieja = true; 0');
  await cdp('Page.reload', {});
  await esperar(`!window.__paginaVieja && !!document.getElementById('rushJugar') && !document.getElementById('rushJugar').disabled`, 30000);
  await dormir(1000);
  // Se mide desde el clic en «Jugar» hasta la pestaña Equipo pintada, sin caché (como la primera vez)
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  const medidas = [];
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    if (vuelta) {   // otra vez desde la portada (sale y vuelve a entrar)
      await ev(`document.querySelector('.slr-barra__salir')?.click(); 0`);
      await esperar(`!!document.getElementById('rushJugar') && !document.querySelector('.slr-franja')`, 10000);
      await dormir(500);
    }
    peticiones.clear(); midiendo = true;
    const t0 = await ev(`(window.__t0 = performance.now(), document.getElementById('rushJugar').click(), window.__t0)`);
    const listo = await esperar(`!!document.querySelector('.slr-franja') && !!document.querySelector('.slr-campo-juego')`, 60000);
    const ms = Math.round(await ev('performance.now()') - t0);
    await dormir(1500);
    midiendo = false;
    medidas.push(ms);
    const lista = [...peticiones.values()].filter(p => p.fin).sort((a, b) => a.ini - b.ini);
    const ini0 = lista[0]?.ini ?? 0;
    console.log(`\nApertura ${vuelta + 1}: ${listo ? `${ms} ms` : 'NO TERMINA'} · ${lista.length} peticiones`);
    for (const p of (ms > 1000 || process.env.DETALLE ? lista : [])) {
      const ruta = p.url.replace(/^https:\/\/[^/]+/, '').replace(/(token=)[^&]+/, '$1…').slice(0, 110);
      const rpcNombre = p.url.includes('/rpc/') ? '' : '';
      console.log(`  +${String(Math.round((p.ini - ini0) * 1000)).padStart(5)} ms  ${String(Math.round((p.fin - p.ini) * 1000)).padStart(5)} ms  ${String(Math.round((p.bytes ?? 0) / 1024)).padStart(4)} KB  ${p.metodo} ${ruta}${rpcNombre}`);
    }
  }
  // La red con Supabase tiene picos sueltos (se vieron 2,3 s y 5,9 s una vez, sin poder reproducirlos):
  // se exige la mediana y se informa de la peor
  const orden = [...medidas].sort((a, b) => a - b), mediana = orden[Math.floor(orden.length / 2)];
  check(mediana < LIMITE_MS, `la pestaña Equipo abre en menos de ${LIMITE_MS} ms con una temporada de 17 jornadas: mediana ${mediana} ms (${medidas.join(' · ')} ms)`);
  console.log(`mejor ${orden[0]} ms · mediana ${mediana} ms · peor ${orden[orden.length - 1]} ms`);
} catch (e) {
  mal++;
  console.log(`  ✖ Error inesperado: ${e.message}`);
} finally {
  ch?.kill();
  if (creada && !arg('conservar')) await rpc('slr_borrar_liga', { token: t, liga_id: L });
  await rpc('slr_logout', { token: t });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas`);
  process.exit(mal ? 1 : 0);
}
