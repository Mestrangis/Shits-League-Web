/* ═══════════════════════════════════════════════════════════════════════════
   SHITS LEAGUE — la ALARMA (instalar la app y activar las notificaciones)

   Una pantalla de cachondeo, con sirena, luces rojas y cinta de peligro, que
   sale justo ANTES de la ventanita del navegador para que nadie le dé a
   «Bloquear» sin querer. No bloquea la app: siempre se puede cerrar.

   USO
     import { mostrarAlarma } from './alarma.js';
     const r = await mostrarAlarma({
       modo: 'notificaciones',          // 'notificaciones' | 'instalar' | 'iphone'
       accion: async () => 'ok',        // lo que lanza la ventanita del navegador;
                                        // devuelve 'ok', 'mal' (denegado) o 'nada'
       instrucciones: '<ol>…</ol>',     // HTML que se enseña si sale 'mal'
       sonidos: { sirena, boom, ok },   // URLs de los MP3 (opcional; ok puede faltar)
                                        // cada toque en la alarma suena un «boom» (se solapan)
       silencio: false,                 // true = sin sonido
     });
     // r: 'ok' | 'mal' | 'nada' | 'luego' (cerró con «Ahora no»)

   La sirena solo suena porque esto se abre siempre tras un toque del usuario
   (el navegador no deja sonar nada sin un toque antes). Nada de vibración.
   Las luces parpadean despacio (menos de 3 veces por segundo) por seguridad.
   ═══════════════════════════════════════════════════════════════════════════ */

const TEXTOS = {
  notificaciones: {
    titulo: 'ALERTA MÁXIMA',
    sub: 'Te va a salir una ventanita del móvil',
    orden: 'DALE A <b>PERMITIR</b>',
    aviso: 'Si le das a <s>BLOQUEAR</s> no te enterarás de los partidos, ni del MVP, ni de nada. Y arreglarlo luego es un dolor. Nadie quiere eso.',
    falso: ['Bloquear', 'Permitir'],
    falsoTitulo: 'Shits League quiere enviarte notificaciones',
    boton: 'VALE, ESTOY PREPARADO',
    ahora: 'AHORA. DALE A PERMITIR',
    ok: '¡ESO ES!',
    okSub: 'Ya te enteras de todo',
    mal: 'LE HAS DADO A BLOQUEAR',
    malSub: 'Tranquilo, tiene arreglo. Haz esto:',
  },
  instalar: {
    titulo: 'ALERTA MÁXIMA',
    sub: 'Estás usando la Shits League desde el navegador',
    orden: 'INSTÁLALA. <b>ES UN TOQUE</b>',
    aviso: 'Instalada se abre como una app, va más rápido y te llegan las notificaciones. Desde el navegador es de pobres.',
    falso: ['Cancelar', 'Instalar'],
    falsoTitulo: '¿Instalar Shits League?',
    boton: 'INSTALAR LA APP',
    ahora: 'AHORA. DALE A INSTALAR',
    ok: '¡INSTALADA!',
    okSub: 'Ábrela desde el icono de tu móvil',
    mal: 'NO SE HA INSTALADO',
    malSub: 'Puedes hacerlo a mano:',
  },
  iphone: {
    titulo: 'ALERTA MÁXIMA',
    sub: 'En iPhone hay que instalarla a mano (culpa de Apple)',
    orden: 'SON <b>3 TOQUES</b>',
    aviso: 'Sin instalarla, en iPhone no te llegan las notificaciones. Ni una.',
    boton: 'ENTENDIDO',
  },
};

