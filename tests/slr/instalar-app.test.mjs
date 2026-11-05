// js/instalar-app.js: en qué situación está cada móvil y cómo se abre cada alarma
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ctx = vm.createContext({ window: { addEventListener() {} }, document: {}, navigator: {}, console });
vm.runInContext(readFileSync(new URL('../../js/instalar-app.js', import.meta.url), 'utf8'), ctx);
const { detectarDispositivo, situacionApp, planAlarma, textoNotificaciones } = ctx;
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

test('qué le toca a cada móvil, según su estado real', () => {
  const ve = d => plano(situacionApp({ movil: true, plataforma: 'android', instalada: true, permiso: 'granted', suscrito: true, yaInstalada: false, ...d }));
  assert.deepEqual(ve({ movil: false, instalada: false, permiso: 'default' }), { alarmas: [], aviso: null, suscribir: false }, 'en PC y tablet, nada');
  // iPhone en Safari: solo instalar
  assert.deepEqual(ve({ plataforma: 'iphone', instalada: false, permiso: 'no_disponible', suscrito: null }), { alarmas: ['iphone'], aviso: 'iphone', suscribir: false });
  // Android en el navegador
  assert.deepEqual(ve({ instalada: false, permiso: 'default', suscrito: false }), { alarmas: ['instalar'], aviso: 'instalar', suscribir: false });
  assert.deepEqual(ve({ instalada: false, permiso: 'denied', suscrito: false }), { alarmas: ['instalar'], aviso: 'instalar', suscribir: false });
  assert.deepEqual(ve({ instalada: false, suscrito: false }), { alarmas: ['instalar'], aviso: 'instalar', suscribir: true });
  assert.deepEqual(ve({ instalada: false, yaInstalada: true, permiso: 'default', suscrito: false }), { alarmas: [], aviso: 'abrir', suscribir: false }, 'ya la tiene: que la abra');
  // Dentro de la app
  assert.deepEqual(ve({ permiso: 'default', suscrito: false }), { alarmas: ['notificaciones'], aviso: 'notificaciones', suscribir: false });
  assert.deepEqual(ve({ permiso: 'denied', suscrito: false }), { alarmas: ['bloqueadas'], aviso: 'bloqueadas', suscribir: false });
  assert.deepEqual(ve({ suscrito: false }), { alarmas: [], aviso: null, suscribir: true }, 'permiso sí, suscrito no: sin preguntar');
  assert.deepEqual(ve({ suscrito: null }), { alarmas: [], aviso: null, suscribir: false }, 'mientras OneSignal no diga nada');
  assert.deepEqual(ve({}), { alarmas: [], aviso: null, suscribir: false }, 'todo bien');
  assert.deepEqual(ve({ plataforma: 'iphone', permiso: 'denied', suscrito: false }), { alarmas: ['bloqueadas'], aviso: 'bloqueadas', suscribir: false });
});

test('cómo se abre cada alarma', () => {
  const plan = (tipo, d) => plano(planAlarma(tipo, d));
  assert.deepEqual(plan('iphone', { plataforma: 'iphone', instalada: false }), { modo: 'iphone', accion: 'nada' });
  assert.deepEqual(plan('instalar', { plataforma: 'android', instalada: false }), { modo: 'instalar', accion: 'instalar', caso: 'instalar' });
  assert.deepEqual(plan('notificaciones', { plataforma: 'android', instalada: true }), { modo: 'notificaciones', accion: 'permiso', caso: 'bloqueadas-android' });
  assert.deepEqual(plan('bloqueadas', { plataforma: 'android', instalada: true }), { modo: 'bloqueadas', accion: 'nada', caso: 'bloqueadas-android' });
  assert.deepEqual(plan('bloqueadas', { plataforma: 'iphone', instalada: true }), { modo: 'bloqueadas', accion: 'nada', caso: 'bloqueadas-iphone' });
});

test('lo que dice el perfil', () => {
  assert.equal(textoNotificaciones({ permiso: 'granted', suscrito: true }), 'activadas');
  assert.equal(textoNotificaciones({ permiso: 'granted', suscrito: false }), 'desactivadas');
  assert.equal(textoNotificaciones({ permiso: 'default', suscrito: null }), 'desactivadas');
  assert.equal(textoNotificaciones({ permiso: 'denied', suscrito: false }), 'bloqueadas');
});
