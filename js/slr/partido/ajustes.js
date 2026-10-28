/* ═══════════════════════════════════════════════════════════════════════════
   SHITS LEAGUE RUSH — AJUSTES DE LA REPRODUCCIÓN DE PARTIDOS (para tocar a mano)

   Aquí se decide cómo se ve y cuánto dura todo. El código lee SOLO de aquí.

   CÓMO PROBAR UN CAMBIO
   1. Cambia el valor y guarda el archivo.
   2. Recarga la web (si no ves el cambio, recarga sin caché: Ctrl+Shift+R).
   3. Rush → Perfil → Modo pruebas → «🎬 Escenas de partido»: cada botón reproduce
      una escena y una variante; arriba eliges quién ataca, la probabilidad y
      quién gana. «⏸» congela la escena para mirarla con calma.

   SI TE EQUIVOCAS
   Si un valor no vale (un número negativo, un texto vacío, una clave que no
   existe, un tipo distinto…), se usa el de por defecto y sale un aviso en la
   consola del navegador (F12 → Consola) diciendo cuál. La reproducción nunca se
   rompe. Si el archivo entero tiene un error de escritura (una coma de menos…),
   se usan todos los de por defecto y también se avisa.

   UNIDADES: ms = milisegundos (1000 ms = 1 s) · px = píxeles · «veces» = multiplica
   · «fracción» = de 0 a 1 (0,5 = la mitad). Los decimales van con punto: 0.5.
   Los tiempos son a velocidad ×1 (con ×2 todo va el doble de rápido).
   ═══════════════════════════════════════════════════════════════════════════ */

