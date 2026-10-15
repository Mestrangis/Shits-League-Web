/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — sin equipo propio
   Solo hay una liga (la de Marcos): nadie la crea ni invita a nadie.
   · Liga en preparación o entre temporadas: bienvenida con una sola pregunta,
     el nombre del equipo; al confirmar se crea y se entra a Inicio.
   · Temporada en marcha (o en pausa): hay que esperar a que termine.
   (En localhost, con un bot, la liga es su liga de prueba.)
═══════════════════════════════════════════════ */
import { rpc } from '../api.js';
import { conEspera, toast, miles } from '../ui.js';
import { panelAdmin } from './perfil.js';

function portada(titulo, texto, extra = '') {
  return `
    <section class="slr-previa">
      <div class="slr-previa__marca">RUSH</div>
      <h1 class="slr-titulo">${titulo}</h1>
      ${texto ? `<p class="slr-previa__texto">${texto}</p>` : ''}
      ${extra}
    </section>`;
}

export async function pintar(cont, ctx) {
  const { datos, recargar, navegar } = ctx;
  const { liga } = datos;

  if (!liga) {
    cont.innerHTML = portada('Todavía no hay liga', 'Vuelve en un rato.');
    return;
  }

  if (['preparacion', 'entre_temporadas'].includes(liga.estado)) {
    cont.innerHTML = portada('¿Cómo quieres llamar a tu equipo?', '', `
      <form class="slr-form" data-unirse>
        <input class="slr-input slr-input--grande" name="nombre" minlength="3" maxlength="30"
               placeholder="Nombre del equipo" aria-label="Nombre del equipo" autocomplete="off" required>
        <button class="slr-btn slr-btn--grande" type="submit">¡Vamos!</button>
      </form>`);
    const form = cont.querySelector('[data-unirse]');
    form.addEventListener('submit', e => {
      e.preventDefault();
      conEspera(form.querySelector('button'), async () => {
        const nombre = form.nombre.value;
        // La liga de prueba (solo en localhost) se une con su código; la real, sin código
        const r = liga.es_prueba
          ? await rpc('slr_unirse_liga', { codigo_invitacion: liga.codigo_invitacion, nombre_equipo: nombre })
          : await rpc('slr_unirse_liga_principal', { nombre_equipo: nombre });
        toast(`¡Bienvenido, ${nombre}! Ya tienes ${r.cartas} ${r.cartas === 1 ? 'carta' : 'cartas'} y ${miles(r.equipo.saldo)} monedas.`, 'ok');
        if (r.aviso) toast(r.aviso, 'error');
        await recargar();
        navegar('equipo');
      }).catch(() => {});
    });
    return;
  }

  cont.innerHTML = portada('Temporada en marcha',
    'Podrás unirte cuando termine la temporada.');

  // El admin sin equipo sigue pudiendo gestionar la temporada
  if (liga.es_admin) {
    const admin = document.createElement('div');
    cont.appendChild(admin);
    await panelAdmin(admin, ctx);
  }
}
