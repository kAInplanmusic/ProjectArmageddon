/**
 * Deterministische Terrain-Generierung.
 *
 * Erzeugt aus einem Seed reproduzierbare Höhenprofile (Value-Noise aus dem
 * Match-PRNG, keine Math.random-Nutzung) und daraus ein Bitmap für die
 * CollisionMask. Optional werden Wasserbecken und Höhlen eingestreut.
 *
 * @module terrainGen
 */

/**
 * Geländeformen.
 *
 * Die vier Zahlen je Form wirken zusammen:
 *  - `amplitude` × `roughness` × 2 bestimmt den Ausschlag des Höhenprofils um
 *    die Mitte. Kleine Werte ergeben flaches Land, große Werte Klippen.
 *  - `waterLevel` ist der Anteil der Kartenhöhe, der unter dem Wasserspiegel
 *    liegt (`waterY = height × (1 − waterLevel)`).
 *  - `caves` ist die Höhlendichte im Untergrund (Anteil der Kartenzellen).
 *
 * Die Werte sind nicht frei gewählt, sondern an Kennzahlen ausgerichtet und
 * danach justiert: Höhenvarianz (wie „vertikal" ist die Karte), freie
 * Schusslinien auf nahen und weiten Distanzen (wie offen ist sie) und
 * Deckungsdichte (wie oft die Oberfläche je 100 px um mehr als 20 px springt).
 * `tests/terrain-presets.test.js` hält die Kennzahlen mit Schwellen fest, damit
 * eine spätere Änderung nicht unbemerkt eine Form ihrer Eigenart beraubt.
 */
export const TERRAIN_PRESETS = Object.freeze({
  hills: Object.freeze({ amplitude: 0.42, roughness: 0.55, waterLevel: 0.16, caves: 0 }),
  mountains: Object.freeze({ amplitude: 0.62, roughness: 0.8, waterLevel: 0.1, caves: 0.002 }),
  islands: Object.freeze({ amplitude: 0.5, roughness: 0.45, waterLevel: 0.3, caves: 0.001 }),
  caverns: Object.freeze({ amplitude: 0.35, roughness: 0.7, waterLevel: 0.12, caves: 0.02 }),

  /*
   * Die vier folgenden Formen kamen später dazu: Die ursprünglichen vier
   * deckten welliges und bergiges Land, Inseln und Höhlen ab, aber nicht die
   * Spielweisen, um die es in den Duellen geht.
   */

  /** Offene Weite: flaches Land, keine Höhlen, kaum Wasser — weite Sichtlinien. */
  open: Object.freeze({ amplitude: 0.1, roughness: 0.25, waterLevel: 0.1, caves: 0 }),

  /** Felsspitzen: große Höhenunterschiede, sehr rau — Kämpfe über Höhen. */
  spires: Object.freeze({ amplitude: 0.9, roughness: 1, waterLevel: 0.05, caves: 0.002 }),

  /**
   * Flut: hügeliges Land mit hohem Wasserspiegel.
   *
   * Fund (belegt): Der erste Ansatz war `amplitude: 0.4, roughness: 0.45,
   * waterLevel: 0.55` — gedacht als „mehr als die Hälfte unter Wasser". Gemessen
   * standen aber **0 von 2 Startfiguren auf festem Boden**, beide ertranken im
   * ersten Zug. Die Karte war unspielbar, weil der Wasserspiegel über dem Land
   * an den festen Startpunkten (x = 427 und 853) lag.
   *
   * Deshalb ein anderes Vorgehen: Das Höhenprofil wird ANGEHOBEN (hügeliger als
   * bei `islands`), und der Wasserstand trifft die Täler. So liegt reichlich
   * Wasser auf der Karte, die Gipfel und Startpunkte bleiben aber trocken.
   */
  flooded: Object.freeze({ amplitude: 0.62, roughness: 0.8, waterLevel: 0.45, caves: 0 }),

  /**
   * Gewirr: rau und durchlöchert — Deckung auf kurze Distanz.
   *
   * Die Höhlendichte ist hier bewusst ein Vielfaches der anderen Formen: Sie
   * schafft die Räume und Verstecke, die eine Nahkampfkarte ausmachen.
   */
  warren: Object.freeze({ amplitude: 0.6, roughness: 1, waterLevel: 0.1, caves: 0.06 }),
});

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(rng, samples) {
  const points = Array.from({ length: samples }, () => rng.next());
  return resolution => {
    const scaled = resolution * (samples - 1);
    const index = Math.floor(scaled);
    const t = smoothstep(scaled - index);
    const a = points[Math.min(index, samples - 1)];
    const b = points[Math.min(index + 1, samples - 1)];
    return a + (b - a) * t;
  };
}

