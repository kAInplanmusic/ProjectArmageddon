/**
 * Bodenobjektfassung: Minen auf der Karte (`config.bodenobjekte` im Replay-Kopf).
 *
 * ## Warum es eine Versionsmarke gibt (AGENTS.md §2)
 *
 * Minen verändern Gesundheit, Gelände und den Zustandshash jeder Partie, in der es sie gibt. Eine alte
 * Aufzeichnung muss dieselbe Partie ergeben wie damals:
 *
 *   - `BODENOBJEKTE_ALT` (1): keine Minen. Das Feld FEHLT in jeder Datei aus der Zeit davor; der Zustand
 *     trägt dann keinen Schlüssel `bodenobjekte` (Hashes bleiben bitgleich).
 *   - `BODENOBJEKTE_MINEN` (2): `BodenobjektSystem` (`engine/systems/bodenobjektSystem.js`) mit eigenem
 *     Seed-Zweig `BODENOBJEKTE`.
 *   - `BODENOBJEKTE_FAESSER` (3): wie 2, dazu Fässer (siehe `FAESSER`): liegen von Anfang an auf der Karte, explodieren bei einer
 *     Explosion in der Nähe (auch einer anderen Mine oder eines Fasses, Kettenreaktion) und lösen dabei Minen mit aus.
 *
 * ## Regeln (Entscheidung des Auftraggebers, 2026-10-29)
 *
 *   - Eine Mine ist IMMER sofort scharf — abgeworfen, abgelegt oder liegend vom Kartenaufbau.
 *   - Sie löst aus, sobald eine Figur in `ausloeseRadius` kommt. Friendly Fire gilt: auch die eigenen
 *     Figuren und der Werfer.
 *   - Je Auslösung: 80 % normale Explosion, 5 % Superexplosion (doppelter Schaden, gleicher Radius und
 *     Krater), 15 % Blindgänger (keine Explosion; die Mine bleibt wirkungslos liegen und löst nie wieder aus).
 *   - Der Ausgang wird je Auslösung aus dem Seed-Zweig `BODENOBJEKTE` gezogen, in fester Reihenfolge
 *     (Mine nach Kennung, Figur nach Entity-ID). Ein Replay ergibt so dieselbe Partie.
 *
 * Reine Daten und Rechenvorschriften, kein Zufall, keine Uhr. Einheiten: Pixel und Takte (60 Hz).
 *
 * Die Schadenswerte sind ein ERSTER ANSATZ in der Größenordnung der Wurfbomben des Katalogs
 * (Kaktusbombe 48 / Radius 48, Impulsbombe 42 / 52) und NICHT balanciert; eine Balance-Messung steht aus.
 *
 * @module config/bodenobjekte
 */

export const BODENOBJEKTE_ALT = 1;
export const BODENOBJEKTE_MINEN = 2;
export const BODENOBJEKTE_FAESSER = 3;
export const BODENOBJEKTE_STANDARD = BODENOBJEKTE_FAESSER;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereBewegung`); das Fehlen im Replay-Kopf löst `fromJSON` auf ALT auf. */
export function normalisiereBodenobjekte(fassung) {
  return fassung === BODENOBJEKTE_ALT || fassung === BODENOBJEKTE_MINEN || fassung === BODENOBJEKTE_FAESSER ? fassung : BODENOBJEKTE_STANDARD;
}

/** Ausgang einer Auslösung. */
export const MINEN_AUSGANG = Object.freeze({
  NORMAL: 'normal',
  SUPER: 'super',
  BLINDGAENGER: 'blindgaenger',
});

export const MINEN = Object.freeze({
  /** Auslöseabstand in Pixeln (Betrag in x und y zur Figurenmitte, wie die Trefferbox der Figuren plus Rand). */
  ausloeseRadius: 24,
  /** Schaden in der Mitte der Explosion (fällt nach außen bis auf 25 % ab, wie jede Flächenwaffe). */
  schaden: 50,
  /** Radius der Wirkung in Pixeln. */
  radius: 48,
  /** Rückstoß wie bei Wurfbomben (`knockback` des Katalogs). */
  rueckstoss: 35,
  /** Geländeschaden (Kraterradius in Pixeln). */
  gelaendeSchaden: 28,
  /** Schadensart (Kennung aus `engine/damageTypes.js`). */
  schadensart: 'explosive',
  /** Wahrscheinlichkeit der Superexplosion je Auslösung. */
  superChance: 0.05,
  /** Wahrscheinlichkeit des Blindgängers je Auslösung. */
  blindgaengerChance: 0.15,
  /** Faktor des Schadens bei der Superexplosion. */
  superFaktor: 2,
  /** Obergrenze der Minen auf der Karte (Anzeige, Netz und Rechenzeit). */
  maximum: 64,
  /** Kettenreaktion: Explosionen lösen Minen im Radius aus. Obergrenze der Auslösungen je Takt (Endlosschleife). */
  kettenProTakt: 16,
  /** Minen, die der Kartenaufbau liegen lässt (Anzahl aus dem Seed, einschließlich Grenzen). */
  liegendMin: 0,
  liegendMax: 4,
  /** Mindestabstand liegender Minen zu Startplätzen der Figuren (Pixel). */
  liegendAbstandStart: 140,
  /** Mindestabstand liegender Minen untereinander (Pixel). */
  liegendAbstandUntereinander: 90,
  /** Mindestabstand beim Ablegen vor die Figur (größer als der Auslöseradius). */
  ablegeAbstand: 40,
  /** Wurfweite in Pixeln je Kraftpunkt (Kraft 0 bis 100) und Obergrenze der Entfernung. */
  wurfWeite: 2.4,
  wurfMax: 240,
});

/**
 * Fässer (Bodenobjektfassung 3). Sie explodieren, sobald in ihrer Nähe etwas explodiert (Geschoss, Mine, anderes Fass); es gibt keinen
 * Zufall je Explosion (kein Blindgänger, keine Superexplosion) — das Fass ist berechenbar. Werte: erster Ansatz, NICHT balanciert.
 */
export const FAESSER = Object.freeze({
  /** Schaden in der Mitte der Explosion (fällt nach außen bis auf 25 % ab). */
  schaden: 60,
  /** Radius der Wirkung in Pixeln (größer als bei der Mine). */
  radius: 64,
  rueckstoss: 45,
  gelaendeSchaden: 36,
  schadensart: 'explosive',
  /** Halbe Breite des Fasses: Eine Explosion trifft es, wenn ihr Radius diesen Abstand zur Fassmitte erreicht. */
  halbeBreite: 10,
  /** Fässer, die der Kartenaufbau liegen lässt (Anzahl aus dem Seed, einschließlich Grenzen). */
  liegendMin: 0,
  liegendMax: 4,
});

/**
 * Ausgang einer Auslösung aus EINER Zufallszahl `r` in [0, 1).
 *
 * Reihenfolge der Bereiche (fest): [0, blindgaengerChance) Blindgänger, danach `superChance` Super, der
 * Rest normal. Reine Funktion, damit Tests die Grenzen ohne Zufall prüfen.
 *
 * @param {number} r
 * @returns {'normal'|'super'|'blindgaenger'}
 */
export function minenAusgang(r) {
  if (r < MINEN.blindgaengerChance) return MINEN_AUSGANG.BLINDGAENGER;
  if (r < MINEN.blindgaengerChance + MINEN.superChance) return MINEN_AUSGANG.SUPER;
  return MINEN_AUSGANG.NORMAL;
}
