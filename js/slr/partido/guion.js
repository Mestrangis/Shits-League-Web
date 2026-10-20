/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: adaptador eventos → guion
   Lo ÚNICO que conoce los eventos del motor. Convierte la lista de eventos de
   un partido en escenas con sus datos (equipo, cartas, probabilidad,
   resultado, minuto, marcador…). Solo lee lo que ya traen los eventos y las
   alineaciones congeladas: nunca vuelve a calcular nada del motor. Un evento
   que no conoce se ignora. Lo que cambie entre versiones del motor se resuelve
   aquí (version_motor).

   Escenas (en orden dentro de cada jugada):
     inicio · saque · poder* · control · robo? · poder* · ataque · pase|corte
     · tirador · poder* · chut · gol|parada · lesion* … descanso … final
   Cada escena: { tipo, jugada, minuto, marcador: [A, B] antes de la escena, … }.
   Equipos por letra: A el local y B el visitante (como el motor).
═══════════════════════════════════════════════ */
import { RITMO } from './config.js';

const OTRO = { A: 'B', B: 'A' };
const LINEAS = ['por', 'def', 'med', 'del'];
const FASE_PODER = { posesion: 'control', ocasion_ataque: 'ataque', ocasion_defensa: 'ataque', tirador: 'tirador', chut: 'chut', parada: 'chut' };

// Una alineación congelada → { por: [id], def: [ids], med, del, banquillo } y las stats por id
function prepararAlineacion(al, stats, letra) {
  const fila = x => (Array.isArray(x) ? x : x ? [x] : []).filter(Boolean);
  const out = {};
  for (const l of LINEAS) out[l] = fila(al?.[l]).map(c => c.id);
  for (const c of [...LINEAS.flatMap(l => fila(al?.[l])), ...fila(al?.banquillo)]) {
    stats[c.id] = { ATA: c.ATA ?? c.ata ?? 0, DEF: c.DEF ?? c.def ?? 0, CON: c.CON ?? c.con ?? 0, nombre: c.nombre ?? '', equipo: letra };
  }
  return out;
}

// Cambia una carta por otra en la alineación (lesión con suplente o cambio del descanso)
function sustituir(al, sale, entra, hueco) {
  const lineas = hueco && al[hueco] ? [hueco] : LINEAS;
  for (const l of lineas) {
    const i = al[l].indexOf(sale);
    if (i >= 0) { al[l][i] = entra; return; }
  }
}

// Penaltis: [a, b] (fin_partido) o { goles: [a, b], tandas } (resultado del motor)
const golesTanda = x => (Array.isArray(x) ? [...x] : Array.isArray(x?.goles) ? [...x.goles] : null);

const versionMayor = v => Number(String(v ?? '2').split('.')[0]) || 2;

/**
 * partido: { id, version_motor, goles: [l, v], penaltis, pr }
 * alineaciones: { local, visitante } (las congeladas)
 * eventos: los del motor (simularPartido(…).eventos)
 * yo: id del equipo del usuario (va abajo y ataca hacia arriba; si no juega, el local), o null
 * equipos: { A: { id, nombre, dueno }, B: {…} } (se copian tal cual)
 * pr: puntos de rendimiento por carta (si el partido no los trae)
 */
