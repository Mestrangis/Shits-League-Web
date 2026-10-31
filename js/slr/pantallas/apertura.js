/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — apertura de sobres
   Pantalla completa (también en PC, centrada y grande). La apertura solo
   enseña lo que el servidor ya ha decidido al pagar.
   1. Flotando: el sobre se balancea y su brillo laminado sigue al dedo, al
      ratón o a la inclinación del móvil.
   2. Cargar: 3 toques. Cada uno hace temblar el sobre y la pantalla más fuerte,
      abre grietas de luz y lo ilumina más. El color de la luz anticipa la mejor
      rareza (blanco, azul, morado o dorado); en las legendarias el último toque
      es especialmente intenso.
   3. Rasgar: una línea brillante arriba; se desliza el dedo (o el ratón) a lo
      largo de ella. Si se suelta antes de terminar, se queda a medias y se
      puede seguir.
   4. Explosión: fogonazo, rayos, partículas y temblor fuerte, del color de la
      mejor rareza; las dos piezas del sobre salen despedidas.
   5. Revelado: las cartas boca abajo en abanico, el dorso con el color de su
      rareza; al tocar cada una se gira (épicas y legendarias: más lento, más
      luz y más partículas). «¡NUEVA!» si es nueva en tu álbum y, al lado,
      «¡DESCUBRIMIENTO!» si nadie de la liga la había tenido (eres el primero;
      en un sobre de elección, si la eliges).
   6. Resumen: las cartas, cuáles son nuevas, su colección y progreso, y el valor.
   · Sobre de elección: las 3 candidatas se giran y se elige una (con la cuenta
     atrás). Si se cierra, la elección pendiente reaparece en Rush.
   · «Saltar» siempre a la vista: directo al resumen (o a elegir).
   · prefers-reduced-motion: sin temblores ni partículas, revelado directo.
   · Al comprar, la pantalla negra sale al momento («Preparando sobre…», con
     abrirEspera) y la apertura la aprovecha cuando llega la respuesta: no se
     puede volver a tocar «Comprar» mientras tanto.

   RENDIMIENTO (móvil medio, CPU ×6 en DevTools; ver DECISIONES.md):
   · Solo se anima transform y opacity. Halos, brillos, grietas, línea de corte
     y fondo de color son capas ya pintadas (degradados o SVG estáticos) que
     solo cambian de opacidad o escala. Nada de filter, box-shadow, clip-path,
     máscaras, mezclas ni background-position animados.
   · Temblor: un único contenedor (la escena) con transform.
   · Rasgado: el corte en zigzag se calcula una vez al empezar; las dos piezas
     del sobre se recortan entonces (clip-path fijo, un solo pintado) y durante
     el arrastre solo se mueven, con transform, una ventana que descubre la
     línea de luz y la chispa de la punta. La separación es una transición de
     transform.
   · Un solo canvas (DPR ≤ 1,5) para partículas y rayos, con sprites ya
     dibujados (sin shadowBlur), y un solo requestAnimationFrame para todo.
   · Calidad adaptativa: si los frames se alargan, menos partículas y sin rayos.
   · Antes de empezar se precargan y decodifican el sobre, el dorso y las fotos.
   · El giro de cada carta: las dos caras montadas desde el principio (el
     frente pre-girado 180°, preserve-3d y backface-visibility: hidden); al
     tocar solo se anima rotateY. Nada de filter ni opacity en el elemento que
     gira (aplanarían el 3D y la carta se vería dos veces).
   · Sonidos: aún no hay; SONIDOS.alSonar(nombre, datos) es el punto de enganche
     (aparece, toque, grieta, rasgar_inicio, rasgando, rasgado, explosion,
     reparto, carta_gira, carta_revelada, elegida, resumen, cerrar).
═══════════════════════════════════════════════ */
import { rpc, nuevoIntento } from '../api.js';
import { esc, miles, abrirCapa, cerrarHasta, toast, faltan } from '../ui.js';
import { cartaHTML, normalizarCarta, RAREZAS } from '../carta.js';
import { sobreHTML, dorsoHTML, moverLamina } from '../sobre-arte.js';
import { asegurarFotos, urlCarta } from '../imagenes.js';
import { Particulas, sprite, rayosDe } from '../particulas.js';

