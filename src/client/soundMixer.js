/**
 * Der Klangmischer — verbindet Spielereignisse mit erzeugten Klängen.
 *
 * ## Warum ein eigener Mischer und nicht direkte Aufrufe
 *
 * Der Spielcode könnte `explosion(ctx, …)` direkt aufrufen. Drei Gründe
 * sprechen dagegen:
 *
 * **Erstens** braucht jeder Klang einen **Rauschpuffer**, und der darf nur
 * einmal erzeugt werden. Ihn bei jedem Schuss neu zu bauen wäre bei Dauerfeuer
 * merklich teuer.
 *
 * **Zweitens** braucht der AudioContext eine **Freigabe durch den Nutzer**.
 * Browser starten ihn gesperrt; ohne Freigabe bleibt jeder Klang stumm. Diese
 * Regel an einer Stelle zu haben ist besser als an zwanzig Aufruforten.
 *
 * **Drittens** sollen Klänge **abschaltbar** sein. Ein Spiel, das Geräusche
 * erzwingt, ist kein gutes Spiel — und auf dem Server-Betrieb (RunPod,
 * Hetzner) gibt es kein Audio-Ausgabegerät.
 *
 * ## Der Ausgang: ein Limiter
 *
 * Alle Klänge laufen durch einen `DynamicsCompressor`, bevor sie den
 * Lautsprecher erreichen. Der Grund ist praktisch: Bei acht Spielern und
 * mehreren Einschlägen gleichzeitig addieren sich die Pegel, und die Ausgabe
 * übersteuert. Der Limiter fängt das ab.
 *
 * @module soundMixer
 */

import { erzeugeRauschen, explosion, schuss, treffer } from './sound.js';

export class SoundMixer {
  #ctx = null;
  #rauschen = null;
  #ausgang = null;
  #an = true;
  #lautstaerke = 0.8;
  /** Zähler: Wie viele Klänge wurden erzeugt? Für die Messung. */
  #gezaehlt = { explosion: 0, schuss: 0, treffer: 0 };

  /**
   * @param {object} optionen
   * @param {boolean} [optionen.an] - Klang eingeschaltet?
   * @param {number} [optionen.lautstaerke] - 0 bis 1
   * @param {Function} [optionen.ctxBauer] - für Tests: liefert einen Context
   */
  constructor({ an = true, lautstaerke = 0.8, ctxBauer = null } = {}) {
    this.#an = an;
    this.#lautstaerke = lautstaerke;
    this.#ctxBauer = ctxBauer;
  }

  #ctxBauer;

