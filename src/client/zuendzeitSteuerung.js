/**
 * Zündzeit einer Zünderwaffe einstellen (Waffenfassung 21, Entscheidung 10 vom 2026-11-11): 1, 3 oder 5 Sekunden wie bei
 * Worms. Bedienung: Taste Z, Knopf im HUD (`#hud-zuendzeit`, auch per Tab/Enter und für Bildschirmleser) und Touch-Knopf
 * (`data-aktion="zuendzeit"`). Die Wahl geht mit dem Schuss an den Motor (`fire(..., zuendzeit)`, online `input.zuendzeit`);
 * der Server prüft sie gegen 1/3/5. Nur Darstellung und Auswahl — die Regel liegt in `engine/shooting.js`.
 *
 * @module client/zuendzeitSteuerung
 */
import { ZUENDZEITEN } from '../shared/config/waffen-f21.js';
import { WAFFEN_ENTSCHEIDUNG, getWaffe } from '../shared/config/waffen-fassung.js';

export class ZuendzeitSteuerung {
  #wahl = null;
  #lage;
  #log;

  /**
   * @param {object} [optionen]
   * @param {() => {state: object, fassung: number}} [optionen.lage] - aktueller Zustand und Waffenfassung der Partie
   * @param {(text: string) => void} [optionen.log] - Ansage ins Protokoll (Bildschirmleser)
   */
  constructor({ lage = null, log = null } = {}) {
    this.#lage = lage;
    this.#log = log;
    if (typeof document === 'undefined') return; // Tests ohne DOM
    document.getElementById('hud-zuendzeit')?.addEventListener('click', () => this.schalte());
    for (const feld of ['touch-aktionen', 'touch-laufen']) document.getElementById(feld)?.addEventListener('click', e => {
      if (e.target?.closest?.('button')?.dataset?.aktion === 'zuendzeit') this.schalte();
    });
  }

  /** Aktive Waffe der aktiven Figur in der Fassung der Partie. */
  #aktiv() {
    const { state, fassung } = this.#lage?.() ?? {};
    const aktiv = state?.entities?.find(e => e.entityId === state.activePlayerId);
    return { waffe: aktiv?.activeWeaponId ? getWaffe(aktiv.activeWeaponId, fassung) : null, fassung };
  }

  /** Zündzeit für den nächsten Schuss der aktiven Waffe (`null` = nichts senden). */
  fuerAktiven() {
    const { waffe, fassung } = this.#aktiv();
    return this.fuerSchuss(waffe, fassung);
  }

  /** Taste Z / Knopf: 1 → 3 → 5 → 1 und Ansage im Protokoll. */
  schalte() {
    const { waffe, fassung } = this.#aktiv();
    const neu = this.weiter(waffe, fassung);
    if (neu !== null) this.#log?.(`Zündzeit ${neu} s`);
  }

  /** Gilt die Einstellung für diese Waffe in dieser Fassung? */
  gilt(waffe, fassung) {
    return Boolean(waffe) && (waffe.fuseTime ?? 0) > 0 && fassung >= WAFFEN_ENTSCHEIDUNG;
  }

  /** Die gewählte Zeit (ohne Wahl: der Katalogwert der Waffe, auf 1/3/5 gerundet) oder `null`, wenn sie nicht gilt. */
  wert(waffe, fassung) {
    if (!this.gilt(waffe, fassung)) return null;
    if (this.#wahl !== null) return this.#wahl;
    return ZUENDZEITEN.includes(waffe.fuseTime) ? waffe.fuseTime : 3;
  }

  /** Die Zeit, die mit dem Schuss gesendet wird (`null` = nichts senden). */
  fuerSchuss(waffe, fassung) {
    return this.gilt(waffe, fassung) ? this.wert(waffe, fassung) : null;
  }

  /** Nächste Stufe 1 → 3 → 5 → 1; liefert die neue Zeit oder `null`. */
  weiter(waffe, fassung) {
    if (!this.gilt(waffe, fassung)) return null;
    const jetzt = this.wert(waffe, fassung);
    this.#wahl = ZUENDZEITEN[(ZUENDZEITEN.indexOf(jetzt) + 1) % ZUENDZEITEN.length];
    return this.#wahl;
  }

  /** Beschriftung für HUD und Bildschirmleser. */
  text(waffe, fassung) {
    const sek = this.wert(waffe, fassung);
    return sek === null ? '' : `Zünder ${sek} s`;
  }

  /** Aktualisiert die Knöpfe (HUD und Touch): sichtbar nur bei Zünderwaffen. */
  aktualisiere(waffe, fassung, knoepfe) {
    const sichtbar = this.gilt(waffe, fassung);
    for (const knopf of knoepfe) {
      if (!knopf) continue;
      knopf.hidden = !sichtbar;
      if (!sichtbar) continue;
      const text = this.text(waffe, fassung);
      if (knopf.textContent !== text) knopf.textContent = text;
      knopf.setAttribute('aria-label', `${text}. Taste Z oder Knopf wechselt zwischen 1, 3 und 5 Sekunden`);
    }
  }
}
