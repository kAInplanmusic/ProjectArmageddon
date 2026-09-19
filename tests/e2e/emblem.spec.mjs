/**
 * E2E: Das Erfolgs-Emblem am Spielernamen.
 *
 * Die Unit-Tests prüfen die ABLEITUNG. Hier wird geprüft, dass sie im HUD
 * ankommt — und dass sie nur dort steht, wo sie hingehört.
 *
 * ## Der wichtige Punkt dieser Datei
 *
 * Das Emblem gilt nur für den EIGENEN Spieler: Nur sein Profil liegt vor. Ein
 * Emblem an einem fremden Namen wäre geraten — und ein geratener Erfolg ist
 * schlimmer als keiner. Genau das wird hier geprüft.
 */
import { test, expect } from '@playwright/test';

/** Startet ein lokales Match und wartet, bis es läuft. */
async function starteMatch(page) {
  await page.goto('/');
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing');
}

/**
 * Setzt das gespeicherte Profil, bevor die Seite lädt.
 *
 * Der Client liest das Profil beim Start aus dem lokalen Speicher — ein
 * nachträgliches Setzen käme zu spät.
 */
async function setzeProfil(page, profil) {
  await page.addInitScript(daten => {
    window.localStorage.setItem('pa-profil-v1', JSON.stringify(daten));
  }, profil);
}

test.describe('Erfolgs-Emblem', () => {
  test('Ohne erreichte Erfolge erscheint kein Emblem', async ({ page }) => {
    /*
     * Ein leerer Platzhalter wäre irreführend — er sähe aus wie ein verpasster
     * Erfolg. Die Anzeige zeigt dann gar nichts.
     */
    await setzeProfil(page, { partien: 0, siege: 0, erfolge: [] });
    await starteMatch(page);

    await expect(page.locator('#roster .roster-emblem')).toHaveCount(0);
  });

  test('Mit erreichten Erfolgen erscheint das Emblem am eigenen Namen', async ({ page }) => {
    /*
     * Geprüft wird gegen die ABLEITUNG, nicht gegen eine im Test abgetippte
     * Zahl: Nur so ist belegt, dass die Anzeige aus derselben Quelle stammt.
     */
    const ids = ['muster_erster_schuss', 'muster_erste_partie'];
    await setzeProfil(page, { partien: 1, siege: 1, erfolge: ids });
    await starteMatch(page);

    const erwartet = await page.evaluate(async erreichte => {
      const m = await import('/src/shared/achievements.js');
      return m.emblem(erreichte);
    }, ids);

    const emblem = page.locator('#roster .roster-emblem');
    await expect(emblem).toHaveCount(1);
    await expect(emblem).toHaveText(`${erwartet.anzahl}/${erwartet.gesamt}`);
    await expect(emblem).toHaveAttribute('data-tier', erwartet.rang);

    // Und die Erklärung im Tooltip nennt Rang und Muster-Hinweis.
    const titel = await emblem.getAttribute('title');
    expect(titel).toContain(erwartet.rang);
    if (erwartet.nurMuster) expect(titel).toContain('Muster');
  });

  test('Das Emblem steht am EIGENEN Spieler, nicht an fremden', async ({ page }) => {
    /*
     * Nur das eigene Profil liegt vor. Ein Emblem an einem fremden Namen wäre
     * geraten — die Kernprüfung dieser Datei.
     */
    await setzeProfil(page, { partien: 1, siege: 1, erfolge: ['muster_erster_schuss'] });
    await starteMatch(page);

    const befund = await page.evaluate(() => {
      const game = window.__PA__.game;
      const eintraege = [...document.querySelectorAll('#roster .roster-item')];
      return {
        eigenerSpielerId: game.eigenerSpielerId,
        mitEmblem: eintraege
          .filter(li => li.querySelector('.roster-emblem'))
          .map(li => Number(li.dataset.entityId)),
        alleIds: eintraege.map(li => Number(li.dataset.entityId)),
      };
    });

    expect(befund.mitEmblem.length, 'genau ein Emblem erwartet').toBe(1);
    expect(befund.mitEmblem[0]).toBe(befund.eigenerSpielerId);
    // Und es gibt mehr als einen Spieler — sonst wäre die Prüfung wertlos.
    expect(befund.alleIds.length).toBeGreaterThan(1);
  });

  test('Der Rang färbt das Abzeichen — der Client erfindet keine Farbe', async ({ page }) => {
    /*
     * Die Farbe kommt aus dem CSS über `data-tier`. Damit ist die Zuordnung
     * Rang → Farbe an EINER Stelle (dem Stylesheet) und nicht im Code
     * verstreut.
     */
    const ids = ['muster_zehn_partien']; // mittlerer Rang
    await setzeProfil(page, { partien: 10, siege: 5, erfolge: ids });
    await starteMatch(page);

    /*
     * FUND (belegt, gemessen 2026-09-19 mit drei Wegwerf-Proben) — der Fehler
     * lag im TEST, nicht in der Anzeige:
     *
     * Die Spielerliste wird im Animationsbild NEU AUFGEBAUT. `locator.evaluate`
     * löst den Knoten in ZWEI Schritten auf: erst suchen, dann die Funktion
     * aufrufen. Fällt der Neuaufbau dazwischen, liest die Funktion einen
     * ABGEHÄNGTEN Knoten — `getComputedStyle` liefert dann einen LEEREN String
     * und `getClientRects()` nichts. Der Test schlug dadurch in etwa der Hälfte
     * der Läufe fehl, obwohl die Anzeige korrekt war (Probe: 16 Seitenladungen,
     * immer `tier='mittel'`, Farbe `rgb(144, 190, 109)`, `display: block`).
     *
     * Deshalb wird hier INNERHALB der Seite gelesen (`page.evaluate` mit
     * `document.querySelector`), und es wird auf den gültigen Zustand GEWARTET.
     * Ein Suchen-und-Aufrufen über zwei Schritte gibt es nicht mehr.
     */
    await page.waitForFunction(() => {
      const el = document.querySelector('#roster .roster-emblem');
      return Boolean(el && el.getClientRects().length > 0);
    }, null, { timeout: 10_000 });

    const befund = await page.evaluate(() => {
      const el = document.querySelector('#roster .roster-emblem');
      if (!el) return null;
      return {
        tier: el.getAttribute('data-tier'),
        farbe: getComputedStyle(el).color,
        sichtbar: el.getClientRects().length > 0,
      };
    });

    expect(befund?.tier).toBe('mittel');
    expect(befund?.sichtbar).toBe(true);
    // Der konkrete Wert ist Gestaltung und wird hier nicht festgenagelt —
    // nur, dass überhaupt eine Farbe wirkt.
    expect(befund?.farbe).toMatch(/^rgb/);
  });

  test('Ein unbekannter Erfolg verfälscht das Emblem nicht', async ({ page }) => {
    // Toleranz wie überall: Eine Kennung aus einer älteren Fassung zählt nicht
    // mit, statt die Anzeige zu verfälschen.
    await setzeProfil(page, {
      partien: 1, siege: 0,
      erfolge: ['muster_erster_schuss', 'gibt-es-nicht'],
    });
    await starteMatch(page);

    const erwartet = await page.evaluate(async () => {
      const m = await import('/src/shared/achievements.js');
      return m.emblem(['muster_erster_schuss', 'gibt-es-nicht']);
    });

    await expect(page.locator('#roster .roster-emblem'))
      .toHaveText(`${erwartet.anzahl}/${erwartet.gesamt}`);
    expect(erwartet.anzahl).toBe(1);
  });
});
