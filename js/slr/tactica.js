/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — tácticas en la interfaz (motor v2.0.0)
   Nombres, iconos y frases de las tácticas, la gestión y la energía; chips de
   táctica, cruce y sinergia; la barra de energía; y la ayuda «¿Cómo funciona?».
   Los números salen de CONFIG del motor y de js/slr/energia.js.
═══════════════════════════════════════════════ */
import { CONFIG, ganaCruce, sinergia } from './motor-v2.0.0.js';
import { esc, hoja } from './ui.js';
import { coleccion } from './colecciones.js';
import { GASTO_ESTAMINA, GESTIONES, RECUPERA, RECUPERA_SIN_JUGAR, tramoEnergia } from './energia.js';

const pct = x => `${Math.round((x - 1) * 100)} %`;
// Icono de una táctica: el SVG de img/slr/tacticas como máscara, del color del texto (.slr-ico-tac en el CSS)
const ico = t => `<i class="slr-ico-tac slr-ico-tac--${t}" aria-hidden="true"></i>`;

export const TACTICA = Object.freeze({
  posesion: {
    nombre: 'Posesión', icono: ico('posesion'),
    frase: `Tener el balón: +${pct(CONFIG.TACTICA_POSESION)} al disputarlo. Sus contras no llevan bonus.`,
  },
  contraataque: {
    nombre: 'Contraataque', icono: ico('contraataque'),
    frase: `Atrás y a la contra: contras +${pct(CONFIG.CONTRAATAQUE_CONTRA)} y defensa +${pct(CONFIG.DEFENSA_CONTRA)}.`,
  },
  presion: {
    nombre: 'Presión', icono: ico('presion'),
    frase: `Robar arriba: +${pct(CONFIG.PRESION_ROBO)} cuando saca el rival. Cansa más (×1,3 de energía).`,
  },
});
// A qué gana y contra qué pierde cada una
export const ganaA = t => CONFIG.GANA_A[t];
export const pierdeCon = t => Object.keys(CONFIG.GANA_A).find(k => CONFIG.GANA_A[k] === t);

export const ESTAMINA = Object.freeze({
  alta: { nombre: 'Alta', icono: '🔋', gasto: GASTO_ESTAMINA.alta },
  media: { nombre: 'Media', icono: '🔋', gasto: GASTO_ESTAMINA.media },
  baja: { nombre: 'Baja', icono: '🪫', gasto: GASTO_ESTAMINA.baja },
});

export const CONDICION_PLAN_B = Object.freeze({ ganando: 'si va ganando', empatando: 'si va empatando', perdiendo: 'si va perdiendo' });
export const CONDICION_CAMBIO = Object.freeze({
  siempre: 'Siempre', ganando: 'Si va ganando', empatando: 'Si va empatando', perdiendo: 'Si va perdiendo',
  energia_menor: 'Si su energía baja de…',
});
export const MOTIVO_CAMBIO = Object.freeze({ reservon: 'reservón', cansado: 'cansado', programado: 'programado', lesion: 'lesión' });

export const iconoTactica = t => (TACTICA[t] ? `<span class="slr-tactica-icono" title="${esc(TACTICA[t].nombre)}">${TACTICA[t].icono}</span>` : '');
export const chipTactica = (t, clase = '') => (TACTICA[t]
  ? `<span class="slr-chip-tactica ${clase}">${TACTICA[t].icono} ${esc(TACTICA[t].nombre)}</span>` : '');

// Barra de energía: fina (en la carta) o con número y aviso (fichas y listas)
export function barraEnergia(energia, { numero = true, aviso = false } = {}) {
  if (energia == null) return '';
  const t = tramoEnergia(energia);
  return `<span class="slr-energia slr-energia--${t.clase}" title="Energía ${energia} · ${esc(t.texto)}">
    <span class="slr-energia__barra"><i style="width:${Math.max(0, Math.min(100, energia))}%"></i></span>
    ${numero ? `<b>${energia}</b>` : ''}${aviso && t.penal ? `<em>${esc(t.texto)}</em>` : ''}</span>`;
}

// Chip de sinergia de un once: «Sinergia Dormidito ×3 (+4 %)» ('' si no hay)
export function chipSinergia(cartas, clase = '') {
  const s = sinergia(cartas.filter(Boolean));
  return textoSinergia(s, clase);
}
export function textoSinergia(s, clase = '') {
  if (!s?.coleccion) return '';
  const col = coleccion(s.coleccion);
  return `<span class="slr-chip-sinergia ${clase}${col?.color ? ` slr-col-${esc(col.color)}` : ''}" title="Titulares de la misma colección: +${pct(s.mult)} a posesión, ataque y defensa">
    ✦ Sinergia ${esc(col?.nombre ?? 'colección')} ×${s.cartas} (+${pct(s.mult)})</span>`;
}

