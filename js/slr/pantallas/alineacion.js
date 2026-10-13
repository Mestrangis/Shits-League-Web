/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — Alineación
   Campo en vertical con los huecos de la formación (5 formaciones). Se asigna
   tocando: un hueco abre una hoja con tus cartas ordenadas por la stat que
   usa ese hueco (POR y DEF → DEF, MED → CON, DEL → ATA), avisando si rinden
   mal ahí. Banquillo de 3 con orden manual opcional y capitán.
   Fuerza de cada línea en vivo con las funciones del motor; pronóstico bajo
   demanda (Edge Function) con la alineación guardada.
   Guardar = slr_guardar_alineacion; Confirmar = slr_confirmar_alineacion
   (ambos dan el bonus de participación de la próxima jornada).
═══════════════════════════════════════════════ */
import { rpc, funcion } from '../api.js';
import { esc, hoja, cerrarCapa, conEspera, toast, hora } from '../ui.js';
import { cartaHTML } from '../carta.js';
import { fuerzaPosesion, fuerzaAtaque, fuerzaDefensa, CONFIG } from '../motor-v1.1.0.js';
import { estaTocada, alineacionBloqueada, alineacionConfirmada, proximaJornada, pausada, configLiga, ventanaCierre } from '../rush.js';

const STAT  = { por: 'DEF', def: 'DEF', med: 'CON', del: 'ATA', banco: 'OVR' };
const CAMPO = { por: 'def', def: 'def', med: 'con', del: 'ata' };
const NOMBRE_LINEA = { por: 'POR', def: 'DEF', med: 'MED', del: 'DEL', banco: 'SUP' };
const MAL_RINDE = 12; // puntos por debajo de su mejor stat

let borrador = null, original = '', pronostico = null;

/* ── Borrador ────────────────────────────────────────────────────────────── */
function desdeGuardada(al, mias) {
  const ok = id => (id && mias.has(id) ? id : null);
  const [nd, nm, nl] = (al?.formacion ?? '2-2-2').split('-').map(Number);
  const linea = (lista, n) => Array.from({ length: n }, (_, i) => ok(lista?.[i]));
  const b = {
    formacion: al?.formacion ?? '2-2-2',
    por: ok(al?.huecos?.por),
    def: linea(al?.huecos?.def, nd),
    med: linea(al?.huecos?.med, nm),
    del: linea(al?.huecos?.del, nl),
    banco: linea(al?.banquillo, 3),
    orden_manual: !!al?.orden_manual,
    capitan: ok(al?.capitan_id),
  };
  if (!titulares(b).includes(b.capitan)) b.capitan = null;
  return b;
}
const titulares = b => [b.por, ...b.def, ...b.med, ...b.del];
const firma = b => JSON.stringify(b);
const sucio = () => firma(borrador) !== original;

function cambiarFormacion(f) {
  const n = f.split('-').map(Number);
  ['def', 'med', 'del'].forEach((l, i) => {
    const actuales = borrador[l].filter(Boolean);
    borrador[l] = Array.from({ length: n[i] }, (_, k) => actuales[k] ?? null);
  });
  borrador.formacion = f;
  if (!titulares(borrador).includes(borrador.capitan)) borrador.capitan = null;
}

// Dónde está una carta en el borrador: ['def', 1] o null
function posicion(id) {
  if (borrador.por === id) return ['por', 0];
  for (const l of ['def', 'med', 'del', 'banco']) {
    const i = borrador[l].indexOf(id);
    if (i >= 0) return [l, i];
  }
  return null;
}
const leer = (l, i) => (l === 'por' ? borrador.por : borrador[l][i]);
function escribir(l, i, id) { if (l === 'por') borrador.por = id; else borrador[l][i] = id; }

function asignar(l, i, id) {
  const previa = leer(l, i), desde = posicion(id);
  if (desde) escribir(desde[0], desde[1], previa);   // intercambio
  escribir(l, i, id);
  if (!titulares(borrador).includes(borrador.capitan)) borrador.capitan = null;
}

/* ── Stats efectivas y fuerzas ───────────────────────────────────────────── */
const factorTocada = () => configLiga().lesion_tocada_factor ?? 0.85;
function efectiva(c) {
  const f = estaTocada(c) ? factorTocada() : 1;
  return { id: c.id, ATA: Math.round(c.ata * f), DEF: Math.round(c.def * f), CON: Math.round(c.con * f) };
}
function valorEnHueco(c, l) {
  if (l === 'banco') return c.ovr;
  return efectiva(c)[STAT[l]];
}
function rindeMal(c, l) {
  if (l === 'banco') return false;
  return Math.max(c.ata, c.def, c.con) - c[CAMPO[l]] >= MAL_RINDE;
}

