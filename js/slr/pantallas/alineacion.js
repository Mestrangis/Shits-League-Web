/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — Equipo (editor de alineación)
   Arriba, una franja con el próximo rival (tocable: su ficha), la cuenta atrás
   al cierre, el último resultado y el estado de la alineación, y los avisos de
   pausa, cierre o entre temporadas.
   Campo en vertical con los huecos de la formación (5 formaciones). Se asigna
   tocando: un hueco abre una hoja con tus cartas (primero las sin colocar,
   luego las ya colocadas) ordenadas por la stat que usa ese hueco (POR y DEF
   → DEF, MED → CON, DEL → ATA), avisando si rinden mal ahí. También se puede
   arrastrar y soltar entre huecos, banquillo y "Sin colocar".
   Banquillo de 3 con orden manual opcional y capitán.
   Fuerza de cada línea en vivo con las funciones del motor; pronóstico bajo
   demanda (Edge Function) con la alineación guardada.
   Guardar = slr_guardar_alineacion; Confirmar = slr_confirmar_alineacion
   (ambos dan el bonus de participación de la próxima jornada).
═══════════════════════════════════════════════ */
import { rpc, funcion, leer as leerTabla } from '../api.js';
import { esc, hoja, cerrarCapa, conEspera, toast, hora, faltan as quedan, diaHora } from '../ui.js';
import { cartaHTML, describirPoder } from '../carta.js';
import { fuerzaPosesion, fuerzaAtaque, fuerzaDefensa, probabilidadesTirador, CONFIG } from '../motor-v1.1.0.js';
import { estaTocada, alineacionBloqueada, alineacionConfirmada, proximaJornada, pausada, configLiga, ventanaCierre, miPartido, enJuego } from '../rush.js';
import { abrirDetalle } from './detalle.js';
import { abrirEquipo } from './ficha-equipo.js';
import { abrirCronica } from './cronica.js';

const STAT  = { por: 'DEF', def: 'DEF', med: 'CON', del: 'ATA', banco: 'OVR' };
const CAMPO = { por: 'def', def: 'def', med: 'con', del: 'ata' };
const NOMBRE_LINEA = { por: 'POR', def: 'DEF', med: 'MED', del: 'DEL', banco: 'SUP' };
const MAL_RINDE = 12; // puntos por debajo de su mejor stat

let borrador = null, original = '';

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

