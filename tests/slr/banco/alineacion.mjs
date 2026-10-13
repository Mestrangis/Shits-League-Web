// Prueba de la pantalla de Alineación en Chrome headless: arrastrar y soltar con
// ratón (escritorio) y táctil (móvil 390×844), la hoja de selección y el botón atrás.
//   node tests/slr/banco/alineacion.mjs      (con el servidor local en :3000 y .env.local)
// Crea una liga de prueba con Bot Uno y la borra al terminar. SALIDA=carpeta guarda capturas.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, rpcOk, rpc } from '../api-util.mjs';

const SALIDA = process.env.SALIDA;            // carpeta para las capturas
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };

// ── Liga de prueba con Bot Uno (equipo, 11 cartas) ──
const t = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: t, nombre: 'Prueba alineación (banco)' });
await rpcOk('slr_unirse_liga', { token: t, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });

async function navegador(movil) {
  const puerto = movil ? 9341 : 9340;
  const ch = spawn(process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [`--remote-debugging-port=${puerto}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'e2e-'))}`, '--headless=new', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const p = (await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
    if (!ws) await dormir(200);
  }
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', m => { const x = JSON.parse(m.data); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };
  if (!movil) await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1500, deviceScaleFactor: 1, mobile: false });
  if (movil) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: 'http://localhost:3000/' });
  await dormir(1500);
  await ev(`localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', ${JSON.stringify(env.SLR_BOT_UNO_CODIGO)}); 0`);
  await cdp('Page.navigate', { url: 'http://localhost:3000/#rush' });
  for (let i = 0; i < 50 && !(await ev(`!!document.getElementById('rushJugar')`)); i++) await dormir(200);
  await ev(`document.getElementById('rushJugar').click(); 0`);
  for (let i = 0; i < 50 && !(await ev(`!!document.querySelector('.slr-nav:not([hidden])')`)); i++) await dormir(200);
  await ev(`import('/js/slr/rush.js').then(m => m.navegar('alineacion')).then(() => 0)`);
  await dormir(800);
  const foto = async nombre => {
    if (!SALIDA) return;
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SALIDA, `${nombre}.png`), Buffer.from(r.result.data, 'base64'));
  };
  return { ch, cdp, ev, foto };
}

const ESTADO = `(() => {
  const h = {}; document.querySelectorAll('.slr-hueco').forEach(b => { h[b.dataset.l + b.dataset.i] = b.dataset.id ?? null; });
  return { huecos: h, libres: [...document.querySelectorAll('.slr-libre')].map(x => x.dataset.id),
           capitan: document.querySelector('.slr-hueco .slr-carta__capitan')?.closest('.slr-hueco')?.dataset.id ?? null,
           sucio: !!document.querySelector('.slr-estado--sucio'),
           fuerzas: [...document.querySelectorAll('.slr-fuerza b')].map(b => b.textContent).join('/'),
           toasts: [...document.querySelectorAll('.slr-toast')].map(t => t.textContent) };
})()`;
const centro = sel => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;

