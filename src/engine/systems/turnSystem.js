/**
 * ECS-System: TurnSystem
 *
 * Verwaltet die Turn-Reihenfolge, Turn-Dauer und Runden-Fortschritt.
 * Change-Listener für UI-Updates.
 *
 * Mit `autoAdvance: false` übernimmt ein MatchController die Zugsteuerung
 * (Überspringen toter Spieler, Rundenwechsel) und nutzt dieses System nur noch
 * als Countdown. Der Standard bleibt autark, damit bestehende Aufrufer
 * unverändert funktionieren.
 *
 * @module TurnSystem
 */

import { MATCH_RULES } from '../../shared/config/match.js';
import { COMPONENT_SIGNATURES } from '../ecs/world.js';

export class TurnSystem {
  #world;
  #currentPlayer = 0;
  #elapsedTime = 0;
  #turnDuration = 0;
  #listeners = [];
  #isTurnActive = false;
  #playerCount = 0;
  #autoAdvance;
  #turnIndex = 0;

  /**
   * @param {object} options
   * @param {number} options.playerCount - Anzahl der Spieler (2-8)
   * @param {number} options.turnDuration - Turn-Dauer in Millisekunden
   * @param {boolean} [options.autoAdvance=true] - Automatisch weiterschalten
   */
  constructor({ playerCount = 2, turnDuration = 30000, autoAdvance = true } = {}) {
    this.#playerCount = playerCount;
    this.#turnDuration = turnDuration;
    this.#currentPlayer = 0;
    this.#elapsedTime = 0;
    this.#listeners = [];
    this.#autoAdvance = autoAdvance;
  }

  /**
   * Aktualisiert das Turn-System.
   * @param {object} world - ECS-World-Instanz
   * @param {number[]} entities - Aktive Entities
   * @param {number} dt - Delta-Zeit in ms
   */
  update(world, entities, dt) {
    this.#world = world;
    this.#elapsedTime += dt;

    if (this.#elapsedTime >= this.#turnDuration && this.#autoAdvance) {
      this.#endTurn();
    }
  }

  /**
   * Endet den aktuellen Turn und startet den nächsten.
   */
  #endTurn() {
    const oldPlayer = this.#currentPlayer;
    this.#currentPlayer = (this.#currentPlayer + 1) % this.#playerCount;
    this.#elapsedTime = 0;
    this.#isTurnActive = false;

    this.#notifyListeners({
      oldPlayer,
      newPlayer: this.#currentPlayer,
      event: 'turn_end'
    });
  }

  /**
   * Startet einen neuen Turn.
   */
  startTurn() {
    this.#elapsedTime = 0;
    this.#isTurnActive = true;

    this.#notifyListeners({
      player: this.#currentPlayer,
      event: 'turn_start'
    });
  }

  /** Setzt den aktiven Spielerindex (Controller-gesteuert). */
  setCurrentPlayer(index) {
    if (!Number.isInteger(index) || index < 0) {
      throw new TypeError('Spielerindex muss eine nichtnegative Ganzzahl sein');
    }
    this.#currentPlayer = index;
    this.#turnIndex = index;
    this.#elapsedTime = 0;
  }

  /** Setzt den Countdown zurück (Controller-gesteuert). */
  resetTimer(duration = null) {
    this.#elapsedTime = 0;
    if (duration !== null) this.#turnDuration = duration;
  }

  /** Verbleibende Zeit im aktuellen Turn in Millisekunden. */
  get remainingTime() {
    return Math.max(0, this.#turnDuration - this.#elapsedTime);
  }

  /**
   * Registriert einen Change-Listener.
   * @param {function} callback
   */
  addListener(callback) {
    this.#listeners.push(callback);
  }

  removeListener(callback) {
    const index = this.#listeners.indexOf(callback);
    if (index >= 0) this.#listeners.splice(index, 1);
  }

  #notifyListeners(event) {
    for (const callback of this.#listeners) {
      callback(event);
    }
  }

  // Getter
  get currentPlayer() { return this.#currentPlayer; }
  get elapsedTime() { return this.#elapsedTime; }
  get turnDuration() { return this.#turnDuration; }
  get isTurnActive() { return this.#isTurnActive; }
  get playerCount() { return this.#playerCount; }
  get autoAdvance() { return this.#autoAdvance; }

  // Signatur für Entity-Abfragen (dieses System braucht keine spezifischen Komponenten)
  get signature() { return 0; }
}

export default TurnSystem;

/**
 * Zugdauer nach KARTENGRÖSSE — die eine Quelle für Lobby, Server, HUD und
 * Replay-Kopf.
 *
 * Entscheidung des Auftraggebers (2026-11-05): klein 30 s, mittel 40 s, groß
 * 50 s. Größere Karte = längere Wege = mehr Bedenkzeit. Die Spielerzahl spielt
 * keine Rolle mehr; `turnDurationMs` einer Partie schlägt diesen Wert weiterhin.
 *
 * Eine unbekannte Stufe fällt auf die Vorgabe zurück, wie die übrige
 * Konfiguration — `krieg` (Altstufe, nur lesbar) bekommt die größte Zeit.
 *
 * @param {string} [groesse='mittel']
 * @returns {number} Millisekunden
 */
export function getTurnDurationForSize(groesse = 'mittel') {
  const stufe = MATCH_RULES.turnTimers[groesse];
  if (stufe) return stufe.seconds * 1000;
  if (groesse === 'krieg') return MATCH_RULES.turnTimers.gross.seconds * 1000;
  return MATCH_RULES.turnTimers.mittel.seconds * 1000;
}

/**
 * Zugdauer nach Spielerzahl — ALTPFAD (Zugzeitfassung 1).
 *
 * Diese Ableitung gilt nur noch für Aufzeichnungen, deren Kopf KEINE
 * `zugzeitFassung` trägt (vor 2026-11-05): 30 s bei ≤2 Spielern, 20 s bei 3–4,
 * fest 15 s ab 5. Für neue Partien ist `getTurnDurationForSize` die Quelle —
 * die Spielerzahl darf die Zugzeit nicht mehr beeinflussen.
 *
 * @param {number} playerCount
 * @returns {number} Millisekunden
 */
export function getTurnDurationForPlayerCount(playerCount) {
  if (playerCount <= 2) return 30_000;
  if (playerCount <= 4) return 20_000;
  return 15_000;
}

export { COMPONENT_SIGNATURES };
