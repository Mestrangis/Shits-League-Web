/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — pantalla del partido (estadísticas y crónica)
   Se abre al terminar la reproducción (o con «Saltar»), al entrar a un partido
   ya visto y en los partidos de los demás. Mientras no hayas visto TU partido,
   no se abre sin pasar por la reproducción (spoilers).
   El partido se reproduce aquí con el motor (semilla + alineaciones
   congeladas) y todo sale de esos eventos (partido/estadisticas.js); si el
   marcador no coincide con el guardado, se avisa.

   De arriba abajo (en PC, el cuerpo en dos columnas):
   · Cabecera: los equipos con sus fotos, el resultado y los goleadores (minuto
     y ⚡ si hubo poder en la jugada del gol).
   · Estadísticas comparadas (tu equipo, o el local, a la izquierda) y la
     probabilidad de victoria antes del partido.
   · Alineaciones con las cartas de verdad por líneas y los cambios; tocar una
     carta abre su detalle.
   · Notas de los jugadores (0–10) frente a la esperada; la mejor, marcada.
   · La crónica: tácticas, jugadas, lesiones y energía gastada.

   Colores por equipo: verde el del usuario y naranja el rival; si el usuario
   no juega, verde el local y naranja el visitante.
═══════════════════════════════════════════════ */
import { rpc, leer } from '../api.js';
import { esc, hoja } from '../ui.js';
import { describirPoder, cartaHTML, ovr } from '../carta.js';
import { motorDe } from '../motores.js';
import { TACTICA, CONDICION_PLAN_B, CONDICION_CAMBIO, MOTIVO_CAMBIO, chipTactica, textoSinergia } from '../tactica.js';
import { tramoEnergia } from '../energia.js';
import { abrirPartido, cartasParaPintar } from '../partido/abrir.js';
import { estadisticasPartido, jugadores, notasPartido } from '../partido/estadisticas.js';
import { abrirDetalle } from './detalle.js';
import { marcarVisto } from '../rush.js';

const pct = p => `${Math.round(p * 100)} %`;
const LETRAS = ['A', 'B'];

function cartasDe(al) {
  return [al.por, ...al.def, ...al.med, ...al.del, ...(al.banquillo ?? [])];
}

// Efecto corto de un poder para la línea: "+15 % a la posesión"
const CORTO = {
  posesion: e => `+${Math.round(e * 100)} % a la posesión`,
  ocasion_ataque: e => `+${Math.round(e * 100)} % al ataque`,
  ocasion_defensa: e => `+${Math.round(e * 100)} % a la defensa`,
  tirador: e => `×${String(Math.round(e * 100) / 100).replace('.', ',')} opciones de tirar`,
  chut: e => `+${Math.round(e * 100)} % a su remate`,
  parada: e => `+${Math.round(e * 100)} % a su parada`,
};

const DESCANSO = new Set(['plan_b', 'cambio', 'descanso']);

