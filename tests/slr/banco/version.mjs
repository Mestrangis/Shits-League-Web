// Prueba en el navegador de la app «instalada como un juego» (sw.js + js/version.js):
//   node tests/slr/banco/version.mjs        (servidor en http://localhost:3000; npm install en tests/slr/banco)
// A 360 y 412 px, con red lenta (4G lenta, red-lenta.mjs) y sin conexión:
// · Primera vez: la Shits League normal se ve sin esperar a la descarga; en la pestaña Rush,
//   «Descargando Shits League Rush…» con un porcentaje que sube hasta el 100 % y luego JUGAR.
// · Después, la web sale entera de la caché (ninguna petición de sus archivos a la red) y
//   funciona sin conexión; los módulos de Rush, pedidos de golpe (modulepreload).
// · Versión nueva: se descarga en segundo plano SOLO lo que ha cambiado, sale «Hay una versión
//   nueva · Actualizar» y al tocarlo se aplica y recarga.
// · Una función de Supabase que ya no existe (código guardado viejo): se actualiza y recarga sola.
// · El login nunca se pierde ni se vuelve a pedir el código.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { env, rpc, rpcOk } from '../api-util.mjs';
import { redLenta } from './red-lenta.mjs';

const URL_APP = 'http://localhost:3000/';
const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36';

