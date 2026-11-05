/* ═══════════════════════════════════════════════
   SHITS LEAGUE — inicio.js
   La pestaña Inicio, de la temporada que se está viendo: próximo partido, resúmenes
   en vídeo, la temporada en números, líderes, tu temporada y los enlaces. Lo que no
   tiene datos no aparece. Lo que se puede cambiar a mano está en ajustes.js.
═══════════════════════════════════════════════ */

const CARRUSEL_MS = AJUSTES_LIGA.inicio.segundosCarrusel * 1000;
const TUS_PARTIDOS_A_LA_VISTA = AJUSTES_LIGA.inicio.tusPartidosALaVista;
const MQ_CARRUSEL = window.matchMedia('(max-width: 760px)');

let videoElegido = null;    // fecha del partido en el reproductor; null: el último resumen
let videoSonando = false;   // YouTube cargado: solo después de tocar
let tusPartidosTodos = false;
let htmlInicio = null;      // lo último pintado: sin cambios no se repinta (ni se corta el vídeo)
const carrusel = { indice: 0, parado: false, timer: 0, enInicio: false };

// Las imágenes se piden al acercarse a la pantalla, no todas al entrar: el loading="lazy" del
// navegador las pediría casi todas, porque con red lenta adelanta miles de píxeles
const imgDiferida = (url, ancho, atributos) => `<img data-dif="${url}" data-dif-ancho="${ancho}" alt="" decoding="async" ${atributos}>`;
let observadorImagenes = null;
function vigilarImagenes(panel) {
  observadorImagenes?.disconnect();
  observadorImagenes = new IntersectionObserver(entradas => entradas.forEach(e => {
    if (!e.isIntersecting) return;
    const img = e.target;
    img.src = imagenOptimizada(img.dataset.dif, Number(img.dataset.difAncho));
    img.removeAttribute('data-dif');
    observadorImagenes.unobserve(img);
  }), { root: paginaDe('inicio'), rootMargin: '200px 0px' });
  panel.querySelectorAll('img[data-dif]').forEach(img => observadorImagenes.observe(img));
}

const marcador = j => `${j.goles_local}–${j.goles_visitante}`;
const totalGoles = j => j.goles_local + j.goles_visitante;
const etiquetaPartido = j => (j.amistoso ? 'Amistoso' : `Jornada ${j.numero ?? '—'}`);
const partidosJugados = () => partidosOficiales().filter(tieneResultado);
// Los atributos con los que se abre un partido (initBloquesInicio)
const abrirPartido = j => `data-abrir-partido="${j.amistoso ? 'ami' : 'oficial'}" data-fecha="${j.fecha}"`;

function seccionInicio(titulo, cuerpo, clase = '') {
  return `<section class="inicio-block ${clase}">
    <div class="sh"><span class="sh__title">${titulo}</span><span class="sh__line"></span></div>
    ${cuerpo}
  </section>`;
}

/* ── Próximo partido ─────────────────────────────────────────────────────── */
function renderProximoPartido(partidos) {
  const lista = (partidos || []).slice().sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  if (!lista.length) return '';
  const partes = p => {
    const [fecha = '', tiempo = ''] = (p.fecha || '').split('T');
    return { fecha, hora: tiempo.slice(0, 5) };
  };
  const [destacado, ...resto] = lista;
  const { fecha, hora } = partes(destacado);
  return seccionInicio('PRÓXIMO PARTIDO', `
    <div class="proximo-partido">
      <div class="proximo-partido__info">
        <div class="proximo-partido__titulo">${destacado.titulo || 'Próxima jornada'}</div>
        <div class="proximo-partido__fecha">${fmtFechaLarga(fecha)}${hora ? ` · ${hora}` : ''}</div>
        ${destacado.lugar ? `<div class="proximo-partido__lugar">${destacado.lugar}</div>` : ''}
      </div>
      <div class="countdown" id="countdown"></div>
    </div>
    ${resto.length ? `<div class="proximos-list">${resto.map(p => {
      const { fecha: f, hora: h } = partes(p);
      return `<div class="proximos-list__item">
        <span class="proximos-list__titulo">${p.titulo || 'Partido'}</span>
        <span class="proximos-list__fecha">${fmtFechaCorta(f)}${h ? ` · ${h}` : ''}</span>
      </div>`;
    }).join('')}</div>` : ''}`, 'inicio-proximo');
}

