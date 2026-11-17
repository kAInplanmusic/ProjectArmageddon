import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const skript = new URL('../scripts/letzter-halt-bestand.mjs', import.meta.url);

test('Letzter Halt: Bestandsmessung liefert reproduzierbare echte Katalogdaten', () => {
  const ausfuehren = () => spawnSync(process.execPath, [skript.pathname], { encoding: 'utf8' });
  const erster = ausfuehren();
  assert.equal(erster.status, 0, `Bestandsmessung fehlt oder scheitert: ${erster.stderr}`);
  const zweiter = ausfuehren();
  assert.equal(zweiter.status, 0, zweiter.stderr);

  const bericht1 = JSON.parse(erster.stdout);
  const bericht2 = JSON.parse(zweiter.stdout);

  // Vergleiche alle Felder außer zeit (der sich zwischen Aufrufen unterscheidet)
  const vergleiche = (a, b, pfad = '') => {
    for (const key of Object.keys(a)) {
      if (key === 'zeit') continue; // Zeit ist bewusst nicht vergleichbar
      assert.deepStrictEqual(a[key], b[key], `Mismatch bei ${pfad}.${key}`);
    }
  };
  vergleiche(bericht1, bericht2, 'bericht');

  // Assertions für wichtige Strukturen
  assert.equal(bericht1.schema, 1);
  assert.equal(bericht1.herkunft, 'Live-Import der Projektkataloge; keine Partienmessung');
  assert.equal(bericht1.zaehler.fraktionen, bericht1.fraktionen.length);
  assert.equal(bericht1.zaehler.biome, bericht1.biome.length);
  assert.equal(bericht1.zaehler.stoffe, bericht1.stoffe.length);
  assert.ok(bericht1.fraktionen.length > 0);
  assert.ok(bericht1.biome.length > 0);
  assert.match(bericht1.quellHash, /^[a-f0-9]{64}$/);
});