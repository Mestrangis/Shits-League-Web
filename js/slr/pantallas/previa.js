/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — estados previos (sin liga o sin equipo propio)
   · Sin liga: el admin la crea; el resto espera.
   · Liga en preparación o entre temporadas: formulario para unirse.
   · Temporada en marcha (o en pausa): hay que esperar a que termine.
   El admin de la liga ve también su panel de administración.
═══════════════════════════════════════════════ */
import { rpc } from '../api.js';
import { esc, conEspera, toast } from '../ui.js';
import { panelAdmin } from './perfil.js';

function portada(titulo, texto, extra = '') {
  return `
    <section class="slr-previa">
      <div class="slr-previa__marca">RUSH</div>
      <h1 class="slr-titulo">${titulo}</h1>
      <p class="slr-previa__texto">${texto}</p>
      ${extra}
    </section>`;
}

export async function pintar(cont, ctx) {
  const { datos, recargar, navegar } = ctx;
  const { liga, yo } = datos;

  if (!liga) {
    if (yo.es_admin) {
      cont.innerHTML = portada('Crea la liga', 'Todavía no hay liga. Como administrador, eres quien la abre; después cada uno se apunta con su equipo.', `
        <form class="slr-form" data-crear>
          <label class="slr-campo"><span>Nombre de la liga</span>
            <input class="slr-input" name="nombre" maxlength="40" value="Shits League Rush" required></label>
          <button class="slr-btn slr-btn--grande" type="submit">Crear la liga</button>
        </form>`);
      cont.querySelector('[data-crear]').addEventListener('submit', e => {
        e.preventDefault();
        conEspera(e.submitter ?? e.target.querySelector('button'), async () => {
          await rpc('slr_crear_liga', { nombre: e.target.nombre.value });
          toast('Liga creada. Ahora apúntate con tu equipo.', 'ok');
          await recargar();
          navegar('inicio');
        }).catch(() => {});
      });
    } else {
      cont.innerHTML = portada('Todavía no hay liga', 'En cuanto el administrador la abra podrás apuntarte con tu equipo desde aquí.');
    }
    return;
  }

  const abierta = ['preparacion', 'entre_temporadas'].includes(liga.estado);
  if (abierta) {
    const texto = liga.estado === 'preparacion'
      ? 'La liga está en preparación. Elige el nombre de tu equipo: recibirás 11 cartas, 5.000 monedas y una alineación 2-2-2 lista para jugar.'
      : `La temporada ${liga.temporada} ha terminado. Puedes apuntarte antes de que empiece la siguiente.`;
    cont.innerHTML = portada(`Únete a ${esc(liga.nombre)}`, texto, `
      <form class="slr-form" data-unirse>
        <label class="slr-campo"><span>Nombre del equipo</span>
          <input class="slr-input" name="nombre" minlength="3" maxlength="30" placeholder="Ej.: Capibaras FC" required></label>
        <button class="slr-btn slr-btn--grande" type="submit">Unirme</button>
      </form>`);
    cont.querySelector('[data-unirse]').addEventListener('submit', e => {
      e.preventDefault();
      conEspera(e.submitter ?? e.target.querySelector('button'), async () => {
        const nombre = e.target.nombre.value;
        if (liga.es_prueba) await rpc('slr_unirse_liga', { codigo_invitacion: liga.codigo_invitacion, nombre_equipo: nombre });
        else await rpc('slr_unirse_liga_principal', { nombre_equipo: nombre });
        toast('¡Bienvenido! Tu plantilla ya está en el vestuario.', 'ok');
        await recargar();
        navegar('alineacion');
      }).catch(() => {});
    });
  } else {
    cont.innerHTML = portada('Temporada en marcha',
      'Podrás unirte cuando termine la temporada. Mientras tanto, nadie puede entrar para no descuadrar el calendario.');
  }

  if (liga.es_admin) {
    const admin = document.createElement('div');
    cont.appendChild(admin);
    await panelAdmin(admin, ctx);
  }
}
