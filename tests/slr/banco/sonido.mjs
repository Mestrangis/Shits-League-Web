// Prueba en el navegador del sonido de los partidos (js/slr/partido/sonido.js), a 412 px:
//   node tests/slr/banco/sonido.mjs   (servidor local en :3000 y .env.local; npm install en tests/slr/banco)
// · Los sonidos NO van en la descarga de JUGAR ni se piden antes: llegan en segundo plano después
//   de entrar en Rush y se quedan en la caché del service worker (la segunda vez, de ahí).
// · Tu partido (el de verdad, desde el aviso): cada aviso suena con un archivo suyo y la grada
//   (ambiente) suena en bucle; con «silenciar» se corta todo y no suena nada (y se recuerda al
//   recargar); al cerrar, la grada no se queda sonando.
// · Muestrario: el gol «ardiendo» suena con «chut» y «fuego»; ⏸ para la grada y ▶ la devuelve.
// Chrome con --autoplay-policy=no-user-gesture-required: en headless no hay toques de verdad que
// desbloqueen el audio (el desbloqueo de iPhone no se puede probar aquí).
// Crea una liga de prueba con Bot Uno y 3 bots (1 jornada jugada) y la borra al terminar.
import { chromium } from 'playwright';
import { env, rpc, rpcOk } from '../api-util.mjs';

const URL_APP = 'http://localhost:3000/';
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36';
const archivo = u => u.split('/').pop();

