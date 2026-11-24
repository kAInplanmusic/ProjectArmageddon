/**
 * Einstieg (TODO 2.11): eine kurze, überspringbare Führung in der allerersten lokalen Partie.
 *
 * Vier Schritte, jeder endet, sobald der Spieler ihn TUT (nicht nach Zeit): Zielen, Laden und Feuern, Waffe wechseln, Zündzeit.
 * Die Zündzeit erklärt sich nur, wenn eine Zünderwaffe gewählt ist; sonst endet der Schritt nach `ZUENDZEIT_ZEIGEN_MS` von selbst.
 * Insgesamt höchstens `HOECHSTDAUER_MS` (60 s), dann ist die Führung vorbei. „Überspringen“ beendet sie sofort. Danach steht im
 * Speicher `SCHLUESSEL`, und keine Partie zeigt sie wieder.
 *
 * Die Logik (`Einstieg`) kennt kein DOM und keine Uhr: Zeit und Beobachtungen kommen als Zahlen herein. `EinstiegAnzeige` bindet sie an
 * das Feld `#einstieg` im HUD. Reine Darstellung, keine Auswirkung auf Simulation oder Replay.
 *
 * @module einstieg
 */

/** Speicherschlüssel: gesetzt, sobald die Führung einmal durchlaufen oder übersprungen wurde. */
export const SCHLUESSEL = 'pa.einstieg.v1';
/** Höchstdauer der ganzen Führung (ms). */
export const HOECHSTDAUER_MS = 60_000;
/** So lange steht der Zündzeit-Hinweis, wenn keine Zünderwaffe gewählt ist (ms). */
export const ZUENDZEIT_ZEIGEN_MS = 7000;
/** Ab dieser Winkeländerung (rad) gilt „gezielt“. */
const ZIELEN_AB = 0.15;

export const SCHRITTE = Object.freeze([
  Object.freeze({ id: 'zielen', text: 'Zielen: W / S oder die Maus bewegt den Winkel.' }),
  Object.freeze({ id: 'feuern', text: 'Feuern: Leertaste halten lädt die Kraft, Loslassen schießt. Länger halten fliegt weiter.' }),
  Object.freeze({ id: 'waffe', text: 'Waffe wechseln: Tasten 1 bis 9, oder E öffnet das Waffenmenü.' }),
  Object.freeze({ id: 'zuendzeit', text: 'Zündzeit: Bei Zünderwaffen stellt Z ein, wann die Ladung hochgeht.' }),
]);

export class Einstieg {
  #schritt = 0;
  #start = null;
  #schrittStart = null;
  #winkel0 = null;
  #waffe0 = null;
  #fertig = false;

  /** Läuft die Führung noch? */
  get aktiv() { return !this.#fertig; }

  /** Der aktuelle Schritt (oder `null`, wenn fertig). */
  get schritt() { return this.#fertig ? null : SCHRITTE[this.#schritt]; }

  /** Nummer des aktuellen Schritts (1 bis 4). */
  get nummer() { return this.#schritt + 1; }

  /** Überspringen: sofort fertig. */
  ueberspringen() { this.#fertig = true; }

  /**
   * Ein Bild: Beobachtungen auswerten.
   * @param {{jetzt:number, winkel:number, waffe:string|null, geschossen:boolean, zuenderwaffe:boolean, zuendzeitGestellt:boolean}} b
   * @returns {boolean} ob sich der Schritt geändert hat (Anzeige neu)
   */
  beobachte({ jetzt, winkel, waffe, geschossen = false, zuenderwaffe = false, zuendzeitGestellt = false }) {
    if (this.#fertig) return false;
    if (this.#start === null) { this.#start = jetzt; this.#schrittStart = jetzt; this.#winkel0 = winkel; this.#waffe0 = waffe; }
    if (jetzt - this.#start >= HOECHSTDAUER_MS) { this.#fertig = true; return true; }
    const id = SCHRITTE[this.#schritt].id;
    let erledigt = false;
    if (id === 'zielen') erledigt = Number.isFinite(winkel) && Math.abs(winkel - this.#winkel0) >= ZIELEN_AB;
    else if (id === 'feuern') erledigt = geschossen;
    else if (id === 'waffe') erledigt = waffe !== null && waffe !== this.#waffe0;
    else if (id === 'zuendzeit') erledigt = zuendzeitGestellt || (!zuenderwaffe && jetzt - this.#schrittStart >= ZUENDZEIT_ZEIGEN_MS);
    if (!erledigt) return false;
    this.#schritt += 1;
    this.#schrittStart = jetzt;
    this.#waffe0 = waffe; // für den Waffenschritt zählt ein Wechsel ab jetzt
    if (this.#schritt >= SCHRITTE.length) this.#fertig = true;
    return true;
  }
}

/** Soll die Führung starten? Nur, wenn der Speicher sie noch nicht kennt (ohne Speicher: nein, keine Endlosschleife). */
export function einstiegFaellig(speicher = globalThis.localStorage) {
  try { return speicher?.getItem(SCHLUESSEL) !== '1'; } catch { return false; }
}

/** Merkt, dass die Führung gesehen wurde. */
export function merkeEinstieg(speicher = globalThis.localStorage) {
  try { speicher?.setItem(SCHLUESSEL, '1'); } catch { /* kein Speicher */ }
}

/**
 * Anzeige im HUD (`#einstieg`: Text, Schrittzähler, Knopf „Überspringen“). Aufbau per DOM (textContent, kein innerHTML).
 */
export class EinstiegAnzeige {
  #feld;
  #text;
  #zaehler;
  #logik;
  #speicher;

  constructor({ doc = globalThis.document, logik = new Einstieg(), speicher = globalThis.localStorage } = {}) {
    this.#feld = doc?.getElementById?.('einstieg') ?? null;
    this.#text = doc?.getElementById?.('einstieg-text') ?? null;
    this.#zaehler = doc?.getElementById?.('einstieg-schritt') ?? null;
    this.#logik = logik;
    this.#speicher = speicher;
    doc?.getElementById?.('einstieg-ueberspringen')?.addEventListener?.('click', () => { this.#logik.ueberspringen(); this.#zeige(); });
    this.#zeige();
  }

  get logik() { return this.#logik; }

  /** Ein Bild: Beobachtungen weiterreichen, Anzeige bei Wechsel erneuern. */
  schritt(beobachtung) {
    if (this.#logik.beobachte(beobachtung)) this.#zeige();
  }

  #zeige() {
    const s = this.#logik.schritt;
    if (!s) {
      merkeEinstieg(this.#speicher);
      if (this.#feld) this.#feld.hidden = true;
      return;
    }
    if (this.#text) this.#text.textContent = s.text;
    if (this.#zaehler) this.#zaehler.textContent = `${this.#logik.nummer} / ${SCHRITTE.length}`;
    if (this.#feld) { this.#feld.hidden = false; this.#feld.dataset.schritt = s.id; }
  }
}
