/**
 * Wächter: `hasSpecialEffect` hat in `src/` EINE Definitionsstelle — und
 * `effectFor` behält Leser, nachdem die tote zweite Fassung entfernt wurde.
 *
 * ## Warum dieser Test
 *
 * `hasSpecialEffect` stand ZWEIMAL im Baum, mit ZWEI unvereinbaren Regeln:
 *
 *   - `src/engine/specials.js:234`  `effectFor(weapon?.special) !== null`
 *     → „hat diese Waffe einen ZUGEWIESENEN Spezialeffekt?“
 *   - `src/shared/config/weapons.js:7128`
 *     `weapon.damage > 0 || SPECIAL_WITHOUT_DAMAGE.includes(weapon.special)`
 *     → „ist diese Waffe ohne Schaden trotzdem spielbar?“
 *
 * Nachgemessen (Sonde ueber alle 150 Waffen, s. `docs/tote-regeln.md`): Die
 * beiden Antworten wichen auf **89 von 150** Waffen ab — jede mit Schaden > 0
 * galt nach der Katalog-Regel als „hat Wirkung“, nach der Effekt-Regel nicht
 * (59 %). Die Fassung in `specials.js` hatte **0 Leser**: kein einziger
 * Import-Bindung in `src/`, `tests/`, `scripts/` oder `tools/`. Sichtbar war
 * das nur, wenn man IMPORTE zählt statt Vorkommen des Namens — der Audit
 * zählte Vorkommen, fand den Namen in `weapons.js` und uebersah die zweite
 * Regel.
 *
 * Der Fehler ist damit nicht „eine unbenutzte Funktion“, sondern: eine ZWEITE
 * ANTWORT auf dieselbe Frage bleibt im Baum liegen und wird in einem halben
 * Jahr benutzt, weil sie „auch da ist“.
 *
 * ## Was hier festgenagelt wird — und was nicht
 *
 * Geprueft wird die ANZAHL DER DEFINITIONSSTELLEN, nicht ein Wert. Eine zweite
 * Definition laesst diesen Test fallen, egal welche Regel sie traegt (dieselbe
 * Haltung wie `tests/eine-regel-eine-stelle.test.js`). Dazu die SEMANTIK der
 * einen gebliebenen Regel, denn die Zahl „89“ darf nicht als Zusicherung im
 * Test stehen: Sie haengt am Waffenkatalog und wuerde bei jeder
 * Katalog-Erweiterung ohne Aussage rot. Festgehalten wird stattdessen, dass die
 * beiden Fragen VERSCHIEDEN sind — nachgemessen an einem erfundenen
 * Spezialnamen, nicht am Katalog.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hasSpecialEffect, SPECIAL_WITHOUT_DAMAGE } from '../src/shared/config/weapons.js';
import { effectFor } from '../src/engine/specials.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function quelldateien(ordner) {
  const ergebnis = [];
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) ergebnis.push(...quelldateien(voll));
    else if (eintrag.name.endsWith('.js')) ergebnis.push(voll);
  }
  return ergebnis;
}

const DATEIEN = quelldateien(path.join(ROOT, 'src'));

/**
 * Dateien, in denen `NAME` DEFINIERT wird.
 *
 * Zwei Entscheidungen, jede mit Grund:
 *
 *  - **Kommentare fallen vorher weg.** Die Streichung der zweiten Fassung ist
 *    an ihrer Stelle als Kommentar dokumentiert („HIER STAND …“). Ohne diesen
 *    Schritt waere die Wache gegen sich selbst gerichtet. Und eine
 *    auskommentierte Definition ist keine Definition.
 *  - **Nur echte Definitionen zaehlen** (`const NAME =`, `function NAME(`).
 *    Eine Re-Export-Naht (`export { NAME };`) ist KEINE Definition — genau das
 *    ist ihr Sinn (siehe `tests/eine-regel-eine-stelle.test.js`).
 */
function definitionsstellen(name, dateien = DATEIEN) {
  const muster = new RegExp(
    `^\\s*(?:export\\s+)?(?:const\\s+${name}\\s*=|function\\s+${name}\\s*\\()`,
  );
  return dateien
    .filter(datei => ohneKommentare(fs.readFileSync(datei, 'utf8'))
      .split('\n')
      .some(zeile => muster.test(zeile)))
    .map(datei => path.relative(ROOT, datei).split(path.sep).join('/'));
}

test('hasSpecialEffect wird in src/ an genau EINER Stelle definiert', () => {
  const stellen = definitionsstellen('hasSpecialEffect');
  assert.deepEqual(stellen, ['src/shared/config/weapons.js'],
    'hasSpecialEffect muss allein im Katalog definiert sein (die eine Regel). '
    + `Gefunden in: ${stellen.join(', ') || '—'}. Die zweite Fassung in `
    + 'src/engine/specials.js hatte 0 Leser und gab auf 89 von 150 Waffen die '
    + 'andere Antwort (docs/tote-regeln.md).');
});

