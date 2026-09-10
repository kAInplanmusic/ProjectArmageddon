/**
 * Erzeugt einen Screenshot des laufenden Spiels für die visuelle Prüfung.
 * Aufruf: node scripts/screenshot.mjs [seed] [ausgabe]
 * Erwartet einen laufenden Dev-Server (npm run dev).
 */
import { chromium } from 'playwright';

const seed = Number(process.argv[2] ?? 20260910);
const output = process.argv[3] ?? 'artifacts/game-view.png';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

await page.goto('http://127.0.0.1:5173/');
await page.evaluate(options => window.__PA__.startMatch(options), { seed, teams: 2, playersPerTeam: 2, preset: 'hills' });
await page.evaluate(() => window.__PA__.setAutoLoop(false));

// Ein paar Schüsse und Bewegung, damit Projektile, Krater und HUD gefüllt sind.
await page.evaluate(() => {
  const api = window.__PA__;
  api.fire(Math.PI / 3.2, 78);
  api.advance(28);
});
await page.screenshot({ path: output, fullPage: false });

const state = await page.evaluate(() => window.__PA__.getState());
console.log(JSON.stringify({
  output,
  status: state.status,
  round: state.round,
  wind: state.wind,
  players: state.entities.map(e => `${e.label}:hp=${Math.round(e.health)}`),
  projectiles: state.projectiles.length,
  crates: state.crates.length,
  errors,
}, null, 1));

await browser.close();
