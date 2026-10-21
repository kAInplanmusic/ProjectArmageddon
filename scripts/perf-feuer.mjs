#!/usr/bin/env node
/**
 * Server-Tickkosten des Feuersystems unter Höchstlast: `maxBrennend` brennende und `maxLava` Lavazellen
 * (Vulkan, Ausbrüche) auf einer Karte 320 x 180 Zellen aus Holz, Maske als Bytefeld.
 * Reine Messung; Aufruf: node scripts/perf-feuer.mjs [--ticks=6000] [--json]
 */
import { FeuerSystem } from '../src/engine/systems/feuerSystem.js';
import { FEUER } from '../src/shared/config/feuer.js';
import { STOFF } from '../src/shared/config/stoffe.js';
import { SeededRandom } from '../src/shared/prng.js';

const ticks = Number(process.argv.find(a => a.startsWith('--ticks='))?.slice(8) ?? 6000);
const SP = 320; const ZE = 180; const Z = 8; const B = SP * Z; const H = ZE * Z;
const feld = new Uint8Array(SP * ZE).fill(STOFF.HOLZ);
const maske = new Uint8Array(B * H);
for (let y = 80 * Z; y < H; y += 1) maske.fill(1, y * B, (y + 1) * B);
const karte = { feld, spalten: SP, zeilen: ZE, zelle: Z, breite: B, hoehe: H, geschuetzt: null };
let ereignisse = 0;
const sys = new FeuerSystem({
  rng: new SeededRandom(7), karte,
  terrain: { width: B, height: H, isSolid: (x, y) => maske[Math.floor(y) * B + Math.floor(x)] === 1, setPixel: (x, y, v) => { maske[y * B + x] = v ? 1 : 0; }, logEintrag: () => {} },
  events: { emit: () => { ereignisse += 1; } }, zerstoerung: { krater: () => {} }, sonderbiom: 'vulkan',
  q: { figuren: () => [], waterLevelAt: () => 0, surfaceYAt: () => 80 * Z, ragnarok: () => true, schaden: () => {}, mali: () => {} },
});
const zeiten = []; let maxB = 0; let maxL = 0;
for (let t = 0; t < ticks; t += 1) {
  if (t % 200 === 0) sys.einschlag(200 + (t % 2000), 80 * Z + 4, 60, 'hitze'); // Brände nachlegen
  const t0 = process.hrtime.bigint();
  sys.update();
  zeiten.push(Number(process.hrtime.bigint() - t0) / 1e6);
  maxB = Math.max(maxB, sys.brennendeZellen); maxL = Math.max(maxL, sys.lavaZellen);
}
const s = [...zeiten].sort((a, b) => a - b); const p = f => s[Math.min(s.length - 1, Math.floor(s.length * f))];
console.log(JSON.stringify({ ticks, maxBrennend: maxB, maxLava: maxL, grenze: [FEUER.maxBrennend, FEUER.maxLava], ereignisse, tickMs: { p50: +p(0.5).toFixed(4), p95: +p(0.95).toFixed(4), p99: +p(0.99).toFixed(3), max: +s.at(-1).toFixed(3) } }));
