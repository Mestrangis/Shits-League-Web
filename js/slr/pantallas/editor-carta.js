/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — formulario "Nueva carta" / "Editar carta"
   (modo pruebas, solo el administrador)
   · Foto: subida directa a Cloudinary (preset unsigned, ver CLOUDINARY); PNG
     con transparencia o JPG. También se puede pegar una URL.
   · Nombre, tipo, perfil, tier (que da la rareza: el marco), colección (con
     «＋ Nueva» para crearla al vuelo), acabado y color (opcional: anula el de
     la colección).
   · Stats y poderes los propone el generador (js/slr/generador.js, gemelo del
     de la base de datos) a partir de tier + perfil + tipo y una semilla;
     "Regenerar" cambia la semilla. Se pueden editar a mano.
   · Vista previa en vivo en tamaño grande, con acabado e inclinación.
   · Guarda con slr_admin_guardar_diseno (valor y ejemplar los ponen los
     triggers). Desde una liga de prueba la carta nace inactiva y solo existe
     en esa liga. "Crear y dar a…" la da a un equipo con slr_admin_mover_carta.
═══════════════════════════════════════════════ */
import { rpc, leer, accion } from '../api.js';
import { esc, hoja, cerrarCapa, conEspera, toast, monedas } from '../ui.js';
import { cartaHTML, TIPOS, ACABADOS, RAREZAS, rarezaDeTier } from '../carta.js';
import { listaColecciones } from '../colecciones.js';
import { formularioColeccion } from './colecciones-admin.js';
import { calcularValor } from '../valor.js';
import {
  TIERS, PERFILES, COLORES, EFECTOS, PROBABILIDADES, NOMBRES_PODER,
  generarStats, generarPoderes, generarRasgos, ESTAMINAS, TACTICAS, semillaNueva, ovr100,
} from '../generador.js';

export const CLOUDINARY = Object.freeze({ nube: 'dnd3g3zgm', preset: 'slr_cartas' });

const MOMENTOS = {
  posesion: 'Posesión', ocasion_ataque: 'Ataque', ocasion_defensa: 'Defensa',
  chut: 'Chut', parada: 'Parada', tirador: 'Tirador (siempre)',
};
const NIVELES = ['simple', 'fuerte', 'muy fuerte'];
const opciones = (lista, actual) => Object.entries(lista).map(([v, t]) =>
  `<option value="${esc(v)}" ${v === actual ? 'selected' : ''}>${esc(t)}</option>`).join('');