function jugadas(eventos, eq, nombre, poderDe) {
  const bloques = new Map();
  const descanso = [];
  let tras = null;   // jugada tras la que va el descanso
  for (const e of eventos) {
    if (e.jugada == null || e.tipo === 'fin_partido' || e.tipo === 'tacticas') continue;
    if (DESCANSO.has(e.tipo)) { descanso.push(e); tras = e.jugada; continue; }
    if (!bloques.has(e.jugada)) bloques.set(e.jugada, []);
    bloques.get(e.jugada).push(e);
  }
  const goles = [0, 0];
  const quien = l => `<b class="${eq[l].clase}">${esc(eq[l].nombre)}</b>`;
  const carta = (id, l) => `<span class="${eq[l].clase}">${esc(nombre[id] ?? '?')}</span>`;
  const html = [];
  const pintarDescanso = () => {
    const lineas = descanso.map(e => {
      if (e.tipo === 'plan_b') {
        return `<li class="slr-suceso slr-suceso--tactica ${eq[e.equipo].clase}">🔁 ${quien(e.equipo)} activa el plan B (${esc(CONDICION_PLAN_B[e.condicion] ?? e.condicion)}):
          ${chipTactica(e.de)} → ${chipTactica(e.a)}</li>`;
      }
      if (e.tipo === 'cambio') {
        const motivo = e.motivo === 'programado'
          ? `programado${e.condicion ? `: ${esc((CONDICION_CAMBIO[e.condicion] ?? e.condicion).toLowerCase().replace('…', ''))}` : ''}`
          : esc(MOTIVO_CAMBIO[e.motivo] ?? e.motivo);
        return `<li class="slr-suceso slr-suceso--cambio ${eq[e.equipo].clase}">↔ Sale ${carta(e.sale, e.equipo)}${e.energia != null ? ` <small>(energía ${e.energia})</small>` : ''},
          entra ${carta(e.entra, e.equipo)} <small>· ${motivo}</small></li>`;
      }
      // descanso: tácticas y cruce de la segunda parte
      const cr = e.cruce ? `gana el cruce ${quien(e.cruce)}` : 'cruce igualado';
      return `<li class="slr-suceso slr-suceso--menor">Segunda parte: ${chipTactica(e.tacticas.A)} contra ${chipTactica(e.tacticas.B)} · ${cr}</li>`;
    });
    html.push(`
      <li class="slr-jugada slr-jugada--descanso">
        <div class="slr-jugada__cabeza"><time>Descanso</time><span>${descanso.some(e => e.tipo === 'cambio') ? 'cambios' : 'sin cambios'}</span>
          <em>${goles[0]}-${goles[1]}</em></div>
        <ul>${lineas.join('')}</ul>
      </li>`);
  };
  for (const [jugada, evs] of bloques) {
    const inicio = evs.find(e => e.tipo === 'inicio_jugada');
    const minuto = (evs.find(e => e.tipo === 'posesion') ?? evs[0]).minuto;
    const lineas = [];
    let gol = false, golDe = '';
    for (const e of evs) {
      if (e.tipo === 'poder') {
        const p = poderDe(e.carta, e.poder);
        lineas.push(`<li class="slr-suceso slr-suceso--poder ${eq[e.equipo].clase}">⚡ ${carta(e.carta, e.equipo)} <small>(${esc(eq[e.equipo].nombre)})</small> activa
          <button type="button" class="slr-suceso__poder" data-poder="${esc(e.carta)}|${esc(e.poder)}">${esc(e.poder)}</button>${p ? `: ${esc(CORTO[p.momento]?.(p.efecto) ?? '')}` : ''}${e.programada != null && e.programada < e.jugada ? ` <small>(le tocaba en la jugada ${e.programada})</small>` : ''}</li>`);
      } else if (e.tipo === 'posesion') {
        const gana = e.ganador, saca = e.saca;
        lineas.push(gana === saca
          ? `<li class="slr-suceso">${quien(gana)} mantiene el balón <span class="slr-pct">(${pct(e.p)})</span></li>`
          : `<li class="slr-suceso">${quien(gana)} roba el balón <span class="slr-pct">(${pct(1 - e.p)})</span> → contraataque</li>`);
      } else if (e.tipo === 'ocasion') {
        const def = e.equipo === 'A' ? 'B' : 'A';
        lineas.push(e.exito
          ? `<li class="slr-suceso">${quien(e.equipo)} llega al área <span class="slr-pct">(${pct(e.p)})</span></li>`
          : `<li class="slr-suceso">${quien(def)} corta la jugada <span class="slr-pct">(${pct(1 - e.p)})</span></li>`);
      } else if (e.tipo === 'tirador') {
        const p = e.candidatos?.find(c => c.carta === e.elegido)?.p;
        lineas.push(`<li class="slr-suceso">Dispara ${carta(e.elegido, e.equipo)}${p != null ? ` <span class="slr-pct">(${pct(p)})</span>` : ''}</li>`);
      } else if (e.tipo === 'chut') {
        const def = e.equipo === 'A' ? 'B' : 'A';
        if (e.gol) {
          gol = true;
          golDe = eq[e.equipo].clase;
          goles[e.equipo === 'A' ? 0 : 1]++;
          lineas.push(`<li class="slr-suceso slr-suceso--gol ${eq[e.equipo].clase}">¡GOOOL! <b>${goles[0]}-${goles[1]}</b> <span class="slr-pct">(${pct(e.p)})</span></li>`);
        } else {
          lineas.push(`<li class="slr-suceso">Para ${carta(e.portero, def)} <span class="slr-pct">(${pct(1 - e.p)})</span></li>`);
        }
      } else if (e.tipo === 'cansancio') {
        lineas.push(`<li class="slr-suceso slr-suceso--menor">Se cansa ${carta(e.carta, e.equipo)}: −4 de ${e.stat}</li>`);
      } else if (e.tipo === 'lesion') {
        lineas.push(`<li class="slr-suceso slr-suceso--lesion">🚑 Se lesiona ${carta(e.carta, e.equipo)}${e.suplente ? ` · entra ${carta(e.suplente, e.equipo)}` : ' · sigue jugando al 70 %'}</li>`);
      } else if (e.tipo === 'penalti') {
        lineas.push(`<li class="slr-suceso">Penalti de ${carta(e.lanzador, e.equipo)}: ${e.gol ? '<b>gol</b>' : 'fallo'} <span class="slr-pct">(${pct(e.gol ? e.p : 1 - e.p)})</span></li>`);
      }
    }
    html.push(`
      <li class="slr-jugada ${gol ? `es-gol ${golDe}` : ''}">
        <div class="slr-jugada__cabeza"><time>Min ${minuto}</time>${inicio ? `<span>saca ${quien(inicio.saca)}</span>` : ''}
          <em>${goles[0]}-${goles[1]}</em></div>
        <ul>${lineas.join('')}</ul>
      </li>`);
    if (jugada === tras) pintarDescanso();
  }
  return `<ol class="slr-jugadas">${html.join('')}</ol>`;
}

