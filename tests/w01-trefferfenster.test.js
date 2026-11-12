/**
 * Tests: W01 — Trefferfenster und Schadensradius sind getrennt.
 *
 * ## Befund (docs/waffen-audit-2026-11-08, W01)
 *
 * `shooting.js` setzte bei jeder Nicht-Nahkampfwaffe ohne Katalogradius
 * `blastRadius: weapon.blastRadius || 24`. Der Wert reiste als echtes
 * Projektilfeld bis `explosion.js` und verteilte dort Flächenschaden mit
 * Abfall; auch der Krater (0,6 × Radius) entstand daraus. Für 33 tatsächlich
 * erzeugte Projektile stand im Katalog Radius 0, im Motor aber 24 — die
 * Anzeige sagte „kein Flächenschaden", der Motor rechnete das Gegenteil.
 *
 * ## Was hier belegt wird
 *
 *  1. Die 33 betroffenen IDs spawnen mit `blastRadius` 0 und einem getrennten
 *     Trefferfenster (`trefferRadius` 24). Nahkampf-/Wurfwaffen: beides 0.
 *  2. Maschinenpistole `pa_040` trifft direkt, richtet aber an einem 15 px
 *     entfernten Nebenmann KEINEN Schaden an (vorher: Flächenschaden).
 *  3. Eine echte Flächenwaffe (`blastRadius` > 0) wirkt weiter im Umkreis.
 *  4. Eine Wurfwaffe trifft sich nicht selbst und trägt kein Trefferfenster.
 *  5. Waffenfassung 15 (und älter) spawnt unverändert 24 — die Mechanik ist
 *     versioniert, keine stille Balanceänderung an alten Aufzeichnungen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { getWaffe, WAFFEN_KLASSE, WAFFEN_STANDARD, WAFFEN_TEMPO, WAFFEN_TREFFER } from '../src/shared/config/waffen-fassung.js';

/** Die 33 im Audit W01 belegten IDs (Katalogradius 0, im Motor aber 24). */
const BETROFFENE_IDS = Object.freeze([
  'pa_022', 'pa_023', 'pa_024', 'pa_025', 'pa_026', 'pa_027', 'pa_031', 'pa_033',
  'pa_034', 'pa_036', 'pa_040', 'pa_042', 'pa_043', 'pa_045', 'pa_047', 'pa_049',
  'pa_050', 'pa_051', 'pa_054', 'pa_055', 'pa_056', 'pa_057', 'pa_058', 'pa_059',
  'pa_060', 'pa_062', 'pa_063', 'pa_068', 'pa_078', 'pa_082', 'pa_104', 'pa_140',
  'pa_142',
]);

/**
 * Flache Karte mit vier Figuren (2 gegen 2): Schütze, Ziel im anderen Team und
 * ein Nebenmann im Zielteam. Nur so lässt sich Flächenschaden an Dritten von
 * einem reinen Direkttreffer unterscheiden. Die Karte ist flach (`open`), damit
 * ein Hang nicht als zweite Ursache für einen Treffer durchgeht.
 */
function neuerMatch(fassung = WAFFEN_STANDARD) {
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 2, preset: 'open', turnDurationMs: 1_000_000,
    waffen: fassung,
  });
  match.start();
  match.consumeEvents();
  const schuetze = match.activePlayerId;
  const ziel = match.players.find(p => p.entityId !== schuetze && p.teamId !== match.players.find(q => q.entityId === schuetze).teamId).entityId;
  const nebenmann = match.players.find(p => p.entityId !== schuetze && p.entityId !== ziel).entityId;
  return { match, schuetze, ziel, nebenmann, boden: match.surfaceYAt(200) };
}

/** Setzt eine Figur auf die flache Messlinie (Fußpunkt). */
function setze(match, entityId, x, y) {
  match.world.setComponent(entityId, 'Position', 'x', x);
  match.world.setComponent(entityId, 'Position', 'y', y);
}

/** Volle Gesundheit, damit ein Falloff-Treffer nicht als Rundungsrest verschwindet. */
function vollesLeben(match, entityId, wert = 1000) {
  match.world.setComponent(entityId, 'Health', 'max', wert);
  match.world.setComponent(entityId, 'Health', 'current', wert);
  return wert;
}

