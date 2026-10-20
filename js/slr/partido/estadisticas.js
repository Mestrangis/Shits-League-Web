/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — estadísticas de un partido jugado (pantalla del partido)
   Todo sale de los eventos del motor (los mismos que usa el guion) y de las
   alineaciones congeladas: nada se recalcula aparte. Sin DOM (se prueba en Node).
   Equipos por letra: A el local y B el visitante (como el motor); cada
   estadística es [A, B].

     estadisticasPartido(eventos) → posesión, robos, ataques, cortes, tiros,
                                    goles esperados, paradas, poderes, goleadores
     jugadores(alineaciones, eventos) → quién jugó, en qué línea y los cambios
     notasPartido({ jugadores, pr, medias }) → nota, nota esperada y la mejor carta
═══════════════════════════════════════════════ */

const LETRA = { A: 0, B: 1 };
const LINEAS = ['por', 'def', 'med', 'del'];
const fila = x => (Array.isArray(x) ? x : x ? [x] : []).filter(Boolean);

export function estadisticasPartido(eventos = []) {
  const par = () => [0, 0];
  const s = {
    controles: par(),     // duelos de control (posesión) ganados
    robos: par(),         // ganados sin sacar → contraataque
    ataques: par(),       // ataques que superan la defensa
    cortes: par(),        // ataques del rival cortados
    tiros: par(),         // chuts a puerta
    xg: par(),            // suma de las probabilidades de gol de cada chut
    paradas: par(),
    poderes: par(),       // poderes activados
    goles: par(),         // en el tiempo de juego (sin la tanda de penaltis)
    goleadores: [],       // { equipo, carta, minuto, jugada, poderes: [nombres] }
    penaltis: null,       // [A, B] si hubo tanda
  };
  const poderesJugada = new Map();   // `${jugada}|${letra}` → nombres de los poderes activados
  for (const e of eventos) {
    const i = LETRA[e.equipo];
    switch (e.tipo) {
      case 'posesion': {
        const g = LETRA[e.ganador];
        s.controles[g]++;
        if (e.ganador !== e.saca) s.robos[g]++;
        break;
      }
      case 'ocasion':
        if (e.exito) s.ataques[i]++;
        else s.cortes[1 - i]++;
        break;
      case 'chut':
        s.tiros[i]++;
        s.xg[i] += e.p;
        if (e.gol) {
          s.goles[i]++;
          s.goleadores.push({ equipo: e.equipo, carta: e.tirador, minuto: e.minuto, jugada: e.jugada,
            poderes: [...(poderesJugada.get(`${e.jugada}|${e.equipo}`) ?? [])] });
        } else s.paradas[1 - i]++;
        break;
      case 'poder': {
        s.poderes[i]++;
        const k = `${e.jugada}|${e.equipo}`;
        if (!poderesJugada.has(k)) poderesJugada.set(k, []);
        poderesJugada.get(k).push(e.poder);
        break;
      }
      case 'fin_partido':
        if (e.penaltis) s.penaltis = [...e.penaltis];
        break;
    }
  }
  const total = s.controles[0] + s.controles[1];
  s.posesion = total ? [s.controles[0] / total, s.controles[1] / total] : [0.5, 0.5];
  return s;
}

/**
 * Quién jugó: los titulares de las alineaciones congeladas y los que entraron
 * (cambios del descanso y lesiones con suplente), con su línea.
 * → { A: { por: [ids], def, med, del }, B: {…}, cambios: [{ equipo, sale, entra, linea, motivo, minuto, jugada }],
 *     linea: { id: 'por'|'def'|'med'|'del' }, equipo: { id: 'A'|'B' }, cartas: { id: carta congelada } }
 * motivo: 'descanso' (cambio del descanso) o 'lesion'.
 */
