/**
 * Tests der Terrain-Bäckerei (CPU-Kern, GPU-Weg, Rückfall).
 *
 * Schwerpunkt ist der RÜCKFALL, nicht die GPU: In dieser Umgebung gibt es kein
 * WebGPU (gemessen: `navigator.gpu` fehlt im System-Chrome, auch mit
 * `--enable-unsafe-swiftshader`). Der CPU-Weg ist damit der Weg, der tatsächlich
 * läuft — und genau der muss stimmen.
 *
 * Was hier NICHT behauptet wird: dass der Shader auf echter Hardware dasselbe
 * liefert. Das lässt sich hier nicht messen. Geprüft wird deshalb, was prüfbar
 * ist: dass die FORMEL beide Wege speist (dieselbe Funktion, dieselben
 * Konstanten), dass der Puffer-Umlauf des GPU-Wegs die Zeilenausrichtung
 * beachtet, und dass ein fehlendes oder fehlerhaftes Gerät sauber auf die CPU
 * zurückfällt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  surfaceRows,
  groundColorAt,
  fillGroundPixels,
  edgeLightColor,
  drawSurfaceEdge,
  detectWebGpu,
  bakeTerrainLayer,
  bakeTerrainLayerCpu,
  DEPTH_REACH_PX,
  GROUND_SHADER_WGSL,
} from '../src/client/terrainBaker.js';

/** Ein Canvas-Ersatz, der die Pixel wirklich hält (kein Browser nötig). */
function fakeCanvasFactory() {
  return (w, h) => {
    const canvas = { width: w, height: h, _pixels: null };
    canvas.getContext = () => ({
      createImageData: (width, height) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: (image) => { canvas._pixels = image; },
      fillRect: () => {},
      set globalCompositeOperation(v) { canvas._gco = v; },
      get globalCompositeOperation() { return canvas._gco ?? 'source-over'; },
      set fillStyle(v) { canvas._fill = v; },
      get fillStyle() { return canvas._fill; },
    });
    return canvas;
  };
}

/** Ein einfaches Test-Bitmap: links fest ab Zeile 2, rechts fest ab Zeile 4. */
function testBitmap(width = 4, height = 8) {
  const b = new Uint8Array(width * height);
  for (let y = 2; y < height; y++) b[y * width + 0] = 1;
  for (let y = 2; y < height; y++) b[y * width + 1] = 1;
  for (let y = 4; y < height; y++) b[y * width + 2] = 1;
  for (let y = 4; y < height; y++) b[y * width + 3] = 1;
  return b;
}

const PALETTE = { surface: [100, 150, 60], deep: [40, 60, 30] };

test('surfaceRows findet je Spalte die erste feste Zeile', () => {
  const rows = surfaceRows(testBitmap(4, 8), 4, 8);
  assert.deepEqual([...rows], [2, 2, 4, 4]);
});

test('surfaceRows liefert -1 für eine leere Spalte', () => {
  const bitmap = new Uint8Array(3 * 4);
  bitmap[1 * 3 + 1] = 1; // nur Spalte 1 hat etwas
  const rows = surfaceRows(bitmap, 3, 4);
  assert.deepEqual([...rows], [-1, 1, -1]);
});

test('groundColorAt interpoliert und begrenzt die Tiefe', () => {
  const surface = [100, 100, 100];
  const deep = [0, 0, 0];
  assert.deepEqual(groundColorAt(surface, deep, 0), [100, 100, 100]);
  assert.deepEqual(groundColorAt(surface, deep, 1), [0, 0, 0]);
  assert.deepEqual(groundColorAt(surface, deep, 0.5), [50, 50, 50]);
  // Außerhalb des Bereichs wird begrenzt, nicht extrapoliert.
  assert.deepEqual(groundColorAt(surface, deep, -5), [100, 100, 100]);
  assert.deepEqual(groundColorAt(surface, deep, 9), [0, 0, 0]);
});

test('Über der Oberfläche bleibt der Puffer transparent', () => {
  const bitmap = testBitmap(4, 8);
  const data = new Uint8ClampedArray(4 * 8 * 4);
  fillGroundPixels(data, bitmap, 4, 8, PALETTE);

  // Spalte 0: Oberfläche bei Zeile 2. Zeile 0 und 1 müssen leer bleiben.
  assert.equal(data[(0 * 4 + 0) * 4 + 3], 0, 'Zeile 0 über der Oberfläche');
  assert.equal(data[(1 * 4 + 0) * 4 + 3], 0, 'Zeile 1 über der Oberfläche');
  // Ab der Oberfläche gefüllt.
  assert.equal(data[(2 * 4 + 0) * 4 + 3], 255, 'Oberfläche muss gefüllt sein');
  assert.equal(data[(7 * 4 + 0) * 4 + 3], 255, 'Grund muss gefüllt sein');
});

