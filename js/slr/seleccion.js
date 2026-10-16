/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — selección múltiple (catálogo y herramienta de plantillas)
   · Botón «Seleccionar»: entra en modo selección; cada elemento muestra su
     casilla y tocarlo lo marca o desmarca (no abre el detalle).
   · PC: Ctrl/Cmd+clic añade o quita uno; Mayús+clic marca el rango desde el
     último tocado (en el orden de la lista filtrada), como en el explorador.
   · Móvil: una pulsación larga entra en modo selección y marca esa carta. En
     estas listas las cartas no se levantan (carta.js: .slr-seleccionable).
   · «Seleccionar todas las visibles» (las que pasan los filtros, aunque estén
     en otra página o bloque), «Quitar selección» y el contador.
   La lista se puede repintar (filtros, páginas, bloques): las marcas se
   vuelven a poner solas.
   seleccionMultiple({ contenedor, barra, visibles, alAccion }):
     contenedor: donde están los elementos [data-sel-id]
     barra: elemento donde se pinta la barra de selección
     visibles(): ids de la lista filtrada, en orden
     alAccion(ids): «Editar…» con las seleccionadas
═══════════════════════════════════════════════ */
import { esc } from './ui.js';

const PULSACION_MS = 450, UMBRAL = 10;

export function seleccionMultiple({ contenedor, barra, visibles, alAccion }) {
  const sel = new Set();
  let modo = false, ancla = null, anularClic = 0, pulsacion = null;

  contenedor.classList.add('slr-seleccionable');

  function pintarMarcas() {
    contenedor.classList.toggle('en-seleccion', modo);
    for (const el of contenedor.querySelectorAll('[data-sel-id]')) {
      const si = sel.has(el.dataset.selId);
      el.classList.toggle('es-seleccionada', si);
      el.setAttribute('aria-pressed', modo ? String(si) : 'false');
    }
  }
  function pintarBarra() {
    const n = sel.size;
    barra.innerHTML = modo ? `
      <div class="slr-seleccion">
        <span class="slr-seleccion__n"><b>${n}</b> ${n === 1 ? 'seleccionada' : 'seleccionadas'}</span>
        <button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-sel="todas">Seleccionar todas las visibles</button>
        <button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-sel="ninguna" ${n ? '' : 'disabled'}>Quitar selección</button>
        <button class="slr-btn slr-btn--mini slr-btn--pruebas" type="button" data-sel="editar" ${n ? '' : 'disabled'}>✎ Editar ${n || ''}</button>
        <button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-sel="salir">Terminar</button>
      </div>` : `
      <div class="slr-seleccion slr-seleccion--fuera">
        <button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-sel="entrar">☑ Seleccionar</button>
        <small class="slr-suave">Ctrl/Cmd+clic o Mayús+clic en PC; mantén pulsada una carta en el móvil</small>
      </div>`;
  }
  function cambiar() { pintarMarcas(); pintarBarra(); }
  function entrar() { if (!modo) { modo = true; cambiar(); } }
  function salir() { modo = false; sel.clear(); ancla = null; cambiar(); }
  function alternar(id) { sel.has(id) ? sel.delete(id) : sel.add(id); ancla = id; }
  function rango(id) {
    const lista = visibles();
    const a = lista.indexOf(ancla), b = lista.indexOf(id);
    if (a < 0 || b < 0) { alternar(id); return; }
    for (const x of lista.slice(Math.min(a, b), Math.max(a, b) + 1)) sel.add(x);
  }

  barra.addEventListener('click', e => {
    const accion = e.target.closest('[data-sel]')?.dataset.sel;
    if (accion === 'entrar') entrar();
    else if (accion === 'salir') salir();
    else if (accion === 'todas') { for (const id of visibles()) sel.add(id); cambiar(); }
    else if (accion === 'ninguna') { sel.clear(); ancla = null; cambiar(); }
    else if (accion === 'editar' && sel.size) alAccion([...sel]);
  });

  // Clic (en captura: antes que el que abre el detalle o los botones de la fila)
  contenedor.addEventListener('click', e => {
    const el = e.target.closest('[data-sel-id]');
    if (!el || !contenedor.contains(el)) return;
    if (Date.now() < anularClic) { e.preventDefault(); e.stopPropagation(); return; }
    const id = el.dataset.selId;
    const multi = e.ctrlKey || e.metaKey, rangoTecla = e.shiftKey;
    if (!modo && !multi && !rangoTecla) return;            // clic normal: lo de siempre
    if (modo && !multi && !rangoTecla && e.target.closest('button:not([data-sel-id]), select, input, a')) return;
    e.preventDefault(); e.stopPropagation();
    entrar();
    if (rangoTecla && ancla) rango(id); else alternar(id);
    cambiar();
  }, true);
  // Mayús+clic no selecciona texto
  contenedor.addEventListener('mousedown', e => { if (e.shiftKey && e.target.closest('[data-sel-id]')) e.preventDefault(); });

  // Pulsación larga (dedo): entra en modo selección y marca la carta
  contenedor.addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-sel-id]');
    if (!el || e.pointerType === 'mouse') return;
    pulsacion = { id: el.dataset.selId, x: e.clientX, y: e.clientY, t: setTimeout(() => {
      entrar(); alternar(pulsacion.id); cambiar();
      navigator.vibrate?.(15);
      anularClic = Date.now() + 500;
      pulsacion = null;
    }, PULSACION_MS) };
  });
  const cancelar = () => { if (pulsacion) { clearTimeout(pulsacion.t); pulsacion = null; } };
  contenedor.addEventListener('pointermove', e => {
    if (pulsacion && Math.hypot(e.clientX - pulsacion.x, e.clientY - pulsacion.y) > UMBRAL) cancelar();
  }, { passive: true });
  contenedor.addEventListener('pointerup', cancelar);
  contenedor.addEventListener('pointercancel', cancelar);
  contenedor.addEventListener('contextmenu', e => { if (e.target.closest('[data-sel-id]')) e.preventDefault(); });

  // Al repintar la lista (filtros, páginas, bloques) se vuelven a poner las marcas
  new MutationObserver(() => { if (modo || sel.size) pintarMarcas(); }).observe(contenedor, { childList: true, subtree: true });

  cambiar();
  return {
    get ids() { return [...sel]; },
    get activo() { return modo; },
    // Tras aplicar cambios: se queda en modo selección con las mismas
    refrescar: cambiar,
    salir,
  };
}

export const resumenSeleccion = n => `${esc(n)} ${n === 1 ? 'carta' : 'cartas'}`;
