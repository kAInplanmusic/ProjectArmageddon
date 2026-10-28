/**
 * Tests: Vorstrahl der Anflugschläge (Waffenfassung 9, `docs/balance-auslese/elemental.md`).
 *
 * `resolveStrike` bestimmt den Zielpunkt über einen Strahl (`resolveHitscan`). Bis Fassung 8 verteilte dieser Vorstrahl
 * den vollen Katalogschaden an eine Figur im Strahl, danach schlug der Himmels- oder Flankenschlag zusätzlich ein.
 * Ab Fassung 9 macht der Vorstrahl keinen Schaden mehr.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { WAFFEN_FEINTUNING, WAFFEN_VORSTRAHL, normalisiereWaffen } from '../src/shared/config/waffen-fassung.js';

// Nur Geschosse: Strahlwaffen (hitscan) verlassen `fire()` vor `resolveStrike` und treffen direkt, dort gibt es keinen Vorstrahl.
const ANFLUG = WEAPONS.filter(w => w.delivery === 'projectile' && (w.strikeStyle === 'sky' || w.strikeStyle === 'flank'));

/** Schaden, den das Ziel direkt nach dem Abschuss hat (noch vor dem ersten Simulationsschritt). */
function sofortSchaden(waffenId, fassung, dx, dy) {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000_000, waffen: fassung });
  match.start();
  match.consumeEvents();
  const schuetze = match.activePlayerId;
  const gegner = match.players.find(p => p.entityId !== schuetze).entityId;
  const w = match.world;
  const sx = w.getComponent(schuetze, 'Position', 'x');
  const sy = w.getComponent(schuetze, 'Position', 'y');
  w.setComponent(gegner, 'Position', 'x', sx + dx);
  w.setComponent(gegner, 'Position', 'y', sy + dy);
  w.setComponent(gegner, 'Health', 'max', 1000);
  w.setComponent(gegner, 'Health', 'current', 1000);
  match.inventory.register(schuetze, [waffenId]);
  const schuss = match.fire(schuetze, 0.1, 60, waffenId);
  assert.equal(schuss.ok, true);
  return 1000 - w.getComponent(gegner, 'Health', 'current');
}

test('Fassung 9 ist der Standard und wird erkannt', () => {
  assert.equal(WAFFEN_VORSTRAHL, 9);
  assert.equal(normalisiereWaffen(9), WAFFEN_VORSTRAHL);
});

test('Anflugschläge: Der Vorstrahl trifft bis Fassung 8 sofort, ab Fassung 9 nicht', () => {
  assert.ok(ANFLUG.length >= 3, 'die Anflug-Geschosse sind im Katalog');
  let geprueft = 0;
  for (const waffe of ANFLUG) {
    // Position suchen, an der der Vorstrahl in Fassung 8 die Figur trifft.
    let treffer = null;
    for (let dx = 60; dx <= 480 && !treffer; dx += 30) {
      for (const dy of [-40, -20, 0]) {
        const s = sofortSchaden(waffe.id, WAFFEN_FEINTUNING, dx, dy);
        if (s > 0) { treffer = { dx, dy, s }; break; }
      }
    }
    if (!treffer) continue; // Strahl trifft auf dieser Karte keine der geprüften Positionen
    geprueft += 1;
    assert.equal(sofortSchaden(waffe.id, WAFFEN_VORSTRAHL, treffer.dx, treffer.dy), 0, `${waffe.id}: Vorstrahl in Fassung 9 schadenfrei`);
  }
  assert.ok(geprueft >= 1, 'mindestens eine Anflugwaffe zeigt den Vorstrahl-Treffer in Fassung 8');
});
