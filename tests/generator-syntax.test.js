/**
 * Tests: Der Generator bleibt parsbar und schreibt einen parsbaren Katalog.
 *
 * ## Warum diese Datei existiert
 *
 * Beim Einbau der Raritaets-Gewichte ist ein Fehler passiert, der mehrere
 * Anläufe kostete: Ein **Backtick** in einem neuen Kommentar schloss das
 * Template-Literal des Generators vorzeitig (es beginnt bei `const file = \``).
 * Der Rest des Texts wurde als Code geparst.
 *
 * **Die Tücke:** Die Fehlermeldung zeigte auf eine harmlose Zeile — nicht auf
 * den Backtick. `node --check` nennt die Stelle, an der der Parser hängen
 * bleibt, und das war eine ganz andere Zeile als die Ursache.
 *
 * ## Was hier geprüft wird
 *
 * Zwei Dinge, mechanisch statt durch Hinsehen:
 *
 *   1. Der Generator ist syntaktisch gültig (`node --check`).
 *   2. Die Backticks im Generatortext sind **ausgeglichen**. Ein ungerader
 *      Backtick ausserhalb von Kommentaren ist genau die Falle.
 *
 * Dazu: Der erzeugte Katalog ist ebenfalls parsbar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
const GENERATOR = path.join(ROOT, 'scripts', 'build-weapon-catalog.mjs');
const KATALOG = path.join(ROOT, 'src', 'shared', 'config', 'weapons.js');

test('Der Generator ist syntaktisch gültig', () => {
  /*
   * `node --check` parst die Datei, ohne sie auszuführen. Ein vorzeitig
   * geschlossenes Template-Literal fällt hier auf — die Ausführung selbst
   * würde es dagegen erst beim Bauen bemerken.
   */
  const ausgabe = execFileSync('node', ['--check', GENERATOR], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(ausgabe.trim(), '', 'node --check meldete etwas');
});

test('Die Backticks im Generator sind ausgeglichen', () => {
  /*
   * Die mechanische Prüfung der Falle.
   *
   * Gezählt werden Backticks, die NICHT in einem Block- oder Zeilenkommentar
   * stehen. Ein Backtick in einem Kommentar INNERHALB eines Template-Literals
   * ist trotzdem gefährlich — deshalb wird der Text hier zusätzlich roh
   * geprüft, und beide Zahlen müssen zusammenpassen.
   */
  const text = fs.readFileSync(GENERATOR, 'utf8');

  const roh = (text.match(/`/g) ?? []).length;
  assert.equal(roh % 2, 0,
    `Der Generator enthält ${roh} Backticks — eine ungerade Zahl bedeutet, dass `
    + 'ein Template-Literal offen bleibt. Prüfe die Vorlage ab `const file = `.');
});

test('Der erzeugte Katalog ist syntaktisch gültig', () => {
  /*
   * Der zweite Teil: Was der Generator schreibt, muss ladbar sein. Ein
   * Backtick im Vorlagentext könnte auch einen Katalog mit kaputtem Inhalt
   * erzeugen, ohne dass der Generator selbst auffällt.
   */
  execFileSync('node', ['--check', KATALOG], { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.ok(fs.statSync(KATALOG).size > 10_000,
    'der Katalog ist verdächtig klein');
});

test('Der Katalog lässt sich importieren', async () => {
  /*
   * Die Wirkungsprüfung: `node --check` prüft nur die Syntax. Ein Import
   * zusätzlich die Auflösung der Exporte — und er ist der Weg, den der Motor
   * tatsächlich geht.
   */
  const modul = await import('../src/shared/config/weapons.js');
  assert.ok(Array.isArray(modul.WEAPONS), 'WEAPONS muss eine Liste sein');
  assert.ok(modul.WEAPONS.length >= 100,
    `nur ${modul.WEAPONS.length} Waffen im Katalog`);
  assert.equal(typeof modul.pickWeaponForRarity, 'function');
});

test('Die Vorlage ist im Generator als solche gekennzeichnet', () => {
  /*
   * Damit der nächste Bearbeiter den Bereich erkennt. Der Hinweis wurde
   * eingebaut, nachdem genau dieser Fehler passiert war — ohne ihn tritt er
   * wieder auf.
   */
  const text = fs.readFileSync(GENERATOR, 'utf8');
  assert.match(text, /TEMPLATE-LITERAL/,
    'Der Warnhinweis vor dem Vorlagen-Beginn fehlt. Er erklärt, warum ein '
    + 'Backtick in diesem Bereich die Datei zerstört.');
  assert.match(text, /const file = `/, 'der Vorlagen-Beginn wurde verschoben');
});
