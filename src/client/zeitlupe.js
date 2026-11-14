/**
 * C3 Zeitlupe: Verlangsamt die Darstellung bei extremen Schüssen.
 *
 * ## Was hier steht — und was nicht
 *
 * Dieses Modul ist **ohne Browser ladbar**: Es kennt weder DOM noch Canvas und
 * benutzt keine Uhr, die es nicht als Zahl bekommt. Es ist reine Logik für die
 * Darstellung — keine Auswirkung auf Simulation, Zustandshash oder Replay.
 *
 * ## Regeln
 *
 * - **Auslösung:** Schuss mit ≥ 250 Gesamtschaden ODER ≥ 3 Toten
 * - **Faktor:** 0,35 für 0,9 Sekunden
 * - **Abschaltbar:** über `zeitlupe` Einstellung
 * - **Nur Darstellung:** verändert nichts am Match
 *
 * @module zeitlupe
 */

/** Schwellenwert für Gesamtschaden pro Schuss (aus dem Auftrag). */
const SCHADEN_GRENZE = 250;

/** Schwellenwert für Anzahl der Tote pro Schuss (aus dem Auftrag). */
const TOTEN_GRENZE = 3;

/** Zeitlupe-Faktor (0,35 = 35 % der Normalgeschwindigkeit). */
const FAKTOR = 0.35;

/** Dauer der Zeitlupe in Sekunden (aus dem Auftrag). */
const DAUER = 0.9;

/**
 * Zustand der Zeitlupe.
 * Der aktuelle Zeitpunkt, bis zu dem die Zeitlupe noch läuft.
 */
class Zeitlupe {
  #zeit = 0;

  /** Aktiviert die Zeitlupe für die angegebene Dauer. */
  aktiviere(jetzt = 0) {
    this.#zeit = jetzt + DAUER;
  }

  /**
   * Berechnet den Darstellungs-Faktor für diesen Frame.
   * @param {number} jetzt - Aktuelle Zeit in Sekunden
   * @param {{schaden: number, tote: number}} p - Schaden und Tote dieses Schusses
   * @param {boolean} eingeschaltet - Ob die Zeitlupe aktiviert sein darf
   * @returns {number} Faktor 1 (normal) oder 0,35 (zeitlupe)
   */
  faktor(jetzt, p = {}, eingeschaltet = true) {
    // Prüfe, ob die Zeitlupe gerade aktiv ist
    if (this.#zeit > jetzt) {
      return FAKTOR;
    }
    // Prüfe, ob ein neuer Schuss die Zeitlupe auslösen kann
    if (!eingeschaltet) return 1;
    if (p.schaden >= SCHADEN_GRENZE || p.tote >= TOTEN_GRENZE) {
      this.#zeit = jetzt + DAUER;
      return FAKTOR;
    }
    return 1;
  }

  /** Setzt die Zeitlupe zurück (neues Match, Ausnahme). */
  zuruecksetzen() {
    this.#zeit = 0;
  }

  /** Gibt ob die Zeitlupe gerade aktiv ist. */
  istAktiv(jetzt) {
    return this.#zeit > jetzt;
  }

  /** Gibt die verbleibende Zeit (für Debug/Ausgabe). */
  verbleibend(jetzt) {
    return Math.max(0, this.#zeit - jetzt);
  }
}

/** Singleton für die gesamte Anwendung */
export const zeitlupe = new Zeitlupe();

export default zeitlupe;