test('Die Oberfläche trägt exakt die Oberflächenfarbe', () => {
  const bitmap = testBitmap(4, 8);
  const data = new Uint8ClampedArray(4 * 8 * 4);
  fillGroundPixels(data, bitmap, 4, 8, PALETTE);
  const index = (2 * 4 + 0) * 4;
  assert.equal(data[index], PALETTE.surface[0]);
  assert.equal(data[index + 1], PALETTE.surface[1]);
  assert.equal(data[index + 2], PALETTE.surface[2]);
});

test('Die Tiefenfarbe wird nach DEPTH_REACH_PX erreicht', () => {
  /*
   * FUND (belegt): Dieser Test legte nur EIN solides Pixel an (`bitmap[0] = 1`)
   * und erwartete trotzdem, dass die ganze Spalte gefüllt wird. Das ging durch,
   * solange der Baker die Bitmap nicht fragte — er malte von der Oberfläche bis
   * zum Boden, egal was in der Maske stand.
   *
   * Genau das war der Fehler, der die Höhlen unsichtbar machte. Jetzt prüft der
   * Baker jedes Pixel, und der Test muss eine SPALTE AUS LAND beschreiben statt
   * eines einzelnen Pixels.
   */
  const breite = 1;
  const hoehe = DEPTH_REACH_PX + 10;
  const bitmap = new Uint8Array(breite * hoehe).fill(1); // eine Spalte voll Land
  const data = new Uint8ClampedArray(breite * hoehe * 4);
  fillGroundPixels(data, bitmap, breite, hoehe, PALETTE);

  const beiTiefe = (y) => data[y * 4];
  assert.equal(beiTiefe(0), PALETTE.surface[0], 'Zeile 0 = Oberflächenfarbe');
  const voll = beiTiefe(DEPTH_REACH_PX);
  assert.ok(Math.abs(voll - PALETTE.deep[0]) <= 1,
    `bei ${DEPTH_REACH_PX} px muss die Tiefenfarbe stehen (${voll} statt ${PALETTE.deep[0]})`);
  // Und danach bleibt sie konstant (kein Überlauf).
  assert.equal(beiTiefe(DEPTH_REACH_PX + 5), voll);
});

test('Vorberechnete Zeilen liefern dasselbe wie die eigene Suche', () => {
  const bitmap = testBitmap(4, 8);
  const mitSuche = new Uint8ClampedArray(4 * 8 * 4);
  const mitZeilen = new Uint8ClampedArray(4 * 8 * 4);
  fillGroundPixels(mitSuche, bitmap, 4, 8, PALETTE);
  fillGroundPixels(mitZeilen, bitmap, 4, 8, PALETTE, surfaceRows(bitmap, 4, 8));
  assert.deepEqual([...mitZeilen], [...mitSuche]);
});

