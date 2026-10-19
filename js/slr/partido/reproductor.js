/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: el reproductor
   No sabe nada del motor: recibe un guion (guion.js) y va escena a escena
   montando la variante que toca (escenas/registro.js, elegida en azar.js).
   Lleva la línea de tiempo, el marcador (con las fotos y los nombres), el
   reloj, los controles y los avisos de sonido.
   · Tap (o clic) en la pantalla: salta al final de la escena y pasa a la siguiente.
   · «Saltar»: directo al resultado final. · ×1 / ×2. · Silenciar.
   · Un solo bucle (requestAnimationFrame) para el tiempo, el reloj y las
     partículas (un canvas, DPR ≤ 1,5, calidad adaptativa).
   · Tu equipo siempre a la izquierda (si juegas); si no, el local.
   · Temblores solo visuales: nada de vibración del dispositivo.
═══════════════════════════════════════════════ */
import { abrirCapa, cerrarHasta, esc } from '../ui.js';
import { TIEMPOS } from './config.js';
import { Linea } from './linea.js';
import { decorar, prng } from './azar.js';
import { REGISTRO, VARIANTES } from './escenas/registro.js';
import { sonar, silenciado, silenciar } from './sonido.js';
import { Particulas, sprite } from '../particulas.js';
import { cargarFotos } from '../imagenes.js';
import { foto, framesTemblor } from './escenas/comun.js';

export const COLORES = Object.freeze({ izq: '#39FF88', der: '#FF8A3D' });

/**
 * guion: el de crearGuion (sin decorar: aquí se eligen las variantes)
 * cartas: { id: carta normalizada (normalizarCarta) } para pintar las cartas
 * opts: { soloEscenas (muestrario: no hay final ni visto), alVisto(), alTerminar(), velocidad }
 */
