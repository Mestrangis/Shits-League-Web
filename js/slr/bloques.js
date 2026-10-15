/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — rejillas largas por bloques (álbum, catálogo)
   Hasta `todasDeGolpe` elementos se pintan todos; con más, por bloques al
   hacer scroll (a 1,5 pantallas del final), y las fotos del bloque siguiente
   se precargan antes de llegar. Si un bloque no llena la pantalla (PC), se
   pinta otro sin esperar al scroll.
═══════════════════════════════════════════════ */
import { precargar, urlFoto } from './imagenes.js';

// rejilla: contenedor; cuerpo: elemento que hace scroll (scrollDeHoja);
// ficha(item) → HTML de un elemento (con su .slr-carta)
export function rejillaPorBloques({ rejilla, cuerpo, ficha, todasDeGolpe = 60, bloque = 30 }) {
  let lista = [], pintadas = 0;

  function precargarSiguiente() {
    const ancho = rejilla.querySelector('.slr-carta')?.getBoundingClientRect().width || 170;
    precargar(lista.slice(pintadas, pintadas + bloque).filter(c => c.imagen_url).map(c => urlFoto(c.imagen_url, ancho)));
  }
  function pintarBloque() {
    const n = lista.length <= todasDeGolpe ? lista.length : bloque;
    rejilla.insertAdjacentHTML('beforeend', lista.slice(pintadas, pintadas + n).map(ficha).join(''));
    pintadas = Math.min(lista.length, pintadas + n);
    rejilla.dataset.pintadas = pintadas;
    if (pintadas < lista.length) {
      precargarSiguiente();
      requestAnimationFrame(() => { if (pintadas < lista.length && cuerpo.scrollHeight < cuerpo.clientHeight * 2.5) pintarBloque(); });
    }
  }
  cuerpo.addEventListener('scroll', () => {
    if (pintadas < lista.length && cuerpo.scrollTop + cuerpo.clientHeight > cuerpo.scrollHeight - 1.5 * cuerpo.clientHeight) pintarBloque();
  }, { passive: true });

  return {
    // Cambia la lista (filtros, orden): vuelve a empezar desde arriba
    poner(nueva, vacio = '') {
      lista = nueva;
      pintadas = 0;
      rejilla.innerHTML = lista.length ? '' : vacio;
      if (lista.length) pintarBloque();
    },
  };
}
