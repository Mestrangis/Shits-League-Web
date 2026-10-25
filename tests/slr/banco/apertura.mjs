// Prueba en Chrome headless de la apertura de sobres (móvil 390×844 y PC):
// flotando, carga con 3 toques (luz del color de la mejor rareza), rasgado a
// medias y completo con el dedo, explosión, abanico de dorsos, giro de una
// épica, resumen, sobre de elección, elección pendiente al recargar, «Saltar»,
// movimiento reducido y la pantalla de admin de sobres con su vista previa.
//   node tests/slr/banco/apertura.mjs   (servidor local en :3000 y .env.local)
//   SALIDA=carpeta guarda capturas; VIDEO=1 guarda además los fotogramas de una apertura completa.
// Crea una liga de prueba con Bot Uno y 2 bots y la borra al terminar.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, rpcOk, rpc, leer } from '../api-util.mjs';

const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };

const U = { token: (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token };
const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: 'Prueba apertura (banco)' });
const L = liga.id;
let ch = null;
try {
  U.equipo = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  for (let i = 0; i < 2; i++) await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L });
  await rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: U.equipo, importe: 80000 });
  await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'false' });
  // Básico cargado de épicas (para ver la luz morada y el giro de una épica)
  await rpcOk('slr_admin_guardar_sobre', { token: U.token, liga_id: L, tipo: 'basico', datos: { pesos: { comun: 3, epica: 100 } } });
  // Hueco de sobra: se venden 6 cartas al banco
  const mias = (await leer(`cartas?select=id&equipo_id=eq.${U.equipo}`)).datos;
  for (const c of mias.slice(0, 6)) await rpcOk('slr_vender_banco', { token: U.token, carta_id: c.id });

  ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--remote-debugging-port=9363',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ape-'))}`, '--headless=new', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const p = (await (await fetch('http://127.0.0.1:9363/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
    if (!ws) await dormir(200);
  }
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pend = new Map(); const errores = []; const fotogramas = [];
  ws.addEventListener('message', m => {
    const x = JSON.parse(m.data);
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); }
    else if (x.method === 'Runtime.exceptionThrown') errores.push(x.params.exceptionDetails?.exception?.description?.slice(0, 200));
    else if (x.method === 'Page.screencastFrame') {
      fotogramas.push({ t: x.params.metadata.timestamp, data: x.params.data });
      ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: x.params.sessionId } }));
    }
  });
  const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
  const esperar = async (expr, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (await ev(expr)) return true; await dormir(100); } return false; };
  let pc = false;
  const movil = async () => { pc = false; await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await dormir(400); };
  const escritorio = async () => { pc = true; await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); await dormir(500); };
  const foto = async n => {
    if (!SALIDA) return;
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SALIDA, `${n}${pc ? '-pc' : ''}.png`), Buffer.from(r.result.data, 'base64'));
  };
  const clic = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const fase = () => ev(`document.querySelector('[data-apertura]')?.dataset.fase ?? null`);
  const rect = sel => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  // Arrastre (dedo o ratón) por la línea de rasgado, de la fracción a a la b del ancho
  async function rasgar(a, b) {
    const r = await rect('[data-sobre]');
    const y = r.y + r.h * 0.15, pasos = 14;
    const punto = f => ({ x: r.x + r.w * f, y: y + (Math.random() - 0.5) * 6 });
    if (pc) {
      const raton = (type, p) => cdp('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
      await raton('mousePressed', punto(a));
      for (let k = 1; k <= pasos; k++) { await raton('mouseMoved', punto(a + (b - a) * k / pasos)); await dormir(25); }
      await raton('mouseReleased', punto(b));
    } else {
      const toque = (type, p) => cdp('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y, id: 1 }] });
      await toque('touchStart', punto(a));
      for (let k = 1; k <= pasos; k++) { await toque('touchMove', punto(a + (b - a) * k / pasos)); await dormir(25); }
      await toque('touchEnd', punto(b));
    }
  }
  async function comprar(tipo) {
    await clic(`[data-comprar-sobre="${tipo}"]`);
    await esperar(`!!document.querySelector('.slr-confirmar [data-si]')`, 5000);
    await ev(`[...document.querySelectorAll('.slr-hoja')].pop().querySelector('[data-si]').click(); 0`);
    // La pantalla negra («Preparando sobre…») sale al momento: se espera a la apertura de verdad
    return esperar(`(() => { const a = document.querySelector('[data-apertura]'); return !!a && a.dataset.fase !== 'preparando' && !a.classList.contains('es-cargando'); })()`, 15000);
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
  // Apertura completa (toques, rasgado a medias y entero, explosión, abanico y giro)
  async function apertura(prefijo, { fotos = true } = {}) {
    await dormir(700);
    check(await fase() === 'flotando', `${prefijo}: el sobre aparece flotando`);
    if (fotos) await foto(`${prefijo}-1-flotando`);
    await clic('[data-sobre]'); await dormir(350);
    await clic('[data-sobre]'); await dormir(120);
    const luz = await ev(`({ luz: getComputedStyle(document.querySelector('[data-apertura]')).getPropertyValue('--luz').trim(), carga: document.querySelector('[data-apertura]').dataset.carga,
      grietas: document.querySelectorAll('[data-grietas].visible').length })`);
    check(luz.carga === '2' && luz.grietas === 2, `${prefijo}: 2 toques: carga 2 y grietas de luz (${luz.luz})`);
    if (fotos) await foto(`${prefijo}-2-cargando`);
    await dormir(400);
    await clic('[data-sobre]');
    check(await esperar(`document.querySelector('[data-apertura]')?.dataset.fase === 'rasgar'`, 3000), `${prefijo}: al tercer toque, a rasgar`);
    await dormir(300);
    if (fotos) await foto(`${prefijo}-3-linea`);
    await rasgar(0.02, 0.5);
    await dormir(200);
    const medias = await ev(`({ fase: document.querySelector('[data-apertura]').dataset.fase, puntos: document.querySelector('[data-rasgado]').getAttribute('points').split(' ').length })`);
    check(medias.fase === 'rasgar' && medias.puntos > 3, `${prefijo}: soltar a medias deja el corte a medias (${medias.puntos} puntos) y se puede seguir`);
    if (fotos) await foto(`${prefijo}-4-rasgando`);
    await rasgar(0.48, 0.99);
    check(await esperar(`['explosion', 'revelado'].includes(document.querySelector('[data-apertura]')?.dataset.fase)`, 3000), `${prefijo}: rasgado entero → explosión`);
    await dormir(120);
    if (fotos) await foto(`${prefijo}-5-explosion`);
    check(await esperar(`document.querySelector('[data-apertura]')?.dataset.fase === 'revelado'`, 4000), `${prefijo}: después, el reparto`);
    await dormir(1100);
    const dorsos = await ev(`document.querySelectorAll('[data-revela]:not(.girada) .slr-dorso').length`);
    if (fotos) await foto(`${prefijo}-6-abanico`);
    return dorsos;
  }

  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await movil();
  await entrar();
  await aTienda();

  console.log('\nBásico (con épicas), en el móvil');
  if (process.env.VIDEO) await cdp('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 });
  check(await comprar('basico'), 'se abre la pantalla de apertura');
  const dorsos = await apertura('apertura');
  check(dorsos === 3, `3 cartas boca abajo en abanico (${dorsos})`);
  const i = await ev(`[...document.querySelectorAll('[data-revela]')].findIndex(c => c.classList.contains('slr-revela--epica'))`);
  check(i >= 0, 'hay una épica');
  // Giro: se muestrea en cada frame el ángulo real (rotateY de la matriz) y que nada aplane el 3D
  const muestreo = idx => `(async () => {
    const c = document.querySelector('[data-revela="${idx}"]'), g = c.querySelector('.slr-revela__giro');
    const angulo = () => { const m = new DOMMatrix(getComputedStyle(g).transform); return Math.round(Math.atan2(-m.m13, m.m11) * 180 / Math.PI); };
    const plano = () => { const cg = getComputedStyle(g); return cg.filter !== 'none' || cg.opacity !== '1' || cg.transformStyle !== 'preserve-3d'
      || [...c.querySelectorAll('.slr-revela__cara')].some(f => getComputedStyle(f).backfaceVisibility !== 'hidden'); };
    const t0 = performance.now(), m = [];
    c.click();
    while (performance.now() - t0 < 2300) { await new Promise(r => requestAnimationFrame(r)); m.push([Math.round(performance.now() - t0), angulo(), plano()]); }
    return m; })()`;
  const mE = await ev(muestreo(i));
  const primeroE = mE.find(([, a]) => Math.abs(a) > 5), medioE = mE.find(([, a]) => Math.abs(a) >= 90);
  check(mE.slice(0, 3).every(([, a]) => Math.abs(a) < 20), `al tocar la épica sigue de dorso (ángulos de los primeros frames: ${mE.slice(0, 3).map(x => x[1]).join(', ')}°): no se revela de golpe`);
  check(!mE.some(([, , pl]) => pl), 'durante todo el giro: sin filter ni opacity en lo que gira, preserve-3d y caras con backface-visibility: hidden');
  check(primeroE && medioE && medioE[0] >= 600, `la épica se carga y gira despacio (empieza a moverse a los ${primeroE?.[0]} ms y el frente asoma a los ${medioE?.[0]} ms del toque)`);
  check(Math.abs(Math.abs(mE[mE.length - 1][1]) - 180) <= 1 && await ev(`document.querySelector('[data-revela="${i}"]').classList.contains('revelada')`),
    'termina de frente (180°) y revelada, una sola vez');
  const comun = await ev(`[...document.querySelectorAll('[data-revela]')].findIndex(c => c.classList.contains('slr-revela--comun') && !c.classList.contains('girada'))`);
  if (comun >= 0) {
    const mC = await ev(muestreo(comun));
    const medioC = mC.find(([, a]) => Math.abs(a) >= 90);
    check(medioC && medioC[0] < (medioE?.[0] ?? 0), `la común gira más rápido (mitad a los ${medioC?.[0]} ms)`);
  }
  // Capturas a mitad de giro de la otra carta que quede boca abajo
  const otra = await ev(`[...document.querySelectorAll('[data-revela]')].findIndex(c => !c.classList.contains('girada'))`);
  if (otra >= 0 && SALIDA) {
    await clic(`[data-revela="${otra}"]`);
    for (const [ms, n] of [[120, 'a'], [260, 'b'], [420, 'c'], [700, 'd']]) { await dormir(ms - (n === 'a' ? 0 : [0, 120, 260, 420][['a', 'b', 'c', 'd'].indexOf(n)])); await foto(`apertura-7-giro-${n}`); }
  }
  await dormir(900);
  await foto('apertura-7-giro-epica');
  for (let k = 0; k < 3; k++) { await clic(`[data-revela="${k}"]`); await dormir(400); }
  await esperar(`!!document.querySelector('[data-continuar]')`, 4000);
  await dormir(1200);
  await foto('apertura-8-reveladas');
  await clic('[data-continuar]');
  check(await esperar(`!!document.querySelector('[data-resumen-sobre]')`, 3000), 'resumen');
  const res = await ev(`document.querySelector('[data-final]').textContent.replace(/\\s+/g, ' ')`);
  check(/valor total/.test(res) && /(NUEVA|Repetida)/.test(res), `resumen con nuevas, rarezas, colección y valor: «${res.slice(0, 120)}…»`);
  await dormir(500);
  await foto('apertura-9-resumen');
  if (process.env.VIDEO) {
    await cdp('Page.stopScreencast');
    const dir = join(SALIDA ?? tmpdir(), 'video'); mkdirSync(dir, { recursive: true });
    fotogramas.forEach((f, k) => writeFileSync(join(dir, `${String(k).padStart(4, '0')}_${f.t.toFixed(3)}.jpg`), Buffer.from(f.data, 'base64')));
    console.log(`  (vídeo: ${fotogramas.length} fotogramas en ${dir})`);
  }
  await clic('[data-cerrar-apertura]');
  check(await esperar(`!document.querySelector('[data-apertura]')`, 3000), 'se cierra y vuelve a la tienda');

  console.log('\nSaltar');
  await aTienda();
  await comprar('sencillo');
  await dormir(500);
  await clic('[data-saltar]');
  check(await esperar(`!!document.querySelector('[data-resumen-sobre]')`, 3000), '«Saltar» va directo al resumen');
  await clic('[data-cerrar-apertura]');
  await dormir(500);

  console.log('\nSobre de elección y elección pendiente');
  await aTienda();
  await comprar('eleccion');
  await dormir(500);
  await clic('[data-saltar]');
  check(await esperar(`document.querySelectorAll('[data-elegir]:not([hidden])').length === 3`, 4000), 'con «Saltar», las 3 candidatas giradas y con «Elegir»');
  const cuenta = await ev(`document.querySelector('.slr-apertura__cuenta')?.textContent`);
  check(/Te quedan/.test(cuenta ?? ''), `con la cuenta atrás («${cuenta?.trim()}»)`);
  await dormir(700);
  await foto('eleccion-1-candidatas');
  // Se cierra sin elegir: la elección queda pendiente y reaparece al recargar
  await ev('history.back(); 0');
  await dormir(800);
  check(await esperar(`!!document.querySelector('[data-pendiente-global]')`, 5000), 'al cerrar sin elegir, aviso de elección pendiente');
  await entrar();
  check(await esperar(`!!document.querySelector('[data-pendiente-global]')`, 8000), 'y tras recargar la página, el aviso reaparece');
  await foto('eleccion-2-pendiente');
  await clic('[data-pendiente-global]');
  check(await esperar(`document.querySelectorAll('[data-elegir]:not([hidden])').length === 3`, 5000), 'tocándolo, vuelven las candidatas');
  await ev(`document.querySelectorAll('[data-elegir]')[1].click(); 0`);
  check(await esperar(`!!document.querySelector('[data-resumen-sobre]')`, 8000), 'elegida: resumen con la carta elegida');
  await dormir(400);
  await foto('eleccion-3-elegida');
  await clic('[data-cerrar-apertura]');
  await dormir(600);
  check(!(await ev(`!!document.querySelector('[data-pendiente-global]')`)), 'y el aviso desaparece');

  console.log('\nMovimiento reducido');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await aTienda();
  await comprar('sencillo');
  await dormir(400);
  const red = await ev(`({ fase: document.querySelector('[data-apertura]').dataset.fase, girada: document.querySelectorAll('[data-revela].girada').length })`);
  check(red.fase === 'revelado' && red.girada === 1, 'sin temblores ni partículas: la carta sale ya revelada');
  await ev('history.back(); 0');
  await dormir(500);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  console.log('\nAdmin de sobres');
  await clic('.slr-nav__item[data-seccion="perfil"]');
  await esperar(`!!document.querySelector('[data-pruebas="sobres"]')`, 10000);
  await clic('[data-pruebas="sobres"]');
  check(await esperar(`document.querySelectorAll('[data-tipo-admin]').length === 5`, 10000), 'pantalla Sobres: los 5 tipos editables');
  await dormir(500);
  await foto('admin-sobres');
  await ev(`(() => { document.querySelector('[data-prev-tipo]').value = 'basico'; document.querySelector('[data-prev-rareza]').value = 'legendaria'; return 0; })()`);
  await clic('[data-vista-previa]');
  check(await esperar(`!!document.querySelector('[data-apertura].slr-apertura--legendaria')`, 8000), 'vista previa de apertura con una legendaria (sin gastar)');
  await ev('history.back(); 0');
  await dormir(500);
  await ev('history.back(); 0');
  await dormir(500);

  console.log('\nPC');
  await escritorio();
  await aTienda();
  await rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: U.equipo, importe: 10000 });
  // Las épicas que ya tiene Bot Uno vuelven al bombo, para ver otra vez la luz morada
  const mias2 = (await leer(`cartas?select=id,disenos_carta(rareza)&equipo_id=eq.${U.equipo}`)).datos;
  for (const c of mias2.filter(x => x.disenos_carta.rareza === 'epica')) await rpcOk('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: c.id, equipo_id: null });
  const mias3 = (await leer(`cartas?select=id&equipo_id=eq.${U.equipo}`)).datos;
  for (const c of mias3.slice(0, Math.max(0, mias3.length - 10))) await rpcOk('slr_vender_banco', { token: U.token, carta_id: c.id });
  await ev(`import('/js/slr/rush.js').then(r => r.recargar('cartas')).then(() => 0)`);
  await comprar('basico');
  await apertura('apertura');
  const ipc = await ev(`[...document.querySelectorAll('[data-revela]')].findIndex(c => c.classList.contains('slr-revela--epica'))`);
  if (ipc >= 0) { await clic(`[data-revela="${ipc}"]`); await dormir(480); await foto('apertura-7-giro-epica'); await dormir(900); }
  await clic('[data-saltar]');
  await dormir(600);
  await foto('apertura-9-resumen');
  await clic('[data-cerrar-apertura]');
  await dormir(600);
  await aTienda();
  await comprar('eleccion');
  await dormir(500);
  await clic('[data-saltar]');
  await esperar(`document.querySelectorAll('[data-elegir]:not([hidden])').length === 3`, 4000);
  await dormir(700);
  await foto('eleccion-1-candidatas');
  await ev(`document.querySelectorAll('[data-elegir]')[0].click(); 0`);
  await esperar(`!!document.querySelector('[data-cerrar-apertura]')`, 8000);
  await clic('[data-cerrar-apertura]');
  await dormir(600);
  await clic('.slr-nav__item[data-seccion="perfil"]');
  await esperar(`!!document.querySelector('[data-pruebas="sobres"]')`, 10000);
  await clic('[data-pruebas="sobres"]');
  await esperar(`document.querySelectorAll('[data-tipo-admin]').length === 5`, 10000);
  await dormir(500);
  await foto('admin-sobres');

  check(!errores.length, `sin errores en la consola${errores.length ? `: ${errores.join(' | ')}` : ''}`);
} catch (e) {
  mal++;
  console.log(`  ✖ Error inesperado: ${e.message}`);
} finally {
  ch?.kill();
  await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
  await rpc('slr_logout', { token: U.token });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas`);
  process.exit(mal ? 1 : 0);
}
