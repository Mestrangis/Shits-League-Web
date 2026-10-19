/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — Liga
   Clasificación de la temporada actual (con "Amistoso" contra cada rival) y
   calendario con resultados y los últimos amistosos. Abrir un partido jugado
   muestra su crónica en texto (el reproductor llega en la entrega 3).
   En las listas de partidos: los tuyos en verde (ganado), rojo (perdido) o
   naranja (empate); los demás en gris. Marcador grande y, junto a cada
   equipo, la foto de perfil de su dueño en Shits League (👤 si no tiene).
═══════════════════════════════════════════════ */
import { rpc, leer, funcion } from '../api.js';
import { esc, diaHora, toast, conEspera, fechaHora } from '../ui.js';
import { enJuego, proximaJornada, sinVer } from '../rush.js';
import { ESTADOS_LIGA } from './perfil.js';
import { abrirCronica } from './cronica.js';
import { abrirEquipo } from './ficha-equipo.js';

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
            <td class="izq"><button class="slr-enlace-equipo" type="button" data-equipo="${esc(f.equipo_id)}"><b>${esc(f.equipo)}</b></button><small>${esc(f.usuario ?? '')}</small>
              ${f.equipo_id !== yo ? `<button class="slr-amistoso" type="button" data-amistoso="${esc(f.equipo_id)}">Amistoso</button>` : ''}</td>
            <td>${f.pj}</td><td>${f.g}</td><td>${f.e}</td><td>${f.p}</td>
            <td>${f.dg > 0 ? '+' : ''}${f.dg}</td><td class="pts">${f.puntos}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

// Dueño de cada equipo de la liga: { equipoId: nombre } (para la foto de perfil)
async function duenos(liga) {
  const eqs = await leer(`equipos?select=id,usuarios(nombre,interno)&liga_id=eq.${liga}`);
  return Object.fromEntries(eqs.map(e => [e.id, e.usuarios?.interno ? '' : (e.usuarios?.nombre ?? '')]));
}
const avatar = nombre => `<span class="avatar slr-cruce__avatar" data-avatar="${esc(nombre ?? '')}" aria-hidden="true">👤</span>`;
// Las fotos las pinta renderAvatar de js/session.js (global de la app)
function pintarAvatares(cont) {
  if (typeof window.renderAvatar !== 'function') return;
  cont.querySelectorAll('[data-avatar]').forEach(el => { if (el.dataset.avatar) window.renderAvatar(el, el.dataset.avatar); });
}
// Clase del cruce: resultado si es tuyo y está jugado; gris si no juegas
function claseResultado(local, visitante, goles, yo) {
  const mio = [local, visitante].includes(yo);
  if (!mio) return 'es-ajeno';
  if (!goles) return 'es-mio';
  const [a, b] = local === yo ? goles : [goles[1], goles[0]];
  return `es-mio ${a > b ? 'es-ganado' : a < b ? 'es-perdido' : 'es-empatado'}`;
}

const ESTADOS = { programada: 'Programada', cerrada: 'En juego', simulada: 'En juego', publicada: 'Jugada', cancelada: 'Cancelada' };

