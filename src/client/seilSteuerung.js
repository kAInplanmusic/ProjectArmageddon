/**
 * Seilsteuerung im Client (Seilfassung 2, `engine/seil.js`) — Handhabung wie in Worms Armageddon.
 *
 *   F / Touch „Seil" / Waffenmenü „Seil"   Seil wählen (noch einmal: abwählen)
 *   Feuertaste (Leertaste, Shift, FEUER)   mit gewähltem Seil: Seil schießen (Zielwinkel, nie unter den Horizont);
 *                                          am Seil: lösen. Mit anderer Waffe am Seil: die Waffe feuert (löst das Seil)
 *   A/D, ←/→ (Touch: Laufknöpfe)           am Seil: Schwung nach links/rechts
 *   W/S, ↑/↓ (Touch: Seil ▲/▼)             am Seil: einholen/ausfahren (statt zielen)
 *   Enter (Sprungtaste)                    am Seil mit gewählter Waffe: fallen lassen (Kraft 0); mit Seil: lösen
 *
 * Der Client rechnet nichts Autoritatives (AGENTS.md §6): Lokal geht jede Aktion in den Motor, online als
 * `seil`-Nachricht an den Server. Ob die Figur hängt, liest er aus dem Zustand (`state.seil`, online aus den
 * Ereignissen `seil_*`).
 *
 * @module seilSteuerung
 */
import { SEIL } from '../shared/config/seil.js';

export class SeilSteuerung {
  #k;
  #sx = 0;
  #sy = 0;
  /** Seil gewählt (statt einer Waffe)? Reiner Anzeigezustand des Clients. */
  gewaehlt = false;

  /**
   * @param {object} kontext
   * @param {function():string} kontext.modus - 'local' | 'online' | 'replay'
   * @param {function():object|null} kontext.match - lokaler Motor
   * @param {function():object|null} kontext.network - Netzclient
   * @param {function():object|null} kontext.zustand - aktueller Ansichtszustand
   * @param {function():number} kontext.winkel - Zielwinkel
   * @param {function(string, string=):void} kontext.log - Protokollzeile
   */
  constructor(kontext) {
    this.#k = kontext;
  }

  #online() { return this.#k.modus() === 'online'; }

  /** Die Figur am Zug — nur, wenn sie diesem Client gehört (online) bzw. lokal immer. */
  #amZug() {
    const zustand = this.#k.zustand();
    if (!zustand || zustand.status !== 'playing') return null;
    if (this.#online() && !this.#k.network()?.isMyTurn) return null;
    if (!this.#online() && this.#k.modus() !== 'local') return null;
    return zustand.activePlayerId ?? null;
  }

  /** Gibt es das Seil in dieser Partie? Online entscheidet der Server (er lehnt ab, wenn nicht). */
  verfuegbar() {
    return this.#online() ? true : Boolean(this.#k.match()?.seilSystem);
  }

  /** Hängt die eigene Figur am Zug gerade am Seil? */
  haengt() {
    const id = this.#amZug();
    const seil = this.#k.zustand()?.seil;
    return id !== null && Boolean(seil?.haengt) && seil.playerId === id;
  }

  #sende(eingabe) {
    const id = this.#amZug();
    if (id === null) return { ok: false, errors: ['Nicht am Zug'] };
    if (this.#online()) {
      return this.#k.network()?.sendSeil?.(eingabe) ? { ok: true, pending: true } : { ok: false, errors: ['Nicht verbunden'] };
    }
    const ergebnis = this.#k.match()?.seilSystem?.eingabe(id, eingabe) ?? { ok: false, errors: ['Kein Seil in dieser Partie'] };
    if (!ergebnis.ok && eingabe.aktion !== 'steuer') this.#k.log(ergebnis.errors?.[0] ?? 'Seil nicht möglich', 'notice');
    return ergebnis;
  }

  /** Taste F / Knopf: Seil wählen oder abwählen. */
  waehle(an = !this.gewaehlt) {
    if (an && !this.verfuegbar()) { this.#k.log('Das Seil gibt es in dieser Partie nicht', 'notice'); return false; }
    this.gewaehlt = an;
    this.#k.log(an ? 'Seil gewählt — Feuertaste schießt, am Seil löst sie' : 'Seil abgewählt');
    return true;
  }

  /** Eine Waffe wurde gewählt: das Seil ist dann nicht mehr die aktive Wahl. */
  waffeGewaehlt() { this.gewaehlt = false; }

  /** Feuertaste. `true` = vom Seil erledigt (kein Waffenschuss). */
  feuer() {
    if (this.haengt()) {
      if (!this.gewaehlt) return false; // andere Waffe gewählt: sie feuert vom Seil (der Motor löst es)
      this.#sx = 0;
      this.#sy = 0;
      this.#sende({ aktion: 'loesen' });
      return true;
    }
    if (!this.gewaehlt) return false;
    const winkel = Math.max(SEIL.winkelMin, Math.min(SEIL.winkelMax, this.#k.winkel()));
    this.#sende({ aktion: 'schuss', winkel });
    return true;
  }

  /** Sprungtaste. Am Seil: mit Seil lösen, mit Waffe fallen lassen (Kraft 0). `true` = erledigt. */
  sprung() {
    if (!this.haengt()) return false;
    if (this.gewaehlt) return this.feuer();
    const id = this.#amZug();
    if (this.#online()) this.#k.network()?.sendInput?.(Math.PI / 2, 0);
    else {
      const ergebnis = this.#k.match()?.fire(id, Math.PI / 2, 0);
      if (ergebnis && !ergebnis.ok) this.#k.log(`Abwurf verweigert: ${ergebnis.errors?.[0] ?? 'unbekannt'}`, 'notice');
    }
    return true;
  }

  /** Links/rechts: am Seil Schwung (wird wie das Gehen erneuert). `true` = erledigt. */
  lauf(richtung) {
    if (!this.haengt()) { this.#sx = 0; return false; }
    this.#sx = richtung;
    this.#sende({ aktion: 'steuer', sx: this.#sx, sy: this.#sy });
    return true;
  }

  /** Hoch (+1) / runter (−1) / los (0): am Seil einholen bzw. ausfahren. `true` = erledigt (nicht zielen). */
  vertikal(richtung) {
    if (!this.haengt()) { this.#sy = 0; return false; }
    this.#sy = -richtung; // hoch = einholen = kürzer
    this.#sende({ aktion: 'steuer', sx: this.#sx, sy: this.#sy });
    return true;
  }
}

export default SeilSteuerung;
