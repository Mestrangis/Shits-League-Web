// Medidas de rendimiento de Shits League Rush en un móvil (Playwright + CDP).
//   node tests/slr/banco/rendimiento-app.mjs [--veces=3] [--json=ruta]
// Necesita el servidor de pruebas en http://localhost:3000 y `npm install` en tests/slr/banco.
//
// Móvil simulado: 412×915 (DPR 2,625, táctil), CPU ×4 y «4G lenta» (150 ms de ida y
// vuelta, 1,6 Mbit/s de bajada y 750 kbit/s de subida, como Lighthouse). La red se
// limita con un proxy local (red-lenta.mjs) para TODO el navegador: la página y el
// service worker por igual. La web se sirve con las cabeceras de caché de GitHub Pages.
//
// Mide, con una liga de prueba del bot (Bot Uno + 3 bots, una jornada jugada):
//   · Arranque en frío (sin caché ni service worker) y en caliente (la segunda vez):
//     hasta la portada de Rush lista («JUGAR») y hasta la pantalla Equipo pintada.
//   · Cada pestaña de Rush al entrar (la primera vez y al volver).
//   · Peticiones a Supabase, a Cloudinary y MB descargados por pantalla y en una sesión
//     típica (entrar, Equipo, Plantilla, Mercado, Liga y salir).
// Cada medida es la mediana de --veces pasadas (3 por defecto).
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { env, rpc, rpcOk, leer } from '../api-util.mjs';
import { SUPABASE_URL } from '../../../js/slr/config.js';
import { redLenta } from './red-lenta.mjs';

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const VECES = Number(arg('veces') ?? 3);
const URL_APP = 'http://localhost:3000/';
const PUERTO = 9371;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const SUPA = new URL(SUPABASE_URL).host;
const RED = { rtt: 150, bajada: 1.6e6, subida: 750e3 };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36';
const PESTANAS = ['plantilla', 'mercado', 'liga', 'equipo'];

