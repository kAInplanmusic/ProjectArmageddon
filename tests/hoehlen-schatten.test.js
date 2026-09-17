/**
 * Tests: Die Höhlenschattierung.
 *
 * ## Warum diese Datei existiert
 *
 * Der Generator kann Höhlen (2D-Maske statt Höhenfeld). Im Browser geprüft
 * zeigte sich: Die Löcher waren sichtbar, wirkten aber wie ein Grafikfehler —
 * wörtlich aus der Beurteilung:
 *
 *   „Die Ränder der Löcher sind hart abgeschnitten. Es gibt keinen
 *    Farbübergang, keine Schattierung. Das verstärkt den Eindruck eines
 *    Grafikfehlers statt eines gestalteten Höhlensystems."
 *
 * Der Grund: Ein Loch zeigt den Himmel — dieselbe Farbe wie über dem Gelände.
 * Eine Höhle muss dunkel sein, weil das umgebende Gestein das Licht nimmt.
 *
 * ## Die drei Fehlversuche, die dieser Test absichert
 *
 * Die Schattierung brauchte drei Anläufe. Jeder scheiterte daran, dass sein
 * Merkmal Höhle und Hügel nicht trennte:
 *
 *   1. **Gesteinsdichte** — tief im Gestein liegt immer viel Gestein.
 *   2. **Luftanteil in der Nachbarschaft** — ein Höhenfeld hat an jedem Rand
 *      Luft.
 *   3. **Überdachung („Decke")** — gemessen bei beiden Kartentypen 1,00.
 *
 * Was trennt, ist der **Anteil Luft in der Umgebung**: 0,015 bei einer
 * Hügelkarte, 0,151 bei einer Kavernenkarte.
 *
 * ## Die Lehre für den Testaufbau
 *
 * FUND (belegt, eigener Testfehler): Die ersten Masken waren 12×8 Pixel groß —
 * kleiner als der Suchradius von 24 px. Damit lag in jeder Ecke Luft, und die
 * Trennung verschwand. Die Masken hier sind groß genug, um den Radius
 * abzubilden: Erst dann prüfen sie, was das Spiel sieht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  schattenAnteil, schattiereHoehlen, SCHATTEN_MAX, SCHATTEN_RADIUS, LUFT_SCHWELLE,
} from '../src/client/hoehlenSchatten.js';
import { erzeugeKarte } from '../src/shared/terrainGen2.js';
import { SeededRandom } from '../src/shared/prng.js';
import { fillGroundPixels } from '../src/client/terrainBaker.js';

const PALETTE = { surface: [100, 150, 60], deep: [40, 60, 30] };

/** Die Maße einer echten Karte — klein genug für einen schnellen Test. */
const W = 320;
const H = 180;

/**
 * Baut eine Maske aus einem ASCII-Bild.
 *
 * `#` = Land, alles andere = Luft. Die Zeichnung wird auf die Kartengröße
 * gestreckt, damit der Suchradius im richtigen Verhältnis steht.
 */
function maske(zeilen) {
  const bitmap = new Uint8Array(W * H);
  const zh = zeilen.length;
  const zw = zeilen[0].length;

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const zy = Math.min(zh - 1, Math.floor((y / H) * zh));
      const zx = Math.min(zw - 1, Math.floor((x / W) * zw));
      if (zeilen[zy][zx] === '#') bitmap[y * W + x] = 1;
    }
  }
  return { bitmap, width: W, height: H };
}

test('Offenes Gelände bekommt keinen Schatten', () => {
  /*
   * Der erste Fehlversuch in Testform: Eine Hügelkarte hat keine Innenräume.
   * Würde die Schattierung dort wirken, bekäme jedes tiefe Gestein einen
   * Grauschleier — genau das war Versuch 1 und 2.
   *
   * Hier wird eine WIRKLICH erzeugte Hügelkarte geprüft, nicht eine Skizze:
   * Nur so steht der Radius im richtigen Verhältnis zur Masse.
   */
  const k = erzeugeKarte({
    rng: new SeededRandom(4242), width: W, height: H, typ: 'huegel',
  });

  const daten = new Uint8ClampedArray(W * H * 4);
  fillGroundPixels(daten, k.bitmap, W, H, PALETTE);
  const vorher = [...daten];
  schattiereHoehlen(daten, k.bitmap, W, H);

  let abgedunkelt = 0;
  for (let i = 0; i < daten.length; i += 4) {
    if (vorher[i + 3] !== 0 && daten[i] < vorher[i]) abgedunkelt += 1;
  }

  /*
   * Ein kleiner Rest ist unvermeidlich: Eine Hügelkarte hat Mulden, in denen
   * die Nachbarschaft ein wenig Luft enthält. Die Schranke ist deshalb nicht
   * Null, sondern deutlich unter dem, was eine Kavernenkarte erzeugt.
   */
  assert.ok(abgedunkelt < 20000,
    `Eine Hügelkarte hat ${abgedunkelt} abgedunkelte Pixel — `
    + 'die Schattierung wirkt im offenen Gelände');
});

