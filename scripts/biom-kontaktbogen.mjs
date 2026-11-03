#!/usr/bin/env node
/**
 * Kontaktbogen der Biome: je Biom N Seeds im echten Browser rendern, alles auf ein PNG.
 *
 * ## Warum dieses Werkzeug
 *
 * Jede Optik-Abnahme (Gelände, Stoffe, Kulisse) fragt dasselbe: Wie sehen die Biome über
 * mehrere Seeds aus, nebeneinander, mit demselben Ausschnitt? Bisher entstanden solche Bögen
 * von Hand und je Sitzung anders. Dieses Werkzeug macht sie reproduzierbar (TODO N-36):
 * gleiche Seeds, gleicher Zoom (ganze Karte), gleiche Bildgröße, Beschriftung je Kachel.
 *
 * ## Ablauf
 *
 * 1. Startet einen eigenen Vite-Dev-Server auf einem freien Port (oder nutzt `--url`).
 * 2. Liest die Biome aus dem Menü (`#cfg-biom`, ohne den leeren Eintrag „Seed entscheidet“).
 * 3. Startet je Biom und Seed ein lokales Match (2 Teams × 1, autonome Karte wie der Menüstart), lässt einige
 *    Bilder zeichnen, setzt die Kamera auf „ganze Karte“ und nimmt die Zeichenfläche auf.
 * 4. Setzt alle Aufnahmen im Browser zu einem Raster zusammen: eine Zeile je Biom, eine
 *    Spalte je Seed, links der Biomname, über jeder Kachel der Seed.
 *
 * Es ändert nichts am Spiel und liest nur über die Debug-API (`window.__PA__`).
 *
 * ## Aufruf
 *
 *     npm run kontaktbogen -- [--seeds=3] [--start=1] [--biome=vulkan,eiswueste]
 *                             [--breite=320] [--aus=artifacts/biom-kontaktbogen.png] [--url=http://127.0.0.1:5173]
 *
 * Standardausgabe: `artifacts/biom-kontaktbogen.png` (nicht versioniert, `.gitignore`).
 * Die Seeds sind `start`, `start+1`, … — dieselben Zahlen ergeben denselben Bogen.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function argument(name, vorgabe) {
  const roh = process.argv.find(a => a.startsWith(`--${name}=`));
  return roh ? roh.slice(name.length + 3) : vorgabe;
}

const SEEDS = Math.max(1, Number(argument('seeds', '3')) || 3);
const START = Number(argument('start', '1')) || 1;
const BREITE = Math.max(120, Number(argument('breite', '320')) || 320);
const HOEHE = Math.round((BREITE * 9) / 16);
const AUS = resolve(root, argument('aus', 'artifacts/biom-kontaktbogen.png'));
const NUR = argument('biome', '').split(',').map(s => s.trim()).filter(Boolean);
const URL_VORGABE = argument('url', '');

/** Freier TCP-Port vom Betriebssystem (wie `tests/e2e/helfer/freier-port.mjs`). */
function freierPort() {
  return new Promise((ok, fehler) => {
    const s = createServer();
    s.unref();
    s.once('error', fehler);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
  });
}

/** Startet Vite und wartet, bis die Seite antwortet. */
async function starteVite() {
  const port = await freierPort();
  const prozess = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: root, env: { ...process.env, PA_PORT: String(port) }, stdio: 'ignore', detached: true,
  });
  const url = `http://127.0.0.1:${port}/`;
  const ende = Date.now() + 60_000;
  while (Date.now() < ende) {
    try {
      const antwort = await fetch(url);
      if (antwort.ok) return { url, prozess };
    } catch { /* noch nicht bereit */ }
    await new Promise(r => setTimeout(r, 300));
  }
  try { process.kill(-prozess.pid); } catch { /* schon beendet */ }
  throw new Error(`Vite antwortete nicht auf ${url}`);
}

const vite = URL_VORGABE ? null : await starteVite();
const basisUrl = URL_VORGABE || vite.url;
const browser = await chromium.launch();
let beendet = false;
async function aufraeumen() {
  if (beendet) return;
  beendet = true;
  await browser.close().catch(() => {});
  if (vite) { try { process.kill(-vite.prozess.pid); } catch { /* schon beendet */ } }
}

