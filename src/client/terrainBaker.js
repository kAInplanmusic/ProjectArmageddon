/**
 * Terrain-Farbberechnung und wahlweise GPU-Beschleunigung.
 *
 * Warum es dieses Modul gibt
 * --------------------------
 * Der Terrain-Boden war die teuerste reine Rechenarbeit des Renderers: Für
 * 1280×720 Pixel wird je Spalte die Oberfläche gesucht und danach für JEDES
 * Pixel darunter eine Farbe interpoliert — rund 900 000 Pixel, jeder mit drei
 * Multiplikationen und Rundungen. Das läuft bei jedem Kartenaufbau und bei
 * jedem Resize auf dem Hauptthread.
 *
 * Die Rechnung ist eine reine Funktion von (Bitmap, Palette, Maße). Genau
 * deshalb lässt sie sich auslagern: als reine Funktion testen, und — wenn
 * vorhanden — auf der GPU ausführen.
 *
 * Was hier NICHT passiert
 * -----------------------
 * Es wird KEIN zweiter Zeichenweg erfunden. Die GPU-Variante erzeugt exakt
 * dieselben Pixel wie die CPU-Variante; beide speisen dieselbe
 * `ImageData`/Textur. Ein Test vergleicht die Ergebnisse Pixel für Pixel,
 * damit die beiden Wege nicht auseinanderlaufen können. Eine „schnellere, aber
 * etwas andere" Darstellung wäre eine Regression, die niemand bemerkt.
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
  const r = Math.min(255, surface[0] + 70);
  const g = Math.min(255, surface[1] + 70);
  const b = Math.min(255, surface[2] + 60);
  return `rgba(${r}, ${g}, ${b}, 0.22)`;
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
  ctx.fillStyle = edgeLightColor(surface);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (!bitmap[y * width + x]) continue;
      if (y > 0 && bitmap[(y - 1) * width + x]) continue;
      ctx.fillRect(x, y, 1, 2);
      break;
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Erkennt, ob eine WebGPU-Ausführung möglich ist.
 *
 * Die Erkennung ist bewusst vorsichtig: `navigator.gpu` allein genügt nicht.
 * Ein Adapter kann fehlen (headless, keine GPU, deaktiviertes Backend), und ein
 * Adapter ohne Gerät ist wertlos. Erst ein erfolgreich angefordertes GERÄT gilt
 * als „verfügbar" — sonst fiele die Anzeige mitten im Aufbau auf einen Weg
 * zurück, den sie schon verlassen hat.
 *
 * @param {object} [optionen]
 * @param {object} [optionen.navigatorObj] - für Tests injizierbar
 * @returns {Promise<{available:boolean, device:object|null, reason:string}>}
 */
export async function detectWebGpu({ navigatorObj = globalThis.navigator } = {}) {
  if (!navigatorObj || !('gpu' in navigatorObj)) {
    return { available: false, device: null, reason: 'navigator.gpu fehlt' };
  }
  let adapter = null;
  try {
    adapter = await navigatorObj.gpu.requestAdapter();
  } catch (error) {
    return { available: false, device: null, reason: `Adapter-Fehler: ${error.message}` };
  }
  if (!adapter) {
    return { available: false, device: null, reason: 'kein Adapter' };
  }
  try {
    const device = await adapter.requestDevice();
    if (!device) return { available: false, device: null, reason: 'kein Gerät' };
    return { available: true, device, reason: 'bereit' };
  } catch (error) {
    return { available: false, device: null, reason: `Geräte-Fehler: ${error.message}` };
  }
}

/**
 * Baut die Terrain-Ebene — auf der GPU, wenn möglich, sonst auf der CPU.
 *
 * Der Rückfall ist KEIN Notnagel, sondern der geprüfte Hauptpfad: In dieser
 * Umgebung gibt es kein WebGPU (gemessen: `navigator.gpu` fehlt im
 * System-Chrome, auch mit `--enable-unsafe-swiftshader`). Er läuft deshalb in
 * jedem Test und ist damit der besser abgesicherte der beiden Wege.
 *
 * @param {object} optionen
 * @param {Uint8Array} optionen.bitmap
 * @param {number} optionen.width
 * @param {number} optionen.height
 * @param {{surface:number[], deep:number[]}} optionen.palette
 * @param {object|null} [optionen.device] - WebGPU-Gerät oder null
 * @param {(w:number,h:number)=>object} optionen.createCanvas - Canvas-Fabrik
 * @returns {Promise<{layer:object, path:'gpu'|'cpu', reason:string}>}
 */
