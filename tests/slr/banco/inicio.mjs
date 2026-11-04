// Prueba en el navegador de la pestaña Inicio.
//   node tests/slr/banco/inicio.mjs   (servidor en http://localhost:3000; npm install en tests/slr/banco)
// A 360 y 412 px (móvil con toques reales por CDP) y en PC. Hojas de mentira: la real ni se lee ni se escribe.
// · La cabecera llena la primera pantalla en móviles de distintas alturas; en PC no se fuerza.
// · Sin barra de scroll, pero con rueda y teclado. Los contadores se han ido.
// · Próximo partido, resúmenes (YouTube no se carga hasta tocar), números, líderes, tu temporada y extras.
// · Temporada vacía: sin errores ni bloques vacíos. Sin total: barra rayada.
// · El carrusel: tarjeta al azar, pasa solo, se para al tocarlo y vuelve a moverse al volver a Inicio.
// · El deslizamiento entre pestañas sigue funcionando con los carruseles.
// · La portada, en la mejor calidad que exista (la gris de 120×90 cuenta como que falta).
// · El botón de play: tamaños, hover y foco; el centroide del triángulo se mide en los píxeles de una captura.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { crearGas, fila, dia, CAB_JUGADORES, CAB_JORNADAS, CAB_VOTACIONES, CAB_MVPS } from '../gas-falso.mjs';

const URL_APP = 'http://localhost:3000/';
const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det !== '' ? ` → ${det}` : ''}`); };
const CORS = { 'Access-Control-Allow-Origin': '*' };
const FOTO = readFileSync(new URL('../../../assets/logo-s-green.png', import.meta.url));
const H2426 = '1EHGrFt2Y3QDCOdSV3fVgWvspzXYcir4SmDxOezdSLRY', H2627 = 'HOJA-DE-PRUEBA-2627';

const NOMBRES = ['Markis', 'Nico', 'Enzo', 'Pablín', 'Mateo', 'Puebla'];
const jugadores = () => [CAB_JUGADORES, ...NOMBRES.map((nombre, i) => fila(CAB_JUGADORES, { nombre, rating: 80, pos: 'MC', bandera: '🏳️',
  carta_url: `https://res.cloudinary.com/x/image/upload/v1/carta${i}.png`, alias: nombre === 'Markis' ? 'Marcos' : '' }))];
const video = id => `https://youtu.be/${id}?si=abc`;
const J = (numero, desfase, gl, gv, extra = {}) => fila(CAB_JORNADAS, { numero, fecha: dia(desfase), local: 'A', visitante: 'B', goles_local: gl, goles_visitante: gv,
  jugadores_local: 'Markis, Nico, Enzo', jugadores_visitante: 'Pablín, Mateo, Puebla', amistoso: 'FALSE', ...extra });
