/**
 * Figurenbezogene Tier-Zustände der Fassung 4: Zugzeit und Zielhilfe.
 *
 * ## Warum es diese Klasse gibt
 *
 * Zwei Wirkungen aus `config/guentherPerks.js` und `config/cookieMali.js` passen
 * in kein bestehendes System:
 *
 *   Zugzeit    `StatusStore` kennt Einfrieren, Verlangsamen, Schild — aber keine
 *              Zugdauer. Die Zugdauer hängt am Match (`#turnDurationMs`) und ist
 *              bewusst NICHT global veränderbar: Der Malus trifft die betroffene
 *              Figur, nicht den Zug aller (docs/anforderungen-2026-11-05.md §5).
 *   Zielhilfe  Die Zielhilfe ist die Vorschau in `MatchController#aimPreview`.
 *              Mehr oder weniger Punkte heißt: weitere oder kürzere sichtbare
 *              Bahn. Auch das ist figurenbezogen.
 *
 * Beides ist kleine, selten gelesene Zustandsdaten — wie das Inventar liegt es
 * außerhalb des ECS. Die Klasse ist rein deterministisch: keine Uhr, kein
 * Zufall, nur Zähler in ZÜGEN (nicht in Ticks), damit Replays unabhängig von
 * der Tickrate bleiben.
 *
 * @module tierZustand
 */

/** Ein Eintrag `{faktor, zuege}` je Figur. */
export class TierZustand {
  #zugzeit = new Map();
  #zielhilfe = new Map();

  /**
   * Setzt die Zugzeit der Figur.
   *
   * @param {number} playerId
   * @param {number} faktor - 1 = unverändert, < 1 = kürzer, > 1 = länger
   * @param {number} zuege - so viele eigene Züge lang
   */
  setzeZugzeit(playerId, faktor, zuege = 1) {
    if (!Number.isFinite(faktor) || faktor <= 0) return 1;
    // Der stärkere Ausschlag gewinnt: Ein Malus soll einen Bonus nicht
    // aufheben, und zwei Mali sollen sich nicht zu null addieren.
    const alt = this.#zugzeit.get(playerId);
    const neu = alt && Math.abs(alt.faktor - 1) > Math.abs(faktor - 1)
      ? { faktor: alt.faktor, zuege: Math.max(alt.zuege, zuege) }
      : { faktor, zuege };
    this.#zugzeit.set(playerId, neu);
    return neu.faktor;
  }

  /** Zielhilfe-Faktor der Figur (1 = unverändert). */
  setzeZielhilfe(playerId, faktor, zuege = 1) {
    if (!Number.isFinite(faktor) || faktor <= 0) return 1;
    const alt = this.#zielhilfe.get(playerId);
    const neu = alt && Math.abs(alt.faktor - 1) > Math.abs(faktor - 1)
      ? { faktor: alt.faktor, zuege: Math.max(alt.zuege, zuege) }
      : { faktor, zuege };
    this.#zielhilfe.set(playerId, neu);
    return neu.faktor;
  }

  /** Zugzeit-Faktor der Figur (1, wenn nichts läuft). */
  zugzeitFaktor(playerId) {
    const e = this.#zugzeit.get(playerId);
    return e && e.zuege > 0 ? e.faktor : 1;
  }

  /** Zielhilfe-Faktor der Figur (1, wenn nichts läuft). */
  zielhilfeFaktor(playerId) {
    const e = this.#zielhilfe.get(playerId);
    return e && e.zuege > 0 ? e.faktor : 1;
  }

  /**
   * Zählt die Wirkungen am ZUGBENDE der Figur um einen Zug herunter.
   *
   * Aufgerufen wird das nur für die Figur, deren Zug gerade endet. Eine Wirkung,
   * die „einen Zug" dauert, gilt damit in ihrem laufenden Zug (auch wenn sie
   * mittendrin kam) und ist danach vorbei; die Züge der Mitspieler zählen nicht.
   */
  zugEnde(playerId) {
    for (const map of [this.#zugzeit, this.#zielhilfe]) {
      const e = map.get(playerId);
      if (!e) continue;
      e.zuege -= 1;
      if (e.zuege <= 0) map.delete(playerId);
    }
  }

  /** Nur laufende Einträge — ein leerer Zustand bleibt aus dem Snapshot heraus. */
  snapshot() {
    const out = {};
    for (const [playerId, e] of this.#zugzeit) {
      if (e.zuege <= 0) continue;
      out[playerId] = { ...(out[playerId] ?? {}), zugzeitFaktor: Number(e.faktor.toFixed(3)), zugzeitZuege: e.zuege };
    }
    for (const [playerId, e] of this.#zielhilfe) {
      if (e.zuege <= 0) continue;
      out[playerId] = { ...(out[playerId] ?? {}), zielhilfeFaktor: Number(e.faktor.toFixed(3)), zielhilfeZuege: e.zuege };
    }
    return out;
  }

  /** Leert den Zustand (Neustart eines Matches). */
  leeren() {
    this.#zugzeit.clear();
    this.#zielhilfe.clear();
  }
}

export default TierZustand;