export function crearGuion({ partido = {}, alineaciones = {}, eventos = [], yo = null, equipos = {}, pr = null }) {
  const stats = {};
  const al = { A: prepararAlineacion(alineaciones.local, stats, 'A'), B: prepararAlineacion(alineaciones.visitante, stats, 'B') };
  const abajo = yo && equipos.B?.id === yo ? 'B' : 'A';
  const guion = {
    version: partido.version_motor ?? null,
    partidoId: partido.id ?? null,
    lados: { abajo, arriba: OTRO[abajo] },
    equipos: { A: { ...(equipos.A ?? {}), letra: 'A' }, B: { ...(equipos.B ?? {}), letra: 'B' } },
    stats,
    escenas: [],
    final: null,
  };
  const marcador = [0, 0];
  const idx = l => (l === 'A' ? 0 : 1);
  let jugada = 0, minuto = 0;
  let poderes = [];                 // poderes ya mostrados, a la espera de su fase
  let tirador = null;               // escena del tirador, para darle la p del chut
  const descanso = { planB: [], cambios: [] };
  let tacticas = null, hayDescanso = false, posesiones = { A: 0, B: 0 };
  const penaltis = [];
  const mitad = Math.ceil(Math.max(1, ...eventos.map(e => (Number.isFinite(e?.jugada) ? e.jugada : 0))) / 2);

  const base = e => ({ jugada, minuto: e?.minuto ?? minuto, marcador: [...marcador] });
  const poner = esc => { guion.escenas.push(esc); return esc; };
  const deFase = fase => { const l = poderes.filter(p => p.fase === fase); poderes = poderes.filter(p => p.fase !== fase); return l; };
  const escenaDescanso = (e, sintetico) => {
    if (hayDescanso) return;
    hayDescanso = true;
    const total = posesiones.A + posesiones.B;
    poner({ tipo: 'descanso', ...base(e), jugada: e?.jugada ?? jugada,
      posesion: total ? { A: posesiones.A / total, B: posesiones.B / total } : { A: 0.5, B: 0.5 },
      planB: [...descanso.planB], cambios: [...descanso.cambios],
      tacticas: e?.tacticas ?? tacticas, sintetico });
  };

  poner({ tipo: 'inicio', jugada: 0, minuto: 0, marcador: [0, 0], tacticas: null });

  for (const e of eventos) {
    if (!e || typeof e !== 'object') continue;
    // Versiones sin evento de descanso (v1.x): se pone al empezar la segunda mitad
    if (versionMayor(guion.version) < 2 && !hayDescanso && e.tipo === 'inicio_jugada' && e.jugada === mitad + 1) escenaDescanso({ jugada: mitad, minuto }, true);
    switch (e.tipo) {
      case 'tacticas':
        tacticas = e.tacticas ?? null;
        guion.escenas[0].tacticas = tacticas;
        guion.escenas[0].cruce = e.cruce ?? null;
        break;
      case 'inicio_jugada':
        jugada = e.jugada; minuto = e.minuto ?? minuto;
        poderes = [];
        poner({ tipo: 'saque', ...base(e), equipo: e.saca });
        break;
      case 'poder': {
        const fase = FASE_PODER[e.momento];
        if (!fase || !e.equipo || !e.carta) break;
        const p = { equipo: e.equipo, carta: e.carta, poder: e.poder ?? '', momento: e.momento, fase };
        poderes.push(p);
        poner({ tipo: 'poder', ...base(e), ...p });
        break;
      }
      case 'posesion': {
        if (!e.saca || !e.ganador || !Number.isFinite(e.p)) break;
        const pGanador = e.ganador === e.saca ? e.p : 1 - e.p;
        posesiones[e.ganador]++;
        poner({ tipo: 'control', ...base(e), equipo: e.saca, saca: e.saca, ganador: e.ganador, p: e.p,
          pGanador, robo: e.ganador !== e.saca, sorpresa: pGanador < RITMO.SORPRESA_P, poderes: deFase('control') });
        if (e.ganador !== e.saca) poner({ tipo: 'robo', ...base(e), equipo: e.ganador });
        break;
      }
      case 'ocasion': {
        if (!e.equipo || !Number.isFinite(e.p)) break;
        const defensor = OTRO[e.equipo];
        const defensas = al[defensor].def.map(id => ({ carta: id, DEF: stats[id]?.DEF ?? 0 }));
        const datos = { equipo: e.equipo, defensor, defensas, p: e.p, exito: !!e.exito, contraataque: !!e.contraataque };
        poner({ tipo: 'ataque', ...base(e), ...datos, poderes: deFase('ataque') });
        poner({ tipo: e.exito ? 'pase' : 'corte', ...base(e), ...datos });
        break;
      }
      case 'tirador': {
        if (!e.equipo || !e.elegido) break;
        const candidatos = (e.candidatos ?? []).filter(c => c?.carta).map(c => ({ carta: c.carta, p: c.p ?? null }));
        if (!candidatos.some(c => c.carta === e.elegido)) candidatos.push({ carta: e.elegido, p: null });
        tirador = poner({ tipo: 'tirador', ...base(e), equipo: e.equipo, candidatos, elegido: e.elegido, poderes: deFase('tirador') });
        break;
      }
      case 'chut': {
        if (!e.equipo || !Number.isFinite(e.p)) break;
        const datos = { equipo: e.equipo, defensor: OTRO[e.equipo], tirador: e.tirador, portero: e.portero, p: e.p, gol: !!e.gol };
        if (tirador && tirador.jugada === jugada) tirador.p = e.p;
        poner({ tipo: 'chut', ...base(e), ...datos, poderes: deFase('chut') });
        if (e.gol) {
          const antes = [...marcador];
          marcador[idx(e.equipo)]++;
          poner({ tipo: 'gol', ...base(e), marcador: antes, marcadorTras: [...marcador], ...datos });
        } else {
          poner({ tipo: 'parada', ...base(e), ...datos });
        }
        break;
      }
      case 'lesion':
        if (!e.equipo || !e.carta) break;
        poner({ tipo: 'lesion', ...base(e), equipo: e.equipo, carta: e.carta, suplente: e.suplente ?? null });
        if (e.suplente) sustituir(al[e.equipo], e.carta, e.suplente, e.hueco);
        break;
      case 'plan_b':
        if (e.equipo) descanso.planB.push({ equipo: e.equipo, de: e.de, a: e.a, condicion: e.condicion ?? null });
        break;
      case 'cambio':
        if (!e.equipo || !e.sale || !e.entra) break;
        descanso.cambios.push({ equipo: e.equipo, sale: e.sale, entra: e.entra, motivo: e.motivo ?? null });
        sustituir(al[e.equipo], e.sale, e.entra, e.hueco);
        break;
      case 'descanso':
        escenaDescanso(e, false);
        break;
      case 'penalti':
        if (e.equipo) penaltis.push({ equipo: e.equipo, lanzador: e.lanzador, gol: !!e.gol });
        break;
      case 'fin_partido':
        guion.final = { goles: Array.isArray(e.goles) ? [...e.goles] : [...marcador], penaltis: golesTanda(e.penaltis) };
        break;
      default:
        break;   // cansancio y cualquier evento que no se conozca: no se anima
    }
  }

  // Final: resultado (el del partido si lo trae), la tanda y la mejor carta (más PR)
  const goles = Array.isArray(partido.goles) && partido.goles.every(Number.isFinite) ? [...partido.goles] : guion.final?.goles ?? [...marcador];
  const puntos = partido.pr ?? pr ?? {};
  let mejor = null;
  for (const [id, v] of Object.entries(puntos)) {
    if (Number.isFinite(v) && (!mejor || v > mejor.pr)) mejor = { carta: id, pr: v, equipo: stats[id]?.equipo ?? null };
  }
  const tanda = penaltis.length ? penaltis : null;
  guion.final = { goles, marcadorGuion: [...marcador], penaltis: guion.final?.penaltis ?? golesTanda(partido.penaltis), tanda, mejor };
  poner({ tipo: 'final', jugada: guion.escenas.at(-1)?.jugada ?? jugada, minuto: 90, marcador: [...marcador], ...guion.final });
  return guion;
}

// Jugadas del guion (para el reloj y los tests): { jugada: [escenas] }
export function porJugada(guion) {
  const m = new Map();
  for (const e of guion.escenas) {
    if (!m.has(e.jugada)) m.set(e.jugada, []);
    m.get(e.jugada).push(e);
  }
  return m;
}
