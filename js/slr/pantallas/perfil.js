/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — Perfil
   Nombre y avatar de la sesión de Shits League, equipo, saldo y movimientos.
   Cambiar el nombre del equipo. El administrador de la liga ve además su
   panel: miembros, iniciar temporada, pausar/reanudar, aplazar y terminar, y
   con ligas.config.modo_beta, el "Modo pruebas": jugar la jornada ya, añadir y
   quitar bots y reiniciar la liga.
═══════════════════════════════════════════════ */
import { rpc, leer } from '../api.js';
import { esc, miles, monedas, conSigno, fechaHora, diaHora, confirmar, conEspera, toast, hoja, cerrarCapa } from '../ui.js';
import { proximaJornada } from '../rush.js';
import { abrirAlbum } from './album.js';
import { abrirCatalogo } from './catalogo.js';
import { abrirPlantillas } from './plantillas-admin.js';
import { abrirMuestrario } from './muestrario.js';
import { abrirMuestrarioPartido } from './muestrario-partido.js';
import { abrirEditorCarta } from './editor-carta.js';
import { abrirColecciones } from './colecciones-admin.js';
import { abrirSobresAdmin } from './sobres-admin.js';
import { TIPOS } from '../carta.js';

const TIPOS_MOV = {
  saldo_inicial: 'Saldo inicial', reinicio_temporada: 'Nueva temporada', salario: 'Salario de la jornada',
  bonus_participacion: 'Bonus de participación', bonus_sorpresa: 'Bonus sorpresa', bonus_ojo_clinico: 'Ojo clínico',
  venta_banco: 'Venta al banco', compra: 'Compra', venta: 'Venta', subasta: 'Subasta ganada',
  oferta_compra: 'Oferta (compra)', oferta_venta: 'Oferta (venta)', intercambio_paga: 'Intercambio (pagas)',
  intercambio_cobra: 'Intercambio (cobras)', clausula_paga: 'Cláusula pagada', clausula_cobra: 'Cláusula cobrada',
  subir_clausula: 'Subida de cláusula', prueba: 'Ajuste de prueba',
};
const tipoMov = t => TIPOS_MOV[t] ?? (t.startsWith('sobre_') ? `Sobre ${t.slice(6)}` : t.replace(/_/g, ' '));

export const ESTADOS_LIGA = {
  preparacion: 'En preparación', en_curso: 'En curso', pausada: 'En pausa',
  entre_temporadas: 'Entre temporadas', terminada: 'Terminada',
};

/* ── Panel de administración (también lo usa previa.js) ──────────────────── */
// Lo que necesita el panel de administración: los miembros y, en modo pruebas, el bombo
export async function datosAdmin({ datos }) {
  const liga = datos.liga, info = datos.ligaInfo ?? liga;
  const [miembros, bombo] = await Promise.all([
    leer(`equipos?select=id,nombre,saldo,creado_en,usuarios(nombre,interno)&liga_id=eq.${liga.id}&order=creado_en`),
    info.config?.modo_beta === true ? rpc('slr_admin_bombo', { liga_id: liga.id }, { silencioso: true }).catch(() => null) : null,
  ]);
  return { miembros, bombo };
}

