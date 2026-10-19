/**
 * E2E: Offline-Messung der Klangprofile in Chromium (OfflineAudioContext), ohne Spielseite.
 * Prüft Spitze (kein Clipping nach dem Begrenzer), Ausklang, NaN, Dauer und die Trennung der
 * Kategorien über den spektralen Schwerpunkt — live, nicht nur gegen `docs/klang/auswertung.json`.
 */
import { test, expect } from '@playwright/test';
import { mitKlangRenderer, SAMPLERATE } from '../helfer/klangRender.mjs';
import { kennzahlen } from '../helfer/klangAnalyse.js';
import { ALLE_PROFILE, KATEGORIE_PROFIL, STIMMEN_MAX } from '../../src/client/klangProfile.js';

test('Alle Profile: kein Clipping, klingen aus, kein NaN, unter drei Sekunden', async () => {
  test.setTimeout(240_000);
  const schwerpunkte = {};
  await mitKlangRenderer(async (rendere) => {
    for (const name of Object.keys(ALLE_PROFILE)) {
      const { links, rechts } = await rendere({ stimmen: [{ name }], seed: 1, dauer: 3.5 });
      const k = kennzahlen(links, rechts, SAMPLERATE);
      expect(k.nan, `${name}: NaN`).toBe(false);
      expect(k.ueber0dB, `${name}: übersteuert`).toBe(false);
      expect(k.peakDb, `${name}: Spitze`).toBeGreaterThan(-40);
      expect(k.dauer, `${name}: Dauer`).toBeLessThan(3);
      expect(k.endpegelDb, `${name}: Endpegel`).toBeLessThan(-60);
      schwerpunkte[name] = k.schwerpunkt;
    }
    // Stresstest: doppelte Stimmenzahl gleichzeitig durch den Begrenzer.
    const laut = ['ultimate', 'explosion_riesig', 'schwer', 'gewehr'];
    const stimmen = Array.from({ length: STIMMEN_MAX * 2 }, (_, i) => ({ name: laut[i % laut.length], pan: ((i % 5) - 2) / 2.5 }));
    const { links, rechts } = await rendere({ stimmen, seed: 5 });
    const k = kennzahlen(links, rechts, SAMPLERATE);
    expect(k.ueber0dB).toBe(false);
    expect(k.peakDb).toBeLessThanOrEqual(0);
  });
  const werte = Object.values(KATEGORIE_PROFIL).map(n => schwerpunkte[n]).sort((a, b) => a - b);
  for (let i = 1; i < werte.length; i += 1) {
    expect(werte[i] / werte[i - 1], `Kategorien ${werte[i - 1]} / ${werte[i]} Hz zu ähnlich`).toBeGreaterThanOrEqual(1.25);
  }
});

test('Variation je Schuss: zwei Würfe desselben Profils sind nicht identisch', async () => {
  await mitKlangRenderer(async (rendere) => {
    const a = await rendere({ stimmen: [{ name: 'pistole' }], seed: 1, dauer: 1 });
    const b = await rendere({ stimmen: [{ name: 'pistole' }], seed: 2, dauer: 1 });
    let unterschied = 0;
    for (let i = 0; i < a.links.length; i += 1) unterschied += Math.abs(a.links[i] - b.links[i]);
    expect(unterschied).toBeGreaterThan(1);
    const gleich = await rendere({ stimmen: [{ name: 'pistole' }], seed: 1, dauer: 1 });
    expect(gleich.links).toEqual(a.links);
  });
});