export function jugadores(alineaciones = {}, eventos = []) {
  const out = { A: {}, B: {}, cambios: [], linea: {}, equipo: {}, cartas: {} };
  for (const [letra, al] of [['A', alineaciones.local], ['B', alineaciones.visitante]]) {
    for (const l of LINEAS) {
      out[letra][l] = fila(al?.[l]).map(c => c.id);
      for (const c of fila(al?.[l])) { out.linea[c.id] = l; out.equipo[c.id] = letra; }
    }
    for (const c of [...LINEAS.flatMap(l => fila(al?.[l])), ...fila(al?.banquillo)]) out.cartas[c.id] = c;
  }
  const lineaDe = (letra, id, hueco) => (hueco && out[letra][hueco] ? hueco : out.linea[id] ?? LINEAS.find(l => out[letra][l].includes(id)));
  for (const e of eventos) {
    const entra = e.tipo === 'cambio' ? e.entra : e.tipo === 'lesion' ? e.suplente : null;
    if (!entra) continue;
    const sale = e.tipo === 'cambio' ? e.sale : e.carta;
    const linea = lineaDe(e.equipo, sale, e.hueco);
    out.linea[entra] = linea;
    out.equipo[entra] = e.equipo;
    out.cambios.push({ equipo: e.equipo, sale, entra, linea, motivo: e.tipo === 'cambio' ? 'descanso' : 'lesion', minuto: e.minuto, jugada: e.jugada });
  }
  return out;
}

/* ── Notas ───────────────────────────────────────────────────────────────────
   No había ninguna conversión de puntos de rendimiento (PR) a nota. Esta es:
   nota = 5 + (PR − referencia de su línea) / escala de su línea, entre 0 y 10,
   con un decimal. La referencia es más o menos el PR medio de esa línea en un
   partido (medido en 3.000 partidos simulados de cada versión del motor) y la
   escala, los PR que vale un punto de nota (cada línea suma PR de forma
   distinta: el portero gana 2 por parada y pierde 1 por gol; los defensas se
   reparten 1 por corte; los medios, 1 por balón ganado; los delanteros, 1 por
   tiro y 3 más por gol). Así una carta normal en su línea saca un 5. */
export const NOTA_LINEA = Object.freeze({
  por: { ref: 2, escala: 1.6 },
  def: { ref: 0.9, escala: 0.5 },
  med: { ref: 2.5, escala: 0.8 },
  del: { ref: 3.3, escala: 1.6 },
});
const redondear1 = x => Math.round(x * 10) / 10;
const entre = (x, a, b) => Math.min(b, Math.max(a, x));

export function notaDePR(pr, linea) {
  const n = NOTA_LINEA[linea] ?? NOTA_LINEA.med;
  return redondear1(entre(5 + ((pr ?? 0) - n.ref) / n.escala, 0, 10));
}

// Nota esperada: 5 + (media de la carta − media de todas las que jugaron) / 10, entre 3 y 8
export function notaEsperada(media, mediaTodas) {
  return redondear1(entre(5 + (media - mediaTodas) / 10, 3, 8));
}

/**
 * jugadores: el resultado de jugadores(); pr: { id: PR } (el del partido);
 * medias: { id: media (OVR) de la carta }.
 * → lista ordenada por nota (y, en empate, por PR): { id, equipo, linea, pr, media, nota, esperada, diferencia, mejor }
 */
export function notasPartido({ jugadores: j, pr = {}, medias = {} }) {
  const ids = Object.keys(j.linea);   // titulares y los que entraron (el banquillo sin usar no cuenta)
  const conMedia = ids.filter(id => Number.isFinite(medias[id]));
  const mediaTodas = conMedia.length ? conMedia.reduce((a, id) => a + medias[id], 0) / conMedia.length : 0;
  const lista = ids.map(id => {
    const nota = notaDePR(pr[id], j.linea[id]);
    const esperada = Number.isFinite(medias[id]) ? notaEsperada(medias[id], mediaTodas) : 5;
    return { id, equipo: j.equipo[id], linea: j.linea[id], pr: pr[id] ?? 0, media: medias[id] ?? null, nota, esperada,
      diferencia: redondear1(nota - esperada), mejor: false };
  }).sort((a, b) => (b.nota - a.nota) || (b.pr - a.pr) || String(a.id).localeCompare(String(b.id)));
  if (lista.length) lista[0].mejor = true;
  return lista;
}