// admin: lo de datosAdmin si ya se tiene (la pantalla Perfil lo trae con sus datos)
export async function panelAdmin(cont, ctx, admin = null) {
  const { datos, recargar } = ctx;
  const liga = datos.liga, info = datos.ligaInfo ?? liga;
  const estado = info.estado;
  const { miembros, bombo } = admin ?? await datosAdmin(ctx);
  const bots = miembros.filter(m => m.usuarios?.interno);
  const modoBeta = info.config?.modo_beta === true;
  const sinTemporada = ['preparacion', 'entre_temporadas'].includes(estado);
  const j = proximaJornada();

  const ACCIONES = [
    { id: 'iniciar', texto: `Iniciar temporada ${(datos.temporada?.numero ?? 0) + 1}`, si: ['preparacion', 'entre_temporadas'].includes(estado),
      rpc: 'slr_iniciar_temporada', confirmar: { titulo: 'Iniciar temporada',
        texto: `Se sortea el calendario (${miembros.length} equipos) y la jornada 1 será el primer domingo con al menos 24 h por delante.` +
          (estado === 'entre_temporadas' ? ' <b>Todas las cartas se reparten de nuevo desde los álbumes y los saldos vuelven a 5.000.</b>' : '') +
          ' Mientras dure, nadie más podrá unirse.', ok: 'Iniciar' } },
    { id: 'pausar', texto: 'Pausar la liga', si: estado === 'en_curso', rpc: 'slr_pausar',
      confirmar: { titulo: 'Pausar la liga', texto: 'Se cancelan las subastas abiertas, se cierra el mercado y se congela el calendario. Se avisa a todos.', ok: 'Pausar' } },
    { id: 'reanudar', texto: 'Reanudar la liga', si: estado === 'pausada', rpc: 'slr_reanudar',
      confirmar: { titulo: 'Reanudar la liga', texto: 'Blindajes y ofertas se alargan lo que duró la pausa y la próxima jornada pasa al primer domingo con 24 h por delante.', ok: 'Reanudar' } },
    { id: 'aplazar', texto: j ? `Aplazar la jornada ${j.numero}` : 'Aplazar jornada', si: estado === 'en_curso' && !!j, rpc: 'slr_aplazar_jornada',
      confirmar: { titulo: 'Aplazar jornada', texto: `La jornada ${j?.numero} y todas las siguientes se mueven una semana.`, ok: 'Aplazar' } },
    { id: 'terminar', texto: 'Terminar la temporada', si: ['en_curso', 'pausada'].includes(estado), rpc: 'slr_terminar_temporada', peligro: true,
      confirmar: { titulo: 'Terminar la temporada', texto: 'Solo cuentan las jornadas ya publicadas; las pendientes se cancelan. No se puede deshacer.',
        ok: 'Terminar', peligro: true, escribir: 'TERMINAR' } },
  ];

  cont.innerHTML = `
    <section class="slr-tarjeta slr-admin">
      <div class="slr-tarjeta__cabeza"><span>Administración</span><span class="slr-estado-liga">${esc(ESTADOS_LIGA[estado] ?? estado)}</span></div>
      <h3 class="slr-subtitulo">Miembros (${miembros.length})</h3>
      <ul class="slr-miembros">${miembros.map(m => `
        <li><b>${m.usuarios?.interno ? '🤖 ' : ''}${esc(m.nombre)}</b><span>${m.usuarios?.interno ? 'bot de pruebas' : esc(m.usuarios?.nombre ?? '')}</span>${monedas(m.saldo)}</li>`).join('') || '<li class="slr-suave">Nadie se ha unido todavía.</li>'}</ul>
      ${j ? `<p class="slr-suave">Próxima jornada: ${j.numero}, cierre el ${esc(diaHora(j.cierre_en))}.</p>` : ''}
      <div class="slr-admin__acciones">
        ${ACCIONES.filter(a => a.si).map(a => `<button class="slr-btn ${a.peligro ? 'slr-btn--peligro' : 'slr-btn--fantasma'}" type="button" data-accion="${a.id}">${esc(a.texto)}</button>`).join('')}
      </div>
    </section>
    ${modoBeta ? `
    <section class="slr-tarjeta slr-pruebas">
      <div class="slr-tarjeta__cabeza"><span>🧪 Modo pruebas</span><span>${bots.length} ${bots.length === 1 ? 'bot' : 'bots'}</span></div>
      <p class="slr-suave">Herramientas para probar la beta. Los bots no tocan el mercado y su alineación (la mejor 2-2-2) se rehace sola antes de cada cierre.</p>
      ${bombo ? contadorBombo(bombo) : ''}
      <div class="slr-admin__acciones">
        ${estado === 'en_curso' && j ? `<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="jugar">▶ Jugar la jornada ${j.numero} ahora</button>` : ''}
        ${sinTemporada ? '<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="anadir">+ Añadir bot</button>' : ''}
        ${sinTemporada && bots.length ? `<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="quitar">− Quitar bot (${esc(bots[bots.length - 1].nombre)})</button>` : ''}
        <button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="nueva-carta">➕ Nueva carta</button>
        <button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="colecciones">🏷 Colecciones</button>
        <button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="sobres">📦 Sobres</button>
        <button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="resolver-subastas">⏩ Resolver subastas ahora</button>
        <button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="tanda-nueva">🆕 Abrir tanda nueva ahora</button>
        <button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="plantillas">🃏 Plantillas: dar o quitar cartas</button>
        <button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="muestrario">✨ Muestrario de cartas</button>
        <button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="escenas-partido">🎬 Escenas de partido</button>
        <button class="slr-btn slr-btn--peligro" type="button" data-pruebas="borrar-beta">Borrar cartas beta (sin foto)</button>
        <button class="slr-btn slr-btn--peligro" type="button" data-pruebas="reiniciar">Reiniciar beta</button>
      </div>
      ${!sinTemporada ? '<p class="slr-suave">Los bots se añaden o quitan antes de empezar la temporada o entre temporadas.</p>' : ''}
    </section>` : ''}`;

  cont.querySelectorAll('[data-pruebas]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.pruebas === 'plantillas') abrirPlantillas(ctx).catch(() => {});
    else if (b.dataset.pruebas === 'nueva-carta') abrirEditorCarta(ctx).catch(e => toast(e.message, 'error'));
    else if (b.dataset.pruebas === 'muestrario') abrirMuestrario(ctx);
    else if (b.dataset.pruebas === 'escenas-partido') abrirMuestrarioPartido(ctx);
    else if (b.dataset.pruebas === 'colecciones') abrirColecciones(ctx).catch(e => toast(e.message, 'error'));
    else if (b.dataset.pruebas === 'sobres') abrirSobresAdmin(ctx).catch(e => toast(e.message, 'error'));
    else if (b.dataset.pruebas === 'borrar-beta') borrarBeta(b, ctx);
    else accionPruebas(b, ctx);
  }));

  cont.querySelectorAll('[data-accion]').forEach(b => b.addEventListener('click', async () => {
    const a = ACCIONES.find(x => x.id === b.dataset.accion);
    if (!(await confirmar(a.confirmar))) return;
    await conEspera(b, async () => {
      await rpc(a.rpc, { liga_id: liga.id });
      toast(`${a.confirmar.titulo}: hecho`, 'ok');
      await recargar();
      await ctx.pintar();
    }).catch(() => {});
  }));
}

