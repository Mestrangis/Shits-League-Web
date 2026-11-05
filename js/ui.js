/* ═══════════════════════════════════════════════
   SHITS LEAGUE — ui.js
   Funciones de render puras.
═══════════════════════════════════════════════ */

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const SIN_EMPEZAR = AJUSTES_LIGA.textos.sinEmpezar;
const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

function fmtFechaCorta(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MESES[parseInt(m)-1]} ${String(y).slice(2)}`;
}
function fmtFechaLarga(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MESES[parseInt(m)-1]} ${y}`;
}

// **Nombre** → <span class="highlight">Nombre</span>
function fmtMsg(msg) {
  if (!msg) return '';
  return msg.replace(/\*\*(.+?)\*\*/g, '<span class="highlight">$1</span>');
}

/* ── Imágenes de Cloudinary a medida de la pantalla ───────────────────────── */
// Los originales son enormes (cartas PNG de ~2100px, fotos de 1600px). Pedimos
// a Cloudinary la imagen al ancho real en pantalla × devicePixelRatio,
// redondeado al siguiente múltiplo de 100 (pantallas parecidas comparten caché),
// en formato ligero (WebP/AVIF) y calidad automática.
// No usamos w_auto/dpr_auto: dependen de Client Hints, que Safari no envía.
// Los iconos de img/iconos/, con el color del texto o el suyo (ver .icono en main.css).
// Con etiqueta, el lector de pantalla la lee: para cuando el icono es lo único que lo dice.
const icono = (nombre, etiqueta = '') => `<i class="icono icono--${nombre}" ${etiqueta ? `role="img" aria-label="${etiqueta}"` : 'aria-hidden="true"'}></i>`;

function imagenOptimizada(url, anchoCss, extra = '') {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  const w = Math.max(100, Math.ceil(anchoCss * (window.devicePixelRatio || 1) / 100) * 100);
  return url.replace(/(\/image\/upload\/)/, `$1${extra}w_${w},f_auto,q_auto/`);
}

// Las plantillas pintan <img data-cld="url original"> sin src (extra: recorte
// opcional, p. ej. 'c_fill,ar_4:5,'). Una vez en el DOM, ajustarImagenes()
// mide cada una y le pone su src a medida.
function attrsImagen(url, extra = '') {
  return `data-cld="${url}"${extra ? ` data-cld-t="${extra}"` : ''}`;
}

function ajustarImagenes(root) {
  const imgs = [...root.querySelectorAll('img[data-cld]')];
  // Primero se miden todas (una sola maquetación) y luego se escriben los src
  const anchos = imgs.map(img =>
    img.getBoundingClientRect().width || img.parentElement?.getBoundingClientRect().width || 600
  );
  imgs.forEach((img, i) => {
    img.src = imagenOptimizada(img.dataset.cld, anchos[i], img.dataset.cldT || '');
    img.removeAttribute('data-cld');
  });
}

function ytId(url) {
  return (url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)?.[1] ?? null;
}
function ytEmbed(url) {
  const id = ytId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
}

/* ── rankClass ────────────────────────────────────────────────────────────── */
function rankClass(i) {
  if (i === 0) return 'rank--1';
  if (i <= 2)  return 'rank--2';
  return 'rank--n';
}
function rowClass(i) {
  return i === 0 ? 'ranking-row ranking-row--top' : 'ranking-row';
}

/* ═══════════════════════════════════════════════
   HERO SECTION  (global, always rendered)
═══════════════════════════════════════════════ */
function renderHeroSection(jornadas) {
  const ligas      = jornadas.filter(j => !j.amistoso);
  const lastMatch  = [...ligas].sort((a,b) => b.fecha.localeCompare(a.fecha))[0] || jornadas[0];

  return `
    <div class="hero__left">
      <div class="hero__eyebrow">${AJUSTES_LIGA.textos.eslogan}</div>
      <h1 class="hero__title">
        <span class="hero__title-shits">SHITS</span>
        <span class="hero__title-league">LEAGUE</span>
      </h1>
      <p class="hero__desc">${AJUSTES_LIGA.textos.frase}</p>
    </div>
    ${renderLastMatch(lastMatch)}
  `;
}

