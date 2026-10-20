/**
 * Misst den Terrain-Neuaufbau (Färbelauf) in Node, ohne Browser.
 *
 * `node scripts/messe-terrain.mjs [Wiederholungen]` baut die Karte eines festen Seeds
 * in 2560x1440, färbt sie (`faerbeGelaende`) und gibt Median und Fingerabdruck des
 * Ergebnisses aus. Der Fingerabdruck belegt, dass eine Optimierung bitgleich bleibt.
 */
import { buildTerrainForSeed } from '../src/client/terrainPreview.js';
import { faerbeGelaende } from '../src/client/gelaendeStil.js';

const wiederholungen = Number(process.argv[2] ?? 5);
const PALETTEN = [
  { surface: [96, 138, 92], deep: [38, 54, 46] },
  { surface: [236, 240, 250], deep: [90, 100, 120] },
];
const karte = buildTerrainForSeed(20260916, 'hills', 'landscape', 'autonom');
const { bitmap, width, height } = karte;
for (const palette of PALETTEN) {
  const zeiten = [];
  let hash = 0;
  for (let i = 0; i < wiederholungen; i++) {
    const d = new Uint8ClampedArray(width * height * 4);
    for (let k = 0; k < bitmap.length; k++) if (bitmap[k]) d[k * 4 + 3] = 255;
    const t0 = performance.now();
    faerbeGelaende(d, bitmap, width, height, palette, 12345);
    zeiten.push(performance.now() - t0);
    if (i === 0) {
      hash = 0x811c9dc5;
      for (let k = 0; k < d.length; k++) hash = Math.imul(hash ^ d[k], 0x01000193);
    }
  }
  zeiten.sort((a, b) => a - b);
  console.log(`${width}x${height} Boden ${palette.surface}: Median ${zeiten[zeiten.length >> 1].toFixed(0)} ms, min ${zeiten[0].toFixed(0)} ms, Hash ${(hash >>> 0).toString(16)}`);
}
