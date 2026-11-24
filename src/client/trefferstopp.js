/**
 * Trefferstopp (TODO 2.9 „Juice“): Ein Treffer hält das Bild für einen Wimpernschlag an.
 *
 * ## Was hier steht — und was nicht
 *
 * Wie `zeitlupe.js` ohne Browser ladbar: kein DOM, keine eigene Uhr (die Zeit kommt als Zahl). Reine Darstellung und
 * Taktung im Client: Lokal hält die Spielschleife während des Stopps die Zeit an (`main.js#loop`: die Simulation rechnet
 * dieselben Takte, nur bis zu 120 ms später), online hält nur das Bild (der Server rechnet weiter). Zustandshash und
 * Replay bleiben unberührt.
 *
 * ## Regeln
 *
 * - **Auslösung:** Schaden ab `SCHADEN_AB` an einer Figur (ein Splitter- oder Hagelkorn zählt nicht).
 * - **Dauer:** `GRUND_MS` plus 1 ms je Schadenspunkt, höchstens `MAX_MS`. Mehrere Treffer kurz hintereinander verlängern den
 *   Stopp nicht über die längste einzelne Dauer hinaus (sonst stockt ein Flächentreffer auf vier Figuren spürbar).
 * - **Abschaltbar:** wie die Zeitlupe über die Kameraeffekte (`aus`); bei Bewegungsreduktion kürzer (`REDUZIERT_FAKTOR`).
 *
 * @module trefferstopp
 */

/** Ab so viel Schaden hält das Bild an. */
export const SCHADEN_AB = 10;
/** Grunddauer (ms). */
export const GRUND_MS = 60;
/** Höchstdauer (ms). */
export const MAX_MS = 120;
/** Bei Bewegungsreduktion nur dieser Anteil der Dauer. */
export const REDUZIERT_FAKTOR = 0.5;

/** Dauer eines Stopps für einen Treffer (ms); 0 unter der Schwelle. */
export function stoppDauer(schaden, { reduziert = false } = {}) {
  if (!(schaden >= SCHADEN_AB)) return 0;
  const ms = Math.min(MAX_MS, GRUND_MS + Math.round(schaden));
  return reduziert ? Math.round(ms * REDUZIERT_FAKTOR) : ms;
}

class Trefferstopp {
  #bis = 0;
  #aus = false;

  /** Ein- oder ausschalten (Kameraeffekte). */
  set aus(wert) { this.#aus = Boolean(wert); if (this.#aus) this.#bis = 0; }
  get aus() { return this.#aus; }

  /** Ein Treffer: hält das Bild ab `jetzt` (ms) für die Dauer an; ein laufender längerer Stopp bleibt. */
  ausloesen(schaden, jetzt, optionen = {}) {
    if (this.#aus) return;
    const ms = stoppDauer(schaden, optionen);
    if (ms > 0) this.#bis = Math.max(this.#bis, jetzt + ms);
  }

  /** Läuft gerade ein Stopp? */
  aktiv(jetzt) { return jetzt < this.#bis; }

  /** Für Tests: zurücksetzen. */
  zuruecksetzen() { this.#bis = 0; this.#aus = false; }
}

export const trefferstopp = new Trefferstopp();
