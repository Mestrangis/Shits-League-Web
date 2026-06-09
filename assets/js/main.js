/* ═══════════════════════════════════════════════
   SHITS LEAGUE — main.js
═══════════════════════════════════════════════ */

// ── Datos de jugadores ──────────────────────────────────────────────────────
// Edita los campos pos, media, bandera con los datos reales.
// El campo 'img' apunta a assets/jugadores/{slug}.png
const JUGADORES = [
  { nombre: 'Jorge',    slug: 'jorge',    pos: 'POR', media: 75, bandera: '🇪🇸' },
  { nombre: 'Junquera', slug: 'junquera', pos: 'DEF', media: 76, bandera: '🇪🇸' },
  { nombre: 'Markis',   slug: 'markis',   pos: 'DEF', media: 77, bandera: '🇪🇸' },
  { nombre: 'Javi',     slug: 'javi',     pos: 'DEF', media: 78, bandera: '🇪🇸' },
  { nombre: 'Nico',     slug: 'nico',     pos: 'MED', media: 80, bandera: '🇪🇸' },
  { nombre: 'David',    slug: 'david',    pos: 'MED', media: 79, bandera: '🇪🇸' },
  { nombre: 'Enzo',     slug: 'enzo',     pos: 'MED', media: 82, bandera: '🇦🇷' },
  { nombre: 'Alberto',  slug: 'alberto',  pos: 'MED', media: 78, bandera: '🇪🇸' },
  { nombre: 'Gonzalo',  slug: 'gonzalo',  pos: 'MED', media: 77, bandera: '🇪🇸' },
  { nombre: 'Matthew',  slug: 'matthew',  pos: 'DEL', media: 81, bandera: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { nombre: 'Nacho',    slug: 'nacho',    pos: 'DEL', media: 83, bandera: '🇪🇸' },
  { nombre: 'Fernando', slug: 'fernando', pos: 'DEL', media: 80, bandera: '🇪🇸' },
  { nombre: 'Puebla',   slug: 'puebla',   pos: 'DEL', media: 79, bandera: '🇪🇸' },
  { nombre: 'Pelayo',   slug: 'pelayo',   pos: 'DEL', media: 78, bandera: '🇪🇸' },
  { nombre: 'Pablín',   slug: 'pablin',   pos: 'DEL', media: 77, bandera: '🇪🇸' },
];

// ── Datos de jornadas ───────────────────────────────────────────────────────
// Añade una entrada por jornada jugada.
// img: ruta al PNG en assets/resultados/ (null = sin imagen todavía)
// yt:  URL del resumen en YouTube (null = sin vídeo todavía)
const JORNADAS = [
  // Ejemplo — sustituye con datos reales o borra si no hay jornadas aún
  {
    num:    1,
    fecha:  '01 Jun 2026',
    score:  '4 - 2',
    desc:   'Equipo A vs Equipo B',
    img:    null,   // 'assets/resultados/jornada01.png'
    yt:     null,   // 'https://youtube.com/...'
  },
  {
    num:    2,
    fecha:  '08 Jun 2026',
    score:  '3 - 3',
    desc:   'Equipo C vs Equipo D',
    img:    null,
    yt:     null,
  },
];

// ── Render: cartas de jugadores ─────────────────────────────────────────────
function renderCards() {
  const grid = document.getElementById('cardsGrid');
  if (!grid) return;

  grid.innerHTML = JUGADORES.map(j => {
    const imgSrc = `assets/jugadores/${j.slug}.png`;
    const initial = j.nombre.charAt(0).toUpperCase();

    return `
      <div class="player-card" title="${j.nombre} · ${j.pos} · ${j.media}">
        <div class="player-card__img-wrap">
          <img
            class="player-card__img"
            src="${imgSrc}"
            alt="Carta de ${j.nombre}"
            loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          >
          <div class="player-card__placeholder" style="display:none;">
            <span class="player-card__placeholder-initial">${initial}</span>
            <span class="player-card__placeholder-pos">${j.pos}</span>
            <span style="font-size:1.4rem;">${j.bandera}</span>
          </div>
        </div>
        <span class="player-card__name">${j.nombre}</span>
      </div>
    `;
  }).join('');
}

// ── Render: jornadas ────────────────────────────────────────────────────────
function renderJornadas() {
  const grid = document.getElementById('jornadasGrid');
  if (!grid) return;

  if (!JORNADAS.length) {
    grid.innerHTML = `
      <p style="color:var(--texto-dim);font-family:var(--fuente-titulo);letter-spacing:.05em;">
        Aún no se han jugado jornadas.
      </p>`;
    return;
  }

  grid.innerHTML = [...JORNADAS].reverse().map(j => {
    const imgHtml = j.img
      ? `<img class="jornada-card__img" src="${j.img}" alt="Resultado jornada ${j.num}" loading="lazy">`
      : `<div class="jornada-card__img-placeholder">JORNADA ${j.num}</div>`;

    const ytBtn = j.yt
      ? `<a href="${j.yt}" target="_blank" rel="noopener" class="btn btn--outline btn--sm">▶ Resumen</a>`
      : '';

    return `
      <article class="jornada-card">
        <div class="jornada-card__img-wrap">${imgHtml}</div>
        <div class="jornada-card__body">
          <div class="jornada-card__header">
            <span class="jornada-card__num">Jornada ${j.num}</span>
            <span class="jornada-card__date">${j.fecha}</span>
          </div>
          <div class="jornada-card__score">${j.score}</div>
          <div class="jornada-card__desc">${j.desc}</div>
          <div class="jornada-card__actions">${ytBtn}</div>
        </div>
      </article>
    `;
  }).join('');
}

// ── Nav: toggle mobile ──────────────────────────────────────────────────────
function initNav() {
  const toggle = document.getElementById('navToggle');
  const links  = document.getElementById('navLinks');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });

  // Cierra el menú al hacer click en un enlace
  links.querySelectorAll('.nav__link').forEach(a => {
    a.addEventListener('click', () => {
      links.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// ── Nav: resaltar sección activa en scroll ──────────────────────────────────
function initScrollSpy() {
  const sections = document.querySelectorAll('section[id], header[id]');
  const navLinks = document.querySelectorAll('.nav__link');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(a => {
          const active = a.getAttribute('href') === `#${entry.target.id}`;
          a.classList.toggle('active', active);
        });
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sections.forEach(s => observer.observe(s));
}

// ── Nav: fondo sólido al hacer scroll ──────────────────────────────────────
function initNavSolid() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.style.borderBottomColor = window.scrollY > 10
      ? 'var(--gris-borde)'
      : 'transparent';
  }, { passive: true });
}

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderCards();
  renderJornadas();
  initNav();
  initScrollSpy();
  initNavSolid();
});
