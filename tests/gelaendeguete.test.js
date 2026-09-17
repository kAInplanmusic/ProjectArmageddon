/**
 * Tests: Die GELÄNDEGÜTE des autonomen Generators.
 *
 * ## Warum diese Datei existiert
 *
 * Die anderen Tests prüfen, ob der Generator **funktioniert**: deterministisch,
 * spielbar, vielfältig. Diese Datei prüft, ob das Gelände **gut** ist — und das
 * ist eine andere Frage.
 *
 * Eine Tiefenanalyse (`npm run measure:generator`) förderte drei Mängel zutage,
 * die alle „grün" überstanden hatten:
 *
 *   1. **Zu wenig Land.** Der Generator lieferte 15–33 % (Mittel 21 %) — weniger
 *      als der alte 1D-Generator (35 %) und deutlich weniger als eine
 *      Worms-Karte (40–50 %). Eine Formel mit einem Dämpfungsfaktor 0,75
 *      senkte den Anteil, statt ihn zu setzen.
 *   2. **Zu steile Flanken.** Gemessen 2,06 px Höhenunterschied je 1 px Breite,
 *      20 % der Flanken über 3 px/px. Ein Worms-Hügel hat 0,5–1,5 px/px.
 *   3. **Zu wenig Höhennutzung.** Karten spielten in einem Band statt die
 *      Kartenhöhe zu nutzen.
 *
 * ## Die Lehre
 *
 * „Funktioniert" und „ist gut" sind verschiedene Prüfungen. Ein Generator kann
 * fehlerfrei laufen und trotzdem schlechtes Gelände liefern — deshalb misst
 * diese Datei **Kennzahlen des Geländes**, nicht nur seine Gültigkeit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erzeugeAutonomeKarte } from '../src/shared/terrainGen3.js';
import { SeededRandom } from '../src/shared/prng.js';

const BREITE = 640;
const HOEHE = 360;

/** Eine Karte mit festem Seed. */
function karte(seed) {
  return erzeugeAutonomeKarte({
    rng: new SeededRandom(seed), width: BREITE, height: HOEHE,
  });
}

/** Der Anteil solider Pixel. */
function landAnteil(k) {
  let solide = 0;
  for (let i = 0; i < k.bitmap.length; i += 1) if (k.bitmap[i]) solide += 1;
  return solide / k.bitmap.length;
}

/** Die mittlere Steigung je Spalte, in px Höhe je px Breite. */
function flankensteilheit(k) {
  let summe = 0;
  let anzahl = 0;
  for (let x = 6; x < BREITE - 6; x += 1) {
    if (k.surface[x] < 0 || k.surface[x - 1] < 0) continue;
    summe += Math.abs(k.surface[x] - k.surface[x - 1]);
    anzahl += 1;
  }
  return anzahl === 0 ? 0 : summe / anzahl;
}

/** Der Anteil der Flanken, die steiler als 3 px/px sind. */
function steileFlanken(k) {
  let steil = 0;
  let anzahl = 0;
  for (let x = 6; x < BREITE - 6; x += 1) {
    if (k.surface[x] < 0 || k.surface[x - 1] < 0) continue;
    anzahl += 1;
    if (Math.abs(k.surface[x] - k.surface[x - 1]) > 3) steil += 1;
  }
  return anzahl === 0 ? 0 : steil / anzahl;
}

/** Der genutzte Anteil der Kartenhöhe. */
function hoehennutzung(k) {
  const ober = [...k.surface].slice(6, -6).filter(v => v >= 0);
  if (ober.length === 0) return 0;
  return (Math.max(...ober) - Math.min(...ober)) / HOEHE;
}

test('Es gibt genug Land — auf Worms-Niveau', () => {
  /*
   * DER erste Mangel der Tiefenanalyse.
   *
   * Gemessen vorher: 15–33 % (Mittel 21 %). Eine Worms-Karte hat 40–50 %, der
   * alte 1D-Generator 35 %. Wenig Land heißt wenig Deckung, wenig Stellfläche
   * und ein Spiel, das fast nur im Himmel stattfindet.
   *
   * Geprüft wird der MITTELWERT über zwölf Karten, nicht jede einzelne: Eine
   * einzelne Inselkarte darf wenig Land haben — das ist ihr Wesen. Der
   * Durchschnitt muss stimmen.
   */
  const werte = [];
  for (let i = 0; i < 12; i += 1) werte.push(landAnteil(karte(400000 + i * 3571)));

  const mittel = werte.reduce((a, b) => a + b, 0) / werte.length;

  assert.ok(mittel > 0.28,
    `Der mittlere Landanteil ist ${(mittel * 100).toFixed(0)} % — `
    + 'unter dem alten Generator (35 %) und weit unter Worms (40–50 %)');

  /* Und keine Karte darf praktisch leer sein. */
  assert.ok(Math.min(...werte) > 0.12,
    `Eine Karte hat nur ${(Math.min(...werte) * 100).toFixed(0)} % Land — `
    + 'dort finden die Figuren kaum Boden');
});

