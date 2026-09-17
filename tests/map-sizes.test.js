/**
 * Tests: Kartengrößen und Ausrichtungen.
 *
 * ## Was sich geändert hat
 *
 * Die Karte war **immer genau so groß wie der Bildschirm** (1280×720). Jetzt
 * gibt es vier Größenstufen (klein bis Krieg), und eine Kamera zeigt einen
 * Ausschnitt statt der ganzen Karte.
 *
 * Die Struktur hat sich damit geändert: `MAP_SIZES.landscape` ist keine Größe
 * mehr, sondern eine **Tabelle von Stufen**. Die Tests darunter nehmen das an.
 *
 * ## Was gleich geblieben ist
 *
 * Die Beziehung zwischen den Ausrichtungen: Quer- und Hochformat derselben
 * Stufe haben **dieselbe Fläche**. Der Grund steht seit jeher im Code — die
 * Reichweiten sind in Kartenpixeln angegeben und sollen in beiden Ausrichtungen
 * gleich wirken. Dieser Test prüft die Beziehung weiterhin, nur je Stufe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAP_SIZES, MAP_GROESSEN, mapSizeFor, mapGroesseFuerSpieler,
  MAP_WIDTH, MAP_HEIGHT, ORIENTATIONS,
} from '../src/engine/match.js';

test('Jede Größenstufe hat in beiden Ausrichtungen dieselbe Fläche', () => {
  /*
   * Die Kernbeziehung. Ungleiche Fläche würde die Waffenbalance zwischen
   * Quer- und Hochformat verschieben — eine Waffe, die quer 40 % der Karte
   * erreicht, erreichte hoch eine andere Strecke.
   */
  for (const stufe of MAP_GROESSEN) {
    const quer = MAP_SIZES.landscape[stufe];
    const hoch = MAP_SIZES.portrait[stufe];

    assert.ok(quer && hoch, `Stufe "${stufe}" fehlt in einer Ausrichtung`);
    assert.equal(quer.width * quer.height, hoch.width * hoch.height,
      `Stufe "${stufe}": ungleiche Fläche zwischen den Ausrichtungen`);
    assert.equal(hoch.width, quer.height, `Stufe "${stufe}": Breite/Höhe nicht getauscht`);
    assert.equal(hoch.height, quer.width, `Stufe "${stufe}": Höhe/Breite nicht getauscht`);
  }
});

test('Die Größenstufen wachsen in beiden Achsen', () => {
  /*
   * Eine Stufe, die in einer Achse kleiner wäre als die vorige, wäre keine
   * Steigerung. Der Sinn der Stufen ist, dass „Krieg" mehr Welt bedeutet als
   * „klein".
   */
  for (const ausrichtung of ORIENTATIONS) {
    for (let i = 1; i < MAP_GROESSEN.length; i += 1) {
      const vorher = MAP_SIZES[ausrichtung][MAP_GROESSEN[i - 1]];
      const jetzt = MAP_SIZES[ausrichtung][MAP_GROESSEN[i]];

      assert.ok(jetzt.width > vorher.width,
        `${ausrichtung}: "${MAP_GROESSEN[i]}" ist nicht breiter als "${MAP_GROESSEN[i - 1]}"`);
      assert.ok(jetzt.height > vorher.height,
        `${ausrichtung}: "${MAP_GROESSEN[i]}" ist nicht höher als "${MAP_GROESSEN[i - 1]}"`);
    }
  }
});

test('Das Seitenverhältnis bleibt 16:9 in jeder Stufe', () => {
  /*
   * Damit die Kamera ohne Verzerrung arbeiten kann und die Kulissen (die für
   * 16:9 erzeugt sind) passen.
   */
  for (const ausrichtung of ORIENTATIONS) {
    for (const stufe of MAP_GROESSEN) {
      const { width, height } = MAP_SIZES[ausrichtung][stufe];
      const verhaeltnis = width / height;
      const erwartet = ausrichtung === 'landscape' ? 16 / 9 : 9 / 16;
      assert.ok(Math.abs(verhaeltnis - erwartet) < 0.01,
        `${ausrichtung}/${stufe}: Seitenverhältnis ${verhaeltnis.toFixed(3)} statt ${erwartet.toFixed(3)}`);
    }
  }
});

