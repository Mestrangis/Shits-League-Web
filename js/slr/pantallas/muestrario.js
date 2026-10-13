/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — muestrario de acabados (modo pruebas)
   La misma carta en todos los acabados registrados, sin y con foto, lado a lado
   y con el movimiento activo (ratón, dedo o giroscopio), para comparar. Debajo,
   la composición de la carta con varias fotos en tamaño pequeño y grande.
   Las fotos de muestra son las de perfil de Shits League (JUGADORES_FOTOS).
═══════════════════════════════════════════════ */
import { esc, hoja } from '../ui.js';
import { cartaHTML } from '../carta.js';
import { listaAcabados } from '../acabados/index.js';

function fotosDeMuestra() {
  // const global de js/session.js (script clásico): visible por su nombre, no en window
  const todas = typeof JUGADORES_FOTOS !== 'undefined' ? JUGADORES_FOTOS : {};
  const fotos = Object.values(todas).filter(Boolean);
  return fotos.slice(0, 4);
}

export function abrirMuestrario(ctx) {
  const base = ctx.datos.cartas[0] ?? { id: 'muestra', nombre: 'Carta de muestra', tipo: 'individual', ata: 72, def: 58, con: 64, ovr: 68, valor: 400, poderes: [], personas: [] };
  const fotos = fotosDeMuestra();
  const carta = (extra, opciones = {}) => cartaHTML({ ...base, id: `muestra-${Math.random().toString(36).slice(2, 8)}`, ...extra }, opciones);

  hoja(`
    <div class="slr-muestrario">
      <p class="slr-suave">Mueve el ratón por encima, arrastra el dedo o inclina el móvil. Cada acabado vive en su propio
        archivo (js/slr/acabados/ y css/acabados/): añadir uno nuevo es crearlo y registrarlo.</p>
      ${listaAcabados().map(a => `
        <section class="slr-muestrario__acabado">
          <h3 class="slr-subtitulo">${esc(a.nombre)} <small>${esc(a.descripcion ?? '')}</small></h3>
          <div class="slr-muestrario__par">
            <figure>${carta({ acabado: a.id, imagen_url: null }, { tam: 's' })}<figcaption>Sin foto</figcaption></figure>
            <figure>${carta({ acabado: a.id, imagen_url: fotos[0] ?? null }, { tam: 's' })}<figcaption>Con foto</figcaption></figure>
          </div>
        </section>`).join('')}

      ${fotos.length ? `
        <h3 class="slr-subtitulo">Composición con fotos</h3>
        <p class="slr-suave">La foto ocupa toda la carta (recortada, nunca deformada); OVR arriba a la izquierda y nombre,
          tipo y stats abajo sobre un degradado. Tamaño de alineación, de plantilla y de detalle.</p>
        <div class="slr-muestrario__fotos">
          ${fotos.map((f, i) => `<figure class="slr-muestrario__xs">${carta({ imagen_url: f, nombre: ['Foto clara', 'Foto oscura', 'Retrato', 'Cuerpo entero'][i] ?? 'Foto' }, { tam: 'xs', destacar: 'ATA', capitan: i === 0 })}</figure>`).join('')}
        </div>
        <div class="slr-rejilla">
          ${fotos.map((f, i) => `<figure>${carta({ imagen_url: f, acabado: ['normal', 'foil', 'brillante', 'plateada'][i] ?? 'normal' }, { tam: 's', blindada: i === 1, enVenta: i === 2, tocada: i === 3 })}</figure>`).join('')}
        </div>
        <div class="slr-muestrario__grande">${carta({ imagen_url: fotos[1] ?? fotos[0], acabado: 'foil' }, { tam: 'l' })}</div>` : ''}
    </div>`, { titulo: 'Muestrario de acabados', completa: true });
}
