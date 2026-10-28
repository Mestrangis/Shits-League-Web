/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: carga de los ajustes
   Los valores se tocan en ajustes.js. Aquí están los de por defecto con su
   rango válido: cada valor de ajustes.js se comprueba y, si no vale (fuera de
   rango, de otro tipo, texto vacío, clave que no existe), se usa el de por
   defecto y se avisa en la consola. Si ajustes.js ni siquiera se puede cargar
   (un error de escritura), se usan todos los de por defecto.
   El resto del código lee de AJUSTES (y de los atajos de abajo).
═══════════════════════════════════════════════ */

// Hojas del esquema: número con rango, lista de textos o una opción de una lista
const n = (v, min, max, entero = false) => ({ tipo: 'numero', v, min, max, entero });
const t = (...v) => ({ tipo: 'textos', v });
const o = (v, opciones) => ({ tipo: 'opcion', v, opciones });
const RITMOS = ['parado', 'lento', 'normal', 'rapido'];

export const ESQUEMA = {
  tiempos: {
    entre_escenas: n(180, 0, 1000), reloj_minuto_max: n(1300, 300, 5000),
    inicio: { total: n(5000, 2000, 10000), entrada: n(900, 0, 2000), silbato: n(1300, 0, 5000) },
    saque: { entra: n(350, 0, 1000), queda: n(1600, 500, 5000), sale: n(350, 0, 1000) },
    poder: { total: n(2300, 1000, 6000), entrada: n(550, 0, 1500) },
    control: { completo: n(4200, 2000, 9000), rapido: n(2000, 800, 5000) },
    robo: { rotulo: n(1500, 800, 4000), franja: n(1700, 800, 4000) },
    ataque: { completo: n(1900, 800, 5000), rapido: n(1100, 800, 5000) },
    pase: { completo: n(1550, 600, 4000), rapido: n(1050, 600, 4000) },
    corte: { completo: n(1600, 600, 4000), rapido: n(1100, 600, 4000) },
    tirador: { completo: n(2700, 1000, 6000), rapido: n(1550, 1000, 6000), grande: n(700, 200, 2000), pasos: n(16, 6, 40, true) },
    chut: { barra_completo: n(2800, 1000, 8000), barra_rapido: n(1300, 1000, 8000) },
    gol: { marcador: n(300, 0, 1500), celebracion: n(2000, 800, 6000) },
    lesion: n(2500, 1000, 6000), descanso: n(5300, 2000, 12000), final: n(6000, 2000, 15000),
  },
  vinetas: { gol_red: n(1, 0.3, 3), gol_chilena: n(1, 0.3, 3), gol_ardiendo: n(1, 0.3, 3), parada_punos: n(1, 0.3, 3), parada_atrapada: n(1, 0.3, 3), parada_estirada: n(1, 0.3, 3),
    tacticas_choque: n(1, 0.3, 3), tacticas_cambio: n(1, 0.3, 3) },
  lectura: { minimo: n(1200, 500, 4000), por_palabra: n(200, 0, 800) },
  barra: { aparece: n(300, 100, 1000), pelea: n(0.74, 0.4, 0.9), sorpresa: n(0.22, 0.1, 0.4), empujones: n(6, 2, 14, true), llamarada: n(550, 200, 1500) },
  fondo: {
    franja: n(64, 24, 160, true),
    velocidad: { lento: n(1400, 80, 5000), normal: n(520, 80, 5000), rapido: n(260, 80, 5000) },
    escenas: {
      inicio: o('lento', RITMOS), cruce: o('parado', RITMOS), planb: o('parado', RITMOS), saque: o('normal', RITMOS), poder: o('lento', RITMOS), control: o('lento', RITMOS), robo: o('rapido', RITMOS),
      ataque: o('rapido', RITMOS), pase: o('rapido', RITMOS), corte: o('parado', RITMOS), tirador: o('normal', RITMOS), chut: o('rapido', RITMOS),
      gol: o('parado', RITMOS), parada: o('parado', RITMOS), lesion: o('parado', RITMOS), descanso: o('parado', RITMOS), final: o('parado', RITMOS),
    },
  },
  textos: {
    vs: t('VS'), ataca: t('ATACA'), poder: t('⚡ PODER'), control: t('Control del balón'), robo: t('¡ROBO!'), contraataque: t('CONTRAATAQUE'),
    sorpresa: t('¡SORPRESA!'), cortado: t('¡CORTADO!'), chut: t('Chut'), gol: t('GOL'), puños: t('¡DE PUÑOS!'), atrapada: t('¡A LAS MANOS!'),
    estirada: t('¡PARADÓN!'), lesion: t('🚑 LESIÓN'), descanso: t('DESCANSO'), final: t('FINAL'), mejor_carta: t('Mejor carta del partido'),
    toca: t('Toca: avanzar · Mantén: ×2'),
  },
  efectos: { temblor: n(1, 0, 3), particulas: n(1, 0, 3), balon: n(64, 32, 140), microvibracion: n(2, 0, 8) },
  sonido: { general: n(1, 0, 1), silbato_inicio: n(1, 0, 1), saque: n(0.4, 0, 1), patada: n(1, 0, 1), bote: n(1, 0, 1), choque: n(1, 0, 1), regate: n(1, 0, 1), robo: n(1, 0, 1), contraataque: n(1, 0, 1), corte: n(1, 0, 1), ruleta: n(1, 0, 1), chut: n(1, 0, 1), fuego: n(1, 0, 1), gol: n(1, 0, 1), parada: n(1, 0, 1), sorpresa: n(1, 0, 1), poder: n(1, 0, 1), lesion: n(1, 0, 1), plan_b: n(1, 0, 1), silbato_descanso: n(1, 0, 1), silbato_final: n(1, 0, 1), ambiente: n(0.25, 0, 1) },
  ritmo: { igualado_min: n(0.4, 0, 1), igualado_max: n(0.6, 0, 1), final_desde_jugada: n(8, 1, 10, true), final_diferencia_max: n(1, 0, 5, true), sorpresa: n(0.4, 0, 0.5) },
};

