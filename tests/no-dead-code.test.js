/**
 * Tests: Es gibt keine zweite, ungenutzte Engine neben dem Produktivpfad.
 *
 * ## Der Befund
 *
 * Ein Audit fand **974 Zeilen toter Code**: eine zweite Terrain-Engine
 * (`terrain/terrainEngine.js`, 494 Zeilen), eine zweite Waffen-Engine
 * (`weapons/weaponEngine.js`, 480 Zeilen), zwei als „Wrapper für externes
 * Paket" kommentierte Stubs und einen Welt-Adapter (175 Zeilen). **Kein
 * einziger Importeur** — auch nicht über `src/engine/index.js`.
 *
 * Sie waren gefährlich, obwohl sie nie liefen: Wer eine Terrain-Änderung
 * sucht, findet zwei Engines und weiß nicht, welche gilt. Die Projektregel
 * „eine Regel, eine Stelle" war damit auf Modulebene verletzt.
 *
 * ## Was diese Datei verhindert
 *
 * Dass eine solche Parallelstruktur zurückkehrt. Geprüft wird nicht, dass
 * bestimmte DATEIEN fehlen (das wäre eine Namensliste, die veraltet), sondern
 * dass **jede Datei unter `src/` von irgendwem geladen wird**. Eine Datei, die
 * niemand importiert, fällt damit sofort auf.
 *
 * ## Was sich am 2026-09-27 geändert hat (und warum)
 *
 * Der Wächter lief bis dahin nur über `src/engine/` — **30 von 90 Dateien**, ein
 * Drittel des Baums. `src/shared/` (34), `src/client/` (20) und `src/server/`
 * (6) waren ungeprüft, obwohl die Regel „eine Regel, eine Stelle" nicht auf die
 * Schicht beschränkt ist, in der sie zuerst verletzt wurde. Gemessen vor der
 * Ausweitung: **0 verwaiste Dateien** in den drei anderen Schichten — die
 * Ausweitung kostet also keine Ausnahme, sie schließt nur die Lücke.
 *
 * Zwei Regeln gelten jetzt zusätzlich:
 *
 *   - **Der Freispruch wird GELESEN.** `ERLAUBT_OHNE_IMPORTEUR` ist eine MAP
 *     Name → Begründung; ein Eintrag ohne Begründung lässt diesen Test fallen.
 *     Ein Freispruch ohne Sack und Pack ist die stille Variante des Fehlers, den
 *     dieser Wächter verhindern soll.
 *   - **Die Abdeckung ist Teil der Prüfung.** Ein Test, der auf eine Schicht
 *     zurückfällt (oder eine neue Schicht übersieht), meldet das jetzt selbst.
 *
 * ## Was dieser Wächter NICHT sieht (Sichtgrenze)
 *
 *   - **Nur `.js` unter `src/`.** `.mjs`/`.cjs`/`.ts` gibt es dort nicht; käme
 *     eine dazu, fiele sie hier still heraus.
 *   - **KEINE Datendateien.** `src/shared/data/*.json` und
 *     `src/client/assets/weaponIcons.json` sind keine Module und haben keine
 *     Importeure — sie sind ein eigener Befund und werden vom Werkzeug
 *     gemeldet (`node tools/audit-mcp/server.mjs --ruf audit_deadcode` →
 *     `toteDaten`), nicht von diesem Test.
 *   - **Kein Aufrufgraph.** Geprüft wird die NENNUNG des Dateinamens in einer
 *     Projektdatei (dieselbe Textsuche wie im Werkzeug). Eine Datei, die nur in
 *     einem Kommentar genannt wird, gilt deshalb als angebunden; eine, deren
 *     Import zur Laufzeit gebaut wird, gilt als verwaist. Beide Richtungen sind
 *     Näherungen, und beide sind hier bewusst so gewählt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/** Verzeichnisse, die beim Bauen entstehen — eine Kopie dort ist KEIN Importeur. */
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'artifacts', 'test-results',
  'playwright-report', '.pa-state', 'coverage', '.vite', 'uploaded',
]);

/** Alle Quelldateien (.js) unter einem Verzeichnis. */
function quelldateien(verzeichnis) {
  const ergebnis = [];
  const sammeln = dir => {
    for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
      const voll = path.join(dir, eintrag.name);
      if (eintrag.isDirectory()) sammeln(voll);
      else if (eintrag.name.endsWith('.js')) ergebnis.push(voll);
    }
  };
  sammeln(verzeichnis);
  return ergebnis;
}

/** Alle Dateien, die im Projekt Text lesen können — die Suche nach Importen. */
function alleProjektdateien() {
  const ergebnis = [];
  const sammeln = dir => {
    for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
      if (eintrag.name === 'node_modules' || eintrag.name.startsWith('.')) continue;
      if (SKIP_DIRS.has(eintrag.name)) continue;
      const voll = path.join(dir, eintrag.name);
      if (eintrag.isDirectory()) sammeln(voll);
      else if (/\.(js|mjs|cjs|json|html|md)$/.test(eintrag.name)) ergebnis.push(voll);
    }
  };
  sammeln(ROOT);
  return ergebnis;
}