const CSS = `
.al{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
  font-family:'Sora',system-ui,sans-serif;color:#fff;overflow:hidden;-webkit-tap-highlight-color:transparent;
  background:radial-gradient(ellipse at 50% 40%,#2a0303,#070a08 70%);animation:al-in .25s ease-out}
@keyframes al-in{from{opacity:0}to{opacity:1}}
.al *{box-sizing:border-box}
.al__flash{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 120px 40px rgba(255,30,30,.55);animation:al-flash 1.1s ease-in-out infinite}
@keyframes al-flash{0%,100%{opacity:.25}50%{opacity:1}}
.al__cinta{position:absolute;left:-10%;right:-10%;height:34px;display:flex;align-items:center;overflow:hidden;
  background:repeating-linear-gradient(-45deg,#ffd400 0 22px,#111 22px 44px);transform:rotate(-3deg);box-shadow:0 4px 14px rgba(0,0,0,.5)}
.al__cinta--arriba{top:18px}.al__cinta--abajo{bottom:22px;transform:rotate(2.5deg)}
.al__cinta span{white-space:nowrap;font:400 18px/1 'Anton',Impact,sans-serif;letter-spacing:3px;color:#111;background:#ffd400;padding:3px 10px;
  animation:al-cinta 7s linear infinite}
.al__cinta--abajo span{animation-direction:reverse}
@keyframes al-cinta{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.al__luz{position:absolute;top:64px;width:120px;height:120px;border-radius:50%;pointer-events:none;
  background:conic-gradient(from 0deg,rgba(255,40,40,.0),rgba(255,40,40,.9) 20%,rgba(255,40,40,0) 40%,rgba(255,40,40,0));
  filter:blur(6px);animation:al-gira .9s linear infinite}
.al__luz--i{left:-30px}.al__luz--d{right:-30px;animation-direction:reverse}
@keyframes al-gira{to{transform:rotate(360deg)}}
.al__caja{position:relative;width:min(92vw,420px);text-align:center;padding:84px 8px 74px}
.al__tit{font:400 clamp(44px,13vw,64px)/.95 'Anton',Impact,sans-serif;letter-spacing:1px;color:#ff3b3b;
  text-shadow:0 0 18px rgba(255,40,40,.8),3px 3px 0 #000;animation:al-tiembla .35s steps(2) infinite}
@keyframes al-tiembla{0%{transform:translate(0,0) rotate(-1deg)}50%{transform:translate(2px,-1px) rotate(1deg)}100%{transform:translate(-1px,1px) rotate(-.5deg)}}
.al__sub{margin:10px 0 0;font-size:14px;color:#ffd7d7;font-weight:700}
.al__orden{margin:14px 0 4px;font:400 30px/1.05 'Anton',Impact,sans-serif;letter-spacing:.5px}
.al__orden b{font-weight:400;color:#1FE065;text-shadow:0 0 16px rgba(31,224,101,.7)}
.al__aviso{margin:8px auto 0;max-width:330px;font-size:13px;line-height:1.45;color:#e9dede}
.al__aviso s{color:#ff6b6b;text-decoration-thickness:3px}
.al__falso{position:relative;margin:18px auto 30px;width:min(84vw,320px);background:#2a2d2b;border-radius:18px;padding:16px 16px 14px;
  text-align:left;box-shadow:0 12px 30px rgba(0,0,0,.6);transform:rotate(-1.5deg)}
.al__falso p{margin:0 0 14px;font-size:13px;font-weight:700;color:#eee}
.al__falso div{display:flex;justify-content:flex-end;gap:22px;font-size:14px;font-weight:700}
.al__no{position:relative;color:#aaa}
.al__no::after{content:"";position:absolute;left:-6px;right:-6px;top:50%;height:3px;background:#ff3b3b;transform:rotate(-12deg);box-shadow:0 0 6px #ff3b3b}
.al__si{position:relative;color:#8ab4ff}
.al__circulo{position:absolute;left:50%;top:50%;width:96px;height:58px;transform:translate(-50%,-50%) rotate(-6deg);overflow:visible;pointer-events:none}
.al__circulo path{fill:none;stroke:#ff2a2a;stroke-width:4;stroke-linecap:round;stroke-dasharray:300;stroke-dashoffset:300;
  animation:al-traza .8s .5s ease-out forwards,al-late 1.1s 1.3s ease-in-out infinite;filter:drop-shadow(0 0 4px rgba(255,40,40,.8))}
@keyframes al-traza{to{stroke-dashoffset:0}}
@keyframes al-late{0%,100%{opacity:1}50%{opacity:.45}}
.al__flecha{position:absolute;right:-30px;bottom:-34px;width:48px;height:54px;animation:al-bota .7s ease-in-out infinite alternate}
.al__flecha path{fill:none;stroke:#ff2a2a;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
@keyframes al-bota{to{transform:translate(-4px,-8px)}}
.al__btn{display:block;width:100%;margin:26px 0 0;border:0;border-radius:16px;padding:18px 12px;cursor:pointer;
  font:400 22px/1 'Anton',Impact,sans-serif;letter-spacing:1px;color:#062012;background:#1FE065;
  box-shadow:0 0 0 4px rgba(31,224,101,.25),0 10px 30px rgba(31,224,101,.35);animation:al-brilla 1.1s ease-in-out infinite}
@keyframes al-brilla{0%,100%{box-shadow:0 0 0 4px rgba(31,224,101,.2),0 10px 30px rgba(31,224,101,.3)}50%{box-shadow:0 0 0 9px rgba(31,224,101,.35),0 10px 40px rgba(31,224,101,.6)}}
.al__btn:active{transform:scale(.97)}
.al__luego{margin-top:12px;background:none;border:0;color:#bfa7a7;font:700 13px 'Sora',sans-serif;text-decoration:underline;cursor:pointer;padding:8px}
.al__pasos{margin:18px auto 0;padding:0;list-style:none;text-align:left;max-width:330px;display:grid;gap:10px}
.al__pasos li{display:flex;gap:12px;align-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:10px 12px;font-size:14px;line-height:1.35}
.al__pasos li>i{flex:none;width:30px;height:30px;border-radius:50%;background:#ff3b3b;display:grid;place-items:center;font:400 17px 'Anton',sans-serif;font-style:normal}
.al__pasos svg{width:20px;height:20px;vertical-align:-4px;margin:0 2px}
.al__abajo{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);width:60px;height:70px;animation:al-bota .6s ease-in-out infinite alternate}
.al__abajo path{fill:none;stroke:#ff2a2a;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 6px rgba(255,40,40,.9))}
.al--ok{background:radial-gradient(ellipse at 50% 40%,#003c19,#070a08 70%)}
.al--ok .al__flash{box-shadow:inset 0 0 120px 40px rgba(31,224,101,.5)}
.al--ok .al__tit{color:#1FE065;text-shadow:0 0 18px rgba(31,224,101,.8),3px 3px 0 #000;animation:none}
.al--ok .al__luz,.al--ok .al__cinta{display:none}
@media (prefers-reduced-motion:reduce){.al *{animation-duration:2.5s!important}.al__tit{animation:none}}
`;

