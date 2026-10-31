// Prueba en el navegador de las personas de cada carta y de quién la descubre, a 360 y 412 px:
//   node tests/slr/banco/descubrimientos.mjs   (servidor en http://localhost:3000; npm install en tests/slr/banco)
// · Plantilla, álbum y mercado: buscar por persona sin mayúsculas ni tildes («NICO» → Nicolás).
// · El detalle: «Descubierta por ti · fecha», «Salen:» con un chip por persona y el historial que
//   empieza por «Bot Uno la descubrió» (nunca «Sin movimientos»). El chip abre el catálogo (Bot Uno es
//   el admin de la liga de prueba) filtrado por esa persona.
// · El álbum: «Descubierta por ti» en las que descubrió él.
// · Un sobre: «¡DESCUBRIMIENTO!» junto a «¡NUEVA!» al revelarlas y en el resumen.
// Liga de prueba con Bot Uno y un bot (temporada empezada), que se borra al terminar.
import { chromium } from 'playwright';
import { env, rpc, rpcOk, leer } from '../api-util.mjs';
import { sinAcentos } from '../../../js/slr/carta.js';

const URL_APP = 'http://localhost:3000/';
const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36';
const coincide = (nombre, personas, q) => sinAcentos([nombre, ...(personas ?? [])].join(' · ')).includes(sinAcentos(q));

