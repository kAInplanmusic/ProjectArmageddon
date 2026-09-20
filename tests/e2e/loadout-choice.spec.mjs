/**
 * E2E: Klassenwahl je Spielerplatz im Menü.
 *
 * Die Unit-Tests prüfen Auflösung, Match-Wirkung und Replay. Hier wird geprüft,
 * dass die Auswahl im Browser existiert, aus den Configs stammt und den Start
 * wirklich erreicht.
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
  test('Je Spielerplatz gibt es Felder für Klasse und Archetyp', async ({ page }) => {
    /*
     * Die Zahl der Felder folgt „Teams" × „Spieler pro Team". Bei der Vorgabe
     * (2 × 2) sind es vier Plätze.
     */
    await oeffneLoadouts(page);

    for (let i = 0; i < 4; i += 1) {
      await expect(page.locator(`#cfg-loadout-klasse-${i}`), `Platz ${i}: Klassenfeld fehlt`)
        .toBeVisible();
      await expect(page.locator(`#cfg-loadout-archetyp-${i}`), `Platz ${i}: Archetypfeld fehlt`)
        .toBeVisible();
    }

    // Die Optionen stammen aus den Configs, nicht aus dem Markup.
    const erwartet = await page.evaluate(async () => {
      const m = await import('/src/shared/config/classes.js');
      return { klassen: [...m.CLASS_IDS], archetypen: [...m.ARCHETYPE_IDS] };
    });

    const klassenWerte = await page.locator('#cfg-loadout-klasse-0 option')
      .evaluateAll(opts => opts.map(o => o.value));
    const archetypWerte = await page.locator('#cfg-loadout-archetyp-0 option')
      .evaluateAll(opts => opts.map(o => o.value));

    // Der erste Eintrag ist leer = automatisch (die alte Regel).
    expect(klassenWerte[0]).toBe('');
    expect(archetypWerte[0]).toBe('');
    for (const k of erwartet.klassen) expect(klassenWerte).toContain(k);
    for (const a of erwartet.archetypen) expect(archetypWerte).toContain(a);
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
    // Ohne Wahl gilt die alte Regel — das Label zeigt sie, damit man sieht,
    // was man ändert.
    await oeffneLoadouts(page);

    const erwartet = await page.evaluate(async () => {
      const m = await import('/src/shared/config/classes.js');
      return [0, 1, 2, 3].map(i => {
        const r = m.resolveLoadout(i);
        return `${r.classId}/${r.archetypeId}`;
      });
    });

    const labels = await page.locator('#loadout-felder label').allInnerTexts();
    for (const [i, kombi] of erwartet.entries()) {
      /*
       * Beide Seiten kleinschreiben: `innerText` liefert den Text WIE
       * GERENDERT, und das Menü schreibt Labels per CSS in Großbuchstaben
       * („PLATZ 1 (SCOUT/BRAWLER)"). Ein direkter Vergleich gegen die
       * Config-Werte würde an der Darstellung scheitern statt am Inhalt.
       */
      expect(labels[i].toLowerCase(), `Platz ${i + 1}: Vorgabe fehlt`)
        .toContain(kombi.toLowerCase());
    }
  });

  test('Eine gewählte Kombination erreicht das Match', async ({ page }) => {
    /*
     * Der Kern: Was im Menü steht, muss im laufenden Match ankommen — und zwar
     * als PROFILE, nicht nur als Eintrag. Geprüft wird am LEBEN, weil das eine
     * Zahl ist, die nur stimmen kann, wenn die Verdrahtung sitzt.
     */
    await oeffneLoadouts(page);

    // Platz 1 auf artillery/artillerist — vorher unmöglich.
    await page.selectOption('#cfg-loadout-klasse-0', 'artillery');
    await page.selectOption('#cfg-loadout-archetyp-0', 'artillerist');

    await page.locator('#start-button').click();
    await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing');

    const befund = await page.evaluate(async () => {
      const m = await import('/src/shared/config/classes.js');
      const match = window.__PA__.game.match;
      return {
        plaetze: match.players.map(p => ({
          klasse: m.CLASS_IDS[p.classId],
          archetyp: m.ARCHETYPE_IDS[p.archetypeId],
          hp: match.world.getComponent(p.entityId, 'Health', 'max'),
        })),
      };
    });

    expect(befund.plaetze[0].klasse).toBe('artillery');
    expect(befund.plaetze[0].archetyp).toBe('artillerist');

    // Und das Leben muss dem entkoppelten Profil entsprechen, nicht dem der
    // Standardzuteilung (artillery/occultist hätte weniger Leben).
    const erwartet = await page.evaluate(async () => {
      const m = await import('/src/shared/config/classes.js');
      return Math.round(100 * m.combatProfile('artillery', 'artillerist').healthMultiplier);
    });
    expect(befund.plaetze[0].hp).toBe(erwartet);
  });

  test('Ohne Wahl bleibt die Standardzuteilung', async ({ page }) => {
    // Die Abwärtskompatibilität im Browser: Wer nichts wählt, bekommt das
    // Spiel von vorher.
    await page.goto('/');
    await page.locator('#start-button').click();
    await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing');

    const plaetze = await page.evaluate(async () => {
      const m = await import('/src/shared/config/classes.js');
      const match = window.__PA__.game.match;
      return match.players.map(p => `${m.CLASS_IDS[p.classId]}/${m.ARCHETYPE_IDS[p.archetypeId]}`);
    });

    expect(plaetze.slice(0, 3)).toEqual([
      'scout/brawler', 'heavy/artillerist', 'artillery/occultist',
    ]);
  });
});
