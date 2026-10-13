/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — crónica de un partido (provisional)
   Hasta que llegue el reproductor (entrega 3): marcador, alineaciones, la
   lista de jugadas en texto, lesiones y el PR de cada carta.
   El partido se reproduce aquí con el motor (semilla + alineaciones
   congeladas): las jugadas salen de esos eventos, y si el marcador no coincide
   con el guardado se avisa.
═══════════════════════════════════════════════ */
import { rpc, leer } from '../api.js';
import { esc, hoja } from '../ui.js';
import { simularPartido, VERSION } from '../motor-v1.1.0.js';

const pct = p => `${Math.round(p * 100)} %`;
const LINEAS = [['por', 'POR', 'DEF'], ['def', 'DEF', 'DEF'], ['med', 'MED', 'CON'], ['del', 'DEL', 'ATA']];

function nombres(al) {
  const m = {};
  for (const c of [al.por, ...al.def, ...al.med, ...al.del, ...(al.banquillo ?? [])]) m[c.id] = c.nombre;
  return m;
}

function alineacion(al, titulo, clase) {
  const fila = (c, stat) => `<li class="${al.capitan_id === c.id ? 'es-capitan' : ''}">
    <span>${esc(c.nombre)}${al.capitan_id === c.id ? ' <b class="slr-cronica__c">C</b>' : ''}${c.tocada ? ' <small>tocada</small>' : ''}</span><b>${c[stat]}</b></li>`;
  return `
    <div class="slr-cronica__equipo">
      <h4 class="${clase}">${esc(titulo)} <small>${esc(al.formacion)}</small></h4>
      ${LINEAS.map(([l, etq, stat]) => `
        <p class="slr-cronica__linea">${etq} · ${stat}</p>
        <ul>${(l === 'por' ? [al.por] : al[l]).map(c => fila(c, stat)).join('')}</ul>`).join('')}
      ${al.banquillo?.length ? `<p class="slr-cronica__linea">Banquillo</p>
        <ul>${al.banquillo.map(c => `<li><span>${esc(c.nombre)}</span><b>${Math.max(c.ATA, c.DEF, c.CON)}</b></li>`).join('')}</ul>` : ''}
    </div>`;
}

// Una línea por jugada: "Min 23 · Posesión para X (61 %) · ocasión · disparo de Pichichi · ¡GOL!"
function jugadas(eventos, equipos, nombre, marcadorFinal) {
  const porJugada = new Map();
  for (const e of eventos) {
    if (e.jugada == null || e.tipo === 'fin_partido' || e.tipo === 'inicio_jugada') continue;
    if (!porJugada.has(e.jugada)) porJugada.set(e.jugada, []);
    porJugada.get(e.jugada).push(e);
  }
  const goles = [0, 0];
  const lineas = [];
  for (const [n, evs] of porJugada) {
    const partes = [];
    let lado = null, gol = false, min = evs[0]?.minuto;
    for (const e of evs) {
      if (e.tipo === 'posesion') {
        lado = e.ganador;
        const p = e.ganador === e.saca ? e.p : 1 - e.p;
        partes.push(`Posesión para <b>${esc(equipos[e.ganador])}</b> (${pct(p)})${e.contraataque ? ' · contraataque' : ''}`);
        min = e.minuto;
      } else if (e.tipo === 'poder') {
        partes.push(`<span class="slr-cronica__poder">⚡ ${esc(nombre[e.carta] ?? '?')}: ${esc(e.poder)}</span>`);
      } else if (e.tipo === 'ocasion') {
        partes.push(e.exito ? `ocasión (${pct(e.p)})` : `corta ${esc(equipos[e.equipo === 'A' ? 'B' : 'A'])}`);
      } else if (e.tipo === 'tirador') {
        partes.push(`disparo de ${esc(nombre[e.elegido] ?? '?')}`);
      } else if (e.tipo === 'chut') {
        if (e.gol) { gol = true; goles[e.equipo === 'A' ? 0 : 1]++; partes.push(`<b class="slr-cronica__gol">¡GOL! ${goles[0]}-${goles[1]}</b>`); }
        else partes.push(`para ${esc(nombre[e.portero] ?? 'el portero')}`);
      } else if (e.tipo === 'lesion') {
        partes.push(`<span class="slr-cronica__lesion">🚑 lesión de ${esc(nombre[e.carta] ?? '?')}${e.suplente ? ` · entra ${esc(nombre[e.suplente] ?? '?')}` : ' · sigue al 70 %'}</span>`);
      } else if (e.tipo === 'penalti') {
        partes.push(`penalti de ${esc(nombre[e.lanzador] ?? '?')}: ${e.gol ? 'gol' : 'fallo'}`);
      }
    }
    lineas.push(`<li class="${gol ? 'es-gol' : ''} slr-cronica__lado-${lado ?? 'x'}"><time>Min ${min}</time><span>${partes.join(' · ')}</span></li>`);
  }
  return `<ol class="slr-cronica__jugadas">${lineas.join('')}</ol>
    <p class="slr-cronica__final">Final: ${esc(equipos.A)} ${marcadorFinal[0]} – ${marcadorFinal[1]} ${esc(equipos.B)}</p>`;
}

