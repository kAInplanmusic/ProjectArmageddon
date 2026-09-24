/**
 * Tests: Schadensart und Sichtlinie im LAUFENDEN Match.
 *
 * `tests/weapon-damage-types.test.js` prüft die Katalogdaten. Hier wird der
 * Beweis geführt, dass beide Merkmale den Motor wirklich erreichen — sonst
 * wären es zwei weitere Zusagen ohne Wirkung.
 *
 * ## Was gemessen wird
 *
 *  1. Ein abgefeuertes Geschoss trägt die Schadensart seiner Waffe als Zahl.
 *  2. Das Schadenereignis trägt Kennung UND Namen der Art.
 *  3. Der Flächenschaden eines Geschosses trägt sie ebenfalls.
 *  4. Eine Sichtlinien-Waffe schießt bei freier Sicht — und wird abgelehnt,
 *     sobald Gestein zwischen Mündung und Einschlag liegt.
 *  5. Ein abgelehnter Schuss kostet KEINE Munition.
 *  6. Selbstwirkungen (Heilung) brauchen keine Sichtlinie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { damageTypeId, damageTypeName } from '../src/engine/damageTypes.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';

function neuerMatch(seed = 4242) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
  });
  match.start();
  return match;
}

/** Waffe mit einer bestimmten Schadensart und ohne Sichtlinien-Zwang. */
function ohneSichtMitArt(art) {
  return WEAPONS.find(w => w.damageType === art
    && !w.requiresLineOfSight
    && w.damage > 0
    && w.category !== 'melee');
}

const LOS_WAFFE = WEAPONS.find(w => w.requiresLineOfSight && w.damage > 0 && w.delivery !== 'hitscan');
const HEIL_WAFFE = WEAPONS.find(w => {
  const e = buildEffect(w);
  return e && SELF_TARGET_KINDS.has(e.kind) && e.kind === 'heal';
});

test('Ein abgefeuertes Geschoss trägt die Schadensart seiner Waffe', () => {
  const waffe = ohneSichtMitArt('explosive');
  assert.ok(waffe, 'Vorbedingung: es gibt eine Sprengwaffe ohne Sichtlinien-Zwang');

  const match = neuerMatch();
  const aktiver = match.activePlayerId;
  match.inventory.register(aktiver, [waffe.id]);
  match.inventory.selectWeapon(aktiver, waffe.id);

  const schuss = match.fire(aktiver, Math.PI / 4, 80, waffe.id);
  assert.equal(schuss.ok, true, `Schuss abgelehnt: ${schuss.errors?.join(', ')}`);
  assert.ok(schuss.projectileId, 'Es muss ein Geschoss entstanden sein');

  const imGeschoss = match.world.getComponent(schuss.projectileId, 'Projectile', 'damageType');
  assert.equal(imGeschoss, damageTypeId(waffe.damageType),
    `Das Geschoss trägt ${imGeschoss}, die Waffe "${waffe.displayName}" sagt `
    + `"${waffe.damageType}" (${damageTypeId(waffe.damageType)})`);
});

test('Das Schadenereignis trägt Kennung und Namen der Schadensart', () => {
  const match = neuerMatch();
  const aktiver = match.activePlayerId;
  const ziel = match.getState().entities.find(e => e.entityId !== aktiver).entityId;
  match.consumeEvents(); // Vorspann wegwerfen

  const feuer = damageTypeId('fire');
  match.world.getSystem('damage').applyDamage(match.world, ziel, 12, aktiver, { damageType: feuer });

  const ereignis = match.consumeEvents().find(e => e.type === 'damage');
  assert.ok(ereignis, 'Es muss ein damage-Ereignis geben');
  assert.equal(ereignis.payload.damageType, feuer,
    'Die Kennung fehlt im Ereignis — Resistenzen und Anzeige könnten die Art nicht lesen');
  assert.equal(ereignis.payload.damageTypeName, 'fire',
    'Der Name gehört mit ins Ereignis, sonst müsste jeder Verbraucher die Tabelle kennen');
});

test('Flächenschaden eines Geschosses trägt die Art ebenfalls', () => {
  const match = neuerMatch(777);
  const aktiver = match.activePlayerId;
  const ziel = match.getState().entities.find(e => e.entityId !== aktiver).entityId;

  const zx = match.world.getComponent(ziel, 'Position', 'x');
  const zy = match.world.getComponent(ziel, 'Position', 'y');
  const feuer = damageTypeId('fire');

  // Ein Geschoss direkt über dem Ziel: Es fällt in den Boden und zündet im
  // Radius. Das prüft den Weg projectileSystem → damageSystem (Flächenschaden),
  // der eine eigene Aufrufstelle hat.
  const geschoss = match.world.createEntity();
  match.world.addComponent(geschoss, 'Position', { x: zx, y: zy - 30 });
  match.world.addComponent(geschoss, 'Velocity', { x: 0, y: 0 });
  match.world.addComponent(geschoss, 'Projectile', {
    owner: aktiver,
    weaponId: 0,
    damageType: feuer,
    damage: 14,
    blastRadius: 40,
    knockback: 0,
    drag: 0.995,
    gravityScale: 1,
    windFactor: 1,
    terrainDamage: 0,
    bounces: 0,
    fuseTicks: 0,
    lifetime: 200,
    alive: 1,
    pierce: 0,
    homing: 0,
    letztesZiel: -1,
    pierceSchutz: 0,
  });

  const ereignisse = [];
  // Feste Schrittzahl: Die ersten Takte liefern schon `turn_start` und
  // `round_crates` — ein Abbruch beim ERSTEN Ereignis würde den Einschlag nie
  // erreichen (gemessen: das Geschoss zündet in Takt 12).
  for (let i = 0; i < 60; i += 1) {
    match.step();
    ereignisse.push(...match.consumeEvents());
  }

  const treffer = ereignisse.filter(e => e.type === 'damage' && e.payload.entityId === ziel);
  assert.ok(treffer.length > 0, 'Der Flächenschaden hat das Ziel nicht erreicht');
  for (const e of treffer) {
    assert.equal(e.payload.damageType, feuer,
      `Flächenschaden verliert die Schadensart (${e.payload.damageType} statt ${feuer})`);
    assert.equal(e.payload.damageTypeName, damageTypeName(feuer));
  }
});

