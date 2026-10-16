/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — gestor de colecciones (modo pruebas, solo el admin)
   Lista de colecciones con su emblema, color y número de cartas. Crear o
   editar: nombre, color de la paleta, descripción y emblema (PNG o SVG
   monocromo con fondo transparente, cuadrado, unos 256×256; se sube a
   Cloudinary con el preset slr_cartas o se pega la URL), con vista previa en
   una carta grande y en miniatura. Al editar, sus cartas (tocar abre el
   detalle) y «Borrar colección» (sus cartas se quedan sin colección).
   Guarda con slr_admin_guardar_coleccion / slr_admin_borrar_coleccion.
   formularioColeccion() lo usa también el formulario de carta («Nueva»).
═══════════════════════════════════════════════ */
import { rpc, leer } from '../api.js';
import { esc, hoja, cerrarCapa, conEspera, toast, confirmar } from '../ui.js';
import { cartaHTML, normalizarCarta } from '../carta.js';
import { COLORES } from '../generador.js';
import { cargarColecciones, listaColecciones, urlEmblema } from '../colecciones.js';
import { subirFoto } from './editor-carta.js';
import { abrirDetalle } from './detalle.js';

const opciones = (lista, actual) => Object.entries(lista).map(([v, t]) =>
  `<option value="${esc(v)}" ${v === actual ? 'selected' : ''}>${esc(t)}</option>`).join('');
const emblemaHTML = (k, px = 64) => k.emblema_url
  ? `<i class="slr-emblema-suelto${k.color ? ` slr-col-${esc(k.color)}` : ''}" style="--emblema:url(&quot;${esc(urlEmblema(k.emblema_url, px))}&quot;)"></i>`
  : `<i class="slr-emblema-suelto slr-emblema-suelto--vacio${k.color ? ` slr-col-${esc(k.color)}` : ''}">${esc((k.nombre || '?')[0])}</i>`;

export async function abrirColecciones(ctx) {
  const liga = ctx.datos.liga.id;
  const el = hoja('<div class="slr-colecciones-admin" data-cuerpo></div>', { titulo: 'Colecciones (modo pruebas)', completa: true });
  const cuerpo = el.querySelector('[data-cuerpo]');

  async function pintar() {
    const [ks, ds] = await Promise.all([
      cargarColecciones(liga),
      leer(`disenos_carta?select=coleccion_id&coleccion_id=not.is.null&or=(liga_prueba_id.is.null,liga_prueba_id.eq.${liga})&limit=5000`),
    ]);
    const cuenta = id => ds.filter(d => d.coleccion_id === id).length;
    cuerpo.innerHTML = `
      <button class="slr-btn slr-btn--pruebas" type="button" data-nueva>＋ Nueva colección</button>
      <p class="slr-suave">El fondo de sus cartas toma el color de la colección (salvo las que tengan color propio) y el emblema
        sale en la esquina, tintado con ese color.</p>
      ${ks.length ? `<ul class="slr-colecciones">${ks.map(k => `
        <li><button type="button" data-id="${esc(k.id)}">
          ${emblemaHTML(k)}
          <span class="slr-colecciones__texto"><b>${esc(k.nombre)}</b>
            <small>${k.color ? esc(COLORES[k.color]) : 'Sin color'}${k.liga_prueba_id ? ' · de esta liga de prueba' : ''}${k.descripcion ? ` · ${esc(k.descripcion)}` : ''}</small></span>
          <span class="slr-colecciones__n"><b>${cuenta(k.id)}</b><small>cartas</small></span>
        </button></li>`).join('')}</ul>`
        : '<div class="slr-vacio"><b>Todavía no hay colecciones</b><p>Crea la primera con «Nueva colección».</p></div>'}`;
    cuerpo.querySelector('[data-nueva]').addEventListener('click', () => formularioColeccion(ctx, null, { alGuardar: pintar }));
    cuerpo.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () =>
      formularioColeccion(ctx, ks.find(k => k.id === b.dataset.id), { alGuardar: pintar })));
  }
  await pintar();
}

