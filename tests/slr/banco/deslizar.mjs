// Prueba en el navegador del deslizamiento entre pestañas, la cabecera solo en Inicio, las cartas de
// asistencia en el sitio del marcador, Partidos que aparece y desaparece y MVP cambiando de sitio.
//   node tests/slr/banco/deslizar.mjs   (servidor en http://localhost:3000; npm install en tests/slr/banco)
// A 360 y 412 px, móvil de verdad (toques por CDP, los que hacen scroll) y con la CPU ×6 para medir.
// Hojas de mentira: la real ni se lee ni se escribe.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { crearGas, fila, dia, CAB_JUGADORES, CAB_JORNADAS, CAB_VOTACIONES, CAB_MVPS } from '../gas-falso.mjs';

const URL_APP = 'http://localhost:3000/';
const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det !== '' ? ` → ${det}` : ''}`); };

const FOTO = readFileSync(new URL('../../../assets/logo-s-green.png', import.meta.url));
const NOMBRES = ['Markis', 'Nico', 'Enzo', 'Pablín', 'Mateo', 'Puebla', 'David', 'Alberto'];
const jugadores = [CAB_JUGADORES, ...NOMBRES.map((nombre, i) => fila(CAB_JUGADORES, { nombre, rating: 80, pos: 'MC', bandera: '🏳️',
  carta_url: `https://res.cloudinary.com/x/image/upload/v1/carta${i}.png`, alias: nombre === 'Markis' ? 'Marcos' : '' }))];
const jornada = (numero, fecha, extra = {}) => fila(CAB_JORNADAS, { numero, fecha, local: 'Markis', visitante: 'Pablín', goles_local: 3, goles_visitante: 2,
  goleadores: 'Nico:2,Enzo:1', asistentes: 'Enzo:1', jugadores_local: 'Markis, Nico, Enzo', jugadores_visitante: 'Pablín, Mateo, Borja', amistoso: 'FALSE', ...extra });
const votacion = (id, desfase) => fila(CAB_VOTACIONES, { id, fecha: dia(desfase), hora: '20:00', lugar: `Campo ${id}`, imagen_url: `https://res.cloudinary.com/x/image/upload/v1/campo${id}.png` });
const jornadasLargas = [...Array(14)].map((_, i) => jornada(i + 1, dia(-200 + i * 7)));

const base = (extra = {}) => ({
  Jugadores: jugadores,
  Jornadas: [CAB_JORNADAS, ...jornadasLargas],
  Votaciones: [CAB_VOTACIONES, votacion('1', 5), votacion('2', 9), votacion('9', -3)],
  MVPs: [CAB_MVPS],
  ...extra,
});
const CORS = { 'Access-Control-Allow-Origin': '*' };

