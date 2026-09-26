/**
 * Tests: `fire()` ist ein reiner Delegator nach `engine/shooting.js`.
 *
 * ## Der Auftrag, den diese Datei festhält (W1-4b)
 *
 * `fire()` war 211 Zeilen lang und griff 20-mal in private Felder — der heiße
 * Stein der Schießerei. Der Rumpf liegt jetzt als reine Funktion in
 * `engine/shooting.js`; der Match baut eine **Quelle** (wie `stateSnapshot.js`
 * bei `getState()`, W1-4a) und reicht sie hinein.
 *
 * Geprüft werden vier Zusagen:
 *
 *   1. **Kein `this`** in `shooting.js` — sonst wäre die Funktion keine reine
 *      Funktion, sondern eine verkappte Methode.
 *   2. **Der Delegator** — `fire()` ruft `fire(quelle, …)` und nichts sonst.
 *   3. **Die Schnittstelle** — der Schieß-Ablauf läuft über die Quelle, nicht
 *      über `this`. Ein Aufruf mit einer schlichten Attrappe muss genügen.
 *   4. **Die Größe** — `match.js` bleibt unter 3200 Zeilen (der Beleg, dass der
 *      Rumpf wirklich draußen ist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MatchController } from '../src/engine/match.js';
import { fire as shootingFire } from '../src/engine/shooting.js';
import { COMPONENT_SIGNATURES } from '../src/engine/ecs/componentStore.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(HIER, '..');

function quelle(datei) {
  return readFileSync(resolve(WURZEL, datei), 'utf8');
}

/**
 * Entfernt Kommentare — ein Strukturtest prüft den CODE, nicht die Doku.
 * (Dieselbe Haltung wie in `tests/reichweite-konsistenz.test.js`.)
 */
function ohneKommentare(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('shooting.js enthält kein `this`', () => {
  /*
   * DIE Kernzusage der Auslagerung. Eine Funktion, die über `this` an eine
   * Instanz gebunden ist, ist keine reine Funktion — sie wäre nur eine
   * Methode an einem anderen Ort, und der Test in einem anderen Modul dürfte
   * sie nicht ohne Weiteres aufrufen.
   */
  const code = ohneKommentare(quelle('src/engine/shooting.js'));
  const treffer = code.match(/\bthis\b/g) ?? [];

  assert.deepEqual(treffer, [],
    `shooting.js greift ${treffer.length}-mal auf \`this\` zu — der Ablauf muss `
    + 'über die Quelle (Parameter) laufen, nicht über die Instanz');
});

test('match.js bleibt unter 3200 Zeilen', () => {
  /*
   * Der Beleg, dass der Rumpf WIRKLICH draußen ist. Eine Auslagerung, die
   * nichts entfernt, wäre ein Umzug ohne Umzug.
   */
  const zeilen = quelle('src/engine/match.js').split('\n').length;
  assert.ok(zeilen < 3200,
    `match.js hat ${zeilen} Zeilen — erwartet werden unter 3200`);
});

test('fire() ist ein reiner Delegator', () => {
  /*
   * Strukturtest. Das Validierungs-Gerüst (Status, Kommando, Nachladezeit,
   * Sichtlinie) steht in `shooting.js`; hier bleibt nur der Aufruf.
   *
   * Gemessen wird an der METHODE, nicht an der ganzen Datei: Der Rumpf
   * zwischen `fire(playerId, …)` und der schließenden Klammer darf nur den
   * einen Aufruf enthalten.
   */
  const code = ohneKommentare(quelle('src/engine/match.js'));
  const rumpf = /fire\(playerId, angle, power, weaponId = null\)\s*\{([\s\S]*?)\n {2}}/.exec(code);

  assert.ok(rumpf, 'die Methode fire(playerId, …) wurde nicht gefunden');
  const inhalt = rumpf[1].trim();

  assert.equal(inhalt, 'return fire(this.#schussQuelle(), playerId, angle, power, weaponId);',
    `fire() ist kein reiner Delegator mehr. Rumpf:\n${inhalt}`);

  // Und die Quelle trägt die Schieß-Primitive, die im Match bleiben.
  assert.match(code, /#schussQuelle\(\)/,
    'die Schnittstelle #schussQuelle() fehlt');
});

test('Der Schieß-Ablauf läuft über eine schlichte Quelle, nicht über die Instanz', () => {
  /*
   * Der schärfste Beleg für die Entkopplung: `shootingFire` wird mit einem
   * LITERAL aufgerufen — kein MatchController, kein `this`. Die Funktion darf
   * nur die Felder der Quelle anfassen.
   *
   * Gewählt ist der erste Ablehnungsweg (Status ≠ playing): Er liegt VOR jedem
   * Zugriff auf Welt oder Spieler, deshalb genügt eine minimale Attrappe.
   */
  const attrappe = {
    status: 'lobby',
    world: { tickCount: 0 },
    activePlayerId: 1,
    turnOrder: [1],
    isPlayerAlive: () => true,
  };

  const ergebnis = shootingFire(attrappe, 1, 0.5, 50);
  assert.equal(ergebnis.ok, false);
  assert.deepEqual(ergebnis.errors, ['Match läuft nicht']);

  // Und der zweite Weg: das Kommando ist gültig, aber der Spieler lebt nicht
  // mehr — auch das muss die Attrappe allein entscheiden können.
  const zweite = {
    ...attrappe,
    status: 'playing',
    activePlayerId: 1,
    turnOrder: [1],
    isPlayerAlive: () => false,
  };
  const abgelehnt = shootingFire(zweite, 1, 0.5, 50);
  assert.equal(abgelehnt.ok, false);
  assert.deepEqual(abgelehnt.errors, ['Spieler ist nicht mehr aktiv']);
});

test('Der Match schießt weiterhin über die delegierte Funktion', () => {
  /*
   * Die Gegenprobe zur Struktur: Am echten Motor muss herauskommen, was
   * vorher herauskam — ein Geschoss, ein `projectile_spawn`, ein Schuss je Zug.
   */
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills',
    turnDurationMs: 1_000_000,
  });
  match.start();
  match.consumeEvents();

  const spieler = match.activePlayerId;
  const schuss = match.fire(spieler, Math.PI / 4, 55);

  assert.equal(schuss.ok, true, `Schuss abgelehnt: ${schuss.errors?.join(', ')}`);
  assert.ok(Number.isInteger(schuss.projectileId), 'es muss ein Geschoss entstanden sein');

  const ereignisse = match.consumeEvents().map(e => e.type);
  assert.ok(ereignisse.includes('shot'), `\`shot\` fehlt: ${ereignisse.join(', ')}`);
  assert.ok(ereignisse.includes('projectile_spawn'), `\`projectile_spawn\` fehlt: ${ereignisse.join(', ')}`);

  const geschosse = match.world
    .getEntitiesBySignature(COMPONENT_SIGNATURES.PROJECTILE)
    .filter(id => match.world.isActive(id));
  assert.equal(geschosse.length, 1, 'genau ein Geschoss muss unterwegs sein');

  // Ein Schuss je Zug — die Prüfung lebt jetzt in shooting.js.
  const zweiter = match.fire(spieler, Math.PI / 4, 55);
  assert.equal(zweiter.ok, false);
  assert.deepEqual(zweiter.errors, ['In diesem Zug wurde bereits geschossen']);
});

