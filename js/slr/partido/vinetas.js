/* ═══════════════════════════════════════════════════════════════════════════
   SHITS LEAGUE RUSH — viñetas animadas de la reproducción (goles y paradas)

   Las protagonistas son las CARTAS: la del que chuta y la del portero se
   mueven dentro de la viñeta (saltan, se tiran, hacen la chilena) y de ellas
   salen los guantes o la bota. Todo lo demás (portería, red que se deforma,
   balón con estela, fuego, chispas) es SVG pintado por programa.

   Cada fotograma se pinta entero a partir del tiempo: render(ms) deja la
   viñeta exactamente como debe estar en ese ms, sin depender de los
   fotogramas anteriores. Así saltar al final es render(dur), pausar es no
   llamar a render y ×2 es pasarle el doble de ms.

   USO
     VINETAS.tacticas.*    choque (el cruce del principio) · cambio (el plan B)
     VINETAS.chut.choque   el choque del chut, mientras pelea la barra (ver su comentario)
     VINETAS.gol.*         red · chilena · ardiendo
     VINETAS.parada.*      punos · atrapada · estirada
     const v = VINETAS.gol.ardiendo({ color, semilla, escala, cartas: { tirador, portero }, trasChut: true });
     caja.appendChild(v.el);            // ocupa el 100 % de su caja, que debe ser CUADRADA
     v.render(ms)                       // en cada fotograma, de 0 a v.dur
     v.momentos.golpe / .impacto        // ms del chut y de cuando entra o el portero la toca

   OPCIONES
     color    color del equipo protagonista (el que marca o el del portero que para)
     semilla  entero para el azar de la viñeta (a qué escuadra va, hacia dónde
              sale despejado…): misma semilla = misma animación
     escala   multiplica todos los tiempos (2 = el doble de lenta)
     trasChut true si va justo después de VINETAS.chut.choque: las de vista
              frontal (ardiendo, puños, atrapada, estirada) empiezan con el balón
              ya saliendo, sin repetir la patada (red y chilena empiezan igual)
     cartas   { tirador, portero }: elementos HTML de las cartas de verdad
              (cartaHTML). La viñeta las mete en sus huecos y les pone ancho
              y transform; si falta alguna, pone una de reserva.

   Solo toca lo que hay dentro de su propio elemento. Nada de vibración del
   dispositivo: los temblores son del dibujo.
   ═══════════════════════════════════════════════════════════════════════════ */

const NS = 'http://www.w3.org/2000/svg';
const OSCURO = '#0b1410';
const BLANCO = '#ffffff';
const FUEGO = ['#ff6a1a', '#ffb321', '#fff2c4'];   // exterior, medio, núcleo

/* ── Matemáticas ────────────────────────────────────────────────────────── */
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const tramo = (t, a, b) => clamp((t - a) / (b - a));     // 0→1 entre los ms a y b
const f1 = x => (Math.round(x * 10) / 10).toString();   // números cortos en los atributos
const E = {
  inQ: t => t * t,
  outQ: t => 1 - (1 - t) * (1 - t),
  inC: t => t * t * t,
  outC: t => 1 - (1 - t) * (1 - t) * (1 - t),
  inOutC: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outBote: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};