const t = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: t, nombre: 'Prueba sonido (banco)' });
let navegador = null;
try {
  await rpcOk('slr_unirse_liga', { token: t, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  for (let i = 0; i < 3; i++) await rpcOk('slr_admin_anadir_bot', { token: t, liga_id: liga.id });
  await rpcOk('slr_iniciar_temporada', { token: t, liga_id: liga.id });
  let r;
  do { r = await rpcOk('slr_admin_jugar_jornada', { token: t, liga_id: liga.id }); if (r.estado === 'simulando') await dormir(1500); } while (r.estado === 'simulando');

  navegador = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await navegador.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: UA });
  await ctx.addInitScript(([codigo]) => {
    try {
      if (!localStorage.getItem('SESSION_CODE')) {
        localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', codigo);
        localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true }));
      }
    } catch { /* */ }
    // Cuándo se abre Rush (el reloj es el mismo que el de la prueba: misma máquina)
    new MutationObserver((_, o) => { if (document.querySelector('.slr')) { window.__rushAbierto = Date.now(); o.disconnect(); } })
      .observe(document, { childList: true, subtree: true });
  }, [env.SLR_BOT_UNO_CODIGO]);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  const pedidos = [];
  ctx.on('request', q => { if (q.url().includes('/audio/')) pedidos.push({ url: q.url(), sw: !!q.serviceWorker(), t: Date.now() }); });
  const respuestas = [];
  ctx.on('response', q => { if (q.url().includes('/audio/') && !q.request().serviceWorker()) respuestas.push({ url: q.url(), sw: q.fromServiceWorker() }); });
  const S = `import('/js/slr/partido/sonido.js')`;
  const estado = () => page.evaluate(`${S}.then(m => m.estadoSonidos())`);
  const total = Number(await (async () => { await page.goto(URL_APP); return page.evaluate(`${S}.then(m => m.estadoSonidos().total)`); })());

  console.log('\nDescarga');
  await page.click('.tab[data-tab="rush"]');
  await page.waitForSelector('#rushJugar:not([disabled])');
  await dormir(1500);
  check(!pedidos.length, `antes de JUGAR, ningún sonido pedido (${pedidos.length})`);
  const tJugar = Date.now();
  await page.$eval('#rushJugar', b => b.click());
  await page.waitForSelector('.slr-nav:not([hidden])', { timeout: 60000 });
  const tDentro = await page.evaluate(() => window.__rushAbierto);
  const enJugar = await page.evaluate(() => new Promise(res => { const c = new MessageChannel(); c.port1.onmessage = e => res(e.data); navigator.serviceWorker.controller?.postMessage({ tipo: 'estado' }, [c.port2]); setTimeout(() => res(null), 3000); }));
  check(enJugar?.rush === true && pedidos.filter(p => p.t < tDentro).length === 0, `la descarga de JUGAR no lleva sonidos (Rush descargado; ${pedidos.filter(p => p.t < tDentro).length} sonidos pedidos antes de abrirse Rush)`);
  let e;
  for (let k = 0; k < 120; k++) { e = await estado(); if (e.cargados === total) break; await dormir(500); }
  check(e.cargados === total && total === 37, `después de entrar, en segundo plano, los ${e.cargados}/${total} sonidos descargados y decodificados`);
  const enCache = await page.evaluate(async () => (await (await caches.open('slr-audio')).keys()).length);
  check(enCache === total, `y guardados en la caché del service worker (${enCache})`);
  check(pedidos.every(p => p.t >= tJugar), 'ninguno antes de JUGAR');
  const sinV = u => u.split('?')[0];
  const dePagina = new Set(pedidos.filter(p => !p.sw).map(p => sinV(p.url)));
  check(dePagina.size === total && pedidos.filter(p => p.sw).every(p => dePagina.has(sinV(p.url))),
    `los pide la página (en segundo plano, después de abrirse Rush: a los ${((Math.min(...pedidos.map(p => p.t)) - tDentro) / 1000).toFixed(1)} s), no la descarga de JUGAR`);

  await page.evaluate(`${S}.then(m => { window.__avisos = []; window.__sonados = [];
    m.OYENTES.add(n => window.__avisos.push(n)); m.AL_SONAR.add(x => window.__sonados.push({ nombre: x.nombre, url: x.url, volumen: x.volumen })); })`);

  console.log('\nTu partido');
  await page.click('.slr-barra__avisos');
  await page.waitForSelector('.slr-avisos');
  await page.evaluate(() => [...document.querySelectorAll('[data-aviso]')].find(b => /ya se ha jugado/.test(b.textContent))?.click());
  await page.waitForSelector('[data-partido-reproductor]', { timeout: 15000 });
  await dormir(2500);
  const e1 = await estado();
  check(e1.contexto === 'running' && e1.ambiente, `la grada suena en bucle (audio ${e1.contexto})`);
  const amb = await page.evaluate(() => window.__sonados.find(x => x.nombre === 'ambiente'));
  check(amb && archivo(amb.url) === 'ambiente.mp3' && amb.volumen === 0.25, `con ambiente.mp3, bajita (${amb?.volumen})`);
  // Tocando se pasa de escena: suenan los avisos de cada una
  for (let k = 0; k < 14; k++) { await page.mouse.click(206, 460); await dormir(500); }
  const { avisos, sonados } = await page.evaluate(() => ({ avisos: window.__avisos.slice(), sonados: window.__sonados.filter(x => x.nombre !== 'ambiente') }));
  const conArchivo = avisos.filter(n => n !== 'ambiente');
  check(conArchivo.length >= 6 && sonados.length === conArchivo.length && sonados.every((x, i) => x.nombre === conArchivo[i]),
    `cada aviso suena (${sonados.length} de ${conArchivo.length}: ${[...new Set(conArchivo)].join(', ')})`);
  check(sonados.every(x => new RegExp(`/${x.nombre}(_\\d)?\\.mp3$`).test(x.url)), 'y cada uno con un archivo suyo', JSON.stringify(sonados.filter(x => !new RegExp(`/${x.nombre}(_\\d)?\\.mp3$`).test(x.url)).slice(0, 3)));

  // Silenciar: se corta todo y no suena nada
  await page.click('[data-silencio]');
  await dormir(300);
  const e2 = await estado();
  check(e2.silencio && !e2.ambiente && e2.activos === 0, `en silencio: la grada y todo lo que sonaba, cortados (${e2.activos} sonando)`);
  const n0 = await page.evaluate(() => [window.__avisos.length, window.__sonados.length]);
  for (let k = 0; k < 6; k++) { await page.mouse.click(206, 460); await dormir(400); }
  const n1 = await page.evaluate(() => [window.__avisos.length, window.__sonados.length]);
  check(n1[0] > n0[0] && n1[1] === n0[1], `y no suena nada (${n1[0] - n0[0]} avisos, ${n1[1] - n0[1]} sonidos)`);
  await page.click('[data-silencio]');
  await dormir(300);
  check((await estado()).ambiente, 'al quitar el silencio, vuelve la grada');
  // Cerrar
  await page.evaluate(() => history.back());
  await page.waitForSelector('[data-partido-reproductor]', { state: 'detached', timeout: 10000 }).catch(() => {});
  await dormir(1500);
  const e3 = await estado();
  check(!e3.ambiente && e3.activos === 0, `al cerrar, la grada no se queda sonando (${e3.activos} sonando)`);
  // (y fuera la hoja de avisos, que estaba debajo)
  for (let k = 0; k < 3 && await page.$('.slr-hoja.abierta'); k++) { await page.evaluate(() => history.back()); await dormir(500); }

  console.log('\nMuestrario');
  await page.click('.slr-nav__item[data-seccion="perfil"]');
  await page.waitForSelector('[data-pruebas="escenas-partido"]', { timeout: 15000 });
  await page.click('[data-pruebas="escenas-partido"]');
  await page.waitForSelector('[data-tipo="gol"][data-variante="ardiendo"]');
  await page.evaluate(() => { window.__sonados.length = 0; });
  await page.click('[data-tipo="gol"][data-variante="ardiendo"]');
  await page.waitForSelector('[data-partido-reproductor]');
  await dormir(700);
  await page.click('[data-pausa]');
  await dormir(300);
  const e4 = await estado();
  await page.click('[data-pausa]');
  await dormir(300);
  const e5 = await estado();
  check(!e4.ambiente && e5.ambiente, '⏸ para la grada y ▶ la devuelve');
  await dormir(4500);
  const g = await page.evaluate(() => window.__sonados.map(x => `${x.nombre}:${x.url.split('/').pop()}`));
  check(g.some(x => /^fuego:fuego_\d\.mp3$/.test(x)) && g.some(x => /^chut:chut_\d\.mp3$/.test(x)) && g.some(x => /^gol:gol_\d\.mp3$/.test(x)), `gol «ardiendo»: chut, fuego y gol (${g.filter(x => !x.startsWith('ambiente')).join(', ')})`);
  // Todas las escenas y variantes del muestrario: cada aviso suena con un archivo suyo
  await page.waitForSelector('[data-partido-reproductor]', { state: 'detached', timeout: 15000 }).catch(() => {});
  const botones = await page.$$eval('[data-tipo]', bs => bs.map(b => [b.dataset.tipo, b.dataset.variante]));
  await page.evaluate(() => { window.__sonados.length = 0; window.__avisos.length = 0; });
  for (const [tipo, variante] of botones) {
    await page.evaluate(([tp]) => { const q = s => document.querySelector(s);
      q('[data-resultado]').value = ['parada', 'corte'].includes(tp) ? 'defiende' : 'ataca';
      q('[data-version]').value = 'completa'; q('[data-poder]').value = tp === 'control' ? 'ataca' : '';
      // En el control, que gane el que tenía poca probabilidad: «¡SORPRESA!»
      const p = q('[data-p]'); p.value = tp === 'control' ? 10 : 50; p.dispatchEvent(new Event('input')); }, [tipo]);
    await page.click(`[data-tipo="${tipo}"][data-variante="${variante}"]`);
    await page.waitForSelector('[data-partido-reproductor]', { timeout: 5000 }).catch(() => {});
    await page.waitForSelector('[data-partido-reproductor]', { state: 'detached', timeout: 20000 }).catch(() => {});
    await dormir(200);
  }
  const todo = await page.evaluate(() => ({ avisos: window.__avisos.slice(), sonados: window.__sonados.slice() }));
  const nombres = await page.evaluate(`${S}.then(m => Object.keys(m.SONIDOS).filter(n => n !== 'ambiente'))`);
  const oidos = new Map();
  for (const x of todo.sonados) (oidos.get(x.nombre) ?? oidos.set(x.nombre, new Set()).get(x.nombre)).add(archivo(x.url));
  const faltan = nombres.filter(n => !oidos.has(n));
  const ajenos = [...oidos].filter(([n, fs]) => [...fs].some(f => !new RegExp(`^${n}(_\\d)?\\.mp3$`).test(f)));
  check(!faltan.length && !ajenos.length, `muestrario (${botones.length} escenas): los ${nombres.length} avisos suenan, cada uno con lo suyo`,
    JSON.stringify({ faltan, ajenos: ajenos.map(([n, fs]) => `${n}: ${[...fs].join(',')}`) }));
  check(todo.sonados.filter(x => x.nombre !== 'ambiente').length === todo.avisos.filter(n => n !== 'ambiente').length, 'ningún aviso sin sonar');
  const variados = [...oidos].filter(([, fs]) => fs.size > 1).map(([n, fs]) => `${n} ×${fs.size}`);
  console.log(`    (variaciones oídas: ${variados.join(', ')})`);
  await dormir(1500);
  check(!(await estado()).ambiente, 'al terminar la última escena, la grada no se queda sonando');
  // El silencio se recuerda
  await page.evaluate(`${S}.then(m => m.silenciar(true))`);
  await page.reload();
  const recuerda = await page.evaluate(`${S}.then(m => m.silenciado())`);
  check(recuerda === true, 'el silencio se recuerda al volver a abrir la app');
  await page.evaluate(`${S}.then(m => m.silenciar(false))`);
  check(!errores.length, 'sin errores en la página', errores.slice(0, 3).join(' | '));
  // La segunda vez, los sonidos salen de la caché
  check(respuestas.length === 0 || respuestas.every(x => x.sw), 'la página los recibe siempre a través del service worker');
} catch (err) {
  mal++;
  console.log(`\n  ✖ Error inesperado: ${err.stack ?? err.message}`);
} finally {
  await navegador?.close();
  const b = await rpc('slr_borrar_liga', { token: t, liga_id: liga.id });
  check(b.ok, 'liga de prueba borrada', b.mensaje);
  await rpc('slr_logout', { token: t });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
  process.exitCode = mal ? 1 : 0;
}
