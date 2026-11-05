/**
 * Rückfrage im Spielstil — nicht blockierend (UI-3).
 *
 * ## Der Befund
 *
 * `globalThis.confirm()` hält den Hauptfaden an. Der Frame-Loop
 * (`Main#loop`) steht dann still: Die Zugzeit-Anzeige friert ein, Partikel und
 * Kamera bewegen sich nicht mehr, und der Countdown läuft unsichtbar weiter.
 * Gemessen wurde das an den zwei Rückfragen „Match verlassen?" (Taste R,
 * HUD-Knopf) und „Aufgeben?".
 *
 * ## Die Umsetzung
 *
 * Ein Overlay im Spielstil (`#bestaetigung`, Markup in `index.html`), das die
 * Entscheidung als Promise liefert. Der Loop läuft weiter, weil nichts
 * synchron wartet — die Antwort kommt aus einem Klick oder einer Taste.
 *
 * Bedienung und Barrierefreiheit:
 *  - `role="alertdialog"`, `aria-modal="true"`, Titel und Text sind über
 *    `aria-labelledby`/`aria-describedby` verbunden.
 *  - Der Fokus wandert beim Öffnen auf „Ja" (wie beim nativen Dialog, wo „OK"
 *    den Fokus hat) und kehrt beim Schließen an die vorige Stelle zurück.
 *  - `Tab`/`Shift+Tab` bleiben im Dialog (Fokusfalle), `Esc` antwortet „Nein",
 *    `Enter` löst den fokussierten Knopf aus.
 *  - Die Spielfläche (`#game-canvas`) und das HUD werden `inert` geschaltet;
 *    Tastendrücke erreichen das Spiel nicht, solange die Frage offen ist.
 *    Der Frame-Loop ist davon nicht betroffen — er liest keine Tastatur.
 *
 * Ohne passendes Markup bleibt das Modul still und antwortet „Nein": Eine
 * Rückfrage, die sich nicht zeigen kann, darf keine Partie beenden.
 *
 * @module bestaetigung
 */

/** Elemente, die während der Frage nicht bedienbar sind. */
const INERT_WAEHREND_FRAGE = ['game-canvas', 'hud'];

export class Bestaetigung {
  #doc;
  #overlay;
  #titel;
  #text;
  #ja;
  #nein;
  #bereit;
  #offen = false;
  #loese = null;
  #vorherigerFokus = null;
  #inertVorher = new Map();

