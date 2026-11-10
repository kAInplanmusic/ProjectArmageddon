/**
 * E2E: Der Erstkontakt — was ein neuer Spieler ohne Vorwissen sieht und tun kann.
 *
 * ## Abgrenzung zu UX-10
 *
 * UX-10 (neue Onboarding-Führung, Tutorial-Strecke, erzwungene erste Schritte)
 * ist eine offene Content-/Designfrage des Auftraggebers. Diese Spezifikation
 * baut sie NICHT eigenmächtig. Sie hält fest, was der Erstkontakt heute
 * leisten muss, damit die vorhandene Führung nicht unbemerkt verfällt:
 *
 *  1. Noch vor der Einrichtung stehen Spielziel und Steuerung sichtbar im Menü
 *     (die Entscheidung aus UX-1: Tastenliste vor den details-Blöcken).
 *  2. Der Weg ist ohne Maus vollständig begehbar: Sprunglink → Menüfelder →
 *     Hilfe → Matchstart.
 *  3. Die Hilfe ist die vorhandene Onboarding-Fläche: Klassen, Startaufgebot,
 *     Sidegrades und Counterplay werden aus den Configs erklärt, nicht aus
 *     einer zweiten Textquelle.
 *
 * Ein frischer Browserkontext hat keinen gespeicherten Stand — das ist der
 * Erstkontakt, nicht der wiederkehrende Spieler.
 */
import { test, expect } from '@playwright/test';

/** Öffnet die Startseite und wartet auf die laufende Anwendung. */
async function oeffneStartseite(page) {
  const fehler = [];
  page.on('pageerror', error => fehler.push(String(error)));
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__?.game), { timeout: 20_000 });
  await page.evaluate(() => window.__PA__.setAutoLoop(false));
  return fehler;
}

test('Erstkontakt: Spielziel und Steuerung stehen vor der Einrichtung', async ({ page }) => {
  const fehler = await oeffneStartseite(page);

  const menue = page.locator('#menu-overlay');
  await expect(menue).toBeVisible();
  await expect(menue).toHaveAttribute('role', 'dialog');
  await expect(menue).toHaveAttribute('aria-modal', 'true');

  // Das Ziel des Spiels steht im Untertitel — nicht nur im Handbuch.
  await expect(menue.locator('.subtitle')).toContainText('Artillerie');

  /*
   * Die Steuerung ist der eigentliche Erstkontakt: Wer nicht weiß, dass
   * Leertaste lädt und Loslassen feuert, kommt nicht ins Spiel. Sie muss
   * sichtbar sein und VOR den aufklappbaren Blöcken stehen (UX-1).
   */
  const keymap = menue.locator('.keymap');
  await expect(keymap).toBeVisible();
  const tasten = keymap.locator('span');
  expect(await tasten.count(), 'Die Tastenliste muss den Erstkontakt tragen').toBeGreaterThanOrEqual(10);
  const keymapText = await keymap.innerText();
  for (const eintrag of ['Maus', 'Leertaste', 'A / D', 'W / S', 'Enter', 'Waffe']) {
    expect(keymapText, `Steuerungshinweis fehlt: ${eintrag}`).toContain(eintrag);
  }

  const reihenfolge = await page.evaluate(() => {
    const liste = document.querySelector('#menu-overlay .keymap');
    const konfig = document.querySelector('#menu-overlay .menu-konfig');
    // DOCUMENT_POSITION_FOLLOWING = 4: konfig kommt NACH der Tastenliste.
    return Boolean(liste.compareDocumentPosition(konfig) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(reihenfolge, 'Die Steuerung muss vor „Spiel einrichten“ stehen').toBe(true);

  // Der Standardweg ist sofort sichtbar: keine erweiterte Einstellung nötig.
  await expect(page.locator('#start-button')).toBeVisible();
  await expect(page.locator('#start-button')).toContainText(/Match starten/i);
  await expect(page.locator('#cfg-teams')).toHaveValue('2');
  await expect(page.locator('#cfg-players')).toHaveValue('3');
  await expect(page.locator('#cfg-seed')).toHaveValue('');
  // Ohne gespeicherte Sitzung gibt es nichts fortzusetzen.
  await expect(page.locator('#resume-button')).toBeHidden();

  // Das Spiel dahinter ist im Erstkontakt nicht bedienbar.
  expect(await page.evaluate(() => ({
    canvas: document.getElementById('game-canvas').inert,
    hud: document.getElementById('hud').inert,
  }))).toEqual({ canvas: true, hud: true });

  expect(fehler).toEqual([]);
});

/*
 * FUND (MERGE-2, 2026-11-10): Seit UI-Rest A6 (070b4ae) überschrieb ein stehengebliebenes `grid-column: 1 / -1`
 * den Bereich `keymap`; die Tastenliste spannte über beide Spalten und lag über „Match starten“ und der
 * Konfiguration (1440×900 ebenso wie Telefon quer 915×412). Geprüft wird, dass sich die Kästen nicht schneiden und
 * an der Mitte von „Match starten“ der Knopf selbst oben liegt.
 */
for (const [breite, hoehe] of [[1440, 900], [1024, 768], [915, 412], [844, 390]]) {
  test(`Erstkontakt ${breite}×${hoehe}: Tastenliste überdeckt weder Einrichtung noch Startknopf`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: hoehe });
    const fehler = await oeffneStartseite(page);
    const stand = await page.evaluate(() => {
      const a = document.querySelector('#menu-overlay .keymap').getBoundingClientRect();
      const b = document.querySelector('#menu-overlay .menu-konfig').getBoundingClientRect();
      const breiteSchnitt = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const hoeheSchnitt = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const knopf = document.getElementById('start-button');
      knopf.scrollIntoView({ block: 'center' });
      const r = knopf.getBoundingClientRect();
      const oben = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { schnitt: breiteSchnitt * hoeheSchnitt, knopfOben: Boolean(oben && knopf.contains(oben)) };
    });
    expect(stand.schnitt, 'Tastenliste und Einrichtung überlappen').toBe(0);
    expect(stand.knopfOben, 'an der Mitte von „Match starten“ liegt etwas anderes').toBe(true);
    expect(fehler).toEqual([]);
  });
}

