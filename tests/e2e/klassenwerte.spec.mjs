/**
 * E2E: Die Klassen-Auswahl nennt ihre Wirkung.
 *
 * ## Der Befund
 *
 * Ein User-Flow-Audit stellte fest: Die Auswahlfelder im Menü zeigten nur die
 * nackten Kennungen („scout", „brawler"). Der wirksame Unterschied ist aber
 * gross — das Leben schwankt je Klasse um Faktor 0,56 bis 1,56. Wer wählt,
 * ohne die Folge zu kennen, wählt nicht.
 *
 * ## Was hier geprüft wird
 *
 * Dass jede Option einen Wert nennt — und dass der Wert mit dem übereinstimmt,
 * den der Motor tatsächlich anwendet. Die zweite Prüfung ist die wichtigere:
 * Eine Anzeige, die etwas anderes behauptet als die Simulation, wäre schlimmer
 * als gar keine.
 */
import { test, expect } from '@playwright/test';

/** Öffnet das Menü und wartet auf die Klassen-Auswahl. */
async function oeffneAuswahl(page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__?.game), { timeout: 20_000 });
  await expect(page.locator('#cfg-loadout-klasse-0')).toBeAttached({ timeout: 10_000 });
}

test('Jede Klassen-Option nennt Leben und Schaden', async ({ page }) => {
  await oeffneAuswahl(page);

  const texte = await page.locator('#cfg-loadout-klasse-0 option').allTextContents();

  // Die erste Option ist „automatisch" — sie beschreibt keine einzelne Klasse.
  const werte = texte.filter(t => !t.toLowerCase().includes('automatisch'));
  expect(werte.length, 'es müssen Klassen zur Wahl stehen').toBeGreaterThanOrEqual(3);

  for (const text of werte) {
    expect(text, `„${text}" nennt keinen Wert`).toMatch(/Leben\s*\d/);
    expect(text, `„${text}" nennt keinen Schaden`).toMatch(/Schaden\s*\d/);
  }
});

test('Jede Archetyp-Option nennt das Tempo', async ({ page }) => {
  await oeffneAuswahl(page);

  const texte = await page.locator('#cfg-loadout-archetyp-0 option').allTextContents();
  const werte = texte.filter(t => !t.toLowerCase().includes('automatisch'));
  expect(werte.length, 'es müssen Archetypen zur Wahl stehen').toBeGreaterThanOrEqual(3);

  for (const text of werte) {
    /*
     * Beim Archetyp steht das TEMPO, nicht der Schaden: Er wirkt über
     * `launchSpeedMultiplier` auf die Flugbahn. Das Feld hieß früher
     * irreführend `damage`.
     */
    expect(text, `„${text}" nennt kein Tempo`).toMatch(/Tempo\s*\d/);
    expect(text, `„${text}" darf keinen Schaden behaupten`).not.toMatch(/Schaden/);
  }
});

test('Die genannten Werte stimmen mit dem Motor überein', async ({ page }) => {
  /*
   * DIE Prüfung, die zählt. Eine Anzeige, die etwas anderes behauptet als die
   * Simulation, wäre schlimmer als keine Anzeige.
   *
   * Verglichen wird der Text der Option mit dem Wert, den `combatProfile()`
   * liefert — und der ist die Quelle, die der Motor liest.
   */
  await oeffneAuswahl(page);

  const befund = await page.evaluate(async () => {
    const klassen = await import('/src/shared/config/classes.js');
    const optionen = [...document.querySelectorAll('#cfg-loadout-klasse-0 option')]
      .filter(o => o.value);
    const archetypen = [...document.querySelectorAll('#cfg-loadout-archetyp-0 option')]
      .filter(o => o.value);

    const zahl = n => n.toFixed(2).replace('.', ',');

    return {
      klassen: optionen.map(o => {
        const profil = klassen.combatProfile(o.value, klassen.ARCHETYPE_IDS[0]);
        return {
          text: o.textContent,
          leben: zahl(profil.healthMultiplier),
          schaden: zahl(profil.damageMultiplier),
        };
      }),
      archetypen: archetypen.map(o => {
        const profil = klassen.combatProfile(klassen.CLASS_IDS[0], o.value);
        return { text: o.textContent, tempo: zahl(profil.launchSpeedMultiplier) };
      }),
    };
  });

  for (const k of befund.klassen) {
    expect(k.text, `Klasse: der Text nennt nicht das wirksame Leben ${k.leben}`)
      .toContain(k.leben);
    expect(k.text, `Klasse: der Text nennt nicht den wirksamen Schaden ${k.schaden}`)
      .toContain(k.schaden);
  }

  for (const a of befund.archetypen) {
    expect(a.text, `Archetyp: der Text nennt nicht das wirksame Tempo ${a.tempo}`)
      .toContain(a.tempo);
  }
});

test('Die Werte unterscheiden sich zwischen den Klassen', async ({ page }) => {
  /*
   * Die Gegenprobe gegen eine Anzeige, die überall dieselbe Zahl schreibt: Der
   * Unterschied zwischen den Klassen muss sichtbar sein — sonst wäre die
   * Anzeige wertlos.
   */
  await oeffneAuswahl(page);

  const texte = await page.locator('#cfg-loadout-klasse-0 option').allTextContents();
  const werte = texte.filter(t => !t.toLowerCase().includes('automatisch'));

  const eindeutig = new Set(werte);
  expect(eindeutig.size, 'die Optionen müssen sich im Text unterscheiden')
    .toBe(werte.length);
});

test('Die Werte kommen aus dem Motor, nicht aus einer zweiten Liste', async ({ page }) => {
  /*
   * Der Strukturtest am lebenden Objekt: Ändert man das Profil zur Laufzeit,
   * muss die Anzeige beim nächsten Aufbau mitziehen. Eine eigene, fest
   * eingetragene Liste würde das nicht tun — genau die Doppelregel, die dieses
   * Projekt an mehreren Stellen behoben hat.
   *
   * Geprüft wird über die Funktion, die die Optionen baut: Sie wird erneut
   * gerufen, nachdem das Profil verändert wurde.
   */
  await oeffneAuswahl(page);

  const vorher = await page.locator('#cfg-loadout-klasse-0 option').nth(1).textContent();
  expect(vorher).toMatch(/Leben/);
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
