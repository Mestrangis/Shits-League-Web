/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: abrir un partido jugado
   Carga el partido, lo reproduce con el motor de su versión (semilla y
   alineaciones congeladas, como la crónica) para tener sus eventos, arma el
   guion y abre el reproductor con las cartas (fotos precargadas).
═══════════════════════════════════════════════ */
import { rpc, leer } from '../api.js';
import { toast } from '../ui.js';
import { normalizarCarta } from '../carta.js';
import { asegurarFotos, urlCarta } from '../imagenes.js';
import { motorDe } from '../motores.js';
import { crearGuion } from './guion.js';
import { reproducir } from './reproductor.js';

const cartasDe = al => [al?.por, ...(al?.def ?? []), ...(al?.med ?? []), ...(al?.del ?? []), ...(al?.banquillo ?? [])].filter(Boolean);

// Las cartas del partido con su diseño (foto, rareza, acabado…) para pintarlas
export async function cartasParaPintar(ids) {
  if (!ids.length) return {};
  const filas = await leer(`cartas?select=id,diseno_id,disenos_carta(nombre,tipo,acabado,color,tier,rareza,coleccion_id,perfil,personas,ata,def,con,valor,poderes,imagen_url,texto,estamina,tactica_favorita)&id=in.(${ids.join(',')})`);
  return Object.fromEntries(filas.map(f => [f.id, normalizarCarta(f)]));
}

/**
 * Abre la reproducción de un partido. opts: { p (si ya se tiene slr_partido), alVisto, alTerminar }
 * Devuelve el reproductor (o null si no se pudo).
 */
export async function abrirPartido(partidoId, ctx, opts = {}) {
  let p = opts.p;
  try {
    p ??= await rpc('slr_partido', { partido_id: partidoId });
    const al = p.alineaciones_congeladas;
    const eqs = await leer(`equipos?select=id,nombre,usuarios(nombre,interno)&id=in.(${p.local_id},${p.visitante_id})`);
    const eq = id => { const e = eqs.find(x => x.id === id); return { id, nombre: e?.nombre ?? 'Equipo', dueno: e?.usuarios?.interno ? '' : (e?.usuarios?.nombre ?? '') }; };
    const ids = [...new Set([...cartasDe(al.local), ...cartasDe(al.visitante)].map(c => c.id))];
    const motor = motorDe(p.version_motor);
    const [cartas, sim] = await Promise.all([
      cartasParaPintar(ids),
      Promise.resolve().then(() => motor.simularPartido(al.local, al.visitante, p.semilla)),
    ]);
    const guion = crearGuion({
      partido: { id: p.id, version_motor: p.version_motor, goles: p.goles, penaltis: p.penaltis, pr: p.pr },
      alineaciones: al, eventos: sim.eventos, yo: ctx.datos?.equipo?.id ?? null,
      equipos: { A: eq(p.local_id), B: eq(p.visitante_id) }, pr: sim.pr, bonusCruce: motor.CONFIG?.BONUS_CRUCE ?? null,
    });
    // Fotos decodificadas antes de empezar (como mucho 2,5 s)
    await asegurarFotos(Object.values(cartas).map(c => c.imagen_url && urlCarta(c.imagen_url, 'pequena')).filter(Boolean));
    return reproducir(guion, cartas, { alVisto: opts.alVisto, alTerminar: opts.alTerminar });
  } catch (e) {
    toast(`No se pudo reproducir el partido: ${e.message}`, 'error');
    return null;
  }
}
