/**
 * Messplan der Messseite: welche Szenen in welcher Reihenfolge laufen.
 *
 * Reproduzierbar: fester Seed, feste Biome, Kartenmaße aus `src/engine/karte.js` (24:9 gross 4704×1764,
 * riesig 6272×2352, 16:9 mittel 2560×1440), feste Phasenfolge. Die Reihenfolge geht vom Leichten zum
 * Schweren — „riesig“ steht zuletzt, weil es auf einem iPhone am ehesten den Speicher sprengt; alles
 * davor ist dann schon gemessen und gespeichert (siehe `messlauf.js`, Absturzspur).
 *
 * @module messung/plan
 */

/** Fester Seed — sonst misst jeder Lauf eine andere Karte (derselbe wie `tests/e2e/profiling.spec.mjs`). */
export const MESS_SEED = 20260916;

/** Wie lange eine Messung höchstens dauert (Anforderung: ≤ 3 min). Danach werden Rest-Szenen übersprungen. */
export const GESAMTGRENZE_MS = 175_000;

/**
 * Phasen einer Szene. `zoom`: `null` = Kamera unberührt (so, wie der Spieler sie nach dem Matchstart sieht:
 * folgt der Figur); `'ganz'` = ganze Karte; Zahl = Zoom in Zeichenflächenpixeln je Kartenpixel (die
 * Zeichenfläche ist so groß wie die Karte und wird per CSS an den Bildschirm angepasst, siehe
 * `camera.js`; 1 = ganze Karte, Obergrenze 4). `aktion`: was während der Bildmessung geschieht.
 */
export const PHASEN = Object.freeze([
  { id: 'ruhig', titel: 'ruhig (Spielkamera)', zoom: null, aktion: null },
  { id: 'schuesse', titel: 'Schüsse, Explosionen, Partikel', zoom: null, aktion: 'schuesse' },
  { id: 'wasser', titel: 'Wasserfeld', zoom: null, aktion: 'wasser' },
  { id: 'zoom-ganz', titel: 'Zoom ganze Karte (Kamerafahrt)', zoom: 'ganz', aktion: 'fahrt' },
  { id: 'zoom-mittel', titel: 'Zoom 2,5× (Kamerafahrt)', zoom: 2.5, aktion: 'fahrt' },
  { id: 'zoom-nah', titel: 'Zoom 4× nah (Kamerafahrt)', zoom: 4, aktion: 'fahrt' },
]);

/**
 * Die Szenen. `biom: null` = klassische Karte (Biom folgt der Karte).
 * `laeufe`: Zahl der Terrain-Neuaufbauten (große Karten nur einmal: ein Aufbau dauert dort Sekunden).
 */
export const SZENEN = Object.freeze([
  { id: 'mittel-klassisch', titel: '16:9 mittel · klassisch', format: '16:9', groesse: 'mittel', biom: null, spielerProTeam: 2, laeufe: 2 },
  { id: 'mittel-tiefsee', titel: '16:9 mittel · Tiefsee', format: '16:9', groesse: 'mittel', biom: 'tiefsee', spielerProTeam: 2, laeufe: 2 },
  { id: 'gross-klassisch', titel: '24:9 groß (4704×1764) · klassisch', format: '24:9', groesse: 'gross', biom: null, spielerProTeam: 3, laeufe: 1 },
  { id: 'gross-tiefsee', titel: '24:9 groß · Tiefsee', format: '24:9', groesse: 'gross', biom: 'tiefsee', spielerProTeam: 3, laeufe: 1 },
  { id: 'gross-fantasywald', titel: '24:9 groß · Fantasywald', format: '24:9', groesse: 'gross', biom: 'kristallwald', spielerProTeam: 3, laeufe: 1 },
  { id: 'gross-schlacke', titel: '24:9 groß · Schlackeschmiede', format: '24:9', groesse: 'gross', biom: 'schlackeschmiede', spielerProTeam: 3, laeufe: 1 },
  { id: 'riesig-tiefsee', titel: '24:9 riesig (6272×2352) · Tiefsee', format: '24:9', groesse: 'riesig', biom: 'tiefsee', spielerProTeam: 4, laeufe: 1 },
]);

/**
 * Pläne. `standard` ist die Messung für den Nutzer (≤ 3 min auf einem Telefon); `test` ist derselbe
 * Umfang (alle Szenen, alle Phasen) mit minimaler Bildzahl, damit ein Software-Rasterer in der
 * Testumgebung durchkommt (`?plan=test`).
 */
export const PLAENE = Object.freeze({
  standard: { id: 'standard', bilderProPhase: 90, maxMsProPhase: 2200, explosionsAbstand: 6, leertaktBilder: 60, gesamtgrenzeMs: GESAMTGRENZE_MS, laeufeFaktor: 1 },
  test: { id: 'test', bilderProPhase: 8, maxMsProPhase: 2500, explosionsAbstand: 2, leertaktBilder: 10, gesamtgrenzeMs: 900_000, laeufeFaktor: 0 },
});

/** Plan nach Name; Unbekanntes wird `standard`. */
export function waehlePlan(name) {
  return PLAENE[name] ?? PLAENE.standard;
}

/** Zahl der Neuaufbau-Läufe einer Szene unter einem Plan (`laeufeFaktor: 0` = immer genau 1). */
export function laeufeFuer(szene, plan) {
  return plan.laeufeFaktor === 0 ? 1 : Math.max(1, szene.laeufe * plan.laeufeFaktor);
}

/** Höchstdauer der reinen Bildmessung in ms (Szenen × Phasen × Zeitgrenze) — Obergrenze ohne Aufbauzeiten. */
export function maxBildmessungMs(plan) {
  return SZENEN.length * PHASEN.length * plan.maxMsProPhase;
}
