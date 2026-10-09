/**
 * Höhlenschattierung: Wände, die in einen Hohlraum zeigen, werden abgedunkelt.
 *
 * ## Warum diese Datei existiert
 *
 * Der Generator kann Höhlen (2D-Maske statt Höhenfeld). Im Browser geprüft war
 * das Ergebnis unbefriedigend — wörtlich aus der Beurteilung:
 *
 *   „Die Ränder der Löcher sind hart abgeschnitten. Es gibt keinen
 *    Farbübergang, keine Schattierung. Das verstärkt den Eindruck eines
 *    Grafikfehlers statt eines gestalteten Höhlensystems."
 *
 * Der Grund ist benennbar: Ein Loch zeigt den **Himmel** — dieselbe Farbe wie
 * über dem Gelände. Eine Höhle muss dagegen **dunkel** sein, weil das
 * umgebende Gestein das Licht nimmt.
 *
 * ## Drei Fehlversuche, gemessen
 *
 * Die Schattierung brauchte mehrere Anläufe. Alle sind hier dokumentiert, weil
 * jeder eine andere Lehre trägt:
 *
 * **Versuch 1 — Gesteinsdichte in der Umgebung.** Eine Hügelkarte wurde fast
 * flächig abgedunkelt (11.305 Pixel) — nur wenig weniger als eine
 * Kavernenkarte (14.078). Tief im Gestein liegt nun einmal viel Gestein; das
 * gilt für jeden Berg.
 *
 * **Versuch 2 — zusätzlich Luftanteil in der Nachbarschaft.** Immer noch 8.734
 * gegen 12.074. Der Unterschied war zu klein: Ein Höhenfeld hat an jedem
 * Kartenrand und über jedem Hügel Luft.
 *
 * **Versuch 3 — die Überdachung („Decke").** Gemessen: Tief im Gestein ist die
 * Decke bei einer Hügelkarte **1,00** und bei einer Kavernenkarte **1,00** —
 * identisch. Beide haben Fels über sich. Das Merkmal trennt nicht.
 *
 * ## Was wirklich trennt
 *
 * Eine Messung über beide Kartentypen ergab:
 *
 *     Merkmal            Hügelkarte        Kavernenkarte
 *     Luftanteil         0,015 (max 0,07)  0,151 (max 0,59)
 *     nächste Luft       31,5 px           19,5 px (min 1 px)
 *
 * Der **Anteil Luft in der Umgebung** unterscheidet die beiden um Faktor 10.
 * Bei massivem Gestein ist ringsum alles Fels; bei einer Höhle liegt immer
 * eine Wandöffnung in Reichweite.
 *
 * Das ist auch anschaulich richtig: Eine Höhle ist ein **Raum**, und ein Raum
 * ist definitionsgemäß leer. Tiefe allein ist keine Höhle.
 *
 * @module hoehlenSchatten
 */

/**
 * Suchradius für die Umgebungsprüfung, in Pixeln.
 *
 * Bei einer Figur von rund 14 px Breite ist das die Größenordnung, in der das
 * Auge „Wand" liest. Ein großer Radius würde die Schattierung über die ganze
 * Karte verschmieren.
 */
export const SCHATTEN_RADIUS = 24;

/**
 * Wie stark die Schattierung höchstens abdunkelt.
 *
 * 0,55 heißt: Eine voll im Schatten liegende Wand behält 55 % ihrer Helligkeit.
 * Nicht 0 — eine pechschwarze Höhle verlöre jede Textur und sähe wieder wie
 * ein Loch aus, nur anders.
 */
export const SCHATTEN_MAX = 0.55;

/**
 * Ab welchem Luftanteil ein Pixel als „am Raum" gilt.
 *
 * ## Woher der Wert kommt
 *
 * Gemessen (siehe Modulkopf):
 *
 *     Hügelkarte     Luftanteil im Mittel 0,015 — höchstens 0,07
 *     Kavernenkarte  Luftanteil im Mittel 0,151 — bis 0,59
 *
 * Ein Schwellenwert von 0,05 liegt **über** dem Maximum der Hügelkarte und
 * deutlich unter dem Mittel der Kavernenkarte. Damit ist die Trennung scharf:
 * Eine Hügelkarte bekommt gar keinen Schatten, eine Kavernenkarte in ihren
 * Hohlräumen vollen.
 */
export const LUFT_SCHWELLE = 0.05;