/** Feuert und lässt das Match laufen, bis kein Geschoss mehr fliegt. */
function schiessen(match, schuetze, weaponId, winkel = 0, kraft = 100) {
  match.inventory.register(schuetze, [weaponId]);
  match.inventory.selectWeapon(schuetze, weaponId);
  const schuss = match.fire(schuetze, winkel, kraft, weaponId);
  assert.equal(schuss.ok, true, `${weaponId}: Schuss abgelehnt: ${schuss.errors?.join(', ')}`);
  const ereignisse = [];
  for (let i = 0; i < 600 && match.activeProjectileCount > 0; i += 1) {
    match.step();
    ereignisse.push(...match.consumeEvents());
  }
  ereignisse.push(...match.consumeEvents());
  return { schuss, ereignisse };
}

test('Waffenfassung 21 ist Standard; 20 bis 19 bis 15 bleiben gültig und bitgleich', () => {
  assert.equal(WAFFEN_TREFFER, 16);
  assert.equal(WAFFEN_KLASSE, 17);
  assert.equal(WAFFEN_STANDARD, 22); // Fassung 21 (Entscheidungen 2026-11-11)
  assert.equal(WAFFEN_TEMPO, 15);
});

test('Die 33 betroffenen IDs spawnen mit Radius 0 und getrenntem Trefferfenster', () => {
  assert.equal(BETROFFENE_IDS.length, 33);
  const abweichungen = [];

  for (const id of BETROFFENE_IDS) {
    // Handgranate: seit Fassung 21 mit echtem Radius (Entscheidung 13); ihr Altverhalten belegt der Fassung-20-Test.
    if (id === 'pa_047') continue;
    // Vorbedingung: Der Katalog weist für diese Waffe keinen Flächenradius aus.
    const waffe = getWaffe(id, WAFFEN_STANDARD);
    if (waffe.blastRadius !== 0) abweichungen.push(`${id}: Katalogradius ${waffe.blastRadius}`);

    const { match, schuetze } = neuerMatch();
    match.inventory.register(schuetze, [id]);
    match.inventory.selectWeapon(schuetze, id);
    const schuss = match.fire(schuetze, 1.0, 100, id);
    if (!schuss.ok) {
      abweichungen.push(`${id}: Schuss abgelehnt (${schuss.errors?.join(', ')})`);
      continue;
    }
    const blast = match.world.getComponent(schuss.projectileId, 'Projectile', 'blastRadius');
    const treffer = match.world.getComponent(schuss.projectileId, 'Projectile', 'trefferRadius');
    if (blast !== 0) abweichungen.push(`${id}: blastRadius ${blast} statt 0`);
    // Alle 33 sind Nicht-Nahkampf-Projektile ohne Katalogradius.
    if (treffer !== 24) abweichungen.push(`${id}: trefferRadius ${treffer} statt 24`);
  }

  assert.deepEqual(abweichungen, [], abweichungen.join('\n'));
});

test('Maschinenpistole trifft direkt, aber ohne Flächenschaden am Nebenmann', () => {
  const { match, schuetze, ziel, nebenmann, boden } = neuerMatch();
  setze(match, schuetze, 200, boden - 12);
  setze(match, ziel, 300, boden - 12);
  setze(match, nebenmann, 315, boden - 12);
  const zielVorher = vollesLeben(match, ziel);
  const nebenVorher = vollesLeben(match, nebenmann);

  match.inventory.register(schuetze, ['pa_040']);
  match.inventory.selectWeapon(schuetze, 'pa_040');
  const schuss = match.fire(schuetze, 0, 100, 'pa_040');
  assert.equal(schuss.ok, true, schuss.errors?.join(', '));
  assert.equal(match.world.getComponent(schuss.projectileId, 'Projectile', 'blastRadius'), 0);

  const ereignisse = [];
  for (let i = 0; i < 600 && match.activeProjectileCount > 0; i += 1) {
    match.step();
    ereignisse.push(...match.consumeEvents());
  }
  ereignisse.push(...match.consumeEvents());

  const zielNachher = match.world.getComponent(ziel, 'Health', 'current');
  const nebenNachher = match.world.getComponent(nebenmann, 'Health', 'current');
  assert.ok(zielNachher < zielVorher,
    `Maschinenpistole richtete keinen Direktschaden an (${zielVorher} → ${zielNachher})`);
  assert.equal(nebenNachher, nebenVorher,
    `Nebenmann 15 px neben dem Einschlag verlor ${nebenVorher - nebenNachher} Leben — `
    + 'die Maschinenpistole hat keinen Flächenradius');

  const explosionen = ereignisse.filter(e => e.type === 'explosion');
  assert.ok(explosionen.length >= 1, 'kein Einschlag gemeldet');
  for (const explosion of explosionen) {
    assert.equal(explosion.payload.radius, 0,
      `Maschinenpistole meldet Explosionsradius ${explosion.payload.radius}`);
  }
});