function fuerzas(porId) {
  const eq = { def: [], med: [], del: [] };
  for (const l of ['def', 'med', 'del']) eq[l] = borrador[l].filter(Boolean).map(id => efectiva(porId.get(id)));
  return {
    posesion: fuerzaPosesion(eq),
    ataque: fuerzaAtaque(eq),
    defensa: fuerzaDefensa(eq),
    portero: borrador.por ? efectiva(porId.get(borrador.por)).DEF : 0,
  };
}

/* ── Pintado ─────────────────────────────────────────────────────────────── */
function hueco(l, i, porId, bloqueada) {
  const id = leer(l, i), c = id && porId.get(id);
  const capitan = c && borrador.capitan === id;
  return `
    <button class="slr-hueco slr-hueco--${l} ${c ? 'lleno' : ''}" type="button" data-l="${l}" data-i="${i}" ${bloqueada ? 'disabled' : ''}>
      ${c ? `${cartaHTML(c, { tam: 'xs', ancho: 80, destacar: STAT[l], capitan, tocada: estaTocada(c) })}
             ${rindeMal(c, l) ? '<span class="slr-hueco__aviso" title="Rinde mal aquí">!</span>' : ''}`
          : `<span class="slr-hueco__vacio">+</span>`}
      <span class="slr-hueco__etiqueta">${NOMBRE_LINEA[l]}${c && l !== 'banco' ? ` · ${valorEnHueco(c, l)}` : ''}</span>
    </button>`;
}

function barraFuerza(nombre, valor, maximo) {
  return `<div class="slr-fuerza"><span>${nombre}</span><div><i style="width:${Math.min(100, (valor / maximo) * 100).toFixed(1)}%"></i></div><b>${Math.round(valor)}</b></div>`;
}

function pintarTodo(cont, ctx) {
  const { datos } = ctx;
  const porId = new Map(datos.cartas.map(c => [c.id, c]));
  const bloqueada = alineacionBloqueada();
  const j = proximaJornada();
  const f = fuerzas(porId);
  const esSucio = sucio();
  const confirmada = alineacionConfirmada();
  const faltan = titulares(borrador).filter(x => !x).length;

  let aviso = '';
  if (pausada()) aviso = '<div class="slr-banner slr-banner--pausa"><b>Liga en pausa</b><span>La alineación no se puede cambiar hasta que se reanude.</span></div>';
  else if (ventanaCierre()) aviso = `<div class="slr-banner slr-banner--cierre"><b>Jornada ${j.numero} en juego</b><span>Las alineaciones están cerradas hasta las ${hora(j.publicacion_en)}.</span></div>`;

  let estadoTexto;
  if (esSucio) estadoTexto = '<span class="slr-estado slr-estado--sucio">● Cambios sin guardar</span>';
  else if (!j) estadoTexto = '<span class="slr-estado">Guardada</span>';
  else if (confirmada) estadoTexto = `<span class="slr-estado slr-estado--ok">✓ Confirmada para la jornada ${j.numero}</span>`;
  else estadoTexto = `<span class="slr-estado slr-estado--pendiente">Sin confirmar para la jornada ${j.numero} (+${configLiga().bonus_participacion ?? 100})</span>`;

  cont.innerHTML = `
    <header class="slr-cabecera">
      <h1 class="slr-titulo">Alineación</h1>
      ${estadoTexto}
    </header>
    ${aviso}
    <div class="slr-segmentos slr-formaciones" role="group" aria-label="Formación">
      ${CONFIG.FORMACIONES.map(x => `<button type="button" data-formacion="${x}" class="${x === borrador.formacion ? 'activo' : ''}" ${bloqueada ? 'disabled' : ''}>${x}</button>`).join('')}
    </div>

    <div class="slr-campo-juego">
      <div class="slr-campo-juego__lineas" aria-hidden="true"></div>
      ${['del', 'med', 'def'].map(l => `<div class="slr-fila">${borrador[l].map((_, i) => hueco(l, i, porId, bloqueada)).join('')}</div>`).join('')}
      <div class="slr-fila">${hueco('por', 0, porId, bloqueada)}</div>
    </div>

    <section class="slr-tarjeta slr-banquillo">
      <div class="slr-tarjeta__cabeza"><span>Banquillo</span>
        <label class="slr-interruptor"><input type="checkbox" data-manual ${borrador.orden_manual ? 'checked' : ''} ${bloqueada ? 'disabled' : ''}>
          <span>Orden manual</span></label></div>
      <div class="slr-fila slr-fila--banco">
        ${borrador.banco.map((_, i) => `<div class="slr-banco-hueco">
          ${borrador.orden_manual ? `<span class="slr-banco-hueco__n">${i + 1}º</span>` : ''}
          ${hueco('banco', i, porId, bloqueada)}
          ${borrador.orden_manual && !bloqueada ? `<span class="slr-orden">
            <button type="button" data-subir="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">‹</button>
            <button type="button" data-bajar="${i}" ${i === 2 ? 'disabled' : ''} aria-label="Bajar">›</button></span>` : ''}
        </div>`).join('')}
      </div>
      <p class="slr-suave">${borrador.orden_manual
        ? 'Si hay una lesión entra el primer suplente libre en este orden.'
        : 'Si hay una lesión entra el suplente que mejor rinde en ese hueco.'}</p>
    </section>

    <section class="slr-tarjeta">
      <div class="slr-tarjeta__cabeza"><span>Fuerza de las líneas</span><span>${borrador.capitan ? `Capitán: ${esc(porId.get(borrador.capitan).nombre)}` : 'Sin capitán'}</span></div>
      ${barraFuerza('Posesión', f.posesion, 220)}
      ${barraFuerza('Ataque', f.ataque, 220)}
      ${barraFuerza('Defensa', f.defensa, 220)}
      ${barraFuerza('Portero', f.portero, 100)}
      <div class="slr-pronostico" data-pronostico>${pintarPronostico()}</div>
      <button class="slr-btn slr-btn--fantasma" type="button" data-calcular ${esSucio || !j ? 'disabled' : ''}>Calcular pronóstico</button>
      ${esSucio ? '<p class="slr-suave">El pronóstico usa la alineación guardada: guarda antes de calcularlo.</p>' : ''}
    </section>

    <div class="slr-acciones-fijas">
      ${esSucio
        ? `<button class="slr-btn slr-btn--grande" type="button" data-guardar ${bloqueada ? 'disabled' : ''}>Guardar${faltan ? ` (faltan ${faltan})` : ''}</button>
           <button class="slr-btn slr-btn--fantasma" type="button" data-deshacer>Deshacer</button>`
        : `<button class="slr-btn slr-btn--grande" type="button" data-confirmar ${bloqueada || confirmada || !j ? 'disabled' : ''}>
             ${confirmada ? '✓ Confirmada' : 'Confirmar alineación'}</button>`}
    </div>`;

  enlazar(cont, ctx, porId, bloqueada);
}

