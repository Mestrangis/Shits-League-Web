/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — Liga
   Clasificación de la temporada actual (con "Amistoso" contra cada rival) y
   calendario con resultados y los últimos amistosos. Abrir un partido jugado
   muestra su crónica en texto (el reproductor llega en la entrega 3).
═══════════════════════════════════════════════ */
import { rpc, leer, funcion } from '../api.js';
import { esc, diaHora, toast, conEspera } from '../ui.js';
import { enJuego } from '../rush.js';
import { abrirCronica } from './cronica.js';

let vista = 'clasificacion';

function tabla(filas, yo) {
  if (!filas.length) return '';
  return `
    <div class="slr-tabla-envoltura">
      <table class="slr-tabla">
        <thead><tr><th>#</th><th class="izq">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>PTS</th></tr></thead>
        <tbody>${filas.map(f => `
          <tr class="${f.equipo_id === yo ? 'es-mio' : ''}">
            <td>${f.posicion}</td>
            <td class="izq"><b>${esc(f.equipo)}</b><small>${esc(f.usuario ?? '')}</small>
              ${f.equipo_id !== yo ? `<button class="slr-amistoso" type="button" data-amistoso="${esc(f.equipo_id)}">Amistoso</button>` : ''}</td>
            <td>${f.pj}</td><td>${f.g}</td><td>${f.e}</td><td>${f.p}</td>
            <td>${f.dg > 0 ? '+' : ''}${f.dg}</td><td class="pts">${f.puntos}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

const ESTADOS = { programada: 'Programada', cerrada: 'En juego', simulada: 'En juego', publicada: 'Jugada', cancelada: 'Cancelada' };

function calendario(jornadas, yo) {
  if (!jornadas.length) return '<div class="slr-vacio"><b>Sin calendario</b><p>Se sortea al iniciar la temporada.</p></div>';
  return jornadas.map(j => {
    const estado = j.estado === 'programada' && enJuego(j) ? 'En juego' : ESTADOS[j.estado];
    return `
      <section class="slr-jornada ${j.estado === 'publicada' ? 'es-jugada' : ''}">
        <div class="slr-jornada__cabeza"><b>Jornada ${j.numero}</b><span>${esc(diaHora(j.cierre_en))}</span><em>${estado}</em></div>
        ${j.partidos.map(p => {
          const mio = [p.local.equipo_id, p.visitante.equipo_id].includes(yo);
          const lado = id => (id === yo ? 'slr-propio' : mio ? 'slr-rival' : '');
          return `
          <button class="slr-cruce ${mio ? 'es-mio' : ''}" type="button" data-partido="${esc(p.id)}" ${p.goles ? 'data-jugado="1"' : ''}>
            <span class="${lado(p.local.equipo_id)}">${esc(p.local.equipo)}</span>
            <b>${p.goles ? `${p.goles[0]} – ${p.goles[1]}` : 'vs'}</b>
            <span class="${lado(p.visitante.equipo_id)}">${esc(p.visitante.equipo)}</span>
          </button>`;
        }).join('')}
        ${j.descansa ? `<p class="slr-jornada__descansa">Descansa: <span class="${j.descansa.equipo_id === yo ? 'slr-propio' : ''}">${esc(j.descansa.equipo)}</span></p>` : ''}
      </section>`;
  }).join('');
}

// Sin temporada (o antes de la primera) la clasificación sale vacía: se listan
// los equipos de la liga para poder jugar amistosos igualmente
async function filasSinTemporada(liga) {
  const eqs = await leer(`equipos?select=id,nombre,usuarios(nombre,interno)&liga_id=eq.${liga}&order=creado_en`);
  return eqs.map((e, i) => ({ posicion: i + 1, equipo_id: e.id, equipo: e.nombre,
    usuario: e.usuarios?.interno ? 'bot de pruebas' : e.usuarios?.nombre, pj: 0, g: 0, e: 0, p: 0, dg: 0, puntos: 0 }));
}

async function amistosos(liga, yo) {
  const [ps, eqs] = await Promise.all([
    leer(`partidos?select=id,local_id,visitante_id,goles_local,goles_visitante,simulado_en&liga_id=eq.${liga}&tipo=eq.amistoso&order=simulado_en.desc&limit=8`),
    leer(`equipos?select=id,nombre&liga_id=eq.${liga}`),
  ]);
  if (!ps.length) return '';
  const n = id => esc(eqs.find(e => e.id === id)?.nombre ?? 'Equipo');
  const lado = id => (id === yo ? 'slr-propio' : '');
  return `
    <section class="slr-jornada">
      <div class="slr-jornada__cabeza"><b>Amistosos</b><span>los últimos ${ps.length}</span></div>
      ${ps.map(p => `
        <button class="slr-cruce ${[p.local_id, p.visitante_id].includes(yo) ? 'es-mio' : ''}" type="button" data-partido="${esc(p.id)}" data-jugado="1">
          <span class="${lado(p.local_id)}">${n(p.local_id)}</span>
          <b>${p.goles_local} – ${p.goles_visitante}</b>
          <span class="${lado(p.visitante_id)}">${n(p.visitante_id)}</span>
        </button>`).join('')}
    </section>`;
}

export async function pintar(cont, ctx) {
  const { datos } = ctx;
  const yo = datos.equipo.id;
  let clas = null;
  if (vista === 'clasificacion') {
    clas = await rpc('slr_clasificacion', { liga_id: datos.liga.id });
    if (!clas.clasificacion.length) clas.clasificacion = await filasSinTemporada(datos.liga.id);
  }

  cont.innerHTML = `
    <header class="slr-cabecera">
      <h1 class="slr-titulo">${esc(datos.liga.nombre)} <small>${datos.temporada ? `Temporada ${datos.temporada.numero}` : 'Sin temporada'}</small></h1>
      <div class="slr-segmentos" role="group" aria-label="Vista">
        <button type="button" data-vista="clasificacion" class="${vista === 'clasificacion' ? 'activo' : ''}">Clasificación</button>
        <button type="button" data-vista="calendario" class="${vista === 'calendario' ? 'activo' : ''}">Calendario</button>
      </div>
    </header>
    ${vista === 'clasificacion'
      ? `${tabla(clas.clasificacion, yo)}<p class="slr-suave">Un amistoso se juega al momento con las alineaciones guardadas: no da puntos, dinero ni lesiones.</p>`
      : `${calendario(datos.jornadas, yo)}${await amistosos(datos.liga.id, yo)}`}`;

  cont.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => { vista = b.dataset.vista; ctx.pintar(); }));
  cont.querySelectorAll('[data-partido]').forEach(b => b.addEventListener('click', () => {
    if (!b.dataset.jugado) { toast('Este partido todavía no se ha jugado', 'info'); return; }
    abrirCronica(b.dataset.partido, ctx).catch(() => {});
  }));
  cont.querySelectorAll('[data-amistoso]').forEach(b => b.addEventListener('click', () => conEspera(b, async () => {
    const r = await funcion({ accion: 'amistoso', rival_equipo_id: b.dataset.amistoso });
    toast(`Amistoso: ${r.goles.join(' – ')}`, 'ok');
    await abrirCronica(r.partido_id, ctx);
  }).catch(() => {})));
}