test('Das Trefferfenster vergrößert die Kollision: knapper Vorbeiflug trifft', () => {
  const { match, schuetze, ziel, nebenmann, boden } = neuerMatch();
  setze(match, schuetze, 200, boden - 12);
  // 18 px über der Schusslinie: außerhalb des 14×20-Körpers, innerhalb des
  // 24-px-Trefferfensters. Vor W01 hätte nur der Flächenschaden getroffen.
  setze(match, ziel, 300, boden - 30);
  setze(match, nebenmann, 260, boden + 400); // weit weg, stört die Messung nicht
  const vorher = vollesLeben(match, ziel);

  const { schuss } = schiessen(match, schuetze, 'pa_040');
  assert.ok(schuss.projectileId !== null, 'kein Projektil erzeugt');
  const nachher = match.world.getComponent(ziel, 'Health', 'current');
  assert.ok(nachher < vorher,
    `Vorbeiflug in 18 px wurde nicht als Treffer gewertet (${vorher} → ${nachher})`);
});

test('Eine echte Flächenwaffe wirkt weiter im Umkreis', () => {
  const { match, schuetze, ziel, nebenmann, boden } = neuerMatch();
  const waffe = getWaffe('pa_037', WAFFEN_STANDARD); // Raketenwerfer, Radius 46
  assert.ok(waffe.blastRadius > 0);

  setze(match, schuetze, 200, boden - 12);
  setze(match, ziel, 300, boden - 12);
  setze(match, nebenmann, 315, boden - 12);
  vollesLeben(match, ziel);
  const nebenVorher = vollesLeben(match, nebenmann);

  match.inventory.register(schuetze, ['pa_037']);
  match.inventory.selectWeapon(schuetze, 'pa_037');
  const schuss = match.fire(schuetze, 0, 100, 'pa_037');
  assert.equal(schuss.ok, true, schuss.errors?.join(', '));
  // Echte Flächenwaffe: Katalogradius reist unverändert, kein Trefferfenster.
  assert.equal(match.world.getComponent(schuss.projectileId, 'Projectile', 'blastRadius'), waffe.blastRadius);
  assert.equal(match.world.getComponent(schuss.projectileId, 'Projectile', 'trefferRadius'), 0);

  for (let i = 0; i < 600 && match.activeProjectileCount > 0; i += 1) {
    match.step();
    match.consumeEvents();
  }
  match.consumeEvents();
  const nebenNachher = match.world.getComponent(nebenmann, 'Health', 'current');
  assert.ok(nebenNachher < nebenVorher,
    `Flächenwaffe traf den Nebenmann 15 px neben dem Einschlag nicht `
    + `(${nebenVorher} → ${nebenNachher})`);
});

test('Eine Wurfwaffe trifft sich nicht selbst und hat kein Trefferfenster', () => {
  const { match, schuetze, boden } = neuerMatch();
  setze(match, schuetze, 200, boden - 12);
  const vorher = match.world.getComponent(schuetze, 'Health', 'current');

  match.inventory.register(schuetze, ['pa_001']);
  match.inventory.selectWeapon(schuetze, 'pa_001');
  const schuss = match.fire(schuetze, Math.PI / 4, 100, 'pa_001');
  assert.equal(schuss.ok, true, schuss.errors?.join(', '));
  assert.equal(match.world.getComponent(schuss.projectileId, 'Projectile', 'blastRadius'), 0);
  assert.equal(match.world.getComponent(schuss.projectileId, 'Projectile', 'trefferRadius'), 0);

  for (let i = 0; i < 600 && match.activeProjectileCount > 0; i += 1) {
    match.step();
    match.consumeEvents();
  }
  match.consumeEvents();
  const nachher = match.world.getComponent(schuetze, 'Health', 'current');
  assert.equal(nachher, vorher,
    `Baseballschläger verletzte den Werfer (${vorher} → ${nachher})`);
});

test('Fassung 15 spawnt unverändert 24 — die Änderung ist versioniert', () => {
  const { match, schuetze } = neuerMatch(WAFFEN_TEMPO);
  match.inventory.register(schuetze, ['pa_040']);
  match.inventory.selectWeapon(schuetze, 'pa_040');
  const schuss = match.fire(schuetze, 1.0, 100, 'pa_040');
  assert.equal(schuss.ok, true, schuss.errors?.join(', '));
  assert.equal(match.world.getComponent(schuss.projectileId, 'Projectile', 'blastRadius'), 24,
    'Fassung 15 muss bitgleich den alten Spawnwert 24 tragen');
  assert.equal(match.world.getComponent(schuss.projectileId, 'Projectile', 'trefferRadius'), 0);
});