export const SONIDOS = { alSonar: null };
const sonar = (nombre, datos = {}) => { try { SONIDOS.alSonar?.(nombre, datos); } catch { /* sin sonido */ } };

const ORDEN = ['comun', 'rara', 'epica', 'legendaria'];
const LUZ = { comun: '#EEF3F1', rara: '#4D9BFF', epica: '#B26CFF', legendaria: '#FFC94A' };
const GIRO_MS = { comun: 650, rara: 750, epica: 1150, legendaria: 1600 };
const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const mejorDe = cartas => cartas.reduce((m, c) => (ORDEN.indexOf(c.rareza) > ORDEN.indexOf(m) ? c.rareza : m), 'comun');

// Grietas de luz (coordenadas en % del sobre), una tanda por toque
const GRIETAS = [
  ['M50 46 L44 40 L47 33 L41 27', 'M50 46 L57 50 L55 57 L62 62'],
  ['M41 27 L35 22 L38 15', 'M62 62 L69 66 L66 74 L73 80', 'M50 46 L40 52 L43 60 L35 66', 'M50 46 L58 39 L64 41 L69 33'],
  ['M35 66 L27 70 L30 79 L22 86', 'M69 33 L76 28 L74 20 L82 14', 'M43 60 L52 67 L49 76 L56 84', 'M47 33 L56 28 L54 19 L60 12', 'M38 15 L30 10', 'M73 80 L80 88'],
];
const CORTE_Y = 15;      // altura de la línea de rasgado (% del sobre)

// Zigzag del corte, calculado una vez: dientes de ±1,8 % con algo de azar
function zigzag() {
  const p = [[0, CORTE_Y]];
  for (let x = 3, k = 0; x < 100; x += 3.2 + Math.random() * 1.6, k++) p.push([x, CORTE_Y + (k % 2 ? 1.8 : -1.8) + (Math.random() - 0.5)]);
  p.push([100, CORTE_Y]);
  return p;
}

/* ── Pantalla ───────────────────────────────────────────────────────────── */
// La pantalla negra al momento de confirmar la compra, antes de que responda el
// servidor: tapa la tienda (no se puede volver a tocar «Comprar») y la apertura
// la aprovecha (opts.espera) cuando llega el sobre.
export function abrirEspera() {
  const el = document.createElement('div');
  el.className = 'slr-apertura slr-apertura--espera';
  el.dataset.apertura = '';
  el.dataset.fase = 'preparando';
  el.innerHTML = '<p class="slr-apertura__espera" data-pista>Preparando sobre…</p>';
  let cierre = null, cerrada = false;
  abrirCapa(el, () => { cerrada = true; cierre?.(); });
  return {
    el,
    get cerrada() { return cerrada; },
    fijarCierre: f => { cierre = f; },
    cerrar: () => { if (!cerrada) cerrarHasta(el); },
  };
}

// r: respuesta de slr_comprar_sobre (o una vista previa con las mismas claves)
export async function abrirApertura(ctx, r, opts = {}) {
  const cartas = r.cartas ?? r.candidatas ?? [];
  return crearApertura(ctx, {
    cartas, tipo: opts.tipo?.tipo ?? r.tipo, nombre: opts.tipo?.nombre ?? r.nombre ?? '',
    imagen: opts.tipo?.imagen_url ?? null, coleccion: opts.coleccion ?? null, dorso: opts.dorso ?? null,
    eleccion: r.pendiente_eleccion ? { sobre_id: r.sobre_id, caduca_en: r.caduca_en } : null,
    vistaPrevia: !!opts.vistaPrevia, alTerminar: opts.alTerminar, espera: opts.espera,
  });
}

// La elección pendiente (al recargar, desde cualquier pantalla): directa a elegir
export function abrirEleccionPendiente(ctx, pend, opts = {}) {
  return crearApertura(ctx, {
    cartas: pend.candidatas, tipo: 'eleccion', nombre: 'Elección', imagen: null, coleccion: null, dorso: opts.dorso ?? null,
    eleccion: { sobre_id: pend.sobre_id, caduca_en: pend.caduca_en }, directo: true, alTerminar: opts.alTerminar,
  });
}

