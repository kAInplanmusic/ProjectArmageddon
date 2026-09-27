/**
 * Tests: Die FORMEN des autonomen Kartengenerators.
 *
 * ## Warum diese Datei existiert
 *
 * Der Terrain-Ausbau hat dem Generator fünf Achsen und vier Formen
 * hinzugefügt (Terrassen, Kessel, Gräben, Felsvorsprünge) sowie einen
 * Übergang zwischen zwei Geländehälften. Zwei Fragen sind damit neu — und
 * beide lassen sich nur messen:
 *
 *   1. **Läuft die Erzeugung überhaupt durch?** Ein Generator, der bei
 *      bestimmten Seeds abbricht, ist keine größere Abwechslung, sondern ein
 *      Absturz. Genau das ist während des Umbaus passiert: Ein `graben[x]` stand
 *      eine Weile VOR der Deklaration seiner Variablen (eine `const` gilt nur
 *      im Block), und `node --check` sieht das nicht — es ist ein
 *      Laufzeitfehler. Deshalb läuft der erste Test unten über 200 Seeds und
 *      nennt im Fehlerfall die SEEDNUMMER.
 *
 *   2. **Sind die neuen Formen wirklich da?** „Mehr Möglichkeiten gebaut" ohne
 *      Zahl ist eine Behauptung. Gezählt wird deshalb je Form, in wie vielen
 *      Karten sie vorkommt, und ob die zugehörige Achse sie tatsächlich
 *      steuert (Viertelvergleich: niedrigste gegen höchste Achsenwerte).
 *
 * ## Und eine Äquivalenz, die gepinnt werden muss
 *
 * Die Kennzahl `landmassen` (getrennte Landstücke über Wasser) wird im
 * Generator über **Spaltenintervalle** berechnet, weil die Flutfüllung des
 * Projekts (`findeFlaechen`) gemessen 191 ms je Aufruf kostet und im
 * Ziehungs-Versuch bis zu achtmal liefe. Zwei Fassungen derselben Aussage
 * dürfen nicht auseinanderlaufen — deshalb vergleicht ein Test sie Zeile für
 * Zeile gegen `findeFlaechen` (dasselbe Vorgehen wie bei den geteilten
 * Ballistik-Konstanten).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erzeugeAutonomeKarte } from '../src/shared/terrainGen3.js';
import { findeFlaechen } from '../src/shared/erreichbarkeit.js';
import { SeededRandom } from '../src/shared/prng.js';

/** Eine Karte mit festem Seed. */
function karte(seed, width, height) {
  return erzeugeAutonomeKarte({ rng: new SeededRandom(seed), width, height });
}

// ---------------------------------------------------------------- 1. Robustheit

test('Die Erzeugung läuft über 200 Seeds durch — der Fehler nennt die Seednummer', () => {
  /*
   * DIE Prüfung gegen den Fehler, der beim Umbau aufgetreten ist.
   *
   * Gemessen: 200 Seeds × 480×270, keine Ausnahme. Der Test bricht beim ersten
   * Fehler ab und nennt den Seed — ohne die Nummer sucht man einen Fehler, der
   * nur bei bestimmten Karten auftritt, mit der Hand.
   */
  const fehler = [];
  for (let i = 0; i < 200; i += 1) {
    const seed = 900000 + i * 3301;
    try {
      karte(seed, 480, 270);
    } catch (error) {
      fehler.push(`Seed ${seed}: ${error.message}`);
    }
  }
  assert.deepEqual(fehler, [],
    `Die Erzeugung ist nicht durchgelaufen:\n${fehler.slice(0, 5).join('\n')}`);
});

