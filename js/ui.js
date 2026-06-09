/* ═══════════════════════════════════════════════
   SHITS LEAGUE — ui.js
   Funciones de render puras.
═══════════════════════════════════════════════ */

/* ── Helpers ──────────────────────────────────────────────────────────────── */
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

function ytEmbed(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0` : null;
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
function renderHeroSection(jugadores, jornadas) {
  const ligas      = jornadas.filter(j => !j.amistoso);
  const totalGoles = jornadas.reduce((s,j) => s + j.goles_local + j.goles_visitante, 0);
  const lastMatch  = [...ligas].sort((a,b) => b.numero - a.numero)[0] || jornadas[0];

  return `
    <div class="hero__left">
      <div class="hero__eyebrow">La liga que nunca debió existir —</div>
      <h1 class="hero__title">
        <span class="hero__title-shits">SHITS</span>
        <span class="hero__title-league">LEAGUE</span>
      </h1>
      <p class="hero__desc">Es una mierda! Es la mayor mierda que he visto en toda mi vida.</p>
      <div class="hero__counters">
        <div class="hero__counter">
          <span class="hero__counter-num">${ligas.length}</span>
          <span class="hero__counter-lbl">JORNADAS</span>
        </div>
        <div class="hero__counter">
          <span class="hero__counter-num">${jugadores.length}</span>
          <span class="hero__counter-lbl">JUGADORES</span>
        </div>
        <div class="hero__counter">
          <span class="hero__counter-num">${totalGoles}</span>
          <span class="hero__counter-lbl">GOLES</span>
        </div>
      </div>
    </div>
    ${renderLastMatch(lastMatch)}
  `;
}

function renderLastMatch(j) {
  if (!j) return `
    <div class="last-match">
      <div class="last-match__glow"></div>
      <p style="text-align:center;color:#6E9D81;padding:2rem;font-family:'Cormorant Garamond',serif;font-style:italic;">Sin partidos todavía</p>
    </div>`;

  const gl = j.goles_local, gv = j.goles_visitante;
  const lw = gl > gv, vw = gv > gl;

  const lgClass  = lw ? 'last-match__goal--winner' : vw ? 'last-match__goal--loser' : 'last-match__goal--draw';
  const vgClass  = vw ? 'last-match__goal--winner' : lw ? 'last-match__goal--loser' : 'last-match__goal--draw';
  const ltClass  = vw ? 'last-match__team--loser' : 'last-match__team--winner';
  const vtClass  = lw ? 'last-match__team--loser' : 'last-match__team--winner';
  const tag      = j.amistoso ? 'AMISTOSO · FINAL' : `JORNADA ${j.numero} · FINAL`;

  return `
    <div class="last-match">
      <div class="last-match__glow"></div>
      <div class="last-match__header">
        <span class="last-match__tag">${tag}</span>
        <span class="last-match__date">${fmtFechaLarga(j.fecha).toUpperCase()}</span>
      </div>
      <div class="last-match__score-grid">
        <div class="last-match__team ${ltClass}">
          <span class="last-match__team-icon">💩</span>
          <span class="last-match__team-name">${j.local} <span class="cap">C</span></span>
        </div>
        <div class="last-match__goals">
          <span class="last-match__goal ${lgClass}">${gl}</span>
          <span class="last-match__sep">—</span>
          <span class="last-match__goal ${vgClass}">${gv}</span>
        </div>
        <div class="last-match__team ${vtClass}">
          <span class="last-match__team-icon">🤝</span>
          <span class="last-match__team-name">${j.visitante} <span class="cap">C</span></span>
        </div>
      </div>
      ${j.mensaje ? `<div class="last-match__msg">${fmtMsg(j.mensaje)}</div>` : ''}
    </div>
  `;
}

/* ═══════════════════════════════════════════════
   RESUMEN TAB
═══════════════════════════════════════════════ */
function renderResumen(jugadores, jornadas) {
  const ligas     = jornadas.filter(j => !j.amistoso).sort((a,b) => b.numero - a.numero);
  const amistosos = jornadas.filter(j =>  j.amistoso).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

  const totalGoles = jornadas.reduce((s,j) => s + j.goles_local + j.goles_visitante, 0);
  const goleador   = [...jugadores].sort((a,b) => b.stats.goles - a.stats.goles)[0];
  const asistente  = [...jugadores].sort((a,b) => b.stats.asistencias - a.stats.asistencias)[0];
  const mvpTop     = [...jugadores].sort((a,b) => b.stats.mvp - a.stats.mvp)[0];
  const lastLiga   = ligas[0];

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
      <div class="stat-tile__value" style="font-size:26px;line-height:1.1">${mvpTop ? mvpTop.nombre.slice(0,3).toUpperCase() : '—'}</div>
      <div class="stat-tile__note">${mvpTop ? mvpTop.nombre + (lastLiga ? ' · J' + lastLiga.numero : '') : ''}</div>
    </div>
  `;

  const ligasHtml = ligas.length
    ? ligas.map(j => resultRow(j)).join('')
    : '<div class="empty">Aún no se han jugado jornadas de liga</div>';

  const amiHtml = amistosos.length
    ? amistosos.map(j => resultRow(j)).join('')
    : '';

  return `
    <div class="stat-tiles">${tiles}</div>

    <div class="sh">
      <span class="sh__title">RESULTADOS</span>
      <span class="sh__line"></span>
      <span class="sh__sub">2025 / 2026</span>
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
    <article class="result-row" data-jornada="${j.numero ?? 'ami'}" data-fecha="${j.fecha}" role="button" tabindex="0">
      <div class="result-row__meta">
        ${jLabel}
        <span class="result-row__date">${fmtFechaCorta(j.fecha)}</span>
      </div>
      <span class="result-row__local ${lc}">${j.local}</span>
      <div class="result-row__pill">
        <span style="${pillCss[sc_l]}">${gl}</span>
        <span class="sep">:</span>
        <span style="${pillCss[sc_v]}">${gv}</span>
      </div>
      <span class="result-row__visitante ${vc}">${j.visitante}</span>
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
          <span style="margin-left:auto;font-size:10px;color:#6E9D81;font-weight:600">${j.stats.pj} PJ · ${j.stats.goles} G · ${j.stats.asistencias} A</span>
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
      <span class="sh__sub">TEMPORADA 25/26</span>
    </div>
    <div class="ranking-list">${rows}</div>
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
    <div class="ranking-list">${rows || '<div class="empty">Sin datos todavía</div>'}</div>
  `;
}

