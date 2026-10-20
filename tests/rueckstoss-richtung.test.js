/**
 * Rückstoß bei Treffern: Der Stoß zeigt immer WEG vom Einschlag (Engine), und das Zucken der
 * getroffenen Figur im Client zeigt dieselbe Richtung (nicht mehr starr „gegen die Blickrichtung").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { stossRichtung, trefferMarke } from '../src/client/gefuehl.js';
import { FigurPosen } from '../src/client/figurAnimation.js';

function neuerMatch() {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000 });
  match.start();
  return match;
}

/** Zündet eine Ladung bei (x, y) und liefert die Geschwindigkeitsänderung des Ziels in dem Tick. */
function stoss(match, ziel, x, y) {
  const w = match.world;
  const vorher = { x: w.getComponent(ziel, 'Velocity', 'x') ?? 0, y: w.getComponent(ziel, 'Velocity', 'y') ?? 0 };
  const g = w.createEntity();
  w.addComponent(g, 'Position', { x, y });
  w.addComponent(g, 'Velocity', { x: 0, y: 0 });
  w.addComponent(g, 'Projectile', {
    owner: match.activePlayerId, weaponId: 0, damageType: 0, damage: 5, blastRadius: 80, knockback: 400,
    drag: 1, gravityScale: 0, windFactor: 0, terrainDamage: 0, bounces: 0, fuseTicks: 1, lifetime: 50, alive: 1,
    pierce: 0, homing: 0, letztesZiel: -1, pierceSchutz: 0,
  });
  match.step();
  return { x: (w.getComponent(ziel, 'Velocity', 'x') ?? 0) - vorher.x, y: (w.getComponent(ziel, 'Velocity', 'y') ?? 0) - vorher.y };
}

test('Engine: Ein Einschlag links stößt nach rechts, rechts nach links, darunter nach oben', () => {
  const m = neuerMatch();
  const ziel = m.getState().entities.find(e => e.entityId !== m.activePlayerId).entityId;
  const zx = m.world.getComponent(ziel, 'Position', 'x');
  const zy = m.world.getComponent(ziel, 'Position', 'y');
  assert.ok(stoss(m, ziel, zx - 20, zy).x > 0, 'Einschlag links: Stoß nach rechts');
  assert.ok(stoss(m, ziel, zx + 20, zy).x < 0, 'Einschlag rechts: Stoß nach links');
  assert.ok(stoss(m, ziel, zx, zy + 20).y < 0, 'Einschlag unterhalb: Stoß nach oben (y wächst nach unten)');
  assert.ok(stoss(m, ziel, zx, zy - 20).y > 0, 'Einschlag oberhalb: Stoß nach unten');
});

test('Client: stossRichtung wählt den nächsten Einschlag und zeigt von ihm weg', () => {
  const figur = { x: 100, y: 50 };
  assert.equal(stossRichtung(figur, [{ x: 60, y: 50 }]), 1);
  assert.equal(stossRichtung(figur, [{ x: 140, y: 50 }]), -1);
  assert.equal(stossRichtung(figur, [{ x: 400, y: 50 }, { x: 110, y: 50 }]), -1, 'nächster zählt');
  assert.equal(stossRichtung(figur, []), 0);
  assert.equal(stossRichtung(figur, [{ x: 100, y: 80 }]), 0, 'genau darunter: keine Seite');
  assert.equal(trefferMarke({ entityId: 1, x: 1, y: 1, stoss: 7 }).stoss, 1);
});

test('Client: Das Zucken folgt dem Stoß, ohne Stoß der alten Regel (gegen die Blickrichtung)', () => {
  const zuck = (stoss) => {
    const p = new FigurPosen();
    const f = { entityId: 1, x: 100, y: 50 };
    p.pose(f, 0, { treffer: 0 });
    return p.pose(f, 0.016, { treffer: 1, haerte: 1, ...(stoss === undefined ? {} : { stoss }) }).dx;
  };
  const rechts = zuck(1);
  const links = zuck(-1);
  assert.ok(rechts > 0 && links < 0, `rechts ${rechts}, links ${links}`);
  assert.equal(Math.sign(zuck(undefined)), Math.sign(zuck(0)));
});
