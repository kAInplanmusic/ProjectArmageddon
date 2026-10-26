#!/usr/bin/env node
/**
 * Zeigt und misst die GPU-Materialmalerei im echten Browser.
 *
 * ## Warum dieses Werkzeug
 *
 * Der Shader aus `src/client/gelaendeGpu.js` lässt sich in Node nicht prüfen —
 * GLSL kompiliert nur im Browser, und Fehler wie eine fehlende Sampler-Präzision
 * oder ein zu kleiner Zeichenpuffer zeigen sich nirgends sonst. Dieses Werkzeug
 * startet Chromium, baut eine Karte, malt sie erst auf der CPU (`faerbeGelaende`)
 * und dann mit der Materialmalerei der GPU, und legt zwei Bilder ab:
 *
 *   /tmp/gelaende-optik-<weg>-<biom>.png        die ganze Karte
 *   /tmp/gelaende-optik-<weg>-<biom>-zoom.png   Nahausschnitt 400×300, 2× vergrößert
 *
 * Zusätzlich nennt es die Dauer des GPU-Durchlaufs und vergleicht die
 * Pixelwerte von CPU- und GPU-Weg (Mittelwert, Minimum, Maximum).
 *
 * ## Aufruf
 *
 *     node scripts/gelaende-optik.mjs [sw|gl] [biom]
 *
 * `gl` nutzt die echte GPU (`--use-angle=gl`), `sw` den Software-Rasterer.
 * Das Biom ist ein Schlüssel aus `config/stoff-rezepte.js` (Vorgabe: caverns).
 */
/* Prüft den Shader im echten Browser: kompiliert er, malt er, wie sieht er aus? */
import { chromium } from '@playwright/test';

const arg = process.argv[2] ?? 'gl';
const biom = process.argv[3] ?? 'caverns';
const args = arg === 'gl' ? ['--use-angle=gl', '--ignore-gpu-blocklist'] : [];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const protokoll = [];
page.on('pageerror', e => protokoll.push('SEITE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') protokoll.push('KONSOLE: ' + m.text()); });

await page.goto('http://127.0.0.1:5173/');
await page.evaluate((b) => { window.__BIOM = b; }, biom);
const ergebnis = await page.evaluate(async () => {
  const gpu = await import('/src/client/gelaendeGpu.js');
  const stil = await import('/src/client/gelaendeStil.js');
  const gen = await import('/src/shared/terrainGen2.js');
  const prng = await import('/src/shared/prng.js');
  const stoff = await import('/src/shared/stoffkarte.js');

  const B = 1280, H = 720;
  const k = gen.erzeugeKarte({ rng: new prng.SeededRandom(4242), width: B, height: H, typ: 'kavernen' });
  const palette = { surface: [86, 148, 74], deep: [34, 66, 32] };

  // CPU-Bild OHNE Material (so wie der Rückfall es malt)
  const bild = new Uint8ClampedArray(B * H * 4);
  for (let i = 0; i < B * H; i += 1) if (k.bitmap[i]) bild[i * 4 + 3] = 255;
  stil.faerbeGelaende(bild, k.bitmap, B, H, palette, 7, null);

  // Materialkarte (echte Rezeptur des Bioms)
  const rezept = (await import('/src/shared/config/stoff-rezepte.js'));
  const gewaehlt = rezept.rezeptFuer ? rezept.rezeptFuer(window.__BIOM ?? 'caverns') : null;
  const karte = stoff.baueStoffkarte({ rng: new prng.SeededRandom(4242).fork(stoff.STOFF_FORK), width: B, height: H, bitmap: k.bitmap, rezept: gewaehlt });

  const erkennung = gpu.erkenneWebGl2(document);
  if (!erkennung.kontext) return { fehler: erkennung.grund };
  const zustand = gpu.bereiteGelaendeGpu(erkennung.kontext);
  if (!zustand) return { fehler: 'Programm nicht baubar' };

  const feld = gpu.packeStofffeld(karte);
  const t0 = performance.now();
  const getoent = gpu.tinteStoffeGpu({ bild, breite: B, hoehe: H, stofffeld: feld, gpu: zustand, seed: 7 });
  const dauer = performance.now() - t0;
  if (!getoent) return { fehler: 'Zeichnen fehlgeschlagen (glError)' };

  // Ergebnis auf eine Leinwand legen und Ausschnitt 1:1 (Nahaufnahme) dazu
  const c = document.createElement('canvas');
  c.width = B; c.height = H;
  c.id = 'ergebnis';
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(getoent, B, H), 0, 0);
  document.body.innerHTML = '';
  document.body.style.margin = '0';
  document.body.style.background = '#101014';
  c.style.width = '1280px';
  document.body.appendChild(c);

  // Zahlen statt Vermutung: was steht im CPU-Bild, was kommt aus der GPU?
  let idxFest = -1;
  for (let i = 0; i < B * H; i += 1) if (k.bitmap[i]) { idxFest = i; break; }
  const probePixel = (arr, i) => [arr[i*4], arr[i*4+1], arr[i*4+2], arr[i*4+3]];
  const kanaele = (arr) => {
    let minR = 255, maxR = 0, summe = 0, n = 0;
    for (let i = 0; i < B * H; i += 1) {
      if (arr[i*4+3] === 0) continue;
      minR = Math.min(minR, arr[i*4]); maxR = Math.max(maxR, arr[i*4]);
      summe += arr[i*4] + arr[i*4+1] + arr[i*4+2]; n += 1;
    }
    return { minR, maxR, mittel: n ? Math.round(summe / (n*3)) : 0, n };
  };

  return {
    ok: true,
    cpu: probePixel(bild, idxFest),
    gpu: probePixel(getoent, idxFest),
    cpuStat: kanaele(bild),
    gpuStat: kanaele(getoent),
    farbenProbe: Array.from(gpu.stoffFarben().slice(0, 6)),
    dauerMs: Math.round(dauer),
    stoffeGesamt: stoff.zaehleStoffe(karte, k.bitmap),
    feldGroesse: [feld.spalten, feld.zeilen],
  };
});

console.log(arg, JSON.stringify(ergebnis));
if (protokoll.length) console.log(protokoll.slice(0, 3).join('\n'));

if (ergebnis.ok) {
  const canvas = page.locator('#ergebnis');
  await canvas.screenshot({ path: `/tmp/gelaende-optik-${arg}-${biom}.png` });
  // Nahaufnahme 400x300 aus der Bildmitte
  await page.evaluate(() => {
    const c = document.getElementById('ergebnis');
    const ctx = c.getContext('2d');
    const ausschnitt = ctx.getImageData(440, 210, 400, 300);
    const d = document.createElement('canvas');
    d.width = 800; d.height = 600; d.id = 'zoom';
    const dctx = d.getContext('2d');
    const tmp = document.createElement('canvas'); tmp.width = 400; tmp.height = 300;
    tmp.getContext('2d').putImageData(ausschnitt, 0, 0);
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(tmp, 0, 0, 800, 600);
    d.style.width = '800px';
    document.body.appendChild(d);
  });
  await page.locator('#zoom').screenshot({ path: `/tmp/gelaende-optik-${arg}-${biom}-zoom.png` });
  console.log('Screenshots: /tmp/gelaende-optik-' + arg + '-' + biom + '.png und -zoom.png');
}
await browser.close();