/* ═══════════════════════════════════════════════
   PLANTILLA TAB
═══════════════════════════════════════════════ */
function renderPlantilla(jugadores) {
  const cards = jugadores.map(j => `
    <div class="card-wrap" data-nombre="${j.nombre}" role="button" tabindex="0" aria-label="Ver ficha de ${j.nombre}">
      <img src="${j.img}" alt="${j.nombre}" loading="lazy"
        onerror="this.style.opacity='0.25'">
    </div>
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
      ? `<a class="modal__video-link" href="${j.video_url}" target="_blank" rel="noopener">▶ Ver resumen en YouTube</a>`
      : '';

  const imgHtml = j.imagen
    ? `<img class="modal__img" src="${j.imagen}" alt="Foto del partido">`
    : `<div class="modal__img-placeholder">${j.local} vs ${j.visitante}</div>`;

  return `
    ${imgHtml}
    <button class="modal__close" aria-label="Cerrar">✕</button>
    <div class="modal__body">
      <span class="modal__tag">${tag} · ${fmtFechaLarga(j.fecha)}</span>
      <div class="modal__score-block">
        <div class="modal__teams">${j.local} <span style="color:rgba(31,224,101,.3)">·vs·</span> ${j.visitante}</div>
        <div class="modal__score">${j.goles_local} – ${j.goles_visitante}</div>
      </div>
      ${j.mensaje ? `<div class="modal__msg">${fmtMsg(j.mensaje)}</div>` : ''}
      ${videoHtml}
    </div>
  `;
}

function buildModalJugador(j) {
  return `
    <button class="modal__close" aria-label="Cerrar">✕</button>
    <div class="player-modal__img-wrap">
      <img src="${j.img}" alt="${j.nombre}" onerror="this.style.opacity='.2'">
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
        <div class="player-modal__stat"><div class="player-modal__stat-val">${j.stats.goles}</div><div class="player-modal__stat-lbl">Goles</div></div>
        <div class="player-modal__stat"><div class="player-modal__stat-val">${j.stats.asistencias}</div><div class="player-modal__stat-lbl">Asistencias</div></div>
        <div class="player-modal__stat"><div class="player-modal__stat-val">${j.stats.mvp}</div><div class="player-modal__stat-lbl">MVPs</div></div>
        <div class="player-modal__stat"><div class="player-modal__stat-val">${j.stats.pts}</div><div class="player-modal__stat-lbl">Puntos</div></div>
      </div>
    </div>
  `;
}
