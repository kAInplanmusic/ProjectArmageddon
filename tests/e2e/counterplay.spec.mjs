/**
 * E2E: Counterplay und Map-Synergie im Browser.
 *
 * Die Unit-Tests prüfen die Ableitung. Hier wird geprüft, dass die Anzeige sie
 * zeigt — und dass sie NICHTS behauptet, was die Zahlen nicht hergeben.
 */
import { test, expect } from '@playwright/test';

test.describe('Counterplay-Anzeige', () => {
  test('Die Kartenwahl zeigt die begünstigte Klasse', async ({ page }) => {
    /*
     * Die Zeile muss beim WECHSEL mitwandern. Bliebe sie beim ersten Wert
     * stehen, wäre sie eine Anzeige, die nicht zur Auswahl passt — und der
     * Spieler würde nach einer falschen Empfehlung entscheiden.
     */
    await page.goto('/');

    const hinweis = page.locator('#cfg-preset-synergie');
    await expect(hinweis).toBeVisible();

    const erwartet = await page.evaluate(async () => {
      const m = await import('/src/shared/terrainGen.js');
      return Object.entries(m.TERRAIN_AFFINITY).map(([form, e]) => ({
        form, favorisiert: e.favorisiert,
      }));
    });

    for (const { form, favorisiert } of erwartet) {
      await page.selectOption('#cfg-preset', form);
      const text = await hinweis.innerText();
      expect(text, `${form}: die begünstigte Klasse fehlt`).toContain(favorisiert);
    }
  });

  test('Der Counterplay-Reiter erklärt die Klassen und die Karten', async ({ page }) => {
    await page.goto('/');
    const behaelter = page.locator('#hilfe-browser');
    await behaelter.locator('summary').click();
    await page.locator('#hilfe-tabs button').nth(2).click(); // 2 = Counterplay

    const inhalt = page.locator('#hilfe-inhalt');
    const erwartet = await page.evaluate(async () => {
      const c = await import('/src/shared/config/classes.js');
      const t = await import('/src/shared/terrainGen.js');
      return {
        klassen: c.CLASS_IDS,
        beziehungen: c.classCounterplay(),
        formen: Object.keys(t.TERRAIN_AFFINITY),
      };
    });

    for (const klasse of erwartet.klassen) {
      await expect(inhalt.getByRole('heading', { name: klasse, exact: true })).toBeVisible();
    }

    /*
     * Kernprüfung: Jede „stark gegen"-Aussage in der Anzeige muss durch die
     * abgeleitete Beziehung gedeckt sein. Der Scout hat HEUTE keine — dann darf
     * die Anzeige auch keine nennen.
     */
    const text = await inhalt.evaluate(el => el.textContent);
    for (const klasse of erwartet.klassen) {
      const b = erwartet.beziehungen[klasse];
      if (b.starkGegen) {
        expect(text, `${klasse}: „stark gegen" fehlt in der Anzeige`)
          .toContain(`stark gegen ${b.starkGegen.classId}`);
      }
    }

    // Und der Hinweis, der die Lücken erklärt.
    expect(text).toMatch(/keinen Vorteil|durchgehend die schwächere/);

    // Die Kartenzuordnung muss vollständig sein.
    for (const form of erwartet.formen) {
      expect(text, `${form} fehlt in der Kartenliste`).toContain(form);
    }
  });

  test('Die Anzeige nennt die Kartengunst ausdrücklich als Empfehlung', async ({ page }) => {
    /*
     * Der wichtigste Punkt der Leitentscheidung: Es gibt KEINEN Bonus. Wenn die
     * Anzeige das nicht sagt, würde der Spieler einen Multiplikator erwarten,
     * den es nicht gibt.
     */
    await page.goto('/');
    await page.locator('#hilfe-browser summary').click();
    await page.locator('#hilfe-tabs button').nth(2).click();

    const text = await page.locator('#hilfe-inhalt').evaluate(el => el.textContent);
    expect(text).toMatch(/kein Bonus|ändert keine Werte/);

    /*
     * Und die Gegenprobe zu den WERTEN: Die Beweglichkeit wird seit dem
     * Verdrahten gelesen (Absprung) — die Anzeige darf nicht mehr behaupten,
     * sie sei wirkungslos. Der frühere Test suchte hier „nicht gelesen", weil
     * das damals stimmte; mit der Behebung ist genau diese Aussage falsch
     * geworden.
     */
    expect(text).toMatch(/wirkt auf den Absprung/);
    expect(text, 'die Anzeige behauptet noch, die Beweglichkeit werde nicht gelesen')
      .not.toMatch(/Beweglichkeit.*nicht gelesen/);
  });

  test('Der Kader zeigt je Charakter die Counterplay-Zeile', async ({ page }) => {
    await page.goto('/');
    const kader = page.locator('#roster-browser');
    await kader.locator('summary').click();
    await expect(kader).toHaveAttribute('open', '');

    // Die Zeilen erscheinen erst beim Aufklappen (lazy, wie die ganze Ansicht).
    const cpZeilen = page.locator('#roster-list .r-cp');
    await expect(cpZeilen.first()).toBeVisible();

    const texte = await cpZeilen.allInnerTexts();
    expect(texte.length).toBeGreaterThan(0);

    /*
     * Jede Zeile muss eine der drei Formen haben:
     *  - eine „stark gegen"-Angabe (gedeckt oder nicht)
     *  - eine „schwach gegen"-Angabe
     *  - oder den ausdrücklichen Hinweis, dass es keine Gegenseite gibt.
     *
     * Eine leere Zeile wäre der Fehler: Sie sähe aus wie eine Aussage.
     */
    for (const t of texte) {
      expect(t.length, `leere Counterplay-Zeile`).toBeGreaterThan(5);
      expect(t, `unbrauchbare Zeile: "${t}"`)
        .toMatch(/stark gegen|schwach gegen|keine Klasse mit Vorteil/);
    }

    // Der Scout hat heute keine Gegenseite mit Vorteil — der Grund muss
    // benannt sein statt zu fehlen.
    const scoutZeile = texte.find(t => t.includes('schwach gegen heavy'));
    expect(scoutZeile, 'die Scout-Zeile fehlt').toBeTruthy();
  });

  test('Die Counterplay-Anzeige nennt keine Zahlen', async ({ page }) => {
    // Dieselbe Regel wie überall: Werte stehen in den Balken daneben, nicht im
    // Text — sonst gäbe es eine zweite Quelle, die veralten kann.
    await page.goto('/');
    await page.locator('#hilfe-browser summary').click();
    await page.locator('#hilfe-tabs button').nth(2).click();

    const texte = await page.locator('#hilfe-inhalt .h-liste li').allInnerTexts();
    for (const t of texte) {
      expect(t, `Zeile nennt eine Zahl: "${t}"`).not.toMatch(/\d/);
    }
  });
});
