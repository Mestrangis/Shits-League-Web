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
import { abrirPlantillas } from './plantillas-admin.js';
import { abrirMuestrario } from './muestrario.js';

const TIPOS_MOV = {
  saldo_inicial: 'Saldo inicial', reinicio_temporada: 'Nueva temporada', salario: 'Salario de la jornada',
  bonus_participacion: 'Bonus de participación', bonus_sorpresa: 'Bonus sorpresa', bonus_ojo_clinico: 'Ojo clínico',
  venta_banco: 'Venta al banco', compra: 'Compra', venta: 'Venta', subasta: 'Subasta ganada',
  oferta_compra: 'Oferta (compra)', oferta_venta: 'Oferta (venta)', intercambio_paga: 'Intercambio (pagas)',
  intercambio_cobra: 'Intercambio (cobras)', clausula_paga: 'Cláusula pagada', clausula_cobra: 'Cláusula cobrada',
  subir_clausula: 'Subida de cláusula', prueba: 'Ajuste de prueba',
};
const tipoMov = t => TIPOS_MOV[t] ?? (t.startsWith('sobre_') ? `Sobre ${t.slice(6)}` : t.replace(/_/g, ' '));

const ESTADOS_LIGA = {
  preparacion: 'En preparación', en_curso: 'En curso', pausada: 'En pausa',
  entre_temporadas: 'Entre temporadas', terminada: 'Terminada',
};

/* ── Panel de administración (también lo usa previa.js) ──────────────────── */
export async function panelAdmin(cont, ctx) {
  const { datos, recargar } = ctx;
  const liga = datos.liga, info = datos.ligaInfo ?? liga;
  const estado = info.estado;
  const miembros = await leer(`equipos?select=id,nombre,saldo,creado_en,usuarios(nombre,interno)&liga_id=eq.${liga.id}&order=creado_en`);
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
      <div class="slr-admin__acciones">
        ${estado === 'en_curso' && j ? `<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="jugar">▶ Jugar la jornada ${j.numero} ahora</button>` : ''}
        ${sinTemporada ? '<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="anadir">+ Añadir bot</button>' : ''}
        ${sinTemporada && bots.length ? `<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="quitar">− Quitar bot (${esc(bots[bots.length - 1].nombre)})</button>` : ''}
        <button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="plantillas">🃏 Plantillas: dar o quitar cartas</button>
        <button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="muestrario">✨ Muestrario de acabados</button>
        <button class="slr-btn slr-btn--peligro" type="button" data-pruebas="reiniciar">Reiniciar beta</button>
      </div>
      ${!sinTemporada ? '<p class="slr-suave">Los bots se añaden o quitan antes de empezar la temporada o entre temporadas.</p>' : ''}
    </section>` : ''}`;

  cont.querySelectorAll('[data-pruebas]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.pruebas === 'plantillas') abrirPlantillas(ctx).catch(() => {});
    else if (b.dataset.pruebas === 'muestrario') abrirMuestrario(ctx);
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

async function accionPruebas(boton, ctx) {
  const liga = ctx.datos.liga.id;
  const accion = boton.dataset.pruebas;
  if (accion === 'reiniciar') {
    const ok = await confirmar({
      titulo: 'Reiniciar beta',
      texto: 'Se borran <b>todos</b> los equipos, cartas, álbumes, temporadas, partidos, mercado y movimientos de esta liga. ' +
        'Queda en preparación con un ejemplar libre de cada carta. La liga y su configuración se conservan.',
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
      toast(`🤖 ${r.nombre} se une a la liga`, 'ok');
    } else if (accion === 'quitar') {
      const r = await rpc('slr_admin_quitar_bot', { liga_id: liga });
      toast(`${r.quitado} deja la liga`, 'ok');
    } else if (accion === 'reiniciar') {
      await rpc('slr_admin_reiniciar_beta', { liga_id: liga });
      toast('Liga reiniciada', 'ok');
    }
    await ctx.recargar();
    await ctx.pintar();
  }).catch(e => { if (e.message?.includes('tardando')) toast(e.message, 'error'); });
}

export async function pintar(cont, ctx) {
  const { datos } = ctx;
  const movs = (await rpc('slr_movimientos', { equipo_id: datos.equipo.id })).slice().reverse();

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
    <button class="slr-btn slr-btn--fantasma slr-btn--album" type="button" data-album>📖 Mi álbum</button>
    <div data-admin></div>
    <section class="slr-tarjeta">
      <div class="slr-tarjeta__cabeza"><span>Movimientos</span><span>${movs.length}</span></div>
      <ul class="slr-movimientos">${movs.map(m => `
        <li>
          <div><b>${esc(tipoMov(m.tipo))}</b><time>${esc(fechaHora(m.creado_en))}</time></div>
          <div class="${m.importe >= 0 ? 'es-ingreso' : 'es-gasto'}"><b>${conSigno(m.importe)}</b><small>${miles(m.saldo_despues)}</small></div>
        </li>`).join('')}</ul>
    </section>`;

  cont.querySelector('[data-renombrar]').addEventListener('click', () => renombrar(ctx));
  cont.querySelector('[data-album]').addEventListener('click', () => abrirAlbum(ctx).catch(() => {}));

  // Avatar de la sesión de Shits League (session.js, script clásico global)
  const av = cont.querySelector('[data-avatar]');
  if (typeof window.renderAvatar === 'function') window.renderAvatar(av, datos.jugador);
  else av.textContent = '👤';

  if (datos.liga.es_admin) await panelAdmin(cont.querySelector('[data-admin]'), ctx);
}