/* ── Resúmenes en vídeo ──────────────────────────────────────────────────── */
// Del más nuevo al más viejo. Las miniaturas salen del ID: sin la API de YouTube
function videosDeLaTemporada() {
  return STATE.jornadas
    .map(j => ({ j, id: ytId(j.video_url) }))
    .filter(v => v.id && v.j.fecha)
    .sort((a, b) => b.j.fecha.localeCompare(a.j.fecha));
}
const videoEnReproductor = lista => lista.find(v => v.j.fecha === videoElegido) || lista[0];
const tituloVideo = j => `${etiquetaPartido(j)} · ${marcador(j)}`;

// El triángulo del play es equilátero y su centro está en el del viewBox (50,50): así el centroide
// cae en el centro del círculo, también con las puntas redondeadas por el trazo. Mide el 46 % de alto.
const ICONO_PLAY = '<svg class="boton-play__icono" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="M70.78 50 39.61 32v36z"/></svg>';

// La portada grande, en la mejor calidad que tenga el vídeo. Cuando una no existe, YouTube
// responde con una imagen gris de 120×90: eso cuenta como que falta y se prueba la siguiente.
const CALIDADES_PORTADA = ['maxresdefault', 'sddefault', 'hqdefault'];
const calidadPortada = new Map();   // id → la que ha funcionado: al volver a pintarla, sin repetir la prueba
const urlPortada = (id, calidad) => `https://i.ytimg.com/vi/${id}/${CALIDADES_PORTADA[calidad]}.jpg`;

function revisarPortada(img, fallo) {
  const calidad = Number(img.dataset.calidad);
  if (!fallo && img.naturalWidth > 120) {
    calidadPortada.set(img.dataset.yt, calidad);
    img.classList.add('es-buena');
  } else if (calidad + 1 < CALIDADES_PORTADA.length) {
    img.dataset.calidad = calidad + 1;
    img.src = urlPortada(img.dataset.yt, calidad + 1);
  }
}

