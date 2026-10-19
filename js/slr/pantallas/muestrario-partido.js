/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — muestrario de escenas de partido (Modo pruebas)
   Un botón por cada escena y variante (escenas/registro.js), un deslizador de
   probabilidad, el resultado (gana el de la izquierda o el de la derecha;
   gol o parada; el ataque pasa o lo cortan), la versión (automática, completa
   o rápida) y si hay un poder. Para revisar el diseño de cada una por separado,
   también una jugada entera y un partido de ejemplo (con tus cartas).
═══════════════════════════════════════════════ */
import { esc, hoja, toast } from '../ui.js';
import { REGISTRO, VARIANTES, NOMBRES } from '../partido/escenas/registro.js';
import { reproducir } from '../partido/reproductor.js';
import { crearGuion } from '../partido/guion.js';
import { decorar } from '../partido/azar.js';
import { RITMO } from '../partido/config.js';
import { MOTOR_ACTUAL } from '../motores.js';

const SIN_P = new Set(['inicio', 'saque', 'poder', 'robo', 'lesion', 'descanso', 'final']);

export function abrirMuestrarioPartido(ctx) {
  const mias = (ctx.datos.cartas ?? []).slice();
  if (mias.length < 7) { toast('Hacen falta al menos 7 cartas en tu plantilla para el muestrario', 'error'); return; }
  const el = hoja(`
    <div class="slr-muestra-pt">
      <p class="slr-suave">Cada botón reproduce esa escena con esa variante. Izquierda: tu equipo (verde); derecha: el rival (naranja).
        Toca la pantalla para saltar al final de la escena.</p>
      <div class="slr-muestra-pt__ajustes slr-tarjeta">
        <label>Probabilidad del de la izquierda: <b data-p-texto>50 %</b>
          <input type="range" min="3" max="97" value="50" data-p></label>
        <label>Resultado
          <select class="slr-input" data-resultado>
            <option value="izq">Gana la izquierda (gol · pasa · mantiene el balón)</option>
            <option value="der">Gana la derecha (parada · corte · robo)</option>
          </select></label>
        <label>Versión
          <select class="slr-input" data-version>
            <option value="auto">Automática (según la probabilidad)</option>
            <option value="completa">Completa</option>
            <option value="rapida">Rápida</option>
          </select></label>
        <label>Poder antes de la fase
          <select class="slr-input" data-poder>
            <option value="">Ninguno</option><option value="izq">De la izquierda</option><option value="der">De la derecha</option>
          </select></label>
      </div>
      <div class="slr-muestra-pt__grupo"><h3>Seguidas</h3><div class="slr-muestra-pt__botones">
        <button class="slr-btn" type="button" data-jugada>▶ Una jugada entera</button>
        <button class="slr-btn" type="button" data-ejemplo>▶ Partido de ejemplo (con tus cartas)</button>
      </div></div>
      ${Object.keys(REGISTRO).map(tipo => `<div class="slr-muestra-pt__grupo"><h3>${esc(NOMBRES[tipo] ?? tipo)}</h3><div class="slr-muestra-pt__botones">
        ${VARIANTES[tipo].map(v => `<button class="slr-btn slr-btn--fantasma" type="button" data-tipo="${tipo}" data-variante="${v}">${esc(v)}</button>`).join('')}
      </div></div>`).join('')}
    </div>`, { titulo: 'Escenas de partido', completa: true });

  const $ = s => el.querySelector(s);
  $('[data-p]').addEventListener('input', e => { $('[data-p-texto]').textContent = `${e.target.value} %`; });
  const ajustes = () => ({
    p: Number($('[data-p]').value) / 100, izqGana: $('[data-resultado]').value === 'izq',
    version: $('[data-version]').value, poder: $('[data-poder]').value,
  });

  // Dos equipos con tus cartas: el rival, con copias (ids con «~r») en otro orden
  const cartas = {};
  const alin = (lista, sufijo, orden) => {
    const m = c => { const id = c.id + sufijo; cartas[id] = { ...c, id }; return { id, nombre: c.nombre, ATA: c.ata, DEF: c.def, CON: c.con, poderes: c.poderes ?? [], tactica_favorita: c.tactica_favorita, energia: 100 }; };
    let resto = [...lista].sort(orden);
    const toma = (stat, n) => { const s = [...resto].sort((a, b) => b[stat] - a[stat]).slice(0, n); resto = resto.filter(c => !s.includes(c)); return s.map(m); };
    const [por] = toma('def', 1);
    return { formacion: '2-2-2', por, def: toma('def', 2), med: toma('con', 2), del: toma('ata', 2), banquillo: toma('ata', 3),
      orden_manual: false, capitan_id: null, tactica: 'posesion', gestion: 'normal' };
  };
  const alA = alin(mias, '', (a, b) => b.ovr - a.ovr), alB = alin(mias, '~r', (a, b) => a.ovr - b.ovr);
  const equipos = { A: { id: ctx.datos.equipo?.id ?? 'A', nombre: ctx.datos.equipo?.nombre ?? 'Tu equipo', dueno: ctx.datos.jugador ?? '' },
    B: { id: 'rival', nombre: 'Rival de prueba', dueno: '' } };
  const base = { stats: {}, lados: { izq: 'A', der: 'B' }, equipos, partidoId: 'muestrario' };
  for (const c of Object.values(cartas)) base.stats[c.id] = { ATA: c.ata, DEF: c.def, CON: c.con, nombre: c.nombre };

  // Datos de una escena según los ajustes
  function datos(tipo, a) {
    const gana = a.izqGana ? 'A' : 'B';
    const pGana = a.izqGana ? a.p : 1 - a.p;
    const comun = { tipo, jugada: 3, minuto: 23, marcador: [1, 1] };
    const poderes = a.poder ? [{ equipo: a.poder === 'izq' ? 'A' : 'B', carta: (a.poder === 'izq' ? alA : alB).med[0].id, poder: 'Poder de prueba', momento: 'posesion' }] : [];
    const defensas = alB.def.map(c => ({ carta: c.id, DEF: c.DEF }));
    switch (tipo) {
      case 'inicio': return { ...comun, jugada: 0, minuto: 0, marcador: [0, 0], tacticas: { A: 'presion', B: 'contraataque' } };
      case 'saque': return { ...comun, equipo: 'A' };
      case 'poder': return { ...comun, equipo: a.poder === 'der' ? 'B' : 'A', carta: (a.poder === 'der' ? alB : alA).med[0].id, poder: 'Tiki-taka', momento: 'posesion' };
      case 'control': return { ...comun, equipo: 'A', saca: 'A', ganador: gana, p: a.p, pGanador: pGana, robo: gana !== 'A', sorpresa: pGana < RITMO.SORPRESA_P, poderes };
      case 'robo': return { ...comun, equipo: 'B' };
      case 'ataque': case 'pase': case 'corte':
        return { ...comun, equipo: 'A', defensor: 'B', defensas, p: a.p, exito: a.izqGana, contraataque: false, poderes };
      case 'tirador': {
        const cand = [...alA.med, ...alA.del].map(c => ({ carta: c.id, p: 0.25 }));
        return { ...comun, equipo: 'A', candidatos: cand, elegido: cand[Math.floor(Math.random() * cand.length)].carta, p: a.p };
      }
      case 'chut': case 'gol': case 'parada':
        return { ...comun, equipo: 'A', defensor: 'B', tirador: alA.del[0].id, portero: alB.por.id, p: a.p, gol: a.izqGana, marcadorTras: [2, 1], poderes };
      case 'lesion': return { ...comun, equipo: 'A', carta: alA.def[0].id, suplente: alA.banquillo[0]?.id ?? null };
      case 'descanso': return { ...comun, jugada: 5, minuto: 45, posesion: { A: a.p, B: 1 - a.p },
        planB: [{ equipo: 'A', de: 'posesion', a: 'presion' }], cambios: [{ equipo: 'A', sale: alA.med[1].id, entra: alA.banquillo[0]?.id ?? alA.med[0].id }, { equipo: 'B', sale: alB.del[0].id, entra: alB.banquillo[0]?.id ?? alB.del[1].id }] };
      case 'final': return { ...comun, jugada: 10, minuto: 90, marcador: [2, 1], goles: [2, 1], penaltis: null, mejor: { carta: alA.del[0].id, pr: 7.4, equipo: 'A' } };
      default: return comun;
    }
  }
  const ritmo = (e, a) => { if (!SIN_P.has(e.tipo)) e.completo = a.version === 'completa' ? true : a.version === 'rapida' ? false : (a.p >= RITMO.IGUALADO_MIN && a.p <= RITMO.IGUALADO_MAX); };

  function jugar(escenas, variantes = {}) {
    const a = ajustes();
    const guion = { ...base, escenas };
    decorar(guion, `muestrario-${Date.now()}`, VARIANTES);
    for (const e of escenas) { ritmo(e, a); if (variantes[e.tipo]) e.variante = variantes[e.tipo]; }
    reproducir(guion, cartas, { yaDecorado: true, soloEscenas: true });
  }

  el.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => {
    const a = ajustes(), tipo = b.dataset.tipo;
    jugar([datos(tipo, a)], { [tipo]: b.dataset.variante });
  }));
  $('[data-jugada]').addEventListener('click', () => {
    const a = ajustes();
    const tipos = ['saque', ...(a.poder ? ['poder'] : []), 'control', ...(a.izqGana ? [] : ['robo']), 'ataque', 'pase', 'tirador', 'chut', a.izqGana ? 'gol' : 'parada'];
    jugar(tipos.map(t => datos(t, { ...a, izqGana: t === 'control' || t === 'robo' ? a.izqGana : t === 'pase' ? true : a.izqGana })));
  });
  $('[data-ejemplo]').addEventListener('click', () => {
    const semilla = Math.floor(Math.random() * 4294967296);
    const r = MOTOR_ACTUAL.simularPartido(alA, alB, semilla);
    const guion = crearGuion({ partido: { id: `ejemplo-${semilla}`, version_motor: MOTOR_ACTUAL.VERSION, goles: r.goles, pr: r.pr },
      alineaciones: { local: alA, visitante: alB }, eventos: r.eventos, equipos, yo: equipos.A.id });
    reproducir(guion, cartas, {});
  });
}
