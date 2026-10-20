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
  chut: { choque: chutChoque },
  gol: { red: golRed, chilena: golChilena, ardiendo: trasChut(golArdiendo, desdeGolpe) },
  parada: { punos: trasChut(paradaPunos, desdeGolpe), atrapada: trasChut(paradaAtrapada, desdeGolpe), estirada: trasChut(paradaEstirada, desdeGolpe) },
});
