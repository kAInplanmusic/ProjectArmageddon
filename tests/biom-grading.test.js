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
