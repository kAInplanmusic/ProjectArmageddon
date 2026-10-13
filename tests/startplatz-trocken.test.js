import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';
import { WET_LEVEL } from '../src/shared/config/water.js';

/*
 * FUND (belegt, 2026-10-13): Der Spawn-Manager suchte einen trockenen Platz (`drySpawnX`),
 * setzte aber die Figur auf den URSPRÜNGLICHEN Wunsch-x — nur y kam vom neuen Platz.
 * Auf dem Menüweg (`kartentyp: 'autonom'`) stand in 46 von 100 Seeds mindestens eine
 * Figur nach 0,5 s untergetaucht. Dazu: ein flaches Becken zwischen Fuß- und Kopfpunkt
 * wurde von der Trockenprüfung übersehen.
 */
test('Auf dem Menüweg startet keine Figur im Wasser (60 Seeds × 6 Figuren)', () => {
  const nass = [];
  for (let seed = 1; seed <= 60; seed += 1) {
    const match = new MatchController({
      seed, teams: 2, playersPerTeam: 3, preset: 'hills', kartentyp: 'autonom', turnDurationMs: 20_000,
    });
    match.start();
    for (let t = 0; t < 30; t += 1) { match.step(); match.consumeEvents(); }
    for (const e of match.getState().entities) {
      if (e.waterLevel > WET_LEVEL) nass.push(`Seed ${seed} ${e.label} (${e.waterLevel.toFixed(2)})`);
    }
  }
  assert.deepEqual(nass, [], `Figuren im Wasser: ${nass.slice(0, 5).join(', ')}`);
});
