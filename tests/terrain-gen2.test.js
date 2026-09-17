/**
 * Tests: Der Kartengenerator der zweiten Generation.
 *
 * ## Warum diese Datei existiert
 *
 * Der alte Generator (`terrainGen.js`) erzeugt ein **1D-Höhenfeld**: je Spalte
 * genau eine Oberfläche. Damit sind Höhlen, Tunnel, Überhänge und schwebende
 * Inseln **nicht darstellbar** — ein 1D-Feld hat je Spalte nur einen Übergang
 * von Luft zu Land.
 *
 * Der neue Generator erzeugt eine **2D-Maske**. Das ist möglich, weil die
 * Kollision des Motors bereits 2D ist (`CollisionMask.fromBitmap` mit
 * `isSolid(x, y)`) — es musste nur anders generiert werden, nicht anders
 * kollidiert.
 *
 * ## Was hier geprüft wird
 *
 * Nicht die Optik (das ist Gestaltung), sondern die **Eigenschaften**, die den
 * Unterschied ausmachen:
 *
 *   1. Determinismus — gleicher Seed, gleiche Karte.
 *   2. Überhänge — die Fähigkeit, die der alte Generator nicht hatte.
 *   3. Rand und Boden — versiegelt, damit niemand herausfällt.
 *   4. Skalierung — die Struktur wächst mit der Karte, statt gestreckt zu werden.
 *   5. Nutzbarkeit — genug Land, genug Platz zum Aufstellen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erzeugeKarte, KARTENTYPEN, oberflaechen } from '../src/shared/terrainGen2.js';
import { SeededRandom } from '../src/shared/prng.js';

const BREITE = 640;
const HOEHE = 360;

/** Eine Karte mit festem Seed. */
function karte(typ = 'huegel', seed = 4242, width = BREITE, height = HOEHE) {
  return erzeugeKarte({ rng: new SeededRandom(seed), width, height, typ });
}

/** Zählt die soliden Abschnitte einer Spalte (von oben nach unten). */
function abschnitteJeSpalte(bitmap, width, height, x) {
  let abschnitte = 0;
  let vorher = false;
  for (let y = 0; y < height; y += 1) {
    const solide = bitmap[y * width + x] === 1;
    if (solide && !vorher) abschnitte += 1;
    vorher = solide;
  }
  return abschnitte;
}

/** Zählt Spalten mit mehr als einem soliden Abschnitt (= Überhänge). */
function ueberhangSpalten(bitmap, width, height) {
  let n = 0;
  for (let x = 1; x < width - 1; x += 1) {
    if (abschnitteJeSpalte(bitmap, width, height, x) > 1) n += 1;
  }
  return n;
}

test('Derselbe Seed ergibt dieselbe Karte', () => {
  /*
   * Die Kernzusage des Projekts gilt auch für den Generator: Server und Client
   * bauen die Karte getrennt — bei gleichem Seed muss dieselbe herauskommen.
   */
  const a = karte('huegel', 777);
  const b = karte('huegel', 777);

  assert.deepEqual([...a.bitmap], [...b.bitmap], 'die Bitmaps unterscheiden sich');
  assert.deepEqual([...a.surface], [...b.surface], 'die Oberflächen unterscheiden sich');
  assert.equal(a.wasserY, b.wasserY, 'die Wasserspiegel unterscheiden sich');
});

test('Verschiedene Seeds ergeben verschiedene Karten', () => {
  /*
   * Die Gegenprobe: Ein Generator, der für jeden Seed dasselbe liefert, wäre
   * deterministisch und nutzlos.
   */
  const a = karte('huegel', 1000);
  const b = karte('huegel', 2000);

  assert.notDeepEqual([...a.surface], [...b.surface],
    'zwei Seeds ergeben dieselbe Oberfläche');
});

test('Überhänge sind möglich — die Fähigkeit, die der alte Generator nicht hatte', () => {
  /*
   * DER Unterschied. Ein 1D-Höhenfeld kann je Spalte nur einen Übergang haben;
   * ein 2D-Feld kann mehrere. In einer Höhlenkarte muss es Spalten mit mehr als
   * einem soliden Abschnitt geben — sonst ist es keine 2D-Maske.
   */
  const k = karte('kavernen', 1000);
  const ueberhaenge = ueberhangSpalten(k.bitmap, k.width, k.height);

  assert.ok(ueberhaenge > 0,
    'Eine Kavernenkarte hat keine einzige Spalte mit Überhang — '
    + 'der Generator erzeugt damit faktisch ein 1D-Profil');

  // Und es sollen nicht nur ein paar sein.
  assert.ok(ueberhaenge > k.width * 0.05,
    `Nur ${ueberhaenge} von ${k.width} Spalten haben einen Überhang — `
    + 'erwartet werden deutlich mehr');
});

