/**
 * Bausteine für den einfachen Boden: Oberflächenzeilen, Grundfarbe, Kantenlicht.
 *
 * ## Wozu dieses Modul noch da ist
 *
 * Das SICHTBARE Gelände entsteht in `gelaendeStil.baueGelaendeEbene` in einem
 * Zug (Deckkraft aus der Maske, Färbung, ein `putImageData`). Die Bausteine hier
 * sind der einfache Unterbau: je Spalte die Oberfläche suchen, darunter die
 * Farbe interpolieren, die Oberkante beleuchten. Sie werden von Prüfwerkzeugen
 * (`check:terrain`) und ihren Tests benutzt.
 *
 * ## Was hier NICHT mehr ist — und warum
 *
 * Bis 2026-10-26 gab es einen WebGPU-Weg (`detectWebGpu`, `bakeTerrainLayer`,
 * einen WGSL-Shader). Er ist ENTFERNT, mit Zahlen belegt:
 *
 * Der Shader erzeugte nur den einfachen Boden. Das Spiel zeigt aber
 * `faerbeGelaende` — damit der Look stimmte, musste nach dem GPU-Backen
 * `veredleGelaende` laufen: 14,7 MB zurücklesen, den 400-ms-Kern auf der CPU
 * rechnen, 14,7 MB hochladen. Ergebnis: pixelgleich zur CPU-Ebene, die der
 * Renderer in EINEM Zug baut — nur mit zwei Kopien und einem zweiten
 * Rechendurchlauf obendrauf. Der Weg konnte also nie schneller sein.
 *
 * Wer ihn zurückholt, muss zuerst belegen, dass der Shader den VOLLEN Look
 * liefert (Voronoi-Steine, Lagen, Kantenlicht, Moos) — nicht nur den Grundton.
 *
 * @module terrainBaker
 */
/**
 * Oberflächenzeile je Spalte: die erste feste Zeile von oben.
 *
 * @param {Uint8Array} bitmap - 1 = fest, sonst Luft; Zeilenweise, Breite × Höhe
 * @param {number} width
 * @param {number} height
 * @returns {Int32Array} je Spalte der y-Wert oder -1
 */
export function surfaceRows(bitmap, width, height) {
  const rows = new Int32Array(width).fill(-1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (bitmap[y * width + x]) {
        rows[x] = y;
        break;
      }
    }
  }
  return rows;
}

/**
 * Farbe eines Bodenpixels in einer Tiefe.
 *
 * Ausgelagert, damit Test und GPU-Variante dieselbe Formel benutzen: Hier steht
 * die Formel EINMAL, und die GPU-Variante bildet sie in Shader-Sprache nach.
 * Ein Test vergleicht beide Ergebnisse.
 *
 * @param {number[]} surface - Farbe an der Oberfläche [r,g,b]
 * @param {number[]} deep - Farbe in der Tiefe [r,g,b]
 * @param {number} depth - 0 (Oberfläche) bis 1 (tief)
 * @returns {[number,number,number]}
 */
export function groundColorAt(surface, deep, depth) {
  const d = depth < 0 ? 0 : depth > 1 ? 1 : depth;
  return [
    Math.round(surface[0] + (deep[0] - surface[0]) * d),
    Math.round(surface[1] + (deep[1] - surface[1]) * d),
    Math.round(surface[2] + (deep[2] - surface[2]) * d),
  ];
}

/**
 * Tiefe, ab der die Bodenfarbe vollständig die Tiefenfarbe erreicht hat.
 *
 * Als Konstante exportiert, weil die GPU-Variante sie kennen muss: Ein anderer
 * Wert im Shader ergäbe einen sichtbar anderen Verlauf.
 */
export const DEPTH_REACH_PX = 160;

/**
 * Füllt einen RGBA-Puffer mit der Bodenfarbe — der reine Rechenkern.
 *
 * Bewusst OHNE Canvas, DOM oder GPU: Diese Funktion ist der gemeinsame
 * Bezugspunkt für beide Wege. Der CPU-Weg ruft sie direkt auf, der GPU-Weg
 * erzeugt dasselbe Ergebnis im Shader, und ein Test stellt beide gegenüber.
 *
 * Nur Pixel UNTER der Oberfläche werden geschrieben; alles darüber bleibt
 * transparent (Alpha 0). Der Puffer ist deshalb vorab zu nullen.
 *
 * @param {Uint8ClampedArray} data - RGBA-Zielpuffer (wird verändert)
 * @param {Uint8Array} bitmap
 * @param {number} width
 * @param {number} height
 * @param {{surface:number[], deep:number[]}} palette
 * @param {Int32Array} [rows] - vorberechnete Oberflächenzeilen
 * @returns {Uint8ClampedArray} derselbe Puffer
 */