/* ── Escritorio: ratón ─────────────────────────────────────────────────── */
console.log('\nEscritorio (ratón)');
{
  const { ch, cdp, ev, foto } = await navegador(false);
  const raton = (type, p, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
  async function arrastrar(desde, hasta, { fotoMedio } = {}) {
    // Ventana alta: con el scroll arriba se ven el campo, el banquillo y «Sin colocar»
    await ev(`document.querySelector('.slr-main').scrollTop = 0; 0`);
    await dormir(100);
    const a = await ev(`(() => { const r = document.querySelector(${JSON.stringify(desde)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await raton('mousePressed', a);
    const b = await ev(`(() => { const r = document.querySelector(${JSON.stringify(hasta)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    for (let k = 1; k <= 12; k++) { await raton('mouseMoved', { x: a.x + (b.x - a.x) * k / 12, y: a.y + (b.y - a.y) * k / 12 }); await dormir(20); }
    await dormir(120);
    const durante = await ev(`({ fantasma: !!document.querySelector('.slr-fantasma'), destino: !!document.querySelector(${JSON.stringify(hasta)} + '.es-destino'),
      previsto: document.querySelector('.slr-hueco__previsto')?.textContent ?? null, origen: !!document.querySelector('.es-origen') })`);
    if (fotoMedio) await foto(fotoMedio);
    await raton('mouseReleased', b);
    await dormir(400);
    return durante;
  }

  const e0 = await ev(ESTADO);
  check(Object.values(e0.huecos).filter(Boolean).length === 10 && e0.libres.length === 1, `alineación inicial: 10 colocadas (7 titulares + 3 banquillo) y 1 sin colocar`);

  // Campo ↔ campo (intercambio)
  let d = await arrastrar('.slr-hueco[data-l="del"][data-i="0"]', '.slr-hueco[data-l="med"][data-i="1"]', { fotoMedio: 'arrastre-escritorio' });
  let e1 = await ev(ESTADO);
  check(d.fantasma && d.destino && d.origen && /CON \d+/.test(d.previsto ?? ''), `mientras arrastras: la carta sigue al ratón y el hueco destino se ilumina con «${d.previsto}»`);
  check(e1.huecos.med1 === e0.huecos.del0 && e1.huecos.del0 === e0.huecos.med1, 'campo ↔ campo: las dos cartas se intercambian');
  check(e1.sucio && e1.fuerzas !== e0.fuerzas, `las fuerzas se recalculan al soltar (${e0.fuerzas} → ${e1.fuerzas})`);
  check(!(await ev(`!!document.querySelector('.slr-hoja')`)), 'soltar no abre la hoja del hueco');

  // Banquillo ↔ campo
  const e2a = await ev(ESTADO);
  await arrastrar('.slr-hueco[data-l="banco"][data-i="0"]', '.slr-hueco[data-l="def"][data-i="0"]');
  const e2 = await ev(ESTADO);
  check(e2.huecos.def0 === e2a.huecos.banco0 && e2.huecos.banco0 === e2a.huecos.def0, 'banquillo ↔ campo: intercambio');

  // Desde "Sin colocar" a un hueco ocupado
  const libre = e2.libres[0];
  await arrastrar(`.slr-libre[data-id="${libre}"]`, '.slr-hueco[data-l="del"][data-i="1"]');
  const e3 = await ev(ESTADO);
  check(e3.huecos.del1 === libre && e3.libres.includes(e2.huecos.del1), 'sin colocar → hueco ocupado: entra y la que estaba queda sin colocar');

  // Del campo a "Sin colocar" (hueco vacío) y de vuelta a un hueco vacío
  await arrastrar('.slr-hueco[data-l="med"][data-i="0"]', '[data-libres]');
  const e4 = await ev(ESTADO);
  check(e4.huecos.med0 === null && e4.libres.includes(e3.huecos.med0), 'campo → «Sin colocar»: el hueco queda vacío');
  await arrastrar('.slr-hueco[data-l="banco"][data-i="1"]', '.slr-hueco[data-l="med"][data-i="0"]');
  const e5 = await ev(ESTADO);
  check(e5.huecos.med0 === e4.huecos.banco1 && e5.huecos.banco1 === null, 'banquillo → hueco vacío: la carta se mueve');

  // El capitán al banquillo pierde la capitanía con aviso (antes se nombra uno desde la hoja)
  await ev(`document.querySelector('.slr-main').scrollTop = 0; document.querySelector('.slr-hueco[data-l="del"][data-i="0"]').click(); 0`);
  await dormir(600);
  await ev(`document.querySelector('.slr-hoja [data-capitan]').click(); 0`);
  await dormir(600);
  const capSlot = await ev(`(() => { const b = document.querySelector('.slr-hueco .slr-carta__capitan')?.closest('.slr-hueco'); return b ? b.dataset.l + '|' + b.dataset.i : null; })()`);
  if (capSlot) {
    const [l, i] = capSlot.split('|');
    await arrastrar(`.slr-hueco[data-l="${l}"][data-i="${i}"]`, '.slr-hueco[data-l="banco"][data-i="2"]');
    const e6 = await ev(ESTADO);
    check(e6.capitan === null && e6.toasts.some(x => /capitanía/.test(x)), `capitán al banquillo: pierde la capitanía con aviso («${e6.toasts.find(x => /capitanía/.test(x))}»)`);
  } else check(false, 'no había capitán en el campo');

  // Clic corto: abre la hoja con los dos bloques
  const p = await ev(centro('.slr-hueco[data-l="def"][data-i="1"]'));
  await raton('mousePressed', p); await raton('mouseReleased', p);
  await dormir(600);
  const hojaInfo = await ev(`({ abierta: !!document.querySelector('.slr-hoja'), titulos: [...document.querySelectorAll('.slr-lista-cartas__titulo')].map(h => h.textContent.trim().replace(/\\s+/g, ' ')),
    donde: [...document.querySelectorAll('.slr-hoja .slr-lista-cartas__texto small')].map(s => s.textContent).slice(0, 12),
    aviso: !!document.querySelector('.slr-hoja .slr-lista-cartas__texto em') })`);
  check(hojaInfo.abierta && /^Sin colocar/.test(hojaInfo.titulos[0] ?? '') && /^Ya colocadas/.test(hojaInfo.titulos[1] ?? ''), `clic corto: hoja con «${hojaInfo.titulos.join('» y «')}»`);
  check(hojaInfo.donde.some(x => /Ahora en (POR|DEF|MED|DEL|Banquillo)/.test(x)), `las colocadas dicen dónde están (${hojaInfo.donde.filter(x => /Ahora/.test(x)).slice(0, 3).join(', ')})`);
  check(hojaInfo.aviso, 'se mantienen los avisos de «rinde mal aquí»');
  await foto('hoja-escritorio');
  // Elegir una "ya colocada" intercambia
  const antes = await ev(ESTADO);
  const elegida = await ev(`(() => { const b = [...document.querySelectorAll('.slr-hoja [data-id]')].find(x => /Ahora en/.test(x.textContent)); b.click(); return b.dataset.id; })()`);
  await dormir(600);
  const tras = await ev(ESTADO);
  const desde = Object.entries(antes.huecos).find(([, v]) => v === elegida)?.[0];
  check(tras.huecos.def1 === elegida && tras.huecos[desde] === antes.huecos.def1, `elegir una «ya colocada» intercambia posiciones (${desde} ↔ def1)`);

  // Atrás durante un arrastre: se cancela y no queda la carta flotando
  const a = await ev(centro('.slr-hueco[data-l="del"][data-i="0"]'));
  await raton('mousePressed', a);
  for (let k = 1; k <= 5; k++) { await raton('mouseMoved', { x: a.x + 8 * k, y: a.y + 8 * k }); await dormir(20); }
  await ev(`history.back(); 0`);
  await dormir(500);
  check(!(await ev(`!!document.querySelector('.slr-fantasma')`)), 'el botón atrás durante un arrastre lo cancela (sin carta flotando)');
  await raton('mouseReleased', a);
  ch.kill();
}

/* ── Móvil: táctil ─────────────────────────────────────────────────────── */
console.log('\nMóvil 390×844 (táctil)');
{
  const { ch, cdp, ev, foto } = await navegador(true);
  const toque = (type, p) => cdp('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y, id: 1 }] });
  const pos = sel => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);

  async function arrastrarDedo(desde, hasta, espera = 350, fotoMedio) {
    await ev(`document.querySelector(${JSON.stringify(desde)}).scrollIntoView({ block: 'center' }); 0`);
    await dormir(200);
    const a = await pos(desde);
    await toque('touchStart', a);
    await dormir(espera);
    const b = await pos(hasta);
    for (let k = 1; k <= 14; k++) { await toque('touchMove', { x: a.x + (b.x - a.x) * k / 14, y: a.y + (b.y - a.y) * k / 14 }); await dormir(25); }
    await dormir(150);
    const durante = await ev(`({ fantasma: !!document.querySelector('.slr-fantasma'), destino: !!document.querySelector('.es-destino'), previsto: document.querySelector('.slr-hueco__previsto')?.textContent ?? null })`);
    if (fotoMedio) await foto(fotoMedio);
    await toque('touchEnd', b);
    await dormir(450);
    return durante;
  }

  const tab0 = await ev(`document.querySelector('.tab.active')?.dataset.tab`);
  const e0 = await ev(ESTADO);
  const d = await arrastrarDedo('.slr-hueco[data-l="del"][data-i="0"]', '.slr-hueco[data-l="def"][data-i="1"]', 350, 'arrastre-movil');
  const e1 = await ev(ESTADO);
  check(d.fantasma && d.destino && /DEF \d+/.test(d.previsto ?? ''), `mantener pulsado y arrastrar: la carta sigue al dedo, destino iluminado con «${d.previsto}»`);
  check(e1.huecos.def1 === e0.huecos.del0 && e1.huecos.del0 === e0.huecos.def1, 'táctil campo ↔ campo: intercambio');
  check(await ev(`document.querySelector('.tab.active')?.dataset.tab`) === tab0, 'no cambia de pestaña de la app (swipe entre pestañas)');
  check(!(await ev(`!!document.querySelector('.slr-hoja')`)), 'soltar no abre la hoja');

  // Desde "Sin colocar" al banquillo
  const libre = e1.libres[0];
  await arrastrarDedo(`.slr-libre[data-id="${libre}"]`, '.slr-hueco[data-l="banco"][data-i="0"]');
  const e2 = await ev(ESTADO);
  check(e2.huecos.banco0 === libre, 'táctil sin colocar → banquillo');

  // Un deslizamiento rápido (sin esperar) es scroll, no arrastre
  await ev(`document.querySelector('.slr-main').scrollTop = 300; 0`);
  await dormir(200);
  const s0 = await ev(`document.querySelector('.slr-main').scrollTop`);
  const p = await pos('.slr-hueco[data-l="med"][data-i="0"]');
  await toque('touchStart', p);
  for (let k = 1; k <= 10; k++) { await toque('touchMove', { x: p.x, y: p.y - 18 * k }); await dormir(16); }
  await toque('touchEnd', { x: p.x, y: p.y - 180 });
  await dormir(600);
  const s1 = await ev(`document.querySelector('.slr-main').scrollTop`);
  const e3 = await ev(ESTADO);
  check(JSON.stringify(e3.huecos) === JSON.stringify(e2.huecos) && !(await ev(`!!document.querySelector('.slr-fantasma')`)),
    `un deslizamiento rápido no arrastra (scroll ${s0} → ${s1})`);
  check(!(await ev(`!!document.querySelector('.slr-hoja')`)), 'ni abre la hoja');

  // Toque corto: hoja de siempre
  const q = await pos('.slr-hueco[data-l="por"][data-i="0"]');
  await ev(`document.querySelector('.slr-hueco[data-l="por"]').scrollIntoView({ block: 'center' }); 0`);
  await dormir(200);
  const q2 = await pos('.slr-hueco[data-l="por"][data-i="0"]');
  await toque('touchStart', q2); await dormir(80); await toque('touchEnd', q2);
  await dormir(700);
  check(await ev(`!!document.querySelector('.slr-hoja') && document.querySelectorAll('.slr-lista-cartas__titulo').length === 2`), 'toque corto: abre la hoja con los dos bloques');
  await foto('hoja-movil');
  await ev(`history.back(); 0`);
  await dormir(500);

  // Desplazamiento automático al llevar la carta al borde
  await ev(`document.querySelector('.slr-main').scrollTop = 0; 0`);
  await dormir(200);
  const a = await pos('.slr-hueco[data-l="del"][data-i="1"]');
  await toque('touchStart', a);
  await dormir(350);
  const borde = { x: a.x, y: 844 - 40 };
  for (let k = 1; k <= 10; k++) { await toque('touchMove', { x: a.x, y: a.y + (borde.y - a.y) * k / 10 }); await dormir(25); }
  const sa = await ev(`document.querySelector('.slr-main').scrollTop`);
  await dormir(700);
  const sb = await ev(`document.querySelector('.slr-main').scrollTop`);
  check(sb > sa + 40, `con la carta en el borde inferior la página baja sola (${sa} → ${sb})`);
  await toque('touchEnd', borde);
  await dormir(400);
  ch.kill();
}

await rpc('slr_borrar_liga', { token: t, liga_id: liga.id });
await rpc('slr_logout', { token: t });
console.log(`\n${ok}/${ok + mal} comprobaciones correctas`);
process.exit(mal ? 1 : 0);