const esHoja = x => x && typeof x === 'object' && 'tipo' in x && 'v' in x;

// Mezcla lo del usuario con el esquema. avisos: lista de textos para la consola
export function validar(usuario, esquema = ESQUEMA, ruta = '', avisos = []) {
  const out = {};
  const u = usuario && typeof usuario === 'object' && !Array.isArray(usuario) ? usuario : {};
  if (usuario !== undefined && u !== usuario) avisos.push(`${ruta || 'ajustes'}: debería ser un grupo { … }; se usan los de por defecto`);
  for (const [k, e] of Object.entries(esquema)) {
    const r = ruta ? `${ruta}.${k}` : k;
    const x = u[k];
    if (!esHoja(e)) { out[k] = validar(x, e, r, avisos); continue; }
    if (x === undefined) { out[k] = e.v; if (usuario !== undefined && u === usuario) avisos.push(`${r}: falta; se usa ${JSON.stringify(e.v)}`); continue; }
    if (e.tipo === 'numero') {
      const ok = typeof x === 'number' && Number.isFinite(x) && x >= e.min && x <= e.max;
      out[k] = ok ? (e.entero ? Math.round(x) : x) : e.v;
      if (!ok) avisos.push(`${r}: ${JSON.stringify(x)} no vale (un número entre ${e.min} y ${e.max}); se usa ${e.v}`);
    } else if (e.tipo === 'textos') {
      const lista = typeof x === 'string' ? [x] : x;
      const ok = Array.isArray(lista) && lista.length > 0 && lista.every(s => typeof s === 'string' && s.trim());
      out[k] = ok ? lista.map(s => s.trim()) : e.v;
      if (!ok) avisos.push(`${r}: tiene que ser una lista de textos no vacíos; se usa ${JSON.stringify(e.v)}`);
    } else if (e.tipo === 'opcion') {
      const ok = e.opciones.includes(x);
      out[k] = ok ? x : e.v;
      if (!ok) avisos.push(`${r}: ${JSON.stringify(x)} no vale (${e.opciones.join(', ')}); se usa ${JSON.stringify(e.v)}`);
    }
  }
  for (const k of Object.keys(u)) if (!(k in esquema)) avisos.push(`${ruta ? `${ruta}.` : ''}${k}: esa clave no existe; se ignora`);
  return out;
}

// Los de por defecto, sin validar nada
export const POR_DEFECTO = validar(undefined);

async function cargar() {
  let usuario;
  try {
    usuario = (await import('./ajustes.js')).AJUSTES;
  } catch (e) {
    console.warn('[ajustes del partido] ajustes.js no se puede cargar; se usan todos los de por defecto:', e.message);
    return POR_DEFECTO;
  }
  const avisos = [];
  const a = validar(usuario, ESQUEMA, '', avisos);
  // Coherencia entre valores
  if (a.ritmo.igualado_min > a.ritmo.igualado_max) {
    avisos.push('ritmo.igualado_min es mayor que ritmo.igualado_max; se usan los de por defecto');
    a.ritmo.igualado_min = POR_DEFECTO.ritmo.igualado_min; a.ritmo.igualado_max = POR_DEFECTO.ritmo.igualado_max;
  }
  for (const x of avisos) console.warn(`[ajustes del partido] ${x}`);
  return a;
}

export const AJUSTES = await cargar();

/* ── Atajos ─────────────────────────────────────────────────────────────── */
export const TIEMPOS = AJUSTES.tiempos;
export const RITMO = Object.freeze({
  IGUALADO_MIN: AJUSTES.ritmo.igualado_min, IGUALADO_MAX: AJUSTES.ritmo.igualado_max,
  FINAL_DESDE_JUGADA: AJUSTES.ritmo.final_desde_jugada, FINAL_DIFERENCIA_MAX: AJUSTES.ritmo.final_diferencia_max,
  SORPRESA_P: AJUSTES.ritmo.sorpresa,
});
// Lectura: cuánto se queda un texto como mínimo
export const leer = texto => AJUSTES.lectura.minimo + AJUSTES.lectura.por_palabra * String(texto ?? '').trim().split(/\s+/).filter(Boolean).length;
// Un texto de pantalla (si hay varios, uno al azar con el rng de la animación)
export function texto(clave, rng = Math.random) {
  const lista = AJUSTES.textos[clave] ?? POR_DEFECTO.textos[clave] ?? [clave];
  return lista[Math.floor(rng() * lista.length) % lista.length];
}