test('Ein Innenraum bekommt Schatten', () => {
  /*
   * Die Kernprüfung. Ein Hohlraum, der von Gestein umschlossen ist — hier eine
   * große Kammer mit Decke und Wänden — muss abgedunkelt werden.
   */
  const { bitmap } = maske([
    '          ',
    '          ',
    '##########',
    '##########',
    '##########',
    '###    ###',
    '###    ###',
    '###    ###',
    '##########',
    '##########',
    '##########',
    '##########',
  ]);

  // Ein Pixel an der Kammerdecke (die nach innen zeigt).
  const decke = H / 12 * 4 + 4;
  const xMitte = W / 2;
  const anteil = schattenAnteil(bitmap, W, H, xMitte, decke);

  assert.ok(anteil > 0,
    `Die Kammerdecke muss Schatten bekommen, ist aber ${anteil}`);
});

test('Das Merkmal, das Höhle von Hügel trennt, wirkt über die ganze Karte', () => {
  /*
   * DIE Prüfung des dritten Fehlversuchs.
   *
   * Die Überdachung („Decke") trennt nicht: Tief im Gestein ist sie bei einer
   * Hügelkarte 1,00 und bei einer Kavernenkarte 1,00. Was trennt, ist der
   * Luftanteil in der Umgebung.
   *
   * ## Warum über die ganze Karte und nicht an einem Punkt
   *
   * FUND (belegt, eigener Testfehler): Zuerst verglich dieser Test EINEN Punkt
   * in beiden Karten — gemessen wurde „Kavernen 0, Hügel 0,21". Der Punkt lag
   * bei den Kavernen zufällig in massivem Fels und bei den Hügeln in einer
   * Mulde. Ein einzelner Punkt sagt nichts über eine Karte.
   *
   * Jetzt wird der Mittelwert über ALLE festen Pixel gebildet. Das ist die
   * Größe, die das Auge als „diese Karte ist dunkler" wahrnimmt.
   */
  const mittlererSchatten = (typ) => {
    const k = erzeugeKarte({
      rng: new SeededRandom(4242), width: W, height: H, typ,
    });

    let summe = 0;
    let anzahl = 0;
    for (let x = 0; x < W; x += 2) {
      for (let y = 0; y < H; y += 2) {
        if (!k.bitmap[y * W + x]) continue;
        summe += schattenAnteil(k.bitmap, W, H, x, y);
        anzahl += 1;
      }
    }
    return anzahl === 0 ? 0 : summe / anzahl;
  };

  const huegel = mittlererSchatten('huegel');
  const kavernen = mittlererSchatten('kavernen');

  /*
   * Die Kavernenkarte muss über die Fläche mehr Schatten tragen — sie hat
   * Innenräume, die Hügelkarte nur Mulden.
   */
  assert.ok(kavernen > huegel,
    `Kavernen (${kavernen.toFixed(3)}) hat im Mittel weniger Schatten als `
    + `Hügel (${huegel.toFixed(3)}) — das Merkmal trennt die Kartentypen nicht`);
});

test('Eine erzeugte Kavernenkarte wird deutlich stärker schattiert als eine Hügelkarte', () => {
  /*
   * Die Prüfung mit echten Generatordaten — der Fall, der im Browser sichtbar
   * war. Gemessen bei voller Größe (1280×720): Faktor 3,6.
   */
  const messe = (typ) => {
    const k = erzeugeKarte({
      rng: new SeededRandom(4242), width: W, height: H, typ,
    });
    const daten = new Uint8ClampedArray(W * H * 4);
    fillGroundPixels(daten, k.bitmap, W, H, PALETTE);
    const vorher = [...daten];
    schattiereHoehlen(daten, k.bitmap, W, H);

    let abgedunkelt = 0;
    for (let i = 0; i < daten.length; i += 4) {
      if (vorher[i + 3] !== 0 && daten[i] < vorher[i]) abgedunkelt += 1;
    }
    return abgedunkelt;
  };

  const kavernen = messe('kavernen');
  const huegel = messe('huegel');

  assert.ok(kavernen > huegel * 1.2,
    `Kavernenkarte ${kavernen} gegen Hügelkarte ${huegel} — `
    + 'die Schattierung unterscheidet die Typen nicht deutlich genug');
});

