import test from 'node:test';
import assert from 'node:assert/strict';

import { figurSkalaFuer, SPRITE_HOEHE } from '../src/client/figuren.js';

const sichtbar = zoom => SPRITE_HOEHE * 0.93 * figurSkalaFuer(zoom) * zoom;

test('Die Sprites haben bei üblichem Anzeigemaßstab etwa 80 px Bildschirmhöhe', () => {
  // 1280x720 auf einer 2560er-Karte: Maßstab 0,5
  assert.ok(Math.abs(sichtbar(0.5) - 80) < 1);
  assert.ok(Math.abs(sichtbar(1) - 80) < 1);
  assert.ok(Math.abs(sichtbar(1.5) - 80) < 1);
});

test('Kleine Anzeige: Untergrenze 64 px, die Skalierung ist nach oben begrenzt', () => {
  assert.ok(sichtbar(0.3125) >= 64);
  assert.ok(sichtbar(0.29) >= 64);
  assert.ok(figurSkalaFuer(0.01) <= 5.4);
  assert.ok(figurSkalaFuer(10) >= 0.75);
  assert.ok(figurSkalaFuer(0) > 0 && Number.isFinite(figurSkalaFuer(NaN)));
});
