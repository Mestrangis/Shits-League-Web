/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — motor de partido v1.1.0
   Especificación: "Liga de Bolsillo — Especificación del juego", sección 5,
   con las decisiones de docs/slr/DECISIONES.md.

   Módulo ES puro y determinista: mismo resultado en navegador, Node y Deno.
   Sin efectos secundarios (no toca el DOM, no hace fetch, no escribe nada).
   Para que el resultado sea idéntico en cualquier motor JS solo se usan
   +, -, *, /, Math.floor, Math.round, Math.min, Math.max y, dentro del PRNG,
   operaciones enteras exactas (Math.imul y operadores de bits).
   Nada de Math.random, Math.pow, Math.exp, Math.log ni **.

   Este archivo NO se modifica una vez publicado: los partidos guardan la
   versión con la que se simularon. Cambiar reglas = archivo nuevo
   (motor-v1.2.0.js…) y regenerar el test dorado.

   Cambios respecto a v1.0.0 (que se retiró sin haberse jugado ningún partido):
   - El duelo de posesión es lineal, P = A / (A + B) (CONFIG.POSESION_K = 1).
     Ocasión, chut y penaltis siguen con el duelo cuadrático (k = 2).
═══════════════════════════════════════════════ */

export const VERSION = '1.1.0';

function congelar(obj) {
  for (const v of Object.values(obj)) if (v && typeof v === 'object') congelar(v);
  return Object.freeze(obj);
}

export const CONFIG = congelar({
  JUGADAS:               10,
  // Exponente del duelo de posesión: 1 = lineal A/(A+B), 2 = cuadrático como el
  // resto de duelos. Con k = 2 un tercer medio daba demasiada posesión y las
  // formaciones de 3 medios dominaban (ver docs/slr/DECISIONES.md).
  POSESION_K:            1,
  PESOS_LINEA:           [1.0, 0.7, 0.5],  // del cuarto valor en adelante no suman
  PESO_MED_OCASION:      0.3,              // los MED aportan el 30 % de su ATA/DEF a la ocasión
  BONUS_CONTRAATAQUE:    1.15,
  PESO_TIRADOR:          { med: 0.5, del: 1 },
  MULT_CAPITAN:          1.5,              // sobre la probabilidad de sus poderes, tope 1
  LESION_PROB:           0.0005,           // por carta y jugada
  LESION_FACTOR:         0.7,              // stats si no hay suplente
  MAX_CAMBIOS:           3,
  CANSANCIO_BASE:        0.02,             // + CANSANCIO_POR_JUGADA × jugada
  CANSANCIO_POR_JUGADA:  0.01,
  CANSANCIO_PERDIDA:     4,
  STAT_MINIMA:           1,
  PENALTIS_POR_EQUIPO:   5,
  PENALTI_FACTOR_PORTERO: 0.55,
  PR: {
    TIRADOR:        1,
    GOL:            3,   // adicionales al de tirador
    PARADA:         2,
    GOL_ENCAJADO:  -1,
    POSESION:       1,   // repartido entre los MED por CON
    CORTE:          1,   // repartido entre los DEF por DEF
  },
  FORMACIONES: ['2-2-2', '3-2-1', '1-3-2', '2-3-1', '1-2-3'],
  PRONOSTICO_SIMULACIONES: 200,
});

const EQUIPOS      = ['A', 'B'];
const LINEAS_CAMPO = ['def', 'med', 'del'];
const STAT_HUECO   = { por: 'DEF', def: 'DEF', med: 'CON', del: 'ATA' };
const STATS        = ['ATA', 'DEF', 'CON']; // índice del sorteo de cansancio: 0 ATA, 1 DEF, 2 CON

/* ── Primitivas ──────────────────────────────────────────────────────────── */