function renderLastMatch(j) {
  if (!j) return `
    <div class="last-match">
      <div class="last-match__glow"></div>
      <p style="text-align:center;color:#6E9D81;padding:2rem;font-family:'Cormorant Garamond',serif;font-style:italic;">${SIN_EMPEZAR}</p>
    </div>`;

  const gl = j.goles_local, gv = j.goles_visitante;
  const lw = gl > gv, vw = gv > gl;

  const lgClass  = lw ? 'last-match__goal--winner' : vw ? 'last-match__goal--loser' : 'last-match__goal--draw';
  const vgClass  = vw ? 'last-match__goal--winner' : lw ? 'last-match__goal--loser' : 'last-match__goal--draw';
  const ltClass  = vw ? 'last-match__team--loser' : 'last-match__team--winner';
  const vtClass  = lw ? 'last-match__team--loser' : 'last-match__team--winner';
  const tag      = j.amistoso ? 'AMISTOSO · FINAL' : `JORNADA ${j.numero} · FINAL`;

  const mvp = nombreMVP(j);

  return `
    <div class="last-match" data-abrir-partido="${j.amistoso ? 'ami' : 'oficial'}" data-fecha="${j.fecha}" role="button" tabindex="0" aria-label="Ver el detalle del partido">
      <div class="last-match__glow"></div>
      <div class="last-match__header">
        <span class="last-match__tag">${tag}</span>
        <span class="last-match__date">${fmtFechaLarga(j.fecha).toUpperCase()}</span>
      </div>
      <div class="last-match__score-grid">
        <div class="last-match__team ${ltClass}">
          <img class="last-match__team-icon" src="assets/logo-s-green2.png" alt="">
          <span class="last-match__team-name">${j.local}${j.amistoso ? '' : ' <span class="cap">C</span>'}</span>
        </div>
        <div class="last-match__goals">
          <span class="last-match__goal ${lgClass}">${gl}</span>
          <span class="last-match__sep">—</span>
          <span class="last-match__goal ${vgClass}">${gv}</span>
        </div>
        <div class="last-match__team ${vtClass}">
          <img class="last-match__team-icon" src="assets/logo-s-black.png" alt="">
          <span class="last-match__team-name">${j.visitante}${j.amistoso ? '' : ' <span class="cap">C</span>'}</span>
        </div>
      </div>
      ${j.mensaje ? `<div class="last-match__msg">${fmtMsg(j.mensaje)}</div>` : ''}
      ${mvp ? `<button class="last-match__mvp" type="button" data-abrir-mvp="${j.fecha}">${icono('mvp')} MVP: <span>${mvp}</span></button>` : ''}
    </div>
  `;
}

/* ═══════════════════════════════════════════════
   RESUMEN TAB
═══════════════════════════════════════════════ */
function renderResumen(jugadores, jornadas) {
  const ligas     = jornadas.filter(j => !j.amistoso).sort((a,b) => b.fecha.localeCompare(a.fecha));
  const amistosos = jornadas.filter(j =>  j.amistoso).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

  const totalGoles = jornadas.reduce((s,j) => s + j.goles_local + j.goles_visitante, 0);
  const goleador   = [...jugadores].sort((a,b) => b.stats.goles - a.stats.goles)[0];
  const asistente  = [...jugadores].sort((a,b) => b.stats.asistencias - a.stats.asistencias)[0];
  const lastLiga   = ligas[0];
  const lastMvp    = lastLiga ? nombreMVP(lastLiga) : '';

  const tiles = `
    <div class="stat-tile">
      <div class="stat-tile__label">GOLEADOR</div>
      <div class="stat-tile__value">${goleador?.stats.goles ?? '—'}</div>
      <div class="stat-tile__note">${goleador?.nombre ?? ''}</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile__label">MÁX. ASISTENTE</div>
      <div class="stat-tile__value">${asistente?.stats.asistencias ?? '—'}</div>
      <div class="stat-tile__note">${asistente?.nombre ?? ''}</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile__label">GOLES TEMP.</div>
      <div class="stat-tile__value">${totalGoles}</div>
      <div class="stat-tile__note">En ${ligas.length} jornadas</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile__label">MVP DE LA JORNADA</div>
      <div class="stat-tile__value" style="font-size:26px;line-height:1.1">${lastMvp ? lastMvp.slice(0,3).toUpperCase() : '—'}</div>
      <div class="stat-tile__note">${lastMvp ? lastMvp + ' · J' + lastLiga.numero : ''}</div>
    </div>
  `;

  const ligasHtml = ligas.length
    ? ligas.map(j => resultRow(j)).join('')
    : `<div class="empty">${SIN_EMPEZAR}</div>`;

  const amiHtml = amistosos.length
    ? amistosos.map(j => resultRow(j)).join('')
    : '';

  return `
    <div class="stat-tiles">${tiles}</div>

    <div class="sh">
      <span class="sh__title">RESULTADOS</span>
      <span class="sh__line"></span>
      <span class="sh__sub">${temporadaPorId(STATE.season).corta}</span>
    </div>
    <div class="results-list">${ligasHtml}</div>

    ${amistosos.length ? `
      <div class="sh" style="margin-top:2rem">
        <span class="sh__title">AMISTOSOS</span>
        <span class="sh__line"></span>
      </div>
      <div class="results-list">${amiHtml}</div>
    ` : ''}
  `;
}

