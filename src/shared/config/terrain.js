/**
 * Bodenmaterialien — die Physik der Oberfläche.
 *
 * ## Warum eine eigene Datei
 *
 * Das Terrain war bisher überall gleich: Es entschied nur, WO fest ist, nicht
 * WIE sich der Boden anfühlt. Eis und Gummi sind aber zwei verschiedene
 * Spielzeuge — Eis nimmt die Reibung, Gummi gibt sie zurück.
 *
 * Die Werte gehören an EINE Stelle, weil sie drei Dinge gleichzeitig binden:
 * den Generator (welche Zelle welches Material trägt), den Motor (wie er beim
 * Aufsetzen und Bewegen reagiert) und die Prüfwerkzeuge. Zwei Listen wären
 * genau die Doppelregel, die dieses Projekt an anderen Stellen aufgeräumt hat
 * (siehe `classes.js`, `water.js`).
 *
 * ## Die zwei Achsen
 *
 * Ein Material beschreibt sich über ZWEI Zahlen — mehr braucht der Motor
 * nicht:
 *
 *   `rutschigkeit`  0 = voller Halt, 1 = kein Halt. Der Wert sagt, welcher
 *                   Anteil der Bodenreibung des Physikschritts ZURÜCKGENOMMEN
 *                   wird. Bei 1 bleibt die waagerechte Geschwindigkeit eines
 *                   Aufsatzes vollständig erhalten — die Figur rutscht.
 *   `rueckprall`    0 = kein Rückprall, 1 = voller Rückprall. Der Wert sagt,
 *                   welcher Anteil der AUFSETZGESCHWINDIGKEIT als senkrechter
 *                   Impuls zurückgegeben wird. Bei 0,6 kommt eine Figur mit
 *                   60 % ihres Aufpralls wieder hoch — sie federt.
 *
 * ## Warum „Erde\" die Vorgabe ist
 *
 * `TERRAIN_MATERIALS[0]` ist `normal` (Erde). Jede unbekannte Kennung und
 * jede Karte ohne Materialfeld fällt darauf zurück: Ein Boden ohne Angabe
 * verhält sich wie der Boden, den es vorher gab. Das hält alte Replays und
 * die 1D-Gelände (Presets) unverändert.
 *
 * ## Kein Zufall, keine Wahl
 *
 * Diese Datei zieht NICHTS. Welche Zelle welches Material trägt, entscheidet
 * allein der Seed im Generator (`terrainGen3.js`) — nach der Projektregel
 * „der Seed entscheidet alles\". Es gibt keinen Regler und keine Auswahl.
 *
 * @module terrainConfig
 */

/** Die Kennungen der Bodenmaterialien. */
export const TERRAIN_MATERIAL = Object.freeze({
  /** Erde — der Boden ohne Eigenheit. */
  NORMAL: 0,
  /** Eis — rutschig: die Bodenreibung wird zurückgenommen. */
  ICE: 1,
  /** Gummi — federnd: das Aufsetzen wird zum Teil zurückgegeben. */
  RUBBER: 2,
});

/**
 * Der Katalog. Reihenfolge = Kennung; `TERRAIN_MATERIALS[0]` ist die Vorgabe.
 */
export const TERRAIN_MATERIALS = Object.freeze([
  Object.freeze({
    id: 0, key: 'normal', label: 'Erde', rutschigkeit: 0, rueckprall: 0,
  }),
  /*
   * Eis: `rutschigkeit` 1 heißt „die Bodenreibung wird ganz zurückgenommen\".
   * Der Wert ist bewusst NICHT über 1 — mehr als „kein Halt\" gibt es nicht,
   * und ein Wert über 1 würde die Figur beschleunigen statt gleiten lassen.
   */
  Object.freeze({
    id: 1, key: 'ice', label: 'Eis', rutschigkeit: 1, rueckprall: 0,
  }),
  /*
   * Gummi: `rueckprall` 0,6. Der Wert kommt aus dem, was das Spiel aushält:
   * Bei 1 wäre jeder Aufprall ein Sprung derselben Höhe — eine Figur käme nie
   * zur Ruhe. Bei 0,6 klingt die Bewegung aus (0,6 → 0,36 → 0,22 …), und der
   * erste Aufprall ist trotzdem deutlich sichtbar.
   */
  Object.freeze({
    id: 2, key: 'rubber', label: 'Gummi', rutschigkeit: 0, rueckprall: 0.6,
  }),
]);

/**
 * Mindest-Aufpralltempo für einen Rückprall (px pro Tick).
 *
 * Ohne Schwelle würde eine Figur auf Gummi ewig weiterhüpfen: Jeder
 * Aufprall erzeugt einen neuen, kleineren Aufprall. Mit der Schwelle endet
 * das Federn von selbst, sobald es nicht mehr sichtbar ist. Der Wert liegt
 * über dem, was ein Schritt (kein Sprung) an Tempo erzeugt — Federboden
 * frisst also kein normales Gehen.
 */
export const RUECKPRALL_MINDESTTEMPO = 3;

/**
 * Ein Material anhand seiner Kennung.
 * Unbekannte Kennungen fallen auf die Vorgabe zurück (`normal`) — dieselbe
 * Toleranz wie bei den übrigen Konfigurationen.
 */
export function materialById(id) {
  return TERRAIN_MATERIALS[id] ?? TERRAIN_MATERIALS[0];
}

export default {
  TERRAIN_MATERIAL,
  TERRAIN_MATERIALS,
  RUECKPRALL_MINDESTTEMPO,
  materialById,
};