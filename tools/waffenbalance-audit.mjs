/** Reproduzierbare Balancevorbereitung. Keine Änderung an Spielregeln oder Assets. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MatchController, BASE_HEALTH } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { getWaffe, WAFFEN_STANDARD } from '../src/shared/config/waffen-fassung.js';
import { CLASS_IDS, combatProfile } from '../src/shared/config/classes.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { SCHADEN_STANDARD } from '../src/shared/config/schaden.js';
import { BODENOBJEKTE_STANDARD } from '../src/shared/config/bodenobjekte.js';
import { WIND_STANDARD } from '../src/shared/config/wind.js';
import { buildEffect, elementalEffectFor, SELF_TARGET_KINDS } from '../src/engine/specials.js';
import { wendeExplosionAn } from '../src/engine/explosion.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.argv.find(a => a.startsWith('--ziel='))?.slice(7) ?? 'docs/waffenbalance-2026-11-09');
const ONLY = process.argv.find(a => a.startsWith('--nur='))?.slice(6).split(',');
const SEED = 31337;
const DISTANCES = [30, 90, 250, 600, 1200];
const round = n => Math.round(n * 1000) / 1000;
const finite = n => Number.isFinite(n) ? n : 'unbegrenzt';
const health = (m, id) => m.world.getComponent(id, 'Health', 'current') ?? 0;

function fixture(weaponId, attackerClass = 'fernkampf', targetClass = 'fernkampf', distance = 90) {
  const m = new MatchController({ seed: SEED, teams: 2, playersPerTeam: 1,
    preset: 'open', turnDurationMs: 1_000_000, klassen: KLASSEN_STANDARD,
    waffen: WAFFEN_STANDARD, schaden: SCHADEN_STANDARD, wind: WIND_STANDARD,
    bodenobjekte: BODENOBJEKTE_STANDARD, kisten: 1,
    loadouts: [{ classId: attackerClass, archetypeId: null }, { classId: targetClass, archetypeId: null }],
  });
  m.start();
  const players = m.getState().entities;
  const shooter = players[0].entityId, target = players[1].entityId;
  assert.equal(m.activePlayerId, shooter, 'Fixture-Seed muss ersten Spieler aktivieren');
  assert.equal(players[0].classId, CLASS_IDS.indexOf(attackerClass));
  assert.equal(players[1].classId, CLASS_IDS.indexOf(targetClass));
  const targetHP = health(m, target);
  const shooterHP = health(m, shooter);
  const positions = new Map([[shooter, { x: 400, y: 100 }], [target, { x: 400 + distance, y: 100 }]]);
  function pin() {
    for (const [id, pos] of positions) {
      if (!m.world.isActive(id)) continue;
      for (const axis of ['x', 'y']) {
        m.world.setComponent(id, 'Position', axis, pos[axis]);
        m.world.setComponent(id, 'Velocity', axis, 0);
      }
    }
  }
  pin();
  assert.equal(m.terrain.isSolid(400, 100), false);
  assert.equal(m.terrain.isSolid(400 + distance, 100), false);
  m.world.setComponent(target, 'Health', 'max', 1000);
  m.world.setComponent(target, 'Health', 'current', 1000);
  m.inventory.register(shooter, [weaponId]);
  m.inventory.selectWeapon(shooter, weaponId);
  m.consumeEvents();
  return { m, shooter, target, pin, targetHP, shooterHP, positions };
}

function shot(weapon, { attackerClass = 'fernkampf', targetClass = 'fernkampf', distance = 90, aim = true } = {}) {
  const f = fixture(weapon.id, attackerClass, targetClass, distance);
  const { m, shooter, target, pin } = f;
  const effect = buildEffect(weapon);
  const self = effect && SELF_TARGET_KINDS.has(effect.kind);
  // Ohne Verletzung gäbe ein echter Heilzauber in der Probe korrekt null Heilung.
  if (self && effect.kind === 'heal') m.world.setComponent(shooter, 'Health', 'current', Math.max(1, f.shooterHP - 60));
  const before = health(m, shooter);
  const ammoBefore = finite(m.inventory.getAmmo(shooter, weapon.id));
  let angle = 0, power = 100, nearestPreview = null;
  if (aim && !self && weapon.delivery !== 'hitscan' && (weapon.strikeStyle ?? 'self') === 'self') {
    let best = { d: Infinity, angle: 0, power: 100 };
    const evaluate = (a, p) => {
      const flight = m.aimPreview(shooter, a, p, 600, weapon);
      let d = Infinity;
      for (const q of flight) d = Math.min(d, Math.hypot(q.x - 400 - distance, q.y - 100));
      if (d < best.d) best = { d, angle: a, power: p };
    };
    for (const a of [-0.1, 0, 0.1, 0.3, 0.5, 0.8, 1.1, 1.4]) for (const p of [30, 60, 100]) evaluate(a, p);
    const coarse = { ...best };
    for (let da = -0.08; da <= 0.08; da += 0.02) for (const dp of [-10, 0, 10]) evaluate(coarse.angle + da, Math.max(10, Math.min(100, coarse.power + dp)));
    angle = best.angle; power = best.power; nearestPreview = round(best.d);
  }
  /* Die tatsächlich aufgebaute Entfernung, nicht nur die angefragte. */
  const distanceMeasured = round(Math.abs(
    m.world.getComponent(target, 'Position', 'x') - m.world.getComponent(shooter, 'Position', 'x'),
  ));
  const r = m.fire(shooter, angle, power, weapon.id);
  const spawned = r.projectileId == null ? null : Object.fromEntries(['damage', 'blastRadius', 'damageType', 'lifetime', 'fuseTicks', 'weaponId', 'owner', 'knockback', 'terrainDamage'].map(k => [k, m.world.getComponent(r.projectileId, 'Projectile', k)]));
  const directEvents = [], delayedEvents = [];
  const collect = out => out.push(...m.consumeEvents());
  collect(directEvents);
  const stateAfterFire = m.getState();
  const shooterPositionAfterFire = Object.fromEntries(['x', 'y'].map(k => [k, m.world.getComponent(shooter, 'Position', k)]));
  let ticks = 0;
  while (m.activeProjectileCount > 0 && ticks < 900) { pin(); m.step(); pin(); collect(directEvents); ticks++; }
  for (let i = 0; i < 12; i++) { pin(); m.step(); pin(); collect(directEvents); }
  const directLoss = round(1000 - health(m, target));
  const beforeTurns = m.getState();
  for (let turn = 0; turn < 6 && m.status === 'playing'; turn++) {
    m.endTurn(); pin(); collect(delayedEvents);
    for (let i = 0; i < 4; i++) { pin(); m.step(); pin(); collect(delayedEvents); }
  }
  const sum = (events, id) => round(events.filter(e => e.type === 'damage' && e.payload.entityId === id && e.payload.attackerId === shooter).reduce((n, e) => n + e.payload.amount, 0));
  const relevant = e => ['damage', 'dot_tick', 'special_effect', 'mine_placed', 'mine_exploded', 'turret_deployed', 'turn_skipped', 'heal', 'shield_absorbed'].includes(e.type);
  return {
    distance, distanceRequested: distance, distanceMeasured,
    attackerClass, targetClass, targetNaturalHP: f.targetHP, shooterNaturalHP: f.shooterHP,
    ok: r.ok, errors: r.errors ?? [], angle: round(angle), power, nearestPreview,
    route: r.special ? 'selbst' : r.projectileId != null ? 'projektil' : 'strahl',
    special: r.special ?? null, spawned,
    ammoBefore, ammoAfter: finite(m.inventory.getAmmo(shooter, weapon.id)),
    cooldownAfterFire: stateAfterFire.entities.find(e => e.entityId === shooter)?.cooldowns?.[weapon.id] ?? 0,
    directTargetDamage: sum(directEvents, target), directTargetHealthLoss: directLoss,
    delayedAttributedDamage: sum(delayedEvents, target), totalTargetHealthLoss: round(1000 - health(m, target)),
    delayedTargetHealthLoss: round(1000 - health(m, target) - directLoss),
    dotDamageWithSourceInTick: round(delayedEvents.filter(e => e.type === 'dot_tick' && e.payload.playerId === target)
      .flatMap(e => e.payload.eintraege ?? []).filter(e => e.by === shooter).reduce((n, e) => n + e.schaden, 0)),
    directSelfDamage: sum(directEvents, shooter), shooterHealthChangeAfterResolution: round(health(m, shooter) - before),
    shooterPositionAfterFire,
    statusAfterFire: stateAfterFire.statuses, statusBeforeTurns: beforeTurns.statuses,
    pendingProjectiles: m.activeProjectileCount, projectileTicks: ticks,
    events: [...directEvents, ...delayedEvents].filter(relevant).map(e => ({ type: e.type, payload: e.payload })),
    skippedTurns: delayedEvents.filter(e => e.type === 'turn_skipped' && e.payload.playerId === target).length,
  };
}

