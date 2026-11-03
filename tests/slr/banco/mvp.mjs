// Prueba en el navegador de la votación del MVP, los pendientes y los bloques de Inicio.
//   node tests/slr/banco/mvp.mjs   (servidor en http://localhost:3000; npm install en tests/slr/banco)
// A 360 y 412 px. Las hojas son de mentira y el Apps Script es el de verdad (apps-script/votos.gs)
// corriendo en gas-falso.mjs: la hoja real ni se lee ni se escribe.
// Dos temporadas con números repetidos:
//   1.ª: J1 cerrada con votos · J2 empate a puntos (votantes) · J3 empate a puntos y votantes (veces 3)
//        J4 empate total · J5 con mvp a mano y votos · J6 sin votos con mvp a mano · J7 sin votos
//   2.ª: J1, la abierta, hace 20 días (sin plazo). Después, un amistoso.
// En cada partido, Borja es un sustituto sin ficha: ni vota, ni se le vota, ni cuenta.
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
const LOCAL = 'Markis, Nico, Enzo', VIS = 'Pablín, De la Mano, Borja ';
const jornada = (numero, fecha, extra = {}) => fila(CAB_JORNADAS, { numero, fecha, local: 'Markis', visitante: 'Pablín', goles_local: 3, goles_visitante: 2,
  jugadores_local: LOCAL, jugadores_visitante: VIS, capitan_local: 'Markis', capitan_visitante: 'Pablín', amistoso: 'FALSE', ...extra });
const voto = (fecha, votante, ...p) => fila(CAB_MVPS, Object.assign({ fecha_partido: fecha, jornada: 0, votante, fecha_voto: `${dia(-40)} 12:00:00` },
  ...p.map(([nombre, puntos], i) => ({ [`voto_${i + 1}`]: nombre, [`puntos_${i + 1}`]: puntos }))));

const S1 = n => dia(-200 + n * 2);   // la fecha de la jornada n de la 1.ª temporada
const ABIERTA = dia(-20);            // la J1 de la 2.ª temporada

const hojasBase = () => ({
  Jugadores: jugadores,
  Jornadas: [CAB_JORNADAS,
    jornada(1, S1(1)), jornada(2, S1(2)), jornada(3, S1(3)), jornada(4, S1(4)),
    jornada(5, S1(5), { mvp: 'Nicolás' }), jornada(6, S1(6), { mvp: 'Mateo' }), jornada(7, S1(7)),
    jornada(1, ABIERTA, { local: 'Temporada2', goles_local: 7 }),
    jornada('', dia(-1), { amistoso: 'TRUE' }),
  ],
  Votaciones: [CAB_VOTACIONES,
    fila(CAB_VOTACIONES, { id: '1', fecha: dia(5), hora: '20:00', lugar: 'Campo A', jugadores_si: 'Nico' }),
    fila(CAB_VOTACIONES, { id: '2', fecha: dia(9), hora: '20:00', lugar: 'Campo B' }),
    fila(CAB_VOTACIONES, { id: '3', fecha: dia(-3), hora: '20:00', lugar: 'Pasada' }),
  ],
  MVPs: [CAB_MVPS,
    voto(S1(1), 'Markis', ['Nico', 2], ['Enzo', 1]), voto(S1(1), 'Pablín', ['Nico', 3]), voto(S1(1), 'Enzo', ['Nico', 1], ['Markis', 2]),
    // J2: Nico 3 de uno; Enzo 3 de dos → Enzo
    voto(S1(2), 'Markis', ['Nico', 3]), voto(S1(2), 'Pablín', ['Enzo', 1], ['De la Mano', 2]), voto(S1(2), 'Nico', ['Enzo', 2], ['Pablín', 1]),
    // J3: Nico 5 con un 3; Enzo 5 sin 3, tres votantes cada uno → Nico
    voto(S1(3), 'Markis', ['Nico', 3]), voto(S1(3), 'Pablín', ['Nico', 1], ['Enzo', 2]), voto(S1(3), 'De la Mano', ['Nico', 1], ['Enzo', 2]), voto(S1(3), 'Nico', ['Enzo', 1], ['Markis', 2]),
    // J4: empate total
    voto(S1(4), 'Markis', ['Nico', 2], ['Enzo', 1]), voto(S1(4), 'Pablín', ['Nico', 1], ['Enzo', 2]),
    voto(S1(5), 'Markis', ['Enzo', 3]),
    voto(ABIERTA, 'Pablín', ['Nico', 2], ['Enzo', 1]), voto(ABIERTA, 'De la Mano', ['Nico', 3]),
    // Una fila de un sustituto, a mano en la hoja: no cuenta
    voto(ABIERTA, 'Borja', ['Nico', 3]),
  ],
});

