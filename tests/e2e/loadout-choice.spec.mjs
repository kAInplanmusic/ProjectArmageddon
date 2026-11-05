/**
 * E2E: Klassenwahl je Spielerplatz im Menü.
 *
 * Seit Klassenfassung 3 (`docs/anforderungen-2026-11-05.md` §6) gibt es drei
 * Klassen und KEINE Archetyp-Auswahl mehr. Geprüft wird, dass nur die drei
 * Klassen angeboten werden, aus den Configs stammen und den Start erreichen.
 */
import { test, expect } from '@playwright/test';

/** Öffnet den Loadout-Bereich im Menü. */
async function oeffneLoadouts(page) {
  await page.goto('/');
  const behaelter = page.locator('#loadout-auswahl');
  await expect(behaelter).toBeVisible();
  await behaelter.locator('summary').click();
  await expect(behaelter).toHaveAttribute('open', '');
  return behaelter;
}

test.describe('Klassenwahl im Menü', () => {
  test('Je Spielerplatz gibt es ein Klassenfeld — und kein Archetypfeld', async ({ page }) => {
    /*
     * Die Zahl der Felder folgt „Teams" × „Spieler pro Team". Bei der Vorgabe
     * (2 × 3) sind es sechs Plätze.
     */
    await oeffneLoadouts(page);

    for (let i = 0; i < 6; i += 1) {
      await expect(page.locator(`#cfg-loadout-klasse-${i}`), `Platz ${i}: Klassenfeld fehlt`)
        .toBeVisible();
      await expect(page.locator(`#cfg-loadout-archetyp-${i}`), `Platz ${i}: Archetypfeld darf es nicht geben`)
        .toHaveCount(0);
    }

    // Die Optionen stammen aus den Configs, nicht aus dem Markup.
    const erwartet = await page.evaluate(async () => {
      const m = await import('/src/shared/config/classes.js');
      return [...m.CLASS_IDS];
    });
    expect(erwartet).toEqual(['nahkampf', 'fernkampf', 'okkultist']);

    const klassenWerte = await page.locator('#cfg-loadout-klasse-0 option')
      .evaluateAll(opts => opts.map(o => o.value));

    // Der erste Eintrag ist leer = automatisch.
    expect(klassenWerte[0]).toBe('');
    for (const k of erwartet) expect(klassenWerte).toContain(k);
    expect(klassenWerte.length, 'nur die drei Klassen plus „automatisch"').toBe(4);
  });

  test('Die Felder richten sich nach Teams und Einheiten je Spieler', async ({ page }) => {
    /*
     * Ändert man die Teamzahl oder die Einheiten je Spieler, muss die Liste neu
     * aufgebaut werden — sonst stünden dort Felder für Plätze, die es nicht mehr
     * gibt.
     */
    await oeffneLoadouts(page);

    const zaehleFelder = () => page.locator('#loadout-felder select[id^="cfg-loadout-klasse-"]').count();
    // Vorgabe: 2 Teams × 3 Einheiten = 6 Plätze (Matchart „klein").
    expect(await zaehleFelder()).toBe(6);

    // 3 Teams × 3 Einheiten = 9 Plätze
    await page.selectOption('#cfg-teams', '3');
    await page.selectOption('#cfg-players', '3');
    await expect.poll(zaehleFelder, { timeout: 3000 }).toBe(9);

    // 4 Teams × 4 Einheiten = 16 Plätze (Matchart „groß")
    await page.selectOption('#cfg-teams', '4');
    await page.selectOption('#cfg-players', '4');
    await expect.poll(zaehleFelder, { timeout: 3000 }).toBe(16);
  });

  test('Das Label nennt die Standardzuteilung des Platzes', async ({ page }) => {
    await oeffneLoadouts(page);

    const erwartet = await page.evaluate(async () => {
      const m = await import('/src/shared/config/classes.js');
      return [0, 1, 2, 3, 4, 5].map(i => m.resolveLoadout(i).classId);
    });

    const labels = await page.locator('#loadout-felder label').allInnerTexts();
    for (const [i, klasse] of erwartet.entries()) {
      /*
       * Beide Seiten kleinschreiben: `innerText` liefert den Text WIE
       * GERENDERT, und das Menü schreibt Labels per CSS in Großbuchstaben.
       */
      expect(labels[i].toLowerCase(), `Platz ${i + 1}: Vorgabe fehlt`)
        .toContain(klasse.toLowerCase());
    }
  });

  test('Eine gewählte Klasse erreicht das Match', async ({ page }) => {
    /*
     * Der Kern: Was im Menü steht, muss im laufenden Match ankommen — und zwar
     * als PROFIL, nicht nur als Eintrag. Geprüft wird am LEBEN.
     */
    await oeffneLoadouts(page);
    await page.selectOption('#cfg-loadout-klasse-0', 'okkultist');

    await page.locator('#start-button').click();
    await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing', { timeout: 20_000 });

    const befund = await page.evaluate(async () => {
      const m = await import('/src/shared/config/classes.js');
      const match = window.__PA__.game.match;
      return {
        plaetze: match.players.map(p => ({
          klasse: m.CLASS_IDS[p.classId],
          archetyp: p.archetypeId,
          hp: match.world.getComponent(p.entityId, 'Health', 'max'),
        })),
      };
    });

    expect(befund.plaetze[0].klasse).toBe('okkultist');
    expect(befund.plaetze[0].archetyp).toBe(0);

    const erwartet = await page.evaluate(async () => {
      const m = await import('/src/shared/config/classes.js');
      const { KLASSEN_STANDARD } = await import('/src/shared/config/klassen-fassung.js');
      return Math.round(100 * m.combatProfile('okkultist', null, null, KLASSEN_STANDARD).healthMultiplier);
    });
    expect(befund.plaetze[0].hp).toBe(erwartet);
  });

  test('Ohne Wahl gilt die Klassenreihenfolge', async ({ page }) => {
    // Fassung 3 ist der Standard: nahkampf, fernkampf, okkultist.
    await page.goto('/');
    await page.locator('#start-button').click();
    await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing', { timeout: 20_000 });

    const plaetze = await page.evaluate(async () => {
      const m = await import('/src/shared/config/classes.js');
      const match = window.__PA__.game.match;
      return match.players.map(p => m.CLASS_IDS[p.classId]);
    });

    expect(plaetze.slice(0, 3)).toEqual(['nahkampf', 'fernkampf', 'okkultist']);
  });
});
