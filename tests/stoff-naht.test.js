/**
 * N-28: Stofftexturen kacheln ohne sichtbare Naht.
 *
 * Gemessen wird mit `scripts/stoff-naht.py` (Kantenverhältnis = Sprung über die Kachelkante /
 * Median-Sprung im Inneren, größere Achse). Node hat keinen Bilddecoder, deshalb prüft dieser
 * Test die vom Skript geschriebenen Messwerte (`scripts/stoff-naht-messwerte.json`) und bindet
 * sie per SHA-256 an die Dateien: Wer eine Textur ändert oder hinzufügt, ohne neu zu messen
 * (`python3 scripts/stoff-naht.py messwerte`), bekommt hier Rot.
 *
 * Vorher (Stand vor N-28) lagen über der Schwelle 4,5: firn 11,48, rostmetall 9,69,
 * bimsstein 7,26, teer 6,71, wolkenstein 5,52, alienharz 5,49, moos 5,33,
 * kerkergewoelbe 4,65, schwefelkruste 4,59.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WURZEL = resolve(import.meta.dirname, '..');
const ASSETS = join(WURZEL, 'src/client/assets');
const ORDNER = ['stoff-texturen', 'stoff-texturen-neu'];
const MESSWERTE = JSON.parse(readFileSync(join(WURZEL, 'scripts/stoff-naht-messwerte.json'), 'utf8'));

/** Schwelle des Kantenverhältnisses; nur verschärfen. */
const SCHWELLE = 4.5;
/** Gewollte Fugen bzw. von der Sichtprüfung widerlegt (Begründung im Skript); nicht erweitern ohne Sichtprüfung. */
const AUSNAHMEN = ['keramik', 'kristall', 'metall'];
/** Die fünf Texturen aus N-28 (Audit terrain-spielgefuehl-2026-10-30). */
const N28 = ['moos', 'rostmetall', 'alienharz', 'schwefelkruste', 'firn'];

const dateien = ORDNER.flatMap(o => readdirSync(join(ASSETS, o))
  .filter(f => /\.(jpg|webp)$/.test(f))
  .map(f => `${o}/${f}`));
const nachDatei = new Map(MESSWERTE.texturen.map(t => [t.datei, t]));

test('Messwerte passen zu Schwelle und Ausnahmen des Skripts', () => {
  assert.equal(MESSWERTE.schwelle, SCHWELLE);
  assert.deepEqual(Object.keys(MESSWERTE.ausnahmen).sort(), AUSNAHMEN);
  for (const [name, grund] of Object.entries(MESSWERTE.ausnahmen)) assert.ok(grund.length > 10, `${name}: Grund fehlt`);
});

test('jede Stofftextur ist gemessen, und zwar in ihrer aktuellen Fassung', () => {
  assert.ok(dateien.length >= 100, `nur ${dateien.length} Texturen gefunden`);
  assert.deepEqual([...nachDatei.keys()].sort(), [...dateien].sort(), 'Messwerte veraltet: python3 scripts/stoff-naht.py messwerte');
  for (const d of dateien) {
    const sha = createHash('sha256').update(readFileSync(join(ASSETS, d))).digest('hex');
    assert.equal(nachDatei.get(d).sha256, sha, `${d} geändert, aber nicht neu gemessen (python3 scripts/stoff-naht.py messwerte)`);
  }
});

test('keine Stofftextur hat eine Naht über der Schwelle (außer gewollten Fugen)', () => {
  const genaeht = MESSWERTE.texturen
    .filter(t => !AUSNAHMEN.includes(t.name) && !(t.verhaeltnis < SCHWELLE))
    .map(t => `${t.datei} ${t.verhaeltnis}`);
  assert.deepEqual(genaeht, []);
});

test('N-28: die fünf Texturen aus dem Audit sind nahtlos (Verhältnis unter 2)', () => {
  for (const name of N28) {
    // Nach dem WebP-Wechsel (BUILD-1) hängt die Endung vom Einzelfall ab; der Name ist stabil.
    const eintrag = MESSWERTE.texturen.find(t => t.name === name);
    assert.ok(eintrag, `${name} fehlt`);
    assert.match(eintrag.datei, /\.(jpg|webp)$/);
    assert.ok(eintrag.verhaeltnis < 2, `${name}: ${eintrag.verhaeltnis}`);
  }
});