export const AJUSTES = {

  /* ── TIEMPOS ─────────────────────────────────────────────────────────────
     «completo» = duelo igualado o final apretado; «rapido» = duelo muy claro
     (ver RITMO). En las escenas con barra, la animación va A LA VEZ que la
     barra y su desenlace coincide con el golpe final de la barra. */
  tiempos: {
    entre_escenas: 50,        // ms de pausa entre una escena y la siguiente (0–1000)
    reloj_minuto_max: 3000,    // ms que tarda como mucho el reloj en avanzar un minuto (300–5000)

    inicio:  { total: 3500,    // ms que dura el «VS» del principio (2000–10000)
               entrada: 900,   // ms que tardan en entrar los dos equipos (0–2000)
               silbato: 1300 },// ms hasta que suena el silbato inicial (0–5000)
    saque:   { entra: 350,     // ms que tarda la franja en entrar; 0 = aparece de golpe (0–1000)
               queda: 1600,    // ms quieta en el centro, como mínimo (la regla de LECTURA puede alargarla) (500–5000)
               sale: 25 },    // ms que tarda en salir; 0 = desaparece de golpe (0–1000)
    poder:   { total: 2300,    // ms que se ve la carta con su poder (1000–6000)
               entrada: 550 }, // ms que tarda en entrar la carta (0–1500)

    control: { completo: 3000, // ms del duelo de control con la barra y la animación a la vez (2000–9000)
               rapido: 1500 }, // ms en versión rápida (800–5000)
    robo:    { rotulo: 1000,   // ms mínimos del «¡ROBO!» (800–4000)
               franja: 1400 }, // ms mínimos de la franja de «CONTRAATAQUE» quieta (800–4000)

    ataque:  { completo: 1300, // ms del balón rodando ante la defensa (800–5000)
               rapido: 1100 },
    pase:    { completo: 1400, // ms del balón pasando entre los defensas (600–4000)
               rapido: 1050 },
    corte:   { completo: 1200, // ms hasta que el defensa se lleva el balón (luego, el rótulo) (600–4000)
               rapido: 900 },

    tirador: { completo: 2200, // ms de la ruleta de quién chuta (1000–6000)
               rapido: 1300,
               grande: 700,    // ms que tarda el elegido en ponerse en grande (200–2000)
               pasos: 16 },    // cuántas veces salta la luz de carta en carta (6–40)
    chut:    { barra_completo: 2300,  // ms de la escena del chut: la viñeta del choque mientras pelea la barra (1000–8000)
               barra_rapido: 1200 },
    gol:     { marcador: 300,  // ms tras entrar el balón hasta que se actualiza el marcador (0–1500)
               celebracion: 2000 }, // ms mínimos del «GOL» en pantalla (800–6000)
    // (lo que duran las viñetas de gol y de parada se cambia en VIÑETAS, más abajo)

    lesion: 2500,              // ms del aviso de lesión (1000–6000)
    descanso: 5300,            // ms del descanso (2000–12000)
    final: 6000,               // ms de la pantalla final (2000–15000)
  },

  /* ── VIÑETAS ──────────────────────────────────────────────────────────────
     Las animaciones de gol, de parada y de las tácticas (js/slr/partido/vinetas.js) tienen sus
     propios tiempos dentro; aquí solo se estiran o se encogen enteras.
     1 = como están dibujadas · 2 = el doble de lenta · 0.5 = el doble de rápida (0.3–3) */
  vinetas: {
    gol_red: 1,
    gol_chilena: 1,
    gol_ardiendo: 1,
    parada_punos: 1,
    parada_atrapada: 1,
    parada_estirada: 1,
    tacticas_choque: 1,        // el cruce de tácticas del principio (y el del descanso si hay plan B)
    tacticas_cambio: 1,        // el plan B del descanso
  },

  /* ── LECTURA ─────────────────────────────────────────────────────────────
     Un texto grande (rótulo o franja) se queda en pantalla al menos
     minimo + por_palabra × (número de palabras), y la escena no avanza antes
     (solo el tap la adelanta). */
  lectura: {
    minimo: 1200,              // ms (500–4000)
    por_palabra: 200,          // ms por palabra (0–800)
  },

  /* ── BARRA DE PORCENTAJES ────────────────────────────────────────────────
     Su duración es la de la escena (tiempos.control, tiempos.chut.barra_*). */
  barra: {
    aparece: 300,              // ms que tarda en aparecer (100–1000)
    pelea: 0.60,               // fracción de la barra en la que los dos lados se empujan; el resto es el golpe final (0.4–0.9)
    sorpresa: 0.22,            // fracción, dentro de la pelea, en la que casi gana el favorito antes de darse la vuelta (0.1–0.4)
    empujones: 6,              // cuántas veces cambia de lado durante la pelea; menos = más lenta (2–14)
    llamarada: 550,            // ms del fogonazo del ganador al aplastar la barra (200–1500)
  },

  /* ── FONDO (césped) ──────────────────────────────────────────────────────
     Las franjas de césped corren en el sentido del ataque. */
  fondo: {
    franja: 64,                // px de alto de cada franja (24–160)
    velocidad: {               // ms que tarda en pasar UNA franja: menos = más rápido (80–5000)
      lento: 1400,
      normal: 520,
      rapido: 260,
    },
    escenas: {                 // cómo corre en cada escena: 'parado', 'lento', 'normal' o 'rapido'
      inicio: 'parado', cruce: 'parado', planb: 'parado', saque: 'normal', poder: 'parado', control: 'lento', robo: 'rapido',
      ataque: 'rapido', pase: 'rapido', corte: 'parado', tirador: 'rapido', chut: 'parado',
      gol: 'parado', parada: 'parado', lesion: 'parado', descanso: 'parado', final: 'parado',
    },
  },

  /* ── TEXTOS ──────────────────────────────────────────────────────────────
     Cada texto es una lista: si hay varios, se elige uno al azar (con el azar de
     la animación, así que el mismo partido saca siempre el mismo). Puedes añadir
     frases nuevas: ['¡PARADÓN!', '¡QUÉ MANOS!']. Ninguno puede estar vacío. */
  textos: {
    vs: ['VS'],
    ataca: ['ATACA'],                         // en la franja del saque, tras el nombre del equipo
    poder: ['⚡ PODER'],
    control: ['Control del balón'],           // título de la barra del duelo de control
    robo: ['¡ROBO!'],
    contraataque: ['CONTRA'],
    sorpresa: ['¡SORPRESA!'],
    cortado: ['¡CORTADO!'],
    chut: ['Chut'],                           // título de la barra del chut
    gol: ['GOL'],
    puños: ['¡DE PUÑOS!'],
    atrapada: ['¡A LAS MANOS!'],
    estirada: ['¡PARADÓN!'],
    lesion: ['🚑 LESIÓN'],
    descanso: ['DESCANSO'],
    final: ['FINAL'],
    mejor_carta: ['MVP'],
    toca: ['Toca: avanzar · Mantén: ×2'],     // la pista de abajo
  },

  /* ── EFECTOS ─────────────────────────────────────────────────────────── */
  efectos: {
    temblor: 2,                // veces la fuerza de todos los temblores; 0 = sin temblores (0–3)
    particulas: 3,             // veces el número de chispas y llamas; 0 = ninguna (0–3)
    balon: 86,                 // px del balón como mucho (en pantallas pequeñas se encoge) (32–140)
    microvibracion: 2,         // px de la vibración del balón rodando en el ataque (0–8)
  },

  /* ── RITMO ───────────────────────────────────────────────────────────────
     Probabilidades como fracción (0.4 = 40 %). */
  ritmo: {
    igualado_min: 0.40,        // si la probabilidad está entre estos dos, el duelo va en versión completa (0–1)
    igualado_max: 0.60,
    final_desde_jugada: 8,     // desde esta jugada (de 10), con el marcador igualado, todo completo (1–10)
    final_diferencia_max: 1,   // «igualado» = como mucho esta diferencia de goles (0–5)
    sorpresa: 0.30,            // «¡SORPRESA!» si gana el que tenía menos de esto (0–0.5)
  },
};