try {
  // Fenster 1280×720 (16:9 wie die Karte); die Kacheln werden beim Zusammensetzen verkleinert.
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const seitenfehler = [];
  page.on('pageerror', e => seitenfehler.push(String(e)));
  await page.goto(basisUrl);
  await page.waitForFunction(() => Boolean(window.__PA__), null, { timeout: 120_000 });
  await page.evaluate(() => window.__PA__.setAutoLoop(false));

  const alle = await page.locator('#cfg-biom option').evaluateAll(o => o.map(x => ({ id: x.value, name: x.textContent.trim() })));
  const biome = alle.filter(b => b.id !== '' && (NUR.length === 0 || NUR.includes(b.id)));
  if (biome.length === 0) throw new Error(`keine Biome gefunden (Auswahl: ${NUR.join(', ') || 'alle'})`);
  const seeds = Array.from({ length: SEEDS }, (_, i) => START + i);
  console.log(`Kontaktbogen: ${biome.length} Biome × ${seeds.length} Seeds (${seeds.join(', ')}), Kachel ${BREITE}×${HOEHE}`);

  const kacheln = [];
  for (const biom of biome) {
    for (const seed of seeds) {
      const start = Date.now();
      const befund = await page.evaluate(({ seed: s, biom: b }) => {
        const api = window.__PA__;
        api.setAutoLoop(false);
        // Wie der Menüstart: autonome Karte, Kulisse „automatisch“ (siehe `startFromMenu`).
        api.startMatch({ seed: s, teams: 2, playersPerTeam: 1, preset: 'hills', kartentyp: 'autonom', backdropKey: 'automatisch', biom: b });
        const m = api.getMatch();
        return { sonderbiom: m?.sonderbiom ?? null, status: api.getState()?.status ?? null };
      }, { seed, biom: biom.id });
      // Einige Bilder zeichnen lassen (Kulisse, Stoffe), dann die ganze Karte zeigen.
      await page.evaluate(() => window.__PA__.setAutoLoop(true));
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const { game } = window.__PA__;
        // Freie Kamera (wie Taste C), sonst holt die Regie den Zoom auf die aktive Figur zurück.
        game.kameraRegie?.setzeModus('frei');
        const k = game.kamera;
        if (k) k.setzeAnsicht(k.karte.b / 2, k.karte.h / 2, k.zoomGanzeKarte);
        // Nur das Spielfeld: HUD, Menüs und Meldungen ausblenden (alles neben den Zeichenflächen).
        const stage = document.getElementById('stage');
        for (const el of document.querySelectorAll('#app > *, #stage > *')) {
          if (el === stage || el.tagName === 'CANVAS') continue;
          el.style.setProperty('visibility', 'hidden', 'important');
        }
      });
      await page.waitForTimeout(250);
      await page.evaluate(() => window.__PA__.setAutoLoop(false));
      const canvas = page.locator('#stage'); // alle Zeichenflächen übereinander (Gelände, GPU-Schicht)
      const bild = await canvas.screenshot({ type: 'png' });
      kacheln.push({ biom: biom.id, name: biom.name, seed, gezogen: befund.sonderbiom, png: bild.toString('base64') });
      console.log(`  ${biom.id.padEnd(18)} Seed ${String(seed).padEnd(5)} ${befund.status ?? '?'} ${befund.sonderbiom ?? '(klassisch)'}  ${Date.now() - start} ms`);
    }
  }

  // Zusammensetzen im Browser (Canvas), damit keine Bildbibliothek nötig ist.
  const bogen = await browser.newPage();
  const daten = await bogen.evaluate(async ({ kacheln: liste, biome: zeilen, seeds: spalten, breite, hoehe }) => {
    const rand = 6;
    const links = 200;
    const kopf = 22;
    const zeilenHoehe = hoehe + kopf + rand;
    const c = document.createElement('canvas');
    c.width = links + spalten.length * (breite + rand) + rand;
    c.height = zeilen.length * zeilenHoehe + rand;
    const g = c.getContext('2d');
    g.fillStyle = '#16181d';
    g.fillRect(0, 0, c.width, c.height);
    g.textBaseline = 'middle';
    const lade = src => new Promise((ok, fehler) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fehler; i.src = src; });
    for (const [z, b] of zeilen.entries()) {
      const y0 = rand + z * zeilenHoehe;
      g.fillStyle = '#f2f2f2';
      g.font = 'bold 13px sans-serif';
      g.fillText(b.name.length > 26 ? `${b.name.slice(0, 25)}…` : b.name, rand, y0 + kopf + hoehe / 2 - 9);
      g.fillStyle = '#9aa0aa';
      g.font = '12px monospace';
      g.fillText(b.id, rand, y0 + kopf + hoehe / 2 + 9);
      for (const [s, seed] of spalten.entries()) {
        const k = liste.find(e => e.biom === b.id && e.seed === seed);
        const x0 = links + s * (breite + rand);
        g.fillStyle = '#cfd3da';
        g.font = '12px monospace';
        g.fillText(`Seed ${seed}${k?.gezogen && k.gezogen !== b.id ? ` → ${k.gezogen}` : ''}`, x0, y0 + kopf / 2);
        if (!k) continue;
        const bild = await lade(`data:image/png;base64,${k.png}`);
        g.drawImage(bild, x0, y0 + kopf, breite, hoehe);
      }
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { kacheln, biome, seeds, breite: BREITE, hoehe: HOEHE });

  mkdirSync(dirname(AUS), { recursive: true });
  const puffer = Buffer.from(daten, 'base64');
  writeFileSync(AUS, puffer);
  console.log(`\nGeschrieben: ${AUS} (${(puffer.length / 1024).toFixed(0)} KB)`);
  if (seitenfehler.length > 0) {
    console.error(`Seitenfehler (${seitenfehler.length}):\n  ${seitenfehler.slice(0, 10).join('\n  ')}`);
    process.exitCode = 1;
  }
} finally {
  await aufraeumen();
}