test('mapSizeFor liefert Maße je Ausrichtung UND Stufe', () => {
  for (const ausrichtung of ORIENTATIONS) {
    for (const stufe of MAP_GROESSEN) {
      assert.deepEqual(mapSizeFor(ausrichtung, stufe), MAP_SIZES[ausrichtung][stufe]);
    }
  }
});

test('mapSizeFor fällt tolerant zurück', () => {
  /*
   * Dieselbe Haltung wie in der übrigen Konfiguration: Eine unbekannte
   * Kennung aus einer älteren Fassung darf ein Match nicht verhindern.
   */
  assert.deepEqual(mapSizeFor('schraeg', 'mittel'), MAP_SIZES.landscape.mittel,
    'unbekannte Ausrichtung fällt auf Querformat');
  assert.deepEqual(mapSizeFor('landscape', 'riesig'), MAP_SIZES.landscape.mittel,
    'unbekannte Stufe fällt auf die Vorgabe');
  assert.deepEqual(mapSizeFor(undefined, undefined), MAP_SIZES.landscape.mittel);
});

test('Die Spielerzahl bestimmt eine Stufe', () => {
  /*
   * Die Zuordnung ist ein Vorschlag, keine Regel — die Lobby kann sie
   * überschreiben. Geprüft wird, dass sie monoton wächst: Mehr Spieler heißt
   * nie eine kleinere Karte.
   */
  let vorher = 0;
  for (const spieler of [2, 4, 8, 12, 16]) {
    const stufe = mapGroesseFuerSpieler(spieler);
    const index = MAP_GROESSEN.indexOf(stufe);
    assert.ok(index >= vorher,
      `Bei ${spieler} Spielern sinkt die Stufe von ${MAP_GROESSEN[vorher]} auf ${stufe}`);
    vorher = index;
  }

  assert.equal(mapGroesseFuerSpieler(2), 'klein');
  assert.equal(mapGroesseFuerSpieler(16), 'krieg');
});

test('Die alten Konstanten zeigen auf die Vorgabestufe', () => {
  /*
   * Der Server und zahlreiche Tests nutzen `MAP_WIDTH`/`MAP_HEIGHT` weiterhin.
   * Sie müssen auf eine gültige Stufe zeigen — und die Vorgabe der Lobby ist
   * 2 Teams × 2 Spieler, also die mittlere Stufe.
   */
  assert.equal(MAP_WIDTH, MAP_SIZES.landscape.mittel.width);
  assert.equal(MAP_HEIGHT, MAP_SIZES.landscape.mittel.height);
  assert.ok(MAP_WIDTH > 0 && MAP_HEIGHT > 0);
});

test('Keine Größe überschreitet die Grenze des Drahtformats', () => {
  /*
   * Koordinaten gehen als Int16 mit Faktor 4 über die Leitung — die größte
   * darstellbare Koordinate ist 8192 px (siehe `scripts/check-camera.mjs`).
   * Eine Karte darüber würde abgeschnitten, ohne dass es auffiele.
   */
  const grenze = 32767 / 4;

  for (const ausrichtung of ORIENTATIONS) {
    for (const stufe of MAP_GROESSEN) {
      const { width, height } = MAP_SIZES[ausrichtung][stufe];
      assert.ok(width <= grenze,
        `${ausrichtung}/${stufe}: Breite ${width} überschreitet ${Math.round(grenze)} px`);
      assert.ok(height <= grenze,
        `${ausrichtung}/${stufe}: Höhe ${height} überschreitet ${Math.round(grenze)} px`);
    }
  }
});
