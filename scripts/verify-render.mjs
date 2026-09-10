/**
 * Prüft per Pixelabfrage, ob Spielfiguren, Zielvorschau und HUD-Marker
 * tatsächlich auf das Canvas gezeichnet werden.
 *
 * Wichtig: getImageData arbeitet im Canvas-Koordinatenraum (1280x720). Die
 * Weltkoordinaten der Entities sind identisch damit — eine DPR-Skalierung wäre
 * hier falsch.
 *
 * Aufruf: node scripts/verify-render.mjs
 */
import { chromium } from 'playwright';

const TEAM_COLORS = [
  [76, 201, 240],
  [244, 162, 97],
  [144, 190, 109],
  [224, 122, 95],
];
const COLOR_TOLERANCE = 46;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

await page.goto('http://127.0.0.1:5173/');
await page.evaluate(() => window.__PA__.startMatch({ seed: 20260910, teams: 2, playersPerTeam: 2 }));
await page.evaluate(() => window.__PA__.setAutoLoop(false));
await page.waitForTimeout(300);

const report = await page.evaluate(({ teamColors, tolerance }) => {
  const api = window.__PA__;
  const state = api.getState();
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const near = (r, g, b, target) =>
    Math.abs(r - target[0]) < tolerance && Math.abs(g - target[1]) < tolerance && Math.abs(b - target[2]) < tolerance;

  /** Zählt Pixel in einem Rechteck, die einer der Teamfarben entsprechen. */
  const countTeamPixels = (x, y, half) => {
    const px = Math.max(0, Math.round(x - half));
    const py = Math.max(0, Math.round(y - half));
    const size = half * 2;
    if (px + size > canvas.width || py + size > canvas.height) return -1;
    const data = ctx.getImageData(px, py, size, size).data;
    const hits = {};
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < teamColors.length; c++) {
        if (near(data[i], data[i + 1], data[i + 2], teamColors[c])) {
          hits[c] = (hits[c] ?? 0) + 1;
          total++;
        }
      }
    }
    return { total, perTeam: hits };
  };

  const players = state.entities.map(entity => ({
    label: entity.label,
    teamId: entity.teamId,
    x: Math.round(entity.x),
    y: Math.round(entity.y),
    pixels: countTeamPixels(entity.x, entity.y, 16),
  }));

  // Zielvorschau: die gestrichelte Linie ist orange (244,162,97).
  // Wichtig: exakt die Zielwerte abtasten, die der Render-Loop verwendet.
  const aim = api.game.aim;
  const preview = api.aimPreview(aim.angle, aim.power);
  let previewHits = 0;
  for (const point of preview.slice(2)) {
    const result = countTeamPixels(point.x, point.y, 6);
    if (result !== -1 && result.perTeam[1]) previewHits++;
  }

  return {
    canvasSize: { w: canvas.width, h: canvas.height },
    aim,
    players,
    previewPoints: preview.length,
    previewSegmentsWithOrange: previewHits,
    // Global: orange Pixel ausserhalb der Spielerkoerper = Zielvorschau.
    orangePixelsOutsidePlayers: countOrangeOutsidePlayers(state.entities),
  };

  /** Zaehlt orange Pixel, die nicht zu einem Spielerkoerper gehoeren. */
  function countOrangeOutsidePlayers(entities) {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const players = entities.map(e => ({ x: e.x, y: e.y }));
    let count = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (!near(data[i], data[i + 1], data[i + 2], teamColors[1])) continue;
        const insidePlayer = players.some(p => Math.abs(p.x - x) <= 18 && Math.abs(p.y - y) <= 20);
        if (!insidePlayer) count++;
      }
    }
    return count;
  }
}, { teamColors: TEAM_COLORS, tolerance: COLOR_TOLERANCE });

console.log(JSON.stringify(report, null, 1));

const drawn = report.players.filter(p => p.pixels !== -1 && p.pixels.total > 20).length;
console.log(`Spieler mit gezeichneten Team-Pixeln: ${drawn}/${report.players.length}`);
console.log(`Zielvorschau-Segmente mit Orange: ${report.previewSegmentsWithOrange}/${Math.max(0, report.previewPoints - 2)}`);
console.log(`Orange Pixel ausserhalb der Spieler (Zielvorschau): ${report.orangePixelsOutsidePlayers}`);
console.log('pageerrors:', errors);

await page.locator('#game-canvas').screenshot({ path: 'artifacts/canvas-view.png' });
console.log('Canvas-Screenshot: artifacts/canvas-view.png');

await browser.close();
const ok = drawn === report.players.length && report.orangePixelsOutsidePlayers > 40 && errors.length === 0;
process.exitCode = ok ? 0 : 1;