function resultRow(j) {
  const gl = j.goles_local, gv = j.goles_visitante;
  const lw = gl > gv, vw = gv > gl;
  const lc = lw ? 'rr--winner' : vw ? 'rr--loser' : 'rr--draw';
  const vc = vw ? 'rr--winner' : lw ? 'rr--loser' : 'rr--draw';
  const sc_l = lw ? 'score-w' : vw ? 'score-l' : 'score-d';
  const sc_v = vw ? 'score-w' : lw ? 'score-l' : 'score-d';
  const jLabel = j.amistoso
    ? `<span class="result-row__j result-row__j--ami">AMI</span>`
    : `<span class="result-row__j">J${String(j.numero).padStart(2,'0')}</span>`;
  const pillCss = {
    'score-w': 'color:#fff;font-weight:700',
    'score-l': 'color:#6E9D81',
    'score-d': 'color:#9DC4AD',
  };

  return `
    <article class="result-row" data-jornada="${j.amistoso ? 'ami' : j.numero}" data-fecha="${j.fecha}" role="button" tabindex="0">
      <div class="result-row__meta">
        ${jLabel}
        <span class="result-row__date">${fmtFechaCorta(j.fecha)}</span>
      </div>
      <span class="result-row__local ${lc}">${nombreCanonico(j.local)}</span>
      <div class="result-row__pill">
        <span style="${pillCss[sc_l]}">${gl}</span>
        <span class="sep">:</span>
        <span style="${pillCss[sc_v]}">${gv}</span>
      </div>
      <span class="result-row__visitante ${vc}">${nombreCanonico(j.visitante)}</span>
    </article>
  `;
}

/* ═══════════════════════════════════════════════
   CLASIFICACIÓN TAB
═══════════════════════════════════════════════ */
function renderClasificacion(jugadores) {
  const sorted = [...jugadores].sort((a,b) => b.stats.pts - a.stats.pts || b.stats.goles - a.stats.goles);
  const maxPts = sorted[0]?.stats.pts || 1;

  const rows = sorted.map((j, i) => `
    <div class="${rowClass(i)}">
      <span class="ranking-row__rank ${rankClass(i)}">${i+1}</span>
      <div class="ranking-row__info">
        <div class="ranking-row__nameline">
          <span class="ranking-row__name">${j.nombre}</span>
          <span class="ranking-row__flag">${j.bandera}</span>
          <span class="ranking-row__pos">${j.pos}</span>
          <span style="margin-left:auto;font-size:10px;color:#6E9D81;font-weight:600">${j.stats.pj} PJ · ${j.stats.victorias}V ${j.stats.empates}E ${j.stats.derrotas}D</span>
        </div>
        <div class="ranking-row__bar-bg">
          <div class="ranking-row__bar" style="width:${Math.round((j.stats.pts/maxPts)*100)}%"></div>
        </div>
      </div>
      <div class="ranking-row__count">
        <span class="ranking-row__num">${j.stats.pts}</span>
        <span class="ranking-row__unit">pts</span>
      </div>
    </div>
  `).join('');

  return `
    <div class="sh">
      <span class="sh__title">CLASIFICACIÓN</span>
      <span class="sh__line"></span>
      <span class="sh__sub">${temporadaPorId(STATE.season).etiqueta.toUpperCase()}</span>
    </div>
    <div class="ranking-list">${rows || `<div class="empty">${SIN_EMPEZAR}</div>`}</div>
  `;
}

