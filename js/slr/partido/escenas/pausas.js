/* Lesión (aviso breve con la carta), descanso (marcador, posesión, plan B y cambios) y
   final (silbato, resultado y la mejor carta del partido). */
import { cartaPartido, poner, foto, rotulo } from './comun.js';
import { iconoTactica } from '../../tactica.js';
import { esc } from '../../ui.js';

const entra = (ctx, el, en = 0, dur = 320) =>
  ctx.linea.anim(el, [{ opacity: 0, transform: 'translate3d(0, 14px, 0) scale(.94)' }, { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }], { en, dur, easing: 'cubic-bezier(.2,.9,.3,1.1)' });

export function aviso(ctx) {
  const d = ctx.d, T = { total: ctx.T.lesion };
  const caja = poner(ctx, `<div class="slr-pt-lesion" style="--c:${ctx.color(d.equipo)}">
    <b class="slr-pt-lesion__titulo">${esc(ctx.texto('lesion'))}</b><div class="slr-pt-lesion__cartas"></div>
    <small>${d.suplente ? `Entra <b>${esc(ctx.carta(d.suplente)?.nombre ?? '')}</b>` : 'Sigue jugando al 70 %'}</small></div>`);
  const c = cartaPartido(ctx, d.carta, 'slr-pt-carta--mini es-lesionada');
  caja.querySelector('.slr-pt-lesion__cartas').appendChild(c);
  entra(ctx, caja);
  ctx.linea.anim(caja, [{ opacity: 1 }, { opacity: 0 }], { en: T.total - 250, dur: 250, fill: 'forwards' });
  ctx.linea.en(0, () => ctx.sonar('lesion'));
  ctx.linea.en(T.total, () => {});
}

export function resumen(ctx) {
  const d = ctx.d, T = { total: ctx.T.descanso }, iz = ctx.lados.abajo, de = ctx.lados.arriba;
  const g = l => d.marcador[l === 'A' ? 0 : 1];
  const pos = Math.round((d.posesion?.[iz] ?? 0.5) * 100);
  const caja = poner(ctx, `<div class="slr-pt-panel">
    <b class="slr-pt-panel__titulo">${esc(ctx.texto('descanso'))}</b>
    <div class="slr-pt-panel__marcador"><span class="slr-pt-panel__foto" data-l="${iz}"></span><b style="color:${ctx.color(iz)}">${g(iz)}</b><i>–</i><b style="color:${ctx.color(de)}">${g(de)}</b><span class="slr-pt-panel__foto" data-l="${de}"></span></div>
    <p class="slr-pt-panel__sub">Posesión</p>
    <div class="slr-pt-posesion" style="--izq:${ctx.color(iz)};--der:${ctx.color(de)}"><i style="transform:scaleX(${pos / 100})"></i><b>${pos} %</b><b>${100 - pos} %</b></div>
    ${d.planB.map(p => `<p class="slr-pt-panel__fila" style="--c:${ctx.color(p.equipo)}">🔁 <b>${esc(ctx.equipo(p.equipo).nombre ?? '')}</b> cambia de táctica:
      ${iconoTactica(p.de)} → ${iconoTactica(p.a)}</p>`).join('')}
    ${d.cambios.length ? '<div class="slr-pt-cambios"></div>' : ''}
  </div>`);
  caja.querySelectorAll('[data-l]').forEach(el => el.appendChild(foto(ctx, el.dataset.l)));
  const cambios = caja.querySelector('.slr-pt-cambios');
  d.cambios.slice(0, 4).forEach((c, k) => {
    const fila = cambios.appendChild(document.createElement('div'));
    fila.className = 'slr-pt-cambio';
    fila.style.setProperty('--c', ctx.color(c.equipo));
    const sale = cartaPartido(ctx, c.sale, 'slr-pt-carta--mini'), ent = cartaPartido(ctx, c.entra, 'slr-pt-carta--mini');
    fila.append(sale);
    fila.insertAdjacentHTML('beforeend', '<i>↔</i>');
    fila.append(ent);
    ctx.linea.anim(sale, [{ opacity: 1, transform: 'translate3d(0, 0, 0)' }, { opacity: 0.35, transform: 'translate3d(0, 10px, 0) scale(.92)' }], { en: 700 + k * 350, dur: 300 });
    entra(ctx, ent, 850 + k * 350);
  });
  entra(ctx, caja);
  ctx.linea.en(0, () => ctx.sonar('silbato_descanso'));
  ctx.linea.en(T.total, () => {});
}

export function resultado(ctx) {
  const d = ctx.d, T = { total: ctx.T.final }, iz = ctx.lados.abajo, de = ctx.lados.arriba;
  const g = l => d.goles[l === 'A' ? 0 : 1];
  const pen = d.penaltis ? `<p class="slr-pt-panel__sub">Penaltis ${d.penaltis[iz === 'A' ? 0 : 1]}–${d.penaltis[de === 'A' ? 0 : 1]}</p>` : '';
  const caja = poner(ctx, `<div class="slr-pt-panel slr-pt-panel--final">
    <b class="slr-pt-panel__titulo">${esc(ctx.texto('final'))}</b>
    <div class="slr-pt-panel__marcador"><span class="slr-pt-panel__foto" data-l="${iz}"></span><b style="color:${ctx.color(iz)}">${g(iz)}</b><i>–</i><b style="color:${ctx.color(de)}">${g(de)}</b><span class="slr-pt-panel__foto" data-l="${de}"></span></div>
    <p class="slr-pt-panel__equipos"><span>${esc(ctx.equipo(iz).nombre ?? '')}</span><span>${esc(ctx.equipo(de).nombre ?? '')}</span></p>
    ${pen}
    ${d.mejor ? `<p class="slr-pt-panel__sub">${esc(ctx.texto('mejor_carta'))}</p><div class="slr-pt-mejor" style="--c:${ctx.color(d.mejor.equipo ?? iz)}"></div>
      <p class="slr-pt-panel__pr">${String(Math.round(d.mejor.pr * 10) / 10).replace('.', ',')} puntos de rendimiento</p>` : ''}
  </div>`);
  caja.querySelectorAll('[data-l]').forEach(el => el.appendChild(foto(ctx, el.dataset.l)));
  if (d.mejor) {
    const c = cartaPartido(ctx, d.mejor.carta, 'slr-pt-carta--mejor');
    caja.querySelector('.slr-pt-mejor').appendChild(c);
    entra(ctx, c, 600, 420);
    ctx.linea.en(900, () => { const [x, y] = ctx.centro(c); ctx.fx.chispas(x, y, 36, { color: ctx.color(d.mejor.equipo ?? iz), fuerza: 10 }); });
  }
  entra(ctx, caja);
  ctx.linea.en(0, () => ctx.sonar('silbato_final'));
  ctx.linea.en(T.total, () => {});
}

export { rotulo };
