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
      largo de ella. El corte sigue al dedo en zigzag. Si se suelta antes de
      terminar, se queda a medias y se puede seguir.
   4. Explosión: fogonazo, rayos, partículas (canvas) y temblor fuerte, del color
      de la mejor rareza; las dos piezas del sobre salen despedidas.
   5. Revelado: las cartas boca abajo en abanico, el dorso con el color de su
      rareza; al tocar cada una se gira (épicas y legendarias: más lento, más
      luz y más partículas). «¡NUEVA!» si es nueva en tu álbum.
   6. Resumen: las cartas, cuáles son nuevas, su colección y progreso, y el valor.
   · Sobre de elección: las 3 candidatas se giran y se elige una (con la cuenta
     atrás). Si se cierra, la elección pendiente reaparece en Rush.
   · «Saltar» siempre a la vista: directo al resumen (o a elegir).
   · prefers-reduced-motion: sin temblores ni partículas, revelado directo.
   · Rendimiento: un solo bucle (requestAnimationFrame) para balanceo, temblor y
     partículas; todo se limpia al cerrar.
   · Sonidos: aún no hay; SONIDOS.alSonar(nombre, datos) es el punto de enganche
     (aparece, toque, grieta, rasgar_inicio, rasgando, rasgado, explosion,
     reparto, carta_gira, carta_revelada, elegida, resumen, cerrar).
═══════════════════════════════════════════════ */
import { rpc } from '../api.js';
import { esc, miles, abrirCapa, cerrarHasta, toast, faltan } from '../ui.js';
import { cartaHTML, normalizarCarta, RAREZAS } from '../carta.js';
import { sobreHTML, dorsoHTML, laminar } from '../sobre-arte.js';

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

/* ── Pantalla ───────────────────────────────────────────────────────────── */
// r: respuesta de slr_comprar_sobre (o una vista previa con las mismas claves)
export async function abrirApertura(ctx, r, opts = {}) {
  const cartas = r.cartas ?? r.candidatas ?? [];
  return crearApertura(ctx, {
    cartas, tipo: opts.tipo?.tipo ?? r.tipo, nombre: opts.tipo?.nombre ?? r.nombre ?? '',
    imagen: opts.tipo?.imagen_url ?? null, coleccion: opts.coleccion ?? null, dorso: opts.dorso ?? null,
    eleccion: r.pendiente_eleccion ? { sobre_id: r.sobre_id, caduca_en: r.caduca_en } : null,
    vistaPrevia: !!opts.vistaPrevia, alTerminar: opts.alTerminar,
  });
}

// La elección pendiente (al recargar, desde cualquier pantalla): directa a elegir
export function abrirEleccionPendiente(ctx, pend, opts = {}) {
  return crearApertura(ctx, {
    cartas: pend.candidatas, tipo: 'eleccion', nombre: 'Elección', imagen: null, coleccion: null, dorso: opts.dorso ?? null,
    eleccion: { sobre_id: pend.sobre_id, caduca_en: pend.caduca_en }, directo: true, alTerminar: opts.alTerminar,
  });
}

