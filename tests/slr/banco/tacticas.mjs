// Prueba en Chrome headless (móvil 390×844) del motor v2 en la interfaz:
// táctica, gestión, «Avanzado» (plan B y cambios programados), «Sugerir
// alineación», energía en las cartas (alineación, listas, plantilla y ficha),
// táctica favorita resaltada, sinergias, crónica (tácticas, cruce, descanso y
// energía gastada), ficha del rival con sus tácticas y la ayuda.
//   node tests/slr/banco/tacticas.mjs   (servidor local en :3000 y .env.local; SALIDA=carpeta guarda capturas)
// Crea una liga de prueba con Bot Uno y 3 bots, juega 3 jornadas y la borra al terminar.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, rpcOk, rpc, leer } from '../api-util.mjs';
import { sugerirAlineacion } from '../../../js/slr/energia.js';

const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };

// ── Liga de prueba: Bot Uno (presión, plan B, reservón) + 3 bots, 3 jornadas jugadas ──
const t = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: t, nombre: 'Prueba tácticas (banco)' });
const L = liga.id;
let ch = null;
try {
  const U = (await rpcOk('slr_unirse_liga', { token: t, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  for (let i = 0; i < 3; i++) await rpcOk('slr_admin_anadir_bot', { token: t, liga_id: L });
  await rpcOk('slr_iniciar_temporada', { token: t, liga_id: L });
  await rpcOk('slr_guardar_tacticas', { token: t, equipo_id: U, tacticas: { tactica: 'presion', plan_b: { condicion: 'empatando', tactica: 'posesion' }, gestion: 'reservon' } });
  for (let i = 0; i < 3; i++) {
    let r;
    do { r = await rpcOk('slr_admin_jugar_jornada', { token: t, liga_id: L }); if (r.estado === 'simulando') await dormir(1500); } while (r.estado === 'simulando');
  }
  // El partido de Bot Uno para la crónica: el último con cruce ganado por alguien (si lo hay)
  const mios = (await leer(`partidos?select=id,local_id,visitante_id,tacticas,jornadas(numero)&liga_id=eq.${L}&tipo=eq.liga&or=(local_id.eq.${U},visitante_id.eq.${U})&order=simulado_en.desc`)).datos;
  const elegido = mios.find(p => p.tacticas?.cruce?.[0]) ?? mios[0];
  const cartasU = (await leer(`cartas?select=id,energia,disenos_carta(ata,def,con,tactica_favorita,nombre)&equipo_id=eq.${U}`)).datos;

  // ── Navegador ──
  ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--remote-debugging-port=9361',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'tac-'))}`, '--headless=new', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const p = (await (await fetch('http://127.0.0.1:9361/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
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
  const esperar = async (expr, ms = 15000) => { for (let i = 0; i < ms / 200; i++) { if (await ev(expr)) return true; await dormir(200); } return false; };
  const ALTO = 844;
  // Captura; con alto, la pantalla se estira para que quepa el bloque entero
  const foto = async (n, sel, alto = null) => {
    if (!SALIDA) return;
    if (alto) { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: alto, deviceScaleFactor: 2, mobile: true }); await dormir(400); }
    if (sel) await ev(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'start' }); 0`);
    await dormir(700);
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SALIDA, `${n}.png`), Buffer.from(r.result.data, 'base64'));
    if (alto) { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: ALTO, deviceScaleFactor: 2, mobile: true }); await dormir(300); }
  };
  const clic = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const elegirOpcion = (sel, valor) => ev(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); if (!s) return false;
    s.value = ${JSON.stringify(valor)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const ultimaHoja = '[...document.querySelectorAll(".slr-hoja")].pop()';
  const cerrarHoja = async () => { await ev(`${ultimaHoja}?.querySelector('.slr-hoja__cerrar').click(); 0`); await dormir(450); };
  const seccion = async s => { await clic(`.slr-nav__item[data-seccion="${s}"]`); await dormir(900); };

  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: ALTO, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: 'http://localhost:3000/' });
  await dormir(1500);
  await ev(`localStorage.setItem('SESSION_PLAYER', 'Bot Uno'); localStorage.setItem('SESSION_CODE', ${JSON.stringify(env.SLR_BOT_UNO_CODIGO)});
    localStorage.setItem('RUSH_ACCESO', JSON.stringify({ jugador: 'Bot Uno', acceso: true })); 0`);
  await cdp('Page.navigate', { url: 'http://localhost:3000/#rush' });
  await ev('window.__paginaVieja = true; 0');
  await cdp('Page.reload', {});
  await esperar(`!window.__paginaVieja && !!document.getElementById('rushJugar')`, 30000);
  await clic('#rushJugar');
  await esperar(`!!document.querySelector('.slr-tactica')`, 15000);
  await dormir(800);

  console.log('\nPestaña Equipo: táctica y gestión');
  const est = await ev(`({ botones: document.querySelectorAll('.slr-tactica-btn').length,
    activa: document.querySelector('.slr-tactica-btn.activo')?.dataset.tactica,
    gestion: document.querySelector('[data-gestion].activo')?.dataset.gestion,
    avanzado: !!document.querySelector('[data-avanzado]') && !document.querySelector('[data-avanzado]').open,
    resumen: document.querySelector('[data-avanzado] summary small')?.textContent.trim() })`);
  check(est.botones === 3 && est.activa === 'presion' && est.gestion === 'reservon', `3 tácticas, la guardada activa (${est.activa}) y su gestión (${est.gestion})`);
  check(est.avanzado && /plan B/.test(est.resumen), `«Avanzado» plegado, con el resumen de lo que hay dentro («${est.resumen}»)`);
  const frase = await ev(`document.querySelector('.slr-tactica__frase')?.textContent.trim()`);
  check(/Robar arriba/.test(frase ?? ''), `en el móvil, la frase de la táctica elegida debajo de los botones: «${frase}»`);

  console.log('\nEnergía y táctica favorita en la alineación');
  const camp = await ev(`(() => { const hs = [...document.querySelectorAll('.slr-campo-juego .slr-hueco.lleno')];
    return { cartas: hs.length, barras: hs.filter(h => h.querySelector('.slr-carta__energia')).length,
      numeros: hs.filter(h => h.querySelector('.slr-hueco__energia')).length,
      encajan: hs.filter(h => h.querySelector('.slr-carta--encaja')).length,
      favsPresion: hs.filter(h => h.querySelector('.slr-carta__favorita')?.title.includes('Presión')).length }; })()`);
  check(camp.cartas === 7 && camp.barras === 7 && camp.numeros === 7, `las 7 cartas del campo llevan barra de energía y su número (${camp.barras}/${camp.numeros})`);
  check(camp.encajan === camp.favsPresion, `se resaltan las que tienen presión de favorita (${camp.encajan})`);
  const energias = cartasU.map(c => c.energia);
  check(energias.some(e => e < 100), `tras 3 jornadas hay cartas cansadas (${energias.sort((a, b) => a - b).join(', ')})`);

  console.log('\nCambiar táctica, gestión y «Avanzado»');
  await clic('[data-tactica="contraataque"]');
  await dormir(300);
  const tras = await ev(`({ activa: document.querySelector('.slr-tactica-btn.activo')?.dataset.tactica,
    sucio: !!document.querySelector('.slr-estado--sucio'),
    encajan: [...document.querySelectorAll('.slr-campo-juego .slr-hueco.lleno')].filter(h => h.querySelector('.slr-carta--encaja')).length,
    favs: [...document.querySelectorAll('.slr-campo-juego .slr-hueco.lleno')].filter(h => h.querySelector('.slr-carta__favorita')?.title.includes('Contraataque')).length })`);
  check(tras.activa === 'contraataque' && tras.sucio, 'al elegir contraataque: activa y «Cambios sin guardar»');
  check(tras.encajan === tras.favs, `el resaltado sigue a la táctica nueva (${tras.encajan} encajan)`);
  await clic('[data-gestion="a_tope"]');
  await dormir(200);
  await ev(`(() => { const d = document.querySelector('[data-avanzado]'); d.open = true; d.dispatchEvent(new Event('toggle')); return 0; })()`);
  await dormir(200);
  await elegirOpcion('[data-planb="condicion"]', 'perdiendo');
  await dormir(200);
  check(await ev(`document.querySelector('[data-avanzado]').open && !!document.querySelector('[data-planb="tactica"]')
    && ![...document.querySelector('[data-planb="tactica"]').options].some(o => o.value === 'contraataque')`),
    'plan B «si va perdiendo»: aparece la táctica (sin la inicial) y «Avanzado» sigue abierto al repintar');
  await clic('[data-anadir-cambio]');
  await dormir(200);
  await elegirOpcion('[data-cambio="0"] [data-c="condicion"]', 'energia_menor');
  await dormir(200);
  const cambio = await ev(`({ n: document.querySelectorAll('.slr-cambio').length, umbral: document.querySelector('[data-cambio="0"] [data-c="umbral"]')?.value,
    sale: document.querySelector('[data-cambio="0"] [data-c="sale"]').value, entra: document.querySelector('[data-cambio="0"] [data-c="entra"]').value,
    aviso: document.querySelector('.slr-gestion p').textContent })`);
  check(cambio.n === 1 && cambio.umbral === '50' && cambio.sale && cambio.entra, `cambio programado: sale un titular, entra un suplente, «si su energía baja de» ${cambio.umbral}`);
  check(/la gestión no se aplica/.test(cambio.aviso), 'con cambios programados, avisa de que la gestión no se aplica');
  await foto('1-equipo-tactica-avanzado', '.slr-tactica', 1500);

  await clic('[data-guardar]');
  await esperar(`!document.querySelector('.slr-estado--sucio')`, 10000);
  await dormir(500);
  const guardadas = await rpcOk('slr_mis_tacticas', { token: t, equipo_id: U });
  check(guardadas.tactica === 'contraataque' && guardadas.gestion === 'a_tope' && guardadas.plan_b?.condicion === 'perdiendo' &&
        guardadas.plan_b?.tactica && guardadas.cambios_avanzados.length === 1 && guardadas.cambios_avanzados[0].umbral === 50,
    `guardadas con la alineación: ${guardadas.tactica}, ${guardadas.gestion}, plan B ${guardadas.plan_b?.condicion} → ${guardadas.plan_b?.tactica}, 1 cambio`);
  const recarga = await ev(`({ activa: document.querySelector('.slr-tactica-btn.activo')?.dataset.tactica, cambios: document.querySelectorAll('.slr-cambio').length })`);
  check(recarga.activa === 'contraataque' && recarga.cambios === 1, 'tras guardar, la pantalla muestra lo guardado');

  console.log('\nSugerir alineación');
  await clic('[data-sugerir]');
  await dormir(400);
  const sugerida = await ev(`(() => { const id = (l, i) => document.querySelector('.slr-campo-juego .slr-hueco[data-l="' + l + '"][data-i="' + i + '"]')?.dataset.id ?? null;
    return { formacion: document.querySelector('[data-formacion].activo')?.dataset.formacion,
      ids: [id('por', 0), id('def', 0), id('def', 1), id('med', 0), id('med', 1), id('del', 0), id('del', 1)] }; })()`);
  const s = sugerirAlineacion(cartasU.map(c => ({ id: c.id, ATA: c.disenos_carta.ata, DEF: c.disenos_carta.def, CON: c.disenos_carta.con, energia: c.energia })));
  check(sugerida.formacion === '2-2-2' && JSON.stringify(sugerida.ids) === JSON.stringify([s.huecos.por, ...s.huecos.def, ...s.huecos.med, ...s.huecos.del]),
    'propone el 2-2-2 por stats y energía (el mismo que calcula el servidor para los bots)');
  check(await ev(`!!document.querySelector('.slr-estado--sucio')`), 'la sugerencia no se guarda sola: queda como «Cambios sin guardar»');
  await clic('[data-deshacer]');
  await dormir(300);

  console.log('\nEnergía en las listas, la plantilla y la ficha');
  await clic('.slr-campo-juego .slr-hueco[data-l="med"][data-i="0"]');
  await esperar(`!!document.querySelector('.slr-lista-cartas .slr-energia')`, 5000);
  const lista = await ev(`({ filas: document.querySelectorAll('.slr-lista-cartas li').length, energias: document.querySelectorAll('.slr-lista-cartas .slr-energia').length,
    avisos: [...document.querySelectorAll('.slr-lista-cartas .slr-energia em')].map(e => e.textContent), ficha: !!document.querySelector('.slr-ficha-hueco__energia') })`);
  check(lista.filas > 0 && lista.energias === lista.filas && lista.ficha, `al elegir carta: energía en las ${lista.filas} filas y en la ficha del hueco`);
  check(lista.avisos.every(a => /−\d+ %/.test(a)), `avisos claros: ${[...new Set(lista.avisos)].join(' · ') || '(todas en forma)'}`);
  await foto('3-lista-energia', `.slr-hoja .slr-ficha-hueco`);
  await cerrarHoja();
  await seccion('plantilla');
  const plant = await ev(`({ fichas: document.querySelectorAll('.slr-rejilla .slr-ficha').length, barras: document.querySelectorAll('.slr-rejilla .slr-carta__energia').length,
    numeros: document.querySelectorAll('.slr-rejilla .slr-ficha__energia b').length })`);
  check(plant.fichas > 0 && plant.barras === plant.fichas && plant.numeros === plant.fichas, `plantilla: barra y número de energía en las ${plant.fichas} cartas`);
  await clic('[data-orden="energia"]');
  await dormir(400);
  const orden = await ev(`[...document.querySelectorAll('.slr-rejilla .slr-ficha__energia b')].map(b => Number(b.textContent))`);
  check(orden.every((v, i) => !i || orden[i - 1] >= v), `ordenar por energía: ${orden.join(' ')}`);
  await clic('[data-orden="ovr"]');
  await dormir(300);
  await foto('2-plantilla-energia', '.slr-rejilla');
  await clic('.slr-rejilla .slr-ficha');
  await esperar(`!!document.querySelector('.slr-detalle__rasgos')`, 8000);
  const ficha = await ev(`document.querySelector('.slr-detalle__rasgos')?.textContent.replace(/\\s+/g, ' ').trim()`);
  check(/Energía/.test(ficha) && /Estamina/.test(ficha) && /Táctica favorita/.test(ficha), `ficha de la carta: ${ficha}`);
  await foto('4-ficha-carta', '.slr-detalle__rasgos');
  await cerrarHoja();

  console.log('\nCrónica');
  await seccion('liga');
  await clic('[data-vista="calendario"]');
  await dormir(600);
  check(await clic(`[data-partido="${elegido.id}"]`), `partido de Bot Uno (J${elegido.jornadas?.numero}) en el calendario`);
  await esperar(`!!document.querySelector('.slr-cronica__tacticas')`, 10000);
  await dormir(600);
  const cr = await ev(`({ cabeza: document.querySelector('.slr-cronica__tacticas')?.textContent.replace(/\\s+/g, ' ').trim(),
    descanso: document.querySelector('.slr-jugada--descanso')?.textContent.replace(/\\s+/g, ' ').trim(),
    cambios: document.querySelectorAll('.slr-jugada--descanso .slr-suceso--cambio').length,
    energia: document.querySelectorAll('.slr-cronica__energia li').length,
    aviso: document.querySelector('.slr-cronica .slr-banner--pausa')?.textContent })`);
  check(/Cruce/.test(cr.cabeza ?? ''), `arriba, tácticas y cruce: «${cr.cabeza}»`);
  check(!!cr.descanso && cr.cambios >= 2 && /reservón/.test(cr.descanso), `descanso con los cambios del reservón y su motivo (${cr.cambios}): «${cr.descanso?.slice(0, 160)}…»`);
  check(cr.energia >= 14, `energía gastada al final (${cr.energia} cartas)`);
  check(!cr.aviso, 'el partido se reproduce igual en el navegador');
  await foto('5-cronica-tacticas', '.slr-cronica');
  await foto('6-cronica-descanso', '.slr-jugada--descanso');
  await foto('7-cronica-energia', '.slr-cronica__energia');
  await cerrarHoja();

  console.log('\nFicha del rival');
  // Con 4 equipos, 3 jornadas son la temporada entera: se abre desde la clasificación
  await clic('[data-vista="clasificacion"]');
  await dormir(600);
  await ev(`[...document.querySelectorAll('[data-equipo]')].find(b => b.dataset.equipo !== ${JSON.stringify(U)})?.click(); 0`);
  await esperar(`!!document.querySelector('.slr-ficha-eq')`, 10000);
  await dormir(500);
  const rival = await ev(`({ n: document.querySelectorAll('.slr-ficha-eq__tactica').length, txt: document.querySelector('.slr-ficha-eq__tactica')?.textContent.replace(/\\s+/g, ' ').trim(),
    plantilla: document.querySelectorAll('.slr-ficha-eq .slr-carta__energia').length })`);
  check(rival.n >= 1, `tácticas de sus últimos partidos publicados (${rival.n}): «${rival.txt}»`);
  check(rival.plantilla > 0, 'su plantilla también enseña la energía');
  await foto('8-ficha-rival', '.slr-ficha-eq__tacticas');
  await cerrarHoja();

  console.log('\nAyuda');
  await seccion('equipo');
  await clic('[data-ayuda]');
  await esperar(`!!document.querySelector('.slr-ayuda')`, 5000);
  const ayuda = await ev(`document.querySelector('.slr-ayuda').textContent`);
  check(/Tácticas/.test(ayuda) && /Energía/.test(ayuda) && /Sinergias/.test(ayuda) && /Táctica favorita/.test(ayuda), '«¿Cómo funciona?»: tácticas, táctica favorita, energía y sinergias');
  await foto('9-ayuda', '.slr-ayuda', 1700);
  await cerrarHoja();

  console.log('\nPC');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await dormir(700);
  const pc = await ev(`(() => { const b = [...document.querySelectorAll('.slr-tactica-btn')].map(x => x.getBoundingClientRect());
    return { fila: b.every(r => Math.abs(r.top - b[0].top) < 2), frases: [...document.querySelectorAll('.slr-tactica-btn small')].filter(x => x.offsetParent).length }; })()`);
  check(pc.fila && pc.frases >= 6, `en PC, las 3 tácticas en fila con su frase y su cruce (${pc.frases} textos)`);
  await foto('10-equipo-pc', '.slr-tactica');

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