/* ═══════════════════════════════════════════════
   GOLEADORES / ASISTENTES TAB
═══════════════════════════════════════════════ */
function renderGoleadores(jugadores) {
  return renderRankingTab(
    jugadores, 'goles', 'gol',
    'PICHICHI', 'MÁX. GOLEADORES'
  );
}
function renderAsistentes(jugadores) {
  return renderRankingTab(
    jugadores, 'asistencias', 'asis',
    'ASISTENTES', 'MÁX. ASISTENTES'
  );
}

function renderRankingTab(jugadores, campo, unit, titulo, subtitulo) {
  const sorted = [...jugadores].filter(j => j.stats[campo] > 0).sort((a,b) => b.stats[campo] - a.stats[campo]);
  const max = sorted[0]?.stats[campo] || 1;

  const rows = sorted.map((j, i) => `
    <div class="${rowClass(i)}">
      <span class="ranking-row__rank ${rankClass(i)}">${i+1}</span>
      <div class="ranking-row__info">
        <div class="ranking-row__nameline">
          <span class="ranking-row__name">${j.nombre}</span>
          <span class="ranking-row__flag">${j.bandera}</span>
          <span class="ranking-row__pos">${j.pos}</span>
        </div>
        <div class="ranking-row__bar-bg">
          <div class="ranking-row__bar" style="width:${Math.round((j.stats[campo]/max)*100)}%"></div>
        </div>
      </div>
      <div class="ranking-row__count">
        <span class="ranking-row__num">${j.stats[campo]}</span>
        <span class="ranking-row__unit">${unit}</span>
      </div>
    </div>
  `).join('');

  return `
    <div class="sh">
      <span class="sh__title">${titulo}</span>
      <span class="sh__line"></span>
      <span class="sh__sub">${subtitulo}</span>
    </div>
    <div class="ranking-list">${rows || `<div class="empty">${SIN_EMPEZAR}</div>`}</div>
  `;
}

/* ═══════════════════════════════════════════════
   PLANTILLA TAB
═══════════════════════════════════════════════ */
// Carta vacía (mismo lienzo y márgenes que las cartas reales) que hace de
// skeleton hasta que carga la real; si la real falla, se queda el skeleton.
const CARTA_VACIA       = 'assets/jugadores/carta-vacia.png';
const SKELETONS_DEFAULT = 16; // si Sheets no devuelve jugadores

function renderPlantilla(jugadores) {
  const skeleton = `<img class="card-wrap__skeleton" src="${CARTA_VACIA}" alt="" aria-hidden="true" width="300" height="343">`;

  // Ya se sabe que no hay nadie (y no es que aún no haya llegado)
  if (!jugadores.length && STATE.ultimaCarga) return `
    <div class="sh"><span class="sh__title">PLANTILLA</span><span class="sh__line"></span></div>
    <div class="empty">${SIN_EMPEZAR}</div>`;

  const cards = jugadores.length
    ? jugadores.map(j => `
      <div class="card-wrap card-wrap--cargando" data-nombre="${j.nombre}" role="button" tabindex="0" aria-label="Ver ficha de ${j.nombre}">
        ${skeleton}
        ${j.img ? `<img class="card-wrap__img" ${attrsImagen(j.img)} alt="${j.nombre}" loading="lazy" width="300" height="343">` : ''}
      </div>
    `).join('')
    : Array.from({ length: SKELETONS_DEFAULT }, () => `
      <div class="card-wrap card-wrap--cargando" aria-hidden="true">${skeleton}</div>
    `).join('');

  return `
    <div class="sh">
      <span class="sh__title">PLANTILLA</span>
      <span class="sh__line"></span>
      <span class="sh__sub">${jugadores.length} CARTAS</span>
    </div>
    <p class="card-hint">Toca una carta para ampliarla.</p>
    <div class="cards-grid">${cards}</div>
  `;
}

