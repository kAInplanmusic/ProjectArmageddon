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
 * dass **jede Datei unter `src/engine/` von irgendwem geladen wird**. Eine
 * Datei, die niemand importiert, fällt damit sofort auf.
 *
 * Ausgenommen sind Barrel-Dateien (`index.js`) — sie werden von Natur aus nur
 * von außen geladen — und Einstiegspunkte.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/** Alle Quelldateien unter einem Verzeichnis. */
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
      const voll = path.join(dir, eintrag.name);
      if (eintrag.isDirectory()) sammeln(voll);
      else if (/\.(js|mjs|cjs|json|html|md)$/.test(eintrag.name)) ergebnis.push(voll);
    }
  };
  sammeln(ROOT);
  return ergebnis;
}

/**
 * Dateien, die absichtlich keinen Importeur haben.
 *
 * Jeder Eintrag braucht eine Begründung. Die Liste ist KURZ — sie darf nicht
 * zum Sammelbecken für vergessenen Code werden.
 */
const ERLAUBT_OHNE_IMPORTEUR = new Set([
  // Barrel-Dateien: sie werden von außen geladen (und `npm run validate` prüft
  // sie als Verkabelungstest).
  'src/engine/index.js',
  'src/shared/index.js',
  'src/shared/data/index.js',
  'src/client/index.js',
  'src/server/index.js',
]);

test('Jede Datei unter src/engine wird von irgendwem geladen', () => {
  /*
   * DIE Prüfung gegen tote Parallelstruktur. Gemessen am Bestand: Nach dem
   * Entfernen der 974 Zeilen hat jede verbleibende Datei einen Importeur.
   */
  const dateien = quelldateien(path.join(ROOT, 'src', 'engine'));
  const alle = alleProjektdateien();

  const verwaist = [];
  for (const datei of dateien) {
    const relativ = path.relative(ROOT, datei).split(path.sep).join('/');
    if (ERLAUBT_OHNE_IMPORTEUR.has(relativ)) continue;

    /*
     * Gesucht wird nach dem Importpfad. Es genügt der DATEINAME, weil die
     * Importe relativ notiert sind (`./terrain/collisionMask.js`). Ein Treffer
     * in der Datei selbst zählt nicht — sonst wäre jede Datei ihr eigener
     * Importeur.
     */
    const name = path.basename(relativ);
    const treffer = alle.some(f => {
      if (f === datei) return false;
      const text = fs.readFileSync(f, 'utf8');
      return text.includes(name);
    });

    if (!treffer) verwaist.push(relativ);
  }

  assert.deepEqual(verwaist, [],
    'Diese Dateien werden von niemandem geladen — toter Code oder ein '
    + 'vergessener Import. Entweder anbinden oder entfernen.');
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
