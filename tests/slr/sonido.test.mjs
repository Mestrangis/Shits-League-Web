// Tests del sonido de los partidos (js/slr/partido/sonido.js) en Node, con Web Audio y fetch de mentira:
// · cada nombre tiene sus archivos (y existen), y cada aviso que lanzan las escenas tiene sonido;
// · cada aviso suena con un archivo suyo, al azar y sin repetir el mismo dos veces seguidas;
// · volumen = general × el de ese sonido (ajustes.js); 0 = no suena;
// · sin descargar todavía: no suena (nunca tarde);
// · en silencio no suena nada y se corta lo que sonaba; se recuerda;
// · el ambiente: en bucle, con fundido al empezar y al acabar; se para al pausar, al cerrar y al silenciar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');

class Param {
  constructor() { this.value = 1; this.eventos = []; }
  setValueAtTime(v, t) { this.eventos.push(['fija', v, t]); this.value = v; }
  linearRampToValueAtTime(v, t) { this.eventos.push(['rampa', v, t]); }
  cancelScheduledValues() {}
}
const fuentes = [];
class Contexto {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  createBufferSource() {
    const s = { loop: false, buffer: null, connect: g => g, start() { s.empezada = true; }, stop(t) { s.parada = t ?? 0; s.onended?.(); } };
    fuentes.push(s);
    return s;
  }
  createGain() { const g = { gain: new Param(), connect: d => d }; return g; }
  createBuffer() { return { vacio: true }; }
  decodeAudioData(datos, ok) { const b = { url: datos.url }; ok?.(b); return Promise.resolve(b); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
}
globalThis.AudioContext = Contexto;
const descargados = [];
let faltan = new Set();   // urls que «aún no han llegado»
globalThis.fetch = async u => {
  descargados.push(u);
  if ([...faltan].some(x => u.endsWith(x))) return { ok: false };
  return { ok: true, arrayBuffer: async () => ({ url: u }) };
};

const S = await import('../../js/slr/partido/sonido.js');
const { AJUSTES } = await import('../../js/slr/partido/config.js');
const sonados = [];
S.AL_SONAR.add(x => sonados.push(x));
const archivo = u => u.split('/').pop();

test('cada nombre tiene sus archivos, y existen', () => {
  const enDisco = new Set(readdirSync(join(RAIZ, 'audio/partido')));
  const usados = new Set();
  for (const [nombre, lista] of Object.entries(S.SONIDOS)) {
    assert.ok(lista.length >= 1, nombre);
    for (const r of lista) {
      assert.ok(existsSync(join(RAIZ, r)), r);
      assert.match(archivo(r), new RegExp(`^${nombre}(_\\d)?\\.mp3$`), `${r} es de «${nombre}»`);
      usados.add(archivo(r));
    }
  }
  assert.deepEqual([...enDisco].filter(f => f.endsWith('.mp3') && !usados.has(f)), [], 'ningún archivo sin usar');
  // Variaciones pedidas
  const n = { patada: 3, bote: 2, choque: 3, regate: 2, corte: 3, chut: 3, fuego: 2, gol: 3, parada: 3, poder: 2 };
  for (const [k, v] of Object.entries(n)) assert.equal(S.SONIDOS[k].length, v, k);
});

test('cada aviso que lanzan las escenas tiene su sonido (y «fuego» suena en el gol «ardiendo»)', () => {
  const dir = join(RAIZ, 'js/slr/partido/escenas');
  const avisos = new Set();
  for (const f of readdirSync(dir)) for (const [, n] of readFileSync(join(dir, f), 'utf8').matchAll(/sonar\('([a-z_]+)'/g)) avisos.add(n);
  for (const a of avisos) assert.ok(S.SONIDOS[a], `«${a}» no tiene sonido`);
  for (const n of Object.keys(S.SONIDOS)) if (n !== 'ambiente') assert.ok(avisos.has(n), `«${n}» no lo lanza ninguna escena`);
  const gol = readFileSync(join(dir, 'gol.js'), 'utf8');
  assert.match(gol, /ctx\.linea\.en\(golpe, \(\) => \{ ctx\.sonar\('chut'\); if \(variante === 'ardiendo'\) ctx\.sonar\('fuego'\); \}\)/);
});

test('ajustes: sección «sonido» con general y uno por sonido (ambiente y saque bajitos)', () => {
  assert.equal(AJUSTES.sonido.general, 1);
  for (const n of Object.keys(S.SONIDOS)) assert.ok(AJUSTES.sonido[n] >= 0 && AJUSTES.sonido[n] <= 1, n);
  assert.equal(AJUSTES.sonido.ambiente, 0.25);
  assert.equal(AJUSTES.sonido.saque, 0.4);
});

test('sin descargar todavía, no suena (y no suena tarde)', () => {
  sonados.length = 0;
  S.sonar('gol');
  assert.equal(sonados.length, 0);
});

test('descarga: cada archivo una vez, de dos en dos', async () => {
  faltan = new Set(['lesion.mp3']);   // uno que no llega
  await S.precargarSonidos();
  const total = new Set(Object.values(S.SONIDOS).flat()).size;
  assert.equal(descargados.length, total);
  assert.equal(S.estadoSonidos().cargados, total - 1);
  await S.precargarSonidos();
  assert.equal(descargados.length, total, 'una sola vez');
});

test('cada aviso suena con un archivo suyo, al azar y sin repetir el mismo dos veces seguidas', () => {
  for (const n of Object.keys(S.SONIDOS)) {
    if (n === 'ambiente' || n === 'lesion') continue;
    sonados.length = 0;
    for (let k = 0; k < 40; k++) S.sonar(n);
    assert.equal(sonados.length, 40, n);
    const usados = sonados.map(x => archivo(x.url));
    for (const u of usados) assert.match(u, new RegExp(`^${n}(_\\d)?\\.mp3$`), n);
    assert.equal(new Set(usados).size, S.SONIDOS[n].length, `${n}: salen todas sus variaciones`);
    if (S.SONIDOS[n].length > 1) assert.ok(usados.every((u, i) => i === 0 || u !== usados[i - 1]), `${n}: nunca dos veces seguidas`);
  }
  sonados.length = 0;
  S.sonar('lesion');
  assert.equal(sonados.length, 0, 'el que no llegó a descargarse no suena');
  // Se solapan: cada aviso es una fuente nueva
  const antes = fuentes.length;
  S.sonar('chut'); S.sonar('gol');
  assert.equal(fuentes.length, antes + 2);
});

test('volumen: general × el de cada sonido; 0 = no suena', () => {
  sonados.length = 0;
  S.sonar('saque'); S.sonar('gol');
  assert.equal(sonados[0].volumen, 0.4);
  assert.equal(sonados[1].volumen, 1);
  const antes = AJUSTES.sonido.general;
  AJUSTES.sonido.general = 0.5;
  S.sonar('saque');
  assert.equal(sonados[2].volumen, 0.2);
  AJUSTES.sonido.general = antes;
  AJUSTES.sonido.robo = 0;
  sonados.length = 0;
  S.sonar('robo');
  assert.equal(sonados.length, 0);
  AJUSTES.sonido.robo = 1;
});

test('ambiente: en bucle con fundido, se para al pausar, al cerrar y al silenciar', () => {
  sonados.length = 0;
  S.empezarAmbiente();
  const f = fuentes.at(-1);
  assert.ok(f.loop && f.empezada && archivo(f.buffer.url) === 'ambiente.mp3', 'la grada, en bucle');
  assert.equal(sonados[0].volumen, 0.25);
  assert.ok(S.estadoSonidos().ambiente);
  // Pausa
  S.pausarAmbiente(true);
  assert.ok(f.parada > 0, 'se para con fundido');
  assert.ok(!S.estadoSonidos().ambiente);
  S.pausarAmbiente(false);
  const f2 = fuentes.at(-1);
  assert.ok(f2 !== f && f2.loop && S.estadoSonidos().ambiente, 'y vuelve al reanudar');
  // Silenciar: se corta y no vuelve a sonar nada
  S.silenciar(true);
  assert.ok(f2.parada !== undefined && !S.estadoSonidos().ambiente && S.estadoSonidos().activos === 0, 'en silencio: todo cortado');
  sonados.length = 0;
  const n = fuentes.length;
  for (const k of Object.keys(S.SONIDOS)) S.sonar(k);
  assert.equal(sonados.length + fuentes.length - n, 0, 'en silencio no suena nada');
  assert.ok(S.silenciado());
  S.silenciar(false);
  assert.ok(S.estadoSonidos().ambiente, 'al quitar el silencio, la grada vuelve (el partido sigue abierto)');
  // Cerrar
  const f3 = fuentes.at(-1);
  S.pararAmbiente();
  assert.ok(f3.parada > 0 && !S.estadoSonidos().ambiente, 'al cerrar, con fundido');
  S.silenciar(true); S.silenciar(false);
  assert.ok(!S.estadoSonidos().ambiente, 'cerrado, quitar el silencio no la vuelve a poner');
});