test('Die entfernte Fassung ist nicht als CODE zurueckgekehrt', () => {
  /*
   * Die Fassung stand in `src/engine/specials.js`. Der Name darf dort im
   * Kommentar stehen (die Streichung ist dokumentiert), im CODE nicht — sonst
   * waere er fuer einen Leser wieder eine verfuegbare Antwort.
   */
  const code = ohneKommentare(
    fs.readFileSync(path.join(ROOT, 'src', 'engine', 'specials.js'), 'utf8'),
  );
  assert.ok(!/\bhasSpecialEffect\b/.test(code),
    'in src/engine/specials.js steht wieder eine `hasSpecialEffect`-Fassung im '
    + 'Code — die eine Regel wohnt in src/shared/config/weapons.js');
});

test('Die eine Regel fragt nach Schaden und Liste — nicht nach der Effektzuordnung', () => {
  /*
   * Die Gegenprobe zur Streichung: Es reicht nicht, dass nur EINE Definition
   * uebrig ist — sie muss auch die RICHTIGE Frage beantworten. Der
   * Unterschied wird an einem erfundenen Spezialnamen gemessen, damit die Zahl
   * „89 von 150“ nicht als Zusicherung in den Test wandert.
   */
  const erfunden = { damage: 10, special: 'nicht_im_wirkungskatalog' };
  assert.equal(effectFor(erfunden.special), null,
    'Vorbedingung des Falls: der erfundene Name hat KEINEN zugeordneten Effekt');
  assert.equal(hasSpecialEffect(erfunden), true,
    'die Katalog-Regel muss bei Schaden > 0 true sagen (so waehlt '
    + '`pickWeaponForRarity` den Pool)');

  /*
   * Zweite Haelfte: Waffen OHNE Schaden, die ueber die Liste spielbar sind.
   * Die Liste selbst ist der zweite Teil der einen Regel.
   */
  const ohneSchaden = { damage: 0, special: SPECIAL_WITHOUT_DAMAGE[0] };
  assert.equal(hasSpecialEffect(ohneSchaden), true,
    'eine Waffe ohne Schaden, aber mit Wirkung aus SPECIAL_WITHOUT_DAMAGE gilt '
    + 'als wirkungsvoll');
  assert.equal(hasSpecialEffect({ damage: 0, special: 'nicht_im_wirkungskatalog' }), false,
    'ohne Schaden und ohne Listeneintrag ist die Waffe nicht wirkungsvoll');
});

test('effectFor hat weiterhin Leser — der naechste tote Export sind NICHT wir', () => {
  /*
   * Der Befund „0 Leser“ verschiebt sich beim Aufraeumen gern auf den
   * naechsten Namen: `effectFor` war der EINZIGE Grund, aus dem die gestrichene
   * Fassung ueberhaupt etwas tat. Ohne Leser waere nun SIE die tote Regel.
   */
  const leserIn = datei => ohneKommentare(fs.readFileSync(datei, 'utf8'))
    .split('\n')
    .filter(zeile => /\beffectFor\s*\(/.test(zeile) && !/export\s+function\s+effectFor/.test(zeile))
    .length;

  const mitLesern = DATEIEN
    .filter(datei => leserIn(datei) > 0)
    .map(datei => path.relative(ROOT, datei).split(path.sep).join('/'));

  assert.deepEqual(mitLesern, ['src/engine/specials.js'],
    'effectFor muss im Motor-Code gelesen werden (buildEffect) — sonst ist die '
    + `naechste Regel tot. Lesende Dateien: ${mitLesern.join(', ') || '—'}`);

  const testLeser = quelldateien(path.join(ROOT, 'tests'))
    .map(datei => path.relative(ROOT, datei).split(path.sep).join('/'))
    .filter(rel => /\beffectFor\b/.test(ohneKommentare(fs.readFileSync(path.join(ROOT, rel), 'utf8'))));
  assert.ok(testLeser.length > 0,
    'auch die Testseite muss effectFor lesen — ein Export ohne Leser ist eine '
    + 'Absicht ohne Wirkung');
});

test('Der Waechter greift — Selbstpruefung mit gekapertem Text', () => {
  /*
   * Ein Waechter ohne Selbstpruefung ist eine Behauptung. Hier laeuft
   * `definitionsstellen` gegen einen FREMDEN Baum mit einer zweiten Fassung:
   * faengt er sie nicht, ist der Test oben wertlos.
   */
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'tote-regeln-'));
  try {
    const a = path.join(probe, 'katalog.js');
    const b = path.join(probe, 'zweite-fassung.js');
    fs.writeFileSync(a, 'export function hasSpecialEffect(weapon) {\n  return true;\n}\n');
    fs.writeFileSync(b, 'export function hasSpecialEffect(weapon) {\n  return false;\n}\n');
    assert.equal(definitionsstellen('hasSpecialEffect', [a, b]).length, 2,
      'eine zweite Fassung im Code muss gefunden werden — sonst prueft der '
      + 'Test oben nichts');

    // Gegenprobe 1: eine AUSKOMMENTIERTE Fassung ist keine Definition.
    fs.writeFileSync(b, '/* export function hasSpecialEffect(weapon) {} */\n');
    assert.equal(definitionsstellen('hasSpecialEffect', [a, b]).length, 1,
      'ein Kommentar darf nicht als Definitionsstelle zaehlen');

    // Gegenprobe 2: eine Re-Export-Naht ist keine Definition.
    fs.writeFileSync(b, "export { hasSpecialEffect } from './katalog.js';\n");
    assert.equal(definitionsstellen('hasSpecialEffect', [a, b]).length, 1,
      'eine Re-Export-Naht darf nicht als Definitionsstelle zaehlen');
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }
});