/**
 * Wie stark eine Höhlenwand zum Licht gezogen wird — höchstens.
 *
 * ## Warum aufhellen und nicht abdunkeln
 *
 * FUND (belegt): Die erste Fassung dunkelte ab. Gemessen im Browser ergab das
 * einen Helligkeitsunterschied von **3 %** — unsichtbar. Der Grund:
 *
 *     Bodenfarbe an der Oberfläche:  [86, 148, 74]
 *     Bodenfarbe in der Tiefe:       [34, 66, 32]
 *
 * Eine Höhle liegt tief, und tief ist bereits die dunkelste Farbe. Abdunkeln
 * wäre Schwarz auf Schwarz.
 *
 * Ein Höhleneingang lässt dagegen Licht herein: Die Wand neben der Öffnung ist
 * heller als das Gestein daneben. Das ist die Richtung, die dem Bild fehlte —
 * vorher war alles gleich dunkel, und deshalb sah die Öffnung wie ein Loch im
 * Papier aus statt wie ein Raum.
 *
 * 0,45 ist die Grenze: Eine Wand soll heller wirken als das Gestein daneben,
 * aber nicht wie Gras an der Oberfläche.
 *
 * OHNE `export`: Der Wert wird nur in DIESER Datei gelesen (unten bei
 * `zumLicht`). Der Audit meldete den Export als „ohne Leser" — ein Export, den
 * niemand importiert, ist eine Absicht ohne Wirkung.
 */
const LICHT_ANTEIL = 0.45;

/**
 * Rechnet die Schattierung für ein festes Pixel aus.
 *
 * @param {Uint8Array} bitmap
 * @param {number} width
 * @param {number} height
 * @param {number} x
 * @param {number} y
 * @returns {number} 0 = kein Schatten, 1 = voller Schatten
 */
export function schattenAnteil(bitmap, width, height, x, y) {
  /*
   * Der Luftanteil in der Umgebung — DAS trennende Merkmal.
   *
   * Ein Pixel tief im massiven Gestein hat ringsum Fels (Anteil ~0). Ein Pixel
   * an einer Höhlenwand hat in Reichweite immer eine Öffnung (Anteil 0,15 und
   * mehr). Der Unterschied ist Faktor 10 — groß genug für eine harte Schwelle.
   */
  let luft = 0;
  let gesamt = 0;
  const r = SCHATTEN_RADIUS;

  // In Schritten von 3 px — die Schattierung ist weich, feinere Abtastung
  // kostet nur Rechenzeit.
  for (let dy = -r; dy <= r; dy += 3) {
    const py = y + dy;
    if (py < 0 || py >= height) continue;
    for (let dx = -r; dx <= r; dx += 3) {
      const px = x + dx;
      if (px < 0 || px >= width) continue;
      gesamt += 1;
      if (!bitmap[py * width + px]) luft += 1;
    }
  }

  const luftAnteil = gesamt === 0 ? 0 : luft / gesamt;

  /*
   * Kein Raum in der Nähe, kein Effekt.
   *
   * Das ist die entscheidende Sperre. Ohne sie würde alles tiefe Gestein
   * verändert — und eine Hügelkarte wäre genauso behandelt wie eine Kaverne.
   */
  if (luftAnteil < LUFT_SCHWELLE) return 0;

  /*
   * Der Effekt wächst mit dem Luftanteil: Ein Pixel an einer breiten Kammer
   * ist stärker betroffen als eines in einem engen Gang.
   */
  return Math.min(1, (luftAnteil - LUFT_SCHWELLE) / 0.25);
}

/**
 * Wendet die Höhlenbehandlung auf einen gerenderten RGBA-Puffer an.
 *
 * ## Der Fehler, der hier beinahe eingebaut worden wäre
 *
 * Die erste Fassung **dunkelte ab**. Im Browser gemessen war der Unterschied
 * winzig:
 *
 *     Pixel mit viel Luft in der Nähe:  Helligkeit 39
 *     Pixel ohne:                       Helligkeit 47
 *
 * Drei Prozent — unsichtbar. Die Nachrechnung zeigte, warum:
 *
 *     Bodenfarbe an der Oberfläche:  [86, 148, 74]
 *     Bodenfarbe in der Tiefe:       [34, 66, 32]
 *
 * Eine Höhle liegt **tief** im Gestein, und tief ist bereits die dunkelste
 * Farbe. Eine weitere Abdunkelung ist Schwarz auf Schwarz — sie kann nicht
 * wirken, egal wie stark man sie macht.
 *
 * ## Was stattdessen wirkt: aufhellen
 *
 * Ein Höhleneingang lässt Licht herein. Die Wand neben der Öffnung liegt
 * deshalb im **Halbschatten** — sie ist heller als das Gestein daneben, weil
 * sie vom einfallenden Licht getroffen wird.
 *
 * Das ist auch physikalisch richtig: In einem Raum ist es an der Öffnung hell
 * und in der Tiefe dunkel. Genau diese Richtung fehlte dem Bild — vorher war
 * alles gleich dunkel, und deshalb sah die Öffnung wie ein Loch im Papier aus
 * statt wie ein Raum.
 *
 * Die Aufhellung ist der **Tiefenfarbe entgegengesetzt**: Die Wand neben der
 * Öffnung wird farblich dorthin gezogen, wo die Oberfläche wäre.
 *
 * @param {Uint8ClampedArray} data - RGBA-Puffer (wird verändert)
 * @param {Uint8Array} bitmap
 * @param {number} width
 * @param {number} height
 * @param {number[]} oberflaechenFarbe - die helle Farbe der Oberfläche [r,g,b]
 * @returns {Uint8ClampedArray} derselbe Puffer
 */
