// Demo: simula un partido y lo narra por consola, jugada a jugada.
//   node tests/slr/demo.mjs [semilla] [liga|copa]
import { MOTOR_ACTUAL } from '../../js/slr/motores.js';
import { marcosFC, losDelFondo, CARTAS } from './cartas-prueba.mjs';

const { simularPartido, VERSION } = MOTOR_ACTUAL;

const semilla = Number(process.argv[2] ?? 12345);
const modo = process.argv[3] ?? 'liga';
const EQUIPO = { A: 'Marcos FC', B: 'Los del Fondo' };
const nombre = id => CARTAS[id]?.nombre ?? id;
const pct = p => `${Math.round(100 * p)} %`;
const f1 = x => x.toFixed(1).replace('.', ',');

const r = simularPartido(marcosFC(), losDelFondo(), semilla, { modo });
const marcador = [0, 0];

console.log(`\n  ${EQUIPO.A} — ${EQUIPO.B}   ·   motor v${VERSION} · semilla ${semilla} · ${modo}\n`);

for (const e of r.eventos) {
  const quien = EQUIPO[e.equipo];
  switch (e.tipo) {
    case 'inicio_jugada':
      console.log(`\n── Jugada ${e.jugada} · min ${e.minuto}' · saca ${EQUIPO[e.saca]}`);
      break;
    case 'poder':
      console.log(`   ✨ ${nombre(e.carta)} activa «${e.poder}» (${e.momento})`);
      break;
    case 'posesion': {
      const [fSaca, fRival] = e.saca === 'A' ? e.fuerzas : [e.fuerzas[1], e.fuerzas[0]];
      console.log(`   Posesión ${f1(fSaca)} contra ${f1(fRival)} → ${EQUIPO[e.saca]} al ${pct(e.p)}: ` +
        (e.contraataque ? `la pierde, contraataque de ${EQUIPO[e.ganador]}` : 'la gana'));
      break;
    }
    case 'ocasion':
      console.log(`   Ocasión de ${quien}: ${f1(e.fuerzaAtaque)} contra ${f1(e.fuerzaDefensa)} → ${pct(e.p)}: ` +
        (e.exito ? 'llegan' : 'corte'));
      break;
    case 'tirador':
      console.log(`   Tirador: ${e.candidatos.map(c => `${nombre(c.carta)} ${pct(c.p)}`).join(', ')} → ${nombre(e.elegido)}`);
      break;
    case 'chut':
      if (e.gol) marcador[e.equipo === 'A' ? 0 : 1]++;
      console.log(`   Chut de ${nombre(e.tirador)} (${f1(e.ata)}) contra ${nombre(e.portero)} (${f1(e.def)}) → ${pct(e.p)}: ` +
        (e.gol ? `⚽ GOL. ${marcador.join('-')}` : 'parada'));
      break;
    case 'cansancio':
      console.log(`   · ${nombre(e.carta)} (${quien}) se cansa: ${e.stat} ${e.valor}`);
      break;
    case 'lesion':
      console.log(`   🚑 Se lesiona ${nombre(e.carta)} (${quien})` +
        (e.suplente ? `: entra ${nombre(e.suplente)}` : ': sin cambios disponibles, sigue al 70 %'));
      break;
    case 'penalti':
      console.log(`   Penalti ${e.ronda} · ${nombre(e.lanzador)} (${quien}) → ${pct(e.p)}: ${e.gol ? 'gol' : 'fallo'}`);
      break;
    case 'fin_partido':
      console.log(`\n══ Final: ${EQUIPO.A} ${e.goles[0]}-${e.goles[1]} ${EQUIPO.B}` +
        (e.penaltis ? ` (penaltis ${e.penaltis[0]}-${e.penaltis[1]})` : ''));
      break;
  }
}

const est = r.estadisticas;
console.log('\n   Estadísticas (A-B)');
for (const k of Object.keys(est)) console.log(`   ${k.padEnd(11)} ${est[k][0]}-${est[k][1]}`);

const pr = Object.entries(r.pr).sort((x, y) => y[1] - x[1]);
console.log('\n   PR');
for (const [id, v] of pr) console.log(`   ${nombre(id).padEnd(22)} ${f1(v)}`);
console.log(`\n   MVP: ${nombre(pr[0][0])}\n`);