// Quién gana el cruce: 'A', 'B' o null
export function cruce(tA, tB) {
  const g = ganaCruce(tA, tB);
  return g == null ? null : g === 0 ? 'A' : 'B';
}

/* ── Ayuda: «¿Cómo funciona?» ────────────────────────────────────────────── */
export function abrirAyuda() {
  const filaT = t => `<li>${TACTICA[t].icono} <b>${TACTICA[t].nombre}</b>: ${esc(TACTICA[t].frase)}
    <small>Gana a ${TACTICA[ganaA(t)].nombre.toLowerCase()} · pierde con ${TACTICA[pierdeCon(t)].nombre.toLowerCase()}.</small></li>`;
  const tramos = CONFIG.ENERGIA.map(([desde, f], i) => {
    const hasta = i ? CONFIG.ENERGIA[i - 1][0] - 1 : 100;
    return `<li><span class="slr-energia slr-energia--${tramoEnergia(desde).clase}"><span class="slr-energia__barra"><i style="width:${hasta}%"></i></span></span>
      ${desde}–${hasta}: ${f === 1 ? 'rinde al 100 %' : `−${Math.round((1 - f) * 100)} % a sus stats`}</li>`;
  }).join('');
  hoja(`
    <div class="slr-ayuda">
      <p class="slr-ayuda__intro">Si no tocas nada, juegas con <b>posesión</b>, gestión <b>normal</b> y tu once guardado.
        Con eso se juega bien; lo demás es para afinar.</p>

      <h3 class="slr-subtitulo">Tácticas</h3>
      <ul class="slr-ayuda__lista">${CONFIG.TACTICAS.map(filaT).join('')}</ul>
      <p>Es como piedra, papel o tijera: quien gana el cruce suma <b>+${pct(CONFIG.BONUS_CRUCE)}</b> a posesión, ataque y defensa.
        Si los dos eligen la misma, no gana nadie. Nadie ve tu táctica hasta que se publica el partido.</p>
      <p><b>Plan B</b> (en «Avanzado»): al descanso, si se cumple lo que elijas (ganando, empatando o perdiendo), cambias de táctica para la segunda parte.</p>

      <h3 class="slr-subtitulo">Táctica favorita</h3>
      <p>Cada carta puede tener una (${CONFIG.TACTICAS.map(t => TACTICA[t].icono).join(' ')} en la carta). Si tu equipo juega con ella,
        sus stats suben un <b>+${pct(CONFIG.MULT_TACTICA_FAVORITA)}</b>. En la alineación se resaltan las que encajan con la táctica elegida.</p>

      <h3 class="slr-subtitulo">Energía</h3>
      <ul class="slr-ayuda__lista slr-ayuda__tramos">${tramos}</ul>
      <p>Cada partido de liga gasta energía según la <b>estamina</b> de la carta: alta ${GASTO_ESTAMINA.alta}, media ${GASTO_ESTAMINA.media},
        baja ${GASTO_ESTAMINA.baja}. Con presión, ×1,3; si juega solo una parte, la mitad.
        Tras cada jornada todas recuperan ${RECUPERA}, y las que no jugaron, ${RECUPERA_SIN_JUGAR} más. Los amistosos no cansan.
        Cada temporada empieza con todas a 100. Rotar compensa.</p>
      <p><b>Gestión</b> (los cambios del descanso):</p>
      <ul class="slr-ayuda__lista">${Object.values(GESTIONES).map(g => `<li><b>${g.nombre}</b>: ${esc(g.frase)}</li>`).join('')}</ul>
      <p>En «Avanzado» puedes programar hasta 3 cambios (quién sale, quién entra y cuándo). Si los programas, la gestión no se aplica.</p>

      <h3 class="slr-subtitulo">Sinergias</h3>
      <p>Titulares de la misma colección se entienden mejor: 2 → +${pct(CONFIG.SINERGIA[2])}, 3 → +${pct(CONFIG.SINERGIA[3])},
        4 o más → +${pct(CONFIG.SINERGIA[4])} a posesión, ataque y defensa. Cuenta la colección con más titulares.</p>
    </div>`, { titulo: '¿Cómo funciona?' });
}
