/**
 * E2E: Die Musik-Kachel im HUD-Kopf ist nicht abgeschnitten und überlappt keine
 * Nachbarkachel (1280x720, 1100x700, 800x400, Touch 844x390).
 *
 * Anzeige: nur „♪ <Titel>" (Ellipsis nur beim Titel), der volle Text steht im
 * Tooltip. In schmalen oder niedrigen Fenstern zeigt die Kachel nur Schalter
 * und Regler. `?musik=1` erzwingt die Wiedergabe, damit ein Titel erscheint.
 */
import { test, expect } from '@playwright/test';

const FORMATE = [
  { name: 'd1280', w: 1280, h: 720, touch: false, titel: true },
  { name: 'd1100', w: 1100, h: 700, touch: false, titel: true },
  { name: 'd800', w: 800, h: 400, touch: false, titel: false },
  { name: 'touch844', w: 844, h: 390, touch: true, titel: false },
];

for (const f of FORMATE) {
  test(`Musik-Kachel ${f.name}: kein Abschneiden, keine Überlappung`, async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: f.w, height: f.h }, hasTouch: f.touch, isMobile: f.touch,
    });
    const page = await ctx.newPage();
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e)));
    await page.goto('/?musik=1');
    await page.locator('#start-button').click();
    await expect(page.locator('#menu-overlay')).toBeHidden();
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const hud = document.getElementById('musik-hud');
      const m = hud.getBoundingClientRect();
      const t = hud.querySelector('.musik-titel');
      const nachbarn = [...document.querySelectorAll('#hud-top > *')].filter(e => e !== hud)
        .map(e => ({ id: e.id, r: e.getBoundingClientRect() }));
      const ueberlappt = nachbarn.filter(o => o.r.width > 0
        && !(o.r.right <= m.left + 0.5 || o.r.left >= m.right - 0.5 || o.r.bottom <= m.top || o.r.top >= m.bottom))
        .map(o => o.id);
      const innen = [...hud.children].filter(e => e.getBoundingClientRect().width > 0)
        .map(e => e.getBoundingClientRect().right);
      return {
        text: t.textContent, tooltip: t.title, anzeige: getComputedStyle(t).display,
        ueberlappt, rechts: Math.max(...innen), kachelRechts: m.right, fenster: window.innerWidth,
        abgeschnitten: hud.scrollWidth > hud.clientWidth + 1,
      };
    });
    expect(r.ueberlappt).toEqual([]);
    expect(r.abgeschnitten).toBe(false);
    expect(r.kachelRechts).toBeLessThanOrEqual(r.fenster);
    expect(r.rechts).toBeLessThanOrEqual(r.kachelRechts);
    if (f.titel) {
      expect(r.anzeige).not.toBe('none');
      expect(r.text.startsWith('♪ ')).toBe(true);
      expect(r.tooltip.startsWith('Läuft: ')).toBe(true);
    } else {
      expect(r.anzeige).toBe('none');
    }
    expect(fehler).toEqual([]);
    await ctx.close();
  });
}
