/**
 * Prüfbögen und Zeitmessung des Wettersystems (WETTER-1).
 *
 * Zeichnet mit den ECHTEN Wetterroutinen des Clients (`wetterLicht.js`) auf eine Ersatzszene (Himmelsverlauf, Hügel, Höhle,
 * schwebende Insel) im Chromium und schreibt je Wetterlage ein Bild sowie Bögen (mehrere Lagen nebeneinander).
 * Außerdem misst es die Zeichenzeit der Wetterschichten je Bild (nur die Wetterroutinen, ohne Spiel, Software-Rasterung
 * ohne GPU — das Ergebnis gilt für diese Umgebung, nicht für ein Gerät des Spielers).
 *
 * Aufruf:  node scripts/wetter-pruefbogen.mjs [--out ordner] [--port 5190]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

function arg(name, standard = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : standard;
}
const OUT = path.resolve(arg('out', '/tmp/wetter'));
const PORT = Number(arg('port', process.env.PA_PORT ?? 5190));
mkdirSync(OUT, { recursive: true });

// Läuft auf dem Port schon ein Vite (geteilter Entwicklungsserver), wird dieser benutzt und nicht beendet.
let server = await createServer({ server: { port: PORT, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
try { await server.listen(); } catch (e) {
  if (!/already in use/.test(String(e))) throw e;
  server = { close: async () => {} };
}
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const seite = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await seite.goto(`http://127.0.0.1:${PORT}/messung.html`).catch(() => {});
  const ergebnis = await seite.evaluate(async () => {
    const licht = await import('/src/client/wetterLicht.js');
    const W = 960; const H = 540;
    // --- Ersatzszene: Gelände-Maske mit Hügeln, Höhle und schwebender Insel ---
    const B = 1600; const HH = 900;
    const bitmap = new Uint8Array(B * HH);
    const hoehe = x => 560 + Math.sin(x / 140) * 50 + Math.sin(x / 47) * 12;
    for (let x = 0; x < B; x += 1) for (let y = Math.floor(hoehe(x)); y < 840; y += 1) bitmap[y * B + x] = 1;
    // Höhle: Hohlraum unter dem Hügel bei x 500–800 (Decke y 640, Boden y 730)
    for (let x = 500; x < 800; x += 1) for (let y = 640; y < 730; y += 1) bitmap[y * B + x] = 0;
    // Schwebende Insel
    for (let x = 1100; x < 1400; x += 1) { const d = Math.abs(x - 1250) / 150; for (let y = 380; y < 380 + 50 * (1 - d * d); y += 1) bitmap[y * B + x] = 1; }
    const gelaende = document.createElement('canvas'); gelaende.width = B; gelaende.height = HH;
    const gc = gelaende.getContext('2d'); const bd = gc.createImageData(B, HH);
    for (let i = 0; i < B * HH; i += 1) if (bitmap[i]) { bd.data[i * 4] = 96; bd.data[i * 4 + 1] = 78; bd.data[i * 4 + 2] = 58; bd.data[i * 4 + 3] = 255; }
    gc.putImageData(bd, 0, 0);
    // Grasstreifen oben auf den Oberflächen
    gc.fillStyle = '#5b8a3c';
    for (let x = 0; x < B; x += 1) { for (let y = 1; y < 840; y += 1) if (bitmap[y * B + x] && !bitmap[(y - 1) * B + x]) { gc.fillRect(x, y, 1, 4); } }
    const himmel = document.createElement('canvas'); himmel.width = W; himmel.height = H;
    const hc = himmel.getContext('2d');
    const g = hc.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#5f8fc4'); g.addColorStop(0.6, '#bcd6ec'); g.addColorStop(1, '#e8eef2');
    hc.fillStyle = g; hc.fillRect(0, 0, W, H);
    hc.fillStyle = '#6d8aa3';
    hc.beginPath(); hc.moveTo(0, 360); for (let x = 0; x <= W; x += 20) hc.lineTo(x, 330 - Math.abs(Math.sin(x / 90)) * 70); hc.lineTo(W, H); hc.lineTo(0, H); hc.fill();

    const lage = (wetter, zeit = 'auto') => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      const kamera = { transformation: () => ({ skalierung: W / 1100, versatzX: -200 * (W / 1100), versatzY: -330 * (W / 1100) }) };
      const r = {
        ctx, width: W, height: H, time: 0, reducedMotion: false, backdrop: { key: 'test/x', id: 'x', prompt: '' }, backdropKey: `test/${wetter}`,
        scenery: null, stimmung: { zeit, wetter }, terrainSource: { bitmap, width: B, height: HH }, terrainLayer: gelaende, kamera, sichtWind: 0.03,
      };
      const rahmen = () => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(himmel, 0, 0);
        licht.zeichneWetterHinten(r);
        const k = kamera.transformation();
        ctx.save(); ctx.setTransform(k.skalierung, 0, 0, k.skalierung, k.versatzX, k.versatzY);
        ctx.drawImage(gelaende, 0, 0);
        licht.zeichneSchneeAuflage(r);
        licht.zeichneWetterWelt(r, 1);
        ctx.restore();
        licht.zeichneWetterVorn(r, 1);
      };
      return { r, ctx, c, rahmen };
    };
    const bilder = {};
    const messung = {};
    const arten = ['klar', 'sonne', 'nebel', 'regen', 'wind', 'sturm', 'schnee', 'hagel'];
    for (const w of arten) {
      const l = lage(w);
      // 70 s Simulation in 3er Schritten (Schnee sammelt sich, Übergänge laufen aus), dann Bild.
      const zeiten = [];
      for (let f = 0; f <= 70 * 60; f += 3) {
        l.r.time = f;
        if (f < 70 * 60 - 60) { // nur Zustand fortschreiben, ohne Rechenaufwand fürs Bild
          l.rahmen(); continue;
        }
        const t0 = performance.now(); l.rahmen(); zeiten.push(performance.now() - t0);
      }
      bilder[w] = l.c.toDataURL('image/png');
      messung[w] = { mittel: zeiten.reduce((a, b) => a + b, 0) / zeiten.length, max: Math.max(...zeiten), n: zeiten.length };
    }
    // Zeitmessung über 300 Bilder je Lage (Dichte 1 und Lite 0.5), zusätzlich ohne Wetter als Grundlinie der Ersatzszene.
    const misst = (wetter, dichte) => {
      const l = lage(wetter);
      const z = [];
      for (let f = 0; f < 300 + 120; f += 1) {
        l.r.time = 5000 + f;
        const t0 = performance.now();
        l.ctx.setTransform(1, 0, 0, 1, 0, 0); l.ctx.drawImage(himmel, 0, 0);
        licht.zeichneWetterHinten(l.r);
        const k = l.r.kamera.transformation();
        l.ctx.save(); l.ctx.setTransform(k.skalierung, 0, 0, k.skalierung, k.versatzX, k.versatzY);
        l.ctx.drawImage(gelaende, 0, 0); licht.zeichneSchneeAuflage(l.r); licht.zeichneWetterWelt(l.r, dichte); l.ctx.restore();
        licht.zeichneWetterVorn(l.r, dichte);
        l.ctx.getImageData(0, 0, 1, 1); // erzwingt das Fertigrastern des Bildes, sonst misst man nur das Absetzen der Befehle
        if (f >= 120) z.push(performance.now() - t0);
      }
      z.sort((a, b) => a - b);
      return { mittel: z.reduce((a, b) => a + b, 0) / z.length, p95: z[Math.floor(z.length * 0.95)], max: z[z.length - 1] };
    };
    const zeit = {};
    for (const w of arten) zeit[w] = { dichte1: misst(w, 1), dichte05: misst(w, 0.5) };
    // Neuerfassung der Oberflächen (Krater)
    const ob = await import('/src/client/wetterOberflaeche.js');
    const t0 = performance.now(); for (let i = 0; i < 20; i += 1) ob.baueOberflaeche({ bitmap, width: B, height: HH }); const erfassung = (performance.now() - t0) / 20;
    return { bilder, zeit, erfassung, still: null };
  });
  for (const [name, url] of Object.entries(ergebnis.bilder)) writeFileSync(path.join(OUT, `wetter-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  writeFileSync(path.join(OUT, 'messung.json'), JSON.stringify({ zeit: ergebnis.zeit, erfassungMs: ergebnis.erfassung }, null, 2));
  console.log(JSON.stringify({ erfassungMs: ergebnis.erfassung, zeit: Object.fromEntries(Object.entries(ergebnis.zeit).map(([k, v]) => [k, { d1: +v.dichte1.mittel.toFixed(2), d1p95: +v.dichte1.p95.toFixed(2), d05: +v.dichte05.mittel.toFixed(2) }])) }, null, 1));
} finally {
  await browser.close();
  await server.close();
}
