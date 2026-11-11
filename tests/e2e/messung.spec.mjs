import { test, expect } from '@playwright/test';
import { pruefeErgebnis } from '../../src/client/messung/ergebnis.js';
import { PHASEN, SZENEN } from '../../src/client/messung/plan.js';

/**
 * Messseite (`messung.html`, Z579): ein vollständiger Durchlauf in Software-Rasterung.
 *
 * Gemessen wird hier NICHTS Aussagekräftiges: Der Plan `?plan=test` spielt dieselben Szenen und Phasen
 * wie der Nutzerplan, aber mit wenigen Bildern, weil ein Software-Rasterer (SwiftShader) für die 14,7
 * Mio. Pixel der Karte „riesig“ viele Sekunden je Bild braucht. Geprüft wird, dass die Seite durchläuft,
 * jede Szene und jede Phase ein Ergebnis liefert, das JSON dem Schema entspricht und Kopieren, Teilen und
 * Sichern bedienbar sind. Die echten Zahlen kommen vom Gerät des Nutzers (`docs/probe-knoten-und-hardware.md`, B).
 */
test.describe('Messseite', () => {
  test('läuft in Software-Rasterung einmal komplett durch und liefert gültiges JSON', async ({ page, context }) => {
    test.setTimeout(900_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const seitenfehler = [];
    page.on('pageerror', f => seitenfehler.push(String(f)));
    /*
     * Vite-Neuladen sperren: Der Dev-Server lädt die Seite neu, sobald irgendein Agent (oder Mensch) in diesem
     * Arbeitsbaum eine Quelldatei ändert. Mitten im Messlauf wäre das ein „Seite beendet“-Befund aus der
     * Testumgebung, nicht aus dem Spiel. Der Websocket wird angenommen und nie bedient.
     */
    await page.routeWebSocket(/.*/, () => {});
    // Teilen-Schnittstelle abfangen: der Test hat keinen echten Teilen-Dialog.
    await page.addInitScript(() => {
      window.__geteilt = null;
      navigator.canShare = () => true;
      navigator.share = async daten => {
        window.__geteilt = { titel: daten.title, dateien: (daten.files ?? []).map(d => ({ name: d.name, typ: d.type })), text: daten.text ?? null };
        if (daten.files?.[0]) window.__geteilt.inhalt = await daten.files[0].text();
      };
    });

    await page.goto('/messung.html?plan=test');
    await expect(page.getByRole('button', { name: 'Messung starten' })).toBeVisible();
    await expect(page.locator('#ergebnis')).toBeHidden();
    await page.getByRole('button', { name: 'Messung starten' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-zustand', 'misst');

    await page.waitForFunction(() => ['fertig', 'unvollstaendig', 'abgebrochen'].includes(document.body.dataset.zustand), null, { timeout: 840_000, polling: 1000 });
    const { ergebnis, probleme } = await page.evaluate(() => window.__MESSUNG__);
    await test.info().attach('messung.json', { body: JSON.stringify(ergebnis, null, 2), contentType: 'application/json' });

    // Schema (die Prüfung steht in `src/client/messung/ergebnis.js` und wird hier unabhängig vom Seitencode in Node ausgeführt).
    expect(pruefeErgebnis(ergebnis), 'Schema-Verstöße (Node)').toEqual([]);
    expect(probleme, 'Schema-Verstöße (Seite)').toEqual([]);
    expect(ergebnis.status, ergebnis.hinweis ?? '').toBe('fertig');
    expect(ergebnis.plan).toBe('test');

    // Jede Szene und jede Phase ist gelaufen, in der Reihenfolge des Plans.
    expect(ergebnis.szenen.map(s => s.id)).toEqual(SZENEN.map(s => s.id));
    for (const s of ergebnis.szenen) {
      expect(s.status, `${s.id}: ${s.fehler}`).toBe('ok');
      expect(s.phasen.map(p => p.id)).toEqual(PHASEN.map(p => p.id));
      expect(s.karte.breite).toBeGreaterThan(0);
      expect(s.terrainNeuaufbau.mittel).toBeGreaterThan(0);
    }
    const nach = id => ergebnis.szenen.find(s => s.id === id);
    // Die Standardkarten: 24:9 groß 4704×1764, riesig 6272×2352, 16:9 mittel 2560×1440.
    expect([nach('gross-tiefsee').karte.breite, nach('gross-tiefsee').karte.hoehe]).toEqual([4704, 1764]);
    expect([nach('riesig-tiefsee').karte.breite, nach('riesig-tiefsee').karte.hoehe]).toEqual([6272, 2352]);
    expect([nach('mittel-klassisch').karte.breite, nach('mittel-klassisch').karte.hoehe]).toEqual([2560, 1440]);
    // Biom-Szenen haben einen Grading-Wert, klassische nicht.
    expect(nach('gross-tiefsee').gradingAufbauMs).not.toBeNull();
    expect(nach('gross-fantasywald').gradingAufbauMs).not.toBeNull();
    expect(nach('gross-klassisch').gradingAufbauMs).toBeNull();
    // Die Zoomstufen kommen an: nah ist näher als die ganze Karte.
    const zoomRiesig = Object.fromEntries(nach('riesig-tiefsee').phasen.map(p => [p.id, p.zoom]));
    expect(zoomRiesig['zoom-ganz']).toBe(1);
    expect(zoomRiesig['zoom-mittel']).toBeGreaterThan(zoomRiesig['zoom-ganz']);
    expect(zoomRiesig['zoom-nah']).toBeGreaterThan(zoomRiesig['zoom-mittel']);
    expect(nach('mittel-tiefsee').phasen.find(p => p.id === 'wasser').wasserZellen).toBeGreaterThan(0);
    // Software-Rasterung wird als solche erkannt oder ist unbekannt — nie fälschlich „echte Grafik“.
    expect(ergebnis.geraet.softwareRasterung === true || ergebnis.geraet.softwareRasterung === null).toBe(true);
    expect(ergebnis.geraet.devicePixelRatio).toBeGreaterThan(0);
    expect(ergebnis.leertakt?.bilder).toBeGreaterThan(0);

    // Anzeige: Tabellen gefüllt, JSON im Textfeld entspricht dem Ergebnis.
    await expect(page.locator('#ergebnis')).toBeVisible();
    await expect(page.locator('#t-aufbau tbody tr')).toHaveCount(SZENEN.length);
    await expect(page.locator('#t-bilder tbody tr')).toHaveCount(SZENEN.length * PHASEN.length);
    expect(JSON.parse(await page.locator('#json').inputValue())).toEqual(ergebnis);

    // Kopieren, Teilen, Sichern.
    await page.getByRole('button', { name: 'Ergebnis kopieren' }).click();
    await expect(page.locator('#aktion-status')).toContainText('Kopiert');
    expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(ergebnis);
    await page.getByRole('button', { name: /^Teilen/ }).click();
    await expect(page.locator('#aktion-status')).toContainText('Geteilt');
    const geteilt = await page.evaluate(() => window.__geteilt);
    expect(geteilt.dateien[0].name).toMatch(/^pa-messung-.*\.json$/);
    expect(JSON.parse(geteilt.inhalt).schema).toBe('pa-messung/1');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Als Datei sichern' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^pa-messung-.*\.json$/);

    expect(seitenfehler, `Seitenfehler: ${seitenfehler.join(' | ')}`).toEqual([]);
  });

  test('zeigt eine unterbrochene Messung (Seite wurde beendet) als Befund an', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('pa.messung.lauf.v1', JSON.stringify({
        status: 'laeuft', aktuelleSzene: 'riesig-tiefsee',
        ergebnis: {
          schema: 'pa-messung/1', plan: 'standard', gestartet: new Date().toISOString(), beendet: null, status: 'unvollstaendig', hinweis: null,
          bauinfo: null, seite: { adresse: 'x', host: 'x' },
          geraet: { ua: 'Test', devicePixelRatio: 3, bildschirm: { breite: 390, hoehe: 844 }, fenster: { breite: 844, hoehe: 390 }, ausrichtung: 'landscape', webgl: null, softwareRasterung: null, wachhalten: false },
          leertakt: { bilder: 60, mittel: 16.7, p95: 17, max: 20, hz: 60 }, szenen: [], gesamt: { dauerMs: 0, szenenOk: 0, szenenFehler: 0, szenenUebersprungen: 0 },
        },
      }));
    });
    await page.goto('/messung.html');
    await expect(page.locator('#spur')).toContainText('riesig-tiefsee');
    await expect(page.locator('#hinweis')).toContainText('Unterbrochen bei Szene riesig-tiefsee');
    const { probleme } = await page.evaluate(() => window.__MESSUNG__);
    expect(probleme).toEqual([]);
    // Die Spur wird dabei als erledigt markiert: ein zweites Öffnen hängt keine weitere Szene an.
    await page.reload();
    await expect(page.locator('#t-aufbau tbody tr')).toHaveCount(1);
  });
});