function rendimiento(p, al, equipos, nombre) {
  const fila = (lado, letra) => {
    const ids = [al[lado].por, ...al[lado].def, ...al[lado].med, ...al[lado].del, ...(al[lado].banquillo ?? [])].map(c => c.id)
      .filter(id => id in (p.pr ?? {}));
    return ids.sort((a, b) => (p.pr[b] ?? 0) - (p.pr[a] ?? 0)).map(id => {
      const pr = p.pr[id] ?? 0, esp = p.pr_esperado?.[id];
      const bien = esp ? pr / esp : null;
      return `<li><span>${esc(nombre[id])}</span><small>${esc(equipos[letra])}</small>
        <b class="${bien == null ? '' : bien > 1.25 ? 'es-bien' : bien < 0.75 ? 'es-mal' : ''}">${pr.toFixed(1).replace('.', ',')}</b>
        <em>${esp != null ? `esp. ${esp.toFixed(1).replace('.', ',')}` : ''}</em></li>`;
    }).join('');
  };
  return `<ul class="slr-cronica__pr">${fila('local', 'A')}${fila('visitante', 'B')}</ul>`;
}

export async function abrirCronica(partidoId, ctx) {
  const p = await rpc('slr_partido', { partido_id: partidoId });
  const eqs = await leer(`equipos?select=id,nombre&id=in.(${p.local_id},${p.visitante_id})`);
  const nombreEq = id => eqs.find(e => e.id === id)?.nombre ?? 'Equipo';
  const equipos = { A: nombreEq(p.local_id), B: nombreEq(p.visitante_id) };
  const al = p.alineaciones_congeladas;
  const nombre = { ...nombres(al.local), ...nombres(al.visitante) };
  const yo = ctx.datos.equipo?.id;
  // Verde lo propio y naranja el rival solo si el partido es mío; si no, neutro
  const mio = [p.local_id, p.visitante_id].includes(yo);
  const clase = id => (id === yo ? 'slr-propio' : mio ? 'slr-rival' : '');

  // Reproducción en el navegador con la misma semilla
  let sim = null, aviso = '';
  if (p.version_motor !== VERSION) {
    aviso = `Este partido se jugó con el motor ${p.version_motor} y aquí está el ${VERSION}: la crónica puede no coincidir.`;
  }
  try {
    sim = simularPartido(al.local, al.visitante, p.semilla);
    if (sim.goles[0] !== p.goles[0] || sim.goles[1] !== p.goles[1]) {
      aviso = `Atención: al reproducir el partido sale ${sim.goles.join('-')} y el resultado guardado es ${p.goles.join('-')}.`;
    }
  } catch (e) {
    aviso = `No se pudo reproducir el partido: ${e.message}`;
  }

  hoja(`
    <div class="slr-cronica">
      <p class="slr-cronica__tipo">${p.tipo === 'amistoso' ? 'Amistoso' : `Jornada ${p.jornada}`} · semilla ${p.semilla}</p>
      <div class="slr-marcador slr-cronica__marcador">
        <span class="${clase(p.local_id)}">${esc(equipos.A)}</span>
        <b><i class="${clase(p.local_id)}">${p.goles[0]}</i>–<i class="${clase(p.visitante_id)}">${p.goles[1]}</i></b>
        <span class="${clase(p.visitante_id)}">${esc(equipos.B)}</span>
      </div>
      ${p.p_local != null ? `<p class="slr-suave slr-cronica__prev">Antes del partido: ${esc(equipos.A)} ${pct(p.p_local)} · empate ${pct(1 - p.p_local - p.p_visitante)} · ${esc(equipos.B)} ${pct(p.p_visitante)}</p>` : ''}
      ${aviso ? `<div class="slr-banner slr-banner--pausa"><b>Aviso</b><span>${esc(aviso)}</span></div>` : ''}

      <h3 class="slr-subtitulo">Jugadas</h3>
      ${sim ? jugadas(sim.eventos, equipos, nombre, p.goles) : '<p class="slr-suave">Sin jugadas.</p>'}

      <h3 class="slr-subtitulo">Lesiones</h3>
      ${(p.lesiones ?? []).length
        ? `<ul class="slr-cronica__lesiones">${p.lesiones.map(id => `<li>🚑 ${esc(nombre[id] ?? id)}${id.startsWith('canterano-') ? '' : ' · tocada la próxima jornada'}</li>`).join('')}</ul>`
        : '<p class="slr-suave">Ninguna.</p>'}

      <h3 class="slr-subtitulo">Alineaciones</h3>
      <div class="slr-cronica__alineaciones">
        ${alineacion(al.local, equipos.A, clase(p.local_id))}
        ${alineacion(al.visitante, equipos.B, clase(p.visitante_id))}
      </div>

      <h3 class="slr-subtitulo">Rendimiento (PR)</h3>
      <p class="slr-suave">Puntos de rendimiento del partido; «esp.» es lo esperado según las 200 simulaciones previas.</p>
      ${rendimiento(p, al, equipos, nombre)}
    </div>`, { titulo: 'Crónica', completa: true });
}