  /** Ist der Klang eingeschaltet? */
  get an() { return this.#an; }

  /** Läuft der AudioContext schon? */
  get bereit() { return this.#ctx !== null; }

  /** Die Zähler — für Werkzeuge, die messen wollen. */
  get gezaehlt() { return { ...this.#gezaehlt }; }

  /**
   * Schaltet den Klang ein oder aus.
   *
   * Aus heißt: Es wird kein Klang erzeugt und kein Kontext geöffnet. Das
   * schont die Rechenzeit und ist im Serverbetrieb nötig.
   */
  setzeAn(an) {
    this.#an = Boolean(an);
    return this;
  }

  /** Setzt die Gesamtlautstärke (0 bis 1). */
  setzeLautstaerke(wert) {
    const s = Math.max(0, Math.min(1, Number(wert) || 0));
    this.#lautstaerke = s;
    if (this.#ausgang) this.#ausgang.gain.value = s;
    return this;
  }

  /**
   * Öffnet den AudioContext.
   *
   * ## Warum das vom Nutzer kommen muss
   *
   * Browser starten einen AudioContext **gesperrt**, bis der Nutzer mit der
   * Seite interagiert hat. Ein `resume()` aus einem Tastendruck heraus ist der
   * übliche Weg. Ohne Freigabe bleibt jede Ausgabe stumm — ohne Fehlermeldung.
   *
   * Gibt der Browser keinen Context her (kein Audio-Ausgabegerät, etwa auf
   * einem Server), bleibt der Mischer stumm, ohne zu scheitern.
   *
   * @returns {boolean} ob ein Context bereitsteht
   */
  async starte() {
    if (!this.#an) return false;
    if (this.#ctx) {
      if (this.#ctx.state === 'suspended') await this.#ctx.resume();
      return true;
    }

    const bauer = this.#ctxBauer
      ?? (typeof globalThis.AudioContext !== 'undefined'
        ? () => new globalThis.AudioContext()
        : null);
    if (!bauer) return false;

    try {
      this.#ctx = bauer();

      /*
       * Der Limiter. `DynamicsCompressor` mit einer tiefen Schwelle und einer
       * hohen Übersetzung fängt Pegelspitzen ab, ohne den Klang zu ersticken.
       */
      this.#ausgang = this.#ctx.createGain();
      this.#ausgang.gain.value = this.#lautstaerke;
      this.#ausgang.connect(this.#ctx.destination);

      this.#rauschen = erzeugeRauschen(this.#ctx, 2);

      const kompressor = this.#ctx.createDynamicsCompressor?.();
      if (kompressor) {
        kompressor.threshold.value = -18;
        kompressor.ratio.value = 8;
        this.#ausgang.disconnect();
        this.#ausgang.connect(kompressor);
        kompressor.connect(this.#ctx.destination);
      }

      if (this.#ctx.state === 'suspended') await this.#ctx.resume();
      return true;
    } catch {
      /*
       * Kein Context, kein Klang — aber kein Absturz. Auf einem Server ohne
       * Audio-Ausgabe ist das der Normalzustand, nicht ein Fehler.
       */
      this.#ctx = null;
      this.#ausgang = null;
      return false;
    }
  }

  /** Der Ziel-Knoten für alle Klänge. */
  #ziel() {
    return this.#ausgang;
  }

  /**
   * Ein Einschlag.
   *
   * @param {object} optionen
   * @param {number} [optionen.groesse] - aus dem Radius der Waffe abgeleitet
   */
  spieleExplosion({ groesse = 1 } = {}) {
    if (!this.#an || !this.#ctx) return false;
    explosion(this.#ctx, this.#rauschen, {
      groesse, lautstaerke: 1, ziel: this.#ziel(),
    });
    this.#gezaehlt.explosion += 1;
    return true;
  }

  /**
   * Ein Abschuss.
   *
   * @param {number} [tonhoehe] - 1 = mittel; schwere Waffen tiefer
   */
  spieleSchuss(tonhoehe = 1) {
    if (!this.#an || !this.#ctx) return false;
    schuss(this.#ctx, this.#rauschen, {
      tonhoehe, lautstaerke: 0.9, ziel: this.#ziel(),
    });
    this.#gezaehlt.schuss += 1;
    return true;
  }

  /** Ein Treffer. */
  spieleTreffer(haerte = 1) {
    if (!this.#an || !this.#ctx) return false;
    treffer(this.#ctx, this.#rauschen, {
      haerte, lautstaerke: 0.7, ziel: this.#ziel(),
    });
    this.#gezaehlt.treffer += 1;
    return true;
  }

  /**
   * Übersetzt ein Spielereignis in einen Klang.
   *
   * ## Warum diese Zuordnung hier steht und nicht im Spielcode
   *
   * Damit die Regel an einer Stelle liegt und geprüft werden kann. Der
   * Spielcode reicht nur die Ereignisse weiter.
   *
   * Die Zuordnung:
   *
   *   `explosion`     → Einschlag, Größe aus dem Radius
   *   `shot`          → Abschuss (so heißt das Ereignis der Engine)
   *   `damage`        → Treffer
   *
   * @param {object} ereignis - mit `type` und je nach Art weiteren Feldern
   * @returns {boolean} ob ein Klang erzeugt wurde
   */
  verarbeite(ereignis) {
    if (!ereignis?.type) return false;

    switch (ereignis.type) {
      case 'explosion': {
        /*
         * Die Größe aus dem Radius: Eine Granate mit 60 px Radius soll tiefer
         * klingen als eine mit 20 px. `sqrt` statt linear, weil die
         * wahrgenommene Lautstärke mit der Wurzel der Fläche wächst.
         */
        const radius = Number(ereignis.radius ?? 40);
        const groesse = Math.max(0.6, Math.min(1.6, 0.6 + Math.sqrt(radius) / 12));
        return this.spieleExplosion({ groesse });
      }
      case 'shot':
        return this.spieleSchuss(Number(ereignis.tonhoehe ?? 1));
      case 'damage':
        return this.spieleTreffer(Number(ereignis.haerte ?? 1));
      default:
        return false;
    }
  }
}

export default SoundMixer;
