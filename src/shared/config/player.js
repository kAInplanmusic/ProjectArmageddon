/**
 * Die Maße des Spielerkörpers — EINE Quelle.
 *
 * ## Warum diese Datei existiert
 *
 * FUND (belegt, Audit-Bericht): Die beiden Halbmaße standen ZWEIMAL im Baum —
 * als lokale Konstanten in `src/engine/match.js` (Setzen, Mündung, Kartenrand,
 * Landung) und als Exporte in `src/engine/systems/projectileSystem.js`
 * (Trefferprüfung gegen den Spieler-AABB). Beide sagten 7 und 10, aber die
 * Trefferprüfung ist die Gegenseite der Setzregel: Wer nur eine der beiden
 * ändert, verschiebt entweder den Körper oder das Feld, das ihn treffen soll —
 * und das äußert sich als Schuss, der „durch die Figur hindurch" geht, ohne
 * Fehlermeldung.
 *
 * Die Exporte in `projectileSystem.js` hatten zudem KEINEN Importeur: dort
 * wurde die Zahl zweimal definiert und nur lokal gelesen.
 *
 * ## Bedeutung der Werte
 *
 * Die Figurenposition ist die FUSSPOSITION. `PLAYER_HALF_HEIGHT` reicht von
 * dort nach OBEN (Kopf) und nach unten (in den Boden hinein) — mehrere Stellen
 * rechnen mit `position.y - PLAYER_HALF_HEIGHT` als „Kopf" und mit
 * `+ PLAYER_HALF_HEIGHT` als „Boden unter dem Körper".
 *
 * Der Körper ist 14 × 20 px groß. Das ist bewusst klein gegen die Kachelgröße
 * und wird beim Treffer großzügig behandelt (`+ 2` bzw. `<=`), damit ein
 * Streifschuss zählt.
 *
 * Diese Datei gehört nach `src/shared`, weil Motor und Projektil-System sie
 * lesen und `src/shared` keine Node-Builtins laden darf
 * (`tests/source-boundaries.test.js`).
 */

/** Halbe Breite des Spielerkörpers in Pixeln (voller Körper: 14 px). */
export const PLAYER_HALF_WIDTH = 7;

/** Halbe Höhe des Spielerkörpers in Pixeln (voller Körper: 20 px). */
export const PLAYER_HALF_HEIGHT = 10;