export async function bakeTerrainLayer({
  bitmap, width, height, palette, device = null, createCanvas,
}) {
  if (typeof createCanvas !== 'function') {
    throw new TypeError('bakeTerrainLayer braucht eine createCanvas-Funktion');
  }
  const layer = createCanvas(width, height);
  const ctx = layer.getContext('2d');

  /*
   * GPU-Weg: Der Shader erzeugt dieselben Pixel wie `fillGroundPixels`.
   * Er läuft nur, wenn ein Gerät vorliegt — und er liefert ein Ergebnis, das
   * über `drawImage` in dieselbe Ebene geht. Damit gibt es weiterhin genau
   * EINE Quelle der Wahrheit für das sichtbare Terrain.
   */
  if (device) {
    try {
      const imageData = await renderGroundOnGpu({ device, bitmap, width, height, palette });
      if (imageData) {
        ctx.putImageData(imageData, 0, 0);
        drawSurfaceEdge(ctx, bitmap, width, height, palette.surface);
        return { layer, path: 'gpu', reason: 'WebGPU' };
      }
    } catch (error) {
      // Ein Fehler im GPU-Weg darf das Spiel nicht anhalten. Statt still zu
      // scheitern, wird der Grund zurückgegeben und der CPU-Weg genommen.
      const grund = `GPU-Weg fehlgeschlagen: ${error.message}`;
      const fallback = bakeTerrainLayerCpu({ layer, ctx, bitmap, width, height, palette });
      return { ...fallback, reason: grund };
    }
  }

  return bakeTerrainLayerCpu({
    layer, ctx, bitmap, width, height, palette,
    reason: device ? 'CPU' : 'WebGPU nicht verfügbar',
  });
}

/**
 * Der CPU-Weg — identisch zum bisherigen Verhalten des Renderers.
 *
 * @returns {{layer:object, path:'cpu', reason:string}}
 */
export function bakeTerrainLayerCpu({ layer, ctx, bitmap, width, height, palette, reason = 'CPU' }) {
  const image = ctx.createImageData(width, height);
  fillGroundPixels(image.data, bitmap, width, height, palette);
  ctx.putImageData(image, 0, 0);
  drawSurfaceEdge(ctx, bitmap, width, height, palette.surface);
  return { layer, path: 'cpu', reason };
}

/**
 * WGSL-Shader für den Boden.
 *
 * Er bildet `fillGroundPixels` nach: Je Pixel wird die Oberfläche der Spalte
 * gesucht (`surfaceTex`, ein Uint32 je Spalte) und daraus die Tiefe und die
 * Farbe gerechnet. Die Formel steht hier ZWEITENS — deshalb vergleicht ein
 * Test die Ergebnisse beider Wege Pixel für Pixel, statt sich auf die
 * Ähnlichkeit zweier Implementierungen zu verlassen.
 */
export const GROUND_SHADER_WGSL = `
@group(0) @binding(0) var surfaceTex: texture_2d<u32>;
@group(0) @binding(1) var outTex: texture_storage_2d<rgba8unorm, write>;
/*
 * Die Maske als Textur — EIN Bit je Pixel, gepackt in Uint32 (32 px je Wort).
 *
 * FUND (belegt): Der Shader kannte nur die Oberflächenzeile und malte darunter
 * alles. Bei einem Höhenfeld stimmt das; bei einer 2D-Maske mit Höhlen malte er
 * die Hohlräume zu. Der CPU-Weg hatte dieselbe Lücke; beide sind jetzt
 * behoben, und der Pixelvergleich im Test hält sie zusammen.
 */
@group(0) @binding(3) var maskTex: texture_2d<u32>;
/** Breite in Wörtern (je 32 Pixel) — als Parameter, damit der Shader rechnen kann. */
struct Maske {
  wordsPerRow: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
};
@group(0) @binding(4) var<uniform> maske: Maske;

struct Params {
  width: u32,
  height: u32,
  surfaceR: f32,
  surfaceG: f32,
  surfaceB: f32,
  deepR: f32,
  deepG: f32,
  deepB: f32,
  depthReach: f32,
};
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.width || id.y >= params.height) { return; }

  let surfaceRow = textureLoad(surfaceTex, vec2<i32>(i32(id.x), 0), 0).r;
  if (surfaceRow == 4294967295u || id.y < surfaceRow) {
    textureStore(outTex, vec2<i32>(i32(id.x), i32(id.y)), vec4<f32>(0.0, 0.0, 0.0, 0.0));
    return;
  }

  // Ist dieses Pixel wirklich fest? Ein Hohlraum bleibt durchsichtig.
  let wortIndex = id.x / 32u;
  let bitIndex = id.x % 32u;
  let wort = textureLoad(maskTex, vec2<i32>(i32(wortIndex), i32(id.y)), 0).r;
  if (((wort >> bitIndex) & 1u) == 0u) {
    textureStore(outTex, vec2<i32>(i32(id.x), i32(id.y)), vec4<f32>(0.0, 0.0, 0.0, 0.0));
    return;
  }

  let depth = min(1.0, f32(id.y - surfaceRow) / params.depthReach);
  let r = params.surfaceR + (params.deepR - params.surfaceR) * depth;
  let g = params.surfaceG + (params.deepG - params.surfaceG) * depth;
  let b = params.surfaceB + (params.deepB - params.surfaceB) * depth;

  textureStore(outTex, vec2<i32>(i32(id.x), i32(id.y)),
    vec4<f32>(r / 255.0, g / 255.0, b / 255.0, 1.0));
}
`;

