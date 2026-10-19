/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — crónica de un partido (provisional)
   Hasta que llegue el reproductor (entrega 3). El partido se reproduce aquí con
   el motor (semilla + alineaciones congeladas) y la crónica sale de esos
   eventos; si el marcador no coincide con el guardado, se avisa.

   · Colores por equipo en todo: verde el del usuario y naranja el rival; si el
     usuario no juega, verde el local y naranja el visitante (leyenda arriba).
   · Arriba, las dos alineaciones dibujadas en un campo.
   · Cada jugada es un bloque (minuto y quién saca) con una línea por suceso:
     poderes, posesión, ocasión, tirador, remate, cansancio y lesiones.
   · Regla de porcentajes: el % es la probabilidad que tenía lo que ocurrió y
     va junto al equipo o la carta que lo consiguió.
   · Al final, un resumen: posesiones, ocasiones, tiros, paradas, poderes por
     equipo y la carta con más PR de cada lado.
   · Motor v2: arriba, la táctica de cada equipo, quién ganó el cruce y las
     sinergias; en el descanso, el plan B y los cambios (con su motivo); y al
     final, la energía que gastó cada carta (solo en liga).
═══════════════════════════════════════════════ */
import { rpc, leer } from '../api.js';
import { esc, hoja } from '../ui.js';
import { describirPoder } from '../carta.js';
import { campoHTML, enlazarCampo } from '../campo.js';
import { motorDe } from '../motores.js';
import { TACTICA, CONDICION_PLAN_B, CONDICION_CAMBIO, MOTIVO_CAMBIO, chipTactica, textoSinergia } from '../tactica.js';
import { tramoEnergia } from '../energia.js';
import { abrirPartido } from '../partido/abrir.js';

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

function resumen(sim, eq, p, al, nombre) {
  const est = sim?.estadisticas ?? p.estadisticas ?? {};
  const poderes = [0, 0];
  for (const e of sim?.eventos ?? []) if (e.tipo === 'poder') poderes[e.equipo === 'A' ? 0 : 1]++;
  const pr = p.pr ?? sim?.pr ?? {};
  const mejor = lado => {
    const ids = cartasDe(al[lado]).map(c => c.id).filter(id => id in pr);
    const id = ids.sort((a, b) => pr[b] - pr[a])[0];
    return id ? `${esc(nombre[id])} <small>(${pr[id].toFixed(1).replace('.', ',')})</small>` : '—';
  };
  const filaEst = (titulo, v) => `<tr><td class="${eq.A.clase}">${v?.[0] ?? '—'}</td><th>${titulo}</th><td class="${eq.B.clase}">${v?.[1] ?? '—'}</td></tr>`;
  return `
    <table class="slr-resumen">
      <thead><tr><th class="${eq.A.clase}">${esc(eq.A.nombre)}</th><th></th><th class="${eq.B.clase}">${esc(eq.B.nombre)}</th></tr></thead>
      <tbody>
        ${filaEst('Goles', p.goles)}
        ${filaEst('Posesiones', est.posesiones)}
        ${filaEst('Ocasiones', est.ocasiones)}
        ${filaEst('Tiros', est.tiros)}
        ${filaEst('Paradas', est.paradas)}
        ${filaEst('Poderes activados', poderes)}
        <tr><td class="${eq.A.clase}">${mejor('local')}</td><th>Más PR</th><td class="${eq.B.clase}">${mejor('visitante')}</td></tr>
      </tbody>
    </table>`;
}

function tablaPR(p, al, eq, nombre) {
  const pr = p.pr ?? {};
  const fila = (lado, letra) => cartasDe(al[lado]).map(c => c.id).filter(id => id in pr)
    .sort((a, b) => pr[b] - pr[a]).map(id => {
      const esp = p.pr_esperado?.[id], r = esp ? pr[id] / esp : null;
      return `<li><span class="${eq[letra].clase}">${esc(nombre[id])}</span>
        <b class="${r == null ? '' : r > 1.25 ? 'es-bien' : r < 0.75 ? 'es-mal' : ''}">${pr[id].toFixed(1).replace('.', ',')}</b>
        <em>${esp != null ? `esp. ${esp.toFixed(1).replace('.', ',')}` : ''}</em></li>`;
    }).join('');
  return `<ul class="slr-cronica__pr">${fila('local', 'A')}${fila('visitante', 'B')}</ul>`;
}

