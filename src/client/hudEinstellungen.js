/**
 * Einstellungs-Dropdown im HUD (Entscheidung des Auftraggebers 2026-11-04).
 *
 * „Musikschalter und ähnliche unwichtige Buttons in Dropdown-Einstellungsmenü": Musik, Effekte,
 * „Match verlassen" und „Aufgeben" stehen nicht mehr als eigene Kacheln in der Kopfzeile, sondern
 * hinter dem Knopf `#hud-menue-knopf`. Die Spielinfos (Runde, Wind, Zugzeit, Status) bleiben sichtbar.
 *
 * Bedienung (Muster „Disclosure", kein `role="menu"`, weil ein Regler darin steht):
 * - Knopf öffnet/schließt; `aria-expanded` und `aria-controls` zeigen den Zustand.
 * - Beim Öffnen liegt der Fokus auf dem ersten Eintrag; ↑/↓, Pos1/Ende wandern durch die Einträge
 *   (nicht auf dem Lautstärkeregler, der die Pfeile selbst braucht).
 * - Esc schließt und gibt den Fokus an den Knopf zurück; ein Tipp daneben schließt und geht NICHT ans
 *   Spielfeld (kein Schuss nebenbei); verlässt der Fokus das Dropdown (Tab), schließt es ebenfalls.
 * - Solange der Fokus auf Knopf oder Dropdown liegt, steuern Spieltasten nicht die Figur
 *   (`[data-spieltasten-aus]`, `dom.js#spielTastenAus`). Die Kürzel M, T und R bleiben überall wirksam.
 *
 * @module hudEinstellungen
 */

const FOKUSSIERBAR = 'button:not([hidden]):not([disabled]), input:not([disabled])';

export class HudEinstellungen {
  #doc;
  #wurzel;
  #knopf;
  #menue;
  #offen = false;

  /** @param {Document} doc */
  constructor(doc) {
    this.#doc = doc;
    this.#wurzel = doc.getElementById('hud-einstellungen');
    this.#knopf = doc.getElementById('hud-menue-knopf');
    this.#menue = doc.getElementById('hud-menue');
    if (!this.#wurzel || !this.#knopf || !this.#menue) return;

    this.#knopf.addEventListener('click', () => this.umschalten());
    this.#menue.addEventListener('keydown', e => this.#taste(e));
    this.#wurzel.addEventListener('focusout', e => {
      // Fokus wandert per Tab aus Knopf und Dropdown hinaus: schließen, ohne ihn zurückzuholen.
      if (this.#offen && e.relatedTarget && !this.#wurzel.contains(e.relatedTarget)) this.schliesse({ fokus: false });
    });
    const fenster = doc.defaultView ?? globalThis;
    // Daneben tippen schließt — in der Einfangphase, damit der Tipp nicht zugleich zielt oder feuert.
    fenster.addEventListener?.('pointerdown', e => {
      if (!this.#offen || this.#wurzel.contains(e.target)) return;
      e.stopPropagation();
      this.schliesse({ fokus: false });
    }, true);
    // Esc schließt auch, wenn der Fokus nicht mehr im Dropdown liegt.
    fenster.addEventListener?.('keydown', e => {
      if (!this.#offen || e.key !== 'Escape') return;
      e.preventDefault();
      this.schliesse();
    });
  }

  get istOffen() { return this.#offen; }

  umschalten() { if (this.#offen) this.schliesse(); else this.oeffne(); }

  oeffne() {
    if (!this.#menue || this.#offen) return;
    this.#offen = true;
    this.#menue.hidden = false;
    this.#knopf.setAttribute('aria-expanded', 'true');
    this.#eintraege()[0]?.focus({ preventScroll: true });
  }

  /** @param {{fokus?: boolean}} [optionen] - `fokus`: Fokus an den Knopf zurückgeben (Esc, Knopf). */
  schliesse({ fokus = true } = {}) {
    if (!this.#menue || !this.#offen) return;
    const fokusDrin = this.#menue.contains(this.#doc.activeElement);
    this.#offen = false;
    this.#menue.hidden = true;
    this.#knopf.setAttribute('aria-expanded', 'false');
    if (fokus && (fokusDrin || this.#doc.activeElement === this.#knopf)) this.#knopf.focus({ preventScroll: true });
    else if (fokusDrin) this.#doc.activeElement?.blur?.();
  }

  /** Sichtbare, bedienbare Einträge in Reihenfolge. */
  #eintraege() {
    return [...this.#menue.querySelectorAll(FOKUSSIERBAR)]
      .filter(el => !el.closest('[hidden]') && el.getClientRects().length > 0);
  }

  #taste(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.schliesse();
      return;
    }
    // Der Regler braucht ↑/↓/Pos1/Ende selbst.
    if (e.target?.type === 'range') return;
    const liste = this.#eintraege();
    if (liste.length === 0) return;
    const i = liste.indexOf(this.#doc.activeElement);
    let ziel = null;
    if (e.key === 'ArrowDown') ziel = liste[(i + 1) % liste.length];
    else if (e.key === 'ArrowUp') ziel = liste[(i - 1 + liste.length) % liste.length];
    else if (e.key === 'Home') ziel = liste[0];
    else if (e.key === 'End') ziel = liste[liste.length - 1];
    if (!ziel) return;
    e.preventDefault();
    ziel.focus({ preventScroll: true });
  }
}

export default HudEinstellungen;