function calendario(jornadas, yo, dueno) {
  if (!jornadas.length) return '<div class="slr-vacio"><b>Sin calendario</b><p>Se sortea al iniciar la temporada.</p></div>';
  return jornadas.map(j => {
    const estado = j.estado === 'programada' && enJuego(j) ? 'En juego' : ESTADOS[j.estado];
    return `
      <section class="slr-jornada ${j.estado === 'publicada' ? 'es-jugada' : ''}">
        <div class="slr-jornada__cabeza"><b>Jornada ${j.numero}</b><span>${esc(diaHora(j.cierre_en))}</span><em>${estado}</em></div>
        ${j.partidos.map(p => {
          const mio = [p.local.equipo_id, p.visitante.equipo_id].includes(yo);
          const lado = id => (id === yo ? 'slr-propio' : mio ? 'slr-rival' : '');
          // Tu último partido sin ver: sin resultado, con «▶ Ver»
          const oculto = p.goles && sinVer(p.id);
          return `
          <div class="slr-cruce ${oculto ? 'es-mio es-sin-ver' : claseResultado(p.local.equipo_id, p.visitante.equipo_id, p.goles, yo)}">
            <span class="slr-cruce__equipo slr-cruce__equipo--local">
              <button type="button" class="slr-enlace-equipo ${lado(p.local.equipo_id)}" data-equipo="${esc(p.local.equipo_id)}">${esc(p.local.equipo)}</button>${avatar(dueno[p.local.equipo_id])}</span>
            <button type="button" class="slr-cruce__marcador" data-partido="${esc(p.id)}" ${p.goles ? 'data-jugado="1"' : ''}>${oculto ? '▶ Ver' : p.goles ? `${p.goles[0]}<i>–</i>${p.goles[1]}` : 'vs'}</button>
            <span class="slr-cruce__equipo">${avatar(dueno[p.visitante.equipo_id])}
              <button type="button" class="slr-enlace-equipo ${lado(p.visitante.equipo_id)}" data-equipo="${esc(p.visitante.equipo_id)}">${esc(p.visitante.equipo)}</button></span>
          </div>`;
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

// La crónica de un amistoso lleva las tácticas guardadas de quien lo jugó: solo él la abre
async function amistosos(liga, yo, dueno, usuario) {
  const [ps, eqs] = await Promise.all([
    leer(`partidos?select=id,local_id,visitante_id,goles_local,goles_visitante,simulado_en,creado_por&liga_id=eq.${liga}&tipo=eq.amistoso&order=simulado_en.desc&limit=8`),
    leer(`equipos?select=id,nombre&liga_id=eq.${liga}`),
  ]);
  if (!ps.length) return '';
  const n = id => esc(eqs.find(e => e.id === id)?.nombre ?? 'Equipo');
  const lado = id => (id === yo ? 'slr-propio' : '');
  return `
    <section class="slr-jornada">
      <div class="slr-jornada__cabeza"><b>Amistosos</b><span>los últimos ${ps.length}</span></div>
      ${ps.map(p => `
        <button class="slr-cruce ${claseResultado(p.local_id, p.visitante_id, [p.goles_local, p.goles_visitante], yo)}" type="button" data-partido="${esc(p.id)}" data-jugado="1"${p.creado_por !== usuario ? ' data-ajeno="1"' : ''}>
          <span class="slr-cruce__equipo slr-cruce__equipo--local"><span class="${lado(p.local_id)}">${n(p.local_id)}</span>${avatar(dueno[p.local_id])}</span>
          <b class="slr-cruce__marcador">${p.goles_local}<i>–</i>${p.goles_visitante}</b>
          <span class="slr-cruce__equipo">${avatar(dueno[p.visitante_id])}<span class="${lado(p.visitante_id)}">${n(p.visitante_id)}</span></span>
        </button>`).join('')}
    </section>`;
}

// Historial público del mercado, para el pique: fichajes (compras, cláusulas,
// intercambios y subastas resueltas) y sobres con épica o legendaria
const ICONO_FICHAJE = { compra: '🏷️', clausula: '💥', intercambio: '🔁', subasta: '🔨', sobre: '🎴' };
async function fichajes(liga) {
  const filas = await leer(`historial?select=id,tipo,texto,creado_en,datos&liga_id=eq.${liga}` +
    `&tipo=in.(compra,clausula,intercambio,subasta,sobre)&order=id.desc&limit=60`);
  if (!filas.length) return '<div class="slr-vacio" data-fichajes><b>Aún no hay fichajes</b><p>Aquí salen las compras, cláusulas, intercambios, subastas ganadas y los sobres con épica o legendaria.</p></div>';
  return `<ul class="slr-fichajes" data-fichajes>${filas.map(h => {
    const sobre = h.tipo === 'sobre', leg = sobre && (h.datos?.mejor === 'legendaria' || /legendaria/.test(h.texto));
    return `<li class="slr-fichaje slr-fichaje--${esc(h.tipo)}${leg ? ' es-legendaria' : sobre ? ' es-epica' : ''}">
      <span class="slr-fichaje__icono" aria-hidden="true">${ICONO_FICHAJE[h.tipo] ?? '•'}</span>
      <span class="slr-fichaje__texto">${esc(h.texto)}</span>
      <time>${esc(fechaHora(h.creado_en))}</time></li>`;
  }).join('')}</ul>`;
}

// Estado de la liga (destino de los avisos de pausa, reanudación y temporada)
function estadoLiga(datos) {
  const info = datos.ligaInfo ?? {}, j = proximaJornada();
  const detalle = info.estado === 'pausada'
    ? `En pausa desde el ${esc(diaHora(info.pausada_en))}: mercado cerrado y calendario congelado.`
    : info.estado === 'en_curso' && j ? `Próxima jornada: ${j.numero}, cierre el ${esc(diaHora(j.cierre_en))}.`
    : info.estado === 'entre_temporadas' ? 'La temporada ha terminado: la siguiente empieza cuando la inicie el administrador.'
    : info.estado === 'preparacion' ? 'La primera temporada empieza cuando la inicie el administrador.' : '';
  return `
    <section class="slr-estado-liga-tarjeta ${info.estado === 'pausada' ? 'es-pausa' : ''}" data-estado-liga>
      <div><small>Estado de la liga</small><b>${esc(ESTADOS_LIGA[info.estado] ?? info.estado ?? '—')}</b></div>
      ${detalle ? `<p>${detalle}</p>` : ''}
    </section>`;
}

export async function pintar(cont, ctx) {
  const { datos } = ctx;
  const yo = datos.equipo.id;
  let clas = null;
  const dueno = vista === 'calendario' ? await duenos(datos.liga.id) : {};
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
        <button type="button" data-vista="fichajes" class="${vista === 'fichajes' ? 'activo' : ''}">Fichajes</button>
      </div>
    </header>
    ${estadoLiga(datos)}
    ${vista === 'fichajes' ? await fichajes(datos.liga.id) : vista === 'clasificacion'
      ? `${clas.sin_ver ? `<button class="slr-banner slr-sin-ver" type="button" data-partido="${esc(clas.sin_ver.partido_id)}" data-jugado="1">
          <b>▶ Tu partido de la jornada ${clas.sin_ver.numero} ya se ha jugado</b><span>La clasificación no cuenta esa jornada hasta que lo veas.</span></button>` : ''}
        ${tabla(clas.clasificacion, yo)}<p class="slr-suave">Un amistoso se juega al momento con las alineaciones guardadas: no da puntos, dinero ni lesiones.</p>`
      : `${calendario(datos.jornadas, yo, dueno)}${await amistosos(datos.liga.id, yo, dueno, datos.yo?.usuario?.id)}`}`;
  pintarAvatares(cont);

  cont.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => { vista = b.dataset.vista; ctx.pintar(); }));
  cont.querySelectorAll('[data-equipo]').forEach(b => b.addEventListener('click', () => abrirEquipo(b.dataset.equipo, ctx).catch(() => {})));
  cont.querySelectorAll('[data-partido]').forEach(b => b.addEventListener('click', () => {
    if (!b.dataset.jugado) { toast('Este partido todavía no se ha jugado', 'info'); return; }
    if (b.dataset.ajeno) { toast('La crónica de un amistoso solo la ve quien lo jugó: lleva su táctica', 'info'); return; }
    abrirCronica(b.dataset.partido, ctx).catch(() => {});
  }));
  cont.querySelectorAll('[data-amistoso]').forEach(b => b.addEventListener('click', () => conEspera(b, async () => {
    const r = await funcion({ accion: 'amistoso', rival_equipo_id: b.dataset.amistoso });
    // Sin el resultado: se reproduce solo la primera vez
    await abrirCronica(r.partido_id, ctx);
  }).catch(() => {})));
}