function radialProbe(weapon, sample) {
  if (!sample.spawned) return null;
  const f = fixture(weapon.id);
  const { m, shooter, target } = f;
  const spawned = sample.spawned;
  const results = [];
  // Komponententest: Terrain und Kettenreaktionen ausgeschaltet, kein Kollisionsspieltest.
  m.world.services.terrain = null;
  m.world.services.zerstoerung = null;
  m.world.services.water = null;
  m.world.services.bodenobjekte = null;
  for (const radius of [...new Set([spawned.blastRadius, weapon.blastRadius])]) {
    for (const offset of [...new Set([0, 10, radius / 2, radius + 1])]) {
      m.world.setComponent(target, 'Position', 'x', 1000 + offset);
      m.world.setComponent(target, 'Position', 'y', 100);
      m.world.setComponent(target, 'Health', 'current', 1000);
      wendeExplosionAn(m.world, { ...spawned, owner: shooter, x: 1000, y: 100, blastRadius: radius, knockback: 0, terrainDamage: 0, hitTarget: null });
      results.push({ radius, offset, hitTarget: null, loss: round(1000 - health(m, target)) });
    }
  }
  return results;
}

fs.mkdirSync(OUT, { recursive: true });
const result = {
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  versions: { waffen: WAFFEN_STANDARD, klassen: KLASSEN_STANDARD, schaden: SCHADEN_STANDARD, wind: WIND_STANDARD, bodenobjekte: BODENOBJEKTE_STANDARD, kisten: 1 },
  seed: SEED, distances: DISTANCES,
  method: 'Echte fire/step/endTurn-Pfade; beide Figuren auf y=100 im freien Luftraum festgehalten. Ziel 1000 LP, Klassenleben separat protokolliert. Grob/fein Vorschauauswahl, ein realer Schuss je Distanz; keine globale Optimalitäts- oder Trefferquotenaussage. 6 Zugwechsel für Nachwirkung, kein Wiederholungsbeschuss. Radiusprobe separat kontrollierter Komponentenaufruf. Bewegung und reale Hindernisse ausdrücklich nicht abgenommen.',
  weapons: [],
};
for (const base of WEAPONS.filter(w => !ONLY || ONLY.includes(w.id))) {
  const weapon = getWaffe(base.id, WAFFEN_STANDARD);
  const effect = buildEffect(weapon), elemental = elementalEffectFor(weapon);
  const self = Boolean(effect && SELF_TARGET_KINDS.has(effect.kind));
  const distances = (self ? [90] : DISTANCES).map(distance => shot(weapon, { distance }));
  const best = [...distances].sort((a, b) => b.directTargetDamage - a.directTargetDamage)[0];
  // Dieselbe Waffe in neun echten Klassenpaarungen, nicht nur LP / Katalogschaden.
  const classes = self ? [] : CLASS_IDS.flatMap(attackerClass => CLASS_IDS.map(targetClass => shot(weapon, { attackerClass, targetClass, distance: best.distance })));
  const changes = Object.keys(weapon).filter(k => JSON.stringify(weapon[k]) !== JSON.stringify(base[k])).map(field => ({ field, base: base[field] ?? null, current: weapon[field] }));
  result.weapons.push({ id: base.id, base, current: weapon, effect, elemental, self, changes,
    freshAmmo: distances[0].ammoBefore, distances, classes, radial: radialProbe(weapon, best) });
  fs.writeFileSync(path.join(OUT, 'messung-150.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`${base.id} ${weapon.displayName}: ${self ? 'Selbstwirkung' : `Treffer ${best.directTargetDamage}, Nachwirkung ${best.delayedAttributedDamage}`} (${result.weapons.length})`);
}
const controlWeapon = getWaffe('pa_040');
const a = shot(controlWeapon, { distance: 90 }), b = shot(controlWeapon, { distance: 90 });
assert.deepEqual(a, b, 'Identische Inputs müssen identische Messungen ergeben');
/*
 * Der gemessene Vertrag als eigene Zusammenfassung: 150 aktuelle Namen/Werte,
 * Klassenleben und frische Munition. So ist die Abnahme ohne Auszählen der
 * großen Messdatei prüfbar (BAL-06).
 */
const munition = result.weapons.reduce((z, w) => {
  const key = Number.isFinite(w.freshAmmo) ? String(w.freshAmmo) : 'unbegrenzt';
  z[key] = (z[key] ?? 0) + 1;
  return z;
}, {});
result.contract = {
  waffenfassung: WAFFEN_STANDARD,
  klassenfassung: KLASSEN_STANDARD,
  katalog: result.weapons.length,
  eindeutigeNamen: new Set(result.weapons.map(w => w.current.displayName)).size,
  klassenLeben: Object.fromEntries(CLASS_IDS.map(klass => [klass, Math.round(BASE_HEALTH * combatProfile(klass, null, null, KLASSEN_STANDARD).healthMultiplier)])),
  munition,
};
if (!ONLY) {
  assert.equal(result.contract.katalog, 150);
  assert.equal(munition.unbegrenzt, 9);
  assert.equal(munition['3'], 73);
  assert.equal(munition['2'], 48);
  assert.equal(munition['1'], 20);
}
result.controls = { repeatedShotIdentical: true, fixtureHealth: CLASS_IDS.map(klass => { const f = fixture('pa_040', klass, klass); return { klass, hp: f.shooterHP, expectedHP: Math.round(BASE_HEALTH * combatProfile(klass, null, null, KLASSEN_STANDARD).healthMultiplier) }; }) };
for (const c of result.controls.fixtureHealth) assert.equal(c.hp, c.expectedHP);
assert.equal(new Set(result.weapons.map(w => w.id)).size, ONLY ? ONLY.length : 150);
fs.writeFileSync(path.join(OUT, 'messung-150.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`Fertig: ${result.weapons.length} Waffen; Kontrollwiederholung und Klassenleben bestätigt.`);