/**
 * Erzeugt ein Terrain-Bitmap (1 = solide, 0 = Luft/Wasser).
 *
 * @param {object} options
 * @param {object} options.rng - SeededRandom
 * @param {number} options.width
 * @param {number} options.height
 * @param {string} [options.preset] - Schlüssel aus TERRAIN_PRESETS
 * @returns {{bitmap: Uint8Array, heightMap: Float32Array, waterLevel: number, width: number, height: number}}
 */
export function generateTerrain({ rng, width, height, preset = 'hills' }) {
  if (!rng || typeof rng.next !== 'function') {
    throw new TypeError('generateTerrain benoetigt einen RNG mit next()');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new TypeError('width und height muessen positive Ganzzahlen sein');
  }
  const config = TERRAIN_PRESETS[preset] ?? TERRAIN_PRESETS.hills;

  // Zwei Oktaven für grobe Form + Detail.
  const coarse = valueNoise(rng, 6);
  const fine = valueNoise(rng, 18);

  const heightMap = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const u = width === 1 ? 0 : x / (width - 1);
    const base = coarse(u) * 0.7 + fine(u) * 0.3;
    const normalized = 0.5 + (base - 0.5) * config.amplitude * 2 * config.roughness;
    heightMap[x] = Math.max(0.12, Math.min(0.95, normalized));
  }

  const bitmap = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    const surface = Math.floor(height * heightMap[x]);
    for (let y = surface; y < height; y++) {
      bitmap[y * width + x] = 1;
    }
  }

  // Höhlen: kleine, deterministische Blasen im Untergrund.
  if (config.caves > 0) {
    const caveCount = Math.floor(width * height * config.caves);
    for (let i = 0; i < caveCount; i++) {
      const cx = Math.floor(rng.next() * width);
      const cy = Math.floor(height * 0.45 + rng.next() * height * 0.55);
      const radius = 1 + Math.floor(rng.next() * 3);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const px = cx + dx;
          const py = cy + dy;
          if (px < 0 || px >= width || py < 0 || py >= height) continue;
          bitmap[py * width + px] = 0;
        }
      }
    }
  }

  // Wasserspiegel: alles unterhalb des Levels wird geflutet und ist nicht solide.
  const waterY = Math.floor(height * (1 - config.waterLevel));
  for (let y = waterY; y < height; y++) {
    for (let x = 0; x < width; x++) {
      bitmap[y * width + x] = 0;
    }
  }

  // Karte nach oben/unten begrenzen, damit Entities nicht aus der Welt fallen.
  for (let x = 0; x < width; x++) {
    bitmap[(height - 1) * width + x] = 1;
    bitmap[0 * width + x] = 0;
  }
  for (let y = 0; y < height; y++) {
    bitmap[y * width] = 1;
    bitmap[y * width + (width - 1)] = 1;
  }

  return { bitmap, heightMap, waterLevel: waterY, width, height, preset };
}

/**
 * Sucht die höchste solide Oberfläche an einer X-Position.
 * @returns {number} Y-Pixel der Oberfläche oder -1
 */
export function surfaceY(bitmap, width, height, x) {
  const cx = Math.max(0, Math.min(width - 1, Math.floor(x)));
  for (let y = 0; y < height; y++) {
    if (bitmap[y * width + cx]) return y;
  }
  return -1;
}
