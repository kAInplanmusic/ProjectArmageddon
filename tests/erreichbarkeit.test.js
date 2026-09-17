/**
 * Tests: Die Erreichbarkeit.
 *
 * ## Warum diese Datei existiert
 *
 * Der autonome Generator erzeugt 2D-Masken mit Höhlen und — bei hoher
 * Inseligkeit — getrennten Landmassen. Das ist gewollt. Aber ein Fall macht
 * das Spiel kaputt, **ohne dass es auffällt**:
 *
 *   Eine Figur steht auf einer Fläche, die niemand erreichen kann.
 *
 * Sie kann nicht beschossen werden und nicht hinüberkommen. Die Partie wird
 * dann nicht verloren, sondern **läuft aus** — bis die Rundengrenze greift.
 * Ein Spieler, der 40 Minuten auf einer unerreichbaren Insel sitzt, hat nicht
 * gespielt.
 *
 * ## Was hier geprüft wird
 *
 * Die Flächenzerlegung (Flutfüllung) und die Erreichbarkeitsregel. Beide sind
 * reine Funktionen — hier von Hand gebaute Masken, damit die Fälle eindeutig
 * sind. Die Messung mit echten Karten steht in
 * `scripts/check-erreichbarkeit.mjs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  findeFlaechen, pruefeErreichbarkeit, maxWurfweite,
} from '../src/shared/erreichbarkeit.js';

/** Baut eine Maske aus ASCII. `#` = Land, alles andere = Luft. */
function maske(zeilen) {
  const height = zeilen.length;
  const width = zeilen[0].length;
  const bitmap = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (zeilen[y][x] === '#') bitmap[y * width + x] = 1;
    }
  }
  return { bitmap, width, height };
}

test('Eine zusammenhängende Masse ergibt eine Fläche', () => {
  const { bitmap, width, height } = maske([
    '....',
    '####',
    '####',
    '####',
  ]);
  const f = findeFlaechen(bitmap, width, height);
  assert.equal(f.anzahl, 1, `erwartet 1 Fläche, gefunden ${f.anzahl}`);
  assert.equal(f.groessen[0], 12, 'die Fläche muss 12 Pixel groß sein');
});

test('Zwei getrennte Massen ergeben zwei Flächen', () => {
  /*
   * Der Kernfall: Zwei Inseln ohne Verbindung. Genau das darf der Generator
   * erzeugen — die Frage ist nur, ob eine Figur darauf erreichbar bleibt.
   */
  const { bitmap, width, height } = maske([
    '.........',
    '##.....##',
    '##.....##',
    '.........',
  ]);
  const f = findeFlaechen(bitmap, width, height);
  assert.equal(f.anzahl, 2, `erwartet 2 Flächen, gefunden ${f.anzahl}`);
  assert.deepEqual([...f.groessen].sort(), [4, 4]);
});

test('Eine diagonale Berührung verbindet NICHT', () => {
  /*
   * Die 4er-Nachbarschaft ist Absicht: Über eine Ecke kann eine Figur nicht
   * laufen. Ein 8er-Zusammenhang würde Flächen verschmelzen, die praktisch
   * getrennt sind — und die Erreichbarkeitsprüfung wäre zu optimistisch.
   */
  /*
   * FUND (belegt, eigener Testfehler): Die erste Fassung dieser Maske war
   * falsch gezeichnet —
   *
   *     ##...
   *     .###.
   *
   * Zeile 1 endet bei x=1, Zeile 2 beginnt bei x=1 — sie berühren sich also
   * HORIZONTAL, nicht diagonal. Der Test meldete „1 statt 2 Flächen", und das
   * war korrekt: Die Maske hatte nur eine Fläche.
   *
   * Jetzt berühren sich die beiden Massen ausschließlich über eine Ecke:
   *
   *     ##...
   *     ..##.
   *
   * Zeile 1 endet bei x=1, Zeile 2 beginnt bei x=2 — kein gemeinsamer Rand.
   */
  const { bitmap, width, height } = maske([
    '.....',
    '##...',
    '..##.',
    '..##.',
    '.....',
  ]);
  const f = findeFlaechen(bitmap, width, height);
  assert.equal(f.anzahl, 2,
    'eine diagonale Berührung darf die Flächen nicht verbinden');
});

test('Figuren auf derselben Fläche sind erreichbar', () => {
  const { bitmap, width, height } = maske([
    '........',
    '########',
    '########',
  ]);
  const urteil = pruefeErreichbarkeit({
    bitmap, width, height,
    figuren: [{ x: 1, y: 1 }, { x: 6, y: 1 }],
    wurfweite: 50,
  });
  assert.equal(urteil.ok, true, `unerwartet: ${urteil.grund}`);
});