// Muelle amortiguado: vale 1 en t=0 y oscila hasta 0 (t en segundos)
const muelle = (t, frec = 16, amort = 5) => Math.exp(-amort * t) * Math.cos(frec * t);
// Azar con semilla (mulberry32)
function azar(semilla) {
  let a = (semilla >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Ruido suave y determinista para temblores y llamas
const ruido = (t, k = 0) => Math.sin(t * 0.091 + k * 1.7) * 0.6 + Math.sin(t * 0.217 + k * 4.1) * 0.4;

/* ── SVG ────────────────────────────────────────────────────────────────── */
function nodo(tag, attrs = {}, padre = null) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (padre) padre.appendChild(e);
  return e;
}
// Un trazo con halo (dos paths): set(d) cambia la forma de los dos
function trazo(padre, { color, w = 3, d = '', relleno = 'none', halo = true, op = 1 }) {
  const g = nodo('g', { opacity: op }, padre);
  const comun = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d };
  const h = halo ? nodo('path', { ...comun, stroke: color, 'stroke-width': w * 3.2, opacity: 0.16 }, g) : null;
  const c = nodo('path', { ...comun, fill: relleno, stroke: color, 'stroke-width': w }, g);
  return {
    g,
    set(nd) { c.setAttribute('d', nd); if (h) h.setAttribute('d', nd); },
    op(o) { g.setAttribute('opacity', f1(o * 100) / 100); },
  };
}
// Curva suave que pasa por todos los puntos (Catmull-Rom → Bézier)
function suave(p) {
  if (p.length < 2) return '';
  let d = `M${f1(p[0][0])} ${f1(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d;
}
const rr = (x, y, w, h, r) => `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
const mover = (el, x, y, s = 1, rot = 0, op = 1) => {
  el.setAttribute('transform', `translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)}) scale(${(Math.round(s * 1000) / 1000)})`);
  el.setAttribute('opacity', Math.round(clamp(op) * 100) / 100);
};

/* ── Piezas ─────────────────────────────────────────────────────────────── */
// Balón (radio 10 a escala 1), con el dibujo de balon.svg
function balon(padre, color) {
  const g = nodo('g', {}, padre);
  nodo('circle', { r: 13, fill: color, opacity: 0.14 }, g);
  nodo('circle', { r: 10, fill: OSCURO, stroke: color, 'stroke-width': 2.2 }, g);
  const pent = [[0, -4.04], [3.66, -1.38], [2.27, 2.93], [-2.27, 2.93], [-3.66, -1.38]];
  const rayo = [[0, -9.6], [8.74, -3.15], [5.5, 7.3], [-5.5, 7.3], [-8.74, -3.15]];
  const d = `M${pent.map(p => p.join(' ')).join('L')}Z` + pent.map((p, i) => `M${p.join(' ')}L${rayo[i].join(' ')}`).join('');
  nodo('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
  return g;
}
// Estela de balones fantasma: set([{x,y,s}, …]) del más nuevo al más viejo
function estela(padre, color, n = 6) {
  const fantasmas = Array.from({ length: n }, () => nodo('circle', { r: 10, fill: 'none', stroke: color, 'stroke-width': 1.6 }, padre));
  return (puntos, op = 1) => fantasmas.forEach((c, k) => {
    const p = puntos[k];
    if (!p || op <= 0) { c.setAttribute('opacity', 0); return; }
    c.setAttribute('cx', f1(p.x)); c.setAttribute('cy', f1(p.y));
    c.setAttribute('r', f1(10 * p.s * (1 - k * 0.06)));
    c.setAttribute('opacity', Math.round(op * 0.42 * (1 - k / n) * 100) / 100);
  });
}
// Rayas de velocidad detrás del balón: set(x, y, ángulo de avance, largo, op)
function rayas(padre, color, n = 3) {
  const l = Array.from({ length: n }, () => nodo('line', { stroke: color, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, padre));
  return (x, y, ang, largo, s = 1, op = 1) => l.forEach((ln, k) => {
    const off = (k - (n - 1) / 2) * 6 * s, ca = Math.cos(ang), sa = Math.sin(ang);
    const bx = x - ca * 13 * s - sa * off, by = y - sa * 13 * s + ca * off;
    const lk = largo * (k === 1 ? 1 : 0.65);
    ln.setAttribute('x1', f1(bx)); ln.setAttribute('y1', f1(by));
    ln.setAttribute('x2', f1(bx - ca * lk)); ln.setAttribute('y2', f1(by - sa * lk));
    ln.setAttribute('opacity', Math.round(clamp(op) * 70) / 100);
  });
}
// Estallido de impacto: anillo + rayos. set(x, y, progreso 0→1, tamaño)
function estallido(padre, color, rnd, n = 10) {
  const g = nodo('g', {}, padre);
  const aro = nodo('circle', { fill: 'none', stroke: color, 'stroke-width': 3 }, g);
  const rayos = Array.from({ length: n }, (_, k) => ({
    a: (k / n) * Math.PI * 2 + rnd() * 0.4, l: 0.6 + rnd() * 0.7,
    el: nodo('line', { stroke: k % 3 ? color : BLANCO, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g),
  }));
  return (x, y, p, tam = 34) => {
    if (p <= 0 || p >= 1) { g.setAttribute('opacity', 0); return; }
    g.setAttribute('opacity', 1);
    const e = E.outC(p), o = 1 - E.inQ(p);
    aro.setAttribute('cx', f1(x)); aro.setAttribute('cy', f1(y));
    aro.setAttribute('r', f1(lerp(4, tam * 0.85, e)));
    aro.setAttribute('stroke-width', f1(lerp(4, 0.5, p)));
    aro.setAttribute('opacity', Math.round(o * 90) / 100);
    for (const r of rayos) {
      const r0 = lerp(6, tam * 0.55, e), r1 = lerp(10, tam * (0.9 + r.l * 0.5), e);
      r.el.setAttribute('x1', f1(x + Math.cos(r.a) * r0)); r.el.setAttribute('y1', f1(y + Math.sin(r.a) * r0));
      r.el.setAttribute('x2', f1(x + Math.cos(r.a) * r1)); r.el.setAttribute('y2', f1(y + Math.sin(r.a) * r1));
      r.el.setAttribute('opacity', Math.round(o * 100) / 100);
    }
  };
}

// Portería de frente con red deformable (arriba del dibujo). set(ix, iy, hundimiento 0→1)
function porteriaFrente(padre, color, { x0 = 28, x1 = 172, y0 = 22, y1 = 98, cols = 12, filas = 6 } = {}) {
  const g = nodo('g', {}, padre);
  const red = nodo('g', { opacity: 0.55 }, g);
  const lineasV = Array.from({ length: cols - 1 }, () => trazo(red, { color, w: 1.3, halo: false }));
  const lineasH = Array.from({ length: filas - 1 }, () => trazo(red, { color, w: 1.3, halo: false }));
  trazo(g, { color, w: 2, halo: false, op: 0.7, d: `M${x0 - 10} ${y1}H${x1 + 10}` });     // línea de gol
  trazo(g, { color, w: 5, d: `M${x0} ${y1}V${y0}H${x1}V${y1}` });                         // palos y larguero
  const punto = (i, j, ix, iy, h) => {
    const x = lerp(x0, x1, j / cols), y = lerp(y0, y1, i / filas);
    const dx = x - ix, dy = y - iy;
    const w = Math.exp(-(dx * dx) / (2 * 26 * 26) - (dy * dy) / (2 * 20 * 20));
    const k = 0.5 * w * h;                     // se va hacia el punto de impacto: parece que se hunde
    return [x - dx * k, y - dy * k];
  };
  const set = (ix = 100, iy = 60, h = 0) => {
    lineasV.forEach((l, k) => { const j = k + 1; l.set(suave(Array.from({ length: filas + 1 }, (_, i) => punto(i, j, ix, iy, h)))); });
    lineasH.forEach((l, k) => { const i = k + 1; l.set(suave(Array.from({ length: cols + 1 }, (_, j) => punto(i, j, ix, iy, h)))); });
  };
  set();
  return { g, set, suelo: y1 };
}

// Guante de portero abierto: el puño de la muñeca en (0,0) y los dedos hacia arriba
function guanteAbierto(padre, color) {
  const g = nodo('g', {}, padre);
  const s = d => trazo(g, { color, w: 2.6, d, relleno: OSCURO });
  s('M-17 -30 L-30 -44 A4.6 4.6 0 0 0 -37 -38 L-24 -18 Z');                  // pulgar
  for (const [x, top] of [[-18, -62], [-8.6, -69], [0.8, -67], [10.2, -59]]) s(rr(x, top, 8.4, -32 - top, 4.2));
  s('M-19 -38H19V-24Q19 -15 11 -15H-11Q-19 -15 -19 -24Z');                   // palma
  s('M-14 -16H14V0H-14Z');                                                     // muñequera
  trazo(g, { color, w: 2, halo: false, d: 'M-14 -8H14' });                     // velcro
  trazo(g, { color, w: 1.6, halo: false, op: 0.6, d: 'M-9 -32Q0 -28 9 -32' }); // línea de la palma
  return g;
}
// Guante cerrado en puño: muñeca en (0,0), nudillos hacia arriba
function guantePuno(padre, color) {
  const g = nodo('g', {}, padre);
  const s = d => trazo(g, { color, w: 2.6, d, relleno: OSCURO });
  s(rr(-22, -60, 44, 44, 13));                                                    // el puño
  trazo(g, { color, w: 2, halo: false, d: 'M-11 -60V-49M0 -60V-48M11 -60V-49' }); // dedos
  s('M-22 -34C-10 -38 6 -36 10 -29C11 -23 4 -21 -4 -22L-22 -22Z');               // pulgar cruzado
  s('M-15 -17H15V0H-15Z');                                                        // muñequera
  trazo(g, { color, w: 2, halo: false, d: 'M-15 -8H15' });
  return g;
}
// Bota (la de img/slr/partido/bota.svg), centrada en (0,0) y de unos 100 de ancho
const BOTA_D = 'M306.4 720.1C298.5 719.1 292.6 717.9 291.5 717.0C288.8 714.8 286.6 709.0 282.5 692.9L278.8 678.3L259.0 675.6C248.2 674.1 238.4 672.7 237.3 672.4C235.8 672.0 233.8 674.4 226.6 685.3C217.6 699.1 215.2 701.4 209.7 701.4C206.0 701.3 180.4 694.5 174.3 691.9C168.7 689.5 167.1 686.0 165.9 674.2C165.3 668.8 164.7 662.7 164.4 660.5L163.9 656.5L152.7 653.2C136.7 648.5 129.7 644.8 121.7 636.9C114.3 629.6 109.4 620.6 106.3 609.0C104.0 600.0 104.0 580.8 106.4 572.0C111.8 552.1 126.5 534.1 144.5 525.5C152.6 521.6 156.9 520.4 207.0 507.5C259.5 494.0 273.2 490.1 300.0 480.8C340.3 466.9 340.1 467.0 398.5 432.5C450.4 401.9 578.7 326.5 611.0 307.7C616.9 304.3 621.0 302.6 624.3 302.2L629.2 301.7L640.3 313.1C657.5 330.7 664.7 341.2 668.5 354.5C671.0 363.0 670.2 379.0 666.8 388.7C664.9 394.0 664.5 396.2 665.4 396.9C667.4 398.5 688.4 408.7 699.2 413.4C713.2 419.3 724.3 422.6 736.5 424.5C749.1 426.4 756.8 426.4 766.4 424.5C789.5 420.1 802.1 406.3 811.1 375.3C816.5 357.1 821.8 348.6 831.0 343.6C842.0 337.6 854.6 339.3 866.1 348.4C873.7 354.3 877.0 359.7 883.9 377.4C914.3 455.4 924.6 512.7 917.5 565.0C915.7 577.7 914.9 581.4 910.1 599.5C908.0 607.2 905.3 617.5 904.1 622.5C903.0 627.5 900.6 634.2 899.0 637.6C893.6 648.7 879.0 660.6 868.4 662.6C864.5 663.3 865.1 661.7 858.5 688.8C856.0 698.9 853.5 708.1 852.9 709.2C850.8 713.2 846.2 714.0 826.5 714.0C812.1 714.0 807.3 713.7 805.0 712.5C801.8 710.8 800.1 706.8 791.7 681.5L786.4 665.5L770.5 665.2C761.8 665.1 754.3 665.3 753.8 665.8C753.4 666.2 750.3 676.0 747.0 687.5C743.7 698.9 740.5 708.9 739.8 709.7C736.7 713.5 733.5 714.0 714.4 714.0C697.3 714.0 695.5 713.8 692.0 711.9C689.9 710.7 687.7 708.8 687.1 707.6C686.6 706.5 683.6 697.7 680.5 688.2C677.1 677.9 673.9 669.9 672.5 668.2L670.2 665.5L641.3 665.6C612.1 665.8 579.8 667.8 541.0 672.0C495.8 676.9 484.5 678.0 480.9 678.0C476.6 678.0 477.3 676.5 470.9 700.5C467.6 712.9 465.1 717.3 460.6 718.4C456.6 719.4 432.6 722.0 427.3 722.0C419.4 722.0 417.4 719.6 409.2 700.5L402.3 684.5L378.0 684.5L353.7 684.5L346.4 701.0C337.4 721.1 336.6 722.0 326.7 721.9C322.7 721.8 313.6 721.0 306.4 720.1ZM324.8 701.8C326.1 700.0 333.2 683.8 332.7 683.4C332.5 683.2 325.6 682.6 317.4 682.0C309.2 681.4 301.7 680.8 300.7 680.5C299.2 680.2 298.9 680.6 299.4 682.3C299.8 683.5 301.0 688.2 302.1 692.7L304.2 700.9L309.4 701.4C312.2 701.7 315.9 702.2 317.5 702.3C323.3 703.0 323.8 703.0 324.8 701.8ZM447.9 701.1C451.1 700.5 451.3 700.3 453.6 691.1C455.0 685.9 455.9 681.5 455.7 681.3C455.2 680.9 423.7 683.0 423.2 683.5C423.0 683.7 424.7 688.1 427.0 693.4L431.2 702.9L437.8 702.3C441.5 702.0 446.0 701.5 447.9 701.1ZM731.1 673.8C734.3 662.5 737.3 652.2 738.0 651.1C740.5 646.3 743.2 645.9 771.0 646.2L796.8 646.5L799.5 649.0C801.5 650.8 803.7 656.6 809.1 673.2L816.2 695.0L826.5 695.0C832.3 695.0 837.2 694.6 837.5 694.0C837.8 693.5 840.3 683.7 843.0 672.3C848.7 648.2 848.9 647.9 859.8 645.0C872.0 641.9 878.7 636.8 882.5 627.7C883.3 625.7 883.7 624.0 883.3 624.0C882.8 624.0 879.4 624.7 875.5 625.5C860.5 628.6 839.1 629.3 780.0 628.6C676.0 627.4 635.4 629.7 531.5 642.5C502.9 646.0 472.8 649.6 464.7 650.5C371.1 660.1 276.8 653.8 182.0 631.5C167.0 628.0 142.6 621.5 132.6 618.4C129.5 617.4 134.7 623.6 139.9 627.0C145.8 631.0 152.5 633.4 171.5 638.5C235.5 655.6 309.2 665.2 376.5 665.3C412.5 665.3 428.2 664.3 486.0 658.4C542.4 652.7 558.2 651.1 585.0 648.9C615.7 646.4 666.5 645.2 672.7 646.9C678.6 648.5 685.9 653.8 689.5 659.1C691.9 662.6 698.1 679.1 702.6 693.8C702.9 694.7 705.7 695.0 714.2 694.8L725.4 694.5L731.1 673.8ZM210.8 674.8C213.1 671.4 214.8 668.4 214.6 668.3C214.3 668.0 192.7 663.2 187.2 662.3L183.8 661.7L184.5 668.6C184.9 672.4 185.4 675.6 185.5 675.8C186.0 676.4 202.5 680.8 204.6 680.9C206.2 681.0 207.8 679.3 210.8 674.8ZM418.0 635.0C444.4 633.4 517.0 626.0 521.8 624.4C523.7 623.8 524.3 624.5 476.5 572.4L434.0 526.1L425.3 530.1C399.9 541.9 384.3 546.0 364.5 546.0C354.9 546.0 349.3 545.5 343.0 544.0C326.5 540.0 306.1 527.5 292.9 513.2L286.6 506.4L274.6 509.7C267.9 511.5 243.4 518.0 220.0 524.1C152.1 541.7 149.8 542.5 140.0 552.2C130.2 561.9 125.6 570.8 124.0 583.3C122.8 593.3 123.4 595.5 127.8 596.9C192.6 617.6 272.1 631.9 341.5 635.3C356.9 636.1 403.2 635.9 418.0 635.0ZM567.2 619.0C590.3 616.4 624.0 613.2 637.0 612.5C655.8 611.5 657.8 611.1 658.6 608.7C659.0 607.5 665.5 593.0 673.1 576.5C680.6 559.9 687.4 544.4 688.0 541.9C690.4 532.9 686.8 519.9 679.9 513.2C678.1 511.4 673.4 508.0 669.5 505.6C663.6 502.0 623.2 477.4 591.8 458.4L583.0 453.1L565.8 461.4C556.3 466.0 536.8 475.5 522.5 482.5C508.2 489.5 486.4 500.1 474.1 506.1L451.6 517.0L455.6 521.3C459.5 525.3 477.5 545.1 500.5 570.5C535.7 609.4 546.6 621.0 548.2 621.0C549.1 621.0 557.7 620.1 567.2 619.0ZM704.8 608.8C705.3 608.1 707.2 604.1 708.9 600.0C713.1 589.8 724.8 568.6 732.5 557.0C746.6 535.8 769.4 511.0 789.3 495.0C814.9 474.6 845.5 458.3 876.0 449.0C881.8 447.2 886.6 445.7 886.8 445.5C888.5 444.0 865.3 379.3 859.5 369.4C856.6 364.5 850.6 360.1 845.6 359.3C842.4 358.8 841.6 359.2 838.1 362.6C834.8 366.0 833.6 368.4 830.5 378.5C823.2 401.9 816.2 415.0 805.2 425.7C790.3 440.2 772.6 445.9 746.6 444.7C739.9 444.4 731.1 443.4 727.0 442.6C711.9 439.3 689.8 430.9 668.7 420.3L659.8 415.9L647.7 421.6C641.0 424.7 628.3 430.9 619.6 435.2L603.6 443.2L610.3 447.4C614.0 449.6 624.1 455.8 632.7 461.1C688.4 494.8 689.0 495.3 694.3 500.9C707.4 515.1 711.1 536.6 703.7 554.7C702.4 557.9 696.3 571.3 690.1 584.6C684.0 597.9 679.0 609.0 679.0 609.3C679.0 610.6 703.7 610.1 704.8 608.8ZM851.5 609.0C866.9 608.0 879.0 605.6 886.0 602.0C889.3 600.3 889.9 599.4 892.3 591.3C898.3 571.3 900.0 558.8 900.0 533.7C900.0 511.8 899.0 501.3 895.4 481.6C892.1 463.3 892.4 463.7 885.7 465.6C820.0 484.9 763.8 532.4 732.0 595.9C728.7 602.5 726.0 608.1 726.0 608.4C726.0 609.7 832.2 610.2 851.5 609.0ZM381.7 525.4C394.2 522.8 406.5 517.8 439.3 501.9C456.5 493.5 488.9 477.7 511.5 466.7C534.0 455.8 558.8 443.7 566.5 440.0C634.8 406.9 638.6 404.9 636.5 403.4C632.3 400.2 613.5 390.6 607.1 388.4C599.3 385.6 589.0 385.3 581.7 387.5C577.9 388.6 559.3 397.8 557.1 399.6C556.9 399.8 558.5 402.0 560.6 404.5C566.6 411.6 568.0 414.6 566.9 418.3C565.7 422.6 562.6 425.0 558.0 425.0C553.9 425.0 552.0 423.6 544.2 414.5L539.8 409.5L536.2 411.8C534.2 413.0 526.6 417.2 519.5 421.1C512.4 425.1 505.5 428.9 504.2 429.7L502.0 431.1L505.6 435.8C508.7 439.8 509.1 441.1 508.7 444.3C508.4 446.5 507.1 449.3 505.9 450.6C504.0 452.7 502.8 453.0 499.1 452.8L494.6 452.5L479.8 435.0C471.7 425.4 464.6 417.4 464.1 417.2C462.9 416.8 430.3 435.3 427.8 437.8C427.4 438.2 430.5 442.6 434.7 447.6C445.6 460.3 451.0 467.9 451.0 470.6C451.0 476.6 444.9 481.8 439.5 480.4C437.8 480.0 432.3 474.3 423.4 463.9C415.9 455.1 409.5 448.2 409.2 448.4C408.8 448.6 403.3 451.9 397.0 455.7C390.7 459.5 382.5 464.3 378.8 466.3C375.0 468.4 372.0 470.3 372.0 470.7C372.0 471.6 378.0 479.0 384.8 486.3C390.4 492.4 391.0 493.6 391.0 497.3C390.9 501.8 389.7 504.0 386.3 505.8C380.8 508.8 376.8 506.7 368.3 496.6C364.6 492.2 359.8 486.7 357.7 484.4L353.9 480.2L344.3 484.6C339.0 487.0 328.4 491.3 320.8 494.2C313.2 497.0 307.1 499.9 307.3 500.4C307.9 502.2 322.0 513.8 328.1 517.5C338.6 523.9 349.6 526.8 364.3 526.9C369.7 527.0 377.5 526.3 381.7 525.4ZM509.3 405.5C519.0 400.0 527.0 395.2 527.0 394.9C527.0 393.9 518.9 385.0 517.9 385.0C517.4 385.0 512.0 388.0 505.8 391.6C499.6 395.2 491.4 400.0 487.7 402.2C480.9 406.2 480.9 406.2 482.6 408.3C487.3 413.9 489.5 416.0 490.5 415.8C491.1 415.6 499.5 411.0 509.3 405.5ZM649.4 380.3C653.1 369.1 651.1 357.1 643.9 346.3C639.6 339.9 624.9 323.0 623.7 323.0C623.2 323.0 611.5 329.6 597.6 337.7C545.5 368.1 536.0 373.8 536.0 374.9C536.0 375.4 537.7 377.7 539.9 380.1L543.8 384.5L558.6 377.3C587.9 363.0 601.2 363.3 631.3 378.8C639.7 383.1 646.8 386.4 647.1 386.1C647.5 385.8 648.5 383.2 649.4 380.3Z';
function bota(padre, color) {
  const g = nodo('g', {}, padre);
  const dentro = nodo('g', { transform: 'scale(0.12) translate(-511 -511)' }, g);
  nodo('path', { d: BOTA_D, fill: color, 'fill-rule': 'evenodd' }, dentro);
  return g;
}

/* ── Capas: atrás (SVG) · cartas (HTML) · delante (SVG) ───────────────────
   Las cartas son las de verdad de la app (cartaHTML), metidas en huecos que
   la viñeta mueve en cada fotograma. Lo que va «atrás» queda por debajo de las
   cartas (portería, red, el balón cuando ya está dentro) y lo de «delante», por
   encima (balón en vuelo, guantes, bota, chispas). */
const NEUTRO = '#e8f5ec';   // portería y red: neutras, el color es de los equipos

function capas() {
  const raiz = document.createElement('div');
  raiz.className = 'slr-vineta';
  raiz.style.cssText = 'position:relative;width:100%;height:100%;pointer-events:none;will-change:transform,opacity';
  const svg = () => {
    const s = nodo('svg', { viewBox: '0 0 200 200', 'aria-hidden': 'true' });
    s.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible';
    raiz.appendChild(s);
    return nodo('g', {}, s);
  };
  const atras = svg();
  const cartas = document.createElement('div');
  cartas.style.cssText = 'position:absolute;inset:0';
  raiz.appendChild(cartas);
  const delante = svg();
  let S = 0;
  return {
    raiz, atras, cartas, delante,
    medir() { S = raiz.clientWidth / 200 || S; return S; },
    get S() { return S; },
    // Temblor y fundido de toda la viñeta
    general(dx, dy, op) {
      raiz.style.transform = `translate(${(dx * S).toFixed(1)}px, ${(dy * S).toFixed(1)}px)`;
      raiz.style.opacity = Math.round(clamp(op) * 100) / 100;
    },
  };
}

// Carta de reserva si no nos pasan la de verdad
function cartaReserva(nombre = '') {
  const d = document.createElement('div');
  d.style.cssText = 'aspect-ratio:5/7;width:100%;border-radius:9%;border:2px solid #cfd8d3;background:linear-gradient(#2a3b33,#16231c);display:flex;align-items:flex-end;justify-content:center;color:#fff;font:700 10px system-ui;padding-bottom:6%';
  d.textContent = nombre;
  return d;
}

// Un hueco para una carta: set(x, y, { rot, op, sx, sy }) en unidades del dibujo (0–200)
function hueco(c, el, ancho) {
  const caja = document.createElement('div');
  caja.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform,opacity';
  const dentro = document.createElement('div');
  dentro.style.cssText = 'transform-origin:50% 50%;filter:drop-shadow(0 6px 10px rgba(0,0,0,.55))';
  dentro.appendChild(el || cartaReserva());
  caja.appendChild(dentro);
  c.cartas.appendChild(caja);
  let S = 0;
  return (x, y, { rot = 0, op = 1, sx = 1, sy = 1 } = {}) => {
    if (S !== c.S) { S = c.S; caja.style.width = `${(ancho * S).toFixed(1)}px`; }
    caja.style.transform = `translate(${(x * S).toFixed(1)}px, ${(y * S).toFixed(1)}px)`;
    dentro.style.transform = `translate(-50%, -50%) rotate(${f1(rot)}deg) scale(${Math.round(sx * 1000) / 1000}, ${Math.round(sy * 1000) / 1000})`;
    caja.style.opacity = Math.round(clamp(op) * 100) / 100;
  };
}

/* ── La jugada vista desde detrás del que chuta ────────────────────────────
   Portería arriba (con la carta del portero dentro) y la carta del que chuta
   abajo. El balón sale de sus pies hacia la portería y se hace pequeño. */
const P = { x0: 24, x1: 176, y0: 32, y1: 114 };      // la portería
const PORTERO = { x: 100, y: 86, w: 40 };             // su carta, de pie sobre la línea
const TIRADOR = { x: 100, y: 178, w: 52 };            // su carta, abajo
const PIES = [100, 134];                              // de dónde sale el balón

function jugadaFrontal(o) {
  const c = capas();
  const port = porteriaFrente(c.atras, NEUTRO, { x0: P.x0, x1: P.x1, y0: P.y0, y1: P.y1, cols: 13, filas: 6 });
  const portero = hueco(c, o.cartas?.portero, PORTERO.w);
  const tirador = hueco(c, o.cartas?.tirador, TIRADOR.w);
  return { c, port, portero, tirador };
}

// El tirador: aparece, se arma hacia atrás, golpea y se queda; luego se aparta
function animarTirador(set, t, golpe, { sale = 1e9 } = {}) {
  const entra = E.outC(tramo(t, 0, 260));
  // Sin saltos: se arma hacia atrás, el golpe lo lleva hacia delante en 160 ms y se asienta
  const arma = E.inOutC(tramo(t, golpe - 420, golpe - 60));
  const golpea = E.outC(tramo(t, golpe - 60, golpe + 160));
  const asienta = E.inOutC(tramo(t, golpe + 160, golpe + 700));
  const rot = -6 * arma * (1 - golpea) + 7 * golpea * (1 - asienta) + 1.5 * asienta;
  const dy = (1 - entra) * 40 + 4 * arma * (1 - golpea) - 7 * golpea * (1 - asienta);
  const sy = 1 - 0.04 * arma * (1 - golpea) + 0.04 * golpea * (1 - asienta);
  const fuera = E.inQ(tramo(t, sale, sale + 450));
  set(TIRADOR.x, TIRADOR.y + dy + fuera * 60, { rot, sy, op: entra * (1 - fuera) });
}

// El portero quieto: un leve balanceo, como esperando
const esperando = t => ({ x: PORTERO.x + Math.sin(t * 0.006) * 1.5, y: PORTERO.y, rot: Math.sin(t * 0.004) * 1.5 });

// Ida del balón de los pies a un punto, haciéndose pequeño (perspectiva)
const disparo = (t, t0, t1, meta, { curva = 0, s0 = 1.3, s1 = 0.62, ease = E.outQ } = {}) => {
  const p = ease(tramo(t, t0, t1));
  return { x: lerp(PIES[0], meta[0], p) + Math.sin(Math.PI * p) * curva, y: lerp(PIES[1], meta[1], p), s: lerp(s0, s1, p) };
};

/* ════════════════════════════════════════════════════════════════════════
   GOLES
   ════════════════════════════════════════════════════════════════════════ */

/* GOL «ARDIENDO» — a la escuadra. El tirador golpea, el balón sube despacio
   envuelto en fuego hacia una de las escuadras, el portero se tira tarde y se
   queda corto, y la red revienta en la esquina. */
function golArdiendo(o = {}) {
  const { color = '#3ddc84', semilla = 1, escala = 1 } = o;
  const rnd = azar(semilla);
  const { c, port, portero, tirador } = jugadaFrontal(o);
  const lado = rnd() < 0.5 ? -1 : 1;
  const META = [100 + lado * 58, 48];
  const T = { golpe: 620, entra: 1620, tirase: 1180, fin: 2550 };
  const capaFuego = nodo('g', {}, c.delante);
  const llamas = FUEGO.map((col, k) => nodo('path', { fill: col, opacity: [0.85, 0.9, 0.95][k] }, capaFuego));
  const brasas = Array.from({ length: 14 }, () => ({ el: nodo('circle', { fill: FUEGO[1] }, capaFuego), a: rnd() * 6.28, v: 0.5 + rnd(), d: rnd() }));
  const bDelante = balon(c.delante, FUEGO[1]);
  const bAtras = balon(c.atras, FUEGO[1]);
  const boom = estallido(c.delante, FUEGO[1], rnd, 14);
  const boom2 = estallido(c.delante, color, rnd, 8);
  const pos = t => {
    const p = tramo(Math.max(t, T.golpe), T.golpe, T.entra), q = 1 - Math.pow(1 - p, 1.6);   // sale disparado y frena un poco al final
    return { x: lerp(PIES[0], META[0], q) + lado * Math.sin(Math.PI * q) * 46, y: lerp(PIES[1] + 4, META[1], q) - Math.sin(Math.PI * q) * 10, s: lerp(1.25, 0.6, q) * (1 + 0.15 * Math.sin(Math.PI * q)) };
  };
  const chispa = estallido(c.delante, FUEGO[1], rnd, 10);

  function render(ms) {
    const t = ms / escala;
    c.medir();
    animarTirador(tirador, t, T.golpe, { sale: T.entra + 200 });
    // El portero: espera, se tira tarde hacia la escuadra y se queda corto; cae
    if (t < T.tirase) { const e = esperando(t); portero(e.x, e.y, { rot: e.rot }); }
    else {
      const p = E.outC(tramo(t, T.tirase, T.entra)), q = E.inQ(tramo(t, T.entra, T.entra + 420));
      portero(PORTERO.x + lado * 26 * p, PORTERO.y - 6 * Math.sin(Math.PI * Math.min(1, p * 0.9)) + q * 14, { rot: lado * lerp(62 * p, 88, q) });
    }
    // La cola de fuego
    const tc = Math.min(t, T.entra), vivo = t < T.golpe ? 0 : 1 - tramo(t, T.entra, T.entra + 200);
    const N = 16, izq = [], der = [], cen = [];
    for (let k = 0; k < N; k++) {
      const q = pos(tc - k * 34), q2 = pos(tc - (k + 1) * 34);
      let nx = -(q.y - q2.y), ny = q.x - q2.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const ancho = 10.5 * q.s * Math.pow(1 - k / N, 0.8) * (0.85 + 0.25 * ruido(t * 1.6, k)) * vivo;
      const ond = ruido(t * 2.2, k + 7) * 4 * (k / N) * q.s;
      cen.push([q.x, q.y]);
      izq.push([q.x + nx * (ancho + ond), q.y + ny * (ancho + ond)]);
      der.push([q.x - nx * (ancho - ond), q.y - ny * (ancho - ond)]);
    }
    const forma = f => {
      const L = izq.map(([x, y], k) => [lerp(cen[k][0], x, f), lerp(cen[k][1], y, f)]);
      const R = der.map(([x, y], k) => [lerp(cen[k][0], x, f), lerp(cen[k][1], y, f)]);
      return suave([...L, ...R.reverse(), L[0]]) + 'Z';
    };
    llamas[0].setAttribute('d', forma(1.35)); llamas[1].setAttribute('d', forma(0.9)); llamas[2].setAttribute('d', forma(0.45));
    brasas.forEach(e => {
      const vida = (t * 0.0011 * e.v + e.d) % 1, q = pos(tc - vida * 420);
      e.el.setAttribute('cx', f1(q.x + Math.cos(e.a) * vida * 26 * q.s)); e.el.setAttribute('cy', f1(q.y + Math.sin(e.a) * vida * 26 * q.s));
      e.el.setAttribute('r', f1(Math.max(0, 1.6 * (1 - vida) * q.s * vivo))); e.el.setAttribute('opacity', Math.round((1 - vida) * 100) / 100);
    });
    // El balón: por delante mientras vuela, por detrás de la red cuando entra
    const p = pos(tc);
    const dentro = t > T.entra - 60;
    const by = t > T.entra ? lerp(META[1], port.suelo - 6, E.outBote(tramo(t, T.entra + 200, T.entra + 750))) : p.y;
    mover(bDelante, p.x, p.y, p.s * lerp(0.6, 1, E.outC(tramo(t, T.golpe, T.golpe + 90))), t * 0.9, dentro ? 0 : tramo(t, T.golpe - 10, T.golpe + 50));
    chispa(PIES[0], PIES[1] + 6, tramo(t, T.golpe, T.golpe + 380), 30);
    mover(bAtras, p.x, by, p.s, t * 0.9, dentro ? 1 : 0);
    // Red, explosión y temblor creciente
    const h = t < T.entra ? 0 : t < T.entra + 150 ? E.outC(tramo(t, T.entra, T.entra + 150)) : 0.3 + 0.7 * muelle((t - T.entra - 150) / 1000, 13, 3.5);
    port.set(META[0], META[1], h * 1.1 * (1 - tramo(t, T.fin - 500, T.fin)));
    boom(META[0], META[1], tramo(t, T.entra, T.entra + 600), 56);
    boom2(META[0], META[1], tramo(t, T.entra + 80, T.entra + 500), 34);
    const tb = t < T.entra ? 3 * E.inQ(tramo(t, T.golpe, T.entra)) : 7 * (1 - tramo(t, T.entra, T.entra + 600));
    c.general(ruido(t, 3) * tb, ruido(t, 5) * tb, E.outC(tramo(t, 0, 200)) * (1 - tramo(t, T.fin - 250, T.fin)));
  }
  render(0);
  return { el: c.raiz, render, dur: T.fin * escala, momentos: { golpe: T.golpe * escala, impacto: T.entra * escala } };
}

/* GOL «CHILENA» — la carta del tirador da una voltereta hacia atrás: en lo más
   alto, boca abajo, la bota sale de sus pies y golpea el balón, que entra en
   tirabuzón mientras el portero salta tarde. La carta aterriza de pie. */
function golChilena(o = {}) {
  const { color = '#3ddc84', semilla = 1, escala = 1 } = o;
  const rnd = azar(semilla);
  const { c, port, portero, tirador } = jugadaFrontal(o);
  const T = { golpe: 900, entra: 1700, fin: 2800 };
  const lado = rnd() < 0.5 ? -1 : 1;
  const META = [100 + lado * (30 + rnd() * 22), 62 + rnd() * 16];
  const TX = 100 - lado * 52;                      // el tirador, a un lado para no tapar al portero
  const GOLPE = [TX, 110];
  const pie = bota(c.delante, color);
  const latigo = trazo(c.delante, { color: BLANCO, w: 3, halo: false });
  const bDelante = balon(c.delante, color);
  const bAtras = balon(c.atras, color);
  const fant = estela(c.delante, color, 10);
  const boom = estallido(c.delante, BLANCO, rnd, 10);
  const boomRed = estallido(c.delante, color, rnd, 12);
  const H = TIRADOR.w * 1.4;   // alto de la carta

  // La voltereta: sube, gira hasta quedar boca abajo en el golpe y termina el giro al caer
  const carta = t => {
    const sube = E.outQ(tramo(t, 300, T.golpe)), baja = E.inOutC(tramo(t, T.golpe + 80, T.golpe + 760));
    const giro = t < T.golpe ? lerp(0, -182, E.inOutC(tramo(t, 380, T.golpe))) : lerp(-182, -360, baja);
    return { x: TX, y: TIRADOR.y - 30 * sube + 30 * baja, rot: giro * lado };
  };
  const ball = t => {
    if (t <= T.golpe) {                            // centro desde la derecha, en parábola
      const p = tramo(t, 120, T.golpe);
      return { x: lerp(100 + lado * 116, GOLPE[0], p), y: lerp(150, GOLPE[1], p) - Math.sin(Math.PI * p) * 60, s: 1.1 };
    }
    const p = E.outQ(tramo(t, T.golpe, T.entra)), giro = p * Math.PI * 4.5;
    return { x: lerp(GOLPE[0], META[0], p) + Math.sin(giro) * 36 * (1 - p), y: lerp(GOLPE[1], META[1], p) + Math.cos(giro) * 8 * (1 - p), s: lerp(1.2, 0.58, p) * (1 + Math.cos(giro) * 0.12 * (1 - p)) };
  };

  function render(ms) {
    const t = ms / escala;
    c.medir();
    const k = carta(t);
    tirador(k.x, k.y, { rot: k.rot, op: E.outC(tramo(t, 0, 260)) * (1 - tramo(t, T.entra + 300, T.entra + 700)) });
    // La bota sale de los pies de la carta (su borde de abajo) y da el latigazo
    const ar = k.rot * Math.PI / 180, lx = 0, ly = H / 2 + 4;
    const bx = k.x + lx * Math.cos(ar) - ly * Math.sin(ar), by = k.y + lx * Math.sin(ar) + ly * Math.cos(ar);
    const swing = lado * (t < T.golpe ? lerp(-55, 0, E.inC(tramo(t, T.golpe - 300, T.golpe))) : lerp(0, 40, E.outC(tramo(t, T.golpe, T.golpe + 300))));
    const visB = tramo(t, 520, 680) * (1 - tramo(t, T.golpe + 200, T.golpe + 420));
    mover(pie, bx, by, 0.6, k.rot + swing, visB);
    const pa = tramo(t, T.golpe - 200, T.golpe + 160);
    if (pa > 0 && pa < 1) {
      const r = 34, a0 = (k.rot + swing - 70) * Math.PI / 180, a1 = (k.rot + swing - 110) * Math.PI / 180;
      latigo.set(`M${f1(bx + Math.cos(a0) * r)} ${f1(by + Math.sin(a0) * r)}A${r} ${r} 0 0 0 ${f1(bx + Math.cos(a1) * r)} ${f1(by + Math.sin(a1) * r)}`);
      latigo.op(0.6 * Math.sin(Math.PI * pa));
    } else latigo.op(0);
    // El portero salta tarde, en el sitio
    if (t < T.entra - 250) { const e = esperando(t); portero(e.x, e.y, { rot: e.rot }); }
    else { const q = tramo(t, T.entra - 250, T.entra + 350); portero(PORTERO.x - lado * 6 * q, PORTERO.y - 14 * Math.sin(Math.PI * q), { rot: -lado * 12 * Math.sin(Math.PI * q) }); }
    // El balón
    const p = ball(Math.min(t, T.entra)), dentro = t > T.entra - 60;
    const by2 = t > T.entra ? lerp(META[1], port.suelo - 6, E.outBote(tramo(t, T.entra + 250, T.entra + 800))) : p.y;
    mover(bDelante, p.x, p.y, p.s, t * 1.8, (t < 120 || dentro) ? 0 : 1);
    mover(bAtras, p.x, by2, p.s, t * 1.8, dentro ? 1 : 0);
    const vuelo = t > T.golpe && t < T.entra + 120;
    fant(vuelo ? Array.from({ length: 10 }, (_, j) => ball(Math.max(T.golpe, Math.min(T.entra, t) - (j + 1) * 22))) : [], vuelo ? 1 - tramo(t, T.entra, T.entra + 120) : 0);
    const h = t < T.entra ? 0 : t < T.entra + 160 ? E.outC(tramo(t, T.entra, T.entra + 160)) : 0.25 + 0.75 * muelle((t - T.entra - 160) / 1000, 14, 4);
    port.set(META[0], META[1], h * (1 - tramo(t, T.fin - 500, T.fin)));
    boom(GOLPE[0], GOLPE[1], tramo(t, T.golpe, T.golpe + 380), 36);
    boomRed(META[0], META[1], tramo(t, T.entra, T.entra + 450), 44);
    const tb = 4 * (t > T.golpe ? 1 - tramo(t, T.golpe, T.golpe + 250) : 0) + 5 * (t > T.entra ? 1 - tramo(t, T.entra, T.entra + 400) : 0);
    c.general(ruido(t, 1) * tb, ruido(t, 2) * tb, E.outC(tramo(t, 0, 200)) * (1 - tramo(t, T.fin - 250, T.fin)));
  }
  render(0);
  return { el: c.raiz, render, dur: T.fin * escala, momentos: { golpe: T.golpe * escala, impacto: T.entra * escala } };
}

/* GOL «RED» — la portería vista de lado. El balón entra desde la izquierda,
   el portero (en grande) salta tarde en la boca de la portería, el balón le
   pasa por encima y la red se abomba de verdad, rebota y lo deja caer. */
function golRed(o = {}) {
  const { color = '#3ddc84', semilla = 1, escala = 1 } = o;
  const rnd = azar(semilla);
  const c = capas();
  const T = { golpe: 120, vuela: [120, 680], empuja: 680, max: 860, suelta: 1080, cae: [1080, 1680], fin: 2300 };
  const SUELO = 172, POSTE = 64, LARG = 46, YI = 104;
  const fondo = y => 120 + (y - LARG) * 0.3;
  const FILAS = 7, COLS = 6;
  const red = nodo('g', {}, c.atras);
  trazo(c.atras, { color: NEUTRO, w: 2, halo: false, op: 0.5, d: `M4 ${SUELO}H196` });
  trazo(c.atras, { color: NEUTRO, w: 5.5, d: `M${POSTE} ${SUELO}V${LARG}H${fondo(LARG) + 2}` });
  const filas = Array.from({ length: FILAS + 1 }, (_, i) => trazo(red, { color: NEUTRO, w: i === 0 || i === FILAS ? 0 : 1.3, halo: false, op: 0.5 }));
  const cols = Array.from({ length: COLS }, (_, k) => trazo(red, { color: NEUTRO, w: k === COLS - 1 ? 2.4 : 1.3, halo: k === COLS - 1, op: k === COLS - 1 ? 0.9 : 0.5 }));
  const nudo = (i, j, D) => {
    const y = lerp(LARG, SUELO, i / FILAS), x = lerp(POSTE, fondo(y), j / COLS);
    const w = Math.exp(-((y - YI) ** 2) / (2 * 30 * 30)) * Math.pow(j / COLS, 1.5);
    return [x + D * w, y + (YI - y) * 0.22 * w * (D / 30)];
  };
  const PW = 46, PH = PW * 1.4;                    // la carta del portero, en grande
  const portero = hueco(c, o.cartas?.portero, PW);
  const bAtras = balon(c.atras, color);
  const bDelante = balon(c.delante, color);
  const fant = estela(c.delante, color, 6);
  const raya = rayas(c.delante, color);
  const boom = estallido(c.delante, color, rnd, 12);
  const SALIDA = [-18, 124], xi = fondo(YI) - 11;
  const vuelo = t => { const p = tramo(t, T.vuela[0], T.vuela[1]); return { x: lerp(SALIDA[0], xi, p), y: lerp(SALIDA[1], YI, p) - Math.sin(Math.PI * p) * 36, s: 1 }; };
  const hundir = t => (t < T.empuja ? 0 : t < T.max ? 30 * E.outC(tramo(t, T.empuja, T.max)) : 30 * (0.18 + 0.82 * muelle((t - T.max) / 1000, 15, 4.2)));

  function render(ms) {
    const t = ms / escala;
    c.medir();
    // Portero en la boca de la portería: salta tarde (el balón ya ha pasado) y cae hacia fuera
    const s = tramo(t, 600, 980), cae = E.inQ(tramo(t, 980, 1380));
    const sube = 28 * Math.sin(Math.PI * Math.min(1, s * 0.8)) * (1 - cae);
    portero(lerp(90 + 6 * s, 62, cae), lerp(SUELO - PH / 2 - sube, SUELO - PW / 2 - 2, cae), { rot: lerp(0, -24, E.outQ(s)) * (1 - cae) - 82 * cae, op: E.outC(tramo(t, 0, 220)) });
    // Red
    const D = t > T.suelta ? hundir(t) * (1 - E.outQ(tramo(t, T.suelta, T.fin))) : hundir(t);
    filas.forEach((l, i) => l.set(suave(Array.from({ length: COLS + 1 }, (_, j) => nudo(i, j, D)))));
    cols.forEach((l, k) => l.set(suave(Array.from({ length: FILAS + 1 }, (_, i) => nudo(i, k + 1, D)))));
    // Balón: por delante volando (por encima del portero), por detrás de la red al entrar
    let x, y, rot;
    if (t < T.empuja) {
      ({ x, y } = vuelo(t)); rot = t * 1.4;
      fant(Array.from({ length: 6 }, (_, k) => vuelo(Math.max(T.vuela[0], t - (k + 1) * 26))), tramo(t, T.vuela[0] + 40, T.vuela[0] + 140));
      raya(x, y, Math.atan2(YI - SALIDA[1], xi - SALIDA[0]), 24, 1, tramo(t, T.vuela[0], T.vuela[0] + 100));
    } else {
      const sx = fondo(YI) + hundir(Math.min(t, T.suelta)) - 11;
      if (t < T.suelta) { x = sx; y = YI; } else { const p = tramo(t, T.cae[0], T.cae[1]); x = sx - 16 * E.outQ(p); y = lerp(YI, SUELO - 10.5, E.outBote(p)); }
      rot = T.empuja * 1.4 + (t - T.empuja) * 0.5 * (1 - tramo(t, T.empuja, T.fin));
      fant([], 0); raya(0, 0, 0, 0, 1, 0);
    }
    const enRed = t > T.empuja - 120;
    mover(bDelante, x, y, 1, rot, t < T.vuela[0] || enRed ? 0 : 1);
    mover(bAtras, x, y, 1, rot, enRed ? 1 : 0);
    boom(xi + 12, YI, tramo(t, T.empuja, T.empuja + 420), 40);
    const tb = t > T.empuja ? 4 * (1 - tramo(t, T.empuja, T.empuja + 400)) : 0;
    c.general(ruido(t, 1) * tb, ruido(t, 2) * tb, E.outC(tramo(t, 0, 200)) * (1 - tramo(t, T.fin - 250, T.fin)));
  }
  render(0);
  return { el: c.raiz, render, dur: T.fin * escala, momentos: { golpe: T.golpe * escala, impacto: T.empuja * escala } };
}

/* ════════════════════════════════════════════════════════════════════════
   PARADAS — la misma vista: el portero (su carta) hace la parada
   ════════════════════════════════════════════════════════════════════════ */

/* PARADA «PUÑOS» — el portero se agacha y salta; de su carta salen dos puños
   que golpean el balón a la vez, y el balón sale rebotado hacia ti, enorme. */
function paradaPunos(o = {}) {
  const { color = '#3ddc84', semilla = 1, escala = 1 } = o;
  const rnd = azar(semilla);
  const { c, port, portero, tirador } = jugadaFrontal(o);
  const T = { golpe: 320, toca: 1000, fin: 2400 };
  const off = (rnd() - 0.5) * 16, META = [100 + off, 50];
  const punos = [-1, 1].map(l => ({ l, g: guantePuno(c.delante, color) }));
  const b = balon(c.delante, BLANCO);
  const fant = estela(c.delante, BLANCO, 8);
  const boom = estallido(c.delante, color, rnd, 12);
  const lado = rnd() < 0.5 ? -1 : 1;
  const ida = t => disparo(t, T.golpe, T.toca, META, { s0: 1.25, s1: 0.75 });
  const vuelta = t => { const p = E.outC(tramo(t, T.toca, T.toca + 700)); return { x: lerp(META[0], 100 + lado * 140, p), y: lerp(META[1], 250, p) - Math.sin(Math.PI * p) * 40, s: lerp(0.75, 2.6, p) }; };

  function render(ms) {
    const t = ms / escala;
    c.medir();
    animarTirador(tirador, t, T.golpe, { sale: T.toca + 100 });
    // El portero: se agacha, salta al balón y aterriza
    const agacha = E.outQ(tramo(t, 500, 760)) * (1 - tramo(t, 760, 860));
    const salto = Math.sin(Math.PI * tramo(t, 760, 1500));
    const e = esperando(t);
    const py = PORTERO.y + agacha * 4 - salto * 22, px = lerp(e.x, META[0], E.outQ(tramo(t, 700, 1000)));
    portero(px, py, { rot: t < 700 ? e.rot : 0, sy: 1 - agacha * 0.07 + salto * 0.05, sx: 1 + agacha * 0.04 });
    // Los puños salen de lo alto de la carta y golpean
    for (const { l, g } of punos) {
      const sale = E.outBack(tramo(t, 760, T.toca), 1.6), vuelve = E.inQ(tramo(t, T.toca + 150, T.toca + 600));
      const x = px + l * lerp(9, 12, sale), y = META[1] + 38 + (1 - sale) * 16 + vuelve * 24;
      mover(g, x, y, 0.5 * (1 + 0.15 * (1 - tramo(t, T.toca, T.toca + 120))), l * 10 * (1 - sale), tramo(t, 760, 840) * (1 - vuelve));
    }
    // Balón: va al portero y vuelve hacia ti, enorme
    const p = t < T.toca ? ida(t) : vuelta(t);
    mover(b, p.x, p.y, p.s, t < T.toca ? t * 0.8 : t * -2.6, t < T.golpe ? 0 : 1);
    fant(Array.from({ length: 8 }, (_, k) => (t < T.toca ? ida(Math.max(T.golpe, t - (k + 1) * 30)) : vuelta(Math.max(T.toca, t - (k + 1) * 30)))), t < T.golpe + 60 ? 0 : 1 - tramo(t, T.toca + 450, T.toca + 700));
    boom(META[0], META[1], tramo(t, T.toca, T.toca + 450), 44);
    port.set(100, 70, 0);
    const tb = t > T.toca ? 5 * (1 - tramo(t, T.toca, T.toca + 350)) : 0;
    c.general(ruido(t, 1) * tb, ruido(t, 4) * tb, E.outC(tramo(t, 0, 200)) * (1 - tramo(t, T.fin - 250, T.fin)));
  }
  render(0);
  return { el: c.raiz, render, dur: T.fin * escala, momentos: { golpe: T.golpe * escala, impacto: T.toca * escala } };
}

/* PARADA «ATRAPADA» — el balón va al pecho del portero; de los lados de su
   carta salen los guantes, lo atrapan (el balón se aplasta), lo aprietan
   temblando y el portero se lo queda, con un brillo. */
function paradaAtrapada(o = {}) {
  const { color = '#3ddc84', semilla = 1, escala = 1 } = o;
  const rnd = azar(semilla);
  const { c, port, portero, tirador } = jugadaFrontal(o);
  const T = { golpe: 320, toca: 1050, fin: 2500 };
  const PECHO = [100, 92];
  const guantes = [-1, 1].map(l => {
    const g = nodo('g', {}, c.delante);
    const dentro = guanteAbierto(g, color);
    if (l < 0) dentro.setAttribute('transform', 'scale(-1 1)');   // los pulgares hacia dentro
    return { l, g };
  });
  const b = balon(c.delante, BLANCO);
  const fant = estela(c.delante, BLANCO, 7);
  const boom = estallido(c.delante, BLANCO, rnd, 8);
  const aro = nodo('circle', { fill: 'none', stroke: color, 'stroke-width': 2.5 }, c.atras);
  const ida = t => disparo(t, T.golpe, T.toca, PECHO, { s0: 1.25, s1: 0.85 });

  function render(ms) {
    const t = ms / escala;
    c.medir();
    animarTirador(tirador, t, T.golpe, { sale: T.toca + 200 });
    const golpeo = t > T.toca ? muelle((t - T.toca) / 1000, 26, 7) : 0;
    const tiembla = t > T.toca + 120 && t < T.toca + 700 ? ruido(t * 3, 2) * 1.3 : 0;
    const e = esperando(t);
    // El portero se echa un poco atrás con el golpe y se queda con el balón
    portero(t < 800 ? e.x : PORTERO.x + tiembla, PORTERO.y + 3 * Math.max(0, golpeo), { rot: t < 800 ? e.rot : tiembla, sx: 1 + 0.03 * Math.max(0, golpeo) });
    // Los guantes salen de los lados de la carta y se cierran sobre el balón
    for (const { l, g } of guantes) {
      const sale = E.outBack(tramo(t, 620, 960), 1.5), cierra = E.outBack(tramo(t, T.toca, T.toca + 140), 2.5);
      const x = PECHO[0] + l * lerp(16, 9.5, cierra) + l * (1 - sale) * 8 + tiembla, y = PECHO[1] + 13 + (1 - sale) * 6 + 3 * Math.max(0, golpeo);
      mover(g, x, y, 0.5, l * lerp(26, 12, cierra), tramo(t, 620, 720));
    }
    // El balón: llega, se aplasta y queda agarrado
    const p = t < T.toca ? ida(t) : { x: PECHO[0] + tiembla, y: PECHO[1] + 3 * Math.max(0, golpeo), s: 0.85 };
    mover(b, p.x, p.y, p.s, t < T.toca ? t * 0.7 : T.toca * 0.7, t < T.golpe ? 0 : 1);
    b.setAttribute('transform', b.getAttribute('transform') + ` scale(${f1((1 + 0.14 * golpeo) * 100) / 100} ${f1((1 - 0.16 * golpeo) * 100) / 100})`);
    fant(t < T.toca ? Array.from({ length: 7 }, (_, k) => ida(Math.max(T.golpe, t - (k + 1) * 32))) : [], t < T.toca ? tramo(t, T.golpe + 60, T.golpe + 200) : 0);
    boom(PECHO[0], PECHO[1], tramo(t, T.toca, T.toca + 380), 38);
    // Brillo de victoria alrededor del portero
    const br = tramo(t, T.toca + 500, T.toca + 1100);
    aro.setAttribute('cx', PORTERO.x); aro.setAttribute('cy', PORTERO.y);
    aro.setAttribute('r', f1(lerp(26, 46, E.outC(br)))); aro.setAttribute('opacity', br > 0 && br < 1 ? Math.round((1 - br) * 80) / 100 : 0);
    port.set(100, 70, 0);
    c.general(0, 0, E.outC(tramo(t, 0, 200)) * (1 - tramo(t, T.fin - 250, T.fin)));
  }
  render(0);
  return { el: c.raiz, render, dur: T.fin * escala, momentos: { golpe: T.golpe * escala, impacto: T.toca * escala } };
}

/* PARADA «ESTIRADA» — el balón va a la escuadra y la carta del portero vuela
   en horizontal hacia ella (con rayas de velocidad). En cámara lenta, el
   guante que asoma por su borde roza el balón, salta una chispa y el balón se
   va fuera por encima del larguero. Sin brazos: vuela la carta entera. */
function paradaEstirada(o = {}) {
  const { color = '#3ddc84', semilla = 1, escala = 1 } = o;
  const rnd = azar(semilla);
  const { c, port, portero, tirador } = jugadaFrontal(o);
  const T = { golpe: 320, toca: 1250, fin: 2700 };
  const lado = rnd() < 0.5 ? -1 : 1;
  const ESQ = [100 + lado * 66, 46];                            // donde la roza
  const ROT = lado * 78, ar = ROT * Math.PI / 180;
  const ALTO = PORTERO.w * 1.4, LGUANTE = 69 * 0.5;
  // Centro de la carta en el toque: la punta del guante (borde de arriba + guante) en ESQ
  const alcance = ALTO / 2 - 3 + LGUANTE;
  const VUELO = [ESQ[0] - Math.sin(ar) * alcance, ESQ[1] + Math.cos(ar) * alcance];
  const mano = nodo('g', {}, c.delante);
  const guante = nodo('g', {}, mano);
  const dentro = guanteAbierto(guante, color);
  if (lado < 0) dentro.setAttribute('transform', 'scale(-1 1)');
  const lineas = Array.from({ length: 4 }, () => nodo('line', { stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round' }, c.atras));
  const b = balon(c.delante, BLANCO);
  const fant = estela(c.delante, BLANCO, 8);
  const boom = estallido(c.delante, '#ffd23a', rnd, 10);
  const BT = [ESQ[0] + Math.sin(ar) * 9, ESQ[1] - Math.cos(ar) * 9];

  // Cámara lenta alrededor del toque
  const lento = (() => {
    const tabla = [0]; let acc = 0;
    for (let ms = 1; ms <= T.fin; ms++) { acc += 1 - 0.72 * Math.exp(-((ms - T.toca) ** 2) / (2 * 240 * 240)); tabla.push(acc); }
    return ms => tabla[Math.max(0, Math.min(T.fin, Math.round(ms)))];
  })();
  const L = lento, tocaL = L(T.toca);
  const ida = u => { const p = E.outQ(tramo(u, L(T.golpe), tocaL)); return { x: lerp(PIES[0], BT[0], p), y: lerp(PIES[1], BT[1], p), s: lerp(1.25, 0.7, p) }; };
  const fuera = u => { const p = E.outC(tramo(u, tocaL, tocaL + 420)); return { x: lerp(BT[0], BT[0] + lado * 34, p), y: lerp(BT[1], -24, p), s: lerp(0.7, 0.5, p) }; };

  function render(ms) {
    const t = ms / escala, u = L(t);
    c.medir();
    animarTirador(tirador, t, T.golpe, { sale: T.toca + 300 });
    // La carta vuela hacia la escuadra y cae después
    const v = E.outC(tramo(u, L(700), tocaL)), cae = E.inQ(tramo(t, T.toca + 350, T.toca + 900));
    const e = esperando(t);
    const cx = lerp(e.x, VUELO[0], v) + cae * lado * 4, cy = lerp(PORTERO.y, VUELO[1], v) + Math.sin(Math.PI * v) * -6 + cae * (P.y1 - 14 - VUELO[1]);
    const rot = lerp(e.rot, ROT, v) + cae * lado * 12;
    portero(cx, cy, { rot, sx: 1 + 0.05 * Math.sin(Math.PI * v) });
    // El guante asoma por el borde de arriba de la carta (sin brazo)
    const rr2 = rot * Math.PI / 180, sale = E.outBack(tramo(u, L(950), tocaL), 1.4) * (1 - E.inQ(tramo(t, T.toca + 250, T.toca + 600)));
    const d0 = ALTO / 2 - 3 - 18 * (1 - sale);
    guante.setAttribute('transform', `translate(${f1(cx + Math.sin(rr2) * d0)} ${f1(cy - Math.cos(rr2) * d0)}) rotate(${f1(rot)}) scale(0.5)`);
    mano.setAttribute('opacity', Math.round(tramo(u, L(950), L(1020)) * (1 - tramo(t, T.toca + 300, T.toca + 600)) * 100) / 100);
    // Rayas de velocidad detrás de la carta
    const vel = tramo(u, L(720), L(800)) * (1 - tramo(t, T.toca - 50, T.toca + 250));
    lineas.forEach((ln, k) => {
      const off = (k - 1.5) * 9, nx = Math.cos(rr2) * off, ny = Math.sin(rr2) * off, len = 22 + (k % 2) * 12;
      const x1 = cx - lado * 26 + nx, y1 = cy + 6 + ny;
      ln.setAttribute('x1', f1(x1)); ln.setAttribute('y1', f1(y1)); ln.setAttribute('x2', f1(x1 - lado * len)); ln.setAttribute('y2', f1(y1 + 8));
      ln.setAttribute('opacity', Math.round(vel * 60) / 100);
    });
    // El balón y el desvío
    const p = u < tocaL ? ida(u) : fuera(u);
    mover(b, p.x, p.y, p.s, u * (u < tocaL ? 0.9 : -2.4) * lado, t < T.golpe ? 0 : 1);
    fant(Array.from({ length: 8 }, (_, k) => (u < tocaL ? ida(Math.max(L(T.golpe), u - (k + 1) * 22)) : fuera(Math.max(tocaL, u - (k + 1) * 22)))), t < T.golpe + 60 ? 0 : 1 - tramo(u, tocaL + 300, tocaL + 420));
    boom(ESQ[0], ESQ[1], tramo(t, T.toca - 20, T.toca + 420), 30);
    port.set(100, 70, 0);
    c.general(0, 0, E.outC(tramo(t, 0, 200)) * (1 - tramo(t, T.fin - 250, T.fin)));
  }
  render(0);
  return { el: c.raiz, render, dur: T.fin * escala, momentos: { golpe: T.golpe * escala, impacto: T.toca * escala } };
}

/* ════════════════════════════════════════════════════════════════════════
   CHUT — el choque, mientras pelea la barra (va antes del gol o la parada)
   ════════════════════════════════════════════════════════════════════════

   Estilo anime: la carta del tirador, en grande, clava la bota en el balón y
   el balón se aplasta contra ella, vibrando, mientras desde la portería la
   fuerza del portero (su color) empuja hacia abajo. Rayas de concentración
   alrededor, chispas en el punto de choque y todo temblando cada vez más.
   En `suelta` (el golpe final de la barra) hay un fogonazo y el balón sale
   disparado hacia la portería. No dice si es gol: eso lo cuenta la viñeta
   siguiente.

   Opciones extra:
     dur      ms totales (lo que dure la escena del chut con su barra)
     suelta   ms en que el balón sale disparado (el golpe final de la barra);
              por defecto dur − 450
     p        probabilidad de gol (0–1): el balón se inclina hacia el que
              tiene más fuerza mientras pelean
     colorRival  color del equipo del portero */
function chutChoque(o = {}) {
  const { color = '#3ddc84', colorRival = '#ff8a3d', semilla = 1, p = 0.5 } = o;
  const dur = o.dur ?? 3200, suelta = o.suelta ?? dur - 450;
  const rnd = azar(semilla);
  const c = capas();
  const ENTRA = 420;                                   // ms en llegar a la pose del choque
  const BOLA = [100, 100];                              // donde chocan
  // Rayas de concentración (fondo)
  const capaRayas = nodo('g', {}, c.atras);
  const rayasC = Array.from({ length: 34 }, (_, k) => ({ a: (k / 34) * Math.PI * 2 + rnd() * 0.15, f: rnd(), el: nodo('line', { stroke: BLANCO, 'stroke-linecap': 'round' }, capaRayas) }));
  // La portería al fondo, pequeña, y la fuerza del portero (ondas de su color)
  const fondoP = nodo('g', { opacity: 0.5 }, c.atras);
  trazo(fondoP, { color: NEUTRO, w: 3, d: 'M62 50V14H138V50' });
  const ondas = Array.from({ length: 4 }, () => nodo('path', { fill: 'none', stroke: colorRival, 'stroke-width': 3, 'stroke-linecap': 'round' }, c.atras));
  const auraR = nodo('circle', { fill: colorRival, opacity: 0.12 }, c.atras);
  const auraA = nodo('circle', { fill: color, opacity: 0.16 }, c.atras);
  const portero = hueco(c, o.cartas?.portero, 26);
  const tirador = hueco(c, o.cartas?.tirador, 62);
  // Bota, balón, chispas
  const pie = bota(c.delante, color);
  const b = balon(c.delante, BLANCO);
  const chispas = Array.from({ length: 16 }, () => ({ a: rnd(), v: 0.6 + rnd() * 0.8, f: rnd(), el: nodo('line', { stroke: rnd() < 0.5 ? color : '#ffe27a', 'stroke-width': 2, 'stroke-linecap': 'round' }, c.delante) }));
  const flash = nodo('circle', { fill: BLANCO }, c.delante);
  const boom = estallido(c.delante, color, rnd, 14);
  const fant = estela(c.delante, BLANCO, 6);

  function render(ms) {
    const t = ms;
    c.medir();
    const lucha = tramo(t, ENTRA, suelta);                // 0→1 durante el choque
    const fuerza = t < suelta ? E.inQ(lucha) : 0;          // la tensión sube hasta soltar
    const tras = tramo(t, suelta, suelta + 420);
    const vib = t < suelta ? (0.6 + 2.6 * fuerza) : 4 * (1 - tras);
    const jx = ruido(t * 3.1, 1) * vib, jy = ruido(t * 3.3, 2) * vib;
    // Quién empuja más: el balón se inclina un poco
    const ventaja = (p - 0.5) * 2 * Math.sin(t * 0.004) * 0.5 + (p - 0.5);
    // Rayas de concentración: parpadean y se cierran con la tensión; al soltar, salen hacia fuera
    rayasC.forEach((r, k) => {
      const on = (Math.sin(t * 0.05 + r.f * 40) > -0.2) ? 1 : 0;
      const r0 = t < suelta ? lerp(120, 62 - 22 * fuerza, E.outC(tramo(t, 0, ENTRA))) : lerp(40, 150, E.outC(tras));
      const r1 = 150 + r.f * 30;
      r.el.setAttribute('x1', f1(BOLA[0] + Math.cos(r.a) * r0)); r.el.setAttribute('y1', f1(BOLA[1] + Math.sin(r.a) * r0));
      r.el.setAttribute('x2', f1(BOLA[0] + Math.cos(r.a) * r1)); r.el.setAttribute('y2', f1(BOLA[1] + Math.sin(r.a) * r1));
      r.el.setAttribute('stroke-width', f1(0.8 + r.f * 1.6 + fuerza));
      r.el.setAttribute('opacity', Math.round(on * (0.12 + 0.3 * fuerza + 0.4 * (t > suelta ? 1 - tras : 0)) * 100) / 100);
    });
    // El portero al fondo, dentro de la portería, y sus ondas bajando hacia el balón
    portero(100 + jx * 0.3, 36 + jy * 0.3, { op: tramo(t, 0, 300) * 0.95 });
    ondas.forEach((w, k) => {
      const q = ((t * 0.0016 + k / 4) % 1);
      const y = lerp(56, BOLA[1] - 22, q), ancho = lerp(26, 40, q);
      w.setAttribute('d', `M${f1(100 - ancho)} ${f1(y - 6)}Q100 ${f1(y + 8)} ${f1(100 + ancho)} ${f1(y - 6)}`);
      w.setAttribute('opacity', t < suelta ? Math.round(Math.sin(Math.PI * q) * (0.25 + 0.5 * fuerza) * 100) / 100 : 0);
    });
    const pul = 1 + 0.06 * Math.sin(t * 0.03);
    auraR.setAttribute('cx', 100); auraR.setAttribute('cy', 70); auraR.setAttribute('r', f1((26 + 18 * fuerza * (1 - p)) * pul));
    auraA.setAttribute('cx', BOLA[0]); auraA.setAttribute('cy', BOLA[1] + 10); auraA.setAttribute('r', f1((t < suelta ? 22 + 22 * fuerza * p : 22 * (1 - tras)) * pul));
    // El tirador entra desde abajo y se queda clavado en el choque; al soltar, acompaña
    const ent = E.outBack(tramo(t, 0, ENTRA), 1.3);
    const empuje = t < suelta ? fuerza * 4 : -8 * Math.sin(Math.PI * tras);
    tirador(108 + jx, lerp(230, 168, ent) - empuje + jy, { rot: t < suelta ? lerp(12, -6, ent) : lerp(-6, 6, E.outQ(tras)), sy: 1 - 0.03 * fuerza });
    // La bota sale del borde de arriba de la carta y se clava en el balón
    const bx = BOLA[0] + 14 + jx, by = BOLA[1] + 21 + jy - empuje * 0.5;
    mover(pie, bx, by, 0.5, t < suelta ? -38 : lerp(-38, -60, E.outC(tras)), tramo(t, ENTRA - 150, ENTRA) * (1 - tramo(t, suelta + 250, suelta + 420)));
    // El balón: llega rodando, se aplasta contra la bota vibrando y sale disparado
    let x, y, sc, rot, sx = 1, sy = 1;
    const vuela = u => { const q = E.inQ(tramo(u, suelta, suelta + 300)); return { x: lerp(BOLA[0] + jx, 100, q), y: lerp(BOLA[1], 40, q), s: lerp(1.7, 0.4, q) }; };
    if (t < ENTRA) { const q = E.outC(tramo(t, 0, ENTRA)); x = lerp(40, BOLA[0], q); y = lerp(150, BOLA[1], q); sc = 1.7; rot = t * 1.2; }
    else if (t < suelta) {
      const ap = 0.1 + 0.14 * fuerza, osc = Math.sin(t * 0.09) * 0.5 + 0.5;
      x = BOLA[0] + jx + ventaja * 3; y = BOLA[1] + jy - ventaja * 4; sc = 1.7; rot = t * (1.2 + fuerza * 3);
      sx = 1 + ap * (0.6 + 0.4 * osc); sy = 1 - ap * (0.7 + 0.3 * osc);
    } else { ({ x, y, s: sc } = vuela(t)); rot = t * 4; const st = 1 - tras; sx = 1 - 0.2 * st; sy = 1 + 0.35 * st; }
    mover(b, x, y, sc, rot, t > suelta + 300 ? 1 - tramo(t, suelta + 300, suelta + 380) : 1);
    b.setAttribute('transform', b.getAttribute('transform') + ` scale(${Math.round(sx * 100) / 100} ${Math.round(sy * 100) / 100})`);
    fant(t > suelta ? Array.from({ length: 6 }, (_, k) => vuela(Math.max(suelta, t - (k + 1) * 24))) : [], t > suelta ? 1 - tramo(t, suelta + 250, suelta + 380) : 0);
    // Chispas que saltan en el punto de choque
    chispas.forEach((ch, k) => {
      const vida = (t * 0.0024 * ch.v + ch.f) % 1, a = -Math.PI * (0.05 + 0.9 * ((ch.a + Math.floor(t * 0.0024 * ch.v + ch.f) * 0.618) % 1));
      const ox = BOLA[0] + 6 + jx, oy = BOLA[1] + 14 + jy, d0 = 6 + vida * (18 + 26 * fuerza), d1 = d0 + 4 + 8 * fuerza;
      ch.el.setAttribute('x1', f1(ox + Math.cos(a) * d0)); ch.el.setAttribute('y1', f1(oy + Math.sin(a) * d0));
      ch.el.setAttribute('x2', f1(ox + Math.cos(a) * d1)); ch.el.setAttribute('y2', f1(oy + Math.sin(a) * d1));
      ch.el.setAttribute('opacity', t > ENTRA && t < suelta ? Math.round((1 - vida) * (0.3 + 0.7 * fuerza) * 100) / 100 : 0);
    });
    // Fogonazo al soltar
    const fl = tramo(t, suelta, suelta + 260);
    flash.setAttribute('cx', BOLA[0]); flash.setAttribute('cy', BOLA[1]);
    flash.setAttribute('r', f1(lerp(10, 90, E.outC(fl)))); flash.setAttribute('opacity', fl > 0 && fl < 1 ? Math.round((1 - fl) * 55) / 100 : 0);
    boom(BOLA[0], BOLA[1], tramo(t, suelta, suelta + 450), 70);
    c.general(jx * 0.4, jy * 0.4, E.outC(tramo(t, 0, 160)) * (1 - tramo(t, dur - 150, dur)));
  }
  render(0);
  return { el: c.raiz, render, dur, momentos: { suelta } };
}

/* ════════════════════════════════════════════════════════════════════════
   TÁCTICAS — el cruce del principio y el cambio del plan B
   ════════════════════════════════════════════════════════════════════════

   Las tácticas son medallones con su icono (los de img/slr/tacticas/), en el
   color de cada equipo: el rival arriba y tu equipo (o el local) abajo, como
   en el resto de la reproducción.

   VINETAS.tacticas.choque({ abajo, arriba, gana, ventaja, semilla, escala })
     abajo / arriba  { tactica: 'posesion'|'contraataque'|'presion', color }   (los nombres ya salen en el marcador)
     gana     'abajo' | 'arriba' | null (misma táctica). Si no se pasa, se calcula
              con la regla del motor (contraataque > posesión > presión > contraataque)
     ventaja  el texto del premio del cruce, p. ej. '+6 %' (el BONUS_CRUCE del motor)
   Los dos medallones entran, se arman, chocan en el centro (fogonazo y chispas) y
   el que gana el cruce crece y empuja mientras sale su «+6 %»; el otro se encoge
   y se apaga. Si son la misma táctica, rebotan iguales: «SIN VENTAJA».

   VINETAS.tacticas.cambio({ equipo: { de, a, color, nombre }, lado, condicion, semilla, escala })
     lado       'abajo' | 'arriba' (dónde está ese equipo en la pantalla)
     condicion  'ganando' | 'empatando' | 'perdiendo' (por qué salta el plan B)
   El plan B al descanso: «PLAN B», el medallón gira como una moneda y, al
   darse la vuelta, ya es la táctica nueva. Después se puede reproducir otro
   choque con el cruce nuevo. */
const ICONO_TACTICA = {"posesion": "M2.6 455.9C-2.1 452.2 -1.0 449.8 9.9 438.6L19.9 428.5L9.9 418.3C-0.8 407.3 -1.9 404.8 2.2 401.0C3.4 399.9 5.3 399.0 6.3 399.0C7.5 399.0 12.6 403.3 18.6 409.2L29.0 419.4L39.4 409.2C45.2 403.4 50.5 399.0 51.6 399.0C55.1 399.0 58.0 401.9 58.0 405.3C58.0 408.0 56.5 410.0 48.0 418.5L38.0 428.5L48.0 438.5C56.6 447.0 58.0 448.9 58.0 451.7C58.0 455.7 54.4 458.6 50.8 457.5C49.5 457.1 44.1 452.4 38.7 447.2L29.0 437.6L18.6 447.8C12.9 453.4 7.6 458.0 6.8 458.0C5.9 458.0 4.1 457.1 2.6 455.9ZM340.0 456.1C333.4 453.8 326.0 446.4 324.2 440.3C321.2 430.4 323.4 421.7 330.5 414.3C335.4 409.3 342.5 406.0 348.5 406.0C353.3 406.0 361.3 409.3 365.2 412.8C385.9 431.5 366.2 465.3 340.0 456.1ZM354.4 443.5C360.7 440.5 363.2 431.6 359.5 425.3C354.3 416.5 341.0 417.1 336.7 426.3C334.6 430.7 334.6 433.3 336.7 437.7C339.8 444.3 347.5 446.8 354.4 443.5ZM153.5 406.0C139.9 404.8 122.0 402.1 119.9 400.9C117.7 399.8 116.6 396.6 117.4 393.6C117.8 392.0 120.4 390.3 126.7 387.3C131.5 385.0 139.1 381.1 143.4 378.6C152.5 373.3 156.2 372.8 158.6 376.5C161.3 380.7 159.8 383.4 152.0 388.1C148.1 390.4 145.1 392.4 145.3 392.6C145.4 392.8 154.8 393.4 166.1 394.1C196.1 395.8 227.7 393.6 257.0 387.9C317.2 376.2 368.1 350.4 409.4 310.9C414.8 305.8 418.8 301.4 418.2 301.2C417.6 301.0 408.6 301.8 398.0 302.9C387.4 304.1 376.9 305.0 374.6 305.0C369.8 305.0 367.0 302.8 367.0 299.2C367.0 296.9 370.2 293.0 372.1 293.0C374.3 293.0 431.5 287.0 433.4 286.6C436.2 285.9 440.0 288.1 440.7 290.8C441.2 293.0 434.5 354.6 433.4 357.5C433.1 358.2 431.5 359.4 429.9 360.0C427.5 361.0 426.6 361.0 424.5 359.6C421.4 357.5 421.3 355.3 424.0 333.0C425.1 323.9 426.0 315.7 426.0 314.6C426.0 313.3 423.2 315.3 416.2 321.7C364.1 369.5 306.6 395.2 231.0 404.5C216.2 406.4 168.0 407.3 153.5 406.0ZM179.0 363.0C175.5 359.5 176.5 357.0 184.2 350.1C198.1 337.7 217.7 317.4 225.9 307.0C230.5 301.2 235.3 296.1 236.6 295.6C242.1 293.4 246.9 299.5 243.6 304.5C231.5 323.0 189.6 365.0 183.3 365.0C182.1 365.0 180.1 364.1 179.0 363.0ZM41.5 356.6C32.2 352.3 27.0 344.1 27.0 333.6C27.0 316.3 42.8 304.3 59.5 309.0C65.0 310.5 72.3 316.7 75.3 322.4C78.7 328.8 78.4 338.9 74.6 345.8C67.9 357.8 53.9 362.4 41.5 356.6ZM57.5 345.6C66.5 341.8 67.6 327.9 59.3 322.5C50.6 316.7 38.3 324.3 39.3 334.8C39.8 339.4 41.7 342.2 46.5 345.1C50.1 347.4 52.9 347.5 57.5 345.6ZM307.5 322.1C291.9 315.1 287.4 294.4 298.7 281.9C304.4 275.6 309.2 273.6 318.1 273.5C324.8 273.5 326.2 273.8 330.5 276.5C342.8 284.1 347.0 298.6 340.6 310.9C338.5 314.8 332.0 320.7 327.8 322.5C322.7 324.6 312.5 324.4 307.5 322.1ZM323.7 310.3C328.9 307.9 331.2 303.6 330.7 297.6C329.8 287.8 319.5 282.7 310.9 287.7C302.5 292.6 303.4 306.7 312.3 310.5C316.6 312.4 319.5 312.3 323.7 310.3ZM109.6 308.8C108.7 307.6 108.0 305.7 108.0 304.7C108.0 303.7 112.6 298.2 118.2 292.4L128.3 282.0L118.2 271.6C112.3 265.6 108.0 260.5 108.0 259.3C108.0 258.3 108.9 256.4 110.0 255.2C113.8 251.1 116.3 252.2 127.3 262.9L137.5 272.9L147.6 262.9C158.8 252.0 161.2 250.9 164.9 255.6C166.1 257.1 167.0 258.9 167.0 259.8C167.0 260.6 162.4 265.9 156.8 271.6L146.6 282.0L156.2 291.7C161.4 297.1 166.1 302.5 166.5 303.8C167.6 307.4 164.7 311.0 160.7 311.0C157.9 311.0 156.0 309.6 147.5 301.0L137.5 291.0L127.5 301.0C119.0 309.5 117.0 311.0 114.3 311.0C112.1 311.0 110.6 310.3 109.6 308.8ZM254.2 274.7C253.0 273.4 252.0 271.8 252.0 271.1C252.0 270.3 254.7 264.7 257.9 258.6C265.9 243.7 273.7 225.5 279.5 208.5C284.7 193.3 286.1 191.0 289.7 191.0C292.5 191.0 296.0 194.3 296.0 196.9C296.0 200.1 286.2 227.6 280.3 241.0C277.2 247.9 272.3 258.1 269.3 263.8C262.2 277.1 258.8 279.6 254.2 274.7ZM455.7 271.2C452.0 267.2 453.4 264.3 464.0 253.6L474.0 243.4L464.0 233.5C453.5 223.1 452.0 220.1 455.6 216.6C459.1 213.0 462.1 214.5 472.5 225.0L482.4 235.0L492.6 225.0C501.0 216.7 503.2 215.0 505.8 215.0C509.1 215.0 512.0 217.9 512.0 221.4C512.0 222.5 507.6 227.8 501.8 233.6L491.6 244.0L501.8 254.4C512.5 265.3 513.6 267.4 510.0 271.0C506.0 275.0 503.5 273.8 492.9 262.8L483.0 252.5L472.7 262.8C461.9 273.6 459.1 275.0 455.7 271.2ZM376.0 251.5C361.1 246.9 354.0 228.9 361.5 215.1C366.3 206.4 374.1 201.8 384.0 201.8C393.9 201.8 401.7 206.4 406.5 215.1C414.1 229.1 406.8 247.0 391.6 251.5C385.6 253.3 381.9 253.3 376.0 251.5ZM392.6 236.7C401.3 228.7 395.8 214.0 384.0 214.0C372.2 214.0 366.7 228.7 375.4 236.7C378.4 239.5 379.7 240.0 384.0 240.0C388.3 240.0 389.6 239.5 392.6 236.7ZM180.5 233.7C160.6 224.2 159.7 197.5 178.9 187.8C192.6 180.8 209.1 187.1 214.5 201.4C216.6 206.9 216.2 216.8 213.6 221.8C207.5 233.7 192.1 239.2 180.5 233.7ZM199.5 219.6C203.9 215.4 204.9 210.5 202.4 205.3C200.1 200.7 194.8 197.0 190.5 197.0C186.2 197.0 180.9 200.7 178.7 205.2C176.2 210.3 177.3 215.5 181.6 219.7C187.0 224.7 194.1 224.7 199.5 219.6ZM328.4 188.2C327.8 187.8 322.7 178.8 317.2 168.1L307.2 148.7L305.9 156.5C304.6 164.7 302.6 168.0 299.1 168.0C292.9 168.0 291.6 164.7 293.6 154.0C294.5 149.6 295.0 145.5 294.8 144.9C294.6 144.4 286.2 150.7 276.2 159.0C266.1 167.2 257.0 174.0 255.9 174.0C253.2 174.0 250.0 170.4 250.0 167.4C250.0 164.3 249.2 165.0 279.3 140.1C302.1 121.2 304.7 119.7 308.2 123.8C310.9 126.9 338.0 181.3 338.0 183.6C338.0 184.8 337.3 186.6 336.4 187.4C334.8 189.1 330.3 189.5 328.4 188.2ZM279.2 111.4C277.7 110.4 277.0 108.9 277.0 106.8C277.0 104.2 278.7 102.0 287.0 93.6L297.0 83.4L287.0 73.5C276.2 62.7 275.0 60.0 279.1 55.9C282.4 52.6 285.6 54.2 296.2 64.8L306.0 74.4L316.5 64.1C326.0 54.7 327.2 53.8 329.7 54.4C331.3 54.8 333.1 55.8 333.8 56.7C336.6 60.5 335.3 63.0 325.0 73.4L315.1 83.5L325.0 93.6C335.7 104.5 336.9 107.1 333.0 111.0C329.4 114.6 327.3 113.5 316.4 102.8L306.0 92.6L295.6 102.8C289.8 108.6 284.5 113.0 283.4 113.0C282.3 113.0 280.4 112.3 279.2 111.4Z", "contraataque": "M11.8 511.3C9.6 510.7 8.9 508.5 9.9 505.7C10.4 504.4 14.7 499.8 19.4 495.4C50.9 466.1 78.0 421.2 78.0 398.2C78.0 388.5 73.2 382.4 63.7 379.8C57.6 378.2 49.5 380.1 40.0 385.5C31.6 390.3 28.8 390.8 26.1 388.1C23.4 385.4 23.4 380.5 26.0 357.2C38.3 249.3 70.2 159.1 117.8 97.0C127.4 84.5 144.7 67.2 148.7 66.1C152.3 65.1 158.6 66.2 160.6 68.2C161.6 69.3 161.2 70.7 157.9 76.0C138.4 107.7 128.9 141.5 128.9 179.1C128.9 231.5 149.0 280.0 186.0 317.0C222.9 353.9 271.5 374.0 324.0 374.0C377.2 374.0 425.1 354.0 463.0 315.9C469.3 309.6 474.4 305.2 475.2 305.5C478.2 306.7 481.2 312.9 481.2 317.8C481.2 324.7 475.2 341.7 466.5 359.5C435.6 422.9 370.2 472.1 281.5 498.5C268.9 502.3 265.8 502.3 263.9 498.9C263.0 497.1 263.4 495.4 266.5 488.8C271.7 477.9 272.3 470.1 268.7 462.8C261.4 448.2 246.3 447.3 219.1 459.9C181.0 477.6 126.7 492.6 50.0 506.5C21.3 511.7 15.8 512.4 11.8 511.3ZM309.5 357.0C275.8 354.2 243.9 342.1 216.5 321.6C206.2 314.0 189.0 296.8 181.4 286.5C147.2 240.9 136.7 183.0 152.5 128.5C166.6 80.0 201.6 39.1 247.3 17.5C285.5 -0.5 326.5 -4.6 367.2 5.6C398.9 13.5 425.7 28.5 448.9 51.3C473.2 75.2 489.3 103.3 497.4 135.6C501.2 151.1 502.4 162.1 502.3 180.5C502.2 206.0 498.0 226.5 488.4 249.0C468.5 295.6 428.8 332.3 381.0 348.4C357.6 356.2 334.5 359.0 309.5 357.0ZM353.2 338.5L363.0 336.7L375.1 308.1C381.8 292.4 387.5 278.7 387.7 277.8C388.0 276.8 382.8 269.2 373.5 257.1L358.9 238.0L324.0 238.0L289.1 238.0L274.5 257.1C265.2 269.2 260.0 276.8 260.3 277.8C260.5 278.7 266.2 292.4 272.9 308.1L285.1 336.7L295.3 338.4C300.9 339.3 306.6 340.2 308.0 340.4C314.2 341.5 344.1 340.2 353.2 338.5ZM262.0 246.0C270.3 235.3 276.9 225.8 276.9 225.0C276.8 224.2 272.5 210.5 267.2 194.6L257.5 165.7L235.0 158.4C222.6 154.3 212.0 151.0 211.3 151.0C210.7 151.0 199.5 160.8 186.5 172.8L162.8 194.5L163.4 200.9C164.7 213.9 169.6 230.9 176.3 245.5C178.5 250.4 180.7 254.9 181.2 255.5C182.0 256.4 241.9 266.0 245.3 265.7C246.3 265.6 253.3 257.4 262.0 246.0ZM432.7 261.5C449.7 259.0 464.3 256.6 465.3 256.2C466.3 255.8 469.0 251.2 471.4 246.0C478.4 231.0 483.2 214.2 484.6 200.9L485.2 194.5L461.5 172.8C448.5 160.8 437.3 151.0 436.7 151.0C436.0 151.0 425.4 154.3 413.0 158.4L390.5 165.7L380.8 194.6C375.5 210.5 371.2 224.2 371.1 225.0C371.0 226.3 400.6 266.0 401.6 266.0C401.8 266.0 415.8 264.0 432.7 261.5ZM290.5 131.7L315.5 113.5L315.7 88.0L316.0 62.5L288.3 47.0C273.1 38.5 259.8 31.4 258.9 31.2C252.9 30.1 218.9 53.4 205.9 67.6L203.2 70.5L209.5 102.3C212.9 119.8 215.9 134.2 216.1 134.4C217.1 135.2 261.7 149.8 263.5 149.9C264.6 149.9 276.8 141.8 290.5 131.7ZM408.5 142.4C421.1 138.2 431.7 134.6 431.9 134.4C432.1 134.2 435.1 119.8 438.5 102.3L444.8 70.5L442.1 67.6C429.1 53.4 395.1 30.1 389.1 31.2C388.2 31.4 374.9 38.5 359.7 47.0L332.0 62.5L332.3 88.0L332.5 113.5L357.5 131.7C371.2 141.8 383.2 150.0 384.0 150.0C384.8 150.0 395.8 146.6 408.5 142.4Z", "presion": "M48.9 467.3C47.4 466.4 45.5 464.4 44.6 462.9C43.1 460.4 43.0 442.6 43.0 256.0C43.0 68.8 43.1 51.6 44.6 49.0C48.2 43.0 48.2 43.0 89.8 43.0C131.6 43.0 129.0 42.6 129.0 49.1C129.0 53.6 131.8 66.5 134.6 74.9C144.5 104.5 164.8 129.6 191.7 145.3C205.5 153.4 220.7 158.4 241.2 161.5L245.0 162.1L245.0 177.2L245.0 192.3L237.0 184.5C229.3 177.0 228.8 176.8 225.2 177.3C220.6 178.1 218.0 181.1 218.0 185.8C218.0 189.0 219.2 190.6 230.8 202.3C244.1 215.9 247.3 218.0 254.1 218.0C260.6 218.0 263.8 215.8 277.3 202.1C288.6 190.7 290.0 189.0 290.0 185.9C289.9 182.1 288.6 179.9 285.3 178.2C281.1 175.9 278.9 176.8 271.1 184.5C266.8 188.6 263.1 192.0 262.7 192.0C262.3 192.0 262.0 185.3 262.0 177.1L262.0 162.1L266.8 161.5C283.7 159.3 296.9 155.2 311.0 148.0C339.2 133.4 361.3 107.9 372.4 77.2C375.3 69.0 379.0 52.0 379.0 46.6L379.0 43.0L419.8 43.0C463.8 43.1 463.4 43.0 467.1 48.6C468.9 51.4 469.0 55.5 469.0 256.0C469.0 456.5 468.9 460.6 467.1 463.4C463.5 468.8 462.9 468.9 430.8 469.0L401.0 469.0L401.0 405.2C401.0 333.2 401.3 335.8 393.4 327.1C390.8 324.2 386.5 320.9 383.2 319.3C377.5 316.5 377.3 316.5 355.0 316.2L332.4 315.9L331.2 309.3C325.9 281.2 302.9 257.6 273.5 250.0C262.5 247.1 245.6 247.1 234.5 249.9C205.6 257.3 182.3 280.9 176.7 308.6L175.3 315.5L154.9 316.0C135.1 316.5 134.3 316.6 128.8 319.3C125.5 320.9 121.2 324.2 118.6 327.1C110.7 335.8 111.0 333.2 111.0 405.2L111.0 469.0L81.2 469.0C55.5 469.0 51.1 468.7 48.9 467.3ZM128.0 406.2C128.0 345.7 128.1 343.4 130.0 340.3C131.0 338.5 133.7 336.2 135.9 335.0C139.9 333.0 141.1 333.0 256.2 333.0C367.5 333.0 372.7 333.1 376.0 334.9C377.9 335.9 380.5 338.2 381.8 340.0L384.0 343.3L384.0 406.1L384.0 469.0L356.6 469.0L329.2 469.0L328.8 446.8C328.2 421.9 327.5 418.3 321.4 411.2C319.5 408.9 315.4 405.9 312.2 404.3L306.5 401.5L259.1 401.2C227.7 401.0 210.0 401.3 206.5 402.0C196.7 404.0 187.7 411.9 184.9 420.9C184.3 422.9 183.5 434.4 183.3 446.8L182.8 469.0L155.4 469.0L128.0 469.0L128.0 406.2ZM201.0 447.2C201.0 423.0 201.2 422.1 207.6 419.4C212.5 417.3 299.5 417.3 304.4 419.4C310.8 422.1 311.0 423.0 311.0 447.2L311.0 469.0L256.0 469.0L201.0 469.0L201.0 447.2ZM193.0 314.2C193.0 313.3 193.7 310.3 194.5 307.7C198.9 293.2 211.6 278.2 225.0 271.7C235.2 266.7 242.7 265.0 254.0 265.0C271.6 265.0 285.6 270.6 297.6 282.5C306.8 291.6 311.9 300.8 314.5 312.8L315.2 316.0L254.1 316.0C196.6 316.0 193.0 315.9 193.0 314.2ZM135.5 268.5C137.5 268.0 142.9 263.5 152.2 254.2C164.8 241.8 166.0 240.3 166.0 237.0C165.9 233.1 164.6 230.9 161.2 229.1C157.3 227.0 153.9 228.7 146.2 236.3L139.0 243.4L139.0 185.2C139.0 123.6 138.9 122.3 134.5 120.6C131.1 119.3 126.6 120.0 124.3 122.2L122.0 124.3L122.0 183.7C122.0 216.3 121.7 243.0 121.3 243.0C120.9 243.0 117.3 239.8 113.3 235.8C107.0 229.5 105.6 228.6 102.4 228.6C97.9 228.6 94.0 232.6 94.0 237.2C94.0 239.9 95.9 242.3 106.8 253.2C113.8 260.3 120.4 266.7 121.5 267.3C123.7 268.5 129.9 269.8 131.5 269.4C132.1 269.3 133.8 268.9 135.5 268.5ZM390.5 267.3C391.6 266.7 398.2 260.3 405.2 253.2C416.1 242.3 418.0 239.9 418.0 237.2C418.0 232.6 414.1 228.6 409.6 228.6C406.4 228.6 405.0 229.5 398.7 235.8C394.7 239.8 391.1 243.0 390.7 243.0C390.3 243.0 390.0 216.4 390.0 183.8L390.0 124.6L387.8 122.3C385.7 120.0 381.1 119.3 377.5 120.6C373.1 122.3 373.0 123.6 373.0 185.1L373.0 243.3L365.7 236.2C357.5 228.3 354.7 227.1 350.2 229.4C346.9 231.1 346.0 232.7 346.0 237.4C346.0 240.2 347.8 242.3 359.8 254.2C369.1 263.5 374.5 268.1 376.5 268.5C378.1 268.9 379.9 269.3 380.5 269.4C382.0 269.8 388.3 268.4 390.5 267.3ZM235.5 143.4C213.3 139.4 194.3 129.4 177.9 113.1C160.7 95.9 149.2 73.1 146.2 49.8L145.3 43.0L253.7 43.0L362.0 43.0L362.0 45.4C362.0 49.9 358.9 64.2 356.3 71.3C346.2 99.4 326.9 121.2 300.6 134.0C290.5 139.0 275.6 143.5 267.0 144.1L262.5 144.5L262.0 108.0C261.7 87.9 261.3 71.4 261.2 71.3C261.1 71.2 259.6 70.3 257.9 69.5C253.6 67.2 249.4 68.4 246.9 72.3C245.1 75.3 245.0 77.7 245.0 110.2C245.0 129.4 244.7 145.0 244.2 144.9C243.8 144.9 239.9 144.2 235.5 143.4Z"};
const NOMBRE_TACTICA = { posesion: 'POSESIÓN', contraataque: 'CONTRAATAQUE', presion: 'PRESIÓN' };
const GANA_A = { contraataque: 'posesion', posesion: 'presion', presion: 'contraataque' };   // la clave gana al valor

// Un medallón de táctica: anillo del color del equipo, icono dentro y el nombre debajo
function medallon(padre, color, lado = 'abajo') {
  const g = nodo('g', {}, padre);
  nodo('circle', { r: 40, fill: color, opacity: 0.16 }, g);
  const aro = nodo('circle', { r: 30, fill: OSCURO, stroke: color, 'stroke-width': 3.5 }, g);
  nodo('circle', { r: 24.5, fill: 'none', stroke: color, 'stroke-width': 1.2, opacity: 0.45 }, g);
  const ico = nodo('g', {}, g);
  const path = nodo('path', { fill: color, 'fill-rule': 'evenodd', transform: 'scale(0.068) translate(-256 -256)' }, ico);
  const txt = nodo('text', { y: lado === 'arriba' ? -37 : 47, 'text-anchor': 'middle', fill: color, 'font-size': 13, 'font-family': ANTON, 'font-weight': 400, 'letter-spacing': 0.5 }, g);
  const poner = t => { path.setAttribute('d', ICONO_TACTICA[t] || ''); txt.textContent = NOMBRE_TACTICA[t] || ''; };
  return { g, ico, aro, txt, poner };
}
// Textos con las fuentes de la app: Anton para lo grande (con el mismo brillo de
// color que los rótulos de la reproducción) y Sora para lo pequeño
const ANTON = "'Anton', sans-serif", SORA = "'Sora', sans-serif";
function letrero(padre, color, tam = 20, { fuente = 'anton' } = {}) {
  const g = nodo('g', {}, padre);
  const grande = fuente === 'anton';
  const base = { 'text-anchor': 'middle', 'font-size': tam, 'font-family': grande ? ANTON : SORA, 'font-weight': grande ? 400 : 700, 'letter-spacing': grande ? tam * 0.02 : tam * 0.08 };
  const sombra = nodo('text', { ...base, fill: '#000', opacity: 0.5, y: tam * 0.06 }, g);
  const brillo = grande ? nodo('text', { ...base, fill: 'none', stroke: color, 'stroke-width': tam * 0.22, 'stroke-linejoin': 'round', opacity: 0.22 }, g) : null;
  const t = nodo('text', { ...base, fill: color }, g);
  return { g, texto(s) { sombra.textContent = s; t.textContent = s; if (brillo) brillo.textContent = s; } };
}

function tacticasChoque(o = {}) {
  const { semilla = 1, escala = 1, ventaja = '+6 %' } = o;
  const rnd = azar(semilla);
  const lista = ['posesion', 'contraataque', 'presion'];
  const abajo = { tactica: lista[Math.floor(rnd() * 3)], color: '#3ddc84', ...o.abajo };
  const arriba = { tactica: lista[Math.floor(rnd() * 3)], color: '#ff8a3d', ...o.arriba };
  const gana = o.gana !== undefined ? o.gana
    : abajo.tactica === arriba.tactica ? null
    : GANA_A[abajo.tactica] === arriba.tactica ? 'abajo' : 'arriba';
  const T = { entra: 520, arma: [560, 900], choque: 1060, empuja: [1060, 1500], fin: 3000 };
  const c = capas();
  const rayasF = Array.from({ length: 22 }, (_, k) => ({ a: (k / 22) * Math.PI * 2 + rnd() * 0.2, f: rnd(), el: nodo('line', { stroke: BLANCO, 'stroke-linecap': 'round' }, c.atras) }));
  const M = { abajo: medallon(c.delante, abajo.color, 'abajo'), arriba: medallon(c.delante, arriba.color, 'arriba') };
  M.abajo.poner(abajo.tactica); M.arriba.poner(arriba.tactica);
  const boom = estallido(c.delante, BLANCO, rnd, 16);
  const boomG = estallido(c.delante, gana ? (gana === 'abajo' ? abajo.color : arriba.color) : BLANCO, rnd, 10);
  const flash = nodo('circle', { cx: 100, cy: 100, fill: BLANCO }, c.delante);
  const premio = letrero(c.delante, gana ? (gana === 'abajo' ? abajo.color : arriba.color) : NEUTRO, gana ? 30 : 20);
  premio.texto(gana ? ventaja : 'SIN VENTAJA');
  const sub = letrero(c.delante, NEUTRO, 6.5, { fuente: 'sora' });
  sub.texto(gana ? 'CRUCE GANADO' : 'MISMA TÁCTICA');

  function render(ms) {
    const t = ms / escala;
    c.medir();
    const ch = tramo(t, T.choque, T.choque + 500);
    // Rayas de fondo que se cierran hacia el centro antes del choque y salen al chocar
    rayasF.forEach(r => {
      const pre = tramo(t, T.arma[0], T.choque), r0 = t < T.choque ? lerp(130, 48, E.inQ(pre)) : lerp(40, 160, E.outC(ch));
      r.el.setAttribute('x1', f1(100 + Math.cos(r.a) * r0)); r.el.setAttribute('y1', f1(100 + Math.sin(r.a) * r0));
      r.el.setAttribute('x2', f1(100 + Math.cos(r.a) * 170)); r.el.setAttribute('y2', f1(100 + Math.sin(r.a) * 170));
      r.el.setAttribute('stroke-width', f1(0.8 + r.f * 1.5));
      r.el.setAttribute('opacity', Math.round((t < T.choque ? 0.28 * pre : 0.5 * (1 - ch)) * 100) / 100);
    });
    // Los dos medallones
    for (const lado of ['abajo', 'arriba']) {
      const s = lado === 'abajo' ? 1 : -1;                         // abajo: y positiva
      const m = M[lado], gano = gana === lado;
      const ent = E.outBack(tramo(t, 0, T.entra), 1.5);
      let y = lerp(100 + s * 150, 100 + s * 50, ent);
      y += s * 8 * E.outQ(tramo(t, T.arma[0], T.arma[1]));                     // se arma hacia atrás
      const va = E.inC(tramo(t, T.arma[1], T.choque));
      y = lerp(y, 100 + s * 30, va);                                            // ¡choque!
      let sc = lerp(0.4, 1, ent), op = 1, rot = 0;   // (todo × 0,85 al pintar)
      if (t >= T.choque) {
        const q = E.outC(tramo(t, T.empuja[0], T.empuja[1]));
        const rebote = 14 * Math.sin(Math.PI * tramo(t, T.choque, T.choque + 260));
        if (!gana) { y = 100 + s * (30 + rebote + 18 * q); sc = 1; }
        else if (gano) { y = 100 + s * lerp(30, 20, q); sc = lerp(1, 1.32, q) * (1 + 0.04 * Math.sin(t * 0.012) * q); }
        else { y = 100 + s * (30 + rebote + 30 * q); sc = lerp(1, 0.68, q); op = lerp(1, 0.5, q); rot = s * 14 * q; }
      }
      const jx = t > T.choque && t < T.choque + 300 ? ruido(t * 3, s) * 3 * (1 - ch) : 0;
      const dx = gano ? -16 * E.outC(tramo(t, T.empuja[0], T.empuja[1])) : 0;   // deja sitio al «+6 %»
      mover(m.g, 100 + dx + jx, y, sc * 0.85, rot, op * tramo(t, 0, 140));
      m.aro.setAttribute('stroke-width', gano ? f1(lerp(3.5, 5, tramo(t, T.empuja[0], T.empuja[1]))) : 3.5);
    }
    // Fogonazo, chispas y el premio del cruce
    const fl = tramo(t, T.choque, T.choque + 240);
    flash.setAttribute('r', f1(lerp(6, 70, E.outC(fl)))); flash.setAttribute('opacity', fl > 0 && fl < 1 ? Math.round((1 - fl) * 60) / 100 : 0);
    boom(100, 100, tramo(t, T.choque, T.choque + 520), 64);
    const yG = gana === 'abajo' ? 132 : gana === 'arriba' ? 68 : 100;
    boomG(100, yG, tramo(t, T.empuja[0] + 120, T.empuja[0] + 620), 52);
    const pp = E.outBack(tramo(t, T.empuja[0] + 150, T.empuja[0] + 450), 2.2);
    const px = gana ? 158 : 100, py = gana ? (gana === 'abajo' ? 130 : 74) : 104;
    premio.g.setAttribute('transform', `translate(${px} ${py}) scale(${Math.round(pp * 100) / 100}) rotate(-6)`);
    premio.g.setAttribute('opacity', Math.round(tramo(t, T.empuja[0] + 150, T.empuja[0] + 250) * 100) / 100);
    sub.g.setAttribute('transform', `translate(${px} ${py + (gana ? 12 : 11)}) rotate(-6)`);
    sub.g.setAttribute('opacity', Math.round(tramo(t, T.empuja[0] + 350, T.empuja[0] + 550) * 100) / 100);
    const tb = t > T.choque ? 5 * (1 - tramo(t, T.choque, T.choque + 380)) : 0;
    c.general(ruido(t, 1) * tb, ruido(t, 2) * tb, 1 - tramo(t, T.fin - 250, T.fin));
  }
  render(0);
  return { el: c.raiz, render, dur: T.fin * escala, momentos: { choque: T.choque * escala }, gana };
}

function tacticasCambio(o = {}) {
  const { semilla = 1, escala = 1, lado = 'abajo', condicion = '' } = o;
  const rnd = azar(semilla);
  const eq = { de: 'posesion', a: 'contraataque', color: '#3ddc84', nombre: '', ...o.equipo };
  const T = { entra: 450, gira: [900, 1350], fin: 2700 };
  const c = capas();
  const m = medallon(c.delante, eq.color);
  m.poner(eq.de);
  const titulo = letrero(c.delante, eq.color, 32); titulo.texto('PLAN B');
  const motivo = letrero(c.delante, NEUTRO, 7, { fuente: 'sora' });
  motivo.texto(condicion ? `${(eq.nombre || '').toUpperCase()} · ${({ ganando: 'GANANDO', empatando: 'EMPATANDO', perdiendo: 'PERDIENDO' })[condicion] || condicion.toUpperCase()} AL DESCANSO` : (eq.nombre || '').toUpperCase());
  const flecha = letrero(c.delante, NEUTRO, 13);
  flecha.texto(`${NOMBRE_TACTICA[eq.de]}  →  ${NOMBRE_TACTICA[eq.a]}`);
  const boom = estallido(c.delante, eq.color, rnd, 14);
  const destellos = Array.from({ length: 3 }, () => nodo('circle', { cx: 100, cy: 104, fill: 'none', stroke: eq.color, 'stroke-width': 2 }, c.atras));
  let puesta = eq.de;

  function render(ms) {
    const t = ms / escala;
    c.medir();
    const ent = E.outBack(tramo(t, 0, T.entra), 1.6);
    const y0 = lado === 'abajo' ? 230 : -30;
    // Giro de moneda: el ancho pasa por 0 y en ese momento cambia el icono
    const g = tramo(t, T.gira[0], T.gira[1]);
    const ancho = g > 0 && g < 1 ? Math.abs(Math.cos(Math.PI * E.inOutC(g))) : 1;
    const tac = g >= 0.5 ? eq.a : eq.de;
    if (tac !== puesta) { m.poner(tac); puesta = tac; }
    const pop = 1 + 0.18 * Math.sin(Math.PI * tramo(t, T.gira[1], T.gira[1] + 300));
    m.g.setAttribute('transform', `translate(100 ${f1(lerp(y0, 104, ent))}) scale(${f1(lerp(0.5, 1.25, ent) * pop * 100) / 100 * Math.max(0.04, ancho)} ${f1(lerp(0.5, 1.25, ent) * pop * 100) / 100})`);
    m.g.setAttribute('opacity', Math.round(tramo(t, 0, 140) * 100) / 100);
    // Ondas mientras gira y estallido al quedar la nueva
    destellos.forEach((d, k) => {
      const q = tramo(t, T.gira[1] + k * 110, T.gira[1] + 600 + k * 110);
      d.setAttribute('r', f1(lerp(36, 86, E.outC(q)))); d.setAttribute('opacity', q > 0 && q < 1 ? Math.round((1 - q) * 70) / 100 : 0);
    });
    boom(100, 104, tramo(t, T.gira[1] - 40, T.gira[1] + 420), 58);
    const tt = E.outBack(tramo(t, 150, 500), 2);
    titulo.g.setAttribute('transform', `translate(100 38) scale(${Math.round(tt * 100) / 100}) rotate(-4)`);
    motivo.g.setAttribute('transform', 'translate(100 50)');
    motivo.g.setAttribute('opacity', Math.round(tramo(t, 350, 600) * 100) / 100);
    flecha.g.setAttribute('transform', 'translate(100 190)');
    flecha.g.setAttribute('opacity', Math.round(tramo(t, T.gira[1], T.gira[1] + 250) * 100) / 100);
    const tb = t > T.gira[1] ? 3 * (1 - tramo(t, T.gira[1], T.gira[1] + 300)) : 0;
    c.general(ruido(t, 1) * tb, ruido(t, 2) * tb, 1 - tramo(t, T.fin - 250, T.fin));
  }
  render(0);
  return { el: c.raiz, render, dur: T.fin * escala, momentos: { cambio: lerp(T.gira[0], T.gira[1], 0.5) * escala } };
}

/* Para encadenar tras el chut: las viñetas de gol y parada de vista frontal
   (ardiendo, puños, atrapada, estirada) empiezan justo después de su propio
   golpeo, con el balón ya saliendo, para no repetir la patada. */
function trasChut(fabrica, desdeBase) {
  return (o = {}) => {
    const v = fabrica(o);
    if (!o.trasChut) return v;
    const desde = desdeBase(v) ;
    const r = v.render;
    r(desde);
    return {
      el: v.el, render: ms => r(ms + desde), dur: v.dur - desde,
      momentos: Object.fromEntries(Object.entries(v.momentos).map(([k, x]) => [k, Math.max(0, x - desde)])),
    };
  };
}
const desdeGolpe = v => Math.max(0, v.momentos.golpe - 40);

export const VINETAS = Object.freeze({
  tacticas: { choque: tacticasChoque, cambio: tacticasCambio },
  chut: { choque: chutChoque },
  gol: { red: golRed, chilena: golChilena, ardiendo: trasChut(golArdiendo, desdeGolpe) },
  parada: { punos: trasChut(paradaPunos, desdeGolpe), atrapada: trasChut(paradaAtrapada, desdeGolpe), estirada: trasChut(paradaEstirada, desdeGolpe) },
});
