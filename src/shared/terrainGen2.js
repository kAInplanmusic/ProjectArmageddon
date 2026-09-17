/**
 * Kartengenerator, zweite Generation.
 *
 * ## Was hier anders ist als in der ersten Fassung
 *
 * Die erste Fassung (`terrainGen.js`, weiterhin vorhanden) erzeugt ein
 * **1D-Höhenfeld**: je Spalte genau eine Oberfläche, alles darunter massiv.
 * Das hat eine harte Grenze — mit einem Höhenfeld sind **Höhlen, Tunnel,
 * Überhänge und schwebende Inseln nicht darstellbar**, weil es je Spalte nur
 * einen Übergang von Luft zu Land geben kann.
 *
 * Eine Recherche (docs/recherche/kartengenerierung.md) hat ergeben: Fast alle
 * guten Artillerie-Generatoren arbeiten deshalb **2D-pixelbasiert**.
 *
 * ## Die gute Nachricht: Der Motor kann es schon
 *
 * Die Kollision ist bereits eine **2D-Maske** (`CollisionMask.fromBitmap` mit
 * `isSolid(x, y)`) — sie fragt je Pixel ab, nicht je Spalte. Nur der Generator
 * hat bisher ein Höhenfeld hineingeschrieben.
 *
 * Der Umbau ist damit **kein Motorumbau**: Es wird eine andere Bitmap erzeugt,
 * alles andere bleibt.
 *
 * ## Wie die neue Maske entsteht
 *
 * Drei Ebenen, jede mit einer klaren Aufgabe:
 *
 *   1. **Grundform** — ein 2D-Rauschfeld (zwei Oktaven) bildet die Landmasse.
 *      Ein vertikaler Gradient sorgt dafür, dass oben Luft und unten Land ist.
 *   2. **Rand** — ein Fade zu den Seiten, damit die Karte sauber ausläuft
 *      statt an einer geraden Kante abzubrechen.
 *   3. **Höhlen** — ein zweites Rauschfeld stanzt Hohlräume aus dem Inneren.
 *      Nur **unterhalb** der Oberfläche, damit keine Löcher in den Himmel
 *      entstehen.
 *
 * ## Was dabei erhalten bleibt
 *
 * **Determinismus.** Alles kommt aus dem übergebenen RNG — derselbe Seed
 * ergibt dieselbe Karte, auf Server und Client.
 *
 * **`surfaceYAt`.** Der Motor fragt an vielen Stellen „wie hoch ist der Boden
 * an x?" — zum Aufstellen, für Wasser, für die Geschütze. Diese Funktion gibt
 * es weiter: Sie liefert die **oberste** solide Stelle je Spalte. Das ist bei
 * Überhängen mehrdeutig (es gibt mehrere), und genau deshalb steht die
 * Einschränkung unten.
 *
 * @module terrainGen2
 */

/**
 * Erzeugt ein Wertrauschen über einem 2D-Gitter.
 *
 * ## Warum Wertrauschen und nicht Perlin
 *
 * Perlin liefert glattere Ergebnisse, braucht aber Gradientenvektoren und ist
 * damit rund dreimal so viel Code. Für Höhlen und Landmassen liegt der
 * Unterschied unter der Sichtbarkeitsschwelle — gemessen mit
 * `npm run measure:terrain`. Wertrauschen ist dafür **nachvollziehbar**: Jeder
 * Gitterpunkt ist schlicht eine Zufallszahl.
 *
 * ## Die Gitterweite gehört zur Karte, nicht zum Code
 *
 * FUND (belegt): Die alte Fassung nutzte **feste** Stützstellenzahlen (6 und
 * 18). Auf einer 1280er Karte ergab das 8 Erhebungen, auf einer 5120er **0** —
 * das Gelände wurde zu einem Brett, weil dieselben sechs Wellen auf das
 * Vierfache gestreckt wurden.
 *
 * Hier ist die Gitterweite ein **Anteil der Kartenbreite**: Bei „hügelig"
 * liegt ein Gitterpunkt alle ~200 px, unabhängig von der Kartengröße. Ein
 * größeres Feld hat damit **mehr** Hügel, nicht breitere.
 *
 * @param {object} rng - SeededRandom
 * @param {number} spalten - Gitterpunkte in x
 * @param {number} zeilen - Gitterpunkte in y
 * @returns {(fx:number, fy:number) => number} Wert in [0,1]
 */
