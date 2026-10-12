// Genera la migración del catálogo BETA de SLR: ~283 diseños de carta inventados
// para probar el juego mientras no existe el catálogo real.
//
//   node supabase/seed/generar-catalogo.mjs
//
// Determinista (mulberry32 del motor con semilla fija): siempre produce el mismo
// SQL. Valor calculado con js/slr/valor.js. Todas las cartas con beta = true y
// sin imagen. Los nombres no coinciden con ninguno de los 18 jugadores.
import { writeFileSync } from 'node:fs';
import { mulberry32 } from '../../js/slr/motor-v1.1.0.js';
import { calcularOVR, calcularValor } from '../../js/slr/valor.js';
import { PODERES } from '../../tests/slr/cartas-prueba.mjs';

const SEMILLA = 20261012;
const MIGRACION = new URL('../migrations/20261012230300_slr_catalogo_beta.sql', import.meta.url);
const rng = mulberry32(SEMILLA);

/* ── Utilidades aleatorias ───────────────────────────────────────────────── */
const entre = (a, b) => a + rng() * (b - a);
const entero = (a, b) => Math.floor(entre(a, b + 1));
const elegir = lista => lista[Math.floor(rng() * lista.length)];
function barajar(lista) {
  const l = [...lista];
  for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
  return l;
}
function uuid() {
  const b = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
  b[6] = (b[6] & 0x0f) | 0x40; // versión 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = b.map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* ── Nombres inventados (ninguno de los 18 jugadores ni de sus apodos) ───── */
const PROHIBIDOS = ['marcos', 'markis', 'alberto', 'puebla', 'carlos', 'david', 'enzo', 'fernando', 'gonzalo', 'gonza',
  'hugo', 'junquera', 'nacho', 'ignacio', 'javier', 'javi', 'jorge', 'luis', 'mateo', 'matthew', 'nicolás', 'nicolas',
  'nico', 'pablo', 'pablín', 'pelayo', 'casas', 'víctor', 'victor'];

const NOMBRES = ['Adrián', 'Álvaro', 'Andrés', 'Ángel', 'Antonio', 'Borja', 'Bruno', 'Cristian', 'Dani', 'Diego',
  'Eduardo', 'Emilio', 'Esteban', 'Felipe', 'Fran', 'Gabriel', 'Germán', 'Guillermo', 'Héctor', 'Iván', 'Jaime',
  'Joaquín', 'Julián', 'Kike', 'Lorenzo', 'Manu', 'Mario', 'Miguel', 'Raúl', 'Ramón', 'Ricardo', 'Roberto',
  'Rodrigo', 'Samuel', 'Santi', 'Sergio', 'Simón', 'Tomás', 'Toni', 'Ulises', 'Vicente', 'Xavi', 'Íñigo', 'Quique'];
const APELLIDOS = ['Barrera', 'Tapia', 'Molina', 'Cuesta', 'Ferrer', 'Prieto', 'Vidal', 'Soler', 'Campos', 'Lozano',
  'Gallego', 'Pastor', 'Rubio', 'Morales', 'Navarro', 'Iglesias', 'Herrera', 'Medina', 'Garrido', 'Cortés',
  'Santana', 'Reyes', 'Ibáñez', 'Montero', 'Peña', 'Vega', 'Calvo', 'Crespo', 'Pascual', 'Bravo', 'Rojas',
  'Aguado', 'Lorente', 'Arroyo', 'Benítez', 'Quintana', 'Vallejo', 'Esteve', 'Mora', 'Salas', 'Toledo',
  'Ortega', 'Marín', 'Rivas', 'Carmona', 'Ventura', 'Galán', 'Robles', 'Sierra', 'Durán'];
const APODOS = ['El Tanque', 'La Pantera', 'El Flaco', 'Chispa', 'El Profe', 'Tiburón', 'El Mago', 'Rayito',
  'El Torete', 'Cohete', 'El Gato', 'Pulga', 'El Faro', 'Martillo', 'El Pirata', 'Bombón', 'El Sargento',
  'Ardilla', 'El Relojero', 'Tifón', 'El Cartero', 'Pólvora', 'El Notario', 'Saeta', 'El Grúa', 'Canijo',
  'El Abuelo', 'Látigo', 'El Ingeniero', 'Torbellino', 'El Pulpo', 'Muelle', 'El Sereno', 'Trueno', 'El Gallo',
  'Mosca', 'El Capataz', 'Bisonte', 'El Cura', 'Petardo'];

for (const n of [...NOMBRES, ...APELLIDOS, ...APODOS]) {
  if (PROHIBIDOS.some(p => n.toLowerCase().split(/\s+/).includes(p))) throw new Error(`Nombre prohibido: ${n}`);
}

const personasUsadas = new Set();
function persona(apellido = null) {
  for (;;) {
    const p = `${elegir(NOMBRES)} ${apellido ?? elegir(APELLIDOS)}`;
    if (!personasUsadas.has(p)) { personasUsadas.add(p); return p; }
  }
}

/* ── Stats a partir de un OVR objetivo y un perfil ───────────────────────── */
// OVR = 0,60·s1 + 0,25·s2 + 0,15·s3. Se elige s1 por encima del objetivo y se
// reparte el resto entre s2 y s3; se reintenta hasta cuadrar dentro de rango.
const PERFILES = {
  portero:     { principal: 'DEF', orden: () => ['DEF', 'CON', 'ATA'] },
  defensa:     { principal: 'DEF', orden: () => ['DEF', ...barajar(['ATA', 'CON'])] },
  medio:       { principal: 'CON', orden: () => ['CON', ...barajar(['ATA', 'DEF'])] },
  delantero:   { principal: 'ATA', orden: () => ['ATA', ...(rng() < 0.75 ? ['CON', 'DEF'] : ['DEF', 'CON'])] },
  equilibrado: { principal: null,  orden: () => barajar(['ATA', 'DEF', 'CON']) },
};

function generarStats(ovrObjetivo, perfil, min, max) {
  const equilibrado = perfil === 'equilibrado';
  for (let intento = 0; intento < 500; intento++) {
    const s1 = Math.min(max, Math.round(ovrObjetivo + (equilibrado ? entre(0, 4) : entre(3, 15))));
    const resto = (ovrObjetivo - 0.6 * s1) / 0.4;          // media ponderada (0,625 / 0,375) de s2 y s3
    const d = equilibrado ? entre(0, 6) : entre(0, 26);
    let s2 = resto + 0.375 * d, s3 = resto - 0.625 * d;
    if (s2 > s1) { s2 = s1; s3 = (resto - 0.625 * s1) / 0.375; }
    [s2, s3] = [Math.round(s2), Math.round(s3)];
    if (s3 < min || s2 > s1 || s3 > s2 || s1 > max) continue;
    const stats = {};
    PERFILES[perfil].orden().forEach((stat, i) => { stats[stat] = [s1, s2, s3][i]; });
    if (Math.abs(calcularOVR(stats) - ovrObjetivo) <= 0.5) return stats;
  }
  throw new Error(`No se pudo generar una carta ${perfil} de OVR ${ovrObjetivo}`);
}

/* ── Poderes (mismo formato que el motor) ────────────────────────────────── */
const SIMPLES_POR_PERFIL = {
  portero: ['manosDeHierro'], medio: ['cerebro', 'batuta'], delantero: ['francotirador'],
  defensa: ['cerebro', 'batuta', 'francotirador', 'manosDeHierro'],
  equilibrado: ['cerebro', 'batuta', 'francotirador', 'manosDeHierro'],
};
const AFINES = { // poderes con sentido para cada perfil (primero se elige de aquí)
  portero: ['manosDeHierro', 'muro'], defensa: ['muro', 'manosDeHierro'], medio: ['cerebro', 'batuta', 'todosParaUno'],
  delantero: ['pichichi', 'francotirador', 'todosParaUno'],
  equilibrado: ['cerebro', 'muro', 'todosParaUno', 'francotirador'],
};
function poderes(perfil, n) {
  const elegidos = [elegir(AFINES[perfil])];
  const resto = barajar(Object.keys(PODERES).filter(k => !elegidos.includes(k) && (k !== 'pichichi' || perfil === 'delantero')));
  while (elegidos.length < n) elegidos.push(resto.shift());
  return elegidos.map(k => ({ ...PODERES[k] }));
}

/* ── Textos ──────────────────────────────────────────────────────────────── */
const TEXTOS = {
  portero: ['Bajo palos no pasa ni el aire.', 'Sale a por todas, aunque no le toque.', 'Grita más que para.'],
  defensa: ['Corta, despeja y pregunta después.', 'Nadie le ha visto perder un balón dividido.', 'El delantero rival ya lo conoce.'],
  medio: ['Pide el balón incluso cuando no hay que pedirlo.', 'Dicen que ve el pase antes que nadie.', 'Mueve el equipo a su ritmo.'],
  delantero: ['Si le llega dentro del área, es gol.', 'Remata hasta los saques de banda.', 'Vive en fuera de juego, pero marca.'],
  equilibrado: ['Juega donde haga falta.', 'Comodín de cualquier alineación.', 'Ni brilla ni falla.'],
};

/* ── Generación ──────────────────────────────────────────────────────────── */
const disenos = [];
function anadir(tipo, nombre, personas, stats, listaPoderes, texto) {
  disenos.push({ id: uuid(), tipo, nombre, personas, ...stats, poderes: listaPoderes, texto });
}

// 250 individuales, OVR 48–68, stats 30–78. ~20 con un poder simple.
const reparto = [
  ...Array(30).fill('portero'), ...Array(55).fill('defensa'), ...Array(60).fill('medio'),
  ...Array(60).fill('delantero'), ...Array(45).fill('equilibrado'),
];
const perfilesInd = barajar(reparto);
const conPoder = new Set(barajar([...Array(250).keys()]).slice(0, 20));
const apodos = barajar(APODOS);
perfilesInd.forEach((perfil, i) => {
  const stats = generarStats(entre(48, 68), perfil, 30, 78);
  const p = persona();
  const nombre = i % 6 === 0 && apodos.length ? apodos.pop() : p; // algunos con apodo
  const lista = conPoder.has(i) ? [{ ...PODERES[elegir(SIMPLES_POR_PERFIL[perfil])] }] : [];
  anadir('individual', nombre, [p], stats, lista, elegir(TEXTOS[perfil]));
});

// 24 dúos, OVR 66–78, 1–2 poderes
const NOMBRES_DUO = ['Los Hermanos {A}', 'Los Gemelos {A}', '{A} y {B}', 'La Dupla {X}', 'Dúo {X}', 'Los Primos {A}'];
const X_DUO = ['Dinamita', 'Relámpago', 'Huracán', 'Imposible', 'Infernal', 'Galáctico', 'Eléctrico', 'del Barrio',
  'Sin Frenos', 'Cohete', 'Tormenta', 'de Oro'];
const xDuo = barajar(X_DUO), apellidosDuo = barajar(APELLIDOS);
for (let i = 0; i < 24; i++) {
  const perfil = elegir(Object.keys(PERFILES));
  const plantilla = NOMBRES_DUO[i % NOMBRES_DUO.length];
  const A = apellidosDuo[i % apellidosDuo.length], B = apellidosDuo[(i + 17) % apellidosDuo.length];
  const familia = /Hermanos|Gemelos|Primos/.test(plantilla);
  const nombre = plantilla.replace('{A}', A).replace('{B}', B).replace('{X}', () => xDuo.pop() ?? 'Total');
  const personas = familia ? [persona(A), persona(A)] : [persona(plantilla.includes('{B}') ? A : null), persona(plantilla.includes('{B}') ? B : null)];
  anadir('duo', nombre, personas, generarStats(entre(66, 78), perfil, 30, 92), poderes(perfil, entero(1, 2)),
    'Juntos rinden más que por separado.');
}

// 8 tríos, OVR 74–84, 2–3 poderes
const NOMBRES_TRIO = ['Los Tres Tenores', 'El Trío Calavera', 'Los Tres Chiflados', 'Los Cuñados {A}',
  'El Trío Maravilla', 'Los Tres Caballeros', 'El Trío Dinamita', 'Los Tres Reyes del Barrio'];
NOMBRES_TRIO.forEach((plantilla, i) => {
  const perfil = ['delantero', 'medio', 'defensa', 'equilibrado'][i % 4];
  const A = elegir(APELLIDOS);
  const nombre = plantilla.replace('{A}', A);
  const personas = plantilla.includes('{A}') ? [persona(A), persona(A), persona(A)] : [persona(), persona(), persona()];
  anadir('trio', nombre, personas, generarStats(entre(74, 84), perfil, 35, 97), poderes(perfil, entero(2, 3)),
    'Tres amigos, un solo equipo.');
});

// 1 Única: una stat a 101 y 3 poderes
anadir('unica', 'La Leyenda del Barrio', [persona()], { ATA: 101, DEF: 62, CON: 84 },
  ['pichichi', 'francotirador', 'todosParaUno'].map(k => ({ ...PODERES[k] })),
  'Nadie sabe de dónde salió. Todos saben lo que hace con un balón.');

// Nombres únicos en todo el catálogo
const nombres = disenos.map(d => d.nombre);
if (new Set(nombres).size !== nombres.length) {
  const rep = nombres.filter((n, i) => nombres.indexOf(n) !== i);
  throw new Error(`Nombres repetidos: ${rep.join(', ')}`);
}

/* ── SQL ─────────────────────────────────────────────────────────────────── */
const lit = v => `'${String(v).replace(/'/g, "''")}'`;
const arrayTexto = l => `array[${l.map(lit).join(', ')}]::text[]`;
const filas = disenos.map(d => {
  d.valor = calcularValor({ ATA: d.ATA, DEF: d.DEF, CON: d.CON, poderes: d.poderes });
  d.ovr = calcularOVR(d);
  return `  (${lit(d.id)}, ${lit(d.nombre)}, ${arrayTexto(d.personas)}, ${lit(d.tipo)}, ${d.ATA}, ${d.DEF}, ${d.CON}, ` +
    `${lit(JSON.stringify(d.poderes))}::jsonb, null, ${lit(d.texto)}, ${d.valor}, true, true)`;
});

writeFileSync(MIGRACION, `-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — catálogo BETA (paso 2)
-- GENERADO por supabase/seed/generar-catalogo.mjs (semilla ${SEMILLA}): no editar a mano.
-- ${disenos.length} cartas inventadas, sin imagen y con beta = true, para probar el juego.
-- Se sustituirán o editarán cuando exista el catálogo real.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.disenos_carta
  (id, nombre, personas, tipo, ata, def, con, poderes, imagen_url, texto, valor, activo, beta)
values
${filas.join(',\n')};
`);

/* ── Resumen ─────────────────────────────────────────────────────────────── */
const rango = (l, k, dec = 1) => `${Math.min(...l.map(x => x[k])).toFixed(dec)}–${Math.max(...l.map(x => x[k])).toFixed(dec)}`;
console.log(`Catálogo beta: ${disenos.length} diseños (semilla ${SEMILLA}) → ${MIGRACION.pathname.split('/').slice(-3).join('/')}\n`);
console.log('tipo         n   OVR          valor        stats     con poderes');
for (const tipo of ['individual', 'duo', 'trio', 'unica']) {
  const l = disenos.filter(d => d.tipo === tipo);
  const stats = l.flatMap(d => [d.ATA, d.DEF, d.CON]);
  const conP = l.filter(d => d.poderes.length).length;
  console.log(`${tipo.padEnd(11)} ${String(l.length).padStart(3)}   ${rango(l, 'ovr').padEnd(11)}  ${rango(l, 'valor', 0).padEnd(11)}  ` +
    `${Math.min(...stats)}–${Math.max(...stats)}`.padEnd(9) + `  ${conP} (${[...new Set(l.map(d => d.poderes.length))].sort().join('/')} poderes)`);
}
const ind = disenos.filter(d => d.tipo === 'individual');
const perfilDe = d => (d.DEF >= d.ATA && d.DEF >= d.CON ? 'DEF alta' : d.CON >= d.ATA ? 'CON alta' : 'ATA alta');
const cuenta = {};
for (const d of ind) cuenta[perfilDe(d)] = (cuenta[perfilDe(d)] ?? 0) + 1;
console.log(`\nIndividuales por stat principal: ${Object.entries(cuenta).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`Valor medio de las individuales: ${(ind.reduce((s, d) => s + d.valor, 0) / ind.length).toFixed(1)}`);