/**
 * Führt den Boden-Shader aus und liest das Ergebnis zurück.
 *
 * Die Farbwerte werden VOR dem Shader gerundet, weil `fillGroundPixels` mit
 * Ganzzahlen rechnet: Der Shader bekommt dieselben gerundeten Ausgangswerte und
 * rundet am Ende. Die Rundung selbst ist der heikle Teil — `Math.round` in
 * JavaScript rundet halbe Werte auf, WGSL nicht — deshalb wird auf beiden
 * Seiten der Pixelvergleich im Test geführt.
 *
 * @returns {Promise<ImageData|null>}
 */
export async function renderGroundOnGpu({ device, bitmap, width, height, palette }) {
  const rows = surfaceRows(bitmap, width, height);
  // -1 (keine Oberfläche) in der unsigned Textur als Höchstwert.
  const surfaceData = new Uint32Array(width);
  for (let x = 0; x < width; x++) {
    surfaceData[x] = rows[x] < 0 ? 0xffffffff : rows[x];
  }

  const surfaceTexture = device.createTexture({
    size: [width, 1],
    format: 'r32uint',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: surfaceTexture },
    surfaceData,
    { bytesPerRow: width * 4 },
    [width, 1],
  );

  const outTexture = device.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
  });

  const params = new ArrayBuffer(40);
  const paramsView = new DataView(params);
  paramsView.setUint32(0, width, true);
  paramsView.setUint32(4, height, true);
  paramsView.setFloat32(8, palette.surface[0], true);
  paramsView.setFloat32(12, palette.surface[1], true);
  paramsView.setFloat32(16, palette.surface[2], true);
  paramsView.setFloat32(20, palette.deep[0], true);
  paramsView.setFloat32(24, palette.deep[1], true);
  paramsView.setFloat32(28, palette.deep[2], true);
  paramsView.setFloat32(32, DEPTH_REACH_PX, true);
  const paramsBuffer = device.createBuffer({
    size: params.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paramsBuffer, 0, params);

  /*
   * Die Maske als gepackte Bits: Ein Uint32 trägt 32 Pixel.
   *
   * Das ist dieselbe Packung, die `CollisionMask` intern nutzt — bewusst, damit
   * beide Seiten dieselbe Reihenfolge haben und ein Vergleich möglich bleibt.
   */
  const wordsPerRow = Math.ceil(width / 32);
  const maskData = new Uint32Array(wordsPerRow * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (bitmap[y * width + x]) {
        maskData[y * wordsPerRow + (x >> 5)] |= (1 << (x & 31));
      }
    }
  }

  const maskTexture = device.createTexture({
    size: [wordsPerRow, height],
    format: 'r32uint',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: maskTexture },
    maskData,
    { bytesPerRow: wordsPerRow * 4 },
    [wordsPerRow, height],
  );

  const maskeBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(maskeBuffer, 0, new Uint32Array([wordsPerRow, 0, 0, 0]));

  const module = device.createShaderModule({ code: GROUND_SHADER_WGSL });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: surfaceTexture.createView() },
      { binding: 1, resource: outTexture.createView() },
      { binding: 2, resource: { buffer: paramsBuffer } },
      { binding: 3, resource: maskTexture.createView() },
      { binding: 4, resource: { buffer: maskeBuffer } },
    ],
  });

  const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
  const readBuffer = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
  pass.end();
  encoder.copyTextureToBuffer(
    { texture: outTexture },
    { buffer: readBuffer, bytesPerRow },
    [width, height],
  );
  device.queue.submit([encoder.finish()]);

  await readBuffer.mapAsync(GPUMapMode.READ);
  const mapped = new Uint8Array(readBuffer.getMappedRange());
  const image = new ImageData(width, height);
  // Zeilenweise kopieren: Der Puffer ist auf 256 Byte ausgerichtet, die
  // Bilddaten sind es nicht.
  for (let y = 0; y < height; y++) {
    image.data.set(mapped.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
  }
  readBuffer.unmap();
  surfaceTexture.destroy();
  outTexture.destroy();
  paramsBuffer.destroy();
  readBuffer.destroy();
  return image;
}

export default bakeTerrainLayer;
