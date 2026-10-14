/**
 * Anzeige abgelöster Geländeinseln: Ausschneiden aus der Geländeebene, Fallen als
 * Bild, Einsetzen am Ziel.
 *
 * Die Simulation (`engine/zerstoerung.js`) meldet zwei Ereignisse: `terrain_detached`
 * (die Insel löst sich; Anzeige) und `terrain_settled` (sie ist gelandet; Zustand).
 * Dazwischen fällt auf dem Server die Insel aus der Maske. Hier fällt sie als
 * Bild: Beim Lösen werden ihre Pixel aus der Geländeebene in ein Bild kopiert,
 * beim Aufsetzen wird das Bild an der endgültigen Stelle eingesetzt. Fehlt das
 * Bild (Spätbeitritt, Karte neu aufgebaut), wird dieselbe Verschiebung ohne
 * Fall ausgeführt.
 *
 * Nur Darstellung — nichts davon fließt in einen Hash.
 *
 * @module inselfall
 */
import {
  inselGrenzen, schreiteInselFort, nimmPflanzenDerInsel, verschiebePflanzenMitInsel,
} from './zerstoerungOptik.js';

function neueFlaeche(breite, hoehe) {
  const c = document.createElement('canvas');
  c.width = breite;
  c.height = hoehe;
  return c;
}

/** Kopiert die Inselpixel in ein Bild und löscht sie aus der Ebene. */
function hebeAb(layer, runs, g) {
  const sprite = neueFlaeche(g.breite, g.hoehe);
  const sctx = sprite.getContext('2d');
  const lctx = layer.getContext('2d');
  for (let i = 0; i + 2 < runs.length; i += 3) {
    const laenge = runs[i + 2] - runs[i + 1] + 1;
    sctx.drawImage(layer, runs[i], runs[i + 1], 1, laenge, runs[i] - g.x0, runs[i + 1] - g.y0, 1, laenge);
  }
  for (let i = 0; i + 2 < runs.length; i += 3) {
    lctx.clearRect(runs[i], runs[i + 1], 1, runs[i + 2] - runs[i + 1] + 1);
  }
  return sprite;
}

export class Inselfall {
  /** @type {Map<number, object>} */
  #inseln = new Map();

  get anzahl() { return this.#inseln.size; }

  /** Vergisst alle fallenden Inseln (Karte neu aufgebaut). */
  zuruecksetzen() { this.#inseln.clear(); }

  /**
   * Die Insel löst sich: Pixel in ein Bild, Pflanzen mitnehmen.
   * @returns {{runs:number[], pflanzenGeaendert:boolean}|null}
   */
  start(layer, id, runs, pflanzen) {
    const g = inselGrenzen(runs);
    if (!layer || !g || this.#inseln.has(id)) return null;
    const sprite = hebeAb(layer, runs, g);
    const mitgenommen = nimmPflanzenDerInsel(pflanzen, runs);
    this.#inseln.set(id, { id, runs, g, sprite, versatz: 0, tempo: 0, pflanzen: mitgenommen });
    return { runs, pflanzenGeaendert: mitgenommen.length > 0 };
  }

  /** Ein Bild: die Anzeigeinseln sinken. */
  schritt() {
    for (const [id, insel] of this.#inseln) this.#inseln.set(id, schreiteInselFort(insel));
  }

  zeichne(ctx) {
    for (const insel of this.#inseln.values()) ctx.drawImage(insel.sprite, insel.g.x0, insel.g.y0 + insel.versatz);
  }

  /**
   * Die Insel ist gelandet (oder wird aus dem Log nachgetragen): Bild an der
   * endgültigen Stelle einsetzen.
   * @returns {boolean} true, wenn sich Pflanzen verschoben haben (Pflanzenebene neu zeichnen)
   */
  lande(layer, id, runs, dy, pflanzen) {
    const g = inselGrenzen(runs);
    if (!layer || !g) return false;
    const insel = this.#inseln.get(id);
    this.#inseln.delete(id);
    const sprite = insel?.sprite ?? hebeAb(layer, runs, g);
    layer.getContext('2d').drawImage(sprite, g.x0, g.y0 + dy);
    if (!insel) return verschiebePflanzenMitInsel(pflanzen, runs, dy);
    for (const p of insel.pflanzen) {
      p.y += dy;
      pflanzen.push(p);
    }
    return insel.pflanzen.length > 0;
  }
}

export default Inselfall;