// Hoja para cambiar el nombre del equipo (slr_renombrar_equipo)
function renombrar(ctx) {
  const { datos } = ctx;
  const el = hoja(`
    <form class="slr-form" data-form>
      <label class="slr-campo"><span>Nombre del equipo</span>
        <input class="slr-input" name="nombre" minlength="3" maxlength="30" value="${esc(datos.equipo.nombre)}" autocomplete="off" required></label>
      <button class="slr-btn slr-btn--grande" type="submit">Guardar nombre</button>
    </form>`, { titulo: 'Tu equipo' });
  const form = el.querySelector('[data-form]');
  setTimeout(() => form.nombre.select(), 300);
  form.addEventListener('submit', e => {
    e.preventDefault();
    conEspera(form.querySelector('button'), async () => {
      const r = await rpc('slr_renombrar_equipo', { equipo_id: datos.equipo.id, nombre: form.nombre.value });
      toast(`Tu equipo ahora se llama ${r.nombre}`, 'ok');
      await ctx.recargar('yo', 'liga');
      cerrarCapa();
      ctx.pintar();
    }).catch(() => {});
  });
}

/* ── Modo pruebas ────────────────────────────────────────────────────────── */
const dormir = ms => new Promise(r => setTimeout(r, ms));

// Juega la siguiente jornada ya: el servidor la cierra, la Edge Function la
// simula (asíncrono) y se publica en cuanto está; se repite hasta 'publicada'
async function jugarJornada(boton, liga) {
  for (let i = 0; i < 60; i++) {
    const r = await rpc('slr_admin_jugar_jornada', { liga_id: liga });
    if (r.estado === 'sin_jornadas') return r;
    boton.lastChild.textContent = r.estado === 'simulando' ? `Simulando la jornada ${r.jornada}…` : '';
    if (r.estado === 'publicada') return r;
    await dormir(1500);
  }
  throw new Error('La simulación está tardando demasiado: vuelve a pulsar en un momento');
}