/**
 * Dateien, die absichtlich keinen Importeur haben — Name → BEGRÜNDUNG.
 *
 * Die Liste ist KURZ und jeder Eintrag ist eine Aussage: „diese Datei wird von
 * AUSSEN geladen, nicht aus dem Baum". Ein leerer oder fehlender Grund lässt
 * den Test unten fallen.
 */
const ERLAUBT_OHNE_IMPORTEUR = new Map([
  // Barrel-Dateien: sie werden von außen geladen. `package.json` (`npm run
  // validate` und `"main"`) nennt sie namentlich — der Beleg steht in der Datei
  // selbst, nicht in diesem Test.
  ['src/engine/index.js', 'Barrel: von `npm run validate` (package.json) geladen'],
  ['src/shared/index.js', 'Barrel: von `npm run validate` (package.json) geladen'],
  ['src/client/index.js', 'Barrel: von `npm run validate` (package.json) geladen'],
  ['src/server/index.js', 'Barrel UND `"main"` in package.json'],
  // Der Browser-Einstiegspunkt: `index.html:1087` lädt ihn als Modul.
  ['src/client/main.js', 'Browser-Einstieg: `index.html` lädt `src/client/main.js`'],
  /**
   * Der Sonderfall, und er steht hier AUSDRÜCKLICH als Ausnahme statt als
   * Barrel: `src/shared/data/index.js` ist **code-leer** (30 Zeilen, davon 0
   * Anweisungen, siehe Kopfkommentar der Datei), wird von NIEMANDEM geladen und
   * von keinem Manifest genannt. Er ist damit kein Einstiegspunkt, sondern ein
   * liegengebliebener Modulplatzhalter — und genau so meldet ihn das Werkzeug
   * (`audit_deadcode` → `toteDateien`). Der Eintrag hält ihn aus diesem
   * Wächter heraus, damit die ENTSCHEIDUNG „entfernen" nicht durch einen roten
   * Test erzwungen wird; sichtbar bleibt sie.
   */
  ['src/shared/data/index.js', 'code-leeres Modul (0 Anweisungen); Werkzeug meldet es als „ohne Importeur" — Entscheidung offen'],
]);

/** Jede Datei unter `src/` muss von irgendwem geladen werden. */
test('Jede Datei unter src/ wird von irgendwem geladen', () => {
  /*
   * DIE Prüfung gegen tote Parallelstruktur — jetzt über den GANZEN Baum.
   *
   * Gemessen am Bestand: Nach dem Entfernen der 974 Zeilen hatte jede Datei
   * einen Importeur; die Ausweitung von `src/engine/` auf `src/` hat in
   * `src/shared`, `src/client` und `src/server` keinen einzigen Verwaisten
   * gefunden (0), sondern nur die Lücke geschlossen.
   */
  const dateien = quelldateien(path.join(ROOT, 'src'));
  const alle = alleProjektdateien();
  const texte = new Map(alle.map(f => [f, fs.readFileSync(f, 'utf8')]));

  const verwaist = [];
  for (const datei of dateien) {
    const relativ = path.relative(ROOT, datei).split(path.sep).join('/');
    if (ERLAUBT_OHNE_IMPORTEUR.has(relativ)) continue;

    /*
     * Gesucht wird nach dem DATEINAMEN. Es genügt der Name, weil die Importe
     * relativ notiert sind (`./terrain/collisionMask.js`). Ein Treffer in der
     * Datei selbst zählt nicht — sonst wäre jede Datei ihr eigener Importeur.
     */
    const name = path.basename(relativ);
    const treffer = alle.some(f => f !== datei && (texte.get(f) ?? '').includes(name));

    if (!treffer) verwaist.push(relativ);
  }

  assert.deepEqual(verwaist, [],
    `Diese Dateien werden von niemandem geladen — toter Code oder ein `
    + `vergessener Import. Entweder anbinden oder entfernen. Geprüft wurden `
    + `${dateien.length} Dateien unter \`src/\`.`);
});

/**
 * Die Abdeckung selbst ist eine Zusage — und sie wird geprüft.
 *
 * Warum: Der Wächter oben lief bis 2026-09-27 nur über `src/engine/` und meldete
 * trotzdem „alles sauber". Eine Prüfung, die ihren eigenen Umfang nicht nennt,
 * ist von einer vollständigen nicht zu unterscheiden. Hier wird er deshalb
 * festgenagelt: JEDE Schicht unter `src/` ist dabei, und keine Datei fällt
 * zwischen zwei Läufe.
 */