const t = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: t, nombre: 'Prueba descubrimientos (banco)' });
const L = liga.id;
let navegador = null;
try {
  const U = (await rpcOk('slr_unirse_liga', { token: t, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  await rpcOk('slr_admin_anadir_bot', { token: t, liga_id: L });
  await rpcOk('slr_iniciar_temporada', { token: t, liga_id: L });
  await rpcOk('slr_prueba_dar_dinero', { token: t, liga_id: L, equipo_id: U, importe: 60000 });
  await rpcOk('slr_prueba_tareas', { token: t, liga_id: L, ahora: new Date().toISOString(), simular: false });
  navegador = await chromium.launch();

  for (const ancho of [360, 412]) {
    console.log(`\n${ancho} px`);
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: ancho === 360 ? 740 : 915 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: UA, reducedMotion: 'reduce' });
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
    const foto = async n => { if (SALIDA) await page.screenshot({ path: `${SALIDA}/desc-${ancho}-${n}.png` }); };
    const cabe = sel => page.evaluate(s => [...document.querySelectorAll(s)].every(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }), sel);
    const atras = async () => { await page.evaluate(() => history.back()); await dormir(600); };
    await page.goto(URL_APP);
    await page.click('.tab[data-tab="rush"]');
    await page.waitForSelector('#rushJugar:not([disabled])', { timeout: 30000 });
    await page.$eval('#rushJugar', b => b.click());
    await page.waitForSelector('.slr-nav:not([hidden])', { timeout: 60000 });

    // Las cartas de Bot Uno con sus personas (de la API) y una persona con la que buscar
    const mias = (await leer(`cartas?select=id,disenos_carta(nombre,personas)&equipo_id=eq.${U}`)).datos.map(c => ({ id: c.id, nombre: c.disenos_carta.nombre, personas: c.disenos_carta.personas ?? [] }));
    const conPersona = mias.find(c => c.personas.some(p => /[áéíóúñ]/i.test(p))) ?? mias.find(c => c.personas.length);
    if (!conPersona) { check(false, 'ninguna carta de Bot Uno tiene personas: no se puede probar'); continue; }
    const persona = conPersona.personas.find(p => /[áéíóúñ]/i.test(p)) ?? conPersona.personas[0];
    const q = sinAcentos(persona).slice(0, Math.max(3, Math.min(5, persona.length))).toUpperCase();   // «NICOL» para Nicolás

    /* ── Plantilla ── */
    await page.click('.slr-nav__item[data-seccion="plantilla"]');
    await page.waitForSelector('.slr-main .slr-pantalla[data-seccion="plantilla"] [data-buscar]', { timeout: 30000 });
    await page.fill('.slr-main [data-buscar]', q);
    await dormir(300);
    const vis = await page.$$eval('.slr-main .slr-ficha:not([hidden])', bs => bs.map(b => b.dataset.id));
    const esperadas = mias.filter(c => coincide(c.nombre, c.personas, q)).map(c => c.id);
    check(vis.length > 0 && vis.length === esperadas.length && vis.every(id => esperadas.includes(id)) && vis.includes(conPersona.id),
      `Plantilla: buscar «${q}» (sin tildes, en mayúsculas) encuentra las de ${persona} (${vis.length} de ${mias.length})`);
    await foto('1-plantilla');

    /* ── Detalle ── */
    await page.click(`.slr-main .slr-ficha[data-id="${conPersona.id}"]`);
    await page.waitForSelector('.slr-detalle [data-descubierta]', { timeout: 15000 });
    await dormir(400);
    const det = await page.evaluate(() => ({
      desc: document.querySelector('.slr-detalle [data-descubierta]').textContent.replace(/\s+/g, ' ').trim(),
      chips: [...document.querySelectorAll('.slr-detalle [data-persona]')].map(b => b.textContent.trim()),
      hist: [...document.querySelectorAll('.slr-detalle .slr-historial li span')].map(s => s.textContent),
      sin: /Sin movimientos/.test(document.querySelector('.slr-detalle').textContent),
    }));
    check(/^🔎 Descubierta por ti · \d/.test(det.desc), `arriba: «${det.desc}»`);
    check(det.chips.length === conPersona.personas.length && det.chips.includes(persona), `«Salen:» con un chip por persona (${det.chips.join(', ')})`);
    check(det.hist.at(-1) === 'Bot Uno la descubrió' && !det.sin, `el historial empieza por «${det.hist.at(-1)}» (nunca «Sin movimientos»)`);
    check(await cabe('.slr-detalle [data-persona]') && await cabe('.slr-detalle [data-descubierta]'), 'los chips y la línea caben en la pantalla');
    await foto('2-detalle');

    /* ── Chip → catálogo (admin) filtrado por la persona ── */
    await page.click(`.slr-detalle [data-persona="${persona}"]`);
    await page.waitForSelector('.slr-catalogo [data-f="texto"]', { timeout: 20000 });
    await dormir(600);
    // (el catálogo pinta por bloques al hacer scroll: se mira la cuenta «N de M con estos filtros»)
    const cat = await page.evaluate(() => ({ valor: document.querySelector('.slr-catalogo [data-f="texto"]').value,
      cuenta: Number(document.querySelector('.slr-catalogo').textContent.match(/(\d+) de \d+ con estos filtros/)?.[1]) }));
    const disenos = (await leer(`disenos_carta?select=nombre,personas,activo,liga_prueba_id&or=(activo.eq.true,liga_prueba_id.eq.${L})&limit=5000`)).datos;
    const enCatalogo = disenos.filter(d => coincide(d.nombre, d.personas, persona)).length;
    check(cat.valor === persona && cat.cuenta === enCatalogo, `el chip abre el catálogo filtrado por «${cat.valor}» (${cat.cuenta} cartas, las que tienen a ${persona})`, JSON.stringify({ cat, enCatalogo }));
    await foto('3-catalogo');
    await atras(); await atras();

    /* ── Álbum ── */
    await page.click('.slr-nav__item[data-seccion="perfil"]');
    await page.waitForSelector('.slr-main [data-album]', { timeout: 20000 });
    await page.click('.slr-main [data-album]');
    await page.waitForSelector('.slr-album [data-buscar]', { timeout: 20000 });
    await dormir(500);
    const marcas = await page.$$eval('.slr-album .slr-ficha__descubierta', m => m.length);
    const fichasAlbum = await page.$$eval('.slr-album .slr-ficha', m => m.length);
    check(marcas > 0 && marcas <= fichasAlbum, `álbum: «Descubierta por ti» en ${marcas} de ${fichasAlbum}`);
    await page.fill('.slr-album [data-buscar]', q);
    await dormir(400);
    const enAlbum = await page.$$eval('.slr-album .slr-ficha', bs => bs.map(b => b.dataset.id));
    const albumApi = (await leer(`album?select=diseno_id,disenos_carta(nombre,personas)&liga_id=eq.${L}&usuario_id=eq.${(await rpcOk('slr_yo', { token: t })).usuario.id}`)).datos;
    const esperadasAlbum = albumApi.filter(a => coincide(a.disenos_carta.nombre, a.disenos_carta.personas, q)).length;
    check(enAlbum.length === esperadasAlbum && enAlbum.includes(conPersona.id), `álbum: buscar «${q}» → ${enAlbum.length} (las que tienen a ${persona})`);
    await foto('4-album');
    await atras();

    /* ── Mercado ── */
    await page.click('.slr-nav__item[data-seccion="mercado"]');
    await page.waitForSelector('.slr-main [data-buscar]', { timeout: 30000 });
    await dormir(400);
    const todas = await page.$$eval('.slr-main .slr-mitem', x => x.length);
    await page.click('.slr-main [data-buscar]');
    await page.keyboard.type('zzzz');
    await dormir(300);
    const ninguna = await page.$$eval('.slr-main .slr-mitem', x => x.length);
    const foco = await page.evaluate(() => document.activeElement?.matches('[data-buscar]') && document.activeElement.value);
    await page.fill('.slr-main [data-buscar]', '');
    await dormir(300);
    check(todas > 0 && ninguna === 0 && foco === 'zzzz' && await page.$$eval('.slr-main .slr-mitem', x => x.length) === todas,
      `mercado: el buscador filtra (${todas} → ${ninguna}) sin perder el foco al escribir, y vacío las vuelve a enseñar todas`);

    /* ── Sobre: «¡DESCUBRIMIENTO!» ── */
    await page.click('[data-sub="sobres"]');
    await page.waitForSelector('[data-tienda-lista]', { timeout: 15000 });
    await dormir(400);
    await page.click('[data-comprar-sobre="basico"]');
    await page.waitForSelector('.slr-confirmar [data-si]', { timeout: 5000 });
    await page.evaluate(() => [...document.querySelectorAll('.slr-hoja')].pop().querySelector('[data-si]').click());
    await page.waitForFunction(() => document.querySelector('[data-apertura]')?.dataset.fase === 'revelado', null, { timeout: 30000 });
    for (let k = 0; k < 6; k++) { if (!await page.evaluate(() => { const c = document.querySelector('[data-revela]:not(.revelada)'); c?.click(); return !!c; })) break; await dormir(500); }
    await dormir(500);
    const rev = await page.evaluate(() => ({ cartas: document.querySelectorAll('[data-revela]').length, desc: document.querySelectorAll('[data-revela] [data-descubrimiento]').length,
      nuevas: document.querySelectorAll('[data-revela] .slr-revela__nueva').length }));
    check(rev.desc === rev.cartas && rev.nuevas === rev.cartas, `al revelarlas: «¡DESCUBRIMIENTO!» junto a «¡NUEVA!» (${rev.desc} de ${rev.cartas}: nadie las tenía)`);
    const pisan = await page.evaluate(() => {
      const rs = [...document.querySelectorAll('[data-revela] .slr-revela__etiquetas b')].map(b => b.getBoundingClientRect());
      const malos = [];
      rs.forEach((a, i) => rs.forEach((b, j) => { if (j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) malos.push([i, j, [a.left, a.right, a.top, a.bottom].map(Math.round), [b.left, b.right, b.top, b.bottom].map(Math.round)]); }));
      return malos.length ? JSON.stringify(malos) : false;
    });
    check(await cabe('[data-revela] .slr-revela__etiquetas') && !pisan, 'las etiquetas caben y no se pisan con las de las cartas de al lado', String(pisan));
    await foto('5-revela');
    await page.waitForSelector('[data-continuar]', { timeout: 15000 }).catch(() => {});
    await page.$eval('[data-continuar]', b => b.click()).catch(() => {});
    await page.waitForSelector('[data-final]:not([hidden])', { timeout: 15000 }).catch(() => {});
    await dormir(400);
    const fin = await page.$$eval('[data-final] .slr-descubrimiento', x => x.length);
    check(fin === rev.cartas, `y en el resumen (${fin})`);
    await foto('6-resumen');
    check(!errores.length, 'sin errores en la página', errores.slice(0, 3).join(' | '));
    await ctx.close();
  }
} catch (e) {
  mal++;
  console.log(`\n  ✖ Error inesperado: ${e.stack ?? e.message}`);
} finally {
  await navegador?.close();
  const b = await rpc('slr_borrar_liga', { token: t, liga_id: L });
  check(b.ok, 'liga de prueba borrada', b.mensaje);
  await rpc('slr_logout', { token: t });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
  process.exitCode = mal ? 1 : 0;
}