test('Sichtlinien-Waffe: auf offener Karte gibt es freie Winkel', () => {
  assert.ok(LOS_WAFFE, 'Vorbedingung: es gibt eine Sichtlinien-Waffe');
  const match = neuerMatch();
  const aktiver = match.activePlayerId;

  const winkel = [0.2, 0.35, 0.5, 0.65, 0.8];
  const frei = winkel.filter(a => match.hasLineOfSight(aktiver, a, 100, LOS_WAFFE));
  assert.ok(frei.length > 0,
    `Auf offener Karte muss mindestens ein Winkel freie Sicht haben `
    + `(geprüft: ${winkel.join(', ')})`);
});

test('Sichtlinien-Waffe: Gestein dazwischen sperrt den Schuss — ohne Munitionsverlust', () => {
  const match = neuerMatch();
  const aktiver = match.activePlayerId;
  match.inventory.register(aktiver, [LOS_WAFFE.id]);
  match.inventory.selectWeapon(aktiver, LOS_WAFFE.id);

  // Einen Winkel mit freier Sicht suchen.
  const winkel = [0.2, 0.35, 0.5, 0.65, 0.8]
    .find(a => match.hasLineOfSight(aktiver, a, 100, LOS_WAFFE));
  assert.ok(winkel !== undefined, 'Vorbedingung: ein freier Winkel existiert');

  // Eine Wand dicht vor den Schützen setzen (senkrechte Säule über die volle Höhe).
  const x0 = match.world.getComponent(aktiver, 'Position', 'x');
  const wandX = Math.round(x0) + 20;
  for (let dx = 0; dx < 4; dx += 1) {
    for (let y = 0; y < match.height; y += 1) {
      match.world.services.terrain.setPixel(wandX + dx, y, true);
    }
  }

  assert.equal(match.hasLineOfSight(aktiver, winkel, 100, LOS_WAFFE), false,
    'Hinter einer Wand darf die Sichtlinie nicht frei sein');

  const munitionVorher = match.inventory.getAmmo(aktiver, LOS_WAFFE.id);
  const schuss = match.fire(aktiver, winkel, 100, LOS_WAFFE.id);

  assert.equal(schuss.ok, false, 'Der Schuss muss abgelehnt werden');
  assert.match((schuss.errors ?? []).join(' '), /Sicht/,
    `Die Begründung muss die Sichtlinie nennen: ${JSON.stringify(schuss.errors)}`);
  assert.equal(match.inventory.getAmmo(aktiver, LOS_WAFFE.id), munitionVorher,
    'Ein abgelehnter Schuss darf keine Munition kosten');
});

test('Eine Granate braucht keine Sichtlinie — sie fliegt über die Wand', () => {
  /*
   * Die Gegenprobe. Ohne sie wäre der Test oben auch dann grün, wenn der Motor
   * JEDEN Schuss hinter einer Wand ablehnte.
   */
  const granate = WEAPONS.find(w => !w.requiresLineOfSight && w.damage > 0 && w.category === 'heavy_ranged');
  assert.ok(granate, 'Vorbedingung: es gibt eine schwere Fernkampfwaffe ohne Sichtzwang');

  const match = neuerMatch();
  const aktiver = match.activePlayerId;
  match.inventory.register(aktiver, [granate.id]);
  match.inventory.selectWeapon(aktiver, granate.id);

  const x0 = match.world.getComponent(aktiver, 'Position', 'x');
  const wandX = Math.round(x0) + 20;
  for (let dx = 0; dx < 4; dx += 1) {
    for (let y = 0; y < match.height; y += 1) {
      match.world.services.terrain.setPixel(wandX + dx, y, true);
    }
  }

  const schuss = match.fire(aktiver, 0.8, 100, granate.id);
  assert.equal(schuss.ok, true,
    `"${granate.displayName}" muss trotz Wand abfeuerbar sein: ${schuss.errors?.join(', ')}`);
});

test('Selbstwirkungen (Heilung) brauchen keine Sichtlinie', () => {
  const match = neuerMatch();
  const aktiver = match.activePlayerId;
  assert.ok(HEIL_WAFFE, 'Vorbedingung: es gibt eine Heilwaffe');

  match.inventory.register(aktiver, [HEIL_WAFFE.id]);
  match.inventory.selectWeapon(aktiver, HEIL_WAFFE.id);
  match.world.setComponent(aktiver, 'Health', 'current', 20);

  // Eine Wand direkt vor den Schützen: Ein Verband braucht trotzdem keine Sicht.
  const x0 = match.world.getComponent(aktiver, 'Position', 'x');
  for (let dx = 0; dx < 4; dx += 1) {
    for (let y = 0; y < match.height; y += 1) {
      match.world.services.terrain.setPixel(Math.round(x0) + 20 + dx, y, true);
    }
  }

  const ergebnis = match.fire(aktiver, 0, 50, HEIL_WAFFE.id);
  assert.equal(ergebnis.ok, true,
    `Die Heilung darf nicht an der Sichtlinie scheitern: ${ergebnis.errors?.join(', ')}`);
  assert.ok(match.world.getComponent(aktiver, 'Health', 'current') > 20, 'Es muss geheilt werden');
});
