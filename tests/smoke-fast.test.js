/**
 * Tests: Der Rauchtest prüft wirklich, was er behauptet.
 *
 * ## Warum diese Datei existiert
 *
 * Der Rauchtest (`npm run smoke:fast`) ist die Antwort auf die häufigste
 * Grenze: Der volle Lauf dauert 9,4 Minuten, also prüft man zu selten — und
 * dadurch rutschen Fehler durch, die ein sofortiger Lauf gefunden hätte.
 *
 * Ein Rauchtest, der einen Pfad **überspringt**, weil eine Datei fehlt, ist
 * schlimmer als keiner: Er meldet „OK" für etwas, das er nicht geprüft hat.
 * Genau dieser Fall wäre beinahe eingetreten — drei der fünf geplanten
 * Kerntestdateien existierten nicht.
 *
 * Deshalb prüft diese Datei den Rauchtest selbst.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
const SKRIPT = path.join(ROOT, 'scripts', 'smoke-fast.mjs');

const quelle = fs.readFileSync(SKRIPT, 'utf8');

test('Jede genannte Kerntestdatei existiert wirklich', () => {
  /*
   * DIE Prüfung. Ein Rauchtest, der eine fehlende Datei still überspringt,
   * meldet Erfolg für einen ungeprüften Pfad.
   *
   * Beim Schreiben dieses Skripts fehlten drei von fünf geplanten Dateien
   * (`match.test.js`, `weapons.test.js`, `lobby.test.js` gab es nicht) — sie
   * wurden durch die tatsächlich vorhandenen ersetzt. Dieser Test hält fest,
   * dass die Liste stimmt.
   */
  const liste = /const KERN_TESTDATEIEN = \[([\s\S]*?)\];/.exec(quelle);
  assert.ok(liste, 'die Liste der Kerntestdateien fehlt');

  const dateien = [...liste[1].matchAll(/'([^']+\.test\.js)'/g)].map(m => m[1]);
  assert.ok(dateien.length >= 3,
    `Es sind nur ${dateien.length} Kerntestdateien genannt — zu wenige, um die `
    + 'Kernpfade abzudecken');

  for (const datei of dateien) {
    assert.ok(fs.existsSync(path.join(ROOT, datei)),
      `Der Rauchtest nennt ${datei}, aber die Datei existiert nicht — er würde `
      + 'sie still überspringen und Erfolg melden');
  }
});

test('Der Rauchtest prüft den Server-Start inklusive Zustandssicherung', () => {
  /*
   * Der Server-Pfad war in dieser Sitzung zweimal kaputt: Der Signal-Handler
   * stand nach dem `await` (Zustand verloren bei 2 von 3 Läufen), und ein
   * Port-Wettlauf ließ einen Test im Volllauf scheitern.
   *
   * Beides hätte ein Rauchtest sofort gefunden — wenn er diesen Pfad prüft.
   */
  assert.match(quelle, /server\.mjs/,
    'der Rauchtest startet den Server nicht');
  assert.match(quelle, /Zustand gesichert/,
    'der Rauchtest prüft nicht, ob der Zustand gesichert wurde');
  assert.match(quelle, /SIGTERM/,
    'der Rauchtest beendet den Server nicht geordnet');
});

test('Der Rauchtest erfragt den Port, statt ihn zu raten', () => {
  /*
   * Ein geratener Port kollidiert bei paralleler Ausführung — genau das ließ
   * `server-start.test.js` im Volllauf einmal fehlschlagen.
   */
  assert.match(quelle, /createServer\(\)/,
    'der Rauchtest braucht eine Port-Ermittlung über das Betriebssystem');
  assert.match(quelle, /probe\.listen\(0/,
    'der Port muss über `listen(0)` erfragt werden');
});

test('Der Rauchtest meldet Fehlschläge mit Grund', () => {
  /*
   * Ein Rauchtest, der nur „FEHLER" sagt, zwingt zum Suchen. Er muss den
   * Detailtext mitliefern — sonst ist der Zeitgewinn wieder weg.
   */
  assert.match(quelle, /FEHLGESCHLAGEN/,
    'der Rauchtest meldet Fehlschläge nicht gesammelt');
  assert.match(quelle, /detail/,
    'die Fehlschläge brauchen einen Detailtext');
  assert.match(quelle, /process\.exit\(1\)/,
    'ein Fehlschlag muss den Exit-Code setzen — sonst merkt es keine CI');
});

test('Der Rauchtest ist über npm erreichbar', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['smoke:fast'], 'npm run smoke:fast fehlt');
});

test('Die Messwerkzeuge sind über npm erreichbar', () => {
  /*
   * `measure:load` und `plan:scale` liefern die Zahlen, auf denen die
   * Serverplanung aufbaut (`docs/skalierung.md`). Wären sie nicht aufrufbar,
   * wären die Zahlen im Dokument nicht nachprüfbar.
   */
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['measure:load'], 'npm run measure:load fehlt');
  assert.ok(pkg.scripts['plan:scale'], 'npm run plan:scale fehlt');
});
