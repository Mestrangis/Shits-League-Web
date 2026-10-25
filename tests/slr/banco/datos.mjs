// Prueba en el navegador de los datos de cada pantalla (fase 3 del repaso de rendimiento):
//   node tests/slr/banco/datos.mjs        (servidor en http://localhost:3000; npm install en tests/slr/banco)
// A 360 y 412 px, con red lenta (4G lenta) y sin conexión:
// · Entrar: UNA llamada a Supabase (slr_rush_inicio); la primera vez solo la rueda.
// · Al terminar, se piden en segundo plano las otras pestañas: cambiar es instantáneo.
// · De hace menos de 15 s: tal cual, sin pedir nada. Más viejo: lo de la última vez
//   atenuado (sin poder tocarlo) con la rueda en el centro, hasta que llega lo fresco.
// · Lo que llega tarde de una pantalla que ya no se ve no pinta nada.
// · Una acción (cambiar el nombre del equipo) invalida lo guardado.
// · Volver a entrar: lo de la última vez al momento (de IndexedDB) mientras llega lo fresco.
// · Sin conexión: se queda lo de la última vez y se avisa. El login no se toca.
import { chromium } from 'playwright';
import { env, rpc, rpcOk } from '../api-util.mjs';
import { redLenta } from './red-lenta.mjs';

const URL_APP = 'http://localhost:3000/';
const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36';

