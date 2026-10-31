// Tests de la búsqueda de cartas (js/slr/carta.js), la de todos los buscadores (álbum, plantilla,
// mercado, catálogo, plantillas y colecciones del admin): por el nombre y por las personas que
// salen en la carta, sin distinguir mayúsculas ni tildes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sinAcentos, claveBusqueda, coincideBusqueda, normalizarCarta } from '../../js/slr/carta.js';

const trio = normalizarCarta({ nombre: 'Los Tres Caballeros', tipo: 'trio', personas: ['Nicolás', 'Mateo', 'Ángel'], ata: 60, def: 60, con: 60 });
const nico = normalizarCarta({ nombre: 'Nicolás', tipo: 'individual', personas: [], ata: 60, def: 60, con: 60 });
const otra = normalizarCarta({ nombre: 'Marcos Empanadas', tipo: 'individual', personas: ['Marcos'], ata: 60, def: 60, con: 60 });

test('«nico» encuentra las cartas donde sale Nicolás y las que lo llevan en el nombre', () => {
  assert.ok(coincideBusqueda(trio, 'nico'));
  assert.ok(coincideBusqueda(nico, 'nico'));
  assert.ok(!coincideBusqueda(otra, 'nico'));
});

test('sin distinguir mayúsculas ni tildes, en los dos sentidos', () => {
  for (const t of ['NICOLAS', 'nicolás', 'Nicolas', 'NicoLÁS']) assert.ok(coincideBusqueda(trio, t), t);
  assert.ok(coincideBusqueda(trio, 'angel'));
  assert.ok(coincideBusqueda(trio, 'ÁNGEL'));
  assert.equal(sinAcentos('Ñandú Álvarez'), 'nandu alvarez');
});

test('por nombre también; vacío o espacios: todas', () => {
  assert.ok(coincideBusqueda(trio, 'caballeros'));
  assert.ok(coincideBusqueda(otra, '  empanadas '));
  assert.ok(coincideBusqueda(otra, ''));
  assert.ok(coincideBusqueda(otra, '   '));
  assert.ok(coincideBusqueda(otra, null));
});

test('sin personas (o con la clave ya calculada) funciona igual', () => {
  assert.ok(coincideBusqueda({ nombre: 'Sólo nombre' }, 'solo'));
  const c = { ...trio, clave: claveBusqueda(trio) };
  assert.ok(coincideBusqueda(c, 'mateo'));
  assert.match(c.clave, /nicolas/);
});

test('todos los buscadores de cartas usan esta búsqueda', () => {
  const usa = (f, re) => assert.match(readFileSync(new URL(`../../js/slr/pantallas/${f}`, import.meta.url), 'utf8'), re, f);
  for (const f of ['album.js', 'plantilla.js', 'mercado.js', 'colecciones-admin.js']) usa(f, /coincideBusqueda/);
  for (const f of ['catalogo.js', 'plantillas-admin.js']) usa(f, /claveBusqueda/);
  for (const f of ['album.js', 'plantilla.js', 'mercado.js', 'catalogo.js', 'plantillas-admin.js', 'colecciones-admin.js']) usa(f, /Buscar por nombre o persona/);
});
