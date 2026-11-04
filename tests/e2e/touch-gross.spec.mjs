/**
 * E2E: Große Touch-Geräte im Querformat (Tablet, iPad, Touch-Monitor) — die Touch-Knöpfe liegen frei und griffig.
 *
 * Befund (2026-11-04): Auf großen Touch-Geräten (z. B. 1280x720 mit Touch) lagen die Aktionsknöpfe (`#touch-aktionen`)
 * über dem Wählrad und die Laufknöpfe (`#touch-laufen`) über FEUER. Ursache: Die einzige Regel für grobe Zeiger
 * (index.html) stammte aus dem alten Telefon-Layout; Telefone quer bekamen später eine eigene Aufteilung
 * (`querformat-telefon.spec.mjs`), große Touch-Geräte nicht. Jetzt: Abschnitt „Großes Touch" in design.css.
 *
 * Geprüft wird an den echten Rechtecken je Format:
 *   - kein Paar aus Touch-Knöpfen, Wählrad, FEUER, Waffenleiste (samt Beschriftung der gewählten Waffe), Zielanzeige,
 *     Protokoll, Figurenliste und Kopfzeile schneidet sich;
 *   - kein Knopf der Kopfzeile ist verdeckt (`elementFromPoint`), auch nicht im offenen Einstellungs-Dropdown;
 *   - die Kraftzahl ist frei;
 *   - Berührflächen: Touch-Knöpfe mindestens 52 px (groß, nicht nur die 44-px-Untergrenze), sonst mindestens 44 px;
 *   - Daumenreichweite: Aktionen in der linken, Bewegung in der rechten unteren Ecke der Bühne;
 *   - nichts ragt aus dem Fenster, keine waagerechte Rollleiste.
 */
import { test, expect } from '@playwright/test';

/** [Breite, Höhe, isMobile, Name] — Touch ist überall an. */
const FORMATE = [
  [1280, 720, false, 'Touch-Laptop 16:9'],
  [1024, 768, true, 'Tablet 4:3'],
  [1180, 820, true, 'iPad Air quer'],
  [1366, 1024, true, 'iPad Pro quer'],
  [1920, 1080, false, 'Touch-Monitor Full HD'],
];

/** Mindesthöhe und -breite der Touch-Knöpfe auf großen Geräten (Telefon: 44 px). */
const TOUCH_MIN = 52;

const schneidet = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Sichtbare Elemente eines Selektors als Rechtecke mit Namen. */
const rechtecke = (page, sel, praefix) => page.locator(sel).evaluateAll((els, p) => els
  .filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
  .map(e => {
    const r = e.getBoundingClientRect();
    return { name: `${p}${e.textContent.trim().replace(/\s+/g, ' ')}`, x: r.x, y: r.y, width: r.width, height: r.height };
  })
  .filter(r => r.width > 0 && r.height > 0), praefix);

/** Sichtbare Knöpfe unter `wurzel`, die an ihrem Mittelpunkt nicht oben liegen. */
const verdeckte = (page, wurzel) => page.evaluate(sel => [...document.querySelectorAll(`${sel} button`)]
  .filter(k => k.offsetParent !== null)
  .filter(k => {
    const r = k.getBoundingClientRect();
    if (r.width === 0) return false;
    const oben = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return oben !== k && !k.contains(oben);
  }).map(k => k.textContent.trim().replace(/\s+/g, ' ')), wurzel);

async function starte(page, optionen) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(o => {
    const api = window.__PA__;
    api.setAutoLoop(false);
    api.startMatch({ seed: 4711, kartentyp: 'autonom', ...o });
    api.setAutoLoop(false);
  }, optionen);
  await expect(page.locator('#touch-laufen')).toBeVisible();
  await expect(page.locator('#touch-aktionen')).toBeVisible();
  await expect(page.locator('#hud-power')).toBeVisible();
  await page.waitForTimeout(600);
}

/** Alle Flächen, die sich nicht schneiden dürfen: jeder Touch-Knopf einzeln, dazu die HUD-Blöcke. */
async function flaechen(page) {
  const aktionen = await rechtecke(page, '#touch-aktionen button', 'Aktion ');
  const laufen = await rechtecke(page, '#touch-laufen button', 'Bewegung ');
  const bloecke = [];
  for (const [sel, name] of [
    ['#hud-top', 'Kopfzeile'], ['#hud-left', 'Figurenliste'], ['#hud-right', 'Waffenleiste'],
    ['#weapon-list .weapon-item.is-active .weapon-name', 'Waffenname'], ['#hud-dial', 'Wählrad'],
    ['#hud-fire', 'FEUER'], ['#hud-aim', 'Zielanzeige'], ['#hud-log', 'Protokoll'],
  ]) {
    const r = await rechtecke(page, sel, '');
    if (r.length) bloecke.push({ ...r[0], name });
  }
  return { aktionen, laufen, bloecke };
}

