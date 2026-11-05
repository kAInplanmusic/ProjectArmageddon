/**
 * E2E: Die Klassen-Auswahl nennt ihre Wirkung.
 *
 * Seit Klassenfassung 3 (`docs/anforderungen-2026-11-05.md` §6) gibt es genau
 * drei Klassen und keine Archetyp-Auswahl. Geprüft wird, dass jede Option ihre
 * wirksamen Werte nennt — und dass die Zahl mit `combatProfile()` übereinstimmt.
 */
import { test, expect } from '@playwright/test';

/** Öffnet das Menü und wartet auf die Klassen-Auswahl. */
async function oeffneAuswahl(page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__?.game), { timeout: 20_000 });
  await expect(page.locator('#cfg-loadout-klasse-0')).toBeAttached({ timeout: 10_000 });
}

test('Jede Klassen-Option nennt Leben und Schaden — genau drei Klassen', async ({ page }) => {
  await oeffneAuswahl(page);

  const texte = await page.locator('#cfg-loadout-klasse-0 option').allTextContents();

  // Die erste Option ist „automatisch" — sie beschreibt keine einzelne Klasse.
  const werte = texte.filter(t => !t.toLowerCase().includes('automatisch'));
  expect(werte.length, 'es müssen genau drei Klassen zur Wahl stehen').toBe(3);

  for (const text of werte) {
    expect(text, `„${text}" nennt keinen Wert`).toMatch(/Leben\s*\d/);
    expect(text, `„${text}" nennt keinen Schaden`).toMatch(/Schaden\s*\d/);
  }

  // Keine Archetyp-Auswahl mehr im Menü.
  await expect(page.locator('#cfg-loadout-archetyp-0')).toHaveCount(0);
});

test('Die genannten Werte stimmen mit dem Motor überein', async ({ page }) => {
  /*
   * Eine Anzeige, die etwas anderes behauptet als die Simulation, wäre
   * schlimmer als keine. Verglichen wird der Text der Option mit dem Wert, den
   * `combatProfile()` liefert — die Quelle, die der Motor liest.
   */
  await oeffneAuswahl(page);

  const befund = await page.evaluate(async () => {
    const klassen = await import('/src/shared/config/classes.js');
    const { KLASSEN_STANDARD } = await import('/src/shared/config/klassen-fassung.js');
    const optionen = [...document.querySelectorAll('#cfg-loadout-klasse-0 option')]
      .filter(o => o.value);
    const zahl = n => n.toFixed(2).replace('.', ',');

    return optionen.map(o => {
      const profil = klassen.combatProfile(o.value, null, null, KLASSEN_STANDARD);
      return {
        text: o.textContent,
        leben: zahl(profil.healthMultiplier),
        schaden: zahl(profil.damageMultiplier),
      };
    });
  });

  for (const k of befund) {
    expect(k.text, `der Text nennt nicht das wirksame Leben ${k.leben}`).toContain(k.leben);
    expect(k.text, `der Text nennt nicht den wirksamen Schaden ${k.schaden}`).toContain(k.schaden);
  }
});

test('Die Werte unterscheiden sich zwischen den Klassen', async ({ page }) => {
  /*
   * Die Gegenprobe gegen eine Anzeige, die überall dieselbe Zahl schreibt: Der
   * Unterschied zwischen den Klassen muss sichtbar sein.
   */
  await oeffneAuswahl(page);

  const texte = await page.locator('#cfg-loadout-klasse-0 option').allTextContents();
  const werte = texte.filter(t => !t.toLowerCase().includes('automatisch'));

  expect(new Set(werte).size, 'die Optionen müssen sich im Text unterscheiden')
    .toBe(werte.length);
});

test('Auch die Plätze 2 bis 4 zeigen Werte', async ({ page }) => {
  /*
   * Die Auswahl wird je Spielerplatz gebaut. Ein Fehler, der nur Platz 1
   * versorgt, wäre beim Prüfen des ersten Platzes unsichtbar.
   */
  await oeffneAuswahl(page);

  for (const platz of [1, 2, 3]) {
    const option = page.locator(`#cfg-loadout-klasse-${platz} option`).nth(1);
    const text = await option.textContent();
    expect(text, `Platz ${platz + 1} nennt keinen Wert`).toMatch(/Leben\s*\d/);
  }
});