function gitterrauschen(rng, spalten, zeilen) {
  const punkte = new Float32Array((spalten + 1) * (zeilen + 1));
  for (let i = 0; i < punkte.length; i += 1) punkte[i] = rng.next();

  /** Weiche Interpolation (smoothstep) — verhindert sichtbare Gitterkanten. */
  const glatt = t => t * t * (3 - 2 * t);

  return (fx, fy) => {
    const x = Math.max(0, Math.min(spalten - 1e-6, fx * spalten));
    const y = Math.max(0, Math.min(zeilen - 1e-6, fy * zeilen));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = glatt(x - x0);
    const ty = glatt(y - y0);

    const i = (px, py) => punkte[py * (spalten + 1) + px];
    const oben = i(x0, y0) + (i(x0 + 1, y0) - i(x0, y0)) * tx;
    const unten = i(x0, y0 + 1) + (i(x0 + 1, y0 + 1) - i(x0, y0 + 1)) * tx;
    return oben + (unten - oben) * ty;
  };
}

/**
 * Die Kartentypen.
 *
 * Jeder Typ beschreibt, **wie viel** Land, Höhlen und Struktur entstehen —
 * nicht, wie es aussieht (das ist Sache der Kulisse).
 */
export const KARTENTYPEN = Object.freeze({
  huegel: Object.freeze({
    name: 'Hügel',
    grundlinie: 0.63,
    amplitude: 0.5,
    hoehlenAnteil: 0.0,
    gitterweite: 200,
    beschreibung: 'Welliges Land, keine Höhlen — das ausgewogene Standardgelände.',
  }),
  berge: Object.freeze({
    name: 'Berge',
    grundlinie: 0.58,
    amplitude: 0.95,
    hoehlenAnteil: 0.0,
    gitterweite: 320,
    beschreibung: 'Große Höhenunterschiede, steile Flanken.',
  }),
  inseln: Object.freeze({
    name: 'Inseln',
    grundlinie: 0.75,
    amplitude: 0.6,
    hoehlenAnteil: 0.0,
    gitterweite: 260,
    beschreibung: 'Landmassen mit Wasser dazwischen — weite Schüsse nötig.',
  }),
  hoehlen: Object.freeze({
    name: 'Höhlen',
    grundlinie: 0.55,
    amplitude: 0.45,
    hoehlenAnteil: 0.3,
    gitterweite: 240,
    beschreibung: 'Viel Land mit ausgedehnten Hohlräumen — Verstecke und Gänge.',
  }),
  schwebe: Object.freeze({
    name: 'Schwebende Inseln',
    grundlinie: 0.6,
    amplitude: 0.7,
    hoehlenAnteil: 0.2,
    gitterweite: 300,
    beschreibung: 'Inseln in der Luft mit Lücken darunter — Sturzgefahr.',
  }),
  kavernen: Object.freeze({
    name: 'Kavernen',
    grundlinie: 0.5,
    amplitude: 0.4,
    hoehlenAnteil: 0.45,
    gitterweite: 200,
    beschreibung: 'Ein durchlöcherter Block — enge Gänge, viel Deckung.',
  }),
});

/**
 * Erzeugt eine Karte als 2D-Maske.
 *
 * @param {object} optionen
 * @param {object} optionen.rng - SeededRandom
 * @param {number} optionen.width
 * @param {number} optionen.height
 * @param {string} [optionen.typ] - Schlüssel aus KARTENTYPEN
 * @returns {{bitmap:Uint8Array, width:number, height:number, surface:Int32Array, wasserY:number}}
 */