// Sube un archivo a Cloudinary (preset unsigned). Devuelve la URL segura.
export async function subirFoto(archivo) {
  const datos = new FormData();
  datos.append('file', archivo);
  datos.append('upload_preset', CLOUDINARY.preset);
  let r, cuerpo = null;
  try {
    r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY.nube}/image/upload`, { method: 'POST', body: datos });
    cuerpo = await r.json().catch(() => null);
  } catch (e) {
    throw new Error(`No se pudo conectar con Cloudinary (${e.message}). Revisa la conexión y vuelve a probar.`);
  }
  if (!r.ok || !cuerpo?.secure_url) {
    const motivo = cuerpo?.error?.message ?? `HTTP ${r.status}`;
    throw new Error(`Cloudinary ha rechazado la foto: «${motivo}». Revisa en Cloudinary (cuenta ${CLOUDINARY.nube}) ` +
      `→ Settings → Upload → Upload presets que exista «${CLOUDINARY.preset}» y que esté en modo Unsigned ` +
      '(y que admita PNG y JPG). Mientras tanto puedes pegar la URL de la foto.');
  }
  return cuerpo.secure_url;
}

// diseno: fila de disenos_carta para editar; sin él, carta nueva
export async function abrirEditorCarta(ctx, { disenoId = null } = {}) {
  const liga = ctx.datos.liga.id;
  let d;
  if (disenoId) {
    [d] = await leer(`disenos_carta?select=*&id=eq.${disenoId}`);
    if (!d) { toast('No se encuentra esa carta', 'error'); return; }
  }
  // Estado del formulario (stats en mayúsculas, como el motor)
  const f = d ? {
    id: d.id, nombre: d.nombre, tipo: d.tipo, perfil: d.perfil, tier: d.tier, acabado: d.acabado ?? 'normal',
    color: d.color ?? '', coleccion_id: d.coleccion_id ?? '', imagen_url: d.imagen_url ?? '', texto: d.texto ?? '', personas: d.personas ?? [],
    stats: { ATA: d.ata, DEF: d.def, CON: d.con }, poderes: structuredClone(d.poderes ?? []),
    semilla_stats: d.semilla_stats, semilla_poderes: d.semilla_poderes,
    estamina: d.estamina ?? 'media', tactica_favorita: d.tactica_favorita ?? '', rasgosAMano: true,
  } : {
    id: null, nombre: '', tipo: 'individual', perfil: 'atacante', tier: 'C', acabado: 'normal', color: '', coleccion_id: '',
    imagen_url: '', texto: '', personas: [], semilla_stats: semillaNueva(), semilla_poderes: semillaNueva(),
  };
  // Estamina y táctica favorita (motor v2): las propone el generador hasta que se tocan a mano
  const proponerRasgos = () => {
    if (f.rasgosAMano) return;
    const g = generarRasgos(f.perfil, f.semilla_stats);
    f.estamina = g.estamina;
    f.tactica_favorita = g.tactica_favorita ?? '';
  };
  if (!d) {
    f.stats = generarStats(f.tier, f.perfil, f.tipo, f.semilla_stats);
    f.poderes = generarPoderes(f.tier, f.perfil, f.semilla_poderes);
    proponerRasgos();
  }
  let fotoLocal = null;      // URL temporal (blob:) mientras sube la foto

  const el = hoja(`
    <form class="slr-editor" data-editor novalidate>
      <div class="slr-editor__lado">
        <div class="slr-editor__vista" data-vista></div>
        <p class="slr-editor__resumen" data-resumen></p>
      </div>

      <fieldset class="slr-editor__bloque">
        <legend>Foto</legend>
        <label class="slr-editor__subir">
          <input type="file" accept="image/png,image/jpeg,image/webp" data-archivo hidden>
          <span class="slr-btn slr-btn--fantasma" role="button">📷 Subir foto (PNG sin fondo o JPG)</span>
        </label>
        <p class="slr-editor__estado" data-estado-foto></p>
        <label class="slr-campo"><span>o pega la URL</span>
          <input class="slr-input" name="imagen_url" type="url" placeholder="https://res.cloudinary.com/…" value="${esc(f.imagen_url)}" autocomplete="off"></label>
        ${f.imagen_url ? '<button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-sin-foto>Quitar foto</button>' : ''}
      </fieldset>

      <fieldset class="slr-editor__bloque">
        <legend>Carta</legend>
        <label class="slr-campo"><span>Nombre</span>
          <input class="slr-input" name="nombre" maxlength="40" value="${esc(f.nombre)}" placeholder="Los Tres Caballeros" autocomplete="off" required></label>
        <div class="slr-editor__fila">
          <label class="slr-campo"><span>Tipo</span><select class="slr-input" name="tipo">${opciones(TIPOS, f.tipo)}</select></label>
          <label class="slr-campo"><span>Perfil</span><select class="slr-input" name="perfil">${opciones(PERFILES, f.perfil)}</select></label>
          <label class="slr-campo"><span>Tier</span><select class="slr-input" name="tier">${opciones(Object.fromEntries(Object.entries(TIERS).map(([k, [lo, hi]]) => [k, `${k} · ${lo}–${hi}`])), f.tier)}</select></label>
        </div>
        <p class="slr-suave" data-rareza></p>
        <div class="slr-editor__fila slr-editor__fila--coleccion">
          <label class="slr-campo"><span>Colección</span><select class="slr-input" name="coleccion_id" data-colecciones></select></label>
          <button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-nueva-coleccion>＋ Nueva</button>
        </div>
        <div class="slr-editor__fila">
          <label class="slr-campo"><span>Acabado</span><select class="slr-input" name="acabado">${opciones({ normal: 'Normal', ...ACABADOS }, f.acabado)}</select></label>
          <label class="slr-campo"><span>Color</span><select class="slr-input" name="color">${opciones({ '': 'El de la colección', ...COLORES }, f.color)}</select></label>
        </div>
        <div class="slr-editor__fila">
          <label class="slr-campo"><span>Estamina</span><select class="slr-input" name="estamina" data-rasgo>${opciones(ESTAMINAS, f.estamina)}</select></label>
          <label class="slr-campo"><span>Táctica favorita</span><select class="slr-input" name="tactica_favorita" data-rasgo>${opciones({ '': 'Ninguna', ...TACTICAS }, f.tactica_favorita)}</select></label>
        </div>
        <label class="slr-campo"><span>Frase (opcional)</span>
          <input class="slr-input" name="texto" maxlength="140" value="${esc(f.texto)}" autocomplete="off"></label>
      </fieldset>

      <fieldset class="slr-editor__bloque">
        <legend>Stats</legend>
        <div class="slr-editor__fila">
          ${['ATA', 'DEF', 'CON'].map(k => `<label class="slr-campo"><span>${k}</span>
            <input class="slr-input" type="number" min="1" max="101" inputmode="numeric" data-stat="${k}" value="${f.stats[k]}"></label>`).join('')}
        </div>
        <button class="slr-btn slr-btn--fantasma" type="button" data-regenerar="stats">🎲 Regenerar stats</button>
      </fieldset>

      <fieldset class="slr-editor__bloque">
        <legend>Poderes</legend>
        <ul class="slr-editor__poderes" data-poderes></ul>
        <div class="slr-botones">
          <button class="slr-btn slr-btn--fantasma" type="button" data-anadir-poder>+ Añadir poder</button>
          <button class="slr-btn slr-btn--fantasma" type="button" data-regenerar="poderes">🎲 Regenerar poderes</button>
        </div>
        <p class="slr-suave">Probabilidad de activarse al menos 1, 2 y 3 veces en un partido (las activaciones se reparten por las jugadas).</p>
      </fieldset>

      <p class="slr-editor__error" data-error hidden></p>
      <div class="slr-botones">
        <button class="slr-btn slr-btn--grande" type="submit" data-guardar>${f.id ? 'Guardar cambios' : 'Crear carta'}</button>
        ${f.id ? '' : '<button class="slr-btn slr-btn--grande slr-btn--fantasma" type="button" data-crear-dar>Crear y dar a…</button>'}
      </div>
    </form>`, { titulo: f.id ? 'Editar carta' : 'Nueva carta', completa: true });
  const form = el.querySelector('[data-editor]');
  const listaPoderes = el.querySelector('[data-poderes]');

  /* ── Pintado ── */
  function cartaActual() {
    const c = { id: f.id ?? 'nueva', nombre: f.nombre || 'Nombre de la carta', tipo: f.tipo, acabado: f.acabado, tier: f.tier,
      color: f.color || null, coleccion_id: f.coleccion_id || null, personas: f.personas, imagen_url: fotoLocal ?? (f.imagen_url || null),
      ata: f.stats.ATA, def: f.stats.DEF, con: f.stats.CON, poderes: f.poderes, tactica_favorita: f.tactica_favorita || null };
    c.ovr = Math.round(ovr100(f.stats) / 100);
    return c;
  }
  function valorActual() {
    try { return calcularValor({ ...f.stats, poderes: f.poderes }); } catch { return null; }
  }
  // Colecciones del selector (se vuelve a pintar al crear una nueva)
  function pintarColecciones() {
    el.querySelector('[data-colecciones]').innerHTML = opciones(
      { '': 'Sin colección', ...Object.fromEntries(listaColecciones().map(k => [k.id, k.nombre])) }, f.coleccion_id);
  }
  function pintarVista() {
    const c = cartaActual();
    el.querySelector('[data-rareza]').textContent = `Rareza ${RAREZAS[rarezaDeTier(f.tier)]} (sale del tier: F, E y D común; C y B rara; A épica; S legendaria).`;
    el.querySelector('[data-vista]').innerHTML = cartaHTML(c, { tam: 'l' });
    const v = valorActual();
    const ovr = ovr100(f.stats) / 100;
    const [lo, hi] = TIERS[f.tier];
    const fuera = ovr < lo || ovr >= hi;
    el.querySelector('[data-resumen]').innerHTML =
      `OVR <b>${String(Math.round(ovr * 10) / 10).replace('.', ',')}</b> · tier <b>${esc(f.tier)}</b>` +
      `${fuera ? ` <em>(fuera de ${lo}–${hi})</em>` : ''} · valor ${v != null ? monedas(v) : '—'} · ${f.poderes.length} ${f.poderes.length === 1 ? 'poder' : 'poderes'}`;
  }
  function filaPoder(p, i) {
    const siempre = p.probabilidad === 'siempre';
    const ps = siempre ? [] : (p.probabilidades ?? [p.probabilidad, p.probabilidad / 2.5, p.probabilidad / 6]);
    return `<li class="slr-editor__poder" data-i="${i}">
      <div class="slr-editor__fila">
        <label class="slr-campo"><span>Momento</span><select class="slr-input" data-p="momento">${opciones(MOMENTOS, p.momento)}</select></label>
        <label class="slr-campo"><span>Nivel</span><select class="slr-input" data-p="nivel">${opciones(Object.fromEntries(NIVELES.map(n => [n, n])), p.nivel)}</select></label>
        <button class="slr-editor__quitar" type="button" data-quitar-poder aria-label="Quitar poder">✕</button>
      </div>
      <label class="slr-campo"><span>Nombre</span>
        <input class="slr-input" data-p="nombre" maxlength="30" value="${esc(p.nombre)}" list="slr-nombres-${esc(p.momento)}" autocomplete="off"></label>
      ${siempre ? '<p class="slr-suave">Siempre activo: multiplica por 2 sus opciones de ser el tirador.</p>' : `
      <div class="slr-editor__fila">
        ${[0, 1, 2].map(k => `<label class="slr-campo"><span>${k + 1} ${k ? 'veces' : 'vez'} (%)</span>
          <input class="slr-input" type="number" min="0" max="100" step="1" data-prob="${k}" value="${Math.round((ps[k] ?? 0) * 100)}"></label>`).join('')}
      </div>`}
    </li>`;
  }
  function pintarPoderes() {
    listaPoderes.innerHTML = f.poderes.map(filaPoder).join('') || '<li class="slr-suave">Sin poderes.</li>';
    pintarVista();
  }
  // Sugerencias de nombre por momento (nombre libre)
  el.querySelector('.slr-editor').insertAdjacentHTML('beforeend', Object.entries(NOMBRES_PODER).map(([m, ns]) =>
    `<datalist id="slr-nombres-${m}">${ns.map(n => `<option value="${esc(n)}">`).join('')}</datalist>`).join(''));

  /* ── Cambios ── */
  // Si no se han tocado a mano, los rasgos siguen al perfil y a la semilla de stats
  const pintarRasgos = () => {
    if (f.rasgosAMano) return;
    proponerRasgos();
    form.elements.estamina.value = f.estamina;
    form.elements.tactica_favorita.value = f.tactica_favorita;
    pintarVista();
  };
  const regenerarStats = () => { f.stats = generarStats(f.tier, f.perfil, f.tipo, f.semilla_stats); pintarStats(); };
  const regenerarPoderes = () => { f.poderes = generarPoderes(f.tier, f.perfil, f.semilla_poderes); pintarPoderes(); };
  function pintarStats() {
    for (const k of ['ATA', 'DEF', 'CON']) el.querySelector(`[data-stat="${k}"]`).value = f.stats[k];
    pintarVista();
  }

  form.addEventListener('input', e => {
    const t = e.target;
    if (t.name === 'nombre' || t.name === 'texto') { f[t.name] = t.value; pintarVista(); }
    if (t.name === 'imagen_url') { f.imagen_url = t.value.trim(); fotoLocal = null; pintarVista(); }
    if (t.dataset.stat) {
      const v = Math.max(1, Math.min(101, Math.round(Number(t.value) || 1)));
      f.stats[t.dataset.stat] = v;
      pintarVista();
    }
    const li = t.closest('[data-i]');
    if (li) {
      const p = f.poderes[Number(li.dataset.i)];
      if (t.dataset.p === 'nombre') p.nombre = t.value;
      if (t.dataset.prob != null) {
        const ps = [0, 1, 2].map(k => Math.max(0, Math.min(100, Number(li.querySelector(`[data-prob="${k}"]`).value) || 0)) / 100);
        p.probabilidades = ps;
        delete p.probabilidad;
      }
      pintarVista();
    }
  });
  form.addEventListener('change', e => {
    const t = e.target;
    if (['tipo', 'perfil', 'tier'].includes(t.name)) {
      f[t.name] = t.value;
      // Tier y perfil cambian lo que toca: se vuelve a generar con la misma semilla
      regenerarStats();
      if (t.name !== 'tipo') regenerarPoderes();
      if (t.name === 'perfil') pintarRasgos();
    }
    if (t.dataset.rasgo != null) { f[t.name] = t.value; f.rasgosAMano = true; pintarVista(); }
    if (t.name === 'acabado' || t.name === 'color' || t.name === 'coleccion_id') { f[t.name] = t.value; pintarVista(); }
    const li = t.closest('[data-i]');
    if (li && (t.dataset.p === 'momento' || t.dataset.p === 'nivel')) {
      const p = f.poderes[Number(li.dataset.i)];
      p[t.dataset.p] = t.value;
      if (p.momento === 'tirador') {
        Object.assign(p, { probabilidad: 'siempre', efecto: 2 });
        delete p.probabilidades;
      } else {
        if (p.probabilidad === 'siempre') { delete p.probabilidad; p.probabilidades = [...PROBABILIDADES[p.nivel]]; }
        p.efecto = EFECTOS[p.nivel];
      }
      pintarPoderes();
    }
  });
  el.querySelector('[data-regenerar="stats"]').addEventListener('click', () => {
    f.semilla_stats = semillaNueva(f.semilla_stats); regenerarStats(); pintarRasgos();
  });
  el.querySelector('[data-regenerar="poderes"]').addEventListener('click', () => {
    f.semilla_poderes = semillaNueva(f.semilla_poderes); regenerarPoderes();
  });
  el.querySelector('[data-anadir-poder]').addEventListener('click', () => {
    f.poderes.push({ nombre: NOMBRES_PODER.posesion[0], momento: 'posesion', nivel: 'simple', efecto: EFECTOS.simple,
      probabilidades: [...PROBABILIDADES.simple] });
    pintarPoderes();
  });
  listaPoderes.addEventListener('click', e => {
    const b = e.target.closest('[data-quitar-poder]');
    if (!b) return;
    f.poderes.splice(Number(b.closest('[data-i]').dataset.i), 1);
    pintarPoderes();
  });
  el.querySelector('[data-sin-foto]')?.addEventListener('click', e => {
    f.imagen_url = ''; fotoLocal = null; form.imagen_url.value = ''; e.currentTarget.remove(); pintarVista();
  });

  // Foto: vista previa al momento (blob:) y subida a Cloudinary
  const estadoFoto = el.querySelector('[data-estado-foto]');
  const subir = el.querySelector('.slr-editor__subir [role=button]');
  subir.addEventListener('click', () => el.querySelector('[data-archivo]').click());
  el.querySelector('[data-archivo]').addEventListener('change', async e => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!/^image\/(png|jpeg|webp)$/.test(archivo.type)) { estadoFoto.textContent = 'Tiene que ser PNG, JPG o WebP.'; return; }
    if (fotoLocal) URL.revokeObjectURL(fotoLocal);
    fotoLocal = URL.createObjectURL(archivo);
    pintarVista();
    estadoFoto.className = 'slr-editor__estado';
    estadoFoto.textContent = 'Subiendo a Cloudinary…';
    try {
      f.imagen_url = await subirFoto(archivo);
      form.imagen_url.value = f.imagen_url;
      estadoFoto.textContent = `Subida (${archivo.type === 'image/png' ? 'PNG: se respeta la transparencia' : archivo.type.slice(6).toUpperCase()}).`;
    } catch (err) {
      estadoFoto.className = 'slr-editor__estado es-error';
      estadoFoto.textContent = err.message;
    }
  });

  /* ── Guardar ── */
  function validar() {
    const errores = [];
    if (f.nombre.trim().length < 2) errores.push('Ponle un nombre.');
    if (fotoLocal && !f.imagen_url) errores.push('La foto no se ha subido: revisa el aviso de la foto o pega una URL.');
    f.poderes.forEach((p, i) => {
      if (!p.nombre?.trim()) errores.push(`El poder ${i + 1} necesita un nombre.`);
      const ps = p.probabilidades;
      if (ps && !(ps[0] >= ps[1] && ps[1] >= ps[2])) errores.push(`Poder ${i + 1}: «1 vez» ≥ «2 veces» ≥ «3 veces».`);
    });
    return errores;
  }
  async function guardar(boton, darDespues) {
    const errores = validar();
    const caja = el.querySelector('[data-error]');
    caja.hidden = !errores.length;
    caja.textContent = errores.join(' ');
    if (errores.length) return;
    await conEspera(boton, async () => {
      const r = await rpc('slr_admin_guardar_diseno', { liga_id: liga, diseno: {
        id: f.id, nombre: f.nombre.trim(), tipo: f.tipo, perfil: f.perfil, tier: f.tier, acabado: f.acabado,
        color: f.color || null, coleccion_id: f.coleccion_id || null,
        ata: f.stats.ATA, def: f.stats.DEF, con: f.stats.CON, poderes: f.poderes,
        imagen_url: f.imagen_url || null, texto: f.texto || null, personas: f.personas,
        semilla_stats: f.semilla_stats, semilla_poderes: f.semilla_poderes,
        estamina: f.estamina, tactica_favorita: f.tactica_favorita || '',
      } });
      toast(`${r.nombre}: ${f.id ? 'cambios guardados' : 'carta creada'} (valor ${r.valor})`, 'ok');
      await ctx.recargar('cartas');
      cerrarCapa();
      if (darDespues && r.carta_id) setTimeout(() => darA(ctx, r.carta_id, r.nombre), 320);
      ctx.pintar();
      ctx.alGuardar?.(r);
    }).catch(() => {});
  }
  form.addEventListener('submit', e => { e.preventDefault(); guardar(el.querySelector('[data-guardar]'), false); });
  // Crear una colección sin salir del formulario: al guardarla queda elegida
  el.querySelector('[data-nueva-coleccion]').addEventListener('click', () =>
    formularioColeccion(ctx, null, { alGuardar: k => { if (k) { f.coleccion_id = k.id; pintarColecciones(); pintarVista(); } } }));
  el.querySelector('[data-crear-dar]')?.addEventListener('click', e => guardar(e.currentTarget, true));

  pintarColecciones();
  pintarPoderes();
}

// Hoja "Dar a…" para la carta recién creada (misma lista que la herramienta de plantillas)
async function darA(ctx, cartaId, nombre) {
  const liga = ctx.datos.liga.id;
  const { equipos, maximo } = await rpc('slr_admin_cartas', { liga_id: liga });
  const h = hoja(`
    <p class="slr-suave slr-dar__carta">${esc(nombre)} · libre</p>
    <ul class="slr-lista-equipos">${equipos.map(e => {
      const llena = e.cartas >= maximo;
      return `<li><button type="button" data-equipo="${esc(e.id)}" ${llena ? 'disabled' : ''}>
        <span class="slr-lista-equipos__texto"><b>${e.bot ? '🤖 ' : ''}${esc(e.nombre)}</b><small>${e.bot ? 'bot de pruebas' : esc(e.usuario)}</small></span>
        <span class="slr-lista-equipos__cartas ${llena ? 'es-llena' : ''}"><b>${e.cartas}/${maximo}</b><small>${llena ? 'llena' : 'cartas'}</small></span>
      </button></li>`;
    }).join('')}</ul>`, { titulo: 'Dar a…' });
  h.querySelectorAll('[data-equipo]').forEach(b => b.addEventListener('click', () => conEspera(b, async () => {
    const r = await accion('slr_admin_mover_carta', { liga_id: liga, carta_id: cartaId, equipo_id: b.dataset.equipo });
    toast(`${r.nombre} → ${r.ahora}`, 'ok');
    cerrarCapa();
    await ctx.recargar('cartas', 'alineacion');
    ctx.pintar();
  }).catch(() => {})));
}
