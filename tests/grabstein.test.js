/**
 * Dauerhafter Grabstein (TODO 2.14, `client/grabsteinBild.js`): einer je Figur, Deckel, ungültige Orte verworfen, Zeichnung ohne
 * Zufall und Uhr; der Renderer setzt ihn auf den Fußpunkt und leert die Liste mit der Partie.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Graeber, MAX_GRAEBER, GRAB_FUSS, zeichneGraeber } from '../src/client/grabsteinBild.js';

test('Gräber: einer je Figur, höchstens MAX_GRAEBER, ungültige Orte verworfen', () => {
  const g = new Graeber();
  assert.equal(g.merke(1, 100, 500), true);
  assert.equal(g.merke(1, 120, 500), true);
  assert.equal(g.liste.length, 1, 'je Figur einer');
  assert.equal(g.liste[0].x, 120);
  assert.equal(g.merke(2, undefined, 500), false);
  for (let i = 10; i < 10 + MAX_GRAEBER + 5; i += 1) g.merke(i, i, 1);
  assert.equal(g.liste.length, MAX_GRAEBER);
  g.leeren();
  assert.equal(g.liste.length, 0);
});

test('Zeichnung: je Grab ein gefüllter Stein; der Renderer setzt ihn auf den Fuß und leert mit der Partie', () => {
  const aufrufe = [];
  const ctx = new Proxy({}, { get: (_z, k) => (typeof k === 'string' && !['lineWidth', 'strokeStyle', 'fillStyle'].includes(k) ? () => aufrufe.push(k) : undefined), set: () => true });
  const g = new Graeber();
  g.merke(1, 10, 10); g.merke(2, 50, 10);
  zeichneGraeber(ctx, g);
  assert.equal(aufrufe.filter(a => a === 'fill').length, 2);
  assert.ok(GRAB_FUSS > 0);
  const renderer = fs.readFileSync(new URL('../src/client/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /this\.graeber\.merke\(entityId, x, y \+ GRAB_FUSS\)/);
  assert.match(renderer, /this\.graeber\.leeren\(\)/);
  assert.ok(!/Math\.random|Date\.now|performance\.now/.test(fs.readFileSync(new URL('../src/client/grabsteinBild.js', import.meta.url), 'utf8')));
});
