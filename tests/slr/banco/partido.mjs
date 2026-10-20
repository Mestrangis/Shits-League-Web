// Prueba en Chrome headless de la reproducción de partidos (Android emulado a 360 y 412 px):
//  · Muestrario (Modo pruebas) a 360 y 412 px y en PC (1366×768): cada escena y cada
//    variante (a 412 px, también con el rival atacando hacia abajo) se reproduce y, en el
//    30, 60 y 95 %, nada importante se sale de la pantalla. Capturas de cada una. Los
//    textos duran al menos lo que manda la regla de lectura (ajustes.js). El césped cubre
//    siempre toda la pantalla y, en las escenas con barra, la animación va a la vez. CPU ×6: fluido.
//  · Tu partido sin ver: la clasificación no cuenta esa jornada, el calendario, la pestaña
//    Equipo y el aviso no enseñan el resultado. La primera vez se reproduce solo (desde el
//    aviso): tap, ×2, «Saltar» al final con el resultado; al terminar, la crónica, y ya
//    cuenta como visto (también tras recargar: otra vez, la crónica con «▶ Ver partido»).
//   node tests/slr/banco/partido.mjs   (servidor local en :3000 y .env.local; SALIDA=carpeta guarda capturas)
//   SOLO=gol,parada  limita el muestrario a esos tipos.
// Crea una liga de prueba con Bot Uno y 3 bots (1 jornada jugada) y la borra al terminar.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, rpcOk, rpc, leer } from '../api-util.mjs';
import { leer as tiempoLectura } from '../../../js/slr/partido/config.js';

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
    // Sin el temblor de la pantalla (mueve y gira unos px y grados: no es «salirse»)
    capa.querySelector('[data-temblor]').getAnimations().forEach(a => a.finish());
    const sel = '.slr-pt-carta:not(.slr-pt-vineta .slr-pt-carta), .slr-pt-rotulo b, .slr-pt-barra, .slr-pt-panel, .slr-pt-lesion, .slr-pt-vs, .slr-pt-poder, .slr-pt-marcador, .slr-pt-controles, .slr-pt-vineta';
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
  // Resultado de cada escena del muestrario según su variante (gana el que ataca o el que defiende)
  const RESULTADO = { gol: 'ataca', parada: 'defiende', pase: 'ataca', corte: 'defiende' };
  // Las que dependen del sentido: también con el rival atacando hacia abajo
  const CON_SENTIDO = new Set(['saque', 'control', 'ataque', 'pase', 'corte', 'chut', 'gol', 'parada']);
  const VINETA = new Set(['chut', 'gol', 'parada']);
  const PANTALLAS = [
    { nombre: '360 px', w: 360, movil: true }, { nombre: '412 px', w: 412, movil: true, dosSentidos: true },
    { nombre: 'PC', w: 1366, h: 768, movil: false },
  ];
  const pantalla = async pt => {
    if (pt.movil) return android(pt.w);
    ancho = pt.w;
    await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36' });
    await cdp('Emulation.setDeviceMetricsOverride', { width: pt.w, height: pt.h, deviceScaleFactor: 1, mobile: false });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
    await dormir(300);
  };
  const ajustar = (o) => ev(`(() => { const q = s => document.querySelector(s);
    q('[data-ataca]').value = ${JSON.stringify(o.ataca ?? 'A')}; q('[data-resultado]').value = ${JSON.stringify(o.res ?? 'ataca')};
    const p = q('[data-p]'); p.value = ${o.p ?? 50}; p.dispatchEvent(new Event('input'));
    q('[data-version]').value = ${JSON.stringify(o.version ?? 'completa')}; q('[data-poder]').value = ${JSON.stringify(o.poder ?? '')}; return 0; })()`);
  // Textos de la escena y cuánto llevan en pantalla: ninguno se va antes de leer(texto)
  const MIN_TEXTO = t => tiempoLectura(t);   // la regla de ajustes.js (lectura)

  for (const pt of PANTALLAS) {
    console.log(`\nMuestrario · ${pt.nombre}`);
    await pantalla(pt);
    await entrar();
    await clic('.slr-nav__item[data-seccion="perfil"]');
    await esperar(`!!document.querySelector('[data-pruebas="escenas-partido"]')`, 10000);
    await clic('[data-pruebas="escenas-partido"]');
    await esperar(`!!document.querySelector('[data-tipo]')`, 5000);
    const botones = await ev(`[...document.querySelectorAll('[data-tipo]')].map(b => [b.dataset.tipo, b.dataset.variante])`);
    if (!botones?.length) console.log(`  (sin muestrario: ${await ev(`location.hash + ' · ' + document.querySelectorAll('.slr-hoja').length + ' hojas · ' + (document.querySelector('[data-partido-reproductor]') ? 'reproductor abierto' : 'sin reproductor')`)})`);
    const vistas = new Set();
    const pasadas = [];
    for (const [tipo, variante] of botones) {
      if (SOLO && !SOLO.has(tipo)) continue;
      pasadas.push({ tipo, variante, ataca: 'A' });
      if (pt.dosSentidos && CON_SENTIDO.has(tipo)) pasadas.push({ tipo, variante, ataca: 'B' });
    }
    for (const { tipo, variante, ataca } of pasadas) {
      const res = RESULTADO[tipo] ?? (vistas.has(`${tipo}${ataca}`) ? 'defiende' : 'ataca');
      vistas.add(`${tipo}${ataca}`);
      await ajustar({ ataca, res, p: tipo === 'control' && res === 'defiende' ? 70 : 50 });
      await clic(`[data-tipo="${tipo}"][data-variante="${variante}"]`);
      const abierto = await esperar(`document.querySelector('[data-partido-reproductor]')?.dataset.escena === ${JSON.stringify(tipo)}`, 4000);
      const malos = [];
      const nombre = `${tipo}-${variante}${ataca === 'B' ? '-rival' : ''}`;
      // En el 30, el 60 y el 95 % de la escena: pausa, mira y sigue
      for (const [k, frac] of [[1, 0.3], [2, 0.6], [3, 0.95]]) {
        const llego = await esperar(`(() => { const r = document.querySelector('[data-partido-reproductor]')?.reproductor; const l = r?.linea;
          if (!l || l.t < l.dur * ${frac}) return false; r.pausar(); return true; })()`, 20000);
        if (!llego) { malos.push(`no llega al ${frac * 100} %`); break; }
        await dormir(60);
        const f = await fuera();
        if (typeof f === 'string') { malos.push(f); break; }
        if (f.sw > f.vw || f.cw !== f.vw) malos.push(`capa ${f.cw}/${f.vw}, scrollWidth ${f.sw}`);
        malos.push(...f.malos.map(x => `${frac * 100} %: ${x}`));
        const extra = await ev(`(() => {
          const capa = document.querySelector('[data-partido-reproductor]'), R = capa.getBoundingClientRect();
          const c = capa.querySelector('.slr-pt-cesped').getBoundingClientRect();
          const op = n => { let x = n, o = 1; while (x && x !== capa) { o *= Number(getComputedStyle(x).opacity); x = x.parentElement; } return o; };
          const barra = capa.querySelector('.slr-pt-barra');
          const piezas = [...capa.querySelectorAll('.slr-pt-pieza, .slr-pt-escudo, .slr-pt-balon, .slr-pt-vineta')].filter(n => op(n) > 0.5).length;
          return { cubre: c.top <= R.top + 1 && c.bottom >= R.bottom - 1 && c.left <= R.left + 1 && c.right >= R.right - 1,
            barra: barra ? op(barra) : null, piezas };
        })()`);
        if (!extra.cubre) malos.push(`${frac * 100} %: el césped no cubre toda la pantalla`);
        if (VINETA.has(tipo)) {
          const vi = await ev(`(() => {
            const capa = document.querySelector('[data-partido-reproductor]'), v = capa.querySelector('.slr-pt-vineta');
            if (!v) return { no: true };
            capa.querySelector('[data-temblor]').getAnimations().forEach(a => a.finish());
            const r = v.getBoundingClientRect(), vw = document.documentElement.clientWidth;
            const choca = [...capa.querySelectorAll('.slr-pt-rotulo b')].filter(b => Number(getComputedStyle(b.parentElement).opacity) > 0.3).some(b => {
              const q = b.getBoundingClientRect(); return q.bottom > r.top + 2 && q.top < r.bottom - 2 && q.right > r.left && q.left < r.right; });
            const cartas = [...v.querySelectorAll('.slr-carta')].map(c => Math.round(c.getBoundingClientRect().width));
            return { cuadrada: Math.abs(r.width - r.height) <= 2, centrada: Math.abs(r.left + r.width / 2 - vw / 2) <= 2, choca, cartas };
          })()`);
          if (vi.no) malos.push(`${frac * 100} %: sin viñeta`);
          else {
            if (!vi.cuadrada || !vi.centrada) malos.push(`${frac * 100} %: la viñeta no está cuadrada y centrada`);
            if (vi.choca) malos.push(`${frac * 100} %: un rótulo tapa la viñeta`);
            if (vi.cartas.some(w => w < 20)) malos.push(`${frac * 100} %: cartas de la viñeta sin tamaño (${vi.cartas})`);
          }
        }
        if ((tipo === 'control' || tipo === 'chut') && frac === 0.6 && !(extra.barra > 0.8 && extra.piezas > 0)) malos.push(`60 %: barra (${extra.barra}) y animación (${extra.piezas} piezas) no van a la vez`);
        await foto(`${nombre}-${k}`);
        if (k < 3) await ev(`document.querySelector('[data-partido-reproductor]')?.reproductor.reanudar(); 0`);   // la última se cierra en pausa
      }
      check(abierto && !malos.length, `${pt.nombre} · ${tipo}/${variante}${ataca === 'B' ? ' (ataca el rival)' : ''}: se reproduce y nada se sale`, malos.slice(0, 4).join(' | '));
      await cerrarReproductor();
    }
    if (!SOLO || SOLO.has('chut')) {
      // Tap / «Saltar» (terminar): la viñeta se queda en su último fotograma
      const ultimos = [];
      for (const [tipo, variante] of [['chut', 'disparo'], ['gol', 'red'], ['gol', 'chilena'], ['gol', 'ardiendo'], ['parada', 'punos'], ['parada', 'atrapada'], ['parada', 'estirada']]) {
        await ajustar({ res: RESULTADO[tipo] ?? 'ataca' });
        await clic(`[data-tipo="${tipo}"][data-variante="${variante}"]`);
        await esperar(`document.querySelector('[data-partido-reproductor]')?.dataset.escena === ${JSON.stringify(tipo)}`, 4000);
        await dormir(300);
        const v = (await ev(`(() => { const r = document.querySelector('[data-partido-reproductor]')?.reproductor; r?.linea.terminar(true);
          const c = document.querySelector('.slr-pt-vineta'); return { ms: Number(c?.dataset.ms), dur: Number(c?.dataset.dur) }; })()`)) ?? {};
        if (!(v.dur > 0 && v.ms === v.dur)) ultimos.push(`${tipo}/${variante}: ${v.ms}/${v.dur}`);
        await cerrarReproductor();
      }
      check(!ultimos.length, `${pt.nombre} · el tap y «Saltar» dejan cada viñeta en su último fotograma`, ultimos.join(' | '));
      // Una jugada entera: el chut empalma con el gol o la parada en la misma caja
      for (const res of ['ataca', 'defiende']) {
        await ajustar({ res, version: 'completa' });
        await clic('[data-jugada]');
        const sigue = res === 'ataca' ? 'gol' : 'parada';
        const hasta = async tipo => esperar(`document.querySelector('[data-partido-reproductor]')?.dataset.escena === ${JSON.stringify(tipo)}`, 60000);
        let ok = await hasta('chut');
        ok = ok && await esperar(`(() => { const r = document.querySelector('[data-partido-reproductor]')?.reproductor; const l = r?.linea;
          if (!l || l.t < l.dur - 120) return false; r.pausar(); return true; })()`, 15000);
        const caja = () => ev(`(() => { const r = document.querySelector('.slr-pt-vineta')?.getBoundingClientRect(); return r ? [r.left, r.top, r.width, r.height].map(Math.round) : null; })()`);
        const antes = await caja();
        await foto(`jugada-${sigue}-1-chut-final`);
        await ev(`document.querySelector('[data-partido-reproductor]').reproductor.reanudar(); 0`);
        ok = ok && await esperar(`(() => { const r = document.querySelector('[data-partido-reproductor]')?.reproductor;
          if (r?.escena?.tipo !== ${JSON.stringify(sigue)}) return false; r.pausar(); return true; })()`, 8000);
        await dormir(80);
        const despues = await caja();
        await foto(`jugada-${sigue}-2-inicio`);
        await ev(`document.querySelector('[data-partido-reproductor]').reproductor.reanudar(); 0`);
        await esperar(`(() => { const r = document.querySelector('[data-partido-reproductor]')?.reproductor; const l = r?.linea;
          if (r?.escena?.tipo !== ${JSON.stringify(sigue)} || !l || l.t < l.dur * 0.7) return false; r.pausar(); return true; })()`, 15000);
        await foto(`jugada-${sigue}-3-desenlace`);
        await cerrarReproductor();
        check(ok && antes && despues && antes.every((x, k) => Math.abs(x - despues[k]) <= 1),
          `${pt.nombre} · jugada entera: el chut empalma con ${sigue === 'gol' ? 'el gol' : 'la parada'} en la misma caja (${antes} → ${despues})`);
      }
    }
    // Lectura: los rótulos y franjas duran al menos lo que manda la regla (medido en sus animaciones)
    if (!SOLO && pt.w === 412) {
      const cortos = [];
      for (const [tipo, variante] of [['saque', 'franja'], ['robo', 'contraataque'], ['corte', 'entrada'], ['gol', 'red'], ['parada', 'punos'], ['poder', 'carta']]) {
        await ajustar({ res: RESULTADO[tipo] ?? 'ataca' });
        await clic(`[data-tipo="${tipo}"][data-variante="${variante}"]`);
        await esperar(`document.querySelector('[data-partido-reproductor]')?.dataset.escena === ${JSON.stringify(tipo)}`, 4000);
        const textos = await ev(`[...document.querySelectorAll('[data-partido-reproductor] .slr-pt-rotulo, [data-partido-reproductor] .slr-pt-franja')]
          .map(n => ({ t: n.textContent.replace(/\s+/g, ' ').trim(), dur: Math.max(0, ...n.getAnimations().map(a => a.effect.getTiming().duration)) }))`);
        for (const x of textos) if (x.dur < MIN_TEXTO(x.t)) cortos.push(`${tipo}: «${x.t}» ${Math.round(x.dur)} ms`);
        await ev(`document.querySelector('[data-partido-reproductor]')?.reproductor.pausar(); 0`);
        await cerrarReproductor();
      }
      check(!cortos.length, 'los textos se quedan al menos lo que dice ajustes.js (lectura)', cortos.join(' | '));
    }
    // Fluidez: una jugada entera con gol, con la CPU ×6 (un Android normal)
    if (!SOLO && pt.movil) {
      await ajustar({ poder: 'ataca', res: 'ataca' });
      await cdp('Emulation.setCPUThrottlingRate', { rate: 6 });
      await ev(`window.__frames = []; (function f(t) { window.__frames.push(t); if (window.__frames.length < 9000) requestAnimationFrame(f); })(performance.now()); 0`);
      await clic('[data-jugada]');
      await esperar(`!!document.querySelector('[data-partido-reproductor]')`, 4000);
      const t0 = Date.now();
      await esperar(`!document.querySelector('[data-partido-reproductor]')`, 120000);
      const segundos = (Date.now() - t0) / 1000;
      await cdp('Emulation.setCPUThrottlingRate', { rate: 1 });
      const m = await ev(`(() => { const f = window.__frames, d = f.slice(1).map((t, i) => t - f[i]).filter(x => x < 1000).sort((a, b) => a - b);
        const total = d.reduce((s, x) => s + x, 0); return { fps: Math.round(1000 * d.length / total), p95: Math.round(d[Math.floor(d.length * 0.95)]), max: Math.round(d.at(-1)), lentos: d.filter(x => x > 50).length, n: d.length }; })()`);
      check(m.fps >= 45, `${pt.nombre} · CPU ×6, jugada entera con poder y gol (${segundos.toFixed(0)} s): ${m.fps} fps, p95 ${m.p95} ms, ${m.lentos} frames > 50 ms (máx ${m.max} ms)`);
    }
    await ev(`history.back(); 0`);
    await dormir(500);
  }

  console.log('\nTu partido sin ver: nada destripa el resultado');
  await android(412);
  await entrar();
  const pjMio = async () => {
    await clic('.slr-nav__item[data-seccion="liga"]');
    await esperar(`!!document.querySelector('[data-vista="clasificacion"]')`, 10000);
    await clic('[data-vista="clasificacion"]');
    await esperar(`!!document.querySelector('.slr-tabla tr.es-mio')`, 10000);
    return ev(`({ pj: Number(document.querySelector('.slr-tabla tr.es-mio td:nth-child(3)')?.textContent), aviso: !!document.querySelector('.slr-sin-ver') })`);
  };
  const c0 = await pjMio();
  check(c0.pj === 0 && c0.aviso, `clasificación: la J1 aún no cuenta para ti (PJ ${c0.pj}) y avisa de que tu partido ya se ha jugado`);
  await foto('real-0-clasificacion');
  await clic('[data-vista="calendario"]');
  await esperar(`!!document.querySelector('.slr-cruce [data-partido="${mio.id}"]')`, 10000);
  const cal = await ev(`document.querySelector('.slr-cruce [data-partido="${mio.id}"]').textContent.trim()`);
  check(cal === '▶ Ver', `calendario: tu partido sin resultado («${cal}»)`);
  await foto('real-0-calendario');
  await clic('.slr-nav__item[data-seccion="equipo"]');
  await esperar(`!!document.querySelector('.slr-franja__ultimo')`, 10000);
  const franja = await ev(`document.querySelector('.slr-franja__ultimo').textContent.replace(/\\s+/g, ' ').trim()`);
  check(/ya se ha jugado/.test(franja) && !/\d+-\d+/.test(franja), `pestaña Equipo: «${franja}»`);
  await clic('.slr-barra__avisos');
  await esperar(`!!document.querySelector('.slr-avisos')`, 5000);
  const aviso = await ev(`[...document.querySelectorAll('.slr-aviso__texto')].map(x => x.textContent).find(x => /Jornada 1/.test(x)) ?? ''`);
  check(/ya se ha jugado/.test(aviso) && !/cobrado/.test(aviso), `aviso de la jornada sin resultado ni cobros: «${aviso.replace(/\\s+/g, ' ').trim().slice(0, 70)}»`);
  // Screen Wake Lock falso (en headless no hay): cuenta lo que se pide y lo que se suelta
  const wakeLockFalso = (rechaza = false) => ev(`(() => { window.__wl = { pedidos: 0, soltados: 0, bloqueos: [] };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async tipo => {
      window.__wl.pedidos++;
      if (${rechaza}) throw new DOMException('No', 'NotAllowedError');
      const b = new EventTarget(); b.type = tipo; b.released = false;
      b.release = async () => { if (b.released) return; b.released = true; window.__wl.soltados++; b.dispatchEvent(new Event('release')); };
      window.__wl.bloqueos.push(b); return b; } } });
    return 0; })()`);
  await wakeLockFalso();
  // Desde el aviso: se reproduce solo
  await ev(`[...document.querySelectorAll('[data-aviso]')].find(b => /ya se ha jugado/.test(b.textContent))?.click(); 0`);
  check(await esperar(`document.querySelector('[data-partido-reproductor]')?.dataset.escena === 'inicio'`, 10000), 'la primera vez, el partido se reproduce solo (desde el aviso)');
  check(!(await ev(`!!document.querySelector('.slr-cronica')`)), 'sin la crónica debajo (no se ve el resultado)');
  await dormir(200);
  const wl1 = await ev(`({ ...window.__wl, tipo: window.__wl.bloqueos[0]?.type, on: document.querySelector('[data-partido-reproductor]').reproductor.pantallaEncendida })`);
  check(wl1.pedidos === 1 && wl1.tipo === 'screen' && wl1.on, `pantalla encendida: se pide al empezar (${wl1.pedidos} petición, «${wl1.tipo}»)`);
  // Cambiar de app y volver: el navegador lo suelta solo y se vuelve a pedir
  await ev(`window.__wl.bloqueos[0].release(); document.dispatchEvent(new Event('visibilitychange')); 0`);
  await dormir(200);
  const wl2 = await ev(`({ ...window.__wl, on: document.querySelector('[data-partido-reproductor]').reproductor.pantallaEncendida })`);
  check(wl2.pedidos === 2 && wl2.on, `pantalla encendida: al volver a la app se pide otra vez (${wl2.pedidos} peticiones)`);
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
  const wl3 = await ev(`({ pedidos: window.__wl.pedidos, sueltos: window.__wl.bloqueos.every(b => b.released) })`);
  check(wl3.sueltos && wl3.pedidos === 2, 'pantalla encendida: al cerrar se suelta (y no se vuelve a pedir)');
  check(await esperar(`!!document.querySelector('.slr-cronica [data-ver-partido]')`, 8000), 'y queda la pantalla del partido, con «▶ Ver partido»');
  // La pantalla del partido, de arriba abajo
  await esperar(`!!document.querySelector('.slr-pp__lista li')`, 5000);
  const leerPP = () => ev(`(() => { const r = document.querySelector('.slr-pp'); if (!r) return null; const q = s => r.querySelector(s);
    const ancho = document.documentElement.clientWidth;
    return { goles: q('.slr-pp__resultado b').textContent.replace(/\\s/g, ''), goleadores: r.querySelectorAll('.slr-pp__goleadores li').length,
      izq: q('.slr-pp__eq--izq b').textContent, fotos: r.querySelectorAll('.slr-pp__foto').length,
      filas: [...r.querySelectorAll('.slr-pp__fila > span:not(.slr-pp__barra)')].map(x => x.textContent), previa: !!q('.slr-pp__previa'),
      cartas: [...r.querySelectorAll('.slr-pp__alineaciones .slr-carta')].map(c => Math.round(c.getBoundingClientRect().width)),
      lineas: r.querySelectorAll('.slr-pp__alineacion').length,
      notas: r.querySelectorAll('.slr-pp__lista li').length, mejor: r.querySelectorAll('.slr-pp__lista li.es-mejor').length,
      ordenNotas: [...r.querySelectorAll('.slr-pp__nota')].map(b => Number(b.textContent.replace(',', '.'))),
      jugadas: r.querySelectorAll('.slr-pp__cronica .slr-jugada').length,
      orden: [...r.querySelectorAll('.slr-pp__cabeza, .slr-pp__estadisticas, .slr-pp__alineaciones, .slr-pp__notas, .slr-pp__cronica')].map(x => x.className.match(/slr-pp__(cabeza|estadisticas|alineaciones|notas|cronica)/)[1]),
      fuera: [...r.querySelectorAll('.slr-pp__cabeza, .slr-pp__fila, .slr-pp__carta, .slr-pp__jugador, .slr-jugada')].filter(x => { const b = x.getBoundingClientRect(); return b.width && (b.left < -1 || b.right > ancho + 1); }).length,
      scroll: document.documentElement.scrollWidth <= ancho };
  })()`);
  const pp = await leerPP();
  const golesTxt = `${esperados[0]}–${esperados[1]}`;
  check(pp && pp.goles === golesTxt && pp.goleadores === esperados[0] + esperados[1] && pp.izq === 'Bot Uno FC' && pp.fotos === 2,
    `cabecera: tu equipo a la izquierda, ${pp?.goles} y ${pp?.goleadores} goleadores`, JSON.stringify(pp && { goles: pp.goles, goleadores: pp.goleadores, izq: pp.izq, fotos: pp.fotos }));
  const FILAS = ['Posesión', 'Robos', 'Ataques que superan la defensa', 'Cortes', 'Tiros a puerta', 'Goles esperados', 'Paradas', 'Poderes activados'];
  check(JSON.stringify(pp?.filas) === JSON.stringify(FILAS) && pp.previa, 'estadísticas: las 8 filas comparadas y la probabilidad de antes del partido', JSON.stringify(pp?.filas));
  check(pp?.lineas === 2 && pp.cartas.length >= 14 && pp.cartas.every(w => w >= 40), `alineaciones: las dos, con ${pp?.cartas.length} cartas de verdad`, JSON.stringify(pp?.cartas));
  check(pp?.notas === pp?.cartas.length && pp.mejor === 1
    && pp.ordenNotas.every((n, k) => k === 0 || pp.ordenNotas[k - 1] >= n), `notas: ${pp?.notas}, ordenadas y con la mejor marcada`);
  check(pp?.jugadas >= 10 && JSON.stringify(pp.orden) === JSON.stringify(['cabeza', 'estadisticas', 'alineaciones', 'notas', 'cronica']),
    `y la crónica al final (${pp?.jugadas} jugadas; orden ${pp?.orden.join(' → ')})`);
  check(pp?.scroll && !pp.fuera, '412 px: nada se sale de la pantalla', JSON.stringify({ fuera: pp?.fuera }));
  // Capturas por secciones a 360, 412 y en PC (y nada se sale)
  const fotosPP = async nombre => {
    for (const s of ['cabeza', 'estadisticas', 'alineaciones', 'notas', 'cronica']) {
      // La cabecera, desde arriba del todo (con scrollIntoView quedaría bajo la cabecera fija de la hoja)
      await ev(s === 'cabeza'
        ? `(() => { const h = document.querySelector('.slr-pp').closest('.slr-hoja'); h.scrollTop = 0; h.querySelector('.slr-hoja__cuerpo').scrollTop = 0; return 0; })()`
        : `document.querySelector('.slr-pp__${s}')?.scrollIntoView({ block: 'start' }); 0`);
      await dormir(450);
      await foto(`pp-${nombre}-${s}`);
    }
    await ev(`document.querySelector('.slr-pp__cabeza')?.scrollIntoView({ block: 'start' }); 0`);
  };
  await fotosPP('real');
  for (const pt of [PANTALLAS[0], PANTALLAS[2]]) {
    await pantalla(pt);
    await dormir(500);
    const x = await leerPP();
    check(x?.scroll && !x.fuera && x.cartas.every(w => w >= 40), `${pt.nombre}: la pantalla del partido cabe (cartas de ${Math.min(...(x?.cartas ?? [0]))}–${Math.max(...(x?.cartas ?? [0]))} px)`, JSON.stringify({ fuera: x?.fuera, scroll: x?.scroll }));
    await fotosPP('real');
  }
  await android(412);
  // Tocar una carta: su detalle en grande
  await clic('.slr-pp__carta[data-carta-id]');
  check(await esperar(`!!document.querySelector('.slr-detalle .slr-carta--l')`, 8000), 'tocar una carta abre su detalle en grande');
  await ev(`history.back(); 0`); await dormir(400);
  await ev(`history.back(); 0`); await dormir(400);
  await ev(`history.back(); 0`); await dormir(400);
  const visto = (await leer(`partidos?select=id&id=eq.${mio.id}`)).datos.length === 1;
  const c1 = await pjMio();
  check(visto && c1.pj === 1 && !c1.aviso, `visto: la clasificación ya cuenta la J1 (PJ ${c1.pj})`);

  console.log('\nEn otro dispositivo (recarga): ya visto');
  await entrar();
  await clic('.slr-nav__item[data-seccion="liga"]');
  await esperar(`!!document.querySelector('[data-vista="calendario"]')`, 10000);
  await clic('[data-vista="calendario"]');
  await esperar(`!!document.querySelector('.slr-cruce [data-partido="${mio.id}"]')`, 10000);
  const cal2 = await ev(`document.querySelector('.slr-cruce [data-partido="${mio.id}"]').textContent.replace(/\\s+/g, '')`);
  check(/^\d+–\d+$/.test(cal2), `el calendario ya enseña el resultado (${cal2})`);
  await clic(`.slr-cruce [data-partido="${mio.id}"]`);
  check(await esperar(`!!document.querySelector('.slr-cronica [data-ver-partido]')`, 10000), 'abrirlo otra vez: la crónica con «▶ Ver partido» (no se reproduce solo)');
  check(!(await ev(`!!document.querySelector('[data-partido-reproductor]')`)), 'sin reproducción automática');
  check(await ev(`!!document.querySelector('.slr-pp__estadisticas') && !!document.querySelector('.slr-pp__notas')`), 'es la pantalla del partido (estadísticas y notas)');
  await wakeLockFalso(true);
  await clic('.slr-cronica [data-ver-partido]');
  check(await esperar(`!!document.querySelector('[data-partido-reproductor]')?.dataset.escena`, 10000), '«▶ Ver partido» se reproduce aunque el navegador rechace la pantalla encendida');
  await ev(`history.back(); 0`); await dormir(500);
  await ev(`history.back(); 0`); await dormir(400);
  // El partido de otro: con su resultado directamente
  const ajeno = await ev(`[...document.querySelectorAll('.slr-cruce.es-ajeno [data-partido][data-jugado]')].map(b => b.textContent.replace(/\\s+/g, ''))[0] ?? ''`);
  check(/^\d+–\d+$/.test(ajeno), `el partido de otros, con su resultado (${ajeno})`);
  await ev(`document.querySelector('.slr-cruce.es-ajeno [data-partido][data-jugado]')?.click(); 0`);
  check(await esperar(`!!document.querySelector('.slr-pp__estadisticas')`, 10000) && !(await ev(`!!document.querySelector('[data-partido-reproductor]')`)),
    'el partido de otros: su pantalla del partido, sin animación');
  await foto('pp-ajeno');
  await ev(`history.back(); 0`); await dormir(400);

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