export function schattiereHoehlen(data, bitmap, width, height, oberflaechenFarbe = null) {
  /*
   * Luftanteil über Summentabellen statt über 289 Stichproben je Pixel.
   *
   * Fund (belegt, Audit 2026-10-09): `schattenAnteil` tastet je festem Pixel ein
   * 17×17-Gitter ab (Schritt 3). Auf einer 2560×1440-Karte mit Höhlen — das ist
   * die Standardkarte online (`kartentyp:'autonom'`) — sind das rund eine
   * Milliarde Lesezugriffe: gemessen 1 260 ms im Browser, davon rund 1 100 ms in
   * dieser Funktion. Der Hauptthread steht dabei still.
   *
   * Die Stichproben eines Pixels liegen alle im selben Raster wie das Pixel
   * selbst (`x + 3k`, `y + 3m`). Je Restklasse (x mod 3, y mod 3) ist die Zahl
   * der Luftzellen in einem 17×17-Fenster daher eine Kastensumme über das
   * Teilgitter — mit einer Summentabelle in O(1). Die Zahlen `luft` und
   * `gesamt` sind GANZZAHLIG dieselben wie in `schattenAnteil`, die Division und
   * alles danach unverändert: Das Ergebnis ist Byte für Byte identisch (ein Test
   * vergleicht gegen die Stichprobenfassung).
   */
  const halb = SCHATTEN_RADIUS / 3; // Fenster: -8 … +8 Teilgitterzellen
  const maxNx = Math.ceil(width / 3);
  const maxNy = Math.ceil(height / 3);
  const summe = new Int32Array((maxNx + 1) * (maxNy + 1));

  for (let ry = 0; ry < 3; ry += 1) {
    const ny = Math.ceil((height - ry) / 3);
    if (ny <= 0) continue;
    for (let rx = 0; rx < 3; rx += 1) {
      const nx = Math.ceil((width - rx) / 3);
      if (nx <= 0) continue;
      const zeile = nx + 1;

      // Summentabelle der Luftzellen dieses Teilgitters. Die Tabelle wird für
      // alle neun Restklassen wiederverwendet — Rand (Zeile 0, Spalte 0) neu auf 0.
      summe.fill(0, 0, (ny + 1) * zeile);
      for (let iy = 0; iy < ny; iy += 1) {
        const y = 3 * iy + ry;
        let laufend = 0;
        for (let ix = 0; ix < nx; ix += 1) {
          if (!bitmap[y * width + 3 * ix + rx]) laufend += 1;
          summe[(iy + 1) * zeile + ix + 1] = summe[iy * zeile + ix + 1] + laufend;
        }
      }

      for (let iy = 0; iy < ny; iy += 1) {
        const y = 3 * iy + ry;
        const y0 = iy - halb < 0 ? 0 : iy - halb;
        const y1 = iy + halb > ny - 1 ? ny - 1 : iy + halb;
        for (let ix = 0; ix < nx; ix += 1) {
          const x = 3 * ix + rx;
          if (!bitmap[y * width + x]) continue;

          const x0 = ix - halb < 0 ? 0 : ix - halb;
          const x1 = ix + halb > nx - 1 ? nx - 1 : ix + halb;
          const gesamt = (x1 - x0 + 1) * (y1 - y0 + 1);
          const luft = summe[(y1 + 1) * zeile + x1 + 1] - summe[y0 * zeile + x1 + 1]
            - summe[(y1 + 1) * zeile + x0] + summe[y0 * zeile + x0];
          const luftAnteil = gesamt === 0 ? 0 : luft / gesamt;
          if (luftAnteil < LUFT_SCHWELLE) continue;
          const anteil = Math.min(1, (luftAnteil - LUFT_SCHWELLE) / 0.25);
          if (anteil <= 0) continue;

          const index = (y * width + x) * 4;

          if (!oberflaechenFarbe) {
            const faktor = 1 - anteil * (1 - SCHATTEN_MAX);
            data[index] = Math.round(data[index] * faktor);
            data[index + 1] = Math.round(data[index + 1] * faktor);
            data[index + 2] = Math.round(data[index + 2] * faktor);
            continue;
          }

          const zumLicht = anteil * LICHT_ANTEIL;
          for (let k = 0; k < 3; k += 1) {
            data[index + k] = Math.round(
              data[index + k] * (1 - zumLicht) + oberflaechenFarbe[k] * zumLicht,
            );
          }
        }
      }
    }
  }
  return data;
}

export default schattiereHoehlen;
