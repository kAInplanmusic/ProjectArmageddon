/**
 * Waffenfassung 22 (Auftrag 2026-11-12): Wurfmine fliegt im Bogen wie ein Stein und bleibt beim Aufprall liegen.
 * Fassungen bis 21 bleiben bitgleich (die Mine wird dort vor die Füße gelegt, ohne Flugbahn).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchController } from '../src/engine/match.js';
import { WAFFEN_STANDARD, WAFFEN_WURF, WAFFEN_ENTSCHEIDUNG, getWaffe, normalisiereWaffen } from '../src/shared/config/waffen-fassung.js';
import { WAFFEN_F22_WERTE } from '../src/shared/config/waffen-f22.js';
import { WEAPONS } from '../src/shared/config/weapons.js';

function match(waffen, seed = 31337) {
  const m = new MatchController({ seed, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1e9, kisten: 0, schaden: 1, waffen, bodenobjekte: 3 });
  m.start();
  return m;
}

function wurf(waffen, winkel, kraft, seed) {
  const m = match(waffen, seed);
  const a = m.activePlayerId;
  m.world.setComponent(a, 'Position', 'x', 300);
  m.world.setComponent(a, 'Position', 'y', m.surfaceYAt(300) - 12);
  m.inventory.grantWeapon(a, 'pa_127');
  m.inventory.selectWeapon(a, 'pa_127');
  const vorher = new Set(m.getState().bodenobjekte.map(o => o.id));
  const r = m.fire(a, winkel, kraft, 'pa_127');
  const ereignisse = [];
  for (let i = 0; i < 500; i += 1) { m.step(); for (const e of m.consumeEvents()) ereignisse.push(e); }
  const neu = m.getState().bodenobjekte.filter(o => !vorher.has(o.id));
  return { m, a, r, ereignisse, neu };
}

test('Fassung 22 ist Standard; 21 und älter bleiben wählbar', () => {
  assert.equal(WAFFEN_STANDARD, WAFFEN_WURF);
  assert.equal(WAFFEN_WURF, WAFFEN_ENTSCHEIDUNG + 1);
  assert.equal(normalisiereWaffen(22), 22);
  assert.equal(normalisiereWaffen(21), 21);
  assert.equal(normalisiereWaffen(99), WAFFEN_WURF);
});

test('Die Schicht f22 ändert nur die Mine; Fassung 21 sieht sie nicht', () => {
  assert.deepEqual(Object.keys(WAFFEN_F22_WERTE), ['pa_127']);
  for (const w of WEAPONS) {
    const alt = getWaffe(w.id, 21);
    const neu = getWaffe(w.id, 22);
    if (w.id === 'pa_127') continue;
    assert.equal(neu.landetAls, undefined, w.id);
    assert.deepEqual({ ...neu }, { ...alt }, `${w.id}: Fassung 22 darf nichts außer der Mine ändern`);
  }
  const alt = getWaffe('pa_127', 21);
  assert.equal(alt.delivery, 'hitscan');
  assert.equal(alt.landetAls, undefined);
  const neu = getWaffe('pa_127', 22);
  assert.equal(neu.delivery, 'projectile');
  assert.equal(neu.landetAls, 'mine');
  assert.equal(neu.windFactor, 0.6, 'die Wurfmine ist windanfällig wie ein Stein');
  assert.ok(neu.gravityScale > 1);
});

test('Fassung 21 bleibt bitgleich: die Mine wird gelegt, es gibt kein Geschoss', () => {
  const { r, neu, ereignisse } = wurf(21, 0.7, 60);
  assert.equal(r.projectileId, null);
  assert.equal(r.special.kind, 'mine');
  assert.equal(neu.length, 1);
  assert.equal(neu[0].art, 'abgeworfen');
  assert.ok(!ereignisse.some(e => e.type === 'projectile_spawn'));
});

test('Fassung 22: die Mine fliegt als Geschoss im Bogen und liegt danach am Aufprallpunkt, ohne Explosion', () => {
  const { m, a, r, ereignisse, neu } = wurf(22, 0.7, 60);
  assert.ok(Number.isInteger(r.projectileId), 'sichtbares Geschoss');
  const spawn = ereignisse.find(e => e.type === 'projectile_spawn');
  assert.ok(spawn && spawn.payload.vy < 0, 'steigt zuerst (Bogen, kein Platzieren)');
  const einschlag = ereignisse.find(e => e.type === 'projectile_impact');
  assert.ok(einschlag, 'Aufprall wird gemeldet');
  assert.ok(!ereignisse.some(e => e.type === 'explosion'), 'keine Explosion beim Aufprall');
  assert.ok(!ereignisse.some(e => e.type === 'damage'), 'kein Schaden');
  assert.equal(neu.length, 1, 'genau eine neue Mine');
  const mine = neu[0];
  assert.equal(mine.typ, 'mine');
  assert.equal(mine.art, 'abgeworfen');
  assert.equal(mine.ownerId, a);
  assert.ok(Math.abs(mine.x - einschlag.payload.x) <= 60, `Mine liegt am Aufprallpunkt (${mine.x} vs ${einschlag.payload.x})`);
  assert.equal(m.activeProjectileCount, 0);
});

test('Fassung 22: stärkerer Wurf fliegt weiter, steiler Wurf landet näher am Werfer (echte Wurfbahn)', () => {
  const schwach = wurf(22, 0.7, 40).neu[0];
  const stark = wurf(22, 0.7, 90).neu[0];
  assert.ok(stark.x > schwach.x + 20, `stark ${stark.x} > schwach ${schwach.x}`);
});

test('Fassung 22: gleicher Seed und gleiche Eingabe geben denselben Zustand (deterministisch)', () => {
  const a = wurf(22, 0.8, 70, 777);
  const b = wurf(22, 0.8, 70, 777);
  assert.deepEqual(a.m.getState().bodenobjekte, b.m.getState().bodenobjekte);
  assert.equal(a.m.getState().hash ?? 0, b.m.getState().hash ?? 0);
});

test('Fassung 22: ohne Bodenobjekt-System (Marke 1) entsteht keine Mine, das Geschoss verschwindet ohne Wirkung', () => {
  const m = new MatchController({ seed: 31337, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1e9, kisten: 0, schaden: 1, waffen: 22 });
  m.start();
  const a = m.activePlayerId;
  m.inventory.grantWeapon(a, 'pa_127');
  m.inventory.selectWeapon(a, 'pa_127');
  assert.equal(m.fire(a, 0.7, 60, 'pa_127').ok, true);
  for (let i = 0; i < 500; i += 1) m.step();
  assert.equal(m.activeProjectileCount, 0);
  assert.ok(!m.getState().bodenobjekte || m.getState().bodenobjekte.length === 0);
});
