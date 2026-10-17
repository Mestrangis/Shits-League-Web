/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — ficha de un equipo
   Desde la clasificación, el calendario o el próximo rival: nombre, posición,
   últimos resultados, la plantilla completa (siempre visible: hace falta para
   fichar y clausular) y la alineación que usó en su ÚLTIMO partido oficial
   publicado. Nunca su alineación guardada actual. Con el motor v2, las tácticas
   que usó en sus últimos partidos publicados (nunca la guardada para el próximo).
═══════════════════════════════════════════════ */
import { rpc, leer, funcion } from '../api.js';
import { esc, hoja, conEspera, toast, miles } from '../ui.js';
import { cartaHTML, normalizarCarta } from '../carta.js';
import { campoHTML, enlazarCampo } from '../campo.js';
import { abrirDetalle } from './detalle.js';
import { abrirCronica } from './cronica.js';
import { TACTICA, chipTactica } from '../tactica.js';

export async function abrirEquipo(equipoId, ctx) {
  const { datos } = ctx;
  const yo = datos.equipo?.id;
  const [[eq], clas, partidos, filas, nombres] = await Promise.all([
    leer(`equipos?select=id,nombre,usuarios(nombre,interno)&id=eq.${equipoId}`),
    rpc('slr_clasificacion', { liga_id: datos.liga.id }).catch(() => ({ clasificacion: [] })),
    // RLS: solo se ven los partidos publicados
    leer(`partidos?select=id,jornada_id,local_id,visitante_id,goles_local,goles_visitante,alineaciones_congeladas,tacticas,simulado_en,jornadas(numero)` +
      `&tipo=eq.liga&or=(local_id.eq.${equipoId},visitante_id.eq.${equipoId})&order=simulado_en.desc&limit=5`),
    leer(`cartas?select=id,diseno_id,equipo_id,multiplicador_clausula,blindada_hasta,energia,disenos_carta(nombre,tipo,acabado,color,tier,rareza,coleccion_id,perfil,personas,ata,def,con,valor,poderes,imagen_url,texto,estamina,tactica_favorita)&equipo_id=eq.${equipoId}`),
    leer(`equipos?select=id,nombre&liga_id=eq.${datos.liga.id}`),
  ]);
  if (!eq) { toast('Ese equipo ya no existe', 'error'); return; }
  const nombre = id => nombres.find(e => e.id === id)?.nombre ?? 'Equipo';
  const fila = clas.clasificacion.find(f => f.equipo_id === equipoId);
  const cartas = filas.map(f => ({ ...normalizarCarta(f), clausula: Math.round(f.disenos_carta.valor * Number(f.multiplicador_clausula)),
    blindada: f.blindada_hasta && new Date(f.blindada_hasta) > Date.now() })).sort((a, b) => b.ovr - a.ovr);
  const valorTotal = cartas.reduce((s, c) => s + c.valor, 0);
  const ultimo = partidos[0];
  const mio = equipoId === yo;

  const resultados = partidos.map(p => {
    const local = p.local_id === equipoId;
    const [a, b] = local ? [p.goles_local, p.goles_visitante] : [p.goles_visitante, p.goles_local];
    const r = a > b ? 'V' : a < b ? 'D' : 'E';
    return `<button class="slr-ficha-eq__resultado" type="button" data-cronica="${esc(p.id)}">
      <span class="slr-res slr-res--${r}">${r}</span><b>${a}-${b}</b><small>J${p.jornadas?.numero ?? '?'} · ${local ? 'vs' : 'en'} ${esc(nombre(local ? p.visitante_id : p.local_id))}</small></button>`;
  }).join('');

  // Tácticas de sus últimos partidos publicados (desde el motor v2)
  const tacticas = partidos.filter(p => p.tacticas?.A).map(p => {
    const lado = p.local_id === equipoId ? 'A' : 'B', otro = lado === 'A' ? 'B' : 'A';
    const [t1, t2] = p.tacticas[lado], planB = p.tacticas.plan_b?.[lado];
    const gano = p.tacticas.cruce?.[0] === lado, perdio = p.tacticas.cruce?.[0] === otro;
    return `<li class="slr-ficha-eq__tactica">
      <small>J${p.jornadas?.numero ?? '?'} vs ${esc(nombre(lado === 'A' ? p.visitante_id : p.local_id))}</small>
      <span>${chipTactica(t1)}${t2 !== t1 ? ` → ${chipTactica(t2)}${planB ? ' <em>plan B</em>' : ''}` : ''}</span>
      <small class="${gano ? 'es-bien' : perdio ? 'es-mal' : ''}">rival: ${TACTICA[p.tacticas[otro][0]]?.icono ?? ''} · cruce ${gano ? 'ganado' : perdio ? 'perdido' : 'igualado'}</small>
    </li>`;
  }).join('');

  const el = hoja(`
    <div class="slr-ficha-eq">
      <header class="slr-ficha-eq__cabeza">
        <h2 class="slr-titulo ${mio ? 'slr-propio' : 'slr-rival'}">${esc(eq.nombre)}</h2>
        <p class="slr-suave">${eq.usuarios?.interno ? '🤖 bot de pruebas' : esc(eq.usuarios?.nombre ?? '')}</p>
      </header>
      <div class="slr-cifras">
        <div><small>Posición</small><b>${fila ? `${fila.posicion}º` : '—'}</b><em>${fila ? `${fila.puntos} pts · ${fila.pj} PJ` : 'sin jugar'}</em></div>
        <div><small>Goles</small><b>${fila ? `${fila.gf}-${fila.gc}` : '—'}</b><em>${fila ? `${fila.g}V ${fila.e}E ${fila.p}D` : ''}</em></div>
        <div><small>Plantilla</small><b>${cartas.length}</b><em>valor ${miles(valorTotal)}</em></div>
      </div>
      ${!mio ? '<button class="slr-btn slr-btn--fantasma" type="button" data-amistoso>Jugar un amistoso</button>' : ''}

      <h3 class="slr-subtitulo">Últimos resultados</h3>
      ${resultados || '<p class="slr-suave">Todavía no ha jugado ningún partido oficial.</p>'}

      ${tacticas ? `<h3 class="slr-subtitulo">Tácticas en sus últimos partidos</h3>
      <ul class="slr-ficha-eq__tacticas">${tacticas}</ul>
      <p class="slr-suave">La que tenga guardada para el próximo partido no se ve hasta que se publique.</p>` : ''}

      <h3 class="slr-subtitulo">Alineación en su último partido</h3>
      ${ultimo ? campoHTML(ultimo.alineaciones_congeladas[ultimo.local_id === equipoId ? 'local' : 'visitante'],
          { titulo: eq.nombre, clase: mio ? 'slr-propio' : 'slr-rival', nota: `J${ultimo.jornadas?.numero ?? '?'} vs ${nombre(ultimo.local_id === equipoId ? ultimo.visitante_id : ultimo.local_id)}` })
        : '<p class="slr-suave">Se verá cuando juegue su primer partido oficial. Su alineación actual no es pública.</p>'}

      <h3 class="slr-subtitulo">Plantilla completa</h3>
      <div class="slr-rejilla slr-rejilla--compacta">
        ${cartas.map(c => `<button class="slr-ficha" type="button" data-id="${esc(c.id)}">
          ${cartaHTML(c, { tam: 's', blindada: c.blindada })}
          <span class="slr-ficha__datos"><span><small>Valor</small><b>${miles(c.valor)}</b></span><span><small>Cláusula</small><b>${miles(c.clausula)}</b></span></span>
        </button>`).join('') || '<p class="slr-suave">Sin cartas.</p>'}
      </div>
    </div>`, { titulo: 'Equipo', completa: true });

  enlazarCampo(el, ctx);
  el.querySelectorAll('.slr-ficha[data-id]').forEach(b => b.addEventListener('click', () => abrirDetalle(b.dataset.id, ctx).catch(() => {})));
  el.querySelectorAll('[data-cronica]').forEach(b => b.addEventListener('click', () => abrirCronica(b.dataset.cronica, ctx).catch(() => {})));
  el.querySelector('[data-amistoso]')?.addEventListener('click', e => conEspera(e.currentTarget, async () => {
    const r = await funcion({ accion: 'amistoso', rival_equipo_id: equipoId });
    toast(`Amistoso: ${r.goles.join(' – ')}`, 'ok');
    await abrirCronica(r.partido_id, ctx);
  }).catch(() => {}));
}