// Arriba: la táctica con la que salió cada equipo, quién ganó el cruce y sus sinergias
function cabeceraTacticas(sim, eq) {
  const ev = sim?.eventos?.find(e => e.tipo === 'tacticas');
  if (!ev) return '';
  const lado = l => `<div class="${eq[l].clase}">${chipTactica(ev.tacticas[l])}${textoSinergia(ev.sinergias?.[l])}
    ${sim.plan_b?.[l] ? `<small>plan B → ${TACTICA[sim.tacticas[l][1]]?.icono ?? ''} ${esc(TACTICA[sim.tacticas[l][1]]?.nombre ?? '')}</small>` : ''}</div>`;
  return `<div class="slr-cronica__tacticas">${lado('A')}
    <div class="slr-cronica__cruce">Cruce<b>${ev.cruce ? `${TACTICA[ev.tacticas[ev.cruce]].icono} ${esc(eq[ev.cruce].nombre)}` : 'igualado'}</b></div>
    ${lado('B')}</div>`;
}

// Al final: la energía que gastó cada carta (liga). Solo la guardada al publicar.
function energiaGastada(p, eq) {
  if (!p.energia) return '';
  const col = l => `<ul class="${eq[l].clase}">${(p.energia[l] ?? []).map(x => {
    const queda = Math.max(0, x.antes - x.gasto);
    return `<li><span>${esc(x.nombre)}</span><b class="slr-energia--${tramoEnergia(queda).clase}">${x.antes} → ${queda} <small>(−${x.gasto})</small></b></li>`;
  }).join('')}</ul>`;
  return `<h3 class="slr-subtitulo">Energía gastada</h3>
    <div class="slr-cronica__energia">${col('A')}${col('B')}</div>
    <p class="slr-suave">Después, todas las cartas recuperan 20 (y las que no jugaron, 20 más).</p>`;
}

/* ── Pantalla del partido ─────────────────────────────────────────────── */
const coma = x => String(x).replace('.', ',');
const OTRA = { A: 'B', B: 'A' };
const I = { A: 0, B: 1 };
const NOMBRE_LINEA = { por: 'Portero', def: 'Defensa', med: 'Medio', del: 'Delantero' };
const LINEAS = ['por', 'def', 'med', 'del'];
const esCanterano = id => String(id).startsWith('canterano-');