const FLECHA = '<svg class="al__flecha" viewBox="0 0 56 62"><path d="M46 58C40 34 24 20 8 14"/><path d="M8 14l14-4M8 14l6 13"/></svg>';
const CIRCULO = '<svg class="al__circulo" viewBox="0 0 96 58"><path d="M60 6C30 2 4 14 6 32s34 24 58 20 30-16 26-28S68 2 40 8"/></svg>';
const COMPARTIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
const MAS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';

let cssPuesto = false;
function ponerCss() {
  if (cssPuesto) return;
  const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); cssPuesto = true;
}

// Sonido con Web Audio: los «boom» se pueden SOLAPAR (cada toque lanza uno
// nuevo encima de los anteriores) y la sirena se apaga con un fundido en vez
// de cortarse de golpe. Funciona también en iPhone (donde el volumen de <audio>
// no se puede cambiar). Si no hay Web Audio, no suena nada y no pasa nada.
let ctxAudio = null;
const buffers = {};
function sonador(urls = {}, silencio) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (silencio || !AC) return { tocar() {}, fundir() {}, pararTodo() {} };
  ctxAudio = ctxAudio || new AC();
  if (ctxAudio.state === 'suspended') ctxAudio.resume().catch(() => {});
  const cargar = k => {
    if (!urls[k]) return Promise.resolve(null);
    return buffers[urls[k]] || (buffers[urls[k]] = fetch(urls[k]).then(r => r.arrayBuffer())
      .then(d => new Promise((ok, ko) => ctxAudio.decodeAudioData(d, ok, ko))).catch(() => null));
  };
  Object.keys(urls).forEach(cargar);              // se decodifican al abrir
  const vivos = new Set();                        // todo lo que está sonando
  const tocar = async (k, { bucle = false, vol = 0.6 } = {}) => {
    const buf = await cargar(k);
    if (!buf) return null;
    if (vivos.size > 24) return null;             // tope para no saturar
    const src = ctxAudio.createBufferSource(), gan = ctxAudio.createGain();
    src.buffer = buf; src.loop = bucle; gan.gain.value = vol;
    src.connect(gan).connect(ctxAudio.destination);
    const v = { k, src, gan }; vivos.add(v);
    src.onended = () => vivos.delete(v);
    src.start();
    return v;
  };
  // Baja el volumen poco a poco y para (por defecto, en 0,6 s)
  const fundir = (k, seg = 0.6) => vivos.forEach(v => {
    if (k && v.k !== k) return;
    const t = ctxAudio.currentTime;
    v.gan.gain.cancelScheduledValues(t);
    v.gan.gain.setValueAtTime(v.gan.gain.value, t);
    v.gan.gain.linearRampToValueAtTime(0, t + seg);
    try { v.src.stop(t + seg + 0.05); } catch {}
  });
  return { tocar, fundir, pararTodo: () => fundir(null, 0.4) };
}

