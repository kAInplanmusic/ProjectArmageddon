/**
 * Der Client sagt die Richtung des Rückstoßes voraus (Waffenfassung 11): Zucken folgt Seite und Richtung der Waffe,
 * auch ohne Einschlag (Nahkampf, Strahl). Rein Darstellung; der Server bleibt maßgeblich.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { getWaffe } from '../src/shared/config/waffen-fassung.js';
import { vorhergesagterStoss } from '../src/client/gefuehl.js';

const mitStoss = WEAPONS.map(w => getWaffe(w.id)).filter(w => w.stossRichtung !== undefined && w.knockback > 0);

test('ohne Schuss oder ohne Rückstoßwaffe keine Vorhersage', () => {
  assert.equal(vorhergesagterStoss(null), 0);
  assert.equal(vorhergesagterStoss({ weaponId: 'pa_028', angle: 0 }), 0);
});

test('Seite folgt dem Schusswinkel, Richtung der Waffe (zum Schützen hin kehrt um)', () => {
  assert.ok(mitStoss.length >= 30);
  for (const w of mitStoss) {
    const rechts = vorhergesagterStoss({ weaponId: w.id, angle: 0.2 });
    const links = vorhergesagterStoss({ weaponId: w.id, angle: Math.PI - 0.2 });
    assert.equal(rechts, -links, `${w.id} spiegelt`);
    const vorn = Math.cos(w.stossRichtung * Math.PI / 180);
    if (Math.abs(vorn) > 0.01) assert.equal(rechts, Math.sign(vorn), `${w.id} Vorzeichen`);
  }
});
