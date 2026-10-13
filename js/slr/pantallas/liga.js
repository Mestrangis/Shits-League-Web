/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — Liga
   Clasificación de la temporada actual y calendario con resultados.
   Abrir un partido muestra "Próximamente" (el reproductor llega en la entrega 3).
═══════════════════════════════════════════════ */
import { rpc } from '../api.js';
import { esc, diaHora, hoja } from '../ui.js';
import { enJuego } from '../rush.js';

let vista = 'clasificacion';

function tabla(filas, yo) {
  if (!filas.length) return '<div class="slr-vacio"><b>Sin clasificación</b><p>Empieza cuando el administrador inicie la temporada.</p></div>';
  return `
    <div class="slr-tabla-envoltura">
      <table class="slr-tabla">
        <thead><tr><th>#</th><th class="izq">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>PTS</th></tr></thead>
        <tbody>${filas.map(f => `
          <tr class="${f.equipo_id === yo ? 'es-mio' : ''}">
            <td>${f.posicion}</td>
            <td class="izq"><b>${esc(f.equipo)}</b><small>${esc(f.usuario ?? '')}</small></td>
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
          <button class="slr-cruce ${mio ? 'es-mio' : ''}" type="button" data-partido="${esc(p.id)}">
            <span class="${lado(p.local.equipo_id)}">${esc(p.local.equipo)}</span>
            <b>${p.goles ? `${p.goles[0]} – ${p.goles[1]}` : 'vs'}</b>
            <span class="${lado(p.visitante.equipo_id)}">${esc(p.visitante.equipo)}</span>
          </button>`;
        }).join('')}
        ${j.descansa ? `<p class="slr-jornada__descansa">Descansa: <span class="${j.descansa.equipo_id === yo ? 'slr-propio' : ''}">${esc(j.descansa.equipo)}</span></p>` : ''}
      </section>`;
  }).join('');
}

export async function pintar(cont, ctx) {
  const { datos } = ctx;
  const yo = datos.equipo.id;
  const clas = vista === 'clasificacion' ? await rpc('slr_clasificacion', { liga_id: datos.liga.id }) : null;

  cont.innerHTML = `
    <header class="slr-cabecera">
      <h1 class="slr-titulo">${esc(datos.liga.nombre)} <small>${datos.temporada ? `Temporada ${datos.temporada.numero}` : 'Sin temporada'}</small></h1>
      <div class="slr-segmentos" role="group" aria-label="Vista">
        <button type="button" data-vista="clasificacion" class="${vista === 'clasificacion' ? 'activo' : ''}">Clasificación</button>
        <button type="button" data-vista="calendario" class="${vista === 'calendario' ? 'activo' : ''}">Calendario</button>
      </div>
    </header>
    ${vista === 'clasificacion' ? tabla(clas.clasificacion, yo) : calendario(datos.jornadas, yo)}`;

  cont.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => { vista = b.dataset.vista; ctx.pintar(); }));
  cont.querySelectorAll('[data-partido]').forEach(b => b.addEventListener('click', () => hoja(`
    <div class="slr-vacio"><b>Próximamente</b><p>El reproductor de partidos llega en la próxima entrega: podrás ver cada jugada, el tirador y los poderes que se activaron.</p></div>`,
  { titulo: 'Partido' })));
}
