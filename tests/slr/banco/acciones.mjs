// Prueba en el navegador de las acciones de Rush (fase 4 del repaso de rendimiento):
//   node tests/slr/banco/acciones.mjs     (servidor en http://localhost:3000; npm install en tests/slr/banco)
// A 360 y 412 px, con red lenta (4G lenta):
// · El botón pasa AL MOMENTO a «cargando» (desactivado, con su spinner) y un doble toque
//   hace UNA sola acción (pujar, comprar, «Haz hueco», cambiar el nombre).
// · Las que mueven dinero o cartas van con su identificador de intento (slr_con_intento).
// · Si falla, un mensaje claro y el botón vuelve a poder usarse.
import { chromium } from 'playwright';
import { env, rpc, rpcOk, leer } from '../api-util.mjs';
import { redLenta } from './red-lenta.mjs';

const URL_APP = 'http://localhost:3000/';
const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36';

const U = { token: (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token };
const D = { token: (await rpcOk('slr_login', { codigo: env.SLR_BOT_DOS_CODIGO })).token };
const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: 'Prueba acciones (banco)' });
const L = liga.id;
let navegador = null, red = null;
try {
  U.equipo = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  D.equipo = (await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' })).equipo.id;
  await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });
  for (const e of [U, D]) await rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: e.equipo, importe: 60000 });   // de sobra para las dos pasadas (las pujas de la primera reservan dinero)
  await rpcOk('slr_prueba_tareas', { token: U.token, liga_id: L, ahora: new Date().toISOString(), simular: false });   // subastas de hoy
  red = await redLenta({ rtt: 150, bajada: 1.6e6, subida: 750e3 });
  navegador = await chromium.launch({ args: [`--proxy-server=${red.url}`, '--proxy-bypass-list=<-loopback>'] });

  for (const ancho of (process.env.ANCHOS ?? '360,412').split(',').map(Number)) {
    console.log(`\n${ancho} px`);
    // Una carta de Bot Dos en venta (cada pantalla compra la suya)
    // Bot Uno empieza con hueco (la pasada anterior lo deja con 15 para probar «Haz hueco»)
    const mias = (await leer(`cartas?select=id&equipo_id=eq.${U.equipo}`)).datos;
    for (const c of mias.slice(13)) await rpcOk('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: c.id, equipo_id: null });
    // (cartas que no estén ya en venta: la pasada anterior deja alguna)
    const yaEnVenta = new Set((await leer(`ventas?select=carta_id&vendedor_id=eq.${D.equipo}&estado=eq.activa`)).datos.map(v => v.carta_id));
    const deD = (await leer(`cartas?select=id,disenos_carta(valor)&equipo_id=eq.${D.equipo}`)).datos.filter(c => !yaEnVenta.has(c.id));
    const enVenta = deD[0];
    await rpcOk('slr_poner_en_venta', { token: D.token, carta_id: enVenta.id, precio: enVenta.disenos_carta.valor + 30 });
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
    const foto = async n => { if (SALIDA) await page.screenshot({ path: `${SALIDA}/acciones-${ancho}-${n}.png` }); };
    // Peticiones de acciones, y la respuesta frenada (para ver el «cargando»)
    const acciones = [];
    let frenar = 0, fallar = null;
    await ctx.route('**/rest/v1/rpc/*', async r => {
      const n = r.request().url().split('/rpc/')[1];
      if (n === 'slr_con_intento' || n === 'slr_renombrar_equipo') {
        acciones.push({ n, cuerpo: JSON.parse(r.request().postData() ?? '{}') });
        if (frenar) await dormir(frenar);
        if (fallar) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: fallar }) });
      }
      return r.continue();
    });
    // El estado del botón justo después de tocarlo (en el mismo fotograma del toque, y a los 50 ms)
    const tocarYMirar = async sel => {
      await page.$eval(sel, b => { window.__boton = b; b.click(); });
      return page.evaluate(() => new Promise(res => setTimeout(() => {
        const b = window.__boton;
        res({ desactivado: b.disabled, spinner: b.classList.contains('slr-esperando') && getComputedStyle(b, '::after').animationName === 'slr-girar' });
      }, 50)));
    };
    const otraVez = sel => page.$eval(sel, b => { b.click(); b.click(); }).catch(() => {});   // toques de más mientras carga

    await page.goto(`${URL_APP}#rush`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#rushJugar:not([disabled])', { timeout: 180000 });
    await page.click('#rushJugar');
    await page.waitForSelector('.slr-main .slr-pantalla:not(.es-atenuada)', { timeout: 60000 });

    // ── Pujar ──
    await page.click('.slr-nav__item[data-seccion="mercado"]');
    await page.waitForSelector('.slr-main .slr-pantalla[data-seccion="mercado"]:not(.es-atenuada) [data-pujar]', { timeout: 60000 });
    await page.click('[data-pujar]');
    await page.waitForSelector('[data-confirmar-puja]');
    acciones.length = 0;
    frenar = 2000;
    const puja = await tocarYMirar('[data-confirmar-puja]');
    await otraVez('[data-confirmar-puja]');
    await foto('1-pujando');
    await page.waitForSelector('[data-hoja-puja]', { state: 'detached', timeout: 30000 }).catch(() => {});
    frenar = 0;
    check(puja.desactivado && puja.spinner, 'pujar: el botón, al momento, desactivado y con su spinner', JSON.stringify(puja));
    check(acciones.length === 1 && acciones[0].cuerpo.funcion === 'slr_pujar' && /^[0-9a-f-]{36}$/.test(acciones[0].cuerpo.intento),
      `un toque doble: UNA puja, con su intento (${acciones.length} peticiones)`);

    // ── Comprar ──
    await page.click('[data-sub="venta"]');
    await page.waitForSelector('[data-comprar]', { timeout: 30000 });
    await page.click('[data-comprar]');
    await page.waitForSelector('.slr-confirmar [data-si]');
    acciones.length = 0;
    frenar = 2000;
    // (la hoja de confirmar sube con una animación: se pulsa cuando ya está quieta)
    await page.waitForSelector('.slr-confirmar.abierta', { timeout: 5000 });
    await dormir(400);
    await page.click('.slr-confirmar [data-si]');
    await dormir(80);
    const compra = await page.evaluate(() => { const b = document.querySelector('[data-comprar]'); return b ? { desactivado: b.disabled, spinner: b.classList.contains('slr-esperando') } : null; });
    await otraVez('[data-comprar]');
    await foto('2-comprando');
    await page.waitForFunction(() => !document.querySelector('[data-comprar].slr-esperando'), null, { timeout: 30000 }).catch(() => {});
    frenar = 0;
    const duenoAhora = (await leer(`cartas?select=equipo_id&id=eq.${enVenta.id}`)).datos[0].equipo_id;
    check(compra?.desactivado && compra.spinner, 'comprar: tras confirmar, el botón de la carta en «cargando»', JSON.stringify(compra));
    check(acciones.filter(a => a.cuerpo.funcion === 'slr_comprar_venta').length === 1 && duenoAhora === U.equipo, 'una sola compra, con su intento, y la carta es tuya');

    // ── Si falla: mensaje claro y el botón vuelve ──
    await dormir(16000);   // lo guardado del Mercado, viejo: se vuelve a pedir
    await page.click('.slr-nav__item[data-seccion="perfil"]');
    await page.click('.slr-nav__item[data-seccion="mercado"]');
    await page.waitForSelector('.slr-main .slr-pantalla[data-seccion="mercado"]:not(.es-atenuada)', { timeout: 60000 });
    await page.click('[data-sub="subastas"]');
    await page.waitForSelector('[data-pujar]');
    await page.click('[data-pujar]');
    await page.waitForSelector('[data-confirmar-puja]');
    fallar = 'No tienes saldo suficiente para esa puja';
    await page.click('[data-confirmar-puja]');
    const aviso = await page.waitForSelector('.slr-toast--error', { timeout: 15000 }).then(e => e.textContent(), () => '');
    await dormir(300);
    const vuelto = await page.$eval('[data-confirmar-puja]', b => !b.disabled && !b.classList.contains('slr-esperando')).catch(() => false);
    await foto('3-fallo');
    fallar = null;
    check(/saldo suficiente/.test(aviso) && vuelto, `si falla: «${aviso.trim()}» y el botón vuelve a poder usarse`);
    await page.goBack().catch(() => {});

    // ── Cambiar el nombre (no mueve dinero: sin intento, pero con su «cargando») ──
    await page.click('.slr-nav__item[data-seccion="perfil"]');
    await page.waitForSelector('[data-renombrar]', { timeout: 30000 });
    await page.click('[data-renombrar]');
    await page.fill('.slr-hoja input[name="nombre"]', `Bot Uno ${ancho}`);
    acciones.length = 0;
    frenar = 1500;
    const nombre = await tocarYMirar('.slr-hoja button[type="submit"]');
    await otraVez('.slr-hoja button[type="submit"]');
    await page.waitForSelector('.slr-hoja', { state: 'detached', timeout: 30000 }).catch(() => {});
    frenar = 0;
    check(nombre.desactivado && nombre.spinner && acciones.filter(a => a.n === 'slr_renombrar_equipo').length === 1, 'cambiar el nombre: «cargando» al momento y una sola petición');

    // ── «Haz hueco»: llenar hasta 15 y comprar otra ──
    const tengo = (await leer(`cartas?select=id&equipo_id=eq.${U.equipo}`)).datos.length;
    const libres = (await leer(`cartas?select=id&liga_id=eq.${L}&equipo_id=is.null&reservada_por=is.null&limit=40`)).datos;
    for (const c of libres.slice(0, Math.max(0, 15 - tengo))) await rpc('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: c.id, equipo_id: U.equipo });
    const otra = deD[1];
    await rpcOk('slr_poner_en_venta', { token: D.token, carta_id: otra.id, precio: otra.disenos_carta.valor + 30 });
    await page.evaluate(() => import('/js/slr/rush.js').then(r => r.recargar()));
    await page.click('.slr-nav__item[data-seccion="equipo"]');
    await page.click('.slr-nav__item[data-seccion="mercado"]');
    await page.waitForSelector('.slr-main .slr-pantalla[data-seccion="mercado"]:not(.es-atenuada)', { timeout: 60000 });
    await page.click('[data-sub="venta"]');
    await page.waitForSelector('[data-comprar]', { timeout: 30000 });
    await page.click('[data-comprar]');
    await page.waitForSelector('.slr-confirmar [data-si]');
    await page.click('.slr-confirmar [data-si]');
    const hayHueco = await page.waitForSelector('[data-vender-id]', { timeout: 15000 }).then(() => true, () => false);
    if (hayHueco) {
      await page.click('[data-vender-id]');
      await page.waitForSelector('.slr-confirmar [data-si]');
      acciones.length = 0;
      frenar = 2000;
      await page.$eval('[data-vender-id]', b => { window.__vender = b; });
      await page.click('.slr-confirmar [data-si]');
      await dormir(80);
      const hueco = await page.evaluate(() => ({ desactivado: window.__vender.disabled, spinner: window.__vender.classList.contains('slr-esperando') }));
      await foto('4-haz-hueco');
      await page.waitForFunction(() => !window.__vender.isConnected || !window.__vender.classList.contains('slr-esperando'), null, { timeout: 30000 }).catch(() => {});
      frenar = 0;
      check(hueco.desactivado && hueco.spinner && acciones.filter(a => a.cuerpo.funcion === 'slr_vender_banco').length === 1,
        '«Haz hueco»: tras confirmar, la carta que se vende en «cargando», una sola venta y con su intento', JSON.stringify(hueco));
    } else check(false, '«Haz hueco» antes de comprar con 15 cartas');
    check(!errores.length, 'sin errores en la página', errores.slice(0, 3).join(' | '));
    await ctx.close();
  }
} catch (e) {
  mal++;
  console.log(`\n  ✖ Error inesperado: ${e.stack ?? e.message}`);
} finally {
  await navegador?.close();
  await red?.cerrar();
  const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
  check(b.ok, 'liga de prueba borrada', b.mensaje);
  for (const q of [U, D]) await rpc('slr_logout', { token: q.token });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
  process.exitCode = mal ? 1 : 0;
}
