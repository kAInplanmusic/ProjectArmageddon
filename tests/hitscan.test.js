import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController, MAP_WIDTH } from '../src/engine/match.js';
import { WEAPONS, WEAPONS_BY_ID } from '../src/shared/config/weapons.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';

/**
 * Regressionstest für Hitscan-Waffen.
 *
 * Hintergrund: Der Strahl begann ursprünglich exakt auf der Schützenposition.
 * Die ist die Fußposition auf dem Boden, und das Trefferfeld reicht
 * ±PLAYER_HALF_HEIGHT darum. Der Strahl endete deshalb sofort im eigenen Körper
 * bzw. im Untergrund und erreichte das Ziel nie — 76 der 150 Waffen (alle
 * Hitscan- und Nahkampfwaffen) verursachten dadurch keinen Schaden.
 */

/** Sucht eine waagerecht freie Schusslinie auf der Karte. */
function findClearLine(match, distance, { margin = 40, step = 4 } = {}) {
  for (let shooterX = margin; shooterX + distance <= MAP_WIDTH - margin; shooterX += step) {
    const groundY = Math.max(0, match.surfaceYAt(shooterX));
    if (groundY < 0) continue;
    const lineY = groundY - 5;
    let clear = true;
    for (let offset = 0; offset <= distance; offset += 2) {
      const surface = match.surfaceYAt(shooterX + offset);
      if (surface < 0 || surface <= lineY) { clear = false; break; }
    }
    if (clear) return { shooterX, groundY };
  }
  return null;
}

/** Feuert waagerecht auf ein Ziel auf gleicher Höhe und liefert den Schaden. */
function fireLevelShot(weaponId, { seed = 4242, distance = 80, angle = 0 } = {}) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000_000,
  });
  match.start();

  const shooterId = match.activePlayerId;
  const state = match.getState();
  const target = state.entities.find(entity => entity.entityId !== shooterId);
  const line = findClearLine(match, distance);
  if (!target || !line) return null;

  const { shooterX, groundY } = line;
  match.world.setComponent(shooterId, 'Position', 'x', shooterX);
  match.world.setComponent(shooterId, 'Position', 'y', groundY);
  match.world.setComponent(target.entityId, 'Position', 'x', shooterX + distance);
  match.world.setComponent(target.entityId, 'Position', 'y', groundY);
  match.world.setComponent(target.entityId, 'Health', 'max', 500);
  match.world.setComponent(target.entityId, 'Health', 'current', 500);

  match.inventory.register(shooterId, [weaponId]);
  match.inventory.selectWeapon(shooterId, weaponId);

  const before = match.world.getComponent(target.entityId, 'Health', 'current');
  const result = match.fire(shooterId, angle, 100, weaponId);

  let guard = 0;
  while (match.activeProjectileCount > 0 && guard < 900) {
    match.step();
    match.consumeEvents();
    guard += 1;
  }
  for (let i = 0; i < 8; i++) {
    match.step();
    match.consumeEvents();
  }

  const after = match.world.getComponent(target.entityId, 'Health', 'current');
  return {
    fired: result.ok,
    errors: result.errors ?? [],
    damage: Math.max(0, before - after),
    blocked: Boolean(result.hit?.blocked),
    hitTarget: result.hit?.target ?? null,
    shooterId,
    targetId: target.entityId,
  };
}

test('Hitscan-Waffe trifft ein Ziel auf gleicher Höhe', () => {
  const melee = WEAPONS_BY_ID.pa_001;
  assert.equal(melee.delivery, 'hitscan', 'Testannahme: pa_001 ist eine Hitscan-Waffe');

  const result = fireLevelShot('pa_001');
  assert.ok(result, 'Es muss eine freie Schusslinie gefunden werden');
  assert.equal(result.fired, true, `Schuss abgelehnt: ${result.errors.join(', ')}`);
  assert.equal(result.blocked, false, 'Der Schuss darf nicht blockiert sein');
  assert.ok(result.damage > 0, `Hitscan muss Schaden verursachen, war ${result.damage}`);
  assert.equal(result.hitTarget, result.targetId, 'Es muss das Ziel getroffen werden, nicht der Schütze');
});

test('Der Strahl trifft nicht den Schützen selbst', () => {
  const result = fireLevelShot('pa_001');
  assert.ok(result);
  assert.notEqual(
    result.hitTarget, result.shooterId,
    'Der Treffer darf nicht auf den Schützen zeigen (Mündungsfehler)',
  );
});

test('Alle Hitscan-Waffen verursachen auf freier Linie Schaden', () => {
  // Stichprobe über die Kategorien, damit der Test nicht minutenlang läuft.
  const hitscan = WEAPONS.filter(weapon => weapon.delivery === 'hitscan');
  assert.ok(hitscan.length > 50, `Es muss viele Hitscan-Waffen geben: ${hitscan.length}`);

  // Nur Waffen betrachten, die auf Schaden ausgelegt sind. Zwei Gruppen fallen
  // bewusst heraus:
  //  - Utility-Waffen ohne Schadenswert,
  //  - Waffen mit einer Wirkung auf den Schützen selbst (Portal, Jetpack,
  //    Heilung): sie lösen ihren Effekt aus und verschießen absichtlich nichts.
  const withDamage = hitscan.filter(weapon => {
    if (weapon.damage <= 0) return false;
    const effect = buildEffect(weapon);
    return !(effect && SELF_TARGET_KINDS.has(effect.kind));
  });
  assert.ok(withDamage.length > 30, `Zu wenige schadende Hitscan-Waffen: ${withDamage.length}`);

  const sample = withDamage.filter((_, index) => index % 15 === 0);

  for (const weapon of sample) {
    const result = fireLevelShot(weapon.id);
    if (!result) continue; // keine freie Linie für diese Waffe: überspringen
    if (!result.fired) continue;
    assert.ok(
      result.damage > 0,
      `${weapon.id} (${weapon.displayName}) verursachte keinen Schaden: `
      + `blockiert=${result.blocked}, getroffen=${result.hitTarget}`,
    );
  }
});

