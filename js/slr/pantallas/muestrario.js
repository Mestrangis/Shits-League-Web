/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — muestrario de cartas (modo pruebas)
   Arriba, el modelo de carta: las cuatro rarezas (el marco) en grande y en
   miniatura, los cinco tipos (el icono) y una colección de muestra (fondo,
   emblema tintado y nombre bajo el nombre de la carta, en grande; en
   miniatura solo el emblema). Después, la misma carta en todos los acabados
   registrados, sin y con foto, lado a lado
   y con el movimiento activo (ratón, dedo o giroscopio), para comparar. Debajo,
   la composición de la carta con varias fotos en tamaño pequeño y grande, los
   colores de la paleta, una foto PNG sin fondo (assets/slr-muestra-sin-fondo.png:
   el fondo de la carta tiene que verse detrás) y nombres largos en los tres
   tamaños. Las fotos de muestra son las de perfil de Shits League (JUGADORES_FOTOS).
═══════════════════════════════════════════════ */
import { esc, hoja } from '../ui.js';
import { cartaHTML, RAREZAS, TIPOS, iconoTipo } from '../carta.js';
import { listaAcabados } from '../acabados/index.js';
import { COLORES } from '../generador.js';

const PNG_SIN_FONDO = new URL('../../../assets/slr-muestra-sin-fondo.png', import.meta.url).href;
const NOMBRES_LARGOS = ['Los Tres Caballeros', 'El Trío Calavera de Getafe', 'Los Hermanos Ibáñez Montero'];
const TIER_DE = { comun: 'D', rara: 'B', epica: 'A', legendaria: 'S' };
// Emblema de muestra: SVG monocromo (una luna con estrellas) como data URI; la app lo tiñe
const EMBLEMA_MUESTRA = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M40 6a26 26 0 1 0 18 44A22 22 0 0 1 40 6z"/>' +
  '<path d="M48 14l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM54 32l1.3 3 3 1.3-3 1.3-1.3 3-1.3-3-3-1.3 3-1.3z"/></svg>');
const COLECCIONES_MUESTRA = [
  { id: 'muestra-dormidito', nombre: 'Dormidito', color: 'morado', emblema_url: EMBLEMA_MUESTRA },
  { id: 'muestra-down', nombre: 'Down', color: 'naranja', emblema_url: EMBLEMA_MUESTRA },
];

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

  const [colA, colB] = COLECCIONES_MUESTRA;
  hoja(`
    <div class="slr-muestrario">
      <section class="slr-muestrario__acabado" data-muestra="rarezas">
        <h3 class="slr-subtitulo">Rarezas <small>el marco; sale del tier (F, E, D común · C, B rara · A épica · S legendaria)</small></h3>
        <div class="slr-muestrario__colores">
          ${Object.entries(RAREZAS).map(([k, v]) => `<figure>${carta({ tier: TIER_DE[k], rareza: k, nombre: v, coleccion_id: null }, { tam: 's' })}<figcaption>${esc(v)}</figcaption></figure>`).join('')}
        </div>
        <div class="slr-muestrario__fotos">
          ${Object.entries(RAREZAS).map(([k, v]) => `<figure class="slr-muestrario__xs">${carta({ tier: TIER_DE[k], rareza: k, nombre: v, coleccion_id: null }, { tam: 'xs', destacar: 'ATA' })}</figure>`).join('')}
        </div>
      </section>
      <section class="slr-muestrario__acabado" data-muestra="tipos">
        <h3 class="slr-subtitulo">Tipos <small>solo descriptivo: un icono bajo la media</small></h3>
        <div class="slr-muestrario__tipos">
          ${Object.entries(TIPOS).map(([k, v]) => `<span><i>${iconoTipo(k)}</i>${esc(v)}</span>`).join('')}
        </div>
      </section>
      <section class="slr-muestrario__acabado" data-muestra="colecciones">
        <h3 class="slr-subtitulo">Colecciones <small>fondo del color de la colección, emblema tintado y su nombre bajo el de la carta</small></h3>
        <div class="slr-muestrario__grande">${carta({ coleccion: colA, coleccion_id: colA.id, color: null, tier: 'B', rareza: 'rara', nombre: 'Mateo' }, { tam: 'l' })}</div>
        <div class="slr-muestrario__par">
          <figure>${carta({ coleccion: colA, coleccion_id: colA.id, color: null, tier: 'D', rareza: 'comun', nombre: 'Jorge' }, { tam: 's' })}<figcaption>Dormidito (morado)</figcaption></figure>
          <figure>${carta({ coleccion: colB, coleccion_id: colB.id, color: null, tier: 'S', rareza: 'legendaria', nombre: 'Mateo' }, { tam: 's' })}<figcaption>Down (naranja), legendaria</figcaption></figure>
        </div>
        <div class="slr-muestrario__fotos">
          ${[colA, colB, colA, colB].map((k, i) => `<figure class="slr-muestrario__xs">${carta({ coleccion: k, coleccion_id: k.id, color: null, tier: 'DBAS'[i], rareza: ['comun', 'rara', 'epica', 'legendaria'][i], nombre: k.nombre }, { tam: 'xs', destacar: 'ATA' })}</figure>`).join('')}
        </div>
        <p class="slr-suave">En miniatura, solo el emblema. El color propio de una carta (disenos_carta.color) manda sobre el de su colección.</p>
      </section>
      <section class="slr-muestrario__acabado" data-muestra="colores">
        <h3 class="slr-subtitulo">Colores <small>disenos_carta.color (anula el de la colección); sin color, el neutro</small></h3>
        <div class="slr-muestrario__colores">
          ${Object.entries(COLORES).map(([k, v]) => `<figure>${carta({ color: k, imagen_url: null, nombre: v }, { tam: 's' })}<figcaption>${esc(v)}</figcaption></figure>`).join('')}
        </div>
      </section>
      <section class="slr-muestrario__acabado" data-muestra="sin-fondo">
        <h3 class="slr-subtitulo">Foto PNG sin fondo <small>el fondo de la carta se ve detrás</small></h3>
        <div class="slr-muestrario__par">
          <figure>${carta({ imagen_url: PNG_SIN_FONDO, color: 'rojo', nombre: 'Sin fondo' }, { tam: 's' })}<figcaption>Color rojo</figcaption></figure>
          <figure>${carta({ imagen_url: PNG_SIN_FONDO, tipo: 'trio', acabado: 'brillante', color: null, nombre: 'Sin fondo' }, { tam: 's' })}<figcaption>Trío brillante</figcaption></figure>
        </div>
      </section>
      <section class="slr-muestrario__acabado" data-muestra="nombres">
        <h3 class="slr-subtitulo">Nombres largos <small>letra más pequeña y, si no cabe, dos líneas</small></h3>
        <div class="slr-muestrario__fotos">
          ${NOMBRES_LARGOS.map(n => `<figure class="slr-muestrario__xs">${carta({ nombre: n, tipo: 'trio', imagen_url: null }, { tam: 'xs', destacar: 'ATA' })}</figure>`).join('')}
        </div>
        <div class="slr-muestrario__par">
          ${NOMBRES_LARGOS.slice(0, 2).map(n => `<figure>${carta({ nombre: n, tipo: 'trio', imagen_url: null }, { tam: 's' })}</figure>`).join('')}
        </div>
        <div class="slr-muestrario__grande">${carta({ nombre: NOMBRES_LARGOS[2], tipo: 'duo', imagen_url: PNG_SIN_FONDO, color: 'azul' }, { tam: 'l' })}</div>
      </section>
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
    </div>`, { titulo: 'Muestrario de cartas', completa: true });
}