test('Erstkontakt: Tastaturweg von der Startseite über die Hilfe ins Match', async ({ page }) => {
  const fehler = await oeffneStartseite(page);

  // Erster Tab gehört dem Sprunglink, der zweite dem ersten Menüfeld. Damit
  // beginnt die Tastaturreise nicht irgendwo im Nichts.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('skip-to-board');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('cfg-teams');

  // Hilfe mit der Tastatur öffnen (Enter auf `summary`, kein Klick).
  const hilfe = page.locator('#hilfe-browser');
  const hilfeKopf = hilfe.locator('summary');
  await hilfeKopf.focus();
  await page.keyboard.press('Enter');
  await expect(hilfe).toHaveAttribute('open', '');

  const reiter = page.locator('#hilfe-tabs button');
  await expect(reiter).toHaveCount(8);
  await expect(reiter.nth(0)).toHaveAttribute('aria-selected', 'true');
  const inhalt = page.locator('#hilfe-inhalt');
  await expect(inhalt.getByRole('heading', { name: 'Startaufgebot' }).first()).toBeVisible();
  const klassenText = await inhalt.innerText();
  expect(klassenText, 'Die Hilfe erklärt die drei Klassen').toContain('Nahkampf');
  expect(klassenText, 'Das Startaufgebot ist der konkrete Einstieg in eine Klasse')
    .toContain('Startaufgebot');

  // Reiterwechsel per Tastatur: Der Inhalt muss wirklich wechseln.
  const vorher = await inhalt.evaluate(el => el.textContent);
  await reiter.nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(reiter.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => inhalt.evaluate(el => el.textContent))
    .not.toBe(vorher);

  // Hilfe wieder schließen und ohne Maus das Match starten.
  await hilfeKopf.focus();
  await page.keyboard.press('Enter');
  await expect(hilfe).not.toHaveAttribute('open', '');

  await page.locator('#start-button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing', { timeout: 15_000 });

  // Der erste sichtbare Zustand ist das laufende Match, keine leere Fläche.
  await expect(page.locator('#hud-round')).toHaveText('1');
  await expect(page.locator('#hud-connection')).toHaveText(/offline/i);
  expect(fehler).toEqual([]);
});