export async function abrirCronica(partidoId, ctx) {
  const p = await rpc('slr_partido', { partido_id: partidoId });
  const eqs = await leer(`equipos?select=id,nombre&id=in.(${p.local_id},${p.visitante_id})`);
  const nombreEq = id => eqs.find(e => e.id === id)?.nombre ?? 'Equipo';
  const al = p.alineaciones_congeladas;
  const yo = ctx.datos.equipo?.id;
  // Verde el equipo del usuario y naranja el rival; si no juega, verde el local
  const verde = [p.local_id, p.visitante_id].includes(yo) ? yo : p.local_id;
  const eq = {
    A: { nombre: nombreEq(p.local_id), clase: p.local_id === verde ? 'slr-propio' : 'slr-rival' },
    B: { nombre: nombreEq(p.visitante_id), clase: p.visitante_id === verde ? 'slr-propio' : 'slr-rival' },
  };
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

  const el = hoja(`
    <div class="slr-cronica">
      <p class="slr-cronica__tipo">${p.tipo === 'amistoso' ? 'Amistoso' : `Jornada ${p.jornada}`}</p>
      ${sim ? '<button class="slr-btn slr-btn--grande slr-cronica__ver" type="button" data-ver-partido>▶ Ver partido</button>' : ''}
      <div class="slr-marcador slr-cronica__marcador">
        <span class="${eq.A.clase}">${esc(eq.A.nombre)}</span>
        <b><i class="${eq.A.clase}">${p.goles[0]}</i>–<i class="${eq.B.clase}">${p.goles[1]}</i></b>
        <span class="${eq.B.clase}">${esc(eq.B.nombre)}</span>
      </div>
      <p class="slr-cronica__leyenda"><span class="${eq.A.clase}">● ${esc(eq.A.nombre)}</span> <small>local</small>
        <span class="${eq.B.clase}">● ${esc(eq.B.nombre)}</span> <small>visitante</small></p>
      ${p.p_local != null ? `<p class="slr-suave slr-cronica__prev">Antes del partido: gana ${esc(eq.A.nombre)} ${pct(p.p_local)} · empate ${pct(1 - p.p_local - p.p_visitante)} · gana ${esc(eq.B.nombre)} ${pct(p.p_visitante)}</p>` : ''}
      ${aviso ? `<div class="slr-banner slr-banner--pausa"><b>Aviso</b><span>${esc(aviso)}</span></div>` : ''}
      ${cabeceraTacticas(sim, eq)}

      <div class="slr-cronica__campos">
        ${campoHTML(al.local, { titulo: eq.A.nombre, clase: eq.A.clase, nota: 'local' })}
        ${campoHTML(al.visitante, { titulo: eq.B.nombre, clase: eq.B.clase, nota: 'visitante' })}
      </div>

      <h3 class="slr-subtitulo">Jugadas</h3>
      ${sim ? jugadas(sim.eventos, eq, nombre, poderDe) : '<p class="slr-suave">Sin jugadas.</p>'}
      <p class="slr-cronica__nota">El % es la probabilidad que tenía lo que ocurrió.</p>

      <h3 class="slr-subtitulo">Resumen</h3>
      ${resumen(sim, eq, p, al, nombre)}
      ${(p.lesiones ?? []).length ? `<p class="slr-cronica__lesiones">🚑 Lesiones: ${p.lesiones.map(id => esc(nombre[id] ?? id)).join(', ')}${p.tipo === 'liga' ? ' (tocadas la próxima jornada)' : ''}</p>` : ''}

      ${energiaGastada(p, eq)}

      <h3 class="slr-subtitulo">Rendimiento (PR) de cada carta</h3>
      <p class="slr-suave">«esp.» es lo esperado según las 200 simulaciones previas.</p>
      ${tablaPR(p, al, eq, nombre)}
    </div>`, { titulo: 'Crónica', completa: true });

  enlazarCampo(el, ctx);
  el.querySelector('[data-ver-partido]')?.addEventListener('click', () => abrirPartido(partidoId, ctx, { p }));
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