test('Die Wiederholungen sind Spielbarkeits-Ablehnungen, keine verschluckten Ausnahmen', () => {
  /*
   * Warum das eine eigene Prüfung ist: `versuche` stieg beim Ausbau von 1,10 auf
   * 1,44 je Karte. Das kann zwei völlig verschiedene Ursachen haben —
   * mehr echte Fehlversuche (der Generator zieht neu, weil die Karte die Regeln
   * verletzt) oder verschluckte Ausnahmen (die Schleife läuft weiter, ohne dass
   * jemand es merkt). Die erste Ursache ist ein Fortschritt, die zweite ein
   * Teilausfall, den eine Erfolgsmeldung verdeckt.
   *
   * Nachweis: Jede Wiederholung MUSS einen Grund aus `pruefeSpielbarkeit`
   * tragen, und die Zahl der Versuche muss die Zahl der Gründe um genau eins
   * überschreiten (der letzte Versuch ist der angenommene). Gemessen über 60
   * Karten bei 1280×720: 0 Ausnahmen, `versuche` 1,44 — die Gründe waren
   * „zu nadelig" (13), „keine tragende Landmasse" (5), „zu wenige Erhebungen"
   * (4). Die erste dieser Regeln war vor dem Ausbau WIRKUNGSLOS (sie teilte
   * durch ein Feld, das die Kennzahlen nicht trugen) — die zusätzlichen
   * Versuche sind also die Folge einer reparierten Prüfung.
   */
  const erlaubt = /^(zu wenig Land|zu viel Land|zu flach|zu wenige Erhebungen|zu durchlöchert|zu nadelig|keine tragende Landmasse)/;
  let geprueft = 0;

  for (let i = 0; i < 60; i += 1) {
    const k = karte(424242 + i * 7919, 640, 360);
    assert.equal(k.versuche, k.ablehnungen.length + 1,
      `Seed ${424242 + i * 7919}: ${k.versuche} Versuche, aber `
      + `${k.ablehnungen.length} Gründe — eine Wiederholung ohne Grund`);
    for (const grund of k.ablehnungen) {
      assert.match(grund, erlaubt,
        `Seed ${424242 + i * 7919}: unbekannter Ablehnungsgrund „${grund}"`);
    }
    geprueft += 1;
  }
  assert.equal(geprueft, 60);
});

// ---------------------------------------------------------------- 2. Determinismus

test('Derselbe Seed ergibt BIT-IDENTISCH dieselbe Karte', () => {
  /*
   * Die Projektzusage gilt auch nach dem Ausbau: Server und Client bauen die
   * Karte getrennt und müssen zum selben Gelände kommen. Geprüft wird die
   * Bitmap Element für Element (nicht nur ihre Länge), die Oberfläche, der
   * Wasserspiegel, der Charakter — und das Materialfeld, das aus einem eigenen
   * Seed-Zweig kommt.
   */
  for (const seed of [4242, 1, 20260927, 999983]) {
    const a = karte(seed, 640, 360);
    const b = karte(seed, 640, 360);

    assert.equal(a.bitmap.length, b.bitmap.length);
    for (let i = 0; i < a.bitmap.length; i += 1) {
      if (a.bitmap[i] !== b.bitmap[i]) {
        assert.fail(`Seed ${seed}: Bitmap weicht an Index ${i} ab`);
      }
    }
    assert.deepEqual([...a.surface], [...b.surface], `Seed ${seed}: Oberfläche`);
    assert.equal(a.wasserY, b.wasserY, `Seed ${seed}: Wasserspiegel`);
    assert.deepEqual(a.charakter, b.charakter, `Seed ${seed}: Charakter`);
    assert.deepEqual([...a.material.feld], [...b.material.feld], `Seed ${seed}: Material`);
  }
});

// ---------------------------------------------------------------- 3. Äquivalenz

