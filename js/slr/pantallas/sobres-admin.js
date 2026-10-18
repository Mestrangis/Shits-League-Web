/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — Modo pruebas → Sobres (solo el administrador)
   · Cada tipo: nombre, descripción, precios por tramo (J1–3 / J4–5 / J6+),
     pesos por rareza, activo e imagen (PNG vertical ~600×1000, subida a
     Cloudinary con el preset slr_cartas). Al guardar, la liga tiene su propia
     fila para ese tipo (los de por defecto no cambian).
   · Dorso de las cartas (5:7) de la liga.
   · Colección de la semana, a mano.
   · Vista previa de apertura: fuerza la rareza de la mejor carta para probar
     la animación sin gastar dinero ni cartas.
   · Progresión de prueba: encenderla y simular la jornada de referencia.
═══════════════════════════════════════════════ */
import { rpc, leer } from '../api.js';
import { esc, hoja, conEspera, toast } from '../ui.js';
import { RAREZAS, normalizarCarta } from '../carta.js';
import { listaColecciones, cargarColecciones } from '../colecciones.js';
import { sobreHTML, dorsoHTML } from '../sobre-arte.js';
import { subirFoto } from './editor-carta.js';
import { vistaPreviaApertura } from './apertura.js';

const TIPOS = ['sencillo', 'basico', 'eleccion', 'posicion', 'coleccion'];
const R = ['comun', 'rara', 'epica', 'legendaria'];

