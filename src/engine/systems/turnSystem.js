/**
 * ECS-System: Turn-Wystem
 *
 * Verwaltet die Turn-Reihenfolge, Turn-Dauer und Runden-Fortschritt.
 * Change-Listener für UI-Updates.
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

  /**
   * @param {object} options
   * @param {number} options.playerCount - Anzahl der Spieler (2-8)
   * @param {number} options.turnDuration - Turn-Dauer in Millisekunden
   */
  constructor({ playerCount = 2, turnDuration = 30000 } = {}) {
    this.#playerCount = playerCount;
    this.#turnDuration = turnDuration;
    this.#currentPlayer = 0;
    this.#elapsedTime = 0;
    this.#listeners = [];
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

    if (this.#elapsedTime >= this.#turnDuration) {
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

  /**
   * Registriert einen Change-Listener.
   * @param {function} callback
   */
  addListener(callback) {
    this.#listeners.push(callback);
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

  // Signatur für Entity-Abfragen (dieses System braucht keine spezifischen Komponenten)
  get signature() { return 0; }
}

export default TurnSystem;

// Konfiguration für Turn-Timer basierend auf Spieleranzahl
export function getTurnDurationForPlayerCount(playerCount) {
  if (playerCount <= 2) {
    return MATCH_RULES.turnTimers.duelSeconds.minimum * 1000;
  }
  if (playerCount <= 4) {
    return MATCH_RULES.turnTimers.fourPlayerSeconds.minimum * 1000;
  }
  return 15000; // 15 Sekunden für größere Teams
}

export { COMPONENT_SIGNATURES };
