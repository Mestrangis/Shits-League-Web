// Prueba en Chrome headless de la reproducción de partidos (Android emulado a 360 y 412 px):
//  · Muestrario (Modo pruebas): cada escena y cada variante se reproduce y, en varios
//    momentos, nada importante se sale de la pantalla. Capturas de cada una.
//  · Un partido de verdad desde la crónica: «▶ Ver partido» empieza por el inicio, el tap
//    salta al final de la escena y pasa a la siguiente, ×2, «Saltar» va al final con el
//    resultado del partido, y al terminar se vuelve a la crónica.
//   node tests/slr/banco/partido.mjs   (servidor local en :3000 y .env.local; SALIDA=carpeta guarda capturas)
//   SOLO=gol,parada  limita el muestrario a esos tipos.
// Crea una liga de prueba con Bot Uno y 3 bots (1 jornada jugada) y la borra al terminar.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, rpcOk, rpc, leer } from '../api-util.mjs';

const SALIDA = process.env.SALIDA;
const SOLO = process.env.SOLO ? new Set(process.env.SOLO.split(',')) : null;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

const t = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: t, nombre: 'Prueba partido animado (banco)' });
const L = liga.id;
let ch = null;
try {
  const U = (await rpcOk('slr_unirse_liga', { token: t, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  for (let i = 0; i < 3; i++) await rpcOk('slr_admin_anadir_bot', { token: t, liga_id: L });
  await rpcOk('slr_iniciar_temporada', { token: t, liga_id: L });
  let r;
  do { r = await rpcOk('slr_admin_jugar_jornada', { token: t, liga_id: L }); if (r.estado === 'simulando') await dormir(1500); } while (r.estado === 'simulando');
  const mio = (await leer(`partidos?select=id,goles_local,goles_visitante,local_id&liga_id=eq.${L}&tipo=eq.liga&or=(local_id.eq.${U},visitante_id.eq.${U})`)).datos[0];

  ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--remote-debugging-port=9365',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'pt-'))}`, '--headless=new', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const p = (await (await fetch('http://127.0.0.1:9365/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
    if (!ws) await dormir(200);
  }
  await new Promise(r2 => ws.addEventListener('open', r2, { once: true }));
  let id = 0; const pend = new Map(); const errores = [];
  ws.addEventListener('message', m => {
    const x = JSON.parse(m.data);
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); }
    else if (x.method === 'Runtime.exceptionThrown') errores.push(x.params.exceptionDetails?.exception?.description?.slice(0, 200));
    else if (x.method === 'Runtime.consoleAPICalled' && x.params.type === 'error') errores.push(x.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 200));
  });
  const cdp = (method, params = {}) => new Promise(r2 => { const i = ++id; pend.set(i, r2); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r2 = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r2.result?.result?.value; };
  const esperar = async (e, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (await ev(e)) return true; await dormir(100); } return false; };
  const clic = s => ev(`(() => { const e = document.querySelector(${JSON.stringify(s)}); if (!e) return false; e.click(); return true; })()`);
  let ancho = 412;
  const android = async w => {
    ancho = w;
    await cdp('Emulation.setUserAgentOverride', { userAgent: UA, platform: 'Linux armv8l' });
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: { 360: 720, 412: 835 }[w], deviceScaleFactor: w === 360 ? 3 : 2.625, mobile: true });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await dormir(300);
  };
  const foto = async n => {
    if (!SALIDA) return;
    const r2 = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(join(SALIDA, `pt-${ancho}-${n}.jpg`), Buffer.from(r2.result.data, 'base64'));
  };
  // Lo visible e importante dentro de la pantalla (las botas, el balón y las franjas entran y salen a propósito)
  const fuera = () => ev(`(() => {
    const capa = document.querySelector('[data-partido-reproductor]'); if (!capa) return 'sin capa';
    const vw = document.documentElement.clientWidth, R = capa.getBoundingClientRect();
    const sel = '.slr-pt-carta, .slr-pt-rotulo b, .slr-pt-barra, .slr-pt-panel, .slr-pt-lesion, .slr-pt-vs, .slr-pt-poder, .slr-pt-marcador, .slr-pt-controles, .slr-pt-porteria';
    const malos = [...capa.querySelectorAll(sel)].filter(n => {
      let x = n, op = 1; while (x && x !== capa) { op *= Number(getComputedStyle(x).opacity); x = x.parentElement; }
      if (op < 0.85) return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 && (r.left < -2 || r.right > vw + 2 || r.top < R.top - 2 || r.bottom > R.bottom + 2);
    }).map(n => { const r = n.getBoundingClientRect(); return (n.className.baseVal ?? n.className).toString().split(' ').slice(0, 2).join('.') + ' ' + Math.round(r.left) + '→' + Math.round(r.right) + ' / ' + Math.round(r.top) + '→' + Math.round(r.bottom); });
    return { vw, sw: document.documentElement.scrollWidth, cw: Math.round(R.width), malos };
  })()`);
  async function entrar() {
    await cdp('Page.navigate', { url: 'http://localhost:3000/' });
    await dormir(1500);
    await ev(`localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', ${JSON.stringify(env.SLR_BOT_UNO_CODIGO)});
      localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true })); 0`);
    await cdp('Page.navigate', { url: 'http://localhost:3000/#rush' });
    await ev('window.__paginaVieja = true; 0');
    await cdp('Page.reload', {});
    await esperar(`!window.__paginaVieja && !!document.getElementById('rushJugar')`, 30000);
    await clic('#rushJugar');
    await esperar(`!!document.querySelector('.slr-nav:not([hidden])')`, 15000);
    await dormir(600);
  }
  const cerrarReproductor = async () => { await ev(`document.querySelector('[data-partido-reproductor]:not(.cerrando)') && history.back(); 0`); await esperar(`!document.querySelector('[data-partido-reproductor]')`, 3000); await dormir(300); };

  await cdp('Runtime.enable');
  await cdp('Page.enable');

  // Resultado de cada escena del muestrario según su variante
  const RESULTADO = { gol: 'izq', parada: 'der', pase: 'izq', corte: 'der' };
  for (const w of [360, 412]) {
    console.log(`\nMuestrario a ${w} px`);
    await android(w);
    await entrar();
    await clic('.slr-nav__item[data-seccion="perfil"]');
    await esperar(`!!document.querySelector('[data-pruebas="escenas-partido"]')`, 10000);
    await clic('[data-pruebas="escenas-partido"]');
    await esperar(`!!document.querySelector('[data-tipo]')`, 5000);
    const botones = await ev(`[...document.querySelectorAll('[data-tipo]')].map(b => [b.dataset.tipo, b.dataset.variante])`);
    const vistas = new Set();
    for (const [tipo, variante] of botones) {
      if (SOLO && !SOLO.has(tipo)) continue;
      const res = RESULTADO[tipo] ?? (vistas.has(tipo) ? 'der' : 'izq');
      vistas.add(tipo);
      await ev(`(() => { const s = document.querySelector('[data-resultado]'); s.value = ${JSON.stringify(res)};
        const p = document.querySelector('[data-p]'); p.value = ${tipo === 'control' && res === 'der' ? 70 : 50}; p.dispatchEvent(new Event('input'));
        document.querySelector('[data-version]').value = 'completa'; document.querySelector('[data-poder]').value = ''; return 0; })()`);
      await clic(`[data-tipo="${tipo}"][data-variante="${variante}"]`);
      const abierto = await esperar(`document.querySelector('[data-partido-reproductor]')?.dataset.escena === ${JSON.stringify(tipo)}`, 4000);
      const malos = [];
      // En el 30, el 60 y el 95 % de la escena: pausa, mira y sigue
      for (const [k, frac] of [[1, 0.3], [2, 0.6], [3, 0.95]]) {
        const llego = await esperar(`(() => { const r = document.querySelector('[data-partido-reproductor]')?.reproductor; const l = r?.linea;
          if (!l || l.t < l.dur * ${frac}) return false; r.pausar(); return true; })()`, 8000);
        if (!llego) { malos.push(`no llega al ${frac * 100} %`); break; }
        await dormir(60);
        const f = await fuera();
        if (typeof f === 'string') { malos.push(f); break; }
        if (f.sw > f.vw || f.cw !== f.vw) malos.push(`capa ${f.cw}/${f.vw}, scrollWidth ${f.sw}`);
        malos.push(...f.malos.map(x => `${frac * 100} %: ${x}`));
        await foto(`${tipo}-${variante}-${k}`);
        if (k < 3) await ev(`document.querySelector('[data-partido-reproductor]')?.reproductor.reanudar(); 0`);   // la última se cierra en pausa
      }
      check(abierto && !malos.length, `${w} px · ${tipo}/${variante}: se reproduce y nada se sale`, malos.slice(0, 4).join(' | '));
      await cerrarReproductor();
    }
    // Fluidez: una jugada entera con gol, con la CPU ×6 (un Android normal)
    if (!SOLO) {
      await ev(`(() => { document.querySelector('[data-poder]').value = 'izq'; document.querySelector('[data-resultado]').value = 'izq';
        document.querySelector('[data-version]').value = 'completa'; return 0; })()`);
      await cdp('Emulation.setCPUThrottlingRate', { rate: 6 });
      await ev(`window.__frames = []; (function f(t) { window.__frames.push(t); if (window.__frames.length < 4000) requestAnimationFrame(f); })(performance.now()); 0`);
      await clic('[data-jugada]');
      await esperar(`!!document.querySelector('[data-partido-reproductor]')`, 4000);
      await esperar(`!document.querySelector('[data-partido-reproductor]')`, 60000);
      await cdp('Emulation.setCPUThrottlingRate', { rate: 1 });
      const m = await ev(`(() => { const f = window.__frames, d = f.slice(1).map((t, i) => t - f[i]).filter(x => x < 1000).sort((a, b) => a - b);
        const total = d.reduce((s, x) => s + x, 0); return { fps: Math.round(1000 * d.length / total), p95: Math.round(d[Math.floor(d.length * 0.95)]), max: Math.round(d.at(-1)), lentos: d.filter(x => x > 50).length, n: d.length }; })()`);
      check(m.fps >= 45, `${w} px · CPU ×6, jugada entera con poder y gol: ${m.fps} fps, p95 ${m.p95} ms, ${m.lentos} frames > 50 ms (máx ${m.max} ms)`);
    }
    // Con un poder: arranca la barra inclinada
    await ev(`(() => { document.querySelector('[data-poder]').value = 'izq'; document.querySelector('[data-version]').value = 'completa'; return 0; })()`);
    await clic('[data-tipo="poder"][data-variante="carta"]');
    await esperar(`document.querySelector('[data-partido-reproductor]')?.dataset.escena === 'poder'`, 4000);
    await dormir(600);
    await foto('poder-entrada');
    await cerrarReproductor();
    await ev(`history.back(); 0`);
    await dormir(500);
  }

  console.log('\nUn partido de verdad desde la crónica');
  await android(412);
  await clic('.slr-nav__item[data-seccion="liga"]');
  await esperar(`!!document.querySelector('[data-vista="calendario"]')`, 10000);
  await clic('[data-vista="calendario"]');
  await esperar(`!!document.querySelector('[data-partido="${mio.id}"]')`, 10000);
  await clic(`[data-partido="${mio.id}"]`);
  check(await esperar(`!!document.querySelector('[data-ver-partido]')`, 10000), 'la crónica tiene «▶ Ver partido»');
  await clic('[data-ver-partido]');
  check(await esperar(`document.querySelector('[data-partido-reproductor]')?.dataset.escena === 'inicio'`, 10000), 'empieza por el inicio (VS)');
  await dormir(900);
  await foto('real-1-inicio');
  const nombres = await ev(`[...document.querySelectorAll('.slr-pt-marcador__nombre')].map(n => n.textContent)`);
  check(nombres[0] === 'Bot Uno FC', `tu equipo a la izquierda (${nombres.join(' · ')})`);
  // Tap: salta al final de la escena y pasa a la siguiente
  const antes = await ev(`document.querySelector('[data-partido-reproductor]').dataset.escena`);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 420, id: 1 }] });
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await dormir(250);
  const despues = await ev(`document.querySelector('[data-partido-reproductor]').dataset.escena`);
  check(antes === 'inicio' && despues === 'saque', `el tap pasa a la siguiente escena (${antes} → ${despues})`);
  // Unas cuantas escenas con taps
  const vistas = [despues];
  for (let k = 0; k < 8; k++) {
    await dormir(350);
    await clic('.slr-pt-temblor');
    await dormir(80);
    vistas.push(await ev(`document.querySelector('[data-partido-reproductor]').dataset.escena`));
  }
  check(new Set(vistas).size >= 3 && vistas.includes('control'), `con taps se recorren las escenas: ${vistas.join(' → ')}`);
  await clic('[data-velocidad]');
  check(await ev(`document.querySelector('[data-velocidad]').textContent`) === '×2', 'botón ×1 / ×2');
  // Saltar: directo al final con el resultado del partido
  await clic('[data-saltar]');
  check(await esperar(`document.querySelector('[data-partido-reproductor]')?.dataset.escena === 'final'`, 3000), '«Saltar» va directamente al final');
  await dormir(1200);
  await foto('real-2-final');
  const goles = await ev(`[...document.querySelectorAll('[data-goles]')].map(b => Number(b.textContent))`);
  const esperados = mio.local_id === U ? [mio.goles_local, mio.goles_visitante] : [mio.goles_visitante, mio.goles_local];
  check(JSON.stringify(goles) === JSON.stringify(esperados), `el marcador final es el del partido (${goles.join('-')}; guardado ${esperados.join('-')})`);
  const f = await fuera();
  check(typeof f === 'object' && !f.malos.length, 'el final cabe en la pantalla', JSON.stringify(f));
  check(await esperar(`!document.querySelector('[data-partido-reproductor]')`, 12000), 'al terminar se cierra');
  check(await ev(`!!document.querySelector('.slr-cronica')`), 'y queda la crónica como resumen');

  check(!errores.length, 'sin errores en la consola', errores.slice(0, 3).join(' | '));
} catch (e) {
  mal++;
  console.log(`\n  ✖ Error inesperado: ${e.stack ?? e.message}`);
} finally {
  ch?.kill();
  const b = await rpc('slr_borrar_liga', { token: t, liga_id: L });
  check(b.ok, 'liga de prueba borrada', b.mensaje);
  await rpc('slr_logout', { token: t });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas${mal ? ` · ${mal} FALLOS` : ''}`);
  process.exitCode = mal ? 1 : 0;
}
