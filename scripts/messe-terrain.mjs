/**
 * Misst den Terrain-Neuaufbau (Färbelauf) in Node, ohne Browser.
 *
 * `node scripts/messe-terrain.mjs [Wiederholungen]` baut die Karte eines festen Seeds
 * in 2560x1440, färbt sie (`faerbeGelaende`) und gibt Median und Fingerabdruck des
 * Ergebnisses aus. Der Fingerabdruck belegt, dass eine Optimierung bitgleich bleibt.
 */
import { buildTerrainForSeed } from '../src/client/terrainPreview.js';
import { faerbeGelaende } from '../src/client/gelaendeStil.js';
import { registriereStoffTextur, leereStoffTexturen, TEXTUR_NAMEN, TEXTUR_GROESSE } from '../src/client/stoffTexturen.js';

/** Synthetische Texturen (Rauschen um 128): Node kann keine JPEGs lesen; gemessen wird nur der Rechenweg. */
function synthetischeTexturen() {
  for (const name of TEXTUR_NAMEN) {
    const px = new Uint8ClampedArray(TEXTUR_GROESSE * TEXTUR_GROESSE * 4);
    for (let i = 0; i < px.length; i += 4) { const v = 96 + ((i * 2654435761) >>> 24) % 64; px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = 255; }
    registriereStoffTextur(name, px);
  }
}

const wiederholungen = Number(process.argv[2] ?? 5);
const PALETTEN = [
  { surface: [96, 138, 92], deep: [38, 54, 46] },
  { surface: [236, 240, 250], deep: [90, 100, 120] },
];
const karte = buildTerrainForSeed(20260916, 'hills', 'landscape', 'autonom', { gelaende: 3, biom: process.env.PA_BIOM ?? 'dschungel' });
const { bitmap, width, height } = karte;
for (const mitTextur of [false, true]) {
if (mitTextur) synthetischeTexturen(); else leereStoffTexturen();
for (const palette of PALETTEN) {
  const zeiten = [];
  let hash = 0;
  for (let i = 0; i < wiederholungen; i++) {
    const d = new Uint8ClampedArray(width * height * 4);
    for (let k = 0; k < bitmap.length; k++) if (bitmap[k]) d[k * 4 + 3] = 255;
    const t0 = performance.now();
    faerbeGelaende(d, bitmap, width, height, palette, 12345, karte.stoffkarte ?? null);
    zeiten.push(performance.now() - t0);
    if (i === 0) {
      hash = 0x811c9dc5;
      for (let k = 0; k < d.length; k++) hash = Math.imul(hash ^ d[k], 0x01000193);
    }
  }
  zeiten.sort((a, b) => a - b);
  console.log(`${mitTextur ? 'MIT Texturen' : 'ohne Texturen'} ${width}x${height} Boden ${palette.surface}: Median ${zeiten[zeiten.length >> 1].toFixed(0)} ms, min ${zeiten[0].toFixed(0)} ms, Hash ${(hash >>> 0).toString(16)}`);
}
}
