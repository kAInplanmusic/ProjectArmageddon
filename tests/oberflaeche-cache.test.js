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

test('Nach einem Krater liefert surfaceYAt den echten Boden — nicht den der unzerstörten Karte', () => {
  const match = new MatchController({ seed: 1337, teams: 2, playersPerTeam: 1, preset: 'hills' });
  match.start();
  const vorher = match.surfaceYAt(500);
  match.terrain.punchCrater(500, vorher, 40);
  const nachher = match.surfaceYAt(500);
  assert.ok(nachher > vorher + 30, `Krater r=40 senkt die Oberfläche (vorher ${vorher}, nachher ${nachher})`);
  assert.equal(nachher, match.terrain.topSolidY(500));
  assert.equal(match.terrain.isSolid(500, nachher), true);
  assert.equal(match.terrain.isSolid(500, nachher - 1), false, 'darüber ist Luft');
  // Eine unberührte Spalte bleibt gleich.
  assert.equal(match.surfaceYAt(900), surfaceY(match.bitmap, match.width, match.height, 900));
});

test('Eine Kiste, die über einem Krater landet, steht auf dem echten Boden und schwebt nicht', () => {
  const neu = () => { const m = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills' }); m.start(); return m; };
  const lauf = vorher => {
    const m = neu();
    const id = m.activePlayerId;
    vorher?.(m);
    m.dropWeapon(id, [...m.inventory.getWeapons(id)][0]);
    let gelandet = null;
    for (let t = 0; t < 900 && !gelandet; t++) {
      m.step();
      for (const e of m.consumeEvents()) if (e.type === 'crate_landed') gelandet = e.payload;
    }
    return { m, gelandet };
  };
  const oben = (m, x) => m.terrain.topSolidY(x);
  const ohne = lauf();
  const lx = Math.round(ohne.gelandet.x);
  const mit = lauf(m => m.terrain.punchCrater(lx, oben(m, lx), 40));
  const x = Math.round(mit.gelandet.x);
  assert.equal(Math.round(mit.gelandet.y), oben(mit.m, x), 'die Kiste steht auf dem echten Boden');
  assert.ok(oben(mit.m, x) > Math.round(ohne.gelandet.y) + 30, 'und der liegt wirklich tiefer als ohne Krater');
});
