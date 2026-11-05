/* ═══════════════════════════════════════════════
   SHITS LEAGUE — lector-ajustes.js
   Lee ajustes.js (el archivo de la raíz, el que se edita a mano) y lo deja listo para
   el resto del código. Lo que esté mal escrito no rompe la web: se usa el valor por
   defecto de aquí abajo y se avisa en la consola.
   ajustes.js puede romperse entero (una comilla sin cerrar): entonces no llega a
   existir AJUSTES y se usa todo lo de aquí. Por eso estos valores son una copia de los buenos.
═══════════════════════════════════════════════ */

const AJUSTES_POR_DEFECTO = {
  temporadas: [
    { id: '26-27', nombre: 'Temporada 26/27', jornadas: null, hoja: '1UW3JRsjC8DHPsMwz9LjyRrqPo2SVTBUtiLkpL8LqCIg', rush: true, puntuacion: null },
    { id: '24-26', nombre: 'Temporada 24/26', jornadas: 16, hoja: '1EHGrFt2Y3QDCOdSV3fVgWvspzXYcir4SmDxOezdSLRY',
      puntuacion: { victoria: 3, empate: 1, derrota: 0, capitanVictoria: 7, capitanEmpate: 4, capitanDerrota: 2 } },
    { id: '23-24', nombre: 'Temporada 23/24', imagenes: [
      { src: 'assets/clasificación23-24.png', alt: 'Clasificación 23-24' },
      { src: 'assets/goles23-24.png',         alt: 'Goleadores 23-24' },
      { src: 'assets/Draft 2024.jpg',         alt: 'Draft 2024' },
    ] },
  ],
  enlaces: {
    spotify:    'https://open.spotify.com/playlist/4ED3CETGtGm8VYAhcC4Ok5?si=TRYceS8WTd-7zoKMXp3-Gg',
    youtube:    'https://youtube.com/playlist?list=PLTptgVdQcUSUE0YFK4LhRHxyxqTH96nJh&si=cMLi67cImjm7jOeQ',
    acta:       'assets/acta.pdf',
    reglamento: 'assets/reglamento.pdf',
  },
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
  textos: {
    eslogan: 'La liga que nunca debió existir —',
    frase: 'Es una mierda! Es la mayor mierda que he visto en toda mi vida.',
    sinEmpezar: 'La temporada aún no ha empezado',
  },
  inicio: { tusPartidosALaVista: 5, segundosCarrusel: 5 },
  calendario: '38a5afd4c120a661ffbf3e4392af235b395891931485fb16ebca3e152524e5c0@group.calendar.google.com',
  admins: ['Marcos'],
};