/* ── Liga de prueba ─────────────────────────────────────────────────────── */
const tk = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: tk, nombre: 'Prueba rendimiento (banco)' });
const L = liga.id;
let navegador = null, red = null;
const filas = [];
try {
  await rpcOk('slr_unirse_liga', { token: tk, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  for (let i = 0; i < 3; i++) await rpcOk('slr_admin_anadir_bot', { token: tk, liga_id: L });
  await rpcOk('slr_iniciar_temporada', { token: tk, liga_id: L });
  let r;
  do { r = await rpcOk('slr_admin_jugar_jornada', { token: tk, liga_id: L }); if (r.estado === 'simulando') await dormir(1500); } while (r.estado === 'simulando');
  // El partido ya visto (si no, Rush abre la reproducción al entrar)
  const U = (await leer(`equipos?select=id&liga_id=eq.${L}&nombre=eq.Bot%20Uno%20FC`)).datos[0].id;
  const mio = (await leer(`partidos?select=id&liga_id=eq.${L}&tipo=eq.liga&or=(local_id.eq.${U},visitante_id.eq.${U})`)).datos[0];
  if (mio) await rpcOk('slr_marcar_visto', { token: tk, partido_id: mio.id });

  red = await redLenta(RED);
  // localhost también por el proxy (Chrome se lo salta por defecto)
  navegador = await chromium.launch({ args: [`--remote-debugging-port=${PUERTO}`, `--proxy-server=${red.url}`, '--proxy-bypass-list=<-loopback>'] });

  /* ── CDP del navegador: red limitada y contada en la página y en los workers ── */
  const version = await (await fetch(`http://127.0.0.1:${PUERTO}/json/version`)).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r2 => ws.addEventListener('open', r2, { once: true }));
  let id = 0;
  const pend = new Map();
  const enviar = (method, params = {}, sessionId) => new Promise(r2 => { const i = ++id; pend.set(i, r2); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const sesiones = new Map();   // sessionId → tipo
  const objetivos = new Set();  // targetId ya enganchados (un worker puede llegar por dos caminos)
  let cuenta = null;            // { supa, cloud, otras, bytes, bytesImg } de la fase en curso
  const peticiones = new Map(); // `${sessionId}|${requestId}` → { url, sw }
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
    if (x.method === 'Target.detachedFromTarget') return;
    if (s && !sesiones.has(s)) return;
    if (x.method === 'Network.requestWillBeSent') peticiones.set(`${s}|${x.params.requestId}`, { url: x.params.request.url, metodo: x.params.request.method });
    if (x.method === 'Network.responseReceived') {
      const p = peticiones.get(`${s}|${x.params.requestId}`);
      if (p) p.sw = !!x.params.response.fromServiceWorker || !!x.params.response.fromDiskCache;
    }
    if (x.method === 'Network.loadingFinished' && cuenta) {
      const p = peticiones.get(`${s}|${x.params.requestId}`);
      if (!p || p.sw || p.url.startsWith('data:')) return;     // lo servido por el service worker se cuenta en el worker
      const host = new URL(p.url).host;
      if (process.env.DETALLE) (cuenta.lista ??= []).push(`${sesiones.get(s)} ${Math.round(x.params.encodedDataLength / 1024)}k ${p.url.slice(0, 110)}`);
      cuenta.bytes += x.params.encodedDataLength;
      if (host === SUPA) { if (p.metodo !== 'OPTIONS') cuenta.supa++; }
      else if (host === 'res.cloudinary.com') { cuenta.cloud++; cuenta.bytesImg += x.params.encodedDataLength; }
      else cuenta.otras++;
    }
  });
  await enviar('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  const fase = () => { cuenta = { supa: 0, cloud: 0, otras: 0, bytes: 0, bytesImg: 0 }; return cuenta; };

  /* ── Una pasada: arranque en frío, sesión típica, arranque en caliente ── */
  async function nuevoContexto() {
    const ctx = await navegador.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: UA });
    await ctx.addInitScript(([codigo]) => {
      try {
        localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', codigo);
        localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true }));
      } catch { /* */ }
    }, [env.SLR_BOT_UNO_CODIGO]);
    return ctx;
  }
  async function pasada() {
    const ctx = await nuevoContexto();
    const page = await ctx.newPage();
    const res = { pantallas: {} };
    const hastaListo = async (pg = page) => {
      const page = pg;
      const portada = await page.waitForFunction(() => { const b = document.getElementById('rushJugar'); return b && !b.disabled && performance.now(); }, null, { timeout: 120000, polling: 50 }).then(h => h.jsonValue());
      await page.click('#rushJugar');
      // Se ve (aunque sea lo de la última vez, atenuado) y se puede usar (con los datos frescos)
      const visible = await page.waitForFunction(() => document.querySelector('.slr-main .slr-pantalla[data-seccion="equipo"]') && performance.now(), null, { timeout: 120000, polling: 50 }).then(h => h.jsonValue());
      const equipo = await page.waitForFunction(() => document.querySelector('.slr-main .slr-pantalla[data-seccion="equipo"]:not(.es-atenuada)') && performance.now(), null, { timeout: 120000, polling: 50 }).then(h => h.jsonValue());
      return { portada, visible, equipo };
    };
    const medir = async (nombre, accion) => {
      const c = fase();
      const t0 = Date.now();
      await accion();
      const ms = Date.now() - t0;
      await dormir(1500);   // lo que siga llegando (imágenes, precargas) cuenta para esta pantalla
      cuenta = null;
      return { ms, ...c };
    };
    const pestana = s => async () => {
      await page.click(`.slr-nav__item[data-seccion="${s}"]`);
      await page.waitForFunction(x => document.querySelector(`.slr-main .slr-pantalla[data-seccion="${x}"]:not(.es-atenuada)`), s, { timeout: 120000, polling: 50 });
    };

    // Frío
    let c = fase();
    await page.goto(`${URL_APP}#rush`, { waitUntil: 'commit' });
    res.frio = await hastaListo();
    await dormir(1500); cuenta = null;
    res.pantallas.entrar = { ms: res.frio.equipo, ...c };
    if (process.env.DETALLE) console.log(c.lista.join(String.fromCharCode(10)));
    for (const s of PESTANAS) res.pantallas[s] = await medir(s, pestana(s));
    for (const s of PESTANAS) res.pantallas[`${s}·otra vez`] = await medir(s, pestana(s));
    res.pantallas.salir = await medir('salir', async () => { await page.click('.slr-barra__salir'); await page.waitForSelector('#slr', { state: 'detached' }); });
    // Caliente: otra vez, con lo que haya quedado en caché (una carga nueva de verdad: cambiar
    // solo el # no recarga la página)
    await page.goto('about:blank');
    c = fase();
    await page.goto(`${URL_APP}#rush`, { waitUntil: 'commit' });
    res.caliente = await hastaListo();
    await dormir(1500); cuenta = null;
    res.pantallas['entrar (caliente)'] = { ms: res.caliente.equipo, ...c };
    if (process.env.DETALLE) console.log(['--- caliente ---', ...(c.lista ?? [])].join(String.fromCharCode(10)));
    await ctx.close();
    // Caliente con la caché del navegador caducada (como al día siguiente): una carga para
    // instalar lo que haga falta, con las respuestas marcadas para revalidar, y otra medida
    const ctx2 = await nuevoContexto();
    const page2 = await ctx2.newPage();
    red.cacheWeb = 'no-cache';
    await page2.goto(`${URL_APP}#rush`, { waitUntil: 'commit' });
    await hastaListo(page2);
    // Hasta que la app esté entera en la caché del service worker (si lo hay)
    await page2.waitForFunction(async () => !window.SLVersion || (await window.SLVersion.estado()).lista, null, { timeout: 180000, polling: 500 });
    await dormir(1000);
    await page2.goto('about:blank');
    c = fase();
    await page2.goto(`${URL_APP}#rush`, { waitUntil: 'commit' });
    res.caducada = await hastaListo(page2);
    await dormir(1500); cuenta = null;
    res.pantallas['entrar (caché caducada)'] = { ms: res.caducada.equipo, ...c };
    if (process.env.DETALLE) console.log(['--- caducada ---', ...(c.lista ?? [])].join(String.fromCharCode(10)));
    red.cacheWeb = 'max-age=600';
    await ctx2.close();
    return res;
  }

  const pasadas = [];
  for (let k = 0; k < VECES; k++) { pasadas.push(await pasada()); process.stdout.write(`pasada ${k + 1}/${VECES} ✔\n`); }
  const mediana = xs => { const v = [...xs].sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const mb = b => (b / 1048576).toFixed(2).replace('.', ',');
  const s1 = ms => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

  console.log('\n| Arranque | Portada Rush lista | Equipo se ve | Equipo se puede usar |\n|---|---|---|---|');
  const NOMBRE = { frio: 'En frío (sin caché)', caliente: 'En caliente (2.ª vez, a los pocos minutos)', caducada: 'En caliente, con la caché del navegador caducada (al día siguiente)' };
  for (const k of Object.keys(NOMBRE)) {
    const fila = { medida: `arranque ${k}`, portada: mediana(pasadas.map(p => p[k].portada)), visible: mediana(pasadas.map(p => p[k].visible)), equipo: mediana(pasadas.map(p => p[k].equipo)) };
    filas.push(fila);
    console.log(`| ${NOMBRE[k]} | ${s1(fila.portada)} | ${s1(fila.visible)} | ${s1(fila.equipo)} |`);
  }
  console.log('\n| Pantalla | Tiempo | Supabase | Cloudinary | Otras | MB (imágenes) |\n|---|---|---|---|---|---|');
  const total = { supa: 0, cloud: 0, otras: 0, bytes: 0, bytesImg: 0 };
  for (const nombre of Object.keys(pasadas[0].pantallas)) {
    const m = k => mediana(pasadas.map(p => p.pantallas[nombre][k]));
    const fila = { medida: nombre, ms: m('ms'), supa: m('supa'), cloud: m('cloud'), otras: m('otras'), bytes: m('bytes'), bytesImg: m('bytesImg') };
    filas.push(fila);
    if (!nombre.includes('(')) for (const k of Object.keys(total)) total[k] += fila[k];
    console.log(`| ${nombre} | ${s1(fila.ms)} | ${fila.supa} | ${fila.cloud} | ${fila.otras} | ${mb(fila.bytes)} (${mb(fila.bytesImg)}) |`);
  }
  filas.push({ medida: 'sesión típica', ...total });
  console.log(`| **Sesión típica** (entrar, Equipo, Plantilla, Mercado, Liga, salir) | | ${total.supa} | ${total.cloud} | ${total.otras} | ${mb(total.bytes)} (${mb(total.bytesImg)}) |`);
  if (arg('json')) writeFileSync(arg('json'), JSON.stringify({ fecha: new Date().toISOString(), veces: VECES, filas }, null, 2));
} finally {
  await navegador?.close();
  await red?.cerrar();
  const b = await rpc('slr_borrar_liga', { token: tk, liga_id: L });
  console.log(b.ok ? '\nliga de prueba borrada' : `\nNO se pudo borrar la liga de prueba: ${b.mensaje}`);
  await rpcOk('slr_logout', { token: tk }).catch(() => {});
}
