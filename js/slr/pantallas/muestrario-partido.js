/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — muestrario de escenas de partido (Modo pruebas)
   Un botón por cada escena y variante (escenas/registro.js), un deslizador de
   probabilidad, quién ataca (tú, abajo y hacia arriba; o el rival, arriba y
   hacia abajo), el resultado (gana el que ataca o el que defiende: gol o
   parada, pasa o lo cortan, mantiene o roban), la versión (automática,
   completa o rápida), si hay un poder y cómo sale el cruce de tácticas (el plan B
   es del equipo que ataca). Para revisar el diseño de cada una por separado,
   también una jugada entera y un partido de ejemplo (con tus cartas).
═══════════════════════════════════════════════ */
import { esc, hoja, toast } from '../ui.js';
import { REGISTRO, VARIANTES, NOMBRES } from '../partido/escenas/registro.js';
import { reproducir } from '../partido/reproductor.js';
import { crearGuion } from '../partido/guion.js';
import { decorar } from '../partido/azar.js';
import { RITMO } from '../partido/config.js';
import { MOTOR_ACTUAL } from '../motores.js';

const SIN_P = new Set(['inicio', 'cruce', 'planb', 'saque', 'poder', 'robo', 'lesion', 'descanso', 'final']);

export function abrirMuestrarioPartido(ctx) {
  const mias = (ctx.datos.cartas ?? []).slice();
  if (mias.length < 7) { toast('Hacen falta al menos 7 cartas en tu plantilla para el muestrario', 'error'); return; }
  const el = hoja(`
    <div class="slr-muestra-pt">
      <p class="slr-suave">Cada botón reproduce esa escena con esa variante. Abajo, tu equipo (verde); arriba, el rival (naranja).
        Toca la pantalla para saltar al final de la escena; ⏸ la congela.</p>
      <div class="slr-muestra-pt__ajustes slr-tarjeta">
        <label>Ataca (y, en el plan B, quién cambia)
          <select class="slr-input" data-ataca>
            <option value="A">Tu equipo (abajo, hacia arriba ▲)</option>
            <option value="B">El rival (arriba, hacia abajo ▼)</option>
          </select></label>
        <label>Probabilidad del que ataca: <b data-p-texto>50 %</b>
          <input type="range" min="3" max="97" value="50" data-p></label>
        <label>Resultado
          <select class="slr-input" data-resultado>
            <option value="ataca">Gana el que ataca (mantiene · pasa · gol)</option>
            <option value="defiende">Gana el que defiende (robo · corte · parada)</option>
          </select></label>
        <label>Versión
          <select class="slr-input" data-version>
            <option value="auto">Automática (según la probabilidad)</option>
            <option value="completa">Completa</option>
            <option value="rapida">Rápida</option>
          </select></label>
        <label>Poder antes de la fase
          <select class="slr-input" data-poder>
            <option value="">Ninguno</option><option value="ataca">Del que ataca</option><option value="defiende">Del que defiende</option>
          </select></label>
        <label>Cruce de tácticas
          <select class="slr-input" data-cruce>
            <option value="abajo">Gana tu equipo (abajo)</option>
            <option value="arriba">Gana el rival (arriba)</option>
            <option value="igual">Misma táctica (sin ventaja)</option>
          </select></label>
      </div>
      <div class="slr-muestra-pt__grupo"><h3>Seguidas</h3><div class="slr-muestra-pt__botones">
        <button class="slr-btn" type="button" data-jugada>▶ Una jugada entera</button>
        <button class="slr-btn" type="button" data-ejemplo>▶ Partido de ejemplo (con tus cartas)</button>
        <button class="slr-btn" type="button" data-ejemplo-planb>▶ Partido con plan B</button>
      </div></div>
      ${Object.keys(REGISTRO).map(tipo => `<div class="slr-muestra-pt__grupo"><h3>${esc(NOMBRES[tipo] ?? tipo)}</h3><div class="slr-muestra-pt__botones">
        ${VARIANTES[tipo].map(v => `<button class="slr-btn slr-btn--fantasma" type="button" data-tipo="${tipo}" data-variante="${v}">${esc(v)}</button>`).join('')}
      </div></div>`).join('')}
    </div>`, { titulo: 'Escenas de partido', completa: true });

  const $ = s => el.querySelector(s);
  $('[data-p]').addEventListener('input', e => { $('[data-p-texto]').textContent = `${e.target.value} %`; });
  const ajustes = () => ({
    p: Number($('[data-p]').value) / 100, atacaGana: $('[data-resultado]').value === 'ataca', ataca: $('[data-ataca]').value,
    version: $('[data-version]').value, poder: $('[data-poder]').value, cruce: $('[data-cruce]').value,
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
  const base = { stats: {}, lados: { abajo: 'A', arriba: 'B' }, equipos, partidoId: 'muestrario' };
  for (const c of Object.values(cartas)) base.stats[c.id] = { ATA: c.ata, DEF: c.def, CON: c.con, nombre: c.nombre };

  // Datos de una escena según los ajustes: at ataca (o saca), df defiende
  function datos(tipo, a) {
    const at = a.ataca, df = at === 'A' ? 'B' : 'A';
    const alAt = at === 'A' ? alA : alB, alDf = at === 'A' ? alB : alA;
    const gana = a.atacaGana ? at : df;
    const pGana = a.atacaGana ? a.p : 1 - a.p;
    const comun = { tipo, jugada: 3, minuto: 23, marcador: [1, 1] };
    const quien = a.poder === 'defiende' ? df : at;
    const poderes = a.poder ? [{ equipo: quien, carta: (quien === at ? alAt : alDf).med[0].id, poder: 'Poder de prueba', momento: 'posesion' }] : [];
    const defensas = alDf.def.map(c => ({ carta: c.id, DEF: c.DEF }));
    switch (tipo) {
      case 'inicio': return { ...comun, jugada: 0, minuto: 0, marcador: [0, 0], tacticas: { A: 'presion', B: 'contraataque' } };
      case 'cruce': {
        // Tu equipo (A) abajo: contraataque gana a posesión
        const t = { abajo: { A: 'contraataque', B: 'posesion' }, arriba: { A: 'posesion', B: 'contraataque' }, igual: { A: 'presion', B: 'presion' } }[a.cruce];
        return { ...comun, jugada: 0, minuto: 0, marcador: [0, 0], tacticas: t, cruce: { abajo: 'A', arriba: 'B', igual: null }[a.cruce],
          bonus: MOTOR_ACTUAL.CONFIG.BONUS_CRUCE, momento: 'inicio' };
      }
      case 'planb': return { ...comun, jugada: 5, minuto: 45, equipo: at, de: 'posesion', a: 'presion', condicion: 'empatando' };
      case 'saque': return { ...comun, equipo: at };
      case 'poder': return { ...comun, equipo: quien, carta: (quien === at ? alAt : alDf).med[0].id, poder: 'Tiki-taka', momento: 'posesion' };
      case 'control': return { ...comun, equipo: at, saca: at, ganador: gana, p: a.p, pGanador: pGana, robo: gana !== at, sorpresa: pGana < RITMO.SORPRESA_P, poderes,
        medios: { A: alA.med.map(c => c.id), B: alB.med.map(c => c.id) } };
      case 'robo': return { ...comun, equipo: df };
      case 'ataque': case 'pase': case 'corte':
        return { ...comun, equipo: at, defensor: df, defensas, p: a.p, exito: a.atacaGana, contraataque: false, poderes };
      case 'tirador': {
        const cand = [...alAt.med, ...alAt.del].map(c => ({ carta: c.id, p: 0.25 }));
        return { ...comun, equipo: at, candidatos: cand, elegido: cand[Math.floor(Math.random() * cand.length)].carta, p: a.p };
      }
      case 'chut': case 'gol': case 'parada':
        return { ...comun, equipo: at, defensor: df, tirador: alAt.del[0].id, portero: alDf.por.id, p: a.p, gol: a.atacaGana,
          marcadorTras: at === 'A' ? [2, 1] : [1, 2], poderes };
      case 'lesion': return { ...comun, equipo: at, carta: alAt.def[0].id, suplente: alAt.banquillo[0]?.id ?? null };
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
    // Una jugada con gol (gana el que ataca) o con parada; si se elige que gane el que defiende, con robo antes
    const tipos = ['saque', ...(a.poder ? ['poder'] : []), 'control', ...(a.atacaGana ? [] : ['robo']), 'ataque', 'pase', 'tirador', 'chut', a.atacaGana ? 'gol' : 'parada'];
    const tras = { ...a, ataca: a.atacaGana ? a.ataca : (a.ataca === 'A' ? 'B' : 'A') };   // tras un robo ataca el otro
    jugar(tipos.map(t => (['saque', 'poder', 'control', 'robo'].includes(t) ? datos(t, a) : datos(t, { ...tras, atacaGana: t === 'pase' ? true : a.atacaGana }))));
  });
  const ejemplo = (A, B, semilla) => {
    const r = MOTOR_ACTUAL.simularPartido(A, B, semilla);
    const guion = crearGuion({ partido: { id: `ejemplo-${semilla}`, version_motor: MOTOR_ACTUAL.VERSION, goles: r.goles, pr: r.pr },
      alineaciones: { local: A, visitante: B }, eventos: r.eventos, equipos, yo: equipos.A.id, bonusCruce: MOTOR_ACTUAL.CONFIG.BONUS_CRUCE });
    return reproducir(guion, cartas, {});
  };
  $('[data-ejemplo]').addEventListener('click', () => ejemplo(alA, alB, Math.floor(Math.random() * 4294967296)));
  // Con plan B: los dos lo activan si van empatando al descanso; se busca una semilla en la que salte el de los dos (o, si no, el de uno)
  $('[data-ejemplo-planb]').addEventListener('click', () => {
    const A = { ...alA, tactica: 'posesion', plan_b: { condicion: 'empatando', tactica: 'contraataque' } };
    const B = { ...alB, tactica: 'contraataque', plan_b: { condicion: 'empatando', tactica: 'presion' } };
    const inicio = Math.floor(Math.random() * 4294967296);
    let elegida = null;
    for (let k = 0; k < 400; k++) {
      const s = (inicio + k) >>> 0;
      const n = MOTOR_ACTUAL.simularPartido(A, B, s).eventos.filter(e => e.tipo === 'plan_b').length;
      if (n === 2) { elegida = s; break; }
      if (n && elegida == null) elegida = s;
    }
    ejemplo(A, B, elegida ?? inicio);
  });
}
