import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/shared/prng.js';
import { erzeugeKompositionsKarte } from '../src/shared/terrainKomposition.js';

const B = 1280;
const H = 720;

/** Größen der Lufträume ohne Verbindung zum oberen Rand (4-Nachbarn). */
function eingeschlosseneLuft(bm) {
  const marke = new Uint8Array(B * H);
  const groessen = [];
  const stapel = new Int32Array(B * H);
  for (let s = 0; s < B * H; s += 1) {
    if (marke[s] || bm[s]) continue;
    let n = 0; let oben = false; let sp = 0;
    stapel[sp++] = s; marke[s] = 1;
    while (sp) {
      const i = stapel[--sp]; n += 1;
      const x = i % B; const y = (i - x) / B;
      if (y === 0) oben = true;
      for (const j of [x > 0 ? i - 1 : -1, x < B - 1 ? i + 1 : -1, y > 0 ? i - B : -1, y < H - 1 ? i + B : -1]) {
        if (j >= 0 && !marke[j] && !bm[j]) { marke[j] = 1; stapel[sp++] = j; }
      }
    }
    if (!oben) groessen.push(n);
  }
  return groessen;
}

test('Höhlen: keine winzigen Lufttaschen, das Land bleibt erhalten', () => {
  for (const art of ['hoehle', 'hoehleInsel']) {
    for (let seed = 1; seed <= 8; seed += 1) {
      const k = erzeugeKompositionsKarte({ rng: createRng(seed * 131), width: B, height: H, art });
      const kleinste = Math.min(Infinity, ...eingeschlosseneLuft(k.bitmap));
      // Schwelle 9000 px bei 2560×1440, hier ein Viertel der Fläche; Kammern und Gänge danach dürfen sie nicht unterschreiten.
      assert.ok(kleinste >= 2250 || kleinste === Infinity, `${art} Seed ${seed}: Tasche mit ${kleinste} px`);
      const land = k.bitmap.reduce((a, v) => a + v, 0) / (B * H);
      assert.ok(land > 0.35, `${art} Seed ${seed}: Landanteil ${land.toFixed(2)}`);
    }
  }
});
