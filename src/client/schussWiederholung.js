/**
 * Wiederholung des letzten Schusses (Zugpause, Entscheidung des Auftraggebers 2026-10-13).
 *
 * Reine Anzeige: Der Client merkt sich die Flugbahn des Geschosses aus dem Zustand
 * (`state.projectiles`), sobald eines fliegt, und spielt sie in der Pause nach dem Zug
 * als Spur mit Kopf und Einschlagring noch einmal ab. Nichts davon fließt in die
 * Simulation. Online und lokal gleich, weil beide denselben Zustand liefern.
 *
 * @module schussWiederholung
 */

/** Weniger Punkte als das sind kein Flug (Einschlag direkt vor der Figur): keine Wiederholung. */
export const MINDESTPUNKTE = 6;
const HOECHSTPUNKTE = 1200;

export class SchussAufnahme {
  #spur = [];
  #fliegt = false;
  #frisch = false;

  /**
   * Pro Bild mit der aktuellen Geschossliste aufrufen.
   * @param {Array<{x:number,y:number}>} projectiles
   */
  erfasse(projectiles) {
    const erstes = projectiles?.[0];
    if (erstes && Number.isFinite(erstes.x) && Number.isFinite(erstes.y)) {
      if (!this.#fliegt) this.#spur = []; // neuer Schuss ersetzt den alten
      this.#fliegt = true;
      if (this.#spur.length < HOECHSTPUNKTE) this.#spur.push([erstes.x, erstes.y]);
    } else {
      if (this.#fliegt) this.#frisch = true; // ein Flug ist gerade zu Ende gegangen
      this.#fliegt = false;
    }
  }

  /** Gibt es einen abgeschlossenen Flug, der sich zu zeigen lohnt? */
  get vorhanden() {
    return !this.#fliegt && this.#spur.length >= MINDESTPUNKTE;
  }

  get punkte() { return this.#spur.length; }

  /**
   * Gehört die Aufnahme zum Zug, der gerade endete? Gibt EINMAL `true` zurück, nachdem ein Flug
   * zu Ende ging — ein Zug ohne Geschoss (Teleport, Bewegung) zeigt nie den Schuss des Vorspielers.
   */
  nimmFrische() {
    const f = this.#frisch;
    this.#frisch = false;
    return f && this.vorhanden;
  }

  /** Vergisst die Aufnahme (neues Match). */
  verwerfe() { this.#spur = []; this.#fliegt = false; this.#frisch = false; }

  /**
   * Zustand der Wiedergabe zum Zeitpunkt `anteil` (0..1 der Wiederholungsdauer).
   * @param {number} anteil
   * @returns {null | {spur:Array<[number,number]>, kopf:[number,number], aufprall:boolean}}
   */
  zustand(anteil) {
    if (!this.vorhanden || !Number.isFinite(anteil)) return null;
    const a = Math.max(0, Math.min(1, anteil));
    const n = Math.max(1, Math.round(a * (this.#spur.length - 1)) + 1);
    const spur = this.#spur.slice(0, n);
    return { spur, kopf: spur[spur.length - 1], aufprall: a >= 1 };
  }
}