// Una «versión nueva» de verdad: precarga.js en el disco con otra versión y js/ui.js marcado
// como cambiado (el navegador mira él mismo si hay versión nueva: no pasa por page.route).
// Se deja como estaba al terminar, pase lo que pase.
const PRECARGA = new URL('../../../precarga.js', import.meta.url);
const ORIGINAL = readFileSync(PRECARGA, 'utf8');
const publicar = v => writeFileSync(PRECARGA, ORIGINAL.replace(/"version": "[0-9a-f]{12}"/, `"version": "${v}"`)
  .replace(/\["js\/ui\.js", (\d+), "[0-9a-f]{12}"/, `["js/ui.js", $1, "${v}"`));

const tk = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: tk, nombre: 'Prueba versión (banco)' });
let navegador = null, red = null;
try {
  await rpcOk('slr_unirse_liga', { token: tk, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  red = await redLenta({ rtt: 150, bajada: 1.6e6, subida: 750e3 });
  navegador = await chromium.launch({ args: [`--proxy-server=${red.url}`, '--proxy-bypass-list=<-loopback>'] });

  for (const ancho of (process.env.ANCHOS ?? '360,412').split(',').map(Number)) {
    console.log(`\n${ancho} px`);
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: ancho === 360 ? 740 : 915 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
    await ctx.addInitScript(([codigo]) => {
      try {
        if (!localStorage.getItem('SESSION_CODE')) {
          localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', codigo);
          localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true }));
        }
      } catch { /* */ }
    }, [env.SLR_BOT_UNO_CODIGO]);
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    const foto = async n => { if (SALIDA) await page.screenshot({ path: `${SALIDA}/version-${ancho}-${n}.png` }); };
    const sinLogin = () => page.evaluate(() => !document.getElementById('sessionModal').classList.contains('open') && localStorage.getItem('SESSION_CODE') && localStorage.getItem('SESSION_PLAYER') === 'Bot Uno');

    // ── Primera vez: descarga en segundo plano ──
    await page.goto(`${URL_APP}#rush`, { waitUntil: 'domcontentloaded' });
    const descarga = await page.waitForSelector('.rush-descarga', { timeout: 30000 }).then(() => true, () => false);
    const pcts = [];
    if (descarga) {
      await foto('1-descargando');
      for (let k = 0; k < 400 && await page.$('.rush-descarga'); k++) {
        const t = await page.$eval('.rush-descarga__texto', e => e.textContent).catch(() => '');
        const p = Number(t.match(/^(\d+) %/)?.[1]);
        if (Number.isFinite(p) && p !== pcts.at(-1)) pcts.push(p);
        await dormir(100);
      }
    }
    check(descarga && pcts.length >= 3 && pcts.every((p, i) => i === 0 || p >= pcts[i - 1]) && pcts.at(-1) >= 90,
      `primera vez: «Descargando Shits League Rush…» con el porcentaje real (${pcts.slice(0, 4).join(', ')} … ${pcts.at(-1)} %)`);
    const jugar = await page.waitForSelector('#rushJugar:not([disabled])', { timeout: 30000 }).then(() => true, () => false);
    check(jugar, 'al terminar, la portada con JUGAR');
    await foto('2-lista');
    // La Shits League normal no espera a la descarga: se ve otra pestaña mientras tanto
    const ctx2 = await navegador.newContext({ viewport: { width: ancho, height: 800 }, isMobile: true, userAgent: UA });
    const p2 = await ctx2.newPage();
    await p2.goto(URL_APP, { waitUntil: 'domcontentloaded' });
    const inicio = await p2.waitForFunction(() => document.getElementById('panel-inicio')?.children.length > 0 && performance.now(), null, { timeout: 30000, polling: 50 }).then(h => h.jsonValue()).catch(() => null);
    const enCurso = await p2.evaluate(async () => { const e = await window.SLVersion?.estado(); return e ? !e.lista : null; });
    check(inicio != null && enCurso === true, `la Shits League normal se ve mientras se descarga (inicio a los ${Math.round(inicio ?? 0)} ms, descarga aún en curso)`);
    await ctx2.close();

    // ── Desde la caché ──
    const deRed = [];
    const mirar = r => { const u = new URL(r.url()); if (u.host === 'localhost:3000' && !/\/(sw|precarga)\.js$/.test(u.pathname) && !r.fromServiceWorker()) deRed.push(u.pathname); };
    page.on('response', mirar);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#rushJugar:not([disabled])', { timeout: 30000 });
    await dormir(1500);
    const precarga = await page.evaluate(async () => (await window.SLVersion.estado()));
    const links = await page.$$eval('link[rel="modulepreload"]', ls => ls.length);
    check(precarga.lista && !deRed.length, `después, la web sale entera de la caché (${deRed.length} archivos de la red${deRed.length ? `: ${deRed.slice(0, 3).join(', ')}` : ''})`);
    check(links > 50 && links === precarga.rush?.length, `en la portada, los ${links} módulos de Rush pedidos de golpe (modulepreload)`);
    page.off('response', mirar);
    // JUGAR: Rush se abre
    await page.click('#rushJugar');
    check(await page.waitForSelector('.slr-nav:not([hidden])', { timeout: 30000 }).then(() => true, () => false), 'JUGAR abre Rush');
    await page.click('.slr-barra__salir');
    await dormir(500);

    // ── Sin conexión ──
    red.offline = true;
    await page.reload({ waitUntil: 'load' }).catch(() => {});
    const offline = await page.waitForSelector('#rushJugar', { timeout: 15000 }).then(() => true, () => false);
    await foto('3-sin-conexion');
    check(offline, 'sin conexión: la app arranca igual (desde la caché)');
    red.offline = false;
    check(await sinLogin(), 'el login sigue (no se pide el código)');

    // ── Versión nueva: solo lo que cambia ──
    publicar('f00000000001');
    const bajadas = [];
    const contar = r => { const u = new URL(r.url()); if (u.host === 'localhost:3000' && !/\/(sw|precarga)\.js$/.test(u.pathname)) bajadas.push(u.pathname); };
    ctx.on('request', contar);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    const aviso = await page.waitForSelector('#versionNueva', { timeout: 60000 }).then(() => true, () => false);
    await foto('4-version-nueva');
    check(aviso, '«Hay una versión nueva · Actualizar» al terminar de descargarla');
    check(bajadas.filter(x => x.endsWith('/js/ui.js')).length === 1 && bajadas.length <= 2, `solo se descarga lo que ha cambiado (${bajadas.join(', ') || 'nada'})`);
    ctx.off('request', contar);
    const antes = await page.evaluate(async () => (await window.SLVersion.estado()).lista && navigator.serviceWorker.controller?.scriptURL);
    await Promise.all([page.waitForNavigation({ timeout: 30000 }).catch(() => null), page.click('#versionNueva button')]);
    await page.waitForSelector('#rushJugar', { timeout: 30000 });
    const ver = await page.evaluate(() => new Promise(res => { const c = new MessageChannel(); c.port1.onmessage = e => res(e.data.version); navigator.serviceWorker.controller.postMessage({ tipo: 'estado' }, [c.port2]); }));
    check(antes && ver === 'f00000000001', `«Actualizar» aplica la versión nueva y recarga (${ver})`);
    check(await sinLogin(), 'el login sigue tras actualizar');

    // ── Código viejo: una función de Supabase que ya no existe ──
    publicar('f00000000002');
    let fallo = true;
    await ctx.route('**/rest/v1/rpc/slr_rush_inicio', r => {
      if (!fallo) return r.continue();
      fallo = false;
      return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.slr_rush_inicio(token, prueba) in the schema cache' }) });
    });
    await page.evaluate(() => sessionStorage.removeItem('SL_ACTUALIZACION_FORZADA'));
    // Lo guardado de Rush vale 15 s: pasado ese rato, al entrar se pide (y falla)
    await dormir(16000);
    // Una recarga de verdad (no el pushState de Rush al abrirse)
    const recarga = page.waitForEvent('load', { timeout: 90000 }).then(() => true, () => false);
    await page.click('#rushJugar');
    const capa = await page.waitForSelector('#versionActualizando', { timeout: 15000 }).then(() => true, () => false);
    await foto('5-actualizando');
    const recargo = await recarga;
    await page.waitForSelector('#rushJugar', { timeout: 30000 }).catch(() => {});
    let ver2 = null;
    for (let k = 0; k < 40 && ver2 !== 'f00000000002'; k++) {
      ver2 = await page.evaluate(() => new Promise(res => { const c = new MessageChannel(); c.port1.onmessage = e => res(e.data.version); navigator.serviceWorker.controller?.postMessage({ tipo: 'estado' }, [c.port2]); setTimeout(() => res(null), 2000); })).catch(() => null);
      if (ver2 !== 'f00000000002') await dormir(500);
    }
    check(capa && recargo && ver2 === 'f00000000002', `función de Supabase que ya no existe: «Actualizando…», versión nueva y recarga (${ver2})`, JSON.stringify({ capa, recargo, ver2 }));
    check(await sinLogin(), 'el login sigue tras la actualización forzada');
    await ctx.unroute('**/rest/v1/rpc/slr_rush_inicio');
    writeFileSync(PRECARGA, ORIGINAL);
    check(!errores.length, 'sin errores en la página', errores.slice(0, 3).join(' | '));
    await ctx.close();
  }
} catch (e) {
  mal++;
  console.log(`\n  ✖ Error inesperado: ${e.stack ?? e.message}`);
} finally {
  writeFileSync(PRECARGA, ORIGINAL);
  await navegador?.close();
  await red?.cerrar();
  const b = await rpc('slr_borrar_liga', { token: tk, liga_id: liga.id });
  check(b.ok, 'liga de prueba borrada', b.mensaje);
  await rpc('slr_logout', { token: tk });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
  process.exitCode = mal ? 1 : 0;
}
