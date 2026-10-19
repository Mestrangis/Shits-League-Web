/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: registro de escenas y variantes
   Cada tipo de escena del guion tiene sus variantes: { id: función(ctx) }.
   La función monta la escena en ctx.escenario y la anima en ctx.linea.
   Para añadir una variante: escribe la función (en el archivo de su tipo o en
   uno nuevo) y añádela aquí. Nada más: el reproductor y el azar la recogen.
═══════════════════════════════════════════════ */
import * as inicio from './inicio.js';
import * as saque from './saque.js';
import * as poder from './poder.js';
import * as control from './control.js';
import * as robo from './robo.js';
import * as ataque from './ataque.js';
import * as pase from './pase.js';
import * as corte from './corte.js';
import * as tirador from './tirador.js';
import * as chut from './chut.js';
import * as gol from './gol.js';
import * as parada from './parada.js';
import * as pausas from './pausas.js';

export const REGISTRO = Object.freeze({
  inicio: { vs: inicio.vs },
  saque: { franja: saque.cruce },
  poder: { carta: poder.carta },
  control: { botas: control.botas, bote: control.bote, escudos: control.escudos },
  robo: { contraataque: robo.franjaRoja },
  ataque: { rueda: ataque.rueda },
  pase: { estela: pase.estela },
  corte: { entrada: corte.entrada, despeje: corte.despeje, choque: corte.choque },
  tirador: { ruleta: tirador.ruleta },
  chut: { disparo: chut.disparo },
  gol: { red: gol.red, chilena: gol.chilena, ardiendo: gol.ardiendo },
  parada: { estirada: parada.estirada, punos: parada.punos, atrapada: parada.atrapada },
  lesion: { aviso: pausas.aviso },
  descanso: { resumen: pausas.resumen },
  final: { resultado: pausas.resultado },
});

// Los ids de las variantes de cada tipo (para el azar y el muestrario)
export const VARIANTES = Object.freeze(Object.fromEntries(Object.entries(REGISTRO).map(([k, v]) => [k, Object.keys(v)])));

// Nombres para el muestrario
export const NOMBRES = Object.freeze({
  inicio: 'Inicio', saque: 'Saque', poder: 'Poder', control: 'Duelo de control', robo: 'Robo y contraataque',
  ataque: 'Ataque contra defensa', pase: 'El ataque pasa', corte: 'Corte', tirador: 'Quién chuta', chut: 'Chut',
  gol: 'Gol', parada: 'Parada', lesion: 'Lesión', descanso: 'Descanso', final: 'Final',
});
