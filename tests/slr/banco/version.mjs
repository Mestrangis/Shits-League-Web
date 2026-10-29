// Prueba en el navegador de cómo se actualiza la app (version.json + sw.js + js/version.js), el
// caso real: se instala la versión A, se «despliega» la B y se comprueba que llega sola.
//   node tests/slr/banco/version.mjs   (servidor en http://localhost:3000; npm install en tests/slr/banco)
// Móvil 412 px con red lenta (red-lenta.mjs: las mismas cabeceras de caché que GitHub Pages,
// max-age=600). Al desplegar B, la «caché de GitHub Pages» (red.cdnViejo) sigue dando lo de A a las
// URL sin parámetros, como Fastly justo después de un despliegue, y la del navegador también tiene A.
// · Abrir la app y quedarse en la Shits League: nada de Rush. JUGAR la primera vez: la barra.
// · Desplegada B: al abrir la app se aplica B (una recarga rápida); al pulsar JUGAR sale la barra
//   (solo lo cambiado) y se entra en B; no sobrevive ningún archivo de A.
// · Sin red se abre la versión que había (A) sin romperse, y Rush también; con red, B.
// · Un archivo roto en la caché: la app se repara sola. «Reparar la app» a mano, también.
// · Código viejo para el servidor (función de Supabase que no existe): se aplica la versión nueva.
// · Perfil: la versión instalada (commit corto y fecha). El login nunca se pierde.
// Los «despliegues» tocan js/ui.js y js/slr/ui.js (una marca al final) y version.json; se deja todo
// como estaba al terminar, pase lo que pase.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env, rpc, rpcOk } from '../api-util.mjs';
import { SUPABASE_URL } from '../../../js/slr/config.js';
import { generar } from '../../../herramientas/precarga.mjs';
import { redLenta } from './red-lenta.mjs';

const URL_APP = 'http://localhost:3000/';
const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36';
const SUPA = new URL(SUPABASE_URL).host;
const deRush = url => { const u = new URL(url); return u.host === SUPA || (u.host === 'res.cloudinary.com' && u.pathname.includes('c_fill,ar_5:7'))
  || /^\/(js\/slr\/|css\/slr\.css|css\/acabados\/|img\/slr\/|assets\/slr-)/.test(decodeURIComponent(u.pathname)); };

/* ── Despliegues de prueba ───────────────────────────────────────────────── */
const ruta = r => fileURLToPath(new URL(`../../../${r}`, import.meta.url));
const ORIGINAL = { ui: readFileSync(ruta('js/ui.js'), 'utf8'), slrui: readFileSync(ruta('js/slr/ui.js'), 'utf8') };
const desplegados = {};
function desplegar(letra) {
  const ui = `${ORIGINAL.ui}\n;window.__despliegue = '${letra}';\n`;
  const slrui = `${ORIGINAL.slrui}\nglobalThis.__despliegueRush = '${letra}';\n`;
  writeFileSync(ruta('js/ui.js'), ui);
  writeFileSync(ruta('js/slr/ui.js'), slrui);
  const v = generar({ commit: `${letra}${letra}${letra}1234`.toLowerCase(), fecha: new Date().toISOString() });
  writeFileSync(ruta('version.json'), JSON.stringify(v));
  desplegados[letra] = { v, ui, slrui, index: readFileSync(ruta('index.html'), 'utf8') };
  return v;
}
function dejarComoEstaba() {
  writeFileSync(ruta('js/ui.js'), ORIGINAL.ui);
  writeFileSync(ruta('js/slr/ui.js'), ORIGINAL.slrui);
  writeFileSync(ruta('version.json'), JSON.stringify(generar()));
}