test('Eine Höhlenkarte hat mehr Hohlraum als eine Hügelkarte', () => {
  /*
   * Die Typen müssen sich unterscheiden. Ein „Höhlen"-Typ, der nicht mehr
   * Hohlraum hat als „Hügel", wäre ein Etikett ohne Wirkung.
   */
  const hohlraum = (k) => {
    let unter = 0;
    let leer = 0;
    for (let x = 0; x < k.width; x += 1) {
      if (k.surface[x] < 0) continue;
      for (let y = k.surface[x]; y < k.height; y += 1) {
        unter += 1;
        if (!k.bitmap[y * k.width + x]) leer += 1;
      }
    }
    return unter === 0 ? 0 : leer / unter;
  };

  const huegel = hohlraum(karte('huegel', 1000));
  const hoehlen = hohlraum(karte('hoehlen', 1000));
  const kavernen = hohlraum(karte('kavernen', 1000));

  assert.ok(hoehlen > huegel,
    `Höhlen (${(hoehlen * 100).toFixed(1)} %) hat nicht mehr Hohlraum als Hügel (${(huegel * 100).toFixed(1)} %)`);
  assert.ok(kavernen > hoehlen,
    `Kavernen (${(kavernen * 100).toFixed(1)} %) hat nicht mehr Hohlraum als Höhlen (${(hoehlen * 100).toFixed(1)} %)`);
});

test('Die Ränder und der Boden sind versiegelt', () => {
  /*
   * Sonst fiele eine Figur aus der Karte — und ein Projektil verschwände
   * spurlos. Der OBERER Rand bleibt offen: dort fliegen die Geschosse.
   */
  const k = karte('huegel', 1000);

  for (let y = 0; y < k.height; y += 1) {
    assert.equal(k.bitmap[y * k.width], 1, `linker Rand offen bei y=${y}`);
    assert.equal(k.bitmap[y * k.width + (k.width - 1)], 1, `rechter Rand offen bei y=${y}`);
  }
  for (let x = 0; x < k.width; x += 1) {
    assert.equal(k.bitmap[(k.height - 1) * k.width + x], 1, `Boden offen bei x=${x}`);
  }
});

test('Die Karte hat genug Land und genug Luft', () => {
  /*
   * Zwei Extreme sind unspielbar: Eine Karte aus lauter Luft hat keinen Boden,
   * eine aus lauter Land keinen Platz zum Schießen.
   */
  for (const typ of Object.keys(KARTENTYPEN)) {
    const k = karte(typ, 1000);
    let solide = 0;
    for (let i = 0; i < k.bitmap.length; i += 1) if (k.bitmap[i]) solide += 1;
    const anteil = solide / k.bitmap.length;

    assert.ok(anteil > 0.15,
      `${typ}: nur ${(anteil * 100).toFixed(0)} % Land — die Figuren hätten kaum Boden`);
    assert.ok(anteil < 0.95,
      `${typ}: ${(anteil * 100).toFixed(0)} % Land — kaum Platz zum Schießen`);
  }
});

test('Der Wasserspiegel liegt im Gelände, nicht am Himmel', () => {
  /*
   * FUND (belegt, eigener Fehler): Ein erster Anlauf rechnete den Spiegel aus
   * der Oberfläche — und bekam bei einer 720er Karte y=58 heraus, praktisch
   * Himmelshöhe. Der Grund: Die Ränder sind versiegelt, also ist die oberste
   * Oberfläche immer 0.
   *
   * Geprüft wird jetzt die Beziehung: Der Spiegel muss zwischen der höchsten
   * und der tiefsten Geländestelle liegen.
   */
  for (const typ of Object.keys(KARTENTYPEN)) {
    const k = karte(typ, 1000);

    // Die Ränder auslassen — sie sind versiegelt.
    const inneres = [];
    for (let x = 5; x < k.width - 5; x += 1) {
      if (k.surface[x] >= 0) inneres.push(k.surface[x]);
    }
    const hoch = Math.min(...inneres);
    const tief = Math.max(...inneres);

    assert.ok(k.wasserY >= hoch,
      `${typ}: Wasser (${k.wasserY}) liegt über dem höchsten Land (${hoch})`);
    assert.ok(k.wasserY <= tief + 1,
      `${typ}: Wasser (${k.wasserY}) liegt unter dem tiefsten Land (${tief})`);
  }
});

