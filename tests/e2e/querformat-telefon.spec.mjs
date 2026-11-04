/**
 * E2E: Telefon im Querformat (844x390, 915x412) ist voll bedienbar — nichts überlappt, kein Kopfzeilenknopf verdeckt.
 *
 * Ersetzt seit 2026-11-04 („nur quer") die Hochformat-Prüfungen (`touch-laufen-hochformat`, `hud-hochformat`):
 * Dieselben Funde (EREIGNIS-1: Laufknöpfe über der Kraftanzeige; Waffenleiste über dem Musikschalter; Laufknöpfe über
 * „Match verlassen") werden jetzt in den Querformaten geprüft, die es noch gibt. Gemessen an den echten Rechtecken:
 * Touch-Laufknöpfe, Touch-Aktionen, Kopfzeile, Waffenleiste, FEUER, Wählrad und Kraftanzeige schneiden sich nicht,
 * und jeder sichtbare Knopf der Kopfzeile (auch im offenen Einstellungs-Dropdown) liegt oben (`elementFromPoint`).
 */
import { test, expect } from '@playwright/test';

const schneidet = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Knöpfe (sichtbar, mit Fläche) eines Selektors als Rechtecke mit Namen. */
const knoepfe = (page, sel) => page.locator(sel).evaluateAll(els => els.filter(e => e.offsetParent !== null).map(e => {
  const r = e.getBoundingClientRect();
  return { name: e.textContent.trim().replace(/\s+/g, ' '), x: r.x, y: r.y, width: r.width, height: r.height };
}).filter(r => r.width > 0));

/** Sichtbare Knöpfe unter `wurzel`, die nicht selbst (oder ein Kind) an ihrem Mittelpunkt oben liegen. */
const verdeckte = (page, wurzel) => page.evaluate(sel => [...document.querySelectorAll(`${sel} button`)]
  .filter(k => k.offsetParent !== null)
  .filter(k => {
    const r = k.getBoundingClientRect();
    if (r.width === 0) return false;
    const oben = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return oben !== k && !k.contains(oben);
  }).map(k => k.textContent.trim().replace(/\s+/g, ' ')), wurzel);

for (const [breite, hoehe] of [[844, 390], [915, 412]]) {
  test.describe(`Telefon quer ${breite}x${hoehe}`, () => {
    test.use({ viewport: { width: breite, height: hoehe }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

    test('Touch-Knöpfe, Kopfzeile, Waffenleiste, FEUER und Kraftanzeige überlappen nicht; kein Kopfzeilenknopf verdeckt', async ({ page }) => {
      const fehler = [];
      page.on('pageerror', e => fehler.push(String(e)));
      await page.goto('/');
      await page.waitForFunction(() => Boolean(window.__PA__));
      await expect(page.locator('#dreh-hinweis')).toBeHidden();
      await page.evaluate(() => {
        const api = window.__PA__;
        api.setAutoLoop(false);
        api.startMatch({ seed: 4711, kartentyp: 'autonom' });
        api.setAutoLoop(false);
      });
      await expect(page.locator('#touch-laufen')).toBeVisible();
      await expect(page.locator('#touch-aktionen')).toBeVisible();
      await expect(page.locator('#hud-power')).toBeVisible();
      await page.waitForTimeout(600);

      const kasten = async sel => {
        const b = await page.locator(sel).first().boundingBox();
        expect(b, sel).not.toBeNull();
        return b;
      };
      const kraft = await kasten('#hud-aim');
      const kopf = await kasten('#hud-top');
      const laufKnoepfe = await knoepfe(page, '#touch-laufen button');
      const aktionsKnoepfe = await knoepfe(page, '#touch-aktionen button');
      expect(laufKnoepfe.length).toBe(4);
      expect(aktionsKnoepfe.length).toBeGreaterThanOrEqual(3);
      const flaechen = {
        '#hud-top': kopf,
        '#hud-right': await kasten('#hud-right'),
        '#hud-fire': await kasten('#hud-fire'),
        '#hud-dial': await kasten('#hud-dial'),
        '#hud-aim': kraft,
      };

      for (const k of [...laufKnoepfe, ...aktionsKnoepfe]) {
        for (const [sel, b] of Object.entries(flaechen)) expect(schneidet(k, b), `Touch-Knopf „${k.name}" über ${sel}`).toBe(false);
        expect(k.height, `Touch-Knopf „${k.name}" Berührfläche`).toBeGreaterThanOrEqual(44);
        expect(k.x, `Touch-Knopf „${k.name}" links im Bild`).toBeGreaterThanOrEqual(0);
        expect(k.x + k.width, `Touch-Knopf „${k.name}" rechts im Bild`).toBeLessThanOrEqual(breite + 1);
        expect(k.y + k.height, `Touch-Knopf „${k.name}" unten im Bild`).toBeLessThanOrEqual(hoehe + 1);
      }
      for (const l of laufKnoepfe) {
        for (const a of aktionsKnoepfe) expect(schneidet(l, a), `Laufknopf „${l.name}" über „${a.name}"`).toBe(false);
      }
      const namen = Object.keys(flaechen);
      for (let i = 0; i < namen.length; i += 1) {
        for (let j = i + 1; j < namen.length; j += 1) {
          expect(schneidet(flaechen[namen[i]], flaechen[namen[j]]), `${namen[i]} über ${namen[j]}`).toBe(false);
        }
      }

      // Kein sichtbarer Knopf (außer der Kamera-Taste der Anzeige selbst) liegt über der Kraftzahl.
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

      // Kopfzeile: kein Knopf verdeckt — geschlossen und mit offenem Einstellungs-Dropdown.
      expect(await verdeckte(page, '#hud-top'), 'verdeckte Knöpfe der Kopfzeile').toEqual([]);
      await page.locator('#hud-menue-knopf').tap();
      await expect(page.locator('#hud-menue')).toBeVisible();
      await expect(page.locator('#hud-abort')).toBeVisible();
      expect(await verdeckte(page, '#hud-top'), 'verdeckte Knöpfe im offenen Dropdown').toEqual([]);
      for (const k of await knoepfe(page, '#hud-menue button')) {
        expect(k.height, `Dropdown-Knopf „${k.name}" Berührfläche`).toBeGreaterThanOrEqual(44);
        expect(k.x + k.width, `Dropdown-Knopf „${k.name}" rechts im Bild`).toBeLessThanOrEqual(breite + 1);
      }

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(breite);
      expect(fehler).toEqual([]);
    });
  });
}