test('Die schnelle Verbindungsmessung stimmt mit der Flutfüllung des Projekts überein', () => {
  /*
   * Der Generator berechnet `landmassen` und `groesstesStueckAnteil` über
   * Spaltenintervalle (`massenUeberWasser`), weil `findeFlaechen` je Aufruf
   * gemessen 191 ms braucht und im Ziehungs-Versuch bis zu achtmal liefe.
   *
   * Hier wird beides gegenübergestellt: dieselbe Karte, dieselbe Grenze
   * (Wasserspiegel), einmal mit der schnellen Fassung, einmal mit der
   * autoritativen Flutfüllung. Weichen sie ab, ist eine der beiden falsch —
   * und die Spielbarkeitsregel „keine tragende Landmasse" urteilte dann nach
   * einer Zahl, die niemand nachvollziehen kann.
   */
  for (let i = 0; i < 12; i += 1) {
    const seed = 515000 + i * 6151;
    const k = karte(seed, 320, 180);
    const breite = 320;
    const hoehe = 180;
    const grenze = Math.max(0, Math.min(hoehe, Math.floor(k.wasserY)));

    const ueberWasser = new Uint8Array(breite * hoehe);
    let landOben = 0;
    for (let y = 0; y < grenze; y += 1) {
      for (let x = 0; x < breite; x += 1) {
        const idx = y * breite + x;
        if (k.bitmap[idx]) { ueberWasser[idx] = 1; landOben += 1; }
      }
    }
    const { groessen } = findeFlaechen(ueberWasser, breite, hoehe);
    const tragend = Math.max(1, landOben * 0.01);
    let groesste = 0;
    let massen = 0;
    for (const g of groessen) {
      if (g > groesste) groesste = g;
      if (g >= tragend) massen += 1;
    }

    assert.equal(k.kennzahlen.landmassen, massen,
      `Seed ${seed}: ${k.kennzahlen.landmassen} Landmassen gemeldet, `
      + `${massen} gemessen`);
    const anteil = landOben === 0 ? 0 : groesste / landOben;
    assert.ok(Math.abs(k.kennzahlen.groesstesStueckAnteil - anteil) < 1e-9,
      `Seed ${seed}: Anteil der größten Masse weicht ab `
      + `(${k.kennzahlen.groesstesStueckAnteil} gegen ${anteil})`);
  }
});

// ---------------------------------------------------------------- 4. Die Formen

/** Terrassen: Läufe flacher Oberfläche — die Stellflächen. */
function plateaus(surface, width) {
  let anzahl = 0;
  let lauf = 1;
  for (let x = 5; x < width - 5; x += 1) {
    if (surface[x] < 0 || surface[x - 1] < 0) { lauf = 1; continue; }
    if (Math.abs(surface[x] - surface[x - 1]) <= 1) lauf += 1;
    else lauf = 1;
    if (lauf === 4) anzahl += 1;
  }
  return anzahl;
}

/** Kessel-Sohlen: flacher Lauf, der beidseitig deutlich tiefer liegt. */
function kesselSohlen(surface, width) {
  let anzahl = 0;
  let start = 0;
  for (let x = 1; x < width; x += 1) {
    if (surface[x] < 0 || surface[x - 1] < 0) { start = x; continue; }
    if (Math.abs(surface[x] - surface[x - 1]) > 1) { start = x; continue; }
    if (x - start + 1 < 6) continue;
    const links = surface[Math.max(0, x - 100)];
    const rechts = surface[Math.min(width - 1, x + 100)];
    if (links >= 0 && rechts >= 0 && links < surface[x] - 30 && rechts < surface[x] - 30) {
      anzahl += 1;
    }
  }
  return anzahl;
}

/** Überhänge: ein dünnes Felsband ÜBER einem Hohlraum (Luft darunter). */
function lippenSpalten(bitmap, width, height) {
  let anzahl = 0;
  for (let x = 1; x < width - 1; x += 1) {
    const abschnitte = [];
    let y = 0;
    while (y < height) {
      if (!bitmap[y * width + x]) { y += 1; continue; }
      const y0 = y;
      while (y < height && bitmap[y * width + x]) y += 1;
      abschnitte.push([y0, y - 1]);
    }
    if (abschnitte.length < 2) continue;
    const dicke = abschnitte[0][1] - abschnitte[0][0] + 1;
    const lueft = abschnitte[1][0] - abschnitte[0][1] - 1;
    if (dicke <= 28 && lueft >= 5) anzahl += 1;
  }
  return anzahl;
}

