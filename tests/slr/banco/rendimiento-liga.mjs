// Medidas de la Shits League normal (y de JUGAR por primera vez), en un móvil:
//   node tests/slr/banco/rendimiento-liga.mjs [--veces=3] [--json=ruta]
// Mismo móvil y red que rendimiento-app.mjs (412×915, CPU ×4, «4G lenta» con el proxy
// red-lenta.mjs para la página y el service worker). Mide:
//   · Arranque en frío (sin caché) y en caliente (la segunda vez), entrando en Inicio:
//     cuándo se ve Inicio, cuándo están los datos frescos de Sheets y cuándo se queda
//     la red tranquila (todo cargado). Peticiones y MB: de la Shits League y de Rush
//     (código, CSS e iconos de Rush, Supabase, fotos de cartas) por separado.
//   · JUGAR por primera vez (en una app ya abierta y quieta): hasta Equipo usable.
// Mediana de --veces pasadas (3 por defecto).
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { env, rpc, rpcOk } from '../api-util.mjs';
import { SUPABASE_URL } from '../../../js/slr/config.js';
import { redLenta } from './red-lenta.mjs';

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const VECES = Number(arg('veces') ?? 3);
const URL_APP = 'http://localhost:3000/';
const PUERTO = 9373;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const SUPA = new URL(SUPABASE_URL).host;
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36';
// ¿Es de Rush? (código, CSS e iconos de Rush, Supabase y las fotos de las cartas)
const deRush = url => { const u = new URL(url); return u.host === SUPA || (u.host === 'res.cloudinary.com' && u.pathname.includes('c_fill,ar_5:7'))
  || /^\/(js\/slr\/|css\/slr\.css|css\/acabados\/|img\/slr\/)/.test(decodeURIComponent(u.pathname)); };

