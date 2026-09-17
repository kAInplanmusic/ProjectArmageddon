/**
 * Tests: Die Raritäts-Gewichte haben EINE Quelle.
 *
 * ## Der Befund
 *
 * Ein Code-Audit fand die Gewichte **zweimal**:
 *
 *   1. `RARITY_WEIGHTS` in `engine/systems/lootSystem.js:29`
 *   2. als Default-Parameter in der **generierten** `weapons.js`:
 *      `pickWeaponForRarity(rng, weights = { common: 55, uncommon: 25, … })`
 *
 * Der Agent maß: Beide Aufrufe liefern heute dasselbe (`pa_096` bei Seed 7) —
 * „morgen nicht". Genau das ist das Problem: Eine Änderung an der Konstante
 * hätte Aufrufer ohne Argument **nicht** erreicht, und niemand hätte es bemerkt.
 *
 * ## Die Behebung
 *
 * Der Default ist im **Generator** entfernt (`build-weapon-catalog.mjs`), und
 * die Funktion wirft jetzt, wenn keine Gewichte übergeben werden. Damit kann
 * kein Aufrufer mehr stillschweigend auf einer zweiten Zahl sitzen.
 *
 * ## Was hier geprüft wird
 *
 * Dass der Default nicht zurückkehrt — und dass die eine Quelle tatsächlich
 * benutzt wird.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RARITY_WEIGHTS } from '../src/engine/systems/lootSystem.js';
import { pickWeaponForRarity } from '../src/shared/config/weapons.js';
import { SeededRandom } from '../src/shared/prng.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

test('`pickWeaponForRarity` hat keinen Default-Parameter mehr', () => {
  /*
   * Ein Abwesenheitstest mit Grund: Der Default war die zweite Quelle. Käme er
   * zurück, wäre die Doppelregel wieder da.
   *
   * Geprüft wird über das VERHALTEN: Ohne Gewichte muss die Funktion werfen.
   * Ein Test am Quelltext wäre hier schwächer, weil er die Signatur prüft statt
   * die Wirkung.
   */
  assert.throws(() => pickWeaponForRarity(new SeededRandom(5)),
    (fehler) => fehler instanceof TypeError && /Gewichte/.test(fehler.message),
    'Ohne Gewichte muss ein TypeError kommen — sonst gibt es wieder einen '
    + 'stillen Default');
});

test('Die Fehlermeldung nennt die eine Quelle', () => {
  // Damit der nächste Leser sofort weiß, wo die Gewichte herkommen.
  try {
    pickWeaponForRarity(new SeededRandom(5));
    assert.fail('die Funktion hätte werfen müssen');
  } catch (fehler) {
    assert.match(fehler.message, /RARITY_WEIGHTS/,
      'Die Meldung muss die eine Quelle nennen (RARITY_WEIGHTS)');
    assert.match(fehler.message, /lootSystem/,
      'und die Datei, in der sie steht');
  }
});

test('Mit Gewichten arbeitet die Funktion', () => {
  // Die Gegenprobe: Der Fehler oben darf nicht jede Nutzung verhindern.
  const waffe = pickWeaponForRarity(new SeededRandom(7), RARITY_WEIGHTS);
  assert.ok(waffe, 'die Funktion muss eine Waffe liefern');
  assert.equal(typeof waffe.id, 'string', 'und zwar ein Waffenobjekt mit ID');
});

test('Derselbe Seed ergibt mit denselben Gewichten dasselbe Ergebnis', () => {
  // Die Determinismus-Zusage: Die Wahl darf nicht von der Aufrufstelle abhängen.
  const a = pickWeaponForRarity(new SeededRandom(7), RARITY_WEIGHTS);
  const b = pickWeaponForRarity(new SeededRandom(7), RARITY_WEIGHTS);
  assert.equal(a.id, b.id, 'gleicher Seed, gleiche Gewichte, gleiche Waffe');
});

test('Der Generator führt die Gewichte nicht mehr als Default', () => {
  /*
   * Der Fundort. `weapons.js` ist generiert — die Vorlage steht in
   * `build-weapon-catalog.mjs`. Geprüft wird die Vorlage, weil eine Änderung an
   * der generierten Datei beim nächsten `npm run weapons:build` verschwände.
   */
  const generator = fs.readFileSync(
    path.join(ROOT, 'scripts', 'build-weapon-catalog.mjs'), 'utf8',
  );

  /*
   * Der Generator bettet den Katalog-Text in ein Template-Literal ein. Geprüft
   * wird die SIGNATUR der Funktion darin — sie darf keinen Default tragen.
   */
  const treffer = generator.match(/export function pickWeaponForRarity\(([^)]*)\)/);
  assert.ok(treffer, 'die Funktionsdefinition wurde im Generator nicht gefunden');

  const parameter = treffer[1];
  assert.doesNotMatch(parameter, /=\s*\{/,
    `Die Signatur trägt wieder einen Default: (${parameter}). Das ist die `
    + 'zweite Quelle der Gewichte — sie gehört ausschließlich nach '
    + 'RARITY_WEIGHTS in engine/systems/lootSystem.js.');
});

test('Die generierte Datei trägt ebenfalls keinen Default', () => {
  // Der Katalog ist das, was der Motor tatsächlich lädt — hier muss es
  // genauso aussehen.
  const katalog = fs.readFileSync(
    path.join(ROOT, 'src', 'shared', 'config', 'weapons.js'), 'utf8',
  );
  const treffer = katalog.match(/export function pickWeaponForRarity\(([^)]*)\)/);
  assert.ok(treffer, 'die Funktion steht nicht im Katalog');

  assert.doesNotMatch(treffer[1], /=\s*\{/,
    `Der Katalog trägt einen Default: (${treffer[1]}). `
    + 'Wurde `npm run weapons:build` nach der Generator-Änderung ausgeführt?');
});

test('RARITY_WEIGHTS ist eingefroren', () => {
  /*
   * Die eine Quelle muss gegen versehentliche Änderung geschützt sein — sonst
   * könnte ein Modul sie zur Laufzeit verstellen, und die Wahlen wären nicht
   * mehr reproduzierbar.
   */
  assert.ok(Object.isFrozen(RARITY_WEIGHTS),
    'RARITY_WEIGHTS muss eingefroren sein');

  const summe = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(summe, 100,
    `Die Gewichte müssen sich zu 100 summieren, sind aber ${summe}`);
});
