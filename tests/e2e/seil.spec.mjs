/**
 * E2E: Seil (Ninja Rope, Seilfassung 2) im echten lokalen Spiel, nur über Tasten.
 *
 *   F Seil wählen · Leertaste (Feuer) schießt das Seil im Zielwinkel · D/A schwingen · W einholen · Leertaste löst
 *
 * Der Zielwinkel wird vorher so gesetzt, dass das Seil Halt findet (Abtastung mit derselben Strahlfunktion wie der
 * Motor, `engine/seil.js#seilStrahl`); alles Weitere läuft über die Tastatur wie beim Spieler.
 */
import { test, expect } from '@playwright/test';

async function oeffne(page) {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.locator('#cfg-seed').fill('10');
  // Höhlenkarte: über der Figur liegt Gelände, an dem das Seil Halt findet.
  await page.locator('#cfg-erweitert').evaluate(d => { d.open = true; });
  await page.locator('#cfg-kartenart').selectOption('hoehle');
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__PA__.isGrounded()), { timeout: 15000 }).toBe(true);
  return fehler;
}

const seil = page => page.evaluate(() => {
  const s = window.__PA__.getState();
  const e = s.entities.find(q => q.entityId === s.activePlayerId);
  const anker = s.seil?.punkte?.at(-1) ?? [e.x, e.y];
  return { haengt: Boolean(s.seil?.haengt), laenge: s.seil?.laenge ?? 0, abstand: Math.hypot(e.x - anker[0], e.y - anker[1]), x: e.x, y: e.y, id: s.activePlayerId };
});

/**
 * Stellt die Figur am Zug in eine Höhle: Boden unter ihr, Decke 190–400 px darüber (über der Sprunghöhe,
 * unter der Seillänge), Platz zum Schwingen.
 *
 * Bis Geländefassung 8 stand die erste Figur auf Seed 10 unter einem Überhang. Seit Fassung 9 (Startplatz
 * braucht 96 px begehbaren Abschnitt) starten Figuren auf offenen Flächen; gesucht über 4 Kartenarten und
 * rund 50 Seeds (2026-11-04) hatte keine Startfigur mehr eine Decke über sich. Geprüft wird hier die
 * Seil-MECHANIK, nicht der Startplatz: Die Figur wird einmal versetzt, danach laufen nur echte Eingaben.
 */
async function stelleUnterDecke(page) {
  const ort = await page.evaluate(() => {
    const m = window.__PA__.game.match;
    const id = m.activePlayerId;
    const fest = (x, y) => m.terrain.isSolid(Math.round(x), Math.round(y));
    const x0 = m.world.getComponent(id, 'Position', 'x');
    const versatz = m.world.getComponent(id, 'Position', 'y') - m.surfaceYAt(x0);
    for (let x = 120; x < m.width - 120; x += 6) {
      for (let y = 40; y < m.height - 40; y += 1) {
        if (fest(x, y) || !fest(x, y + 1)) continue; // y: Luft, darunter Boden
        let frei = true;
        for (let dy = 1; dy <= 40 && frei; dy += 1) for (const dx of [-10, 0, 10]) if (fest(x + dx, y - dy)) frei = false;
        if (!frei) continue;
        let decke = -1;
        for (let dy = 1; dy <= 400; dy += 1) if (fest(x, y - dy)) { decke = dy; break; }
        if (decke < 190) continue; // höher als ein Sprung (~120 px), sonst prallt die Figur an die Decke
        if (decke < 0) continue;
        let offen = true; // keine Wand dicht daneben, damit die Figur schwingen kann
        for (let dy = 10; dy <= 60 && offen; dy += 10) for (const dx of [-60, 60]) if (fest(x + dx, y - dy)) offen = false;
        if (!offen) continue;
        m.world.setComponent(id, 'Position', 'x', x);
        m.world.setComponent(id, 'Position', 'y', y + 1 + versatz);
        m.world.setComponent(id, 'Velocity', 'x', 0);
        m.world.setComponent(id, 'Velocity', 'y', 0);
        return { x, y, decke };
      }
    }
    return null;
  });
  expect(ort, 'Testaufbau: es gibt eine Höhle mit Decke').not.toBeNull();
  await expect.poll(() => page.evaluate(() => window.__PA__.isGrounded()), { timeout: 15000 }).toBe(true);
  return ort;
}