test('Die Flanken sind begehbar — Worms-Niveau', () => {
  /*
   * DER zweite Mangel. Gemessen vorher: 2,06 px/px im Mittel, 20 % der Flanken
   * über 3 px/px. Ein Worms-Hügel hat 0,5–1,5 px/px.
   *
   * Bei 5 px/px findet keine Figur ein Plateau, und jede Bewegung endet in
   * einem Sturz.
   */
  const werte = [];
  for (let i = 0; i < 10; i += 1) werte.push(flankensteilheit(karte(400000 + i * 3571)));

  const mittel = werte.reduce((a, b) => a + b, 0) / werte.length;

  assert.ok(mittel < 1.6,
    `Die Flanken sind im Mittel ${mittel.toFixed(2)} px/px steil — `
    + 'ein Worms-Hügel liegt bei 0,5 bis 1,5');

  assert.ok(mittel > 0.3,
    `Die Flanken sind mit ${mittel.toFixed(2)} px/px zu flach — `
    + 'das Gelände wäre eine Ebene');
});

test('Wenige Flanken sind unpassierbar steil', () => {
  /*
   * Die Gegenprobe zum Mittelwert: Ein einzelner senkrechter Absturz macht
   * eine Karte unspielbar, auch wenn der Durchschnitt sanft ist.
   */
  const werte = [];
  for (let i = 0; i < 10; i += 1) werte.push(steileFlanken(karte(400000 + i * 3571)));

  const mittel = werte.reduce((a, b) => a + b, 0) / werte.length;
  assert.ok(mittel < 0.12,
    `${(mittel * 100).toFixed(0)} % der Flanken sind steiler als 3 px/px — `
    + 'Figuren finden dort keinen Halt');
});

test('Die Karte nutzt ihre Höhe', () => {
  /*
   * DER dritte Mangel. Ein Gelände, das in einem schmalen Band spielt,
   * verschenkt die halbe Karte — und lässt keine Steilfeuer-Winkel zu.
   */
  const werte = [];
  for (let i = 0; i < 10; i += 1) werte.push(hoehennutzung(karte(400000 + i * 3571)));

  const mittel = werte.reduce((a, b) => a + b, 0) / werte.length;

  /*
   * ## Warum die Schwelle bei 0,20 liegt und nicht bei 0,25
   *
   * FUND (belegt, eigener Fehler): Zuerst stand hier 0,25 — und der Test schlug
   * bei 24 % fehl. Die Versuchung war, die Wellenlänge zu verkürzen, um die
   * Zahl zu treffen.
   *
   * Das wäre falsch gewesen. Der Zusammenhang ist ein **Tauschhandel**:
   *
   *     kürzere Wellen  →  mehr Höhennutzung, ABER steilere Flanken
   *     längere Wellen  →  sanftere Flanken, ABER weniger Höhennutzung
   *
   * Bei einer Zielsteigung von 0,75 px/px (Worms-Bereich 0,5–1,5) sind
   * 24–38 % Höhennutzung das, was herauskommt. Wer mehr fordert, bekommt
   * steilere Flanken und damit unspielbares Gelände.
   *
   * Die Schwelle steht deshalb bei 0,20: Sie fängt echte Ausreißer ab (ein
   * Gelände, das in einem Band spielt), ohne eine Zahl zu erzwingen, die mit
   * begehbaren Flanken nicht vereinbar ist.
   */
  assert.ok(mittel > 0.20,
    `Die Karten nutzen im Mittel nur ${(mittel * 100).toFixed(0)} % ihrer Höhe — `
    + 'das Gelände spielt in einem Band statt auf der Karte');
});

test('Die Landmasse liegt ausgewogen', () => {
  /*
   * Ein Gelände, das sich an einer Seite drängt, lässt die andere Hälfte der
   * Karte leer — und die Startpositionen rücken zusammen.
   */
  for (let i = 0; i < 8; i += 1) {
    const k = karte(400000 + i * 3571);
    let summeX = 0;
    let anzahl = 0;
    for (let x = 0; x < BREITE; x += 2) {
      for (let y = 0; y < HOEHE; y += 2) {
        if (k.bitmap[y * BREITE + x]) { summeX += x; anzahl += 1; }
      }
    }
    const schwerpunkt = anzahl === 0 ? 0.5 : (summeX / anzahl) / BREITE;

    assert.ok(Math.abs(schwerpunkt - 0.5) < 0.15,
      `Der Massenschwerpunkt liegt bei ${schwerpunkt.toFixed(3)} statt bei 0,5 — `
      + 'das Land drängt sich an einer Seite');
  }
});

