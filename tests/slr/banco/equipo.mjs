// Prueba en Chrome headless (móvil 390×844) de la
// pestaña Equipo, avisos, fichas, pronóstico, crónica, álbum, plantillas,
// catálogo del admin, muestrario, el botón «Borrar cartas beta» y la rueda del pull-to-refresh de Shits League.
//   node tests/slr/banco/equipo.mjs   (servidor local en :3000 y .env.local; SALIDA=carpeta guarda capturas)
// Crea una liga de prueba con Bot Uno y 3 bots y la borra al terminar.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, rpcOk, rpc, leer } from '../api-util.mjs';

const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };

// ── Liga de prueba: Bot Uno + 3 bots, temporada iniciada y una jornada jugada ──
const t = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: t, nombre: 'Prueba equipo (banco)' });
const L = liga.id;
try {
  await rpcOk('slr_unirse_liga', { token: t, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' });
  for (let i = 0; i < 3; i++) await rpcOk('slr_admin_anadir_bot', { token: t, liga_id: L });
  await rpcOk('slr_iniciar_temporada', { token: t, liga_id: L });
  for (let i = 0; i < 2; i++) {        // dos jornadas jugadas (Bot Uno juega al menos una)
    let r;
    do { r = await rpcOk('slr_admin_jugar_jornada', { token: t, liga_id: L }); if (r.estado === 'simulando') await dormir(1500); } while (r.estado === 'simulando');
  }
  // Los partidos de Bot Uno, ya vistos: así el aviso abre la crónica (la primera vez se
  // reproduciría solo; eso se prueba en banco/partido.mjs)
  for (const p of (await leer(`partidos?select=id&liga_id=eq.${L}&tipo=eq.liga`)).datos) await rpc('slr_marcar_visto', { token: t, partido_id: p.id });

  // ── Navegador ──
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--remote-debugging-port=9360',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'eq-'))}`, '--headless=new', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const p = (await (await fetch('http://127.0.0.1:9360/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
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
  const foto = async (n, sel) => {
    if (!SALIDA) return;
    if (sel) await ev(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'start' }); 0`);
    await dormir(700);
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SALIDA, `${n}.png`), Buffer.from(r.result.data, 'base64'));
  };
  const clic = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const atras = async () => { await ev('history.back(); 0'); await dormir(500); };

  await cdp('Runtime.enable');
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
  await esperar(`!window.__paginaVieja && (document.getElementById('rushJugar')?.disabled === false)`, 30000);
  await clic('#rushJugar');
  await esperar(`!!document.querySelector('.slr-franja')`, 10000);
  await dormir(800);

  console.log('\nPestaña Equipo');
  const nav = await ev(`[...document.querySelectorAll('.slr-nav__item')].map(b => b.textContent.trim())`);
  check(nav[0] === 'Equipo' && !nav.includes('Inicio'), `barra inferior: ${nav.join(' · ')}`);
  const franja = await ev(`({ rival: document.querySelector('.slr-franja__rival')?.textContent.replace(/\\s+/g, ' ').trim(),
    cuenta: document.querySelector('[data-cuenta]')?.textContent, ultimo: document.querySelector('.slr-franja__ultimo')?.textContent.replace(/\\s+/g, ' ').trim(),
    estado: document.querySelector('.slr-franja .slr-estado')?.textContent, campo: !!document.querySelector('.slr-campo-juego'),
    banner: document.querySelector('.slr-banner b')?.textContent ?? null })`);
  check(franja.campo && franja.rival && franja.estado, `franja: «${franja.rival}» · cierre en ${franja.cuenta} · último ${franja.ultimo ?? '—'} · ${franja.estado}`);
  await esperar(`Number(document.querySelector('.slr-barra__avisos b')?.textContent) > 0`, 10000);
  const campana = await ev(`document.querySelector('.slr-barra__avisos b')?.textContent`);
  check(Number(campana) > 0, `campana con ${campana} avisos sin leer`);
  await foto('equipo');

  await clic('.slr-barra__avisos');
  await esperar(`!!document.querySelector('.slr-hoja .slr-avisos')`);
  const nAvisos = await ev(`document.querySelectorAll('.slr-hoja .slr-avisos li').length`);
  check(nAvisos > 0 && await ev(`document.querySelector('.slr-barra__avisos b').textContent === ''`), `al abrir la campana: ${nAvisos} avisos y el contador a cero`);
  const tarjetas = await ev(`({ conDestino: document.querySelectorAll('.slr-hoja button.slr-aviso[data-aviso] .slr-aviso__flecha').length,
    iconos: document.querySelectorAll('.slr-hoja .slr-aviso__icono').length,
    jornada: !![...document.querySelectorAll('.slr-hoja button.slr-aviso')].find(b => /Jornada \\d+:/.test(b.textContent)) })`);
  check(tarjetas.iconos === nAvisos && tarjetas.conDestino > 0 && tarjetas.jornada, `avisos en tarjetas con icono; ${tarjetas.conDestino} con flecha (destino)`);
  await ev(`[...document.querySelectorAll('.slr-hoja button.slr-aviso')].find(b => /Jornada \\d+:/.test(b.textContent)).click(); 0`);
  await esperar(`!!document.querySelector('.slr-cronica')`, 10000);
  check(await ev(`document.querySelectorAll('.slr-hoja').length === 2 && !document.querySelector('.slr-cronica .slr-banner--pausa')`),
    'tocar el aviso de la jornada abre su crónica encima de los avisos (y se reproduce sin avisos de versión)');
  await atras();
  await atras();

  console.log('\nFicha de una carta sin colocar');
  await clic('.slr-libre');
  await esperar(`!!document.querySelector('.slr-ficha-hueco__puestos')`);
  const puestos = await ev(`[...document.querySelectorAll('.slr-ficha-hueco__puestos li')].map(l => l.textContent.replace(/\\s+/g, ' ').trim())`);
  check(puestos.length === 4 && /^POR Paradas/.test(puestos[0]) && /^MED Posesión/.test(puestos[2]) && /^DEL Ataque: ATA \d+ · Tirador/.test(puestos[3]),
    `aporte en cada puesto: ${puestos.map(p => p.split(':')[0]).join(', ')}`);
  await foto('ficha-sin-colocar');
  const libreId = await ev(`document.querySelector('.slr-libre')?.dataset.id ?? null`);
  await clic('[data-colocar]');
  await dormir(300);
  await clic('[data-huecos] [data-l="banco"][data-i="0"]');
  await dormir(700);
  check(await ev(`document.querySelector('.slr-hueco[data-l="banco"][data-i="0"]')?.dataset.id`) === libreId, '«Colocar en…» → Banquillo 1: la carta pasa al banquillo');
  check(await ev(`!!document.querySelector('.slr-estado--sucio')`), 'y la alineación queda con cambios sin guardar');

  console.log('\nPronóstico');
  await clic('[data-calcular]');
  await esperar(`!!document.querySelector('[data-rival]')`);
  const pron = await ev(`({ texto: document.querySelector('.slr-hoja .slr-confirmar__texto').textContent, aviso: !!document.querySelector('.slr-hoja .slr-banner'),
    seleccionado: document.querySelector('[data-rival]').selectedOptions[0].textContent, opciones: document.querySelectorAll('[data-rival] option').length })`);
  check(/Probabilidad de ganar, empatar y perder/.test(pron.texto) && pron.aviso, 'explica qué es y avisa de los cambios sin guardar');
  check(pron.opciones === 3, `lista de rivales (${pron.opciones}); seleccionado: ${pron.seleccionado}`);
  await clic('[data-calcular-ya]');
  await esperar(`!!document.querySelector('[data-resultado] .slr-pronostico__cifras')`, 20000);
  const cifras = await ev(`document.querySelector('[data-resultado] .slr-pronostico__cifras').textContent.replace(/\\s+/g, ' ')`);
  check(/Ganar \d+ %/.test(cifras), `resultado: ${cifras}`);
  await foto('pronostico');
  await atras();
  await clic('[data-deshacer]'); await dormir(400);

  console.log('\nFicha del próximo rival');
  const rivalId = await ev(`document.querySelector('.slr-franja__rival[data-equipo]')?.dataset.equipo`);
  if (await clic('.slr-franja__rival[data-equipo]')) {
    // Con el catálogo corto el rival puede tener menos de 11: se compara con su plantilla real
    const nRival = (await leer(`cartas?select=id&equipo_id=eq.${rivalId}`)).datos.length;
    await esperar(`!!document.querySelector('.slr-ficha-eq')`);
    await dormir(800);
    const ficha = await ev(`({ nombre: document.querySelector('.slr-ficha-eq h2').textContent, cartas: document.querySelectorAll('.slr-ficha-eq .slr-carta').length,
      campo: !!document.querySelector('.slr-ficha-eq .slr-campito'), resultados: document.querySelectorAll('.slr-ficha-eq__resultado').length })`);
    check(nRival > 0 && ficha.cartas >= nRival && ficha.campo && ficha.resultados >= 1, `${ficha.nombre}: plantilla de ${ficha.cartas}, ${ficha.resultados} resultados y la alineación de su último partido`);
    await foto('ficha-rival');
    await foto('ficha-rival-campo', '.slr-ficha-eq .slr-campito');
    await atras();
  } else check(false, 'no hay próximo rival en la franja');

  console.log('\nCrónica');
  await clic('[data-seccion=liga]');
  await esperar(`!!document.querySelector('[data-vista=calendario]')`);
  await clic('[data-vista=calendario]');
  await esperar(`!!document.querySelector('[data-jugado]')`);
  await clic('.slr-cruce__marcador[data-jugado]');
  await esperar(`!!document.querySelector('.slr-cronica .slr-jugada')`, 20000);
  await dormir(600);
  // La pantalla del partido (antes, la crónica): alineaciones, jugadas, notas y estadísticas
  const cr = await ev(`({ campos: document.querySelectorAll('.slr-pp__alineacion').length,
    jugadas: document.querySelectorAll('.slr-jugada:not(.slr-jugada--descanso)').length, aviso: document.querySelector('.slr-cronica .slr-banner')?.textContent ?? null,
    lineas: [...document.querySelectorAll('.slr-jugada')].slice(0, 3).map(j => [...j.querySelectorAll('.slr-suceso')].map(s => s.textContent.replace(/\\s+/g, ' ').trim())),
    nota: document.querySelector('.slr-cronica__nota')?.textContent, filas: [...document.querySelectorAll('.slr-pp__fila > span:not(.slr-pp__barra)')].map(t => t.textContent),
    notas: document.querySelectorAll('.slr-pp__lista li').length })`);
  check(cr.campos === 2 && cr.jugadas === 10 && !cr.aviso, `las dos alineaciones, 10 jugadas y sin avisos`);
  check(cr.lineas.flat().every(l => !/\(\d+ %\)/.test(l) || /mantiene|roba|llega|corta|Dispara|GOOOL|Para /.test(l)), `jugada 1: ${cr.lineas[0].join(' / ')}`);
  check(/probabilidad que tenía lo que ocurrió/.test(cr.nota ?? '') && cr.filas.includes('Posesión') && cr.filas.includes('Poderes activados') && cr.notas > 0,
    'nota de los porcentajes, estadísticas (posesión, …, poderes) y notas de los jugadores');
  await foto('cronica');
  await foto('cronica-jugadas', '.slr-jugadas');
  if (cr.poderes) {
    await clic('.slr-suceso__poder');
    check(await esperar(`[...document.querySelectorAll('.slr-hoja__titulo')].some(t => t.textContent === 'Poder')`, 5000), 'tocar un poder muestra su descripción');
    await atras();
  }
  await clic('.slr-cronica .slr-pp__carta[data-carta-id]');
  check(await esperar(`!!document.querySelector('.slr-detalle')`, 10000), 'tocar una carta de la alineación abre su ficha');
  await atras(); await atras();

  console.log('\nÁlbum');
  await clic('[data-seccion=perfil]');
  await esperar(`!!document.querySelector('[data-album]')`);
  await clic('[data-album]');
  await esperar(`!!document.querySelector('.slr-album__contador')`);
  await dormir(800);
  const alb = await ev(`({ cont: document.querySelector('.slr-album__contador').textContent.replace(/\\s+/g, ' ').trim(), cartas: document.querySelectorAll('.slr-album .slr-carta').length,
    pie: document.querySelector('.slr-ficha__album')?.textContent.replace(/\\s+/g, ' ').trim() })`);
  check(/^\d+ de \d+ desbloqueadas/.test(alb.cont) && alb.cartas > 0, `${alb.cont} · ${alb.pie}`);
  await foto('album');
  await clic('[data-orden] [data-v="valor"]'); await dormir(300);
  check(await ev(`document.querySelector('[data-orden] .activo').dataset.v === 'valor'`), 'ordenar por valor');
  await atras();

  console.log('\nCatálogo de cartas (admin)');
  await clic('[data-catalogo]');
  await esperar(`document.querySelectorAll('.slr-catalogo .slr-carta').length > 0`, 15000);
  await dormir(800);
  const activos = (await leer(`disenos_carta?select=id,tipo,tier&activo=eq.true&or=(liga_prueba_id.is.null,liga_prueba_id.eq.${L})&limit=5000`)).datos;
  const inactivos = (await leer(`disenos_carta?select=id&activo=eq.false&or=(liga_prueba_id.is.null,liga_prueba_id.eq.${L})&limit=5000`)).datos.length;
  const cat = await ev(`({ total: document.querySelector('.slr-catalogo__total b').textContent, cuentas: [...document.querySelectorAll('.slr-catalogo__cuentas')].map(x => x.innerText.replace(/\\s+/g, ' ')),
    pintadas: document.querySelectorAll('.slr-catalogo .slr-ficha').length, filtros: document.querySelectorAll('.slr-filtros--catalogo select').length,
    columnas: getComputedStyle(document.querySelector('.slr-rejilla--catalogo')).gridTemplateColumns.split(' ').length })`);
  check(Number(cat.total.replace(/\./g, '')) === activos.length && cat.cuentas.length === 3 && cat.filtros === 9,
    `catálogo: ${cat.total} activas · ${cat.cuentas.join(' · ')} · ${cat.filtros} filtros, ${cat.columnas} columnas en móvil`);
  check(cat.pintadas === Math.min(activos.length, activos.length <= 60 ? activos.length : 30), `pinta ${cat.pintadas} (como el álbum: todas hasta 60, luego por bloques)`);
  await foto('catalogo');
  // Filtros, buscador y orden
  await ev(`(() => { const e = document.querySelector('.slr-catalogo [data-f="tier"]'); e.value = 'D'; e.dispatchEvent(new Event('change')); return 0; })()`);
  await dormir(200);
  const nD = activos.filter(d => d.tier === 'D').length;
  check(await ev(`document.querySelectorAll('.slr-catalogo .slr-ficha').length`) === Math.min(nD, nD <= 60 ? nD : 30) &&
        await ev(`[...document.querySelectorAll('.slr-catalogo .slr-ficha__album')].every(x => /Tier D/.test(x.textContent))`), `filtro tier D: ${nD} cartas`);
  await ev(`(() => { const e = document.querySelector('.slr-catalogo [data-f="tier"]'); e.value = ''; e.dispatchEvent(new Event('change'));
    const o = document.querySelector('.slr-catalogo [data-f="orden"]'); o.value = 'nombre'; o.dispatchEvent(new Event('change')); return 0; })()`);
  await dormir(200);
  const nombres = await ev(`[...document.querySelectorAll('.slr-catalogo .slr-carta__nombre')].slice(0, 8).map(n => n.textContent)`);
  check(nombres.every((n, i) => !i || nombres[i - 1].localeCompare(n, 'es') <= 0), `orden por nombre: ${nombres.slice(0, 3).join(', ')}…`);
  const buscar = nombres[2];
  await ev(`(() => { const e = document.querySelector('.slr-catalogo [data-f="texto"]'); e.value = ${JSON.stringify('')} + ${JSON.stringify(buscar)}.slice(0, 5); e.dispatchEvent(new Event('input')); return 0; })()`);
  await dormir(400);
  check(await ev(`[...document.querySelectorAll('.slr-catalogo .slr-carta__nombre')].some(n => n.textContent === ${JSON.stringify(buscar)})`), `buscador: «${buscar.slice(0, 5)}» encuentra «${buscar}»`);
  await ev(`(() => { const e = document.querySelector('.slr-catalogo [data-f="texto"]'); e.value = ''; e.dispatchEvent(new Event('input')); return 0; })()`);
  await dormir(300);
  await clic('.slr-catalogo [data-inactivas]');
  await dormir(300);
  const conInact = await ev(`Number(document.querySelector('.slr-catalogo__total b').textContent.replace(/\\./g, ''))`);
  check(conInact === activos.length + inactivos, `interruptor «Incluir las inactivas»: ${conInact} (${inactivos} inactivas)`);
  await clic('.slr-catalogo [data-inactivas]');
  await dormir(300);
  await clic('.slr-catalogo .slr-ficha');
  check(await esperar(`!!document.querySelector('.slr-detalle')`, 10000) && await ev(`!!document.querySelector('[data-editar-carta]')`),
    'tocar una carta abre su detalle con «Editar carta»');
  await atras(); await atras();

  console.log('\nHerramienta de plantillas');
  await clic('[data-pruebas=plantillas]');
  await esperar(`document.querySelectorAll('.slr-plantillas__fila').length > 0`);
  await dormir(600);
  const total = await ev(`document.querySelector('[data-total]').textContent`);
  const nCartas = (await leer(`cartas?select=id&liga_id=eq.${L}`)).datos.length;
  check(new RegExp(`de ${nCartas}\\b`).test(total) && await ev(`document.querySelectorAll('.slr-plantillas__fila').length === Math.min(24, ${nCartas})`),
    `herramienta con todas las cartas (${total}), 24 por página`);
  await ev(`(() => { const e = document.querySelector('[data-f="tipo"]'); e.value = 'duo'; e.dispatchEvent(new Event('change')); return 0; })()`);
  await dormir(200);
  check(await ev(`[...document.querySelectorAll('.slr-plantillas__fila')].every(f => /Dúo/.test(f.textContent))`), 'filtro por tipo: solo dúos');
  await ev(`(() => { const e = document.querySelector('[data-f="tipo"]'); e.value = ''; e.dispatchEvent(new Event('change')); return 0; })()`);
  await dormir(200);
  await foto('plantillas');
  const libre = await ev(`(() => { const f = [...document.querySelectorAll('.slr-plantillas__fila')].find(x => /Libre/.test(x.textContent)); f.querySelector('[data-dar]').click(); return f.dataset.carta; })()`);
  await esperar(`!!document.querySelector('[data-equipo]')`);
  const darA = await ev(`[...document.querySelectorAll('.slr-lista-equipos button')].map(b => b.innerText.replace(/\\s+/g, ' '))`);
  check(darA.length > 1 && darA.every(t => /\d+\/15/.test(t)) && darA.some(t => /Bot Uno FC Bot Uno/.test(t)), `«Dar a…»: nombre, dueño y cartas (${darA[0]})`);
  await foto('dar-a');
  await ev(`[...document.querySelectorAll('.slr-hoja [data-equipo]')].find(b => /Bot Uno FC/.test(b.textContent)).click(); 0`);
  await esperar(`[...document.querySelectorAll('.slr-toast')].some(t => /→ Bot Uno FC/.test(t.textContent))`, 10000);
  const dueno = (await leer(`cartas?select=equipo_id,equipos(nombre)&id=eq.${libre}`)).datos[0];
  check(dueno.equipos?.nombre === 'Bot Uno FC', `«Dar a…» Bot Uno FC: la carta es suya`);
  await atras();

  console.log('\nMuestrario y cartas con foto');
  await clic('[data-pruebas=muestrario]');
  await esperar(`!!document.querySelector('.slr-muestrario')`);
  await dormir(1500);
  const mu = await ev(`({ acabados: document.querySelectorAll('.slr-muestrario__acabado:not([data-muestra])').length, colores: document.querySelectorAll('[data-muestra=colores] .slr-carta').length, nombres2: [...document.querySelectorAll('[data-muestra=nombres] .slr-carta__nombre')].filter(n => n.getBoundingClientRect().height > parseFloat(getComputedStyle(n).fontSize) * 1.6).length, conFoto: document.querySelectorAll('.slr-muestrario .slr-carta--con-imagen').length,
    cargadas: [...document.querySelectorAll('.slr-muestrario .slr-carta__img')].filter(i => i.src && /c_fill,ar_5:7,g_auto,w_\\d+/.test(i.src)).length })`);
  check(mu.acabados === 4 && mu.conFoto >= 4, `${mu.acabados} acabados, ${mu.conFoto} cartas con foto (${mu.cargadas} ya pedidas a Cloudinary al ancho real)`);
  check(mu.colores === 8 && mu.nombres2 >= 1, `muestrario: 8 colores y nombres largos en dos líneas (${mu.nombres2})`);
  await foto('muestrario');
  await foto('muestrario-fotos', '.slr-muestrario__fotos');
  await foto('muestrario-grande', '.slr-muestrario__grande');
  await atras();

  console.log('\nBorrar cartas beta (sin foto)');
  const bomboTxt = await ev(`document.querySelector('[data-bombo]')?.innerText.replace(/\\s+/g, ' ')`);
  const bomboApi = await rpcOk('slr_admin_bombo', { token: t, liga_id: L });
  check(new RegExp(`Plantillas iniciales disponibles ${bomboApi.equipos} equipos?`, 'i').test(bomboTxt ?? '') && bomboTxt.includes(`${bomboApi.bombo} individuales`),
    `contador del bombo: «${bomboTxt}»`);
  await foto('bombo', '[data-bombo]');
  // En una liga de prueba no alcanza al catálogo común: 0 cartas, solo un aviso
  await clic('[data-pruebas=borrar-beta]');
  check(await esperar(`[...document.querySelectorAll('.slr-toast')].some(t => /No hay cartas beta/.test(t.textContent))`, 10000),
    'desde una liga de prueba: «No hay cartas beta sin foto que borrar»');
  // Con un recuento simulado (fetch interceptado, no se borra nada): el diálogo y el BORRAR
  await ev(`(() => { const f = window.fetch; window.__fetch = f; window.__borrados = 0;
    window.fetch = (u, o) => { if (!String(u).includes('slr_admin_borrar_disenos')) return f(u, o);
      const b = JSON.parse(o.body); if (!b.solo_contar) { window.__borrados++; return Promise.resolve(new Response('{}', { status: 500 })); }
      return Promise.resolve(new Response(JSON.stringify({ solo_contar: true, disenos: 283, cartas: 283, quedan: 51,
        por_tipo: { individual: 250, duo: 24, trio: 8, grupo: 1 }, equipos: [{ nombre: 'CD Ejemplo', pierde: 3, quedan: 8 }], borrado: {} }),
        { status: 200, headers: { 'Content-Type': 'application/json' } })); }; return 0; })()`);
  await clic('[data-pruebas=borrar-beta]');
  await esperar(`!!document.querySelector('.slr-confirmar input')`);
  const conf = await ev(`({ texto: document.querySelector('.slr-confirmar__texto').innerText, bloqueado: document.querySelector('.slr-confirmar [data-si]').disabled })`);
  check(/283 cartas beta/.test(conf.texto) && /250 individuales/.test(conf.texto) && /Quedan 51 cartas/.test(conf.texto) && /CD Ejemplo \(−3, le quedan 8\)/.test(conf.texto),
    `la confirmación dice cuántas se borran, por tipo, cuántas quedan y qué equipos pierden cartas`);
  await ev(`(() => { const i = document.querySelector('.slr-confirmar input'); i.value = 'borra'; i.dispatchEvent(new Event('input')); return 0; })()`);
  const aMedias = await ev(`document.querySelector('.slr-confirmar [data-si]').disabled`);
  await ev(`(() => { const i = document.querySelector('.slr-confirmar input'); i.value = 'BORRAR'; i.dispatchEvent(new Event('input')); return 0; })()`);
  check(conf.bloqueado && aMedias && !(await ev(`document.querySelector('.slr-confirmar [data-si]').disabled`)), 'el botón solo se activa al escribir BORRAR');
  await foto('borrar-beta', '.slr-confirmar');
  await ev(`document.querySelector('.slr-confirmar [data-no]').click(); 0`);
  await dormir(500);
  check(await ev('window.__borrados') === 0, 'al cancelar no se llama al borrado');
  await ev('window.fetch = window.__fetch; 0');
  await clic('.slr-barra__salir'); await dormir(800);

  console.log('\nShits League: pull-to-refresh');
  await ev(`document.querySelector('.tab[data-tab="inicio"]').click(); window.scrollTo(0, 0); 0`);
  await dormir(500);
  const toque = (type, y) => cdp('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 195, y, id: 1 }] });
  await toque('touchStart', 200);
  const giros = [];
  for (let k = 1; k <= 6; k++) { await toque('touchMove', 200 + 20 * k); await dormir(40); giros.push(await ev(`getComputedStyle(document.getElementById('ptrSpinner')).rotate`)); }
  check(new Set(giros).size >= 5, `al arrastrar, la rueda gira con el recorrido: ${giros.join(' → ')}`);
  await toque('touchEnd', 320);
  await dormir(200);
  const r1 = await ev(`getComputedStyle(document.getElementById('ptrSpinner')).rotate`);
  await dormir(250);
  const r2 = await ev(`getComputedStyle(document.getElementById('ptrSpinner')).rotate`);
  const visible = await ev(`document.getElementById('ptrSpinner').classList.contains('visible')`);
  check(visible && r1 !== r2, `al soltar gira en bucle mientras recarga (${r1} → ${r2})`);
  check(await esperar(`!document.getElementById('ptrSpinner').classList.contains('visible') && getComputedStyle(document.getElementById('ptrSpinner')).opacity === '0'`, 15000),
    'y desaparece al terminar');

  check(!errores.length, `sin errores en la consola${errores.length ? `: ${errores.join(' | ')}` : ''}`);
  ch.kill();
} catch (e) {
  mal++;
  console.log(`  ✖ Error inesperado: ${e.message}`);
} finally {
  await rpc('slr_borrar_liga', { token: t, liga_id: L });
  await rpc('slr_logout', { token: t });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas`);
  process.exit(mal ? 1 : 0);
}
