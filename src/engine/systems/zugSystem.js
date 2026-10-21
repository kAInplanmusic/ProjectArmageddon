/**
 * Zugregeln der Fassung 2 (`config.zugregeln`, `shared/config/zugregeln.js`): Rückzugszeit nach dem Schuss, Zug
 * überspringen und Aufgeben. Aus `match.js` herausgehalten (Zeilenbudget, AGENTS.md §3).
 *
 * Das System liest und schreibt nur über die Aufrufer-Schnittstelle `m` (öffentliche Zugriffe des Matches plus
 * die zwei Rückruffunktionen); Zufall und Uhr kommen nicht vor — alles zählt in Takten.
 *
 * ## Rückzug
 * Sobald der Schuss ausgewirkt hat (nichts fliegt mehr), läuft die Frist `rueckzugSekunden`. Währenddessen sperrt die
 * Engine den zweiten Schuss ohnehin (`hasFired`); Gehen und Springen bleiben erlaubt. Der Zug endet, wenn die Frist
 * abläuft, die aktive Figur Schaden nimmt (Lebenspunkte sinken unter den Wert am Fristbeginn) oder stirbt. Die Zugzeit
 * zählt in der Frist nicht mehr: Wer kurz vor Ablauf schießt, bekommt trotzdem seinen Rückzug.
 *
 * @module zugSystem
 */

import { ZUGREGELN } from '../../shared/config/zugregeln.js';
import { SIMULATION_HZ } from '../../shared/config/network.js';

export class ZugSystem {
  #m;
  #hatGeschossen;
  #beendeZug;
  #rest = null; // verbleibende Takte der Rückzugsfrist, null = nicht gestartet
  #leben0 = 0;
  #uebersprungen = new Map(); // Spieler -> Überspringen in Folge

  /**
   * @param {object} m das Match (öffentlich: world, events, activePlayerId, isPlayerAlive, turnPauseMs)
   * @param {() => boolean} hatGeschossen ob in diesem Zug schon geschossen wurde
   * @param {() => void} beendeZug beendet den Zug (`Match#endTurn`)
   */
  constructor(m, hatGeschossen, beendeZug) { this.#m = m; this.#hatGeschossen = hatGeschossen; this.#beendeZug = beendeZug; }

  /** Verbleibende Rückzugszeit in ms (0 = keine Frist). */
  get rueckzugMs() { return this.#rest === null ? 0 : Math.round(this.#rest * 1000 / SIMULATION_HZ); }

  #leben(id) { return this.#m.world.getComponent(id, 'Health', 'current') ?? 0; }

  /**
   * Pro Takt nach der Simulation: Soll der Zug jetzt enden?
   * @param {boolean} ruhe nichts fliegt mehr
   * @param {boolean} zeitUm die Zugzeit ist abgelaufen
   */
  zugEnde(ruhe, zeitUm) {
    const id = this.#m.activePlayerId;
    if (!this.#hatGeschossen()) return zeitUm;
    if (this.#rest === null) {
      if (!ruhe) return zeitUm;
      this.#rest = Math.round(ZUGREGELN.rueckzugSekunden * SIMULATION_HZ);
      this.#leben0 = this.#leben(id);
      this.#m.events.emit('rueckzug', { playerId: id, ms: this.rueckzugMs });
      return false;
    }
    this.#rest = Math.max(0, this.#rest - 1);
    if (this.#leben(id) < this.#leben0) return true; // Schaden beendet die Frist früher
    return this.#rest === 0 && (ruhe || zeitUm); // Frist um: der Zug endet erst, wenn nichts mehr fliegt (Zugzeit als Notbremse)
  }

  /** Beim Zugwechsel: Frist löschen; ein Schuss setzt den Überspringen-Zähler zurück. */
  neuerZug(vorher, hatGeschossen) {
    this.#rest = null;
    if (hatGeschossen) this.#uebersprungen.delete(vorher);
  }

  /** Zug ohne Schuss beenden (nur der aktive Spieler, nicht in der Zugpause, begrenzt in Folge). */
  ueberspringen(playerId) {
    const m = this.#m;
    if (playerId !== m.activePlayerId || !m.isPlayerAlive(playerId)) return { ok: false, errors: ['Nur der aktive Spieler kann seinen Zug überspringen'] };
    if (m.turnPauseMs > 0) return { ok: false, errors: ['Zugpause: der Zug beginnt gleich'] };
    if (this.#hatGeschossen()) return { ok: false, errors: ['In diesem Zug wurde bereits geschossen'] };
    const n = this.#uebersprungen.get(playerId) ?? 0;
    if (n >= ZUGREGELN.maxUeberspringenInFolge) return { ok: false, errors: ['Zug überspringen: höchstens zweimal hintereinander'] };
    this.#uebersprungen.set(playerId, n + 1);
    m.events.emit('turn_skipped', { playerId, reason: 'passt' });
    this.#beendeZug();
    return { ok: true };
  }

  /** Aufgeben: die Figur zählt als besiegt (Leben 0; das Schadenssystem verbucht den Tod im nächsten Takt). */
  aufgeben(playerId) {
    const m = this.#m;
    if (!m.isPlayerAlive(playerId)) return { ok: false, errors: ['Spieler ist nicht mehr im Spiel'] };
    m.world.setComponent(playerId, 'Health', 'current', 0);
    m.events.emit('aufgegeben', { playerId });
    return { ok: true };
  }
}
