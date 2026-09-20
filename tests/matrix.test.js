/**
 * Die Wirkungs-Übersicht muss zum Katalog passen — und ihre Zahlen müssen die
 * des MOTORS sein, nicht eigene.
 *
 * `docs/matrix-terrain-waffen-wirkung.md` wird von `npm run matrix` erzeugt.
 * Eine handgepflegte Tabelle wäre nach der ersten Datenänderung falsch; diese
 * Datei sorgt dafür, dass sie es nicht werden KANN.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kraterRadius, kraterFlaeche, zerstoerungsgrad, wirkungsziele } from '../scripts/build-matrix.mjs';
import { WEAPONS } from '../src/shared/config/weapons.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOKU = join(root, 'docs', 'matrix-terrain-waffen-wirkung.md');

test('Die Wirkungs-Übersicht ist aktuell (npm run matrix:check)', () => {
  // Der Generator vergleicht seinen Text mit der Datei. Läuft er ohne
  // Fehlschlag, kann die Übersicht nicht veraltet sein.
  execFileSync(process.execPath, [join(root, 'scripts', 'build-matrix.mjs'), '--check'], {
    cwd: root, stdio: 'pipe',
  });
});

test('Die Übersicht nennt jede Waffe — und keine erfundene', () => {
  const text = readFileSync(DOKU, 'utf8');
  const fehlend = WEAPONS.filter(waffe => !text.includes(`| ${waffe.displayName} |`));
  assert.deepEqual(fehlend.map(w => w.displayName), [],
    'Diese Waffen fehlen in der Übersicht');
  assert.ok(text.includes(`**Katalog:** ${WEAPONS.length} Waffen`),
    'Die Kopfzeile muss die Zahl des Katalogs nennen');
  // Die Matrix-Tabelle hat genau eine Zeile je Waffe.
  const tabellenzeilen = text.split('\n')
    .filter(zeile => /^\| \d+ \| /.test(zeile));
  assert.equal(tabellenzeilen.length, WEAPONS.length,
    'Die Wirkungs-Matrix muss eine Zeile je Waffe haben');
});

test('Der Krater der Übersicht ist der Krater des Motors', () => {
  const quelle = readFileSync(
    join(root, 'src', 'engine', 'systems', 'projectileSystem.js'), 'utf8',
  );
  /*
   * Die Regel steht EINMAL im Motor. Weicht die Übersicht ab, nennt sie Zahlen,
   * die niemand erlebt — genau der Fehler, den diese Datei verhindern soll.
   */
  assert.match(quelle, /const craterRadius = terrainDamage > 0\s*\n?\s*\? terrainDamage\s*\n?\s*: blastRadius > 0 \? blastRadius \* 0\.6 : 4;/,
    'Die Kraterregel im Motor hat sich geändert — die Übersicht muss mitziehen');

  for (const waffe of WEAPONS.slice(0, 200)) {
    const erwartet = waffe.terrainDamage > 0
      ? Math.max(2, Math.round(waffe.terrainDamage))
      : waffe.blastRadius > 0
        ? Math.max(2, Math.round(waffe.blastRadius * 0.6))
        : 4;
    assert.equal(kraterRadius(waffe), erwartet,
      `${waffe.displayName}: Kraterradius weicht von der Motorregel ab`);
  }
  // Die Fläche ist ein Kreis, und der Zerstörungsgrad folgt der Fläche.
  const stark = WEAPONS.reduce((a, b) => (kraterRadius(b) > kraterRadius(a) ? b : a));
  assert.ok(kraterFlaeche(stark).flaeche > kraterFlaeche(WEAPONS[0]).flaeche,
    'Die stärkste Waffe muss die größere Fläche haben');
  assert.match(zerstoerungsgrad(stark), /^[1-6] · /,
    'Der Zerstörungsgrad muss eine Klasse sein');
});

test('Jede Waffe hat ein Wirkungsziel oder einen Spezialeffekt', () => {
  const ohneAlles = WEAPONS.filter(waffe => wirkungsziele(waffe).length === 0 && !waffe.special);
  assert.deepEqual(ohneAlles.map(w => w.displayName), [],
    'Waffen ohne jede benannte Wirkung: Sie täten nichts');
  // Und die Übersicht nennt sie als solche, statt sie zu verschweigen.
  const text = readFileSync(DOKU, 'utf8');
  const ohneSchaden = WEAPONS.filter(waffe => wirkungsziele(waffe).length === 0);
  if (ohneSchaden.length > 0) {
    assert.ok(text.includes('Wirkung OHNE Schaden'),
      'Waffen ohne Schaden müssen in der Übersicht als solche stehen');
  }
});

test('Die Terrain-Arten der Übersicht sind die des Generators', async () => {
  const { TERRAIN_PRESETS } = await import('../src/shared/terrainGen.js');
  const text = readFileSync(DOKU, 'utf8');
  for (const preset of Object.keys(TERRAIN_PRESETS)) {
    assert.ok(text.includes(`| ${preset} |`),
      `Terrain-Art ${preset} fehlt in der Übersicht`);
  }
});
