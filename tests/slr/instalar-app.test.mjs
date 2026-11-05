// js/instalar-app.js: en qué situación está cada móvil y qué hace el toque en cada caso
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ctx = vm.createContext({ window: { addEventListener() {} }, document: {}, navigator: {}, console });
vm.runInContext(readFileSync(new URL('../../js/instalar-app.js', import.meta.url), 'utf8'), ctx);
const { detectarDispositivo, pasoApp, planApp, textoNotificaciones } = ctx;
const plano = x => JSON.parse(JSON.stringify(x));

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  tabletAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  ipadViejo: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
  pc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
};

test('qué dispositivo es: solo iPhone y móviles Android son móvil', () => {
  assert.deepEqual(plano(detectarDispositivo({ ua: UA.iphone })), { movil: true, plataforma: 'iphone' });
  assert.deepEqual(plano(detectarDispositivo({ ua: UA.android })), { movil: true, plataforma: 'android' });
  assert.deepEqual(plano(detectarDispositivo({ ua: UA.firefox })), { movil: true, plataforma: 'android' });
  assert.equal(detectarDispositivo({ ua: UA.tabletAndroid }).movil, false);
  assert.equal(detectarDispositivo({ ua: UA.ipadViejo }).movil, false);
  assert.equal(detectarDispositivo({ ua: UA.mac, plataforma: 'MacIntel', toques: 5 }).movil, false, 'un iPad que se presenta como Mac');
  assert.equal(detectarDispositivo({ ua: UA.mac, plataforma: 'MacIntel', toques: 0 }).movil, false);
  assert.equal(detectarDispositivo({ ua: UA.pc }).movil, false);
});

test('el siguiente paso, por orden', () => {
  const base = { movil: true, instalada: true, permiso: 'granted', suscrito: true };
  assert.equal(pasoApp({ ...base, movil: false, instalada: false, permiso: 'default' }), null, 'en PC y tablet, nada');
  assert.equal(pasoApp({ ...base, instalada: false, permiso: 'no_disponible' }), 'instalar', 'iPhone sin instalar');
  assert.equal(pasoApp({ ...base, instalada: false, permiso: 'denied' }), 'instalar', 'primero instalar');
  assert.equal(pasoApp({ ...base, permiso: 'default', suscrito: false }), 'notificaciones');
  assert.equal(pasoApp({ ...base, permiso: 'denied', suscrito: false }), 'notificaciones');
  assert.equal(pasoApp({ ...base, suscrito: false }), 'notificaciones', 'permiso sí, suscrito no');
  assert.equal(pasoApp({ ...base, suscrito: null }), null, 'mientras OneSignal no diga nada, no se molesta');
  assert.equal(pasoApp(base), null, 'todo bien');
  assert.equal(pasoApp({ ...base, permiso: 'no_disponible', suscrito: null }), null, 'un navegador sin notificaciones');
});

test('qué hace el toque en cada caso', () => {
  const plan = d => plano(planApp(d));
  assert.deepEqual(plan({ paso: 'instalar', plataforma: 'android', hayEventoInstalar: true }), { modo: 'instalar', accion: 'instalar', caso: 'instalar' });
  assert.deepEqual(plan({ paso: 'instalar', plataforma: 'android', hayEventoInstalar: false }), { modo: 'instalar', accion: 'mal', caso: 'instalar' });
  assert.deepEqual(plan({ paso: 'instalar', plataforma: 'iphone' }), { modo: 'iphone', accion: 'nada' });
  assert.deepEqual(plan({ paso: 'notificaciones', plataforma: 'android', instalada: true, permiso: 'default' }), { modo: 'notificaciones', accion: 'permiso', caso: 'bloqueadas-android-app' });
  assert.deepEqual(plan({ paso: 'notificaciones', plataforma: 'android', instalada: true, permiso: 'denied' }), { modo: 'notificaciones', accion: 'mal', caso: 'bloqueadas-android-app' });
  assert.deepEqual(plan({ paso: 'notificaciones', plataforma: 'android', instalada: false, permiso: 'denied' }), { modo: 'notificaciones', accion: 'mal', caso: 'bloqueadas-android-chrome' });
  assert.deepEqual(plan({ paso: 'notificaciones', plataforma: 'iphone', instalada: true, permiso: 'denied' }), { modo: 'notificaciones', accion: 'mal', caso: 'bloqueadas-iphone' });
  assert.deepEqual(plan({ paso: 'notificaciones', plataforma: 'iphone', instalada: true, permiso: 'granted' }), { accion: 'suscribir' });
  assert.equal(planApp({ paso: null }), null);
});

test('lo que dice el perfil', () => {
  assert.equal(textoNotificaciones({ permiso: 'granted', suscrito: true }), 'activadas');
  assert.equal(textoNotificaciones({ permiso: 'granted', suscrito: false }), 'desactivadas');
  assert.equal(textoNotificaciones({ permiso: 'default', suscrito: null }), 'desactivadas');
  assert.equal(textoNotificaciones({ permiso: 'denied', suscrito: false }), 'bloqueadas');
});