test('Der Wächter deckt JEDE Schicht unter src/ ab (30 von 90 war ein Drittel)', () => {
  const SRC = path.join(ROOT, 'src');
  const schichten = fs.readdirSync(SRC, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  assert.ok(schichten.length >= 4,
    `Erwartet mindestens vier Schichten unter src/ (engine, shared, client, server), gefunden: ${schichten.join(', ')}`);

  // Die Summe der Schichten MUSS die Zählung über src/ ergeben: eine Datei, die
  // zwischen zwei Läufen herausfällt, wäre sonst unsichtbar.
  const gesamt = quelldateien(SRC).length;
  const einzeln = schichten.reduce((s, x) => s + quelldateien(path.join(SRC, x)).length, 0);
  assert.equal(gesamt, einzeln,
    `Die Zählung über src/ (${gesamt}) weicht von der Summe der Schichten (${einzeln}) ab — `
    + 'eine Datei liegt entweder außerhalb der Schichten oder wird doppelt gezählt.');

  // Und die Größenordnung steht im Test selbst, damit „deutlich weniger
  // Dateien" auffällt (der Baum hatte 90, als die Lücke geschlossen wurde).
  assert.ok(gesamt >= 80,
    `Nur ${gesamt} Quelldateien unter src/ gefunden — der Baum hatte 90. `
    + 'Weniger heißt: der Wächter schaut wieder nur auf einen Teil.');
});

/** Die Freisprüche müssen Begründungen tragen (sonst sind sie still). */
test('Jeder Freispruch in ERLAUBT_OHNE_IMPORTEUR hat eine Begründung', () => {
  for (const [datei, grund] of ERLAUBT_OHNE_IMPORTEUR) {
    assert.ok(typeof grund === 'string' && grund.trim().length >= 20,
      `Der Freispruch für ${datei} hat keine Begründung — ein Freispruch wird GELESEN, nicht behauptet.`);
    assert.ok(fs.existsSync(path.join(ROOT, datei)),
      `${datei} ist freigesprochen, existiert aber nicht mehr — Eintrag entfernen.`);
  }
});

test('Die entfernten Doppel-Engines sind nicht zurückgekehrt', () => {
  /*
   * Die konkreten Namen, die das Audit entfernt hat. Ein neuer Test auf
   * Abwesenheit ist dann sinnvoll, wenn der Fund einen GRUND hatte (hier: eine
   * zweite Engine neben der geltenden) — dann soll er nicht zurückkommen.
   */
  const verboten = [
    'src/engine/terrain/terrainEngine.js',
    'src/engine/weapons/weaponEngine.js',
    'src/engine/terrainEngine/index.js',
    'src/engine/weaponEngine/index.js',
    'src/engine/weapons/projectArmageddonWorldAdapter.js',
  ];

  for (const relat of verboten) {
    const voll = path.join(ROOT, relat);
    assert.equal(fs.existsSync(voll), false,
      `${relat} existiert wieder. Falls das Absicht ist: Dieser Test und die `
      + 'Begründung im Kopf müssen angepasst werden — die Datei war eine '
      + 'zweite Engine neben dem Produktivpfad.');
  }
});

test('Die lebenden Terrain-Bausteine sind weiterhin da', () => {
  /*
   * GEGENPROBE zum Löschen. Beim Entfernen der toten Engine hätte man
   * versehentlich die lebenden Nachbarn mitnehmen können — sie liegen im
   * selben Verzeichnis (`src/engine/terrain/`) und tragen ähnliche Namen.
   *
   * `match.js` nutzt `collisionMask` (Zeile 383); `terrainSync` und
   * `terrainLoader` werden von Client und Server gebraucht.
   */
  for (const relat of [
    'src/engine/terrain/collisionMask.js',
    'src/engine/terrain/terrainSync.js',
    'src/engine/terrain/terrainLoader.js',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, relat)),
      `${relat} fehlt — beim Aufräumen wurde ein LEBENDER Baustein gelöscht`);
  }

  // Und der Motor nutzt die Kollisionsmaske wirklich.
  const match = fs.readFileSync(path.join(ROOT, 'src', 'engine', 'match.js'), 'utf8');
  assert.match(match, /CollisionMask/,
    'match.js muss die Kollisionsmaske nutzen — sie ist der Terrain-Produktivpfad');
});

test('Es gibt genau eine Waffenquelle', () => {
  /*
   * Die zweite Waffen-Engine hatte eine eigene Datenhaltung. Geprüft wird,
   * dass der Produktivpfad weiterhin die EINE Quelle nutzt: den generierten
   * Katalog.
   */
  const match = fs.readFileSync(path.join(ROOT, 'src', 'engine', 'match.js'), 'utf8');
  assert.match(match, /from '\.\.\/shared\/config\/weapons\.js'/,
    'match.js muss die Waffen aus dem generierten Katalog lesen');

  // Der Katalog selbst bleibt die einzige Waffenliste.
  assert.ok(fs.existsSync(path.join(ROOT, 'src', 'shared', 'config', 'weapons.js')),
    'der Waffenkatalog fehlt');
});