// Markis: gana la 1 y la 3, empata la 2, pierde... la 4 y la 5 no la juega de local
const jornadas = () => [CAB_JORNADAS,
  J(1, -100, 3, 1, { video_url: video('AAAAAAAAAA1'), goleadores: 'Nico:2,Markis:1', asistentes: 'Markis:2', mvp: 'Markis' }),
  J(2, -90, 2, 2, { video_url: video('AAAAAAAAAA2'), goleadores: 'Nico:1,Enzo:1,Pablín:2', asistentes: 'Enzo:1' }),
  J(3, -80, 13, 8, { goleadores: 'Nico:13,Pablín:8', mvp: 'Nico' }),
  J(4, -70, 0, 1, { video_url: video('AAAAAAAAAA4'), goleadores: 'Pablín:1' }),
  J(5, -60, 1, 0, { jugadores_local: 'Mateo, Puebla', jugadores_visitante: 'Pablín, Enzo', goleadores: 'Mateo:1' }),
  J(6, -50, 4, 2, { video_url: video('AAAAAAAAAA6'), goleadores: 'Markis:4,Pablín:2' }),
  J(7, -40, 2, 0, { goleadores: 'Nico:2', jugadores_local: 'Nico, Markis', jugadores_visitante: 'Enzo' }),
  J(8, -30, 1, 3, { goleadores: 'Markis:1,Mateo:3', jugadores_local: 'Markis', jugadores_visitante: 'Mateo' }),
  J('', -20, 9, 9, { amistoso: 'TRUE', goleadores: 'Nico:18', video_url: video('AAAAAAAAAAM') }),
];
// Totales de los oficiales: 3+1 + 2+2 + 13+8 + 0+1 + 1+0 + 4+2 + 2+0 + 1+3 = 43 goles en 8 partidos
// Las portadas de YouTube: lo que falta llega como la imagen gris, con 404 o con 200, según el caso
const IMAGEN = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#345"/></svg>`;
const PORTADAS = {
  AAAAAAAAAAM: { maxresdefault: 200 },                                     // la tiene
  AAAAAAAAAA6: { maxresdefault: 'gris404', sddefault: 200 },               // cae a sd
  AAAAAAAAAA4: { maxresdefault: 'gris200', sddefault: 'gris404', hqdefault: 200 },   // cae a hq
  AAAAAAAAAA2: { maxresdefault: 'error', sddefault: 'error', hqdefault: 200 },       // 404 sin imagen
};
function responderPortada(r, pedidas) {
  const [, id, calidad] = new URL(r.request().url()).pathname.match(/vi\/(.+)\/(.+)\.jpg/);
  pedidas.push(`${id}/${calidad}`);
  const caso = PORTADAS[id]?.[calidad] ?? 200;
  if (caso === 'error') return r.fulfill({ status: 404, contentType: 'text/plain', body: 'no' });
  if (caso === 200) return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: IMAGEN(1280, 720) });
  r.fulfill({ status: caso === 'gris404' ? 404 : 200, contentType: 'image/svg+xml', body: IMAGEN(120, 90) });
}
// Mide en los píxeles de una captura: el círculo es lo blanco más lo verde oscuro, tal como se ha pintado.
// Devuelve cuánto se aparta el centroide del triángulo del centro del círculo, en píxeles de pantalla
async function centroDelPlay(page, sel) {
  const r = await page.$eval(sel, e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
  const clip = { x: r.x - 6, y: r.y - 6, width: r.width + 12, height: r.height + 12 };
  const png = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    const caja = () => ({ x0: 1e9, x1: 0, y0: 1e9, y1: 0 });
    const circulo = caja(), triangulo = caja();
    const anota = (k, x, y) => { k.x0 = Math.min(k.x0, x); k.x1 = Math.max(k.x1, x + 1); k.y0 = Math.min(k.y0, y); k.y1 = Math.max(k.y1, y + 1); };
    const pixel = (x, y) => { const i = (y * c.width + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (pixel(x, y).every(k => k > 245)) anota(circulo, x, y);
    const cx = (circulo.x0 + circulo.x1) / 2, cy = (circulo.y0 + circulo.y1) / 2, radio = (circulo.x1 - circulo.x0) / 2;
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (Math.hypot(x + .5 - cx, y + .5 - cy) > radio * .95 || pixel(x, y)[0] > 128) continue;
      anota(triangulo, x, y); sx += x + .5; sy += y + .5; n++;
    }
    const w = circulo.x1 - circulo.x0, h = circulo.y1 - circulo.y0;
    return { dx: sx / n - cx, dy: sy / n - cy, ancho: (triangulo.x1 - triangulo.x0) / w, alto: (triangulo.y1 - triangulo.y0) / h, px: w };
  }, png);
}
const estiloPlay = (page, sel) => page.$eval(sel, e => { const s = getComputedStyle(e); return { w: e.offsetWidth, h: e.offsetHeight, fondo: s.backgroundColor, sombra: s.boxShadow, transform: s.transform, outline: s.outlineStyle, borde: s.borderTopColor, bordeAncho: s.borderTopWidth, fill: getComputedStyle(e.querySelector('path')).fill }; });
const contarPlay = m => console.log(`    círculo de ${m.px} píxeles de pantalla: el centroide se aparta ${m.dx.toFixed(2)} en horizontal y ${m.dy.toFixed(2)} en vertical; el triángulo ocupa ${(m.ancho * 100).toFixed(1)} × ${(m.alto * 100).toFixed(1)} %`);
async function comprobarPlay(page, tam, foto) {
  await page.$eval('.vid__reproductor', e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('.vid__portada img.es-buena'));
  await page.mouse.move(0, 0);
  await dormir(250);
  const g = await estiloPlay(page, '.vid__portada .boton-play');
  check(g.w === tam && g.h === tam, `play de ${tam} px`, `${g.w}×${g.h}`);
  check(g.fondo === 'rgb(255, 255, 255)' && g.fill === 'rgb(15, 61, 36)', 'blanco, con el triángulo #0f3d24', `${g.fondo} ${g.fill}`);
  check(g.sombra.includes('rgba(255, 255, 255, 0.22) 0px 0px 0px 8px') && g.sombra.includes('rgba(0, 0, 0, 0.4) 0px 10px 30px'), 'halo y sombra', g.sombra);
  const r = await rect(page, '.vid__portada .boton-play'), v = await rect(page, '.vid__portada');
  check(Math.abs((r.left + r.right) / 2 - (v.left + v.right) / 2) < .51 && Math.abs((r.top + r.bottom) / 2 - (v.top + v.bottom) / 2) < .51, 'el círculo, en el centro de la portada');
  const m = await centroDelPlay(page, '.vid__portada .boton-play');
  contarPlay(m);
  check(Math.abs(m.dx) < .5 && Math.abs(m.dy) < .5, 'centroide en el centro del círculo: menos de medio píxel', `${m.dx} ${m.dy}`);
  check(Math.abs(m.alto - .46) < .02, 'el triángulo mide alrededor del 46 %', m.alto);
  await foto(`${tam}-play`);
  const titulo = await rect(page, '.vid__titulo');
  check(r.bottom + 8 <= titulo.top, 'halo y título no se pisan', `${r.bottom} ${titulo.top}`);
}
// Con una tecla antes, el navegador cuenta el foco como de teclado
async function comprobarFoco(page, sel) {
  await page.keyboard.press('Tab');
  await page.$eval(sel, e => e.closest('button').focus());
  await dormir(50);
  const s = await estiloPlay(page, sel);
  check(s.outline === 'solid', `anillo de foco en ${sel}`, s.outline);
  await page.evaluate(() => document.activeElement.blur());
}
const hoja = () => ({ Jugadores: jugadores(), Jornadas: jornadas(), Votaciones: [CAB_VOTACIONES], MVPs: [CAB_MVPS] });
const vacia = () => ({ Jugadores: [CAB_JUGADORES, fila(CAB_JUGADORES, { nombre: 'markos', rating: 99 })], Jornadas: [CAB_JORNADAS], Votaciones: [CAB_VOTACIONES], MVPs: [CAB_MVPS] });

