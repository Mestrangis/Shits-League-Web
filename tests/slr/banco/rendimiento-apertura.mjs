// Rendimiento de la apertura de sobres en un móvil simulado: Chrome headless a
// 390×844 (DPR 2,75, táctil) con la CPU ×6. Abre una vista previa (básico con
// una legendaria: lo más cargado) y la recorre con toques y arrastres reales.
// Mide por fase (aparición, toques, rasgado, explosión, abanico y giro):
// fps, frame p95, frames de más de 50 ms y tareas largas del hilo principal y,
// con una traza de Chrome, el tiempo de pintado (Paint) y de rasterizado
// (RasterTask, en sus hilos: lo que en un móvil real se nota como tirones).
//   node tests/slr/banco/rendimiento-apertura.mjs   (servidor local en :3000 y .env.local)
//   CPU=4 para otra ralentización; RAREZA=epica para otra mejor carta.
// Crea una liga de prueba con Bot Uno y la borra al terminar.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, rpcOk, rpc } from '../api-util.mjs';

const CPU = Number(process.env.CPU ?? 6);
const RAREZA = process.env.RAREZA ?? 'legendaria';
const dormir = ms => new Promise(r => setTimeout(r, ms));

const t = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: t, nombre: 'Prueba rendimiento apertura (banco)' });
let ch = null, codigo = 0;
try {
  await rpcOk('slr_unirse_liga', { token: t, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--remote-debugging-port=9364',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rap-'))}`, '--headless=new', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const p = (await (await fetch('http://127.0.0.1:9364/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
    if (!ws) await dormir(200);
  }
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pend = new Map(); const errores = []; const traza = []; let trazaFin = null;
  ws.addEventListener('message', m => {
    const x = JSON.parse(m.data);
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); }
    else if (x.method === 'Runtime.exceptionThrown') errores.push(x.params.exceptionDetails?.exception?.description?.slice(0, 200));
    else if (x.method === 'Tracing.dataCollected') traza.push(...x.params.value);
    else if (x.method === 'Tracing.tracingComplete') trazaFin?.();
  });
  const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
  const esperar = async (expr, ms = 20000) => { for (let i = 0; i < ms / 100; i++) { if (await ev(expr)) return true; await dormir(100); } return false; };

  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2.75, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Page.navigate', { url: 'http://localhost:3000/' });
  await dormir(1500);
  await ev(`localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', ${JSON.stringify(env.SLR_BOT_UNO_CODIGO)});
    localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true })); 0`);
  await cdp('Page.navigate', { url: 'http://localhost:3000/#rush' });
  await ev('window.__paginaVieja = true; 0');
  await cdp('Page.reload', {});
  await esperar(`!window.__paginaVieja && !!document.getElementById('rushJugar')`, 30000);
  await ev(`document.getElementById('rushJugar').click(); 0`);
  await esperar(`!!document.querySelector('.slr-nav:not([hidden])')`);
  await dormir(1000);

  // Instrumentación: cada frame y cada tarea larga
  await ev(`(() => {
    window.__m = { frames: [], largas: [], marcas: [] };
    const bucle = t => { __m.frames.push(t); requestAnimationFrame(bucle); };
    requestAnimationFrame(bucle);
    new PerformanceObserver(l => l.getEntries().forEach(e => __m.largas.push([e.startTime, e.duration]))).observe({ type: 'longtask' });
    window.__marca = n => { __m.marcas.push([n, performance.now()]); console.timeStamp('marca:' + n); };
    return 0; })()`);
  await cdp('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  await cdp('Emulation.setCPUThrottlingRate', { rate: CPU });

  const marca = n => ev(`__marca(${JSON.stringify(n)}); 0`);
  const toque = async (x, y) => {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const rect = sel => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);

  // Aparición (vista previa: básico con la mejor carta de RAREZA)
  await marca('aparicion');
  await ev(`(async () => {
    const [{ vistaPreviaApertura }, r, api] = await Promise.all([import('/js/slr/pantallas/apertura.js'), import('/js/slr/rush.js'), import('/js/slr/api.js')]);
    const [tipo] = await api.leer('tipos_sobre?select=*&liga_id=is.null&tipo=eq.basico');
    const filas = await api.leer('cartas?select=id,diseno_id,disenos_carta(nombre,tipo,acabado,color,tier,rareza,coleccion_id,perfil,personas,ata,def,con,valor,poderes,imagen_url,texto)&liga_id=eq.' + r.datos.liga.id + '&limit=400');
    const { normalizarCarta } = await import('/js/slr/carta.js');
    const todas = filas.map(normalizarCarta);
    const mejor = todas.find(c => c.rareza === ${JSON.stringify(RAREZA)}) ?? todas[0];
    const otras = todas.filter(c => c.rareza === 'comun').slice(0, 2);
    vistaPreviaApertura({ datos: r.datos, recargar: r.recargar }, { tipo, rareza: ${JSON.stringify(RAREZA)}, cartas: [otras[0], mejor, otras[1]], dorso: null, coleccion: null });
    return 0; })()`);
  await esperar(`document.querySelector('[data-apertura]')?.dataset.fase === 'flotando'`);
  await dormir(1500);
  // Toques
  await marca('toques');
  let s = await rect('[data-sobre]');
  for (let k = 0; k < 3; k++) { await toque(s.x + s.w / 2, s.y + s.h / 2); await dormir(500); }
  await esperar(`document.querySelector('[data-apertura]')?.dataset.fase === 'rasgar'`, 8000);
  await dormir(200);
  // Rasgado: 30 pasos de dedo a lo largo de la línea
  await marca('rasgado');
  s = await rect('[data-sobre]');
  const y = s.y + s.h * 0.15;
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s.x + s.w * 0.03, y, id: 1 }] });
  for (let k = 1; k <= 30; k++) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: s.x + s.w * (0.03 + 0.96 * k / 30), y: y + (k % 2 ? 4 : -4), id: 1 }] });
    await dormir(33);
  }
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // Explosión
  await marca('explosion');
  await esperar(`document.querySelector('[data-apertura]')?.dataset.fase === 'revelado'`, 8000);
  await marca('abanico');
  await dormir(1400);
  // Giro de la mejor (la del medio)
  await marca('giro');
  const c = await rect('[data-revela="1"]');
  await toque(c.x + c.w / 2, c.y + c.h / 2);
  await dormir(2200);
  await marca('fin');
  const calidad = await ev(`document.querySelector('[data-apertura]')?.dataset.calidad ?? '0'`);
  await cdp('Emulation.setCPUThrottlingRate', { rate: 1 });
  await new Promise(res => { trazaFin = res; cdp('Tracing.end'); });
  // Marcas de la traza (µs) y suma por fase de Paint y RasterTask
  const tm = traza.filter(e => e.name === 'TimeStamp' && String(e.args?.data?.message ?? '').startsWith('marca:'))
    .map(e => [e.args.data.message.slice(6), e.ts]);
  const sumar = (nombre, a, b) => traza.filter(e => e.name === nombre && e.ph === 'X' && e.ts >= a && e.ts < b).reduce((x, e) => x + (e.dur ?? 0), 0) / 1000;

  const m = await ev('__m');
  const fases = m.marcas;
  console.log(`\nApertura · 390×844 DPR 2,75 · CPU ×${CPU} · mejor carta ${RAREZA}\n`);
  console.log('Fase        fps   p95(ms)  >50ms  máx(ms)  tareas largas (ms)   Paint(ms)  Raster(ms)');
  for (let i = 0; i < fases.length - 1; i++) {
    const [n, a] = fases[i], b = fases[i + 1][1];
    const f = m.frames.filter(x => x >= a && x < b);
    const d = f.slice(1).map((x, k) => x - f[k]).sort((p, q) => p - q);
    const fps = d.length ? (d.length / ((f[f.length - 1] - f[0]) / 1000)) : 0;
    const p95 = d.length ? d[Math.floor(d.length * 0.95)] : 0;
    const lentos = d.filter(x => x > 50).length;
    const largas = m.largas.filter(([st, du]) => st + du > a && st < b);
    const ta = tm[i]?.[1], tb = tm[i + 1]?.[1];
    const paint = ta ? sumar('Paint', ta, tb) : 0, raster = ta ? sumar('RasterTask', ta, tb) : 0;
    const seg = (b - a) / 1000;
    console.log(`${n.padEnd(10)} ${fps.toFixed(0).padStart(4)}  ${p95.toFixed(0).padStart(7)}  ${String(lentos).padStart(5)}  ${(d[d.length - 1] ?? 0).toFixed(0).padStart(7)}  ${String(largas.length).padStart(3)} (${String(Math.round(largas.reduce((x, [, du]) => x + du, 0))).padStart(4)})` +
      `   ${String(Math.round(paint)).padStart(6)}    ${String(Math.round(raster)).padStart(6)}   (${(raster / seg / 10).toFixed(0)} % de un hilo)`);
    if (process.env.DETALLE && ta) {
      const top = traza.filter(e => e.ph === 'X' && e.ts >= ta && e.ts < tb && (e.dur ?? 0) > 8000 && !['RunTask', 'ThreadControllerImpl::RunTask'].includes(e.name))
        .map(e => `${e.name}@${Math.round((e.ts - ta) / 1000)}:${Math.round(e.dur / 1000)}`).slice(0, 14);
      console.log('             eventos >8 ms:', top.join(' '));
    }
    if (process.env.DETALLE) console.log('             lentos en ms desde el inicio de la fase:', f.slice(1).map((x, k) => [x - f[k], f[k] - a]).filter(([dd]) => dd > 50).map(([dd, at]) => `${Math.round(at)}(+${Math.round(dd)})`).join(' '));
  }
  console.log(`
Calidad adaptativa: nivel ${calidad} (0 = completa; 1 = menos partículas y sin rayos; 2 = mínimas y lienzo a DPR 1)`);
  if (errores.length) { console.log('Errores:', errores.join(' | ')); codigo = 1; }
} catch (e) {
  console.log('Error:', e.message);
  codigo = 1;
} finally {
  ch?.kill();
  await rpc('slr_borrar_liga', { token: t, liga_id: liga.id });
  await rpc('slr_logout', { token: t });
  process.exit(codigo);
}
