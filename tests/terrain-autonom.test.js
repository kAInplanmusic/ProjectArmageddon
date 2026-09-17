/**
 * Tests: Der autonome Kartengenerator.
 *
 * ## Die Vorgabe
 *
 * „Kartengenerator hoch 10, aber ohne dass Menschen Einfluss nehmen können."
 *
 * Das ist eine Architektur-Aussage: Es gibt **keine Einstellung**, mit der ein
 * Spieler die Karte formt. Kein Regler, kein Typ-Auswahlfeld, kein Preset.
 * Der Seed entscheidet alles.
 *
 * ## Was hier geprüft wird
 *
 * Zwei Eigenschaften, die zusammen „autonom" ausmachen — und die beide
 * scheitern können:
 *
 *   1. **Kein Eingriff** — die Funktion nimmt keinen Typ, kein Preset, keine
 *      Schablone entgegen. Ein zusätzlicher Parameter wäre ein Einfallstor für
 *      eine Einstellung, die es laut Vorgabe nicht geben soll.
 *   2. **Autonom, aber spielbar** — die gezogenen Karten müssen den
 *      Spielbarkeitsregeln genügen. Ein Zufall, der eine Karte ohne Land
 *      erzeugt, ist kein Zufall, sondern ein Fehler.
 *
 * Dazu kommt die Grundzusage des Projekts: **Determinismus.** Derselbe Seed
 * ergibt dieselbe Karte — Server und Client bauen sie getrennt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  erzeugeAutonomeKarte, zieheCharakter, pruefeSpielbarkeit,
  CHARAKTER_ACHSEN,
} from '../src/shared/terrainGen3.js';
import { SeededRandom } from '../src/shared/prng.js';

const BREITE = 320;
const HOEHE = 180;

/** Eine Karte mit festem Seed. */
function karte(seed, width = BREITE, height = HOEHE) {
  return erzeugeAutonomeKarte({
    rng: new SeededRandom(seed), width, height,
  });
}

test('Der Generator nimmt keinen Typ und kein Preset', () => {
  /*
   * DIE Prüfung der Vorgabe. Wer einen Typ mitgibt, muss ignoriert werden —
   * sonst gäbe es doch einen Weg, die Karte zu formen.
   */
  const a = erzeugeAutonomeKarte({
    rng: new SeededRandom(777), width: BREITE, height: HOEHE, typ: 'kavernen',
  });
  const b = karte(777);

  assert.deepEqual([...a.bitmap], [...b.bitmap],
    'Ein übergebener Typ hat die Karte verändert — der Generator ist nicht autonom');

  const c = erzeugeAutonomeKarte({
    rng: new SeededRandom(777), width: BREITE, height: HOEHE, preset: 'mountains',
  });
  assert.deepEqual([...c.bitmap], [...b.bitmap],
    'Ein übergebenes Preset hat die Karte verändert');
});

test('Derselbe Seed ergibt dieselbe Karte', () => {
  /*
   * Die Grundzusage des Projekts gilt auch hier — und sie ist bei einem
   * Generator, der selbst würfelt, nicht selbstverständlich: Jeder zusätzliche
   * RNG-Zug verschiebt alle folgenden.
   */
  const a = karte(4242);
  const b = karte(4242);

  assert.deepEqual([...a.bitmap], [...b.bitmap]);
  assert.deepEqual([...a.surface], [...b.surface]);
  assert.equal(a.wasserY, b.wasserY);
  assert.deepEqual(a.charakter, b.charakter);
});

test('Verschiedene Seeds ergeben verschiedene Karten', () => {
  /*
   * Die Gegenprobe. Ein Generator, der für jeden Seed dieselbe Karte liefert,
   * wäre deterministisch und nutzlos.
   */
  const a = karte(1000);
  const b = karte(2000);
  assert.notDeepEqual([...a.bitmap], [...b.bitmap]);
});

test('Alle Karten sind spielbar — über viele Seeds', () => {
  /*
   * Der Kern der Autonomie: Freiheit ohne Spielbarkeit wäre ein Fehler.
   *
   * Geprüft werden 40 Seeds. Findet sich auch nur eine unspielbare Karte, ist
   * die Prüfung im Generator zu schwach — und der Spieler bekäme in einer von
   * vierzig Partien eine kaputte Karte.
   */
  const fehler = [];

  for (let i = 0; i < 40; i += 1) {
    const k = karte(100000 + i * 7919);
    const urteil = pruefeSpielbarkeit(k.kennzahlen);
    if (!urteil.ok) fehler.push(`Seed ${100000 + i * 7919}: ${urteil.grund}`);
  }

  assert.deepEqual(fehler, [],
    `Unspielbare Karten gefunden:\n${fehler.slice(0, 5).join('\n')}`);
});

