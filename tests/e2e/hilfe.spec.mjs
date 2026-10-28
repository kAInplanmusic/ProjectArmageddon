/**
 * E2E: Der Hilfe-Bereich im echten Browser.
 *
 * Die Unit-Tests (`tests/onboarding-hilfe.test.js`) prüfen die ABLEITUNG. Hier
 * wird geprüft, dass die Anzeige daraus wirklich etwas macht: dass die Reiter
 * erscheinen, dass Inhalte gezeichnet werden und dass die Werte in der Anzeige
 * mit den Configs übereinstimmen.
 *
 * Der letzte Punkt ist der wichtigste. Eine Übersicht, die einen veralteten
 * Zahlenwert zeigt, wäre schlimmer als keine: Sie würde für eine geprüfte
 * Aussage gehalten.
 */
import { test, expect } from '@playwright/test';

/**
 * Öffnet den Hilfe-Bereich im Menü.
 *
 * `details`-Elemente zeichnen erst beim Aufklappen (`toggle`-Listener). Ohne
 * das Öffnen bliebe der Inhalt leer — und ein Test, der das nicht tut, würde
 * eine leere Anzeige für ein Ergebnis halten.
 */
async function oeffneHilfe(page) {
  await page.goto('/');
  const behaelter = page.locator('#hilfe-browser');
  await expect(behaelter).toBeVisible();
  await behaelter.locator('summary').click();
  await expect(behaelter).toHaveAttribute('open', '');
  return behaelter;
}

