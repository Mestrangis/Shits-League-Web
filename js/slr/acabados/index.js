/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — registro de acabados
   Un acabado es el aspecto especial de un diseño de carta (disenos_carta.acabado).
   Cada uno vive en su propio par de archivos y cumple el mismo contrato:

     js/slr/acabados/<id>.js   export default {
                                 id: '<id>',            // = valor del enum acabado_carta
                                 nombre: 'Oro',         // para la interfaz
                                 descripcion: '…',
                                 sigue: true,           // opcional: sus capas siguen el
                                                        // dedo/ratón/giroscopio (--x, --y)
                                 alMover(carta, x, y),  // opcional: hook en el rAF compartido
                               }
     css/acabados/<id>.css     reglas bajo .slr-carta--<id> (ver el contrato en el CSS)

   Añadir uno nuevo (p. ej. «oro»):
     1. migración: alter type public.acabado_carta add value 'oro';
     2. crear js/slr/acabados/oro.js y css/acabados/oro.css;
     3. importarlo y registrarlo aquí, y añadir su @import al principio de css/slr.css.
   El muestrario del modo pruebas (Perfil) los enseña todos lado a lado.
═══════════════════════════════════════════════ */
import foil from './foil.js';
import brillante from './brillante.js';
import plateada from './plateada.js';

const REGISTRO = new Map();

export function registrarAcabado(def) {
  if (!def?.id || !def.nombre) throw new Error('[acabados] un acabado necesita id y nombre');
  REGISTRO.set(def.id, def);
}

registrarAcabado({ id: 'normal', nombre: 'Normal', descripcion: 'Sin efecto' });
[foil, brillante, plateada].forEach(registrarAcabado);

// Si un diseño trae un acabado que esta versión de la web no conoce, se pinta normal
export const acabado = id => REGISTRO.get(id) ?? REGISTRO.get('normal');
export const listaAcabados = () => [...REGISTRO.values()];
