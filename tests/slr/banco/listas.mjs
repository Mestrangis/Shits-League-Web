// Prueba en Chrome headless de la carga de las fotos y las listas largas.
//   node tests/slr/banco/listas.mjs   (servidor local en :3000 y .env.local)
//   SALIDA=carpeta  guarda capturas y GIF (plantilla y álbum cargando en «Fast 3G»,
//                   herramienta de admin con el selector de páginas)
// Crea una liga de prueba con ~300 cartas con foto (diseños de la liga de prueba
// con las fotos del catálogo, más una con la foto rota), pasa ~250 por el álbum
// de Bot Uno y la borra al terminar.
// · Herramienta de admin: 24 por página, botones, total, «Todas» (se recuerda),
//   precarga de la página siguiente, tiempos de pintado.
// · Álbum: con más de 60 cartas, bloques de 30 al hacer scroll, sin tareas largas.
// · Fotos: esqueleto con brillo (sin brillo con reduced motion), vista previa
//   borrosa, foto buena con fundido, sin saltos de tamaño, anchos fijos de
//   Cloudinary, foto rota → iniciales, volver = instantáneo (sin fundido).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, rpcOk, rpc, leer } from '../api-util.mjs';

const SALIDA = process.env.SALIDA;
const N_SIMULADAS = 250;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const enLotes = async (lista, n, f) => { for (let i = 0; i < lista.length; i += n) await Promise.all(lista.slice(i, i + n).map(f)); };

