import test from 'node:test';
import assert from 'node:assert/strict';
import { SPIEGEL_TIEFE, SPIEGEL_STAERKE, spiegelFarbe, spiegelGewicht } from '../src/client/wasserSpiegel.js';

test('Spiegelfarbe: letzte Himmelsstufe, sonst ein helles Blau', () => {
  assert.deepEqual(spiegelFarbe({ sky: { colors: ['#000000', '#102030'] } }), [16, 32, 48]);
  assert.deepEqual(spiegelFarbe(null), [170, 205, 232]);
  assert.deepEqual(spiegelFarbe({ sky: { colors: ['rot'] } }), [170, 205, 232]);
});

test('Spiegelgewicht: liegt unter einer nach unten abklingenden Hüllkurve, endet bei der Tiefe, steht bei fester Phase', () => {
  for (let k = 0; k < SPIEGEL_TIEFE; k += 1) {
    const w = spiegelGewicht(10, k, 0);
    assert.ok(w >= 0 && w <= SPIEGEL_STAERKE * (1 - k / SPIEGEL_TIEFE) + 1e-12, `k=${k}: ${w}`);
    assert.equal(w, spiegelGewicht(10, k, 0), 'deterministisch');
  }
  assert.equal(spiegelGewicht(10, SPIEGEL_TIEFE, 0), 0);
  assert.equal(spiegelGewicht(3, 40, 5), 0);
  assert.notEqual(spiegelGewicht(10, 2, 0), spiegelGewicht(10, 2, 3), 'Streifen wandern mit der Phase');
});
