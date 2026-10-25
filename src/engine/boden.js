/**
 * Bodenabfragen für Figuren und Tiere (LOOK-4 Stufe 1, 2026-10-25).
 *
 * `surfaceYAt(x)` liefert die eine Geländeoberfläche einer Spalte. Seit es
 * Hohlräume gibt (Kartentypen `hoehlen`, `kavernen`, `schwebe`), reicht das
 * nicht: Unter Tage muss der Boden NAHE der bisherigen Höhe gesucht werden.
 *
 * Diese Datei ist die einzige Stelle dafür — Motor, Schuss und die Tiere nutzen
 * dieselbe Abfrage. Vorher stand sie als lokale Funktion in `shooting.js`.
 */
import { PLAYER_HALF_HEIGHT } from '../shared/config/player.js';

/** Wie weit um die bisherige Höhe nach einem Boden gesucht wird (px). */
export const BODEN_SUCHE = 480;

/**
 * Boden NAHE der bisherigen Höhe.
 *
 * Steht die Figur auf oder über der Oberfläche, bleibt es Bit für Bit beim
 * alten Verhalten (`surfaceYAt`) — die Suche greift nur unter Tage. Dort sucht
 * sie erst nach unten, dann nach oben, höchstens `BODEN_SUCHE` px. Ein Boden
 * zählt nur, wenn darüber Platz für einen Körper ist und unter den Füßen etwas
 * Festes liegt.
 *
 * @param {{surfaceYAt: (x:number)=>number, terrain: {isSolid:(x:number,y:number)=>boolean}}} quelle
 * @param {number} x Spalte
 * @param {number} vonY bisherige Standhöhe (Füße)
 * @returns {number} Bodenhöhe (Füße) oder −1, wenn keiner passt
 */
export function bodenNaheHoehe(quelle, x, vonY) {
  const oberflaeche = quelle.surfaceYAt(x);
  if (!(oberflaeche > 0) || vonY <= oberflaeche + PLAYER_HALF_HEIGHT * 2) return oberflaeche;
  const spalte = Math.floor(x);
  const steht = (y) => !quelle.terrain.isSolid(spalte, Math.floor(y - PLAYER_HALF_HEIGHT))
    && quelle.terrain.isSolid(spalte, Math.floor(y + 1));
  for (let dy = 0; dy <= BODEN_SUCHE; dy += 2) {
    if (steht(vonY + dy)) return vonY + dy;
    if (dy > 0 && steht(vonY - dy)) return vonY - dy;
  }
  return -1;
}