// Una carta para pintar: la de verdad o, si no está (Canteranos), una hecha con la congelada
function cartaPintable(id, cartas, congelada) {
  if (cartas[id]) return cartas[id];
  const c = congelada ?? {};
  const [ata, def, con] = [c.ATA ?? c.ata ?? 0, c.DEF ?? c.def ?? 0, c.CON ?? c.con ?? 0];
  return { id, nombre: c.nombre ?? '?', tipo: 'individual', acabado: 'normal', rareza: 'comun', personas: [], poderes: [], ata, def, con, ovr: ovr(ata, def, con) };
}

// 1. Cabecera: fotos, resultado grande y goleadores de cada lado
function cabecera(p, s, eq, izq, nombre) {
  const der = OTRA[izq];
  const lado = l => `<div class="slr-pp__eq slr-pp__eq--${l === izq ? 'izq' : 'der'} ${eq[l].clase}">
      <span class="avatar slr-pp__foto" data-avatar="${esc(eq[l].dueno)}" aria-hidden="true">${esc((eq[l].nombre || '?').slice(0, 1))}</span>
      <b>${esc(eq[l].nombre)}</b></div>`;
  const goleadores = l => `<ul class="slr-pp__goleadores slr-pp__goleadores--${l === izq ? 'izq' : 'der'}">${s.goleadores.filter(g => g.equipo === l).map(g => `
      <li><span class="${eq[l].clase}">${esc(nombre[g.carta] ?? '?')}</span> <time>${g.minuto}'</time>${g.poderes.length
        ? ` <i class="slr-pp__poder" title="${esc(`Poder: ${g.poderes.join(', ')}`)}">⚡</i>` : ''}</li>`).join('')}</ul>`;
  const pen = p.penaltis ?? s.penaltis;
  return `
    <header class="slr-pp__cabeza">
      ${lado(izq)}
      <div class="slr-pp__resultado">
        <b><i class="${eq[izq].clase}">${p.goles[I[izq]]}</i>–<i class="${eq[der].clase}">${p.goles[I[der]]}</i></b>
        ${pen ? `<small>${pen[I[izq]]}–${pen[I[der]]} en penaltis</small>` : ''}
      </div>
      ${lado(der)}
      ${goleadores(izq)}${goleadores(der)}
    </header>`;
}

// 2. Estadísticas en filas comparadas: una barra a dos colores y los números a cada lado
function estadisticas(p, s, eq, izq) {
  const der = OTRA[izq];
  const fila = (titulo, v, fmt = x => x) => {
    const a = v[I[izq]], b = v[I[der]], tot = a + b;
    return `<li class="slr-pp__fila ${tot ? '' : 'es-vacia'}">
        <b class="${eq[izq].clase}">${fmt(a)}</b><span>${titulo}</span><b class="${eq[der].clase}">${fmt(b)}</b>
        <span class="slr-pp__barra" style="--a:${tot ? (100 * a / tot).toFixed(1) : 50}%"><i class="${eq[izq].clase}-fondo"></i><i class="${eq[der].clase}-fondo"></i></span>
      </li>`;
  };
  let previa = '';
  if (p.p_local != null) {
    const pv = { A: p.p_local, B: p.p_visitante }, emp = Math.max(0, 1 - p.p_local - p.p_visitante);
    previa = `<div class="slr-pp__previa">
        <p>Probabilidad de victoria antes del partido</p>
        <div class="slr-pp__tres">
          <span class="${eq[izq].clase}"><b>${pct(pv[izq])}</b><small>${esc(eq[izq].nombre)}</small></span>
          <span><b>${pct(emp)}</b><small>Empate</small></span>
          <span class="${eq[der].clase}"><b>${pct(pv[der])}</b><small>${esc(eq[der].nombre)}</small></span>
        </div>
        <span class="slr-pp__barra slr-pp__barra--tres" style="--a:${(100 * pv[izq]).toFixed(1)}%;--e:${(100 * emp).toFixed(1)}%"><i class="${eq[izq].clase}-fondo"></i><i></i><i class="${eq[der].clase}-fondo"></i></span>
      </div>`;
  }
  return `
    <section class="slr-pp__seccion slr-pp__estadisticas">
      <h3 class="slr-subtitulo">Estadísticas</h3>
      <ul class="slr-pp__filas">
        ${fila('Posesión', s.posesion, pct)}
        ${fila('Robos', s.robos)}
        ${fila('Ataques que superan la defensa', s.ataques)}
        ${fila('Cortes', s.cortes)}
        ${fila('Tiros a puerta', s.tiros)}
        ${fila('Goles esperados', s.xg, x => coma(x.toFixed(1)))}
        ${fila('Paradas', s.paradas)}
        ${fila('Poderes activados', s.poderes)}
      </ul>
      ${previa}
    </section>`;
}