// Las dos devuelven true si el capitán sale del once (al banquillo o fuera)
function asignar(l, i, id) {
  const capitan = borrador.capitan;
  const previa = leer(l, i), desde = posicion(id);
  if (desde) escribir(desde[0], desde[1], previa);   // intercambio
  escribir(l, i, id);
  return comprobarCapitan(capitan);
}
// Arrastre: origen { l, i } (hueco) o { id } (sin colocar); destino { l, i } o { libre: true }
function mover(origen, destino) {
  const capitan = borrador.capitan;
  if (destino.libre) {
    if (origen.l) escribir(origen.l, origen.i, null);
  } else if (origen.l) {
    const a = leer(origen.l, origen.i), b = leer(destino.l, destino.i);
    escribir(destino.l, destino.i, a);
    escribir(origen.l, origen.i, b);
  } else {
    escribir(destino.l, destino.i, origen.id);   // la que había queda sin colocar
  }
  return comprobarCapitan(capitan);
}
function comprobarCapitan(antes) {
  if (!titulares(borrador).includes(borrador.capitan)) borrador.capitan = null;
  return !!antes && !borrador.capitan;
}
const AVISO_CAPITAN = 'El capitán ha salido del once y pierde la capitanía: elige otro';

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
    <button class="slr-hueco slr-hueco--${l} ${c ? 'lleno' : ''}" type="button" data-l="${l}" data-i="${i}"
            ${c ? `data-id="${esc(id)}"` : ''} ${bloqueada ? 'disabled' : ''}>
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
  const libres = [...porId.values()].filter(c => !posicion(c.id)).sort((a, b) => b.ovr - a.ovr);

  const lg = datos.ligaInfo ?? {};
  let aviso = '';
  if (pausada()) aviso = '<div class="slr-banner slr-banner--pausa"><b>Liga en pausa</b><span>La alineación no se puede cambiar hasta que se reanude.</span></div>';
  else if (ventanaCierre()) aviso = `<div class="slr-banner slr-banner--cierre"><b>Jornada ${j.numero} en juego</b><span>Las alineaciones están cerradas hasta las ${hora(j.publicacion_en)}.</span></div>`;
  else if (lg.estado === 'entre_temporadas') aviso = `<div class="slr-banner slr-banner--info"><b>Temporada ${lg.temporada} terminada</b><span>El mercado está cerrado. La siguiente empieza cuando el administrador la inicie.</span></div>`;
  else if (lg.estado === 'preparacion') aviso = '<div class="slr-banner slr-banner--info"><b>La temporada aún no ha empezado</b><span>Ve preparando tu once: cuando el administrador la inicie, la jornada 1 será un domingo a las 20:00.</span></div>';

  let estadoTexto;
  if (esSucio) estadoTexto = '<span class="slr-estado slr-estado--sucio">● Cambios sin guardar</span>';
  else if (!j) estadoTexto = '<span class="slr-estado">✓ Guardada</span>';
  else if (confirmada) estadoTexto = `<span class="slr-estado slr-estado--ok">✓ Confirmada (J${j.numero})</span>`;
  else estadoTexto = `<span class="slr-estado slr-estado--pendiente">Sin confirmar (+${configLiga().bonus_participacion ?? 100})</span>`;

  cont.innerHTML = `
    ${franja(datos, j, estadoTexto)}
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

    <section class="slr-tarjeta slr-sincolocar" data-libres>
      <div class="slr-tarjeta__cabeza"><span>Sin colocar</span><span>${libres.length}</span></div>
      ${libres.length ? `<div class="slr-sincolocar__fila">
        ${libres.map(c => `<div class="slr-libre ${bloqueada ? 'es-bloqueada' : ''}" data-id="${esc(c.id)}">
          ${cartaHTML(c, { tam: 'xs', ancho: 70, tocada: estaTocada(c) })}</div>`).join('')}
      </div>` : '<p class="slr-suave">Todas tus cartas están en el once o en el banquillo.</p>'}
      ${bloqueada ? '' : `<p class="slr-suave">Mantén pulsada una carta (o arrástrala con el ratón) y suéltala en un hueco.
        Si está ocupado, se intercambian.</p>`}
    </section>

    <section class="slr-tarjeta">
      <div class="slr-tarjeta__cabeza"><span>Fuerza de las líneas</span><span>${borrador.capitan ? `Capitán: ${esc(porId.get(borrador.capitan).nombre)}` : 'Sin capitán'}</span></div>
      ${barraFuerza('Posesión', f.posesion, 220)}
      ${barraFuerza('Ataque', f.ataque, 220)}
      ${barraFuerza('Defensa', f.defensa, 220)}
      ${barraFuerza('Portero', f.portero, 100)}
      <button class="slr-btn slr-btn--fantasma" type="button" data-calcular>Calcular pronóstico</button>
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

/* ── Franja superior: próximo rival, cuenta atrás, último resultado, estado ── */
function franja(datos, j, estadoTexto) {
  const yo = datos.equipo.id;
  const p = miPartido(j);
  let rival = '<span class="slr-franja__rival">Sin partido programado</span>';
  if (j && !p) rival = `<span class="slr-franja__rival">Descansas en la J${j.numero}</span>`;
  else if (p) {
    const local = p.local.equipo_id === yo;
    const r = local ? p.visitante : p.local;
    rival = `<button class="slr-franja__rival slr-rival" type="button" data-equipo="${esc(r.equipo_id)}">
      <small>J${j.numero} · ${local ? 'en casa' : 'fuera'} contra</small>${esc(r.equipo)} ›</button>`;
  }
  const abierta = j && !enJuego(j) && !pausada();
  const jugadas = datos.jornadas.filter(x => x.estado === 'publicada' && miPartido(x));
  const ult = jugadas[jugadas.length - 1];
  let ultimo = '<span class="slr-suave">Aún no has jugado</span>';
  if (ult) {
    const q = miPartido(ult), local = q.local.equipo_id === yo;
    const [m, s] = local ? q.goles : [q.goles[1], q.goles[0]];
    const res = m > s ? 'V' : m < s ? 'D' : 'E';
    ultimo = `<button class="slr-franja__ultimo" type="button" data-cronica="${esc(q.id)}">
      <span class="slr-res slr-res--${res}">${res}</span> ${m}-${s} <small>vs ${esc(local ? q.visitante.equipo : q.local.equipo)}</small></button>`;
  }
  return `
    <section class="slr-franja">
      <div class="slr-franja__fila">${rival}
        ${abierta ? `<span class="slr-franja__cuenta" title="Cierre: ${esc(diaHora(j.cierre_en))}"><small>cierre en</small><b data-cuenta="${esc(j.cierre_en)}">${quedan(j.cierre_en)}</b></span>` : ''}</div>
      <div class="slr-franja__fila">${ultimo}${estadoTexto}</div>
    </section>`;
}

/* ── Pronóstico contra el rival que se elija ─────────────────────────────── */
function barraPronostico(r, nombreRival) {
  const p = [r.p_ganar, r.p_empate, r.p_perder].map(x => Math.round(x * 100));
  return `
    <div class="slr-pronostico__barra">
      <i class="slr-propio-fondo" style="width:${p[0]}%"></i><i style="width:${p[1]}%"></i><i class="slr-rival-fondo" style="width:${p[2]}%"></i>
    </div>
    <div class="slr-pronostico__cifras"><span class="slr-propio">Ganar ${p[0]} %</span><span>Empate ${p[1]} %</span><span class="slr-rival">Perder ${p[2]} %</span></div>
    <small class="slr-suave">${r.simulaciones} simulaciones contra ${esc(nombreRival)}${r.jornada ? ` (jornada ${r.jornada}, ${r.es_local ? 'en casa' : 'fuera'})` : ' (tú en casa)'}</small>`;
}

async function abrirPronostico(ctx) {
  const { datos } = ctx;
  const yo = datos.equipo.id;
  const rivales = await leerTabla(`equipos?select=id,nombre&liga_id=eq.${datos.liga.id}&id=neq.${yo}&order=nombre`);
  if (!rivales.length) { toast('Todavía no hay rivales en la liga', 'info'); return; }
  const p = miPartido(proximaJornada());
  const proximo = p ? (p.local.equipo_id === yo ? p.visitante.equipo_id : p.local.equipo_id) : null;
  const el = hoja(`
    <p class="slr-confirmar__texto">Probabilidad de ganar, empatar y perder contra este rival con tu alineación guardada.</p>
    ${sucio() ? '<div class="slr-banner slr-banner--cierre"><b>Cambios sin guardar</b><span>El pronóstico usa tu alineación guardada, no la que estás editando.</span></div>' : ''}
    <label class="slr-campo"><span>Rival</span>
      <select class="slr-input" data-rival>
        ${rivales.map(r => `<option value="${esc(r.id)}" ${r.id === proximo ? 'selected' : ''}>${esc(r.nombre)}${r.id === proximo ? ' (próximo rival)' : ''}</option>`).join('')}
      </select></label>
    <button class="slr-btn slr-btn--grande" type="button" data-calcular-ya>Calcular</button>
    <div class="slr-pronostico" data-resultado></div>`, { titulo: 'Pronóstico' });
  const sel = el.querySelector('[data-rival]'), res = el.querySelector('[data-resultado]');
  sel.addEventListener('change', () => { res.innerHTML = ''; });
  el.querySelector('[data-calcular-ya]').addEventListener('click', e => conEspera(e.currentTarget, async () => {
    const r = await funcion({ accion: 'pronostico', equipo_id: yo, rival_equipo_id: sel.value });
    res.innerHTML = barraPronostico(r, sel.selectedOptions[0].textContent.replace(' (próximo rival)', ''));
  }).catch(() => {}));
}

/* ── Hoja de selección ───────────────────────────────────────────────────── */
// Dos bloques: "Sin colocar" y "Ya colocadas" (indicando dónde están; elegir
// una de estas intercambia las posiciones), los dos por la stat del hueco
const DONDE = { por: 'POR', def: 'DEF', med: 'MED', del: 'DEL', banco: 'Banquillo' };

function filaCarta(c, l, actual) {
  const stat = STAT[l];
  const mal = rindeMal(c, l);
  const mejor = [['ATA', c.ata], ['DEF', c.def], ['CON', c.con]].sort((a, b) => b[1] - a[1])[0][0];
  const p = posicion(c.id);
  return `
    <li><button type="button" data-id="${esc(c.id)}" class="${c.id === actual ? 'es-actual' : ''}">
      ${cartaHTML(c, { tam: 'xs', ancho: 60, destacar: stat, tocada: estaTocada(c) })}
      <span class="slr-lista-cartas__texto">
        <b>${esc(c.nombre)}</b>
        <span class="slr-lista-cartas__stats">ATA ${c.ata} · DEF ${c.def} · CON ${c.con}</span>
        <small>${c.id === actual ? 'En este hueco' : p ? `Ahora en <strong>${DONDE[p[0]]}</strong>` : 'Sin colocar'}${estaTocada(c) ? ' · tocada (85 %)' : ''}</small>
        ${mal ? `<em>Rinde mal aquí: su fuerte es ${mejor}</em>` : ''}
      </span>
      <span class="slr-lista-cartas__stat ${mal ? 'es-mal' : ''}"><b>${valorEnHueco(c, l)}</b><small>${stat}</small></span>
    </button></li>`;
}

// Cabecera de la hoja cuando el hueco tiene carta: qué es y qué aporta ahí
function aporte(c, l, i, porId) {
  const ef = efectiva(c);
  const peso = CONFIG.PESO_MED_OCASION, pct = Math.round(peso * 100);
  if (l === 'por') return `<b>Paradas:</b> DEF ${ef.DEF}`;
  if (l === 'def') return `<b>Defensa:</b> DEF ${ef.DEF}`;
  if (l === 'med') {
    return `<b>Posesión:</b> CON ${ef.CON} · <b>Ataque:</b> ${pct} % ATA = ${Math.round(peso * ef.ATA)} · ` +
      `<b>Defensa:</b> ${pct} % DEF = ${Math.round(peso * ef.DEF)}`;
  }
  if (l === 'del') {
    // Probabilidad de ser el tirador con los MED y DEL que hay ahora en el campo
    const vista = { med: borrador.med.filter(Boolean).map(id => efectiva(porId.get(id))),
                    del: borrador.del.filter(Boolean).map(id => efectiva(porId.get(id))) };
    const p = probabilidadesTirador(vista).find(x => x.id === c.id)?.p ?? 0;
    return `<b>Ataque:</b> ATA ${ef.ATA} · <b>Tirador:</b> ~${Math.round(p * 100)} % de ser el elegido en cada ocasión`;
  }
  return `<b>Suplente</b> (OVR ${c.ovr}): entra si se lesiona un titular · ` +
    (borrador.orden_manual ? `es el ${i + 1}º en el orden` : 'entra el que mejor rinde en ese hueco');
}

function fichaEnHueco(c, l, i, porId) {
  const poderes = (c.poderes ?? []).map(describirPoder);
  return `
    <div class="slr-ficha-hueco">
      <div class="slr-ficha-hueco__carta">${cartaHTML(c, { tam: 's', ancho: 110, destacar: STAT[l], capitan: borrador.capitan === c.id, tocada: estaTocada(c) })}</div>
      <div class="slr-ficha-hueco__datos">
        <b class="slr-ficha-hueco__nombre">${esc(c.nombre)}</b>
        <div class="slr-ficha-hueco__stats">
          <span><small>OVR</small><b>${c.ovr}</b></span>
          <span><small>ATA</small><b>${c.ata}</b></span><span><small>DEF</small><b>${c.def}</b></span><span><small>CON</small><b>${c.con}</b></span>
        </div>
        ${estaTocada(c) ? '<p class="slr-ficha-hueco__tocada">Tocada: juega al 85 % la próxima jornada</p>' : ''}
      </div>
    </div>
    <p class="slr-ficha-hueco__aporte"><span>En ${DONDE[l]}</span> ${aporte(c, l, i, porId)}${borrador.capitan === c.id ? ' · ★ capitán: sus poderes saltan ×1,5' : ''}</p>
    ${poderes.length ? `<ul class="slr-ficha-hueco__poderes">${poderes.map(p => `
      <li><b>${esc(p.nombre)}</b> · ${esc(p.momento)}: ${esc(p.efecto)}. <small>${esc(p.probabilidad)}</small></li>`).join('')}</ul>`
      : '<p class="slr-suave">Sin poderes.</p>'}`;
}

// Lo que aportaría una carta en cada puesto (para las cartas sin colocar)
function aportesTodos(c, porId) {
  return ['por', 'def', 'med', 'del'].map(l => {
    // En DEL, la probabilidad de tirar se calcula como si entrara en la delantera actual
    const copia = l === 'del' ? { ...borrador, del: [...borrador.del.filter(Boolean), c.id] } : borrador;
    const guardado = borrador;
    borrador = copia;
    const txt = aporte(c, l, 0, new Map([...porId, [c.id, c]]));
    borrador = guardado;
    return `<li><span class="slr-ficha-hueco__puesto">${DONDE[l]}</span> ${txt}${rindeMal(c, l) ? ' <em>· rinde mal aquí</em>' : ''}</li>`;
  }).join('');
}

function fichaLibre(id, cont, ctx, porId) {
  const c = porId.get(id);
  const bloqueada = alineacionBloqueada();
  const poderes = (c.poderes ?? []).map(describirPoder);
  const huecos = [['por', 0], ...['def', 'med', 'del'].flatMap(l => borrador[l].map((_, i) => [l, i])), ...borrador.banco.map((_, i) => ['banco', i])];
  const el = hoja(`
    <div class="slr-ficha-hueco">
      <div class="slr-ficha-hueco__carta">${cartaHTML(c, { tam: 's', tocada: estaTocada(c) })}</div>
      <div class="slr-ficha-hueco__datos">
        <b class="slr-ficha-hueco__nombre">${esc(c.nombre)}</b>
        <div class="slr-ficha-hueco__stats">
          <span><small>OVR</small><b>${c.ovr}</b></span>
          <span><small>ATA</small><b>${c.ata}</b></span><span><small>DEF</small><b>${c.def}</b></span><span><small>CON</small><b>${c.con}</b></span>
        </div>
        ${estaTocada(c) ? '<p class="slr-ficha-hueco__tocada">Tocada: juega al 85 % la próxima jornada</p>' : ''}
      </div>
    </div>
    <h3 class="slr-subtitulo">Qué aportaría en cada puesto</h3>
    <ul class="slr-ficha-hueco__puestos">${aportesTodos(c, porId)}</ul>
    ${poderes.length ? `<ul class="slr-ficha-hueco__poderes">${poderes.map(p => `
      <li><b>${esc(p.nombre)}</b> · ${esc(p.momento)}: ${esc(p.efecto)}. <small>${esc(p.probabilidad)}</small></li>`).join('')}</ul>`
      : '<p class="slr-suave">Sin poderes.</p>'}
    <div class="slr-botones">
      ${bloqueada ? '' : '<button class="slr-btn" type="button" data-colocar>Colocar en…</button>'}
      <button class="slr-btn slr-btn--fantasma" type="button" data-ver>Ver carta</button>
    </div>
    <ul class="slr-lista-cartas slr-colocar" data-huecos hidden>
      ${huecos.map(([l, i]) => {
        const actual = leer(l, i), occ = actual && porId.get(actual), mal = rindeMal(c, l);
        return `<li><button type="button" data-l="${l}" data-i="${i}">
          <span class="slr-lista-cartas__texto"><b>${DONDE[l]}${l === 'banco' ? ` ${i + 1}` : ''}</b>
            <small>${occ ? `Ahora: ${esc(occ.nombre)} (se intercambian)` : 'Vacío'}</small>
            ${mal ? `<em>Rinde mal aquí</em>` : ''}</span>
          <span class="slr-lista-cartas__stat ${mal ? 'es-mal' : ''}"><b>${valorEnHueco(c, l)}</b><small>${STAT[l]}</small></span>
        </button></li>`;
      }).join('')}
    </ul>`, { titulo: c.nombre, alCerrar: () => pintarTodo(cont, ctx) });
  el.querySelector('[data-colocar]')?.addEventListener('click', () => { el.querySelector('[data-huecos]').hidden = false; });
  el.querySelectorAll('[data-huecos] [data-l]').forEach(b => b.addEventListener('click', () => {
    const perdido = asignar(b.dataset.l, Number(b.dataset.i), id);
    cerrarCapa();
    if (perdido) toast(AVISO_CAPITAN, 'info');
  }));
  el.querySelector('[data-ver]').addEventListener('click', () => { cerrarCapa(); setTimeout(() => abrirDetalle(id, ctx), 300); });
}

function elegir(l, i, cont, ctx, porId) {
  const actual = leer(l, i);
  const stat = STAT[l];
  const orden = (a, b) => valorEnHueco(b, l) - valorEnHueco(a, l) || b.ovr - a.ovr;
  const todas = [...porId.values()];
  const sinColocar = todas.filter(c => !posicion(c.id)).sort(orden);
  const colocadas = todas.filter(c => posicion(c.id)).sort(orden);
  const titular = l !== 'banco';
  const bloque = (titulo, lista, vacio) => `
    <h3 class="slr-subtitulo slr-lista-cartas__titulo">${titulo} <small>${lista.length}</small></h3>
    ${lista.length ? `<ul class="slr-lista-cartas">${lista.map(c => filaCarta(c, l, actual)).join('')}</ul>`
      : `<p class="slr-suave">${vacio}</p>`}`;
  let avisoCapitan = false;

  const el = hoja(`
    ${actual ? fichaEnHueco(porId.get(actual), l, i, porId) : ''}
    ${actual ? `<div class="slr-botones">
      ${titular ? `<button class="slr-btn ${borrador.capitan === actual ? '' : 'slr-btn--fantasma'}" type="button" data-capitan>
        ${borrador.capitan === actual ? '★ Es el capitán' : '★ Hacer capitán'}</button>` : ''}
      <button class="slr-btn slr-btn--fantasma" type="button" data-quitar>Quitar del hueco</button>
      <button class="slr-btn slr-btn--fantasma" type="button" data-ver>Ver carta</button>
    </div>` : ''}
    <p class="slr-suave">${titular ? `En este hueco cuenta su <b>${stat}</b>${l === 'por' ? ' (el portero para con la DEF)' : ''}.` : 'Ordenadas por OVR.'}</p>
    ${bloque('Sin colocar', sinColocar, 'Todas tus cartas están colocadas.')}
    ${bloque('Ya colocadas', colocadas, 'Ninguna carta colocada todavía.')}`,
  { titulo: `Hueco ${NOMBRE_LINEA[l]}`, alCerrar: () => { pintarTodo(cont, ctx); if (avisoCapitan) toast(AVISO_CAPITAN, 'info'); } });

  el.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => {
    avisoCapitan = asignar(l, i, b.dataset.id);
    cerrarCapa();
  }));
  el.querySelector('[data-quitar]')?.addEventListener('click', () => {
    escribir(l, i, null);
    if (borrador.capitan === actual) borrador.capitan = null;
    cerrarCapa();
  });
  el.querySelector('[data-capitan]')?.addEventListener('click', () => { borrador.capitan = actual; cerrarCapa(); });
  el.querySelector('[data-ver]')?.addEventListener('click', () => { cerrarCapa(); setTimeout(() => abrirDetalle(actual, ctx), 300); });
}

/* ── Arrastrar y soltar ──────────────────────────────────────────────────── */
// Pointer events con setPointerCapture, sin librerías.
//  · Ratón: se levanta la carta al moverla más de 5 px con el botón pulsado.
//  · Táctil: mantener pulsado ~250 ms; si el dedo se mueve antes, es scroll.
//    Durante el arrastre un touchmove no pasivo bloquea el scroll de la página.
//  · Un toque o clic corto sigue abriendo la hoja de siempre.
// Se puede soltar en cualquier hueco (ocupado = intercambio; vacío = se mueve)
// o en "Sin colocar" (sale de la alineación).
const PULSACION_MS = 250, UMBRAL_RATON = 5, UMBRAL_DEDO = 8;
const BORDE_SCROLL = 70, VELOCIDAD_SCROLL = 14;
let ultimoArrastre = 0;
const acabaDeArrastrar = () => Date.now() - ultimoArrastre < 350;

function activarArrastre(cont, ctx, porId) {
  // La raíz de Rush y el contenedor con scroll se buscan al levantar la carta:
  // al activar el arrastre la pantalla todavía no está en el documento
  let raiz = null, main = null;
  let a = null;   // arrastre en curso

  const origenDe = el => el.classList.contains('slr-hueco')
    ? { l: el.dataset.l, i: Number(el.dataset.i), id: el.dataset.id }
    : { id: el.dataset.id };

  function levantar() {
    raiz = cont.closest('.slr') ?? document.body;
    main = cont.closest('.slr-main');
    a.activo = true;
    clearTimeout(a.temporizador);
    const carta = a.el.querySelector('.slr-carta');
    const r = carta.getBoundingClientRect();
    // La carta no tapa el destino: con el dedo flota por encima de él; con el
    // ratón va abajo a la derecha del cursor, como el arrastre del sistema
    if (a.tipo === 'mouse') { a.dx = -14; a.dy = -14; }
    else { a.dx = r.width / 2; a.dy = r.height + 28; }
    a.fantasma = carta.cloneNode(true);
    a.fantasma.classList.add('slr-fantasma');
    a.fantasma.classList.remove('is-activa');
    a.fantasma.style.width = `${r.width}px`;
    raiz.appendChild(a.fantasma);
    a.el.classList.add('es-origen');
    raiz.classList.add('slr-arrastrando');
    try { a.el.setPointerCapture(a.pointerId); } catch { /* el puntero ya no existe */ }
    navigator.vibrate?.(12);
    colocar();
  }

  function colocar() {
    if (!a?.fantasma) return;
    a.fantasma.style.transform = `translate3d(${a.x - a.dx}px, ${a.y - a.dy}px, 0) rotate(-4deg) scale(${a.tipo === 'mouse' ? 0.9 : 1.05})`;
    // Destino bajo el dedo (el fantasma no recibe eventos: pointer-events none)
    const bajo = document.elementFromPoint(a.x, a.y);
    const destino = bajo?.closest('.slr-hueco, [data-libres]');
    const valido = destino && cont.contains(destino) && destino !== a.el;
    marcarDestino(valido ? destino : null);
  }

  function marcarDestino(d) {
    if (d === a.destino) return;
    a.destino?.classList.remove('es-destino');
    a.destino?.querySelector('.slr-hueco__previsto')?.remove();
    a.destino = d;
    if (!d) return;
    d.classList.add('es-destino');
    if (d.classList.contains('slr-hueco')) {
      // La stat que tendría la carta en ese hueco
      const c = porId.get(a.origen.id), l = d.dataset.l;
      const mal = rindeMal(c, l);
      d.insertAdjacentHTML('beforeend',
        `<span class="slr-hueco__previsto ${mal ? 'es-mal' : ''}">${STAT[l]} ${valorEnHueco(c, l)}${mal ? ' · rinde mal' : ''}</span>`);
    }
  }

  // Desplazamiento automático al llevar la carta al borde de la pantalla
  function desplazar() {
    if (!a?.activo || !main) return;
    const r = main.getBoundingClientRect();
    let v = 0;
    if (a.y < r.top + BORDE_SCROLL) v = -VELOCIDAD_SCROLL * (1 - (a.y - r.top) / BORDE_SCROLL);
    else if (a.y > r.bottom - BORDE_SCROLL) v = VELOCIDAD_SCROLL * (1 - (r.bottom - a.y) / BORDE_SCROLL);
    if (v) { main.scrollTop += v; colocar(); }
    a.scroll = requestAnimationFrame(desplazar);
  }

  function terminar(soltar) {
    if (!a) return;
    const { activo, destino, origen } = a;
    clearTimeout(a.temporizador);
    cancelAnimationFrame(a.scroll);
    a.fantasma?.remove();
    a.el.classList.remove('es-origen');
    destino?.classList.remove('es-destino');
    destino?.querySelector('.slr-hueco__previsto')?.remove();
    raiz?.classList.remove('slr-arrastrando');
    document.removeEventListener('touchmove', bloquearScroll);
    window.removeEventListener('popstate', cancelar);
    a = null;
    if (!activo) return;
    ultimoArrastre = Date.now();
    if (!soltar || !destino) return;
    const capitanPerdido = destino.hasAttribute('data-libres')
      ? mover(origen, { libre: true })
      : mover(origen, { l: destino.dataset.l, i: Number(destino.dataset.i) });
    if (capitanPerdido) toast(AVISO_CAPITAN, 'info');
    pintarTodo(cont, ctx);   // las fuerzas de línea se recalculan al soltar
  }
  const cancelar = () => terminar(false);
  function bloquearScroll(e) { if (a?.activo) e.preventDefault(); }

  cont.addEventListener('pointerdown', e => {
    const el = e.target.closest('.slr-hueco.lleno, .slr-libre');
    if (!el || el.disabled || e.button > 0 || a) return;
    a = { el, origen: origenDe(el), pointerId: e.pointerId, tipo: e.pointerType,
          x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, activo: false };
    // Antes de que empiece el scroll: así se puede cancelar desde el primer touchmove
    document.addEventListener('touchmove', bloquearScroll, { passive: false });
    window.addEventListener('popstate', cancelar);   // el botón atrás cancela el arrastre
    if (e.pointerType !== 'mouse') a.temporizador = setTimeout(() => { if (a && !a.activo) { levantar(); desplazar(); } }, PULSACION_MS);
  });

  cont.addEventListener('pointermove', e => {
    if (!a || e.pointerId !== a.pointerId) return;
    a.x = e.clientX;
    a.y = e.clientY;
    if (!a.activo) {
      const d = Math.hypot(a.x - a.x0, a.y - a.y0);
      if (a.tipo === 'mouse' && d > UMBRAL_RATON) { levantar(); desplazar(); }
      else if (a.tipo !== 'mouse' && d > UMBRAL_DEDO) terminar(false);   // era un scroll
      return;
    }
    if (!a.pendiente) {
      a.pendiente = true;
      requestAnimationFrame(() => { if (a) { a.pendiente = false; colocar(); } });
    }
  });
  cont.addEventListener('pointerup', e => { if (a && e.pointerId === a.pointerId) terminar(true); });
  cont.addEventListener('pointercancel', e => { if (a && e.pointerId === a.pointerId) terminar(false); });
  cont.addEventListener('keydown', e => { if (e.key === 'Escape') cancelar(); });
  // Sin menú contextual ni selección al mantener pulsado
  cont.addEventListener('contextmenu', e => { if (e.target.closest('.slr-hueco, .slr-libre')) e.preventDefault(); });
}

/* ── Eventos ─────────────────────────────────────────────────────────────── */
function enlazar(cont, ctx, porId, bloqueada) {
  const { datos } = ctx;
  const repintar = () => pintarTodo(cont, ctx);

  cont.querySelectorAll('[data-formacion]').forEach(b => b.addEventListener('click', () => { cambiarFormacion(b.dataset.formacion); repintar(); }));
  cont.querySelectorAll('.slr-hueco').forEach(b => b.addEventListener('click', () => {
    if (acabaDeArrastrar()) return;   // el clic que llega al soltar un arrastre
    elegir(b.dataset.l, Number(b.dataset.i), cont, ctx, porId);
  }));
  cont.querySelectorAll('.slr-libre').forEach(b => b.addEventListener('click', () => {
    if (!acabaDeArrastrar()) fichaLibre(b.dataset.id, cont, ctx, porId);
  }));
  cont.querySelectorAll('[data-equipo]').forEach(b => b.addEventListener('click', () => abrirEquipo(b.dataset.equipo, ctx)));
  cont.querySelectorAll('[data-cronica]').forEach(b => b.addEventListener('click', () => abrirCronica(b.dataset.cronica, ctx).catch(() => {})));
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

  cont.querySelector('[data-calcular]')?.addEventListener('click', () => abrirPronostico(ctx));
}

function reiniciar(datos) {
  borrador = desdeGuardada(datos.alineacion, new Set(datos.cartas.map(c => c.id)));
  original = firma(borrador);
}

let reloj = null;
export async function pintar(cont, ctx) {
  // Cuenta atrás viva mientras la pantalla esté montada
  clearInterval(reloj);
  reloj = setInterval(() => {
    const el = cont.querySelector('[data-cuenta]');
    if (!cont.isConnected) { clearInterval(reloj); return; }
    if (el) el.textContent = quedan(el.dataset.cuenta);
  }, 30000);
  // Siempre desde lo guardado al entrar (lo que había sin guardar se descarta)
  reiniciar(ctx.datos);
  pintarTodo(cont, ctx);
  // Los listeners del arrastre van en el contenedor, que no se sustituye al repintar
  if (!alineacionBloqueada()) activarArrastre(cont, ctx, new Map(ctx.datos.cartas.map(c => [c.id, c])));
}