test('Die ausgelagerten Selbstwirkungen erreichen den Schützen', () => {
  /*
   * `applySelfEffect` (Heilung, Schild, Munition, …) ist mit dem Schieß-Ablauf
   * nach `shooting.js` gewandert. Geprüft wird, dass der Weg über die Quelle
   * unverändert wirkt — und zwar an einer ECHTEN Waffe aus dem Katalog, nicht
   * an einer geratenen Kennung.
   */
  const match = new MatchController({
    seed: 4711, teams: 2, playersPerTeam: 1, preset: 'hills',
    turnDurationMs: 1_000_000,
  });
  match.start();
  match.consumeEvents();

  const spieler = match.activePlayerId;

  // Eine Waffe suchen, deren Wirkung auf den Schützen selbst geht.
  const selbstwaffe = WEAPONS.find(w => {
    const effect = buildEffect(w);
    return effect && SELF_TARGET_KINDS.has(effect.kind);
  });
  assert.ok(selbstwaffe, 'es muss mindestens eine Selbstwirkungs-Waffe geben');

  match.inventory.grantWeapon(spieler, selbstwaffe.id);
  // Ammo sicherstellen, damit der Schuss nicht an der Munition scheitert.
  match.inventory.grantAmmo(spieler, selbstwaffe.id, 5);
  const vorher = match.world.getComponent(spieler, 'Health', 'current');
  match.world.setComponent(spieler, 'Health', 'current', Math.max(1, vorher - 60));

  const ergebnis = match.fire(spieler, Math.PI / 4, 40, selbstwaffe.id);

  assert.equal(ergebnis.ok, true,
    `Selbstwirkungs-Schuss abgelehnt: ${ergebnis.errors?.join(', ')}`);
  assert.ok(ergebnis.special, 'die Selbstwirkung muss gemeldet werden');
  assert.equal(ergebnis.projectileId, null, 'eine Selbstwirkung erzeugt kein Geschoss');

  const ereignisse = match.consumeEvents().map(e => e.type);
  assert.ok(ereignisse.includes('special_effect'),
    `\`special_effect\` fehlt: ${ereignisse.join(', ')}`);
});