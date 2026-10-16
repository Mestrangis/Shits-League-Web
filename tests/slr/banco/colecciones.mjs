// Prueba en Chrome headless (móvil 390×844) del modelo de carta: rareza (marco),
// tipo (icono) y colecciones (fondo, emblema tintado, nombre), el gestor de
// colecciones, el selector del formulario de carta, el progreso del álbum, el
// filtro del catálogo, el muestrario, añadir y quitar cartas desde la colección y la
// edición múltiple (catálogo y herramienta de plantillas).
//   node tests/slr/banco/colecciones.mjs   (servidor local en :3000 y .env.local; SALIDA=carpeta guarda capturas)
// Crea una liga de prueba con una colección y cartas con foto, y la borra al terminar.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, rpcOk, rpc, leer } from '../api-util.mjs';

const SALIDA = process.env.SALIDA;
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (c, que, det = '') => { c ? ok++ : mal++; console.log(`${c ? '  ✔' : '  ✖'} ${que}${!c && det ? ` → ${det}` : ''}`); };
const EMBLEMA = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M40 6a26 26 0 1 0 18 44A22 22 0 0 1 40 6z"/>' +
  '<path d="M48 14l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>');

const t = (await rpcOk('slr_login', { codigo: env.SLR_BOT_UNO_CODIGO })).token;
const liga = await rpcOk('slr_crear_liga_prueba', { token: t, nombre: 'Prueba colecciones (banco)' });
const L = liga.id;
let ch;
try {
  const EQ = (await rpcOk('slr_unirse_liga', { token: t, codigo_invitacion: liga.codigo_invitacion, nombre_equipo: 'Bot Uno FC' })).equipo.id;
  const col = await rpcOk('slr_admin_guardar_coleccion', { token: t, liga_id: L, coleccion: { nombre: 'Siesta', color: 'morado', emblema_url: EMBLEMA } });
  const fotos = (await leer('disenos_carta?select=imagen_url&imagen_url=not.is.null&liga_prueba_id=is.null&nombre=ilike.*siesta*&limit=10')).datos.map(d => d.imagen_url);
  const otras = (await leer('disenos_carta?select=imagen_url&imagen_url=not.is.null&liga_prueba_id=is.null&limit=12')).datos.map(d => d.imagen_url);
  const nuevas = [];
  for (const [i, [nombre, tier]] of [['Gonzalo', 'S'], ['Jorge', 'A'], ['Nico', 'B'], ['Puebla', 'D']].entries()) {
    const r = await rpcOk('slr_admin_guardar_diseno', { token: t, liga_id: L, diseno: {
      nombre, tipo: 'individual', perfil: 'control', tier, semilla_stats: 40 + i, semilla_poderes: 90 + i,
      coleccion_id: col.id, imagen_url: fotos[i] ?? otras[i] } });
    nuevas.push(r);
  }
  // Una de otro color propio (anula el de la colección) y una de grupo sin colección
  const propia = await rpcOk('slr_admin_guardar_diseno', { token: t, liga_id: L, diseno: {
    nombre: 'Mateo', tipo: 'duo', perfil: 'atacante', tier: 'C', semilla_stats: 5, semilla_poderes: 6, coleccion_id: col.id, color: 'rojo', imagen_url: otras[5] } });
  const grupo = await rpcOk('slr_admin_guardar_diseno', { token: t, liga_id: L, diseno: {
    nombre: 'La Cuadrilla', tipo: 'grupo', perfil: 'equilibrado', tier: 'E', semilla_stats: 3, semilla_poderes: 4, imagen_url: otras[6] } });
  // Bot Uno: deja libres 4 de su plantilla y se queda las de la colección
  const mias = (await leer(`cartas?select=id&equipo_id=eq.${EQ}`)).datos;
  for (const c of mias.slice(0, 4)) await rpcOk('slr_admin_mover_carta', { token: t, liga_id: L, carta_id: c.id, equipo_id: null });
  for (const r of [...nuevas.slice(0, 3), propia, grupo].slice(0, 8)) await rpcOk('slr_admin_mover_carta', { token: t, liga_id: L, carta_id: r.carta_id, equipo_id: EQ });

  // ── Navegador ──
  ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--remote-debugging-port=9363',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'co-'))}`, '--headless=new', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const p = (await (await fetch('http://127.0.0.1:9363/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
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
  const esperar = async (expr, ms = 15000) => { for (let i = 0; i < ms / 150; i++) { if (await ev(expr)) return true; await dormir(150); } return false; };
  const clic = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const atras = async () => { await ev('history.back(); 0'); await dormir(500); };
  const foto = async (n, sel) => {
    if (!SALIDA) return;
    if (sel) await ev(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'start' }); 0`);
    await dormir(900);
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SALIDA, `${n}.png`), Buffer.from(r.result.data, 'base64'));
  };

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
  await esperar(`!window.__paginaVieja && !!document.getElementById('rushJugar')`, 30000);
  await clic('#rushJugar');
  await esperar(`!!document.querySelector('.slr-nav__item')`, 30000);

  console.log('\nCartas: marco por rareza, fondo de la colección, emblema, icono de tipo');
  await clic('[data-seccion=plantilla]');
  await esperar(`[...document.querySelectorAll('.slr-pantalla .slr-carta__nombre')].some(n => n.textContent === 'Gonzalo')`, 20000);
  await esperar(`document.querySelectorAll('.slr-pantalla .slr-carta.con-foto').length >= 5`, 20000);
  const cartas = await ev(`[...document.querySelectorAll('.slr-pantalla .slr-carta')].map(c => ({ nombre: c.querySelector('.slr-carta__nombre').textContent,
    rareza: [...c.classList].find(x => x.startsWith('slr-carta--r-'))?.slice(13), marco: getComputedStyle(c).getPropertyValue('--marco').trim(),
    fondo: [...c.classList].find(x => x.startsWith('slr-carta--color-'))?.slice(17) ?? null, emblema: !!c.querySelector('.slr-carta__emblema i'),
    mascara: getComputedStyle(c.querySelector('.slr-carta__emblema i') ?? c).maskImage || getComputedStyle(c.querySelector('.slr-carta__emblema i') ?? c).webkitMaskImage,
    tipo: !!c.querySelector('.slr-carta__tipo svg'), coleccion: !!c.querySelector('.slr-carta__coleccion') }))`);
  const de = n => cartas.find(c => c.nombre === n);
  check(de('Gonzalo')?.rareza === 'legendaria' && de('Jorge')?.rareza === 'epica' && de('Nico')?.rareza === 'rara' && cartas.some(c => c.rareza === 'comun'),
    `marco por rareza: ${['Gonzalo', 'Jorge', 'Nico', 'Mateo'].map(n => `${n} ${de(n)?.rareza} (${de(n)?.marco})`).join(' · ')}`);
  check(new Set(['legendaria', 'epica', 'rara', 'comun'].map(r => cartas.find(c => c.rareza === r)?.marco)).size === 4, 'cuatro colores de marco distintos');
  check(de('Gonzalo')?.fondo === 'morado' && de('Mateo')?.fondo === 'rojo' && de('La Cuadrilla')?.fondo === null,
    'fondo: el de la colección (morado); el color propio lo anula (Mateo, rojo); sin colección, el neutro');
  check(de('Gonzalo')?.emblema && /url\(/.test(de('Gonzalo')?.mascara ?? '') && !de('La Cuadrilla')?.emblema, 'emblema de la colección como máscara (y nada sin colección)');
  check(cartas.every(c => c.tipo) && cartas.every(c => !c.coleccion), 'icono de tipo en todas; el nombre de la colección no sale en la rejilla');
  await foto('plantilla-rarezas');
  // Carta grande (detalle): nombre de la colección bajo el nombre y línea con tipo, rareza y colección
  await ev(`[...document.querySelectorAll('.slr-pantalla .slr-ficha')].find(b => /Gonzalo/.test(b.textContent)).click(); 0`);
  await esperar(`!!document.querySelector('.slr-detalle .slr-carta__coleccion')`);
  const det = await ev(`({ col: document.querySelector('.slr-detalle .slr-carta__coleccion').textContent, linea: document.querySelector('.slr-linea-carta').innerText.replace(/\\s+/g, ' ').trim() })`);
  check(det.col === 'Siesta' && /Individual/i.test(det.linea) && /Legendaria/i.test(det.linea) && /Siesta/i.test(det.linea),
    `detalle: «${det.col}» bajo el nombre · ${det.linea}`);
  await dormir(1500);
  await foto('carta-grande-coleccion');
  await atras();

  console.log('\nMuestrario');
  await clic('[data-seccion=perfil]');
  await esperar(`!!document.querySelector('[data-pruebas=muestrario]')`);
  await clic('[data-pruebas=muestrario]');
  await esperar(`!!document.querySelector('[data-muestra=rarezas]')`);
  const mu = await ev(`({ rarezas: document.querySelectorAll('[data-muestra=rarezas] .slr-carta').length, tipos: document.querySelectorAll('[data-muestra=tipos] svg').length,
    colecciones: document.querySelectorAll('[data-muestra=colecciones] .slr-carta__emblema').length, nombreGrande: document.querySelector('[data-muestra=colecciones] .slr-carta--l .slr-carta__coleccion')?.textContent,
    xsSinNombre: [...document.querySelectorAll('[data-muestra=colecciones] .slr-carta--xs')].every(c => !c.querySelector('.slr-carta__coleccion') && c.querySelector('.slr-carta__emblema')) })`);
  check(mu.rarezas === 8 && mu.tipos === 5 && mu.colecciones >= 7 && mu.nombreGrande === 'Dormidito' && mu.xsSinNombre,
    `muestrario: 4 rarezas en grande y en miniatura, ${mu.tipos} tipos, colecciones (grande con nombre, miniatura solo emblema)`);
  await foto('muestrario-rarezas', '[data-muestra=rarezas]');
  await foto('muestrario-colecciones', '[data-muestra=colecciones]');
  await atras();

  console.log('\nGestor de colecciones');
  await clic('[data-pruebas=colecciones]');
  await esperar(`!!document.querySelector('.slr-colecciones button')`);
  const lista = await ev(`[...document.querySelectorAll('.slr-colecciones button')].map(b => b.innerText.replace(/\\s+/g, ' ').trim())`);
  check(lista.some(x => /Siesta/.test(x) && /5 cartas/.test(x)), `lista: ${lista.join(' | ')}`);
  await foto('gestor-colecciones');
  await ev(`[...document.querySelectorAll('.slr-colecciones button')].find(b => /Siesta/.test(b.textContent)).click(); 0`);
  await esperar(`!!document.querySelector('.slr-editor--coleccion [data-vista] .slr-carta')`);
  await ev(`(() => { const i = document.querySelector('.slr-editor--coleccion [name=nombre]'); i.value = 'Siesta Plus'; i.dispatchEvent(new Event('input', { bubbles: true }));
    const s = document.querySelector('.slr-editor--coleccion [name=color]'); s.value = 'azul'; s.dispatchEvent(new Event('change', { bubbles: true })); return 0; })()`);
  await dormir(300);
  const previa = await ev(`({ nombre: document.querySelector('.slr-editor--coleccion [data-vista] .slr-carta__coleccion')?.textContent,
    azul: document.querySelector('.slr-editor--coleccion [data-vista] .slr-carta').classList.contains('slr-carta--col-azul'),
    suyas: document.querySelectorAll('[data-suyas] .slr-carta').length })`);
  check(previa.nombre === 'Siesta Plus' && previa.azul && previa.suyas === 5, `formulario: vista previa en vivo (nombre y color) y sus ${previa.suyas} cartas`);
  await foto('gestor-coleccion-editar');
  await atras(); await atras();

  console.log('\nFormulario de carta: selector de colección');
  await clic('[data-pruebas=nueva-carta]');
  await esperar(`!!document.querySelector('[data-colecciones]')`);
  const sel = await ev(`[...document.querySelectorAll('[data-colecciones] option')].map(o => o.textContent)`);
  check(sel.includes('Sin colección') && sel.includes('Siesta'), `selector: ${sel.join(', ')}`);
  await ev(`(() => { const s = document.querySelector('[data-colecciones]'); s.value = ${JSON.stringify(col.id)}; s.dispatchEvent(new Event('change', { bubbles: true }));
    const t = document.querySelector('.slr-editor [name=tier]'); t.value = 'A'; t.dispatchEvent(new Event('change', { bubbles: true })); return 0; })()`);
  await dormir(300);
  const vista = await ev(`({ epica: document.querySelector('.slr-editor [data-vista] .slr-carta').classList.contains('slr-carta--r-epica'),
    col: document.querySelector('.slr-editor [data-vista] .slr-carta__coleccion')?.textContent, texto: document.querySelector('[data-rareza]').textContent })`);
  check(vista.epica && vista.col === 'Siesta', `vista previa: tier A → marco épico, con la colección · «${vista.texto.slice(0, 40)}…»`);
  await clic('[data-nueva-coleccion]');
  check(await esperar(`document.querySelector('.slr-hoja:last-of-type .slr-hoja__titulo')?.textContent === 'Nueva colección'`), '«＋ Nueva» abre el formulario de colección encima');
  await atras(); await atras();

  console.log('\nÁlbum y catálogo');
  await clic('[data-album]');
  await esperar(`!!document.querySelector('.slr-album__colecciones')`);
  const prog = await ev(`[...document.querySelectorAll('.slr-album__colecciones button')].map(b => b.innerText.replace(/\\s+/g, ' ').trim())`);
  check(prog.some(x => /Siesta/.test(x) && /4\/5/.test(x)), `álbum: progreso por colección (${prog.join(' | ')})`);
  await ev(`[...document.querySelectorAll('.slr-album__colecciones button')].find(b => /Siesta/.test(b.textContent)).click(); 0`);
  await dormir(300);
  check(await ev(`document.querySelectorAll('.slr-album .slr-ficha').length`) === 4, 'tocar la colección filtra el álbum (4)');
  await foto('album-colecciones');
  await atras();
  await clic('[data-catalogo]');
  await esperar(`!!document.querySelector('.slr-catalogo [data-f=coleccion]')`);
  await ev(`(() => { const s = document.querySelector('.slr-catalogo [data-f=coleccion]'); s.value = ${JSON.stringify(col.id)}; s.dispatchEvent(new Event('change')); return 0; })()`);
  await dormir(300);
  check(await ev(`document.querySelectorAll('.slr-catalogo .slr-ficha').length`) === 5, 'catálogo: filtro por colección (5)');
  const cuentas = await ev(`document.querySelectorAll('.slr-catalogo__cuentas')[1].innerText.replace(/\\s+/g, ' ')`);
  check(/RAREZA/i.test(cuentas) && /Legendaria/.test(cuentas), `recuento por rareza: ${cuentas}`);
  await atras();

  console.log('\nEditor de colección: añadir (moviendo de otra) y quitar cartas');
  const otraCol = await rpcOk('slr_admin_guardar_coleccion', { token: t, liga_id: L, coleccion: { nombre: 'Otra' } });
  await rpcOk('slr_admin_editar_disenos', { token: t, liga_id: L, ids: [grupo.id], cambios: { coleccion_id: otraCol.id } });
  await clic('[data-seccion=perfil]');
  await esperar(`!!document.querySelector('[data-pruebas=colecciones]')`);
  await clic('[data-pruebas=colecciones]');
  await esperar(`[...document.querySelectorAll('.slr-colecciones button')].some(b => /Siesta/.test(b.textContent))`);
  await ev(`[...document.querySelectorAll('.slr-colecciones button')].find(b => /Siesta/.test(b.textContent)).click(); 0`);
  await esperar(`!!document.querySelector('[data-suyas]')`);
  check(await ev(`document.querySelectorAll('[data-suyas] li').length`) === 5, 'la colección lista sus 5 cartas, con «Quitar»');
  await clic('[data-anadir]');
  await esperar(`!!document.querySelector('.slr-buscador-cartas [data-texto]')`);
  await ev(`(() => { const i = document.querySelector('.slr-buscador-cartas [data-texto]'); i.value = 'cuadri'; i.dispatchEvent(new Event('input')); return 0; })()`);
  await dormir(200);
  await clic('.slr-buscador-cartas [data-diseno]');
  await dormir(200);
  const aviso = await ev(`document.querySelector('.slr-buscador-cartas [data-aviso]').textContent`);
  check(/está en otra colección: se moverá a Siesta/.test(aviso), `buscador: «${aviso}»`);
  await foto('coleccion-buscador');
  await clic('.slr-buscador-cartas [data-confirmar]');
  await esperar(`/Mover de colección/.test(document.querySelector('.slr-hoja:last-of-type .slr-hoja__titulo')?.textContent ?? '')`);
  await ev(`[...document.querySelectorAll('.slr-confirmar [data-si]')].pop().click(); 0`);
  check(await esperar(`document.querySelectorAll('[data-suyas] li').length === 6`, 10000), 'confirmado: «La Cuadrilla» pasa de «Otra» a Siesta (6)');
  check((await leer(`disenos_carta?select=coleccion_id&id=eq.${grupo.id}`)).datos[0].coleccion_id === col.id, 'y en la base de datos');
  await ev(`[...document.querySelectorAll('[data-suyas] li')].find(li => /Cuadrilla/.test(li.textContent)).querySelector('[data-quitar]').click(); 0`);
  check(await esperar(`document.querySelectorAll('[data-suyas] li').length === 5`, 10000), '«Quitar» la saca de la colección (5)');
  await foto('coleccion-cartas', '[data-bloque-cartas]');
  await atras(); await atras();

  console.log('\nEdición múltiple en el catálogo');
  await clic('[data-catalogo]');
  await esperar(`!!document.querySelector('.slr-catalogo [data-sel=entrar]')`);
  await ev(`(() => { const s = document.querySelector('.slr-catalogo [data-f=coleccion]'); s.value = ${JSON.stringify(col.id)}; s.dispatchEvent(new Event('change')); return 0; })()`);
  await dormir(300);
  const fichas = `[...document.querySelectorAll('.slr-catalogo [data-sel-id]')]`;
  const n = () => ev(`Number(document.querySelector('.slr-seleccion__n b')?.textContent ?? -1)`);
  await clic('.slr-catalogo [data-sel=entrar]');
  await ev(`${fichas}[0].click(); 0`);
  await ev(`${fichas}[2].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); 0`);
  const trasRango = await n();
  await ev(`${fichas}[4].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); 0`);
  const trasCtrl = await n();
  check(trasRango === 3 && trasCtrl === 4, `clic + Mayús+clic: rango de 3; Ctrl+clic: 4 (casillas marcadas: ${await ev(`${fichas}.filter(b => b.classList.contains('es-seleccionada')).length`)})`);
  await foto('seleccion-catalogo', '.slr-seleccion-barra');
  await clic('.slr-catalogo [data-sel=ninguna]');
  check(await n() === 0, '«Quitar selección»: 0');
  await clic('.slr-catalogo [data-sel=todas]');
  check(await n() === 5, '«Seleccionar todas las visibles»: las 5 del filtro');
  check(await ev(`!document.querySelector('.slr-detalle')`), 'en modo selección, tocar no abre el detalle');
  await clic('.slr-catalogo [data-sel=editar]');
  await esperar(`!!document.querySelector('.slr-edicion-multiple')`);
  await ev(`(() => { const s = document.querySelector('.slr-edicion-multiple [name=tier]'); s.value = 'A'; s.dispatchEvent(new Event('change', { bubbles: true }));
    const a = document.querySelector('.slr-edicion-multiple [name=acabado]'); a.value = 'plateada'; a.dispatchEvent(new Event('change', { bubbles: true })); return 0; })()`);
  await foto('edicion-multiple');
  await clic('.slr-edicion-multiple [data-revisar]');
  check(await esperar(`/Regenerar también las stats/.test(document.querySelector('.slr-hoja:last-of-type .slr-hoja__titulo')?.textContent ?? '')`), 'cambia el tier: pregunta si regenerar las stats');
  await ev(`[...document.querySelectorAll('.slr-confirmar [data-no]')].pop().click(); 0`);
  await esperar(`/Aplicar cambios/.test(document.querySelector('.slr-hoja:last-of-type .slr-hoja__titulo')?.textContent ?? '')`, 15000);
  const resumen = await ev(`[...document.querySelectorAll('.slr-confirmar__texto')].pop().innerText.replace(/\\s+/g, ' ')`);
  check(/Cambian 5 de 5/.test(resumen) && /tier/.test(resumen) && /rareza/.test(resumen) && /acabado/.test(resumen), `resumen: «${resumen.slice(0, 110)}…»`);
  await foto('edicion-multiple-resumen');
  await ev(`[...document.querySelectorAll('.slr-confirmar [data-si]')].pop().click(); 0`);
  check(await esperar(`[...document.querySelectorAll('.slr-toast')].some(t => /5 cartas editadas/.test(t.textContent))`, 15000), 'aplicado: «5 cartas editadas»');
  const tras = (await leer(`disenos_carta?select=tier,rareza,acabado&coleccion_id=eq.${col.id}`)).datos;
  check(tras.length === 5 && tras.every(d => d.tier === 'A' && d.rareza === 'epica' && d.acabado === 'plateada'), 'en la base: las 5 en tier A (épica) y plateadas');
  check(await esperar(`[...document.querySelectorAll('.slr-catalogo .slr-carta')].filter(c => c.classList.contains('slr-carta--r-epica')).length === 5`, 10000),
    'el catálogo se recarga: marco épico en las 5');
  await clic('.slr-catalogo [data-sel=salir]');
  // Pulsación larga (dedo): entra en modo selección y no levanta la carta
  await ev(`${fichas}[1].scrollIntoView({ block: 'center' }); 0`);
  await dormir(400);
  const r = await ev(`(() => { const b = ${fichas}[1].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 3 }; })()`);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
  await dormir(750);
  const levantada = await ev(`!!document.querySelector('.slr-capa-arrastre .slr-carta')`);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await dormir(300);
  check(await n() === 1 && !levantada && await ev(`!document.querySelector('.slr-detalle')`), 'pulsación larga: modo selección con esa carta, sin levantarla ni abrir el detalle');
  await clic('.slr-catalogo [data-sel=salir]');
  await atras();

  console.log('\nEdición múltiple en la herramienta de plantillas');
  await clic('[data-pruebas=plantillas]');
  await esperar(`document.querySelectorAll('.slr-plantillas__fila').length > 0`);
  await ev(`document.querySelector('.slr-plantillas__fila').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); 0`);
  check(await n() === 1 && await ev(`document.querySelector('.slr-plantillas').classList.contains('en-seleccion')`), 'Ctrl+clic en una fila: modo selección (1)');
  await foto('seleccion-plantillas', '.slr-seleccion-barra');
  await atras();

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