const CORS = { 'Access-Control-Allow-Origin': '*' };
const respuesta = valores => ({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ values: valores }) });

// Una sesión de la web a un ancho, sobre sus propias hojas
async function abrir(navegador, ancho, jugador, hojas, opciones = {}) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: 800 }, hasTouch: true, serviceWorkers: 'block', deviceScaleFactor: 2 });
  const gas = crearGas(hojas);
  const red = { posts: [], fallarPost: false, responderTarde: 0, leerMVPsMal: !!opciones.mvpsMal, retrasoMVPs: 0 };
  await ctx.addInitScript(([j, previo]) => {
    if (sessionStorage.getItem('__listo')) return;
    sessionStorage.setItem('__listo', '1');
    if (j) { localStorage.setItem('SESSION_PLAYER', j); localStorage.setItem('SESSION_CODE', 'prueba'); }
    for (const [k, v] of Object.entries(previo ?? {})) localStorage.setItem(k, v);
  }, [jugador, opciones.localStorage]);
  await ctx.route('**/sheets.googleapis.com/**', async r => {
    const hoja = decodeURIComponent(new URL(r.request().url()).pathname.split('/values/')[1]);
    if (hoja === 'MVPs' && red.retrasoMVPs) await dormir(red.retrasoMVPs);
    if (hoja === 'MVPs' && red.leerMVPsMal) return r.fulfill({ status: 500, body: 'error', headers: CORS });
    if (!gas.hojas[hoja]) return r.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: '{"error":{"code":400}}' });
    return r.fulfill(respuesta(gas.hojas[hoja]));
  });
  await ctx.route('**/www.googleapis.com/calendar/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '{"items":[]}' }));
  await ctx.route('**/res.cloudinary.com/**', r => r.abort());
  await ctx.route('**/onesignal.com/**', r => r.abort());
  // Sin Rush: el código de esta sesión es inventado y el servidor la cerraría
  await ctx.route('**/*.supabase.co/**', r => r.abort());
  await ctx.route('**/script.google.com/**', async r => {
    const texto = r.request().postData();
    red.posts.push(JSON.parse(texto));
    if (red.responderTarde) await dormir(red.responderTarde);
    if (red.fallarPost) return r.abort('failed');
    r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(gas.post(texto)) });
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.goto(URL_APP + (opciones.hash ?? ''), { waitUntil: 'load' });
  await page.waitForFunction(() => STATE.ultimaCarga > 0 && document.querySelector('.hero__counter') && !mvpLeyendo);
  const foto = async n => { if (SALIDA) await page.screenshot({ path: `${SALIDA}/mvp-${ancho}-${n}.png`, fullPage: false }); };
  return { ctx, page, gas, red, errores, foto };
}
// Con el clic del propio botón: durante el scroll suave de la página, un toque por coordenadas puede caer en la cabecera
const irTab = (page, tab) => page.$eval(`.tab[data-tab="${tab}"]`, t => t.click());
const leido = page => page.waitForFunction(() => !mvpLeyendo && !recargaEnCurso);
const irMVP = async page => { await irTab(page, 'mvp'); await leido(page); };
const irPartido = async (page, fecha) => {
  await page.evaluate(f => abrirMVP(f), fecha);
  await leido(page);
  await page.waitForFunction(f => mvpElegida === f && document.querySelector('.mvp-vista'), fecha);
};
const texto = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const sinScrollLateral = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const CIERRE = 'Se cierra cuando voten todos o cuando se juegue el siguiente partido';
const repartir = async (page, ...nombres) => { for (const n of nombres) await page.click(`.mvp-carta[data-nombre="${n}"]`); };
const enviar = async page => {
  await page.click('[data-enviar]');
  await page.waitForSelector('#mvpModal.open');
  await page.click('#mvpConfirmarSi');
};

