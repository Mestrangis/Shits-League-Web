// Prueba en el navegador de cómo se descarga y se actualiza la app (sw.js + js/version.js):
//   node tests/slr/banco/version.mjs        (servidor en http://localhost:3000; npm install en tests/slr/banco)
// A 360 y 412 px, con red lenta (4G lenta, red-lenta.mjs) y sin conexión:
// · Abrir la app y quedarse en la Shits League (y mirar la portada de Rush sin pulsar JUGAR):
//   NINGUNA petición de Rush (código, CSS, iconos, Supabase, fotos de cartas), ni de la página
//   ni del service worker. La Shits League normal queda instalada entera.
// · JUGAR por primera vez: «Descargando Shits League Rush…» con el porcentaje real y entra
//   sola. Después, JUGAR entra directo y todo sale de la caché; sin conexión, arranca igual.
// · Versión nueva: se descarga en segundo plano (Rush también, porque ya estaba descargado),
//   SIN aviso ni recarga mientras se usa, y se aplica sola al abrir la app la próxima vez.
// · Versión nueva publicada a mitad de la primera descarga de Rush: la descarga termina
//   bien, entra en Rush, y la nueva se aplica al abrir la próxima vez (una recarga, sin bucles).
// · Código viejo (una función de Supabase que ya no existe): «Actualizando la app…» con la
//   rueda, se actualiza y recarga sola; si tarda más de 15 s, un mensaje y «Reintentar».
// · El login nunca se pierde ni se vuelve a pedir el código.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { env, rpc, rpcOk } from '../api-util.mjs';
import { SUPABASE_URL } from '../../../js/slr/config.js';
import { redLenta } from './red-lenta.mjs';

const URL_APP = 'http://localhost:3000/';
const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36';
const SUPA = new URL(SUPABASE_URL).host;
// ¿Es de Rush? (código, CSS e iconos de Rush, Supabase y las fotos de las cartas)
const deRush = url => { const u = new URL(url); return u.host === SUPA || (u.host === 'res.cloudinary.com' && u.pathname.includes('c_fill,ar_5:7'))
  || /^\/(js\/slr\/|css\/slr\.css|css\/acabados\/|img\/slr\/|assets\/slr-)/.test(decodeURIComponent(u.pathname)); };

