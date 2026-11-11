// SPR-6: Randlicht für dunkle Figuren auf dunklem Gelände (reine Rechnung, ohne Leinwand).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kantenHelligkeit, randStaerke, kontrast, saumUeberGelaende, helligkeit, RAND_GRENZE, RAND_ALPHA_MAX,
} from '../src/client/figurRandlicht.js';

/** Quadrat `k` x `k` mit deckendem Kern in `grau`, Rest durchsichtig. */
function quadrat(k, grau, rand = 4) {
  const d = new Uint8ClampedArray(k * k * 4);
  for (let y = rand; y < k - rand; y += 1) {
    for (let x = rand; x < k - rand; x += 1) {
      const i = (y * k + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = grau; d[i + 3] = 255;
    }
  }
  return d;
}

test('Kantenhelligkeit: nur Randpixel zählen, leeres Bild gibt null', () => {
  const k = 32;
  const d = quadrat(k, 200);
  // Kern dunkel, Rand hell: gemessen wird der Rand.
  for (let y = 8; y < k - 8; y += 1) for (let x = 8; x < k - 8; x += 1) { const i = (y * k + x) * 4; d[i] = d[i + 1] = d[i + 2] = 10; }
  assert.ok(Math.abs(kantenHelligkeit(d, k, k) - 200) < 1);
  assert.equal(kantenHelligkeit(new Uint8ClampedArray(k * k * 4), k, k), null);
});

test('Stärke: dunkle Kante voll, helle Kante keiner, dazwischen linear', () => {
  assert.equal(randStaerke(null), 0);
  assert.equal(randStaerke(200), 0);
  assert.equal(randStaerke(RAND_GRENZE), 0);
  assert.equal(randStaerke(0), 1);
  const mitte = randStaerke(RAND_GRENZE - 35);
  assert.ok(mitte > 0.4 && mitte < 0.6);
});

test('Randlicht hebt den Kontrast dunkler Figuren auf dunklem Gelände über 3:1', () => {
  for (const gelaende of [16, 32, 45]) {
    for (const kante of [20, 35, 60]) {
      const vorher = kontrast(kante, gelaende);
      const s = randStaerke(kante);
      const nachher = kontrast(Math.max(kante, saumUeberGelaende(s, gelaende)), gelaende);
      assert.ok(nachher >= Math.min(3, vorher * 2), `Kante ${kante} auf ${gelaende}: ${vorher.toFixed(2)} -> ${nachher.toFixed(2)}`);
      if (kante <= 60) assert.ok(nachher >= 3, `Kante ${kante} auf ${gelaende}: nur ${nachher.toFixed(2)}`);
    }
  }
  assert.ok(RAND_ALPHA_MAX < 0.8 && helligkeit(255, 255, 255) > 254);
});
