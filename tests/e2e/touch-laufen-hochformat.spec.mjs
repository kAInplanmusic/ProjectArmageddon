/**
 * E2E: Touch-Laufknöpfe im Hochformat überdecken die Kraftanzeige nicht (EREIGNIS-1).
 *
 * Befund (390x844, Touch): `#touch-laufen` stand bei bottom 196 px rechts, die Zielanzeige `#hud-aim`
 * (Kraft, Radius, Zug, Kamera) im schmalen Raster in Zeile 2 rechts direkt über der Waffenleiste — gemessen
 * lagen Knöpfe y 527–573 und Anzeige y 533–600 übereinander, Salto/Passen verdeckten „Kraft". Behoben im Spiel
 * (`design.css`, Block „Schmale Bühne"): Die Zielanzeige steht jetzt zwischen Winkelregler und FEUER.
 * Geprüft wird gegen die echten Rechtecke, dazu dass kein sichtbarer Knopf über der Kraftzahl liegt; 360x780 deckte
 * außerdem „◀ Gehen" über „Seil ▼" auf (Knöpfe dort jetzt 44 px breit).
 */
import { test, expect } from '@playwright/test';

const schneidet = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const [breite, hoehe] of [[390, 844], [360, 780], [412, 915]]) {
  test.describe(`Hochformat ${breite}x${hoehe}`, () => {
    test.use({ viewport: { width: breite, height: hoehe }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

    // Hochformat-Karte und die übliche Querformat-Karte: Bei dieser ist die Spielfläche nur rund 219 px hoch, und
    // der HUD wird gestaucht (dort lag 2026-11-04 die Waffenleiste über dem Musikschalter).
    for (const ausrichtung of ['portrait', 'landscape']) test(`Karte ${ausrichtung}: Laufknöpfe, Aktionsknöpfe, Kraftanzeige, Protokoll und Leiste überlappen nicht`, async ({ page }) => {
      const fehler = [];
      page.on('pageerror', e => fehler.push(String(e)));
      await page.goto('/');
      await page.waitForFunction(() => Boolean(window.__PA__));
      await page.evaluate(orientation => {
        const api = window.__PA__;
        api.setAutoLoop(false);
        api.startMatch({ seed: 4711, orientation, kartentyp: 'autonom' });
        api.setAutoLoop(false);
      }, ausrichtung);
      await expect(page.locator('#touch-laufen')).toBeVisible();
      await expect(page.locator('#hud-power')).toBeVisible();
      await page.waitForTimeout(600);

      const kasten = async sel => {
        const b = await page.locator(sel).first().boundingBox();
        expect(b, sel).not.toBeNull();
        return b;
      };
      const kraft = await kasten('#hud-aim');
      const laufKnoepfe = await page.locator('#touch-laufen button').evaluateAll(els => els.map(e => {
        const r = e.getBoundingClientRect();
        return { name: e.textContent.trim(), x: r.x, y: r.y, width: r.width, height: r.height };
      }));
      const aktionsKnoepfe = await page.locator('#touch-aktionen button').evaluateAll(els => els.map(e => {
        const r = e.getBoundingClientRect();
        return { name: e.textContent.trim(), x: r.x, y: r.y, width: r.width, height: r.height };
      }));
      expect(laufKnoepfe.length).toBe(4);
      const andere = {
        '#hud-right': await kasten('#hud-right'),
        '#hud-fire': await kasten('#hud-fire'),
        '#hud-dial': await kasten('#hud-dial'),
        '#hud-log': await kasten('#hud-log'),
      };

      for (const k of laufKnoepfe) {
        expect(schneidet(k, kraft), `Laufknopf „${k.name}" über der Kraftanzeige`).toBe(false);
        for (const [sel, b] of Object.entries(andere)) expect(schneidet(k, b), `Laufknopf „${k.name}" über ${sel}`).toBe(false);
        for (const a of aktionsKnoepfe) expect(schneidet(k, a), `Laufknopf „${k.name}" über „${a.name}"`).toBe(false);
        expect(k.x + k.width, `Laufknopf „${k.name}" rechts im Bild`).toBeLessThanOrEqual(breite + 1);
      }
      for (const a of aktionsKnoepfe) {
        expect(schneidet(a, kraft), `Aktionsknopf „${a.name}" über der Kraftanzeige`).toBe(false);
        expect(schneidet(a, andere['#hud-log']), `Aktionsknopf „${a.name}" über dem Protokoll`).toBe(false);
      }
      for (const sel of ['#hud-right', '#hud-fire', '#hud-dial']) {
        expect(schneidet(kraft, andere[sel]), `Kraftanzeige über ${sel}`).toBe(false);
      }
      expect(kraft.x, 'Kraftanzeige links im Bild').toBeGreaterThanOrEqual(0);
      expect(kraft.y + kraft.height, 'Kraftanzeige unten im Bild').toBeLessThanOrEqual(hoehe + 1);

      // Kein sichtbarer Knopf irgendwo im HUD (außer der Kamera-Taste der Anzeige selbst) liegt über der Kraftzahl.
      const verdecker = await page.evaluate(() => {
        const zahl = document.getElementById('hud-power').getBoundingClientRect();
        const anzeige = document.getElementById('hud-aim');
        return [...document.querySelectorAll('button')].filter(knopf => {
          if (anzeige.contains(knopf) || knopf.offsetParent === null) return false;
          const r = knopf.getBoundingClientRect();
          return r.width > 0 && r.x < zahl.right && zahl.x < r.right && r.y < zahl.bottom && zahl.y < r.bottom;
        }).map(knopf => knopf.textContent.trim());
      });
      expect(verdecker, 'Knöpfe über der Kraftzahl').toEqual([]);

      // Fund 2026-11-04: Nachdem die Zielanzeige Zeile 2 verließ, ragte die Waffenleiste über den Musikschalter
      // der Kopfzeile; ein Tipp darauf traf WAFFEN. Jeder sichtbare Knopf der Kopfzeile muss oben liegen.
      const verdeckteKopfknoepfe = await page.evaluate(() => [...document.querySelectorAll('#hud-top button')]
        .filter(knopf => knopf.offsetParent !== null)
        .filter(knopf => {
          const r = knopf.getBoundingClientRect();
          if (r.width === 0) return false;
          const oben = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return oben !== knopf && !knopf.contains(oben);
        }).map(knopf => knopf.textContent.trim()));
      expect(verdeckteKopfknoepfe, 'verdeckte Knöpfe der Kopfzeile').toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(breite);
      expect(fehler).toEqual([]);
    });
  });
}
