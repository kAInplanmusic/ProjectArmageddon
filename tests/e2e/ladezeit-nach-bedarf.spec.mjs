import { test, expect } from '@playwright/test';

/**
 * LADEZEIT (2026-11-09): Das Menü lädt keine Match-Bilder, das Match nur, was die Karte zeigt.
 *
 * Vorher (Produktionsbau, gemessen): 121 Anfragen mit 7,80 MB vor dem ersten Klick — alle 112
 * Stofftexturen und 12 Effekt-Sheets im Leerlauf nach dem Menü. Jetzt 10 Anfragen mit 0,59 MB;
 * Texturen kommen je Karte nach Bedarf (`src/client/stoffTexturen.js`), Figurendaten mit einem
 * Baustein beim ersten Figurenbild (`src/client/figurenDaten.js`).
 *
 * Die Rechenseite (Wunschweg, pixelgleiches Bild) steht in `tests/ladezeit-nach-bedarf.test.js`.
 */

const MATCH_BILDER = /stoff-texturen|effekt-sheets|sprite-sheets|characters-side|characters-hd/;
const BAUSTEINE = /figurenDaten|figurenHdDaten/;

/**
 * Sammelt BILD-Anfragen und die Anfragen nach den nachgeladenen Bausteinen.
 *
 * Der Dev-Server liefert jede Adresse eines eager-Globs als eigenes kleines JS-Modul
 * (`…/erde.jpg?import&url`); das ist kein Bild und im Produktionsbau eine Zeichenkette im Bündel.
 * Gezählt wird deshalb nach Ressourcentyp, nicht nach Pfad allein.
 */
function sammleAnfragen(page) {
  const pfade = [];
  page.on('request', (anfrage) => {
    const pfad = new URL(anfrage.url()).pathname;
    if (anfrage.resourceType() === 'image' || BAUSTEINE.test(pfad)) pfade.push(pfad);
  });
  return pfade;
}

test('Das Menü lädt weder Stofftexturen noch Effekt-Sheets noch Figurendaten', async ({ page }) => {
  const pfade = sammleAnfragen(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Match starten' })).toBeVisible();
  // Länger als die alte Leerlauf-Frist (1,5 s): ein wieder eingebautes Vorladen fiele hier auf.
  await page.waitForTimeout(2500);

  const verfrueht = pfade.filter(p => MATCH_BILDER.test(p) || BAUSTEINE.test(p));
  expect(verfrueht, 'das Menü holt Bilder, die erst ein Match braucht').toEqual([]);
});

test('Der Matchstart holt nur die Texturen der Karte und färbt das Gelände damit', async ({ page }) => {
  const fehler = [];
  page.on('pageerror', error => fehler.push(String(error)));
  const pfade = sammleAnfragen(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Match starten' }).click();
  await expect(page.locator('#menu-overlay')).toBeHidden();

  // Das Ladebild hängt an den Texturen der Karte und muss von selbst gehen.
  await expect.poll(() => page.locator('.ladebild').evaluateAll(
    liste => liste.every(e => e.hidden || getComputedStyle(e).display === 'none' || !e.isConnected),
  ), { timeout: 15_000 }).toBe(true);

  const stand = await page.evaluate(async () => {
    const texturen = await import('/src/client/stoffTexturen.js');
    await texturen.stoffTexturenBereit();
    const { STOFFE } = await import('/src/shared/config/stoffe.js');
    const renderer = window.__PA__.game.renderer;
    const karte = renderer.stoffkarte;
    const ids = karte ? new Set([0, ...karte.feld, ...(karte.ueber ? [...karte.ueber].filter(Boolean).map(v => v - 1) : [])]) : new Set();
    const noetig = [...new Set([...ids].map(id => texturen.STOFF_TEXTUR[STOFFE[id]?.key]).filter(Boolean))];

    const hash = (leinwand) => {
      const d = leinwand.getContext('2d').getImageData(0, 0, leinwand.width, leinwand.height).data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i += 1) h = Math.imul(h ^ d[i], 16777619) >>> 0;
      return h;
    };
    // Das angezeigte Gelände (nachgefärbt) gegen einen frischen Aufbau mit den jetzt geladenen Texturen.
    const gezeigt = hash(renderer.terrainLayer);
    const q = renderer.terrainSource;
    const frisch = hash(renderer.buildTerrainLayer(q.bitmap, q.width, q.height));
    return {
      hatKarte: Boolean(karte), noetig: noetig.sort(), geladen: texturen.anzahlStoffTexturen(),
      alle: texturen.TEXTUR_NAMEN.length, offen: texturen.offeneStoffTexturen(), gezeigt, frisch,
    };
  });

  expect(stand.hatKarte, 'Testannahme: die Menüvorgabe erzeugt eine Karte mit Stoffen').toBe(true);
  expect(stand.geladen, 'geladen sind genau die Texturen der vorkommenden Stoffe').toBe(stand.noetig.length);
  expect(stand.geladen).toBeGreaterThan(0);
  expect(stand.geladen, 'eine Karte braucht einen Bruchteil aller Texturen').toBeLessThan(stand.alle / 2);
  expect(stand.offen).toBe(0);
  expect(stand.gezeigt, 'das Gelände wurde nach dem Nachladen nicht neu gefärbt').toBe(stand.frisch);

  const texturen = pfade.filter(p => /stoff-texturen/.test(p));
  expect(texturen.length, 'jede nötige Textur genau einmal angefragt').toBe(stand.noetig.length);
  expect(pfade.filter(p => /figurenDaten/.test(p)).length, 'Figurendaten kommen mit einem Baustein').toBeGreaterThan(0);
  expect(pfade.some(p => /effekt-sheets/.test(p)), 'die Effekt-Sheets laden mit dem Matchstart').toBe(true);
  expect(fehler).toEqual([]);
});