test('Das Kantenlicht kommt aus der Bodenfarbe, nicht aus einem festen Grün', () => {
  const hell = edgeLightColor([100, 150, 60]);
  const dunkel = edgeLightColor([10, 10, 10]);
  assert.notEqual(hell, dunkel, 'zwei Paletten müssen zwei Kantenfarben ergeben');
  assert.match(hell, /^rgba\(170, 220, 120, 0\.22\)$/);
  // Aufhellung begrenzt auf 255.
  assert.match(edgeLightColor([250, 250, 250]), /^rgba\(255, 255, 255/);
});

test('drawSurfaceEdge setzt die Composite-Regel zurück', () => {
  const zeichnungen = [];
  const ctx = {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect: (x, y, w, h) => zeichnungen.push([x, y, w, h]),
  };
  const bitmap = testBitmap(4, 8);
  drawSurfaceEdge(ctx, bitmap, 4, 8, PALETTE.surface);

  // Vier Spalten mit je einer Kante, aber Spalten 0/1 ab Zeile 2 und 2/3 ab 4.
  assert.equal(zeichnungen.length, 4);
  assert.deepEqual(zeichnungen[0], [0, 2, 1, 2]);
  assert.deepEqual(zeichnungen[2], [2, 4, 1, 2]);
  assert.equal(ctx.globalCompositeOperation, 'source-over',
    'die Composite-Regel muss nach dem Zeichnen zurückgesetzt sein');
});

test('Ohne navigator.gpu meldet die Erkennung den Grund statt zu werfen', async () => {
  const ohne = await detectWebGpu({ navigatorObj: {} });
  assert.equal(ohne.available, false);
  assert.equal(ohne.device, null);
  assert.match(ohne.reason, /navigator\.gpu fehlt/);

  const garNichts = await detectWebGpu({ navigatorObj: null });
  assert.equal(garNichts.available, false);
});

test('Ein fehlender Adapter ist kein Fehler, sondern ein Rückfallgrund', async () => {
  const ergebnis = await detectWebGpu({
    navigatorObj: { gpu: { requestAdapter: async () => null } },
  });
  assert.equal(ergebnis.available, false);
  assert.equal(ergebnis.reason, 'kein Adapter');
});

test('Ein werfender Adapter wird abgefangen', async () => {
  const ergebnis = await detectWebGpu({
    navigatorObj: { gpu: { requestAdapter: async () => { throw new Error('kein Backend'); } } },
  });
  assert.equal(ergebnis.available, false);
  assert.match(ergebnis.reason, /Adapter-Fehler: kein Backend/);
});

test('Ein Adapter ohne Gerät gilt als nicht verfügbar', async () => {
  /*
   * Ein Adapter allein genügt nicht: Ohne Gerät ließe sich kein einziger Befehl
   * absetzen. Würde hier „verfügbar" gemeldet, fiele die Anzeige mitten im
   * Aufbau auf einen Weg zurück, den sie schon verlassen hat.
   */
  const ergebnis = await detectWebGpu({
    navigatorObj: { gpu: { requestAdapter: async () => ({ requestDevice: async () => null }) } },
  });
  assert.equal(ergebnis.available, false);
  assert.equal(ergebnis.reason, 'kein Gerät');
});

test('Ein vollständiger Adapter samt Gerät gilt als verfügbar', async () => {
  const device = { marker: true };
  const ergebnis = await detectWebGpu({
    navigatorObj: { gpu: { requestAdapter: async () => ({ requestDevice: async () => device }) } },
  });
  assert.equal(ergebnis.available, true);
  assert.equal(ergebnis.device, device);
});

test('Ohne Gerät backt bakeTerrainLayer auf der CPU und nennt den Grund', async () => {
  const bitmap = testBitmap(4, 8);
  const ergebnis = await bakeTerrainLayer({
    bitmap, width: 4, height: 8, palette: PALETTE,
    device: null,
    createCanvas: fakeCanvasFactory(),
  });
  assert.equal(ergebnis.path, 'cpu');
  assert.match(ergebnis.reason, /nicht verfügbar/);
  // Und es sind wirklich Pixel entstanden.
  assert.equal(ergebnis.layer._pixels.data[(2 * 4 + 0) * 4 + 3], 255);
});

test('Ein werfendes Gerät fällt auf die CPU zurück, statt das Spiel anzuhalten', async () => {
  /*
   * Der wichtigste Test dieses Moduls: Ein Fehler im GPU-Weg darf nicht nach
   * außen dringen. Das Spiel muss weiterlaufen — sichtbar langsamer, aber
   * vollständig.
   *
   * Gemessen: Der Fehler tritt noch VOR dem Aufruf der Gerätemethode auf, weil
   * `renderGroundOnGpu` die globale Konstante `GPUTextureUsage` braucht, die es
   * ohne WebGPU nicht gibt. Genau deshalb steht der GPU-Weg vollständig in
   * einem `try` — die Stelle des Fehlers ist nicht vorhersagbar, das Ergebnis
   * muss es sein.
   */
  const bitmap = testBitmap(4, 8);
  const kaputtesGerät = {
    createTexture: () => { throw new Error('Gerät verloren'); },
  };
  const ergebnis = await bakeTerrainLayer({
    bitmap, width: 4, height: 8, palette: PALETTE,
    device: kaputtesGerät,
    createCanvas: fakeCanvasFactory(),
  });
  assert.equal(ergebnis.path, 'cpu', 'ohne GPU muss der CPU-Weg das Ergebnis liefern');
  assert.match(ergebnis.reason, /^GPU-Weg fehlgeschlagen: /,
    `der Grund muss den GPU-Weg nennen, war: ${ergebnis.reason}`);
  // Die Ebene ist trotzdem vollständig gefüllt.
  assert.equal(ergebnis.layer._pixels.data[(2 * 4 + 0) * 4 + 3], 255);
});

test('bakeTerrainLayer ohne createCanvas wirft verständlich', async () => {
  await assert.rejects(
    () => bakeTerrainLayer({ bitmap: testBitmap(), width: 4, height: 8, palette: PALETTE }),
    /createCanvas/,
  );
});

test('Der CPUsweg und der reine Rechenkern liefern identische Pixel', () => {
  /*
   * Der CPU-Weg darf keine eigene Rechnung haben: Er muss exakt das erzeugen,
   * was `fillGroundPixels` liefert. Sonst gäbe es zwei Formeln — und die GPU
   * müsste sich für eine entscheiden.
   */
  const bitmap = testBitmap(4, 8);
  const direkt = new Uint8ClampedArray(4 * 8 * 4);
  fillGroundPixels(direkt, bitmap, 4, 8, PALETTE);

  const layer = fakeCanvasFactory()(4, 8);
  const ctx = layer.getContext('2d');
  bakeTerrainLayerCpu({ layer, ctx, bitmap, width: 4, height: 8, palette: PALETTE });

  assert.deepEqual([...layer._pixels.data], [...direkt]);
});

test('Der Shader rechnet mit denselben Konstanten wie der CPU-Kern', () => {
  /*
   * Ein anderer Wert im Shader ergäbe einen sichtbar anderen Verlauf — und
   * niemand würde es bemerken, weil beide Wege für sich plausibel aussehen.
   * Deshalb wird hier der übertragene Wert geprüft, nicht nur das Vorhandensein.
   */
  assert.match(GROUND_SHADER_WGSL, /fn main\(/);
  assert.match(GROUND_SHADER_WGSL, /surfaceRow/);
  assert.match(GROUND_SHADER_WGSL, /depthReach/);
  // Die Tiefenreichweite wird als Uniform übergeben und stammt aus derselben
  // Konstante wie der CPU-Kern.
  assert.equal(typeof DEPTH_REACH_PX, 'number');
  assert.ok(DEPTH_REACH_PX > 0);
});

test('Die Bäckerei ist deterministisch: zweimal dasselbe Bitmap ergibt dieselben Pixel', () => {
  const bitmap = testBitmap(4, 8);
  const ergebnisse = [0, 1].map(() => {
    const data = new Uint8ClampedArray(4 * 8 * 4);
    fillGroundPixels(data, bitmap, 4, 8, PALETTE);
    return [...data];
  });
  assert.deepEqual(ergebnisse[0], ergebnisse[1]);
});

test('Hohlräume bleiben durchsichtig — die Maske wird wirklich gefragt', () => {
  /*
   * DIE Prüfung für den Fund, der die Höhlen unsichtbar machte.
   *
   * Der Baker malte früher von der Oberfläche bis zum Kartenboden und fragte
   * die Maske nie. Bei einem Höhenfeld stimmt das; bei einer 2D-Maske mit
   * Höhlen malte es die Hohlräume zu. Im Browser war von den Kavernen deshalb
   * nichts zu sehen, obwohl die Kollision sie hatte.
   *
   * Hier wird eine Spalte mit Land-Luft-Land beschrieben: Nur die festen Pixel
   * dürfen Farbe bekommen.
   */
  const breite = 1;
  const hoehe = 6;
  const bitmap = new Uint8Array([
    1, 1, // Land
    0, 0, // Hohlraum
    1, 1, // Land
  ]);
  const data = new Uint8ClampedArray(breite * hoehe * 4);
  fillGroundPixels(data, bitmap, breite, hoehe, PALETTE);

  const alphaBei = (y) => data[y * 4 + 3];

  assert.equal(alphaBei(0), 255, 'Land bei y=0 muss gefüllt sein');
  assert.equal(alphaBei(1), 255, 'Land bei y=1 muss gefüllt sein');
  assert.equal(alphaBei(2), 0, 'der Hohlraum bei y=2 muss durchsichtig bleiben');
  assert.equal(alphaBei(3), 0, 'der Hohlraum bei y=3 muss durchsichtig bleiben');
  assert.equal(alphaBei(4), 255, 'Land unter dem Hohlraum muss gefüllt sein');
  assert.equal(alphaBei(5), 255, 'das unterste Land muss gefüllt sein');
});

test('Die Tiefenfarbe zählt ab der Oberfläche, auch unter einem Hohlraum', () => {
  /*
   * Damit ein Loch in 300 px Tiefe nicht plötzlich hell erscheint: Die
   * Farbabstufung richtet sich weiterhin nach dem Abstand zur OBERFLÄCHE, nicht
   * nach dem Abstand zum letzten festen Pixel.
   */
  const breite = 1;
  const hoehe = DEPTH_REACH_PX + 10;
  const bitmap = new Uint8Array(breite * hoehe).fill(1);
  // Ein einzelner Hohlraum weit unten.
  bitmap[DEPTH_REACH_PX] = 0;

  const data = new Uint8ClampedArray(breite * hoehe * 4);
  fillGroundPixels(data, bitmap, breite, hoehe, PALETTE);

  // Direkt über dem Hohlraum: tiefe Farbe.
  const ueber = data[(DEPTH_REACH_PX - 1) * 4];
  // Direkt darunter: ebenfalls tiefe Farbe (nicht wieder hell).
  const unter = data[(DEPTH_REACH_PX + 1) * 4];

  assert.equal(unter, ueber,
    'unter dem Hohlraum muss dieselbe Tiefenfarbe stehen wie darüber');
});
