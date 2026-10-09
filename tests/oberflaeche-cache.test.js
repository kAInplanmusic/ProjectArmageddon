import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';
import { surfaceY } from '../src/shared/terrainGen.js';

/**
 * Der Spaltencache in `surfaceYAt` (Audit 2026-10-09: Tick-Spitzen von 25–38 ms
 * durch die Geschütz-Zielsuche) darf NICHTS am Ergebnis ändern.
 */
test('surfaceYAt liefert für jede Spalte dasselbe wie die direkte Suche', () => {
  const match = new MatchController({ seed: 1337, teams: 2, playersPerTeam: 1, preset: 'hills' });
  match.start();
  const { bitmap, width, height } = match;
  for (let x = -3; x < width + 3; x += 7) {
    const direkt = surfaceY(bitmap, width, height, x);
    const erwartet = direkt < 0 ? -1 : direkt;
    assert.equal(match.surfaceYAt(x), erwartet, `Spalte ${x} (erster Aufruf)`);
    assert.equal(match.surfaceYAt(x), erwartet, `Spalte ${x} (aus dem Cache)`);
  }
  assert.equal(match.surfaceYAt(Number.NaN), -1);
  assert.equal(match.surfaceYAt(12.9), match.surfaceYAt(12.1), 'Nachkommastellen: gleiche Spalte');
});

test('Krater verändern die Oberflächenhöhe nicht (Bitmap bleibt die Karte aus dem Aufbau)', () => {
  const match = new MatchController({ seed: 1337, teams: 2, playersPerTeam: 1, preset: 'hills' });
  match.start();
  const vorher = match.surfaceYAt(500);
  match.terrain.punchCrater(500, vorher, 40);
  assert.equal(match.surfaceYAt(500), vorher);
});
