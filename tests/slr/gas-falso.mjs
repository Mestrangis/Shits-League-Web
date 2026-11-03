// Un Google Sheet de mentira y el apps-script/votos.gs de verdad corriendo encima: lo usan
// votos-gs.test.mjs y banco/mvp.mjs. Nunca toca la hoja real.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const RUTA = new URL('../../apps-script/votos.gs', import.meta.url);

export const CAB_JUGADORES = ['nombre', 'rating', 'pos', 'bandera', 'carta_url', 'alias'];
export const CAB_JORNADAS = ['numero', 'fecha', 'local', 'goles_local', 'visitante', 'goles_visitante', 'jugadores_local', 'capitan_local',
  'jugadores_visitante', 'capitan_visitante', 'goleadores', 'asistentes', 'mensaje', 'video_url', 'amistoso', 'imagen_url', 'mvp'];
export const CAB_VOTACIONES = ['id', 'fecha', 'hora', 'lugar', 'imagen_url', 'jugadores_si', 'jugadores_no'];
export const CAB_MVPS = ['fecha_partido', 'jornada', 'votante', 'voto_1', 'puntos_1', 'voto_2', 'puntos_2', 'voto_3', 'puntos_3', 'fecha_voto'];

export const fila = (cabecera, datos) => cabecera.map(c => String(datos[c] ?? ''));

// Fecha (AAAA-MM-DD) a tantos días de hoy, en Madrid
export function dia(desplazamiento = 0) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const [y, m, d] = hoy.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + desplazamiento)).toISOString().slice(0, 10);
}

// hojas: { nombre: [[cabecera], [fila]…] } (todo texto, como lo ve la web)
// opciones: otra: { id, hojas } la hoja de la 26/27; enCurso: lo que responde Supabase
export function crearGas(principal, { otra = null, enCurso = null } = {}) {
  const libroDe = hojas => {
  const hoja = nombre => ({
    getDataRange: () => ({
      getValues: () => hojas[nombre].map(f => [...f]),
      getDisplayValues: () => hojas[nombre].map(f => f.map(String)),
    }),
    getMaxRows: () => 1000,
    getRange: (f, c) => ({
      setValue: v => {
        while (hojas[nombre].length < f) hojas[nombre].push([]);
        hojas[nombre][f - 1][c - 1] = String(v);
      },
      setNumberFormat() {},
    }),
    insertColumnBefore: () => { hojas[nombre].forEach(f => f.unshift('')); },
    appendRow: valores => { hojas[nombre].push(valores.map(String)); },
  });
  return {
    getSheetByName: n => (hojas[n] ? hoja(n) : null),
    insertSheet: n => { hojas[n] = []; return hoja(n); },
  };
  };
  const libro = libroDe(principal);
  const estado = { enCurso };
  const contexto = vm.createContext({
    SpreadsheetApp: { openById: id => (otra && id === otra.id ? libroDe(otra.hojas) : libro) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: texto => ({ setMimeType: () => texto }),
    },
    Utilities: {
      formatDate: (fecha, zona, formato) => {
        const dia = new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(fecha);
        return formato === 'yyyy-MM-dd' ? dia : `${dia} 12:00:00`;
      },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    UrlFetchApp: { fetch() {
      if (!estado.enCurso) throw new Error('sin red en las pruebas');
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify([{ valor: estado.enCurso }]) };
    } },
  });
  const codigo = readFileSync(RUTA, 'utf8').replace(/\r\n/g, '\n');
  // La 26/27 con la hoja de mentira, o sin hoja: nunca la de verdad
  vm.runInContext(codigo.replace(/'26-27': '[^']*'/, `'26-27': '${otra?.id ?? ''}'`), contexto);
  const doPost = contexto.doPost;
  return {
    hojas: principal,
    estado,
    // Lo que recibe el Apps Script: el texto del POST. Devuelve el JSON que respondería
    post: texto => JSON.parse(doPost({ postData: { contents: texto } })),
    votar: datos => JSON.parse(doPost({ postData: { contents: JSON.stringify({ secret: 'pissleague', ...datos }) } })),
  };
}
