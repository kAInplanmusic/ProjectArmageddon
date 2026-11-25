/**
 * Darstellungsgröße von Gegenständen (Kisten, Fässer, Minen, Geschütze) neben den Figuren.
 *
 * FUND (gemessen, 2026-11-25): Figuren werden je Zoom auf etwa 80 Bildschirmpixel
 * hochgerechnet (`figurSkalaFuer`, Faktor um 1,6), Gegenstände blieben in
 * Kartenpixeln. Eine Kiste (14 px) war damit ein Sechstel einer Figur, ein Fass
 * ein Viertel — auf dem Bildschirm kaum zu sehen. Gegenstände wachsen jetzt mit
 * der Figurskala mit. Reine Anzeige: Treffer- und Aufnahmeflächen bleiben gleich.
 *
 * @module gegenstandSkala
 */

/** Faktor je Gegenstandsart relativ zur Figurskala (Ziel: Kiste etwa 0,4, Fass etwa 0,5 Figurhöhe). */
export const GEGENSTAND_FAKTOR = Object.freeze({ kiste: 1.5, fass: 1.1, mine: 1.1, geschuetz: 1.2 });
const MIN = 1;
const MAX = 4;

/**
 * @param {number} figurSkala - aktuelle Skala der Figuren (`figurSkalaFuer`)
 * @param {keyof typeof GEGENSTAND_FAKTOR} art
 * @returns {number} Skala >= 1 (nie kleiner als bisher)
 */
export function gegenstandSkala(figurSkala, art) {
  const s = Number.isFinite(figurSkala) && figurSkala > 0 ? figurSkala : 1;
  const f = GEGENSTAND_FAKTOR[art] ?? 1;
  return Math.max(MIN, Math.min(MAX, s * f));
}
