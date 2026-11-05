/**
 * Anbindung der Tier-Wirkungen (Fassung 4) an ein Match.
 *
 * ## Warum dieses Modul
 *
 * `match.js` hat ein Zeilenbudget (≤ 2790). Wind, Zugzeit und Zielhilfe müssen
 * aber am Match hängen: Der Wind ist Matchzustand, die Zugzeit ist seine Uhr,
 * die Zielhilfe rechnet seine Vorschau. Diese Datei bündelt die vier Handgriffe,
 * die `guentherRad.js`, `cookieMalus.js` und `tierWirkung.js` brauchen, und hält
 * `match.js` bei einer Zeile je Aufruf.
 *
 * Die Klasse fasst NICHTS selbst an: Sie liest und schreibt über die öffentliche
 * Schnittstelle des Matches (`world`, `inventory`, `statuses`, `windSetzen`,
 * `tierKontext`, `wind`). Damit bleibt die Richtung klar — das Match besitzt den
 * Zustand, diese Klasse rechnet nur.
 *
 * @module tierAnbindung
 */
import { wendeTierWirkung } from './tierWirkung.js';
import { TierZustand } from './tierZustand.js';

export class TierAnbindung {
  #match;
  #zustand = new TierZustand();

  /** @param {object} match - `MatchController` mit öffentlicher Schnittstelle */
  constructor(match) {
    this.#match = match;
  }

  /** Der Zustand für Zugzeit und Zielhilfe (Snapshot, Test). */
  get zustand() { return this.#zustand; }

  /** Handgriffe für die Wirkungsanwendung: Welt plus Wind, Zugzeit, Zielhilfe. */
  handgriffe() {
    return {
      ...this.#match.tierKontext,
      dreheWind: () => this.dreheWind(),
      setzeZugzeit: (playerId, faktor, zuege) => this.#zustand.setzeZugzeit(playerId, faktor, zuege),
      setzeZielhilfe: (playerId, faktor, zuege) => this.#zustand.setzeZielhilfe(playerId, faktor, zuege),
    };
  }

  /**
   * Wendet eine Perk-/Malus-Wirkung an — derselbe Weg wie im Spiel.
   *
   * @param {number} playerId
   * @param {{art:string}} wirkung
   * @param {object} [rng] - Strom für Waffen- und Kistenwürfe
   */
  wende(playerId, wirkung, rng = null) {
    return wendeTierWirkung({
      world: this.#match.world,
      statuses: this.#match.statuses,
      inventory: this.#match.inventory,
      tier: this.handgriffe(),
      rng,
    }, playerId, wirkung);
  }

  /**
   * Dreht den Wind („Winddreher", „Wind gegen dich").
   *
   * Bei Windstille gibt es nichts zu drehen; dann setzt die Wirkung einen
   * kleinen, festen Wind — sonst wäre sie in einer stillen Partie folgenlos.
   */
  dreheWind() {
    return this.#match.windSetzen(this.#match.wind === 0 ? 0.5 : -this.#match.wind);
  }

  /** Zugzeit einer Figur: Grunddauer mal ihr Faktor. */
  zugzeitMs(grundMs, playerId) {
    return Math.max(1, Math.round(grundMs * this.#zustand.zugzeitFaktor(playerId)));
  }

  /** Zielhilfe: Vorschau-Punkte und Abtastung für `aimPreview`. */
  zielhilfe(playerId, steps) {
    const faktor = this.#zustand.zielhilfeFaktor(playerId);
    return {
      steps: Math.max(30, Math.round(steps * faktor)),
      sampleEvery: Math.max(1, Math.round(3 / faktor)),
    };
  }

  /** Zählt die Wirkungen am Zugende der Figur herunter. */
  zugEnde(playerId) { this.#zustand.zugEnde(playerId); }

  /** Snapshot für den Ansichtszustand (leer = kein Feld). */
  snapshot() { return this.#zustand.snapshot(); }
}

export default TierAnbindung;