/** Wasseranteil: nicht-solide Zellen unterhalb des Spiegels. */
function wasserAnteil(k, width, height) {
  let wasser = 0;
  let flaeche = 0;
  for (let y = Math.floor(k.wasserY); y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      flaeche += 1;
      if (!k.bitmap[y * width + x]) wasser += 1;
    }
  }
  return flaeche === 0 ? 0 : wasser / flaeche;
}

/** Eine Messreihe über viele Seeds — die Zahlen für alle Formtests. */
function messreihe(seeds, breite, hoehe) {
  return seeds.map(seed => {
    const k = karte(seed, breite, hoehe);
    return {
      seed,
      charakter: k.charakter,
      kennzahlen: k.kennzahlen,
      plateaus: plateaus(k.surface, breite),
      sohlen: kesselSohlen(k.surface, breite),
      lippen: lippenSpalten(k.bitmap, breite, hoehe),
      wasser: wasserAnteil(k, breite, hoehe),
    };
  });
}

const MITTEL = werte => werte.reduce((a, b) => a + b, 0) / Math.max(1, werte.length);

test('Terrassen, Kessel und Überhänge kommen in den meisten Karten vor', () => {
  /*
   * Gemessen über 60 Seeds bei 640×360 (Stand des Ausbaus):
   *
   *     Terrassen  (≥ 15 Plateaus)   54 von 60 Karten
   *     Kessel     (≥ 1 Sohle)       58 von 60
   *     Überhänge  (≥ 1 Band)        46 von 60
   *     getrennte Landmassen         43 von 60
   *
   * Gefordert wird die HÄLFTE. Der Abstand zur Messung ist die Reserve: Eine
   * Form, die nur in jeder zwanzigsten Karte vorkommt, wäre ein Sonderfall und
   * keine „Form der Ziehung".
   */
  const reihe = messreihe(
    Array.from({ length: 60 }, (_, i) => 77000 + i * 4201), 640, 360,
  );
  const genug = Math.floor(reihe.length / 2);

  const mitTerrassen = reihe.filter(r => r.plateaus >= 15).length;
  const mitKessel = reihe.filter(r => r.sohlen > 0).length;
  const mitLippen = reihe.filter(r => r.lippen > 0).length;
  const mitMassen = reihe.filter(r => r.kennzahlen.landmassen >= 2).length;

  assert.ok(mitTerrassen >= genug, `nur ${mitTerrassen} von ${reihe.length} Karten haben Terrassen`);
  assert.ok(mitKessel >= genug, `nur ${mitKessel} von ${reihe.length} Karten haben einen Kessel`);
  assert.ok(mitLippen >= genug, `nur ${mitLippen} von ${reihe.length} Karten haben Überhänge`);
  assert.ok(mitMassen >= genug, `nur ${mitMassen} von ${reihe.length} Karten haben getrennte Landmassen`);
});