async function abrir(navegador, ancho, jugador, hojas, { hash = '' } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: 760 }, hasTouch: true, isMobile: true, serviceWorkers: 'block', deviceScaleFactor: 2 });
  const gas = crearGas(hojas);
  await ctx.addInitScript(j => {
    if (sessionStorage.getItem('__listo')) return;
    sessionStorage.setItem('__listo', '1');
    if (j) { localStorage.setItem('SESSION_PLAYER', j); localStorage.setItem('SESSION_CODE', 'prueba'); }
  }, jugador);
  await ctx.route('**/sheets.googleapis.com/**', r => {
    const hoja = decodeURIComponent(new URL(r.request().url()).pathname.split('/values/')[1]);
    if (!gas.hojas[hoja]) return r.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: '{"error":{"code":400}}' });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ values: gas.hojas[hoja] }) });
  });
  await ctx.route('**/www.googleapis.com/calendar/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '{"items":[]}' }));
  await ctx.route('**/res.cloudinary.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: FOTO }));
  await ctx.route('**/onesignal.com/**', r => r.abort());
  await ctx.route('**/*.supabase.co/**', r => r.abort());
  await ctx.route('**/script.google.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(gas.post(r.request().postData())) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.goto(URL_APP + hash, { waitUntil: 'load' });
  await page.waitForFunction(() => STATE.ultimaCarga > 0 && !mvpLeyendo && !recargaEnCurso);
  await dormir(400);   // las vecinas se pintan en un rato libre
  const cdp = await ctx.newCDPSession(page);
  const toque = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  // Un gesto entero: pasos [dx, dy]; pausa entre pasos; soltar o no
  const gesto = async (x, y, pasos, { pausa = 30, soltar = true } = {}) => {
    await toque('touchStart', x, y);
    for (const [dx, dy] of pasos) { await toque('touchMove', x + dx, y + dy); if (pausa) await dormir(pausa); }
    if (soltar) await toque('touchEnd');
  };
  const foto = async n => { if (SALIDA) await page.screenshot({ path: `${SALIDA}/deslizar-${ancho}-${n}.png` }); };
  return { ctx, page, gas, cdp, gesto, toque, errores, foto };
}
const activa = page => page.evaluate(() => STATE.activeTab);
const quieta = page => page.waitForFunction(() => !document.body.classList.contains('asentando') && !document.body.classList.contains('deslizando'));
const pistaX = page => page.evaluate(() => new DOMMatrix(getComputedStyle(document.getElementById('pista')).transform).m41);
const irTab = async (page, tab) => { await page.$eval(`.tab[data-tab="${tab}"]`, t => t.click()); await quieta(page); };
const ordenNav = page => page.$$eval('.tab:not([hidden])', t => t.map(x => x.dataset.tab).join());
const pasosX = (hasta, n = 8) => [...Array(n)].map((_, i) => [Math.round(hasta * (i + 1) / n), 0]);
const rect = (page, sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, h: r.height }; });