export function reproducir(guion, cartas = {}, opts = {}) {
  if (!opts.yaDecorado) decorar(guion, guion.partidoId ?? 'partido', VARIANTES);
  const lados = guion.lados;
  const ladoDe = l => (l === lados.izq ? 'izq' : 'der');
  const color = l => COLORES[ladoDe(l)];
  const equipo = l => guion.equipos[l] ?? {};
  const carta = id => cartas[id] ?? (guion.stats?.[id] ? { nombre: guion.stats[id].nombre } : null);
  const escenas = guion.escenas;
  const iFinal = escenas.findIndex(e => e.tipo === 'final');

  const el = document.createElement('div');
  el.className = 'slr-partido';
  el.dataset.partidoReproductor = '';
  const gol = l => `<b class="slr-pt-marcador__goles" data-goles="${l}">0</b>`;
  el.innerHTML = `
    <canvas class="slr-partido__lienzo" aria-hidden="true"></canvas>
    <header class="slr-pt-marcador">
      <div class="slr-pt-marcador__eq slr-pt-marcador__eq--izq" style="--c:${COLORES.izq}"><span data-foto="${lados.izq}"></span><span class="slr-pt-marcador__nombre">${esc(equipo(lados.izq).nombre ?? '')}</span></div>
      <div class="slr-pt-marcador__centro">${gol(lados.izq)}<span class="slr-pt-reloj" data-reloj>0'</span>${gol(lados.der)}</div>
      <div class="slr-pt-marcador__eq slr-pt-marcador__eq--der" style="--c:${COLORES.der}"><span class="slr-pt-marcador__nombre">${esc(equipo(lados.der).nombre ?? '')}</span><span data-foto="${lados.der}"></span></div>
    </header>
    <div class="slr-pt-temblor" data-temblor><div class="slr-pt-escenario" data-escenario></div></div>
    <nav class="slr-pt-controles">
      <button type="button" class="slr-pt-boton" data-silencio aria-label="Silenciar"></button>
      <button type="button" class="slr-pt-boton" data-velocidad>×1</button>
      ${opts.soloEscenas ? '<button type="button" class="slr-pt-boton" data-pausa>⏸</button>' : ''}
      <span class="slr-pt-pista" data-pista>Toca para avanzar</span>
      <button type="button" class="slr-pt-boton slr-pt-boton--saltar" data-saltar>${opts.soloEscenas ? 'Cerrar' : 'Saltar ⏭'}</button>
    </nav>`;
  const $ = s => el.querySelector(s);
  const escenario = $('[data-escenario]'), temblorEl = $('[data-temblor]'), reloj = $('[data-reloj]');
  const ctxBase = { T: TIEMPOS, lados, lado: ladoDe, color, equipo, carta, sonar };
  for (const f of el.querySelectorAll('[data-foto]')) f.replaceWith(foto(ctxBase, f.dataset.foto));

  // ── Estado ──
  let i = -1, linea = null, vivo = true, frame = 0, ultimo = 0, vel = opts.velocidad ?? 1, espera = 0, visto = false;
  let minuto = 0, objetivoMinuto = 0, pasoMinuto = TIEMPOS.minuto_max, acumMinuto = 0;
  const goles = [0, 0];

  // ── Canvas de partículas ──
  const canvas = $('canvas'), g2 = canvas.getContext('2d');
  const fx = new Particulas();
  let dpr = Math.min(1.5, devicePixelRatio || 1), nivel = 0;
  const lentos = [];
  const medir = () => { canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr); };
  medir();
  addEventListener('resize', medir);
  sprite(COLORES.izq); sprite(COLORES.der); sprite('#ffffff'); sprite('#ff7a1a'); sprite('#ffd23a');

  // ── Marcador y reloj ──
  const pintarGoles = (g, golpeA = null) => {
    for (const l of ['A', 'B']) {
      const n = g[l === 'A' ? 0 : 1], b = el.querySelector(`[data-goles="${l}"]`);
      if (b.textContent !== String(n)) {
        b.textContent = n;
        if (golpeA === l) b.animate([{ transform: 'scale(2.2)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
      }
    }
    goles[0] = g[0]; goles[1] = g[1];
  };
  const pintarReloj = () => { reloj.textContent = `${minuto}'`; };
  // El reloj avanza solo hasta el minuto de la jugada siguiente (decorativo)
  function prepararReloj(desde) {
    const e = escenas[desde];
    if (e.tipo === 'final') { minuto = 90; objetivoMinuto = 90; pintarReloj(); return; }
    if (e.tipo !== 'saque' && e.tipo !== 'inicio' && e.tipo !== 'descanso') return;
    minuto = e.tipo === 'inicio' ? 0 : e.minuto ?? minuto;
    const sig = escenas.slice(desde + 1).find(x => x.tipo === 'saque' || x.tipo === 'final');
    objetivoMinuto = Math.max(minuto, (sig?.tipo === 'final' ? 90 : (sig?.minuto ?? minuto + 1)) - 1);
    const estimado = sig?.tipo === 'final' ? 6000 : 9000;
    pasoMinuto = Math.min(TIEMPOS.minuto_max, estimado / Math.max(1, objetivoMinuto - minuto));
    acumMinuto = 0;
    pintarReloj();
  }

  // ── Escenas ──
  function montar(k) {
    escenario.replaceChildren();
    temblorEl.style.transform = '';
    fx.vaciar();
    const d = escenas[k];
    pintarGoles(d.marcador ?? goles);
    prepararReloj(k);
    const variantes = REGISTRO[d.tipo];
    const crear = variantes?.[d.variante] ?? (variantes ? Object.values(variantes)[0] : null);
    const l = new Linea();
    if (!crear) { l.en(1, () => {}); return l; }
    fx.rng = prng(d.semilla ?? k);
    const ctx = {
      ...ctxBase, d, linea: l, escenario, fx, rng: prng((d.semilla ?? k) ^ 0x5bd1e995),
      centro: n => { const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; },
      // Temblor de toda la escena (visual; se lanza en el momento, como las chispas)
      temblor: (fuerza, en = 0, dur = 400) => { temblorEl.animate(framesTemblor(fuerza), { delay: en / vel, duration: dur / vel, easing: 'linear' }); },
      marcador: (g, l) => pintarGoles(g, l),
    };
    try { crear(ctx); } catch (e) { console.error('[partido] escena', d.tipo, d.variante, e); }
    cargarFotos(escenario.querySelectorAll('.slr-carta'));
    el.dataset.escena = d.tipo;
    el.dataset.variante = d.variante ?? '';
    return l;
  }
  function siguiente() {
    if (!vivo) return;
    linea?.cancelar();
    i++;
    if (i >= escenas.length) { terminar(); return; }
    if (i === iFinal) marcarVisto();
    linea = montar(i);
    linea.iniciar(vel);
    if (opts.alEscena) opts.alEscena(escenas[i], i);
  }
  function marcarVisto() {
    if (visto || opts.soloEscenas) return;
    visto = true;
    try { opts.alVisto?.(); } catch (e) { console.error(e); }
  }
  function terminar() {
    vivo = false;
    cerrarHasta(el);
  }

  // ── Bucle único ──
  function bucle(ahora) {
    if (!vivo) return;
    const dt = ultimo ? Math.min(100, ahora - ultimo) : 16;
    ultimo = ahora;
    lentos.push(dt); if (lentos.length > 30) lentos.shift();
    if (lentos.length === 30 && nivel < 2 && lentos.reduce((a, b) => a + b, 0) / 30 > 26) {
      nivel++; lentos.length = 0; fx.nivel = nivel;
      if (nivel === 2 && dpr > 1) { dpr = 1; medir(); }
      el.dataset.calidad = nivel;
    }
    if (linea?.estado === 'pausada') { /* quieta */ }
    else if (linea && !linea.terminada) linea.avanzar(dt * vel);
    else if (linea?.terminada) {
      espera += dt * vel;
      if (espera >= TIEMPOS.hueco) { espera = 0; siguiente(); }
    }
    if (minuto < objetivoMinuto) {
      acumMinuto += dt * vel;
      if (acumMinuto >= pasoMinuto) { acumMinuto = 0; minuto++; pintarReloj(); }
    }
    fx.pintar(g2, ahora, innerWidth, innerHeight, dpr);
    frame = requestAnimationFrame(bucle);
  }

  // ── Controles ──
  const pintarSilencio = () => { const b = $('[data-silencio]'); b.textContent = silenciado() ? '🔇' : '🔊'; b.setAttribute('aria-label', silenciado() ? 'Activar sonido' : 'Silenciar'); };
  pintarSilencio();
  $('[data-silencio]').addEventListener('click', e => { e.stopPropagation(); silenciar(!silenciado()); pintarSilencio(); });
  $('[data-velocidad]').addEventListener('click', e => {
    e.stopPropagation();
    vel = vel === 1 ? 2 : 1;
    e.currentTarget.textContent = `×${vel}`;
    linea?.velocidad(vel);
  });
  const pausar = si => {
    if (si) linea?.pausar(); else linea?.reanudar();
    const b = $('[data-pausa]');
    if (b) b.textContent = linea?.estado === 'pausada' ? '▶' : '⏸';
  };
  $('[data-pausa]')?.addEventListener('click', e => { e.stopPropagation(); pausar(linea?.estado !== 'pausada'); });
  $('[data-saltar]').addEventListener('click', e => {
    e.stopPropagation();
    if (opts.soloEscenas || iFinal < 0) { terminar(); return; }
    // Directo al resultado final
    linea?.cancelar();
    i = iFinal - 1;
    espera = 0;
    siguiente();
  });
  // Tap: al final de la escena y a la siguiente
  el.addEventListener('click', e => {
    if (e.target.closest('.slr-pt-controles')) return;
    $('[data-pista]').classList.add('es-oculta');
    if (!linea) return;
    if (linea.estado === 'pausada') linea.reanudar();
    if (!linea.terminada) linea.terminar(true);
    espera = 0;
    siguiente();
  });

  function limpiar() {
    vivo = false;
    cancelAnimationFrame(frame);
    linea?.pausar();   // se queda quieta mientras la capa se va (cancelar la haría saltar al principio)
    removeEventListener('resize', medir);
    fx.vaciar();
    opts.alTerminar?.({ visto });
  }

  abrirCapa(el, limpiar);
  frame = requestAnimationFrame(bucle);
  siguiente();
  const control = {
    el,
    get escena() { return escenas[i]; },
    get indice() { return i; },
    get linea() { return linea; },
    pausar: () => pausar(true),
    reanudar: () => pausar(false),
    saltar: () => $('[data-saltar]').click(),
  };
  el.reproductor = control;   // para las pruebas
  return control;
}
