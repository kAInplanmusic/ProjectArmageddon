/**
 * Mengenbegrenzung je Verbindung (Token-Bucket).
 *
 * Fund (belegt, Audit 2026-10-09): Der Server begrenzte nur die GRÖSSE einer
 * Nachricht, nicht ihre ANZAHL. 50 000 abgelehnte `INPUT`-Nachrichten lösten
 * 50 000 Fehlerantworten aus (Verstärkung) und stauten die Ereignisschleife bis
 * zu 495 ms — das hält alle Lobbys im Prozess an. Betrieb ist privat; die
 * Grenze ist deshalb großzügig und schützt vor Versehen (hängende Taste,
 * Fehlerschleife im Client), nicht vor einem entschlossenen Angreifer.
 *
 * @module rateLimit
 */

/** Dauerrate je Verbindung in Nachrichten pro Sekunde. */
export const RATE_PRO_SEKUNDE = 30;
/** Stoßgröße: so viele Nachrichten dürfen auf einmal kommen (Beitritt, Klickfolge). */
export const RATE_STOSS = 60;
/**
 * Beträgt der Überhang (verworfene minus angenommene Nachrichten, nie unter 0) so viel,
 * wird die Verbindung getrennt.
 */
export const RATE_TRENNEN_NACH = 600;

export class TokenBucket {
  #rate;
  #stoss;
  #tokens;
  #zuletzt;
  #verworfeneInFolge = 0;
  #ueberhang = 0;

  /**
   * @param {object} [optionen]
   * @param {number} [optionen.rate=RATE_PRO_SEKUNDE]
   * @param {number} [optionen.stoss=RATE_STOSS]
   * @param {() => number} [optionen.jetzt] - Zeitquelle in ms (Tests injizieren)
   */
  constructor({ rate = RATE_PRO_SEKUNDE, stoss = RATE_STOSS, jetzt = () => performance.now() } = {}) {
    this.#rate = rate;
    this.#stoss = stoss;
    this.#tokens = stoss;
    this.#jetzt = jetzt;
    this.#zuletzt = jetzt();
  }

  #jetzt;

  /** Darf diese Nachricht durch? Verbraucht bei Ja einen Token. */
  erlaube() {
    const jetzt = this.#jetzt();
    const vergangen = Math.max(0, jetzt - this.#zuletzt);
    this.#zuletzt = jetzt;
    this.#tokens = Math.min(this.#stoss, this.#tokens + (vergangen / 1000) * this.#rate);
    if (this.#tokens >= 1) {
      this.#tokens -= 1;
      this.#verworfeneInFolge = 0;
      this.#ueberhang = Math.max(0, this.#ueberhang - 1);
      return true;
    }
    this.#verworfeneInFolge += 1;
    this.#ueberhang += 1;
    return false;
  }

  /** Verworfene Nachrichten seit der letzten angenommenen. */
  get verworfeneInFolge() { return this.#verworfeneInFolge; }

  /**
   * Überhang: verworfene minus angenommene Nachrichten, nie unter 0.
   *
   * Fund (Audit 2026-10-29): Die Trennregel stützte sich auf `verworfeneInFolge`. Bei einer
   * Dauerflut füllt sich der Eimer aber laufend um einen Token auf; diese eine Nachricht kommt
   * durch und setzt die Folge auf 0. Bei 1000 Nachrichten/s liegen so nur ~33 Verwürfe zwischen
   * zwei Rücksetzungen, die Schwelle (600) wird nie erreicht und die Flut läuft ewig.
   *
   * Der Überhang wächst, solange der Absender mehr schickt, als der Eimer durchlässt (mehr als
   * das Doppelte der Dauerrate), und fällt mit jeder angenommenen Nachricht. Ein kurzes Überziehen
   * (hängende Taste) wird so nicht bestraft, eine Flut aber nach wenigen hundert Nachrichten
   * getrennt.
   */
  get ueberhang() { return this.#ueberhang; }
}

export default TokenBucket;