// 3. Alineaciones: las cartas por líneas; el que sale, atenuado, y el que entra a su lado
function alineaciones(p, j, eq, izq, cartas) {
  const al = { A: p.alineaciones_congeladas.local, B: p.alineaciones_congeladas.visitante };
  const boton = (id, l, marca, clase) => {
    const c = cartaPintable(id, cartas, j.cartas[id]);
    return `<button type="button" class="slr-pp__carta ${clase}" ${esCanterano(id) ? 'disabled' : `data-carta-id="${esc(id)}"`} title="${esc(c.nombre)}">
        ${cartaHTML(c, { tam: 's', energia: false, capitan: al[l]?.capitan_id === id })}${marca ? `<span class="slr-pp__marca">${marca}</span>` : ''}</button>`;
  };
  const equipo = l => {
    const filas = LINEAS.map(linea => {
      // Cada titular y, a su lado, los que fueron entrando en su hueco
      const html = j[l][linea].map(id => {
        let out = '', actual = id, entro = '';
        for (let c; (c = j.cambios.find(x => x.equipo === l && x.sale === actual)); actual = c.entra) {
          const m = c.motivo === 'descanso' ? 'Descanso' : `Lesión ${c.minuto}'`;
          out += boton(actual, l, entro ? `↑ ${entro} · ↓ ${m}` : `↓ ${m}`, 'es-sale');
          entro = m;
        }
        return out + boton(actual, l, entro ? `↑ ${entro}` : '', entro ? 'es-entra' : '');
      }).join('');
      return `<div class="slr-pp__linea"><small>${NOMBRE_LINEA[linea]}</small><div>${html}</div></div>`;
    }).join('');
    const n = j.cambios.filter(x => x.equipo === l).length;
    return `<div class="slr-pp__alineacion">
        <h4 class="${eq[l].clase}">${esc(eq[l].nombre)} <small>${esc(al[l]?.formacion ?? '')}${n ? ` · ${n} ${n === 1 ? 'cambio' : 'cambios'}` : ''}</small></h4>
        ${filas}
      </div>`;
  };
  return `
    <section class="slr-pp__seccion slr-pp__alineaciones">
      <h3 class="slr-subtitulo">Alineaciones</h3>
      ${equipo(izq)}${equipo(OTRA[izq])}
    </section>`;
}

// 4. Notas: nota del partido frente a la esperada, ordenadas; la mejor carta, marcada
function notas(lista, eq, nombre) {
  const fmt = x => coma(x.toFixed(1));
  return `
    <section class="slr-pp__seccion slr-pp__notas">
      <h3 class="slr-subtitulo">Notas de los jugadores</h3>
      <ol class="slr-pp__lista">${lista.map(n => {
        const d = n.diferencia;
        return `<li class="${n.mejor ? 'es-mejor' : ''}">
          <button type="button" class="slr-pp__jugador" ${esCanterano(n.id) ? 'disabled' : `data-carta-id="${esc(n.id)}"`}>
            <span class="slr-pp__punto ${eq[n.equipo].clase}-fondo"></span>
            <span class="slr-pp__quien"><b>${esc(nombre[n.id] ?? '?')}</b><small>${NOMBRE_LINEA[n.linea] ?? ''}${n.mejor ? ' · <em>★ Mejor del partido</em>' : ''}</small></span>
            <b class="slr-pp__nota">${fmt(n.nota)}</b>
            <span class="slr-pp__esperada"><small>esp. ${fmt(n.esperada)}</small>
              <i class="${d > 0 ? 'es-sube' : d < 0 ? 'es-baja' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${fmt(Math.abs(d))}</i></span>
          </button></li>`;
      }).join('')}</ol>
      <p class="slr-suave">La nota sale de los puntos de rendimiento del partido; la esperada, de la media de la carta frente a la de todas las que jugaron.</p>
    </section>`;
}

