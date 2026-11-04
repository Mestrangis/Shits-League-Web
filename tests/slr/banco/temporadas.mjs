// Prueba en el navegador de las temporadas: antes y después del pistoletazo, beta, no beta y sin
// sesión, la 26/27 vacía, el archivo 24/26, que nada se mezcle y deslizar en cada una.
//   node tests/slr/banco/temporadas.mjs   (servidor en http://localhost:3000; npm install en tests/slr/banco)
// A 360 y 412 px. Hojas de mentira, una por temporada, y el Apps Script de verdad encima; el ajuste
// y el login de Supabase también son de mentira: ni la hoja real ni el ajuste real se tocan.
// Al final, con Supabase de verdad y una liga de prueba: el botón del Modo pruebas (un bot no puede usarlo).
import { chromium } from 'playwright';
import { env, rpc, rpcOk } from '../api-util.mjs';
import { crearGas, fila, dia, CAB_JUGADORES, CAB_JORNADAS, CAB_VOTACIONES, CAB_MVPS } from '../gas-falso.mjs';

const URL_APP = 'http://localhost:3000/';
const SALIDA = process.env.SALIDA;
const H2426 = '1EHGrFt2Y3QDCOdSV3fVgWvspzXYcir4SmDxOezdSLRY', H2627 = 'HOJA-DE-PRUEBA-2627';
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det !== '' ? ` → ${det}` : ''}`); };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

const fichas = nombres => [CAB_JUGADORES, ...nombres.map(n => fila(CAB_JUGADORES, { nombre: n, rating: 80, pos: 'MC', bandera: '🏳️', alias: n === 'Markis' ? 'Marcos' : '' }))];
const partido = (numero, fecha, extra = {}) => fila(CAB_JORNADAS, { numero, fecha, local: 'Markis', visitante: 'Enzo', goles_local: 2, goles_visitante: 1,
  jugadores_local: 'Markis, Nico', jugadores_visitante: 'Enzo, Pablín', goleadores: 'Nico:2,Enzo:1', amistoso: 'FALSE', ...extra });
const votacion = (id, desfase, lugar) => fila(CAB_VOTACIONES, { id, fecha: dia(desfase), hora: '20:00', lugar });

// La 24/26: Nico, 2 goles en cada uno de sus 2 partidos, MVP de la J1. La J2, abierta si está en curso.
const hoja2426 = () => ({
  Jugadores: fichas(['Markis', 'Nico', 'Enzo', 'Pablín']),
  Jornadas: [CAB_JORNADAS, partido(1, dia(-60), { mvp: 'Nico' }), partido(2, dia(-30))],
  Votaciones: [CAB_VOTACIONES, votacion('1', 5, 'Campo viejo')],
  MVPs: [CAB_MVPS, fila(CAB_MVPS, { fecha_partido: dia(-30), jornada: 2, votante: 'Enzo', voto_1: 'Nico', puntos_1: 3 })],
});
// La 26/27 con datos: otros jugadores y otro goleador, J1 repetida. Enzo, MVP de esta.
const hoja2627 = () => ({
  Jugadores: fichas(['Markis', 'Enzo', 'Lucas']),
  Jornadas: [CAB_JORNADAS, partido(1, dia(-2), { jugadores_local: 'Markis, Lucas', jugadores_visitante: 'Enzo', goleadores: 'Lucas:5', mvp: 'Enzo', goles_local: 5, goles_visitante: 0 })],
  Votaciones: [CAB_VOTACIONES, votacion('1', 8, 'Campo nuevo')],
  MVPs: [CAB_MVPS],
});
const vacia = () => ({});

async function abrir(navegador, ancho, { sesion = null, acceso = null, enCurso = '24-26', nueva = hoja2627(), vieja = hoja2426(), conHoja = true, hash = '', guardado = null } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: 760 }, hasTouch: true, isMobile: true, serviceWorkers: 'block', deviceScaleFactor: 2 });
  const gas = crearGas(vieja, { otra: { id: H2627, hojas: nueva }, enCurso });
  const red = { hojasPedidas: [], enCurso, accesoLogin: acceso, retrasoHoja: {} };
  await ctx.addInitScript(([s, a, g]) => {
    if (sessionStorage.getItem('__listo')) return;
    sessionStorage.setItem('__listo', '1');
    if (s) {
      localStorage.setItem('SESSION_PLAYER', s); localStorage.setItem('SESSION_CODE', 'prueba');
      if (a !== null) localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: s, acceso: a }));
    }
    if (g) localStorage.setItem('SL_TEMPORADA_EN_CURSO', g);
  }, [sesion, acceso, guardado]);
  // La 26/27 con su ID de prueba (o sin ID), sin tocar el archivo: la hoja real ni se pide
  await ctx.route('**/js/temporadas.js*', async r => {
    const res = await r.fetch();
    const cuerpo = await res.text();
    r.fulfill({ response: res, body: cuerpo.replace(/hoja: '[^']*', rush: true/, `hoja: '${conHoja ? H2627 : ''}', rush: true`) });
  });
  await ctx.route('**/sheets.googleapis.com/**', async r => {
    const [, id, hoja] = decodeURIComponent(new URL(r.request().url()).pathname).match(/spreadsheets\/([^/]+)\/values\/(.+)$/);
    red.hojasPedidas.push(id);
    if (red.retrasoHoja[id]) await dormir(red.retrasoHoja[id]);
    const libro = id === H2627 ? nueva : vieja;
    if (!libro[hoja]) return r.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: '{"error":{"code":400}}' });
    r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ values: libro[hoja] }) });
  });
  await ctx.route('**/www.googleapis.com/calendar/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '{"items":[]}' }));
  await ctx.route('**/res.cloudinary.com/**', r => r.abort());
  await ctx.route('**/onesignal.com/**', r => r.abort());
  await ctx.route('**/*.supabase.co/**', r => {
    const u = r.request().url();
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: CORS });
    if (u.includes('/rest/v1/ajustes')) return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ valor: red.enCurso }]) });
    if (u.includes('/rpc/slr_login')) return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ token: 'tk', usuario: { nombre: red.nombreLogin }, tiene_acceso: red.accesoLogin }) });
    r.abort();
  });
  await ctx.route('**/script.google.com/**', r => {
    gas.estado.enCurso = red.enCurso;
    r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(gas.post(r.request().postData())) });
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.goto(URL_APP + hash, { waitUntil: 'load' });
  await listo(page);
  const cdp = await ctx.newCDPSession(page);
  const toque = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const deslizar = async (hasta, y = 400) => {
    const x = hasta > 0 ? 40 : ancho - 40;
    await toque('touchStart', x, y);
    for (let i = 1; i <= 8; i++) { await toque('touchMove', x + hasta * i / 8, y); await dormir(25); }
    await toque('touchEnd');
    await page.waitForFunction(() => !document.body.classList.contains('asentando'));
    await dormir(40);
  };
  const foto = async n => { if (SALIDA) await page.screenshot({ path: `${SALIDA}/temporadas-${ancho}-${n}.png` }); };
  return { ctx, page, red, gas, nueva, vieja, errores, deslizar, foto };
}
const listo = page => page.waitForFunction(() => STATE.ultimaCarga > 0 && !mvpLeyendo && !recargaEnCurso, null, { timeout: 15000 });
const temporada = page => page.evaluate(() => STATE.season);
const activa = page => page.evaluate(() => STATE.activeTab);
const nav = page => page.$$eval('.tab:not([hidden])', t => t.map(x => x.dataset.tab).join());
const selector = async page => { await page.$eval('#seasonToggle', t => t.click()); const r = await page.$$eval('.season-dropdown__item', b => b.map(x => x.dataset.season).join()); await page.$eval('body', b => b.click()); return r; };
const elegir = async (page, id) => { await page.$eval('#seasonToggle', t => t.click()); await page.$eval(`.season-dropdown__item[data-season="${id}"]`, b => b.click()); await dormir(30); };
const irTab = async (page, tab) => { await page.$eval(`.tab[data-tab="${tab}"]`, t => t.click()); await page.waitForFunction(() => !document.body.classList.contains('asentando')); await page.waitForFunction(() => !mvpLeyendo); };
const texto = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const sinScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const NAV_ANTES = 'inicio,votacion,mvp,resumen,clasificacion,goleadores,asistentes,plantilla';

const navegador = await chromium.launch();
let ligaPrueba = null, tkBot = null;
try {
  for (const ancho of [360, 412]) {
    console.log(`\n== ${ancho} px`);

    /* ── Antes del pistoletazo, sin sesión ───────────────────────────────── */
    {
      const { ctx, page, red, errores, foto } = await abrir(navegador, ancho);
      check(await temporada(page) === '24-26', 'antes: por defecto la 24/26');
      check((await page.$eval('#seasonLabel', l => l.textContent)).includes('24/26'), 'con su etiqueta bien (no «25/26»)');
      check(await page.evaluate(() => { const r = document.getElementById('seasonToggle').getBoundingClientRect(); return r.right <= innerWidth; }) && await sinScroll(page), 'la cabecera cabe, con la temporada a la vista');
      check(await nav(page) === NAV_ANTES, 'todas las pestañas, sin Rush', await nav(page));
      check(await activa(page) === 'inicio', 'abre en Inicio');
      check(await selector(page) === '26-27,24-26,23-24', 'sin sesión, la 26/27 sale en el selector', await selector(page));
      await foto('1-antes');
      await elegir(page, '26-27');
      await page.waitForSelector('#sessionModal.open');
      check(await temporada(page) === '24-26', 'al elegirla se pide el código, sin abrirla');
      check(!red.hojasPedidas.includes(H2627), 'y su hoja ni se ha pedido');
      // Entra alguien sin beta
      red.nombreLogin = 'Hugo'; red.accesoLogin = false;
      await page.evaluate(() => { setSessionCode('x'); setSessionPlayer('Hugo'); closeModal('sessionModal'); });
      await page.waitForFunction(() => document.getElementById('avisoApp')?.classList.contains('visible'));
      check((await texto(page, '#avisoApp')).includes('no está disponible'), 'sin beta: avisa');
      check(await temporada(page) === '24-26' && await selector(page) === '24-26,23-24', 'y la 26/27 desaparece del selector');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();

      // Entra alguien con beta
      const b = await abrir(navegador, ancho);
      await elegir(b.page, '26-27');
      await b.page.waitForSelector('#sessionModal.open');
      b.red.nombreLogin = 'Marcos'; b.red.accesoLogin = true;
      await b.page.evaluate(() => { setSessionCode('x'); setSessionPlayer('Marcos'); closeModal('sessionModal'); });
      await b.page.waitForFunction(() => STATE.season === '26-27');
      await listo(b.page);
      check((await nav(b.page)).startsWith('rush,inicio,'), 'con beta: se abre la que pidió, con Rush', await nav(b.page));
      check(b.errores.length === 0, 'sin errores', b.errores.join());
      await b.ctx.close();
    }

    /* ── Antes, no beta con sesión ───────────────────────────────────────── */
    {
      const { ctx, page, red, errores } = await abrir(navegador, ancho, { sesion: 'Hugo', acceso: false, hash: '#rush' });
      check(await selector(page) === '24-26,23-24', 'no beta: no existe en el selector');
      check(await temporada(page) === '24-26', 'ni un enlace a Rush lleva a ella');
      check(!(await nav(page)).includes('rush'), 'ni hay Rush');
      check(!red.hojasPedidas.includes(H2627), 'ni se pide su hoja');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── Antes, beta: nada se mezcla y se desliza a la portada de Rush ────── */
    {
      const { ctx, page, red, gas, nueva, vieja, errores, deslizar, foto } = await abrir(navegador, ancho, { sesion: 'Marcos', acceso: true });
      check(await temporada(page) === '24-26' && !(await nav(page)).includes('rush'), 'beta: por defecto la 24/26, sin Rush');
      check(await selector(page) === '26-27,24-26,23-24', 've la 26/27');
      await irTab(page, 'goleadores');
      check((await texto(page, '#panel-goleadores')).includes('Nico'), '24/26: el goleador de su hoja');

      await elegir(page, '26-27');
      await listo(page);
      check(await temporada(page) === '26-27', 'se abre la 26/27');
      check((await nav(page)).startsWith('rush,inicio,votacion,'), 'con todo y Rush', await nav(page));
      check(await activa(page) === 'inicio', 'en Inicio');
      check((await page.$eval('#seasonLabel', l => l.textContent)).includes('26/27'), 'y la etiqueta cambia');
      await irTab(page, 'goleadores');
      const gol = await texto(page, '#panel-goleadores');
      check(gol.includes('Lucas') && !gol.includes('Nico'), 'goleadores de SU hoja, sin los de la otra', gol);
      await irTab(page, 'clasificacion');
      const cl = await texto(page, '#panel-clasificacion');
      check(cl.includes('Lucas') && !cl.includes('Pablín'), 'clasificación de SU hoja', cl);
      const stats = await page.evaluate(() => Object.fromEntries(STATE.jugadores.map(j => [j.nombre, j.stats])));
      check(stats.Enzo.mvp === 1 && stats.Markis.mvp === 0 && !stats.Nico, 'veces MVP de SU hoja', JSON.stringify(stats));
      await page.evaluate(() => openModalJugador('Enzo'));
      await page.waitForSelector('#playerModal.open');
      const ficha = await page.$$eval('#playerModalBox .player-modal__stat', s => s.map(x => x.textContent.replace(/\s+/g, '')));
      check(ficha.includes('1MVPs') && ficha.includes('1Partidos'), 'la ficha, con lo de esta temporada', ficha.join());
      await page.evaluate(() => closeModal('playerModal'));

      // Partidos y MVP escriben en SU hoja
      await irTab(page, 'votacion');
      check(await texto(page, '#panel-votacion .voto-card__lugar') === 'Campo nuevo', 'Partidos de SU hoja');
      await page.$eval('#panel-votacion .voto-btn--si', b => b.click());
      await page.waitForFunction(() => STATE.votaciones[0].jugadores_si.includes('Marcos'));
      await dormir(300);
      const colSi = CAB_VOTACIONES.indexOf('jugadores_si');
      check(nueva.Votaciones[1][colSi] === 'Marcos' && vieja.Votaciones[1][colSi] === '', 'el voto va a la hoja de la 26/27, no a la otra', `${nueva.Votaciones[1][colSi]} / ${vieja.Votaciones[1][colSi]}`);

      // Deslizar hasta la portada de Rush: se ve, sin entrar en el juego
      await irTab(page, 'inicio');
      await deslizar(ancho * 0.6, 300);
      check(await activa(page) === 'rush', 'deslizando se llega a la portada de Rush');
      check(await page.$('#rushJugar') !== null && await page.$eval('.pagina[data-pagina="rush"]', p => p.getBoundingClientRect().left === 0), 'con el botón JUGAR');
      check(!await page.$('#slr') && !await page.$eval('html', h => h.classList.contains('slr-abierto')), 'pero sin entrar en el juego');
      await foto('2-portada');
      await deslizar(-ancho * 0.6, 300);
      check(await activa(page) === 'inicio', 'y deslizando se vuelve');

      // Vuelta a la 24/26: lo suyo, sin restos
      await elegir(page, '24-26');
      await listo(page);
      check(!(await nav(page)).includes('rush'), 'de vuelta en la 24/26: sin Rush');
      const de2426 = await page.evaluate(() => Object.keys(Object.fromEntries(STATE.jugadores.map(j => [j.nombre, 1]))).join());
      check(de2426 === 'Markis,Nico,Enzo,Pablín', 'con sus jugadores', de2426);
      await elegir(page, '23-24');
      await page.waitForSelector('#archiveSeason img');
      check(await page.$$eval('#archiveSeason img', i => i.length) === 3, 'la 23/24: el selector ya funciona, sus imágenes');
      check(await page.evaluate(() => document.querySelector('.app-zona').getBoundingClientRect().height) === 0, 'y sin pestañas');
      await elegir(page, '24-26');
      await listo(page);
      check(await page.$eval('#archiveSeason', a => a.hidden), 'y se vuelve de ella');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── Una respuesta tardía de la otra temporada no se mete ─────────────── */
    {
      const { ctx, page, red, errores } = await abrir(navegador, ancho, { sesion: 'Marcos', acceso: true });
      red.retrasoHoja[H2426] = 700;
      await page.evaluate(() => recargarDatos());
      await elegir(page, '26-27');
      await listo(page);
      await dormir(900);
      const j = await page.evaluate(() => STATE.jugadoresBase.map(x => x.nombre).join());
      check(j === 'Markis,Enzo,Lucas', 'lo que llega tarde de la otra temporada se descarta', j);
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── La 26/27 vacía ──────────────────────────────────────────────────── */
    for (const [que, op] of [['sin hoja configurada', { conHoja: false }], ['con la hoja sin pestañas', { nueva: vacia() }],
      ['con las pestañas solo con cabeceras', { nueva: { Jugadores: [CAB_JUGADORES], Jornadas: [CAB_JORNADAS], Votaciones: [CAB_VOTACIONES], MVPs: [CAB_MVPS] } }]]) {
      const { ctx, page, red, errores, foto } = await abrir(navegador, ancho, { sesion: 'Marcos', acceso: true, ...op });
      await elegir(page, '26-27');
      await listo(page);
      check((await nav(page)) === 'rush,inicio,resumen,clasificacion,goleadores,asistentes,mvp,plantilla', `vacía ${que}: sin Partidos y con el resto`, await nav(page));
      check((await texto(page, '.last-match')).includes('La temporada aún no ha empezado'), 'Inicio lo dice');
      check(await page.$('#pendientes') === null, 'sin pendientes');
      for (const tab of ['resumen', 'clasificacion', 'goleadores', 'asistentes', 'plantilla']) {
        await irTab(page, tab);
        check((await texto(page, `#panel-${tab}`)).includes('La temporada aún no ha empezado'), `${tab}: lo dice`, await texto(page, `#panel-${tab}`));
        check(await sinScroll(page), `${tab}: sin scroll lateral`);
      }
      await irTab(page, 'mvp');
      check((await texto(page, '#panel-mvp')).includes('Todavía no hay partidos'), 'MVP: lo dice', await texto(page, '#panel-mvp'));
      if (op.conHoja === false) check(!red.hojasPedidas.includes(''), 'sin hoja, no se pide nada');
      await foto(`3-vacia-${que.length}`);
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── Después del pistoletazo: para todos ─────────────────────────────── */
    for (const [quien, op] of [['sin sesión', {}], ['no beta', { sesion: 'Hugo', acceso: false }], ['beta', { sesion: 'Marcos', acceso: true }]]) {
      const { ctx, page, vieja, errores, deslizar, foto } = await abrir(navegador, ancho, { enCurso: '26-27', ...op });
      check(await temporada(page) === '26-27', `después (${quien}): por defecto la 26/27`);
      check((await nav(page)).startsWith('rush,inicio,'), 'con Rush', await nav(page));
      check(await selector(page) === '26-27,24-26,23-24', 'las tres en el selector');
      await deslizar(ancho * 0.6, 300);
      check(await activa(page) === 'rush' && !await page.$('#slr'), 'se desliza a la portada, sin entrar en el juego');

      await elegir(page, '24-26');
      await listo(page);
      check(await activa(page) === 'clasificacion', 'el archivo abre en Clasificación');
      check(await nav(page) === 'clasificacion,resumen,goleadores,asistentes,plantilla,mvp', 'solo el historial', await nav(page));
      check((await texto(page, '#panel-clasificacion')).includes('TEMPORADA 24/26'), 'con su título');
      check(await page.evaluate(() => { const t = document.querySelector('#tabs').getBoundingClientRect(); return t.top < 80; }), 'sin cabecera: la barra arriba');
      await foto(`4-archivo-${quien.length}`);

      // La J2 estaba por votar y ya no se puede: solo historial
      await irTab(page, 'mvp');
      await page.waitForSelector('.mvp-vista');
      const est = await page.$eval('.mvp-vista', v => v.dataset.estado);
      check(est === 'cerrada', 'MVP: solo historial, sin votación', est);
      check(await page.$('.mvp-reparto') === null, 'ni cartas para votar');
      check((await texto(page, '.mvp-banner')).includes('Nico'), 'con el MVP de esos votos');

      // Deslizar sigue el orden de esta temporada
      await irTab(page, 'clasificacion');
      await deslizar(-ancho * 0.6, 500);
      check(await activa(page) === 'resumen', 'deslizar sigue su orden: de Clasificación a Resumen');
      await deslizar(ancho * 0.6, 500);
      await deslizar(ancho * 0.6, 500);
      check(await activa(page) === 'clasificacion', 'y antes de Clasificación no hay nada');
      await elegir(page, '26-27');
      await listo(page);
      check(await activa(page) === 'inicio' && (await texto(page, '.last-match__team-name')).startsWith('Markis'), 'de vuelta en la 26/27, en Inicio');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── Pendientes en Inicio ────────────────────────────────────────────── */
    {
      const { ctx, page, errores } = await abrir(navegador, ancho, { sesion: 'Marcos', acceso: true });
      check(await texto(page, '.pendientes__nota') === 'Vota si puedes ir a cada partido', 'el texto debajo de «PENDIENTES»');
      const orden = await page.evaluate(() => { const v = e => document.querySelector(e).getBoundingClientRect(); return v('#pendientes .sh').bottom <= v('.pendientes__nota').top + 1 && v('.pendientes__nota').bottom <= v('.pendientes__pila').top + 1; });
      check(orden, 'entre el título y las cartas');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── El pistoletazo y deshacerlo, con la app abierta ─────────────────── */
    {
      const { ctx, page, red, errores } = await abrir(navegador, ancho, { sesion: 'Hugo', acceso: false });
      const volver = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      check(await temporada(page) === '24-26', 'abierta en la 24/26');
      red.enCurso = '26-27';
      await volver();
      await page.waitForFunction(() => STATE.season === '26-27');
      await listo(page);
      check((await nav(page)).startsWith('rush,inicio,'), 'pistoletazo: al volver a la app, ya en la 26/27 y con Rush', await nav(page));
      check(await selector(page) === '26-27,24-26,23-24', 'y ya la ve aunque no sea beta');
      red.enCurso = '24-26';
      await volver();
      await page.waitForFunction(() => STATE.season === '24-26');
      await listo(page);
      check(await nav(page) === NAV_ANTES, 'deshacer: otra vez la 24/26, entera', await nav(page));
      check(await selector(page) === '24-26,23-24', 'y la 26/27 vuelve a no existir para quien no es beta');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();

      // Quien ha elegido otra temporada no se mueve; si deja de poder verla, sí
      const b = await abrir(navegador, ancho, { sesion: 'Marcos', acceso: true });
      await elegir(b.page, '23-24');
      b.red.enCurso = '26-27';
      await b.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await dormir(300);
      check(await temporada(b.page) === '23-24', 'quien está mirando otra temporada no se mueve');
      await b.ctx.close();

      // Lo guardado era de antes y el servidor ya dice otra cosa
      const c = await abrir(navegador, ancho, { guardado: '24-26', enCurso: '26-27' });
      await c.page.waitForFunction(() => STATE.season === '26-27');
      check(true, 'abrir con lo guardado de antes: pasa sola a la 26/27');
      await c.ctx.close();

      // La sesión de un beta se cierra estando dentro de la 26/27
      const d = await abrir(navegador, ancho, { sesion: 'Marcos', acceso: true });
      await elegir(d.page, '26-27');
      await listo(d.page);
      await d.page.evaluate(() => logout());
      await d.page.waitForFunction(() => STATE.season === '24-26');
      check(true, 'cerrar la sesión dentro de la 26/27: vuelve a la 24/26');
      check(d.errores.length === 0, 'sin errores', d.errores.join());
      await d.ctx.close();
    }
  }

  /* ── El botón, con Supabase de verdad: un bot no puede usarlo ───────────── */
  console.log('\n== Modo pruebas');
  {
    tkBot = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
    ligaPrueba = await rpcOk('slr_crear_liga_prueba', { token: tkBot, nombre: 'Prueba temporadas (banco)' });
    await rpcOk('slr_unirse_liga', { token: tkBot, codigo_invitacion: ligaPrueba.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
    const ctx = await navegador.newContext({ viewport: { width: 412, height: 900 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(codigo => {
      if (localStorage.getItem('SESSION_CODE')) return;
      localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', codigo);
      localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true }));
    }, env.SLR_BOT_UNO_CODIGO);
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.goto(`${URL_APP}#rush`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#rushJugar:not([disabled])', { timeout: 120000 });
    check(await page.evaluate(() => STATE.season) === '26-27', 'un enlace a Rush lleva a la temporada que lo tiene');
    await page.click('#rushJugar');
    await page.waitForSelector('.slr', { timeout: 60000 });
    await page.click('.slr-nav__item[data-seccion="perfil"]');
    const boton = await page.waitForSelector('[data-pruebas="empezar-temporada"]', { timeout: 30000 });
    check((await boton.textContent()).includes('🚀 Empezar la temporada 26/27'), 'el botón en el Modo pruebas');
    await boton.click();
    await page.waitForSelector('.slr-confirmar.abierta', { timeout: 5000 });
    check((await page.textContent('.slr-confirmar')).includes('todos'), 'pide confirmación');
    await dormir(400);
    await page.click('.slr-confirmar [data-si]');
    await page.waitForSelector('.slr-toast', { timeout: 20000 });
    check((await page.textContent('.slr-toast')).includes('bots no pueden'), 'el servidor comprueba quién es: un bot no puede', await page.textContent('.slr-toast'));
    const real = await (await fetch(`${await page.evaluate(() => SUPABASE_PUBLICO.url)}/rest/v1/ajustes?clave=eq.temporada_en_curso&select=valor`, { headers: { apikey: await page.evaluate(() => SUPABASE_PUBLICO.key) } })).json();
    check(real[0].valor === '24-26', 'el ajuste real sigue en la 24/26');
    check(errores.length === 0, 'sin errores', errores.join());
    await ctx.close();
  }
} catch (e) {
  check(false, `Error inesperado: ${e.message.split(/\r?\n/)[0]} ${e.stack.split(/\r?\n/).filter(l => l.includes('temporadas.mjs')).join(' ')}`);
} finally {
  await navegador.close();
  if (ligaPrueba) {
    const b = await rpc('slr_borrar_liga', { token: tkBot, liga_id: ligaPrueba.id });
    check(b.ok, 'liga de prueba borrada', b.mensaje);
  }
}
console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
process.exit(mal ? 1 : 0);
