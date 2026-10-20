/**
 * E2E: Effekt-Ton — Schuss, Einschlag/Treffer, Schalter und Stummschaltung.
 *
 * Playwright setzt `navigator.webdriver`; damit ist der Ausgang stumm (`aktiv: false`), die
 * Klänge entstehen aber wie sonst und werden über `window.__PA__.sound()` gezählt. Ein Test
 * erzwingt mit `?ton=1` den hörbaren Zustand (Ausgang offen).
 */
import { test, expect } from '@playwright/test';

const zustand = page => page.evaluate(() => window.__PA__.sound());

async function starteMatch(page, seed = 20260910) {
  await page.evaluate(() => window.__PA__.setAutoLoop(false));
  await page.evaluate(
    options => window.__PA__.startMatch(options),
    { seed, teams: 2, playersPerTeam: 2, preset: 'hills' },
  );
  await expect(page.locator('#menu-overlay')).toBeHidden();
}

/** Gibt der Figur am Zug eine Waffe und wählt sie. */
const waffe = (page, id) => page.evaluate((w) => {
  const api = window.__PA__;
  const match = api.getMatch();
  match.inventory.register(match.activePlayerId, [w]);
  api.selectWeaponById(w);
}, id);

test.describe('Effekt-Ton', () => {
  test('Der Zustand ist da: Vorgaben, vier Busse, in Tests stumm', async ({ page }) => {
    await page.goto('/');
    const z = await zustand(page);
    expect(z.an).toBe(true);
    expect(z.aktiv).toBe(false);
    expect(z.lautstaerke).toBe(0.8);
    expect(Object.keys(z.busse)).toEqual(['schuss', 'treffer', 'umgebung', 'ui']);
    expect(z.stimmen.max).toBe(24);
  });

  test('Der Schuss löst einen Klang der Kategorie der Waffe aus', async ({ page }) => {
    await page.goto('/');
    await starteMatch(page);
    expect(await page.evaluate(() => window.__PA__.game.sound.starte())).toBe(true);
    const vorher = await zustand(page);
    await waffe(page, 'pa_062'); // Flammenwerfer: elemental/feuer
    await page.evaluate(() => window.__PA__.fire(0.9, 60));
    await page.evaluate(() => window.__PA__.advance(3));
    const nach = await zustand(page);
    expect(nach.kategorien.elemental).toBe(vorher.kategorien.elemental + 1);
    expect(nach.profile.feuer).toBe((vorher.profile.feuer ?? 0) + 1);
    expect(nach.gespielt.schuss).toBe(vorher.gespielt.schuss + 1);
    expect(nach.letzte.kategorie === 'elemental' || nach.letzte.art !== 'schuss').toBe(true);
  });

  test('Ein Treffer löst einen Treffer-Klang aus (aus dem Zustand abgeleitet)', async ({ page }) => {
    await page.goto('/');
    await starteMatch(page);
    expect(await page.evaluate(() => window.__PA__.game.sound.starte())).toBe(true);
    const vorher = (await zustand(page)).gespielt.treffer;
    await page.evaluate(() => {
      const api = window.__PA__;
      const match = api.game.match;
      const figuren = api.getState().entities.filter(f => f.alive);
      match.world.getSystem('damage').applyDamage(
        match.world, figuren[0].entityId, 25, figuren[1]?.entityId ?? null, {},
      );
      api.advance(1);
    });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect.poll(async () => (await zustand(page)).gespielt.treffer).toBeGreaterThan(vorher);
    const z = await zustand(page);
    expect(z.letzte.profil).toMatch(/^treffer_/);
  });

  test('Eine Explosion klingt nach ihrer Größe', async ({ page }) => {
    await page.goto('/');
    await starteMatch(page);
    await page.evaluate(() => window.__PA__.game.sound.starte());
    await page.evaluate(() => {
      const s = window.__PA__.game.sound;
      s.verarbeite({ type: 'explosion', radius: 90, sprengradius: 90, x: 100, y: 100 });
    });
    expect((await zustand(page)).letzte.profil).toBe('explosion_riesig');
  });

  test('Stummschaltung wirkt: Taste T, Schalter, Zähler', async ({ page }) => {
    await page.goto('/');
    await starteMatch(page);
    await page.evaluate(() => window.__PA__.game.sound.starte());
    await page.keyboard.press('t');
    expect((await zustand(page)).an).toBe(false);
    const vorher = await zustand(page);
    await page.evaluate(() => window.__PA__.game.sound.verarbeite({ type: 'shot', weaponId: 'pa_001' }));
    const nach = await zustand(page);
    expect(nach.gespielt.schuss).toBe(vorher.gespielt.schuss);
    expect(nach.stumm).toBe(vorher.stumm + 1);
    await page.keyboard.press('t');
    expect((await zustand(page)).an).toBe(true);
    await page.evaluate(() => window.__PA__.game.sound.verarbeite({ type: 'shot', weaponId: 'pa_001' }));
    expect((await zustand(page)).gespielt.schuss).toBe(vorher.gespielt.schuss + 1);
  });

  test('Die Bedienung im Menü: Schalter, Regler, Speicher', async ({ page }) => {
    await page.goto('/');
    const schalter = page.locator('#menu-overlay [data-ton-schalter]');
    const regler = page.locator('#menu-overlay [data-ton-regler]');
    await expect(schalter).toHaveAttribute('aria-pressed', 'true');
    await expect(schalter).toContainText('Effekte an');
    expect(await schalter.boundingBox().then(b => b.height)).toBeGreaterThanOrEqual(44);
    await schalter.click();
    await expect(schalter).toHaveAttribute('aria-pressed', 'false');
    await expect(schalter).toContainText('Effekte aus');
    expect((await zustand(page)).an).toBe(false);
    await regler.fill('35');
    expect((await zustand(page)).lautstaerke).toBeCloseTo(0.35, 5);
    const gespeichert = await page.evaluate(() => JSON.parse(localStorage.getItem('pa.ton.v1')));
    expect(gespeichert).toEqual({ an: false, lautstaerke: 0.35 });
    await page.reload();
    const z = await zustand(page);
    expect(z.an).toBe(false);
    expect(z.lautstaerke).toBeCloseTo(0.35, 5);
    await expect(page.locator('#menu-overlay [data-ton-schalter]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Im Textfeld schaltet T nichts', async ({ page }) => {
    await page.goto('/');
    await page.fill('#cfg-seed', '');
    await page.locator('#cfg-seed').press('t');
    expect((await zustand(page)).an).toBe(true);
  });

  test('?ton=1 erzwingt den hörbaren Ausgang, ?ton=0 hält ihn stumm', async ({ page }) => {
    await page.goto('/?ton=1');
    expect((await zustand(page)).aktiv).toBe(true);
    await page.goto('/?ton=0');
    expect((await zustand(page)).aktiv).toBe(false);
  });

  test('Der Hilfe-Reiter „Ton und Musik“ nennt die Effekte', async ({ page }) => {
    await page.goto('/');
    const behaelter = page.locator('#hilfe-browser');
    await behaelter.locator('summary').click();
    await page.locator('#hilfe-tabs button').nth(5).click();
    const text = await behaelter.innerText();
    expect(text).toContain('Effekt-Lautstärke');
    expect(text).toContain('Taste T');
  });
});
