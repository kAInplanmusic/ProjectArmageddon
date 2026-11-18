/**
 * Biomregel-Fassung: `config.biomregeln` im Replay-Kopf (QV-6, Welle 1).
 *
 * ## Warum es eine Versionsmarke gibt (AGENTS.md §2)
 *
 * Eine Biomregel verändert den Spielverlauf (hier: den Wind) und damit den Zustandshash jeder Partie, in der sie
 * wirkt. Eine alte Aufzeichnung muss dieselbe Partie ergeben wie damals:
 *
 *   - `BIOMREGELN_ALT` (1): keine Biomregeln. Das Feld FEHLT in jeder Datei aus der Zeit davor; `fromJSON` löst es auf
 *     diese Fassung auf, der Motor rechnet Bit für Bit wie vorher.
 *   - `BIOMREGELN_STROEMUNG` (2, Standard): Welle 1, Baustein A „Strömung / Windneigung" für Düne, Riff und Tiefsee.
 *
 * ## Strömung (Baustein A)
 *
 * Der Wind wird weiter je Zug aus seinem eigenen Seed-Zweig gewürfelt — die Anzahl der gezogenen Zufallswerte ändert
 * sich NICHT. Die Biomregel verschiebt nur den Wertebereich: Der gewürfelte Wert wird so gestaucht und um die
 * Strömung versetzt, dass das Ergebnis im Bereich ±`MAX_WIND` bleibt (jede Stelle, die den Wind liest, sieht weiter
 * denselben Bereich). Beispiel Düne (Anteil 0,5, Richtung rechts): Der Wind liegt zwischen 0 und `MAX_WIND` statt
 * zwischen −`MAX_WIND` und `MAX_WIND`, im Schnitt also halb so stark wie das Maximum nach rechts.
 *
 * Die Richtung ist je Partie fest und folgt dem Basis-Seed (gerade = rechts, ungerade = links). So begünstigt ein Biom
 * über viele Partien keine Seite, und die Richtung ist reproduzierbar, ohne einen Zufallswert zu ziehen.
 *
 * Die Anteile sind ERSTE ANSÄTZE, nicht balanciert (Messung: `npm run balance:biome`, Spieltest QV-4 steht aus).
 *
 * Reine Daten und Rechenvorschriften, kein Zufall, keine Uhr.
 *
 * @module config/biomregeln
 */

export const BIOMREGELN_ALT = 1;
export const BIOMREGELN_STROEMUNG = 2;
export const BIOMREGELN_STANDARD = BIOMREGELN_STROEMUNG;

/** Unbekannte Werte fallen auf den Standard; das Fehlen im Replay-Kopf löst `fromJSON` auf ALT auf. */
export function normalisiereBiomregeln(fassung) {
  return fassung === BIOMREGELN_ALT || fassung === BIOMREGELN_STROEMUNG ? fassung : BIOMREGELN_STANDARD;
}

/**
 * Biome mit Strömung. `anteil` = Betrag der Verschiebung als Anteil von `MAX_WIND` (0 bis 1, ausschließlich 1).
 */
export const BIOM_STROEMUNG = Object.freeze({
  duenen: Object.freeze({ anteil: 0.5, name: 'Sandsturm', text: 'Der Wind treibt in dieser Wüste fast immer in eine Richtung.' }),
  riff: Object.freeze({ anteil: 0.35, name: 'Riffströmung', text: 'Die Strömung am Riff schiebt Geschosse zur Seite.' }),
  tiefsee: Object.freeze({ anteil: 0.5, name: 'Tiefseestrom', text: 'Ein starker Strom treibt Geschosse in der Tiefsee seitwärts.' }),
});

/**
 * Die Strömung einer Partie oder `null`.
 *
 * @param {string|null} biom - aufgelöstes Sonderbiom (`match.sonderbiom`)
 * @param {number} fassung - Biomregel-Fassung
 * @param {number} basisSeed - Basis-Seed der Partie (bestimmt die Richtung)
 * @param {number} maxWind - größter Betrag des Windes (`MAX_WIND`)
 * @returns {{drift:number, richtung:1|-1, name:string, text:string}|null}
 */
export function stroemungFuer(biom, fassung, basisSeed, maxWind) {
  if (fassung < BIOMREGELN_STROEMUNG || !biom) return null;
  const regel = BIOM_STROEMUNG[biom];
  if (!regel) return null;
  const richtung = Math.abs(Math.trunc(Number(basisSeed) || 0)) % 2 === 0 ? 1 : -1;
  return { drift: richtung * regel.anteil * maxWind, richtung, name: regel.name, text: regel.text };
}

/**
 * Versetzt einen gewürfelten Windwert um die Strömung, ohne den Bereich ±`maxWind` zu verlassen.
 *
 * `roh * (maxWind − |drift|) / maxWind + drift`: bei roh = ±maxWind landet das Ergebnis bei drift ± (maxWind − |drift|),
 * also genau zwischen `−maxWind + 2·|drift|` und `maxWind` (für drift > 0).
 *
 * @param {number} roh - gewürfelter Wert (±`maxWind`)
 * @param {number} drift - Verschiebung (±)
 * @param {number} maxWind
 * @returns {number}
 */
export function verschiebeWind(roh, drift, maxWind) {
  return roh * (maxWind - Math.abs(drift)) / maxWind + drift;
}
