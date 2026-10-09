import assert from 'node:assert/strict';
import test from 'node:test';
import { schattenAnteil, schattiereHoehlen } from '../src/client/hoehlenSchatten.js';
import { buildTerrainForSeed } from '../src/client/terrainPreview.js';

/**
 * Audit 2026-10-09: Die Höhlenschattierung kostete ~1 100 ms je Kartenaufbau
 * (Standardkarte online). Die Summentabellen-Fassung muss BYTE FÜR BYTE dasselbe
 * liefern wie die Stichprobenfassung (`schattenAnteil` je Pixel).
 */
function referenz(data, bitmap, breite, hoehe, farbe) {
  for (let y = 0; y < hoehe; y += 1) {
    for (let x = 0; x < breite; x += 1) {
      if (!bitmap[y * breite + x]) continue;
      const anteil = schattenAnteil(bitmap, breite, hoehe, x, y);
      if (anteil <= 0) continue;
      const index = (y * breite + x) * 4;
      if (!farbe) {
        const faktor = 1 - anteil * (1 - 0.55);
        for (let k = 0; k < 3; k++) data[index + k] = Math.round(data[index + k] * faktor);
        continue;
      }
      const zumLicht = anteil * 0.45;
      for (let k = 0; k < 3; k++) {
        data[index + k] = Math.round(data[index + k] * (1 - zumLicht) + farbe[k] * zumLicht);
      }
    }
  }
  return data;
}

function vergleiche(bitmap, breite, hoehe, farbe) {
  const a = new Uint8ClampedArray(breite * hoehe * 4).fill(120);
  const b = new Uint8ClampedArray(breite * hoehe * 4).fill(120);
  referenz(a, bitmap, breite, hoehe, farbe);
  schattiereHoehlen(b, bitmap, breite, hoehe, farbe);
  let abweichungen = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) abweichungen += 1;
  return abweichungen;
}

test('Zufallskarte mit Maßen, die nicht durch 3 teilbar sind: identisch', () => {
  let zustand = 12345;
  const zufall = () => { zustand = (zustand * 1664525 + 1013904223) >>> 0; return zustand / 2 ** 32; };
  for (const [breite, hoehe] of [[50, 37], [61, 29], [13, 100]]) {
    const bitmap = new Uint8Array(breite * hoehe);
    for (let i = 0; i < bitmap.length; i++) bitmap[i] = zufall() < 0.6 ? 1 : 0;
    assert.equal(vergleiche(bitmap, breite, hoehe, [255, 240, 200]), 0, `${breite}x${hoehe} hell`);
    assert.equal(vergleiche(bitmap, breite, hoehe, null), 0, `${breite}x${hoehe} dunkel`);
  }
});

test('Standardkarte online (autonom, Höhlen): identisch', { timeout: 60_000 }, () => {
  const t = buildTerrainForSeed(7, 'hills', 'landscape', 'autonom');
  assert.equal(vergleiche(t.bitmap, t.width, t.height, [86, 148, 74]), 0);
});
