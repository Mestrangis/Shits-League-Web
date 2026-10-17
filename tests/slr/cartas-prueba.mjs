// Cartas INVENTADAS para los tests del motor. Ajustadas para que las fuerzas
// coincidan con el partido de ejemplo de la sección 14 de la especificación.
// El catálogo real se diseñará más adelante.

export const PODERES = {
  cerebro:        { nombre: 'Cerebro',          momento: 'posesion',        probabilidad: 0.25,      efecto: 0.15, nivel: 'simple' },
  batuta:         { nombre: 'Batuta',           momento: 'posesion',        probabilidad: 0.25,      efecto: 0.15, nivel: 'simple' },
  todosParaUno:   { nombre: 'Todos para uno',   momento: 'ocasion_ataque',  probabilidad: 0.30,      efecto: 0.25, nivel: 'fuerte' },
  muro:           { nombre: 'Muro',             momento: 'ocasion_defensa', probabilidad: 0.25,      efecto: 0.20, nivel: 'fuerte' },
  pichichi:       { nombre: 'Pichichi',         momento: 'tirador',         probabilidad: 'siempre', efecto: 2,    nivel: 'fuerte' },
  francotirador:  { nombre: 'Francotirador',    momento: 'chut',            probabilidad: 0.25,      efecto: 0.15, nivel: 'simple' },
  manosDeHierro:  { nombre: 'Manos de hierro',  momento: 'parada',          probabilidad: 0.25,      efecto: 0.15, nivel: 'simple' },
};

const carta = (id, nombre, tipo, ATA, DEF, CON, poderes = []) =>
  ({ id, nombre, tipo, ATA, DEF, CON, poderes: poderes.map(p => ({ ...p })) });

export const CARTAS = {
  // Marcos FC
  'm-muro':     carta('m-muro',     'El Muro',               'individual', 30, 81, 45),
  'm-pitbull':  carta('m-pitbull',  'Pitbull',               'individual', 45, 79, 63),
  'm-cerebro':  carta('m-cerebro',  'El Cerebro',            'individual', 61, 52, 86, [PODERES.cerebro]),
  'm-rayo':     carta('m-rayo',     'Rayo',                  'individual', 68, 62, 79),
  'm-zurdo':    carta('m-zurdo',    'Zurdo',                 'individual', 60, 45, 74),
  'm-pichichi': carta('m-pichichi', 'Pichichi',              'individual', 84, 38, 64, [PODERES.pichichi]),
  'm-mosq':     carta('m-mosq',     'Los Tres Mosqueteros',  'trio',       92, 70, 81, [PODERES.todosParaUno, PODERES.francotirador]),
  'm-lucas':    carta('m-lucas',    'Lucas',                 'individual', 70, 50, 66),
  'm-ruben':    carta('m-ruben',    'Rubén',                 'individual', 55, 60, 72),
  'm-nacho':    carta('m-nacho',    'Nacho',                 'individual', 40, 74, 55),
  // Los del Fondo
  'f-manos':    carta('f-manos',    'Manos',                 'individual', 28, 84, 40, [PODERES.manosDeHierro]),
  'f-cerrojo':  carta('f-cerrojo',  'El Cerrojo',            'duo',        52, 88, 70, [PODERES.muro]),
  'f-victor':   carta('f-victor',   'Víctor',                'individual', 50, 78, 60),
  'f-carlos':   carta('f-carlos',   'Carlos',                'individual', 63, 55, 82),
  'f-capi':     carta('f-capi',     'El Capi',               'individual', 70, 58, 84, [PODERES.batuta]),
  'f-bala':     carta('f-bala',     'Bala',                  'individual', 86, 40, 62),
  'f-oscar':    carta('f-oscar',    'Óscar',                 'individual', 79, 45, 66),
  'f-javi':     carta('f-javi',     'Javi',                  'individual', 65, 55, 70),
  'f-iker':     carta('f-iker',     'Iker',                  'individual', 45, 72, 58),
  'f-martin':   carta('f-martin',   'Martín',                'individual', 74, 42, 60),
};

const c = id => CARTAS[id];