export function fillGroundPixels(data, bitmap, width, height, palette, rows = null) {
  const surfaceRowsArr = rows ?? surfaceRows(bitmap, width, height);
  const oben = palette.surface;
  const unten = palette.deep;

  for (let x = 0; x < width; x++) {
    const start = surfaceRowsArr[x];
    if (start < 0) continue;

    /*
     * Die Tiefe zählt ab der Oberfläche, gemalt wird aber nur, wo die Maske
     * fest ist.
     *
     * FUND (belegt): Hier lief die Schleife von der Oberfläche bis zum
     * Kartenboden und malte JEDES Pixel — die Bitmap wurde nie gefragt. Bei
     * einem Höhenfeld fiel das nicht auf (unter der Oberfläche ist alles fest).
     * Bei einer 2D-Maske mit Höhlen malte es die Hohlräume zu: Im Browser war
     * von den Kavernen nichts zu sehen, obwohl die Kollision sie hatte —
     * nachgewiesen mit `isSolid` an fünf Spalten.
     *
     * Jetzt wird je Pixel geprüft. Die Tiefe für die Farbabstufung zählt
     * weiterhin ab der Oberfläche, damit die Hohlräume nicht plötzlich hell
     * erscheinen: Ein Loch in 300 px Tiefe soll so dunkel bleiben wie das Land
     * um es herum.
     */
    for (let y = start; y < height; y++) {
      if (!bitmap[y * width + x]) continue;

      const index = (y * width + x) * 4;
      const depth = Math.min(1, (y - start) / DEPTH_REACH_PX);
      data[index] = Math.round(oben[0] + (unten[0] - oben[0]) * depth);
      data[index + 1] = Math.round(oben[1] + (unten[1] - oben[1]) * depth);
      data[index + 2] = Math.round(oben[2] + (unten[2] - oben[2]) * depth);
      data[index + 3] = 255;
    }
  }
  return data;
}

/**
 * Kantenlicht-Farbe: die Bodenfarbe, aufgehellt.
 *
 * Ebenfalls ausgelagert — die GPU-Variante rechnet sie im Shader nach, und der
 * Test vergleicht sie. Ein festes Grün hätte auf Eis, Sand oder Basalt einen
 * Farbstich ergeben (der Grund, warum sie überhaupt aus der Palette kommt).
 *
 * @param {number[]} surface
 * @returns {string} `rgba(...)` mit Alpha 0.22
 */
export function edgeLightColor(surface) {
  return kantenStufe(surface, 0);
}

/**
 * Wie viele Stufen das Kantenlicht hat.
 *
 * ## Warum mehr als eine
 *
 * FUND (belegt): `npm run check:terrain` maß über die gesamte Projektlaufzeit
 *
 *     Spalten mit mehr als einem Strich: 0
 *     BEFUND: Die Kante ist überall ein EINZELNER Strich von 1 px Breite.
 *     Es gibt keinen Verlauf und keine zweite Stufe — die Kante ist damit
 *     eine Linie, kein Licht.
 *
 * Ein 1-px-Strich in einer helleren Farbe ist eine **Kontur**. Echte
 * Kantenbeleuchtung fällt ab: hell an der Oberfläche, dann schnell dunkler.
 * Erst dadurch wirkt die Kante wie eingefallenes Licht und gibt dem Gelände
 * Volumen — und genau das war der offene Punkt „Terrain optisch aufwerten".
 *
 * Drei Stufen sind der Kompromiss: genug für einen sichtbaren Verlauf, wenig
 * genug, dass die Kante keine breite Borte wird. Bei einer 1-px-Kontur ist der
 * Effekt nach 1 px vorbei; hier läuft er über 3 px aus.
 */
export const KANTEN_STUFEN = 3;

