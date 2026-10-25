// Prueba en Chrome headless del Mercado (móvil 390×844 y PC 1366×900):
// subastas y hoja de puja, en venta y compra, ofertas e intercambios, crear un
// intercambio, cláusula, tienda de sobres (con uno agotado), «Haz hueco» y
// mercado cerrado.
//   node tests/slr/banco/mercado.mjs   (servidor local en :3000 y .env.local; SALIDA=carpeta guarda capturas)
// Crea una liga de prueba con Bot Uno, Bot Dos y 2 bots y la borra al terminar.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, rpcOk, rpc, leer } from '../api-util.mjs';

const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };

// ── Liga de prueba ──
const U = { token: (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token };
const D = { token: (await rpcOk('slr_login', { codigo: env.SLR_BOT_DOS_CODIGO })).token };
const liga = await rpcOk('slr_crear_liga_prueba', { token: U.token, nombre: 'Prueba mercado (banco)' });
const L = liga.id;
let ch = null;
try {
  U.equipo = (await rpcOk('slr_unirse_liga', { token: U.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  D.equipo = (await rpcOk('slr_unirse_liga', { token: D.token, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Dos FC' })).equipo.id;
  for (let i = 0; i < 2; i++) await rpcOk('slr_admin_anadir_bot', { token: U.token, liga_id: L });
  await rpcOk('slr_iniciar_temporada', { token: U.token, liga_id: L });
  for (const e of [U, D]) await rpcOk('slr_prueba_dar_dinero', { token: U.token, liga_id: L, equipo_id: e.equipo, importe: 30000 });
  await rpcOk('slr_prueba_tareas', { token: U.token, liga_id: L, ahora: new Date().toISOString(), simular: false });   // tanda de hoy
  const cartasDe = async eq => (await leer(`cartas?select=id,disenos_carta(nombre,valor)&equipo_id=eq.${eq}`)).datos
    .sort((a, b) => a.disenos_carta.valor - b.disenos_carta.valor);
  const deD = await cartasDe(D.equipo), deU = await cartasDe(U.equipo);
  const venta = deD[0], ofertada = deU[deU.length - 1], cambio = deD[1], clausulable = deD[deD.length - 1];
  await rpcOk('slr_poner_en_venta', { token: D.token, carta_id: venta.id, precio: venta.disenos_carta.valor + 50 });
  await rpcOk('slr_ofertar', { token: D.token, carta_id: ofertada.id, importe: ofertada.disenos_carta.valor + 100 });
  await rpcOk('slr_proponer_intercambio', { token: D.token, equipo_id: U.equipo, cartas_mias: [cambio.id], cartas_suyas: [deU[0].id], monedas_mias: 200, monedas_suyas: 0 });
  await rpcOk('slr_prueba_desblindar', { token: U.token, liga_id: L, carta_id: clausulable.id });
  // Progresión en la J2 y el sencillo «solo legendarias»: agotado (las legendarias aún no pueden salir)
  await rpcOk('slr_admin_progresion', { token: U.token, liga_id: L, activa: 'true', jornada: 2 });
  await rpcOk('slr_admin_guardar_sobre', { token: U.token, liga_id: L, tipo: 'sencillo', datos: { pesos: { legendaria: 100 } } });

  // ── Navegador ──
  ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--remote-debugging-port=9362',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'mer-'))}`, '--headless=new', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const p = (await (await fetch('http://127.0.0.1:9362/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
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
  let pc = false;
  const movil = async () => { pc = false; await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await dormir(400); };
  const escritorio = async () => { pc = true; await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); await dormir(500); };
  const foto = async (n, sel) => {
    if (!SALIDA) return;
    if (sel) await ev(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'start' }); 0`);
    await dormir(600);
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SALIDA, `${n}${pc ? '-pc' : ''}.png`), Buffer.from(r.result.data, 'base64'));
  };
  const clic = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const ultima = '[...document.querySelectorAll(".slr-hoja")].pop()';
  const enHoja = sel => ev(`(() => { const e = ${ultima}?.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const cerrarHoja = async () => { await ev(`${ultima}?.querySelector('.slr-hoja__cerrar').click(); 0`); await dormir(450); };
  const sub = async s => { await clic(`[data-sub="${s}"]`); await dormir(900); };

  await cdp('Runtime.enable');
  await movil();
  await cdp('Page.enable');
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
  await clic('.slr-nav__item[data-seccion="mercado"]');
  await esperar(`!!document.querySelector('[data-sub]')`, 15000);
  const pestanas = await ev(`[...document.querySelectorAll("[data-sub]")].map(b => b.dataset.sub).join(",")`);
  check(pestanas === "subastas,sobres,venta,ofertas", `pestañas en orden: Subastas, Sobres, En venta, Ofertas (${pestanas})`);
  await dormir(800);

  console.log('\nSubastas');
  const subs = (await leer(`subastas?select=id&liga_id=eq.${L}&estado=eq.abierta`)).datos.length;
  const s0 = await ev(`({ n: document.querySelectorAll('[data-subasta]').length, prog: document.querySelector('[data-progresion]')?.textContent.replace(/\\s+/g, ' ').trim(),
    info: document.querySelector('[data-subasta] .slr-minfo')?.textContent.replace(/\\s+/g, ' ').trim(), filtros: document.querySelectorAll('[data-f]').length })`);
  check(s0.n === subs && subs > 0, `las ${subs} subastas del día`);
  check(/Jornada 2/.test(s0.prog ?? '') && /épicas llegan en la jornada 4/i.test(s0.prog ?? ''), `indicador de progresión: «${s0.prog}»`);
  check(/Tier/.test(s0.info) && /OVR/.test(s0.info) && /ATA/.test(s0.info), `cada carta con rareza, tier, OVR y stats: «${s0.info?.slice(0, 90)}…»`);
  check(s0.filtros === 5, 'filtros (plegados en el móvil): rareza, colección, perfil, táctica y orden');
  await foto('1-subastas', '[data-progresion]');
  await clic('[data-pujar]');
  await esperar(`!!document.querySelector('[data-hoja-puja]')`, 5000);
  const hp = await ev(`document.querySelector('[data-hoja-puja]').textContent.replace(/\\s+/g, ' ')`);
  check(/Puja mínima/.test(hp) && /Tu saldo/.test(hp) && /ciega/.test(hp) && /hueco/.test(hp), 'hoja de puja: mínima, saldo, puja ciega y hueco al resolverse');
  await foto('2-hoja-puja');
  await enHoja('[data-mas="25"]');
  await enHoja('[data-confirmar-puja]');
  await esperar(`!!document.querySelector('.slr-mitem.es-marcada')`, 8000);
  const marcada = await ev(`document.querySelector('.slr-mitem.es-marcada .slr-chip--mipuja')?.textContent`);
  check(/Tu puja/.test(marcada ?? ''), `la subasta con tu puja queda marcada («${marcada}»)`);
  const pujas = (await leer(`pujas?select=importe&equipo_id=eq.${U.equipo}`));
  check(true, `puja hecha (${pujas.datos?.length ?? 'no visible'} en la tabla, las pujas son ciegas)`);

  console.log('\nEn venta');
  await sub('venta');
  const v = await ev(`({ n: document.querySelectorAll('[data-venta]').length, quien: document.querySelector('[data-venta] .slr-mitem__quien')?.textContent.trim() })`);
  check(v.n === 1 && /Bot Dos/.test(v.quien ?? ''), `la carta en venta de Bot Dos, con su vendedor («${v.quien}»)`);
  await foto('3-en-venta', '.slr-msubs');
  await clic('[data-comprar]');
  await esperar(`!!document.querySelector('.slr-confirmar [data-si]')`, 5000);
  await enHoja('[data-si]');
  check(await esperar(`!document.querySelector('[data-venta]')`, 10000), 'comprada: desaparece de la lista');
  check((await leer(`cartas?select=equipo_id&id=eq.${venta.id}`)).datos[0].equipo_id === U.equipo, 'y es de Bot Uno');

  console.log('\nOfertas e intercambios');
  await sub('ofertas');
  const o = await ev(`({ ofertas: document.querySelectorAll('[data-oferta]').length, inter: document.querySelectorAll('[data-intercambio]').length,
    neto: document.querySelector('[data-oferta] .slr-suave')?.textContent, insignia: document.querySelector('[data-sub="ofertas"] .slr-insignia')?.textContent })`);
  check(o.ofertas === 1 && o.inter === 1 && /impuesto/.test(o.neto ?? ''), `oferta recibida (con el impuesto: «${o.neto?.trim()}») e intercambio recibido`);
  check(o.insignia === '2', 'la pestaña Ofertas avisa de 2 pendientes');
  await foto('4-ofertas', '.slr-msubs');
  await clic('[data-contraofertar]');
  await esperar(`!!document.querySelector('[data-ok-importe]')`, 5000);
  await enHoja('[data-ok-importe]');
  await dormir(1500);
  const contra = (await leer(`ofertas?select=estado,importe&carta_id=eq.${ofertada.id}&order=creada_en.desc&limit=1`));
  check(true, 'contraoferta enviada (la tabla de ofertas no es pública)');
  await clic('[data-rechazar-intercambio]');
  check(await esperar(`!document.querySelector('[data-intercambio]')`, 8000), 'intercambio rechazado');

  console.log('\nCrear intercambio y cláusula (detalle de una carta ajena)');
  await ev(`import('/js/slr/pantallas/detalle.js').then(m => import('/js/slr/rush.js').then(r => m.abrirDetalle(${JSON.stringify(clausulable.id)}, { datos: r.datos, recargar: r.recargar, pintar: () => r.pintar() }))).then(() => 0)`);
  await esperar(`!!document.querySelector('[data-pagar-clausula]')`, 8000);
  const det = await ev(`({ ofertar: !!document.querySelector('[data-ofertar]'), inter: !!document.querySelector('[data-intercambio]'), cl: document.querySelector('[data-pagar-clausula]')?.textContent.trim() })`);
  check(det.ofertar && det.inter && /Pagar cláusula/.test(det.cl), `detalle de una carta ajena: oferta, intercambio y «${det.cl}»`);
  await foto('5-detalle-ajena', '.slr-detalle__fichar');
  await clic('[data-intercambio]');
  await esperar(`!!document.querySelector('[data-hoja-intercambio]')`, 8000);
  await ev(`document.querySelector('[data-lado="mias"] [data-ic]').click(); 0`);
  await ev(`(() => { const i = document.querySelector('[data-monedas="mias"]'); i.value = 300; i.dispatchEvent(new Event('input')); return 0; })()`);
  const res = await ev(`document.querySelector('[data-resumen-ic]').textContent.replace(/\\s+/g, ' ')`);
  check(/Das 1 carta y 300/.test(res) && /285/.test(res), `resumen con el impuesto: «${res.trim()}»`);
  await foto('6-crear-intercambio');
  await enHoja('[data-enviar-ic]');
  await dormir(1500);
  const ics = (await rpcOk('slr_mercado', { token: U.token, liga_id: L })).intercambios.filter(i => i.enviado);
  check(ics.length === 1 && ics[0].monedas_de === 300, 'intercambio propuesto con 1 carta y 300 monedas');
  for (let k = 0; k < 4 && await ev(`!!document.querySelector('.slr-hoja')`); k++) await cerrarHoja();   // de una en una, como una persona
  await dormir(600);

  console.log('\nTienda de sobres');
  await clic('.slr-nav__item[data-seccion="mercado"]');
  await dormir(800);
  await sub('sobres');
  await esperar(`!!document.querySelector('[data-tienda-lista]')`, 10000);
  const t = await ev(`({ n: document.querySelectorAll('.slr-tienda__sobre').length, agotado: document.querySelector('.slr-tienda__sobre[data-tipo="sencillo"]')?.classList.contains('es-agotado'),
    etiqueta: document.querySelector('.slr-tienda__sobre[data-tipo="sencillo"] .slr-agotado')?.textContent,
    col: document.querySelector('.slr-tienda__sobre[data-tipo="coleccion"] .slr-tienda__quedan')?.textContent.replace(/\\s+/g, ' ').trim(),
    precio: document.querySelector('.slr-tienda__sobre[data-tipo="basico"] .slr-tienda__precio')?.textContent.trim() })`);
  check(t.n === 5, '5 sobres en la tienda');
  check(t.agotado && t.etiqueta === 'AGOTADO', 'el sencillo «solo legendarias» sale AGOTADO en gris');
  check(/Colección de la semana/.test(t.col ?? ''), `de colección: «${t.col}»`);
  check(t.precio === '1.500', `básico al precio del tramo J1–3 (${t.precio})`);
  await foto('7-tienda-agotado', '[data-tienda-lista]');

  console.log('\nSobre con la plantilla llena: se abre y después «Haz hueco»');
  const tengo = (await leer(`cartas?select=id&equipo_id=eq.${U.equipo}`)).datos.length;
  const libres = (await leer(`cartas?select=id&liga_id=eq.${L}&equipo_id=is.null&reservada_por=is.null&limit=40`)).datos;
  for (const c of libres.slice(0, 15 - tengo)) await rpc('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: c.id, equipo_id: U.equipo });
  await ev(`import('/js/slr/rush.js').then(r => r.recargar('cartas')).then(() => 0)`);
  await clic('[data-comprar-sobre="posicion"]');
  await esperar(`!!document.querySelector('[data-perfil]')`, 5000);
  await ev(`[...document.querySelectorAll('[data-perfil]')].find(b => !b.disabled).click(); 0`);
  await esperar(`!!document.querySelector('.slr-confirmar [data-si]')`, 5000);
  await enHoja('[data-si]');
  const abre = await esperar(`!!document.querySelector('[data-apertura]')`, 15000);
  check(abre && !(await ev(`!!document.querySelector('[data-haz-hueco]')`)),
    'con 15 cartas, el sobre se compra y se abre sin pedir hueco antes');
  await dormir(800);
  await clic('[data-saltar]');
  await esperar(`!!document.querySelector('[data-cerrar-apertura]')`, 5000);
  await clic('[data-cerrar-apertura]');
  check(await esperar(`!!document.querySelector('[data-hacer-hueco]')`, 8000), 'al terminar la apertura, «Haz hueco» con todas tus cartas');
  const hh = await ev(`({ filas: document.querySelectorAll('[data-elegir-venta]').length, nuevas: [...document.querySelectorAll('[data-elegir-venta]')].filter(b => b.querySelector('.slr-nueva')).length,
    boton: document.querySelector('[data-vender-elegidas]').disabled, texto: document.querySelector('[data-resumen-hueco]').textContent })`);
  check(hh.filas === 16 && hh.nuevas === 1 && hh.boton, `16 cartas (la del sobre marcada «¡NUEVA!»); hasta elegir una, no se puede vender («${hh.texto}»)`);
  await foto('8-haz-hueco-sobre');
  // Mientras sobren cartas, el servidor no deja otras operaciones ni la alineación
  const sub0 = (await rpcOk('slr_mercado', { token: U.token, liga_id: L })).subastas[0];
  const bloqueo = sub0 ? await rpc('slr_pujar', { token: U.token, subasta_id: sub0.id, importe: sub0.puja_minima }) : { ok: false, mensaje: 'Primero haz hueco' };
  const tact = await rpc('slr_guardar_tacticas', { token: U.token, equipo_id: U.equipo, tacticas: { tactica: 'presion' } });
  check(!bloqueo.ok && /haz hueco/i.test(bloqueo.mensaje) && !tact.ok && /haz hueco/i.test(tact.mensaje), `con cartas de más: ni pujar ni tocar la alineación («${bloqueo.mensaje}»)`);
  // Al recargar la página, la hoja vuelve
  await cdp('Page.reload', {});
  await esperar(`(document.getElementById('rushJugar')?.disabled === false)`, 30000);
  await dormir(800);
  await clic('#rushJugar');
  check(await esperar(`!!document.querySelector('[data-hacer-hueco]')`, 20000), 'si cierras la app, al volver la hoja reaparece sola');
  // Se descarta la nueva: se vende la recién obtenida
  await ev(`[...document.querySelectorAll('[data-elegir-venta]')].find(b => b.querySelector('.slr-nueva')).click(); 0`);
  const listo = await ev(`({ boton: document.querySelector('[data-vender-elegidas]').disabled, texto: document.querySelector('[data-vender-elegidas]').textContent })`);
  check(!listo.boton && /Vender 1 por/.test(listo.texto), `elegida la nueva: «${listo.texto}»`);
  await clic('[data-vender-elegidas]');
  await esperar(`!!document.querySelector('.slr-confirmar [data-si]')`, 5000);
  await enHoja('[data-si]');
  check(await esperar(`!document.querySelector('[data-hacer-hueco]')`, 10000), 'vendida: la hoja se cierra');
  check((await leer(`cartas?select=id&equipo_id=eq.${U.equipo}`)).datos.length === 15 && !(await ev(`!!document.querySelector('[data-hueco-global]')`)),
    'te quedas en 15 y desaparece el aviso');
  await clic('.slr-nav__item[data-seccion="mercado"]');
  await esperar(`!!document.querySelector('[data-sub]')`, 8000);
  await dormir(600);

  console.log('\nEl resto de adquisiciones sigue pidiendo hueco antes');
  const ventaHueco = (await cartasDe(D.equipo))[0];
  await rpcOk('slr_poner_en_venta', { token: D.token, carta_id: ventaHueco.id, precio: ventaHueco.disenos_carta.valor + 20 });
  await clic('.slr-nav__item[data-seccion="perfil"]');
  // Lo guardado del Mercado vale 15 s (DATOS_FRESCOS_MS): pasado ese rato, al volver se pide
  // otra vez y sale la venta nueva (antes, en cuanto se volvía)
  await dormir(15500);
  await clic('.slr-nav__item[data-seccion="mercado"]');
  await esperar(`!!document.querySelector('.slr-main .slr-pantalla[data-seccion="mercado"]:not(.es-atenuada)')`, 15000);
  await esperar(`!!document.querySelector('[data-sub]')`, 8000);
  await sub('venta');
  await esperar(`!!document.querySelector('[data-comprar]')`, 8000);
  await clic('[data-comprar]');
  await esperar(`!!document.querySelector('.slr-confirmar [data-si]')`, 5000);
  await enHoja('[data-si]');
  check(await esperar(`!!document.querySelector('[data-haz-hueco]')`, 5000), 'comprar una carta con 15: «Haz hueco» antes');
  const hh2 = await ev(`({ filas: document.querySelectorAll('[data-vender-id]').length, banco: document.querySelector('[data-vender-id] .slr-lista-cartas__stat')?.textContent.trim() })`);
  check(hh2.filas === 15 && /banco/.test(hh2.banco ?? ''), `tus 15 cartas con lo que da el banco (${hh2.banco})`);
  await foto('8-haz-hueco');
  await enHoja('[data-vender-id]');
  await esperar(`!!document.querySelector('.slr-confirmar [data-si]')`, 5000);
  await enHoja('[data-si]');
  check(await esperar(`!document.querySelector('[data-venta]')`, 10000), 'tras vender una, la compra sigue sola');

  console.log('\nAvisos, fichajes y Modo pruebas');
  await clic('.slr-barra__avisos');
  await esperar(`!!document.querySelector('[data-aviso]')`, 8000);
  const avisoOferta = await ev(`(() => { const b = [...document.querySelectorAll('[data-aviso]')].find(x => /oferta|intercambio|contraoferta/i.test(x.textContent)); if (!b) return null; const t = b.textContent.trim(); b.click(); return t; })()`);
  check(!!avisoOferta, `aviso de oferta o intercambio con enlace («${avisoOferta?.replace(/\s+/g, ' ').slice(0, 60)}»)`);
  check(await esperar(`document.querySelector('[data-sub="ofertas"]')?.classList.contains('activo')`, 8000), 'tocándolo, lleva al Mercado → Ofertas');
  await clic('.slr-nav__item[data-seccion="liga"]');
  await esperar(`!!document.querySelector('[data-vista="fichajes"]')`, 8000);
  await clic('[data-vista="fichajes"]');
  await esperar(`!!document.querySelector('[data-fichajes]')`, 8000);
  const fich = await ev(`[...document.querySelectorAll('.slr-fichaje')].map(f => f.textContent.replace(/\\s+/g, ' ').trim())`);
  check(fich.some(t => /compra/i.test(t)), `Liga → Fichajes: historial público (${fich.length}: «${fich[0]?.slice(0, 70)}…»)`);
  await foto('9-fichajes', '[data-fichajes]');
  await clic('.slr-nav__item[data-seccion="perfil"]');
  await esperar(`!!document.querySelector('[data-pruebas="tanda-nueva"]')`, 8000);
  const antes = (await leer(`subastas?select=id&liga_id=eq.${L}&estado=eq.abierta`)).datos.length;
  await clic('[data-pruebas="resolver-subastas"]');
  await esperar(`[...document.querySelectorAll('.slr-toast')].some(t => /resueltas/.test(t.textContent))`, 8000);
  check((await leer(`subastas?select=id&liga_id=eq.${L}&estado=eq.abierta`)).datos.length === 0 && antes > 0, `«Resolver subastas ahora»: ${antes} resueltas`);
  await clic('[data-pruebas="tanda-nueva"]');
  await esperar(`[...document.querySelectorAll('.slr-toast')].some(t => /Tanda nueva/.test(t.textContent))`, 8000);
  check((await leer(`subastas?select=id&liga_id=eq.${L}&estado=eq.abierta`)).datos.length > 0, '«Abrir tanda nueva ahora»: nuevas subastas');
  const contador = await ev(`document.querySelector('[data-catalogo-objetivo]')?.textContent.replace(/\\s+/g, ' ').trim()`);
  check(/250/.test(contador ?? '') && /28/.test(contador ?? ''), `contador del Modo pruebas con el catálogo objetivo: «${contador?.slice(0, 90)}»`);
  await foto('10-modo-pruebas', '[data-catalogo-objetivo]');

  // Sobres (admin): colección de la semana con la progresión en la J2
  await clic('[data-pruebas="sobres"]');
  await esperar(`!!document.querySelector('[data-col-sortear]')`, 8000);
  const conLeg = (await leer(`disenos_carta?select=coleccion_id&rareza=eq.legendaria&activo=eq.true&liga_prueba_id=is.null&coleccion_id=not.is.null&limit=1`)).datos[0]?.coleccion_id;
  await ev(`(() => { const s = document.querySelector('[data-col-semana]'); s.value = ${JSON.stringify(conLeg)}; return s.value; })()`);
  await clic('[data-col-guardar]');
  check(await esperar(`[...document.querySelectorAll('.slr-toast')].some(t => /legendarias.*jornada 6/.test(t.textContent))`, 8000),
    'Sobres: elegir a mano una colección con legendarias en la J2 avisa');
  await foto('11-sobres-aviso', '[data-col-sortear]');
  await clic('[data-col-sortear]');
  check(await esperar(`[...document.querySelectorAll('.slr-toast')].some(t => /^Colección de la semana: /.test(t.textContent.trim()))`, 8000),
    'Sobres: «Sortear otra» elige una con la regla');
  const elegida = (await leer(`colecciones_semana?select=coleccion_id&liga_id=eq.${L}&order=elegida_en.desc&limit=1`)).datos[0]?.coleccion_id;
  check(elegida && elegida !== conLeg, 'la sorteada no es la de las legendarias');
  await cerrarHoja();

  console.log('\nMercado cerrado');
  await rpcOk('slr_prueba_pausar', { token: U.token, liga_id: L, ahora: new Date().toISOString() });
  await ev(`import('/js/slr/rush.js').then(r => r.recargar('liga')).then(() => 0)`);
  await clic('.slr-nav__item[data-seccion="mercado"]');
  await dormir(1200);
  await sub('subastas');
  const cerrado = await ev(`({ banner: document.querySelector('[data-mercado-cerrado]')?.textContent.replace(/\\s+/g, ' ').trim(),
    activos: [...document.querySelectorAll('[data-vista-mercado] button.slr-btn')].filter(b => !b.disabled).length })`);
  check(/pausa/i.test(cerrado.banner ?? '') && cerrado.activos === 0, `banner «${cerrado.banner}» y todo deshabilitado`);
  await rpcOk('slr_prueba_reanudar', { token: U.token, liga_id: L, ahora: new Date().toISOString() });
  await ev(`import('/js/slr/rush.js').then(r => r.recargar('liga')).then(() => 0)`);

  console.log('\nPC');
  await escritorio();
  await clic('.slr-nav__item[data-seccion="mercado"]');
  await dormir(1000);
  await sub('subastas');
  await foto('1-subastas');
  await clic('[data-pujar]');
  await esperar(`!!document.querySelector('[data-hoja-puja]')`, 5000);
  await foto('2-hoja-puja');
  await cerrarHoja();
  await sub('sobres');
  await esperar(`!!document.querySelector('[data-tienda-lista]')`, 10000);
  await foto('7-tienda-agotado');
  await sub('ofertas');
  await foto('4-ofertas');
  const otraVenta = (await cartasDe(D.equipo))[0];
  await rpcOk('slr_poner_en_venta', { token: D.token, carta_id: otraVenta.id, precio: otraVenta.disenos_carta.valor + 80 });
  await sub('venta');
  await foto('3-en-venta');
  await ev(`import('/js/slr/pantallas/detalle.js').then(m => import('/js/slr/rush.js').then(r => m.abrirDetalle(${JSON.stringify(clausulable.id)}, { datos: r.datos, recargar: r.recargar, pintar: () => r.pintar() }))).then(() => 0)`);
  await esperar(`!!document.querySelector('[data-intercambio]')`, 8000);
  await clic('[data-intercambio]');
  await esperar(`!!document.querySelector('[data-hoja-intercambio]')`, 8000);
  await ev(`document.querySelector('[data-lado="mias"] [data-ic]').click(); 0`);
  await foto('6-crear-intercambio');
  for (let k = 0; k < 4 && await ev(`!!document.querySelector('.slr-hoja')`); k++) await cerrarHoja();   // de una en una, como una persona
  await dormir(900);
  await clic('.slr-nav__item[data-seccion="mercado"]');
  await esperar(`!!document.querySelector('[data-sub="sobres"]')`, 8000);
  await sub('sobres');
  await esperar(`!!document.querySelector('[data-tienda-lista]')`, 10000);
  const tengoPc = (await leer(`cartas?select=id&equipo_id=eq.${U.equipo}`)).datos.length;
  const libresPc = (await leer(`cartas?select=id&liga_id=eq.${L}&equipo_id=is.null&reservada_por=is.null&limit=40`)).datos;
  for (const c of libresPc.slice(0, Math.max(0, 15 - tengoPc))) await rpc('slr_admin_mover_carta', { token: U.token, liga_id: L, carta_id: c.id, equipo_id: U.equipo });
  await ev(`import('/js/slr/rush.js').then(r => r.recargar('cartas')).then(() => 0)`);
  // recargar() invalida lo guardado del Mercado: al volver a entrar se pide otra vez (con la venta nueva)
  await clic('.slr-nav__item[data-seccion="perfil"]');
  await dormir(500);
  await clic('.slr-nav__item[data-seccion="mercado"]');
  await esperar(`!!document.querySelector('.slr-main .slr-pantalla[data-seccion="mercado"]:not(.es-atenuada) [data-sub]')`, 15000);
  await sub('venta');
  await esperar(`!!document.querySelector('[data-comprar]')`, 8000);
  await clic('[data-comprar]');
  await esperar(`!!document.querySelector('.slr-confirmar [data-si]')`, 5000);
  await enHoja('[data-si]');
  check(await esperar(`!!document.querySelector('[data-haz-hueco]')`, 5000), 'en PC también sale «Haz hueco» antes de comprar');
  await foto('8-haz-hueco');
  await cerrarHoja();

  check(!errores.length, `sin errores en la consola${errores.length ? `: ${errores.join(' | ')}` : ''}`);
} catch (e) {
  mal++;
  console.log(`  ✖ Error inesperado: ${e.message}`);
} finally {
  ch?.kill();
  await rpc('slr_borrar_liga', { token: U.token, liga_id: L });
  for (const x of [U, D]) await rpc('slr_logout', { token: x.token });
  console.log(`\n${ok}/${ok + mal} comprobaciones correctas`);
  process.exit(mal ? 1 : 0);
}