/* ═══════════════════════════════════════════════
   MODALES
═══════════════════════════════════════════════ */
function buildModalPartido(j) {
  const tag      = j.amistoso ? 'Amistoso' : `Jornada ${j.numero}`;
  const embedUrl = ytEmbed(j.video_url);
  const videoHtml = embedUrl
    ? `<div class="modal__video"><iframe src="${embedUrl}" allowfullscreen loading="lazy"></iframe></div>`
    : j.video_url
      ? `<a class="modal__video-link" href="${j.video_url}" target="_blank" rel="noopener">Ver resumen en YouTube</a>`
      : '';

  const imgHtml = j.imagen
    ? `<img class="modal__img" ${attrsImagen(j.imagen, 'c_fill,ar_16:9,')} alt="Foto del partido">`
    : `<div class="modal__img-placeholder">${nombreCanonico(j.local)} vs ${nombreCanonico(j.visitante)}</div>`;

  return `
    ${imgHtml}
    <div class="modal__body">
      <span class="modal__tag">${tag} · ${fmtFechaLarga(j.fecha)}</span>
      <div class="modal__score-block">
        <div class="modal__teams">${nombreCanonico(j.local)} <span style="color:rgba(31,224,101,.3)">·vs·</span> ${nombreCanonico(j.visitante)}</div>
        <div class="modal__score">${j.goles_local} – ${j.goles_visitante}</div>
      </div>
      ${nombreMVP(j) ? `<button class="modal__mvp" type="button" data-abrir-mvp="${j.fecha}">${icono('mvp')} MVP: <span>${nombreMVP(j)}</span></button>` : ''}
      ${buildGoleadoresAsistentes(j)}
      ${j.mensaje ? `<div class="modal__msg">${fmtMsg(j.mensaje)}</div>` : ''}
      ${videoHtml}
    </div>
  `;
}

function buildGoleadoresAsistentes(j) {
  if (!j.goleadores.length && !j.asistentes.length) return '';

  const list = (arr) => arr
    .map(p => `<span class="modal__stat-item">${nombreCanonico(p.nombre)}${p.cantidad > 1 ? ` <b>x${p.cantidad}</b>` : ''}</span>`)
    .join('');

  return `
    <div class="modal__goles-asis">
      ${j.goleadores.length ? `
        <div class="modal__stat-group">
          <span class="modal__stat-label">${icono('gol')} Goles</span>
          <div class="modal__stat-list">${list(j.goleadores)}</div>
        </div>
      ` : ''}
      ${j.asistentes.length ? `
        <div class="modal__stat-group">
          <span class="modal__stat-label">${icono('asistencia')} Asistencias</span>
          <div class="modal__stat-list">${list(j.asistentes)}</div>
        </div>
      ` : ''}
    </div>
  `;
}

function buildModalJugador(j) {
  return `
    <div class="player-modal__img-wrap">
      <img ${attrsImagen(j.img)} alt="${j.nombre}" onerror="this.style.opacity='.2'">
    </div>
    <div class="player-modal__info">
      <div class="player-modal__name">${j.nombre}</div>
      <div class="player-modal__meta">
        <span class="player-modal__pos">${j.pos}</span>
        <span class="player-modal__rating">${j.media}</span>
        <span>${j.bandera}</span>
      </div>
      <div class="player-modal__stats">
        <div class="player-modal__stat"><div class="player-modal__stat-val">${j.stats.pj}</div><div class="player-modal__stat-lbl">Partidos</div></div>
        <div class="player-modal__stat"><div class="player-modal__stat-val">${j.stats.victorias}</div><div class="player-modal__stat-lbl">Victorias</div></div>
        <div class="player-modal__stat"><div class="player-modal__stat-val">${j.stats.empates}</div><div class="player-modal__stat-lbl">Empates</div></div>
        <div class="player-modal__stat"><div class="player-modal__stat-val">${j.stats.derrotas}</div><div class="player-modal__stat-lbl">Derrotas</div></div>
        <div class="player-modal__stat"><div class="player-modal__stat-val">${j.stats.goles}</div><div class="player-modal__stat-lbl">Goles</div></div>
        <div class="player-modal__stat"><div class="player-modal__stat-val">${j.stats.asistencias}</div><div class="player-modal__stat-lbl">Asistencias</div></div>
        <div class="player-modal__stat"><div class="player-modal__stat-val">${j.stats.mvp}</div><div class="player-modal__stat-lbl">MVPs</div></div>
        <div class="player-modal__stat"><div class="player-modal__stat-val">${j.stats.pts}</div><div class="player-modal__stat-lbl">Puntos</div></div>
      </div>
    </div>
  `;
}