// Plantillas iniciales completas que salen de las individuales libres del bombo
// (sin el 20 % más caro); si no llegan, el reparto tira de las caras.
// Debajo, el progreso del catálogo hacia el objetivo para 18 equipos (CARTAS.md)
const EQUIPOS_OBJETIVO = 18;
const CATALOGO_OBJETIVO = { comun: 250, rara: 80, epica: 40, legendaria: 28 };
const NOMBRE_RAREZA = { comun: 'Comunes', rara: 'Raras', epica: 'Épicas', legendaria: 'Legendarias' };
function progresoCatalogo(cat = {}) {
  return `<div class="slr-catalogo-objetivo" data-catalogo-objetivo>
    <span>Catálogo objetivo (${EQUIPOS_OBJETIVO} equipos)</span>
    ${Object.entries(CATALOGO_OBJETIVO).map(([r, obj]) => {
      const n = cat[r] ?? 0;
      return `<div class="slr-catalogo-objetivo__fila slr-chip-rareza--${r}">
        <small>${NOMBRE_RAREZA[r]}</small><i><b style="width:${Math.min(100, (100 * n) / obj).toFixed(1)}%"></b></i>
        <em>${miles(n)}/${miles(obj)}</em></div>`;
    }).join('')}
  </div>`;
}
function contadorBombo(b) {
  const faltan = Math.max(0, EQUIPOS_OBJETIVO * b.por_equipo - b.bombo);
  return `<div class="slr-bombo ${b.equipos < 2 ? 'es-corto' : ''}" data-bombo>
    <p><span>Plantillas iniciales disponibles</span><b>${b.equipos} ${b.equipos === 1 ? 'equipo' : 'equipos'}</b></p>
    <small>${miles(b.bombo)} individuales libres en el bombo (${b.por_equipo} por equipo)` +
      `${b.caras ? ` · con las ${miles(b.caras)} caras de reserva, ${b.equipos_con_caras}` : ''}` +
      `${faltan ? ` · para ${EQUIPOS_OBJETIVO} equipos faltan ${miles(faltan)}` : ''}</small>
    ${progresoCatalogo(b.catalogo_rarezas)}
  </div>`;
}