for (const [breite, hoehe, mobil, name] of FORMATE) {
  test.describe(`Großes Touch ${breite}x${hoehe} (${name})`, () => {
    test.use({ viewport: { width: breite, height: hoehe }, hasTouch: true, isMobile: mobil });

    test('Touch-Knöpfe, Wählrad, FEUER, Waffenleiste, Anzeigen und Kopfzeile überlappen nicht; Knöpfe groß und in Daumenreichweite', async ({ page }) => {
      const fehler = [];
      page.on('pageerror', e => fehler.push(String(e)));
      await starte(page, {});

      const { aktionen, laufen, bloecke } = await flaechen(page);
      expect(aktionen.length).toBe(6);
      expect(laufen.length).toBe(4);
      for (const pflicht of ['Kopfzeile', 'Figurenliste', 'Waffenleiste', 'Wählrad', 'FEUER', 'Zielanzeige', 'Protokoll']) {
        expect(bloecke.map(b => b.name), `${pflicht} sichtbar`).toContain(pflicht);
      }

      // Paarweise: jede Fläche gegen jede andere.
      const alle = [...aktionen, ...laufen, ...bloecke];
      const ueberlappungen = [];
      for (let i = 0; i < alle.length; i += 1) {
        for (let j = i + 1; j < alle.length; j += 1) {
          if (schneidet(alle[i], alle[j])) ueberlappungen.push(`${alle[i].name} × ${alle[j].name}`);
        }
      }
      expect(ueberlappungen, 'überlappende Flächen').toEqual([]);

      // Nichts außerhalb des Fensters.
      for (const r of alle) {
        expect(r.x, `${r.name} links im Bild`).toBeGreaterThanOrEqual(0);
        expect(r.y, `${r.name} oben im Bild`).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width, `${r.name} rechts im Bild`).toBeLessThanOrEqual(breite + 1);
        expect(r.y + r.height, `${r.name} unten im Bild`).toBeLessThanOrEqual(hoehe + 1);
      }

      // Berührflächen.
      for (const k of [...aktionen, ...laufen]) {
        expect(k.height, `${k.name}: Höhe`).toBeGreaterThanOrEqual(TOUCH_MIN);
        expect(k.width, `${k.name}: Breite`).toBeGreaterThanOrEqual(TOUCH_MIN);
      }
      const feuer = bloecke.find(b => b.name === 'FEUER');
      expect(feuer.height, 'FEUER: Höhe').toBeGreaterThanOrEqual(TOUCH_MIN);
      for (const k of await rechtecke(page, '#hud-right button', 'Waffenleiste ')) {
        expect(k.height, `${k.name}: Höhe`).toBeGreaterThanOrEqual(44);
        expect(k.width, `${k.name}: Breite`).toBeGreaterThanOrEqual(44);
      }

      // Daumenreichweite: Aktionen links unten, Bewegung rechts unten (gemessen an der Bühne).
      const buehne = await page.locator('#stage').boundingBox();
      const mitte = r => ({ x: r.x + r.width / 2 - buehne.x, y: r.y + r.height / 2 - buehne.y });
      for (const k of aktionen) {
        expect(mitte(k).x, `${k.name}: im linken Viertel`).toBeLessThan(buehne.width / 4);
        expect(mitte(k).y, `${k.name}: in der unteren Hälfte`).toBeGreaterThan(buehne.height / 2);
      }
      for (const k of laufen) {
        expect(mitte(k).x, `${k.name}: im rechten Viertel`).toBeGreaterThan(buehne.width * 3 / 4);
        expect(mitte(k).y, `${k.name}: in der unteren Hälfte`).toBeGreaterThan(buehne.height / 2);
      }

      // Kein Knopf über der Kraftzahl.
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
      expect(await verdeckte(page, '#hud-top'), 'verdeckte Knöpfe im offenen Dropdown').toEqual([]);
      for (const k of await rechtecke(page, '#hud-menue button', '')) {
        expect(k.height, `Dropdown-Knopf „${k.name}" Berührfläche`).toBeGreaterThanOrEqual(44);
        expect(k.x + k.width, `Dropdown-Knopf „${k.name}" rechts im Bild`).toBeLessThanOrEqual(breite + 1);
        expect(k.y + k.height, `Dropdown-Knopf „${k.name}" unten im Bild`).toBeLessThanOrEqual(hoehe + 1);
      }

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(breite);
      expect(fehler).toEqual([]);
    });
  });
}

test.describe('Großes Touch: volle Figurenliste (Krieg, 8 Teams)', () => {
  // Kleinste Bühne der Formate oben (1024x768 → 1024x576): Hier wird die Figurenliste am ehesten zu lang.
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

  test('Die Figurenliste endet über den Aktionsknöpfen', async ({ page }) => {
    await starte(page, { teams: 8, playersPerTeam: 5 });
    const { aktionen, bloecke } = await flaechen(page);
    const liste = bloecke.find(b => b.name === 'Figurenliste');
    expect(liste).toBeTruthy();
    for (const k of aktionen) expect(schneidet(liste, k), `Figurenliste über ${k.name}`).toBe(false);
  });
});
