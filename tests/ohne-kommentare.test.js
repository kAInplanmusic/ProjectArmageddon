/**
 * Die eine Stelle für „Quelltext ohne Kommentare" — Verhalten festgenagelt.
 *
 * WARUM DIESE DATEI EXISTIERT
 *
 * Vorher stand dieselbe Funktion in SECHS Testdateien, in VIER verschiedenen
 * Fassungen. Der Unterschied war nicht kosmetisch: eine verbotene Zahl in einem
 * NACHGESTELLTEN Kommentar (`const g = 0.32; // war die Zahl aus ballistics.js`)
 * wurde von einer Fassung entfernt und von einer anderen STEHENGELASSEN. Ein
 * Test, der eine Zahl verbietet, urteilte damit je nach Kopie verschieden —
 * über dieselbe Datei.
 *
 * Diese Datei hält beide Richtungen fest, damit die Zusammenführung nicht
 * unbemerkt zurückfällt:
 *
 *   - ein Kommentar ist KEIN Treffer (auch nicht nachgestellt, auch in HTML)
 *   - echter Code IST ein Treffer
 *
 * Die zweite Hälfte ist genauso wichtig wie die erste: ein Helfer, der zu viel
 * entfernt, findet nie wieder etwas.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ohneKommentare } from './helfer/ohne-kommentare.js';

test('Blockkommentare fallen weg', () => {
  const text = 'const a = 1;\n/* war: const b = 0.32; */\nconst c = 3;\n';
  const ohne = ohneKommentare(text);
  assert.ok(!ohne.includes('0.32'), 'die Zahl im Blockkommentar steht noch da');
  assert.ok(ohne.includes('const a = 1;'), 'echter Code wurde mitentfernt');
  assert.ok(ohne.includes('const c = 3;'), 'echter Code nach dem Block fehlt');
});

test('Ganze Kommentarzeilen fallen weg', () => {
  const text = '// const g = 0.32;\nconst g = 1;\n';
  assert.ok(!ohneKommentare(text).includes('0.32'));
  assert.ok(ohneKommentare(text).includes('const g = 1;'));
});

test('NACHGESTELLTE Kommentare fallen weg — die Stelle, an der die Kopien auseinanderliefen', () => {
  /*
   * DAS ist der Fall, der die Zusammenführung ausgelöst hat.
   *
   * Zwei der vier Fassungen entfernten nur GANZE Kommentarzeilen
   * (`/^\s*\/\/.*$/gm`). Diese Zeile ist für sie unsichtbar geblieben:
   */
  /*
   * Wichtig fuer den Aufbau des Falls: der CODE darf die verbotene Zahl NICHT
   * selbst tragen, sonst ist die Probe wertlos — sie schluege an, obwohl nur
   * der Kommentar gemeint war. (Der erste Entwurf dieses Tests machte genau
   * diesen Fehler: er prueft `const g = 0.32; // war 0.32` und war damit
   * unwiderlegbar rot. Ein Test, der immer rot ist, sagt nichts.)
   */
  const text = 'const g = 1; // frueher stand hier 0.32\n';
  const ohne = ohneKommentare(text);
  assert.ok(!ohne.includes('0.32'),
    'der nachgestellte Kommentar wurde nicht entfernt — genau hier liefen die Kopien auseinander');
  assert.ok(ohne.includes('const g = 1;'),
    'der CODE der Zeile muss stehen bleiben, nur der Kommentar dahinter faellt');
});

test('Ein Semikolon am Zeilenende bleibt heil', () => {
  // Der Wächter schreibt das Zeichen vor `//` zurück; sonst würde aus
  // `const a = 1;` ein `const a = 1` — und jede Textprobe auf `;` fiele um.
  assert.ok(ohneKommentare('const a = 1; // weg\n').includes('const a = 1;'));
});

test('`://` wird geschützt — eine URL verliert nicht ihren Rest', () => {
  /*
   * Ohne Wächter würde `https://example.com/a` zu `https:` verstümmelt. Eine
   * Fassung der sechs Kopien hatte diesen Schutz NICHT.
   */
  const text = "const u = 'https://example.com/pfad'; // weg\n";
  const ohne = ohneKommentare(text);
  assert.ok(ohne.includes('https://example.com/pfad'),
    'die URL wurde zerschnitten — der `(^|[^:])`-Wächter fehlt');
  assert.ok(!ohne.includes('weg'), 'der echte Kommentar muss trotzdem fallen');
});

test('HTML-Kommentare fallen weg (ein Aufrufer prüft index.html)', () => {
  const text = '<button><!-- ohne Kennzeichnung --></button>\n';
  assert.ok(!ohneKommentare(text).includes('ohne Kennzeichnung'));
  assert.ok(ohneKommentare(text).includes('<button>'));
});

test('ECHTER CODE ist weiterhin ein Treffer — ein Helfer, der zu viel entfernt, findet nichts', () => {
  /*
   * Die Gegenrichtung. Der Anlass war ein FEHLALARM: ein Kommentar zitierte die
   * alte Zeile. Hätte man den Helfer einfach schärfer gestellt, wäre der echte
   * Fund mit verschwunden. Beide Fälle sind hier festgehalten.
   */
  const text = "const PROJECTILE_GRAVITY = 0.32;\nconst x = 1; // nur eine Erklaerung\n";
  const ohne = ohneKommentare(text);
  assert.match(ohne, /PROJECTILE_GRAVITY\s*=\s*0\.\d/,
    'echter Code wurde entfernt — die Probe findet eine zweite Zahl nie wieder');
});

test('Der Helfer kennt seine Grenze: `//` in einer Zeichenkette schneidet mit', () => {
  /*
   * Kein Parser, nur ein Ersatzausdruck. Das ist im Modulkopf als Grenze
   * benannt. Hier steht der Beleg, damit niemand die Grenze für ein Versprechen
   * hält: wer den Helfer auf eine Datei mit `//`-Literalen ansetzt, muss das
   * wissen.
   */
  const text = "const s = 'a//b';\n";
  assert.ok(!ohneKommentare(text).includes('a//b'),
    'wenn dieses Verhalten sich ändert, muss der Modulkopf nachgezogen werden');
});
