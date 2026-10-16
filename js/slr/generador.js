/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — generador de cartas por tiers
   Gemelo exacto de las funciones SQL generar_stats() y generar_poderes()
   (migración 20261015000000_slr_tiers_y_motor_v130.sql): el formulario
   "Nueva carta" lo usa para la vista previa y la base de datos para las
   cartas que se crean en el Table Editor con tier + perfil y sin stats.
   tests/slr/generador-sql.test.mjs comprueba que dan lo mismo.

   Para que SQL y JS coincidan solo se usa aritmética entera: un generador
   Park-Miller (s ← s · 48271 mod 2³¹−1, exacto en float64 y en bigint) y
   r(n) = s mod n. Nada de decimales en el cálculo de stats.
═══════════════════════════════════════════════ */

// OVR medio de cada tier: [mínimo, máximo) — la carta cae en [mín, máx)
export const TIERS = Object.freeze({
  S: [85, 95], A: [78, 85], B: [72, 78], C: [66, 72], D: [60, 66], E: [54, 60], F: [46, 54],
});
export const PERFILES = Object.freeze({
  atacante: 'Atacante', defensa: 'Defensa', control: 'Control', portero: 'Portero', equilibrado: 'Equilibrado',
});
// Paleta fija de colores de carta (null = el color del tipo)
export const COLORES = Object.freeze({
  verde: 'Verde', morado: 'Morado', azul: 'Azul', rojo: 'Rojo',
  naranja: 'Naranja', dorado: 'Dorado', plata: 'Plata', negro: 'Negro',
});
// Stat máxima: la misma para todos los tipos (el tipo no da ventajas)
export const MAX_STAT_CARTA = 101;

// Probabilidades [p1, p2, p3] que propone el generador (calibradas para ~5
// activaciones por partido entre equipos con dúos y tríos; ver DECISIONES.md)
export const PROBABILIDADES = Object.freeze({
  simple:       Object.freeze([0.40, 0.18, 0.07]),
  fuerte:       Object.freeze([0.40, 0.18, 0.07]),
  'muy fuerte': Object.freeze([0.40, 0.18, 0.07]),
});
export const EFECTOS = Object.freeze({ simple: 0.2, fuerte: 0.3, 'muy fuerte': 0.4 });

export const MOMENTOS_PERFIL = Object.freeze({
  atacante:    ['chut', 'ocasion_ataque'],
  defensa:     ['ocasion_defensa'],
  control:     ['posesion'],
  portero:     ['parada'],
  equilibrado: ['posesion', 'ocasion_ataque', 'ocasion_defensa', 'chut'],
});

// Nombres con gracia por momento (el SQL tiene la misma lista, en el mismo orden)
export const NOMBRES_PODER = Object.freeze({
  posesion:        ['Batuta', 'Cerebro', 'Pase de seda', 'Tiki-taka', 'El Metrónomo', 'Rondo eterno'],
  ocasion_ataque:  ['Todos para uno', 'Desmarque', 'Contragolpe', 'Pared mágica', 'Carrerón', 'Bicicleta'],
  ocasion_defensa: ['Muro', 'Cerrojo', 'Candado', 'El Autobús', 'Barrida', 'Tijera limpia'],
  chut:            ['Francotirador', 'Cañonero', 'Folha seca', 'Al ángulo', 'Chilena', 'Zapatazo'],
  parada:          ['Manos de hierro', 'Manos de oro', 'El Pulpo', 'Paradón', 'Gato volador', 'Muralla china'],
});

const PERMUTACIONES = [['ATA', 'DEF', 'CON'], ['ATA', 'CON', 'DEF'], ['DEF', 'ATA', 'CON'],
  ['DEF', 'CON', 'ATA'], ['CON', 'ATA', 'DEF'], ['CON', 'DEF', 'ATA']];

export const SEMILLA_MAX = 2147483646;
// Semilla nueva al azar (para "Regenerar"); distinta de la anterior
export function semillaNueva(anterior = null) {
  let s;
  do { s = 1 + Math.floor(Math.random() * SEMILLA_MAX); } while (s === anterior);
  return s;
}

// Park-Miller: r(n) devuelve un entero en [0, n)
function enteros(semilla) {
  let s = (Math.abs(Math.trunc(Number(semilla) || 0)) % SEMILLA_MAX) + 1;
  return n => { s = (s * 48271) % 2147483647; return s % n; };
}

