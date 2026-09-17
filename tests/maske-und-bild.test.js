/**
 * Tests: Die Kollision und das Bild stimmen überein.
 *
 * ## Warum diese Datei existiert
 *
 * Beim Bau des neuen Kartengenerators (2D-Maske mit Höhlen) trat ein Fehler auf,
 * der zwei Ebenen betraf und lange unsichtbar blieb:
 *
 *   Die **Kollision** hatte die Höhlen (mit `isSolid` an fünf Spalten
 *   nachgewiesen). Das **Bild** zeigte eine massive Erdmasse — im Browser
 *   bestätigt. Die Ursache stand im Baker: Er malte von der Oberfläche bis zum
 *   Kartenboden und fragte die Maske nie. Bei einem Höhenfeld ist das richtig
 *   (unter der Oberfläche ist alles fest), bei einer 2D-Maske malt es die
 *   Hohlräume zu.
 *
 * Derselbe Fehler stand im GPU-Shader.
 *
 * ## Was dieser Test sichert
 *
 * Das Bild ist eine **Ableitung** der Maske. Wo die Maske Luft sagt, darf im
 * Bild keine Farbe stehen — sonst sieht der Spieler etwas anderes als die
 * Simulation rechnet. Diese Übereinstimmung ist keine Kleinigkeit: Eine Wand,
 * durch die man hindurchsieht, und ein Loch, das man nicht sieht, sind beide
 * spielverzerrend.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fillGroundPixels, surfaceRows, drawSurfaceEdge } from '../src/client/terrainBaker.js';
import { erzeugeKarte } from '../src/shared/terrainGen2.js';
import { SeededRandom } from '../src/shared/prng.js';

const PALETTE = { surface: [86, 148, 74], deep: [34, 66, 32] };

/** Rendert eine Maske so, wie der Client es tut. */
function rendern(bitmap, width, height) {
  const daten = new Uint8ClampedArray(width * height * 4);
  fillGroundPixels(daten, bitmap, width, height, PALETTE,
    surfaceRows(bitmap, width, height));
  return daten;
}

test('Wo die Maske Luft sagt, ist im Bild keine Farbe', () => {
  /*
   * DIE Prüfung des Fehlers. Jedes Pixel, das in der Maske 0 ist, muss im
   * gerenderten Bild durchsichtig bleiben (Alpha 0).
   */
  const width = 120;
  const height = 90;
  const bitmap = new Uint8Array(width * height);

  // Eine Masse mit einem Hohlraum: Land, Loch, Land.
  for (let x = 0; x < width; x += 1) {
    for (let y = 20; y < height; y += 1) bitmap[y * width + x] = 1;
  }
  for (let x = 30; x < 90; x += 1) {
    for (let y = 40; y < 60; y += 1) bitmap[y * width + x] = 0;
  }

  const daten = rendern(bitmap, width, height);

  let fehler = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const solide = bitmap[y * width + x] === 1;
      const alpha = daten[(y * width + x) * 4 + 3];
      if (solide && alpha === 0) fehler += 1;      // Land nicht gemalt
      if (!solide && alpha !== 0) fehler += 1;     // Loch zugemalt
    }
  }

  assert.equal(fehler, 0,
    `${fehler} Pixel stimmen nicht mit der Maske überein — `
    + 'das Bild zeigt etwas anderes als die Simulation rechnet');
});

test('Der Hohlraum ist auch bei einem echten Generatorlauf sichtbar', () => {
  /*
   * Dieselbe Prüfung mit einer wirklich erzeugten Kavernenkarte — nicht mit
   * einem von Hand gebauten Rechteck.
   */
  const width = 640;
  const height = 360;
  const k = erzeugeKarte({
    rng: new SeededRandom(4242), width, height, typ: 'kavernen',
  });

  const daten = rendern(k.bitmap, width, height);
  const rows = surfaceRows(k.bitmap, width, height);

  /*
   * Gezählt werden durchsichtige Pixel, die mindestens 5 px unter der
   * Oberfläche liegen. Über der Oberfläche ist Luft — das ist normal und kein
   * Hohlraum.
   */
  let sichtbareHoehlen = 0;
  for (let x = 0; x < width; x += 1) {
    if (rows[x] < 0) continue;
    for (let y = rows[x] + 5; y < height; y += 1) {
      if (daten[(y * width + x) * 4 + 3] === 0) sichtbareHoehlen += 1;
    }
  }

  assert.ok(sichtbareHoehlen > 1000,
    `Nur ${sichtbareHoehlen} sichtbare Höhlenpixel — `
    + 'der Baker malt die Hohlräume offenbar wieder zu');
});