const navegador = await chromium.launch();
try {
  for (const ancho of [360, 412]) {
    console.log(`\n== ${ancho} px`);

    /* ── a) Abierta, jugaste y no has votado ─────────────────────────────── */
    {
      const { ctx, page, gas, red, errores, foto } = await abrir(navegador, ancho, 'Marcos', hojasBase(), {
        localStorage: { mvp_votado_1: JSON.stringify({ jornada: 1, votante: 'Markis', votos: [{ nombre: 'Enzo', puntos: 3 }], t: Date.now() }) },
      });
      check(await page.evaluate(() => document.querySelector('.tab[data-tab="votacion"]').nextElementSibling.dataset.tab === 'mvp'), 'pestaña MVP justo después de Votación');
      check(await page.evaluate(() => localStorage.getItem('mvp_votado_1') === null), 'el «ya he votado» del móvil se borra');

      // El último partido de Inicio es el último por fecha, aunque repita número
      check((await texto(page, '.last-match__tag')).startsWith('JORNADA 1 ') && (await texto(page, '.last-match__team-name')).startsWith('Temporada2'), 'último partido por fecha, no por número');

      // Pendientes en Inicio
      check(await page.$('#pendientes') !== null, 'bloque Pendientes con cosas por hacer');
      const orden = await page.evaluate(() => { const v = e => document.querySelector(e).getBoundingClientRect(); return [v('#pendientes').bottom <= v('.hero__counters').top + 1, v('.pendientes__pila').top < v('.pendiente-mvp').top]; });
      check(orden.every(Boolean), 'antes de las estadísticas; primero las votaciones', JSON.stringify(orden));
      check(await texto(page, '.pendiente-mvp span') === 'Vota el MVP de la Jornada 1', 'tarjeta «Vota el MVP de la Jornada 1»');
      const alturas = await page.evaluate(() => { const c = document.querySelector('.pendientes .voto--compacta .voto-card').getBoundingClientRect(); return c.height / (c.width * 5 / 4); });
      check(alturas > 0.55 && alturas < 0.65, 'la carta con el 60 % de la altura normal', alturas.toFixed(2));
      check(await sinScrollLateral(page), 'Inicio sin scroll lateral');
      await foto('1-inicio');

      // Swipe a la derecha = sí
      await page.evaluate(() => document.querySelector('.voto--compacta').scrollIntoView({ block: 'center', behavior: 'instant' }));
      await dormir(100);
      await foto('1-pendientes');
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
      check(gas.hojas.Votaciones[2][CAB_VOTACIONES.indexOf('jugadores_no')].includes('Marcos'), 'reintento guardado; sin cartas, la pila desaparece');
      check(await page.$('#pendientes') !== null, 'sigue el bloque por el MVP');

      // «Votar →» abre la pestaña en ese partido
      await page.click('.pendiente-mvp__btn');
      await page.waitForSelector('.mvp-reparto');
      await page.waitForFunction(() => !document.body.classList.contains('asentando'));
      check(await texto(page, '.mvp-nav__titulo') === 'JORNADA 1 · MVP', 'abre la pestaña MVP en la J1 de la temporada nueva');
      check((await page.evaluate(() => mvpElegida)) === ABIERTA, 'identificada por su fecha');
      check((await texto(page, '.mvp-nav__fecha')).length > 5, 'con la fecha del partido', await texto(page, '.mvp-nav__fecha'));
      check(await page.$eval('#pendientes', p => { const r = p.getBoundingClientRect(); return r.right <= 0 || r.left >= innerWidth || getComputedStyle(p).visibility === 'hidden'; }), 'Pendientes solo en Inicio');
      check(await texto(page, '.mvp-falta') === CIERRE, 'el texto del cierre, sin cuenta atrás', await texto(page, '.mvp-falta'));
      check(await texto(page, '.mvp-quedan') === 'Te quedan 3 puntos', '«Te quedan 3 puntos»');
      const cartas = await page.$$eval('.mvp-carta', c => c.map(x => x.dataset.nombre));
      check(cartas.length === 4 && !cartas.includes('Markis'), 'las cartas del partido, sin ti', cartas.join());
      check(!cartas.includes('Borja') && cartas.includes('De la Mano 🏆'), 'sin el sustituto sin ficha y con «De la Mano»');
      check(await page.$eval('[data-enviar]', b => b.disabled), '«Enviar voto» desactivado sin los 3 puntos');
      check(await sinScrollLateral(page), 'votación sin scroll lateral');

      // Repartir: tocar suma; sin puntos no hace nada; «−» y mantener pulsado quitan
      const carta = n => `.mvp-carta[data-nombre="${n}"]`;
      const puntos = n => texto(page, `${carta(n)} [data-puntos]`);
      await repartir(page, 'Nico', 'Nico');
      check(await puntos('Nico') === '2', 'tocar suma un punto');
      check(await texto(page, '.mvp-quedan') === 'Te queda 1 punto', '«Te queda 1 punto»');
      await repartir(page, 'Enzo');
      check(await texto(page, '.mvp-quedan') === 'Puntos repartidos', 'los 3 repartidos');
      await repartir(page, 'Pablín');
      check(await puntos('Pablín') === '0', 'sin puntos, tocar no hace nada');
      const apagadas = await page.$$eval('.mvp-carta--apagada', c => c.map(x => x.dataset.nombre));
      check(apagadas.length === 2 && !apagadas.includes('Nico') && !apagadas.includes('Enzo'), 'las cartas sin puntos, atenuadas', apagadas.join());
      check(!await page.$eval('[data-enviar]', b => b.disabled), '«Enviar voto» activo con los 3');
      await foto('2-repartido');

      await page.click(`${carta('Enzo')} [data-menos]`);
      check(await puntos('Enzo') === '0', 'el botón «−» quita un punto');
      await repartir(page, 'Enzo');
      const b = await (await page.$(carta('Nico'))).boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down(); await dormir(600); await page.mouse.up();
      await dormir(50);
      check(await puntos('Nico') === '1', 'mantener pulsado quita un punto y no suma otro', await puntos('Nico'));
      await repartir(page, 'Nico');

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
      check(!await page.$eval('[data-enviar]', b => b.disabled) && await puntos('Nico') === '2', 'sin red: se puede reintentar sin perder el reparto');
      check(gas.hojas.MVPs.length === 17, 'sin red: no hay fila nueva', String(gas.hojas.MVPs.length));

      red.fallarPost = false; red.responderTarde = 600;
      await enviar(page);
      await dormir(100);
      check(await texto(page, '[data-enviar]') === 'enviando…' && await page.$eval('[data-enviar]', b => b.disabled), 'el botón se queda en «enviando…»');
      await page.waitForSelector('.mvp-tuvoto');
      red.responderTarde = 0;
      const ultima = gas.hojas.MVPs.at(-1);
      check(ultima.slice(0, 7).join() === `${ABIERTA},1,Markis,Nico,2,Enzo,1`, 'fila con la fecha del partido, la jornada y el nombre canónico', ultima.join());
      check(red.posts.at(-1).action === 'votarMVP' && red.posts.at(-1).fecha === ABIERTA, 'la web manda la fecha');

      /* ── b) Abierta y ya has votado ─────────────────────────────────────── */
      check(await texto(page, '.mvp-tuvoto') === 'Tu voto: Nico 2 · Enzo 1', '«Tu voto» aparte', await texto(page, '.mvp-tuvoto'));
      check((await texto(page, '.mvp-cuenta')).startsWith('3 de 5 han votado'), 'recuento «3 de 5»: ni el sustituto ni su fila cuentan', await texto(page, '.mvp-cuenta'));
      check((await texto(page, '.mvp-cuenta')).includes(CIERRE), 'y cuándo se cierra');
      const fila1 = await texto(page, '.mvp-fila');
      check(fila1.includes('Nico') && fila1.includes('7'), 'ranking parcial: Nico 7, sin los 3 del sustituto', fila1);
      check(await page.$('.mvp-ranking details') === null && await page.$('.mvp-votos') === null, 'abierta: no se ve quién votó a quién');
      check(await page.evaluate(() => !Object.keys(localStorage).some(k => k.startsWith('mvp_votado_'))), 'nada guardado en el móvil');
      check(!(await page.$$eval('.mvp-fila__nombre', f => f.map(x => x.textContent))).some(n => n.includes('Borja')), 'el sustituto no está en el ranking');
      await foto('4-votado');

      /* ── La verdad es la hoja ──────────────────────────────────────────── */
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => STATE.ultimaCarga > 0);
      await leido(page);
      await irTab(page, 'inicio');
      await leido(page);
      check(await page.$('.pendiente-mvp') === null, 'al recargar, el MVP ya no está pendiente');
      check(await page.$('#pendientes') === null, 'nada pendiente: ni el contenedor');

      // Con rueda mientras llega la hoja, en Inicio y en la pestaña
      red.retrasoMVPs = 400;
      await irTab(page, 'resumen');
      await irTab(page, 'inicio');
      await dormir(100);
      check(await page.$('.pendiente-mvp--rueda') !== null, 'Inicio: la rueda mientras llega la hoja');
      await leido(page);
      check(await page.$('#pendientes') === null, 'con el voto en la hoja, sin rueda ni contenedor');
      await irTab(page, 'mvp');
      await dormir(100);
      check(await page.$('#panel-mvp .mvp-rueda') !== null && await page.$('.mvp-vista') === null, 'pestaña: solo la rueda hasta que llega la hoja');
      await leido(page);
      check(await page.$('.mvp-tuvoto') !== null, 'y después, lo de la hoja');
      red.retrasoMVPs = 0;

      // Borrar su fila: al abrir, se puede votar otra vez
      gas.hojas.MVPs.pop();
      await irTab(page, 'resumen');
      await irMVP(page);
      await page.waitForSelector('.mvp-reparto');
      check(true, 'fila borrada en la hoja: la pestaña deja votar otra vez');

      // Votar, borrar la hoja entera y volver a Inicio: el aviso vuelve y se vota de nuevo
      await repartir(page, 'Enzo', 'Enzo', 'Enzo');
      await enviar(page);
      await page.waitForSelector('.mvp-tuvoto');
      delete gas.hojas.MVPs;
      await irTab(page, 'inicio');
      await leido(page);
      await page.waitForSelector('.pendiente-mvp');
      check(true, 'hoja MVPs borrada con un voto hecho: vuelve el aviso');
      await page.click('.pendiente-mvp__btn');
      await page.waitForSelector('.mvp-reparto');
      await repartir(page, 'Nico', 'Nico', 'Nico');
      await enviar(page);
      await page.waitForSelector('.mvp-tuvoto');
      check(gas.hojas.MVPs?.[0]?.[0] === 'fecha_partido' && gas.hojas.MVPs.length === 2, 'y el script crea la hoja con su cabecera al votar');
      check((await texto(page, '.mvp-cuenta')).startsWith('1 de 5'), 'sin votos de antes', await texto(page, '.mvp-cuenta'));

      check(errores.length === 0, 'sin errores en la página', errores.join(' | '));
      await ctx.close();
    }

    /* ── Se cierra al votar todos ────────────────────────────────────────── */
    {
      const hojas = hojasBase();
      hojas.MVPs.push(voto(ABIERTA, 'Nico', ['Enzo', 3]), voto(ABIERTA, 'Enzo', ['Nico', 3]));   // faltas tú
      const { ctx, page, gas, foto, errores } = await abrir(navegador, ancho, 'Marcos', hojas);
      await irMVP(page);
      await page.waitForSelector('.mvp-reparto');
      await repartir(page, 'Nico', 'Nico', 'Nico');
      await enviar(page);
      await page.waitForSelector('.mvp-banner');
      const v = await page.$eval('.mvp-vista', e => e.dataset.estado);
      check(v === 'cerrada', 'el último voto la cierra', v);
      check(await texto(page, '.mvp-cuenta') === '5 de 5 votaron', '«5 de 5 votaron»');
      check((await texto(page, '.mvp-banner')).includes('🏆 Nico'), 'con su MVP');
      check(await page.$('.mvp-votos') !== null, 'y ya se ve quién votó a quién');
      await foto('5-cerrada-todos');
      // Si se borra un voto de la hoja, se reabre
      gas.hojas.MVPs.pop();
      await irTab(page, 'inicio');
      await leido(page);
      await page.waitForSelector('.pendiente-mvp');
      check(true, 'borrado un voto en la hoja, se reabre');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── Se cierra por un partido posterior, con el número repetido ──────── */
    {
      const { ctx, page, gas, errores } = await abrir(navegador, ancho, 'Marcos', hojasBase());
      await irMVP(page);
      await page.waitForSelector('.mvp-reparto');
      // Se juega el siguiente partido con la pestaña abierta: el script rechaza y se ve la hoja
      const NUEVA = dia(-2);
      gas.hojas.Jornadas.push(jornada(2, NUEVA, { jugadores_local: 'Markis, Nico', jugadores_visitante: 'Enzo, Puebla' }));
      await repartir(page, 'Nico', 'Nico', 'Nico');
      await enviar(page);
      await page.waitForSelector('.aviso-app.visible');
      check((await texto(page, '.aviso-app')).includes('cerrada'), 'el script rechaza: ya está cerrada', await texto(page, '.aviso-app'));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => STATE.ultimaCarga > 0);
      await leido(page);
      await irTab(page, 'mvp');
      await leido(page);
      await page.waitForSelector('.mvp-reparto');
      check(await texto(page, '.mvp-nav__titulo') === 'JORNADA 2 · MVP', 'la abierta pasa a ser la del último partido');
      await page.$eval('.mvp-nav__flecha:first-child', b => b.click());
      await page.waitForSelector('.mvp-vista[data-estado="cerrada"]');
      check(await texto(page, '.mvp-nav__titulo') === 'JORNADA 1 · MVP', '← vuelve al J1 de esa temporada, ya cerrado');
      check(await texto(page, '.mvp-cuenta') === '2 de 5 votaron', 'con sus votos, no los del otro J1', await texto(page, '.mvp-cuenta'));
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── c) Abierta y no jugaste; sin ficha; sin sesión ──────────────────── */
    {
      const { ctx, page, foto, errores } = await abrir(navegador, ancho, 'Mateo', hojasBase());
      check(await page.$('.pendiente-mvp') === null, 'no jugó: sin tarjeta de MVP pendiente');
      await irMVP(page);
      await page.waitForSelector('.mvp-aviso');
      check(await texto(page, '.mvp-nav__titulo') === 'JORNADA 1 · MVP', 'sin nada pendiente: el último oficial (no el amistoso)');
      const t = await texto(page, '.mvp-aviso');
      check(t.includes('Votación en curso') && t.includes('2 de 5 han votado') && t.includes(CIERRE), 'en curso, recuento y cierre', t);
      check(await page.$('.mvp-ranking') === null, 'sin resultados');
      await foto('6-en-curso');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();

      const b = await abrir(navegador, ancho, 'Borja', hojasBase());
      check(await b.page.$('.pendiente-mvp') === null, 'un sustituto sin ficha con sesión: sin aviso de MVP');
      await irMVP(b.page);
      await b.page.waitForSelector('.mvp-aviso');
      check(await b.page.$('.mvp-reparto') === null && await b.page.$('[data-mvp-login]') === null, 'no puede votar, y tampoco se le pide iniciar sesión');
      await b.ctx.close();

      const s = await abrir(navegador, ancho, null, hojasBase());
      check(await s.page.$('#pendientes') === null, 'sin sesión: sin Pendientes');
      await irMVP(s.page);
      await s.page.waitForSelector('[data-mvp-login]');
      check(true, 'sin sesión: ve el estado y puede iniciar sesión');
      await s.ctx.close();
    }

    /* ── d) Cerradas, empates, a mano; e) sin votos; flechas ─────────────── */
    {
      const { ctx, page, foto, errores } = await abrir(navegador, ancho, 'Mateo', hojasBase());
      await irPartido(page, S1(1));
      check((await texto(page, '.mvp-banner')).includes('🏆 Nico'), 'cerrada: MVP destacado');
      check(!(await texto(page, '.mvp-banner')).includes('mano'), 'por votos: sin marca de «a mano»');
      check(await texto(page, '.mvp-cuenta') === '3 de 5 votaron', '«3 de 5 votaron»');
      check((await texto(page, '.mvp-fila--ganador')).includes('Nico'), 'fila del ganador destacada');
      await page.click('details.mvp-fila--ganador summary');
      const quien = await page.$$eval('details.mvp-fila--ganador .mvp-quien', q => q.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      check(quien.length === 3 && quien.some(q => q.replace(/ /g, '').endsWith('Markis2')), 'desplegar: quién le votó y cuántos puntos', quien.join(' | '));
      check(await page.$$eval('details.mvp-fila--ganador .mvp-quien .mvp-quien__foto', f => f.length) === 3, 'con foto pequeña (o su inicial)');
      const votos = await page.$$eval('.mvp-votos .mvp-quien', q => q.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      check(votos.length === 3 && votos.some(v => v.includes('Nico 2 · Enzo 1')), '«Votos de cada uno»', votos.join(' | '));
      check((await texto(page, '.mvp-vista')).includes('No votaron: Nico, De la Mano 🏆'), 'y quién no votó, sin el sustituto', await texto(page, '.mvp-pista'));
      check(await sinScrollLateral(page), 'cerrada sin scroll lateral');
      await foto('7-cerrada');

      await irPartido(page, S1(2));
      check((await texto(page, '.mvp-banner')).includes('🏆 Enzo'), 'empate a puntos: gana el de más votantes');
      await irPartido(page, S1(3));
      check((await texto(page, '.mvp-banner')).includes('🏆 Nico'), 'empate a puntos y votantes: gana el de más veces 3');
      await irPartido(page, S1(4));
      const dec = await texto(page, '.mvp-banner');
      check(dec.includes('MVP por decidir') && dec.includes('Enzo, Nico') && !dec.includes('🏆'), 'empate total: «MVP por decidir»', dec);
      check(await page.$('.mvp-fila--ganador') === null, 'sin ganador destacado');
      await foto('8-por-decidir');
      await irPartido(page, S1(5));
      const man = await texto(page, '.mvp-banner');
      check(man.includes('🏆 Nico') && man.includes('Fijado a mano'), 'a mano: manda sobre los votos y se indica', man);
      await irPartido(page, S1(6));
      check((await texto(page, '.mvp-aviso')).includes('No hubo votación') && (await texto(page, '.mvp-banner')).includes('🏆 Mateo') && !(await texto(page, '.mvp-banner')).includes('mano'), 'sin votos con la columna mvp');
      await irPartido(page, S1(7));
      check((await texto(page, '.mvp-aviso')).includes('No hubo votación') && !await page.$('.mvp-banner'), 'sin votos y sin mvp');

      // Flechas por orden de fecha, aunque el número baje
      await page.click('.mvp-nav__flecha:last-child');
      check(await texto(page, '.mvp-nav__titulo') === 'JORNADA 1 · MVP', 'de la J7 a la J1 de la temporada nueva: orden de fecha');
      check(await page.$eval('.mvp-nav__flecha:last-child', b => b.disabled), 'el amistoso no entra: es el último');
      await page.click('.mvp-nav__flecha:first-child');
      check(await texto(page, '.mvp-nav__titulo') === 'JORNADA 7 · MVP', 'la flecha ← vuelve');
      await irPartido(page, S1(1));
      check(await page.$eval('.mvp-nav__flecha:first-child', b => b.disabled), 'en el primero no hay anterior');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── El MVP en el resto de la web y los bloques clicables ────────────── */
    {
      const hojas = hojasBase();
      // Dos temporadas con J1 y el último partido con MVP a mano
      hojas.Jornadas = [CAB_JORNADAS, jornada(1, S1(1)), jornada(2, S1(2)), jornada(1, dia(-30), { mvp: 'Nicolás', local: 'Temporada2' })];
      hojas.MVPs = hojas.MVPs.filter(f => [S1(1), S1(2), 'fecha_partido'].includes(f[0]));
      hojas.Votaciones = [CAB_VOTACIONES];   // sin cartas: se ve el marcador
      const { ctx, page, foto, errores } = await abrir(navegador, ancho, 'Mateo', hojas);

      check((await texto(page, '.last-match__mvp')) === '🏆 MVP: Nico', 'último partido: «🏆 MVP: Nico»', await texto(page, '.last-match__mvp'));
      check(await page.$eval('.hero__counter', c => getComputedStyle(c).cursor) === 'pointer', 'contadores con cursor pointer');
      await foto('9-inicio');

      // Tocar el resultado abre el detalle de ese partido; tocar el MVP abre la pestaña
      await page.click('.last-match__team');
      await page.waitForSelector('#modal.open');
      check((await texto(page, '#modalBox .modal__teams')).startsWith('Temporada2'), 'el resultado abre su detalle, el de esa temporada');
      await page.click('#modalBox [data-abrir-mvp]');
      await leido(page);
      await page.waitForSelector('.mvp-vista');
      check(await page.$('#modal.open') === null && await page.evaluate(() => mvpElegida) === dia(-30), 'el MVP del detalle abre la pestaña en ese partido');

      for (const [sel, tab] of [['[data-ir="resumen"]', 'resumen'], ['[data-ir="plantilla"]', 'plantilla'], ['[data-ir="goleadores"]', 'goleadores']]) {
        await page.$eval(sel, b => b.click());
        check(await page.evaluate(() => STATE.activeTab) === tab && await page.$eval(`.tab[data-tab="${tab}"]`, t => t.classList.contains('active')), `contador → ${tab}`);
      }
      await page.$eval('[data-ir="plantilla"]', b => b.click());
      await page.waitForSelector('.card-wrap[data-nombre="Nico"]');
      check(await page.$('.card-wrap__mvp') === null, 'Plantilla sin marcas de MVP');
      await page.$eval('.card-wrap[data-nombre="Nico"]', c => c.click());
      await page.waitForSelector('#playerModal.open');
      const ficha = await page.$$eval('#playerModalBox .player-modal__stat', s => s.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      check(ficha.some(s => /^2 ?MVPs$/.test(s)), 'las veces MVP, en la ficha', ficha.join(' | '));
      await page.evaluate(() => closeModal('playerModal'));

      // Dos filas con «J01» en Resumen: cada una abre lo suyo
      await irTab(page, 'resumen');
      const filas = await page.$$('.result-row[data-jornada="1"]');
      check(filas.length === 2, 'Resumen: las dos J1');
      const primera = await page.$eval('.results-list .result-row', e => e.dataset.fecha);
      check(primera === dia(-30), 'Resumen en orden de fecha');
      await filas[1].click();
      await page.waitForSelector('#modal.open');
      await page.click('#modalBox [data-abrir-mvp]');
      await leido(page);
      await page.waitForSelector('.mvp-vista');
      check(await page.evaluate(() => mvpElegida) === S1(1), 'la J1 antigua abre su partido, no el otro');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();
    }

    /* ── Hoja sin crear, formato antiguo y sin poder leerla ──────────────── */
    {
      const hojas = hojasBase();
      delete hojas.MVPs;
      const { ctx, page, gas, errores } = await abrir(navegador, ancho, 'Marcos', hojas);
      check(await page.$('.pendiente-mvp') !== null, 'sin la hoja MVPs: como si no hubiera votos');
      await page.evaluate(f => abrirMVP(f), ABIERTA);
      await page.waitForSelector('.mvp-reparto');
      await repartir(page, 'Nico', 'Nico', 'Nico');
      await enviar(page);
      await page.waitForSelector('.mvp-tuvoto');
      check(gas.hojas.MVPs?.[0]?.[0] === 'fecha_partido' && gas.hojas.MVPs.length === 2, 'el script crea la hoja con su cabecera');
      check(errores.length === 0, 'sin errores', errores.join());
      await ctx.close();

      // La hoja de antes, tal cual (sin fecha_partido): se entiende y se convierte con el siguiente voto
      const vieja = hojasBase();
      vieja.Jornadas = [CAB_JORNADAS, jornada(17, ABIERTA)];
      vieja.MVPs = [['jornada', 'votante', 'voto_1', 'puntos_1', 'voto_2', 'puntos_2', 'voto_3', 'puntos_3', 'fecha_voto'],
        ['17', 'Nico', 'Borja', '3', '', '', '', '', '2026-11-02 13:12:06']];
      const v = await abrir(navegador, ancho, 'Marcos', vieja);
      await irMVP(v.page);
      await v.page.waitForSelector('.mvp-reparto');
      await repartir(v.page, 'Enzo', 'Enzo', 'Enzo');
      await enviar(v.page);
      await v.page.waitForSelector('.mvp-tuvoto');
      check((await texto(v.page, '.mvp-cuenta')).startsWith('2 de 5'), 'hoja antigua: su voto cuenta y el nuevo se suma', await texto(v.page, '.mvp-cuenta'));
      check(v.gas.hojas.MVPs[0][0] === 'fecha_partido' && v.gas.hojas.MVPs[1][0] === ABIERTA, 'y queda convertida');
      await v.ctx.close();

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
      const { ctx, page } = await abrir(navegador, ancho, 'Marcos', hojas);
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
