/**
 * Bedienung der Kameraeffekte im Einstellungs-Dropdown (KAMERA C6) und die
 * Kettenanzeige auf dem Spielfeld (KAMERA C5).
 *
 * ## Warum das hier steht und nicht in `main.js`
 *
 * `src/client/main.js` ist eine gemeinsame Datei und wird von diesem Auftrag
 * nur gelesen. Die Menüanbindung braucht aber einen Aufhänger im Browser. Der
 * liegt in `kameraSteuerung.js`: Sie wird ohnehin mit Canvas und Fenster
 * gebaut und erzeugt diese Bedienung in ihrem Konstruktor. Damit gibt es keine
 * stille Zweitverdrahtung — wer die Kamerabedienung baut, baut auch ihr Menü.
 *
 * ## Speicher
 *
 * Ein Eintrag (`pa.kameraeffekte`, JSON). Lesen und Schreiben sind gekapselt:
 * Ein gesperrter Speicher (Privatmodus, eingebettete Ansicht) darf das Spiel
 * nicht aufhalten, dann gelten die Vorgaben. Fehlerhafte Werte werden über
 * `normalisiereKameraEffekte` einzeln ersetzt, nicht als Ganzes verworfen.
 *
 * ## Bedienung
 *
 * - Der Bebenknopf schaltet durch `Aus → Leicht → Normal → Stark` (ein Knopf,
 *   damit die Pfeiltasten-Navigation des Dropdowns unverändert bleibt — ein
 *   `select` bräuchte die Pfeile selbst).
 * - Die drei Schalter sind `aria-pressed`-Knöpfe wie der Musikschalter.
 * - Alles bleibt reine Anzeige; kein Wert erreicht Engine, Hash oder Replay.
 *
 * @module kameraEffekteBedienung
 */
import {
  kameraEffekte, KAMERA_EFFEKTE_SCHLUESSEL, normalisiereKameraEffekte,
  naechsteBebenStufe, bebenText, BEBEN_STUFEN,
} from './kameraEffekte.js';

/** Anzeigedauer der Kettenanzeige in Millisekunden (ein Zug kann lange dauern). */
export const KETTE_ANZEIGE_MS = 2600;

/** Beschriftung der Schalter; Reihenfolge = Reihenfolge im Menü. */
const SCHALTER = Object.freeze([
  { art: 'knapp', text: 'Knapp vorbei', titel: 'Knapp-vorbei-Zoom: kurzer Zoom, wenn ein Geschoss eine Figur fast trifft' },
  { art: 'wasser', text: 'Wasser-Sturz', titel: 'Wasser-Sturz: kurzer Blick auf eine Figur, die unter Wasser geht' },
  { art: 'ketten', text: 'Kettenzähler', titel: 'Kettenzähler: zeigt, wie viele Ziele ein Schuss nacheinander erwischt' },
  { art: 'zeitlupe', text: 'Zeitlupe', titel: 'Zeitlupe: verlangsamt die Darstellung bei extremen Schüssen (≥250 Schaden oder ≥3 Tote)' },
]);

