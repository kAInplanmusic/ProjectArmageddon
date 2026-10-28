/**
 * Gold: Fassung 1, 4 und 5 spielen eine Zündergranate bitgleich wie vor der Fassung 6 (AGENTS.md §2).
 *
 * Gemessen mit dem Stand VOR der Fassung 6 (e26f660), Seed 777, Wurf 0,7 / Kraft 60 auf der
 * Hügelkarte, Ziel unbeteiligt, 700 Takte nach dem Schuss: Zündort (x, y bei `fuse_expired`) und
 * Zustandshash. Der Hash allein sieht die Geländeform nicht; deshalb steht der Zündort dabei.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';

const GOLD_ALT = {
  '1:pa_047': ['fc5fac54', '1092.368', '909.418'], '1:pa_144': ['9575c088', '1100.806', '966.733'],
  '1:pa_052': ['a20d90dc', '1092.368', '909.418'], '1:pa_046': ['2c2a2a19', '1095.181', '928.523'],
  '4:pa_047': ['fc5fac54', '1019.654', '925.154'], '4:pa_144': ['9575c088', '1100.806', '966.733'],
  '4:pa_052': ['a20d90dc', '1092.368', '909.418'], '4:pa_046': ['2c2a2a19', '1095.181', '928.523'],
  '5:pa_047': ['fc5fac54', '1019.654', '925.154'], '5:pa_144': ['9575c088', '1100.806', '966.733'],
  '5:pa_052': ['a20d90dc', '1092.368', '909.418'], '5:pa_046': ['2c2a2a19', '1095.181', '928.523'],
};

test('Fassung 1, 4 und 5 treffen die Goldwerte des Stands vor Fassung 6 bitgleich', () => {
  for (const [schluessel, [hash, x, y]] of Object.entries(GOLD_ALT)) {
    const [fassung, id] = schluessel.split(':');
    const match = new MatchController({
      seed: 777, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000_000, waffen: Number(fassung),
    });
    match.start();
    match.consumeEvents();
    const schuetze = match.activePlayerId;
    const gegner = match.players.find(p => p.entityId !== schuetze).entityId;
    match.world.setComponent(gegner, 'Health', 'max', 1000);
    match.world.setComponent(gegner, 'Health', 'current', 1000);
    match.inventory.register(schuetze, [id]);
    match.fire(schuetze, 0.7, 60, id);
    let zuendung = null;
    for (let i = 0; i < 700; i += 1) {
      match.step();
      for (const e of match.consumeEvents()) if (e.type === 'fuse_expired') zuendung = e.payload;
    }
    assert.ok(zuendung, `${schluessel}: keine Zündung`);
    assert.equal(zuendung.x.toFixed(3), x, `${schluessel} x`);
    assert.equal(zuendung.y.toFixed(3), y, `${schluessel} y`);
    assert.equal(match.stateHash(), hash, `${schluessel} Hash`);
  }
});