test('Die Struktur wächst mit der Karte, statt gestreckt zu werden', () => {
  /*
   * FUND (belegt): Die alte Fassung nutzte **feste** Stützstellenzahlen (6 und
   * 18). Auf einer 1280er Karte ergab das 8 Erhebungen, auf einer 5120er
   * **0** — dieselben sechs Wellen, auf das Vierfache gestreckt. Das Gelände
   * wurde zu einem Brett.
   *
   * Jetzt ist die Gitterweite ein Abstand in Pixeln. Eine viermal breitere
   * Karte muss deshalb deutlich mehr Erhebungen haben.
   */
  const erhebungen = (k) => {
    let wechsel = 0;
    let richtung = 0;
    for (let x = 6; x < k.width - 5; x += 1) {
      const d = k.surface[x] - k.surface[x - 1];
      const r = d > 0.5 ? 1 : d < -0.5 ? -1 : 0;
      if (r !== 0 && richtung !== 0 && r !== richtung) wechsel += 1;
      if (r !== 0) richtung = r;
    }
    return wechsel;
  };

  const klein = erhebungen(karte('huegel', 1000, 640, 360));
  const gross = erhebungen(karte('huegel', 1000, 2560, 1440));

  assert.ok(gross > klein,
    `Die vierfach breite Karte hat ${gross} Erhebungen, die kleine ${klein} — `
    + 'die Struktur wächst nicht mit');
});

test('Die Oberfläche ist die oberste solide Stelle je Spalte', () => {
  /*
   * Das ist die Brücke zum Motor: Er fragt an vielen Stellen `surfaceYAt(x)`.
   * Bei Überhängen ist der Wert mehrdeutig (es gibt mehrere solide Bereiche) —
   * geliefert wird der OBERSTE, also die Oberseite der schwebenden Insel.
   */
  const k = karte('kavernen', 1000);

  for (const x of [10, 100, 300, 500]) {
    const y = k.surface[x];
    if (y < 0) continue;

    assert.equal(k.bitmap[y * k.width + x], 1,
      `Bei x=${x} zeigt surface auf y=${y}, dort ist aber kein Land`);
    if (y > 0) {
      assert.equal(k.bitmap[(y - 1) * k.width + x], 0,
        `Bei x=${x} ist über der Oberfläche (y=${y}) noch Land — `
        + 'die Funktion liefert nicht die oberste Stelle');
    }
  }
});

test('oberflaechen() stimmt mit erzeugeKarte() überein', () => {
  /*
   * Die Funktion ist exportiert, damit Werkzeuge sie nutzen können. Sie muss
   * dasselbe liefern wie der Generator selbst.
   */
  const k = karte('huegel', 1000);
  const nachgerechnet = oberflaechen(k.bitmap, k.width, k.height);

  assert.deepEqual([...nachgerechnet], [...k.surface]);
});

test('Ein unbekannter Typ fällt auf die Vorgabe zurück', () => {
  /*
   * Dieselbe Haltung wie in der übrigen Konfiguration: Eine Kennung aus einer
   * älteren Fassung darf ein Match nicht verhindern.
   */
  const k = erzeugeKarte({
    rng: new SeededRandom(1000), width: BREITE, height: HOEHE, typ: 'gibtsnicht',
  });
  assert.equal(k.width, BREITE);
  assert.ok(k.bitmap.length === BREITE * HOEHE);
});

test('Ohne RNG wird ein Fehler geworfen', () => {
  /*
   * Ein stiller Rückfall auf `Math.random` wäre ein Determinismus-Bruch — der
   * Fehler muss laut sein.
   */
  assert.throws(
    () => erzeugeKarte({ rng: null, width: BREITE, height: HOEHE }),
    /RNG/,
  );
  assert.throws(
    () => erzeugeKarte({ rng: {}, width: BREITE, height: HOEHE }),
    /RNG/,
  );
});
