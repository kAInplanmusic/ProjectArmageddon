/**
 * Biom-Grading der Biome 15 bis 20 (`biomGrading.js`): reine Client-Optik, deterministisch, ändert nie die Maske.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeBiom, GRADING_BIOME, HOEHLEN_FUELLUNG } from '../src/client/biomGrading.js';
import { SONDER_KULISSEN } from '../src/client/sonderKulissen.js';
import { NEUE_BIOME } from '../src/shared/config/biome-neu.js';

const B = 256; const H = 192;
function bild() {
  const bitmap = new Uint8Array(B * H).fill(1);
  const d = new Uint8ClampedArray(B * H * 4);
  for (let i = 0; i < B * H; i += 1) { d[i * 4] = 120; d[i * 4 + 1] = 110; d[i * 4 + 2] = 100; d[i * 4 + 3] = 255; }
  return { bitmap, d };
}

test('Grading: deterministisch, Maske und Deckkraft bleiben, Farbe ändert sich je Biom', () => {
  const mittel = {};
  for (const biom of GRADING_BIOME) {
    const a = bild(); const b = bild();
    assert.equal(gradeBiom(a.d, a.bitmap, B, H, biom, 7), true);
    gradeBiom(b.d, b.bitmap, B, H, biom, 7);
    assert.deepEqual(a.d, b.d, `${biom}: gleiche Eingabe, gleiches Bild`);
    assert.ok(a.bitmap.every(v => v === 1));
    for (let i = 3; i < a.d.length; i += 4) assert.equal(a.d[i], 255);
    let r = 0; let g = 0; let bl = 0;
    for (let i = 0; i < a.d.length; i += 4) { r += a.d[i]; g += a.d[i + 1]; bl += a.d[i + 2]; }
    mittel[biom] = [r, g, bl].map(v => Math.round(v / (B * H)));
    assert.notDeepEqual(mittel[biom], [120, 110, 100], `${biom}: Grading wirkt`);
  }
  assert.ok(mittel.tempelstadt[0] > mittel.tempelstadt[2] + 30, 'Tempelstadt: warmer Sandstein');
  assert.ok(mittel.tiefsee[2] > mittel.tiefsee[0] + 30, 'Tiefsee: kaltes Blau');
  assert.ok(mittel.kristallwald[1] > mittel.kristallwald[0], 'Fantasywald: grünlich statt beige');
});

test('Grading: Luftpixel und fremde Biome bleiben unberührt', () => {
  const a = bild(); a.bitmap.fill(0);
  const kopie = Uint8ClampedArray.from(a.d);
  gradeBiom(a.d, a.bitmap, B, H, 'schlackeschmiede', 1);
  assert.deepEqual(a.d, kopie);
  assert.equal(gradeBiom(a.d, a.bitmap, B, H, 'vulkan', 1), false);
  assert.equal(gradeBiom(a.d, a.bitmap, B, H, null, 1), false);
});

test('Schlackeschmiede: Lavaadern lassen einzelne Pixel stark glühen', () => {
  const a = bild();
  gradeBiom(a.d, a.bitmap, 256, 192, 'schlackeschmiede', 11);
  let glut = 0;
  for (let i = 0; i < a.d.length; i += 4) if (a.d[i] > 200 && a.d[i + 2] < 120) glut += 1;
  assert.ok(glut > 50, `Glutpixel: ${glut}`);
});

test('Fantasywald (Kennung kristallwald): Name, Kulisse, Pflanzen, Höhlenfüllung', () => {
  const k = NEUE_BIOME.kristallwald;
  assert.equal(k.label, 'Fantasywald');
  assert.match(k.beschreibung, /Leuchtpilze/);
  assert.ok(SONDER_KULISSEN.kristallwald.includes('forest/fantasy_glade'));
  assert.ok(!SONDER_KULISSEN.kristallwald.includes('kristallwald/hell'));
  assert.ok(!k.pflanzen.arten.includes('kristall'));
  assert.ok(HOEHLEN_FUELLUNG.kristallwald);
});

test('Tiefsee: Wasser-Gel statt Fels (Verlauf, heller Meniskus-Rand, Blasen), Maske und Deckkraft unverändert, deterministisch', () => {
  // Fester Block mit Luft links und oben: Kantenpixel müssen deutlich heller sein als das Innere (Kontur lesbar).
  const bitmap = new Uint8Array(B * H);
  for (let y = 40; y < H; y += 1) for (let x = 40; x < B; x += 1) bitmap[y * B + x] = 1;
  const neu = () => { const d = new Uint8ClampedArray(B * H * 4); for (let i = 0; i < B * H; i += 1) { d[i * 4] = 120; d[i * 4 + 1] = 110; d[i * 4 + 2] = 100; d[i * 4 + 3] = bitmap[i] ? 255 : 0; } return d; };
  const a = neu(); const b = neu(); const vorher = Uint8Array.from(bitmap);
  assert.equal(gradeBiom(a, bitmap, B, H, 'tiefsee', 7), true);
  gradeBiom(b, bitmap, B, H, 'tiefsee', 7);
  assert.deepEqual(a, b);
  assert.deepEqual(bitmap, vorher);
  for (let i = 0; i < B * H; i += 1) assert.equal(a[i * 4 + 3], bitmap[i] ? 255 : 0);
  const lum = (x, y) => { const o = (y * B + x) * 4; return 0.3 * a[o] + 0.59 * a[o + 1] + 0.11 * a[o + 2]; };
  let rand = 0; let innen = 0; let n = 0;
  for (let x = 60; x < 200; x += 1) { rand += lum(x, 41); innen += lum(x, 120); n += 1; }
  assert.ok(rand / n > innen / n + 40, `Meniskus-Rand deutlich heller als das Innere (${Math.round(rand / n)} vs ${Math.round(innen / n)})`);
  // Blau/Türkis-Wasser: Blau dominiert Rot überall im Inneren; nach unten dunkler (Trübung).
  let rotZuBlau = 0;
  for (let x = 60; x < 200; x += 1) { const o = (120 * B + x) * 4; if (a[o + 2] > a[o]) rotZuBlau += 1; }
  assert.equal(rotZuBlau, 140);
  let oben = 0; let unten = 0;
  for (let x = 60; x < 200; x += 1) { oben += lum(x, 60); unten += lum(x, H - 6); }
  assert.ok(unten < oben, 'Tiefenverlauf: unten dunkler');
  // Biolumineszenz/Blasen: einzelne helle Türkis-Pixel im Inneren.
  let leucht = 0;
  for (let y = 60; y < H - 8; y += 1) for (let x = 60; x < B - 8; x += 1) { const o = (y * B + x) * 4; if (a[o + 1] > 170 && a[o] < 120) leucht += 1; }
  assert.ok(leucht > 8, `Leuchtpixel: ${leucht}`);
  assert.ok(HOEHLEN_FUELLUNG.tiefsee.deckkraft >= 220, 'Höhlen: dunkles Wasser');
});