// Una «versión nueva» de verdad: precarga.js en el disco con otra versión y js/ui.js marcado
// como cambiado (y, con rush, también js/slr/ui.js). El navegador mira él mismo si hay versión
// nueva: no pasa por page.route. Se deja como estaba al terminar, pase lo que pase.
const PRECARGA = new URL('../../../precarga.js', import.meta.url);
const ORIGINAL = readFileSync(PRECARGA, 'utf8');
const publicar = (v, { rush = false } = {}) => {
  let t = ORIGINAL.replace(/"version": "[0-9a-f]{12}"/, `"version": "${v}"`).replace(/\["js\/ui\.js", (\d+), "[0-9a-f]{12}"/, `["js/ui.js", $1, "${v}"`);
  if (rush) t = t.replace(/"versionRush": "[0-9a-f]{12}"/, `"versionRush": "${v}"`).replace(/\["js\/slr\/ui\.js", (\d+), "[0-9a-f]{12}"/, `["js/slr/ui.js", $1, "${v}"`);
  writeFileSync(PRECARGA, t);
};

const tk = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: tk, nombre: 'Prueba versión (banco)' });
let navegador = null, red = null;
try {
  await rpcOk('slr_unirse_liga', { token: tk, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  red = await redLenta({ rtt: 150, bajada: 1.6e6, subida: 750e3 });
  navegador = await chromium.launch({ args: [`--proxy-server=${red.url}`, '--proxy-bypass-list=<-loopback>'] });
  const contexto = async (ancho) => {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: ancho === 360 ? 740 : 915 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
    await ctx.addInitScript(([codigo]) => {
      try {
        if (!localStorage.getItem('SESSION_CODE')) {
          localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', codigo);
          localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true }));
        }
      } catch { /* */ }
    }, [env.SLR_BOT_UNO_CODIGO]);
    return ctx;
  };
  const estado = page => page.evaluate(() => new Promise(res => {
    const c = new MessageChannel();
    c.port1.onmessage = e => res(e.data);
    navigator.serviceWorker.controller?.postMessage({ tipo: 'estado' }, [c.port2]);
    setTimeout(() => res(null), 3000);
  })).catch(() => null);
  // Espera (con un bucle: waitForFunction no espera a una función async) a que el registro esté así
  const esperarRegistro = async (page, cond, ms = 120000) => {
    for (let t = Date.now(); Date.now() - t < ms;) {
      const r = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { activo: !!r?.active, instalando: !!r?.installing, esperando: !!r?.waiting }; }).catch(() => null);
      if (r && cond(r)) return true;
      await dormir(300);
    }
    return false;
  };
  // JUGAR y, si sale, la pantalla de descarga: los porcentajes que enseña
  const jugar = async page => {
    await page.$eval('#rushJugar', b => b.click());
    const pcts = [];
    let vista = false;
    for (let k = 0; k < 1200; k++) {
      if (await page.$('.slr-nav:not([hidden])')) break;
      const t = await page.$eval('.rush-descarga__texto', e => e.textContent).catch(() => null);
      if (t != null) vista = true;
      const p = Number(t?.match(/^(\d+) %/)?.[1]);
      if (Number.isFinite(p) && p !== pcts.at(-1)) pcts.push(p);
      await dormir(100);
    }
    const dentro = !!await page.$('.slr-nav:not([hidden])');
    return { vista, pcts, dentro };
  };
  const salirDeRush = async page => { await page.click('.slr-barra__salir').catch(() => {}); await page.waitForSelector('#rushJugar', { timeout: 15000 }).catch(() => {}); };

  for (const ancho of (process.env.ANCHOS ?? '360,412').split(',').map(Number)) {
    console.log(`\n${ancho} px`);
    const ctx = await contexto(ancho);
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    let cargas = 0;
    page.on('load', () => cargas++);
    const foto = async n => { if (SALIDA) await page.screenshot({ path: `${SALIDA}/version-${ancho}-${n}.png` }); };
    const sinLogin = () => page.evaluate(() => !document.getElementById('sessionModal').classList.contains('open') && localStorage.getItem('SESSION_CODE') && localStorage.getItem('SESSION_PLAYER') === 'Bot Uno');
    // Todo lo que se pide (la página y el service worker)
    const pedidas = [];
    ctx.on('request', r => pedidas.push({ url: r.url(), sw: !!r.serviceWorker() }));

    // ── 1. Abrir la app y quedarse en la Shits League: nada de Rush ──
    await page.goto(URL_APP, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('panel-inicio')?.children.length > 0, null, { timeout: 60000 });
    const instalada = await esperarRegistro(page, r => r.activo && !r.instalando && !r.esperando);
    await page.click('.tab[data-tab="rush"]');
    await page.waitForSelector('#rushJugar:not([disabled])', { timeout: 15000 });
    await dormir(3000);
    await foto('1-portada');
    const e1 = await estado(page);
    check(instalada && e1?.completa === true, 'la Shits League normal queda instalada entera (service worker)');
    check(pedidas.some(p => p.sw && p.url.endsWith('/assets/icon-512.png')), 'se ven las peticiones del service worker (las de su descarga cuentan)');
    const rush1 = pedidas.filter(p => deRush(p.url));
    check(!rush1.length, `abrir la app y mirar la portada de Rush sin pulsar JUGAR: ninguna petición de Rush (${rush1.length}${rush1.length ? `: ${rush1.slice(0, 3).map(p => p.url.replace(/^https?:\/\/[^/]+/, '')).join(', ')}` : ''})`);
    check(e1?.rush?.lista === false, 'Rush aún sin descargar');
    check(await page.$eval('#rushEstado', e => e.hidden), 'la portada, sin estado de la liga (aún no se ha entrado nunca)');

    // ── 2. JUGAR por primera vez: descarga con el porcentaje y entra sola ──
    const j1 = await jugar(page);
    check(j1.vista && j1.pcts.length >= 3 && j1.pcts.every((p, i) => i === 0 || p >= j1.pcts[i - 1]) && j1.pcts.at(-1) >= 80,
      `JUGAR la primera vez: «Descargando Shits League Rush…» con el porcentaje real (${j1.pcts.slice(0, 4).join(', ')} … ${j1.pcts.at(-1)} %)`);
    check(j1.dentro, 'y al terminar entra sola en Rush');
    check((await estado(page))?.rush?.lista === true, 'Rush queda guardado');
    await salirDeRush(page);
    check(!await page.$eval('#rushEstado', e => e.hidden), 'al salir, la portada con el estado que guardó Rush');

    // ── 3. Ya descargado: JUGAR entra directo, todo de la caché ──
    const deRed = [];
    const mirar = r => { const u = new URL(r.url()); if (u.host === 'localhost:3000' && !/\/(sw|precarga)\.js$/.test(u.pathname) && !r.fromServiceWorker()) deRed.push(u.pathname); };
    page.on('response', mirar);
    await page.goto(`${URL_APP}#rush`, { waitUntil: 'load' });
    await page.waitForSelector('#rushJugar:not([disabled])', { timeout: 30000 });
    const j2 = await jugar(page);
    check(!j2.vista && j2.dentro, 'ya descargado: JUGAR entra directo, sin pantalla de descarga');
    check(!deRed.length, `la web (Shits League y Rush) sale entera de la caché (${deRed.length} archivos de la red${deRed.length ? `: ${deRed.slice(0, 3).join(', ')}` : ''})`);
    page.off('response', mirar);
    await salirDeRush(page);

    // ── 4. Sin conexión ──
    red.offline = true;
    await page.reload({ waitUntil: 'load' }).catch(() => {});
    const offline = await page.waitForSelector('#rushJugar', { timeout: 15000 }).then(() => true, () => false);
    await foto('2-sin-conexion');
    check(offline, 'sin conexión: la app arranca igual (desde la caché)');
    red.offline = false;
    check(await sinLogin(), 'el login sigue (no se pide el código)');

    // ── 5. Versión nueva: en segundo plano, sin avisar, y se aplica al abrir ──
    await page.goto(URL_APP, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('panel-inicio')?.children.length > 0, null, { timeout: 30000 });
    publicar('f00000000001', { rush: true });
    const bajadas = [];
    const contar = r => { const u = new URL(r.url()); if (u.host === 'localhost:3000' && !/\/(sw|precarga)\.js$/.test(u.pathname) && r.serviceWorker()) bajadas.push(u.pathname); };
    ctx.on('request', contar);
    const cargasAntes = cargas;
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    const espera = await esperarRegistro(page, r => r.esperando && !r.instalando);
    await dormir(1000);
    check(espera, 'la versión nueva se descarga en segundo plano y espera');
    check(!await page.$('#versionNueva') && cargas === cargasAntes, 'sin aviso de «versión nueva» y sin recargar mientras se usa la app');
    check(bajadas.filter(x => x.endsWith('/js/ui.js')).length === 1 && bajadas.filter(x => x.endsWith('/js/slr/ui.js')).length === 1 && bajadas.length === 2,
      `solo lo que ha cambiado, Rush incluido porque ya estaba descargado (${bajadas.join(', ') || 'nada'})`);
    ctx.off('request', contar);
    // La próxima vez que se abre: se aplica sola (una recarga) y JUGAR entra directo
    const cargasAbrir = cargas;
    await page.goto(URL_APP, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('panel-inicio')?.children.length > 0, null, { timeout: 30000 });
    await dormir(4000);
    const e5 = await estado(page);
    // (una recarga como mucho: si la página que se cierra era la única, el navegador ya la aplica al navegar)
    check(e5?.version === 'f00000000001' && cargas - cargasAbrir <= 2, `al abrir la app, la versión nueva se aplica sola (${e5?.version}, ${cargas - cargasAbrir} cargas, sin bucles)`);
    check(!await page.$('#versionNueva'), 'sin preguntar ni avisar');
    await page.click('.tab[data-tab="rush"]');
    const j5 = await jugar(page);
    check(!j5.vista && j5.dentro, 'Rush ya estaba al día: JUGAR entra directo');
    await salirDeRush(page);
    check(await sinLogin(), 'el login sigue tras actualizar');

    // ── 6. Código viejo: una función de Supabase que ya no existe ──
    publicar('f00000000002');
    let fallo = true;
    await ctx.route('**/rest/v1/rpc/slr_rush_inicio', r => {
      if (!fallo) return r.continue();
      fallo = false;
      return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.slr_rush_inicio(token, prueba) in the schema cache' }) });
    });
    await page.evaluate(() => sessionStorage.clear());
    // Lo guardado de Rush vale 15 s: pasado ese rato, al entrar se pide (y falla)
    await dormir(16000);
    const recarga = page.waitForEvent('load', { timeout: 90000 }).then(() => true, () => false);
    await page.$eval('#rushJugar', b => b.click());
    const capa = await page.waitForSelector('#versionActualizando .version-actualizando__giro', { timeout: 15000 }).then(() => true, () => false);
    const texto = await page.$eval('#versionActualizando', e => e.textContent).catch(() => '');
    await foto('3-actualizando');
    const recargo = await recarga;
    let ver = null;
    for (let k = 0; k < 40 && ver !== 'f00000000002'; k++) { ver = (await estado(page))?.version; if (ver !== 'f00000000002') await dormir(500); }
    check(capa && /Actualizando la app/.test(texto) && recargo && ver === 'f00000000002', `función de Supabase que ya no existe: «Actualizando la app…» con la rueda, versión nueva y recarga (${ver})`, JSON.stringify({ capa, texto, recargo, ver }));
    check(await sinLogin(), 'el login sigue tras la actualización forzada');

    // ── 7. …y si la actualización se queda colgada: a los 15 s, mensaje y «Reintentar» ──
    await page.waitForSelector('#rushJugar:not([disabled])', { timeout: 30000 });
    publicar('f00000000003');
    let soltar;
    const colgada = new Promise(r => { soltar = r; });
    red.retener = ruta => (ruta.endsWith('/js/ui.js') ? colgada : null);
    fallo = true;
    await page.evaluate(() => sessionStorage.clear());
    const t7 = Date.now();
    await page.$eval('#rushJugar', b => b.click());
    await page.waitForSelector('#versionActualizando', { timeout: 15000 });
    const boton = await page.waitForSelector('.version-actualizando__reintentar', { timeout: 30000 }).then(() => true, () => false);
    const tarda = Date.now() - t7;
    await foto('4-reintentar');
    check(boton && tarda >= 14000 && tarda < 25000, `se queda colgada: a los ${Math.round(tarda / 1000)} s, mensaje y «Reintentar» (no se queda cargando sin más)`);
    red.retener = null;
    soltar();
    const recarga7 = page.waitForEvent('load', { timeout: 60000 }).then(() => true, () => false);
    await page.click('.version-actualizando__reintentar');
    await recarga7;
    let ver7 = null;
    for (let k = 0; k < 60 && ver7 !== 'f00000000003'; k++) { ver7 = (await estado(page))?.version; if (ver7 !== 'f00000000003') await dormir(500); }
    check(ver7 === 'f00000000003', `«Reintentar» termina la actualización (${ver7})`);
    await ctx.unroute('**/rest/v1/rpc/slr_rush_inicio');
    check(await sinLogin(), 'el login sigue');
    check(!errores.length, 'sin errores en la página', errores.slice(0, 3).join(' | '));
    await ctx.close();
    writeFileSync(PRECARGA, ORIGINAL);

    // ── 8. Versión nueva publicada a mitad de la primera descarga de Rush ──
    if (ancho !== 412) continue;
    console.log('\nversión nueva a mitad de la primera descarga');
    const ctx8 = await contexto(ancho);
    const p8 = await ctx8.newPage();
    const err8 = [];
    p8.on('pageerror', e => err8.push(e.message));
    let cargas8 = 0;
    p8.on('load', () => cargas8++);
    await p8.goto(URL_APP, { waitUntil: 'domcontentloaded' });
    await p8.waitForFunction(() => document.getElementById('panel-inicio')?.children.length > 0, null, { timeout: 60000 });
    await esperarRegistro(p8, r => r.activo && !r.instalando && !r.esperando);
    await p8.click('.tab[data-tab="rush"]');
    await p8.waitForSelector('#rushJugar:not([disabled])', { timeout: 15000 });
    let soltar8;
    const parada = new Promise(r => { soltar8 = r; });
    red.retener = ruta => (ruta.endsWith('/js/slr/partido/vinetas.js') ? parada : null);
    const cargasJugar = cargas8;
    const j8 = jugar(p8);
    await p8.waitForSelector('.rush-descarga', { timeout: 15000 });
    await dormir(2000);
    // Se publica la versión nueva (cambia también Rush) y el navegador la encuentra
    publicar('f00000000004', { rush: true });
    await p8.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    const espera8 = await esperarRegistro(p8, r => r.esperando && !r.instalando, 60000);
    check(espera8, 'la versión nueva se instala y espera (no se mete con la descarga)');
    check(!!await p8.$('.rush-descarga'), 'la descarga en marcha sigue en pantalla, sin cortes');
    red.retener = null;
    soltar8();
    const r8 = await j8;
    check(r8.dentro && cargas8 === cargasJugar, `la descarga termina bien y entra en Rush, sin recargar (${r8.pcts.at(-1)} %)`);
    check((await estado(p8))?.rush?.lista === true, 'la Rush descargada (la de su versión) queda entera');
    await salirDeRush(p8);
    // Próxima vez: la nueva, aplicada sola; una sola recarga, sin bucles
    const cargasAbrir8 = cargas8;
    await p8.goto(URL_APP, { waitUntil: 'load' });
    await p8.waitForFunction(() => document.getElementById('panel-inicio')?.children.length > 0, null, { timeout: 30000 });
    await dormir(6000);
    const e8 = await estado(p8);
    check(e8?.version === 'f00000000004' && cargas8 - cargasAbrir8 <= 2, `al abrir la próxima vez, la nueva se aplica sola (${e8?.version}, ${cargas8 - cargasAbrir8} cargas, sin bucles)`);
    // Rush ya estaba descargado: se pone al día solo, en segundo plano
    let lista8 = false;
    for (let k = 0; k < 120 && !lista8; k++) { lista8 = (await estado(p8))?.rush?.lista === true; if (!lista8) await dormir(500); }
    check(lista8, 'y Rush se pone al día solo en segundo plano (copiando lo que no ha cambiado)');
    await p8.click('.tab[data-tab="rush"]');
    const j8b = await jugar(p8);
    check(!j8b.vista && j8b.dentro, 'JUGAR entra directo en la versión nueva');
    check(!err8.length, 'sin errores en la página', err8.slice(0, 3).join(' | '));
    await ctx8.close();
    writeFileSync(PRECARGA, ORIGINAL);
  }
} catch (e) {
  mal++;
  console.log(`\n  ✖ Error inesperado: ${e.stack ?? e.message}`);
} finally {
  writeFileSync(PRECARGA, ORIGINAL);
  if (red) red.retener = null;
  await navegador?.close();
  await red?.cerrar();
  const b = await rpc('slr_borrar_liga', { token: tk, liga_id: liga.id });
  check(b.ok, 'liga de prueba borrada', b.mensaje);
  await rpc('slr_logout', { token: tk });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
  process.exitCode = mal ? 1 : 0;
}
