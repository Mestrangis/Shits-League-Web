/* ═══════════════════════════════════════════════════════════════════════════
   AJUSTES DE LA SHITS LEAGUE

   Qué es: lo que se puede cambiar a mano, sin tocar nada más.
   Cómo cambiar algo: edita este archivo y haz push. Los móviles lo reciben solos
   la siguiente vez que abran la app. No hace falta subir CACHE_NAME.
   Si algo está mal escrito, la web no se rompe: usa el valor por defecto y lo avisa
   en la consola del navegador.
   Los textos van entre comillas 'así' (si llevan un apóstrofo, entre "comillas dobles").

   Los ajustes de las animaciones de Rush están en js/slr/partido/ajustes.js.

   El repo es público: aquí NO va ninguna clave secreta ni ningún código en claro.
═══════════════════════════════════════════════════════════════════════════ */

var AJUSTES = {

  /* ── TEMPORADAS ──────────────────────────────────────────────────────────
     De la más nueva a la más vieja: el orden importa.
       id:       corto y sin espacios. No lo cambies en una temporada que ya existe.
       nombre:   el que se ve. Lo de después («26/27») es lo que sale en el móvil.
       jornadas: las previstas, para la barra de Inicio. null: sin decidir.
       hoja:     el ID de su hoja de cálculo. '': temporada vacía.
       rush:     true si Rush existe en esta temporada. Si no, no lo pongas.
       imagenes: solo para las de antes de la web, en vez de hoja y jornadas.
     Ojo, una temporada nueva también hay que añadirla, con su hoja, a HOJAS en
     apps-script/votos.gs (y publicar el script), o no se podrá votar en ella.
     Cuál está en curso NO se decide aquí: es el botón «Empezar la temporada» del
     Modo pruebas de Rush.
     Ejemplo: { id: '27-28', nombre: 'Temporada 27/28', jornadas: 18, hoja: 'ID-de-la-hoja', rush: true },  */
  temporadas: [
    { id: '26-27', nombre: 'Temporada 26/27', jornadas: null, hoja: '1UW3JRsjC8DHPsMwz9LjyRrqPo2SVTBUtiLkpL8LqCIg', rush: true },
    { id: '24-26', nombre: 'Temporada 24/26', jornadas: 16, hoja: '1EHGrFt2Y3QDCOdSV3fVgWvspzXYcir4SmDxOezdSLRY' },
    { id: '23-24', nombre: 'Temporada 23/24', imagenes: [
      { src: 'assets/clasificación23-24.png', alt: 'Clasificación 23-24' },
      { src: 'assets/goles23-24.png',         alt: 'Goleadores 23-24' },
      { src: 'assets/Draft 2024.jpg',         alt: 'Draft 2024' },
    ] },
  ],

  /* ── ENLACES ─────────────────────────────────────────────────────────────
     Los de Inicio. Un enlace vacío ('') hace que ese botón no salga.
     Pueden ser una dirección completa o un archivo del repo ('assets/acta.pdf').  */
  enlaces: {
    spotify:    'https://open.spotify.com/playlist/4ED3CETGtGm8VYAhcC4Ok5?si=TRYceS8WTd-7zoKMXp3-Gg',
    youtube:    'https://youtube.com/playlist?list=PLTptgVdQcUSUE0YFK4LhRHxyxqTH96nJh&si=cMLi67cImjm7jOeQ',   // la lista de resúmenes
    acta:       'assets/acta.pdf',
    reglamento: 'assets/reglamento.pdf',
  },

  /* ── USUARIOS ────────────────────────────────────────────────────────────
       nombre: el que se ve. Cambiarlo no es solo un retoque: tiene que seguir
               coincidiendo con su nombre o alias de la hoja (pestaña Jugadores) y con
               el de Rush. Quien ya tenga la sesión abierta sigue con el nombre viejo
               hasta que vuelva a entrar.
       huella: la huella de su código, nunca el código. Sale de
               herramientas/huella-codigo.html, que ya te da la línea entera.
       foto:   la dirección de su foto de perfil. '': se muestra su inicial.
     Un usuario nuevo puede entrar en la Shits League con solo añadirlo aquí.
     En Rush, no: hay que darlo de alta también en el servidor.
     ADMIN Y BETA NO SE DECIDEN AQUÍ: los comprueba el servidor (Supabase), porque este
     archivo es público y cualquiera podría cambiarlo en su navegador.
     Ejemplo: { nombre: 'Paco', huella: '64-letras-y-numeros', foto: '' },  */
  usuarios: [
    { nombre: 'Marcos',   huella: '52e617dd6d2f75cb3bd76ca2eced4c582d83b6198ceb13a2ba6f6239164e51d2', foto: 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741814/DALL_E_2022-08-29_14.48.06_-_A_Capibara_DJ_in_a_discotheque_ezgybe.png' },
    { nombre: 'Alberto',  huella: '6ad5b293d45a59fb605bb5555c2f1abb80463cacd7046dee9fbd161fa0c3eb9e', foto: 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741813/pepe-bordalas-efe_ti5q4z.jpg' },
    { nombre: 'Puebla',   huella: 'a662bf96c60de6f68c3772bf36a5d922b2ff6d039d776fe1abafc65a8327785b', foto: 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741814/IMG_20220617_204510_tdek5a.jpg' },
    { nombre: 'Carlos',   huella: '0d0b9410216b3406881bddffcefd6babb1f96aa19719769e8ae63eed86e24444', foto: '' },
    { nombre: 'David',    huella: '23c069f629c80803552eb3e0f10a5481b1a41d09ddb7199d010accd1905c4bca', foto: '' },
    { nombre: 'Enzo',     huella: '26c0b5509c547b71161a295bbd759fcb6b2ec0fb776af9b2600943ceb163c82c', foto: '' },
    { nombre: 'Fernando', huella: '43745fe52a3546971a01544920739623969434c9f9beaca11e8100d5ffd37f4c', foto: '' },
    { nombre: 'Gonzalo',  huella: '173cd8246dfac4269ee0e673f26756a03501ee2ccf7400bf7479f491c31b3111', foto: '' },
    { nombre: 'Hugo',     huella: '2b72d3756802cffd53fad1e07da805e541294bf4d03f35bea19ed1d4ac10d3d6', foto: '' },
    { nombre: 'Nacho',    huella: '38579e0cb7462626ac97dce05058c92b1533d77e0f28ae984d52917f4fb7b8e0', foto: 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741813/IMG-20240508-WA0010_booqhn.jpg' },
    { nombre: 'Javier',   huella: 'a3d6d6994972d54c31de9c8e9a75b7412fbabd884ff93bfa17da4025f75c9644', foto: '' },
    { nombre: 'Jorge',    huella: '45d09ae39c7cadf013dc1e6b8ec35cc61cae18c855110fbc04e724af62cdce8f', foto: 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741813/IMG-20240621-WA0008_mbjgmj.jpg' },
    { nombre: 'Luis',     huella: '85eb7d8e2ed8c2bef9c0fdd1834d8432ca86abe82f03bd170ed557a3503d4089', foto: '' },
    { nombre: 'Mateo',    huella: '373286b822b86542cdb57ef5d2920e6988e6846f38bf733ac978ae4a730252f7', foto: 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791749321/apps.56233.14149010387777920.1f9829d6-41d4-4e5f-9e1d-eca24b9a3e17_fkoiil.png' },
    { nombre: 'Nicolás',  huella: 'e76a092c92cc697a7f9b0783f6f00f8ec845f1d284f72d6f28da44ad02102013', foto: 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741813/Captura_de_pantalla_2024-06-15_232610_jk5vm4.jpg' },
    { nombre: 'Pablo',    huella: '88180852b6a0cfcd3094d1794f63892b4d0918defac49b3f3f6e8ffb51d0dbd2', foto: '' },
    { nombre: 'Pelayo',   huella: '7b3762adf5389fc70848e60c00208af6768bd03877bc199549aec5254737d753', foto: '' },
    { nombre: 'Víctor',   huella: '327bef5f4505da8ef5b97fed057a33a6c4376efc9b07daee6086cbe69f202af7', foto: '' },
  ],

  /* ── TEXTOS ──────────────────────────────────────────────────────────────  */
  textos: {
    eslogan: 'La liga que nunca debió existir —',                                 // encima de SHITS LEAGUE
    frase: 'Es una mierda! Es la mayor mierda que he visto en toda mi vida.',     // debajo de SHITS LEAGUE
    sinEmpezar: 'La temporada aún no ha empezado',                                // cuando una temporada no tiene partidos
  },

  /* ── PUNTOS DE LA CLASIFICACIÓN ──────────────────────────────────────────
     Cuánto suma cada partido, al jugador normal y al capitán.
     Ojo: se aplica a TODAS las temporadas, también a las ya jugadas.  */
  puntos: {
    victoria: 3, empate: 1, derrota: 0,
    capitanVictoria: 7, capitanEmpate: 4, capitanDerrota: 2,
  },

  /* ── INICIO ──────────────────────────────────────────────────────────────  */
  inicio: {
    tusPartidosALaVista: 5,   // filas de «Tus partidos» antes de «Ver todos»
    segundosCarrusel: 5,      // cada cuánto pasa de tarjeta el carrusel de Líderes en el móvil
  },

  /* ── CALENDARIO ──────────────────────────────────────────────────────────
     El ID del Google Calendar del que sale «Próximo partido». Si lo cambias, cámbialo
     también en CALENDARIO_ID de apps-script/votos.gs (los avisos de partidos salen de ahí).  */
  calendario: '38a5afd4c120a661ffbf3e4392af235b395891931485fb16ebca3e152524e5c0@group.calendar.google.com',

  /* ── ADMINS ──────────────────────────────────────────────────────────────
     A quién se le enseñan en su perfil los botones de admin: quién tiene las notificaciones
     activadas, la notificación de prueba y el simulacro. Esto solo los enseña: lo que da
     acceso de verdad es su huella en HUELLAS_ADMIN de apps-script/votos.gs.  */
  admins: ['Marcos'],
};