const tk = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: tk, nombre: 'Prueba rendimiento liga (banco)' });
let navegador = null, red = null;
try {
  await rpcOk('slr_unirse_liga', { token: tk, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  red = await redLenta({ rtt: 150, bajada: 1.6e6, subida: 750e3 });
  navegador = await chromium.launch({ args: [`--remote-debugging-port=${PUERTO}`, `--proxy-server=${red.url}`, '--proxy-bypass-list=<-loopback>'] });

  /* ── CDP del navegador: la red de la página y de los workers ── */
  const version = await (await fetch(`http://127.0.0.1:${PUERTO}/json/version`)).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pend = new Map(), sesiones = new Map(), objetivos = new Set(), peticiones = new Map();
  const enviar = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  let registro = null;   // { t0, lista: [{ url, rush, bytes, fin }] } de la fase en curso
  ws.addEventListener('message', async m => {
    const x = JSON.parse(m.data);
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x.result); pend.delete(x.id); return; }
    if (x.method === 'Target.attachedToTarget') {
      const { sessionId, targetInfo } = x.params;
      if (objetivos.has(targetInfo.targetId)) { await enviar('Runtime.runIfWaitingForDebugger', {}, sessionId); enviar('Target.detachFromTarget', { sessionId }); return; }
      objetivos.add(targetInfo.targetId);
      sesiones.set(sessionId, targetInfo.type);
      await enviar('Network.enable', {}, sessionId);
      if (targetInfo.type === 'page') await enviar('Emulation.setCPUThrottlingRate', { rate: 4 }, sessionId);
      await enviar('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sessionId);
      await enviar('Runtime.runIfWaitingForDebugger', {}, sessionId);
      return;
    }
    const s = x.sessionId;
    if (s && !sesiones.has(s)) return;
    if (x.method === 'Network.requestWillBeSent') peticiones.set(`${s}|${x.params.requestId}`, { url: x.params.request.url, metodo: x.params.request.method });
    if (x.method === 'Network.responseReceived') {
      const p = peticiones.get(`${s}|${x.params.requestId}`);
      if (p) p.sw = !!x.params.response.fromServiceWorker;
    }
    if (x.method === 'Network.loadingFinished' && registro) {
      const p = peticiones.get(`${s}|${x.params.requestId}`);
      if (!p || p.url.startsWith('data:') || p.metodo === 'OPTIONS') return;
      // Lo servido por el service worker a la página no se cuenta dos veces (se cuenta en el worker si fue a la red)
      registro.lista.push({ hilo: sesiones.get(s), url: p.url, rush: deRush(p.url), bytes: p.sw ? 0 : x.params.encodedDataLength, red: !p.sw, fin: Date.now() - registro.t0 });
    }
  });
  await enviar('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });

  async function nuevoContexto() {
    const ctx = await navegador.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: UA });
    await ctx.addInitScript(([codigo]) => {
      try {
        if (!localStorage.getItem('SESSION_CODE')) {
          localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', codigo);
          localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true }));
        }
      } catch { /* */ }
    }, [env.SLR_BOT_UNO_CODIGO]);
    return ctx;
  }
  // Abre la Shits League en Inicio y mide hasta que la red se queda tranquila (2 s sin nada)
  async function abrirLiga(page) {
    registro = { t0: Date.now(), lista: [] };
    await page.goto(URL_APP, { waitUntil: 'commit' });
    const inicio = await page.waitForFunction(() => document.getElementById('hero-section')?.children.length && document.getElementById('panel-inicio')?.children.length && performance.now(),
      null, { timeout: 120000, polling: 50 }).then(h => h.jsonValue());
    // Tranquila: la página cargada, ningún service worker instalándose y 2 s sin peticiones
    // (el service worker se registra al terminar de cargar: su descarga cuenta)
    const ocupada = () => page.evaluate(async () => document.readyState !== 'complete'
      || (await navigator.serviceWorker.getRegistrations()).some(r => r.installing)).catch(() => true);
    let ultimo = 0, quieto = 0;
    while ((quieto < 2000 || await ocupada()) && Date.now() - registro.t0 < 180000) {
      await dormir(250);
      const n = registro.lista.length;
      if (n === ultimo) quieto += 250; else { quieto = 0; ultimo = n; }
    }
    const l = registro.lista;
    registro = null;
    const sheets = l.filter(x => x.url.includes('sheets.googleapis.com'));
    const sum = xs => xs.reduce((s, x) => s + x.bytes, 0);
    return {
      inicio,
      datos: sheets.length ? Math.max(...sheets.map(x => x.fin)) : null,
      tranquila: l.length ? Math.max(...l.map(x => x.fin)) : 0,
      pet: l.filter(x => x.red && !x.rush).length, mb: sum(l.filter(x => !x.rush)),
      petRush: l.filter(x => x.rush && x.red).length, mbRush: sum(l.filter(x => x.rush)),
      rushUrls: l.filter(x => x.rush && x.red).map(x => x.url),
    };
  }

  const pasadas = [];
  for (let k = 0; k < VECES; k++) {
    const ctx = await nuevoContexto();
    const page = await ctx.newPage();
    const res = {};
    res.frio = await abrirLiga(page);
    await page.goto('about:blank');
    await dormir(1000);
    res.caliente = await abrirLiga(page);
    // JUGAR por primera vez, con la app ya abierta y quieta
    await page.click('.tab[data-tab="rush"]');
    await page.waitForSelector('#rushJugar:not([disabled])', { timeout: 30000 });
    await dormir(1500);
    registro = { t0: Date.now(), lista: [] };
    const t0 = await page.evaluate(() => performance.now());
    await page.$eval('#rushJugar', b => b.click());
    const listo = await page.waitForFunction(() => document.querySelector('.slr-main .slr-pantalla[data-seccion="equipo"]:not(.es-atenuada)') && performance.now(),
      null, { timeout: 180000, polling: 50 }).then(h => h.jsonValue());
    await dormir(1500);
    const l = registro.lista;
    registro = null;
    res.jugar = { ms: listo - t0, pet: l.filter(x => x.red).length, mb: l.reduce((s, x) => s + x.bytes, 0) };
    await ctx.close();
    pasadas.push(res);
    process.stdout.write(`pasada ${k + 1}/${VECES} ✔\n`);
  }
  const mediana = xs => { const v = [...xs].sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const s1 = ms => (ms == null ? '—' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);
  const mb = b => `${(b / 1048576).toFixed(2).replace('.', ',')} MB`;
  const filas = {};
  console.log('\n| Shits League (Inicio) | Se ve | Datos frescos | Todo cargado | Peticiones | MB | Peticiones de Rush | MB de Rush |\n|---|---|---|---|---|---|---|---|');
  for (const k of ['frio', 'caliente']) {
    const m = c => mediana(pasadas.map(p => p[k][c]));
    filas[k] = { inicio: m('inicio'), datos: m('datos'), tranquila: m('tranquila'), pet: m('pet'), mb: m('mb'), petRush: m('petRush'), mbRush: m('mbRush') };
    const f = filas[k];
    console.log(`| ${k === 'frio' ? 'En frío' : 'En caliente'} | ${s1(f.inicio)} | ${s1(f.datos)} | ${s1(f.tranquila)} | ${f.pet} | ${mb(f.mb)} | ${f.petRush} | ${mb(f.mbRush)} |`);
  }
  filas.jugar = { ms: mediana(pasadas.map(p => p.jugar.ms)), pet: mediana(pasadas.map(p => p.jugar.pet)), mb: mediana(pasadas.map(p => p.jugar.mb)) };
  console.log(`\n| JUGAR por primera vez | ${s1(filas.jugar.ms)} hasta Equipo usable | ${filas.jugar.pet} peticiones | ${mb(filas.jugar.mb)} |`);
  if (process.env.DETALLE) console.log('\nDe Rush antes de JUGAR (frío):', pasadas[0].frio.rushUrls.slice(0, 30));
  if (arg('json')) writeFileSync(arg('json'), JSON.stringify({ fecha: new Date().toISOString(), veces: VECES, filas }, null, 2));
} finally {
  await navegador?.close();
  await red?.cerrar();
  const b = await rpc('slr_borrar_liga', { token: tk, liga_id: liga.id });
  console.log(b.ok ? '\nliga de prueba borrada' : `\nNO se pudo borrar la liga de prueba: ${b.mensaje}`);
  await rpc('slr_logout', { token: tk });
}
