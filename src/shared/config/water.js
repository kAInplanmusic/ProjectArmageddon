/**
 * Wasser-Regeln, die Motor und Anzeige gemeinsam brauchen.
 *
 * ## Warum eine eigene Datei
 *
 * Die Schwellen standen bisher nur im `CharacterSystem`: `0.35` entschied
 * „nass", `0.72` entschied „ertrinkt". Die Anzeige durfte sie nicht kennen —
 * also konnte sie dem Spieler auch nicht sagen, wie tief er steht und ab wann
 * es gefährlich wird. Ein zweiter Satz Schwellen im Client wäre genau die
 * doppelte Regel, die dieses Projekt an anderen Stellen schon aufgeräumt hat
 * (siehe `classes.js`). Deshalb: eine Quelle, und `CharacterSystem` liest sie
 * von hier.
 *
 * ## Was „Wasserstand" bedeutet
 *
 * `level` ist der Füllstand der Wasserzelle an der Position der Figur, 0 bis 1
 * (siehe `WaterField.levelAtWorld`). 0 = trocken, 1 = Zelle voll. Der Füllstand
 * steigt nicht nur durch Nachfließen, sondern auch durch Verdrängung: Eine
 * Explosion im Wasser hebt den Pegel ringsum (`WaterField.displace`). Eine
 * Figur kann dadurch im laufenden Zug „absaufen", ohne sich zu bewegen — genau
 * das soll das HUD zeigen.
 *
 * @module waterConfig
 */

/** Füllstand, ab dem eine Figur als „im Wasser" gilt (Auftrieb, Reibung). */
export const WET_LEVEL = 0.35;

/**
 * Füllstand, ab dem eine Figur ertrinkt.
 *
 * Muss mit dem Standardwert des `CharacterSystem` übereinstimmen; ein Test
 * prüft die Deckung.
 */
export const DROWN_LEVEL = 0.72;

/** Skalierung im Drahtformat: ein Byte für den Füllstand. */
export const WATER_WIRE_SCALE = 255;

export const WATER_STATE = Object.freeze({
  DRY: 'dry',
  WET: 'wet',
  SUBMERGED: 'submerged',
});

/** Begrenzt einen Füllstand auf den gültigen Bereich. */
export function clampWaterLevel(level) {
  const zahl = Number(level);
  if (!Number.isFinite(zahl) || zahl <= 0) return 0;
  return zahl >= 1 ? 1 : zahl;
}

/**
 * Zustand einer Figur im Wasser.
 *
 * @param {number} level - Füllstand 0..1
 * @returns {'dry'|'wet'|'submerged'}
 */
export function waterStateFor(level) {
  const gefuellt = clampWaterLevel(level);
  if (gefuellt >= DROWN_LEVEL) return WATER_STATE.SUBMERGED;
  if (gefuellt > WET_LEVEL) return WATER_STATE.WET;
  return WATER_STATE.DRY;
}

/** Füllstand für das Drahtformat (0..255). */
export function toWireWaterLevel(level) {
  return Math.max(0, Math.min(WATER_WIRE_SCALE, Math.round(clampWaterLevel(level) * WATER_WIRE_SCALE)));
}

/** Füllstand aus dem Drahtformat zurück in 0..1. */
export function fromWireWaterLevel(byte) {
  const wert = Number(byte);
  if (!Number.isFinite(wert) || wert <= 0) return 0;
  return Math.min(1, wert / WATER_WIRE_SCALE);
}

/**
 * Kurztext für die Anzeige.
 *
 * Bewusst in Prozent: Der rohe Füllstand ist eine Zahl zwischen 0 und 1 und für
 * den Spieler bedeutungslos. Prozent macht den Abstand zur Ertrinkgrenze
 * ablesbar.
 */
export function waterLabel(level) {
  const zustand = waterStateFor(level);
  const prozent = Math.round(clampWaterLevel(level) * 100);
  if (zustand === WATER_STATE.SUBMERGED) return `untergetaucht ${prozent} %`;
  if (zustand === WATER_STATE.WET) return `nass ${prozent} %`;
  return '';
}

export default {
  WET_LEVEL,
  DROWN_LEVEL,
  WATER_WIRE_SCALE,
  WATER_STATE,
  clampWaterLevel,
  waterStateFor,
  toWireWaterLevel,
  fromWireWaterLevel,
  waterLabel,
};