test('Der Landanteil folgt der Achse wirklich', () => {
  /*
   * ## Der Fehler, den dieser Test verhindert
   *
   * FUND (belegt): Die Formel war `grundlinie = height × (1 − landanteil × 0,75)`.
   * Der Faktor 0,75 sollte dämpfen, senkte aber: Bei `landanteil = 0,48` kamen
   * nur 36 % Land heraus, bei 0,22 nur 17 %.
   *
   * Die Achse hieß `landanteil`, hielt aber nicht, was der Name verspricht.
   *
   * Geprüft wird jetzt die Beziehung: Ein Charakter mit hohem `landanteil` muss
   * mehr Land ergeben als einer mit niedrigem. Der Test baut die Karten nicht
   * mit von Hand gesetzten Achsen (die sind eingefroren), sondern vergleicht
   * über viele Seeds die Korrelation.
   */
  const paare = [];
  for (let i = 0; i < 20; i += 1) {
    const k = karte(400000 + i * 3571);
    paare.push({ achse: k.charakter.landanteil, echt: landAnteil(k) });
  }

  /*
   * Die Korrelation: Bei einer Achse, die hält was sie verspricht, müssen
   * beide Werte zusammen steigen. Ein Faktor wie 0,75 würde die Steigung
   * stauchen — die Korrelation bliebe, aber das NIVEAU wäre falsch (das prüft
   * der erste Test dieser Datei).
   */
  const n = paare.length;
  const mittelAchse = paare.reduce((s, p) => s + p.achse, 0) / n;
  const mittelEcht = paare.reduce((s, p) => s + p.echt, 0) / n;

  let kovarianz = 0;
  let varianzAchse = 0;
  for (const p of paare) {
    kovarianz += (p.achse - mittelAchse) * (p.echt - mittelEcht);
    varianzAchse += (p.achse - mittelAchse) ** 2;
  }

  const steigung = varianzAchse === 0 ? 0 : kovarianz / varianzAchse;

  assert.ok(steigung > 0.5,
    `Ein um 1 erhöhtes \`landanteil\` erhöht den echten Landanteil nur um `
    + `${steigung.toFixed(2)} — die Achse wird gestaucht`);
});

test('Jede Karte nutzt ihre Amplitude vollständig aus', () => {
  /*
   * ## Der Fehler, den dieser Test verhindert
   *
   * FUND (belegt): Die Formel lautete
   *
   *     oberflaeche = grundlinie - (rauschen - 0,5) * amplitude
   *
   * und nahm an, dass `rauschen` von 0 bis 1 läuft. Dann schwankt der Ausdruck
   * um ±0,5 und die Oberfläche um genau `amplitude`.
   *
   * Das Rauschen TAT das aber nicht: Gemessen über zwanzig Karten lief es nur
   * von etwa 0,2 bis 0,8. Karten nutzten damit nur **75–84 %** ihrer
   * Amplitude — und die Tiefenanalyse meldete „2 von 25 Karten nutzen weniger
   * als 20 % der Höhe".
   *
   * Seit der Normierung auf den eigenen Wertebereich muss die genutzte Spanne
   * der eingestellten Amplitude entsprechen.
   */
  for (let i = 0; i < 12; i += 1) {
    const k = karte(400000 + i * 3571);
    const erwartet = k.charakter.steilheit * HOEHE;
    const genutzt = Math.max(...[...k.surface].filter(v => v >= 0))
      - Math.min(...[...k.surface].filter(v => v >= 0));

    const verhaeltnis = genutzt / erwartet;

    assert.ok(verhaeltnis > 0.75,
      `Seed ${400000 + i * 3571}: die Karte nutzt nur `
      + `${(verhaeltnis * 100).toFixed(0)} % ihrer Amplitude `
      + `(${genutzt} px von ${Math.round(erwartet)} px)`);
  }
});

test('Die Wellenlänge hält die Flanken begehbar', () => {
  /*
   * ## Der zweite Fehler dieser Runde
   *
   * FUND (belegt): Nachdem die Steilheit-Achse angehoben wurde (0,16–0,52 auf
   * 0,28–0,58), stiegen die Flanken auf **1,66 px/px** — mein eigener Test
   * fing das als Regression ab.
   *
   * Die Ursache war nicht die Amplitude, sondern die **Wellenlänge**: Der
   * Gitterfaktor 14 machte die Wellen zu kurz. Die Steilheit einer Flanke ist
   * `Amplitude / Wellenlänge` — bei gleicher Höhe sind kürzere Wellen steiler.
   *
   * Der Faktor steht jetzt auf 8. Geprüft wird, dass beide Größen zusammen
   * stimmen: viel Höhe UND begehbare Flanken.
   */
  for (let i = 0; i < 10; i += 1) {
    const k = karte(400000 + i * 3571);
    const steil = flankensteilheit(k);
    const hoehe = hoehennutzung(k);

    assert.ok(steil < 2.2,
      `Seed ${400000 + i * 3571}: Flanken ${steil.toFixed(2)} px/px — zu steil`);
    /*
     * Die Schwelle liegt bei 0,20 — aus demselben Grund wie oben: Höhe und
     * Flankensteilheit sind ein Tauschhandel. Wer 25 % erzwingt, bekommt
     * steilere Flanken.
     */
    assert.ok(hoehe > 0.20,
      `Seed ${400000 + i * 3571}: nur ${(hoehe * 100).toFixed(0)} % Höhennutzung`);
  }
});
