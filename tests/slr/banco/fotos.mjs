// Prueba en el navegador de las fotos de las cartas (fase 2 del repaso de rendimiento):
//   node tests/slr/banco/fotos.mjs        (servidor en http://localhost:3000; npm install en tests/slr/banco)
// A 360 y 412 px, con red lenta (4G lenta) y sin conexión:
// · solo dos tamaños de foto (pequeña en las listas, grande en el detalle);
// · en segundo plano se guardan las propias y después las del rival de la jornada;
// · la segunda vez, las que ya están guardadas salen sin el esqueleto de carga;
// · con el ahorro de datos no se precarga nada;
// · sin conexión, las fotos guardadas se ven.
import { chromium } from 'playwright';
import { env, rpc, rpcOk, leer } from '../api-util.mjs';
import { redLenta } from './red-lenta.mjs';

const URL_APP = 'http://localhost:3000/';
const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36';
const tamano = u => u.match(/,w_(\d+),/)?.[1];
const base = u => u.replace(/\/image\/upload\/[^/]*c_fill[^/]*\//, '/image/upload/');

const tk = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: tk, nombre: 'Prueba fotos (banco)' });
const L = liga.id;
let navegador = null, red = null;
try {
  const U = (await rpcOk('slr_unirse_liga', { token: tk, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  for (let i = 0; i < 3; i++) await rpcOk('slr_admin_anadir_bot', { token: tk, liga_id: L });
  await rpcOk('slr_iniciar_temporada', { token: tk, liga_id: L });
  // Las fotos de las cartas propias y las del rival de la jornada 1
  const imgs = async eq => (await leer(`cartas?select=disenos_carta(imagen_url)&equipo_id=eq.${eq}`)).datos.map(f => f.disenos_carta.imagen_url).filter(Boolean);
  const cal = await rpcOk('slr_calendario', { token: tk, liga_id: L });
  const p1 = cal.jornadas[0].partidos.find(p => [p.local.equipo_id, p.visitante.equipo_id].includes(U));
  const rival = p1.local.equipo_id === U ? p1.visitante.equipo_id : p1.local.equipo_id;
  const propias = await imgs(U), deRival = await imgs(rival);
  red = await redLenta({ rtt: 150, bajada: 1.6e6, subida: 750e3 });
  navegador = await chromium.launch({ args: [`--proxy-server=${red.url}`, '--proxy-bypass-list=<-loopback>'] });

  async function contexto(ancho, { ahorro = false } = {}) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: ancho === 360 ? 740 : 915 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
    await ctx.addInitScript(([codigo, ahorro]) => {
      try {
        localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', codigo);
        localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true }));
      } catch { /* */ }
      if (ahorro) Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g' } });
    }, [env.SLR_BOT_UNO_CODIGO, ahorro]);
    return ctx;
  }
  const entrar = async page => {
    await page.goto(`${URL_APP}#rush`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#rushJugar:not([disabled])', { timeout: 180000 });
    await page.click('#rushJugar');
    await page.waitForSelector('.slr-main .slr-pantalla[data-seccion="equipo"]', { timeout: 120000 });
  };
  const fotosGuardadas = page => page.evaluate(async () => (await (await caches.open('slr-fotos-cartas')).keys()).map(k => k.url));

  for (const ancho of (process.env.ANCHOS ?? '360,412').split(',').map(Number)) {
    console.log(`\n${ancho} px`);
    const ctx = await contexto(ancho);
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('     [error de la página]', e.message));
    page.on('console', m => { if (m.type() === 'error') console.log('     [consola]', m.text().slice(0, 200)); });
    const pedidas = new Set();
    page.on('request', r => { if (r.url().includes('res.cloudinary.com') && r.url().includes('c_fill,ar_5:7')) pedidas.add(r.url()); });
    await entrar(page);
    await page.click('.slr-nav__item[data-seccion="plantilla"]');
    await page.waitForSelector('.slr-main .slr-pantalla[data-seccion="plantilla"] .slr-carta', { timeout: 60000 });
    await dormir(1500);
    if (SALIDA) await page.screenshot({ path: `${SALIDA}/fotos-${ancho}-1-plantilla.png` });
    await page.click('.slr-ficha');
    await page.waitForSelector('.slr-detalle .slr-carta--l img.slr-carta__img[src]', { timeout: 30000 });
    await dormir(2500);
    const tamanos = new Set([...pedidas].map(tamano));
    const porFoto = new Map();
    for (const u of pedidas) porFoto.set(base(u), (porFoto.get(base(u)) ?? 0) + 1);
    check([...tamanos].every(t => t === '400' || t === '1000') && tamanos.has('400') && tamanos.has('1000') && [...porFoto.values()].every(n => n <= 2),
      `solo dos tamaños de foto (${[...tamanos].join(' y ')} px) y como mucho dos descargas por carta`);
    await page.goBack().catch(() => {});

    // En segundo plano: las propias y después las del rival
    let guardadas = [];
    for (let k = 0; k < 120; k++) {
      guardadas = await fotosGuardadas(page);
      if (deRival.every(i => guardadas.some(g => base(g) === i))) break;
      await dormir(1000);
    }
    const iProp = propias.map(i => guardadas.findIndex(g => base(g) === i && tamano(g) === '400'));
    const iRiv = deRival.map(i => guardadas.findIndex(g => base(g) === i && tamano(g) === '400'));
    check(iProp.every(i => i >= 0) && iRiv.every(i => i >= 0), `en segundo plano se guardan las ${propias.length} propias y las ${deRival.length} del rival`);
    check(Math.max(...iProp) < Math.min(...iRiv) || iRiv.every(i => i >= 0 && iProp.length === 0), 'primero las propias y después las del rival');

    // La segunda vez: sin esqueleto
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#rushJugar:not([disabled])', { timeout: 60000 });
    await page.click('#rushJugar');
    await page.waitForSelector('.slr-main .slr-pantalla[data-seccion="equipo"]', { timeout: 60000 });
    await page.click('.slr-nav__item[data-seccion="plantilla"]');
    const sinEsqueleto = await page.waitForFunction(() => {
      const cs = [...document.querySelectorAll('.slr-main .slr-pantalla[data-seccion="plantilla"] .slr-carta--con-imagen')];
      return cs.length ? { total: cs.length, sin: cs.filter(c => !c.classList.contains('con-foto') || !c.classList.contains('sin-fundido')).length } : false;
    }, null, { timeout: 30000, polling: 'raf' }).then(h => h.jsonValue());
    check(sinEsqueleto.sin === 0, `la segunda vez, las ${sinEsqueleto.total} cartas salen directamente, sin esqueleto (${sinEsqueleto.sin} con esqueleto)`);

    // Sin conexión: las guardadas se ven
    red.offline = true;
    await page.click('.slr-nav__item[data-seccion="equipo"]');
    await page.click('.slr-nav__item[data-seccion="plantilla"]');
    await dormir(1500);
    const rotas = await page.$$eval('.slr-main .slr-carta--sin-foto', cs => cs.length);
    if (SALIDA) await page.screenshot({ path: `${SALIDA}/fotos-${ancho}-2-sin-conexion.png` });
    check(rotas === 0, `sin conexión, las fotos guardadas se ven (${rotas} rotas)`);
    red.offline = false;
    await ctx.close();
  }

  // Ahorro de datos: nada en segundo plano (solo lo que se ve)
  console.log('\nAhorro de datos');
  const ctx = await contexto(412, { ahorro: true });
  const page = await ctx.newPage();
  await entrar(page);
  await dormir(8000);
  const guardadas = await fotosGuardadas(page).catch(() => []);
  const delRival = deRival.filter(i => guardadas.some(g => base(g) === i)).length;
  check(delRival === 0, `con el ahorro de datos no se precarga nada (${delRival} fotos del rival guardadas)`);
  await ctx.close();
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