function htmlReproductor(v) {
  if (videoSonando) {
    return `<iframe class="vid__marco" src="https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&playsinline=1"
      title="${tituloVideo(v.j)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  }
  const calidad = calidadPortada.get(v.id) ?? 0;
  return `<button class="vid__portada" type="button" data-vid-play aria-label="Reproducir el resumen de ${tituloVideo(v.j)}">
    ${imgDiferida(urlPortada(v.id, calidad), 1280, `data-yt="${v.id}" data-calidad="${calidad}"`)}
    <span class="boton-play boton-play--grande" aria-hidden="true">${ICONO_PLAY}</span>
    <span class="vid__titulo">${tituloVideo(v.j)}<small>${fmtFechaLarga(v.j.fecha)}</small></span>
  </button>`;
}

function renderResumenes() {
  const lista = videosDeLaTemporada();
  if (!lista.length) return '';
  const actual = videoEnReproductor(lista);
  return seccionInicio('RESÚMENES EN VÍDEO', `
    <div class="vid">
      <div class="vid__reproductor" data-vid-reproductor>${htmlReproductor(actual)}</div>
      <div class="vid__lista-caja">
        <div class="vid__lista" data-vid-lista>
          ${lista.map(v => `
            <button class="vid__item${v === actual ? ' es-actual' : ''}" type="button" data-video="${v.j.fecha}">
              ${imgDiferida(`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`, 320, 'width="320" height="180"')}
              <span class="vid__item-texto"><b>${tituloVideo(v.j)}</b><small>${fmtFechaCorta(v.j.fecha)}</small></span>
            </button>`).join('')}
        </div>
      </div>
    </div>
    ${ENLACES_LIGA.youtube ? `<a class="vid__completa" href="${ENLACES_LIGA.youtube}" target="_blank" rel="noopener">Lista completa en YouTube →</a>` : ''}`, 'inicio-videos');
}

function ponerVideo(panel, fecha, { sonar = false } = {}) {
  videoElegido = fecha;
  videoSonando = sonar;
  const lista = videosDeLaTemporada();
  const actual = videoEnReproductor(lista);
  panel.querySelector('[data-vid-reproductor]').innerHTML = htmlReproductor(actual);
  vigilarImagenes(panel);
  panel.querySelectorAll('.vid__item').forEach(b => b.classList.toggle('es-actual', b.dataset.video === actual.j.fecha));
  htmlInicio = renderInicio(STATE.proximosPartidos);   // lo que hay en pantalla: un refresco sin cambios no lo corta
}

/* ── La temporada en números ─────────────────────────────────────────────── */
function numerosDeLaTemporada(jugados) {
  const goles = jugados.reduce((s, j) => s + totalGoles(j), 0);
  const asistencias = jugados.reduce((s, j) => s + j.asistentes.reduce((n, a) => n + a.cantidad, 0), 0);
  // Con empate, el más reciente
  const masGoles = jugados.reduce((m, j) => (!m || totalGoles(j) >= totalGoles(m) ? j : m), null);
  return { goles, asistencias, masGoles, porPartido: goles / jugados.length };
}

function barraTemporada(jugados) {
  const total = temporadaPorId(STATE.season).jornadas;
  const ultima = jugados.length;
  if (!total) {
    return `<div class="num-barra num-barra--indefinida">
      <div class="num-barra__texto"><b>Jornada ${ultima}</b> · total por decidir</div>
      <div class="num-barra__fondo"><i></i></div>
    </div>`;
  }
  const pct = Math.min(100, Math.round(100 * ultima / total));
  return `<div class="num-barra">
    <div class="num-barra__texto"><b>Jornada ${ultima} de ${total}</b><span>${pct} %</span></div>
    <div class="num-barra__fondo" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${Math.min(ultima, total)}"><i style="width:${pct}%"></i></div>
  </div>`;
}

function renderNumeros() {
  const jugados = partidosJugados();
  if (!jugados.length) return '';
  const n = numerosDeLaTemporada(jugados);
  const casilla = (num, lbl) => `<div class="num-casilla"><span class="num-casilla__num">${num}</span><span class="num-casilla__lbl">${lbl}</span></div>`;
  return seccionInicio('LA TEMPORADA EN NÚMEROS', `
    ${barraTemporada(jugados)}
    <div class="num-casillas">
      ${casilla(n.goles, 'Goles')}
      ${casilla(n.porPartido.toFixed(1).replace('.', ','), 'Goles por partido')}
      ${casilla(n.asistencias, 'Asistencias')}
      ${casilla(STATE.jugadoresBase.length, 'Jugadores')}
      <button class="num-casilla num-casilla--partido" type="button" ${abrirPartido(n.masGoles)}>
        <span class="num-casilla__num">${totalGoles(n.masGoles)}</span>
        <span class="num-casilla__lbl">Partido con más goles<small>${etiquetaPartido(n.masGoles)} · ${marcador(n.masGoles)}</small></span>
      </button>
    </div>`, 'inicio-numeros');
}

/* ── Líderes ─────────────────────────────────────────────────────────────── */
// La primera, según la puntuación de la temporada que se está viendo
const lideres = () => [
  puntuacionVista()
    ? { titulo: 'Clasificación', campo: 'pts', unidad: 'pts', tab: 'clasificacion' }
    : { titulo: 'Clasificación', campo: 'victorias', unidad: 'vict.', tab: 'clasificacion' },
  { titulo: 'Goleadores', campo: 'goles', unidad: 'goles', tab: 'goleadores' },
  { titulo: 'Asistentes', campo: 'asistencias', unidad: 'asist.', tab: 'asistentes' },
  { titulo: 'MVP', campo: 'mvp', unidad: 'veces', tab: 'mvp' },
];

// Con el mismo orden que su pestaña. Clasificación: los que han jugado; el resto, los que tienen algo
function topDe({ campo, tab }) {
  if (tab === 'clasificacion') return ordenClasificacion(STATE.jugadores.filter(j => j.stats.pj > 0));
  return STATE.jugadores.filter(j => j.stats[campo] > 0).sort((a, b) => b.stats[campo] - a.stats[campo]);
}

function renderLideres() {
  const tarjetas = lideres().map(l => ({ l, top: topDe(l) })).filter(t => t.top.length);
  if (!tarjetas.length) return '';
  return seccionInicio('LÍDERES', `
    <div class="lideres" data-lideres>
      ${tarjetas.map(({ l, top }) => {
        const lider = top[0];
        return `<article class="lider">
          <div class="lider__titulo">${l.titulo}</div>
          <button class="lider__cabeza" type="button" data-jugador="${lider.nombre}">
            <span class="lider__dato">
              <span class="lider__num">${lider.stats[l.campo]}</span>
              <span class="lider__unidad">${l.unidad}</span>
              <span class="lider__nombre">${lider.nombre}</span>
            </span>
            ${lider.img ? imgDiferida(lider.img, 66, 'class="lider__carta" width="300" height="343"') : ''}
          </button>
          <ol class="lider__top">
            ${top.slice(0, 5).map((j, i) => `
              <li><button type="button" data-jugador="${j.nombre}">
                <span class="lider__pos">${i + 1}</span>
                <span class="lider__quien">${j.nombre}</span>
                <b>${j.stats[l.campo]}</b>
              </button></li>`).join('')}
          </ol>
          <button class="lider__todos" type="button" data-ir="${l.tab}">Ver todos →</button>
        </article>`;
      }).join('')}
    </div>
    <div class="lideres__puntos" aria-hidden="true">${tarjetas.map(() => '<i></i>').join('')}</div>`, 'inicio-lideres');
}

/* ── Tu temporada ────────────────────────────────────────────────────────── */
function misPartidos(yo) {
  const es = n => claveMVP(fichaMVP(n) ?? n) === claveMVP(yo);
  const suma = lista => lista.filter(p => es(p.nombre)).reduce((s, p) => s + p.cantidad, 0);
  return partidosJugados().reverse().flatMap(j => {
    const local = j.jugadores_local.some(es), visitante = j.jugadores_visitante.some(es);
    if (!local && !visitante) return [];
    const [mios, suyos] = local ? [j.goles_local, j.goles_visitante] : [j.goles_visitante, j.goles_local];
    return [{ j, mios, suyos, resultado: mios > suyos ? 'v' : mios < suyos ? 'd' : 'e', goles: suma(j.goleadores), asistencias: suma(j.asistentes), mvp: claveMVP(nombreMVP(j)) === claveMVP(yo) }];
  });
}

function renderTuTemporada() {
  const sesion = getSessionPlayer();
  const yo = sesion && fichaMVP(sesion);
  const ficha = yo && STATE.jugadores.find(j => j.nombre === yo);
  if (!ficha?.stats.pj) return '';
  const partidos = misPartidos(yo);
  if (!partidos.length) return '';
  const s = ficha.stats;
  const posicion = topDe(lideres()[0]).indexOf(ficha) + 1;
  const foto = JUGADORES_FOTOS[sesion] || ficha.img;
  const dato = (num, lbl, nota = '', ico = '') => `<div class="tu-dato"><b>${ico ? icono(ico) : ''}${num}</b><span>${lbl}</span>${nota ? `<small>${nota}</small>` : ''}</div>`;
  const marca = (ico, etiqueta, num = '') => `<span class="tu-marca">${icono(ico, etiqueta)}${num}</span>`;
  const fila = (p, i) => `
    <li class="tu-partido${!tusPartidosTodos && i >= TUS_PARTIDOS_A_LA_VISTA ? ' tu-partido--oculto' : ''}" role="button" tabindex="0" ${abrirPartido(p.j)}>
      <span class="tu-partido__cuando"><b>${etiquetaPartido(p.j)}</b><small>${fmtFechaCorta(p.j.fecha)}</small></span>
      <span class="tu-partido__res tu-partido__res--${p.resultado}">${p.mios}–${p.suyos}</span>
      <span class="tu-partido__tuyo">${p.goles ? marca('gol', 'Goles', p.goles) : ''}${p.asistencias ? marca('asistencia', 'Asistencias', p.asistencias) : ''}${p.mvp ? marca('mvp', 'MVP') : ''}</span>
      ${ytId(p.j.video_url) ? `<button class="tu-partido__video boton-play" type="button" data-video-sonar="${p.j.fecha}" aria-label="Ver el resumen de ${etiquetaPartido(p.j)}">${ICONO_PLAY}</button>` : ''}
    </li>`;
  return seccionInicio('TU TEMPORADA', `
    <div class="tu-bloque">
      <div class="tu-cabeza">
        ${foto ? imgDiferida(foto, 52, 'class="tu-foto"') : `<span class="tu-foto tu-foto--vacia" aria-hidden="true">${yo[0].toUpperCase()}</span>`}
        <div class="tu-quien"><b>${yo}</b><span>${posicion}.º en la clasificación</span></div>
      </div>
      <div class="tu-datos">
        ${puntuacionVista() ? dato(s.pts, 'Puntos') : ''}
        ${dato(s.pj, 'Partidos', `${s.victorias}V ${s.empates}E ${s.derrotas}D`)}
        ${dato(s.goles, 'Goles', '', 'gol')}
        ${dato(s.asistencias, 'Asistencias', '', 'asistencia')}
        ${dato(s.mvp, 'MVP', '', 'mvp')}
      </div>
    </div>
    <h3 class="tu-subtitulo">Tus partidos</h3>
    <ol class="tu-partidos">${partidos.map(fila).join('')}</ol>
    ${!tusPartidosTodos && partidos.length > TUS_PARTIDOS_A_LA_VISTA ? `<button class="tu-todos" type="button" data-tus-partidos>Ver todos (${partidos.length}) →</button>` : ''}`, 'inicio-tuya');
}

/* ── Extras ──────────────────────────────────────────────────────────────── */
function renderExtras() {
  const { spotify, acta, reglamento } = ENLACES_LIGA;
  const enlace = (url, texto) => (url ? `<a class="extra" href="${url}" target="_blank" rel="noopener">${texto}</a>` : '');
  return `<nav class="extras" aria-label="Enlaces de la liga">
    ${enlace(spotify, 'Playlist en Spotify')}${enlace(acta, 'Acta')}${enlace(reglamento, 'Reglamento')}
  </nav>`;
}

function renderInicio(proximos) {
  return [renderProximoPartido(proximos), renderResumenes(), renderNumeros(), renderLideres(), renderTuTemporada(), renderExtras()].join('');
}

/* ── Carrusel de líderes (móvil) ─────────────────────────────────────────── */
const pistaLideres = () => document.querySelector('#panel-inicio [data-lideres]');

function pintarPuntos() {
  document.querySelectorAll('#panel-inicio .lideres__puntos i').forEach((p, i) => p.classList.toggle('es-actual', i === carrusel.indice));
}

function irATarjeta(indice, suave) {
  const pista = pistaLideres();
  if (!pista?.children.length) return;
  carrusel.indice = indice % pista.children.length;
  pista.scrollTo({ left: carrusel.indice * pista.clientWidth, behavior: suave ? 'smooth' : 'instant' });
  pintarPuntos();
}

function pasoDelCarrusel() {
  const pista = pistaLideres();
  if (!pista || carrusel.parado || !carrusel.enInicio || document.hidden || !MQ_CARRUSEL.matches) return;
  // Fuera de la pantalla no hace falta moverlo
  const r = pista.getBoundingClientRect();
  if (r.bottom <= 0 || r.top >= innerHeight) return;
  irATarjeta(carrusel.indice + 1, true);
}

// Cada vez que se entra en Inicio: una tarjeta al azar y otra vez en marcha
function entrarEnInicio() {
  carrusel.enInicio = true;
  carrusel.parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const n = pistaLideres()?.children.length ?? 0;
  if (n) irATarjeta(Math.floor(Math.random() * n), false);
  clearInterval(carrusel.timer);
  carrusel.timer = setInterval(pasoDelCarrusel, CARRUSEL_MS);
}

// Al salir de Inicio: el carrusel quieto y el vídeo, que no siga sonando
function salirDeInicio() {
  carrusel.enInicio = false;
  clearInterval(carrusel.timer);
  if (videoSonando) {
    videoSonando = false;
    const panel = document.getElementById('panel-inicio');
    if (panel.querySelector('[data-vid-reproductor]')) ponerVideo(panel, videoElegido);
  }
}

function bindInicio(panel) {
  // load y error no burbujean: en captura se oyen desde el panel, aunque la imagen se repinte
  ['load', 'error'].forEach(t => panel.addEventListener(t, e => {
    if (e.target.matches?.('img[data-yt]')) revisarPortada(e.target, t === 'error');
  }, true));
  panel.addEventListener('click', e => {
    const jugador = e.target.closest('[data-jugador]');
    if (jugador) { openModalJugador(jugador.dataset.jugador); return; }
    if (e.target.closest('[data-vid-play]')) { ponerVideo(panel, videoElegido, { sonar: true }); return; }
    const item = e.target.closest('[data-video]');
    if (item) { ponerVideo(panel, item.dataset.video); return; }
    const sonar = e.target.closest('[data-video-sonar]');
    if (sonar) {
      // No abre el partido, que es lo que hace el resto de la fila
      e.stopPropagation();
      ponerVideo(panel, sonar.dataset.videoSonar, { sonar: true });
      panel.querySelector('.inicio-videos').scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (e.target.closest('[data-tus-partidos]')) {
      tusPartidosTodos = true;
      panel.querySelectorAll('.tu-partido--oculto').forEach(f => f.classList.remove('tu-partido--oculto'));
      e.target.closest('[data-tus-partidos]').remove();
      htmlInicio = renderInicio(STATE.proximosPartidos);
    }
  });
  // Con el dedo, :active no es fiable: la fila tocada lleva clase. Al desplazarse llega pointercancel y se quita
  panel.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') e.target.closest?.('.tu-partido')?.classList.add('es-tocada');
  }, { passive: true, capture: true });
  ['pointerup', 'pointercancel'].forEach(t => panel.addEventListener(t, () => {
    panel.querySelector('.es-tocada')?.classList.remove('es-tocada');
  }, { passive: true, capture: true }));
  // En cuanto se toca, deja de moverse solo. Capture: el scroll no burbujea y la pista se repinta
  const parar = e => { if (e.target.closest?.('[data-lideres]')) carrusel.parado = true; };
  ['pointerdown', 'touchstart', 'wheel'].forEach(t => panel.addEventListener(t, parar, { passive: true, capture: true }));
  let marco = 0;
  panel.addEventListener('scroll', e => {
    if (!e.target.matches?.('[data-lideres]') || marco) return;
    marco = requestAnimationFrame(() => {
      marco = 0;
      const pista = pistaLideres();
      if (!pista?.clientWidth) return;
      carrusel.indice = Math.round(pista.scrollLeft / pista.clientWidth);
      pintarPuntos();
    });
  }, { passive: true, capture: true });
}

// Después de pintar: el reloj del próximo partido y el carrusel donde estaba
function prepararInicio(panel) {
  startCountdown(STATE.proximosPartidos[0]?.fecha);
  vigilarImagenes(panel);
  if (!panel.dataset.bound) {
    bindInicio(panel);
    panel.dataset.bound = '1';
  }
  irATarjeta(carrusel.indice, false);
}
