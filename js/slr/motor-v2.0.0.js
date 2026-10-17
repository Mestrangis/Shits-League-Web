/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — motor de partido v1.3.0
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

   Cambios respecto a v1.3.0 (las versiones anteriores siguen publicadas: cada
   partido se reproduce con la suya). Poderes, duelos, pesos, saque, cansancio
   dentro del partido y lesiones, igual que en la v1.3.0.
   a) TÁCTICAS. Cada alineación lleva `tactica`: posesion | contraataque |
      presion (por defecto posesion), una por tramo (jugadas 1–5 y 6–10).
      · Posesión: fuerza de posesión ×1,06; sus contraataques sin bonus (×1,0).
      · Contraataque: sus contraataques ×1,25 (en vez de ×1,15) y su fuerza de
        defensa ×1,04 (bloque bajo).
      · Presión: cuando saca el RIVAL, su fuerza de posesión ×1,06. (Cansa un
        30 % más entre jornadas: eso se gestiona fuera del motor.)
      · Cruce: contraataque gana a posesión, posesión a presión y presión a
        contraataque. Quien gana el cruce: fuerzas de posesión, ataque y
        defensa ×1,06. Misma táctica: nada.
      · Plan B (opcional): plan_b = { condicion: ganando | empatando |
        perdiendo, tactica }. Se mira al descanso (tras la jugada 5) y, si se
        cumple, el equipo juega las jugadas 6–10 con esa táctica.
   b) TÁCTICA FAVORITA. Cada carta puede traer `tactica_favorita`. Si su equipo
      juega esa táctica en el tramo actual, sus ATA/DEF/CON ×1,05 (redondeo).
      Se recalcula al descanso (plan B o cambios).
   c) SINERGIAS DE COLECCIÓN. Titulares en el campo con la misma
      `coleccion_id` (sin colección no cuentan); por la colección más numerosa:
      2 → ×1,02, 3 → ×1,04, 4 o más → ×1,06 a las fuerzas de posesión, ataque
      y defensa. Se recalcula en cada jugada (cambios y lesiones incluidos).
   d) ENERGÍA. Cada carta llega con `energia` (0–100). El multiplicador de sus
      stats (≥70 ×1,00 · 50–69 ×0,95 · 30–49 ×0,88 · <30 ×0,75) se aplica FUERA
      del motor, al congelar la alineación (como "tocada"): aplicarEnergia().
      Dentro, la energía solo decide los cambios del descanso.
   e) CAMBIOS EN EL DESCANSO (tras la jugada 5, antes de la 6), dentro del
      máximo de 3 cambios del partido (con las lesiones):
      · gestion: reservon (salen los 2 titulares con menos energía, por los
        mejores suplentes para su hueco) | normal (sale 1 si algún titular
        tiene energía < 50, el de menos) | a_tope (ninguno). Por defecto normal.
      · cambios_avanzados (si existe, sustituye a gestion): hasta 3
        { sale, entra, condicion: siempre | ganando | empatando | perdiendo |
        energia_menor, umbral? }, en orden.
      Primero el plan B de A y de B, luego los cambios de A y de B.
      Eventos 'descanso', 'plan_b' y 'cambio' (con su motivo).
   f) El resultado añade: tacticas (por equipo y tramo), cruce (por tramo),
      plan_b (si se activó), participacion (completo / parcial por equipo) y
      cambios_descanso.
   El descanso no consume números del PRNG: el orden es el de la v1.3.0.
═══════════════════════════════════════════════ */

export const VERSION = '2.0.0';

function congelar(obj) {
  for (const v of Object.values(obj)) if (v && typeof v === 'object') congelar(v);
  return Object.freeze(obj);
}

