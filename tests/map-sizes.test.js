/**
 * Tests: Kartenformate und Größenstufen (Entscheidung 2026-11-05, Paket A2).
 *
 * Sieben Seitenverhältnisse — 24:9, 9:24, 16:9, 9:16, 4:3, 3:4, 1:1 — jeweils
 * in drei wählbaren Stufen `klein`/`mittel`/`gross`. Über alle Formate einer
 * Stufe ist die FLÄCHE gleich (klein 1280×720 = 921 600 px, mittel 2 560×1 440,
 * groß 3 840×2 160); nur der Zuschnitt ist anders. Das hält die Waffenreichweiten
 * vergleichbar: Ein Schuss über 40 % der Karte bleibt 40 % der Karte.
 *
 * Die 16:9-Maße müssen die BISHERIGEN bleiben — Gelände- und Zustands-Hashes der
 * Goldwert-Tests hängen daran. `krieg` bleibt als Altstufe lesbar (alte
 * Aufzeichnungen), wird aber nicht mehr angeboten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAP_SIZES, MAP_FORMATS, MAP_GROESSEN, MAP_GROESSEN_ALLE, MAP_FORMAT_VORGABE,
  MAP_GROESSE_VORGABE, MAP_FORMAT_ALIASE, mapSizeFor, mapGroesseFuerSpieler,
  ausrichtungFuerFormat, normalisiereFormat, normalisiereGroesse,
  MAP_WIDTH, MAP_HEIGHT, ORIENTATIONS,
} from '../src/engine/match.js';

/** Die Fläche je Stufe, wie sie in docs/anforderungen-2026-11-05.md steht. */
const FLAECHEN = Object.freeze({
  klein: 1280 * 720,
  mittel: 2560 * 1440,
  gross: 3840 * 2160,
  krieg: 5120 * 2880,
});

/** Die bisherigen 16:9-Maße — bitgleich, nicht verhandelbar. */
const ALT_16_9 = Object.freeze({
  klein: { width: 1280, height: 720 },
  mittel: { width: 2560, height: 1440 },
  gross: { width: 3840, height: 2160 },
  krieg: { width: 5120, height: 2880 },
});

test('Es gibt genau die sieben geforderten Formate', () => {
  assert.deepEqual([...MAP_FORMATS], ['24:9', '9:24', '16:9', '9:16', '4:3', '3:4', '1:1']);
  assert.equal(MAP_FORMAT_VORGABE, '16:9', 'Vorgabe bleibt das bisherige Querformat');
});

test('Drei wählbare Stufen; `krieg` nur noch lesbar', () => {
  assert.deepEqual([...MAP_GROESSEN], ['klein', 'mittel', 'gross']);
  assert.deepEqual([...MAP_GROESSEN_ALLE], ['klein', 'mittel', 'gross', 'krieg']);
  assert.equal(MAP_GROESSE_VORGABE, 'mittel');
});

test('16:9 ist in jeder Stufe bitgleich zu den bisherigen Maßen', () => {
  for (const stufe of MAP_GROESSEN_ALLE) {
    assert.deepEqual(MAP_SIZES['16:9'][stufe], ALT_16_9[stufe],
      `16:9/${stufe} hat sich geändert — alte Goldwert-Hashes würden brechen`);
  }
  assert.equal(MAP_WIDTH, 2560);
  assert.equal(MAP_HEIGHT, 1440);
});

test('Alle 28 Maße: ganzzahlig, Fläche je Stufe gleich (±2 %), Seitenverhältnis stimmt', () => {
  /*
   * Die Kernzusage. Geprüft werden alle Formate × alle Stufen (7 × 4 = 28); die
   * drei wählbaren Stufen zusätzlich gegen ihren Sollwert. Die Fläche darf um
   * höchstens 2 % abweichen (ganzzahlige Pixel), das Verhältnis um 1 %.
   */
  for (const format of MAP_FORMATS) {
    const [b, h] = format.split(':').map(Number);
    const soll = b / h;

    for (const stufe of MAP_GROESSEN_ALLE) {
      const { width, height } = MAP_SIZES[format][stufe];
      assert.ok(Number.isInteger(width) && Number.isInteger(height),
        `${format}/${stufe}: keine ganzzahligen Pixel (${width}×${height})`);
      assert.ok(width > 0 && height > 0, `${format}/${stufe}: leere Karte`);

      const flaeche = width * height;
      const abweichung = Math.abs(flaeche - FLAECHEN[stufe]) / FLAECHEN[stufe];
      assert.ok(abweichung <= 0.02,
        `${format}/${stufe}: Fläche ${flaeche} weicht ${(abweichung * 100).toFixed(2)} % von ${FLAECHEN[stufe]} ab`);

      const verhaeltnis = width / height;
      assert.ok(Math.abs(verhaeltnis - soll) / soll <= 0.01,
        `${format}/${stufe}: Seitenverhältnis ${verhaeltnis.toFixed(3)} statt ${soll.toFixed(3)}`);
    }
  }
});

