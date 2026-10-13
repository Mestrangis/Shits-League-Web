/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — Inicio
   Avisos de estado de la liga, próximo partido con cuenta atrás al cierre,
   saldo, último resultado, avisos (notificaciones) y acceso a la alineación.
═══════════════════════════════════════════════ */
import { rpc } from '../api.js';
import { esc, monedas, diaHora, hora, faltan, fechaHora } from '../ui.js';
import { proximaJornada, enJuego, pausada, miPartido, alineacionConfirmada } from '../rush.js';

let reloj = null;

function banners(datos) {
  const j = proximaJornada();
  const lg = datos.ligaInfo;
  const out = [];
  if (pausada()) {
    out.push(['pausa', 'Liga en pausa', 'El calendario está parado y el mercado cerrado hasta que el administrador la reanude.']);
  } else if (lg.estado === 'entre_temporadas') {
    out.push(['info', `Temporada ${lg.temporada} terminada`, 'El mercado está cerrado. La siguiente temporada empieza cuando el administrador la inicie.']);
  } else if (lg.estado === 'preparacion') {
    out.push(['info', 'La temporada aún no ha empezado', 'Ve preparando tu once: cuando el administrador la inicie, la jornada 1 será un domingo a las 20:00.']);
  } else if (enJuego(j)) {
    out.push(['cierre', `Jornada ${j.numero} en juego`, `Alineaciones y mercado cerrados. Resultados a las ${hora(j.publicacion_en)}.`]);
  }
  return out.map(([tipo, titulo, texto]) => `
    <div class="slr-banner slr-banner--${tipo}"><b>${titulo}</b><span>${texto}</span></div>`).join('');
}

function proximo(datos) {
  const j = proximaJornada();
  if (!j) return '';
  const p = miPartido(j);
  const yo = datos.equipo.id;
  let cuerpo;
  if (!p) {
    cuerpo = `<div class="slr-partido slr-partido--descanso"><b>Descansas</b><span>Esta jornada no juegas, pero cobras el salario igual.</span></div>`;
  } else {
    const local = p.local.equipo_id === yo;
    const rival = local ? p.visitante.equipo : p.local.equipo;
    cuerpo = `
      <div class="slr-partido">
        <div class="slr-partido__equipo slr-propio"><span>${esc(datos.equipo.nombre)}</span><small>${local ? 'Local' : 'Visitante'}</small></div>
        <div class="slr-partido__vs">VS</div>
        <div class="slr-partido__equipo slr-rival"><span>${esc(rival)}</span><small>${local ? 'Visitante' : 'Local'}</small></div>
      </div>`;
  }
  const abierta = !enJuego(j) && !pausada();
  return `
    <section class="slr-tarjeta slr-proximo">
      <div class="slr-tarjeta__cabeza"><span>Jornada ${j.numero}</span><span>${esc(diaHora(j.cierre_en))}</span></div>
      ${cuerpo}
      ${abierta ? `<div class="slr-cuenta"><small>Cierre de alineaciones en</small><b data-cuenta="${esc(j.cierre_en)}">${faltan(j.cierre_en)}</b></div>` : ''}
      ${p && abierta ? `<div class="slr-confirmacion ${alineacionConfirmada() ? 'es-ok' : ''}">
          ${alineacionConfirmada() ? '✓ Alineación confirmada para esta jornada (+100)' : 'Sin confirmar: guarda o confirma tu alineación para cobrar +100'}
        </div>` : ''}
      <button class="slr-btn slr-btn--grande" type="button" data-alineacion>Preparar alineación</button>
    </section>`;
}

function ultimo(datos) {
  const yo = datos.equipo.id;
  const jugadas = datos.jornadas.filter(j => j.estado === 'publicada' && miPartido(j)).reverse();
  const j = jugadas[0];
  if (!j) return '';
  const p = miPartido(j);
  const local = p.local.equipo_id === yo;
  const [gl, gv] = p.goles;
  const [mios, suyos] = local ? [gl, gv] : [gv, gl];
  const res = mios > suyos ? ['V', 'Victoria'] : mios < suyos ? ['D', 'Derrota'] : ['E', 'Empate'];
  return `
    <section class="slr-tarjeta">
      <div class="slr-tarjeta__cabeza"><span>Último resultado · Jornada ${j.numero}</span><span class="slr-res slr-res--${res[0]}">${res[1]}</span></div>
      <div class="slr-marcador">
        <span class="${local ? 'slr-propio' : 'slr-rival'}">${esc(p.local.equipo)}</span>
        <b><i class="${local ? 'slr-propio' : 'slr-rival'}">${gl}</i>–<i class="${local ? 'slr-rival' : 'slr-propio'}">${gv}</i></b>
        <span class="${local ? 'slr-rival' : 'slr-propio'}">${esc(p.visitante.equipo)}</span>
      </div>
    </section>`;
}

const nuevos = lista => {
  const n = lista.filter(x => !x.leida).length;
  return n === 0 ? '' : n === 1 ? '1 nuevo' : `${n} nuevos`;
};

function avisos(lista) {
  if (!lista.length) return `<section class="slr-tarjeta"><div class="slr-tarjeta__cabeza"><span>Avisos</span></div>
    <p class="slr-suave">No tienes avisos.</p></section>`;
  return `
    <section class="slr-tarjeta">
      <div class="slr-tarjeta__cabeza"><span>Avisos</span><span>${nuevos(lista)}</span></div>
      <ul class="slr-avisos">
        ${lista.map(n => `
          <li class="${n.leida ? '' : 'es-nuevo'}">
            <span>${esc(n.datos?.texto ?? n.tipo)}</span><time>${esc(fechaHora(n.creada_en))}</time>
          </li>`).join('')}
      </ul>
    </section>`;
}

export async function pintar(cont, { datos, navegar }) {
  clearInterval(reloj);
  const notif = await rpc('slr_notificaciones', {}).catch(() => ({ notificaciones: [] }));
  const lista = notif.notificaciones.filter(n => !n.liga_id || n.liga_id === datos.liga.id).slice(0, 12);

  cont.innerHTML = `
    ${banners(datos)}
    <section class="slr-saldo">
      <div><small>${esc(datos.equipo.nombre)}</small><span>Saldo</span></div>
      <b>${monedas(datos.equipo.saldo)}</b>
    </section>
    ${proximo(datos) || `<section class="slr-tarjeta"><p class="slr-suave">No hay ninguna jornada pendiente.</p>
      <button class="slr-btn" type="button" data-alineacion>Preparar alineación</button></section>`}
    ${ultimo(datos)}
    ${avisos(lista)}`;

  cont.querySelectorAll('[data-alineacion]').forEach(b => b.addEventListener('click', () => navegar('alineacion')));

  // Cuenta atrás viva mientras la pantalla esté montada
  reloj = setInterval(() => {
    const el = cont.querySelector('[data-cuenta]');
    if (!el?.isConnected) { clearInterval(reloj); return; }
    el.textContent = faltan(el.dataset.cuenta);
  }, 30000);

  // Los avisos mostrados quedan leídos (se siguen viendo marcados como nuevos hasta salir)
  const nuevas = lista.filter(n => !n.leida).map(n => n.id);
  if (nuevas.length) rpc('slr_notificaciones', { marcar_leidas: nuevas }, { silencioso: true }).catch(() => {});
}