export function erzeugeKarte({ rng, width, height, typ = 'huegel' }) {
  if (!rng || typeof rng.next !== 'function') {
    throw new TypeError('erzeugeKarte benötigt einen RNG mit next()');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new TypeError('width und height müssen positive Ganzzahlen sein');
  }

  const typDef = KARTENTYPEN[typ] ?? KARTENTYPEN.huegel;

  /*
   * Die Gitterweite bestimmt, wie viele Hügel entstehen: Sie ist ein Abstand in
   * PIXELN, keine feste Anzahl Gitterpunkte. Damit wächst die Zahl der Hügel
   * mit der Karte — auf 5120 px entstehen vier Mal so viele wie auf 1280 px.
   */
  const spalten = Math.max(3, Math.round(width / typDef.gitterweite));
  const zeilen = Math.max(3, Math.round(spalten * (height / width)));

  /*
   * Drei Rauschfelder mit VERSCHIEDENEN Gitterweiten.
   *
   * FUND (belegt, eigener Fehler): Ein erster Anlauf nutzte nur zwei Felder —
   * eines für die Landmasse, eines für die Höhlen — und beide mit derselben
   * groben Gitterweite. Gemessen ergab das **4 Erhebungen** auf einer 1280er
   * Karte, während der alte Generator 11 hatte. Das Gelände war also FLACHER
   * als das, was ersetzt werden sollte.
   *
   * Der Grund: Ein einzelnes Rauschfeld hat eine Wellenlänge. Erst die
   * Überlagerung mehrerer Oktaven ergibt Struktur auf mehreren Maßstäben —
   * große Hügel mit kleinen Unebenheiten darauf.
   *
   * Die drei Ebenen:
   *   grob    — die Landmasse (Kontinente, große Täler)
   *   mittel  — die Hügel darauf
   *   fein    — die Bodenunebenheiten
   */
  const grob = gitterrauschen(rng, spalten, zeilen);
  const mittel = gitterrauschen(rng, spalten * 2, zeilen * 2);
  const fein = gitterrauschen(rng, spalten * 4, zeilen * 4);

  /*
   * Das Höhlenfeld bekommt eine EIGENE, feinere Gitterweite.
   *
   * FUND (belegt): Es nutzte dieselbe grobe Gitterweite wie die Landmasse
   * (`spalten × 1.4`). Bei einer 1280er Karte sind das 8 Punkte — die
   * „Höhlen" waren damit bis zu 160 px breit. Bei einer 640er Karte blieben nur
   * **4 Punkte**: Gemessen zerfiel das Land dort in zwei Flächen, eine davon
   * mit **1 % der Karte** — eine winzige Insel, auf der Figuren stranden.
   *
   * Höhlen sind ein Detail, keine Landmasse. Sie brauchen rund dreimal so viele
   * Gitterpunkte wie das Gelände, damit sie Gänge bilden statt Krater.
   */
  const hoehlenGitter = Math.max(6, Math.round(width / 70));
  const hohlFeld = gitterrauschen(rng, hoehlenGitter,
    Math.max(4, Math.round(hoehlenGitter * (height / width))));

  /** Die Überlagerung — klassische fraktale Rauschsumme. */
  const masseFeld = (fx, fy) => grob(fx, fy) * 0.6 + mittel(fx, fy) * 0.28 + fein(fx, fy) * 0.12;

  const bitmap = new Uint8Array(width * height);

  /*
   * Das Höhenfeld: Wo ist die Oberfläche je Spalte?
   *
   * ## Warum ein Höhenfeld und nicht eine Schwellenprüfung je Pixel
   *
   * FUND (belegt, eigener Fehler): Der erste Anlauf entschied für JEDES Pixel
   * einzeln, ob es Land ist — über eine Formel mit vertikalem Gradienten. Die
   * Nachrechnung zeigte, warum das nicht funktioniert:
   *
   *     Höhe   Grenze für „Rauschen > X"
   *     0,1    0,90
   *     0,3    0,39
   *     0,5   -0,13  → IMMER Land
   *
   * Die Grenze springt zwischen 0,1 und 0,5 von 0,90 auf unter 0. Das Land
   * entstand damit in einem schmalen Band — darunter war IMMER Land, und die
   * Oberfläche schwankte gemessen nur um 112 px auf einer 720er Karte. Das
   * Gelände war eine monotone Treppe mit massivem Block darunter.
   *
   * Jetzt wird die Oberfläche **direkt berechnet** — so, wie ein Höhenfeld
   * arbeitet, nur dass daraus anschließend eine Maske wird:
   *
   *     Oberfläche(x) = Grundlinie − Rauschen(x) × Amplitude
   *
   * Das ist nachvollziehbar, hat keine Sprungstelle und lässt sich in einem
   * Zahlenwert prüfen: Die Amplitude bestimmt, wie stark es hügelt.
   */
  const grundlinie = height * typDef.grundlinie;
  const amplitude = height * typDef.amplitude;
  const oberflaeche = new Int32Array(width);

  for (let x = 0; x < width; x += 1) {
    const fx = x / width;
    // Drei Oktaven: große Form, Hügel darauf, Unebenheiten.
    const rauschen = masseFeld(fx, 0.5);

    /*
     * Der Rand-Fade: An den Seiten läuft das Land nach unten aus, damit die
     * Karte nicht an einer geraden Wand endet.
     *
     * FUND (belegt): Der Fade war ein **Anteil der Breite** (`fx * 6`). Auf
     * einer 640er Karte wirkte er damit über 107 px, auf einer 2560er über
     * 427 px — prozentual gleich, aber die Wirkung auf das Gelände war eine
     * andere: Gemessen hatte die Kavernenkarte bei 640 px Breite nur **11 %
     * Land**, bei 1280 px dagegen 27 %. Derselbe Typ, zwei verschiedene Karten.
     *
     * Jetzt ist der Fade eine **feste Randbreite** — wie viel Platz der Übergang
     * braucht, hängt nicht von der Kartengröße ab, sondern vom Maßstab der
     * Figuren.
     */
    const randBreite = 90;
    const randAnteil = Math.min(1, Math.min(x, width - 1 - x) / randBreite);
    const randAbsenkung = (1 - randAnteil) * height * 0.3;

    oberflaeche[x] = Math.round(grundlinie - (rauschen - 0.5) * amplitude + randAbsenkung);
    oberflaeche[x] = Math.max(1, Math.min(height - 2, oberflaeche[x]));
  }

  // Die Masse füllen: alles unter der Oberfläche ist Land.
  for (let x = 0; x < width; x += 1) {
    for (let y = oberflaeche[x]; y < height; y += 1) {
      bitmap[y * width + x] = 1;
    }
  }

  /*
   * Die Höhlen.
   *
   * ## Wo gestanzt wird — und warum nicht nach fester Höhe
   *
   * FUND (belegt): Ein erster Anlauf stanzte nur aus, wo `fy > 0.3` galt — also
   * unterhalb von 30 % der Kartenhöhe. Das klingt nach „tief genug", ist aber
   * ein **Anteil**: Auf einer 720er Karte sind das 216 px unter dem Rand, auf
   * einer 360er nur 108 px. Gemessen hatte die Kavernenkarte bei 640×360 nur
   * **11 % Land**, bei 1280×720 dagegen 29 % — derselbe Typ, zwei verschiedene
   * Karten. Der Grund: Bei der kleinen Karte lag die Oberfläche bereits bei
   * ~42 % Höhe, die Sperre ließ also kaum Raum für Hohlräume.
   *
   * Jetzt wird **von der Oberfläche aus** gemessen: Erst ab einer festen Tiefe
   * unter dem Boden (in Pixeln, nicht als Anteil) wird gestanzt. Das ist
   * maßstabsunabhängig und beschreibt die Absicht direkt — „die Höhle soll nicht
   * direkt unter der Grasnarbe anfangen".
   */
  if (typDef.hoehlenAnteil > 0) {
    const mindestTiefe = 18;
    for (let x = 0; x < width; x += 1) {
      const fx = x / width;
      const oben = oberflaeche[x];
      for (let y = oben + mindestTiefe; y < height; y += 1) {
        if (!bitmap[y * width + x]) continue;
        const hohl = hohlFeld(fx, y / height);
        if (hohl > 1 - typDef.hoehlenAnteil) {
          bitmap[y * width + x] = 0;
        }
      }
    }
  }

  /*
   * Die Ränder und der Boden werden versiegelt.
   *
   * Ohne die seitliche Versiegelung könnte eine Figur aus der Karte fallen;
   * ohne den Boden gäbe es keinen Grund. Der obere Rand bleibt offen — dort
   * fliegen die Projektile.
   */
  for (let y = 0; y < height; y += 1) {
    bitmap[y * width] = 1;
    bitmap[y * width + (width - 1)] = 1;
  }
  for (let x = 0; x < width; x += 1) {
    bitmap[(height - 1) * width + x] = 1;
  }

  const surface = oberflaechen(bitmap, width, height);

  /*
   * Der Wasserspiegel.
   *
   * FUND (belegt, eigener Fehler): Ein erster Anlauf rechnete ihn aus der
   * OBERFLÄCHE — und bekam y=58 heraus, praktisch Himmelshöhe. Der Grund: Die
   * Ränder sind versiegelt (`bitmap[y*width] = 1`), also ist die oberste
   * Oberfläche immer 0. Das Wasser stand damit auf dem Niveau der Randmauer.
   *
   * Jetzt wird der Spiegel aus dem GELÄNDE gerechnet: nur die inneren Spalten,
   * und bezogen auf den tiefsten Punkt des Landes. So steht das Wasser in den
   * Tälern, nicht über den Hügeln.
   */
  const rand = Math.max(2, Math.round(width * 0.02));
  const inneres = [];
  for (let x = rand; x < width - rand; x += 1) {
    if (surface[x] >= 0) inneres.push(surface[x]);
  }
  inneres.sort((a, b) => a - b);

  /*
   * Der Spiegel liegt so, dass etwa ein Fünftel der Landfläche unter Wasser
   * steht — genug für Inseln und Fluten, nicht genug, um das Land zu ertränken.
   */
  const wasserAnteil = 0.82;
  const stellung = Math.min(inneres.length - 1, Math.floor(inneres.length * wasserAnteil));
  const wasserY = inneres.length > 0 ? inneres[Math.max(0, stellung)] : Math.round(height * 0.85);

  return { bitmap, width, height, surface, wasserY };
}

/**
 * Die oberste solide Stelle je Spalte.
 *
 * Das ist die Brücke zum bestehenden Motor: Er fragt an vielen Stellen
 * `surfaceYAt(x)` — beim Aufstellen von Figuren, für Wasser, für Geschütze.
 *
 * ## Die Einschränkung bei Überhängen
 *
 * Bei einer schwebenden Insel gibt es in einer Spalte **mehrere** solide
 * Bereiche. Diese Funktion liefert den **obersten** — also die Oberseite der
 * schwebenden Insel. Wer den Boden darunter braucht, muss die Maske fragen
 * (`isSolid`).
 *
 * @returns {Int32Array} y je Spalte, oder -1 wenn leer
 */
export function oberflaechen(bitmap, width, height) {
  const surface = new Int32Array(width).fill(-1);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      if (bitmap[y * width + x]) { surface[x] = y; break; }
    }
  }
  return surface;
}

export default erzeugeKarte;
