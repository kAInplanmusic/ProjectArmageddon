/**
 * Bewegungsfassung: Gehen am Boden (`config.bewegung` im Replay-Kopf).
 *
 * ## Warum es eine Versionsmarke gibt (AGENTS.md §2)
 *
 * Gehen verändert Positionen und damit den Zustandshash jeder Partie, in der es benutzt wird. Eine alte
 * Aufzeichnung muss dieselbe Partie ergeben wie damals:
 *
 *   - `BEWEGUNG_ALT` (1): Die Figur kann nicht gehen (nur Sprung). Das Feld FEHLT in jeder Datei aus der Zeit davor,
 *     `move`-Eingaben werden dort nicht angewendet (es gibt keinen Pfad, der sie erzeugt).
 *   - `BEWEGUNG_GEHEN` (2): `BewegungSystem` (`engine/systems/bewegungSystem.js`): Gehen links/rechts mit
 *     Hang- und Stufenfolgen.
 *
 * ## Audit-Befund, der diese Fassung auslöste
 *
 * Die Figuren konnten im Spiel NICHT gehen: A/D veränderten nur den Zielwinkel, die einzige Fortbewegung war der
 * Sprung (Shift). Eine Grundmechanik jedes Worms-artigen Spiels fehlte, ohne dass je ein Grund dafür aufgeschrieben
 * wurde (`MASTERDOTO.md`, „Standardmechaniken").
 *
 * Reine Daten und Rechenvorschriften, kein Zufall, keine Uhr. Einheiten: Pixel und Takte (60 Hz).
 *
 * @module config/bewegung
 */

export const BEWEGUNG_ALT = 1;
export const BEWEGUNG_GEHEN = 2;
export const BEWEGUNG_STANDARD = BEWEGUNG_GEHEN;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereKit`); das Fehlen im Replay-Kopf löst `fromJSON` auf ALT auf. */
export function normalisiereBewegung(fassung) {
  return fassung === BEWEGUNG_ALT || fassung === BEWEGUNG_GEHEN ? fassung : BEWEGUNG_STANDARD;
}

export const BEWEGUNG = Object.freeze({
  /** Gehtempo in Pixeln je Takt (1,2 px × 60 Hz = 72 px/s) vor Klassen- und Statusfaktor. */
  tempo: 1.2,
  /** Höchste Stufe/Steigung, die EIN Schritt aufwärts nimmt (px). Steiler ist eine Wand. */
  maxStufe: 3,
  /** Größter Abstieg, dem die Figur je Schritt am Boden folgt (px). Tiefer ist eine Kante: Sie fällt (Fallschaden-Regel). */
  maxAbstieg: 3,
  /** Wie weit vor der Mitte die Wandprüfung liegt (px). */
  vorlauf: 2,
  /** Klassenwert `speed` (`mobilityMultiplier`) wirkt gedämpft auf das Tempo: Faktor = 1 + (Wert − 1) · Einfluss. */
  klassenEinfluss: 0.5,
  minFaktor: 0.6,
  maxFaktor: 1.4,
  /**
   * Rückwärtssalto/hoher Sprung: Faktor auf den Absprungimpuls und auf den Seitenimpuls. Die Höhe ist durch die
   * Fallschaden-Schwelle begrenzt (Landetempo des Normalsprungs 10,04 px/Takt, Schwelle 11): 1,09 × 10,04 = 10,94
   * bleibt knapp darunter — der hohe Sprung kostet kein Leben, ein höherer würde es.
   */
  saltoHoehe: 1.09,
  saltoSeite: 2,
  /** Eine Gehabsicht verfällt nach so vielen Takten ohne Erneuerung (verlorene „Taste los"-Nachricht), 90 = 1,5 s. */
  haltedauer: 90,
  /** Der Client erneuert die Gehabsicht in diesem Abstand (ms), solange die Taste gehalten wird. */
  erneuernMs: 500,
  /** Server: höchstens so viele Geh-Nachrichten je Sekunde und Sitz (Wechsel + Erneuerung), Stoß ebenso groß. */
  nachrichtenProSekunde: 12,
});