// { ATA, DEF, CON } con OVR (0,60·s1 + 0,25·s2 + 0,15·s3) en el rango del tier
export function generarStats(tier, perfil, tipo, semilla) {
  if (!TIERS[tier]) throw new Error(`Tier desconocido: ${tier}`);
  if (!PERFILES[perfil]) throw new Error(`Perfil desconocido: ${perfil}`);
  const r = enteros(semilla);
  const [lo, hi] = TIERS[tier];
  const T = lo + r(hi - lo);
  let d1, d2, orden;
  if (perfil === 'portero') {
    d1 = 15 + r(11); d2 = 15 + r(16); orden = ['DEF', 'CON', 'ATA'];
  } else if (perfil === 'equilibrado') {
    d1 = r(5); d2 = r(5); orden = PERMUTACIONES[r(6)];
  } else {
    d1 = 8 + r(13); d2 = r(15);
    const principal = { atacante: 'ATA', defensa: 'DEF', control: 'CON' }[perfil];
    const resto = ['ATA', 'DEF', 'CON'].filter(x => x !== principal);
    orden = [principal, ...(r(2) ? resto : [resto[1], resto[0]])];
  }
  const cap = MAX_STAT_CARTA;   // `tipo` se conserva en la firma (gemelo de generar_stats)
  // s1 = T + ⌈(0,40·d1 + 0,15·d2)⌉ → OVR en [T, T+1). Si pasa del tope, se
  // estrechan las diferencias hasta que quepa: primero d2 (en el portero,
  // primero d1, para que su ATA siga siendo la más baja posible).
  const primera = () => T + Math.floor((40 * d1 + 15 * d2 + 99) / 100);
  let s1 = primera();
  while (s1 > cap && (d1 > 0 || d2 > 0)) {
    if (perfil === 'portero' ? d1 === 0 : d2 > 0) d2--; else d1--;
    s1 = primera();
  }
  s1 = Math.min(s1, cap);
  const s2 = Math.max(1, s1 - d1), s3 = Math.max(1, s2 - d2);
  const out = {};
  orden.forEach((k, i) => { out[k] = [s1, s2, s3][i]; });
  return out;
}

// Poderes propuestos: S 2 fuertes · A 1 fuerte · B 1 simple · C 40 % 1 simple · D–F ninguno
export function generarPoderes(tier, perfil, semilla) {
  if (!TIERS[tier]) throw new Error(`Tier desconocido: ${tier}`);
  if (!PERFILES[perfil]) throw new Error(`Perfil desconocido: ${perfil}`);
  const r = enteros(semilla);
  let n = 0, nivel = 'simple';
  if (tier === 'S') { n = 2; nivel = 'fuerte'; }
  else if (tier === 'A') { n = 1; nivel = 'fuerte'; }
  else if (tier === 'B') { n = 1; }
  else if (tier === 'C') { n = r(100) < 40 ? 1 : 0; }
  const momentos = MOMENTOS_PERFIL[perfil];
  const base = r(momentos.length);
  const poderes = [];
  for (let k = 0; k < n; k++) {
    const momento = momentos[(base + k) % momentos.length];
    const lista = NOMBRES_PODER[momento];
    let i = r(lista.length);
    while (poderes.some(p => p.nombre === lista[i])) i = (i + 1) % lista.length;
    poderes.push({ nombre: lista[i], momento, nivel, efecto: EFECTOS[nivel], probabilidades: [...PROBABILIDADES[nivel]] });
  }
  return poderes;
}

// OVR × 100 en enteros (60·s1 + 25·s2 + 15·s3): sin errores de coma flotante en los límites
export function ovr100({ ATA, DEF, CON }) {
  const [s1, s2, s3] = [ATA, DEF, CON].sort((a, b) => b - a);
  return 60 * s1 + 25 * s2 + 15 * s3;
}

// Tier a partir de las stats (para cartas con las stats puestas a mano)
export function tierDeStats(stats) {
  const o = ovr100(stats);
  for (const [t, [lo]] of Object.entries(TIERS)) if (o >= 100 * lo) return t;
  return 'F';
}

// Perfil a partir de la forma de las stats (mismo criterio que perfil_de_stats en SQL)
export function perfilDeStats({ ATA, DEF, CON }) {
  const max = Math.max(ATA, DEF, CON), min = Math.min(ATA, DEF, CON);
  if (max - min <= 6) return 'equilibrado';
  if (DEF === max && ATA === min && DEF - ATA >= 30) return 'portero';
  if (ATA === max) return 'atacante';
  if (DEF === max) return 'defensa';
  return 'control';
}
