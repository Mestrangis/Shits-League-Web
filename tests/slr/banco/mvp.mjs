// Prueba en el navegador de la votación del MVP, los pendientes y los bloques de Inicio.
//   node tests/slr/banco/mvp.mjs   (servidor en http://localhost:3000; npm install en tests/slr/banco)
// A 360 y 412 px. Las hojas son de mentira y el Apps Script es el de verdad (apps-script/votos.gs)
// corriendo en gas-falso.mjs: la hoja real ni se lee ni se escribe.
// Jornadas de ejemplo:
//   J1 cerrada con votos · J2 empate a puntos (votantes) · J3 empate a puntos y votantes (veces 3)
//   J4 empate total · J5 con mvp a mano y votos · J6 sin votos con mvp a mano · J7 sin votos
//   J8 la abierta, un amistoso después
import { chromium } from 'playwright';
import { crearGas, fila, dia, CAB_JUGADORES, CAB_JORNADAS, CAB_VOTACIONES, CAB_MVPS } from '../gas-falso.mjs';

const URL_APP = 'http://localhost:3000/';
const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };

const NOMBRES = ['Markis', 'Nico', 'Enzo', 'Pablín', 'De la Mano 🏆', 'Mateo', 'Puebla'];
const jugadores = [CAB_JUGADORES, ...NOMBRES.map(nombre => fila(CAB_JUGADORES, { nombre, rating: 80, pos: 'MC', bandera: '🏳️',
  alias: { Markis: 'Marcos', Nico: 'Nicolás', Pablín: 'Pablo', 'De la Mano 🏆': 'Jorge' }[nombre] ?? '' }))];
const LOCAL = 'Markis, Nico, Enzo', VIS = 'Pablín, De la Mano, Borja';
const jornada = (numero, offset, extra = {}) => fila(CAB_JORNADAS, { numero, fecha: dia(offset), local: 'Markis', visitante: 'Pablín', goles_local: 3, goles_visitante: 2,
  jugadores_local: LOCAL, jugadores_visitante: VIS, capitan_local: 'Markis', capitan_visitante: 'Pablín', amistoso: 'FALSE', ...extra });
const voto = (j, votante, ...p) => fila(CAB_MVPS, Object.assign({ jornada: j, votante, fecha_voto: `${dia(-40)} 12:00:00` },
  ...p.map(([nombre, puntos], i) => ({ [`voto_${i + 1}`]: nombre, [`puntos_${i + 1}`]: puntos }))));

const hojasBase = () => ({
  Jugadores: jugadores,
  Jornadas: [CAB_JORNADAS,
    jornada(1, -40), jornada(2, -38), jornada(3, -36), jornada(4, -34),
    jornada(5, -32, { mvp: 'Nicolás' }), jornada(6, -30, { mvp: 'Mateo' }), jornada(7, -28),
    jornada(8, -1),
    jornada('', 0, { amistoso: 'TRUE' }),
  ],
  Votaciones: [CAB_VOTACIONES,
    fila(CAB_VOTACIONES, { id: '1', fecha: dia(5), hora: '20:00', lugar: 'Campo A', jugadores_si: 'Nico' }),
    fila(CAB_VOTACIONES, { id: '2', fecha: dia(9), hora: '20:00', lugar: 'Campo B' }),
    fila(CAB_VOTACIONES, { id: '3', fecha: dia(-3), hora: '20:00', lugar: 'Pasada' }),
  ],
  MVPs: [CAB_MVPS,
    voto(1, 'Markis', ['Nico', 2], ['Enzo', 1]), voto(1, 'Pablín', ['Nico', 3]), voto(1, 'Enzo', ['Nico', 1], ['Borja', 2]),
    // J2: Nico 3 de uno; Enzo 3 de dos → Enzo
    voto(2, 'Markis', ['Nico', 3]), voto(2, 'Pablín', ['Enzo', 1], ['Borja', 2]), voto(2, 'Borja', ['Enzo', 2], ['Markis', 1]),
    // J3: Nico 5 con un 3; Enzo 5 sin 3, tres votantes cada uno → Nico
    voto(3, 'Markis', ['Nico', 3]), voto(3, 'Pablín', ['Nico', 1], ['Enzo', 2]), voto(3, 'Borja', ['Nico', 1], ['Enzo', 2]), voto(3, 'De la Mano', ['Enzo', 1], ['Markis', 2]),
    // J4: empate total
    voto(4, 'Markis', ['Nico', 2], ['Enzo', 1]), voto(4, 'Pablín', ['Nico', 1], ['Enzo', 2]),
    voto(5, 'Markis', ['Enzo', 3]),
    voto(8, 'Pablín', ['Nico', 2], ['Enzo', 1]), voto(8, 'Borja', ['Nico', 3]),
  ],
});