async function crearApertura(ctx, o) {
  const mejor = mejorDe(o.cartas);
  const luz = LUZ[mejor];
  const quieto = reducido();
  // Si la pantalla de espera sigue abierta, se aprovecha (misma capa y misma entrada del historial)
  const espera = o.espera && !o.espera.cerrada ? o.espera : null;
  const el = espera ? espera.el : document.createElement('div');
  el.className = `slr-apertura slr-apertura--${mejor} es-cargando${espera ? ' abierta' : ''}`;
  el.style.setProperty('--luz', luz);
  el.dataset.apertura = '';
  const sobreArte = () => sobreHTML(o.tipo, { nombre: o.nombre, imagen_url: o.imagen, coleccion: o.coleccion, cartas: o.cartas.length, tam: 'l' });
  el.innerHTML = `
    <div class="slr-apertura__fondo" aria-hidden="true"></div>
    <canvas class="slr-apertura__lienzo" aria-hidden="true"></canvas>
    <div class="slr-apertura__destello" aria-hidden="true"></div>
    <div class="slr-apertura__escena" data-escena>
      <div class="slr-apertura__halo" aria-hidden="true"></div>
      <div class="slr-apertura__sobre" data-sobre>
        <div class="slr-apertura__pieza slr-apertura__pieza--abajo" data-pieza="abajo">${sobreArte()}</div>
        <div class="slr-apertura__pieza slr-apertura__pieza--arriba" data-pieza="arriba" hidden>${sobreArte()}</div>
        <div class="slr-apertura__luz-sobre" aria-hidden="true"></div>
        ${GRIETAS.map((g, i) => `<svg class="slr-apertura__grietas" data-grietas="${i + 1}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          ${g.map(d => `<path class="ancha" d="${d}"/><path d="${d}"/>`).join('')}</svg>`).join('')}
        <div class="slr-apertura__guia" aria-hidden="true"></div>
        <div class="slr-apertura__ventana" data-ventana aria-hidden="true"><div class="slr-apertura__contenido" data-contenido>
          <svg class="slr-apertura__corte" viewBox="0 0 100 44" preserveAspectRatio="none"><polyline class="ancha" data-rasgado points=""/><polyline data-rasgado-fino points=""/></svg>
        </div></div>
        <i class="slr-apertura__punta" data-punta aria-hidden="true"></i>
        <span class="slr-apertura__mano" aria-hidden="true">👆</span>
      </div>
      <div class="slr-apertura__cartas" data-cartas></div>
      <div class="slr-apertura__final" data-final hidden></div>
    </div>
    <p class="slr-apertura__pista" data-pista>Preparando sobre…</p>
    <button class="slr-apertura__saltar" type="button" data-saltar>Saltar ⏭</button>`;

  const $ = s => el.querySelector(s);
  const escena = $('[data-escena]'), sobre = $('[data-sobre]'), pista = $('[data-pista]');
  const canvas = $('canvas'), g2 = canvas.getContext('2d');
  const laminas = [...el.querySelectorAll('.slr-sobre__lamina i')];
  let fase = 'flotando', toques = 0, temblor = 0, t0 = 0, frame = 0, vivo = true, nivel = 0;
  const fx = new Particulas();   // chispas y rayos (js/slr/particulas.js)
  let preparadas = false;
  // Lo que limpiar() necesita, declarado ya: se puede cerrar mientras se prepara el sobre
  let relojEleccion = null, medir = null, alMover = null, alInclinar = null;
  const temporizadores = [];
  const despues = (ms, f) => temporizadores.push(setTimeout(() => vivo && f(), ms));
  const fijarFase = f => { fase = f; el.dataset.fase = f; };
  el.dataset.fase = 'cargando';

  // «Saltar» funciona desde el principio (también mientras se prepara el sobre)
  let listo = false, saltarAlEmpezar = false;
  $('[data-saltar]').addEventListener('click', () => { if (listo) saltar(); else saltarAlEmpezar = true; });

  // ── Precarga: sobre, dorso y fotos de las cartas, decodificadas antes de animar ──
  if (espera) espera.fijarCierre(limpiar);
  else abrirCapa(el, limpiar);
  // Las cartas se revelan grandes (tam 'l'): la foto grande, la misma que pintará cargarFotoCarta
  await asegurarFotos([o.imagen, o.dorso, ...o.cartas.map(c => c.imagen_url && urlCarta(c.imagen_url, 'grande'))]);
  if (!vivo) return el;
  // Lo caro, todavía con «Preparando el sobre…»: sprites, rayos y las cartas (ocultas)
  if (!quieto) { sprite(luz); sprite('#ffffff'); rayosDe(luz); }
  prepararCartas();
  el.classList.remove('es-cargando');
  pista.textContent = 'Toca el sobre para cargarlo';
  fijarFase('flotando');

  // ── Canvas: DPR limitado (1,5) ──
  let dpr = Math.min(1.5, devicePixelRatio || 1);
  medir = () => { canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr); };
  medir();
  addEventListener('resize', medir);

  // ── Brillo laminado: el destino lo marcan el puntero o la inclinación; lo aplica el bucle ──
  let lx = 0.5, ly = 0.3, objX = 0.5, objY = 0.3;
  alMover = e => { objX = e.clientX / innerWidth; objY = e.clientY / innerHeight; };
  alInclinar = e => { if (e.gamma != null) { objX = 0.5 + Math.max(-30, Math.min(30, e.gamma)) / 60; objY = 0.5 + Math.max(-30, Math.min(30, (e.beta ?? 45) - 45)) / 60; } };
  addEventListener('pointermove', alMover, { passive: true });
  addEventListener('deviceorientation', alInclinar);

  // ── Bucle único ──
  let ultimo = 0;
  const lentos = [];
  t0 = performance.now();
  function bucle(ahora) {
    if (!vivo) return;
    const dt = ultimo ? ahora - ultimo : 16;
    ultimo = ahora;
    // Calidad adaptativa: media de los últimos 30 frames
    lentos.push(dt); if (lentos.length > 30) lentos.shift();
    if (lentos.length === 30 && nivel < 2 && lentos.reduce((a, b) => a + b, 0) / 30 > 26) {
      nivel++; lentos.length = 0;
      if (nivel === 2 && dpr > 1) { dpr = 1; medir(); }
      el.dataset.calidad = nivel;
    }
    const t = (ahora - t0) / 1000;
    if (fase === 'flotando' || fase === 'cargando') {
      sobre.style.transform = `translate3d(0, ${(Math.sin(t * 1.6) * 7).toFixed(1)}px, 0) rotate(${(Math.sin(t * 1.1) * 2.2).toFixed(2)}deg)`;
    }
    if (fase !== 'revelado' && fase !== 'resumen') {
      lx += (objX - lx) * 0.12; ly += (objY - ly) * 0.12;
      moverLamina(laminas, lx, ly);
    }
    if (rasgo) pintarRasgo();
    if (temblor > 0.3) {
      const a = temblor;
      escena.style.transform = `translate3d(${((Math.random() - 0.5) * 2 * a).toFixed(1)}px, ${((Math.random() - 0.5) * 2 * a).toFixed(1)}px, 0) rotate(${((Math.random() - 0.5) * a * 0.08).toFixed(2)}deg)`;
      temblor *= 0.88;
    } else if (temblor) { temblor = 0; escena.style.transform = ''; }
    pintarLienzo(ahora);
    frame = requestAnimationFrame(bucle);
  }
  const pintarLienzo = ahora => { fx.nivel = nivel; fx.pintar(g2, ahora, innerWidth, innerHeight, dpr); };
  // El lienzo se «calienta» ya (textura creada y subida) para que el primer toque no la estrene
  if (!quieto) { g2.globalAlpha = 0.02; g2.drawImage(sprite(luz), 0, 0, 2, 2); g2.globalAlpha = 1; fx.sucio = true; }
  frame = requestAnimationFrame(bucle);

  function chispas(x, y, n, { color = luz, fuerza = 9, g = 0.12, tam = 6, vida = 55 } = {}) {
    if (quieto) return;
    fx.nivel = nivel;
    fx.chispas(x, y, n, { color, fuerza, g, tam, vida });
  }
  const centroDe = n => { const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const sacudir = a => { if (!quieto) temblor = Math.max(temblor, a); };
  // Animaciones puntuales con la Web Animations API: sin forzar recálculos (nada de offsetWidth)
  const destello = (fuerte = false) => {
    if (quieto) return;
    $('.slr-apertura__destello').animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0 }], { duration: fuerte ? 900 : 550, easing: 'ease-out' });
  };

  // ── 2. Cargar ──
  function tocar() {
    if (fase !== 'flotando' && fase !== 'cargando') return;
    fijarFase('cargando');
    toques++;
    sonar('toque', { n: toques, rareza: mejor });
    el.dataset.carga = toques;
    el.querySelector(`[data-grietas="${toques}"]`)?.classList.add('visible');
    sonar('grieta', { n: toques });
    const final = toques === 3, legendaria = mejor === 'legendaria';
    sacudir(final ? (legendaria ? 30 : 20) : 6 + toques * 4);
    const [cx, cy] = centroDe(sobre);
    chispas(cx, cy, final ? (legendaria ? 40 : 24) : 8 * toques, { fuerza: final ? 10 : 5, vida: 45 });
    sobre.animate([{ scale: 1 }, { scale: 1.07, offset: 0.3 }, { scale: 1 }], { duration: 320, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    if (final && legendaria) destello(true);
    if (final) {
      pista.textContent = 'Desliza el dedo por la línea para abrirlo';
      despues(legendaria ? 650 : 380, empezarRasgado);
    } else pista.textContent = toques === 1 ? 'Otra vez…' : '¡Una más!';
  }
  sobre.addEventListener('click', tocar);

  // ── 3. Rasgar ──
  let rasgo = null;   // { puntos, progreso, objetivo, activo, pintado }
  function empezarRasgado() {
    const puntos = zigzag();
    const pts = puntos.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`);
    // Las dos piezas se recortan YA (un solo pintado): juntas parecen un sobre entero
    const arriba = $('[data-pieza="arriba"]'), abajo = $('[data-pieza="abajo"]');
    arriba.style.clipPath = `polygon(0 0, 100% 0, ${[...pts].reverse().join(', ')})`;
    abajo.style.clipPath = `polygon(${pts.join(', ')}, 100% 100%, 0 100%)`;
    arriba.hidden = false;
    // La línea vive en una franja de 44 px centrada en el corte: x en %, y en px
    const alto = sobre.getBoundingClientRect().height;
    const linea = puntos.map(([x, y]) => `${x.toFixed(1)},${((y - CORTE_Y) * alto / 100 + 22).toFixed(1)}`).join(' ');
    $('[data-rasgado]').setAttribute('points', linea);
    $('[data-rasgado-fino]').setAttribute('points', linea);
    rasgo = { puntos, progreso: 0, objetivo: 0, activo: false, pintado: -1, rect: sobre.getBoundingClientRect(),
              ventana: $('[data-ventana]'), contenido: $('[data-contenido]'), punta: $('[data-punta]') };
    sobre.style.transform = '';
    fijarFase('rasgar');
    sonar('rasgar_inicio');
  }
  const local = e => {
    const r = rasgo?.rect ?? sobre.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100];
  };
  sobre.addEventListener('pointerdown', e => {
    if (fase !== 'rasgar') return;
    const [x, y] = local(e);
    // Hay que empezar cerca de la línea y de donde se quedó el corte
    if (Math.abs(y - CORTE_Y) > 14 || x > rasgo.objetivo + 18) return;
    rasgo.activo = true;
    try { sobre.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    e.preventDefault();
  });
  sobre.addEventListener('pointermove', e => {
    if (fase !== 'rasgar' || !rasgo?.activo) return;
    const [x] = local(e);
    if (x > rasgo.objetivo) rasgo.objetivo = Math.min(100, x);   // solo avanza: lo pinta el bucle
  });
  const soltar = () => {
    if (!rasgo) return;
    rasgo.activo = false;
    if (fase === 'rasgar' && rasgo.objetivo > 0) pista.textContent = 'Sigue deslizando desde donde lo dejaste';
  };
  sobre.addEventListener('pointerup', soltar);
  sobre.addEventListener('pointercancel', soltar);
  // En el bucle: la ventana descubre la línea (dos transform opuestos) y la chispa sigue la punta
  let ultimoSonido = 0;
  function pintarRasgo() {
    if (fase !== 'rasgar') return;
    rasgo.progreso += (rasgo.objetivo - rasgo.progreso) * 0.5;
    if (rasgo.objetivo - rasgo.progreso < 0.2) rasgo.progreso = rasgo.objetivo;
    const p = rasgo.progreso;
    if (Math.abs(p - rasgo.pintado) < 0.05) return;
    rasgo.pintado = p;
    // Solo transform: ni variables en la raíz ni medidas en cada frame
    rasgo.ventana.style.transform = `translate3d(${(p - 100).toFixed(2)}%, 0, 0)`;
    rasgo.contenido.style.transform = `translate3d(${(100 - p).toFixed(2)}%, 0, 0)`;
    const i = rasgo.puntos.findIndex(([x]) => x >= p);
    const yy = rasgo.puntos[Math.max(0, i)][1];
    const r = rasgo.rect;
    rasgo.punta.style.transform = `translate3d(${(r.width * p / 100).toFixed(1)}px, ${(r.height * yy / 100).toFixed(1)}px, 0)`;
    if (p > 0 && !rasgo.empezado) { rasgo.empezado = true; el.classList.add('rasgando-ya'); }
    if (p - ultimoSonido > 8) { ultimoSonido = p; sonar('rasgando', { progreso: p / 100 }); }
    if (Math.random() < 0.5) chispas(r.left + (r.width * p) / 100, r.top + (r.height * yy) / 100, 2, { fuerza: 4, vida: 26, tam: 4 });
    if (p >= 96) completarRasgado();
  }
  function completarRasgado() {
    fijarFase('explosion');
    sonar('rasgado');
    explotar();
  }

  // ── 4. Explosión ──
  function explotar() {
    sonar('explosion', { rareza: mejor });
    pista.textContent = '';
    const [cx, cy] = centroDe(sobre);
    destello(mejor === 'legendaria' || mejor === 'epica');
    el.classList.add('explota');
    sacudir({ comun: 16, rara: 22, epica: 30, legendaria: 40 }[mejor]);
    if (!quieto) fx.explotar(cx, cy, luz);
    chispas(cx, cy, { comun: 40, rara: 55, epica: 70, legendaria: 80 }[mejor], { fuerza: 14, vida: 70, tam: 8 });
    sobre.classList.add('vuela');
    despues(750, repartir);
  }

  // ── 5. Revelado ──
  const reveladas = new Set();
  let elegida = null, eligiendo = false;
  // Un intento por sobre: si «Elegir» llega dos veces (mala conexión), el servidor da la misma carta
  const intentoEleccion = nuevoIntento();
  // Las cartas se montan (ocultas) antes de empezar: al repartir solo se muestran
  function prepararCartas() {
    if (preparadas) return;
    preparadas = true;
    const cont = $('[data-cartas]');
    const n = o.cartas.length;
    cont.classList.add('en-espera');
    cont.style.setProperty('--n', n);
    cont.classList.toggle('una', n === 1);
    // Cada carta con sus dos caras montadas desde el principio; al tocar solo gira
    cont.innerHTML = o.cartas.map((j, i) => {
      const c = normalizarCarta(j);
      const ang = n === 1 ? 0 : (i - (n - 1) / 2) * 9, dx = n === 1 ? 0 : (i - (n - 1) / 2);
      return `<div class="slr-revela slr-revela--${esc(c.rareza)}" data-revela="${i}" style="--i:${i};--ang:${ang}deg;--dx:${dx};--luz-r:${LUZ[c.rareza]};--giro:${GIRO_MS[c.rareza]}ms">
        <div class="slr-revela__halo" aria-hidden="true"></div>
        <div class="slr-revela__giro">
          <div class="slr-revela__cara slr-revela__cara--dorso">${dorsoHTML(c.rareza, o.dorso)}</div>
          <div class="slr-revela__cara slr-revela__cara--frente">${cartaHTML(c, { tam: 'l', energia: false })}</div>
        </div>
        ${j.nueva ? '<span class="slr-revela__etiquetas"><b class="slr-nueva slr-revela__nueva">¡NUEVA!</b></span>' : ''}
        ${j.descubrimiento ? '<span class="slr-revela__etiquetas slr-revela__etiquetas--abajo"><b class="slr-descubrimiento" data-descubrimiento>¡DESCUBRIMIENTO!</b></span>' : ''}
        ${o.eleccion ? `<button class="slr-btn slr-revela__elegir" type="button" data-elegir="${esc(j.id)}" hidden>Elegir</button>` : ''}
      </div>`;
    }).join('');
    cont.querySelectorAll('[data-revela]').forEach(c => c.addEventListener('click', e => {
      if (e.target.closest('[data-elegir]')) return;
      girar(Number(c.dataset.revela));
    }));
    cont.querySelectorAll('[data-elegir]').forEach(b => b.addEventListener('click', () => elegir(b.dataset.elegir)));
  }
  function repartir() {
    prepararCartas();
    fijarFase('revelado');
    sobre.hidden = true;
    el.classList.remove('explota');
    $('[data-cartas]').classList.remove('en-espera');
    const n = o.cartas.length;
    sonar('reparto', { n });
    pista.textContent = o.eleccion ? 'Toca las cartas para girarlas y elige una' : 'Toca cada carta para girarla';
    if (o.eleccion) ponerCuenta();
    if (quieto || o.directo) o.cartas.forEach((_, i) => girar(i, true));
  }
  function girar(i, ya = false) {
    if (reveladas.has(i)) return;
    reveladas.add(i);
    const c = $(`[data-revela="${i}"]`), rz = o.cartas[i].rareza;
    const grande = rz === 'epica' || rz === 'legendaria';
    sonar('carta_gira', { rareza: rz, i });
    if (ya) c.classList.add('sin-transicion');
    // Épica o legendaria: primero se carga (halo y pulso), después gira
    const retraso = grande && !ya ? 320 : 0;
    if (retraso) c.classList.add('carga');
    despues(retraso, () => {
      c.classList.add('girada');
      despues(ya ? 0 : GIRO_MS[rz] / 2, () => {
        if (ya) return;
        const [x, y] = centroDe(c);
        chispas(x, y, grande ? (rz === 'legendaria' ? 60 : 40) : 12, { color: LUZ[rz], fuerza: grande ? 11 : 6, vida: grande ? 60 : 36 });
        if (grande) { sacudir(rz === 'legendaria' ? 18 : 10); destello(rz === 'legendaria'); }
      });
      despues(ya ? 0 : GIRO_MS[rz], () => {
        c.classList.add('revelada');
        sonar('carta_revelada', { rareza: rz, nueva: !!o.cartas[i].nueva });
        c.querySelector('[data-elegir]')?.removeAttribute('hidden');
        if (reveladas.size === o.cartas.length && !o.eleccion && [...el.querySelectorAll('[data-revela]')].every(x => x.classList.contains('revelada'))) mostrarContinuar();
        if (reveladas.size === o.cartas.length && o.eleccion) pista.textContent = 'Elige tu carta';
      });
    });
  }
  function mostrarContinuar() {
    if (pista.querySelector('[data-continuar]')) return;
    pista.innerHTML = '<button class="slr-btn slr-btn--grande" type="button" data-continuar>Ver resumen</button>';
    pista.querySelector('[data-continuar]').addEventListener('click', resumen);
  }
  function ponerCuenta() {
    if ($('.slr-apertura__cuenta')) return;
    const pinta = () => { const p = $('[data-cuenta-eleccion]'); if (p) p.textContent = faltan(o.eleccion.caduca_en); };
    $('[data-cartas]').insertAdjacentHTML('beforebegin', `<p class="slr-apertura__cuenta">⏱ Te quedan <b data-cuenta-eleccion>${faltan(o.eleccion.caduca_en)}</b> para elegir</p>`);
    relojEleccion = setInterval(pinta, 15000);
  }
  async function elegir(id) {
    if (elegida || eligiendo) return;
    if (!o.vistaPrevia) {
      // Mientras va la petición, ningún «Elegir» responde
      eligiendo = true;
      const botones = [...el.querySelectorAll('[data-elegir]')];
      botones.forEach(b => { b.disabled = true; });
      try {
        const r = await rpc('slr_elegir_carta_sobre', { sobre_id: o.eleccion.sobre_id, carta_id: id, intento: intentoEleccion });
        if (r.automatica) toast('Se había acabado el tiempo: te llevas la primera candidata', 'info');
        id = r.carta.id;
        ctx.datos.sobrePendiente = null;
        await ctx.recargar?.('yo', 'cartas');
      } catch { botones.forEach(b => { b.disabled = false; }); return; } finally { eligiendo = false; }
    }
    elegida = id;
    sonar('elegida', { id });
    el.querySelectorAll('[data-revela]').forEach(c => c.classList.toggle('descartada', o.cartas[Number(c.dataset.revela)].id !== id));
    despues(650, resumen);
  }

  // ── 6. Resumen ──
  function resumen() {
    if (fase === 'resumen') return;
    fijarFase('resumen');
    sonar('resumen');
    fx.vaciar();
    sobre.hidden = true;
    $('[data-cartas]').hidden = true;
    $('.slr-apertura__cuenta')?.remove();
    const lista = o.eleccion ? o.cartas.filter(c => c.id === elegida) : o.cartas;
    const total = lista.reduce((s, c) => s + (c.valor ?? 0), 0);
    const nuevas = lista.filter(c => c.nueva).length;
    const final = $('[data-final]');
    final.hidden = false;
    final.innerHTML = `
      <h2 class="slr-apertura__titulo">${o.eleccion ? 'Tu elección' : `Sobre ${esc(o.nombre)}`}</h2>
      <p class="slr-apertura__sub">${lista.length} ${lista.length === 1 ? 'carta' : 'cartas'}${nuevas ? ` · <b>${nuevas} ${nuevas === 1 ? 'nueva' : 'nuevas'}</b>` : ''} · valor total <b>${miles(total)}</b></p>
      <ul class="slr-apertura__lista" data-resumen-sobre>${lista.map(j => {
        const c = normalizarCarta(j);
        const tengo = j.coleccion ? j.coleccion.tengo + (o.eleccion && j.nueva ? 1 : 0) : 0;
        return `<li>${cartaHTML(c, { tam: 's', energia: false })}
          <span class="slr-apertura__datos">${j.nueva ? '<b class="slr-nueva">¡NUEVA!</b>' : '<small class="slr-suave">Repetida en tu álbum</small>'}
            ${j.descubrimiento ? '<b class="slr-descubrimiento">¡DESCUBRIMIENTO!</b>' : ''}
            <span class="slr-chip-rareza slr-chip-rareza--${esc(c.rareza)}">${esc(RAREZAS[c.rareza])}</span>
            ${j.coleccion ? `<small class="slr-col-${esc(j.coleccion.color ?? '')} slr-apertura__col">◆ ${esc(j.coleccion.nombre)} ${Math.min(tengo, j.coleccion.total)}/${j.coleccion.total}</small>` : ''}
            <small>Valor ${miles(c.valor)}</small></span></li>`;
      }).join('')}</ul>
      <button class="slr-btn slr-btn--grande" type="button" data-cerrar-apertura>${o.vistaPrevia ? 'Cerrar vista previa' : 'Genial'}</button>`;
    final.querySelector('[data-cerrar-apertura]').addEventListener('click', () => cerrarHasta(el));
    pista.textContent = '';
    $('[data-saltar]').hidden = true;
  }

  // «Saltar»: al resumen (o, en la elección, a las candidatas giradas)
  function saltar() {
    fx.vaciar();
    temblor = 0; escena.style.transform = '';
    if (o.eleccion) {
      if (fase !== 'revelado') { sobre.hidden = true; repartir(); }
      o.cartas.forEach((_, i) => girar(i, true));
      $('[data-saltar]').hidden = true;
    } else resumen();
  }

  // Limpieza al cerrar (botón atrás, «Genial» o la ✕ del sistema)
  function limpiar() {
    vivo = false;
    cancelAnimationFrame(frame);
    temporizadores.forEach(clearTimeout);
    clearInterval(relojEleccion);
    if (medir) removeEventListener('resize', medir);
    if (alMover) removeEventListener('pointermove', alMover);
    if (alInclinar) removeEventListener('deviceorientation', alInclinar);
    fx.vaciar();
    sonar('cerrar');
    o.alTerminar?.();
  }
  sonar('aparece', { tipo: o.tipo, rareza: mejor });
  listo = true;
  if (quieto || o.directo) {
    // Revelado directo
    sobre.hidden = true;
    repartir();
  }
  if (saltarAlEmpezar) saltar();
  return el;
}

/* ── Vista previa (admin): fuerza una rareza sin gastar dinero ni cartas ── */
export async function vistaPreviaApertura(ctx, { tipo, rareza, cartas, dorso, coleccion }) {
  const muestra = cartas.map((c, i) => ({ ...c, nueva: i === 0, rareza: i === 0 ? rareza : c.rareza }));
  return crearApertura(ctx, {
    cartas: muestra, tipo: tipo.tipo, nombre: tipo.nombre, imagen: tipo.imagen_url, coleccion, dorso,
    eleccion: tipo.tipo === 'eleccion' ? { sobre_id: null, caduca_en: new Date(Date.now() + 600000).toISOString() } : null,
    vistaPrevia: true,
  });
}