/** Speicher mit try/catch — ohne `localStorage` läuft alles mit den Vorgaben. */
function speicher() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export class KameraeffekteBedienung {
  #doc;

  #ablage;

  #bebenKnopf;

  #schalter;

  #kette;

  #ketteZeit = null;

  #abbestellen;

  /**
   * @param {object} [p]
   * @param {Document} [p.doc]
   * @param {Storage|null} [p.speicher] Tests: eigener Speicher
   */
  constructor({ doc = globalThis.document ?? null, speicher: ablage = speicher() } = {}) {
    this.#doc = doc;
    this.#ablage = ablage;
    this.#bebenKnopf = doc?.getElementById('kamera-beben') ?? null;
    this.#schalter = new Map();
    this.#kette = doc?.getElementById('kamera-kette') ?? null;
    this.#lade();
    this.#binde();
    this.#abbestellen = kameraEffekte.abonniere(() => this.aktualisiere());
    this.aktualisiere();
  }

  /** Gespeicherten Stand laden; ohne gültigen Eintrag bleiben die Vorgaben. */
  #lade() {
    let roh = null;
    try { roh = this.#ablage?.getItem(KAMERA_EFFEKTE_SCHLUESSEL) ?? null; } catch { roh = null; }
    if (!roh) return;
    try {
      kameraEffekte.setzeAlles(normalisiereKameraEffekte(JSON.parse(roh)));
    } catch { /* kaputtes JSON: Vorgaben gelten weiter */ }
  }

  #speichere() {
    try {
      this.#ablage?.setItem(KAMERA_EFFEKTE_SCHLUESSEL, JSON.stringify(kameraEffekte.stand));
    } catch { /* gesperrter Speicher: Einstellung gilt nur für diese Sitzung */ }
  }

  #binde() {
    if (!this.#doc) return;
    this.#bebenKnopf?.addEventListener('click', () => {
      kameraEffekte.schalteBeben();
      this.#speichere();
      // Der Fokus bleibt auf dem Knopf; die neue Stufe steht im Text und im aria-label.
      this.aktualisiere();
    });
    for (const { art } of SCHALTER) {
      const knopf = this.#doc.querySelector(`#hud-menue [data-kamera-effekt="${art}"]`);
      if (!knopf) continue;
      this.#schalter.set(art, knopf);
      knopf.addEventListener('click', () => {
        kameraEffekte.setze(art, !kameraEffekte.stand[art]);
        this.#speichere();
        this.aktualisiere();
      });
    }
  }

  /** Menütexte, `aria-pressed` und die Kettenanzeige nachziehen. */
  aktualisiere() {
    if (!this.#doc) return;
    const stand = kameraEffekte.stand;
    if (this.#bebenKnopf) {
      const stufe = bebenText(stand.beben);
      const naechste = bebenText(naechsteBebenStufe(stand.beben));
      const text = this.#bebenKnopf.querySelector('[data-kamera-beben-text]');
      if (text) text.textContent = `Beben: ${stufe}`;
      this.#bebenKnopf.setAttribute('aria-label', `Kamerabeben: ${stufe}. Nächste Stufe: ${naechste}`);
      this.#bebenKnopf.setAttribute('title', `Kamerabeben: ${BEBEN_STUFEN.map(bebenText).join(', ')}`);
      this.#bebenKnopf.dataset.stufe = stand.beben;
    }
    for (const { art, text, titel } of SCHALTER) {
      const knopf = this.#schalter.get(art);
      if (!knopf) continue;
      const an = stand[art] === true;
      knopf.setAttribute('aria-pressed', String(an));
      knopf.setAttribute('title', titel);
      // Nur den Text ersetzen, nicht das Zeichen davor.
      const span = knopf.querySelector('span:not([aria-hidden])');
      if (span) span.textContent = `${text}: ${an ? 'an' : 'aus'}`;
      else knopf.textContent = `${text}: ${an ? 'an' : 'aus'}`;
    }
    this.#zeigeKette();
  }

  /**
   * Die Kettenanzeige: ab zwei Gliedern sichtbar, nach `KETTE_ANZEIGE_MS` weg.
   * Ein neuer Schuss (Anzahl 0) blendet sie sofort aus.
   */
  #zeigeKette() {
    if (!this.#kette) return;
    const kette = kameraEffekte.kette;
    if (!kameraEffekte.ketten || !kette.sichtbar) {
      this.#kette.hidden = true;
      this.#kette.textContent = '';
      this.#ketteZeit = null;
      return;
    }
    const texte = kette.glieder.map(g => g === 'Figur' ? 'Figur' : g).join(' · ');
    this.#kette.textContent = `Kette ×${kette.anzahl} — ${texte}`;
    this.#kette.hidden = false;
    if (this.#ketteZeit !== null) clearTimeout(this.#ketteZeit);
    this.#ketteZeit = setTimeout(() => {
      this.#ketteZeit = null;
      if (!this.#kette) return;
      this.#kette.hidden = true;
      this.#kette.textContent = '';
    }, KETTE_ANZEIGE_MS);
  }

  /** Abonnement lösen (Matchende, Tests). */
  ende() {
    this.#abbestellen?.();
    this.#abbestellen = null;
    if (this.#ketteZeit !== null) clearTimeout(this.#ketteZeit);
    this.#ketteZeit = null;
  }
}

export default KameraeffekteBedienung;
