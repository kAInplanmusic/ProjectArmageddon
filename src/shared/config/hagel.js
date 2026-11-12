/**
 * Hagelfassung: einzelne große Hagelkörner, die leichten Schaden machen (`config.hagel` im Replay-Kopf). HAGEL-1.
 *
 * ## Warum es eine Versionsmarke gibt (AGENTS.md §2)
 *
 * Ein Hagelkorn nimmt Lebenspunkte und verändert damit den Zustandshash. Eine alte Aufzeichnung muss dieselbe Partie
 * ergeben wie damals:
 *
 *   - `HAGEL_ALT` (1): kein Engine-Wetter, nie ein Korn, kein Schaden. Das Feld FEHLT in jeder Datei aus der Zeit davor.
 *     Der Motor greift dann auf keinen Zufallsstrom und auf keine Welt-Abfrage zu: bitgleich zum Stand davor.
 *   - `HAGEL_KOERNER` (2): `engine/hagel.js` — Hagellagen aus dem Seed, darin einzelne große Körner mit sichtbarer Flugzeit.
 *
 * ## Die Regeln der Fassung 2
 *
 * - **Wetter ist zufällig.** Die Zeit ist in Scheiben zu `lageTakte` geteilt (75 s, wie der Wechsel der Wetterlage im
 *   Client). Je Scheibe zieht der Motor aus dem eigenen Zweig `HAGEL` (`shared/seed.js`), ob Hagel fällt, wann er in der
 *   Scheibe beginnt und wie lange er dauert. Es gibt keine Wahl; der Client zeigt den Hagel nur an.
 * - **Einzelne Körner, selten.** Während einer Lage fällt im Mittel alle ~4 s ein großes Korn (`abstandMin`/`abstandMax`
 *   Takte, einstellbar hier). Ein Teil der Körner (`gezielt`) fällt auf die Spalte einer lebenden Figur, der Rest auf eine
 *   beliebige Spalte der Karte.
 * - **Vorwarnung.** Jedes Korn braucht `fallMin` bis `fallMax` Takte (1,1 bis 1,6 s, nie unter 1,0 s) vom Himmel zum Ziel.
 *   Der Ort steht beim Start fest (Ereignis `hail_korn`), der Client zeigt dort einen wachsenden Schatten.
 * - **Nur unter freiem Himmel.** Beim Aufschlag zählt eine Figur nur, wenn von ihrem Kopf senkrecht nach oben bis zum
 *   Kartenrand KEIN festes Gelände liegt (Strahltest gegen die Kollisionsmaske in der Spalte des Korns). Höhlen,
 *   Kammern und Überhänge schützen damit. Ein Korn, das Gelände trifft, richtet dort nichts an (kein Terrainschaden).
 * - **Leicht.** 1 bis 2 LP je Treffer (`schadenMin`/`schadenMax`), die Schadensart ist `physical`; Schilde und Mali der
 *   Schadensfassung greifen wie bei jedem Schaden.
 * - **Nie tödlich (Entscheidung, Begründung).** Ein Hagelkorn lässt eine Figur nie unter 1 LP fallen. Wetter hat keinen
 *   Urheber: ein Ausscheiden ohne Schützen wäre Zufallsunfairness, besonders für Figuren, die im Zug der Gegner stehen,
 *   und ohne Zurechnung für Abschuss-Statistik und Sieger. Wer schon auf 1 LP steht, wird vom Korn nur „getroffen"
 *   (Ereignis mit Schaden 0). Umschaltbar über `nieToedlich` (eine Konstante, keine Replay-Marke nötig, weil sie in
 *   Fassung 2 fest gilt; eine Änderung wäre Fassung 3).
 *
 * Reine Daten, kein Zufall, keine Uhr. Einheiten: Takte (60 Hz) und Pixel.
 *
 * @module config/hagel
 */

export const HAGEL_ALT = 1;
export const HAGEL_KOERNER = 2;
export const HAGEL_STANDARD = HAGEL_KOERNER;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereWind`); das Fehlen im Replay-Kopf löst `fromJSON` auf ALT auf. */
export function normalisiereHagel(fassung) {
  return fassung === HAGEL_ALT || fassung === HAGEL_KOERNER ? fassung : HAGEL_STANDARD;
}

export const HAGEL = Object.freeze({
  /** Länge einer Zeitscheibe, in der über Hagel entschieden wird (75 s). */
  lageTakte: 4500,
  /** Wahrscheinlichkeit, dass in einer Scheibe Hagel fällt. */
  anteilLagen: 0.2,
  /** Beginn innerhalb der Scheibe: 0 bis so viele Takte nach ihrem Anfang. */
  startMax: 900,
  /** Dauer einer Hagellage: 30 bis 60 s (Beginn + Dauer bleibt innerhalb der Scheibe). */
  dauerMin: 1800,
  dauerMax: 3600,
  /** Abstand zwischen zwei Körnern: 2,5 bis 5,5 s, im Mittel 4 s je Karte. */
  abstandMin: 150,
  abstandMax: 330,
  /** Flugzeit eines Korns vom Himmel zum Ziel: 1,1 bis 1,6 s (nie unter 1,0 s = 60 Takte). */
  fallMin: 66,
  fallMax: 96,
  /** Anteil der Körner, die auf die Spalte einer lebenden Figur zielen, und die Streuung dort (px). */
  gezielt: 0.5,
  streuung: 10,
  /** Halbe Breite des Korns beim Treffen (px, zusätzlich zur halben Körperbreite). */
  radius: 5,
  /** Schaden je Treffer in LP. */
  schadenMin: 1,
  schadenMax: 2,
  /** Ein Korn lässt keine Figur unter 1 LP fallen (siehe Kopfkommentar). */
  nieToedlich: true,
  /** Mindestflugzeit, unter der kein Korn je fallen darf (Takte); Test hält `fallMin >= minFall` fest. */
  minFall: 60,
});