const respuesta = valores => ({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ values: valores }) });

// Una sesión de la web a un ancho, sobre sus propias hojas
async function abrir(navegador, ancho, jugador, hojas, opciones = {}) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: 800 }, hasTouch: true, serviceWorkers: 'block', deviceScaleFactor: 2 });
  const gas = crearGas(hojas);
  const red = { posts: [], fallarPost: false, responderTarde: 0, leerMVPsMal: !!opciones.mvpsMal };
  await ctx.addInitScript(([j, previo]) => {
    if (sessionStorage.getItem('__listo')) return;
    sessionStorage.setItem('__listo', '1');
    if (j) { localStorage.setItem('SESSION_PLAYER', j); localStorage.setItem('SESSION_CODE', 'prueba'); }
    for (const [k, v] of Object.entries(previo ?? {})) localStorage.setItem(k, v);
  }, [jugador, opciones.localStorage]);
  await ctx.route('**/sheets.googleapis.com/**', r => {
    const hoja = decodeURIComponent(new URL(r.request().url()).pathname.split('/values/')[1]);
    if (hoja === 'MVPs' && red.leerMVPsMal) return r.fulfill({ status: 500, body: 'error', headers: { 'Access-Control-Allow-Origin': '*' } });
    if (!gas.hojas[hoja]) return r.fulfill({ status: 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"error":{"code":400}}' });
    return r.fulfill(respuesta(gas.hojas[hoja]));
  });
  await ctx.route('**/www.googleapis.com/calendar/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"items":[]}' }));
  await ctx.route('**/res.cloudinary.com/**', r => r.abort());
  await ctx.route('**/onesignal.com/**', r => r.abort());
  // Sin Rush: el código de esta sesión es inventado y el servidor la cerraría
  await ctx.route('**/*.supabase.co/**', r => r.abort());
  await ctx.route('**/script.google.com/**', async r => {
    const texto = r.request().postData();
    red.posts.push(JSON.parse(texto));
    if (red.responderTarde) await dormir(red.responderTarde);
    if (red.fallarPost) return r.abort('failed');
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(gas.post(texto)) });
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.goto(URL_APP + (opciones.hash ?? ''), { waitUntil: 'load' });
  await page.waitForFunction(() => STATE.ultimaCarga > 0 && document.querySelector('.hero__counter'));
  const foto = async n => { if (SALIDA) await page.screenshot({ path: `${SALIDA}/mvp-${ancho}-${n}.png`, fullPage: false }); };
  return { ctx, page, gas, red, errores, foto };
}
// Con el clic del propio botón: durante el scroll suave de la página, un toque por coordenadas puede caer en la cabecera
const irMVP = page => page.$eval('.tab[data-tab="mvp"]', t => t.click());
const irJornada = async (page, n) => {
  await page.evaluate(n => abrirMVP(n), n);
  await page.waitForFunction(n => document.querySelector('.mvp-nav__titulo')?.textContent.includes(`JORNADA ${n} `), n);
};
const texto = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const sinScrollLateral = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