  /** @param {Document} doc */
  constructor(doc) {
    this.#doc = doc;
    this.#overlay = doc.getElementById('bestaetigung');
    this.#titel = doc.getElementById('bestaetigung-titel');
    this.#text = doc.getElementById('bestaetigung-text');
    this.#ja = doc.getElementById('bestaetigung-ja');
    this.#nein = doc.getElementById('bestaetigung-nein');
    this.#bereit = Boolean(this.#overlay && this.#titel && this.#text && this.#ja && this.#nein);
    if (!this.#bereit) return;

    this.#ja.addEventListener('click', () => this.#beantworte(true));
    this.#nein.addEventListener('click', () => this.#beantworte(false));
    // Ein Klick auf den Hintergrund gilt als „Nein": Die Frage verschwindet,
    // das Spiel läuft weiter — dieselbe Wirkung wie Esc.
    this.#overlay.addEventListener('pointerdown', ereignis => {
      if (ereignis.target === this.#overlay) this.#beantworte(false);
    });
    /*
     * Die Tasten werden in der EINFANGPHASE am Dokument abgefangen: Sonst
     * erreichte ein „R" oder „E" während der Frage das Spiel (zweite Rückfrage,
     * Waffenmenü) — der Dialog wäre nicht modal.
     */
    doc.addEventListener('keydown', ereignis => this.#taste(ereignis), true);
  }

  /** Ist gerade eine Frage offen? */
  get istOffen() { return this.#offen; }

  /**
   * Zeigt die Frage und liefert die Entscheidung.
   *
   * Mehrfaches Fragen während einer offenen Frage liefert dieselbe Antwort —
   * es stapeln sich keine Dialoge.
   *
   * @param {{titel?: string, text?: string, ja?: string, nein?: string}} [frage]
   * @returns {Promise<boolean>} true = bestätigt, false = abgelehnt
   */
  frage({ titel = 'Sicher?', text = '', ja = 'Ja', nein = 'Abbrechen' } = {}) {
    if (!this.#bereit) return Promise.resolve(false);
    if (this.#offen && this.#loese) return this.#loese.promise;
    this.#offen = true;
    this.#titel.textContent = titel;
    this.#text.textContent = text;
    this.#text.hidden = text === '';
    this.#ja.textContent = ja;
    this.#nein.textContent = nein;
    // Fokus VOR `inert` merken: Wird ein Vorfahre inert, gibt der Browser den
    // Fokus auf; danach wäre `activeElement` nicht mehr das Ursprungselement.
    this.#vorherigerFokus = this.#doc.activeElement ?? null;
    for (const id of INERT_WAEHREND_FRAGE) {
      const el = this.#doc.getElementById(id);
      if (!el) continue;
      this.#inertVorher.set(id, el.inert === true);
      el.inert = true;
    }
    this.#overlay.hidden = false;
    // Fokus auf die Bestätigung: Enter bestätigt, Esc lehnt ab (wie beim
    // nativen Dialog, dessen OK-Knopf den Fokus hat).
    this.#ja.focus({ preventScroll: true });
    let aufloesen;
    const promise = new Promise(resolve => { aufloesen = resolve; });
    this.#loese = { promise, aufloesen };
    return promise;
  }

  /** Schließt die Frage und gibt die Antwort weiter. */
  #beantworte(antwort) {
    if (!this.#offen) return;
    const offen = this.#loese;
    this.#offen = false;
    this.#loese = null;
    this.#overlay.hidden = true;
    for (const [id, vorher] of this.#inertVorher) {
      const el = this.#doc.getElementById(id);
      if (el) el.inert = vorher;
    }
    this.#inertVorher.clear();
    const zurueck = this.#vorherigerFokus;
    this.#vorherigerFokus = null;
    /*
     * Fokus nur zurückgeben, wenn das Ziel noch bedienbar ist. Ein Dialog kann
     * aus einem Dropdown heraus geöffnet werden, das während der Frage
     * geschlossen wurde — dann läge der Fokus auf einem unsichtbaren Knopf.
     */
    if (zurueck && typeof zurueck.focus === 'function' && this.#doc.contains?.(zurueck)
      && !zurueck.closest?.('[hidden]')
      && (typeof zurueck.getClientRects !== 'function' || zurueck.getClientRects().length > 0)) {
      zurueck.focus({ preventScroll: true });
    }
    offen?.aufloesen(Boolean(antwort));
  }

  /** Tastatur: Esc = Nein, Tab = Fokusfalle, Enter auf dem Dialog = Ja. */
  #taste(ereignis) {
    if (!this.#offen) return;
    // Nichts davon darf das Spiel erreichen (R, E, Leertaste, Pfeile …).
    ereignis.stopPropagation();
    if (ereignis.key === 'Escape') {
      ereignis.preventDefault();
      this.#beantworte(false);
      return;
    }
    if (ereignis.key === 'Tab') {
      const knoepfe = [this.#ja, this.#nein];
      const index = knoepfe.indexOf(this.#doc.activeElement);
      const ziel = ereignis.shiftKey
        ? knoepfe[(index <= 0 ? knoepfe.length : index) - 1]
        : knoepfe[(index + 1) % knoepfe.length];
      ereignis.preventDefault();
      ziel.focus({ preventScroll: true });
      return;
    }
    if (ereignis.key === 'Enter') {
      // Liegt der Fokus auf einem Knopf, löst der Browser ihn selbst aus
      // (keydown → click). Sonst gilt Enter als Bestätigung.
      if (this.#overlay.contains(this.#doc.activeElement)) return;
      ereignis.preventDefault();
      this.#beantworte(true);
    }
  }
}

export default Bestaetigung;
