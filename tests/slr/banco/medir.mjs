// Mide el coste de mover el ratón sobre las cartas con el protocolo de DevTools:
// graba la misma traza que el panel Performance de Chrome (Tracing) y la resume.
//   node tests/slr/banco/medir.mjs        (con el servidor local en http://localhost:3000)
// Usa Chrome sin ventana, CPU ralentizada ×4 (un portátil modesto) y 15 cartas
// (tests/slr/banco/cartas.html), tres de ellas foil. Los tiempos son del hilo
// principal con la CPU ralentizada: en un PC normal, dividir entre 4.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_BANCO = 'http://localhost:3000/tests/slr/banco/cartas.html';
const PUERTO = 9333;
const RALENTIZAR = Number(process.env.CPU ?? 4);

const perfil = mkdtempSync(join(tmpdir(), 'slr-banco-'));
const chrome = spawn(CHROME, [`--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--headless=new',
  '--window-size=1280,900', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const dormir = ms => new Promise(r => setTimeout(r, ms));

/* ── CDP mínimo ─────────────────────────────────────────────────────────── */
let ws, id = 0;
const pendientes = new Map(), eventos = [];
async function conectar() {
  for (let i = 0; i < 60 && !ws; i++) {
    try {
      const pags = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
      const pag = pags.find(x => x.type === 'page');
      if (pag) ws = new WebSocket(pag.webSocketDebuggerUrl);
    } catch { /* Chrome aún arrancando */ }
    if (!ws) await dormir(200);
  }
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', m => {
    const d = JSON.parse(m.data);
    if (d.id && pendientes.has(d.id)) { pendientes.get(d.id)(d.result); pendientes.delete(d.id); }
    else if (d.method === 'Tracing.dataCollected') eventos.push(...d.params.value);
    else if (d.method === 'Tracing.tracingComplete') pendientes.get('fin')?.();
  });
}
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pendientes.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalua = async expr => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

const raton = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
// Pasada en zigzag por un rectángulo, un movimiento cada ~16 ms (como un ratón real a 60 Hz)
async function pasada(r, pasos) {
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos;
    await raton(r.x + r.w * t, r.y + r.h * (0.5 + 0.4 * Math.sin(t * 6.283 * (pasos / 60))));
    await dormir(16);
  }
}

/* ── Escenario ──────────────────────────────────────────────────────────── */
await conectar();
await cdp('Page.enable');
// MOVIL=1: pantalla de móvil (390×844, densidad 3, táctil)
if (process.env.MOVIL) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}
await cdp('Page.navigate', { url: URL_BANCO });
for (let i = 0; i < 150 && !(await evalua('document.body?.dataset.listo === "1"')); i++) await dormir(100);
await dormir(1000);
// CSS=... inyecta reglas para aislar costes (p. ej. CSS='.slr-carta * { animation: none !important }')
if (process.env.CSS) await evalua(`document.head.insertAdjacentHTML('beforeend', ${JSON.stringify(`<style>${process.env.CSS}</style>`)}); 0`);
await cdp('Emulation.setCPUThrottlingRate', { rate: RALENTIZAR });

const foil = await evalua(`(() => { const r = document.querySelector('.slr-carta--foil').getBoundingClientRect(); return { x: r.x + 4, y: r.y + 4, w: r.width - 8, h: r.height - 8 }; })()`);
const rejilla = await evalua(`(() => { const r = document.getElementById('rejilla').getBoundingClientRect(); return { x: r.x + 10, y: r.y + 10, w: r.width - 20, h: Math.min(r.height, 860) - 20 }; })()`);

const tramos = [];
async function tramo(nombre, fn) {
  await cdp('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: [
    'devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel'] } });
  await dormir(100);
  await fn();
  await dormir(250);
  const fin = new Promise(r => pendientes.set('fin', r));
  await cdp('Tracing.end');
  await fin;
  tramos.push({ nombre, eventos: eventos.splice(0) });
}

await raton(2, 2);
// Un clic en una carta: en Chrome el giroscopio se activa al montar, pero por si
// el navegador pidiera un gesto (iOS)
await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: foil.x + 10, y: foil.y + 10, button: 'left', clickCount: 1 });
await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: foil.x + 10, y: foil.y + 10, button: 'left', clickCount: 1 });
await tramo('Reposo 1 s (sin ratón)', () => dormir(1000));
await tramo('1ª pasada por una carta foil', () => pasada(foil, 60));
await raton(2, 2); await dormir(600);
await tramo('2ª pasada por la misma carta', () => pasada(foil, 60));
await raton(2, 2); await dormir(600);
await tramo('Barrido por las 15 cartas', () => pasada(rejilla, 180));
await raton(2, 2); await dormir(600);
// Giroscopio: el móvil se balancea durante 1,5 s con las cartas en pantalla.
// Se simula con el override de sensores de DevTools (el del panel Sensors): el
// constructor de DeviceOrientationEvent en Chrome ignora beta y gamma.
await tramo('Giroscopio 1,5 s (cartas en pantalla)', async () => {
  for (let i = 0; i <= 90; i++) {
    const t = i / 60;
    await cdp('DeviceOrientation.setDeviceOrientationOverride', { alpha: 0, beta: 45 + 15 * Math.sin(t * 4), gamma: 20 * Math.sin(t * 3) });
    await dormir(16);
  }
});

// FOTO=archivo.png: captura con las cartas inclinadas por el giroscopio
if (process.env.FOTO) {
  const { writeFileSync } = await import('node:fs');
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(process.env.FOTO, Buffer.from(r.data, 'base64'));
}
// Comprobación: el giroscopio inclina de verdad las cartas visibles
const giro = await evalua(`({ visibles: document.querySelectorAll('.slr-carta.is-visible').length,
  inclinadas: [...document.querySelectorAll('.slr-carta__marco')].filter(m => getComputedStyle(m).transform !== 'none'
    && getComputedStyle(m).transform !== 'matrix(1, 0, 0, 1, 0, 0)').length })`);
console.log(`Giroscopio: ${giro.inclinadas} de ${giro.visibles} cartas en pantalla inclinadas`);

/* ── Resumen ────────────────────────────────────────────────────────────── */
const ms = us => (us / 1000).toFixed(1);
const resumen = [];
for (const t of tramos) {
  // Hilo principal del renderer: el que despacha los eventos del ratón
  // Hilo principal del renderer (CrRendererMain) con más actividad
  const hilos = t.eventos.filter(e => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
  const actividad = h => t.eventos.filter(e => e.pid === h.pid && e.tid === h.tid && e.ph === 'X').length;
  const ref = hilos.sort((a, b) => actividad(b) - actividad(a))[0];
  const m = ref ? t.eventos.filter(e => e.pid === ref.pid && e.tid === ref.tid && e.ph === 'X') : [];
  const suma = (...n) => m.filter(e => n.includes(e.name)).reduce((s, e) => s + (e.dur || 0), 0);
  const tareas = m.filter(e => e.name === 'RunTask');
  const raster = t.eventos.filter(e => e.ph === 'X' && e.name === 'RasterTask').reduce((s, e) => s + (e.dur || 0), 0);
  const fila = {
    tramo: t.nombre,
    'principal (ms)': ms(tareas.reduce((s, e) => s + e.dur, 0)),
    'tarea máx (ms)': ms(Math.max(0, ...tareas.map(e => e.dur))),
    'tareas >50ms': tareas.filter(e => e.dur > 50000).length,
    'estilo (ms)': ms(suma('UpdateLayoutTree')),
    'layout (ms)': ms(suma('Layout')),
    'pintado (ms)': ms(suma('Paint', 'PaintImage')),
    'raster (ms)': ms(raster),
  };
  resumen.push(fila);
  if (process.env.DETALLE) {
    // Animaciones que el compositor no ha podido hacer por su cuenta, y por qué
    const fallos = new Map();
    for (const e of t.eventos.filter(x => x.name === 'Animation' && x.args?.data?.compositeFailed)) {
      const d = e.args.data;
      fallos.set(`${d.compositeFailed} ${JSON.stringify(d.unsupportedProperties ?? [])}`, (fallos.get(`${d.compositeFailed} ${JSON.stringify(d.unsupportedProperties ?? [])}`) ?? 0) + 1);
    }
    const recalc = m.filter(e => e.name === 'UpdateLayoutTree');
    const elementos = recalc.reduce((s, e) => s + (e.args?.elementCount ?? e.args?.data?.elementCount ?? 0), 0);
    console.log(`  recálculos de estilo: ${recalc.length} · elementos recalculados: ${elementos}`);
    if (fallos.size) console.log('  sin componer:', [...fallos].map(([k, n]) => `${k} ×${n}`).join(' · '));
    // Los eventos que más tiempo suman en el hilo principal (DETALLE=1)
    const porNombre = {};
    for (const e of m) porNombre[e.name] = (porNombre[e.name] ?? 0) + (e.dur || 0);
    console.log(t.nombre, Object.entries(porNombre).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([n, d]) => `${n} ${ms(d)}`).join(' · '));
  }
}
console.table(resumen);
chrome.kill();
process.exit(0);