function leerAjustes(escritos, defecto, avisar) {
  const esTexto = v => typeof v === 'string' && v.trim() !== '';
  const esObjeto = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const seccion = nombre => {
    if (escritos[nombre] === undefined) return {};
    if (esObjeto(escritos[nombre])) return escritos[nombre];
    avisar(`«${nombre}» no es un grupo de valores entre { }: uso los de por defecto`);
    return {};
  };
  // Un grupo de valores con la misma forma que el de por defecto: lo que no valga, el de por defecto
  const grupo = (nombre, vale, explicacion) => Object.fromEntries(Object.entries(defecto[nombre]).map(([clave, porDefecto]) => {
    const v = seccion(nombre)[clave];
    if (v === undefined) return [clave, porDefecto];
    if (vale(v)) return [clave, typeof v === 'string' ? v.trim() : v];
    avisar(`${nombre}.${clave}: ${explicacion}. Uso el de por defecto`);
    return [clave, porDefecto];
  }));

  // La puntuación de una temporada; null si no tiene. Lo que falta vale 0, y el capitán, como los demás
  function puntuacion(escrita, base, donde) {
    if (escrita === undefined || escrita === null) return null;
    if (!esObjeto(escrita)) {
      avisar(`${donde}: la puntuación no es un grupo de valores entre { }`);
      return base?.puntuacion ?? null;
    }
    const valor = (clave, siFalta) => {
      const v = escrita[clave];
      if (v === undefined) return siFalta;
      if (typeof v === 'number' && v >= 0) return v;
      avisar(`${donde}: puntuacion.${clave} tiene que ser un número`);
      return base?.puntuacion?.[clave] ?? siFalta;
    };
    const victoria = valor('victoria', 0), empate = valor('empate', 0), derrota = valor('derrota', 0);
    return { victoria, empate, derrota, capitanVictoria: valor('capitanVictoria', victoria), capitanEmpate: valor('capitanEmpate', empate), capitanDerrota: valor('capitanDerrota', derrota) };
  }

  function temporada(t) {
    if (!esObjeto(t) || !esTexto(t.id)) { avisar('una temporada sin id: la ignoro'); return null; }
    const id = t.id.trim(), base = defecto.temporadas.find(x => x.id === id);
    const donde = `temporada ${id}`;
    let nombre = t.nombre;
    if (!esTexto(nombre)) {
      avisar(`${donde}: sin nombre`);
      nombre = base?.nombre ?? id;
    }
    const salida = { id, etiqueta: nombre.trim(), corta: nombre.match(/\d+\/\d+/)?.[0] ?? nombre.trim() };
    if (Array.isArray(t.imagenes)) {
      salida.imagenes = t.imagenes.filter(i => esObjeto(i) && esTexto(i.src));
      if (salida.imagenes.length !== t.imagenes.length) avisar(`${donde}: alguna imagen sin src, la ignoro`);
      return salida;
    }
    if (t.jornadas === null || (Number.isInteger(t.jornadas) && t.jornadas > 0)) salida.jornadas = t.jornadas;
    else {
      if (t.jornadas !== undefined) avisar(`${donde}: jornadas tiene que ser un número o null`);
      salida.jornadas = base?.jornadas ?? null;
    }
    if (typeof t.hoja === 'string') salida.hoja = t.hoja.trim();
    else {
      avisar(`${donde}: hoja tiene que ir entre comillas`);
      salida.hoja = base?.hoja ?? '';
    }
    if (t.rush === true) salida.rush = true;
    salida.puntuacion = puntuacion(t.puntuacion, base, donde);
    return salida;
  }

  function usuario(u) {
    if (!esObjeto(u) || !esTexto(u.nombre)) { avisar('un usuario sin nombre: lo ignoro'); return null; }
    const nombre = u.nombre.trim(), base = defecto.usuarios.find(x => x.nombre === nombre);
    let huella = typeof u.huella === 'string' ? u.huella.trim().toLowerCase() : '';
    if (!/^[0-9a-f]{64}$/.test(huella)) {
      avisar(`usuario ${nombre}: la huella no es válida (salen de herramientas/huella-codigo.html)${base ? '. Uso la de por defecto' : ': no podrá entrar'}`);
      if (!base) return null;
      huella = base.huella;
    }
    let foto = u.foto ?? '';
    if (typeof foto !== 'string') {
      avisar(`usuario ${nombre}: la foto tiene que ir entre comillas`);
      foto = base?.foto ?? '';
    }
    return { nombre, huella, foto: foto.trim() };
  }

  // Sin repetidos y, si no queda ninguno, los de por defecto
  function lista(nombre, leer, clave) {
    const vistos = new Set(), salida = [];
    const escrita = escritos[nombre];
    if (escrita !== undefined && !Array.isArray(escrita)) avisar(`«${nombre}» no es una lista entre [ ]: uso la de por defecto`);
    for (const x of Array.isArray(escrita) ? escrita : []) {
      const leido = leer(x);
      if (!leido) continue;
      if (vistos.has(leido[clave])) { avisar(`${nombre}: «${leido[clave]}» está repetido, me quedo con el primero`); continue; }
      vistos.add(leido[clave]);
      salida.push(leido);
    }
    return salida.length ? salida : defecto[nombre].map(leer);
  }

  for (const clave of Object.keys(escritos)) {
    if (!(clave in defecto)) avisar(`«${clave}» no es ningún ajuste: ¿está bien escrito?`);
  }

  const noNegativo = v => typeof v === 'number' && v >= 0;
  let calendario = escritos.calendario;
  if (!esTexto(calendario)) {
    if (calendario !== undefined) avisar('calendario: tiene que ser el ID entre comillas. Uso el de por defecto');
    calendario = defecto.calendario;
  }
  let admins = escritos.admins;
  if (!Array.isArray(admins) || !admins.every(esTexto)) {
    if (admins !== undefined) avisar('admins: tiene que ser una lista de nombres. Uso la de por defecto');
    admins = defecto.admins;
  }
  return {
    admins: admins.map(a => a.trim()),
    temporadas: lista('temporadas', temporada, 'id'),
    // En los enlaces, vacío es «que no salga»
    enlaces: grupo('enlaces', v => typeof v === 'string', 'tiene que ir entre comillas'),
    usuarios: lista('usuarios', usuario, 'huella'),
    textos: grupo('textos', esTexto, 'está vacío'),
    inicio: grupo('inicio', v => noNegativo(v) && v >= 1, 'tiene que ser un número, 1 o más'),
    calendario: calendario.trim(),
  };
}

const AJUSTES_LIGA = (() => {
  const avisar = m => console.warn(`[ajustes.js] ${m}`);
  try {
    if (typeof AJUSTES === 'undefined' || !AJUSTES || typeof AJUSTES !== 'object') {
      console.error('[ajustes.js] Tiene un error de escritura y no se ha podido leer (mira el error de arriba): uso TODOS los valores por defecto.');
      return leerAjustes({}, AJUSTES_POR_DEFECTO, avisar);
    }
    return leerAjustes(AJUSTES, AJUSTES_POR_DEFECTO, avisar);
  } catch (e) {
    console.error('[ajustes.js] No se ha podido leer: uso TODOS los valores por defecto.', e);
    return leerAjustes({}, AJUSTES_POR_DEFECTO, avisar);
  }
})();

// Lo que usa el resto del código
const TEMPORADAS = AJUSTES_LIGA.temporadas;
const ENLACES_LIGA = AJUSTES_LIGA.enlaces;
const JUGADORES_CODIGOS = Object.fromEntries(AJUSTES_LIGA.usuarios.map(u => [u.huella, u.nombre]));
const JUGADORES_FOTOS = Object.fromEntries(AJUSTES_LIGA.usuarios.map(u => [u.nombre, u.foto]));