test('Eine Karte ohne Höhlen hat keine tiefen Löcher', () => {
  /*
   * Die Gegenprobe. Ein Hügel-Typ hat keinen Hohlraum — unter der Oberfläche
   * muss alles gefüllt sein. Ohne diese Prüfung könnte der Baker Löcher
   * erfinden, wo die Maske keine hat.
   */
  const width = 320;
  const height = 180;
  const k = erzeugeKarte({
    rng: new SeededRandom(4242), width, height, typ: 'huegel',
  });

  const daten = rendern(k.bitmap, width, height);
  const rows = surfaceRows(k.bitmap, width, height);

  let tiefeLoecher = 0;
  for (let x = 0; x < width; x += 1) {
    if (rows[x] < 0) continue;
    for (let y = rows[x] + 5; y < height; y += 1) {
      if (daten[(y * width + x) * 4 + 3] === 0) tiefeLoecher += 1;
    }
  }

  assert.equal(tiefeLoecher, 0,
    `Eine Hügelkarte hat ${tiefeLoecher} durchsichtige Pixel unter der `
    + 'Oberfläche — dort gehört keine hin');
});

test('Die Tiefenfarbe bleibt unter einem Hohlraum erhalten', () => {
  /*
   * Damit ein Loch nicht wie ein heller Fleck wirkt: Die Farbe richtet sich
   * nach dem Abstand zur OBERFLÄCHE, nicht nach dem letzten festen Pixel.
   *
   * FUND (belegt, eigener Testfehler): Zuerst stand hier `assert.equal` — also
   * die Forderung, dass über und unter dem Hohlraum DIESELBE Farbe steht. Das
   * schlug fehl (79 statt 80). Die Forderung war falsch: Die Farbe wird
   * ohnehin je Pixel um einen Schritt dunkler. Worauf es ankommt, ist etwas
   * anderes — dass die Reihe nicht SPRINGT. Dunkel muss es bleiben, und genau
   * das prüft diese Fassung.
   */
  const width = 1;
  const height = 40;
  const bitmap = new Uint8Array(height).fill(1);
  bitmap[20] = 0; // ein Hohlraum in der Mitte

  const daten = rendern(bitmap, width, height);

  const ueber = daten[19 * 4];
  const unter = daten[21 * 4];

  assert.ok(Math.abs(unter - ueber) <= 1,
    `Der Farbwert springt über den Hohlraum hinweg: ${ueber} → ${unter}. `
    + 'Die Tiefenfarbe muss sich fortsetzen, nicht neu beginnen');

  // Und der Hohlraum selbst bleibt leer.
  assert.equal(daten[20 * 4 + 3], 0, 'der Hohlraum muss durchsichtig bleiben');
});

test('Jede Kante bekommt einen Lichtsaum, nicht nur die oberste', () => {
  /*
   * FUND (belegt): `drawSurfaceEdge` hatte ein `break` in der inneren
   * Schleife — es wurde nur die ERSTE Kante je Spalte beleuchtet. Bei einem
   * Höhenfeld ist das richtig; bei einer Maske mit Höhlen blieben Decke und
   * Boden jeder Kammer unbeleuchtet.
   *
   * Im Browser war das der Unterschied zwischen „Höhle" und „Loch im Papier":
   * Die Geländeoberfläche hatte einen Lichtsaum, die Höhlenkanten nicht.
   */
  const width = 1;
  const height = 9;

  /*
   * Eine Spalte mit DREI Kanten: Geländeoberfläche, Kammerdecke, Kammerboden.
   *
   *     y=0  Luft
   *     y=1  Land   <- Kante 1 (Oberfläche)
   *     y=2  Luft
   *     y=3  Land   <- Kante 2 (Kammerdecke)
   *     y=4  Land
   *     y=5  Luft
   *     y=6  Land   <- Kante 3 (Kammerboden)
   *     y=7  Land
   *     y=8  Land
   */
  const bitmap = new Uint8Array([0, 1, 0, 1, 1, 0, 1, 1, 1]);

  // Ein Aufzeichner statt eines echten Canvas — geprüft wird, WO gezeichnet wurde.
  const striche = [];
  const fakeCtx = {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect(x, y, w, h) { striche.push({ x, y, w, h }); },
  };

  drawSurfaceEdge(fakeCtx, bitmap, width, height, [100, 150, 60]);

  const anStellen = striche.map(s => s.y).sort((a, b) => a - b);

  assert.deepEqual(anStellen, [1, 3, 6],
    `Es wurden ${anStellen.length} Kanten beleuchtet (y=${anStellen.join(', ')}) — `
    + 'erwartet werden drei (Oberfläche, Kammerdecke, Kammerboden)');
});
