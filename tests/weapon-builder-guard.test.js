/**
 * Tests des Waffen-Generator-Aufrufschutzes.
 *
 * Warum es diesen Test gibt
 * -------------------------
 * `scripts/build-weapon-catalog.mjs` enthält zwei Dinge: die Generator-Logik und
 * die exportierten Helfer (`getWeapon`, `hasFuse`, `orderInventoryBySubcategory`).
 * Der Schreibvorgang stand auf der obersten Ebene und lief damit AUCH bei einem
 * reinen `import` — nachgemessen: Die mtime von `src/shared/config/weapons.js`
 * änderte sich. Drei Testdateien importieren aus diesem Modul und lösten den
 * Schreibvorgang mit aus.
 *
 * Der Schreibvorgang hängt jetzt an `import.meta.main`. Diese Änderung ist
 * RISIKOREICH in genau eine Richtung: Sitzt die Prüfung falsch, schreibt
 * `npm run weapons:build` NICHT mehr, und der Katalog veraltet still — ein
 * Fehler, der nirgends auffällt, weil nichts fehlschlägt. Deshalb wird hier
 * BEIDES geprüft: dass der Import still bleibt UND dass der Programmaufruf
 * weiterhin schreibt.
 *
 * Der Test startet dazu echte Node-Prozesse. Ein Test gegen eine nachgebaute
 * Bedingung würde die Verkabelung nicht prüfen — genau die kann brechen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(hier, '..');
const GENERATOR = resolve(WURZEL, 'scripts/build-weapon-catalog.mjs');
const KATALOG = resolve(WURZEL, 'src/shared/config/weapons.js');

/** mtime in Millisekunden — feiner als das Sekunden-runtimes von `stat`. */
function mtimeMs(pfad) {
  return statSync(pfad).mtimeMs;
}

test('Ein reiner Import schreibt den Katalog NICHT', () => {
  /*
   * Der Kern des Fundes: `import` darf nichts verändern.
   *
   * Gemessen wird über die mtime, nicht über den Inhalt: Der Generator ist
   * deterministisch, der INHALT wäre also auch vorher gleich — die mtime ist
   * das einzige Merkmal, das einen Schreibvorgang verrät.
   */
  const vorher = mtimeMs(KATALOG);

  const ausgabe = execFileSync(process.execPath, [
    '--input-type=module',
    '-e',
    `await import(${JSON.stringify(GENERATOR)});`,
  ], { cwd: WURZEL, encoding: 'utf8' });

  const nachher = mtimeMs(KATALOG);

  assert.equal(nachher, vorher,
    'Der Import hat die Datei geschrieben — der Schutz greift nicht');
  assert.match(ausgabe, /nicht geschrieben/,
    `Der Import muss melden, dass nichts geschrieben wurde. Ausgabe: ${ausgabe}`);
});

test('Der Import liefert trotzdem die Helfer', () => {
  /*
   * Die Gegenprobe zum Schreibschutz: Er darf nicht zu grob sein. Wenn das
   * Modul beim Import NICHTS mehr bereitstellt, wären die drei Testdateien
   * kaputt.
   *
   * Welche Funktionen das sind, ist GEMESSEN und nicht geraten: Die drei Tests
   * importieren `simulateProjectileReach`, `deriveMaxRange` und `deriveCooldown`
   * — die ABLEITUNGSFUNKTIONEN des Generators. Die Laufzeit-Helfer
   * (`getWeapon`, `orderInventoryBySubcategory`) stehen NICHT hier, sondern im
   * ERZEUGTEN Katalog (`src/shared/config/weapons.js`); der Generator schreibt
   * sie als Text. Ein Test, der sie hier erwartete, hat sich geirrt — nicht der
   * Code.
   */
  const ausgabe = execFileSync(process.execPath, [
    '--input-type=module',
    '-e',
    `const m = await import(${JSON.stringify(GENERATOR)});
     const erwartet = ['simulateProjectileReach', 'deriveMaxRange', 'deriveCooldown',
                       'deriveFuseTime', 'gravityScaleFor'];
     const fehlend = erwartet.filter(n => typeof m[n] !== 'function');
     if (fehlend.length > 0) { console.error('FEHLT: ' + fehlend.join(',')); process.exit(1); }
     const r = m.deriveMaxRange({ speedFactor: 1 });
     console.log('OK ' + erwartet.length + ' Funktionen, deriveMaxRange -> ' + r);`,
  ], { cwd: WURZEL, encoding: 'utf8' });

  assert.match(ausgabe, /OK /, `Helfer fehlen beim Import. Ausgabe: ${ausgabe}`);
});