// Borra del catálogo las cartas beta sin foto (slr_admin_borrar_disenos): antes
// cuenta lo que se borraría (solo_contar) y pide escribir BORRAR
const PLURAL_TIPO = { individual: 'individuales', duo: 'dúos', trio: 'tríos', grupo: 'grupos', especial: 'especiales' };
async function borrarBeta(boton, ctx) {
  const filtro = { liga_id: ctx.datos.liga.id, beta: true, sin_foto: true };
  const plural = (n, uno, varios) => `${miles(n)} ${n === 1 ? uno : varios}`;
  let cuenta;
  try {
    cuenta = await conEspera(boton, () => rpc('slr_admin_borrar_disenos', { filtro, solo_contar: true }));
  } catch { return; }
  if (!cuenta?.disenos) { toast('No hay cartas beta sin foto que borrar', 'info'); return; }
  const tipos = Object.entries(cuenta.por_tipo).map(([t, n]) => `${miles(n)} ${esc(n === 1 ? (TIPOS[t] ?? t).toLowerCase() : PLURAL_TIPO[t] ?? t)}`).join(', ');
  const equipos = cuenta.equipos.length
    ? `<br><br>Equipos que pierden cartas: ${cuenta.equipos.map(e => `<b>${esc(e.nombre)}</b> (−${e.pierde}, le quedan ${e.quedan})`).join(', ')}.`
    : '<br><br>Ningún equipo tiene ahora cartas beta.';
  const ok = await confirmar({
    titulo: 'Borrar cartas beta',
    texto: `Se borran <b>${plural(cuenta.disenos, 'carta beta', 'cartas beta')}</b> sin foto (${tipos}) y sus ` +
      `${plural(cuenta.cartas, 'ejemplar', 'ejemplares')} en todas las ligas, con lo que dependa de ellos: alineaciones, ` +
      `subastas, ventas, ofertas, intercambios, sobres, álbum, historial y avisos. ` +
      `Quedan <b>${plural(cuenta.quedan, 'carta', 'cartas')}</b> en el catálogo.${equipos}`,
    ok: 'Borrar', peligro: true, escribir: 'BORRAR',
  });
  if (!ok) return;
  await conEspera(boton, async () => {
    const r = await rpc('slr_admin_borrar_disenos', { filtro });
    toast(`Borradas ${plural(r.borrado.disenos, 'carta', 'cartas')} y ${plural(r.borrado.cartas, 'ejemplar', 'ejemplares')}`, 'ok');
    await ctx.recargar();
    await ctx.pintar();
  }).catch(() => {});
}

async function accionPruebas(boton, ctx) {
  const liga = ctx.datos.liga.id;
  const accion = boton.dataset.pruebas;
  if (accion === 'reiniciar') {
    const ok = await confirmar({
      titulo: 'Reiniciar beta',
      texto: 'Se borran las cartas de todos los equipos, álbumes, temporadas, partidos, mercado y movimientos de esta liga, y se quitan los bots. ' +
        'Queda en preparación con un ejemplar libre de cada carta, y <b>los equipos de personas vuelven a unirse</b> con su nombre: ' +
        'plantilla inicial, saldo y alineación nuevos, por orden de llegada.',
      ok: 'Reiniciar', peligro: true, escribir: 'REINICIAR',
    });
    if (!ok) return;
  }
  await conEspera(boton, async () => {
    if (accion === 'jugar') {
      boton.insertAdjacentHTML('beforeend', '<span class="slr-pruebas__progreso"></span>');
      const r = await jugarJornada(boton, liga);
      toast(r.estado === 'publicada'
        ? `Jornada ${r.jornada} publicada${r.fin_temporada ? ' · ¡temporada terminada!' : ''}`
        : 'No queda ninguna jornada por jugar', 'ok');
    } else if (accion === 'anadir') {
      const r = await rpc('slr_admin_anadir_bot', { liga_id: liga });
      if (r.aviso) toast(`🤖 ${r.nombre} se une con solo ${r.cartas} cartas: no quedan individuales libres para una plantilla completa`, 'error');
      else toast(`🤖 ${r.nombre} se une a la liga`, 'ok');
    } else if (accion === 'resolver-subastas') {
      const r = await rpc('slr_admin_resolver_subastas', { liga_id: liga });
      toast(`${r.resueltas} subastas resueltas (${r.con_ganador} con ganador)`, 'ok');
    } else if (accion === 'tanda-nueva') {
      const r = await rpc('slr_admin_tanda_nueva', { liga_id: liga });
      toast(r.cartas ? `Tanda nueva: ${r.cartas} cartas en subasta` : 'No quedan cartas que puedan salir a subasta', r.cartas ? 'ok' : 'error');
    } else if (accion === 'quitar') {
      const r = await rpc('slr_admin_quitar_bot', { liga_id: liga });
      toast(`${r.quitado} deja la liga`, 'ok');
    } else if (accion === 'reiniciar') {
      const r = await rpc('slr_admin_reiniciar_beta', { liga_id: liga });
      const cortos = r.equipos.filter(e => e.aviso || e.error);
      toast(`Liga reiniciada · ${r.equipos.length ? r.equipos.map(e => `${e.nombre}: ${e.cartas} cartas`).join(', ') : 'sin equipos'}`, 'ok');
      for (const e of cortos) toast(e.error ? `${e.nombre} no ha podido volver a unirse: ${e.error}` : `${e.nombre} empieza con ${e.cartas} cartas: el bombo no llega`, 'error');
    }
    await ctx.recargar();
    await ctx.pintar();
  }).catch(e => { if (e.message?.includes('tardando')) toast(e.message, 'error'); });
}

