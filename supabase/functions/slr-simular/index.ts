// ═══════════════════════════════════════════════════════════════════════════
// SHITS LEAGUE RUSH — Edge Function slr-simular
// Corre el motor (copia exacta de js/slr/motor-v1.1.0.js) en el servidor.
//
// Acciones (POST JSON):
//   · { accion: 'jornada', jornada_id }            → la llama pg_cron vía pg_net con
//       la cabecera x-slr-secreto. Simula todos los partidos de una jornada
//       cerrada (partido real + 200 de pronóstico) y guarda los resultados.
//       Idempotente: si la jornada ya no está cerrada, no hace nada.
//   · { accion: 'amistoso', token, rival_equipo_id } → desde la web (slr_amistoso)
//   · { accion: 'pronostico', token, equipo_id }    → desde la web (slr_pronostico)
//
// Habla con la base de datos solo a través de funciones motor_* que únicamente
// puede ejecutar la clave de servicio. El secreto de pg_cron está en Vault y
// en los secretos de la función (SLR_CRON_SECRETO), nunca en el repo.
// ═══════════════════════════════════════════════════════════════════════════
import { simularPartido, simularPronostico, VERSION } from '../_shared/motor-v1.1.0.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const CLAVE_SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRETO = Deno.env.get('SLR_CRON_SECRETO') ?? '';
const SIMULACIONES_PRONOSTICO = 200;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (datos: unknown, status = 200) =>
  new Response(JSON.stringify(datos), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class ErrorApi extends Error {
  constructor(mensaje: string, public status = 400) { super(mensaje); }
}

async function rpc(funcion: string, args: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcion}`, {
    method: 'POST',
    headers: { apikey: CLAVE_SERVICIO, Authorization: `Bearer ${CLAVE_SERVICIO}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const texto = await r.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new ErrorApi(datos?.message ?? `Error en ${funcion}`, r.status === 403 ? 403 : 400);
  return datos;
}

// Comparación en tiempo constante del secreto
function secretoValido(recibido: string | null) {
  if (!SECRETO || !recibido || recibido.length !== SECRETO.length) return false;
  let diff = 0;
  for (let i = 0; i < SECRETO.length; i++) diff |= SECRETO.charCodeAt(i) ^ recibido.charCodeAt(i);
  return diff === 0;
}

// Semilla de 32 bits de un generador criptográfico
function semillaAleatoria() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

// Partido oficial: real + pronóstico con las semillas semilla+1…+200
function simularOficial(p: { partido_id: string; semilla: number; local: unknown; visitante: unknown }) {
  const real = simularPartido(p.local, p.visitante, p.semilla);
  const pron = simularPronostico(p.local, p.visitante, p.semilla, SIMULACIONES_PRONOSTICO);
  return {
    partido_id: p.partido_id,
    goles: real.goles,
    pr: real.pr,
    pr_esperado: pron.prEsperado,
    pA: pron.pA, pEmpate: pron.pEmpate, pB: pron.pB,
    lesiones: real.eventos.filter((e: { tipo: string }) => e.tipo === 'lesion').map((e: { carta: string }) => e.carta),
    estadisticas: real.estadisticas,
  };
}

async function jornada(req: Request, cuerpo: { jornada_id?: string }) {
  if (!secretoValido(req.headers.get('x-slr-secreto'))) throw new ErrorApi('No autorizado', 401);
  if (!cuerpo.jornada_id) throw new ErrorApi('Falta jornada_id');
  const datos = await rpc('motor_jornada_pendiente', { p_jornada: cuerpo.jornada_id });
  if (datos.estado !== 'cerrada') return { ok: true, ya_simulada: true, estado: datos.estado };
  const resultados = datos.partidos.map(simularOficial);
  const guardado = await rpc('motor_guardar_jornada', {
    p_jornada: cuerpo.jornada_id, p_resultados: resultados, p_version: VERSION,
  });
  return { ok: true, version: VERSION, partidos: resultados.length, ...guardado };
}

async function amistoso(cuerpo: { token?: string; rival_equipo_id?: string }) {
  const prep = await rpc('motor_preparar_amistoso', { p_token: cuerpo.token ?? '', p_rival: cuerpo.rival_equipo_id });
  const r = simularPartido(prep.local, prep.visitante, prep.semilla);
  const resultado = {
    goles: r.goles, pr: r.pr, estadisticas: r.estadisticas,
    lesiones: r.eventos.filter((e: { tipo: string }) => e.tipo === 'lesion').map((e: { carta: string }) => e.carta),
  };
  await rpc('motor_guardar_amistoso', { p_partido: prep.partido_id, p_resultado: resultado, p_version: VERSION });
  return { partido_id: prep.partido_id, semilla: prep.semilla, version: VERSION, goles: r.goles };
}

async function pronostico(cuerpo: { token?: string; equipo_id?: string }) {
  const prep = await rpc('motor_preparar_pronostico', { p_token: cuerpo.token ?? '', p_equipo: cuerpo.equipo_id });
  if (prep.sin_partido) return { sin_partido: true };
  const p = simularPronostico(prep.local, prep.visitante, semillaAleatoria(), SIMULACIONES_PRONOSTICO);
  const [ganar, perder] = prep.es_local ? [p.pA, p.pB] : [p.pB, p.pA];
  return {
    jornada: prep.jornada, cierre_en: prep.cierre_en, partido_id: prep.partido_id, rival_id: prep.rival_id,
    es_local: prep.es_local, p_ganar: ganar, p_empate: p.pEmpate, p_perder: perder, simulaciones: SIMULACIONES_PRONOSTICO,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Usa POST' }, 405);
  try {
    const cuerpo = await req.json().catch(() => ({}));
    switch (cuerpo.accion) {
      case 'jornada':    return responder(await jornada(req, cuerpo));
      case 'amistoso':   return responder(await amistoso(cuerpo));
      case 'pronostico': return responder(await pronostico(cuerpo));
      default:           return responder({ error: 'Acción desconocida: jornada, amistoso o pronostico' }, 400);
    }
  } catch (e) {
    const status = e instanceof ErrorApi ? e.status : 500;
    return responder({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});