test('Als Programm aufgerufen SCHREIBT der Generator weiterhin', () => {
  /*
   * DER wichtigste Test dieser Datei.
   *
   * Die ganze Änderung ist nur dann zulässig, wenn `npm run weapons:build`
   * unverändert funktioniert. Ein Katalog, der still nicht mehr erneuert wird,
   * wäre der schlimmere Fehler — und er würde von keinem bestehenden Test
   * bemerkt, weil alle Tests den VORHANDENEN Katalog lesen.
   *
   * Die mtime muss sich ändern; auf die Inhaltsgleichheit wird NICHT geprüft
   * (der Generator ist deterministisch, der Inhalt bleibt gleich).
   */
  const vorher = mtimeMs(KATALOG);
  // mtime-Auflösung: mindestens eine Millisekunde Abstand erzwingen.
  const bis = Date.now() + 5;
  while (Date.now() < bis) { /* kurz warten */ }

  const ausgabe = execFileSync(process.execPath, [GENERATOR], {
    cwd: WURZEL,
    encoding: 'utf8',
  });

  const nachher = mtimeMs(KATALOG);

  assert.ok(nachher > vorher,
    `Der Programmaufruf hat NICHT geschrieben (mtime ${vorher} -> ${nachher}) — `
    + 'der Schutz sitzt falsch, und der Katalog würde still veralten');
  assert.match(ausgabe, /Katalog geschrieben/,
    `Der Programmaufruf muss das Schreiben melden. Ausgabe: ${ausgabe}`);
  // Und der Inhalt muss ein gültiger Katalog sein, nicht eine leere Datei.
  assert.match(ausgabe, /Waffen: \d+/, `Unerwartete Ausgabe: ${ausgabe}`);
});

test('Der Schutz ist fail-safe: ohne import.meta.main wird geschrieben', () => {
  /*
   * `import.meta.main` gibt es erst ab Node 22.13. Ein Guard der Form
   * `if (import.meta.main)` würde auf älteren Versionen NIE schreiben — der
   * Katalog veraltete still. Deshalb steht im Generator `!== false`.
   *
   * Diese Prüfung liest die Bedingung aus der Quelldatei. Sie ist bewusst
   * textuell: Lässt sich die Absicht nicht prüfen, ohne sie nachzubauen, ist
   * der Text die ehrliche Stelle — ein nachgebauter Ausdruck würde die echte
   * Zeile nicht absichern.
   */
  const quelle = readFileSync(GENERATOR, 'utf8');
  const bedingung = quelle.match(/const\s+alsProgrammAufgerufen\s*=\s*([^;]+);/);
  assert.ok(bedingung, 'Die Bedingungsvariable steht nicht mehr in der Datei — Test anpassen');
  assert.match(bedingung[1], /import\.meta\.main\s*!==\s*false/,
    `Die Bedingung muss fail-safe sein (nur bei ausdruecklichem false ueberspringen), `
    + `gefunden: ${bedingung[1].trim()}`);
  assert.doesNotMatch(bedingung[1], /^\s*import\.meta\.main\s*$/,
    'Ein blosses `if (import.meta.main)` waere auf aelteren Node-Versionen stumm');
});