const navegador = await chromium.launch();
try {
  for (const ancho of [360, 412]) {
    console.log(`\n== ${ancho} px`);

    /* ── a) Abierta, jugaste y no has votado ─────────────────────────────── */
    {
      const { ctx, page, gas, red, errores, foto } = await abrir(navegador, ancho, 'Marcos', hojasBase());
      check(await page.$('.tab[data-tab="mvp"]') !== null, 'pestaña MVP en el nav');
      check(await page.evaluate(() => document.querySelector('.tab[data-tab="votacion"]').nextElementSibling.dataset.tab === 'mvp'), 'justo después de Votación');

      // Pendientes en Inicio: las dos votaciones sin responder (no la pasada) y el MVP
      check(await page.$('#pendientes') !== null, 'bloque Pendientes con cosas por hacer');
      const orden = await page.evaluate(() => { const v = e => document.querySelector(e).getBoundingClientRect(); return [v('.last-match').bottom <= v('#pendientes').top + 1, v('#pendientes').bottom <= v('.hero__counters').top + 1]; });
      check(orden[0] && orden[1], 'debajo del último partido y antes de las estadísticas', JSON.stringify(orden));
      const pOrden = await page.evaluate(() => { const v = e => document.querySelector(e).getBoundingClientRect(); return v('.pendientes__pila').top < v('.pendiente-mvp').top; });
      check(pOrden, 'primero las votaciones y luego el MVP');
      check(await texto(page, '.pendiente-mvp span') === 'Vota el MVP de la Jornada 8', 'tarjeta «Vota el MVP de la Jornada 8»');
      const alturas = await page.evaluate(() => { const c = document.querySelector('.pendientes .voto--compacta .voto-card').getBoundingClientRect(); return c.height / (c.width * 5 / 4); });
      check(alturas > 0.55 && alturas < 0.65, 'la carta con el 60 % de la altura normal', alturas.toFixed(2));
      check(await sinScrollLateral(page), 'Inicio sin scroll lateral');
      await foto('1-inicio');
      await page.evaluate(() => document.getElementById('pendientes').scrollIntoView({ block: 'center', behavior: 'instant' }));
      await foto('1-pendientes');

      // Swipe a la derecha = sí; no cambia de pestaña
      await page.waitForSelector('.voto--compacta .voto-card__bg, .voto--compacta .voto-card', { timeout: 3000 });
      await page.evaluate(() => document.querySelector('.voto--compacta').scrollIntoView({ block: 'center', behavior: 'instant' }));
      const c2 = await (await page.$('.voto--compacta .voto-card')).boundingBox();
      await page.mouse.move(c2.x + c2.width / 2, c2.y + c2.height / 2);
      await page.mouse.down();
      await page.mouse.move(c2.x + c2.width / 2 + 60, c2.y + c2.height / 2, { steps: 4 });
      await page.mouse.move(c2.x + c2.width / 2 + 130, c2.y + c2.height / 2, { steps: 4 });
      await page.mouse.up();
      await dormir(300);
      const hSi = gas.hojas.Votaciones[1][CAB_VOTACIONES.indexOf('jugadores_si')];
      check(hSi.includes('Marcos'), 'deslizar a la derecha: «sí» guardado en la hoja', hSi);
      check(await texto(page, '.voto--compacta .voto-card__lugar') === 'Campo B', 'sale la siguiente carta');

      // Sin red: se avisa, vuelve la carta y se puede reintentar
      red.fallarPost = true;
      await page.click('.voto--compacta .voto-btn--no');
      await page.waitForSelector('.aviso-app.visible');
      check((await texto(page, '.aviso-app')).includes('No se ha podido enviar'), 'sin red: avisa de que no se ha guardado');
      check(await texto(page, '.voto--compacta .voto-card__lugar') !== null, 'la carta vuelve para reintentar');
      red.fallarPost = false;
      await page.click('.voto--compacta .voto-btn--no');
      await page.waitForFunction(() => !document.querySelector('.voto--compacta'));
      check(!await page.$('.voto--compacta'), 'sin cartas, la pila desaparece');
      check(gas.hojas.Votaciones[2][CAB_VOTACIONES.indexOf('jugadores_no')].includes('Marcos'), 'reintento guardado en la hoja');
      check(await page.$('#pendientes') !== null, 'sigue el bloque por el MVP');

      // «Votar →» abre la pestaña en esa jornada
      await page.click('.pendiente-mvp__btn');
      await page.waitForSelector('.mvp-reparto');
      check(await texto(page, '.mvp-nav__titulo') === 'JORNADA 8 · MVP', 'abre la pestaña MVP en la jornada 8');
      check(await page.$('#pendientes') === null, 'Pendientes solo en Inicio');
      check((await texto(page, '.mvp-falta')).startsWith('Se cierra en'), 'cuánto falta', await texto(page, '.mvp-falta'));
      check(await texto(page, '.mvp-quedan') === 'Te quedan 3 puntos', '«Te quedan 3 puntos»');
      const cartas = await page.$$eval('.mvp-carta', c => c.map(x => x.dataset.nombre));
      check(cartas.length === 5 && !cartas.includes('Markis'), 'las cartas del partido, sin ti', cartas.join());
      check(cartas.includes('De la Mano 🏆') && cartas.includes('Borja'), 'con «De la Mano» y un jugador sin ficha');
      check(await page.$eval('[data-enviar]', b => b.disabled), '«Enviar voto» desactivado sin los 3 puntos');
      check(await sinScrollLateral(page), 'votación sin scroll lateral');

      // Repartir: tocar suma; sin puntos no hace nada; «−» y mantener pulsado quitan
      const carta = n => `.mvp-carta[data-nombre="${n}"]`;
      const puntos = n => texto(page, `${carta(n)} [data-puntos]`);
      await page.click(carta('Nico')); await page.click(carta('Nico'));
      check(await puntos('Nico') === '2', 'tocar suma un punto');
      check(await texto(page, '.mvp-quedan') === 'Te queda 1 punto', '«Te queda 1 punto»');
      await page.click(carta('Enzo'));
      check(await texto(page, '.mvp-quedan') === 'Puntos repartidos', 'los 3 repartidos');
      await page.click(carta('Borja'));
      check(await puntos('Borja') === '0', 'sin puntos, tocar no hace nada');
      const apagadas = await page.$$eval('.mvp-carta--apagada', c => c.map(x => x.dataset.nombre));
      check(apagadas.length === 3 && !apagadas.includes('Nico') && !apagadas.includes('Enzo'), 'las cartas sin puntos, atenuadas', apagadas.join());
      check(!await page.$eval('[data-enviar]', b => b.disabled), '«Enviar voto» activo con los 3');
      await foto('2-repartido');

      await page.click(`${carta('Enzo')} [data-menos]`);
      check(await puntos('Enzo') === '0', 'el botón «−» quita un punto');
      await page.click(carta('Enzo'));
      const b = await (await page.$(carta('Nico'))).boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down(); await dormir(600); await page.mouse.up();
      await dormir(50);
      check(await puntos('Nico') === '1', 'mantener pulsado quita un punto y no suma otro', await puntos('Nico'));
      await page.click(carta('Nico'));

      // Con el reparto a medias, un refresco de datos no lo pierde
      await page.evaluate(() => refrescarMVPs());
      await dormir(150);
      check(await puntos('Nico') === '2', 'el refresco no pierde los puntos');

      // Confirmación y «enviando…» hasta que responde
      await page.click('[data-enviar]');
      await page.waitForSelector('#mvpModal.open');
      check((await texto(page, '#mvpConfirmarTexto')).includes('Nico 2 · Enzo 1'), 'confirmación con lo que se vota');
      await foto('3-confirmar');
      red.fallarPost = true;
      await page.click('#mvpConfirmarSi');
      await page.waitForSelector('.aviso-app.visible');
      await dormir(100);
      check(!await page.$eval('[data-enviar]', b => b.disabled), 'sin red: se puede reintentar');
      check(await puntos('Nico') === '2', 'sin red: no pierde el reparto');
      check(gas.hojas.MVPs.length === 16, 'sin red: no hay fila nueva');

      red.fallarPost = false; red.responderTarde = 600;
      await page.click('[data-enviar]');
      await page.waitForSelector('#mvpModal.open');
      await page.click('#mvpConfirmarSi');
      await dormir(100);
      check(await texto(page, '[data-enviar]') === 'enviando…' && await page.$eval('[data-enviar]', b => b.disabled), 'el botón se queda en «enviando…»');
      await page.waitForSelector('.mvp-tuvoto');
      red.responderTarde = 0;
      const ultima = gas.hojas.MVPs.at(-1);
      check(ultima[0] === '8' && ultima[1] === 'Markis' && ultima[2] === 'Nico' && ultima[3] === '2' && ultima[4] === 'Enzo' && ultima[5] === '1', 'fila en la hoja MVPs, con el nombre canónico', ultima.join());
      check(red.posts.at(-1).action === 'votarMVP' && red.posts.at(-1).votante === 'Markis', 'la web manda votarMVP');

      /* ── b) Abierta y ya has votado ─────────────────────────────────────── */
      check(await texto(page, '.mvp-tuvoto') === 'Tu voto: Nico 2 · Enzo 1', '«Tu voto» aparte', await texto(page, '.mvp-tuvoto'));
      check((await texto(page, '.mvp-cuenta')).startsWith('3 de 6 han votado'), 'recuento «3 de 6»', await texto(page, '.mvp-cuenta'));
      check((await texto(page, '.mvp-cuenta')).includes('Se cierra en'), 'y cuánto falta');
      const fila1 = await texto(page, '.mvp-fila');
      check(fila1.includes('Nico') && fila1.includes('7'), 'ranking parcial con los puntos', fila1);
      check(await page.$('.mvp-ranking details') === null && await page.$('.mvp-votos') === null, 'abierta: no se ve quién votó a quién');
      check(await page.evaluate(() => localStorage.getItem('mvp_votado_8') !== null), 'marcado en localStorage');
      await foto('4-votado');

      // La verdad es la hoja: recargando sigue votado; y si la hoja no lo tiene, se olvida
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => STATE.ultimaCarga > 0);
      await page.$eval('.tab[data-tab="inicio"]', t => t.click());   // había quedado en #mvp
      check(await page.$('.pendiente-mvp') === null, 'al recargar, el MVP ya no está pendiente');
      check(await page.$('#pendientes') === null, 'nada pendiente: ni el contenedor');
      await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('mvp_votado_8')); v.t = 0; localStorage.setItem('mvp_votado_8', JSON.stringify(v)); });
      gas.hojas.MVPs.pop();
      await page.waitForFunction(() => !recargaEnCurso);   // la carga del arranque ya ha terminado: esta lee la hoja de nuevo
      await page.evaluate(() => recargarDatos());
      await page.waitForSelector('.pendiente-mvp');
      check(await page.evaluate(() => localStorage.getItem('mvp_votado_8') === null), 'la marca sin fila en la hoja se olvida y vuelve a estar pendiente');

      check(errores.length === 0, 'sin errores en la página', errores.join(' | '));
      await ctx.close();
    }

    /* ── El servidor rechaza: se ve lo que dice la hoja ──────────────────── */
    {
      const { ctx, page, gas, errores } = await abrir(navegador, ancho, 'Marcos', hojasBase());
      await irMVP(page);
      await page.waitForSelector('.mvp-reparto');
      await page.click('.mvp-carta[data-nombre="Nico"]'); await page.click('.mvp-carta[data-nombre="Nico"]'); await page.click('.mvp-carta[data-nombre="Nico"]');
      gas.hojas.MVPs.push(voto(8, 'Markis', ['Enzo', 3]));     // ya votó desde otro móvil
      await page.click('[data-enviar]');
      await page.waitForSelector('#mvpModal.open');
      await page.click('#mvpConfirmarSi');
      await page.waitForSelector('.aviso-app.visible');
      check((await texto(page, '.aviso-app')).includes('Ya has votado'), 'muestra el mensaje del script');
      await page.waitForSelector('.mvp-tuvoto');
      check(await texto(page, '.mvp-tuvoto') === 'Tu voto: Enzo 3', 'y pasa a lo que dice la hoja');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── c) Abierta y no jugaste; sin sesión ─────────────────────────────── */
    {
      const { ctx, page, foto, errores } = await abrir(navegador, ancho, 'Mateo', hojasBase());
      check(await page.$('.pendiente-mvp') === null, 'no jugó: sin tarjeta de MVP pendiente');
      await irMVP(page);
      await page.waitForSelector('.mvp-aviso');
      check(await texto(page, '.mvp-nav__titulo') === 'JORNADA 8 · MVP', 'sin nada pendiente: la última oficial (no el amistoso)');
      const t = await texto(page, '.mvp-aviso');
      check(t.includes('Votación en curso') && t.includes('2 de 6 han votado') && t.includes('Se cierra en'), 'en curso, recuento y cierre', t);
      check(await page.$('.mvp-ranking') === null, 'sin resultados');
      await foto('5-en-curso');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();

      const s = await abrir(navegador, ancho, null, hojasBase());
      check(await s.page.$('#pendientes') === null, 'sin sesión: sin Pendientes');
      await irMVP(s.page);
      await s.page.waitForSelector('[data-mvp-login]');
      check(true, 'sin sesión: ve el estado y puede iniciar sesión');
      await s.ctx.close();
    }

    /* ── d) Cerradas, empates, a mano; e) sin votos; navegación ──────────── */
    {
      const { ctx, page, foto, errores } = await abrir(navegador, ancho, 'Mateo', hojasBase());
      await irJornada(page, 1);
      check((await texto(page, '.mvp-banner')).includes('🏆 Nico'), 'cerrada: MVP destacado');
      check(!(await texto(page, '.mvp-banner')).includes('mano'), 'por votos: sin marca de «a mano»');
      check(await texto(page, '.mvp-cuenta') === '3 de 6 votaron', '«3 de 6 votaron»');
      check((await texto(page, '.mvp-fila--ganador')).includes('Nico'), 'fila del ganador destacada');
      await page.click('details.mvp-fila--ganador summary');
      const quien = await page.$$eval('details.mvp-fila--ganador .mvp-quien', q => q.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      check(quien.length === 3 && quien.some(q => q.replace(/ /g, '').endsWith('Markis2')), 'desplegar: quién le votó y cuántos puntos', quien.join(' | '));
      check(await page.$$eval('details.mvp-fila--ganador .mvp-quien .mvp-quien__foto', f => f.length) === 3, 'con foto pequeña (o su inicial)');
      const votos = await page.$$eval('.mvp-votos .mvp-quien', q => q.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      check(votos.length === 3 && votos.some(v => v.includes('Nico 2 · Enzo 1')), '«Votos de cada uno»', votos.join(' | '));
      check((await texto(page, '.mvp-vista')).includes('No votaron: Nico, De la Mano 🏆, Borja'), 'y quién no votó');
      check(await sinScrollLateral(page), 'cerrada sin scroll lateral');
      await foto('6-cerrada');

      await irJornada(page, 2);
      check((await texto(page, '.mvp-banner')).includes('🏆 Enzo'), 'empate a puntos: gana el de más votantes');
      await irJornada(page, 3);
      check((await texto(page, '.mvp-banner')).includes('🏆 Nico'), 'empate a puntos y votantes: gana el de más veces 3');
      await irJornada(page, 4);
      const dec = await texto(page, '.mvp-banner');
      check(dec.includes('MVP por decidir') && dec.includes('Enzo, Nico') && !dec.includes('🏆'), 'empate total: «MVP por decidir»', dec);
      check(await page.$('.mvp-fila--ganador') === null, 'sin ganador destacado');
      await foto('7-por-decidir');
      await irJornada(page, 5);
      const man = await texto(page, '.mvp-banner');
      check(man.includes('🏆 Nico') && man.includes('Fijado a mano'), 'a mano: manda sobre los votos y se indica', man);
      await irJornada(page, 6);
      check((await texto(page, '.mvp-aviso')).includes('No hubo votación') && (await texto(page, '.mvp-banner')).includes('🏆 Mateo') && !(await texto(page, '.mvp-banner')).includes('mano'), 'sin votos con la columna mvp');
      await irJornada(page, 7);
      check((await texto(page, '.mvp-aviso')).includes('No hubo votación') && !await page.$('.mvp-banner'), 'sin votos y sin mvp');

      // Flechas por las oficiales
      await irJornada(page, 1);
      check(await page.$eval('.mvp-nav__flecha:first-child', b => b.disabled), 'en la primera no hay anterior');
      await page.click('.mvp-nav__flecha:last-child');
      check(await texto(page, '.mvp-nav__titulo') === 'JORNADA 2 · MVP', 'la flecha → avanza');
      await page.click('.mvp-nav__flecha:first-child');
      check(await texto(page, '.mvp-nav__titulo') === 'JORNADA 1 · MVP', 'la flecha ← vuelve');
      check((await texto(page, '.mvp-nav__fecha')).length > 5, 'con la fecha del partido');
      await irJornada(page, 8);
      check(await page.$eval('.mvp-nav__flecha:last-child', b => b.disabled), 'el amistoso no entra: la 8 es la última');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── El MVP en el resto de la web y los bloques clicables ────────────── */
    {
      const hojas = hojasBase();
      // El último partido cerrado por votos: la J8 ya no está abierta
      hojas.Jornadas = [CAB_JORNADAS, jornada(1, -40), jornada(2, -38), jornada(5, -32, { mvp: 'Nicolás' })];
      hojas.MVPs = hojas.MVPs.filter(f => f[0] === 'jornada' || f[0] === '1' || f[0] === '2');
      const { ctx, page, foto, errores } = await abrir(navegador, ancho, 'Mateo', hojas);

      check((await texto(page, '.last-match__mvp')) === '🏆 MVP: Nico', 'último partido: «🏆 MVP: Nico»', await texto(page, '.last-match__mvp'));
      const reposo = await page.$eval('.hero__counter', c => getComputedStyle(c).cursor);
      check(reposo === 'pointer', 'contadores con cursor pointer');
      await foto('8-inicio');

      // Tocar el resultado abre el detalle; tocar el MVP abre la pestaña
      await page.click('.last-match__team');
      await page.waitForSelector('#modal.open');
      check((await texto(page, '#modalBox .modal__tag')).startsWith('Jornada 5'), 'el resultado abre su detalle');
      await page.click('#modalBox [data-abrir-mvp]');
      await page.waitForSelector('.mvp-vista');
      check(await page.$('#modal.open') === null && await texto(page, '.mvp-nav__titulo') === 'JORNADA 5 · MVP', 'el MVP del detalle abre la pestaña en esa jornada');

      for (const [sel, tab] of [['[data-ir="resumen"]', 'resumen'], ['[data-ir="plantilla"]', 'plantilla'], ['[data-ir="goleadores"]', 'goleadores']]) {
        await page.click(sel);
        check(await page.evaluate(() => STATE.activeTab) === tab && await page.$eval(`.tab[data-tab="${tab}"]`, t => t.classList.contains('active')), `contador → ${tab}`);
      }
      check(await page.$$eval('.hero__counter', c => c.length) === 3, 'tres contadores (no hay bloque de asistencias)');

      await page.click('[data-ir="plantilla"]');
      await page.waitForSelector('.card-wrap__mvp');
      const marcas = await page.$$eval('.card-wrap', c => Object.fromEntries(c.map(x => [x.dataset.nombre, x.querySelector('.card-wrap__mvp')?.textContent ?? ''])));
      check(marcas.Nico === '🏆 ×2' && marcas.Enzo === '🏆 ×1', 'Plantilla: veces MVP', JSON.stringify(marcas));
      check(marcas.Mateo === '', 'sin marca si nunca lo ha sido');

      await page.$eval('.tab[data-tab="resumen"]', t => t.click());
      await page.click('.result-row[data-jornada="1"]');
      await page.waitForSelector('#modal.open');
      await page.click('#modalBox [data-abrir-mvp]');
      await page.waitForSelector('.mvp-vista');
      check(await texto(page, '.mvp-nav__titulo') === 'JORNADA 1 · MVP', 'Resumen: el MVP abre la pestaña en esa jornada');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── Hoja aún sin crear, y sin poder leerla ──────────────────────────── */
    {
      const hojas = hojasBase();
      delete hojas.MVPs;
      const { ctx, page, gas, red, errores } = await abrir(navegador, ancho, 'Marcos', hojas);
      check(await page.$('.pendiente-mvp') !== null, 'sin la hoja MVPs todavía: se puede votar');
      await page.evaluate(() => abrirMVP(8));
      await page.click('.mvp-carta[data-nombre="Nico"]'); await page.click('.mvp-carta[data-nombre="Nico"]'); await page.click('.mvp-carta[data-nombre="Nico"]');
      await page.click('[data-enviar]');
      await page.waitForSelector('#mvpModal.open');
      await page.click('#mvpConfirmarSi');
      await page.waitForSelector('.mvp-tuvoto');
      check(gas.hojas.MVPs?.[0]?.[0] === 'jornada' && gas.hojas.MVPs.length === 2, 'el script crea la hoja con su cabecera');
      check(errores.length === 0, 'sin errores', errores.join());

      await ctx.close();

      // Sin poder leerla (ni nada guardado): se dice, no se inventa «No hubo votación»
      const c2 = await abrir(navegador, ancho, 'Marcos', hojasBase(), { mvpsMal: true });
      check(await c2.page.$('.pendiente-mvp') === null, 'sin poder leer los votos: no se ofrece votar');
      await irMVP(c2.page);
      await c2.page.waitForSelector('[data-mvp-reintentar]');
      check(true, 'avisa y deja reintentar');
      c2.red.leerMVPsMal = false;
      await c2.page.click('[data-mvp-reintentar]');
      await c2.page.waitForSelector('.mvp-reparto');
      check(true, 'al reintentar, la votación');
      await c2.ctx.close();
    }

    /* ── Sin partidos ────────────────────────────────────────────────────── */
    {
      const hojas = hojasBase();
      hojas.Jornadas = [CAB_JORNADAS];
      const ctx = await navegador.newContext({ viewport: { width: ancho, height: 800 }, serviceWorkers: 'block' });
      const gas = crearGas(hojas);
      await ctx.route('**/sheets.googleapis.com/**', r => {
        const hoja = decodeURIComponent(new URL(r.request().url()).pathname.split('/values/')[1]);
        r.fulfill(respuesta(gas.hojas[hoja]));
      });
      await ctx.route('**/www.googleapis.com/calendar/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"items":[]}' }));
      await ctx.route('**/onesignal.com/**', r => r.abort());
      const page = await ctx.newPage();
      await page.goto(URL_APP, { waitUntil: 'load' });
      await page.waitForFunction(() => STATE.ultimaCarga > 0);
      await irMVP(page);
      await page.waitForSelector('#panel-mvp .empty');
      check((await texto(page, '#panel-mvp .empty')) === 'Todavía no hay partidos.', '«Todavía no hay partidos.»');
      await ctx.close();
    }
  }
} catch (e) {
  check(false, `Error inesperado: ${e.message.split(/\r?\n/)[0]} ${e.stack.split(/\r?\n/).filter(l => l.includes('mvp.mjs')).join(' ')}`);
} finally {
  await navegador.close();
}
console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
process.exit(mal ? 1 : 0);