// Los datos de la pantalla, en UNA llamada: los movimientos del saldo. Para el admin, a la
// vez, los de su panel (miembros y bombo), y así también se guardan
export async function cargar(ctx) {
  const [movimientos, admin] = await Promise.all([
    rpc('slr_movimientos', { equipo_id: ctx.datos.equipo.id }, { silencioso: true }),
    ctx.datos.liga.es_admin ? datosAdmin(ctx) : null,
  ]);
  return { movimientos, admin };
}

export async function pintar(cont, ctx) {
  const { datos } = ctx;
  const d = ctx.pantalla ?? await cargar(ctx);
  const movs = d.movimientos.slice().reverse();

  cont.innerHTML = `
    <section class="slr-perfil">
      <div class="avatar slr-perfil__avatar" data-avatar></div>
      <div class="slr-perfil__nombres">
        <h1 class="slr-titulo">${esc(datos.jugador)}</h1>
        <p class="slr-perfil__equipo slr-propio">${esc(datos.equipo.nombre)}
          <button class="slr-perfil__editar" type="button" data-renombrar aria-label="Cambiar el nombre del equipo">✎</button></p>
      </div>
    </section>
    <section class="slr-saldo"><div><small>${esc(datos.liga.nombre)}</small><span>Saldo</span></div><b>${monedas(datos.equipo.saldo)}</b></section>
    <div class="slr-perfil__libros">
      <button class="slr-btn slr-btn--fantasma slr-btn--album" type="button" data-album>📖 Mi álbum</button>
      ${datos.liga.es_admin ? '<button class="slr-btn slr-btn--fantasma slr-btn--album" type="button" data-catalogo>🗂 Catálogo de cartas</button>' : ''}
    </div>
    <div data-admin></div>
    <section class="slr-tarjeta" data-movimientos>
      <div class="slr-tarjeta__cabeza"><span>Movimientos</span><span>${movs.length}</span></div>
      <ul class="slr-movimientos">${movs.map(m => `
        <li>
          <div><b>${esc(tipoMov(m.tipo))}</b><time>${esc(fechaHora(m.creado_en))}</time></div>
          <div class="${m.importe >= 0 ? 'es-ingreso' : 'es-gasto'}"><b>${conSigno(m.importe)}</b><small>${miles(m.saldo_despues)}</small></div>
        </li>`).join('')}</ul>
    </section>
    <section class="slr-perfil__version">
      <span data-version-app>Versión …</span>
      <button class="slr-btn slr-btn--fantasma" type="button" data-reparar-app>Reparar la app</button>
    </section>`;
  window.SLVersion?.pintarEtiqueta?.(cont);

  cont.querySelector('[data-renombrar]').addEventListener('click', () => renombrar(ctx));
  cont.querySelector('[data-album]').addEventListener('click', () => abrirAlbum(ctx).catch(() => {}));
  cont.querySelector('[data-catalogo]')?.addEventListener('click', () => abrirCatalogo(ctx).catch(() => {}));

  // Avatar de la sesión de Shits League (session.js, script clásico global)
  const av = cont.querySelector('[data-avatar]');
  if (typeof window.renderAvatar === 'function') window.renderAvatar(av, datos.jugador);
  else av.textContent = '👤';

  if (datos.liga.es_admin) await panelAdmin(cont.querySelector('[data-admin]'), ctx, d.admin);
}