// PRNG mulberry32: devuelve una función que da números en [0, 1).
// La semilla se normaliza a entero de 32 bits sin signo.
export function mulberry32(semilla) {
  let estado = semilla >>> 0;
  return function () {
    estado = (estado + 0x6D2B79F5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Probabilidad de que gane la fuerza a contra la b (exponente k = 2).
export function duelo(a, b) {
  const a2 = a * a, b2 = b * b;
  return a2 / (a2 + b2);
}

// Duelo lineal (posesión): probabilidad de que gane la fuerza a contra la b, k = 1.
export function dueloLineal(a, b) {
  return a / (a + b);
}

// Duelo de posesión según CONFIG.POSESION_K (solo se admiten 1 y 2: el motor
// no puede usar potencias genéricas sin perder el determinismo)
const dueloPosesion = { 1: dueloLineal, 2: duelo }[CONFIG.POSESION_K];
if (!dueloPosesion) throw new Error(`[motor] POSESION_K no soportado: ${CONFIG.POSESION_K}`);

// Fuerza de una línea: valores de mayor a menor con pesos 1,0 / 0,7 / 0,5.
// No muta el array recibido.
export function linea(valores) {
  const v = valores.slice().sort((x, y) => y - x);
  const pesos = CONFIG.PESOS_LINEA;
  let total = 0;
  for (let i = 0; i < v.length && i < pesos.length; i++) total += v[i] * pesos[i];
  return total;
}

// Fuerzas base de una alineación (sin poderes ni bonus de contraataque).
export function fuerzaPosesion(eq) {
  return linea(eq.med.map(c => c.CON));
}

export function fuerzaAtaque(eq) {
  return linea([
    ...eq.del.map(c => c.ATA),
    ...eq.med.map(c => CONFIG.PESO_MED_OCASION * c.ATA),
  ]);
}

export function fuerzaDefensa(eq) {
  return linea([
    ...eq.def.map(c => c.DEF),
    ...eq.med.map(c => CONFIG.PESO_MED_OCASION * c.DEF),
  ]);
}

// Ruleta del tirador. Candidatos en orden de hueco (MED y luego DEL).
// multiplicadores: { idCarta: factor } por poderes "tirador" activos.
// Devuelve [{ id, papeletas, p }].
export function probabilidadesTirador(eq, multiplicadores = {}) {
  const candidatos = [
    ...eq.med.map(c => ({ carta: c, peso: CONFIG.PESO_TIRADOR.med })),
    ...eq.del.map(c => ({ carta: c, peso: CONFIG.PESO_TIRADOR.del })),
  ].map(({ carta, peso }) => ({
    id: carta.id,
    papeletas: carta.ATA * carta.ATA * peso * (multiplicadores[carta.id] ?? 1),
  }));
  let total = 0;
  for (const c of candidatos) total += c.papeletas;
  return candidatos.map(c => ({ ...c, p: c.papeletas / total }));
}

/* ── Preparación de equipos ──────────────────────────────────────────────── */

function copiarCarta(c) {
  return {
    id: c.id,
    nombre: c.nombre,
    ATA: c.ATA,
    DEF: c.DEF,
    CON: c.CON,
    poderes: (c.poderes || []).map(p => ({ ...p })),
    lesionado: false, // lesionado sin suplente: ya juega al 70 %
  };
}

function validarAlineacion(al, letra) {
  const error = msg => { throw new Error(`[motor] Alineación ${letra}: ${msg}`); };
  if (!al || typeof al !== 'object') error('falta la alineación');
  if (!CONFIG.FORMACIONES.includes(al.formacion)) error(`formación no permitida "${al.formacion}"`);
  const [nDef, nMed, nDel] = al.formacion.split('-').map(Number);
  if (!al.por) error('falta el portero');
  if (!Array.isArray(al.def) || al.def.length !== nDef) error(`la formación ${al.formacion} pide ${nDef} DEF`);
  if (!Array.isArray(al.med) || al.med.length !== nMed) error(`la formación ${al.formacion} pide ${nMed} MED`);
  if (!Array.isArray(al.del) || al.del.length !== nDel) error(`la formación ${al.formacion} pide ${nDel} DEL`);
  const titulares = [al.por, ...al.def, ...al.med, ...al.del];
  for (const c of [...titulares, ...(al.banquillo || [])]) {
    for (const s of STATS) {
      if (!Number.isInteger(c[s]) || c[s] < 1) error(`la carta ${c.id} tiene ${s} no válida (${c[s]})`);
    }
  }
  const ids = [...titulares, ...(al.banquillo || [])].map(c => c.id);
  if (new Set(ids).size !== ids.length) error('hay cartas repetidas');
}

function prepararEquipo(al, letra) {
  validarAlineacion(al, letra);
  return {
    letra,
    por: [copiarCarta(al.por)], // como array para tratar todos los huecos igual
    def: al.def.map(copiarCarta),
    med: al.med.map(copiarCarta),
    del: al.del.map(copiarCarta),
    banquillo: (al.banquillo || []).map(copiarCarta),
    usados: new Array((al.banquillo || []).length).fill(false),
    cambios: 0,
    ordenManual: !!al.orden_manual,
    capitanId: al.capitan_id ?? null,
  };
}

// Titulares en el campo en orden de hueco: POR, DEF, MED, DEL y por array.
function enCampo(eq) {
  const out = [];
  for (const hueco of ['por', ...LINEAS_CAMPO]) {
    eq[hueco].forEach((carta, i) => out.push({ hueco, i, carta }));
  }
  return out;
}

// Vista con la forma de una alineación para las funciones de fuerza
function vista(eq) {
  return { por: eq.por[0], def: eq.def, med: eq.med, del: eq.del };
}

/* ── Partido ─────────────────────────────────────────────────────────────── */

export function simularPartido(A, B, semilla, opciones = {}) {
  const modo = opciones.modo ?? 'liga';
  if (modo !== 'liga' && modo !== 'copa') throw new Error(`[motor] modo desconocido "${modo}"`);

  const rng = mulberry32(semilla);
  const eq = [prepararEquipo(A, 'A'), prepararEquipo(B, 'B')];
  const goles = [0, 0];
  const eventos = [];
  const pr = {};
  const est = { posesiones: [0, 0], ocasiones: [0, 0], cortes: [0, 0], tiros: [0, 0], goles: [0, 0], paradas: [0, 0] };

  let jugada = 0, minuto = 0;
  const emitir = (tipo, datos) => eventos.push({ jugada, minuto, tipo, ...datos });

  const sumarPR = (id, v) => { pr[id] = (pr[id] ?? 0) + v; };
  for (const e of eq) for (const { carta } of enCampo(e)) pr[carta.id] = 0;

  // Reparte puntos entre las cartas de un hueco en proporción a una stat
  function repartirPR(cartas, stat, puntos) {
    let total = 0;
    for (const c of cartas) total += c[stat];
    for (const c of cartas) sumarPR(c.id, puntos * c[stat] / total);
  }

  // Sortea (o aplica si es "siempre") un poder. Emite el evento si se activa.
  function comprobarPoder(e, carta, poder) {
    let activo;
    if (poder.probabilidad === 'siempre') {
      activo = true;
    } else {
      let prob = poder.probabilidad;
      if (carta.id === e.capitanId) prob = Math.min(1, prob * CONFIG.MULT_CAPITAN);
      activo = rng() < prob;
    }
    if (activo) emitir('poder', { equipo: e.letra, carta: carta.id, poder: poder.nombre, momento: poder.momento });
    return activo;
  }

  // Multiplicador (1+e1)·(1+e2)… de los poderes de un momento en las cartas dadas
  function multiplicador(e, cartas, momento) {
    let mult = 1;
    for (const carta of cartas) {
      for (const poder of carta.poderes) {
        if (poder.momento === momento && comprobarPoder(e, carta, poder)) mult *= 1 + poder.efecto;
      }
    }
    return mult;
  }

  const titulares = e => enCampo(e).map(x => x.carta);

  for (jugada = 1; jugada <= CONFIG.JUGADAS; jugada++) {
    const saca = jugada % 2 === 1 ? 0 : 1, rival = 1 - saca;

    // 1. Minuto (estético)
    minuto = Math.min(90, (jugada - 1) * 9 + 2 + Math.floor(rng() * 7));
    emitir('inicio_jugada', { saca: EQUIPOS[saca] });

    // 2-3. Posesión: poderes de A y luego de B, después el duelo
    const fPos = [0, 1].map(i => fuerzaPosesion(vista(eq[i])) * multiplicador(eq[i], titulares(eq[i]), 'posesion'));
    const pSaca = dueloPosesion(fPos[saca], fPos[rival]);
    const ganaSaca = rng() < pSaca;
    const ata = ganaSaca ? saca : rival, def = 1 - ata, contra = !ganaSaca;
    emitir('posesion', {
      saca: EQUIPOS[saca], fuerzas: fPos, p: pSaca, ganador: EQUIPOS[ata], contraataque: contra,
    });
    est.posesiones[ata]++;
    repartirPR(eq[ata].med, 'CON', CONFIG.PR.POSESION);

    // 4-5. Ocasión
    const multAta = multiplicador(eq[ata], titulares(eq[ata]), 'ocasion_ataque');
    const multDef = multiplicador(eq[def], titulares(eq[def]), 'ocasion_defensa');
    let fAta = fuerzaAtaque(vista(eq[ata]));
    if (contra) fAta *= CONFIG.BONUS_CONTRAATAQUE;
    fAta *= multAta;
    const fDef = fuerzaDefensa(vista(eq[def])) * multDef;
    const pOcasion = duelo(fAta, fDef);
    const llegan = rng() < pOcasion;
    emitir('ocasion', {
      equipo: EQUIPOS[ata], fuerzaAtaque: fAta, fuerzaDefensa: fDef, p: pOcasion,
      exito: llegan, contraataque: contra,
    });

    if (!llegan) {
      est.cortes[def]++;
      repartirPR(eq[def].def, 'DEF', CONFIG.PR.CORTE);
    } else {
      est.ocasiones[ata]++;

      // 6. Poderes "tirador" (los "siempre" sin sortear), en orden MED y DEL
      const multTirador = {};
      for (const carta of [...eq[ata].med, ...eq[ata].del]) {
        for (const poder of carta.poderes) {
          if (poder.momento === 'tirador' && comprobarPoder(eq[ata], carta, poder)) {
            multTirador[carta.id] = (multTirador[carta.id] ?? 1) * poder.efecto;
          }
        }
      }

      // 7. Elección del tirador con un solo número
      const ruleta = probabilidadesTirador(vista(eq[ata]), multTirador);
      const objetivo = rng();
      let acumulado = 0, elegido = ruleta[ruleta.length - 1];
      for (const c of ruleta) {
        acumulado += c.p;
        if (objetivo < acumulado) { elegido = c; break; }
      }
      const tirador = [...eq[ata].med, ...eq[ata].del].find(c => c.id === elegido.id);
      emitir('tirador', {
        equipo: EQUIPOS[ata], candidatos: ruleta.map(c => ({ carta: c.id, p: c.p })), elegido: tirador.id,
      });
      est.tiros[ata]++;
      sumarPR(tirador.id, CONFIG.PR.TIRADOR);

      // 8-10. Chut: poderes del tirador, luego del portero, luego el duelo
      const portero = eq[def].por[0];
      const ataEf = tirador.ATA * multiplicador(eq[ata], [tirador], 'chut');
      const defEf = portero.DEF * multiplicador(eq[def], [portero], 'parada');
      const pGol = duelo(ataEf, defEf);
      const gol = rng() < pGol;
      emitir('chut', {
        equipo: EQUIPOS[ata], tirador: tirador.id, portero: portero.id,
        ata: ataEf, def: defEf, p: pGol, gol,
      });
      if (gol) {
        goles[ata]++;
        est.goles[ata]++;
        sumarPR(tirador.id, CONFIG.PR.GOL);
        sumarPR(portero.id, CONFIG.PR.GOL_ENCAJADO);
      } else {
        est.paradas[def]++;
        sumarPR(portero.id, CONFIG.PR.PARADA);
      }
    }

    // 11. Cansancio y lesiones sobre una foto de los titulares
    for (const e of eq) {
      for (const { hueco, i, carta } of enCampo(e)) {
        if (rng() < CONFIG.LESION_PROB) {
          lesionar(e, hueco, i, carta);
          continue;
        }
        if (rng() < CONFIG.CANSANCIO_BASE + CONFIG.CANSANCIO_POR_JUGADA * jugada) {
          const stat = STATS[Math.floor(rng() * 3)];
          carta[stat] = Math.max(CONFIG.STAT_MINIMA, carta[stat] - CONFIG.CANSANCIO_PERDIDA);
          emitir('cansancio', { equipo: e.letra, carta: carta.id, stat, valor: carta[stat] });
        }
      }
    }
  }

  function lesionar(e, hueco, i, carta) {
    if (carta.lesionado) return; // ya lesionado sin suplente: el número se consume y no pasa nada

    const suplente = e.cambios < CONFIG.MAX_CAMBIOS ? elegirSuplente(e, hueco) : -1;
    if (suplente >= 0) {
      const entra = { ...e.banquillo[suplente], poderes: e.banquillo[suplente].poderes.map(p => ({ ...p })) };
      e.usados[suplente] = true;
      e.cambios++;
      e[hueco][i] = entra;
      if (!(entra.id in pr)) pr[entra.id] = 0;
      emitir('lesion', { equipo: e.letra, carta: carta.id, suplente: entra.id, hueco });
    } else {
      for (const s of STATS) {
        carta[s] = Math.max(CONFIG.STAT_MINIMA, Math.round(carta[s] * CONFIG.LESION_FACTOR));
      }
      carta.lesionado = true;
      emitir('lesion', { equipo: e.letra, carta: carta.id, suplente: null, hueco });
    }
  }

  // Índice del suplente que entra o -1. Manual: el primero sin usar.
  // Automático: el de stat más alta para el hueco; en empate, el primero.
  function elegirSuplente(e, hueco) {
    let mejor = -1;
    for (let k = 0; k < e.banquillo.length; k++) {
      if (e.usados[k]) continue;
      if (e.ordenManual) return k;
      const stat = STAT_HUECO[hueco];
      if (mejor < 0 || e.banquillo[k][stat] > e.banquillo[mejor][stat]) mejor = k;
    }
    return mejor;
  }

  // Copa: penaltis si hay empate
  let penaltis = null;
  if (modo === 'copa' && goles[0] === goles[1]) {
    jugada = null; // la tanda no pertenece a ninguna jugada
    minuto = 90;
    penaltis = tandaPenaltis(eq, rng, emitir);
  }

  jugada = CONFIG.JUGADAS;
  minuto = 90;
  emitir('fin_partido', {
    goles: [...goles],
    penaltis: penaltis ? [...penaltis.goles] : null,
    estadisticas: copiarEstadisticas(est),
  });

  return {
    version: VERSION,
    goles,
    penaltis,
    eventos,
    pr,
    estadisticas: est,
  };
}

function copiarEstadisticas(est) {
  const out = {};
  for (const [k, v] of Object.entries(est)) out[k] = [...v];
  return out;
}

// Lanzadores: DEL y MED en el campo por ATA descendente (empate: orden de hueco).
function ordenLanzadores(e) {
  return [...e.med, ...e.del]
    .map((carta, orden) => ({ carta, orden }))
    .sort((x, y) => (y.carta.ATA - x.carta.ATA) || (x.orden - y.orden))
    .map(x => x.carta);
}

function tandaPenaltis(eq, rng, emitir) {
  const lanzadores = eq.map(ordenLanzadores);
  const goles = [0, 0], tirados = [0, 0], tandas = [];
  const N = CONFIG.PENALTIS_POR_EQUIPO;

  function tirar(i, ronda) {
    const lanzador = lanzadores[i][tirados[i] % lanzadores[i].length];
    const portero = eq[1 - i].por[0];
    const defEf = CONFIG.PENALTI_FACTOR_PORTERO * portero.DEF;
    const p = duelo(lanzador.ATA, defEf);
    const gol = rng() < p;
    tirados[i]++;
    if (gol) goles[i]++;
    tandas.push({ ronda, equipo: EQUIPOS[i], lanzador: lanzador.id, gol });
    emitir('penalti', {
      ronda, equipo: EQUIPOS[i], lanzador: lanzador.id, portero: portero.id,
      ata: lanzador.ATA, def: defEf, p, gol,
    });
  }

  // Decidida si uno ya no alcanza al otro aunque marque todos los que le quedan
  const decidida = () =>
    goles[0] + (N - tirados[0]) < goles[1] || goles[1] + (N - tirados[1]) < goles[0];

  serie:
  for (let ronda = 1; ronda <= N; ronda++) {
    for (const i of [0, 1]) {
      tirar(i, ronda);
      if (decidida()) break serie;
    }
  }

  // Muerte súbita por parejas
  for (let ronda = N + 1; goles[0] === goles[1]; ronda++) {
    tirar(0, ronda);
    tirar(1, ronda);
  }

  return { goles, tandas };
}

/* ── Pronóstico ──────────────────────────────────────────────────────────── */

// Simula el cruce n veces con las semillas (semilla + i) >>> 0, i = 1..n.
// prEsperado: media de PR por carta (0 en las simulaciones en que no juega).
export function simularPronostico(A, B, semilla, n = CONFIG.PRONOSTICO_SIMULACIONES) {
  let ganaA = 0, empate = 0, ganaB = 0;
  const sumaPR = {};
  for (let i = 1; i <= n; i++) {
    const r = simularPartido(A, B, (semilla + i) >>> 0);
    if (r.goles[0] > r.goles[1]) ganaA++;
    else if (r.goles[0] < r.goles[1]) ganaB++;
    else empate++;
    for (const [id, v] of Object.entries(r.pr)) sumaPR[id] = (sumaPR[id] ?? 0) + v;
  }
  const prEsperado = {};
  for (const [id, v] of Object.entries(sumaPR)) prEsperado[id] = v / n;
  return { pA: ganaA / n, pEmpate: empate / n, pB: ganaB / n, prEsperado };
}