// Funciones y no constantes: cada test recibe alineaciones nuevas
export function marcosFC() {
  return {
    formacion: '1-3-2',
    por: c('m-muro'),
    def: [c('m-pitbull')],
    med: [c('m-cerebro'), c('m-rayo'), c('m-zurdo')],
    del: [c('m-pichichi'), c('m-mosq')],
    banquillo: [c('m-lucas'), c('m-ruben'), c('m-nacho')],
    orden_manual: false,
    capitan_id: 'm-mosq',
  };
}

export function losDelFondo() {
  return {
    formacion: '2-2-2',
    por: c('f-manos'),
    def: [c('f-cerrojo'), c('f-victor')],
    med: [c('f-carlos'), c('f-capi')],
    del: [c('f-bala'), c('f-oscar')],
    banquillo: [c('f-javi'), c('f-iker'), c('f-martin')],
    orden_manual: false,
    capitan_id: 'f-capi',
  };
}

// v2.0.0: los mismos equipos con tácticas, plan B, gestión, tácticas favoritas,
// colecciones y energía (ya aplicada a las stats, como al congelar la alineación)
const v2 = (x, extra) => ({ ...x, poderes: x.poderes.map(p => ({ ...p })), ...extra });
export function marcosFCv2(aplicarEnergia = x => x) {
  const al = marcosFC();
  const extra = {
    'm-muro':     { energia: 90, tactica_favorita: 'contraataque' },
    'm-pitbull':  { energia: 45, tactica_favorita: 'presion', coleccion_id: 'dormidito' },
    'm-cerebro':  { energia: 72, tactica_favorita: 'posesion', coleccion_id: 'dormidito' },
    'm-rayo':     { energia: 60, coleccion_id: 'dormidito' },
    'm-zurdo':    { energia: 35 },
    'm-pichichi': { energia: 100, tactica_favorita: 'contraataque' },
    'm-mosq':     { energia: 80, tactica_favorita: 'contraataque', coleccion_id: 'down' },
    'm-lucas':    { energia: 100 }, 'm-ruben': { energia: 100, tactica_favorita: 'presion' }, 'm-nacho': { energia: 95 },
  };
  const f = x => aplicarEnergia(v2(x, extra[x.id]));
  return { ...al, por: f(al.por), def: al.def.map(f), med: al.med.map(f), del: al.del.map(f), banquillo: al.banquillo.map(f),
    tactica: 'contraataque', plan_b: { condicion: 'perdiendo', tactica: 'presion' }, gestion: 'reservon' };
}
export function losDelFondoV2(aplicarEnergia = x => x) {
  const al = losDelFondo();
  const extra = {
    'f-manos':   { energia: 100 }, 'f-cerrojo': { energia: 88, tactica_favorita: 'posesion', coleccion_id: 'seductor' },
    'f-victor':  { energia: 40, coleccion_id: 'seductor' }, 'f-carlos': { energia: 70, tactica_favorita: 'posesion' },
    'f-capi':    { energia: 66, tactica_favorita: 'posesion' }, 'f-bala': { energia: 52 }, 'f-oscar': { energia: 95, tactica_favorita: 'presion' },
    'f-javi':    { energia: 100 }, 'f-iker': { energia: 100 }, 'f-martin': { energia: 100 },
  };
  const f = x => aplicarEnergia(v2(x, extra[x.id]));
  return { ...al, por: f(al.por), def: al.def.map(f), med: al.med.map(f), del: al.del.map(f), banquillo: al.banquillo.map(f),
    tactica: 'posesion', gestion: 'normal' };
}

// Copia profunda con los ids prefijados (para equipos espejo sin ids repetidos)
export function conPrefijo(al, prefijo) {
  const cc = x => ({ ...x, id: prefijo + x.id, poderes: x.poderes.map(p => ({ ...p })) });
  return {
    ...al,
    por: cc(al.por),
    def: al.def.map(cc),
    med: al.med.map(cc),
    del: al.del.map(cc),
    banquillo: al.banquillo.map(cc),
    capitan_id: al.capitan_id ? prefijo + al.capitan_id : null,
  };
}
