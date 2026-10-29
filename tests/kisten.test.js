/**
 * Tests: Kistenfassung (`config.kisten`), höhere Kistenrate mit Obergrenze.
 *
 * Zusage: Eine Aufzeichnung OHNE `kisten` im Kopf ist `KISTEN_ALT` und wirft Kisten
 * genau wie vorher ab (10/85/5 %, ein Zufallswert je Runde, keine Obergrenze).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, playReplay } from '../src/engine/replay.js';
import { SeededRandom } from '../src/shared/prng.js';
import { LOOT_DROP_RULES, rollCrateCount } from '../src/shared/config/loot.js';
import {
  KISTEN_ALT, KISTEN_OFT, KISTEN_WAFFEN, KISTEN_MUNITION, KISTEN_STANDARD, KISTEN_MAX_AUF_KARTE, normalisiereKisten,
} from '../src/shared/config/kisten.js';

/** Die Ziehung vor Fassung 2, wörtlich. */
function ziehungAlt(rng) {
  const r = rng.next();
  if (r < 0.10) return 'none';
  if (r < 0.95) return 'one';
  return 'two';
}

function neueMatch(seed, extra = {}) {
  const m = new MatchController({
    seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 1_000_000, maxRounds: 999, ...extra,
  });
  m.start();
  return m;
}

test('normalisiereKisten: bekannte Fassungen bleiben, alles andere fällt auf den Standard', () => {
  assert.equal(KISTEN_STANDARD, KISTEN_MUNITION); // Fassung 4 (Waffenfassung 11): Munitionskisten statt leerer Kisten
  assert.equal(normalisiereKisten(1), KISTEN_ALT);
  assert.equal(normalisiereKisten(2), KISTEN_OFT);
  assert.equal(normalisiereKisten(undefined), KISTEN_STANDARD);
  assert.equal(normalisiereKisten(9), KISTEN_STANDARD);
});

test('Fassung 1: Ziehung wie vorher, Zufallsstrom unverändert', () => {
  for (let seed = 1; seed <= 300; seed += 1) {
    const a = new SeededRandom(seed);
    const b = new SeededRandom(seed);
    assert.equal(rollCrateCount(a, KISTEN_ALT), ziehungAlt(b));
    assert.equal(a.next(), b.next(), 'gleich viele Zufallswerte verbraucht');
  }
});

test('Fassung 2: Raten summieren sich auf 1, Mittel über 1,5, fast immer mindestens eine Kiste', () => {
  const r = LOOT_DROP_RULES.cratesPerRoundStart;
  assert.ok(Math.abs(r.none + r.one + r.two + r.three - 1) < 1e-9);
  assert.ok(r.one + 2 * r.two + 3 * r.three >= 1.5);
  assert.ok(r.none <= 0.05);
  const rng = new SeededRandom(99);
  const n = { none: 0, one: 0, two: 0, three: 0 };
  for (let i = 0; i < 20000; i += 1) n[rollCrateCount(rng, KISTEN_OFT)] += 1;
  for (const k of Object.keys(n)) assert.ok(Math.abs(n[k] / 20000 - r[k]) < 0.02, k);
});

test('Fassung 2 wirft mehr ab als Fassung 1 (Runde 1, 120 Seeds)', () => {
  let alt = 0;
  let neu = 0;
  for (let seed = 1; seed <= 120; seed += 1) {
    alt += neueMatch(seed, { kisten: KISTEN_ALT }).getState().crates.length;
    neu += neueMatch(seed, { kisten: KISTEN_OFT }).getState().crates.length;
  }
  assert.ok(neu / 120 > 1.4 && neu / 120 < 1.9, `Fassung 2: ${neu / 120}`);
  assert.ok(alt / 120 > 0.8 && alt / 120 < 1.1, `Fassung 1: ${alt / 120}`);
});

test('Obergrenze: ohne Aufheben liegen in Fassung 2 nie mehr als die Höchstzahl, in Fassung 1 mehr', () => {
  const lauf = kisten => {
    const m = neueMatch(7, { kisten });
    let max = m.getState().crates.length;
    for (let i = 0; i < 4000 && m.round < 25; i += 1) {
      m.endTurn();
      for (let t = 0; t < 130; t += 1) m.step();
      m.consumeEvents();
      max = Math.max(max, m.getState().crates.length);
    }
    return max;
  };
  assert.ok(lauf(KISTEN_OFT) <= KISTEN_MAX_AUF_KARTE);
  assert.ok(lauf(KISTEN_ALT) > KISTEN_MAX_AUF_KARTE, 'Fassung 1 hat keine Obergrenze (Altverhalten)');
});

test('Replay-Kopf: Altdatei ohne `kisten` = Fassung 1, neue Aufzeichnung trägt den Standard', () => {
  const alt = {
    format: 1, createdAt: 0, seed: 4242,
    config: { teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, turnDurationMs: 30000, kit: 3, zerstoerung: 3, waffen: 2 },
    totalTicks: 600, entries: [], rounds: [],
  };
  const { match } = playReplay(ReplayRecorder.fromJSON(alt));
  assert.equal(match.kisten, KISTEN_ALT);

  const neu = new ReplayRecorder({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5 });
  assert.equal(neu.toJSON().config.kisten, KISTEN_STANDARD);
  neu.finalize(300);
  const zurueck = ReplayRecorder.fromJSON(neu.serialize());
  assert.equal(zurueck.config.kisten, KISTEN_STANDARD);
  assert.equal(playReplay(zurueck).match.kisten, KISTEN_STANDARD);
});

test('Wiedergabe gleicht der Live-Partie in beiden Kistenfassungen (Altkopf ohne Feld = Fassung 1)', () => {
  for (const kisten of [KISTEN_ALT, KISTEN_OFT]) {
    const cfg = {
      seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 8, turnDurationMs: 4000, kisten,
    };
    const live = new MatchController(cfg);
    const aufnahme = new ReplayRecorder(cfg);
    live.start();
    let schuesse = 0;
    for (let tick = 0; tick < 3000; tick += 1) {
      if (live.activeProjectileCount === 0 && tick % 120 === 0) {
        const winkel = 0.5 + (schuesse % 9) * 0.15;
        const kraft = 40 + (schuesse * 13) % 50;
        aufnahme.recordInput({ playerId: live.activePlayerId, angle: winkel, power: kraft, weaponId: null, tick: live.world.tickCount, type: 'fire' });
        live.fire(live.activePlayerId, winkel, kraft, null);
        schuesse += 1;
      }
      live.step();
      live.consumeEvents();
    }
    aufnahme.finalize(live.world.tickCount);
    const json = JSON.parse(aufnahme.serialize());
    if (kisten === KISTEN_ALT) delete json.config.kisten;
    const { match } = playReplay(ReplayRecorder.fromJSON(json));
    assert.equal(match.kisten, kisten);
    assert.equal(match.stateHash(), live.stateHash(), `Fassung ${kisten}`);
    assert.ok(live.round > 1, 'mehrere Runden gespielt');
  }
});