test('Jede neue Achse steuert ihre Form — Viertelvergleich', () => {
  /*
   * Die Gegenprobe zur bloßen Anwesenheit: Eine Form, die immer da ist, egal
   * was der Seed zieht, wird nicht von der Achse gesteuert. Verglichen wird
   * deshalb das untere Viertel der Achsenwerte mit dem oberen.
   *
   * Gemessen (60 Seeds, 640×360), Verhältnis obere zu untere Viertel:
   *
   *     terrassen      → Plateaus         25,2 → 35,9   (×1,42)
   *     kessel         → Kessel-Sohlen    52,7 → 83,3   (×1,58)
   *     lippen         → Überhang-Spalten 38,9 → 53,1   (×1,36)
   *     zusammenhaengung → Wasseranteil   0,12 → 0,07   (×1,59, umgekehrt:
   *                        ein Graben trennt nicht nur, er steht auch voll
   *                        Wasser — der Spiegel kommt aus dem Land, und das
   *                        Land liegt dann tiefer)
   *
   * Gefordert wird ein Verhältnis von mehr als 1,10 nach der gemessenen
   * Richtung — deutlich unter den gemessenen 1,36–1,59, damit nicht die
   * Zufallsstreuung eines anderen Seed-Satzes den Test umwirft.
   */
  const reihe = messreihe(
    Array.from({ length: 60 }, (_, i) => 77000 + i * 4201), 640, 360,
  );
  const viertel = Math.floor(reihe.length / 4);

  /** Mittel der Form im unteren bzw. oberen Viertel einer Achse. */
  const viertelVergleich = (achse, form) => {
    const sortiert = [...reihe].sort((a, b) => a.charakter[achse] - b.charakter[achse]);
    return {
      unten: MITTEL(sortiert.slice(0, viertel).map(form)),
      oben: MITTEL(sortiert.slice(-viertel).map(form)),
      achseUnten: sortiert[0].charakter[achse],
      achseOben: sortiert[sortiert.length - 1].charakter[achse],
    };
  };

  const terrassen = viertelVergleich('terrassen', r => r.plateaus);
  assert.ok(terrassen.oben > terrassen.unten * 1.1,
    `terrassen steuert die Plateaus nicht (${terrassen.unten.toFixed(1)} → ${terrassen.oben.toFixed(1)})`);

  const kessel = viertelVergleich('kessel', r => r.sohlen);
  assert.ok(kessel.oben > kessel.unten * 1.1,
    `kessel steuert die Mulden nicht (${kessel.unten.toFixed(1)} → ${kessel.oben.toFixed(1)})`);

  const lippen = viertelVergleich('lippen', r => r.lippen);
  assert.ok(lippen.oben > lippen.unten * 1.1,
    `lippen steuert die Überhänge nicht (${lippen.unten.toFixed(1)} → ${lippen.oben.toFixed(1)})`);

  const zusammenhang = viertelVergleich('zusammenhaengung', r => r.wasser);
  assert.ok(zusammenhang.unten > zusammenhang.oben * 1.1,
    `zusammenhaengung steuert den Wasseranteil nicht `
    + `(unten ${zusammenhang.unten.toFixed(3)}, oben ${zusammenhang.oben.toFixed(3)})`);
});

test('Über den Überhängen steht kein schwebender Fels', () => {
  /*
   * DIE Prüfung, die den Entwurfsfehler verhindert: Ein frei schwebendes
   * Felsband wäre eine Insel, auf der eine Figur stranden kann — die Partie
   * liefe dann nicht verloren, sondern aus (`src/shared/erreichbarkeit.js`).
   *
   * Geprüft wird über die Flutfüllung des Projekts: Jedes solide Pixel ÜBER dem
   * Wasserspiegel muss über solide Pixel mit der Bodenreihe zusammenhängen.
   * Ein schwebendes Band hätte keine Verbindung nach unten und fiele auf.
   *
   * Die versiegelten Ränder und der Boden sind davon ausgenommen, weil sie
   * absichtlich durchgezogen werden (damit niemand aus der Welt fällt).
   */
  for (let i = 0; i < 8; i += 1) {
    const seed = 313000 + i * 7919;
    const breite = 320;
    const hoehe = 180;
    const k = karte(seed, breite, hoehe);
    const { flaeche } = findeFlaechen(k.bitmap, breite, hoehe);

    // Welche Flächen berühren die Bodenreihe?
    const amBoden = new Set();
    for (let x = 0; x < breite; x += 1) amBoden.add(flaeche[(hoehe - 1) * breite + x]);

    const grenze = Math.max(0, Math.min(hoehe, Math.floor(k.wasserY)));
    const frei = [];
    for (let y = 0; y < grenze; y += 1) {
      for (let x = 1; x < breite - 1; x += 1) {
        const idx = y * breite + x;
        if (!k.bitmap[idx]) continue;
        if (!amBoden.has(flaeche[idx])) frei.push(`(${x},${y})`);
      }
    }
    assert.deepEqual(frei.slice(0, 3), [],
      `Seed ${seed}: ${frei.length} solide Pixel über Wasser hängen nicht am Boden `
      + `— schwebender Fels, z. B. bei ${frei.slice(0, 3).join(' ')}`);
  }
});