const navegador = await chromium.launch();
try {
  for (const ancho of [360, 412]) {
    console.log(`\n== ${ancho} px`);
    const medio = ancho / 2;

    /* ── Seguir el dedo, soltar a medias, soltar rápido ──────────────────── */
    {
      const { ctx, page, gesto, toque, cdp, errores, foto } = await abrir(navegador, ancho, null, base());
      check(await ordenNav(page) === 'inicio,votacion,mvp,resumen,clasificacion,goleadores,asistentes,plantilla', 'orden con partidos y MVP en curso', await ordenNav(page));
      const vecina = await page.$eval('#panel-votacion', p => p.children.length);
      check(vecina > 0, 'la pestaña de al lado ya está pintada antes del gesto');

      const heroAntes = await rect(page, '#hero-section');
      await gesto(medio + 100, 300, pasosX(-20, 2), { soltar: false });
      const antes = await cdp.send('Performance.enable').then(() => cdp.send('Performance.getMetrics'));
      for (const [dx] of pasosX(-120, 8)) { await toque('touchMove', medio + 100 + dx - 20, 300); await dormir(30); }
      const despues = await cdp.send('Performance.getMetrics');
      const m = (x, n) => x.metrics.find(k => k.name === n).value;
      const layouts = m(despues, 'LayoutCount') - m(antes, 'LayoutCount');
      await dormir(60);
      const x = await pistaX(page);
      check(Math.abs(x + 140) < 25, 'el carril sigue al dedo', x);
      const hero = await rect(page, '#hero-section');
      check(Math.abs((hero.left - heroAntes.left) - x) < 3, 'la cabecera se mueve junto con Inicio');
      const vec = await rect(page, '.pagina[data-pagina="votacion"]');
      check(Math.abs(vec.left - (ancho + x)) < 3, 'y la de al lado entra a la vez');
      check(await page.$eval('.pagina[data-pagina="votacion"]', p => getComputedStyle(p).visibility) === 'visible' && (await page.$eval('#panel-votacion', p => p.children.length)) > 0, 'con su contenido, no vacía');
      const ind = await page.$eval('.tabs__indicador', i => new DOMMatrix(getComputedStyle(i).transform).m41);
      const tInicio = await page.$eval('.tab[data-tab="inicio"]', t => t.offsetLeft);
      check(ind > tInicio + 2, 'el indicador de la barra se mueve', ind);
      check(layouts < 4, 'sin recalcular la página en cada fotograma del gesto', `${layouts} maquetaciones en 8 movimientos`);
      await foto('1-a-medias');
      await dormir(150);   // el dedo se para antes de soltar
      await toque('touchEnd');
      await quieta(page);
      check(await activa(page) === 'inicio' && await pistaX(page) === 0, 'soltar a medias y despacio: vuelve a su sitio');
      check(await page.$eval('.tab[data-tab="inicio"]', t => t.classList.contains('active')), 'la barra vuelve también');

      await gesto(medio + 100, 300, pasosX(-ancho * 0.5, 10), { pausa: 25 });
      await quieta(page);
      check(await activa(page) === 'votacion', 'pasada la distancia: cambia');
      check(await pistaX(page) === 0, 'y el carril queda en su sitio');
      check(await page.$eval('.tab[data-tab="votacion"]', t => t.classList.contains('active')), 'con la pestaña activa en la barra');
      await page.waitForFunction(() => location.hash === '#votacion');

      // Rápido y corto, hacia atrás. Fuera de las cartas: en el título
      const sh = await rect(page, '#panel-votacion .sh');
      await gesto(40, sh.top + sh.h / 2, [[20, 0], [50, 0], [70, 0]], { pausa: 12 });
      await quieta(page);
      check(await activa(page) === 'inicio', 'soltar rápido aunque sea poca distancia: cambia');

      // A la izquierda de Inicio no hay nada: en la 24/26 no existe Rush
      await page.evaluate(() => rushMostrarPestana(true));
      await gesto(60, 300, pasosX(ancho * 0.6, 8));
      await quieta(page);
      check(await activa(page) === 'inicio' && await page.$eval('.tab[data-tab="rush"]', t => t.hidden), 'en la 24/26 no hay Rush al que llegar');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── Vertical, encima de las cartas y la cuadrícula del MVP ──────────── */
    {
      const { ctx, page, gas, gesto, toque, errores } = await abrir(navegador, ancho, 'Marcos', base());
      const y0 = await page.$eval('.pagina--inicio', p => p.scrollTop);
      await gesto(medio, 600, [[0, -40], [2, -120], [4, -220], [4, -320]], { pausa: 25 });
      await dormir(300);
      check(await activa(page) === 'inicio', 'gesto vertical: no cambia de pestaña');
      check(await page.$eval('.pagina--inicio', p => p.scrollTop) > y0 + 50, 'y hace scroll normal');
      check(await pistaX(page) === 0, 'el carril no se mueve');
      await page.$eval('.pagina--inicio', p => { p.scrollTop = 0; });

      // Las cartas de asistencia, en el sitio del marcador
      check(await page.$eval('.last-match', e => getComputedStyle(e).display) === 'none', 'con votaciones sin responder, el marcador no se ve');
      await dormir(100);   // la barra sigue al scroll en el siguiente fotograma
      const orden = await page.evaluate(() => { const v = e => document.querySelector(e).getBoundingClientRect(); return v('.pendientes__pila').bottom <= v('#tabs').top + 1; });
      check(orden, 'las cartas en su sitio, encima de la barra');
      check(await page.$('.pendientes__cuenta') === null && !(await page.$eval('#pendientes', p => p.textContent)).includes('Desliza'), 'sin el texto de debajo');
      check(!(await page.$eval('#hero-section', h => h.textContent)).includes('Campo 9'), 'la de fecha pasada no sale');

      const carta = await rect(page, '.voto--compacta .voto-card');
      const cx = (carta.left + carta.right) / 2, cy = carta.top + carta.h / 2;
      await gesto(cx, cy, pasosX(-60, 4), { soltar: false, pausa: 30 });
      check(await pistaX(page) === 0, 'encima de una carta: se mueve la carta, no la pestaña');
      await toque('touchEnd');
      await dormir(100);
      await page.waitForFunction(() => document.querySelector('.voto--compacta .voto-card__bg')?.dataset.ready === '1');

      // Deslizar a la derecha: sin ensanchar la página y a los mismos fotogramas que a la izquierda
      const medir = async sentido => {
        await page.evaluate(() => {
          window.__m = { t: [], ancho: [] };
          const p = document.querySelector('.pagina--inicio');
          const f = n => { window.__m.t.push(n); window.__m.ancho.push(p.scrollWidth); window.__r = requestAnimationFrame(f); };
          window.__r = requestAnimationFrame(f);
        });
        const c = await rect(page, '.voto--compacta .voto-card');
        const xx = (c.left + c.right) / 2, yy = c.top + c.h / 2;
        await toque('touchStart', xx, yy);
        for (let i = 1; i <= 18; i++) { await toque('touchMove', xx + sentido * i * 4, yy); await dormir(16); }
        const r = await page.evaluate(() => {
          cancelAnimationFrame(window.__r);
          const t = window.__m.t, d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
          return { n: d.length, media: d.reduce((s, x) => s + x, 0) / d.length, p95: d[Math.floor(d.length * .95)], max: d[d.length - 1], anchos: [...new Set(window.__m.ancho)] };
        });
        // Vuelve sin votar
        await toque('touchMove', xx, yy); await toque('touchEnd');
        await dormir(600);
        return r;
      };
      await cdp_throttle(ctx, page, 6);
      const izq = await medir(-1);
      const der = await medir(1);
      await cdp_throttle(ctx, page, 1);
      console.log(`    CPU ×6, carta: izquierda ${izq.media.toFixed(1)} ms/fotograma (máx ${izq.max.toFixed(0)}), derecha ${der.media.toFixed(1)} (máx ${der.max.toFixed(0)})`);
      check(der.anchos.length === 1, 'a la derecha la página no se ensancha en ningún fotograma', der.anchos.join());
      check(der.media <= izq.media * 1.4 + 3, 'a la derecha va tan fluida como a la izquierda', `${der.media.toFixed(1)} frente a ${izq.media.toFixed(1)} ms`);
      // Control: sin el recorte, la medida sí ve el problema de antes
      await page.$eval('#hero-section', h => { h.style.overflowX = 'visible'; });
      const sinClip = await medir(1);
      await page.$eval('#hero-section', h => { h.style.overflowX = ''; });
      check(sinClip.anchos.length > 1, 'control: sin el recorte, la carta sí ensancharía la página', sinClip.anchos.join());

      // Votar todas: aparece el marcador
      await page.click('.voto--compacta .voto-btn--si');
      await page.waitForSelector('.voto--compacta .voto-card__lugar');
      check(await page.$eval('.last-match', e => getComputedStyle(e).display) === 'none', 'queda una: sigue tapado');
      await page.click('.voto--compacta .voto-btn--no');
      await page.waitForFunction(() => !document.querySelector('.voto--compacta'));
      check(await page.$eval('.last-match', e => getComputedStyle(e).display) !== 'none', 'votadas todas: aparece el marcador');
      const hoja = gas.hojas.Votaciones;
      check(hoja[1][CAB_VOTACIONES.indexOf('jugadores_si')].includes('Marcos') && hoja[2][CAB_VOTACIONES.indexOf('jugadores_no')].includes('Marcos'), 'con los votos en la hoja');

      // La cuadrícula del MVP
      await page.click('.pendiente-mvp__btn');
      await quieta(page);
      await page.waitForSelector('.mvp-carta');
      const mc = await rect(page, '.mvp-carta');
      await gesto(mc.left + 40, mc.top + 40, pasosX(-100, 5), { soltar: false, pausa: 25 });
      check(await pistaX(page) === 0, 'encima de la cuadrícula del MVP no se desliza');
      await toque('touchEnd');
      await quieta(page);
      check(await activa(page) === 'mvp', 'y sigue en MVP');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── Scroll de cada pestaña y cabecera solo en Inicio ────────────────── */
    {
      const { ctx, page, gesto, errores, foto } = await abrir(navegador, ancho, null, base());
      const barra = await rect(page, '#tabs');
      const hero = await rect(page, '#hero-section');
      const top = await rect(page, '.topbar');
      check(Math.abs(barra.top - hero.bottom) < 2, 'en Inicio, la barra justo debajo de la cabecera', `${barra.top} / ${hero.bottom}`);
      await foto('2-inicio');

      await irTab(page, 'resumen');
      const b2 = await rect(page, '#tabs');
      const panel = await rect(page, '#panel-resumen');
      check(Math.abs(b2.top - top.bottom) < 2, 'en el resto, la barra arriba, debajo de la barra superior', `${b2.top} / ${top.bottom}`);
      check(Math.abs(panel.top - b2.bottom) < 2, 'y el contenido sube a ocupar el hueco', `${panel.top} / ${b2.bottom}`);
      check(await page.$eval('#hero-section', e => { const r = e.getBoundingClientRect(); return getComputedStyle(e).visibility === 'hidden' || r.right <= 0 || r.left >= innerWidth; }), 'la cabecera no está');
      await foto('3-resumen');

      // Scroll propio de cada una
      const scroll = (n, v) => page.$eval(`.pagina[data-pagina="${n}"]`, (p, v) => { p.scrollTop = v; return p.scrollTop; }, v);
      const leer = n => page.$eval(`.pagina[data-pagina="${n}"]`, p => p.scrollTop);
      await scroll('resumen', 400);
      await irTab(page, 'clasificacion');
      check(await leer('clasificacion') === 0, 'otra pestaña no sale desplazada por el scroll de la anterior');
      const enClasif = await scroll('clasificacion', 120);
      await gesto(40, 420, pasosX(ancho * 0.6, 8));
      await quieta(page);
      check(await activa(page) === 'resumen' && await leer('resumen') === 400, 'al volver deslizando, donde estaba');
      await irTab(page, 'clasificacion');
      check(await leer('clasificacion') === enClasif, 'y en la otra, también', `${await leer('clasificacion')} / ${enClasif}`);
      await irTab(page, 'inicio');
      const pagIni = await page.$eval('.pagina--inicio', p => { p.scrollTop = 200; return p.scrollTop; });
      await dormir(60);
      const b3 = await rect(page, '#tabs');
      const hero3 = await rect(page, '#hero-section');
      check(Math.abs(b3.top - hero3.bottom) < 2 && pagIni === 200, 'al hacer scroll en Inicio, la barra sigue a la cabecera');
      await page.$eval('.pagina--inicio', p => { p.scrollTop = p.scrollHeight; });
      await dormir(60);
      const b4 = await rect(page, '#tabs');
      check(Math.abs(b4.top - top.bottom) < 2, 'y al irse la cabecera, se queda arriba');
      await page.$eval('.pagina--inicio', p => { p.scrollTop = 0; });

      // Tocar la barra: la misma animación, rápida; aunque no sea la de al lado
      await page.evaluate(() => {
        window.__x = [];
        const pista = document.getElementById('pista');
        const f = () => { window.__x.push(new DOMMatrix(getComputedStyle(pista).transform).m41); window.__r = requestAnimationFrame(f); };
        window.__r = requestAnimationFrame(f);
      });
      const t0 = Date.now();
      await page.$eval('.tab[data-tab="plantilla"]', t => t.click());
      await quieta(page);
      const dura = Date.now() - t0;
      const xs = await page.evaluate(() => { cancelAnimationFrame(window.__r); return window.__x; });
      check(xs.some(v => v < -10 && v > -ancho + 10), 'tocar una pestaña lejana también se desplaza', xs.slice(0, 6).join());
      check(dura < 600, 'y es rápido', `${dura} ms`);
      check(await page.$eval('.pagina[data-pagina="plantilla"]', p => { const r = p.getBoundingClientRect(); return r.left === 0; }), 'y llega a su sitio');

      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── Fluidez con el móvil lento ──────────────────────────────────────── */
    {
      const { ctx, page, toque, errores } = await abrir(navegador, ancho, null, base());
      await irTab(page, 'plantilla');
      await dormir(300);
      await cdp_throttle(ctx, page, 6);
      await page.evaluate(() => {
        window.__t = [];
        const f = n => { window.__t.push(n); window.__r = requestAnimationFrame(f); };
        window.__r = requestAnimationFrame(f);
      });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Performance.enable');
      const y = 400;
      await toque('touchStart', 60, y);
      await toque('touchMove', 80, y);
      await dormir(50);
      const a = await cdp.send('Performance.getMetrics');
      for (let i = 2; i <= 24; i++) { await toque('touchMove', 60 + i * 10, y); await dormir(16); }
      const b = await cdp.send('Performance.getMetrics');
      const m = await page.evaluate(() => {
        cancelAnimationFrame(window.__r);
        const t = window.__t, d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
        return { media: d.reduce((s, x) => s + x, 0) / d.length, p95: d[Math.floor(d.length * .95)], max: d[d.length - 1] };
      });
      const num = (x, n) => x.metrics.find(k => k.name === n).value;
      console.log(`    CPU ×6, deslizar con Plantilla: ${m.media.toFixed(1)} ms/fotograma, p95 ${m.p95.toFixed(0)}, máx ${m.max.toFixed(0)}; maquetaciones ${num(b, 'LayoutCount') - num(a, 'LayoutCount')}`);
      check(num(b, 'LayoutCount') - num(a, 'LayoutCount') <= 1, 'sin maquetar mientras se desliza, con la CPU ×6', num(b, 'LayoutCount') - num(a, 'LayoutCount'));
      check(m.p95 < 70, 'fotogramas razonables con la CPU ×6', `p95 ${m.p95.toFixed(0)} ms`);
      await toque('touchEnd');
      await quieta(page);
      await cdp_throttle(ctx, page, 1);
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── Partidos: aparece y desaparece; MVP cambia de sitio ─────────────── */
    {
      // Solo fechas pasadas: sin Partidos. La J14 abierta: MVP donde estaba Partidos
      const sinFuturo = base({ Votaciones: [CAB_VOTACIONES, votacion('9', -3)] });
      const { ctx, page, gas, gesto, errores, foto } = await abrir(navegador, ancho, 'Marcos', sinFuturo, { hash: '#votacion' });
      check(await activa(page) === 'inicio', 'el enlace a Partidos sin partidos abre Inicio');
      check(await ordenNav(page) === 'inicio,mvp,resumen,clasificacion,goleadores,asistentes,plantilla', 'sin Partidos en el nav, y MVP en su sitio', await ordenNav(page));
      check(await page.$('.voto--compacta') === null && await page.$eval('.last-match', e => getComputedStyle(e).display) !== 'none', 'ninguna carta y el marcador a la vista');
      await foto('4-sin-partidos');

      const siguiente = async () => {
        await gesto(ancho - 40, 300, pasosX(-ancho * 0.6, 8));
        await quieta(page);
        return activa(page);
      };
      check(await siguiente() === 'mvp', 'deslizar sigue el orden: de Inicio a MVP');

      // Aparece una fecha futura
      gas.hojas.Votaciones.push(votacion('3', 7));
      await page.evaluate(() => recargarDatos());
      await page.waitForFunction(() => !recargaEnCurso);
      check((await ordenNav(page)).startsWith('inicio,votacion,mvp,'), 'con un partido futuro, aparece Partidos', await ordenNav(page));
      check(await page.$eval('.tab[data-tab="votacion"]', t => t.textContent) === 'Partidos', 'con su nombre nuevo');
      await irTab(page, 'votacion');
      const lugares = await page.$$eval('#panel-votacion .voto-card__lugar', l => l.map(x => x.textContent));
      check(lugares.join() === 'Campo 3', 'y solo los futuros', lugares.join());
      check((await page.$eval('#panel-votacion .sh__title', t => t.textContent)) === 'PARTIDOS', 'titulada Partidos');

      // Desaparece estando en ella
      gas.hojas.Votaciones.pop();
      await page.evaluate(() => recargarDatos());
      await page.waitForFunction(() => !recargaEnCurso);
      await quieta(page);
      check(await activa(page) === 'inicio' && !(await ordenNav(page)).includes('votacion'), 'sin futuros estando en ella: se va a Inicio y desaparece');

      // Se juega otro partido en el que no se ha votado y luego votan todos: MVP se va al final
      gas.hojas.Jornadas.push(jornada(15, dia(-1), { jugadores_local: 'Markis, Enzo', jugadores_visitante: 'Nico' }));
      gas.hojas.MVPs.push(fila(CAB_MVPS, { fecha_partido: dia(-1), jornada: 15, votante: 'Nico', voto_1: 'Enzo', puntos_1: 3 }),
        fila(CAB_MVPS, { fecha_partido: dia(-1), jornada: 15, votante: 'Enzo', voto_1: 'Nico', puntos_1: 3 }));
      await page.evaluate(() => recargarDatos());
      await page.waitForFunction(() => !recargaEnCurso);
      check((await ordenNav(page)).startsWith('inicio,mvp,'), 'con Markis por votar, en curso', await ordenNav(page));
      await page.click('.pendiente-mvp__btn');
      await quieta(page);
      await page.waitForSelector('.mvp-carta');
      for (let i = 0; i < 3; i++) await page.click('.mvp-carta[data-nombre="Nico"]');
      await page.click('[data-enviar]');
      await page.waitForSelector('#mvpModal.open');
      await page.click('#mvpConfirmarSi');
      await page.waitForSelector('.mvp-banner');
      await quieta(page);
      check(await ordenNav(page) === 'inicio,resumen,clasificacion,goleadores,asistentes,mvp,plantilla', 'votan todos: MVP entre Asistentes y Plantilla', await ordenNav(page));
      check(await activa(page) === 'mvp', 'sin sacarte de ella');
      const izq = await page.$eval('.pagina[data-pagina="mvp"]', p => p.getBoundingClientRect().left);
      check(izq === 0, 'y en su sitio');
      await foto('5-mvp-al-final');
      const pr = await rect(page, '.pagina[data-pagina="mvp"] .mvp-nav__centro');
      await gesto(ancho - 40, pr.top + 8, pasosX(-ancho * 0.6, 8));
      await quieta(page);
      check(await activa(page) === 'plantilla', 'el deslizamiento sigue el orden nuevo: de MVP a Plantilla');

      // Sin 🏆 en Plantilla; en la ficha sí
      await page.waitForSelector('.card-wrap[data-nombre="Nico"]');
      check(!(await page.$eval('#panel-plantilla', p => p.textContent)).includes('🏆') && await page.$('.card-wrap__mvp') === null, 'Plantilla sin 🏆');
      await page.$eval('.card-wrap[data-nombre="Nico"]', c => c.click());
      await page.waitForSelector('#playerModal.open');
      const stats = await page.$$eval('#playerModalBox .player-modal__stat', s => s.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      check(stats.some(s => /^1 ?MVPs$/.test(s)), 'las veces MVP, dentro de la ficha', stats.join(' | '));
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }
  }
} catch (e) {
  check(false, `Error inesperado: ${e.message.split(/\r?\n/)[0]} ${e.stack.split(/\r?\n/).filter(l => l.includes('deslizar.mjs')).join(' ')}`);
} finally {
  await navegador.close();
}
console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
process.exit(mal ? 1 : 0);

async function cdp_throttle(ctx, page, rate) {
  const c = await ctx.newCDPSession(page);
  await c.send('Emulation.setCPUThrottlingRate', { rate });
}