function pintarPronostico() {
  if (!pronostico) return '';
  if (pronostico.sin_partido) return '<p class="slr-suave">No tienes partido en la próxima jornada.</p>';
  const p = [pronostico.p_ganar, pronostico.p_empate, pronostico.p_perder].map(x => Math.round(x * 100));
  return `
    <div class="slr-pronostico__barra">
      <i class="slr-propio-fondo" style="width:${p[0]}%"></i><i style="width:${p[1]}%"></i><i class="slr-rival-fondo" style="width:${p[2]}%"></i>
    </div>
    <div class="slr-pronostico__cifras"><span class="slr-propio">Ganar ${p[0]} %</span><span>Empate ${p[1]} %</span><span class="slr-rival">Perder ${p[2]} %</span></div>
    <small class="slr-suave">${pronostico.simulaciones} simulaciones contra tu próximo rival</small>`;
}

/* ── Hoja de selección ───────────────────────────────────────────────────── */
function elegir(l, i, cont, ctx, porId) {
  const actual = leer(l, i);
  const stat = STAT[l];
  const cartas = [...porId.values()].sort((a, b) => valorEnHueco(b, l) - valorEnHueco(a, l) || b.ovr - a.ovr);
  const donde = id => { const p = posicion(id); return p ? `${NOMBRE_LINEA[p[0]]}` : ''; };
  const titular = l !== 'banco';

  const el = hoja(`
    ${actual ? `<div class="slr-botones">
      ${titular ? `<button class="slr-btn ${borrador.capitan === actual ? '' : 'slr-btn--fantasma'}" type="button" data-capitan>
        ${borrador.capitan === actual ? '★ Es el capitán' : '★ Hacer capitán'}</button>` : ''}
      <button class="slr-btn slr-btn--fantasma" type="button" data-quitar>Quitar del hueco</button>
    </div>` : ''}
    <p class="slr-suave">${titular ? `En este hueco cuenta su <b>${stat}</b>${l === 'por' ? ' (el portero para con la DEF)' : ''}.` : 'Ordenadas por OVR.'}</p>
    <ul class="slr-lista-cartas">
      ${cartas.map(c => {
        const mal = rindeMal(c, l);
        const mejor = [['ATA', c.ata], ['DEF', c.def], ['CON', c.con]].sort((a, b) => b[1] - a[1])[0][0];
        return `
        <li><button type="button" data-id="${esc(c.id)}" class="${c.id === actual ? 'es-actual' : ''}">
          ${cartaHTML(c, { tam: 'xs', ancho: 60, destacar: stat, tocada: estaTocada(c) })}
          <span class="slr-lista-cartas__texto">
            <b>${esc(c.nombre)}</b>
            <small>${donde(c.id) ? `Ahora en ${donde(c.id)}` : 'Sin colocar'}${estaTocada(c) ? ' · tocada (85 %)' : ''}</small>
            ${mal ? `<em>Rinde mal aquí: su fuerte es ${mejor}</em>` : ''}
          </span>
          <span class="slr-lista-cartas__stat ${mal ? 'es-mal' : ''}"><b>${valorEnHueco(c, l)}</b><small>${stat}</small></span>
        </button></li>`;
      }).join('')}
    </ul>`, { titulo: `Hueco ${NOMBRE_LINEA[l]}`, alCerrar: () => pintarTodo(cont, ctx) });

  el.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => { asignar(l, i, b.dataset.id); cerrarCapa(); }));
  el.querySelector('[data-quitar]')?.addEventListener('click', () => {
    escribir(l, i, null);
    if (borrador.capitan === actual) borrador.capitan = null;
    cerrarCapa();
  });
  el.querySelector('[data-capitan]')?.addEventListener('click', () => { borrador.capitan = actual; cerrarCapa(); });
}

