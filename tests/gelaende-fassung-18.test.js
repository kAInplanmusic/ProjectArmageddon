/**
 * Geländefassung 18 (TODO 4.6, Rückmeldung 2026-11-25 „Landschaft unabwechslungsreich“): Inseln mit mehr Umrissen —
 * schief, Tafelberg, Überhang. Fassung 17 bleibt Bit für Bit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  GELAENDE_ABSTAND, GELAENDE_VIELFALT, GELAENDE_STANDARD, normalisiereGelaende,
} from '../src/shared/config/gelaende.js';
import { neuesMatch } from '../scripts/bot-partien.mjs';

const partie = (seed, extra = {}) => {
  const m = neuesMatch(seed, 5, { extra: { format: '24:9', groesse: 'mittel', ...extra } });
  m.start();
  return m;
};
const hash = m => createHash('sha1').update(m.bitmap).digest('hex').slice(0, 12);

test('Marke: 18 ist gültig (Standard 19), 17 bleibt gültig', () => {
  assert.equal(GELAENDE_VIELFALT, 18);
  assert.equal(GELAENDE_STANDARD, GELAENDE_VIELFALT + 1);
  assert.equal(normalisiereGelaende(17), 17);
  assert.equal(normalisiereGelaende(18), 18);
});

test('Fassung 17 bleibt Bit für Bit; Fassung 18 ändert genau die Karten mit Inselzonen', () => {
  let geaendert = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const a = partie(seed, { gelaende: GELAENDE_ABSTAND });
    assert.equal(hash(partie(seed, { gelaende: GELAENDE_ABSTAND })), hash(a), `Seed ${seed}: Fassung 17 deterministisch`);
    const b = partie(seed, { gelaende: GELAENDE_VIELFALT });
    assert.equal(hash(partie(seed, { gelaende: GELAENDE_VIELFALT })), hash(b), `Seed ${seed}: Fassung 18 deterministisch`);
    if (hash(a) !== hash(b)) geaendert += 1;
  }
  assert.ok(geaendert >= 1, 'mindestens eine Karte mit Inselzone sieht in Fassung 18 anders aus');
});

test('Fassung 18: Karten bleiben spielbar (alle Figuren stehen auf festem Boden über dem Wasser)', () => {
  for (const seed of [11, 222, 3333, 9001]) {
    const m = partie(seed, { gelaende: GELAENDE_VIELFALT });
    for (const e of m.getState().entities) {
      assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), `Seed ${seed}: Figur ${e.entityId} hat eine Position`);
      assert.ok(m.waterLevelAt(e.x, e.y) < 0.5, `Seed ${seed}: Figur ${e.entityId} steht nicht im Wasser`);
    }
  }
});