// Al cerrar la reproducción: al momento, un fondo oscuro con «Cargando el partido…» debajo
// del reproductor (que se desvanece), para que no asome lo de debajo; la pantalla del
// partido se abre encima cuando está lista y entonces se quita.
function pantallaDeCarga() {
  const rep = document.querySelector('[data-partido-reproductor]');
  const el = document.createElement('div');
  el.className = 'slr-carga-partido';
  el.setAttribute('role', 'status');
  el.innerHTML = '<span class="slr-carga-partido__giro" aria-hidden="true"></span><p>Cargando el partido…</p>';
  if (rep?.parentNode) rep.before(el); else document.body.appendChild(el);
  return { quitar: (tras = 0) => setTimeout(() => el.remove(), tras) };
}

// La primera vez que abres un partido TUYO ya jugado se reproduce solo; cuenta como visto
// al llegar al final o al pulsar «Saltar» y entonces se abre la pantalla del partido. Las
// siguientes, la pantalla con «▶ Ver partido». Los de los demás, la pantalla directamente.
export async function abrirCronica(partidoId, ctx, { soloCronica = false } = {}) {
  const p = await rpc('slr_partido', { partido_id: partidoId });
  if (p.mio && !p.visto && !soloCronica) {
    const r = await abrirPartido(partidoId, ctx, {
      p,
      alVisto: () => marcarVisto(partidoId),
      alTerminar: ({ visto }) => {
        if (!visto) return;
        const carga = pantallaDeCarga();
        // Se quita cuando la hoja ya ha terminado de entrar (o si algo falla)
        abrirCronica(partidoId, ctx, { soloCronica: true }).catch(() => {}).finally(() => carga.quitar(450));
      },
    });
    if (r) return;
  }
  const al = p.alineaciones_congeladas;
  const reales = [...new Set([...cartasDe(al.local), ...cartasDe(al.visitante)].map(c => c.id))].filter(id => !esCanterano(id));
  const [eqs, cartas] = await Promise.all([
    leer(`equipos?select=id,nombre,usuarios(nombre,interno)&id=in.(${p.local_id},${p.visitante_id})`),
    cartasParaPintar(reales).catch(() => ({})),
  ]);
  const datosEq = id => { const e = eqs.find(x => x.id === id); return { nombre: e?.nombre ?? 'Equipo', dueno: e?.usuarios?.interno ? '' : (e?.usuarios?.nombre ?? '') }; };
  const yo = ctx.datos.equipo?.id;
  // Verde el equipo del usuario y naranja el rival; si no juega, verde el local (y a la izquierda)
  const verde = [p.local_id, p.visitante_id].includes(yo) ? yo : p.local_id;
  const eq = {
    A: { ...datosEq(p.local_id), clase: p.local_id === verde ? 'slr-propio' : 'slr-rival' },
    B: { ...datosEq(p.visitante_id), clase: p.visitante_id === verde ? 'slr-propio' : 'slr-rival' },
  };
  const izq = p.visitante_id === verde ? 'B' : 'A';
  const nombre = {};
  for (const c of [...cartasDe(al.local), ...cartasDe(al.visitante)]) nombre[c.id] = c.nombre;
  const poderDe = (cartaId, nombrePoder) => {
    const c = [...cartasDe(al.local), ...cartasDe(al.visitante)].find(x => x.id === cartaId);
    return c?.poderes?.find(x => x.nombre === nombrePoder) ?? null;
  };

  // Reproducción en el navegador con la misma semilla y la misma versión del motor
  let sim = null, aviso = '';
  try {
    sim = motorDe(p.version_motor).simularPartido(al.local, al.visitante, p.semilla);
    if (sim.goles[0] !== p.goles[0] || sim.goles[1] !== p.goles[1]) {
      aviso = `Atención: al reproducir el partido sale ${sim.goles.join('-')} y el resultado guardado es ${p.goles.join('-')}.`;
    }
  } catch (e) {
    aviso = `No se pudo reproducir el partido: ${e.message}`;
  }

  // Todo sale de los eventos (y de las alineaciones congeladas)
  const s = estadisticasPartido(sim?.eventos ?? []);
  const j = jugadores(al, sim?.eventos ?? []);
  const medias = Object.fromEntries(Object.entries(j.cartas).map(([id, c]) => [id, cartaPintable(id, cartas, c).ovr]));
  const lista = sim ? notasPartido({ jugadores: j, pr: sim.pr ?? p.pr ?? {}, medias }) : [];

  const el = hoja(`
    <div class="slr-cronica slr-pp">
      <p class="slr-cronica__tipo">${p.tipo === 'amistoso' ? 'Amistoso' : `Jornada ${p.jornada}`}</p>
      ${cabecera(p, s, eq, izq, nombre)}
      ${sim ? '<button class="slr-btn slr-btn--grande slr-cronica__ver" type="button" data-ver-partido>▶ Ver partido</button>' : ''}
      ${aviso ? `<div class="slr-banner slr-banner--pausa"><b>Aviso</b><span>${esc(aviso)}</span></div>` : ''}

      ${sim ? `<div class="slr-pp__cuerpo">
        ${estadisticas(p, s, eq, izq)}
        ${alineaciones(p, j, eq, izq, cartas)}
        ${notas(lista, eq, nombre)}
      </div>` : ''}

      <section class="slr-pp__seccion slr-pp__cronica">
        <h3 class="slr-subtitulo">Crónica</h3>
        ${cabeceraTacticas(sim, eq)}
        ${sim ? jugadas(sim.eventos, eq, nombre, poderDe) : '<p class="slr-suave">Sin jugadas.</p>'}
        <p class="slr-cronica__nota">El % es la probabilidad que tenía lo que ocurrió.</p>
        ${(p.lesiones ?? []).length ? `<p class="slr-cronica__lesiones">🚑 Lesiones: ${p.lesiones.map(id => esc(nombre[id] ?? id)).join(', ')}${p.tipo === 'liga' ? ' (tocadas la próxima jornada)' : ''}</p>` : ''}
        ${energiaGastada(p, eq)}
      </section>
    </div>`, { titulo: 'Partido', completa: true });

  if (typeof window.renderAvatar === 'function') {
    el.querySelectorAll('[data-avatar]').forEach(a => { if (a.dataset.avatar) window.renderAvatar(a, a.dataset.avatar); });
  }
  el.querySelectorAll('[data-carta-id]').forEach(b => b.addEventListener('click', () => abrirDetalle(b.dataset.cartaId, ctx).catch(() => {})));
  el.querySelector('[data-ver-partido]')?.addEventListener('click', () => abrirPartido(partidoId, ctx, { p, alVisto: () => { if (p.mio) marcarVisto(partidoId); } }));
  // Tocar el nombre de un poder: su descripción
  el.querySelectorAll('[data-poder]').forEach(b => b.addEventListener('click', () => {
    const [cartaId, poder] = b.dataset.poder.split('|');
    const pd = poderDe(cartaId, poder);
    if (!pd) return;
    const d = describirPoder(pd);
    hoja(`<p class="slr-confirmar__texto"><b>${esc(d.nombre)}</b> · ${esc(nombre[cartaId] ?? '')}</p>
      <p class="slr-confirmar__texto">${esc(d.momento)}: ${esc(d.efecto)}.</p><p class="slr-suave">${esc(d.probabilidad)}.</p>`, { titulo: 'Poder' });
  }));
}