function crearApertura(ctx, o) {
  const mejor = mejorDe(o.cartas);
  const luz = LUZ[mejor];
  const el = document.createElement('div');
  el.className = `slr-apertura slr-apertura--${mejor}`;
  el.style.setProperty('--luz', luz);
  el.dataset.apertura = '';
  el.innerHTML = `
    <canvas class="slr-apertura__particulas" aria-hidden="true"></canvas>
    <div class="slr-apertura__rayos" aria-hidden="true"></div>
    <div class="slr-apertura__destello" aria-hidden="true"></div>
    <div class="slr-apertura__escena" data-escena>
      <div class="slr-apertura__sobre" data-sobre>
        <div class="slr-apertura__pieza slr-apertura__pieza--abajo" data-pieza="abajo">${sobreHTML(o.tipo, { nombre: o.nombre, imagen_url: o.imagen, coleccion: o.coleccion, cartas: o.cartas.length, tam: 'l' })}</div>
        <div class="slr-apertura__pieza slr-apertura__pieza--arriba" data-pieza="arriba" hidden>${sobreHTML(o.tipo, { nombre: o.nombre, imagen_url: o.imagen, coleccion: o.coleccion, cartas: o.cartas.length, tam: 'l' })}</div>
        <svg class="slr-apertura__grietas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          ${GRIETAS.map((g, i) => `<g data-grietas="${i + 1}">${g.map(d => `<path d="${d}"/>`).join('')}</g>`).join('')}
        </svg>
        <svg class="slr-apertura__corte" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line class="slr-apertura__guia" x1="2" y1="${CORTE_Y}" x2="98" y2="${CORTE_Y}"/>
          <polyline class="slr-apertura__rasgado" data-rasgado points=""/>
        </svg>
        <span class="slr-apertura__mano" aria-hidden="true">👆</span>
      </div>
      <div class="slr-apertura__cartas" data-cartas></div>
      <div class="slr-apertura__final" data-final hidden></div>
    </div>
    <p class="slr-apertura__pista" data-pista>Toca el sobre para cargarlo</p>
    <button class="slr-apertura__saltar" type="button" data-saltar>Saltar ⏭</button>`;

  const $ = s => el.querySelector(s);
  const escena = $('[data-escena]'), sobre = $('[data-sobre]'), pista = $('[data-pista]');
  const canvas = $('canvas'), g2 = canvas.getContext('2d');
  let fase = 'flotando', toques = 0, temblor = 0, t0 = performance.now(), frame = 0, vivo = true;
  let particulas = [];
  const temporizadores = [];
  const despues = (ms, f) => temporizadores.push(setTimeout(() => vivo && f(), ms));
  const quitarLamina = laminar(sobre.querySelector('[data-pieza="abajo"] .slr-sobre'));
  const fijarFase = f => { fase = f; el.dataset.fase = f; };
  fijarFase('flotando');

  // ── Bucle único: balanceo, temblor y partículas ──
  const dpr = Math.min(2, devicePixelRatio || 1);
  const medir = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; };
  medir();
  addEventListener('resize', medir);
  function bucle(ahora) {
    if (!vivo) return;
    const t = (ahora - t0) / 1000;
    if (fase === 'flotando' || fase === 'cargando') {
      sobre.style.transform = `translateY(${Math.sin(t * 1.6) * 7}px) rotate(${Math.sin(t * 1.1) * 2.2}deg)`;
    }
    if (temblor > 0.3) {
      const a = temblor;
      escena.style.transform = `translate(${(Math.random() - 0.5) * 2 * a}px, ${(Math.random() - 0.5) * 2 * a}px) rotate(${(Math.random() - 0.5) * a * 0.08}deg)`;
      temblor *= 0.88;
    } else if (temblor) { temblor = 0; escena.style.transform = ''; }
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, innerWidth, innerHeight);
    if (particulas.length) {
      g2.globalCompositeOperation = 'lighter';
      particulas = particulas.filter(p => {
        p.vida++;
        if (p.vida > p.max) return false;
        p.vx *= 0.985; p.vy = p.vy * 0.985 + p.g; p.x += p.vx; p.y += p.vy;
        const a = 1 - p.vida / p.max;
        g2.globalAlpha = a;
        g2.fillStyle = p.color;
        g2.beginPath(); g2.arc(p.x, p.y, p.tam * (0.5 + a * 0.5), 0, Math.PI * 2); g2.fill();
        return true;
      });
      g2.globalAlpha = 1;
    }
    frame = requestAnimationFrame(bucle);
  }
  frame = requestAnimationFrame(bucle);

  function chispas(x, y, n, { color = luz, fuerza = 9, g = 0.12, tam = 3, vida = 60 } = {}) {
    if (reducido()) return;
    n = Math.min(n, 420 - particulas.length);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, v = fuerza * (0.25 + Math.random() * 0.75);
      particulas.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - fuerza * 0.15, g, vida: 0,
        max: vida * (0.6 + Math.random() * 0.6), tam: tam * (0.5 + Math.random()), color: Math.random() < 0.25 ? '#ffffff' : color });
    }
  }
  const centroDe = n => { const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const sacudir = a => { if (!reducido()) temblor = Math.max(temblor, a); };
  const destello = (fuerte = false) => {
    const d = $('.slr-apertura__destello');
    d.classList.remove('ya', 'fuerte'); void d.offsetWidth; d.classList.add('ya'); if (fuerte) d.classList.add('fuerte');
  };

  // ── 2. Cargar ──
  function tocar() {
    if (fase !== 'flotando' && fase !== 'cargando') return;
    fijarFase('cargando');
    toques++;
    sonar('toque', { n: toques, rareza: mejor });
    el.style.setProperty('--carga', toques);
    el.querySelectorAll(`[data-grietas="${toques}"]`).forEach(gr => gr.classList.add('visible'));
    sonar('grieta', { n: toques });
    const final = toques === 3, legendaria = mejor === 'legendaria';
    sacudir(final ? (legendaria ? 30 : 20) : 6 + toques * 4);
    const [cx, cy] = centroDe(sobre);
    chispas(cx, cy, final ? (legendaria ? 90 : 40) : 12 * toques, { fuerza: final ? 10 : 5, vida: 45 });
    sobre.classList.remove('golpe'); void sobre.offsetWidth; sobre.classList.add('golpe');
    if (final && legendaria) destello(true);
    if (final) {
      pista.textContent = 'Desliza el dedo por la línea para abrirlo';
      despues(legendaria ? 650 : 380, empezarRasgado);
    } else pista.textContent = toques === 1 ? 'Otra vez…' : '¡Una más!';
  }
  sobre.addEventListener('click', tocar);

  // ── 3. Rasgar ──
  let rasgo = null;   // { puntos: [[x,y]…], progreso, activo, r }
  function empezarRasgado() {
    fijarFase('rasgar');
    sobre.style.transform = '';
    rasgo = { puntos: [[0, CORTE_Y]], progreso: 0, activo: false, ultimoSonido: 0 };
    sonar('rasgar_inicio');
  }
  const local = e => {
    const r = sobre.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100, r];
  };
  sobre.addEventListener('pointerdown', e => {
    if (fase !== 'rasgar') return;
    const [x, y] = local(e);
    // Hay que empezar cerca de la línea y de donde se quedó el corte
    if (Math.abs(y - CORTE_Y) > 14 || x > rasgo.progreso + 18) return;
    rasgo.activo = true;
    try { sobre.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    e.preventDefault();
  });
  sobre.addEventListener('pointermove', e => {
    if (fase !== 'rasgar' || !rasgo?.activo) return;
    const [x, y, r] = local(e);
    if (x <= rasgo.progreso + 1.2) return;
    // El corte sigue al dedo (dentro de una franja) con dientes de zigzag
    const yy = Math.max(CORTE_Y - 6, Math.min(CORTE_Y + 6, y));
    const n = rasgo.puntos.length;
    const diente = n % 2 ? 1.6 : -1.6;
    rasgo.puntos.push([Math.min(100, x), yy + diente]);
    rasgo.progreso = Math.min(100, x);
    $('[data-rasgado]').setAttribute('points', rasgo.puntos.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' '));
    el.style.setProperty('--rasgado', (rasgo.progreso / 100).toFixed(3));
    el.classList.add('rasgando-ya');
    chispas(r.left + (x / 100) * r.width, r.top + (yy / 100) * r.height, 3, { fuerza: 4, vida: 30, tam: 2 });
    if (rasgo.progreso - rasgo.ultimoSonido > 8) { rasgo.ultimoSonido = rasgo.progreso; sonar('rasgando', { progreso: rasgo.progreso / 100 }); }
    if (rasgo.progreso >= 96) completarRasgado();
  });
  const soltar = () => { if (rasgo) rasgo.activo = false; if (fase === 'rasgar' && rasgo?.progreso > 0) pista.textContent = 'Sigue deslizando desde donde lo dejaste'; };
  sobre.addEventListener('pointerup', soltar);
  sobre.addEventListener('pointercancel', soltar);

  function completarRasgado() {
    fijarFase('explosion');
    const ult = rasgo.puntos[rasgo.puntos.length - 1];
    rasgo.puntos.push([100, ult[1]]);
    const pts = rasgo.puntos.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`);
    const arriba = $('[data-pieza="arriba"]'), abajo = $('[data-pieza="abajo"]');
    arriba.hidden = false;
    arriba.style.clipPath = `polygon(0 0, 100% 0, ${[...pts].reverse().join(', ')})`;
    abajo.style.clipPath = `polygon(${pts.join(', ')}, 100% 100%, 0 100%)`;
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
    chispas(cx, cy, { comun: 90, rara: 130, epica: 190, legendaria: 280 }[mejor], { fuerza: 14, vida: 80, tam: 3.5 });
    sobre.classList.add('vuela');
    despues(750, repartir);
  }

  // ── 5. Revelado ──
  const reveladas = new Set();
  let elegida = null;
  function repartir() {
    fijarFase('revelado');
    sobre.hidden = true;
    el.classList.remove('explota');
    const cont = $('[data-cartas]');
    const n = o.cartas.length;
    cont.style.setProperty('--n', n);
    cont.classList.toggle('una', n === 1);
    cont.innerHTML = o.cartas.map((j, i) => {
      const c = normalizarCarta(j);
      const ang = n === 1 ? 0 : (i - (n - 1) / 2) * 9, dx = n === 1 ? 0 : (i - (n - 1) / 2);
      return `<div class="slr-revela slr-revela--${esc(c.rareza)}" data-revela="${i}" style="--i:${i};--ang:${ang}deg;--dx:${dx};--luz-r:${LUZ[c.rareza]};--giro:${GIRO_MS[c.rareza]}ms">
        <div class="slr-revela__giro">
          <div class="slr-revela__cara slr-revela__cara--dorso">${dorsoHTML(c.rareza, o.dorso)}</div>
          <div class="slr-revela__cara slr-revela__cara--frente">${cartaHTML(c, { tam: 'l', energia: false })}</div>
        </div>
        ${j.nueva ? '<b class="slr-nueva slr-revela__nueva">¡NUEVA!</b>' : ''}
        ${o.eleccion ? `<button class="slr-btn slr-revela__elegir" type="button" data-elegir="${esc(j.id)}" hidden>Elegir</button>` : ''}
      </div>`;
    }).join('');
    sonar('reparto', { n });
    pista.textContent = o.eleccion ? 'Toca las cartas para girarlas y elige una' : 'Toca cada carta para girarla';
    if (o.eleccion) ponerCuenta();
    cont.querySelectorAll('[data-revela]').forEach(c => c.addEventListener('click', e => {
      if (e.target.closest('[data-elegir]')) return;
      girar(Number(c.dataset.revela));
    }));
    cont.querySelectorAll('[data-elegir]').forEach(b => b.addEventListener('click', () => elegir(b.dataset.elegir, b)));
    if (reducido() || o.directo) o.cartas.forEach((_, i) => girar(i, true));
  }
  function girar(i, ya = false) {
    if (reveladas.has(i)) return;
    reveladas.add(i);
    const c = $(`[data-revela="${i}"]`), rz = o.cartas[i].rareza;
    const grande = rz === 'epica' || rz === 'legendaria';
    sonar('carta_gira', { rareza: rz, i });
    if (ya) c.classList.add('sin-transicion');
    if (grande && !ya) c.classList.add('carga');
    c.classList.add('girada');
    despues(ya ? 0 : GIRO_MS[rz] / 2, () => {
      if (!ya) {
        const [x, y] = centroDe(c);
        chispas(x, y, grande ? (rz === 'legendaria' ? 160 : 100) : 24, { color: LUZ[rz], fuerza: grande ? 11 : 6, vida: grande ? 70 : 40 });
        if (grande) { sacudir(rz === 'legendaria' ? 18 : 10); destello(rz === 'legendaria'); }
      }
    });
    despues(ya ? 0 : GIRO_MS[rz], () => {
      c.classList.add('revelada');
      sonar('carta_revelada', { rareza: rz, nueva: !!o.cartas[i].nueva });
      c.querySelector('[data-elegir]')?.removeAttribute('hidden');
      if (reveladas.size === o.cartas.length && !o.eleccion) mostrarContinuar();
      if (reveladas.size === o.cartas.length && o.eleccion) pista.textContent = 'Elige tu carta';
    });
  }
  function mostrarContinuar() {
    pista.innerHTML = '<button class="slr-btn slr-btn--grande" type="button" data-continuar>Ver resumen</button>';
    pista.querySelector('[data-continuar]').addEventListener('click', resumen);
  }
  let relojEleccion = null;
  function ponerCuenta() {
    const pinta = () => { const p = $('[data-cuenta-eleccion]'); if (p) p.textContent = faltan(o.eleccion.caduca_en); };
    $('[data-cartas]').insertAdjacentHTML('beforebegin', `<p class="slr-apertura__cuenta">⏱ Te quedan <b data-cuenta-eleccion>${faltan(o.eleccion.caduca_en)}</b> para elegir</p>`);
    relojEleccion = setInterval(pinta, 15000);
  }
  async function elegir(id, boton) {
    if (elegida) return;
    if (!o.vistaPrevia) {
      boton.disabled = true;
      try {
        const r = await rpc('slr_elegir_carta_sobre', { sobre_id: o.eleccion.sobre_id, carta_id: id });
        if (r.automatica) toast('Se había acabado el tiempo: te llevas la primera candidata', 'info');
        id = r.carta.id;
        ctx.datos.sobrePendiente = null;
        await ctx.recargar?.('yo', 'cartas');
      } catch { boton.disabled = false; return; }
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
    particulas = [];
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
  $('[data-saltar]').addEventListener('click', () => {
    particulas = [];
    temblor = 0; escena.style.transform = '';
    if (o.eleccion) {
      if (fase !== 'revelado') { sobre.hidden = true; repartir(); }
      o.cartas.forEach((_, i) => girar(i, true));
      $('[data-saltar]').hidden = true;
    } else resumen();
  });

  // Limpieza al cerrar (botón atrás, «Genial» o la ✕ del sistema)
  function limpiar() {
    vivo = false;
    cancelAnimationFrame(frame);
    temporizadores.forEach(clearTimeout);
    clearInterval(relojEleccion);
    removeEventListener('resize', medir);
    quitarLamina();
    particulas = [];
    sonar('cerrar');
    o.alTerminar?.();
  }
  abrirCapa(el, limpiar);
  sonar('aparece', { tipo: o.tipo, rareza: mejor });
  if (reducido() || o.directo) {
    // Revelado directo
    sobre.hidden = true;
    repartir();
  }
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