// k: colección a editar (o null para una nueva). alGuardar(coleccion) tras guardar o borrar.
export async function formularioColeccion(ctx, k, { alGuardar } = {}) {
  const liga = ctx.datos.liga.id;
  const f = { id: k?.id ?? null, nombre: k?.nombre ?? '', color: k?.color ?? '', descripcion: k?.descripcion ?? '', emblema_url: k?.emblema_url ?? '' };
  // Sus cartas (con el ejemplar de esta liga, para abrir el detalle)
  const suyas = f.id ? await leer(`disenos_carta?select=id,nombre,tipo,acabado,color,tier,rareza,coleccion_id,perfil,personas,ata,def,con,valor,poderes,imagen_url` +
    `&coleccion_id=eq.${f.id}&order=nombre&limit=500`) : [];
  const ejemplares = suyas.length ? await leer(`cartas?select=id,diseno_id&liga_id=eq.${liga}&diseno_id=in.(${suyas.map(d => d.id).join(',')})`) : [];
  const ejemplarDe = new Map(ejemplares.map(c => [c.diseno_id, c.id]));
  const muestra = suyas[0] ?? { id: 'muestra', nombre: 'Carta de muestra', tipo: 'individual', tier: 'B', ata: 70, def: 60, con: 64, valor: 300, poderes: [], personas: [] };

  const el = hoja(`
    <form class="slr-editor slr-editor--coleccion" data-form novalidate>
      <div class="slr-editor__lado">
        <div class="slr-editor__vista" data-vista></div>
        <div class="slr-coleccion-mini" data-mini></div>
      </div>
      <fieldset class="slr-editor__bloque">
        <legend>Colección</legend>
        <label class="slr-campo"><span>Nombre</span>
          <input class="slr-input" name="nombre" maxlength="40" value="${esc(f.nombre)}" placeholder="Dormidito" autocomplete="off" required></label>
        <label class="slr-campo"><span>Color</span><select class="slr-input" name="color">${opciones({ '': 'Sin color (fondo neutro)', ...COLORES }, f.color)}</select></label>
        <label class="slr-campo"><span>Descripción (opcional)</span>
          <input class="slr-input" name="descripcion" maxlength="140" value="${esc(f.descripcion)}" autocomplete="off"></label>
      </fieldset>
      <fieldset class="slr-editor__bloque">
        <legend>Emblema</legend>
        <p class="slr-suave">PNG o SVG de un solo color con fondo transparente, cuadrado (unos 256×256). La app lo pinta con el color de la colección.</p>
        <label class="slr-editor__subir">
          <input type="file" accept="image/png,image/svg+xml,image/webp" data-archivo hidden>
          <span class="slr-btn slr-btn--fantasma" role="button">⬆ Subir emblema</span>
        </label>
        <p class="slr-editor__estado" data-estado></p>
        <label class="slr-campo"><span>o pega la URL</span>
          <input class="slr-input" name="emblema_url" type="url" value="${esc(f.emblema_url)}" placeholder="https://res.cloudinary.com/…" autocomplete="off"></label>
      </fieldset>
      ${f.id ? `<fieldset class="slr-editor__bloque">
        <legend>Sus cartas (${suyas.length})</legend>
        ${suyas.length ? `<div class="slr-rejilla slr-rejilla--compacta" data-suyas>${suyas.map(d => `
          <button class="slr-ficha" type="button" data-diseno="${esc(d.id)}">${cartaHTML({ ...normalizarCarta(d), id: ejemplarDe.get(d.id) ?? `diseno-${d.id}` }, { tam: 's' })}</button>`).join('')}</div>`
          : '<p class="slr-suave">Ninguna todavía: elige esta colección en el formulario de una carta.</p>'}
      </fieldset>` : ''}
      <p class="slr-editor__error" data-error hidden></p>
      <div class="slr-botones">
        <button class="slr-btn slr-btn--grande" type="submit" data-guardar>${f.id ? 'Guardar cambios' : 'Crear colección'}</button>
        ${f.id ? '<button class="slr-btn slr-btn--grande slr-btn--peligro" type="button" data-borrar>Borrar colección</button>' : ''}
      </div>
    </form>`, { titulo: f.id ? `Colección ${f.nombre}` : 'Nueva colección', completa: true });
  const form = el.querySelector('[data-form]');

  // Vista previa con la colección sin guardar (se pasa a la carta, sin tocar la caché)
  function pintarVista() {
    const previa = { id: 'previa-coleccion', nombre: f.nombre || 'Colección', color: f.color || null, emblema_url: f.emblema_url || null };
    const carta = { ...normalizarCarta(muestra), id: 'previa', coleccion: previa, color: null };
    el.querySelector('[data-vista]').innerHTML = cartaHTML(carta, { tam: 'l' });
    el.querySelector('[data-mini]').innerHTML = `<div class="slr-coleccion-mini__carta">${cartaHTML({ ...carta, id: 'previa-xs' }, { tam: 'xs', destacar: 'ATA' })}</div>
      <span>${emblemaHTML(previa, 96)}<small>Miniatura: solo el emblema</small></span>`;
  }
  form.addEventListener('input', e => { if (e.target.name in f) { f[e.target.name] = e.target.value; pintarVista(); } });
  form.addEventListener('change', e => { if (e.target.name === 'color') { f.color = e.target.value; pintarVista(); } });
  el.querySelector('[data-archivo]').addEventListener('change', async e => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const estado = el.querySelector('[data-estado]');
    estado.textContent = 'Subiendo…';
    try {
      f.emblema_url = await subirFoto(archivo);
      form.emblema_url.value = f.emblema_url;
      estado.textContent = 'Emblema subido.';
      pintarVista();
    } catch (err) { estado.textContent = err.message; }
  });
  el.querySelector('[data-suyas]')?.addEventListener('click', e => {
    const b = e.target.closest('[data-diseno]');
    const id = b && ejemplarDe.get(b.dataset.diseno);
    if (id) abrirDetalle(id, ctx).catch(() => {});
    else if (b) toast('Esta carta no tiene ejemplar en esta liga', 'info');
  });

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const caja = el.querySelector('[data-error]');
    const error = f.nombre.trim().length < 2 ? 'Ponle un nombre (2 letras como mínimo).' : '';
    caja.hidden = !error; caja.textContent = error;
    if (error) return;
    conEspera(el.querySelector('[data-guardar]'), async () => {
      const r = await rpc('slr_admin_guardar_coleccion', { liga_id: liga, coleccion: { ...f, nombre: f.nombre.trim(), color: f.color || null } });
      await cargarColecciones(liga);
      toast(`Colección ${r.nombre} ${f.id ? 'guardada' : 'creada'}`, 'ok');
      cerrarCapa();
      await alGuardar?.(r);
    }).catch(() => {});
  });
  el.querySelector('[data-borrar]')?.addEventListener('click', async e => {
    const boton = e.currentTarget;
    const ok = await confirmar({ titulo: 'Borrar colección', peligro: true, ok: 'Borrar',
      texto: `Se borra <b>${esc(f.nombre)}</b>. Sus ${suyas.length} cartas se quedan sin colección (no se borra ninguna carta).` });
    if (!ok) return;
    await conEspera(boton, async () => {
      await rpc('slr_admin_borrar_coleccion', { liga_id: liga, coleccion_id: f.id });
      await cargarColecciones(liga);
      toast(`Colección ${f.nombre} borrada`, 'ok');
      cerrarCapa();
      await alGuardar?.(null);
    }).catch(() => {});
  });
  pintarVista();
}

export { listaColecciones };