test('Der Generator erzeugt echte Vielfalt, nicht Varianten einer Karte', () => {
  /*
   * Der Unterschied zwischen „verschiedene Bitmaps" und „verschiedene Karten".
   *
   * Zwei Karten können sich in jedem Pixel unterscheiden und trotzdem dieselbe
   * sein: immer 30 % Land, immer dieselbe Höhe. Gemessen wird deshalb die
   * **Streuung der Kennzahlen** über viele Seeds.
   */
  const land = [];
  const hohlraum = [];

  for (let i = 0; i < 30; i += 1) {
    const k = karte(50000 + i * 3313);
    land.push(k.kennzahlen.landAnteil);
    hohlraum.push(k.kennzahlen.hohlraum);
  }

  const streuung = (a) => {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
  };

  assert.ok(streuung(land) > 0.02,
    `Die Landanteile streuen nur mit ${streuung(land).toFixed(4)} — `
    + 'die Karten ähneln einander zu stark');

  assert.ok(streuung(hohlraum) > 0.02,
    `Die Hohlräume streuen nur mit ${streuung(hohlraum).toFixed(4)} — `
    + 'es gibt offenbar keine durchlöcherten Karten');
});

test('Es gibt massive UND durchlöcherte Karten', () => {
  /*
   * Die Extreme müssen vorkommen. Ein Generator, dessen Höhlung immer um 0,2
   * liegt, nutzt seinen Spielraum nicht — und die Vorgabe „hoch 10" wäre nicht
   * erfüllt.
   */
  let massiv = 0;
  let durchloechert = 0;

  for (let i = 0; i < 30; i += 1) {
    const k = karte(60000 + i * 4201);
    if (k.kennzahlen.hohlraum < 0.02) massiv += 1;
    if (k.kennzahlen.hohlraum > 0.15) durchloechert += 1;
  }

  assert.ok(massiv > 0,
    'Keine einzige massive Karte gefunden — der Generator höhlt immer');
  assert.ok(durchloechert > 0,
    'Keine einzige durchlöcherte Karte gefunden — der Generator höhlt nie');
});

test('Der Charakter nutzt seinen Bereich aus', () => {
  /*
   * Die Randverstärkung soll Extreme begünstigen. Wenn alle gezogenen Werte
   * eng um die Mitte lägen, wäre die Verstärkung wirkungslos.
   */
  for (const achse of Object.keys(CHARAKTER_ACHSEN)) {
    const [min, max] = CHARAKTER_ACHSEN[achse];
    const werte = [];

    // Viele Züge aus einem RNG — die Verteilung, nicht eine einzelne Karte.
    const rng = new SeededRandom(31337);
    for (let i = 0; i < 200; i += 1) werte.push(zieheCharakter(rng)[achse]);

    const gezogenMin = Math.min(...werte);
    const gezogenMax = Math.max(...werte);
    const abdeckung = (gezogenMax - gezogenMin) / (max - min);

    assert.ok(abdeckung > 0.6,
      `${achse}: nur ${(abdeckung * 100).toFixed(0)} % des Bereichs werden genutzt`);
  }
});

test('Die Spielbarkeitsprüfung lehnt kaputte Karten ab', () => {
  /*
   * Die Prüfung ist die Sicherung der Autonomie. Wenn sie nichts ablehnt, ist
   * sie wirkungslos — und der Generator könnte unspielbare Karten ausliefern.
   */
  const leer = { landAnteil: 0.02, hohlraum: 0, hoehennutzung: 0.5, erhebungen: 20, ueberhaenge: 0 };
  assert.equal(pruefeSpielbarkeit(leer).ok, false,
    'Eine Karte mit 2 % Land muss abgelehnt werden');

  const voll = { landAnteil: 0.98, hohlraum: 0, hoehennutzung: 0.5, erhebungen: 20, ueberhaenge: 0 };
  assert.equal(pruefeSpielbarkeit(voll).ok, false,
    'Eine Karte aus lauter Land muss abgelehnt werden');

  const flach = { landAnteil: 0.5, hohlraum: 0, hoehennutzung: 0.05, erhebungen: 20, ueberhaenge: 0 };
  assert.equal(pruefeSpielbarkeit(flach).ok, false,
    'Eine flache Karte muss abgelehnt werden');

  const gut = { landAnteil: 0.35, hohlraum: 0.1, hoehennutzung: 0.4, erhebungen: 20, ueberhaenge: 100 };
  assert.equal(pruefeSpielbarkeit(gut).ok, true,
    'Eine gute Karte darf nicht abgelehnt werden');
});

test('Die Ränder und der Boden sind auch bei Inseln versiegelt', () => {
  /*
   * Bei hoher Inseligkeit liegt das Gelände an den Seiten unter Wasser — die
   * Versiegelung ist trotzdem nötig, damit niemand aus der Welt fällt.
   */
  for (let i = 0; i < 10; i += 1) {
    const k = karte(70000 + i * 1237);
    for (let y = 0; y < k.bitmap.length / BREITE; y += 20) {
      assert.equal(k.bitmap[y * BREITE], 1, `linker Rand offen bei Seed ${70000 + i * 1237}`);
    }
    for (let x = 0; x < BREITE; x += 20) {
      assert.equal(k.bitmap[(HOEHE - 1) * BREITE + x], 1, `Boden offen`);
    }
  }
});

test('Ohne RNG wird ein Fehler geworfen', () => {
  /*
   * Ein stiller Rückfall auf `Math.random` wäre ein Determinismus-Bruch.
   */
  assert.throws(
    () => erzeugeAutonomeKarte({ rng: null, width: BREITE, height: HOEHE }),
    /RNG/,
  );
});