test.describe('Hilfe-Bereich', () => {
  test('Die Reiter erscheinen und der erste ist ausgewählt', async ({ page }) => {
    await oeffneHilfe(page);

    const reiter = page.locator('#hilfe-tabs button');
    // Acht Themen: Klassen, Sidegrades, Counterplay, Loot, Karte, Ton, Günther und Cookie, Schaden und Wirkungen. Aus der
    // Anzeige gelesen, nicht aus dem Code — ein Test gegen die eigene Konstante
    // würde nichts belegen.
    await expect(reiter).toHaveCount(8);
    await expect(reiter.nth(0)).toHaveText(/Klassen/);
    await expect(reiter.nth(1)).toHaveText(/Sidegrades/);
    await expect(reiter.nth(2)).toHaveText(/Counterplay/);
    await expect(reiter.nth(3)).toHaveText(/Loot/);
    await expect(reiter.nth(4)).toHaveText(/Karte/);
    await expect(reiter.nth(5)).toHaveText(/Ton und Musik/);
    await expect(reiter.nth(6)).toHaveText(/Günther und Cookie/);
    await expect(reiter.nth(7)).toHaveText(/Schaden und Wirkungen/);

    // Der erste Reiter ist ausgewählt (aria-selected, wie in der Kader-Ansicht).
    await expect(reiter.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(reiter.nth(1)).toHaveAttribute('aria-selected', 'false');
  });

  test('Der Klassen-Reiter zeigt die wirksamen Zahlen aus der Config', async ({ page }) => {
    await oeffneHilfe(page);

    /*
     * Die angezeigten Werte werden gegen die CONFIG geprüft, nicht gegen eine
     * im Test abgetippte Zahl. Nur so ist belegt, dass die Anzeige aus der
     * einen Quelle stammt — eine zweite Liste hier würde genau den Fehler
     * nachbauen, den der Entwurf vermeiden will.
     */
    const erwartet = await page.evaluate(async () => {
      const m = await import('/src/shared/config/classes.js');
      return m.uebersichtFuerHilfe();
    });

    const angezeigt = page.locator('#hilfe-inhalt');
    for (const klasse of erwartet.klassen) {
      // Der Name der Klasse muss als Überschrift erscheinen.
      await expect(angezeigt.getByRole('heading', { name: klasse.label, exact: true }))
        .toBeVisible();
      // Und der Erklärungssatz aus der Config.
      await expect(angezeigt.getByText(klasse.erklaerung, { exact: true })).toBeVisible();
      // Und der Zahlenwert, formatiert wie im Client (zwei Nachkommastellen).
      await expect(angezeigt.getByText(klasse.wirksam.leben.toFixed(2), { exact: true }).first())
        .toBeVisible();
    }
  });

  test('Das Startaufgebot erscheint mit Rolle und konkreter Waffe', async ({ page }) => {
    /*
     * Der Onboarding-Nutzen an dieser Stelle: Das Startaufgebot einer Klasse war
     * im Menü NIRGENDS zu sehen.
     *
     * Was hier NICHT geprüft wird: der `reason`-Text. Der Entwurf nannte ihn eine
     * „Begründung", nachgemessen ist er aber maschinell zusammengesetzt
     * („Rolle Flächenwirkung — Wahl der Klasse scout") und wiederholt nur
     * `roleLabel` und den Klassennamen. Die Anzeige zeigt deshalb Rolle + Waffe;
     * dieser Test prüft genau das.
     */
    await oeffneHilfe(page);

    const erwartet = await page.evaluate(async () => {
      const laden = await import('/src/shared/config/loadouts.js');
      const katalog = await import('/src/shared/config/weapons.js');
      return laden.getClassLoadoutDetail('scout').map(platz => ({
        roleLabel: platz.roleLabel,
        anzeigeName: katalog.getWeapon(platz.weaponId)?.displayName ?? platz.weaponId,
      }));
    });

    expect(erwartet.length).toBeGreaterThan(0);
    const angezeigt = page.locator('#hilfe-inhalt');
    for (const platz of erwartet) {
      // Die Rolle muss stehen …
      await expect(angezeigt.getByText(platz.roleLabel, { exact: false }).first()).toBeVisible();
      // … und die Waffe dazu, nicht ein zusammengesetzter Satz.
      await expect(angezeigt.getByText(platz.anzeigeName, { exact: false }).first()).toBeVisible();
    }

    // Gegenprobe: Der redundante Satz darf NICHT in der Anzeige stehen.
    const text = await angezeigt.innerText();
    expect(text, 'Der maschinell zusammengesetzte reason-Text wird angezeigt — '
      + 'er wiederholt nur die Rolle').not.toMatch(/Wahl der Klasse/);
    expect(text).not.toMatch(/Kür der Klasse/);
  });

  test('Die Archetypen zeigen TEMPO, nicht Schaden', async ({ page }) => {
    /*
     * Fund aus dem Codeaudit: `archetype.launch` (früher `damage`) geht als Tempo-Faktor in die
     * Abschussgeschwindigkeit ein und wird NICHT als Schaden angewandt. Eine
     * Übersicht mit der Zeile „Schaden" beim Archetyp wäre glatt falsch.
     *
     * Der Abschnitt wird STRUKTURELL abgegrenzt, nicht per Textsuche: Der
     * Einleitungstext nennt das Wort „Archetypen" selbst („Drei Klassen und drei
     * Archetypen bestimmen…"), ein `indexOf` schnitte also an der falschen
     * Stelle. Die Archetyp-Karten tragen `.h-schmal` und folgen der Überschrift;
     * sie werden hier direkt adressiert.
     */
    await oeffneHilfe(page);

    // Die Archetyp-Karten sind die schmalen Karten nach der Überschrift
    // „Archetypen". Jede zeigt genau zwei Wertzeilen.
    const archetypKarten = page.locator('#hilfe-inhalt h3:text-is("Archetypen") ~ .h-karten .h-karte');
    await expect(archetypKarten).toHaveCount(3);

    const labels = await archetypKarten.locator('.h-wert-label').allInnerTexts();
    expect(labels).toContain('Tempo');
    expect(labels).toContain('Leben');
    // Und ausdrücklich NICHT „Schaden" — das ist die Aussage dieses Tests.
    expect(labels, 'Ein Archetyp zeigt „Schaden" — laut combatProfile wirkt er '
      + 'aber nur auf das Tempo').not.toContain('Schaden');
  });

  test('Die Kopplung und die wirkungslosen Werte werden genannt', async ({ page }) => {
    /*
     * Beide Hinweise verlangt der Entwurf ausdrücklich:
     *  - Die Übersicht zeigt neun Kombinationen, im Match sind drei erreichbar.
     *    Ohne Hinweis wäre sie irreführend.
     *  - drag/mass/Tempo liest der Motor nicht. Ohne Hinweis sähen sie wie
     *    Spielwerte aus.
     */
    await oeffneHilfe(page);

    const hinweis = page.locator('#hilfe-inhalt .h-hinweis');
    await expect(hinweis).toBeVisible();
    const text = await hinweis.innerText();
    expect(text).toMatch(/drei der neun|drei von neun/i);
    expect(text).toMatch(/drag/);
  });

  test('Der Sidegrade-Reiter zeigt je Klasse die Angebote aus der Config', async ({ page }) => {
    /*
     * Die Hilfe muss die Sidegrades erklären — sie sind Teil des Onboardings.
     * Geprüft wird gegen die Config, damit eine Änderung an den Sidegrades nicht
     * unbemerkt an der Anzeige vorbeigeht.
     */
    await oeffneHilfe(page);
    await page.locator('#hilfe-tabs button').nth(1).click();

    const erwartet = await page.evaluate(async () => {
      const m = await import('/src/shared/config/sidegrades.js');
      const c = await import('/src/shared/config/classes.js');
      return c.CLASS_IDS.map(klasse => ({
        klasse,
        labels: m.sidegradesForClass(klasse).map(e => e.label),
      }));
    });

    const inhalt = page.locator('#hilfe-inhalt');
    for (const { klasse, labels } of erwartet) {
      await expect(inhalt.getByRole('heading', { name: klasse, exact: true })).toBeVisible();
      for (const label of labels) {
        /*
         * `.first()` ist nötig, weil dasselbe Sidegrade bei MEHREREN Klassen
         * angeboten werden darf (`praezision` steht bei scout und artillery).
         * Playwright zählt sonst im Strict-Mode zwei Treffer als Fehler — das
         * wäre ein Fehlschlag über ein richtiges Verhalten.
         */
        await expect(inhalt.getByText(label, { exact: true }).first()).toBeVisible();
      }
    }

    // Die Richtung muss erkennbar sein: Ein Trade-off hat Vor- UND Nachteile.
    const text = await inhalt.evaluate(el => el.textContent);
    expect(text).toMatch(/\+.*Leben|−.*Leben/);
    expect(text).toMatch(/Untergrenze/);
  });

  test('Der Loot-Reiter zeigt die Verteilung und die Loot-Grenze', async ({ page }) => {
    await oeffneHilfe(page);
    // Index 3 = Loot (0 Klassen, 1 Sidegrades, 2 Counterplay, 3 Loot, 4 Karte).
    await page.locator('#hilfe-tabs button').nth(3).click();

    const inhalt = page.locator('#hilfe-inhalt');
    await expect(inhalt.getByText(/Kisten je Rundenbeginn/)).toBeVisible();
    await expect(inhalt.getByText(/Seltenheiten/)).toBeVisible();

    /*
     * Die Loot-Grenze ist die zentrale Balance-Aussage: Startwaffen sind nur
     * common/uncommon/rare, episch und legendär gibt es nur über Kisten. Sie
     * stand bisher nirgends im Menü.
     */
    const text = await inhalt.innerText();
    expect(text).toMatch(/Startwaffen/);
    expect(text).toMatch(/common/);
    expect(text).toMatch(/Epische|legend/i);

    // Die Prozente müssen aus der Config stammen: 85 % eine Kiste.
    const config = await page.evaluate(async () => {
      const m = await import('/src/shared/config/loot.js');
      return m.LOOT_DROP_RULES.cratesPerRoundStart.one;
    });
    expect(text).toContain(`${Math.round(config * 100)} %`);
  });

  test('Der Karten-Reiter zeigt alle acht Geländeformen', async ({ page }) => {
    await oeffneHilfe(page);
    // Index 4 = Karte.
    await page.locator('#hilfe-tabs button').nth(4).click();

    const erwartet = await page.evaluate(async () => {
      const m = await import('/src/shared/terrainGen.js');
      return Object.keys(m.TERRAIN_PRESETS);
    });
    expect(erwartet.length).toBe(8);

    const inhalt = page.locator('#hilfe-inhalt');
    for (const form of erwartet) {
      await expect(inhalt.getByRole('heading', { name: form, exact: true })).toBeVisible();
    }
  });

  test('Der Karten-Reiter zeigt die Zerstörungstabelle aus der Config und die Feuerregeln', async ({ page }) => {
    await oeffneHilfe(page);
    await page.locator('#hilfe-tabs button').nth(4).click();
    const tabelle = page.locator('#hilfe-inhalt table.h-zerstoerung');
    await expect(tabelle).toBeVisible();

    const erwartet = await page.evaluate(async () => {
      const m = await import('/src/shared/zerstoerungsTabelle.js');
      const zeile = m.zerstoerungsTabelle().find(z => z.key === 'schnee');
      return { stoffe: m.zerstoerungsTabelle().length, schneeHitze: Math.round(zeile.spalten.find(s => s.gruppe === 'hitze').faktor * 100) };
    });
    await expect(tabelle.locator('tr[data-stoff]')).toHaveCount(erwartet.stoffe);
    await expect(tabelle.locator('tr[data-stoff="schnee"] td').nth(2)).toContainText(`${erwartet.schneeHitze} %`);
    await expect(tabelle.locator('tr[data-stoff="metall"] td.h-z-haelt').first()).toHaveText('hält');
    await expect(page.locator('#hilfe-inhalt').getByRole('heading', { name: 'Feuer, Lava und Ragnarök' })).toBeVisible();
  });

  test('Das Umschalten der Reiter wechselt den Inhalt', async ({ page }) => {
    // Ohne diese Prüfung könnte der Reiterwechsel wirkungslos sein, und alle
    // Tests oben hätten trotzdem den ersten Reiter gesehen.
    //
    // Verglichen wird über `textContent`, NICHT über `innerText`: `innerText`
    // fügt beim Umbruch weiche Trennzeichen ein (gemessen: „·"), die vom
    // Layout abhängen. Ein Vergleich zweier `innerText`-Werte scheitert damit an
    // der Formatierung statt am Inhalt — genau das ist im ersten Anlauf
    // passiert. `textContent` liefert den reinen Text ohne Layout-Einfluss.
    await oeffneHilfe(page);
    const inhalt = page.locator('#hilfe-inhalt');
    const lies = () => inhalt.evaluate(el => el.textContent);

    const klassen = await lies();
    expect(klassen).toMatch(/Leben/);
    expect(klassen).toMatch(/Schaden/);

    // 1 = Sidegrades
    await page.locator('#hilfe-tabs button').nth(1).click();
    const sidegrades = await lies();
    expect(sidegrades).not.toBe(klassen);
    expect(sidegrades).toMatch(/Kompakter Verschluss|Zusatzpanzerung/);

    // 2 = Counterplay
    await page.locator('#hilfe-tabs button').nth(2).click();
    const counterplay = await lies();
    expect(counterplay).not.toBe(sidegrades);
    expect(counterplay).toMatch(/Welche Karte begünstigt wen/);

    // 3 = Loot
    await page.locator('#hilfe-tabs button').nth(3).click();
    const loot = await lies();
    expect(loot).not.toBe(counterplay);
    expect(loot).toMatch(/Seltenheiten/);

    // 4 = Karte
    await page.locator('#hilfe-tabs button').nth(4).click();
    const karte = await lies();
    expect(karte).not.toBe(loot);
    expect(karte).toMatch(/Geländeform|Höhen/);

    // Und zurück: Der erste Reiter zeigt wieder die Klassen — geprüft am
    // INHALT (die Klasse „scout" und ihre Werte), nicht an der Gleichheit
    // zweier Textblöcke.
    await page.locator('#hilfe-tabs button').nth(0).click();
    const zurueck = await lies();
    expect(zurueck).toMatch(/Startaufgebot/);
    expect(zurueck).toMatch(/Archetypen/);
    expect(zurueck).not.toBe(karte);
  });

  test('Der Reiter Schaden und Wirkungen nennt Arten, Mali und Wirkungen auf Deutsch, ohne Zahlen', async ({ page }) => {
    /*
     * Die Texte stammen aus `wirkungstexte.js`; geprüft wird, was die ANZEIGE zeigt: Jede Schadensart des
     * Motors (ohne den stillgelegten Alias) steht genau einmal da, jeder Malus mit seinem Namen, und kein
     * englischer Schlüssel taucht als Text auf.
     */
    const behaelter = await oeffneHilfe(page);
    await behaelter.locator('#hilfe-tabs button', { hasText: 'Schaden und Wirkungen' }).click();
    const inhalt = page.locator('#hilfe-inhalt');

    const erwartet = await page.evaluate(async () => {
      const dt = await import('/src/engine/damageTypes.js');
      const sc = await import('/src/shared/config/schaden.js');
      return {
        arten: dt.DAMAGE_TYPE_IDS.filter(a => !dt.DAMAGE_TYPE_ALIASES[a]),
        mali: Object.entries(sc.MALUS).map(([k, m]) => [k, m.label]),
      };
    });
    await expect(inhalt.locator('[data-art]')).toHaveCount(erwartet.arten.length);
    for (const art of erwartet.arten) await expect(inhalt.locator(`[data-art="${art}"]`)).toHaveCount(1);
    for (const [schluessel, label] of erwartet.mali) await expect(inhalt.locator(`[data-malus="${schluessel}"] h3`)).toContainText(label);
    await expect(inhalt.locator('[data-art="fire"]')).toContainText('Feuer: ');
    await expect(inhalt.locator('[data-wirkung="turret"]')).toContainText('Geschütz');

    const saetze = await inhalt.locator('.h-erklaerung').allInnerTexts();
    expect(saetze.length).toBeGreaterThan(20);
    for (const satz of saetze) expect(satz, `Zahl im Erklärtext: "${satz}"`).not.toMatch(/\d/);
    const text = await inhalt.innerText();
    expect(text).not.toMatch(/damage_boost|damage_over_time|water_push|\bphysical\b/);
  });

  test('Keine Zahlen im Erklärungstext der Anzeige', async ({ page }) => {
    /*
     * Die Erklärungssätze dürfen keine Spielwerte nennen — sonst gäbe es eine
     * zweite Quelle, die bei einer Balance-Änderung mitwandern müsste. Hier
     * wird es an der GERENDERTEN Anzeige geprüft, nicht an den Daten.
     */
    await oeffneHilfe(page);
    const saetze = await page.locator('#hilfe-inhalt .h-erklaerung').allInnerTexts();

    expect(saetze.length).toBeGreaterThan(0);
    for (const satz of saetze) {
      expect(satz, `Der Erklärungstext nennt eine Zahl: "${satz}"`).not.toMatch(/\d/);
    }
  });
});
