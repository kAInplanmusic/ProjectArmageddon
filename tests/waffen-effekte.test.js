/**
 * Tests: die vier Waffen, die bis 2026-10-14 keinen eigenen Effekt hatten.
 *
 *  - pa_141 Astralkrieger (`summon_warrior`): stellt einen Krieger auf (Geschütz, 50 % Schaden)
 *  - pa_143 Astralross (`summon_mount`): trägt den Schützen 140 px weit
 *  - pa_129 Tesla-Turm (`chain_lightning`): Blitz springt zweimal auf nahe Gegner (60 %, 36 %)
 *  - pa_113 Bohrkanone (`drill_cannon`): Mundloch und Tunnel im Gelände
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { buildEffect, EFFECT_KIND, SELF_TARGET_KINDS } from '../src/engine/specials.js';
import { getWeapon } from '../src/shared/config/weapons.js';

function neuesMatch(spieler = 2) {
  const match = new MatchController({
    seed: 4242, teams: spieler, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
  });
  match.start();
  return match;
}

/**
 * Stellt alle Figuren auf eine gemeinsame Höhe `y` (über dem Hügelland, damit
 * ein waagerechter Strahl frei läuft); `xs` je Spieler in Reihenfolge der Einträge.
 * Ohne `y` stehen sie auf dem Boden.
 */
function stelle(match, xs, y = null) {
  match.getState().entities.forEach((e, i) => {
    const x = xs[i];
    match.world.setComponent(e.entityId, 'Position', 'x', x);
    match.world.setComponent(e.entityId, 'Position', 'y', y ?? match.surfaceYAt(x) - 12);
    match.world.setComponent(e.entityId, 'Health', 'current', 1000);
    match.world.setComponent(e.entityId, 'Health', 'max', 1000);
  });
}

function leben(match, id) { return match.world.getComponent(id, 'Health', 'current'); }

function schiesse(match, waffeId, winkel = 0, kraft = 60) {
  const id = match.activePlayerId;
  match.inventory.grantWeapon(id, waffeId);
  match.inventory.selectWeapon(id, waffeId);
  const r = match.fire(id, winkel, kraft, waffeId);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  return { id, r };
}

test('Die vier Waffen haben jetzt eine eigene Wirkung', () => {
  assert.equal(buildEffect(getWeapon('pa_141')).kind, EFFECT_KIND.TURRET);
  assert.equal(buildEffect(getWeapon('pa_143')).kind, EFFECT_KIND.MOUNT);
  assert.equal(buildEffect(getWeapon('pa_129')).kind, EFFECT_KIND.CHAIN);
  assert.equal(buildEffect(getWeapon('pa_113')).kind, EFFECT_KIND.DRILL);
  assert.ok(SELF_TARGET_KINDS.has(EFFECT_KIND.TURRET) && SELF_TARGET_KINDS.has(EFFECT_KIND.MOUNT));
  assert.ok(!SELF_TARGET_KINDS.has(EFFECT_KIND.CHAIN) && !SELF_TARGET_KINDS.has(EFFECT_KIND.DRILL));
});

test('Astralkrieger: stellt einen Krieger auf, schwächer als die Waffe selbst', () => {
  const match = neuesMatch();
  stelle(match, [300, 700]);
  const { r } = schiesse(match, 'pa_141');
  assert.equal(r.special.kind, EFFECT_KIND.TURRET);
  assert.ok(r.special.turretId !== null, 'Krieger steht');
  const eff = buildEffect(getWeapon('pa_141'));
  assert.equal(eff.damage, 35);
  assert.ok(eff.damage < getWeapon('pa_141').damage);
});

test('Astralross: trägt den Schützen weit und setzt ihn aufs Gelände', () => {
  const match = neuesMatch();
  stelle(match, [400, 900]);
  const id = match.activePlayerId;
  const vorher = match.world.getComponent(id, 'Position', 'x');
  const { r } = schiesse(match, 'pa_143');
  assert.equal(r.special.kind, EFFECT_KIND.MOUNT);
  const nachher = match.world.getComponent(id, 'Position', 'x');
  assert.equal(Math.abs(nachher - vorher), 140);
  assert.ok(Math.abs(nachher - vorher) > 60, 'weiter als ein gewöhnlicher Sprung');
});

test('Tesla-Turm: Blitz springt auf die zwei nächsten Gegner, Schaden fällt, Verbündete bleiben verschont', () => {
  const match = neuesMatch(4);
  const [a, b, c, d] = match.getState().entities.map(e => e.entityId);
  stelle(match, [200, 320, 440, 1500], 680);
  const vorher = [a, b, c, d].map(id => leben(match, id));
  const waffe = getWeapon('pa_129');
  const { id } = schiesse(match, 'pa_129', 0, 60);
  assert.equal(id, a);
  const schaden = [b, c, d].map((x, i) => vorher[i + 1] - leben(match, x));
  assert.equal(Math.round(schaden[0]), Math.round(waffe.damage), 'erstes Ziel voll');
  assert.equal(Math.round(schaden[1]), Math.round(waffe.damage * 0.6), 'zweites Ziel 60 %');
  assert.equal(schaden[2], 0, 'der dritte liegt außer Sprungweite');
  assert.equal(leben(match, a), vorher[0], 'der Schütze nimmt keinen Schaden');
});

test('Tesla-Turm: ohne Treffer kein Sprung; gleiche Lage, gleicher Zustandshash', () => {
  const lauf = () => {
    const match = neuesMatch(3);
    stelle(match, [200, 330, 450], 680);
    schiesse(match, 'pa_129', 0, 60);
    return match.stateHash();
  };
  assert.equal(lauf(), lauf());
  const match = neuesMatch(3);
  const ids = match.getState().entities.map(e => e.entityId);
  stelle(match, [200, 330, 450], 680);
  schiesse(match, 'pa_129', Math.PI / 2, 60);
  assert.equal(leben(match, ids[1]), 1000);
  assert.equal(leben(match, ids[2]), 1000);
});

test('Bohrkanone: gräbt Mundloch und Tunnel in den Hang, Ereignisse gehen an die Clients', () => {
  const match = neuesMatch();
  stelle(match, [1100, 2300]);
  const boden = match.surfaceYAt(1100);
  // Waagerecht in den Hügel rechts vom Tal (Winkel nach unten gibt es nicht).
  const hashVorher = match.terrain.hash();
  schiesse(match, 'pa_113', 0, 60);
  const craters = match.consumeEvents().filter(e => e.type === 'terrain_destroyed');
  assert.ok(craters.length >= 10, `Tunnel aus mehreren Löchern (${craters.length})`);
  assert.equal(craters[0].payload.radius, 30, 'Mundloch');
  assert.ok(craters.slice(1).every(c => c.payload.radius === 14));
  assert.notEqual(match.terrain.hash(), hashVorher);
  assert.ok(boden > 0);
});

test('Bohrkanone: trifft sie eine Figur, wird sie getroffen und nicht gebohrt', () => {
  const match = neuesMatch();
  const [a, b] = match.getState().entities.map(e => e.entityId);
  stelle(match, [200, 320], 680);
  const vorher = leben(match, b);
  schiesse(match, 'pa_113', 0, 60);
  assert.equal(vorher - leben(match, b), getWeapon('pa_113').damage);
  assert.equal(match.consumeEvents().filter(e => e.type === 'terrain_destroyed').length, 0);
  assert.ok(a !== b);
});
