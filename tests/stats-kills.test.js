import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { MatchStats, PlayerProfile, beschreibe } from '../src/shared/stats.js';

/**
 * Kills in den Kennzahlen (EREIGNIS-1, Rest „Kills fehlen in Statistiken").
 *
 * `death` trägt nur die gestorbene Figur. Der Kill gehört dem Gegner, der sie
 * zuletzt getroffen hat — auch wenn sie danach ertrinkt. Eigen-, Team- und
 * Umgebungsschaden ändern die Zuordnung nicht.
 */

const teams = new Map([[1, 0], [2, 0], [3, 1], [4, 1]]);

const schaden = (attackerId, entityId, amount = 10) => ({ type: 'damage', payload: { attackerId, entityId, amount } });
const tod = entityId => ({ type: 'death', payload: { entityId } });

test('Kill gehört dem letzten gegnerischen Angreifer', () => {
  const stats = new MatchStats({ teams });
  stats.feedAll([schaden(1, 3), schaden(2, 3), tod(3)]);
  assert.equal(stats.fuer(2).kills, 1);
  assert.equal(stats.fuer(1).kills, 0);
});

test('Eigen-, Team- und Umgebungsschaden stehlen keinen Kill', () => {
  const stats = new MatchStats({ teams });
  // 1 trifft 3; danach Eigenschaden, Teamschaden (4 → 3) und Sturz ohne Angreifer.
  stats.feedAll([schaden(1, 3), schaden(3, 3), schaden(4, 3), schaden(null, 3), tod(3)]);
  assert.equal(stats.fuer(1).kills, 1);
  assert.equal(stats.spieler.get(4)?.kills ?? 0, 0);
});

test('Tod ohne gegnerischen Treffer zählt für niemanden, doppeltes death nur einmal', () => {
  const stats = new MatchStats({ teams });
  stats.feedAll([schaden(null, 4), tod(4), schaden(1, 3), tod(3), tod(3)]);
  assert.equal(stats.fuer(1).kills, 1);
  const summe = [...stats.spieler.values()].reduce((s, e) => s + e.kills, 0);
  assert.equal(summe, 1);
});

test('Kills: Team-Summe, Profil, Speicherung und Anzeige', () => {
  const stats = new MatchStats({ teams });
  stats.feedAll([schaden(1, 3), tod(3), schaden(2, 4), tod(4)]);
  stats.feed({ type: 'match_over', payload: { winnerTeamId: 0, ticks: 600, rounds: 2 } });
  const partie = stats.zusammenfassung([1, 2]);
  assert.equal(partie.eigener.kills, 2);
  assert.deepEqual(partie.figuren.map(f => f.kills).sort(), [1, 1]);

  const profil = new PlayerProfile().merge(partie).merge(partie);
  assert.equal(profil.kills, 4);
  assert.equal(PlayerProfile.fromJSON(JSON.parse(JSON.stringify(profil.toJSON()))).kills, 4);
  assert.equal(beschreibe(profil).kills, '4');
  // Altes Profil ohne Feld: 0, keine NaN.
  assert.equal(new PlayerProfile({ partien: 3 }).kills, 0);
});

test('Echte Engine: tödlicher Treffer ergibt death und genau einen Kill', () => {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 2, turnDurationMs: 400, maxRounds: 8 });
  match.start();
  const figuren = match.getState().entities;
  const teamsVon = new Map(figuren.map(e => [e.entityId, e.teamId]));
  const stats = new MatchStats({ teams: teamsVon });
  const taeter = figuren[0];
  const opfer = figuren.find(e => e.teamId !== taeter.teamId);
  match.world.getSystem('damage').applyDamage(match.world, opfer.entityId, 100000, taeter.entityId);
  let tode = 0;
  for (let i = 0; i < 5; i += 1) {
    match.step();
    const ereignisse = match.consumeEvents();
    tode += ereignisse.filter(e => e.type === 'death' && e.payload.entityId === opfer.entityId).length;
    stats.feedAll(ereignisse, match.world.tickCount);
  }
  assert.equal(tode, 1);
  assert.equal(stats.fuer(taeter.entityId).kills, 1);
  assert.equal(stats.alle().reduce((s, f) => s + f.kills, 0), 1);
});