/** Sucht einen Zielwinkel, unter dem das Seil der Figur am Zug Halt findet, und stellt ihn ein. */
async function zieleAufHalt(page) {
  return page.evaluate(async () => {
    const { seilStrahl } = await import('/src/engine/seil.js');
    const game = window.__PA__.game;
    const m = game.match;
    const id = m.activePlayerId;
    const x = m.world.getComponent(id, 'Position', 'x');
    const y = m.world.getComponent(id, 'Position', 'y');
    for (let i = 0; i <= 90; i += 1) {
      const w = i % 2 === 0 ? Math.PI / 2 - (i / 2) * 0.034 : Math.PI / 2 + ((i + 1) / 2) * 0.034;
      if (w < 0 || w > Math.PI) continue;
      const r = seilStrahl(m.terrain, x, y, w, m.seilSystem.maxLaenge);
      if (r.treffer && r.laenge > 60) { game.input.setAngle(w); game.aim.angle = w; return w; }
    }
    return null;
  });
}

async function tippe(page, taste, ms = 60) {
  await page.keyboard.down(taste);
  await page.waitForTimeout(ms);
  await page.keyboard.up(taste);
}

test('Seil: F wählen, im Sprung schießen, D schwingt, W holt ein, Feuer löst', async ({ page }) => {
  const fehler = await oeffne(page);
  expect(await page.evaluate(() => Boolean(window.__PA__.game.match.seilSystem)), 'neue Partien haben das Seil').toBe(true);
  await stelleUnterDecke(page);

  await tippe(page, 'f');
  expect(await page.evaluate(() => window.__PA__.game.seilSteuerung.gewaehlt)).toBe(true);
  // Wie in Worms: abspringen und im Flug das Seil schießen — dann hängt die Figur frei.
  // Erst zielen, dann springen und sofort schießen: Die Suche nach dem Winkel dauerte zwischen Sprung und
  // Schuss manchmal länger als der Sprung, dann hing die Figur am Boden statt frei (2026-11-04, 2 von 4 Läufen).
  const winkel = await zieleAufHalt(page);
  expect(winkel, 'Testaufbau: es gibt einen Winkel mit Halt').not.toBeNull();
  await tippe(page, 'Enter');
  // Nahe am Scheitel schießen, im Browser abgewartet statt fester 220 ms: Auf einem ausgelasteten Rechner war der
  // Sprung (~22 Takte) sonst schon vorbei, und das Seil hing an einer stehenden Figur.
  await page.waitForFunction(() => {
    const m = window.__PA__.game.match;
    return !window.__PA__.isGrounded() && m.world.getComponent(m.activePlayerId, 'Velocity', 'y') > -3;
  }, null, { timeout: 3000, polling: 'raf' });
  await page.keyboard.down(' ');
  await page.waitForTimeout(30);
  await page.keyboard.up(' ');
  await expect.poll(async () => (await seil(page)).haengt, { timeout: 3000 }).toBe(true);
  const start = await seil(page);

  // Schwingen: D gehalten, die Figur pendelt am Seil.
  await page.keyboard.down('d');
  await page.waitForTimeout(900);
  await page.keyboard.up('d');
  const geschwungen = await seil(page);
  expect(geschwungen.haengt).toBe(true);
  expect(Math.hypot(geschwungen.x - start.x, geschwungen.y - start.y), 'die Figur schwingt').toBeGreaterThan(5);

  // Einholen: W gehalten verkürzt das Seil (und zielt dabei nicht).
  const winkelVorher = await page.evaluate(() => window.__PA__.game.aim.angle);
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  const eingeholt = await seil(page);
  expect(eingeholt.haengt).toBe(true);
  expect(eingeholt.laenge, 'W holt das Seil ein').toBeLessThan(geschwungen.laenge - 10);
  expect(await page.evaluate(() => window.__PA__.game.aim.angle), 'am Seil wird mit W nicht gezielt').toBe(winkelVorher);

  // Lösen: Feuer mit gewähltem Seil.
  await tippe(page, ' ');
  await expect.poll(async () => (await seil(page)).haengt, { timeout: 3000 }).toBe(false);
  expect(fehler).toEqual([]);
});

test('Seil: im Waffenmenü als Werkzeug wählbar', async ({ page }) => {
  const fehler = await oeffne(page);
  await tippe(page, 'e');
  await expect(page.locator('#waffenmenue')).toBeVisible();
  const zeile = page.locator('#wm-o-seil');
  await expect(zeile).toBeVisible();
  await zeile.click();
  await expect(page.locator('#waffenmenue')).toBeHidden();
  expect(await page.evaluate(() => window.__PA__.game.seilSteuerung.gewaehlt)).toBe(true);
  expect(fehler).toEqual([]);
});