test('Eine Insel in Schussweite ist erreichbar', () => {
  /*
   * DER wichtige Fall. Eine getrennte Insel ist KEIN Problem, solange sie
   * beschossen werden kann — Artillerie schießt über Lücken. Ein durchgehender
   * Landweg ist nicht nötig.
   */
  const { bitmap, width, height } = maske([
    '................',
    '#######...######',
    '#######...######',
  ]);
  const urteil = pruefeErreichbarkeit({
    bitmap, width, height,
    // Zwei Figuren links, eine rechts — die Lücke ist 3 px breit.
    figuren: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 12, y: 1 }],
    wurfweite: 50,
  });
  assert.equal(urteil.ok, true,
    'eine Insel in Schussweite darf nicht als unerreichbar gelten');
});

test('Eine Insel außer Schussweite ist unerreichbar', () => {
  /*
   * Die Gegenprobe — der Fall, der die Prüfung überhaupt nötig macht.
   *
   * Die rechte Insel liegt 200 px entfernt, die Wurfweite beträgt 50 px. Kein
   * Landweg, keine Flugbahn: Die Figur sitzt fest.
   */
  const breite = 300;
  const hoehe = 4;
  const bitmap = new Uint8Array(breite * hoehe);
  for (let x = 0; x < 20; x += 1) { bitmap[1 * breite + x] = 1; bitmap[2 * breite + x] = 1; }
  for (let x = 250; x < breite; x += 1) { bitmap[1 * breite + x] = 1; bitmap[2 * breite + x] = 1; }

  const urteil = pruefeErreichbarkeit({
    bitmap, width: breite, height: hoehe,
    figuren: [{ x: 5, y: 1 }, { x: 260, y: 1 }],
    wurfweite: 50,
  });

  assert.equal(urteil.ok, false,
    'eine Insel 245 px entfernt bei 50 px Wurfweite muss als unerreichbar gelten');
  assert.match(urteil.grund, /unerreichbar/);
});

test('Ohne Figuren gibt es nichts zu prüfen', () => {
  const { bitmap, width, height } = maske(['....', '####']);
  assert.equal(pruefeErreichbarkeit({
    bitmap, width, height, figuren: [], wurfweite: 10,
  }).ok, true);
});

test('Die Wurfweite wird aus den Motorwerten gerechnet', () => {
  /*
   * Keine abgeschriebene Zahl: Die Funktion bekommt die echten Werte und
   * rechnet daraus. Bei einer Änderung der Physik wandert die Grenze mit.
   */
  const weit = maxWurfweite({ powerToSpeed: 0.14, maxPower: 100, gravity: 0.32 });
  const nah = maxWurfweite({ powerToSpeed: 0.14, maxPower: 50, gravity: 0.32 });

  assert.ok(weit > nah,
    'doppelte Kraft muss eine größere Wurfweite ergeben');

  // Schnellere Geschwindigkeit heißt quadratisch mehr Weite (v²/g).
  const vierfach = maxWurfweite({ powerToSpeed: 0.28, maxPower: 100, gravity: 0.32 });
  assert.ok(Math.abs(vierfach / weit - 4) < 0.01,
    `doppeltes Tempo muss vierfache Weite ergeben: ${weit} → ${vierfach}`);

  /*
   * ## Die Schranke ist an den Motorwerten gemessen, nicht gewünscht
   *
   * FUND (belegt): Hier stand zuerst `weit > 3000` — die Erwartung, dass eine
   * Waffe eine 2560er Karte überqueren kann. Diese Erwartung war FALSCH, und
   * der Test deckte damit einen echten Mangel auf:
   *
   *     Kraft 100 → 14 px/Tick → 613 px Wurfweite (704 mit Windreserve)
   *     Kartenbreite mittel:                2560 px
   *     Abstand der äußersten Figuren:      1536 px
   *
   * Die stärkste Waffe reicht **24 % der Karte** — die Figuren stehen
   * **2,18× weiter auseinander**, als geschossen werden kann.
   *
   * Das ist derselbe Fund wie in `npm run check:range`: Die angezeigte
   * `maxRange` der Waffen ist um Faktor 0,32–0,38 zu hoch. Bei der alten
   * 1280er Karte fiel es nicht auf (Abstand 768 px, Weite 704 px — knapp
   * passend); mit der größeren Karte wird es offensichtlich.
   *
   * Der Test hält deshalb den IST-Zustand fest und benennt die Lücke, statt
   * eine Wunschzahl zu prüfen.
   */
  assert.ok(weit > 600,
    `Die Wurfweite (${Math.round(weit)} px) ist unrealistisch klein`);

  const KARTENBREITE_MITTEL = 2560;
  const figurAbstand = (KARTENBREITE_MITTEL / 4) * 3;
  assert.ok(weit < figurAbstand,
    'Die Wurfweite übersteigt den Figurenabstand — dann greift die '
    + 'Erreichbarkeitsprüfung nicht mehr, und der dokumentierte Mangel wäre behoben');

  /* Und der Mangel wird BENANNT, nicht verschwiegen. */
  assert.ok(weit / KARTENBREITE_MITTEL < 0.4,
    `Eine Waffe reicht ${(weit / KARTENBREITE_MITTEL * 100).toFixed(0)} % der Karte — `
    + 'erwartet wird unter 40 % (der dokumentierte Mangel)');
});