/**
 * Die Farbe einer Kantenstufe.
 *
 * ## Die Abstufung
 *
 * Stufe 0 ist die hellste (die Oberfläche selbst), jede weitere wird dunkler
 * und durchscheinender. Beides zusammen erzeugt den Verlauf: Wäre nur die
 * Helligkeit gestaffelt, bliebe die Kante ein Block mit harter Unterkante.
 *
 * Die Aufhellung fällt mit `1 / (1 + stufe)` — Stufe 0 bekommt +70, Stufe 1
 * +35, Stufe 2 +23. Der Alpha-Wert fällt ebenso: 0,22 → 0,11 → 0,073.
 *
 * FUND (belegt, 2026-09-18): Hier stand „0,22 → 0,15 → 0,10". Die Rechnung
 * `0.22 * (1 / (1 + stufe))` ergibt aber **0,22 · 0,11 · 0,0733** — gemessen mit
 * `npm run check:terrain` (Ausgabe „Alpha je Stufe"). Die abgeschriebene Reihe
 * beschrieb eine Abstufung, die der Code nie erzeugt hat; wer die Zahlen
 * brauchte, bekam falsche.
 *
 * ## Warum ein Verlauf und nicht eine feste Zahl
 *
 * Die Werte sind über die Stufe gerechnet, nicht abgeschrieben. Eine Tabelle
 * mit drei Farbwerten müsste bei jeder Änderung der Bodenfarbe mitgezogen
 * werden — so folgt sie automatisch.
 *
 * @param {number[]} surface - die Bodenfarbe (RGB)
 * @param {number} stufe - 0 bis KANTEN_STUFEN-1
 * @returns {string} `rgba(...)`
 */
export function kantenStufe(surface, stufe) {
  const anteil = 1 / (1 + Math.max(0, stufe));
  const r = Math.min(255, surface[0] + Math.round(70 * anteil));
  const g = Math.min(255, surface[1] + Math.round(70 * anteil));
  const b = Math.min(255, surface[2] + Math.round(60 * anteil));
  const alpha = 0.22 * anteil;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

/**
 * Legt die Kantenlinie der Oberfläche in die Bitmap-Ebene.
 *
 * Läuft über einen Canvas, weil das Ergebnis ein Canvas ist — die GPU-Variante
 * ersetzt das später vollständig. Die Funktion bleibt trotzdem getrennt, damit
 * sichtbar ist, was zum reinen Rechenkern gehört und was nicht.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Uint8Array} bitmap
 * @param {number} width
 * @param {number} height
 * @param {number[]} surface
 */
export function drawSurfaceEdge(ctx, bitmap, width, height, surface) {
  ctx.globalCompositeOperation = 'source-atop';

  /*
   * Die Farben EINMAL berechnen, nicht je Pixel.
   *
   * `kantenStufe` rechnet dreimal `Math.round` und eine Division — bei 1280×720
   * und drei Stufen wären das über zwei Millionen Aufrufe für drei Werte, die
   * sich nie ändern.
   */
  const stufenFarben = [];
  for (let s = 0; s < KANTEN_STUFEN; s += 1) stufenFarben.push(kantenStufe(surface, s));

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      if (!bitmap[y * width + x]) continue;
      if (y > 0 && bitmap[(y - 1) * width + x]) continue;

      /*
       * Die Kante — als VERLAUF statt als Linie.
       *
       * FUND (belegt): Hier stand ein einzelnes `fillRect(x, y, 1, 2)`. Das
       * ergab genau eine Stufe, und `npm run check:terrain` meldete über die
       * gesamte Projektlaufzeit:
       *
       *     Spalten mit mehr als einem Strich: 0
       *     BEFUND: Die Kante ist eine Linie, kein Licht.
       *
       * Die Stufen laufen nach unten aus, jede dunkler und durchscheinender.
       * Die Länge einer Stufe ist 1 px — bei drei Stufen ist die Kante damit
       * 3 px hoch statt 2.
       */
      for (let s = 0; s < KANTEN_STUFEN; s += 1) {
        const zy = y + s;
        if (zy >= height) break;
        ctx.fillStyle = stufenFarben[s];
        ctx.fillRect(x, zy, 1, 1);
      }

      /*
       * KEIN `break`.
       *
       * FUND (belegt): Hier stand ein `break` — es wurde also nur die ERSTE
       * Kante je Spalte gezeichnet. Bei einem Höhenfeld ist das richtig: Es
       * gibt je Spalte genau eine Oberfläche.
       *
       * Bei einer 2D-Maske mit Höhlen gibt es MEHRERE Kanten je Spalte — die
       * Decke einer Kammer, ihr Boden, die nächste Kammer darunter. Alle außer
       * der obersten blieben unbeleuchtet. Gemessen an einer Höhlenkante:
       * vorher kein Saum, jetzt [92,129,77] gegen Gestein [46,66,32].
       */
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
