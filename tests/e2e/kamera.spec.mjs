/**
 * E2E: Kameraführung — aktive Figur im sicheren Bereich nach jedem Zugwechsel,
 * Geschossverfolgung hält das Geschoss im Bild, die Kamera verlässt nie die
 * Kartenfläche, Spielerkontrolle (Mausrad, Taste C).
 *
 * Formate: 1280x720, 800x400, Touch 844x390. Seeds: 20260910, 77, 5, 123.
 * Mit `PA_SHOTS=<Ordner>` werden Bilder abgelegt.
 */
import { test, expect } from '@playwright/test';

const FORMATE = [
  { name: 'd1280', viewport: { width: 1280, height: 720 } },
  { name: 'd800', viewport: { width: 800, height: 400 } },
  { name: 'touch844', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
];
const SEEDS = ['20260910', '77', '5', '123'];

async function oeffne(page, seed) {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.locator('#fraktion-auswahl summary').click();
  await page.locator('#cfg-fraktion-0').selectOption('pirates');
  await page.locator('#cfg-fraktion-1').selectOption('machina');
  await page.locator('#cfg-seed').fill(seed);
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  return fehler;
}

async function ablegen(page, name) {
  if (!process.env.PA_SHOTS) return;
  const fs = await import('node:fs');
  fs.mkdirSync(process.env.PA_SHOTS, { recursive: true });
  fs.writeFileSync(`${process.env.PA_SHOTS}/${name}.png`, await page.screenshot());
}

/** Wartet, bis die Kamera in der Übersicht steht und still ist (Fahrt beendet). */
async function ruhe(page) {
  await page.waitForFunction(() => {
    const w = window;
    const k = w.__PA__.kamera();
    if (!k || k.phase !== 'uebersicht') { w.__ruhe = null; return false; }
    const jetzt = performance.now();
    const s = `${k.x.toFixed(1)}|${k.y.toFixed(1)}|${k.zoom.toFixed(3)}`;
    if (!w.__ruhe || w.__ruhe.s !== s) { w.__ruhe = { s, t: jetzt }; return false; }
    return jetzt - w.__ruhe.t > 400;
  }, undefined, { timeout: 12000, polling: 50 });
}

/** Innerhalb der Kartenfläche (Achsen, auf denen die Karte nicht ganz passt). */
function pruefeKlemmung(a) {
  const k = a.karte;
  if (a.x1 - a.x0 < k.b - 1) {
    expect(a.x0, 'links nicht über die Karte hinaus').toBeGreaterThanOrEqual(-0.5);
    expect(a.x1, 'rechts nicht über die Karte hinaus').toBeLessThanOrEqual(k.b + 0.5);
  }
  if (a.y1 - a.y0 < k.h - 1) {
    expect(a.y0, 'oben nicht über die Karte hinaus').toBeGreaterThanOrEqual(-0.5);
    expect(a.y1, 'unten nicht über die Karte hinaus').toBeLessThanOrEqual(k.h + 0.5);
  }
}

for (const f of FORMATE) {
  test.describe(`Kamera ${f.name}`, () => {
    test.use({ viewport: f.viewport, ...(f.hasTouch ? { hasTouch: true, isMobile: true } : {}) });

    for (const seed of SEEDS) {
      test(`Seed ${seed}: aktive Figur nach jedem Zugwechsel im sicheren Bereich, Karte nie verlassen`, async ({ page }) => {
        const fehler = await oeffne(page, seed);
        for (let zug = 0; zug < 3; zug += 1) {
          await ruhe(page);
          const d = await page.evaluate(() => window.__PA__.sichtbereich());
          const aktive = d.figuren.find(x => x.aktiv);
          expect(aktive, 'aktive Figur vorhanden').toBeTruthy();
          const r = aktive.rechteck;
          expect(aktive.verdeckt, `aktive Figur verdeckt (${JSON.stringify(r)})`).toBe(false);
          expect(r.y, 'Kopf unter der Kopfleiste').toBeGreaterThanOrEqual(d.sicher.y0 - 1);
          expect(r.x, 'Figur im Fenster (links)').toBeGreaterThanOrEqual(0);
          expect(r.x + r.b, 'Figur im Fenster (rechts)').toBeLessThanOrEqual(f.viewport.width + 1);
          pruefeKlemmung(await page.evaluate(() => window.__PA__.sichtbarerAusschnitt()));
          await ablegen(page, `kamera-${f.name}-s${seed}-z${zug}`);
          const vorher = await page.evaluate(() => window.__PA__.activePlayerId());
          await page.evaluate(() => window.__PA__.fire(Math.PI / 4, 60));
          await page.waitForFunction(id => window.__PA__.activePlayerId() !== id, vorher, { timeout: 20000 });
        }
        expect(fehler).toEqual([]);
      });
    }
  });
}

test.describe('Kamera: Geschossverfolgung und Bedienung', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('Das Geschoss bleibt im Bild, die Kamera verlässt die Karte nie', async ({ page }) => {
    const fehler = await oeffne(page, '20260910');
    await ruhe(page);
    await page.evaluate(() => {
      const w = window;
      w.__flug = { frames: 0, draussen: 0, klemm: 0, phasen: new Set(), maxStoss: 0 };
      const tick = () => {
        const st = w.__PA__.getState();
        const p = st?.projectiles?.[0];
        const a = w.__PA__.sichtbarerAusschnitt();
        const k = w.__PA__.kamera();
        if (p) {
          w.__flug.frames += 1;
          w.__flug.phasen.add(k.phase);
          const inX = p.x >= a.x0 && p.x <= a.x1;
          const inY = p.y >= a.y0 - 1 && p.y <= a.y1 || p.y < 0;
          if (!inX || !inY) w.__flug.draussen += 1;
        }
        if (a.x1 - a.x0 < a.karte.b - 1 && (a.x0 < -0.5 || a.x1 > a.karte.b + 0.5)) w.__flug.klemm += 1;
        if (a.y1 - a.y0 < a.karte.h - 1 && (a.y0 < -0.5 || a.y1 > a.karte.h + 0.5)) w.__flug.klemm += 1;
        w.__flug.maxStoss = Math.max(w.__flug.maxStoss, Math.abs(k.stoss));
        w.__flug.phasen.add(k.phase);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.evaluate(() => window.__PA__.fire(Math.PI / 4, 75));
    await page.waitForTimeout(4500);
    const m = await page.evaluate(() => ({ ...window.__flug, phasen: [...window.__flug.phasen] }));
    expect(m.frames, 'Es flog ein Geschoss').toBeGreaterThan(3);
    expect(m.phasen).toContain('verfolgung');
    // Die ersten Bilder dürfen hinterherhinken (weiche Verfolgung), danach bleibt es im Bild.
    expect(m.draussen / m.frames, `Geschoss zu oft außerhalb: ${m.draussen}/${m.frames}`).toBeLessThan(0.1);
    expect(m.klemm, 'Kamera zeigte leere Welt').toBe(0);
    await ablegen(page, 'kamera-nach-schuss');
    expect(fehler).toEqual([]);
  });

  test('Taste C schaltet folgt/frei, Mausrad überschreibt, Zugwechsel stellt die Führung wieder her', async ({ page }) => {
    const fehler = await oeffne(page, '5');
    await ruhe(page);
    await expect(page.locator('#hud-kamera')).toHaveAttribute('data-modus', 'folgt');
    await page.keyboard.press('c');
    expect((await page.evaluate(() => window.__PA__.kamera())).modus).toBe('frei');
    await expect(page.locator('#hud-kamera')).toHaveAttribute('data-modus', 'frei');
    await page.keyboard.press('c');
    expect((await page.evaluate(() => window.__PA__.kamera())).modus).toBe('folgt');

    const vor = await page.evaluate(() => window.__PA__.kamera());
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(300);
    const nach = await page.evaluate(() => window.__PA__.kamera());
    expect(nach.uebersteuert).toBe(true);
    expect(nach.zoom).toBeGreaterThan(vor.zoom);
    expect(nach.zoom).toBeLessThanOrEqual(4);
    pruefeKlemmung(await page.evaluate(() => window.__PA__.sichtbarerAusschnitt()));

    // Heraus-Zoomen geht nie unter „ganze Karte".
    for (let i = 0; i < 12; i += 1) await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);
    const raus = await page.evaluate(() => window.__PA__.kamera());
    expect(raus.zoom).toBeGreaterThanOrEqual(raus.ganzeKarte - 1e-6);

    // Zugwechsel: Automatik wieder aktiv.
    const id = await page.evaluate(() => window.__PA__.activePlayerId());
    await page.evaluate(() => window.__PA__.fire(Math.PI / 4, 40));
    await page.waitForFunction(i => window.__PA__.activePlayerId() !== i, id, { timeout: 20000 });
    await ruhe(page);
    expect((await page.evaluate(() => window.__PA__.kamera())).uebersteuert).toBe(false);
    expect(fehler).toEqual([]);
  });

  test('Mausrichtung zielt auch bei Zoom auf die Figur (Ursprung in Bildschirmpixeln)', async ({ page }) => {
    await oeffne(page, '77');
    await ruhe(page);
    const p = await page.evaluate(() => {
      const s = window.__PA__.getState();
      const a = s.entities.find(e => e.entityId === s.activePlayerId);
      const bild = window.__PA__.kartePunktImSchirm(a.x, a.y);
      const c = document.getElementById('game-canvas');
      const r = c.getBoundingClientRect();
      return { x: r.left + bild.x * r.width / c.width, y: r.top + bild.y * r.height / c.height };
    });
    // Zeiger rechts neben der Figur: Winkel nahe 0, nicht durch den Zoom verfälscht.
    await page.mouse.move(p.x + 100, p.y - 2);
    await page.waitForTimeout(200);
    const winkel = await page.evaluate(() => window.__PA__.game.aim.angle);
    expect(winkel).toBeLessThan(0.15);
  });
});