const tk = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: tk, nombre: 'Prueba datos (banco)' });
const L = liga.id;
let navegador = null, red = null;
try {
  await rpcOk('slr_unirse_liga', { token: tk, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  for (let i = 0; i < 3; i++) await rpcOk('slr_admin_anadir_bot', { token: tk, liga_id: L });
  await rpcOk('slr_iniciar_temporada', { token: tk, liga_id: L });
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
    const foto = async n => { if (SALIDA) await page.screenshot({ path: `${SALIDA}/datos-${ancho}-${n}.png` }); };
    // Llamadas a Supabase (POST de rpc y GET de lecturas), por nombre
    const llamadas = [];
    page.on('request', r => { const u = r.url(); if (u.includes('supabase.co/rest/v1/') && r.method() !== 'OPTIONS') llamadas.push(u.split('/rest/v1/')[1].replace(/^rpc\//, '').split('?')[0]); });
    const contar = nombre => llamadas.filter(x => x === nombre).length;
    // Retraso a voluntad de una función (para ver la rueda y las respuestas tardías)
    const lentas = new Map();
    await ctx.route('**/rest/v1/rpc/*', async r => {
      const n = r.request().url().split('/rpc/')[1];
      if (lentas.has(n)) await dormir(lentas.get(n));
      return r.continue();
    });
    const pantalla = s => `.slr-main .slr-pantalla[data-seccion="${s}"]`;
    const estadoDe = s => page.evaluate(sel => { const c = document.querySelector(sel); return c ? { atenuada: c.classList.contains('es-atenuada'), inerte: c.inert, rueda: document.getElementById('ptrSpinner').classList.contains('visible') } : null; }, pantalla(s));
    const ir = async s => { await page.click(`.slr-nav__item[data-seccion="${s}"]`); };
    const lista = s => page.waitForSelector(`${pantalla(s)}:not(.es-atenuada)`, { timeout: 60000 }).then(() => true, () => false);

    // ── Entrar la primera vez: solo la rueda, y UNA llamada ──
    await page.goto(`${URL_APP}#rush`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#rushJugar:not([disabled])', { timeout: 180000 });
    llamadas.length = 0;
    lentas.set('slr_rush_inicio', 1500);
    await page.click('#rushJugar');
    await page.waitForSelector('.slr', { timeout: 30000 });
    await dormir(400);
    const primera = await page.evaluate(() => ({ rueda: document.getElementById('ptrSpinner').classList.contains('visible'), vacia: !document.querySelector('.slr-main .slr-pantalla') }));
    await foto('1-primera-vez');
    check(primera.rueda && primera.vacia, 'la primera vez, sin nada guardado: solo la rueda');
    check(await lista('equipo'), 'y después, Equipo');
    lentas.delete('slr_rush_inicio');
    const alEntrar = llamadas.filter(x => !['slr_mercado', 'slr_rush_liga', 'slr_movimientos', 'slr_notificaciones'].includes(x));
    check(contar('slr_rush_inicio') === 1 && alEntrar.length === 1, `entrar: una llamada a Supabase (${alEntrar.join(', ')})`);

    // ── Precarga de las otras pestañas ──
    for (let k = 0; k < 40 && !(contar('slr_mercado') && contar('slr_rush_liga') && contar('slr_movimientos')); k++) await dormir(250);
    check(contar('slr_mercado') === 1 && contar('slr_rush_liga') === 1 && contar('slr_movimientos') === 1, 'al terminar, se piden en segundo plano Mercado, Liga y Perfil (una vez cada una)');
    await dormir(3000);   // a que lleguen (si se entra antes, se espera a esa misma petición)
    const antes = llamadas.length;
    for (const s of ['mercado', 'liga', 'perfil', 'plantilla']) {
      const t0 = Date.now();
      await ir(s);
      await lista(s);
      const e = await estadoDe(s);
      check(!e.atenuada && !e.rueda && Date.now() - t0 < 1500, `${s}: al momento, sin rueda (${Date.now() - t0} ms)`);
    }
    check(llamadas.length === antes, `cambiar de pestaña antes de 15 s no pide nada (${llamadas.length - antes} llamadas)`);

    // ── Más de 15 s: lo de la última vez atenuado, con la rueda ──
    await dormir(15500);
    lentas.set('slr_rush_liga', 2500);
    await ir('liga');
    await page.waitForSelector(`${pantalla('liga')}.es-atenuada`, { timeout: 5000 }).catch(() => {});
    const viejo = await estadoDe('liga');
    await foto('2-atenuada');
    // No se puede tocar: el clic en una carta o botón de la pantalla no hace nada
    const tocable = await page.evaluate(sel => { const b = document.querySelector(`${sel} button`); if (!b) return null; const r = b.getBoundingClientRect(); const x = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!x && document.querySelector(sel).contains(x); }, pantalla('liga'));
    check(viejo?.atenuada && viejo.inerte && viejo.rueda && tocable === false, 'de hace más de 15 s: lo de la última vez atenuado, sin poder tocarlo, con la rueda en el centro');
    check(await lista('liga') && !(await estadoDe('liga')).rueda, 'y al llegar lo fresco, la pantalla normal y sin rueda');
    lentas.delete('slr_rush_liga');

    // ── Respuesta tardía: no pinta en otra pantalla ──
    await dormir(15500);
    lentas.set('slr_mercado', 3000);
    await ir('mercado');
    await dormir(300);
    await ir('plantilla');
    await dormir(4000);
    const ahora = await page.evaluate(() => [...document.querySelectorAll('.slr-main .slr-pantalla')].map(c => c.dataset.seccion + (c.classList.contains('es-atenuada') ? ' (atenuada)' : '')));
    check(ahora.length === 1 && ahora[0] === 'plantilla', `la respuesta de Mercado que llega tarde no pinta en Plantilla (${ahora.join(', ')})`);
    check(!(await page.evaluate(() => document.getElementById('ptrSpinner').classList.contains('visible'))), 'ni deja la rueda puesta');
    lentas.delete('slr_mercado');

    // ── Una acción invalida lo guardado ──
    await ir('perfil');
    await lista('perfil');
    await ir('liga');
    await lista('liga');
    const ligaAntes = contar('slr_rush_liga');
    await ir('perfil');
    await lista('perfil');
    await page.click('[data-renombrar]');
    await page.fill('.slr-hoja input[name="nombre"]', `Bot Uno ${ancho}`);
    await page.click('.slr-hoja button[type="submit"]');
    await page.waitForSelector('.slr-hoja', { state: 'detached', timeout: 30000 }).catch(() => {});
    await dormir(800);
    await ir('liga');
    await lista('liga');
    check(contar('slr_rush_liga') > ligaAntes, 'tras una acción (cambiar el nombre del equipo), Liga vuelve a pedirse aunque no hayan pasado 15 s');
    check((await page.textContent(pantalla('liga'))).includes(`Bot Uno ${ancho}`), 'y ya sale el nombre nuevo');

    // ── Volver a entrar: lo de la última vez al momento ──
    await page.click('.slr-barra__salir');
    await page.waitForSelector('#slr', { state: 'detached', timeout: 10000 });
    await dormir(16000);
    lentas.set('slr_rush_inicio', 2000);
    llamadas.length = 0;
    const t0 = Date.now();
    // Rush vuelve a la última pestaña en la que se estaba (Liga)
    await page.click('#rushJugar');
    await page.waitForSelector(pantalla('liga'), { timeout: 10000 });
    const tVer = Date.now() - t0;
    const otraVez = await estadoDe('liga');
    await foto('3-otra-vez');
    check(otraVez.atenuada && otraVez.rueda && tVer < 1500, `al volver a entrar, lo de la última vez al momento (${tVer} ms), atenuado y con la rueda`);
    check(await lista('liga'), 'y luego lo fresco');
    lentas.delete('slr_rush_inicio');

    // ── Sin conexión: se queda lo de la última vez y se avisa ──
    await dormir(15500);
    red.offline = true;
    await ir('mercado');
    await page.waitForSelector('.slr-toast', { timeout: 30000 }).catch(() => {});
    const sinRed = await estadoDe('mercado');
    const aviso = await page.$eval('.slr-toast', e => e.textContent).catch(() => '');
    await foto('4-sin-conexion');
    check(sinRed && !sinRed.atenuada && !sinRed.rueda && /No se pudieron actualizar|conexión/i.test(aviso), `sin conexión: se queda lo de la última vez (ya se puede tocar) y se avisa («${aviso.trim().slice(0, 60)}»)`);
    red.offline = false;
    check(await page.evaluate(() => localStorage.getItem('SESSION_PLAYER') === 'Bot Uno' && !!localStorage.getItem('SESSION_CODE') && !document.getElementById('sessionModal').classList.contains('open')), 'el login sigue (no se pide el código)');
    check(!errores.length, 'sin errores en la página', errores.slice(0, 3).join(' | '));
    await ctx.close();
  }
} catch (e) {
  mal++;
  console.log(`\n  ✖ Error inesperado: ${e.stack ?? e.message}`);
} finally {
  await navegador?.close();
  await red?.cerrar();
  const b = await rpc('slr_borrar_liga', { token: tk, liga_id: L });
  check(b.ok, 'liga de prueba borrada', b.mensaje);
  await rpc('slr_logout', { token: tk });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
  process.exitCode = mal ? 1 : 0;
}
