/**
 * Laufvorhersage (nur Anzeige, Online): Die Figur am eigenen Zug läuft sofort mit, statt in Schritten
 * zu den 20-Hz-Snapshots zu springen.
 *
 * Der Server bleibt die Quelle der Wahrheit. Der Client rechnet ab dem letzten Snapshot dieselben Schritte
 * (`gehSchritt`, dieselbe reine Funktion wie der Motor) so viele Takte weiter, wie seit dem Eintreffen
 * vergangen sind, und gleitet nach einem Stopp weich auf die Serverposition zurück (Rekonziliation).
 * Nichts davon fließt in den Zustand: Positionen, Fallschaden und Treffer entscheidet allein der Server.
 *
 * @module laufVorhersage
 */
import { gehSchritt, klassenTempo } from '../engine/systems/bewegungSystem.js';

/** Höchstens so viele Takte (200 ms) wird vorausgerechnet — bei Funkstille nicht ins Leere laufen. */
const MAX_VORAUS_TAKTE = 12;
/** Zeitkonstante der Rückführung auf die Serverposition (ms). */
const GLAETTUNG_MS = 70;
/** Ab diesem Abstand (px) springt die Anzeige, statt zu gleiten (Teleport, Stoß, Sturz). */
const SPRUNG_PX = 40;

/**
 * Rechnet `takte` Geh-Schritte ab (x, y) vor. Hört an Wänden und Kanten auf (den Sturz rechnet der Server).
 *
 * @returns {{x:number, y:number}}
 */
function extrapoliereGehen({ isSolid, breite, x, y, richtung, tempo, takte }) {
  const terrain = { isSolid, width: breite };
  let punkt = { x, y };
  const n = Math.max(0, Math.min(MAX_VORAUS_TAKTE, Math.floor(takte)));
  for (let i = 0; i < n; i += 1) {
    const ziel = gehSchritt(terrain, punkt.x, punkt.y, richtung, tempo);
    if (ziel.blockiert) break;
    punkt = { x: ziel.x, y: ziel.y };
    if (ziel.abgrund) break;
  }
  return punkt;
}

export class LaufVorhersage {
  #richtung = 0;
  #angezeigt = null;
  #zuletzt = 0;

  get richtung() { return this.#richtung; }

  /** Die Absicht des Spielers (Taste gedrückt/losgelassen). */
  setzeRichtung(richtung) { this.#richtung = richtung; }

  /** Vergisst die Glättung (Zugwechsel, Teleport, neue Partie). */
  zuruecksetzen() { this.#angezeigt = null; this.#richtung = 0; }

  /**
   * Die anzuzeigende Position der eigenen Figur am Zug.
   *
   * @param {{x:number,y:number,classId?:number,archetypeId?:number,sidegradeId?:string|null}} figur - Serverstand
   * @param {{isSolid:function, breite:number, jetzt:number, snapshotAt:number}} umgebung
   * @returns {{x:number, y:number}}
   */
  anzeige(figur, { isSolid, breite, jetzt, snapshotAt }) {
    let ziel = { x: figur.x, y: figur.y };
    if (this.#richtung !== 0 && isSolid) {
      ziel = extrapoliereGehen({
        isSolid, breite, x: figur.x, y: figur.y, richtung: this.#richtung,
        tempo: klassenTempo(figur.classId, figur.archetypeId, figur.sidegradeId),
        takte: Math.max(0, jetzt - snapshotAt) * 0.06,
      });
    }
    const alt = this.#angezeigt;
    if (!alt || Math.abs(alt.x - ziel.x) > SPRUNG_PX || Math.abs(alt.y - ziel.y) > SPRUNG_PX) {
      this.#angezeigt = ziel;
    } else {
      const dt = Math.max(0, jetzt - this.#zuletzt);
      const k = 1 - Math.exp(-dt / GLAETTUNG_MS);
      this.#angezeigt = { x: alt.x + (ziel.x - alt.x) * k, y: ziel.y };
    }
    this.#zuletzt = jetzt;
    return this.#angezeigt;
  }
}

export default LaufVorhersage;
