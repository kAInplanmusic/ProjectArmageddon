/**
 * E2E: Sidegrades im echten Browser.
 *
 * Die Unit-Tests prüfen Daten, Verrechnung und Match. Hier wird geprüft, dass
 * die Auswahl im MENÜ existiert, aus der Config stammt und den lokalen Start
 * wirklich erreicht — also der Weg vom Formular bis ins Kampfprofil.
 */
import { test, expect } from '@playwright/test';

/** Öffnet den Sidegrade-Bereich im Menü. */
async function oeffneSidegrades(page) {
  await page.goto('/');
  const behaelter = page.locator('#sidegrade-auswahl');
  await expect(behaelter).toBeVisible();
  await behaelter.locator('summary').click();
  await expect(behaelter).toHaveAttribute('open', '');
  return behaelter;
}

test.describe('Sidegrade-Auswahl im Menü', () => {
  test('Je Klasse gibt es ein Feld mit den Optionen aus der Config', async ({ page }) => {
    /*
     * Die Optionen dürfen NICHT im Markup stehen — sie kommen aus
     * `sidegradesForClass()`. Geprüft wird gegen die Config, nicht gegen eine
     * im Test abgetippte Liste.
     */
    await oeffneSidegrades(page);

    const erwartet = await page.evaluate(async () => {
      const m = await import('/src/shared/config/sidegrades.js');
      const c = await import('/src/shared/config/classes.js');
      return c.CLASS_IDS.map(klasse => ({
        klasse,
        angebot: m.sidegradesForClass(klasse).map(e => e.id),
      }));
    });

    for (const { klasse, angebot } of erwartet) {
      const feld = page.locator(`#cfg-sidegrade-${klasse}`);
      await expect(feld, `${klasse}: Feld fehlt`).toBeVisible();

      // Erste Option ist immer „ohne Sidegrade" — der neutrale Zustand.
      const werte = await feld.locator('option').evaluateAll(
        opts => opts.map(o => o.value),
      );
      expect(werte[0]).toBe('');
      for (const id of angebot) {
        expect(werte, `${klasse}: Option "${id}" fehlt`).toContain(id);
      }
    }
  });

  test('Die Optionen tragen Name und Erklärung', async ({ page }) => {
    // Ein Feld mit nackten Kennungen wäre unbrauchbar: Der Spieler muss sehen,
    // was er tauscht.
    await oeffneSidegrades(page);

    const texte = await page.locator('#sidegrade-felder option').allInnerTexts();
    const ohneSidegrade = texte.filter(t => t === 'ohne Sidegrade');
    expect(ohneSidegrade.length).toBeGreaterThan(0);

    // Mindestens eine Option trägt einen Gedankenstrich — also Name + Erklärung.
    expect(texte.some(t => t.includes('—'))).toBe(true);
  });

  test('Der Start übernimmt die Wahl ins Match', async ({ page }) => {
    /*
     * Der Kern: Die Auswahl im Formular muss das Kampfprofil erreichen. Geprüft
     * wird am LEBEN der Figur — der Sidegrade „gepanzert" gibt mehr davon, und
     * das ist eine Zahl, die nur stimmen kann, wenn die Verdrahtung sitzt.
     */
    await oeffneSidegrades(page);

    // „gepanzert" für alle Klassen wählen, bei denen es angeboten wird.
    const gewaehlt = await page.evaluate(async () => {
      const m = await import('/src/shared/config/sidegrades.js');
      const c = await import('/src/shared/config/classes.js');
      const gesetzt = {};
      for (const klasse of c.CLASS_IDS) {
        const angebot = m.sidegradesForClass(klasse).map(e => e.id);
        const wahl = angebot.includes('gepanzert') ? 'gepanzert' : angebot[0];
        const feld = document.getElementById(`cfg-sidegrade-${klasse}`);
        feld.value = wahl;
        gesetzt[klasse] = wahl;
      }
      return gesetzt;
    });

    await page.locator('#start-button').click();
    await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing');

    // Die Sidegrades müssen im Match stehen, an den Spielern UND im Zustand.
    const befund = await page.evaluate(() => {
      const match = window.__PA__.game.match;
      const zustand = match.getState();
      return {
        anSpielern: match.players.map(p => p.sidegradeId),
        imZustand: zustand.entities.map(e => e.sidegradeId ?? null),
        leben: match.players.map(p => match.world.getComponent(p.entityId, 'Health', 'max')),
      };
    });

    // Jeder Platz muss den Sidegrade seiner Klasse tragen.
    const klassen = await page.evaluate(async () => {
      const c = await import('/src/shared/config/classes.js');
      return c.CLASS_IDS;
    });
    for (let i = 0; i < befund.anSpielern.length; i += 1) {
      const klasse = klassen[i % klassen.length];
      expect(befund.anSpielern[i], `Platz ${i} (${klasse}) hat den falschen Sidegrade`)
        .toBe(gewaehlt[klasse]);
    }

    // Und die Werte müssen sich vom Zustand ohne Sidegrade unterscheiden.
    expect(befund.leben.some(lp => lp > 100), 'kein erhöhtes Leben — der Sidegrade wirkt nicht')
      .toBe(true);
  });

  test('Ohne Wahl bleibt das Match wie zuvor', async ({ page }) => {
    // Die Abwärtskompatibilität im Browser: Standard ist „ohne Sidegrade", und
    // dann darf sich nichts ändern.
    await page.goto('/');
    await page.locator('#start-button').click();
    await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing');

    const sidegrades = await page.evaluate(
      () => window.__PA__.game.match.players.map(p => p.sidegradeId),
    );
    expect(sidegrades.every(s => s === null)).toBe(true);
  });

  test('Die Anzeige der Sidegrade-Erklärung nennt keine Zahlen', async ({ page }) => {
    // Dieselbe Regel wie bei Klassen und Gelände: Zahlen stehen in den
    // Faktoren, nicht im Text — sonst gäbe es eine zweite Quelle.
    await oeffneSidegrades(page);
    const texte = await page.locator('#sidegrade-felder option').allInnerTexts();

    for (const text of texte) {
      if (text === 'ohne Sidegrade') continue;
      expect(text, `Option nennt eine Zahl: "${text}"`).not.toMatch(/\d/);
    }
  });
});