const tk = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: tk, nombre: 'Prueba versión (banco)' });
let navegador = null, red = null;
try {
  await rpcOk('slr_unirse_liga', { token: tk, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  red = await redLenta({ rtt: 150, bajada: 1.6e6, subida: 750e3 });
  navegador = await chromium.launch({ args: [`--proxy-server=${red.url}`, '--proxy-bypass-list=<-loopback>'] });
  const contexto = async () => {
    const ctx = await navegador.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: UA });
    await ctx.addInitScript(([codigo]) => {
      try {
        if (!localStorage.getItem('SESSION_CODE')) {
          localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', codigo);
          localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true }));
        }
      } catch { /* */ }
    }, [env.SLR_BOT_UNO_CODIGO]);
    const page = await ctx.newPage();
    page.errores = [];
    page.on('pageerror', e => page.errores.push(e.message));
    page.cargas = 0;
    page.on('load', () => page.cargas++);
    return { ctx, page };
  };
  const estado = page => page.evaluate(() => window.SLVersion?.estado?.()).catch(() => null);
  const esperar = async (f, ms = 60000) => { for (let t = Date.now(); Date.now() - t < ms;) { if (await f().catch(() => false)) return true; await dormir(300); } return false; };
  const inicio = page => page.waitForFunction(() => document.getElementById('panel-inicio')?.children.length > 0, null, { timeout: 60000 });
  const instaladaEs = (page, v, ms) => esperar(async () => (await estado(page))?.activa?.version === v.version, ms);
  const foto = async (page, n) => { if (SALIDA) await page.screenshot({ path: `${SALIDA}/version-${n}.png` }); };
  // JUGAR: si sale la barra, sus porcentajes; espera a estar dentro de Rush
  const jugar = async page => {
    await page.click('.tab[data-tab="rush"]').catch(() => {});
    await page.waitForSelector('#rushJugar:not([disabled])', { timeout: 30000 });
    await page.$eval('#rushJugar', b => b.click());
    const pcts = [];
    let barra = false;
    for (let k = 0; k < 1500; k++) {
      if (await page.$('.slr-nav:not([hidden])').catch(() => null)) break;
      const t = await page.$eval('.rush-descarga__texto', e => e.textContent).catch(() => null);
      if (t != null) barra = true;
      const p = Number(t?.match(/^(\d+) %/)?.[1]);
      if (Number.isFinite(p) && p !== pcts.at(-1)) pcts.push(p);
      await dormir(100);
    }
    return { barra, pcts, dentro: !!await page.$('.slr-nav:not([hidden])').catch(() => null), rush: await page.evaluate(() => globalThis.__despliegueRush ?? null).catch(() => null) };
  };
  const salirDeRush = async page => { await page.click('.slr-barra__salir').catch(() => {}); await page.waitForSelector('#rushJugar', { timeout: 15000 }).catch(() => {}); };
  const sinLogin = page => page.evaluate(() => !document.getElementById('sessionModal').classList.contains('open') && localStorage.getItem('SESSION_PLAYER') === 'Bot Uno');

  /* ── 1. Versión A instalada (dos móviles: uno con red y otro que luego no tendrá) ── */
  console.log('\nVersión A');
  const A = desplegar('A');
  const uno = await contexto(), dos = await contexto();
  const pedidas = [];
  uno.ctx.on('request', r => pedidas.push(r.url()));
  for (const { page } of [uno, dos]) {
    await page.goto(URL_APP, { waitUntil: 'domcontentloaded' });
    await inicio(page);
  }
  check(await instaladaEs(uno.page, A, 90000) && await instaladaEs(dos.page, A, 90000), 'la primera vez se instala sola (la Shits League de A)');
  await dormir(1500);
  check(!pedidas.filter(deRush).length, `abrir la app y quedarse en la Shits League: nada de Rush (${pedidas.filter(deRush).length})`);
  const j1 = await jugar(uno.page);
  check(j1.barra && j1.pcts.length >= 2 && j1.pcts.at(-1) >= 80 && j1.dentro && j1.rush === 'A', `JUGAR la primera vez: la barra (${j1.pcts.slice(0, 3).join(', ')} … ${j1.pcts.at(-1)} %) y Rush de A`, JSON.stringify(j1));
  await salirDeRush(uno.page);
  const j1b = await jugar(dos.page);
  check(j1b.dentro && j1b.rush === 'A', 'el otro móvil, también con Rush de A');
  await salirDeRush(dos.page);
  const e1 = await estado(uno.page);
  check(e1.rush && e1.app, 'A entera (la Shits League y Rush)');
  await uno.page.click('.tab[data-tab="rush"]');
  await jugar(uno.page);
  await uno.page.click('.slr-nav__item[data-seccion="perfil"]');
  await uno.page.waitForSelector('.slr-perfil__version [data-version-app]');
  await esperar(async () => /aaa1234/.test(await uno.page.$eval('.slr-perfil__version [data-version-app]', e => e.textContent)), 5000);
  const etiqueta = await uno.page.$eval('.slr-perfil__version [data-version-app]', e => e.textContent);
  check(/^Versión aaa1234 · (\p{L}+, )?\d+ (de )?\p{L}+\.? (de )?\d{4}/u.test(etiqueta) && !!await uno.page.$('.slr-perfil__version [data-reparar-app]'), `Perfil: «${etiqueta}» y «Reparar la app»`);
  await foto(uno.page, 'perfil');
  await salirDeRush(uno.page);

  /* ── 2. Se despliega B (y la caché de GitHub Pages aún da A) ── */
  console.log('\nSe despliega B');
  const B = desplegar('B');
  for (const r of ['/js/ui.js', '/js/slr/ui.js', '/version.json']) red.cdnViejo.set(r, r === '/version.json' ? JSON.stringify(A) : r === '/js/ui.js' ? desplegados.A.ui : desplegados.A.slrui);
  // Sin red: se abre A, sin romperse (también Rush)
  red.offline = true;
  const t0 = Date.now();
  await dos.page.goto(URL_APP, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const offInicio = await inicio(dos.page).then(() => true, () => false);
  check(offInicio && await dos.page.evaluate(() => window.__despliegue) === 'A' && Date.now() - t0 < 12000,
    `sin red: se abre la que había (A) sin romperse (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const jOff = await jugar(dos.page);
  check(jOff.dentro && jOff.rush === 'A' && !jOff.barra, 'y Rush de A, sin barra');
  await salirDeRush(dos.page);
  red.offline = false;
  // Con red: al abrir, B (y aunque GitHub Pages siga dando A a las URL de siempre)
  const cargas = uno.page.cargas;
  const t1 = Date.now();
  await uno.page.goto(URL_APP, { waitUntil: 'domcontentloaded' });
  await inicio(uno.page);
  await dormir(1000);
  const tB = Date.now() - t1;
  check(await uno.page.evaluate(() => window.__despliegue) === 'B' && (await estado(uno.page))?.activa?.version === B.version,
    `al abrir la app se aplica B (${uno.page.cargas - cargas} cargas, Inicio a los ${(tB / 1000).toFixed(1)} s)`);
  check(uno.page.cargas - cargas <= 2, 'con una recarga rápida como mucho');
  check(!await uno.page.$('#versionNueva'), 'sin avisos ni preguntas');
  const jB = await jugar(uno.page);
  check(jB.barra && jB.dentro && jB.rush === 'B', `al pulsar JUGAR sale la barra (solo lo cambiado: ${jB.pcts.join(', ')} %) y se entra en B`, JSON.stringify(jB));
  await salirDeRush(uno.page);
  // Ningún archivo de A sobrevive: ni cachés de A ni archivos que no sean de B
  const cachesB = await uno.page.evaluate(async ([a, b]) => {
    const out = { deA: [], malos: [] };
    for (const n of await caches.keys()) {
      if (n.includes(a)) out.deA.push(n);
      if (!/-(app|rush)-/.test(n)) continue;
      const c = await caches.open(n);
      for (const q of await c.keys()) {
        if (q.url.endsWith('.json')) continue;
        const t = await (await c.match(q)).text();
        if (/__despliegue(Rush)? = 'A'/.test(t)) out.malos.push(q.url);
      }
    }
    out.ui = await (await caches.match('/js/ui.js')).text().then(t => t.includes("__despliegue = 'B'"));
    return out;
  }, [A.version, B.version]);
  check(!cachesB.deA.length && !cachesB.malos.length && cachesB.ui, `ningún archivo de A sobrevive (${cachesB.deA.length} cachés de A, ${cachesB.malos.length} archivos)`, JSON.stringify(cachesB));
  check(await sinLogin(uno.page), 'el login sigue (no se pide el código)');
  // El otro móvil, ya con red: también B (y al pulsar JUGAR, Rush de B)
  await dos.page.goto(URL_APP, { waitUntil: 'domcontentloaded' });
  await inicio(dos.page);
  const jDos = await jugar(dos.page);
  check(await dos.page.evaluate(() => window.__despliegue) === 'B' && jDos.rush === 'B', 'el móvil que estaba sin red, al volver la red: B (y Rush de B)');
  await salirDeRush(dos.page);
  red.cdnViejo.clear();

  /* ── 3. JUGAR con una versión nueva y la app abierta (sin volver a abrirla) ── */
  console.log('\nVersión C con la app abierta');
  const C = desplegar('C');
  const cargasC = uno.page.cargas;
  const jC = await jugar(uno.page);
  check(jC.dentro && jC.rush === 'C' && await uno.page.evaluate(() => window.__despliegue) === 'C' && uno.page.cargas - cargasC === 1,
    `al pulsar JUGAR: la versión nueva (la Shits League también), una recarga y dentro de Rush de C (${jC.pcts.at(-1) ?? '—'} %)`, JSON.stringify(jC));
  await salirDeRush(uno.page);

  /* ── 4. Un archivo roto en la caché: se repara solo ── */
  console.log('\nArchivo roto');
  await uno.page.evaluate(async v => {
    for (const n of await caches.keys()) if (n.includes(`-app-${v}`)) await (await caches.open(n)).put(new URL('js/app.js', location.href).href, new Response('function roto( {', { headers: { 'Content-Type': 'text/javascript' } }));
  }, C.version);
  const cargasR = uno.page.cargas;
  await uno.page.goto(URL_APP, { waitUntil: 'domcontentloaded' });
  const reparada = await esperar(async () => (await uno.page.evaluate(() => document.getElementById('panel-inicio')?.children.length > 0)), 60000);
  const appBien = await uno.page.evaluate(async () => !(await (await caches.match('/js/app.js')).text()).includes('function roto('));
  check(reparada && appBien && uno.page.cargas - cargasR <= 3, `con js/app.js roto en la caché, la app se repara sola y arranca (${uno.page.cargas - cargasR} cargas)`);
  // Uno que no rompe el arranque (un CSS): lo arregla la comprobación de después de arrancar
  await uno.page.evaluate(async v => {
    for (const n of await caches.keys()) if (n.includes(`-app-${v}`)) await (await caches.open(n)).put(new URL('css/rush-panel.css', location.href).href, new Response('/* roto */'));
  }, C.version);
  await uno.page.goto(URL_APP, { waitUntil: 'domcontentloaded' });
  await inicio(uno.page);
  check(await esperar(async () => !(await (await uno.page.evaluate(async () => (await caches.match('/css/rush-panel.css')).text()))).includes('/* roto */'), 40000),
    'un archivo roto que no impide arrancar (CSS): lo repara la comprobación de después de arrancar');

  uno.page.errores.length = 0;   // (el app.js roto de antes da su error a propósito)

  /* ── 5. «Reparar la app» a mano ── */
  console.log('\nReparar la app');
  await uno.page.evaluate(() => { window.confirm = () => true; });
  const cargasM = uno.page.cargas;
  await uno.page.click('.pie-app [data-reparar-app]');
  await esperar(async () => uno.page.cargas > cargasM, 60000);
  await inicio(uno.page);
  check(await instaladaEs(uno.page, C, 30000) && uno.page.cargas > cargasM, '«Reparar la app» (pie): lo borra, lo descarga todo de nuevo y recarga');
  check(await sinLogin(uno.page), 'el login sigue tras reparar');

  /* ── 6. Código viejo para el servidor: se aplica la versión nueva ── */
  console.log('\nActualización forzada');
  const D = desplegar('D');
  const cargasF = uno.page.cargas;
  await uno.page.evaluate(() => { sessionStorage.clear(); window.SLVersion.forzarActualizacion(); });
  check(await esperar(async () => uno.page.cargas > cargasF && await uno.page.evaluate(() => window.__despliegue) === 'D', 60000),
    'una función de Supabase que ya no existe: «Actualizando la app…», la versión nueva y recarga');
  check(!uno.page.errores.length, 'sin errores en la página', uno.page.errores.slice(0, 3).join(' | '));
  await uno.ctx.close();
  await dos.ctx.close();
} catch (e) {
  mal++;
  console.log(`\n  ✖ Error inesperado: ${e.stack ?? e.message}`);
} finally {
  dejarComoEstaba();
  if (red) { red.retener = null; red.cdnViejo.clear(); }
  await navegador?.close();
  await red?.cerrar();
  const b = await rpc('slr_borrar_liga', { token: tk, liga_id: liga.id });
  check(b.ok, 'liga de prueba borrada', b.mensaje);
  await rpc('slr_logout', { token: tk });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
  process.exitCode = mal ? 1 : 0;
}