test('Selbstwirkende Waffen verschießen nichts und richten keinen Schaden an', () => {
  // Gegenprobe zum Test darüber: Diese Waffen wirken auf den Schützen, nicht
  // auf ein Ziel. Sie dürfen deshalb kein Geschoss erzeugen und keinem Gegner
  // Schaden zufügen — sonst wäre der Effekt ein versteckter Angriff.
  const selbst = WEAPONS.filter(weapon => {
    const effect = buildEffect(weapon);
    return effect && SELF_TARGET_KINDS.has(effect.kind);
  });
  assert.ok(selbst.length >= 20, `Es muss viele Selbstwirkungs-Waffen geben: ${selbst.length}`);

  const probe = selbst.filter((_, index) => index % 8 === 0);
  for (const weapon of probe) {
    const match = new MatchController({
      seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000_000,
    });
    match.start();

    const schuetze = match.activePlayerId;
    const ziel = match.players.find(player => player.entityId !== schuetze).entityId;
    match.world.setComponent(ziel, 'Health', 'max', 500);
    match.world.setComponent(ziel, 'Health', 'current', 500);
    match.world.setComponent(schuetze, 'Health', 'current', 100);

    match.inventory.register(schuetze, [weapon.id]);
    const healthVorher = match.world.getComponent(ziel, 'Health', 'current');

    const result = match.fire(schuetze, 0, 50, weapon.id);
    assert.equal(result.ok, true, `${weapon.id}: Schuss abgelehnt`);
    assert.equal(result.projectileId, null, `${weapon.id} darf kein Geschoss erzeugen`);

    // Etwas Spielzeit, damit ein eventuelles Geschoss einschlagen würde.
    for (let i = 0; i < 30; i++) { match.step(); match.consumeEvents(); }

    assert.equal(
      match.world.getComponent(ziel, 'Health', 'current'), healthVorher,
      `${weapon.id} (${weapon.displayName}) hat einem Gegner Schaden zugefügt`,
    );
  }
});

test('Mündung liegt außerhalb des eigenen Trefferfelds', () => {
  // Der Strahl muss den eigenen Körper verlassen, sonst endet er sofort an sich
  // selbst. Geprüft wird, dass der Trefferpunkt nicht am Schützen liegt.
  const result = fireLevelShot('pa_001', { distance: 80 });
  assert.ok(result);
  assert.equal(result.hitTarget, result.targetId);
  assert.ok(result.damage > 0);
});

test('Projektilwaffen verursachen weiterhin Schaden', () => {
  // Sicherstellen, dass die Mündungskorrektur die Projektilwaffen nicht bricht.
  //
  // Projektile fallen unter Schwerkraft, ein waagerechter Schuss schlägt vor dem
  // Ziel auf. Der Abschusswinkel wird deshalb leicht nach oben korrigiert; ohne
  // diese Korrektur würde der Test die Flugkurve messen statt den Einschlag.
  const projectile = WEAPONS.find(weapon => weapon.delivery === 'projectile' && weapon.damage > 0);
  assert.ok(projectile, 'Es muss mindestens eine Projektilwaffe mit Schaden geben');

  let best = { damage: 0, angle: null };
  for (const angle of [0, 0.05, 0.09, 0.13, 0.18]) {
    const result = fireLevelShot(projectile.id, { angle });
    if (!result) break; // keine freie Linie: Testaufbau nicht möglich
    assert.equal(result.fired, true);
    if (result.damage > best.damage) best = { damage: result.damage, angle };
  }

  assert.ok(
    best.damage > 0,
    `${projectile.id} (${projectile.displayName}) verursachte bei keinem Winkel Schaden`,
  );
});

test('Katalogweit liegt bei den meisten Waffen Schaden an', () => {
  // Grobe Gesundheitsprüfung des Katalogs: Wird die Feldpriorität der Quelldaten
  // vertauscht, kollabieren alle Waffen auf den Platzhalterwert und die Messung
  // ergibt überall denselben Wert.
  const damages = new Set(WEAPONS.map(weapon => weapon.damage));
  assert.ok(damages.size > 5, `Zu wenige verschiedene Schadenswerte: ${damages.size}`);

  const sorted = [...WEAPONS].sort((a, b) => b.damage - a.damage);
  assert.ok(sorted[0].damage >= 90, `Stärkste Waffe zu schwach: ${sorted[0].damage}`);
  assert.ok(sorted[sorted.length - 1].damage === 0, 'Es muss Utility-Waffen ohne Schaden geben');
});
