/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — Perfil
   Nombre y avatar de la sesión de Shits League, equipo, saldo y movimientos.
   Cambiar el nombre del equipo. El administrador de la liga ve además su
   panel: miembros, iniciar temporada, pausar/reanudar, aplazar y terminar.
═══════════════════════════════════════════════ */
import { rpc, leer } from '../api.js';
import { esc, miles, monedas, conSigno, fechaHora, diaHora, confirmar, conEspera, toast, hoja, cerrarCapa } from '../ui.js';
import { proximaJornada } from '../rush.js';

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
  const miembros = await leer(`equipos?select=id,nombre,saldo,creado_en,usuarios(nombre)&liga_id=eq.${liga.id}&order=creado_en`);
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
        <li><b>${esc(m.nombre)}</b><span>${esc(m.usuarios?.nombre ?? '')}</span>${monedas(m.saldo)}</li>`).join('') || '<li class="slr-suave">Nadie se ha unido todavía.</li>'}</ul>
      ${j ? `<p class="slr-suave">Próxima jornada: ${j.numero}, cierre el ${esc(diaHora(j.cierre_en))}.</p>` : ''}
      <div class="slr-admin__acciones">
        ${ACCIONES.filter(a => a.si).map(a => `<button class="slr-btn ${a.peligro ? 'slr-btn--peligro' : 'slr-btn--fantasma'}" type="button" data-accion="${a.id}">${esc(a.texto)}</button>`).join('')}
      </div>
    </section>`;

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

  // Avatar de la sesión de Shits League (session.js, script clásico global)
  const av = cont.querySelector('[data-avatar]');
  if (typeof window.renderAvatar === 'function') window.renderAvatar(av, datos.jugador);
  else av.textContent = '👤';

  if (datos.liga.es_admin) await panelAdmin(cont.querySelector('[data-admin]'), ctx);
}