export const CONFIG = congelar({
  JUGADAS:               10,
  // Exponente de los duelos de posesión, ocasión y chut: P = a^k / (a^k + b^k).
  // Con k = 3 el mejor equipo gana más a menudo (con k = 1 / 2 el partido era
  // casi una moneda; ver docs/slr/DECISIONES.md). Solo se admiten 2 y 3.
  EXPONENTE_DUELO:       3,
  PESOS_LINEA:           [1.0, 0.7, 0.5],  // ataque y defensa; del cuarto valor en adelante no suman
  // Posesión: el tercer medio pesa poco para que las formaciones de 3 medios no dominen
  PESOS_LINEA_POSESION:  [1.0, 0.7, 0.2],
  BONUS_SAQUE:           1.15,             // fuerza de posesión del que saca, tras sus poderes
  MAX_ACTIVACIONES:      3,                // veces que puede activarse un poder en un partido
  REPARTO_COMPAT:        [1, 2.5, 6],      // sin `probabilidades`: [p, p/2,5, p/6]
  MAX_PODERES_JUGADA:    2,                // activaciones por jugada entre los dos equipos
  TOPE_PROB_CAPITAN:     0.95,
  PESO_MED_OCASION:      0.3,              // los MED aportan el 30 % de su ATA/DEF a la ocasión
  BONUS_CONTRAATAQUE:    1.15,
  PESO_TIRADOR:          { med: 0.5, del: 1 },
  MULT_CAPITAN:          1.5,              // sobre las probabilidades de sus poderes, tope TOPE_PROB_CAPITAN
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
  // ── v2.0.0 ──
  TACTICAS:              ['posesion', 'contraataque', 'presion'],
  TACTICA_DEFECTO:       'posesion',
  TACTICA_POSESION:      1.06,            // posesión: su fuerza de posesión
  CONTRAATAQUE_POSESION: 1.0,             // posesión: sus contraataques, sin bonus
  CONTRAATAQUE_CONTRA:   1.25,            // contraataque: sus contraataques
  DEFENSA_CONTRA:        1.04,            // contraataque: su fuerza de defensa (bloque bajo)
  PRESION_ROBO:          1.06,            // presión: su posesión cuando saca el rival
  GANA_A:                { contraataque: 'posesion', posesion: 'presion', presion: 'contraataque' },
  BONUS_CRUCE:           1.06,            // posesión, ataque y defensa de quien gana el cruce
  JUGADA_DESCANSO:       5,
  MULT_TACTICA_FAVORITA: 1.05,
  SINERGIA:              [1, 1, 1.02, 1.04, 1.06],   // por cartas de la misma colección (4 o más: la última)
  ENERGIA:               [[70, 1], [50, 0.95], [30, 0.88], [0, 0.75]],   // [desde, factor]
  ENERGIA_POR_DEFECTO:   100,
  GESTIONES:             ['reservon', 'normal', 'a_tope'],
  GESTION_DEFECTO:       'normal',
  CAMBIOS_RESERVON:      2,
  ENERGIA_CAMBIO_NORMAL: 50,
  MAX_CAMBIOS_AVANZADOS: 3,
  CONDICIONES_PLAN_B:    ['ganando', 'empatando', 'perdiendo'],
  CONDICIONES_CAMBIO:    ['siempre', 'ganando', 'empatando', 'perdiendo', 'energia_menor'],
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

// Duelo cúbico: probabilidad de que gane la fuerza a contra la b, k = 3.
export function dueloCubico(a, b) {
  const a3 = a * a * a, b3 = b * b * b;
  return a3 / (a3 + b3);
}

// Duelo cuadrático, k = 2 (penaltis).
export function dueloCuadratico(a, b) {
  const a2 = a * a, b2 = b * b;
  return a2 / (a2 + b2);
}

// Duelo de posesión, ocasión y chut según CONFIG.EXPONENTE_DUELO (solo 2 y 3:
// el motor no puede usar potencias genéricas sin perder el determinismo)
export const duelo = { 2: dueloCuadratico, 3: dueloCubico }[CONFIG.EXPONENTE_DUELO];
if (!duelo) throw new Error(`[motor] EXPONENTE_DUELO no soportado: ${CONFIG.EXPONENTE_DUELO}`);

// Fuerza de una línea: valores de mayor a menor con los pesos dados
// (por defecto 1,0 / 0,7 / 0,5). No muta el array recibido.
export function linea(valores, pesos = CONFIG.PESOS_LINEA) {
  const v = valores.slice().sort((x, y) => y - x);
  let total = 0;
  for (let i = 0; i < v.length && i < pesos.length; i++) total += v[i] * pesos[i];
  return total;
}

// Fuerzas base de una alineación (sin poderes ni bonus de saque o contraataque).
export function fuerzaPosesion(eq) {
  return linea(eq.med.map(c => c.CON), CONFIG.PESOS_LINEA_POSESION);
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

// Probabilidades [p1, p2, p3] de que un poder se active al menos 1, 2 y 3 veces.
// Sin `probabilidades`, a partir de `probabilidad` (compatibilidad). Capitán:
// las tres × 1,5 con tope 0,95. Se fuerza p1 ≥ p2 ≥ p3.
export function probabilidadesPoder(poder, capitan = false) {
  const base = Array.isArray(poder.probabilidades)
    ? poder.probabilidades
    : CONFIG.REPARTO_COMPAT.map(d => poder.probabilidad / d);
  const out = [];
  for (let k = 0; k < CONFIG.MAX_ACTIVACIONES; k++) {
    let p = Math.max(0, base[k] ?? 0);
    if (capitan) p = Math.min(CONFIG.TOPE_PROB_CAPITAN, p * CONFIG.MULT_CAPITAN);
    if (k > 0) p = Math.min(p, out[k - 1]);
    out.push(p);
  }
  return out;
}

// Activaciones programadas que se esperan de un poder: p1 + p2 + p3
export const activacionesEsperadas = (poder, capitan = false) =>
  probabilidadesPoder(poder, capitan).reduce((s, p) => s + p, 0);

/* ── Energía, tácticas y sinergias ───────────────────────────────────────── */

// Multiplicador de las stats según la energía (0–100)
export function factorEnergia(energia = CONFIG.ENERGIA_POR_DEFECTO) {
  for (const [desde, f] of CONFIG.ENERGIA) if (energia >= desde) return f;
  return CONFIG.ENERGIA[CONFIG.ENERGIA.length - 1][1];
}

// La carta con sus stats multiplicadas por la energía, redondeadas (mínimo 1).
// Se usa al congelar la alineación, igual que "tocada"; el motor no la aplica.
export function aplicarEnergia(carta) {
  const f = factorEnergia(carta.energia ?? CONFIG.ENERGIA_POR_DEFECTO);
  if (f === 1) return { ...carta };
  const out = { ...carta };
  for (const s of STATS) out[s] = Math.max(CONFIG.STAT_MINIMA, Math.round(carta[s] * f));
  return out;
}

// Quién gana el cruce de tácticas: 0 (la primera), 1 (la segunda) o null
export function ganaCruce(t0, t1) {
  if (t0 === t1) return null;
  if (CONFIG.GANA_A[t0] === t1) return 0;
  if (CONFIG.GANA_A[t1] === t0) return 1;
  return null;
}

// Sinergia de un once: la colección más numerosa entre los titulares
// → { coleccion, cartas, mult } (mult 1 si no hay al menos 2)
export function sinergia(cartas) {
  const cuenta = new Map();
  for (const c of cartas) if (c.coleccion_id != null) cuenta.set(c.coleccion_id, (cuenta.get(c.coleccion_id) ?? 0) + 1);
  let coleccion = null, n = 0;
  for (const [k, v] of cuenta) if (v > n) { coleccion = k; n = v; }   // empate: la primera en aparecer
  const mult = CONFIG.SINERGIA[Math.min(n, CONFIG.SINERGIA.length - 1)];
  return { coleccion: n >= 2 ? coleccion : null, cartas: n >= 2 ? n : 0, mult };
}

/* ── Preparación de equipos ──────────────────────────────────────────────── */

function copiarCarta(c) {
  return {
    id: c.id,
    nombre: c.nombre,
    ATA: c.ATA,
    DEF: c.DEF,
    CON: c.CON,
    // Stats sin la táctica favorita: el cansancio y las lesiones van aquí y las
    // de juego (ATA/DEF/CON) se recalculan con refrescar()
    base: { ATA: c.ATA, DEF: c.DEF, CON: c.CON },
    energia: c.energia ?? CONFIG.ENERGIA_POR_DEFECTO,
    tactica_favorita: c.tactica_favorita ?? null,
    coleccion_id: c.coleccion_id ?? null,
    poderes: (c.poderes || []).map(p => ({ ...p })),
    lesionado: false, // lesionado sin suplente: ya juega al 70 %
  };
}

// Stats de juego = base × 1,05 si su equipo juega su táctica favorita
function refrescar(carta, tactica) {
  const fav = carta.tactica_favorita != null && carta.tactica_favorita === tactica;
  for (const s of STATS) {
    carta[s] = fav ? Math.max(CONFIG.STAT_MINIMA, Math.round(carta.base[s] * CONFIG.MULT_TACTICA_FAVORITA)) : carta.base[s];
  }
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
  for (const c of [...titulares, ...(al.banquillo || [])]) {
    if (c.energia != null && !(Number.isFinite(c.energia) && c.energia >= 0 && c.energia <= 100)) error(`la carta ${c.id} tiene energía no válida (${c.energia})`);
    if (c.tactica_favorita != null && !CONFIG.TACTICAS.includes(c.tactica_favorita)) error(`la carta ${c.id} tiene táctica favorita no válida (${c.tactica_favorita})`);
  }
  if (al.tactica != null && !CONFIG.TACTICAS.includes(al.tactica)) error(`táctica no válida "${al.tactica}"`);
  if (al.plan_b != null) {
    if (!CONFIG.CONDICIONES_PLAN_B.includes(al.plan_b.condicion)) error(`condición del plan B no válida "${al.plan_b.condicion}"`);
    if (!CONFIG.TACTICAS.includes(al.plan_b.tactica)) error(`táctica del plan B no válida "${al.plan_b.tactica}"`);
  }
  if (al.gestion != null && !CONFIG.GESTIONES.includes(al.gestion)) error(`gestión no válida "${al.gestion}"`);
  if (al.cambios_avanzados != null) {
    if (!Array.isArray(al.cambios_avanzados) || al.cambios_avanzados.length > CONFIG.MAX_CAMBIOS_AVANZADOS) {
      error(`cambios avanzados: como mucho ${CONFIG.MAX_CAMBIOS_AVANZADOS}`);
    }
    for (const c of al.cambios_avanzados) {
      if (!CONFIG.CONDICIONES_CAMBIO.includes(c.condicion)) error(`condición de cambio no válida "${c.condicion}"`);
      if (c.condicion === 'energia_menor' && !Number.isFinite(c.umbral)) error('el cambio por energía necesita umbral');
    }
  }
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
    tactica: al.tactica ?? CONFIG.TACTICA_DEFECTO,
    planB: al.plan_b ?? null,
    gestion: al.gestion ?? CONFIG.GESTION_DEFECTO,
    cambiosAvanzados: al.cambios_avanzados ?? null,
    titularesIniciales: [al.por, ...al.def, ...al.med, ...al.del].map(c => c.id),
    salen: new Set(),     // sustituidos (lesión o descanso)
    entran: new Set(),    // los que entraron
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

// Bonus de los contraataques de un equipo según su táctica
export function bonusContraataque(tactica) {
  if (tactica === 'posesion') return CONFIG.CONTRAATAQUE_POSESION;
  if (tactica === 'contraataque') return CONFIG.CONTRAATAQUE_CONTRA;
  return CONFIG.BONUS_CONTRAATAQUE;
}

/* ── Partido ─────────────────────────────────────────────────────────────── */

export function simularPartido(A, B, semilla, opciones = {}) {
  const modo = opciones.modo ?? 'liga';
  if (modo !== 'liga' && modo !== 'copa') throw new Error(`[motor] modo desconocido "${modo}"`);

  // opciones.rng: generador propio en lugar de mulberry32(semilla). Solo para
  // tests (p. ej. contar cuántos números se consumen); la web y el servidor no lo usan.
  const rng = opciones.rng ?? mulberry32(semilla);
  // opciones.sinCruce: sin el bonus del cruce. Solo para el informe de balance
  // (medir cada táctica por sí sola); los partidos de verdad no lo usan.
  const conCruce = !opciones.sinCruce;
  const eq = [prepararEquipo(A, 'A'), prepararEquipo(B, 'B')];
  const goles = [0, 0];
  const eventos = [];
  const pr = {};
  const est = { posesiones: [0, 0], ocasiones: [0, 0], cortes: [0, 0], tiros: [0, 0], goles: [0, 0], paradas: [0, 0] };

  let jugada = 0, minuto = 0;
  const emitir = (tipo, datos) => eventos.push({ jugada, minuto, tipo, ...datos });

  const sumarPR = (id, v) => { pr[id] = (pr[id] ?? 0) + v; };
  for (const e of eq) for (const { carta } of enCampo(e)) pr[carta.id] = 0;

  // ── Tácticas por tramo (1: jugadas 1–5; 2: 6–10) ──
  const tacticas = { A: [eq[0].tactica], B: [eq[1].tactica] };
  const planB = { A: false, B: false };
  const cambiosDescanso = { A: 0, B: 0 };
  let ganadorCruce = conCruce ? ganaCruce(eq[0].tactica, eq[1].tactica) : null;
  const cruce = [ganadorCruce == null ? null : EQUIPOS[ganadorCruce]];
  const refrescarEquipo = e => { for (const { carta } of enCampo(e)) refrescar(carta, e.tactica); };
  eq.forEach(refrescarEquipo);
  const multCruce = i => (ganadorCruce === i ? CONFIG.BONUS_CRUCE : 1);
  const resumenSinergia = e => { const s = sinergia(enCampo(e).map(x => x.carta)); return { coleccion: s.coleccion, cartas: s.cartas, mult: s.mult }; };
  jugada = 0;
  emitir('tacticas', {
    tacticas: { A: eq[0].tactica, B: eq[1].tactica }, cruce: cruce[0],
    sinergias: { A: resumenSinergia(eq[0]), B: resumenSinergia(eq[1]) },
  });

  // Reparte puntos entre las cartas de un hueco en proporción a una stat
  function repartirPR(cartas, stat, puntos) {
    let total = 0;
    for (const c of cartas) total += c[stat];
    for (const c of cartas) sumarPR(c.id, puntos * c[stat] / total);
  }

  // ── Programa de poderes (antes de la jugada 1) ──
  // act: { equipo, carta (id), indice (del poder en la carta), poder, jugada, hecha }
  const programa = [];
  for (const [i, e] of eq.entries()) {
    for (const carta of [...enCampo(e).map(x => x.carta), ...e.banquillo]) {
      carta.poderes.forEach((poder, indice) => {
        if (poder.probabilidad === 'siempre') return;
        const [p1, p2, p3] = probabilidadesPoder(poder, carta.id === e.capitanId);
        const r = rng();
        const n = r < p3 ? 3 : r < p2 ? 2 : r < p1 ? 1 : 0;
        const libres = [];
        for (let j = 1; j <= CONFIG.JUGADAS; j++) libres.push(j);
        for (let k = 0; k < n; k++) {
          const jugadaAct = libres.splice(Math.floor(rng() * libres.length), 1)[0];
          programa.push({ equipo: i, carta: carta.id, indice, poder, jugada: jugadaAct, hecha: false });
        }
      });
    }
  }
  let activadasJugada = 0;

  // Aplica los poderes de un momento en las cartas dadas (en el campo y para
  // las que ese momento ocurre) y devuelve el multiplicador (1+e1)·(1+e2)…
  // En 'tirador' devuelve { idCarta: factor } para la ruleta.
  function aplicarPoderes(i, cartas, momento) {
    const e = eq[i];
    const ids = new Set(cartas.map(c => c.id));
    let mult = 1;
    const ruleta = {};
    const aplicar = (carta, poder, programada) => {
      emitir('poder', { equipo: e.letra, carta: carta.id, poder: poder.nombre, momento: poder.momento,
        ...(programada != null ? { programada } : {}) });
      if (momento === 'tirador') ruleta[carta.id] = (ruleta[carta.id] ?? 1) * poder.efecto;
      else mult *= 1 + poder.efecto;
    };
    // "siempre": cada vez, sin tope ni PRNG, en orden de carta y de poder
    for (const carta of cartas) {
      for (const poder of carta.poderes) {
        if (poder.momento === momento && poder.probabilidad === 'siempre') aplicar(carta, poder, null);
      }
    }
    // Programadas que ya tocan, en el orden fijo del programa
    const usados = new Set();
    for (const act of programa) {
      if (act.hecha || act.equipo !== i || act.jugada > jugada || act.poder.momento !== momento || !ids.has(act.carta)) continue;
      const clave = `${act.carta}|${act.indice}`;
      if (usados.has(clave) || activadasJugada >= CONFIG.MAX_PODERES_JUGADA) continue;
      usados.add(clave);
      act.hecha = true;
      activadasJugada++;
      aplicar(cartas.find(c => c.id === act.carta), act.poder, act.jugada);
    }
    return momento === 'tirador' ? ruleta : mult;
  }

  const titulares = e => enCampo(e).map(x => x.carta);

  for (jugada = 1; jugada <= CONFIG.JUGADAS; jugada++) {
    const saca = jugada % 2 === 1 ? 0 : 1, rival = 1 - saca;
    activadasJugada = 0;

    // 1. Minuto (estético)
    minuto = Math.min(90, (jugada - 1) * 9 + 2 + Math.floor(rng() * 7));
    emitir('inicio_jugada', { saca: EQUIPOS[saca] });

    // 2-3. Posesión: poderes de A y luego de B, ventaja del que saca y el duelo
    const sin = [0, 1].map(i => sinergia(titulares(eq[i])).mult);
    const fPos = [0, 1].map(i => {
      let f = fuerzaPosesion(vista(eq[i])) * aplicarPoderes(i, titulares(eq[i]), 'posesion');
      if (eq[i].tactica === 'posesion') f *= CONFIG.TACTICA_POSESION;
      if (eq[i].tactica === 'presion' && i !== saca) f *= CONFIG.PRESION_ROBO;
      return f * multCruce(i) * sin[i];
    });
    fPos[saca] *= CONFIG.BONUS_SAQUE;
    const pSaca = duelo(fPos[saca], fPos[rival]);
    const ganaSaca = rng() < pSaca;
    const ata = ganaSaca ? saca : rival, def = 1 - ata, contra = !ganaSaca;
    emitir('posesion', {
      saca: EQUIPOS[saca], fuerzas: fPos, p: pSaca, ganador: EQUIPOS[ata], contraataque: contra,
    });
    est.posesiones[ata]++;
    repartirPR(eq[ata].med, 'CON', CONFIG.PR.POSESION);

    // 4-5. Ocasión
    const multAta = aplicarPoderes(ata, titulares(eq[ata]), 'ocasion_ataque');
    const multDef = aplicarPoderes(def, titulares(eq[def]), 'ocasion_defensa');
    let fAta = fuerzaAtaque(vista(eq[ata]));
    if (contra) fAta *= bonusContraataque(eq[ata].tactica);
    fAta *= multAta * multCruce(ata) * sin[ata];
    let fDef = fuerzaDefensa(vista(eq[def])) * multDef * multCruce(def) * sin[def];
    if (eq[def].tactica === 'contraataque') fDef *= CONFIG.DEFENSA_CONTRA;
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

      // 6. Poderes "tirador" de los MED y DEL ("siempre" y programados)
      const multTirador = aplicarPoderes(ata, [...eq[ata].med, ...eq[ata].del], 'tirador');

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
      const ataEf = tirador.ATA * aplicarPoderes(ata, [tirador], 'chut');
      const defEf = portero.DEF * aplicarPoderes(def, [portero], 'parada');
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
          carta.base[stat] = Math.max(CONFIG.STAT_MINIMA, carta.base[stat] - CONFIG.CANSANCIO_PERDIDA);
          refrescar(carta, e.tactica);
          emitir('cansancio', { equipo: e.letra, carta: carta.id, stat, valor: carta[stat] });
        }
      }
    }

    // 12. Descanso: plan B y cambios (no consume números del PRNG)
    if (jugada === CONFIG.JUGADA_DESCANSO) descanso();
  }

  function marcador(i) {
    const d = goles[i] - goles[1 - i];
    return d > 0 ? 'ganando' : d < 0 ? 'perdiendo' : 'empatando';
  }

  function descanso() {
    // Plan B de A y de B, con el marcador del descanso
    for (const [i, e] of eq.entries()) {
      if (e.planB && e.planB.condicion === marcador(i) && e.planB.tactica !== e.tactica) {
        emitir('plan_b', { equipo: e.letra, de: e.tactica, a: e.planB.tactica, condicion: e.planB.condicion });
        e.tactica = e.planB.tactica;
        planB[e.letra] = true;
      }
    }
    // Cambios de A y de B
    for (const [i, e] of eq.entries()) {
      if (e.cambiosAvanzados) cambiosProgramados(i, e);
      else if (e.gestion === 'reservon') cambiosPorEnergia(e, CONFIG.CAMBIOS_RESERVON, -1, 'reservon');
      else if (e.gestion === 'normal') cambiosPorEnergia(e, 1, CONFIG.ENERGIA_CAMBIO_NORMAL, 'cansado');
    }
    // Segundo tramo: táctica favorita y cruce con las tácticas de ahora
    eq.forEach(refrescarEquipo);
    ganadorCruce = conCruce ? ganaCruce(eq[0].tactica, eq[1].tactica) : null;
    cruce.push(ganadorCruce == null ? null : EQUIPOS[ganadorCruce]);
    tacticas.A.push(eq[0].tactica);
    tacticas.B.push(eq[1].tactica);
    emitir('descanso', {
      tacticas: { A: eq[0].tactica, B: eq[1].tactica }, cruce: cruce[1],
      sinergias: { A: resumenSinergia(eq[0]), B: resumenSinergia(eq[1]) },
      cambios: { A: cambiosDescanso.A, B: cambiosDescanso.B },
    });
  }

  // Salen hasta n titulares con menos energía (tope: < umbral; -1 = sin tope),
  // en orden de energía y de hueco, por el mejor suplente libre para su hueco
  function cambiosPorEnergia(e, n, umbral, motivo) {
    const candidatos = enCampo(e)
      .map((x, orden) => ({ ...x, orden }))
      .filter(x => umbral < 0 || x.carta.energia < umbral)
      .sort((x, y) => (x.carta.energia - y.carta.energia) || (x.orden - y.orden));
    let hechos = 0;
    for (const x of candidatos) {
      if (hechos >= n || e.cambios >= CONFIG.MAX_CAMBIOS) break;
      const k = mejorSuplente(e, x.hueco);
      if (k < 0) break;
      sustituir(e, x.hueco, x.i, k, motivo);
      hechos++;
    }
  }

  function cambiosProgramados(i, e) {
    for (const c of e.cambiosAvanzados) {
      if (e.cambios >= CONFIG.MAX_CAMBIOS) break;
      const sitio = enCampo(e).find(x => x.carta.id === c.sale);
      const k = e.banquillo.findIndex((b, idx) => b.id === c.entra && !e.usados[idx]);
      if (!sitio || k < 0) continue;
      const cumple = c.condicion === 'siempre'
        || (c.condicion === 'energia_menor' ? sitio.carta.energia < c.umbral : c.condicion === marcador(i));
      if (cumple) sustituir(e, sitio.hueco, sitio.i, k, 'programado', c.condicion);
    }
  }

  // Mejor suplente libre para un hueco (stat del hueco; en empate, el primero)
  function mejorSuplente(e, hueco) {
    let mejor = -1;
    const stat = STAT_HUECO[hueco];
    for (let k = 0; k < e.banquillo.length; k++) {
      if (e.usados[k]) continue;
      if (mejor < 0 || e.banquillo[k].base[stat] > e.banquillo[mejor].base[stat]) mejor = k;
    }
    return mejor;
  }

  // Entra el suplente k en el hueco (descanso)
  function sustituir(e, hueco, i, k, motivo, condicion) {
    const sale = e[hueco][i];
    const entra = nuevaCarta(e, k);
    e[hueco][i] = entra;
    e.salen.add(sale.id);
    cambiosDescanso[e.letra]++;
    emitir('cambio', { equipo: e.letra, sale: sale.id, entra: entra.id, hueco, motivo,
      ...(condicion ? { condicion } : {}), energia: sale.energia });
  }

  // Saca del banquillo una copia del suplente k: cuenta como cambio, juega desde
  // la jugada siguiente (lo programado hasta esta se pierde)
  function nuevaCarta(e, k) {
    const b = e.banquillo[k];
    const entra = { ...b, base: { ...b.base }, poderes: b.poderes.map(p => ({ ...p })) };
    refrescar(entra, e.tactica);
    e.usados[k] = true;
    e.cambios++;
    e.entran.add(entra.id);
    if (!(entra.id in pr)) pr[entra.id] = 0;
    for (const act of programa) if (act.carta === entra.id && act.jugada <= jugada) act.hecha = true;
    return entra;
  }

  function lesionar(e, hueco, i, carta) {
    if (carta.lesionado) return; // ya lesionado sin suplente: el número se consume y no pasa nada

    const suplente = e.cambios < CONFIG.MAX_CAMBIOS ? elegirSuplente(e, hueco) : -1;
    if (suplente >= 0) {
      // Juega desde la jugada siguiente: lo programado hasta esta se pierde
      const entra = nuevaCarta(e, suplente);
      e[hueco][i] = entra;
      e.salen.add(carta.id);
      emitir('lesion', { equipo: e.letra, carta: carta.id, suplente: entra.id, hueco });
    } else {
      for (const s of STATS) {
        carta.base[s] = Math.max(CONFIG.STAT_MINIMA, Math.round(carta.base[s] * CONFIG.LESION_FACTOR));
      }
      refrescar(carta, e.tactica);
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
      if (mejor < 0 || e.banquillo[k].base[stat] > e.banquillo[mejor].base[stat]) mejor = k;
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

  const participacion = {};
  for (const e of eq) {
    participacion[e.letra] = {
      completo: e.titularesIniciales.filter(id => !e.salen.has(id)),
      parcial: [...new Set([...e.titularesIniciales.filter(id => e.salen.has(id)), ...e.entran])],
    };
  }
  if (tacticas.A.length === 1) {       // sin descanso (no pasa con 10 jugadas): mismo tramo
    tacticas.A.push(tacticas.A[0]); tacticas.B.push(tacticas.B[0]); cruce.push(cruce[0]);
  }

  return {
    version: VERSION,
    goles,
    penaltis,
    eventos,
    pr,
    estadisticas: est,
    tacticas,
    cruce,
    plan_b: planB,
    participacion,
    cambios_descanso: cambiosDescanso,
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
    const p = dueloCuadratico(lanzador.ATA, defEf);
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
