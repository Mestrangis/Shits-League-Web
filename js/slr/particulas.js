/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — partículas en un solo canvas
   Lo comparten la apertura de sobres y la reproducción de partidos:
   · sprite(color): un punto con halo, dibujado una vez por color (sin shadowBlur)
   · rayosDe(color): los rayos de una explosión, dibujados una vez por color
   · Particulas: chispas, fuego (chispas que suben) y rayos, pintados en un
     canvas que ocupa la pantalla. Calidad adaptativa por niveles (0 el mejor):
     menos partículas y sin rayos.
   El azar es el que se le pase (rng); por defecto, Math.random.
═══════════════════════════════════════════════ */

// Tope de partículas por nivel de calidad (el 0 es el mejor)
export const MAX_PARTICULAS = [80, 45, 20];

const sprites = new Map();
export function sprite(color) {
  if (sprites.has(color)) return sprites.get(color);
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.25, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  sprites.set(color, c);
  return c;
}

const rayos = new Map();
export function rayosDe(color) {
  if (rayos.has(color)) return rayos.get(color);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.translate(256, 256);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 256);
  gr.addColorStop(0, color);
  gr.addColorStop(0.55, color + '66');
  gr.addColorStop(1, color + '00');
  g.fillStyle = gr;
  for (let k = 0; k < 16; k++) {
    g.rotate((Math.PI * 2) / 16);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(256, -22); g.lineTo(256, 22); g.closePath(); g.fill();
  }
  rayos.set(color, c);
  return c;
}

export class Particulas {
  constructor({ rng = Math.random } = {}) {
    this.lista = [];
    this.explosion = null;   // { t, x, y, color }
    this.nivel = 0;
    this.rng = rng;
    this.sucio = false;
  }

  get activas() { return this.lista.length > 0 || !!this.explosion; }

  // n chispas desde (x, y). g > 0 caen; g < 0 suben (fuego). dir: ángulo en radianes y abertura (cono)
  chispas(x, y, n, { color = '#ffffff', fuerza = 9, g = 0.12, tam = 6, vida = 55, blancas = 0.2, dir = null, abertura = Math.PI * 2 } = {}) {
    n = Math.min(Math.round(n * [1, 0.55, 0.25][this.nivel]), MAX_PARTICULAS[this.nivel] - this.lista.length);
    const im = sprite(color), blanco = sprite('#ffffff'), r = this.rng;
    for (let i = 0; i < n; i++) {
      const ang = dir == null ? r() * Math.PI * 2 : dir + (r() - 0.5) * abertura;
      const v = fuerza * (0.25 + r() * 0.75);
      this.lista.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - (dir == null ? fuerza * 0.15 : 0), g, vida: 0,
        max: vida * (0.6 + r() * 0.6), tam: tam * (0.6 + r() * 0.8), im: r() < blancas ? blanco : im });
    }
  }

  // Llamarada: chispas grandes que suben, del color dado con el centro amarillo
  fuego(x, y, n, { color = '#ff7a1a', ancho = 40, fuerza = 6 } = {}) {
    for (let k = 0; k < 3; k++) {
      this.chispas(x + (this.rng() - 0.5) * ancho, y, Math.ceil(n / 3), {
        color: k === 1 ? '#ffd23a' : color, fuerza, g: -0.18, tam: 10, vida: 38, blancas: 0.1, dir: -Math.PI / 2, abertura: 1.1 });
    }
  }

  explotar(x, y, color) {
    if (this.nivel >= 1) return;
    this.explosion = { t: performance.now(), x, y, color };
  }

  vaciar() { this.lista = []; this.explosion = null; }

  // Pinta un frame. ancho/alto en px CSS; dpr el del canvas
  pintar(g2, ahora, ancho, alto, dpr) {
    if (!this.activas) {
      if (this.sucio) { g2.setTransform(1, 0, 0, 1, 0, 0); g2.clearRect(0, 0, g2.canvas.width, g2.canvas.height); this.sucio = false; }
      return;
    }
    this.sucio = true;
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, ancho, alto);
    g2.globalCompositeOperation = 'lighter';
    const ex = this.explosion;
    if (ex) {
      const e = (ahora - ex.t) / 1400;
      if (e >= 1 || this.nivel >= 1) this.explosion = null;
      else {
        const im = rayosDe(ex.color), tam = Math.max(ancho, alto) * (0.6 + e * 1.1);
        g2.globalAlpha = e < 0.15 ? e / 0.15 * 0.9 : 0.9 * (1 - (e - 0.15) / 0.85);
        g2.save(); g2.translate(ex.x, ex.y); g2.rotate(e * 0.7);
        g2.drawImage(im, -tam / 2, -tam / 2, tam, tam);
        g2.restore();
      }
    }
    if (this.lista.length) {
      this.lista = this.lista.filter(p => {
        p.vida++;
        if (p.vida > p.max) return false;
        p.vx *= 0.985; p.vy = p.vy * 0.985 + p.g; p.x += p.vx; p.y += p.vy;
        const a = 1 - p.vida / p.max, s = p.tam * (0.6 + a * 0.6);
        g2.globalAlpha = a;
        g2.drawImage(p.im, p.x - s, p.y - s, s * 2, s * 2);
        return true;
      });
    }
    g2.globalAlpha = 1;
    g2.globalCompositeOperation = 'source-over';
  }
}