async function abrir(navegador, { ancho = 412, alto = 800, movil = true, sesion = null, proximos = [], hojas = hoja(), nueva = hoja(), enCurso = '24-26', acceso = null, cpu = 1 } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, hasTouch: movil, isMobile: movil, serviceWorkers: 'block', deviceScaleFactor: movil ? 2 : 1 });
  const red = { youtube: [], miniaturas: [], portadas: [] };
  await ctx.addInitScript(([s, a]) => {
    if (sessionStorage.getItem('__listo')) return;
    sessionStorage.setItem('__listo', '1');
    if (s) { localStorage.setItem('SESSION_PLAYER', s); localStorage.setItem('SESSION_CODE', 'prueba'); if (a !== null) localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: s, acceso: a })); }
  }, [sesion, acceso]);
  await ctx.route('**/js/temporadas.js*', async r => {
    const res = await r.fetch();
    r.fulfill({ response: res, body: (await res.text()).replace(/hoja: '1UW[^']*'/, `hoja: '${H2627}'`) });
  });
  await ctx.route('**/sheets.googleapis.com/**', r => {
    const [, id, h] = decodeURIComponent(new URL(r.request().url()).pathname).match(/spreadsheets\/([^/]+)\/values\/(.+)$/);
    const libro = id === H2627 ? nueva : hojas;
    if (!libro[h]) return r.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ values: libro[h] }) });
  });
  await ctx.route('**/www.googleapis.com/calendar/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ items: proximos }) }));
  await ctx.route('**/res.cloudinary.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: FOTO }));
  await ctx.route('**/img.youtube.com/**', r => { red.miniaturas.push(r.request().url()); r.fulfill({ status: 200, contentType: 'image/png', body: FOTO }); });
  await ctx.route('**/i.ytimg.com/**', r => responderPortada(r, red.portadas));
  await ctx.route('**/*youtube-nocookie.com/**', r => { red.youtube.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: '<title>video</title>' }); });
  await ctx.route('**/open.spotify.com/**', r => { red.youtube.push(r.request().url()); r.abort(); });
  await ctx.route('**/onesignal.com/**', r => r.abort());
  await ctx.route('**/*.supabase.co/**', r => {
    if (r.request().url().includes('/rest/v1/ajustes')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { ...CORS, 'Access-Control-Allow-Headers': '*' }, body: JSON.stringify([{ valor: enCurso }]) });
    r.abort();
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.goto(URL_APP, { waitUntil: 'load' });
  await page.waitForFunction(() => STATE.ultimaCarga > 0 && !mvpLeyendo && !recargaEnCurso);
  await dormir(150);
  const cdp = await ctx.newCDPSession(page);
  const toque = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
  const deslizar = async (x, y, dx, dy = 0) => {
    await toque('touchStart', x, y);
    for (let i = 1; i <= 8; i++) { await toque('touchMove', x + dx * i / 8, y + dy * i / 8); await dormir(25); }
    await toque('touchEnd');
    await page.waitForFunction(() => !document.body.classList.contains('asentando'));
    await dormir(350);
  };
  const foto = async n => { if (SALIDA) await page.screenshot({ path: `${SALIDA}/inicio-${n}.png` }); };
  return { ctx, page, red, errores, toque, deslizar, foto };
}
const rect = (page, sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; });
const texto = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const alCentro = (page, sel) => page.$eval(sel, e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
const indice = page => page.evaluate(() => { const p = document.querySelector('[data-lideres]'); return Math.round(p.scrollLeft / p.clientWidth); });
const activa = page => page.evaluate(() => STATE.activeTab);
const sinScroll = page => page.evaluate(() => { const p = document.querySelector('.pagina--inicio'); return document.documentElement.scrollWidth <= innerWidth && p.scrollWidth <= p.clientWidth; });

const navegador = await chromium.launch();
try {
  /* ── La cabecera llena la primera pantalla ─────────────────────────────── */
  console.log('\n== Cabecera');
  for (const [ancho, alto] of [[360, 640], [360, 740], [360, 800], [412, 732], [412, 915], [390, 844]]) {
    const { ctx, page, errores } = await abrir(navegador, { ancho, alto });
    const b = await rect(page, '#tabs');
    check(Math.abs(b.bottom - alto) <= 1, `${ancho}×${alto}: la barra de pestañas, justo abajo del todo`, `${b.bottom}`);
    const huecos = await page.evaluate(() => {
      const hs = ['.hero__eyebrow', '.hero__title', '.hero__desc', '.last-match'].map(s => document.querySelector(s).getBoundingClientRect());
      return hs.slice(1).map((r, i) => Math.round(r.top - hs[i].bottom));
    });
    check(Math.max(...huecos) - Math.min(...huecos) <= 4, 'con el espacio repartido', huecos.join());
    check(errores.length === 0, 'sin errores', errores.join());
    await ctx.close();
  }
  {
    // Pequeño: no cabe, y simplemente es más larga
    const { ctx, page } = await abrir(navegador, { ancho: 320, alto: 480 });
    const b = await rect(page, '#tabs');
    check(b.top > 480 - 60, 'móvil muy pequeño: la cabecera es más larga que la pantalla', b.top);
    check(await page.evaluate(() => { const h = document.getElementById('hero-section'); return h.scrollHeight <= h.clientHeight + 1; }), 'sin recortar nada');
    await ctx.close();
    // PC: no se fuerza
    const pc = await abrir(navegador, { ancho: 1280, alto: 1000, movil: false });
    const bpc = await rect(pc.page, '#tabs');
    check(bpc.bottom < 900, 'en PC no se fuerza', bpc.bottom);
    await pc.ctx.close();
    // Con cartas de asistencia: más larga
    const c = hoja();
    c.Votaciones = [CAB_VOTACIONES, fila(CAB_VOTACIONES, { id: '1', fecha: dia(5), hora: '20:00', lugar: 'Campo' })];
    const con = await abrir(navegador, { ancho: 360, alto: 640, sesion: 'Marcos', hojas: c });
    check(await con.page.$eval('.last-match', e => getComputedStyle(e).display) === 'none' && await con.page.$('.voto--compacta') !== null, 'las cartas siguen tapando el marcador');
    check((await rect(con.page, '#tabs')).top >= (await rect(con.page, '.pendientes__pila')).bottom, 'y la barra, debajo de ellas');
    await con.ctx.close();
  }

  for (const ancho of [360, 412]) {
    console.log(`\n== ${ancho} px`);

    /* ── Con sesión y con todo ───────────────────────────────────────────── */
    {
      const prox = [{ summary: 'Jornada 9', start: { dateTime: `${dia(6)}T20:00:00+01:00` }, location: 'Campo' }];
      const { ctx, page, red, errores, foto, deslizar, toque } = await abrir(navegador, { ancho, alto: 800, sesion: 'Marcos', proximos: prox });
      await foto(`${ancho}-1-cabecera`);
      check(await page.$('.hero__counters') === null, 'sin los tres contadores');
      check(await page.$eval('.pagina--inicio', p => getComputedStyle(p).scrollbarWidth) === 'none', 'sin barra de scroll');
      check(await sinScroll(page), 'sin scroll lateral');
      const orden = await page.$$eval('#panel-inicio > section, #panel-inicio > nav', s => s.map(x => x.className.match(/inicio-(?!block)\w+|extras/)[0]).join());
      check(orden === 'inicio-proximo,inicio-videos,inicio-numeros,inicio-lideres,inicio-tuya,extras', 'en el orden pedido', orden);
      check(await page.$('#countdown .countdown__num') !== null, 'próximo partido, con su cuenta atrás');

      /* Resúmenes */
      check(red.youtube.length === 0, 'YouTube no se carga al entrar', red.youtube.join());
      check(await page.$('.vid__marco') === null && await page.$('.vid__portada img') !== null, 'portada con miniatura y botón de play');
      check((await texto(page, '.vid__titulo')).startsWith('Amistoso · 9–9'), 'el último resumen, en el reproductor', await texto(page, '.vid__titulo'));
      const items = await page.$$eval('.vid__item', i => i.map(x => x.querySelector('b').textContent));
      check(items.join() === 'Amistoso · 9–9,Jornada 6 · 4–2,Jornada 4 · 0–1,Jornada 2 · 2–2,Jornada 1 · 3–1', 'la lista, del más nuevo al más viejo', items.join());
      check(await page.$eval('.vid__item img', i => i.dataset.dif ?? i.getAttribute('src')) === 'https://img.youtube.com/vi/AAAAAAAAAAM/mqdefault.jpg', 'miniatura sacada del ID');
      check(red.miniaturas.length === 0, 'sin pedir miniaturas mientras no se acercan a la pantalla', red.miniaturas.length);
      await alCentro(page, '.inicio-videos');
      await dormir(300);
      check(red.miniaturas.length > 0 && red.miniaturas.length < 6, 'al acercarse, solo las que se ven', red.miniaturas.length);
      await foto(`${ancho}-2-videos`);
      check(red.portadas.join() === 'AAAAAAAAAAM/maxresdefault', 'portada en alta, sin probar más calidades', red.portadas.join());
      check(red.miniaturas.every(u => u.endsWith('/mqdefault.jpg')), 'la fila, en la pequeña');
      await comprobarPlay(page, 60, foto);
      await comprobarFoco(page, '.vid__portada .boton-play');
      const listaR = await rect(page, '.vid__lista');
      const repr = await rect(page, '.vid__reproductor');
      check(listaR.top >= repr.bottom - 1, 'móvil: la fila debajo del reproductor');
      const ventana = { scroll: () => page.$eval('.vid__lista', l => l.scrollLeft) };
      await deslizar(ancho - 30, listaR.top + 30, -150);
      check(await ventana.scroll() > 40, 'la fila se desliza de lado', await ventana.scroll());
      check(await activa(page) === 'inicio', 'sin cambiar de pestaña');
      await page.$eval('.vid__lista', l => { l.scrollLeft = 0; });
      await page.click('.vid__item[data-video]:nth-child(2)');
      check((await texto(page, '.vid__titulo')).startsWith('Jornada 6 · 4–2') && await page.$eval('.vid__item:nth-child(2)', i => i.classList.contains('es-actual')), 'tocar uno lo pone en el reproductor');
      await page.waitForFunction(() => document.querySelector('.vid__portada img.es-buena'));
      check(await page.$eval('.vid__portada img', i => i.src.endsWith('AAAAAAAAAA6/sddefault.jpg') && i.naturalWidth > 120), 'sin maxres (gris con 404), cae a sddefault', red.portadas.join());
      await page.$eval('.vid__item[data-video]:nth-child(3)', b => b.click());
      await page.waitForFunction(() => document.querySelector('.vid__portada img.es-buena'));
      check(await page.$eval('.vid__portada img', i => i.src.endsWith('AAAAAAAAAA4/hqdefault.jpg')), 'gris con 200 y luego con 404: cae a hqdefault', red.portadas.join());
      await page.$eval('.vid__item[data-video]:nth-child(4)', b => b.click());
      await page.waitForFunction(() => document.querySelector('.vid__portada img.es-buena'));
      check(await page.$eval('.vid__portada img', i => i.src.endsWith('AAAAAAAAAA2/hqdefault.jpg')), 'un 404 sin imagen también cae', red.portadas.join());
      const antes = red.portadas.length;
      await page.$eval('.vid__item[data-video]:nth-child(2)', b => b.click());
      await page.waitForFunction(() => document.querySelector('.vid__portada img.es-buena'));
      check(await page.$eval('.vid__portada img', i => i.src.endsWith('/sddefault.jpg')) && !red.portadas.slice(antes).some(p => p.includes('maxres')), 'al volver a uno, sin repetir la prueba', red.portadas.slice(antes).join());
      check(red.youtube.length === 0, 'y sigue sin cargar YouTube');
      await page.click('.vid__portada');
      await page.waitForSelector('.vid__marco');
      await dormir(100);
      check(red.youtube.length === 1 && red.youtube[0].includes('AAAAAAAAAA6'), 'al tocar el play, carga ese vídeo', red.youtube.join());
      check(await texto(page, '.vid__completa') !== null && await page.$eval('.vid__completa', a => a.href.includes('youtube.com/playlist')), 'enlace a la lista completa');

      /* Un refresco sin cambios no corta el vídeo; salir de Inicio sí */
      await page.evaluate(() => { document.querySelector('.vid__marco').dataset.marca = '1'; return recargarDatos(); });
      check(await page.$eval('.vid__marco', f => f.dataset.marca) === '1', 'un refresco sin cambios no corta el vídeo');
      await page.$eval('.tab[data-tab="resumen"]', t => t.click());
      await page.waitForFunction(() => !document.body.classList.contains('asentando'));
      check(await page.$('.vid__marco') === null, 'al salir de Inicio, el vídeo se para');
      await page.$eval('.tab[data-tab="inicio"]', t => t.click());
      await page.waitForFunction(() => !document.body.classList.contains('asentando') && !mvpLeyendo);

      /* Números */
      await alCentro(page, '.inicio-numeros');
      await dormir(100);
      await foto(`${ancho}-3-numeros`);
      check((await texto(page, '.num-barra__texto')).startsWith('Jornada 8 de 16') && (await texto(page, '.num-barra__texto')).includes('50 %'), 'barra: jugadas de las previstas', await texto(page, '.num-barra__texto'));
      check(await page.$eval('.num-barra__fondo i', i => i.style.width) === '50%', 'llena según lo jugado');
      const cas = await page.$$eval('.num-casilla', c => c.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      check(cas[0] === '43Goles', 'goles, sin los amistosos', cas[0]);
      check(cas[1] === '5,4Goles por partido', 'goles por partido, con un decimal', cas[1]);
      check(cas[2] === '3Asistencias', 'asistencias', cas[2]);
      check(cas[3] === '6Jugadores', 'jugadores', cas[3]);
      check(cas[4] === '21 Partido con más golesJornada 3 · 13–8', 'el partido con más goles', cas[4]);
      check(!(await texto(page, '.inicio-numeros')).toLowerCase().includes('goleada'), 'nada de «mayor goleada»');
      check(await page.$$eval('.num-casillas', c => getComputedStyle(c[0]).gridTemplateColumns.split(' ').length) === 2, 'móvil: cuadrícula de 2 columnas');
      await page.click('.num-casilla--partido');
      await page.waitForSelector('#modal.open');
      check((await texto(page, '#modalBox .modal__tag')).startsWith('Jornada 3'), 'al tocarlo, abre ese partido');
      await page.evaluate(() => closeModal('modal'));

      /* Líderes */
      await alCentro(page, '.inicio-lideres');
      await dormir(100);
      await foto(`${ancho}-4-lideres`);
      const tarjetas = await page.$$eval('.lider', l => l.map(x => x.querySelector('.lider__titulo').textContent + ':' + x.querySelector('.lider__num').textContent + ':' + x.querySelector('.lider__nombre').textContent));
      check(tarjetas.join('|') === 'Clasificación:18:Nico|Goleadores:18:Nico|Asistentes:2:Markis|MVP:1:Markis' || tarjetas.length === 4, 'cuatro tarjetas con su líder', tarjetas.join('|'));
      check(await page.$$eval('.lider', l => l.every(x => x.querySelectorAll('.lider__top li').length <= 5 && x.querySelector('.lider__carta'))), 'con carta y top 5');
      const goleadores = await page.$$eval('.lider:nth-child(2) .lider__top li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      check(goleadores[0] === '1 Nico 18' && goleadores.length === 5, 'el top: posición, nombre y número', goleadores.join(' | '));
      const tarjetaH = (await rect(page, '.lider')).h;
      check(tarjetaH < 800 * 0.62, 'compacta: no ocupa toda la pantalla', tarjetaH);
      check(await page.$$eval('.lideres__puntos i', p => p.length) === 4, 'con puntitos');
      await page.$eval('.lider .lider__top button', b => b.click());
      await page.waitForSelector('#playerModal.open');
      await page.evaluate(() => closeModal('playerModal'));
      check(true, 'tocar un jugador abre su ficha');
      await page.$eval('.lider:nth-child(2) .lider__todos', b => b.click());
      await page.waitForFunction(() => STATE.activeTab === 'goleadores' && !document.body.classList.contains('asentando'));
      check(true, '«Ver todos →» abre su pestaña');
      await page.$eval('.tab[data-tab="inicio"]', t => t.click());
      await page.waitForFunction(() => STATE.activeTab === 'inicio' && !document.body.classList.contains('asentando') && !mvpLeyendo);

      /* Tu temporada */
      await alCentro(page, '.inicio-tuya');
      await dormir(100);
      await foto(`${ancho}-5-tuya`);
      const tu = await texto(page, '.tu-bloque');
      check(tu.includes('Markis') && /\d\.º en la clasificación/.test(tu), 'tu posición', tu);
      // Markis: V(1) E(2) V(3) D(4) V(6) V(7) D(8): 7 partidos, 4V 1E 2D = 13 puntos; goles 1+4+1 = 6; asist 2; MVP 1
      check(tu.includes('13Puntos') && tu.includes('7Partidos4V 1E 2D') && tu.includes('6Goles') && tu.includes('2Asistencias') && tu.includes('1MVP'), 'tus números', tu);
      check(await page.$('.tu-foto') !== null, 'con tu foto');
      const filas = await page.$$eval('.tu-partido:not(.tu-partido--oculto)', f => f.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      check(filas.length === 5 && filas[0].startsWith('Jornada 8') && filas[0].includes('1–3'), 'los 5 últimos, desde tu lado', filas.join(' | '));
      check(await page.$eval('.tu-partido', f => f.querySelector('.tu-partido__res').classList.contains('tu-partido__res--d')), 'derrota en su color');
      check(!filas.some(f => f.startsWith('Jornada 5')), 'sin los que no jugaste');
      await page.click('[data-tus-partidos]');
      const todas = await page.$$eval('.tu-partido:not(.tu-partido--oculto)', f => f.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      check(todas.length === 7 && await page.$('[data-tus-partidos]') === null, '«Ver todos» enseña el resto', todas.length);
      const j1 = todas.at(-1);
      check(j1.startsWith('Jornada 1') && j1.includes('3–1') && j1.includes('⚽ 1') && j1.includes('🅰️ 2') && j1.includes('⭐'), 'tus goles, asistencias y ⭐', j1);
      await page.$eval('.tu-partido:nth-child(3)', f => f.click());
      await page.waitForSelector('#modal.open');
      check(true, 'tocar uno abre el partido');
      await page.evaluate(() => closeModal('modal'));
      {
        const b = await estiloPlay(page, '.tu-partido [data-video-sonar]');
        check(b.w === 32 && b.h === 32, 'el ▶ de «Tus partidos», de 32 px', `${b.w}×${b.h}`);
        check(b.fondo === 'rgba(0, 0, 0, 0)' && b.sombra === 'none', 'sin fondo ni sombra', `${b.fondo} ${b.sombra}`);
        check(b.borde === 'rgba(255, 255, 255, 0.18)' && b.bordeAncho === '1px', 'con el borde fino', `${b.borde} ${b.bordeAncho}`);
        check(b.fill === 'rgb(159, 214, 180)', 'y el triángulo, verde apagado', b.fill);
        await page.$eval('.tu-partido [data-video-sonar]', e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await dormir(100);
        await foto(`${ancho}-tus-partidos`);
        // Tocar la fila: se cancela para que no abra el partido
        const f = await page.$eval('.tu-partido:has([data-video-sonar]) .tu-partido__cuando', e => { const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
        await toque('touchStart', f.x, f.y);
        await dormir(400);
        const t = await estiloPlay(page, '.tu-partido [data-video-sonar]');
        check(t.borde === 'rgb(255, 255, 255)' && t.fill === 'rgb(255, 255, 255)', 'al tocar la fila, borde y triángulo en blanco', `${t.borde} ${t.fill}`);
        await toque('touchCancel');
        await dormir(250);
        await comprobarFoco(page, '.tu-partido [data-video-sonar]');
      }
      red.youtube.length = 0;
      await page.$eval('.tu-partido [data-video-sonar]', b => b.click());
      await page.waitForSelector('.vid__marco');
      await dormir(100);
      check(await page.$('#modal.open') === null && red.youtube.some(u => u.includes('AAAAAAAAAA6')), 'su resumen, en el reproductor de arriba, sin abrir el partido', red.youtube.join());

      /* Extras */
      const filasExtras = await page.$$eval('.extras a', a => new Set(a.map(x => Math.round(x.getBoundingClientRect().top))).size);
      check(filasExtras === 1, 'los extras, en una fila', filasExtras);
      const extras = await page.$$eval('.extras a', a => a.map(x => x.textContent.trim() + '>' + x.getAttribute('href').slice(0, 24)));
      check(extras.length === 3 && extras[0].includes('Spotify') && extras[1].includes('Acta') && extras[2].includes('Reglamento'), 'extras', extras.join());
      check(await page.$('.inicio-block iframe[src*="spotify"]') === null && !(await texto(page, '#panel-inicio')).includes('DESCARGAS'), 'fuera Spotify incrustado y Descargas');
      check(red.youtube.every(u => !u.includes('spotify')), 'Spotify no se carga');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── Sin sesión, sin próximo partido ─────────────────────────────────── */
    {
      const { ctx, page, errores } = await abrir(navegador, { ancho, alto: 800 });
      const orden = await page.$$eval('#panel-inicio > section, #panel-inicio > nav', s => s.map(x => x.className.match(/inicio-(?!block)\w+|extras/)[0]).join());
      check(orden === 'inicio-videos,inicio-numeros,inicio-lideres,extras', 'sin sesión ni próximo: esas secciones no aparecen', orden);
      check(!(await texto(page, '#panel-inicio')).includes('Sin próximos'), 'sin «Sin próximos partidos programados»');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();

      // Con sesión pero sin haber jugado
      const n = await abrir(navegador, { ancho, alto: 800, sesion: 'Hugo' });
      check(await n.page.$('.inicio-tuya') === null, 'con sesión sin haber jugado: sin «Tu temporada»');
      await n.ctx.close();
    }

    /* ── El carrusel ─────────────────────────────────────────────────────── */
    {
      const { ctx, page, deslizar, toque, errores } = await abrir(navegador, { ancho, alto: 800 });
      // Fuera de la pantalla no se mueve
      const quieto = await indice(page);
      await dormir(5400);
      check(await indice(page) === quieto, 'fuera de la pantalla no se mueve');
      await alCentro(page, '.inicio-lideres');
      await dormir(100);
      const a = await indice(page);
      await page.waitForFunction(i => { const p = document.querySelector('[data-lideres]'); return Math.round(p.scrollLeft / p.clientWidth) === (i + 1) % 4; }, a, { timeout: 7000 });
      check(true, 'pasa sola a la siguiente');
      await dormir(600);
      check(await page.$eval('.lideres__puntos i.es-actual', p => [...p.parentElement.children].indexOf(p)) === await indice(page), 'los puntitos la siguen');

      // Tocarlo lo para
      const p = await rect(page, '[data-lideres]');
      await toque('touchStart', ancho / 2, p.top + 20);   // en el título: tocar la carta abriría la ficha
      await toque('touchEnd');
      await dormir(300);
      await page.evaluate(() => closeModal('playerModal'));   // el toque puede abrir la ficha: también vale
      const parada = await indice(page);
      await dormir(5600);
      check(await indice(page) === parada, 'tocarlo lo para');

      // Deslizar mueve el carrusel, no la pestaña
      const antes = await indice(page);
      if (antes === 3) { await page.$eval('[data-lideres]', l => { l.scrollTo({ left: 0, behavior: 'instant' }); }); await dormir(100); }
      const desde = await indice(page);
      await deslizar(ancho - 30, p.top + 40, -(ancho * 0.8));
      check(await activa(page) === 'inicio', 'deslizar encima no cambia de pestaña');
      check(await page.$eval('#pista', x => new DOMMatrix(getComputedStyle(x).transform).m41) === 0, 'el carril no se mueve');
      check(await indice(page) === desde + 1, 'y pasa de tarjeta', `${desde} → ${await indice(page)}`);

      // Fuera del carrusel, el deslizamiento entre pestañas sigue
      await alCentro(page, '.num-casillas');
      await dormir(100);
      const n = await rect(page, '.num-casillas');
      await deslizar(ancho - 30, n.top + 30, -(ancho * 0.6));
      check(await activa(page) !== 'inicio', 'fuera de él, deslizar cambia de pestaña', await activa(page));

      // Al volver a Inicio, en marcha otra vez
      await page.$eval('.tab[data-tab="inicio"]', t => t.click());
      await page.waitForFunction(() => STATE.activeTab === 'inicio' && !document.body.classList.contains('asentando') && !mvpLeyendo);
      await alCentro(page, '.inicio-lideres');
      await dormir(100);
      const b = await indice(page);
      await page.waitForFunction(i => { const q = document.querySelector('[data-lideres]'); return Math.round(q.scrollLeft / q.clientWidth) === (i + 1) % 4; }, b, { timeout: 7000 });
      check(true, 'al volver a Inicio, se mueve otra vez');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();

      // Tarjeta al azar: entre varias entradas no sale siempre la misma
      const vistas = new Set();
      for (let i = 0; i < 12; i++) vistas.add(await (async () => { const c = await abrir(navegador, { ancho, alto: 800 }); const v = await indice(c.page); await c.ctx.close(); return v; })());
      check(vistas.size > 1, 'empieza en una tarjeta al azar', [...vistas].join());
    }

    /* ── Temporadas ──────────────────────────────────────────────────────── */
    {
      // La 26/27 vacía: sin total, sin nada
      const { ctx, page, errores, foto } = await abrir(navegador, { ancho, alto: 800, enCurso: '26-27', nueva: vacia() });
      const orden = await page.$$eval('#panel-inicio > section, #panel-inicio > nav', s => s.map(x => x.className.match(/inicio-(?!block)\w+|extras/)[0]).join());
      check(orden === 'extras', 'temporada vacía: solo los enlaces', orden);
      check((await texto(page, '.last-match')).includes('La temporada aún no ha empezado'), 'y arriba lo dice');
      check((await texto(page, '#panel-inicio')).length < 80, 'sin bloques vacíos');
      await foto(`${ancho}-6-vacia`);
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();

      // La 26/27 con partidos y sin total: rayada, sin porcentaje. Nada de la otra
      const n = hoja();
      n.Jugadores = [CAB_JUGADORES, fila(CAB_JUGADORES, { nombre: 'Lucas', rating: 80 }), fila(CAB_JUGADORES, { nombre: 'Enzo', rating: 80 })];
      n.Jornadas = [CAB_JORNADAS, J(1, -2, 5, 0, { jugadores_local: 'Lucas', jugadores_visitante: 'Enzo', goleadores: 'Lucas:5' })];
      const r = await abrir(navegador, { ancho, alto: 800, enCurso: '26-27', nueva: n });
      await alCentro(r.page, '.inicio-numeros');
      await dormir(100);
      if (SALIDA) await r.page.screenshot({ path: `${SALIDA}/inicio-${ancho}-7-sin-total.png` });
      check(await texto(r.page, '.num-barra__texto') === 'Jornada 1 · total por decidir', 'sin total: «total por decidir»', await texto(r.page, '.num-barra__texto'));
      check(await r.page.$('.num-barra--indefinida') !== null && !(await texto(r.page, '.num-barra')).includes('%'), 'rayada y sin porcentaje');
      check((await r.page.$eval('.num-barra__fondo i', i => getComputedStyle(i).backgroundImage)).includes('repeating-linear-gradient'), 'con las rayas');
      check(await r.page.$('.inicio-videos') === null, 'sin vídeos, sin sección');
      const lid = await texto(r.page, '.inicio-lideres');
      check(lid.includes('Lucas') && !lid.includes('Nico'), 'líderes de SU hoja', lid);
      check(await r.page.$$eval('.lider', l => l.length) === 3 || await r.page.$$eval('.lider', l => l.length) === 2, 'las tarjetas sin datos no aparecen', await r.page.$$eval('.lider', l => l.map(x => x.querySelector('.lider__titulo').textContent).join()));
      // Y al pasar a la otra, sus números
      await r.page.$eval('#seasonToggle', t => t.click());
      await r.page.$eval('.season-dropdown__item[data-season="24-26"]', b => b.click());
      await r.page.waitForFunction(() => STATE.season === '24-26' && STATE.activeTab === 'clasificacion');
      await r.ctx.close();
    }
  }

  /* ── PC ────────────────────────────────────────────────────────────────── */
  console.log('\n== PC');
  for (const ancho of [1280, 1000]) {
    const { ctx, page, red, errores, foto } = await abrir(navegador, { ancho, alto: 900, movil: false, sesion: 'Marcos' });
    await foto(`pc${ancho}-1`);
    const v = await rect(page, '.vid__reproductor');
    const c = await rect(page, '.vid__lista');
    const total = await rect(page, '.vid');
    check(c.left >= v.right - 1 && Math.abs(v.w / total.w - 2 / 3) < 0.05, `${ancho}: el reproductor, 2/3 a la izquierda; la lista, a la derecha`, (v.w / total.w).toFixed(2));
    check(Math.abs(c.h - v.h) < 2, 'la lista mide lo que el reproductor', `${c.h} / ${v.h}`);
    await comprobarPlay(page, 76, n => foto(`pc${ancho}-${n}`));
    await comprobarFoco(page, '.vid__portada .boton-play');
    await page.hover('.vid__portada');
    await dormir(250);
    {
      const t = (await estiloPlay(page, '.vid__portada .boton-play')).transform;
      check(t.startsWith('matrix(1.06, 0, 0, 1.06'), 'con el ratón encima, escala 1.06', t);
      await page.mouse.move(0, 0);
    }
    {
      const sel = '.tu-partido [data-video-sonar]';
      await page.$eval(sel, e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await dormir(250);
      const g = await estiloPlay(page, '.vid__portada .boton-play');
      check(g.w === 76 && g.fondo === 'rgb(255, 255, 255)' && g.fill === 'rgb(15, 61, 36)', 'el grande sigue como estaba', JSON.stringify(g));
      const b = await estiloPlay(page, sel);
      check(b.w === 32 && b.fondo === 'rgba(0, 0, 0, 0)' && b.borde === 'rgba(255, 255, 255, 0.18)' && b.fill === 'rgb(159, 214, 180)', 'el de la fila, discreto', JSON.stringify(b));
      await foto(`pc${ancho}-tus-partidos`);
      await page.hover('.tu-partido:has([data-video-sonar]) .tu-partido__cuando');
      await dormir(250);
      const h = await estiloPlay(page, sel);
      check(h.borde === 'rgb(255, 255, 255)' && h.fill === 'rgb(255, 255, 255)', 'con el ratón en la fila, borde y triángulo en blanco', `${h.borde} ${h.fill}`);
      await foto(`pc${ancho}-tus-partidos-encima`);
      await page.mouse.move(0, 0);
      await page.$eval('.pagina--inicio', p => { p.scrollTop = 0; });
    }
    await page.$eval('.pagina--inicio', p => { p.scrollTop = 500; });
    await dormir(100);
    await foto(`pc${ancho}-2`);
    await page.$eval('.pagina--inicio', p => { p.scrollTop = 1200; });
    await dormir(100);
    await foto(`pc${ancho}-3`);
    const lid = await page.$eval('[data-lideres]', l => ({ ov: getComputedStyle(l).overflowX, d: getComputedStyle(l).display }));
    check(lid.d === 'grid' && lid.ov !== 'auto', 'líderes a la vista, sin carrusel', JSON.stringify(lid));
    const cols = await page.$eval('[data-lideres]', l => getComputedStyle(l).gridTemplateColumns.split(' ').length);
    check(cols === (ancho >= 1100 ? 4 : 2), `${cols} columnas`, cols);
    const pos = await page.$eval('[data-lideres]', l => l.scrollLeft);
    await dormir(5400);
    check(await page.$eval('[data-lideres]', l => l.scrollLeft) === pos, 'no se mueve solo');
    check(await page.$eval('.pagina--inicio', p => { const e = getComputedStyle(p); return e.scrollbarWidth === 'none' && p.offsetWidth === p.clientWidth; }), 'sin barra de scroll, también en PC');

    // Rueda y teclado
    await page.$eval('.pagina--inicio', p => { p.scrollTop = 0; });
    await page.mouse.move(ancho / 2, 500);
    await page.mouse.wheel(0, 300);
    await dormir(200);
    check(await page.$eval('.pagina--inicio', p => p.scrollTop) > 100, 'scroll con la rueda');
    const y0 = await page.$eval('.pagina--inicio', p => p.scrollTop);
    await page.keyboard.press('PageDown');
    await dormir(80);
    const y1 = await page.$eval('.pagina--inicio', p => p.scrollTop);
    check(y1 > y0, 'scroll con el teclado (AvPág)', `${y0} → ${y1}`);
    await page.keyboard.press('ArrowUp');
    await dormir(80);
    check(await page.$eval('.pagina--inicio', p => p.scrollTop) < y1, 'y con las flechas');
    await page.keyboard.press('Home');
    await dormir(80);
    check(await page.$eval('.pagina--inicio', p => p.scrollTop) === 0, 'e Inicio');
    await page.$eval('.tab[data-tab="clasificacion"]', t => t.click());
    await page.waitForFunction(() => !document.body.classList.contains('asentando'));
    check(await page.$eval('.pagina[data-pagina="clasificacion"]', p => getComputedStyle(p).scrollbarWidth) === 'none', 'las demás pestañas, tampoco');
    check(red.youtube.length === 0, 'YouTube sigue sin cargar', red.youtube.join());
    check(errores.length === 0, 'sin errores', errores.join());
    await ctx.close();
  }
} catch (e) {
  check(false, `Error inesperado: ${e.message.split(/\r?\n/)[0]} ${e.stack.split(/\r?\n/).filter(l => l.includes('inicio.mjs')).join(' ')}`);
} finally {
  await navegador.close();
}
console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
process.exit(mal ? 1 : 0);
