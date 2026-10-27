import test from 'node:test';
import assert from 'node:assert/strict';
import { drawAmbient } from '../src/client/sceneryPainter.js';

/** Falsche Leinwand: zählt nur die Kreise. */
function leinwand() {
  const z = { arcs: 0 };
  const noop = () => {};
  const ctx = new Proxy({}, {
    get: (_, name) => (name === 'arc' ? () => { z.arcs += 1; } : noop),
    set: () => true,
  });
  return { ctx, z };
}
const szene = (n) => ({
  ambient: { elemente: Array.from({ length: n }, (_, i) => ({ kind: 'embers', x: 0.5, y: 0.5, phase: i / n, scale: 1, seed: i })) },
});

test('Umgebungspartikel: Dichte 1 zeichnet alle, 0,5 etwa die Hälfte, 0 keine', () => {
  const zaehle = (dichte) => { const { ctx, z } = leinwand(); drawAmbient(ctx, 800, 600, szene(40), 10, true, dichte); return z.arcs; };
  assert.equal(zaehle(1), 40);
  assert.equal(zaehle(0.5), 20);
  assert.equal(zaehle(0), 0);
  assert.equal(zaehle(undefined), 40, 'ohne Angabe gilt volle Dichte');
});
