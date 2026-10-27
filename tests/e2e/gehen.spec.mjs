/**
 * E2E: Gehen (Bewegungsfassung 2) mit der verbindlichen Tastenbelegung.
 *
 *   A/← links laufen · D/→ rechts laufen · W/↑ hoch zielen · S/↓ runter zielen
 *   Leertaste/Shift gehalten = Schuss laden, Loslassen feuert · Enter Sprung · Rück Rückwärtssalto
 *
 * Geprüft am echten Spiel: die Position ändert sich, der Gehzyklus des Renderers läuft (Phase und Rolle `walk`
 * bzw. Prozedur-Fallback ohne Blatt), Zielen verändert nur den Winkel, Laden schießt erst beim Loslassen.
 */
import { test, expect } from '@playwright/test';

async function oeffne(page) {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.locator('#cfg-seed').fill('20260921');
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__PA__.isGrounded()), { timeout: 15000 }).toBe(true);
  return fehler;
}

const aktiv = page => page.evaluate(() => {
  const s = window.__PA__.getState();
  const e = s.entities.find(q => q.entityId === s.activePlayerId);
  const z = window.__PA__.game.renderer.figurPosen.zustaende.get(s.activePlayerId);
  return { id: s.activePlayerId, x: e.x, y: e.y, phase: z?.phase ?? 0, modi: z?.modi ?? 0, rolle: z?.rolle ?? null, hatBlatt: Boolean(z?.fig?.blatt) };
});

async function geheTaste(page, taste, richtung) {
  const vorher = await aktiv(page);
  await page.keyboard.down(taste);
  let sahZyklus = false;
  let gehModus = false;
  const rollen = new Set();
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(50);
    const z = await aktiv(page);
    rollen.add(z.rolle);
    if (z.phase !== vorher.phase) sahZyklus = true;
    if (z.modi !== 0 && (z.modi & 8) === 8) gehModus = true;
  }
  await page.keyboard.up(taste);
  const nachher = await aktiv(page);
  expect((nachher.x - vorher.x) * richtung, `Figur geht mit ${taste}`).toBeGreaterThan(15);
  expect(sahZyklus, 'Der Gehzyklus (Phase aus zurückgelegter Strecke) läuft').toBe(true);
  return { vorher, nachher, rollen: [...rollen], gehModus };
}

test('Gehen: D/A und Pfeile bewegen die Figur am Zug, der Gehzyklus läuft, Loslassen hält an', async ({ page }) => {
  const fehler = await oeffne(page);
  const rechts = await geheTaste(page, 'd', 1);
  if (rechts.nachher.hatBlatt) expect(rechts.rollen, 'Blatt: Rolle walk').toContain('walk');
  const links = await geheTaste(page, 'ArrowLeft', -1);
  expect(links.nachher.x).toBeLessThan(rechts.nachher.x);
  await geheTaste(page, 'ArrowRight', 1);
  await page.waitForTimeout(150);
  const halt = (await aktiv(page)).x;
  await page.waitForTimeout(300);
  expect((await aktiv(page)).x).toBe(halt);
  expect(fehler).toEqual([]);
});

test('Gehen: W/S und Pfeile hoch/runter zielen nur, ohne die Figur zu bewegen; Laufen dreht den Blick', async ({ page }) => {
  const fehler = await oeffne(page);
  const winkel = () => page.evaluate(() => window.__PA__.game.aim.angle);
  const w0 = await winkel();
  const x0 = (await aktiv(page)).x;
  await page.keyboard.down('s');
  await page.waitForTimeout(300);
  await page.keyboard.up('s');
  const w1 = await winkel();
  expect(w1, 'S zielt nach unten (flacher)').toBeLessThan(w0);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowUp');
  expect(await winkel(), 'Pfeil hoch zielt wieder nach oben').toBeGreaterThan(w1);
  expect((await aktiv(page)).x).toBe(x0);
  // Nach links laufen spiegelt den Zielwinkel zur linken Seite.
  await page.keyboard.down('a');
  await page.waitForTimeout(150);
  await page.keyboard.up('a');
  expect(await winkel()).toBeGreaterThan(Math.PI / 2);
  expect(fehler).toEqual([]);
});

test('Gehen: Leertaste ODER Shift gehalten lädt auf, erst das Loslassen feuert; Enter springt, Rück macht den Salto', async ({ page }) => {
  const fehler = await oeffne(page);
  const schuesse = () => page.evaluate(() => window.__PA__.getState().projectiles.length);
  for (const taste of [' ', 'Shift']) {
    expect(await schuesse()).toBe(0);
    const schuetze = await page.evaluate(() => window.__PA__.getState().activePlayerId);
    await page.keyboard.down(taste);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.__PA__.game.input.isCharging), `${taste} lädt`).toBe(true);
    expect(await schuesse(), 'noch kein Schuss beim Halten').toBe(0);
    await page.keyboard.up(taste);
    await expect.poll(schuesse, { timeout: 3000 }).toBeGreaterThan(0);
    // Nächster Zug: warten bis das Geschoss verbraucht ist und die Figur steht.
    await expect.poll(() => page.evaluate(() => window.__PA__.getState().projectiles.length), { timeout: 30000 }).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__PA__.isGrounded()), { timeout: 15000 }).toBe(true);
    // Zugregeln 2: Nach dem Schuss läuft die Rückzugsfrist (5 s); erst danach ist der nächste Spieler dran.
    await expect.poll(() => page.evaluate(() => window.__PA__.getState().activePlayerId), { timeout: 20000 }).not.toBe(schuetze);
  }

  // Sprung (Enter, mit D seitlich) und Rückwärtssalto (Rück): Höhe und Weite am echten Spiel gemessen.
  const messe = async (druck) => {
    const vor = await aktiv(page);
    await page.evaluate(() => {
      window.__hub = { ymin: Infinity, an: true };
      const lauf = () => {
        const st = window.__PA__.getState();
        const e = st.entities.find(q => q.entityId === st.activePlayerId);
        window.__hub.ymin = Math.min(window.__hub.ymin, e.y);
        if (window.__hub.an) requestAnimationFrame(lauf);
      };
      lauf();
    });
    await druck();
    await page.waitForTimeout(150);
    await expect.poll(() => page.evaluate(() => window.__PA__.isGrounded()), { timeout: 15000 }).toBe(true);
    const nach = await aktiv(page);
    const hub = vor.y - (await page.evaluate(() => { window.__hub.an = false; return window.__hub.ymin; }));
    return { hub, dx: nach.x - vor.x };
  };
  const sprung = await messe(async () => { await page.keyboard.down('d'); await page.keyboard.press('Enter'); await page.keyboard.up('d'); });
  expect(sprung.hub, 'Enter springt').toBeGreaterThan(30);
  expect(sprung.dx, 'Sprung mit D geht nach rechts').toBeGreaterThan(5);
  await expect(page.locator('#log-list')).toContainText('Sprung');
  const salto = await messe(async () => { await page.keyboard.press('Backspace'); });
  expect(salto.hub, 'Rück springt höher als Enter').toBeGreaterThan(sprung.hub * 1.1);
  expect(Math.abs(salto.dx), 'und trägt weit').toBeGreaterThan(5);
  await expect(page.locator('#log-list')).toContainText('Rückwärtssalto');
  expect(salto.dx, 'rückwärts = gegen die Blickrichtung (Blick rechts → nach links)').toBeLessThan(0);
  expect(fehler).toEqual([]);
});