// ── Liga de prueba con ~300 cartas con foto ──
const t = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: t, nombre: 'Prueba listas (banco)' });
const L = liga.id;
let ch;
try {
  const yo = await rpcOk('slr_unirse_liga', { token: t, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  const EQ = yo.equipo.id;
  const fotos = (await leer('disenos_carta?select=imagen_url&imagen_url=not.is.null&liga_prueba_id=is.null&limit=200')).datos.map(d => d.imagen_url);
  const PERFILES = ['atacante', 'defensa', 'control', 'portero', 'equilibrado'];
  const simuladas = [];
  console.log(`Creando ${N_SIMULADAS} cartas simuladas…`);
  await enLotes([...Array(N_SIMULADAS).keys()], 10, async i => {
    const r = await rpcOk('slr_admin_guardar_diseno', { token: t, liga_id: L, diseno: {
      nombre: `Simulada ${String(i + 1).padStart(3, '0')}`, tipo: i % 9 === 0 ? 'duo' : 'individual',
      perfil: PERFILES[i % 5], tier: 'DEFCB'[i % 5], semilla_stats: 1000 + i, semilla_poderes: 5000 + i,
      imagen_url: fotos[i % fotos.length] } });
    simuladas.push(r.carta_id);
  });
  // Una con la foto rota (Cloudinary responde 404)
  const rota = await rpcOk('slr_admin_guardar_diseno', { token: t, liga_id: L, diseno: {
    nombre: 'Foto Rota', tipo: 'individual', perfil: 'atacante', tier: 'D', semilla_stats: 1, semilla_poderes: 2,
    imagen_url: 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1/no-existe-slr-prueba.jpg' } });
  // Por el álbum de Bot Uno: dar y dejar libre (4 a la vez: le caben 15)
  console.log('Pasándolas por el álbum…');
  await enLotes([...simuladas, rota.carta_id], 4, async id => {
    await rpcOk('slr_admin_mover_carta', { token: t, liga_id: L, carta_id: id, equipo_id: EQ });
    await rpcOk('slr_admin_mover_carta', { token: t, liga_id: L, carta_id: id, equipo_id: null });
  });
  const nCartas = (await leer(`cartas?select=id&liga_id=eq.${L}&limit=5000`)).datos.length;
  const nAlbum = (await leer(`album?select=diseno_id&liga_id=eq.${L}&limit=5000`)).datos.length;
  console.log(`${nCartas} cartas en la liga, ${nAlbum} en el álbum de Bot Uno`);

  // ── Navegador ──
  ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--remote-debugging-port=9361',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'li-'))}`, '--headless=new', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const p = (await (await fetch('http://127.0.0.1:9361/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
    if (!ws) await dormir(200);
  }
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pend = new Map(); const errores = []; let marcos = null;
  ws.addEventListener('message', m => {
    const x = JSON.parse(m.data);
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); }
    else if (x.method === 'Runtime.exceptionThrown') errores.push(x.params.exceptionDetails?.exception?.description?.slice(0, 200));
    else if (x.method === 'Page.screencastFrame') {
      marcos?.push({ t: x.params.metadata.timestamp, data: x.params.data });
      cdp('Page.screencastFrameAck', { sessionId: x.params.sessionId });
    }
  });
  const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
  const esperar = async (expr, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (await ev(expr)) return true; await dormir(100); } return false; };
  const clic = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const atras = async () => { await ev('history.back(); 0'); await dormir(500); };
  const foto = async n => {
    if (!SALIDA) return;
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SALIDA, `${n}.png`), Buffer.from(r.result.data, 'base64'));
  };
  // Grabación: frames del screencast → JSON para montar el GIF (Python/Pillow)
  const grabar = async () => { marcos = []; await cdp('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: 390, maxHeight: 844, everyNthFrame: 2 }); };
  const parar = async nombre => {
    await cdp('Page.stopScreencast');
    if (SALIDA) writeFileSync(join(SALIDA, `${nombre}.frames.json`), JSON.stringify(marcos));
    const n = marcos.length; marcos = null; return n;
  };
  const red = async (lenta) => cdp('Network.emulateNetworkConditions', lenta
    ? { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 }   // «Fast 3G» de DevTools
    : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: 'http://localhost:3000/' });
  await dormir(1500);
  await ev(`localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', ${JSON.stringify(env.SLR_BOT_UNO_CODIGO)});
    localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true })); 0`);
  await cdp('Page.navigate', { url: 'http://localhost:3000/#rush' });
  // Page.reload no espera: se marca la página vieja y se espera al botón de la NUEVA
  // (si no, a veces se pulsaba el «Jugar» de la página que se estaba recargando)
  await ev('window.__paginaVieja = true; 0');
  await cdp('Page.reload', {});
  await esperar(`!window.__paginaVieja && !!document.getElementById('rushJugar')`, 30000);
  // Tareas largas (> 50 ms) del hilo principal desde aquí
  await ev(`window.__largas = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__largas.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: false }); 0`);

  // ── Plantilla en «Fast 3G», sin caché: esqueleto → vista previa → foto ──
  console.log('\nPlantilla cargando con «Fast 3G»');
  await clic('#rushJugar');
  await esperar(`!!document.querySelector('.slr-nav__item')`, 30000);
  await dormir(1500);
  // Desde aquí, red lenta y sin caché: las fotos de la plantilla se piden de cero
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await red(true);
  await grabar();
  await clic('[data-seccion=plantilla]');
  await esperar(`document.querySelectorAll('.slr-pantalla .slr-carta--con-imagen').length > 0`, 30000);
  const alto0 = await ev(`[...document.querySelectorAll('.slr-pantalla .slr-carta--con-imagen')].map(c => Math.round(c.getBoundingClientRect().height))`);
  const esqueleto = await ev(`(() => { const c = document.querySelector('.slr-pantalla .slr-carta--con-imagen:not(.con-mini):not(.con-foto)');
    return c ? getComputedStyle(c.querySelector('.slr-carta__arte'), '::after').animationName : null; })()`);
  check(esqueleto === 'slr-brillo-carga', `al principio, esqueleto con brillo animado (${esqueleto})`);
  check(await esperar(`document.querySelectorAll('.slr-pantalla .slr-carta.con-mini').length > 0`, 20000), 'llega la vista previa borrosa');
  check(await esperar(`(() => { const t = document.querySelectorAll('.slr-pantalla .slr-carta--con-imagen'); return t.length && [...t].every(c => c.matches('.con-foto, .slr-carta--sin-foto')); })()`, 60000),
    'y todas las fotos de la plantilla, también las que no se ven (sin esperar al scroll)');
  await dormir(600);
  const n1 = await parar('plantilla-3g');
  const alto1 = await ev(`[...document.querySelectorAll('.slr-pantalla .slr-carta--con-imagen')].map(c => Math.round(c.getBoundingClientRect().height))`);
  check(JSON.stringify(alto0) === JSON.stringify(alto1), `sin saltos de tamaño (${alto0[0]} px de alto antes y después) · ${n1} frames grabados`);
  const anchos = await ev(`[...new Set([...document.querySelectorAll('.slr-carta__img')].map(i => i.src.match(/w_(\\d+)/)?.[1]).filter(Boolean))]`);
  check(anchos.every(w => [160, 240, 320, 480, 640, 960].includes(Number(w))), `anchos pedidos a Cloudinary, solo los fijos: ${anchos.join(', ')}`);
  const mini = await ev(`document.querySelector('.slr-carta__mini')?.src ?? ''`);
  check(/w_24,f_auto,q_auto:low,e_blur/.test(mini), 'vista previa: w_24, f_auto (respeta la transparencia), calidad baja y e_blur');
  await foto('plantilla-cargada');

  // ── Álbum en «Fast 3G» (cada vez que se abre, la caché vuelve a estar activa luego) ──
  console.log('\nÁlbum');
  await clic('[data-seccion=perfil]');
  await esperar(`!!document.querySelector('[data-album]')`);
  await ev('window.__largas.length = 0; 0');
  await grabar();
  const t0 = await ev('performance.now()');
  await clic('[data-album]');
  await esperar(`document.querySelectorAll('.slr-album .slr-ficha').length > 0`, 60000);
  const tAlbum = Math.round(await ev('performance.now()') - t0);
  const pint0 = await ev(`document.querySelectorAll('.slr-album .slr-ficha').length`);
  check(nAlbum > 60 && pint0 >= 30 && pint0 < nAlbum, `con ${nAlbum} cartas se pinta por bloques: ${pint0} al abrir (en ${tAlbum} ms con «Fast 3G»)`);
  await dormir(4000);
  const nAlb = await parar('album-3g');
  await foto('album-3g');
  await red(false);
  await cdp('Network.setCacheDisabled', { cacheDisabled: false });
  // Scroll hasta el final: los bloques llegan antes de verse
  const cuerpoAlbum = `(getComputedStyle(document.querySelector('.slr-hoja:last-of-type')).overflowY === 'auto' ? document.querySelector('.slr-hoja:last-of-type') : document.querySelector('.slr-hoja:last-of-type .slr-hoja__cuerpo'))`;
  const vistos = [];
  for (let i = 0; i < 80; i++) {
    const r = await ev(`(() => { const c = ${cuerpoAlbum}; c.scrollTop += 700; return { n: document.querySelectorAll('.slr-album .slr-ficha').length, fin: c.scrollTop + c.clientHeight >= c.scrollHeight - 2 }; })()`);
    vistos.push(r.n);
    await dormir(60);
    if (r.fin && r.n >= nAlbum) break;
  }
  const largas = await ev('window.__largas');
  check(vistos.at(-1) === nAlbum, `scroll infinito: ${[...new Set(vistos)].join(' → ')} fichas (todas)`);
  check(Math.max(0, ...largas) < 250, `fluido: ${largas.length} tareas largas, la mayor de ${Math.max(0, ...largas)} ms`);
  const rotaEstado = await ev(`(() => { const c = [...document.querySelectorAll('.slr-album .slr-carta')].find(x => /Foto Rota/.test(x.textContent));
    if (!c) return null; const a = getComputedStyle(c.querySelector('.slr-carta__arte'), '::after');
    return { sinFoto: c.classList.contains('slr-carta--sin-foto'), iniciales: getComputedStyle(c.querySelector('.slr-carta__iniciales--foto')).display, brillo: a.animationName, contenido: a.content }; })()`);
  await esperar(`[...document.querySelectorAll('.slr-album .slr-carta')].find(x => /Foto Rota/.test(x.textContent))?.classList.contains('slr-carta--sin-foto')`, 15000);
  const rota2 = await ev(`(() => { const c = [...document.querySelectorAll('.slr-album .slr-carta')].find(x => /Foto Rota/.test(x.textContent));
    const a = getComputedStyle(c.querySelector('.slr-carta__arte'), '::after');
    return { sinFoto: c.classList.contains('slr-carta--sin-foto'), iniciales: getComputedStyle(c.querySelector('.slr-carta__iniciales--foto')).display, contenido: a.content }; })()`);
  check(rota2.sinFoto && rota2.iniciales !== 'none' && rota2.contenido === 'none', `foto rota: esqueleto quieto con las iniciales (${JSON.stringify(rotaEstado ?? rota2)})`);
  await atras();
  // Volver a abrir: lo ya cargado sale al momento (sin fundido)
  await clic('[data-album]');
  await esperar(`document.querySelectorAll('.slr-album .slr-ficha').length > 0`);
  await dormir(150);
  const vuelta = await ev(`(() => { const c = [...document.querySelectorAll('.slr-album .slr-carta--con-imagen')].slice(0, 12); return { n: c.length, rapidas: c.filter(x => x.classList.contains('sin-fundido')).length }; })()`);
  check(vuelta.rapidas >= vuelta.n - 1, `al volver, ${vuelta.rapidas} de las ${vuelta.n} primeras ya están (sin fundido, de la caché)`);
  await atras();

  // ── Herramienta de admin ──
  console.log('\nHerramienta de plantillas');
  await ev('window.__largas.length = 0; 0');
  const t1 = await ev('performance.now()');
  await clic('[data-pruebas=plantillas]');
  await esperar(`document.querySelectorAll('.slr-plantillas__fila').length > 0`, 20000);
  const tHerr = Math.round(await ev('performance.now()') - t1);
  const h0 = await ev(`({ filas: document.querySelectorAll('.slr-plantillas__fila').length, total: document.querySelector('[data-total]').textContent,
    sel: document.querySelector('[data-por-pagina]').value, texto: document.querySelector('.slr-paginas__texto')?.textContent,
    botones: [...document.querySelector('[data-paginas]').querySelectorAll('button')].map(b => b.textContent.trim()) })`);
  const paginas = Math.ceil(nCartas / 24);
  check(h0.filas === 24 && h0.sel === '24' && h0.texto === `Página 1 de ${paginas}`, `24 por página: ${h0.total} · ${h0.texto} · [${h0.botones.join(' ')}] (abre en ${tHerr} ms)`);
  await foto('admin-paginas');
  // Página siguiente precargada
  await dormir(1500);
  const sig = await ev(`(() => { const urls = performance.getEntriesByType('resource').map(e => e.name).filter(u => u.includes('res.cloudinary.com')); return urls.length; })()`);
  await clic('[data-paginas] [data-pag="2"]');
  await dormir(300);
  const h1 = await ev(`({ primera: document.querySelector('.slr-plantillas__texto b').textContent, texto: document.querySelector('.slr-paginas__texto').textContent,
    listas: document.querySelectorAll('.slr-plantillas .slr-carta.con-foto.sin-fundido').length, total: document.querySelectorAll('.slr-plantillas .slr-carta--con-imagen').length })`);
  check(h1.texto === `Página 2 de ${paginas}`, `página 2: «${h1.primera}»…`);
  check(h1.listas >= h1.total - 2, `sus fotos ya estaban precargadas: ${h1.listas} de ${h1.total} al momento (${sig} fotos pedidas hasta entonces)`);
  // «Todas» y que se recuerde
  await ev('window.__largas.length = 0; 0');
  const t2 = await ev(`(() => { const s = document.querySelector('[data-por-pagina]'); const t = performance.now(); s.value = '0'; s.dispatchEvent(new Event('change')); return performance.now() - t; })()`);
  const todas = await ev(`({ filas: document.querySelectorAll('.slr-plantillas__fila').length, nav: document.querySelector('[data-paginas]').hidden, guardado: localStorage.getItem('SLR_PLANTILLAS_POR_PAGINA') })`);
  check(todas.filas === nCartas && todas.nav && todas.guardado === '0', `«Todas»: ${todas.filas} filas pintadas en ${Math.round(t2)} ms, sin botones de página`);
  await dormir(1500);
  const largas2 = await ev('window.__largas');
  check(Math.max(0, ...largas2) < 400, `fluido con ${nCartas} cartas: la mayor tarea larga, ${Math.max(0, ...largas2)} ms`);
  await atras();
  await clic('[data-pruebas=plantillas]');
  await esperar(`document.querySelectorAll('.slr-plantillas__fila').length > 0`);
  check(await ev(`document.querySelector('[data-por-pagina]').value === '0'`), 'al volver a abrirla recuerda «Todas»');
  await ev(`(() => { const s = document.querySelector('[data-por-pagina]'); s.value = '48'; s.dispatchEvent(new Event('change')); return 0; })()`);
  await dormir(300);
  await ev(`(() => { const e = document.querySelector('[data-f="tipo"]'); e.value = 'individual'; e.dispatchEvent(new Event('change')); return 0; })()`);
  await dormir(300);
  const filtrada = await ev(`({ filas: document.querySelectorAll('.slr-plantillas__fila').length, texto: document.querySelector('.slr-paginas__texto')?.textContent, total: document.querySelector('[data-total]').textContent })`);
  check(filtrada.filas === 48 && /^Página 1 de/.test(filtrada.texto ?? ''), `48 por página con el filtro «Individual»: ${filtrada.total} · ${filtrada.texto}`);
  await clic('[data-paginas] [data-pag="3"]'); await dormir(300);
  await foto('admin-paginas-48');
  await grabar();
  for (const p of ['4', '5', '›', '1']) {
    await ev(`(() => { const b = [...document.querySelectorAll('[data-paginas] button')].find(x => x.textContent.trim() === ${JSON.stringify(p)}); b?.click(); return 0; })()`);
    await dormir(900);
  }
  await parar('admin-paginas');
  await atras();

  // ── Sin movimiento: sin brillo ──
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await red(true);
  await clic('[data-album]');
  await esperar(`!!document.querySelector('.slr-album .slr-carta--con-imagen:not(.con-mini):not(.con-foto)')`, 10000);
  const quieto = await ev(`(() => { const c = document.querySelector('.slr-album .slr-carta--con-imagen:not(.con-mini):not(.con-foto)'); if (!c) return 'ya cargada';
    const a = getComputedStyle(c.querySelector('.slr-carta__arte'), '::after'); return a.content + ' / ' + a.animationName; })()`);
  check(/^none/.test(quieto), `con prefers-reduced-motion, esqueleto sin brillo (${quieto})`);
  await red(false);
  check(!errores.length, `sin errores en la consola${errores.length ? `: ${errores.join(' | ')}` : ''}`);
} catch (e) {
  mal++;
  console.log(`  ✖ Error inesperado: ${e.message}`);
} finally {
  ch?.kill();
  await rpc('slr_borrar_liga', { token: t, liga_id: L });
  await rpc('slr_logout', { token: t });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas`);
  process.exit(mal ? 1 : 0);
}