test('Quer- und Hochformat sind dieselben Maße, getauscht', () => {
  const paare = [['24:9', '9:24'], ['16:9', '9:16'], ['4:3', '3:4']];
  for (const [quer, hoch] of paare) {
    for (const stufe of MAP_GROESSEN_ALLE) {
      assert.equal(MAP_SIZES[hoch][stufe].width, MAP_SIZES[quer][stufe].height,
        `${hoch}/${stufe}: Breite ist nicht die Höhe von ${quer}`);
      assert.equal(MAP_SIZES[hoch][stufe].height, MAP_SIZES[quer][stufe].width,
        `${hoch}/${stufe}: Höhe ist nicht die Breite von ${quer}`);
    }
  }
});

test('mapSizeFor liefert Maße je Format UND Stufe', () => {
  for (const format of MAP_FORMATS) {
    for (const stufe of MAP_GROESSEN_ALLE) {
      assert.deepEqual(mapSizeFor(format, stufe), MAP_SIZES[format][stufe]);
    }
  }
});

test('Die Altnamen landscape/portrait zeigen auf 16:9 und 9:16', () => {
  assert.equal(MAP_FORMAT_ALIASE.landscape, '16:9');
  assert.equal(MAP_FORMAT_ALIASE.portrait, '9:16');
  assert.deepEqual(mapSizeFor('landscape', 'mittel'), MAP_SIZES['16:9'].mittel);
  assert.deepEqual(mapSizeFor('portrait', 'klein'), MAP_SIZES['9:16'].klein);
  // Alte Aufzeichnungen tragen nur die Ausrichtung — die Maße müssen dieselben sein.
  assert.deepEqual(mapSizeFor('portrait'), MAP_SIZES['9:16'].mittel);
});

test('mapSizeFor und die Normalisierer fallen tolerant zurück', () => {
  /*
   * Dieselbe Haltung wie in der übrigen Konfiguration: Eine unbekannte Kennung
   * aus einer älteren Fassung darf ein Match nicht verhindern (AGENTS.md §6).
   */
  assert.deepEqual(mapSizeFor('schraeg', 'mittel'), MAP_SIZES['16:9'].mittel,
    'unbekannte Form fällt auf 16:9');
  assert.deepEqual(mapSizeFor('16:9', 'riesig'), MAP_SIZES['16:9'].mittel,
    'unbekannte Stufe fällt auf mittel');
  assert.deepEqual(mapSizeFor(undefined, undefined), MAP_SIZES['16:9'].mittel);

  assert.equal(normalisiereFormat('3:4'), '3:4');
  assert.equal(normalisiereFormat('schraeg'), '16:9');
  assert.equal(normalisiereFormat('schraeg', 'portrait'), '9:16', 'die Ausrichtung bleibt der Rückfall');
  assert.equal(normalisiereGroesse('krieg'), 'krieg', 'Altstufe bleibt lesbar');
  assert.equal(normalisiereGroesse('riesig'), 'mittel');
  assert.equal(normalisiereGroesse(undefined), 'mittel');
});

test('ausrichtungFuerFormat: Hochformate sind hoch, 1:1 gilt als quer', () => {
  assert.equal(ausrichtungFuerFormat('9:16'), 'portrait');
  assert.equal(ausrichtungFuerFormat('9:24'), 'portrait');
  assert.equal(ausrichtungFuerFormat('3:4'), 'portrait');
  assert.equal(ausrichtungFuerFormat('16:9'), 'landscape');
  assert.equal(ausrichtungFuerFormat('24:9'), 'landscape');
  assert.equal(ausrichtungFuerFormat('1:1'), 'landscape');
  assert.equal(ausrichtungFuerFormat('portrait'), 'portrait', 'Altname');
  for (const wert of ORIENTATIONS) {
    assert.ok(ORIENTATIONS.includes(ausrichtungFuerFormat(MAP_FORMAT_ALIASE[wert])), `${wert} liefert keine Ausrichtung`);
  }
});

test('Die Spielerzahl schlägt nur noch eine wählbare Stufe vor (nie `krieg`)', () => {
  let vorher = 0;
  for (const spieler of [2, 4, 8, 12, 16]) {
    const stufe = mapGroesseFuerSpieler(spieler);
    const index = MAP_GROESSEN.indexOf(stufe);
    assert.ok(index >= 0, `Bei ${spieler} Spielern kommt die nicht wählbare Stufe ${stufe}`);
    assert.ok(index >= vorher, `Bei ${spieler} Spielern sinkt die Stufe`);
    vorher = index;
  }
  assert.equal(mapGroesseFuerSpieler(2), 'klein');
  assert.equal(mapGroesseFuerSpieler(16), 'gross');
});

test('Keine Größe überschreitet die Grenze des Drahtformats', () => {
  /*
   * Koordinaten gehen als Int16 mit Faktor 4 über die Leitung — höchstens
   * 32767/4 = 8191,75 px. Eine Karte darüber würde abgeschnitten, ohne dass es
   * auffiele (`shared/protocol.js`, `scripts/check-camera.mjs`).
   */
  const grenze = 32767 / 4;
  for (const format of MAP_FORMATS) {
    for (const stufe of MAP_GROESSEN_ALLE) {
      const { width, height } = MAP_SIZES[format][stufe];
      assert.ok(width <= grenze, `${format}/${stufe}: Breite ${width} > ${Math.round(grenze)} px`);
      assert.ok(height <= grenze, `${format}/${stufe}: Höhe ${height} > ${Math.round(grenze)} px`);
    }
  }
});
