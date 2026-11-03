/**
 * E2E: Bildfolgen der Effekt-Sheets im Browser gelesen (Node kann kein WebP).
 *
 * - N-13: aufeinanderfolgende Frames einer Folge unterscheiden sich (kein Standbild, keine
 *   doppelt belegte Zelle), jede Zeile von `muendung` und `ringe` ist eine eigene Folge.
 * - N-05: kein Frame ist am Zellrand angeschnitten (Alpha am Rand ≤ 20). Ausnahme: Pilzwolke und
 *   Flamme stehen mit dem Fuß auf dem Boden (unterer Rand erlaubt).
 */
import { test, expect } from '@playwright/test';

test('Effekt-Sheets: Frames unterscheiden sich und sind nicht angeschnitten', async ({ page }) => {
  await page.goto('/');
  const befund = await page.evaluate(async () => {
    const { SHEETS } = await import('/src/client/effektSheets.js');
    const BODEN = new Set(['pilzwolke', 'flamme']);
    const aus = { gleich: [], angeschnitten: [], zeilenGleich: [], geprueft: 0 };
    for (const [name, s] of Object.entries(SHEETS)) {
      const bild = new Image();
      bild.src = `/src/client/assets/effekt-sheets/${s.datei}`;
      await bild.decode();
      const c = document.createElement('canvas');
      c.width = bild.naturalWidth; c.height = bild.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(bild, 0, 0);
      const zw = c.width / s.spalten;
      const zh = c.height / s.zeilen;
      const alpha = (nr) => {
        const d = g.getImageData((nr % s.spalten) * zw, Math.floor(nr / s.spalten) * zh, zw, zh).data;
        const a = new Uint8Array(d.length / 4);
        for (let i = 0; i < a.length; i += 1) a[i] = d[i * 4 + 3];
        a.rgba = d;
        return a;
      };
      const unterschied = (a, b) => { let n = 0; for (let i = 0; i < a.rgba.length; i += 1) if (Math.abs(a.rgba[i] - b.rgba[i]) > 8) n += 1; return n; };
      // Zeilen mit eigener Folge (muendung, ringe): jede Zeile; sonst die Folge `frames`.
      const folgen = (name === 'muendung' || name === 'ringe')
        ? Array.from({ length: s.zeilen }, (_, z) => s.frames.map(f => f + z * s.spalten))
        : [s.frames];
      for (const folge of folgen) {
        let vorher = null;
        for (const nr of folge) {
          const a = alpha(nr);
          aus.geprueft += 1;
          if (vorher && unterschied(a, vorher) === 0) aus.gleich.push(`${name}:${nr}`);
          let rand = 0;
          const w = Math.round(zw); const h = Math.round(zh);
          for (let x = 0; x < w; x += 1) rand = Math.max(rand, a[x], BODEN.has(name) ? 0 : a[(h - 1) * w + x]);
          for (let y = 0; y < h; y += 1) rand = Math.max(rand, a[y * w], a[y * w + w - 1]);
          if (rand > 20) aus.angeschnitten.push(`${name}:${nr}(${rand})`);
          vorher = a;
        }
      }
      if (folgen.length > 1) {
        const erste = folgen.map(f => alpha(f[1]));
        for (let i = 1; i < erste.length; i += 1) if (unterschied(erste[i], erste[i - 1]) === 0) aus.zeilenGleich.push(`${name}:${i}`);
      }
    }
    return aus;
  });
  expect(befund.geprueft).toBeGreaterThan(300);
  expect(befund.gleich).toEqual([]);
  expect(befund.angeschnitten).toEqual([]);
  expect(befund.zeilenGleich).toEqual([]);
});
