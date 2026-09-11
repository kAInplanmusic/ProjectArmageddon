import { test, expect } from '@playwright/test';

/**
 * Kaderansicht im Menü.
 *
 * Die Unit-Tests prüfen Katalog und Bilddateien. Hier wird geprüft, dass die 81
 * Charaktere im Browser tatsächlich ankommen: Bilder geladen, Reiter schaltbar,
 * und keine Figur ohne Bild.
 */

test('Die Kaderansicht zeigt neun Fraktionen', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  await page.locator('#roster-browser > summary').click();
  const reiter = page.locator('#roster-tabs button');
  await expect(reiter).toHaveCount(9);

  // Die Namen der Fraktionen stehen auf den Reitern.
  const namen = await reiter.allTextContents();
  expect(namen.join(' ')).toContain('Säurebrut');
  expect(namen.join(' ')).toContain('Datenkult');
});

test('Jede Fraktion zeigt neun Charaktere mit geladenem Bild', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.locator('#roster-browser > summary').click();

  const reiter = page.locator('#roster-tabs button');
  const anzahl = await reiter.count();

  for (let i = 0; i < anzahl; i++) {
    await reiter.nth(i).click();
    const name = await reiter.nth(i).textContent();

    // Neun Einträge
    await expect(page.locator('#roster-list li')).toHaveCount(9, { timeout: 5000 });

    // Warten, bis alle neun Bilder dekodiert sind (naturalWidth > 0).
    await page.waitForFunction(() => {
      const bilder = [...document.querySelectorAll('#roster-list img')];
      return bilder.length === 9 && bilder.every(b => b.complete && b.naturalWidth > 0);
    }, null, { timeout: 10000 });

    // Alle Bilder vorhanden und wirklich dekodiert (naturalWidth > 0).
    const bilder = await page.locator('#roster-list img').evaluateAll(
      elemente => elemente.map(e => ({ breite: e.naturalWidth, hoehe: e.naturalHeight, src: e.currentSrc })),
    );
    expect(bilder.length, `${name}: Bilder`).toBeGreaterThan(0);
    for (const bild of bilder) {
      expect(bild.breite, `${name}: ${bild.src} nicht geladen`).toBeGreaterThan(0);
      expect(bild.hoehe, `${name}: ${bild.src} nicht geladen`).toBeGreaterThan(0);
    }

    // Kein Platzhalter für ein fehlendes Bild.
    await expect(page.locator('#roster-list .r-bild-fehlt')).toHaveCount(0, { timeout: 2000 });
  }
});

test('Jeder Eintrag nennt Superwaffe, Biografie und Profil', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.locator('#roster-browser > summary').click();

  await page.locator('#roster-tabs button').first().click();

  for (const teil of ['.r-name', '.r-role', '.r-waffe', '.r-bio', '.r-prof']) {
    const texte = await page.locator(`#roster-list ${teil}`).allTextContents();
    expect(texte.length, `${teil} fehlt`).toBe(9);
    for (const t of texte) {
      expect(t.trim().length, `${teil} ist leer`).toBeGreaterThan(10);
    }
  }

  // Das Profil nennt Stärken und Schwächen.
  const profil = await page.locator('#roster-list .r-prof').first().textContent();
  expect(profil).toContain('+');
  expect(profil).toContain('−');
});

test('Alle 81 Bilder sind über den Kader erreichbar', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.locator('#roster-browser > summary').click();

  // Jede Fraktion einmal anklicken und die Bild-URLs einsammeln.
  const reiter = page.locator('#roster-tabs button');
  const anzahl = await reiter.count();
  const urls = new Set();

  for (let i = 0; i < anzahl; i++) {
    await reiter.nth(i).click();
    const gefunden = await page.locator('#roster-list img').evaluateAll(
      elemente => elemente.map(e => e.getAttribute('src')),
    );
    for (const u of gefunden) urls.add(u);
  }

  // 81 verschiedene Bilder — nicht 81-mal dasselbe.
  expect(urls.size).toBe(81);

  // Und jedes davon lässt sich auch abrufen.
  for (const u of urls) {
    const antwort = await page.request.get(new URL(u, 'http://127.0.0.1:5173/').href);
    expect(antwort.status(), `${u} nicht abrufbar`).toBe(200);
  }
});