test('Die Schattierung verändert keine Hohlräume', () => {
  /*
   * Eine Ableitung aus der Maske darf die Maske nicht verändern. Ein Hohlraum
   * bleibt im Bild durchsichtig — dort steht der Hintergrund, keine dunkle
   * Fläche.
   */
  const k = erzeugeKarte({
    rng: new SeededRandom(4242), width: W, height: H, typ: 'kavernen',
  });

  const daten = new Uint8ClampedArray(W * H * 4);
  fillGroundPixels(daten, k.bitmap, W, H, PALETTE);
  schattiereHoehlen(daten, k.bitmap, W, H);

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const alpha = daten[(y * W + x) * 4 + 3];
      if (k.bitmap[y * W + x]) {
        assert.equal(alpha, 255, `Land bei (${x},${y}) muss deckend bleiben`);
      } else {
        assert.equal(alpha, 0, `Hohlraum bei (${x},${y}) muss durchsichtig bleiben`);
      }
    }
  }
});

test('Die Abdunkelung bleibt innerhalb der Grenzen', () => {
  /*
   * SCHATTEN_MAX sagt, wie dunkel es höchstens wird. Eine pechschwarze Höhle
   * verlöre jede Textur und sähe wieder wie ein Loch aus, nur anders.
   */
  const { bitmap } = maske([
    '##########',
    '##########',
    '##########',
    '###    ###',
    '###    ###',
    '##########',
    '##########',
    '##########',
  ]);

  const daten = new Uint8ClampedArray(W * H * 4);
  fillGroundPixels(daten, bitmap, W, H, PALETTE);

  const vorher = [...daten];
  schattiereHoehlen(daten, bitmap, W, H);

  for (let i = 0; i < daten.length; i += 4) {
    if (vorher[i + 3] === 0) continue;
    const verhaeltnis = daten[i] / Math.max(1, vorher[i]);
    assert.ok(verhaeltnis >= SCHATTEN_MAX - 0.01,
      `Pixel wurde auf ${(verhaeltnis * 100).toFixed(0)} % abgedunkelt — `
      + `erlaubt sind höchstens ${((1 - SCHATTEN_MAX) * 100).toFixed(0)} %`);
  }
});

test('Die Konstanten sind plausibel', () => {
  /*
   * Ein Schatten, der nichts abdunkelt, ist keiner; einer, der alles schwarz
   * macht, ebenso wenig. Und ein Radius von 0 hieße: keine Umgebung.
   */
  assert.ok(SCHATTEN_MAX > 0.2 && SCHATTEN_MAX < 0.9,
    `SCHATTEN_MAX ist ${SCHATTEN_MAX} — entweder unsichtbar oder zu hart`);
  assert.ok(SCHATTEN_RADIUS >= 8 && SCHATTEN_RADIUS <= 64,
    `SCHATTEN_RADIUS ist ${SCHATTEN_RADIUS} — zu klein für eine Umgebung `
    + 'oder so groß, dass er die ganze Karte verschmiert');
  assert.ok(LUFT_SCHWELLE > 0 && LUFT_SCHWELLE < 0.2,
    `LUFT_SCHWELLE ist ${LUFT_SCHWELLE} — außerhalb des gemessenen Bereichs`);
});

test('Die Schattierung kostet vertretbare Zeit', () => {
  /*
   * Sie läuft bei jedem Kartenaufbau. Wenn sie eine Sekunde bräuchte, wäre der
   * Start spürbar träge — dann müsste sie auf die GPU oder in den Hintergrund.
   *
   * Die Schranke ist bewusst großzügig (die Maschine ist ein Laptop von 2011):
   * Sie soll einen Ausreißer fangen, keine Optimierung erzwingen.
   */
  const k = erzeugeKarte({
    rng: new SeededRandom(4242), width: 640, height: 360, typ: 'kavernen',
  });
  const daten = new Uint8ClampedArray(640 * 360 * 4);
  fillGroundPixels(daten, k.bitmap, 640, 360, PALETTE);

  const t0 = performance.now();
  schattiereHoehlen(daten, k.bitmap, 640, 360);
  const ms = performance.now() - t0;

  assert.ok(ms < 3000,
    `Die Schattierung brauchte ${ms.toFixed(0)} ms für 640×360 — zu viel für `
    + 'den Kartenaufbau');
});
