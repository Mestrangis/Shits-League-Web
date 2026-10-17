/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — edición múltiple (modo pruebas, solo el admin)
   Para las cartas seleccionadas en el catálogo o en la herramienta de
   plantillas: colección (o quitarla), color (o «el de la colección»), tipo,
   tier, perfil, acabado, estamina, táctica favorita, activar o desactivar,
   regenerar stats y regenerar poderes. Cada campo empieza en «Sin cambios».
   Si cambia el tier o el perfil y no se regeneran las stats, pregunta si
   regenerarlas también. Antes de aplicar, el servidor calcula el resumen
   (slr_admin_editar_disenos con solo_contar: cuántas cambian, qué, y ejemplos
   con el valor y la rareza recalculados) y se pide confirmación. Se aplica
   todo en una sola transacción.
═══════════════════════════════════════════════ */
import { rpc } from '../api.js';
import { esc, hoja, cerrarCapa, conEspera, toast, confirmar, miles } from '../ui.js';
import { TIPOS, ACABADOS, RAREZAS } from '../carta.js';
import { TIERS, PERFILES, COLORES, ESTAMINAS, TACTICAS } from '../generador.js';
import { listaColecciones, cargarColecciones } from '../colecciones.js';

const SIN = '__sin_cambios__';
const CAMPOS = {
  coleccion: 'colección', color: 'color', tipo: 'tipo', tier: 'tier', rareza: 'rareza', perfil: 'perfil',
  acabado: 'acabado', activo: 'activas/inactivas', stats: 'stats', poderes: 'poderes', valor: 'valor',
  estamina: 'estamina', tactica_favorita: 'táctica favorita',
};
const opciones = (lista, extra = []) => [[SIN, '— Sin cambios —'], ...extra, ...Object.entries(lista)]
  .map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');

// ids: disenos_carta.id de las seleccionadas. alTerminar(): recargar la lista.
export function abrirEdicionMultiple(ctx, ids, { alTerminar } = {}) {
  const liga = ctx.datos.liga.id;
  const esPrueba = !!ctx.datos.liga.es_prueba;
  const el = hoja(`
    <form class="slr-edicion-multiple" data-form novalidate>
      <p class="slr-suave">Se cambia lo que elijas en las <b>${ids.length}</b> ${ids.length === 1 ? 'carta' : 'cartas'} seleccionadas; lo que se quede en «Sin cambios» no se toca.
        El valor y la rareza se recalculan solos.</p>
      <div class="slr-filtros slr-filtros--catalogo">
        <label><span>Colección</span><select class="slr-input" name="coleccion_id">${opciones(Object.fromEntries(listaColecciones().map(k => [k.id, k.nombre])), [['', 'Sin colección']])}</select></label>
        <label><span>Color</span><select class="slr-input" name="color">${opciones(COLORES, [['', 'El de la colección']])}</select></label>
        <label><span>Tipo</span><select class="slr-input" name="tipo">${opciones(TIPOS)}</select></label>
        <label><span>Tier</span><select class="slr-input" name="tier">${opciones(Object.fromEntries(Object.keys(TIERS).map(t => [t, t])))}</select></label>
        <label><span>Perfil</span><select class="slr-input" name="perfil">${opciones(PERFILES)}</select></label>
        <label><span>Acabado</span><select class="slr-input" name="acabado">${opciones({ normal: 'Normal', ...ACABADOS })}</select></label>
        <label><span>Estamina</span><select class="slr-input" name="estamina">${opciones(ESTAMINAS)}</select></label>
        <label><span>Táctica favorita</span><select class="slr-input" name="tactica_favorita">${opciones(TACTICAS, [['', 'Ninguna']])}</select></label>
        ${esPrueba ? '' : `<label><span>Estado</span><select class="slr-input" name="activo">${opciones({ true: 'Activar', false: 'Desactivar' })}</select></label>`}
      </div>
      <label class="slr-interruptor"><input type="checkbox" name="regenerar_stats">🎲 Regenerar stats (semilla nueva)</label>
      <label class="slr-interruptor"><input type="checkbox" name="regenerar_poderes">🎲 Regenerar poderes (semilla nueva)</label>
      <p class="slr-editor__error" data-error hidden></p>
      <div class="slr-botones"><button class="slr-btn slr-btn--grande" type="submit" data-revisar>Revisar cambios</button></div>
    </form>`, { titulo: `Editar ${ids.length} ${ids.length === 1 ? 'carta' : 'cartas'}`, completa: true });
  const form = el.querySelector('[data-form]');

  function cambiosElegidos() {
    const c = {};
    for (const s of form.querySelectorAll('select')) {
      if (s.value === SIN) continue;
      c[s.name] = s.name === 'activo' ? s.value === 'true' : (s.value || null);
    }
    if (form.regenerar_stats.checked) c.regenerar_stats = true;
    if (form.regenerar_poderes.checked) c.regenerar_poderes = true;
    return c;
  }

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const boton = el.querySelector('[data-revisar]');
    const caja = el.querySelector('[data-error]');
    const cambios = cambiosElegidos();
    caja.hidden = Object.keys(cambios).length > 0;
    caja.textContent = 'Elige al menos un cambio.';
    if (!caja.hidden) return;
    conEspera(boton, async () => {
      // Tier o perfil nuevos con las stats de antes: ¿regenerarlas también?
      if ((cambios.tier || cambios.perfil) && !cambios.regenerar_stats) {
        const si = await confirmar({ titulo: '¿Regenerar también las stats?',
          texto: `Cambias el ${[cambios.tier && 'tier', cambios.perfil && 'perfil'].filter(Boolean).join(' y el ')}. ` +
            'Si no regeneras las stats, cada carta conserva las suyas (y su OVR puede quedar fuera de su tier).',
          ok: 'Sí, regenerarlas' });
        if (si) { cambios.regenerar_stats = true; form.regenerar_stats.checked = true; }
      }
      const r = await rpc('slr_admin_editar_disenos', { liga_id: liga, ids, cambios, solo_contar: true });
      const lista = Object.entries(r.por_campo).map(([k, n]) => `<span><b>${miles(n)}</b> ${esc(CAMPOS[k] ?? k)}</span>`).join('');
      const ok = await confirmar({ titulo: 'Aplicar cambios',
        texto: r.cambian
          ? `Cambian <b>${r.cambian}</b> de ${r.cartas} cartas. Qué cambia: <span class="slr-resumen-cambios">${lista}</span>` +
            (r.ejemplos.length ? `<small class="slr-suave">${r.ejemplos.map(t => esc(t.replace(/(comun|rara|epica|legendaria)/g, x => RAREZAS[x].toLowerCase()))).join('<br>')}${r.cambian > r.ejemplos.length ? '<br>…' : ''}</small>` : '')
          : 'Ninguna carta cambia con estos valores (ya los tenían).',
        ok: r.cambian ? `Aplicar a ${r.cambian}` : 'Cerrar', peligro: false });
      if (!ok || !r.cambian) return;
      const hecho = await rpc('slr_admin_editar_disenos', { liga_id: liga, ids, cambios });
      toast(`${hecho.cambian} ${hecho.cambian === 1 ? 'carta editada' : 'cartas editadas'}`, 'ok');
      await cargarColecciones(liga);
      await ctx.recargar('cartas');
      cerrarCapa();
      await alTerminar?.();
    }).catch(() => {});
  });
}
