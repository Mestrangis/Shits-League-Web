// Prueba en Chrome headless de la apertura de sobres en un Android emulado
// (360 y 412 px de ancho, con la barra de direcciones visible) y con red lenta:
//  · En cada fase (sobre, abanico, carta girada y resumen) nada se sale de la
//    pantalla, la capa mide lo que la pantalla y todo está centrado.
//  · Comprar con la red lenta abre al momento la pantalla negra («Preparando
//    sobre…»), los botones de comprar quedan desactivados y tocar varias veces
//    solo abre un sobre (y cobra uno).
//  · Si la compra falla, se sale con un aviso y no se cobra nada.
//   node tests/slr/banco/apertura-android.mjs   (servidor local en :3000 y .env.local; SALIDA=carpeta guarda capturas)
// Crea una liga de prueba con Bot Uno y 2 bots y la borra al terminar.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, rpcOk, rpc, leer } from '../api-util.mjs';

const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

const U = { token: (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token };
const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: 'Prueba apertura Android (banco)' });
const L = liga.id;
let ch = null;
try {
  U.equipo = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  for (let i = 0; i < 2; i++) await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L });
  await rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: U.equipo, importe: 80000 });
  await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'false' });
  const mias = (await leer(`cartas?select=id&equipo_id=eq.${U.equipo}`)).datos;
  for (const c of mias.slice(0, 8)) await rpcOk('slr_vender_banco', { token: U.token, carta_id: c.id });

  ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--remote-debugging-port=9364',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'and-'))}`, '--headless=new', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const p = (await (await fetch('http://127.0.0.1:9364/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
    if (!ws) await dormir(200);
  }
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pend = new Map(); const errores = [];
  ws.addEventListener('message', m => {
    const x = JSON.parse(m.data);
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); }
    else if (x.method === 'Runtime.exceptionThrown') errores.push(x.params.exceptionDetails?.exception?.description?.slice(0, 200));
  });
  const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
  const esperar = async (expr, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (await ev(expr)) return true; await dormir(100); } return false; };
  let ancho = 412;
  // Android con la barra de direcciones visible: el alto útil es el de la pantalla menos la barra (56 px)
  const android = async w => {
    ancho = w;
    const alto = { 360: 800, 412: 915 }[w] - 56 - 24;
    await cdp('Emulation.setUserAgentOverride', { userAgent: UA, platform: 'Linux armv8l' });
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: alto, deviceScaleFactor: w === 360 ? 3 : 2.625, mobile: true,
      screenWidth: w, screenHeight: alto + 80 });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await dormir(400);
  };
  const foto = async n => {
    if (!SALIDA) return;
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SALIDA, `android-${ancho}-${n}.png`), Buffer.from(r.result.data, 'base64'));
  };
  const clic = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const fase = () => ev(`document.querySelector('[data-apertura]')?.dataset.fase ?? null`);
  const rect = sel => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);

  // Nada se sale y lo que importa está centrado (tolerancia de 2 px)
  const medir = `(() => {
    const vw = document.documentElement.clientWidth, cap = document.querySelector('[data-apertura]');
    const r = n => { const b = n.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), c: Math.round(b.left + b.width / 2), w: Math.round(b.width) }; };
    const visibles = [...cap.querySelectorAll('[data-sobre], [data-revela], .slr-apertura__titulo, .slr-apertura__sub, [data-resumen-sobre] li, [data-cerrar-apertura], [data-continuar], .slr-apertura__pista')]
      .filter(n => !n.closest('[hidden]') && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden' && !n.closest('.vuela'));
    const fuera = visibles.map(n => ({ n: (n.className.baseVal ?? n.className).toString().split(' ')[0] || n.tagName, ...r(n) })).filter(x => x.l < -1 || x.r > vw + 1);
    return { vw, iw: innerWidth, sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, cap: r(cap), sx: scrollX, vv: visualViewport ? Math.round(visualViewport.width) : null,
      fuera, centros: Object.fromEntries(['[data-sobre]', '[data-cartas]', '[data-cerrar-apertura]', '.slr-apertura__titulo', '[data-resumen-sobre]', '[data-continuar]']
        .map(s => [s, cap.querySelector(s)]).filter(([, n]) => n && n.getClientRects().length && !n.closest('[hidden]')).map(([s, n]) => [s, r(n).c])) };
  })()`;
  async function revisar(nombre, centrar) {
    const m = await ev(medir);
    const mitad = m.vw / 2;
    const desc = Object.entries(m.centros).filter(([s]) => centrar.includes(s)).filter(([, c]) => Math.abs(c - mitad) > 2);
    check(m.cap.l === 0 && m.cap.w === m.vw && m.sw <= m.vw && m.sx === 0,
      `${ancho} px · ${nombre}: la capa mide lo que la pantalla (${m.cap.w}/${m.vw}, scrollWidth ${m.sw}, visualViewport ${m.vv})`, JSON.stringify(m.cap));
    check(!m.fuera.length, `${ancho} px · ${nombre}: nada se sale`, JSON.stringify(m.fuera));
    check(!desc.length, `${ancho} px · ${nombre}: centrado (${Object.entries(m.centros).filter(([s]) => centrar.includes(s)).map(([s, c]) => `${s} ${c}`).join(', ')} · mitad ${mitad})`, JSON.stringify(desc));
    await foto(nombre);
    return m;
  }
  async function rasgar() {
    const r = await rect('[data-sobre]');
    const y = r.y + r.h * 0.15, pasos = 16;
    const toque = (type, x) => cdp('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await toque('touchStart', r.x + r.w * 0.02);
    for (let k = 1; k <= pasos; k++) { await toque('touchMove', r.x + r.w * (0.02 + 0.97 * k / pasos)); await dormir(25); }
    await toque('touchEnd', r.x + r.w * 0.99);
  }
  async function confirmarCompra(tipo) {
    await clic(`[data-comprar-sobre="${tipo}"]`);
    await esperar(`!!document.querySelector('.slr-confirmar [data-si]')`, 5000);
    await ev(`[...document.querySelectorAll('.slr-hoja')].pop().querySelector('[data-si]').click(); 0`);
  }
  async function aTienda() {
    await clic('.slr-nav__item[data-seccion="mercado"]');
    await esperar(`!!document.querySelector('[data-sub="sobres"]')`, 10000);
    await clic('[data-sub="sobres"]');
    await esperar(`!!document.querySelector('[data-tienda-lista]')`, 10000);
    await dormir(400);
  }
  async function entrar() {
    await cdp('Page.navigate', { url: 'http://localhost:3000/' });
    await dormir(1500);
    await ev(`localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', ${JSON.stringify(env.SLR_BOT_UNO_CODIGO)});
      localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true })); 0`);
    await cdp('Page.navigate', { url: 'http://localhost:3000/#rush' });
    await ev('window.__paginaVieja = true; 0');
    await cdp('Page.reload', {});
    await esperar(`!window.__paginaVieja && (document.getElementById('rushJugar')?.disabled === false)`, 30000);
    await clic('#rushJugar');
    await esperar(`!!document.querySelector('.slr-nav:not([hidden])')`, 15000);
    await dormir(600);
  }
  const saldo = async () => (await leer(`equipos?select=saldo&id=eq.${U.equipo}`)).datos[0].saldo;

  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Network.enable');

  for (const w of [360, 412]) {
    console.log(`\nAndroid ${w} px: cada fase`);
    await android(w);
    await entrar();
    await aTienda();
    await confirmarCompra('basico');
    await esperar(`document.querySelector('[data-apertura]')?.dataset.fase === 'flotando'`, 15000);
    await dormir(800);
    await revisar('1-sobre', ['[data-sobre]']);
    for (let k = 0; k < 3; k++) { await clic('[data-sobre]'); await dormir(420); }
    await esperar(`document.querySelector('[data-apertura]')?.dataset.fase === 'rasgar'`, 3000);
    await dormir(300);
    await rasgar();
    await esperar(`document.querySelector('[data-apertura]')?.dataset.fase === 'revelado'`, 5000);
    await dormir(1400);
    await revisar('2-abanico', ['[data-cartas]']);
    await clic('[data-revela="1"]');
    await dormir(2200);
    await revisar('3-girada', ['[data-cartas]']);
    for (const k of [0, 2]) { await clic(`[data-revela="${k}"]`); await dormir(500); }
    await esperar(`!!document.querySelector('[data-continuar]')`, 5000);
    await dormir(800);
    await revisar('4-reveladas', ['[data-cartas]', '[data-continuar]']);
    await clic('[data-continuar]');
    await esperar(`!!document.querySelector('[data-resumen-sobre]')`, 3000);
    await dormir(700);
    await revisar('5-resumen', ['[data-cerrar-apertura]', '.slr-apertura__titulo', '[data-resumen-sobre]']);
    await ev(`document.querySelector('[data-final]').scrollTop = 1e6; 0`);
    await dormir(300);
    await revisar('6-resumen-abajo', ['[data-cerrar-apertura]']);
    await clic('[data-cerrar-apertura]');
    await dormir(700);
  }
  const red = (latency, offline = false) => cdp('Network.emulateNetworkConditions', latency || offline
    ? { offline, latency, downloadThroughput: 60000, uploadThroughput: 30000 } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const precio = async tipo => (await rpcOk('slr_tienda', { token: U.token, liga_id: L })).tipos.find(x => x.tipo === tipo).precio;
  const ajustarEspera = ms => ev(`import('/js/slr/pantallas/tienda.js').then(m => { m.AJUSTES_COMPRA.espera = ${ms}; return 0; })`);
  const hayToast = re => `[...document.querySelectorAll('.slr-toast')].some(t => ${re}.test(t.textContent))`;
  async function cerrarApertura() {
    await clic('[data-saltar]');
    await esperar(`!!document.querySelector('[data-cerrar-apertura]')`, 6000);
    await clic('[data-cerrar-apertura]');
    await esperar(`!document.querySelector('[data-apertura]')`, 4000);
    await dormir(600);
  }
  const pSencillo = await precio('sencillo');

  console.log('\nRed lenta: tocar varias veces solo abre un sobre');
  let s0 = await saldo();
  await aTienda();
  await red(3500);
  await confirmarCompra('sencillo');
  const alMomento = await esperar(`!!document.querySelector('[data-apertura]')`, 600);
  const texto = await ev(`document.querySelector('[data-apertura] [data-pista]')?.textContent ?? ''`);
  check(alMomento && /Preparando sobre/i.test(texto), `al confirmar, la pantalla negra sale al momento («${texto}»)`);
  await dormir(250);
  check(await ev(`getComputedStyle(document.querySelector('[data-apertura]')).opacity`) === '1', 'la pantalla negra tapa del todo');
  await foto('7-preparando');
  const tapada = await ev(`(() => { const b = document.querySelector('[data-comprar-sobre="sencillo"]'); if (!b) return 'sin botón';
    const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, Math.min(innerHeight - 2, Math.max(2, r.top + r.height / 2)));
    return e?.closest('[data-apertura]') ? 'tapado' : e?.outerHTML.slice(0, 60); })()`);
  check(tapada === 'tapado', `el botón de comprar queda debajo de la pantalla negra (${tapada})`);
  check(await ev(`[...document.querySelectorAll('[data-comprar-sobre]')].every(b => b.disabled)`), 'mientras, todos los botones de comprar están desactivados');
  // Toques insistentes: en la pantalla negra y, por si acaso, directamente en los botones
  for (let k = 0; k < 4; k++) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ancho / 2, y: 500, id: 1 }] });
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await ev(`document.querySelectorAll('[data-comprar-sobre]').forEach(b => b.click()); 0`);
    await dormir(150);
  }
  check(await esperar(`document.querySelector('[data-apertura]')?.dataset.fase === 'flotando'`, 40000), 'al llegar la respuesta, sigue la animación normal (en la misma pantalla)');
  await red(0);
  await dormir(1500);
  check(await ev(`document.querySelectorAll('[data-apertura]').length`) === 1 && !(await ev(`!!document.querySelector('.slr-confirmar')`)),
    'una sola pantalla de apertura y ninguna confirmación de más');
  let s1 = await saldo();
  check(s0 - s1 === pSencillo, `cobrado una sola vez (${s0} → ${s1}, precio ${pSencillo})`);
  await cerrarApertura();
  check(await ev(`[...document.querySelectorAll('[data-comprar-sobre]')].some(b => !b.disabled)`), 'al terminar, los botones vuelven');

  console.log('\nTarda más de lo que se espera, pero la compra se hizo: se abre ese sobre');
  s0 = await saldo();
  await ajustarEspera(2000);
  await red(4500);
  await confirmarCompra('sencillo');
  check(await esperar(`document.querySelector('[data-apertura]')?.dataset.fase === 'flotando'`, 30000), 'se abre el sobre comprado');
  await red(0);
  await dormir(800);
  s1 = await saldo();
  check(s0 - s1 === pSencillo, `cobrado una vez (${s0} → ${s1})`);
  await cerrarApertura();

  console.log('\nSin conexión: aviso al momento y no cobra');
  s0 = await saldo();
  await ajustarEspera(15000);
  await red(0, true);
  await confirmarCompra('sencillo');
  check(await esperar(hayToast('/no se te ha cobrado nada/i'), 3000), 'aviso «No se ha podido comprar el sobre, no se te ha cobrado nada»');
  check(!(await ev(`!!document.querySelector('[data-apertura]')`)), 'sin pantalla negra colgada');
  await foto('8-sin-conexion');
  await red(0);
  await dormir(500);
  check(await saldo() === s0, 'no se ha cobrado nada');
  check(await ev(`[...document.querySelectorAll('[data-comprar-sobre]')].some(b => !b.disabled)`), 'los botones siguen activos');

  console.log('\nFalla la red a mitad: se sale con aviso y, si se hizo, se abre después');
  s0 = await saldo();
  await ajustarEspera(2000);
  await cdp('Network.setBlockedURLs', { urls: ['*slr_anular_intento*'] });
  await red(4500);
  await confirmarCompra('sencillo');
  check(await esperar(hayToast('/si llegó a hacerse/i'), 20000), 'sin saber si se hizo: sale con aviso');
  check(await esperar(`!document.querySelector('[data-apertura]')`, 3000), 'y se cierra la pantalla negra');
  await foto('9-incierta');
  check(!!(await ev(`localStorage.getItem('slr_compra_pendiente')`)), 'el intento queda guardado');
  await cdp('Network.setBlockedURLs', { urls: [] });
  await red(0);
  await ajustarEspera(15000);
  await dormir(3000);
  await clic('[data-sub="subastas"]'); await dormir(600);
  await clic('[data-sub="sobres"]');
  check(await esperar(hayToast('/sí llegó a hacerse/i'), 10000), 'al volver a la tienda: «Tu compra sí llegó a hacerse»');
  check(await esperar(`document.querySelector('[data-apertura]')?.dataset.fase === 'flotando'`, 15000), 'y se abre ese sobre');
  check(!(await ev(`localStorage.getItem('slr_compra_pendiente')`)), 'y se borra el intento guardado');
  s1 = await saldo();
  check(s0 - s1 === pSencillo, `cobrado una vez (${s0} → ${s1})`);
  await cerrarApertura();

  check(!errores.length, 'sin errores en la consola', errores.join(' | '));
} catch (e) {
  mal++;
  console.log(`\n  ✖ Error inesperado: ${e.stack ?? e.message}`);
} finally {
  ch?.kill();
  const b = await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
  check(b.ok, 'liga de prueba borrada', b.mensaje);
  await rpc('slr_logout', { token: U.token });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
  process.exitCode = mal ? 1 : 0;
}
