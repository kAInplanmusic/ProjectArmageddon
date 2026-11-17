import test from 'node:test';
import assert from 'node:assert/strict';
import { findeFlaechen } from '../src/shared/erreichbarkeit.js';

/** Die einfache Referenz (vor QV-7): ein Array-Literal je Nachbar. Bewusst langsam und unverändert. */
function referenz(bitmap, width, height) {
  const flaeche = new Int32Array(width * height).fill(-1);
  const groessen = [];
  let naechste = 0;
  for (let start = 0; start < bitmap.length; start += 1) {
    if (!bitmap[start] || flaeche[start] !== -1) continue;
    const nummer = naechste++;
    let groesse = 0;
    const stapel = [start];
    flaeche[start] = nummer;
    while (stapel.length > 0) {
      const p = stapel.pop();
      groesse += 1;
      const x = p % width;
      const y = (p - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const q = ny * width + nx;
        if (!bitmap[q] || flaeche[q] !== -1) continue;
        flaeche[q] = nummer;
        stapel.push(q);
      }
    }
    groessen.push(groesse);
  }
  return { flaeche, groessen, anzahl: naechste };
}

test('findeFlaechen: gleiches Ergebnis wie die Referenz auf Zufallsfeldern (inkl. Rand und 1-Pixel-Felder)', () => {
  let s = 987654321;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  for (const [w, h, d] of [[1, 1, 1], [1, 9, 0.7], [9, 1, 0.7], [7, 5, 0.6], [64, 48, 0.5], [120, 80, 0.62], [33, 200, 0.45]]) {
    const b = new Uint8Array(w * h);
    for (let i = 0; i < b.length; i += 1) b[i] = rnd() < d ? 1 : 0;
    const a = findeFlaechen(b, w, h);
    const r = referenz(b, w, h);
    assert.deepEqual(Array.from(a.flaeche), Array.from(r.flaeche), `${w}x${h}`);
    assert.deepEqual(a.groessen, r.groessen);
    assert.equal(a.anzahl, r.anzahl);
  }
});

test('findeFlaechen: Diagonale verbindet nicht (4er-Nachbarschaft)', () => {
  const b = Uint8Array.from([1, 0, 0, 1]);
  assert.equal(findeFlaechen(b, 2, 2).anzahl, 2);
});
