// Agujero negro de la temporada «???».
// montarAgujero(contenedor, {fase:'agujero'|'votacion'|'cerrada', pregunta, onVoto(si), voto, sesion, onLogin, beta, onEntrar, resultado:{si,no}})
// Devuelve {destruir()}. Todo procedural: canvas 2D + Web Audio (sin archivos).
export function montarAgujero(raiz, op = {}) {
  const VERDE = [31, 224, 101];
  raiz.innerHTML = '';
  raiz.classList.add('ag');
  const cv = document.createElement('canvas');
  raiz.appendChild(cv);
  const ui = document.createElement('div');
  ui.className = 'ag-ui';
  raiz.appendChild(ui);
  const c = cv.getContext('2d');
  let W, H, R, cx, cy, dpr, t0 = performance.now(), raf, vivo = true;
  let pulso = 0;           // golpe al tocar
  let tirones = [];        // estrellas absorbidas

  // ---------- partículas ----------
  const DISCO = 1400, ESTRELLAS = 260;
  const disco = Array.from({ length: DISCO }, () => nuevaDisco());
  function nuevaDisco() {
    const r = 1.25 + Math.pow(Math.random(), 1.8) * 2.4;   // radio en unidades de R
    return { r, a: Math.random() * Math.PI * 2, v: 0.9 / Math.pow(r, 1.5), z: (Math.random() - .5) * .05, s: .6 + Math.random() * 1.4, k: Math.random() };
  }
  const estrellas = Array.from({ length: ESTRELLAS }, () => ({ x: Math.random(), y: Math.random(), s: Math.random(), tw: Math.random() * 6 }));

  function medir() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = raiz.clientWidth; H = raiz.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(W, H) * (op.fase === 'votacion' || op.resultado ? .13 : .17);
    cx = W / 2; cy = H * (op.fase === 'votacion' || op.resultado ? .33 : .46);
  }
  medir();
  const ro = new ResizeObserver(medir); ro.observe(raiz);

  const TILT = .22; // inclinación del disco (0 = de canto)
  function proy(p, rr) { // posición en pantalla de una partícula del disco
    return [cx + Math.cos(p.a) * rr, cy + Math.sin(p.a) * rr * TILT + p.z * R];
  }

  function frame(now) {
    if (!vivo) return;
    const t = (now - t0) / 1000;
    const dt = 1 / 60;
    pulso *= .94;
    const respira = 1 + Math.sin(t * .7) * .015 + pulso * .08;
    const RR = R * respira;

    // fondo con estela (deja rastro suave)
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(3,5,4,0.34)';
    c.fillRect(0, 0, W, H);

    // estrellas: caen en espiral hacia el centro
    c.globalCompositeOperation = 'lighter';
    for (const e of estrellas) {
      let dx = e.x * W - cx, dy = e.y * H - cy;
      const d = Math.hypot(dx, dy) || 1;
      const tirón = (R * R * 6) / (d * d) * (1 + pulso * 3);
      const ang = Math.atan2(dy, dx) + .002 * (R * 3 / d) * (1 + pulso);
      const nd = Math.max(0, d - tirón * .35 - .05);
      const nx = cx + Math.cos(ang) * nd, ny = cy + Math.sin(ang) * nd;
      const largo = Math.min(40, tirón * 4);
      const a = (.25 + .6 * e.s) * (.6 + .4 * Math.sin(t * 2 + e.tw)) * Math.min(1, (nd - RR) / (R * .8));
      if (nd < RR * 1.05) { // tragada: vuelve a nacer en el borde
        const b = Math.random() * Math.PI * 2, rr = Math.hypot(W, H) * .55;
        e.x = (cx + Math.cos(b) * rr) / W; e.y = (cy + Math.sin(b) * rr) / H; continue;
      }
      e.x = nx / W; e.y = ny / H;
      if (a <= 0) continue;
      c.strokeStyle = `rgba(${d < R * 4 ? '160,255,190' : '220,235,225'},${a})`;
      c.lineWidth = e.s < .85 ? .8 : 1.4;
      c.beginPath(); c.moveTo(nx, ny);
      c.lineTo(nx + Math.cos(ang) * largo * .5, ny + Math.sin(ang) * largo * .5); c.stroke();
    }

    // halo exterior
    let g = c.createRadialGradient(cx, cy, RR * .9, cx, cy, RR * 4.2);
    g.addColorStop(0, `rgba(${VERDE},${.22 + pulso * .2})`);
    g.addColorStop(.35, `rgba(${VERDE},.06)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, RR * 4.2, 0, 7); c.fill();

    // disco: mitad de atrás (detrás del agujero) + su imagen curvada por la gravedad encima
    for (const p of disco) {
      p.a += p.v * dt * (1 + pulso * 2.5);
      p.r -= dt * .004 * (1 + pulso * 8) / p.r; // cae despacio hacia dentro
      if (p.r < 1.12) Object.assign(p, nuevaDisco(), { r: 3.4 + Math.random() * .3 });
    }
    const pinta = (p, x, y, alfa, tam) => {
      const cerca = Math.max(0, 1 - (p.r - 1.1) / 2.6);       // 1 = borde interior
      const doppler = .55 + .45 * Math.cos(p.a + .4);          // un lado más brillante
      const al = alfa * (.25 + .75 * cerca) * doppler;
      if (al < .02) return;
      const blanco = Math.floor(120 * cerca * cerca);
      c.fillStyle = `rgba(${31 + blanco + 60 * cerca},${224 + 31 * cerca},${101 + blanco + 40 * cerca},${al})`;
      c.fillRect(x - tam / 2, y - tam / 2, tam, tam);
    };
    for (const p of disco) {
      if (Math.sin(p.a) >= 0) continue; // atrás
      const [x, y] = proy(p, p.r * RR);
      pinta(p, x, y, .8, p.s * 1.6);
      // imagen lenteada: arco por encima del agujero
      const lr = RR * (1.05 + (p.r - 1.1) * .32);
      const la = Math.PI + (p.a - Math.PI);           // misma longitud
      const lx = cx + Math.cos(la) * lr, ly = cy - Math.abs(Math.sin(la)) * lr * .95 - RR * .05;
      pinta(p, lx, ly, .85, p.s * 1.3);
    }

    // anillo de fotones
    c.globalCompositeOperation = 'lighter';
    g = c.createRadialGradient(cx, cy, RR * .96, cx, cy, RR * 1.22);
    g.addColorStop(0, 'rgba(230,255,240,0)');
    g.addColorStop(.18, `rgba(220,255,235,${.85 + pulso * .15})`);
    g.addColorStop(.35, `rgba(${VERDE},.55)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, RR * 1.22, 0, 7); c.fill();

    // horizonte de sucesos
    c.globalCompositeOperation = 'source-over';
    g = c.createRadialGradient(cx, cy, 0, cx, cy, RR);
    g.addColorStop(0, '#000'); g.addColorStop(.92, '#000'); g.addColorStop(1, 'rgba(0,0,0,.6)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, RR * 1.0, 0, 7); c.fill();

    // disco: mitad delantera (tapa el agujero)
    c.globalCompositeOperation = 'lighter';
    for (const p of disco) {
      if (Math.sin(p.a) < 0) continue;
      const [x, y] = proy(p, p.r * RR);
      pinta(p, x, y, 1, p.s * 1.8);
    }
    c.globalCompositeOperation = 'source-over';

    // viñeta
    g = c.createRadialGradient(cx, cy, Math.min(W, H) * .3, cx, cy, Math.hypot(W, H) * .65);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // ---------- sonido: zumbido grave del vacío ----------
  let ctx, master;
  function sonido() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(.22, ctx.currentTime + 4);
    // ruido marrón muy filtrado
    const n = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), d = n.getChannelData(0);
    let u = 0; for (let i = 0; i < d.length; i++) { u = (u + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = u * 3.2; }
    const ns = ctx.createBufferSource(); ns.buffer = n; ns.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; lp.Q.value = 4;
    const lfo = ctx.createOscillator(); lfo.frequency.value = .07; const lg = ctx.createGain(); lg.gain.value = 60;
    lfo.connect(lg); lg.connect(lp.frequency);
    ns.connect(lp); lp.connect(master); ns.start(); lfo.start();
    // dos tonos graves desafinados (batido inquietante)
    for (const [f, v] of [[41, .35], [41.6, .3], [82.4, .06]]) {
      const o = ctx.createOscillator(); o.frequency.value = f; const og = ctx.createGain(); og.gain.value = v;
      o.connect(og); og.connect(master); o.start();
    }
  }
  function golpe() { // al tocar: el agujero «traga» con un golpe sordo
    pulso = 1;
    if (!ctx) return;
    const o = ctx.createOscillator(), gg = ctx.createGain(), t = ctx.currentTime;
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.4);
    gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(.5, t + .05); gg.gain.exponentialRampToValueAtTime(.001, t + 1.6);
    o.connect(gg); gg.connect(master); o.start(t); o.stop(t + 1.7);
  }
  const alTocar = e => { if (e.target.closest('button,a')) return; sonido(); golpe(); pista.classList.add('fuera'); };
  raiz.addEventListener('pointerdown', alTocar);
  const visib = () => { if (!ctx) return; document.hidden ? ctx.suspend() : ctx.resume(); };
  document.addEventListener('visibilitychange', visib);

  // ---------- interfaz ----------
  ui.innerHTML = `
    <div class="ag-marca">???</div>
    ${op.fase === 'votacion' ? `<div class="ag-voto">
        <div class="ag-preg">${op.pregunta || '¿Quieres temporada 26/27?'}</div>
        <div class="ag-botones"></div>
        <div class="ag-nota"></div>
      </div>` : ''}
    ${op.resultado ? `<div class="ag-voto">
        <div class="ag-preg">SÍ ${op.resultado.si} – NO ${op.resultado.no}</div>
        <div class="ag-nota">${op.resultado.si === op.resultado.no ? 'Empate' : `Gana el ${op.resultado.si > op.resultado.no ? 'SÍ' : 'NO'}`}</div>
      </div>` : ''}
    <div class="ag-pista">Toca el vacío</div>
    ${op.beta ? '<button class="ag-beta">Entrar a la temporada</button>' : ''}`;
  const pista = ui.querySelector('.ag-pista');
  if (op.beta) ui.querySelector('.ag-beta').onclick = () => op.onEntrar && op.onEntrar();
  if (op.fase === 'votacion') pintarVoto(op.voto);
  function pintarVoto(voto) {
    const b = ui.querySelector('.ag-botones'), nota = ui.querySelector('.ag-nota');
    if (!op.sesion) {
      b.innerHTML = '<button class="ag-si">Inicia sesión para votar</button>';
      b.firstChild.onclick = () => op.onLogin && op.onLogin(); nota.textContent = ''; return;
    }
    b.innerHTML = `<button class="ag-si ${voto === true ? 'elegido' : ''}">SÍ</button><button class="ag-no ${voto === false ? 'elegido' : ''}">NO</button>`;
    nota.textContent = voto == null ? 'Tu voto es secreto hasta que se cierre la votación.' : `Has votado ${voto ? 'SÍ' : 'NO'}. Puedes cambiarlo hasta que se cierre.`;
    const [si, no] = b.children;
    si.onclick = () => { golpe(); op.onVoto && op.onVoto(true); pintarVoto(true); };
    no.onclick = () => { golpe(); op.onVoto && op.onVoto(false); pintarVoto(false); };
  }

  return {
    votado: pintarVoto,
    destruir() { vivo = false; cancelAnimationFrame(raf); ro.disconnect(); raiz.removeEventListener('pointerdown', alTocar); document.removeEventListener('visibilitychange', visib); ctx && ctx.close(); raiz.innerHTML = ''; raiz.classList.remove('ag'); }
  };
}