export function mostrarAlarma({ modo = 'notificaciones', accion, instrucciones = '', sonidos = {}, silencio = false } = {}) {
  ponerCss();
  const T = TEXTOS[modo] || TEXTOS.notificaciones;
  const snd = sonador(sonidos, silencio);
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'al';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', T.titulo);
    const cinta = `<span>${'PELIGRO · NO LE DES A BLOQUEAR · '.repeat(6)}</span>`;
    const marco = cuerpo => `<div class="al__flash"></div><div class="al__luz al__luz--i"></div><div class="al__luz al__luz--d"></div>
      <div class="al__cinta al__cinta--arriba">${cinta}</div><div class="al__cinta al__cinta--abajo">${cinta}</div>
      <div class="al__caja">${cuerpo}</div>`;
    let terminado = false;
    const fin = r => {
      if (terminado) return; terminado = true;
      snd.pararTodo(); el.remove(); resolve(r);   // la sirena se apaga con fundido
    };

    function pantallaAlarma() {
      if (modo === 'iphone') {
        el.innerHTML = marco(`
          <div class="al__tit">${T.titulo}</div>
          <p class="al__sub">${T.sub}</p>
          <div class="al__orden">${T.orden}</div>
          <p class="al__aviso">${T.aviso}</p>
          <ol class="al__pasos">
            <li><i>1</i><span>Abre esto en <b>Safari</b> y toca <b>Compartir</b> ${COMPARTIR} (abajo del todo)</span></li>
            <li><i>2</i><span>Baja y toca <b>Añadir a pantalla de inicio</b> ${MAS}</span></li>
            <li><i>3</i><span>Toca <b>Añadir</b> y abre la app desde el <b>icono nuevo</b></span></li>
          </ol>
          <button class="al__btn" type="button" data-ok>${T.boton}</button>`)
          + '<svg class="al__abajo" viewBox="0 0 60 70"><path d="M30 4v56M10 40l20 22 20-22"/></svg>';
        el.querySelector('[data-ok]').onclick = () => fin('nada');
        snd.tocar('boom', { vol: 0.9 });
        snd.tocar('sirena', { bucle: true, vol: 0.24 });
        return;
      }
      el.innerHTML = marco(`
        <div class="al__tit">${T.titulo}</div>
        <p class="al__sub">${T.sub}</p>
        <div class="al__orden">${T.orden}</div>
        <div class="al__falso"><p>${T.falsoTitulo}</p><div><span class="al__no">${T.falso[0]}</span><span class="al__si">${T.falso[1]}${CIRCULO}</span></div>${FLECHA}</div>
        <p class="al__aviso">${T.aviso}</p>
        <button class="al__btn" type="button" data-ok>${T.boton}</button>
        <button class="al__luego" type="button" data-luego>Ahora no</button>`);
      el.querySelector('[data-luego]').onclick = () => fin('luego');
      el.querySelector('[data-ok]').onclick = lanzar;
      snd.tocar('boom', { vol: 0.9 });               // ¡BUM! al aparecer
      snd.tocar('sirena', { bucle: true, vol: 0.24 }); // y la sirena en bucle
    }

    async function lanzar() {
      snd.fundir('sirena');
      const btn = el.querySelector('[data-ok]');
      btn.textContent = T.ahora; btn.disabled = true;
      let r = 'nada';
      try { r = (await accion?.()) || 'nada'; } catch { r = 'mal'; }
      if (r === 'ok') pantallaOk();
      else if (r === 'mal') pantallaMal();
      else fin(r);
    }

    function pantallaOk() {
      el.classList.add('al--ok');
      el.innerHTML = marco(`<div class="al__tit">${T.ok}</div><p class="al__sub">${T.okSub}</p>`);
      snd.tocar('ok', { vol: 0.7 });
      setTimeout(() => fin('ok'), 1800);
    }

    function pantallaMal() {
      el.innerHTML = marco(`
        <div class="al__tit">${T.mal}</div>
        <p class="al__sub">${T.malSub}</p>
        <div class="al__pasos-html">${instrucciones}</div>
        <button class="al__btn" type="button" data-ok>VALE</button>`);
      el.querySelector('[data-ok]').onclick = () => fin('mal');
      snd.tocar('boom', { vol: 0.9 });
    }

    el.addEventListener('keydown', e => { if (e.key === 'Escape') fin('luego'); });
    // Cada toque en cualquier sitio de la alarma: ¡BUM!, encima de los anteriores
    el.addEventListener('pointerdown', () => snd.tocar('boom', { vol: 0.75 }));
    document.body.appendChild(el);
    pantallaAlarma();
    el.querySelector('button')?.focus();
  });
}