/* ── Eventos ─────────────────────────────────────────────────────────────── */
function enlazar(cont, ctx, porId, bloqueada) {
  const { datos } = ctx;
  const repintar = () => pintarTodo(cont, ctx);

  cont.querySelectorAll('[data-formacion]').forEach(b => b.addEventListener('click', () => { cambiarFormacion(b.dataset.formacion); repintar(); }));
  cont.querySelectorAll('.slr-hueco').forEach(b => b.addEventListener('click', () => elegir(b.dataset.l, Number(b.dataset.i), cont, ctx, porId)));
  cont.querySelector('[data-manual]')?.addEventListener('change', e => { borrador.orden_manual = e.target.checked; repintar(); });
  cont.querySelectorAll('[data-subir],[data-bajar]').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.dataset.subir ?? b.dataset.bajar), k = b.dataset.subir != null ? i - 1 : i + 1;
    [borrador.banco[i], borrador.banco[k]] = [borrador.banco[k], borrador.banco[i]];
    repintar();
  }));
  cont.querySelector('[data-deshacer]')?.addEventListener('click', () => { borrador = JSON.parse(original); repintar(); });

  cont.querySelector('[data-guardar]')?.addEventListener('click', e => {
    if (titulares(borrador).some(x => !x)) { toast('Rellena todos los huecos del once antes de guardar', 'error'); return; }
    if (!borrador.capitan) { toast('Elige un capitán: toca un titular y márcalo', 'error'); return; }
    conEspera(e.currentTarget, async () => {
      await rpc('slr_guardar_alineacion', {
        equipo_id: datos.equipo.id,
        formacion: borrador.formacion,
        huecos: { por: borrador.por, def: borrador.def, med: borrador.med, del: borrador.del },
        banquillo: borrador.banco.filter(Boolean),
        orden_manual: borrador.orden_manual,
        capitan_id: borrador.capitan,
      });
      await ctx.recargar('alineacion');
      pronostico = null;
      reiniciar(datos);
      toast(proximaJornada() ? `Alineación guardada y confirmada para la jornada ${proximaJornada().numero}` : 'Alineación guardada', 'ok');
      repintar();
    }).catch(() => {});
  });

  cont.querySelector('[data-confirmar]')?.addEventListener('click', e => conEspera(e.currentTarget, async () => {
    await rpc('slr_confirmar_alineacion', { equipo_id: datos.equipo.id });
    await ctx.recargar('alineacion');
    reiniciar(datos);
    toast('Alineación confirmada: cobrarás el bonus de participación', 'ok');
    repintar();
  }).catch(() => {}));

  cont.querySelector('[data-calcular]')?.addEventListener('click', e => conEspera(e.currentTarget, async () => {
    pronostico = await funcion({ accion: 'pronostico', equipo_id: datos.equipo.id });
    cont.querySelector('[data-pronostico]').innerHTML = pintarPronostico();
  }).catch(() => {}));
}

function reiniciar(datos) {
  borrador = desdeGuardada(datos.alineacion, new Set(datos.cartas.map(c => c.id)));
  original = firma(borrador);
}

export async function pintar(cont, ctx) {
  // Siempre desde lo guardado al entrar (lo que había sin guardar se descarta)
  reiniciar(ctx.datos);
  pronostico = null;
  pintarTodo(cont, ctx);
}