export async function abrirSobresAdmin(ctx) {
  const liga = ctx.datos.liga.id;
  await cargarColecciones(liga);
  const [filas, tienda] = await Promise.all([
    leer(`tipos_sobre?select=*&or=(liga_id.is.null,liga_id.eq.${liga})&order=orden`),
    rpc('slr_tienda', { liga_id: liga }),
  ]);
  // La fila de la liga manda sobre la de por defecto
  const tipos = TIPOS.map(t => filas.find(f => f.tipo === t && f.liga_id === liga) ?? filas.find(f => f.tipo === t && !f.liga_id)).filter(Boolean);
  const col = tienda.coleccion_semana;
  let dorso = tienda.dorso_url ?? '';
  const prog = tienda.progresion;

  const el = hoja(`
    <div class="slr-sobres-admin" data-sobres-admin>
      <section class="slr-tarjeta">
        <div class="slr-tarjeta__cabeza"><span>Vista previa de apertura</span></div>
        <p class="slr-suave">Prueba la animación con cualquier sobre y la rareza que quieras, sin gastar dinero ni cartas.</p>
        <div class="slr-editor__fila">
          <label class="slr-campo"><span>Sobre</span><select class="slr-input" data-prev-tipo>${tipos.map(t => `<option value="${t.tipo}">${esc(t.nombre)}</option>`).join('')}</select></label>
          <label class="slr-campo"><span>Mejor carta</span><select class="slr-input" data-prev-rareza>${R.map(r => `<option value="${r}" ${r === 'epica' ? 'selected' : ''}>${RAREZAS[r]}</option>`).join('')}</select></label>
        </div>
        <button class="slr-btn slr-btn--pruebas" type="button" data-vista-previa>▶ Ver apertura</button>
      </section>

      <section class="slr-tarjeta">
        <div class="slr-tarjeta__cabeza"><span>Progresión (pruebas)</span><span>${prog.activa ? `jornada ${prog.jornada}` : 'apagada'}</span></div>
        <div class="slr-editor__fila">
          <label class="slr-campo"><span>Estado</span><select class="slr-input" data-prog-activa>
            ${[['auto', 'Automática (temporada real)'], ['true', 'Encendida'], ['false', 'Apagada']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
          <label class="slr-campo"><span>Jornada de prueba</span><input class="slr-input" type="number" min="1" max="60" placeholder="la real" data-prog-jornada value="${prog.activa ? prog.jornada : ''}"></label>
        </div>
        <button class="slr-btn slr-btn--pruebas" type="button" data-prog-guardar>Aplicar</button>
      </section>

      <section class="slr-tarjeta">
        <div class="slr-tarjeta__cabeza"><span>Colección de la semana</span><span>${col ? esc(col.nombre) : 'ninguna'}</span></div>
        <div class="slr-fila-accion">
          <select class="slr-input" data-col-semana>${listaColecciones().map(k => `<option value="${k.id}" ${k.id === col?.id ? 'selected' : ''}>${esc(k.nombre)}</option>`).join('')}</select>
          <button class="slr-btn" type="button" data-col-guardar>Cambiar</button>
        </div>
      </section>

      <section class="slr-tarjeta">
        <div class="slr-tarjeta__cabeza"><span>Dorso de las cartas</span><span>5:7</span></div>
        <div class="slr-sobres-admin__dorsos" data-dorsos>${R.map(r => dorsoHTML(r, dorso || null)).join('')}</div>
        <label class="slr-editor__subir"><input type="file" accept="image/png,image/jpeg,image/webp" data-subir-dorso hidden>
          <span class="slr-btn slr-btn--fantasma" role="button">📷 Subir dorso</span></label>
        <div class="slr-fila-accion"><input class="slr-input" type="url" placeholder="https://res.cloudinary.com/… (vacío: el provisional)" value="${esc(dorso)}" data-dorso-url>
          <button class="slr-btn" type="button" data-dorso-guardar>Guardar</button></div>
      </section>

      ${tipos.map(t => `
      <section class="slr-tarjeta slr-sobres-admin__tipo" data-tipo-admin="${t.tipo}">
        <div class="slr-tarjeta__cabeza"><span>${esc(t.nombre)}</span><span>${t.liga_id ? 'propio de esta liga' : 'por defecto'} · ${t.cartas} ${t.cartas === 1 ? 'carta' : 'cartas'}</span></div>
        <div class="slr-sobres-admin__fila">
          <div class="slr-sobres-admin__arte" data-arte>${sobreHTML(t.tipo, { nombre: t.nombre, imagen_url: t.imagen_url, coleccion: col, cartas: t.cartas, tam: 's' })}</div>
          <div class="slr-sobres-admin__campos">
            <label class="slr-campo"><span>Nombre</span><input class="slr-input" data-c="nombre" maxlength="30" value="${esc(t.nombre)}"></label>
            <label class="slr-campo"><span>Descripción</span><input class="slr-input" data-c="descripcion" maxlength="200" value="${esc(t.descripcion)}"></label>
            <div class="slr-sobres-admin__nums"><span>Precio</span>${['J1–3', 'J4–5', 'J6+'].map((n, i) => `<label><small>${n}</small><input class="slr-input" type="number" min="1" data-precio="${i}" value="${t.precios[i]}"></label>`).join('')}</div>
            <div class="slr-sobres-admin__nums"><span>Pesos</span>${R.map(r => `<label><small>${RAREZAS[r]}</small><input class="slr-input" type="number" min="0" step="any" data-peso="${r}" value="${t.pesos[r] ?? 0}"></label>`).join('')}</div>
            <label class="slr-interruptor"><input type="checkbox" data-c="activo" ${t.activo ? 'checked' : ''}><span>Activo (se vende en la tienda)</span></label>
            <label class="slr-campo"><span>Imagen (PNG vertical ~600×1000)</span><input class="slr-input" type="url" data-c="imagen_url" value="${esc(t.imagen_url ?? '')}" placeholder="vacío: diseño provisional"></label>
            <div class="slr-botones">
              <label class="slr-editor__subir"><input type="file" accept="image/png,image/webp,image/jpeg" data-subir-sobre hidden><span class="slr-btn slr-btn--fantasma" role="button">📷 Subir imagen</span></label>
              <button class="slr-btn" type="button" data-guardar-tipo>Guardar</button>
            </div>
          </div>
        </div>
      </section>`).join('')}
    </div>`, { titulo: 'Sobres', completa: true });

  // Vista previa
  el.querySelector('[data-vista-previa]').addEventListener('click', e => conEspera(e.currentTarget, async () => {
    const tipo = tipos.find(t => t.tipo === el.querySelector('[data-prev-tipo]').value);
    const rareza = el.querySelector('[data-prev-rareza]').value;
    const n = tipo.cartas;
    const filas = await leer(`cartas?select=id,diseno_id,disenos_carta(nombre,tipo,acabado,color,tier,rareza,coleccion_id,perfil,personas,ata,def,con,valor,poderes,imagen_url,texto,estamina,tactica_favorita)&liga_id=eq.${liga}&limit=400`);
    const todas = filas.map(f => ({ ...normalizarCarta(f), id: f.id }));
    const de = r => todas.filter(c => c.rareza === r);
    const azar = l => l[Math.floor(Math.random() * l.length)];
    const mejor = azar(de(rareza)) ?? azar(todas);
    const resto = Array.from({ length: n - 1 }, () => azar(de('comun').length ? de('comun') : todas));
    await vistaPreviaApertura(ctx, { tipo, rareza, cartas: [mejor, ...resto].map(c => ({ ...c })), dorso: dorso || null, coleccion: col });
  }).catch(err => toast(err.message, 'error')));

  // Progresión
  el.querySelector('[data-prog-guardar]').addEventListener('click', e => conEspera(e.currentTarget, async () => {
    const activa = el.querySelector('[data-prog-activa]').value, j = Number(el.querySelector('[data-prog-jornada]').value) || null;
    const r = await rpc('slr_admin_progresion', { liga_id: liga, activa, jornada: j });
    toast(r.activa ? `Progresión encendida: jornada ${r.jornada} (${r.desbloqueadas.map(x => RAREZAS[x].toLowerCase()).join(', ')})` : 'Progresión apagada: sale todo', 'ok');
  }).catch(() => {}));

  // Colección de la semana
  el.querySelector('[data-col-guardar]').addEventListener('click', e => conEspera(e.currentTarget, async () => {
    await rpc('slr_admin_coleccion_semana', { liga_id: liga, coleccion_id: el.querySelector('[data-col-semana]').value });
    toast('Colección de la semana cambiada', 'ok');
  }).catch(() => {}));

  // Dorso
  const pintarDorsos = () => { el.querySelector('[data-dorsos]').innerHTML = R.map(r => dorsoHTML(r, el.querySelector('[data-dorso-url]').value.trim() || null)).join(''); };
  el.querySelector('[data-dorso-url]').addEventListener('change', pintarDorsos);
  el.querySelector('[data-subir-dorso]').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { el.querySelector('[data-dorso-url]').value = await subirFoto(f); pintarDorsos(); toast('Dorso subido: falta guardarlo', 'info'); } catch (err) { toast(err.message, 'error'); }
  });
  el.querySelector('[data-dorso-guardar]').addEventListener('click', e => conEspera(e.currentTarget, async () => {
    const r = await rpc('slr_admin_dorso', { liga_id: liga, url: el.querySelector('[data-dorso-url]').value.trim() });
    dorso = r.dorso_url ?? '';
    toast('Dorso guardado', 'ok');
  }).catch(() => {}));

  // Tipos
  el.querySelectorAll('[data-tipo-admin]').forEach(sec => {
    const tipo = sec.dataset.tipoAdmin;
    const val = c => sec.querySelector(`[data-c="${c}"]`);
    const arte = () => { sec.querySelector('[data-arte]').innerHTML = sobreHTML(tipo, { nombre: val('nombre').value, imagen_url: val('imagen_url').value.trim() || null, coleccion: col, cartas: tipos.find(t => t.tipo === tipo).cartas, tam: 's' }); };
    val('nombre').addEventListener('input', arte);
    val('imagen_url').addEventListener('change', arte);
    sec.querySelector('[data-subir-sobre]').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      try { val('imagen_url').value = await subirFoto(f); arte(); toast('Imagen subida: falta guardar', 'info'); } catch (err) { toast(err.message, 'error'); }
    });
    sec.querySelector('[data-guardar-tipo]').addEventListener('click', e => conEspera(e.currentTarget, async () => {
      const datos = {
        nombre: val('nombre').value.trim(), descripcion: val('descripcion').value.trim(), activo: val('activo').checked,
        imagen_url: val('imagen_url').value.trim(),
        precios: [0, 1, 2].map(i => Math.round(Number(sec.querySelector(`[data-precio="${i}"]`).value))),
        pesos: Object.fromEntries(R.map(r => [r, Number(sec.querySelector(`[data-peso="${r}"]`).value) || 0])),
      };
      await rpc('slr_admin_guardar_sobre', { liga_id: liga, tipo, datos });
      sec.querySelector('.slr-tarjeta__cabeza span:last-child').textContent = `propio de esta liga · ${tipos.find(t => t.tipo === tipo).cartas} cartas`;
      toast(`Sobre ${datos.nombre} guardado`, 'ok');
    }).catch(() => {}));
  });
}
