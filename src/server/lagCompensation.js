/**
 * Lag-Kompensation über einen begrenzten Snapshot-Verlauf.
 *
 * Der Server hält die letzten ~200 ms an Zuständen. Eingehende Befehle werden
 * gegen den Tick gemessen, für den sie gedacht waren; liegt er im Fenster,
 * gilt der Befehl als gültig. Das ist die Grundlage für Reconnect-Rollback und
 * faire Trefferauswertung bei Netzwerklatenz.
 *
 * @module SnapshotHistory
 */
export const DEFAULT_HISTORY_MS = 200;

export class SnapshotHistory {
  #entries = [];
  #windowMs;
  #tickDurationMs;

  constructor({ windowMs = DEFAULT_HISTORY_MS, tickDurationMs = 1000 / 60 } = {}) {
    this.#windowMs = windowMs;
    this.#tickDurationMs = tickDurationMs;
  }

  get windowMs() { return this.#windowMs; }

  /** Anzahl der Ticks, die in das Fenster passen (mindestens 1). */
  get windowTicks() {
    return Math.max(1, Math.floor(this.#windowMs / this.#tickDurationMs));
  }

  /** Speichert einen Zustand und verwirft zu alte Einträge. */
  push(tick, state) {
    this.#entries.push({ tick, state, at: Date.now() });
    const cutoff = tick - this.windowTicks;
    while (this.#entries.length > 0 && this.#entries[0].tick < cutoff) {
      this.#entries.shift();
    }
    return this;
  }

  /** Zustand für einen Tick, oder den nächstgelegenen älteren. */
  get(tick) {
    for (let i = this.#entries.length - 1; i >= 0; i--) {
      if (this.#entries[i].tick <= tick) return this.#entries[i];
    }
    return null;
  }

  get latest() {
    return this.#entries[this.#entries.length - 1] ?? null;
  }

  /** Prüft, ob ein Tick innerhalb des Kompensationsfensters liegt. */
  isWithinWindow(tick, currentTick) {
    if (!Number.isInteger(tick)) return false;
    return tick >= currentTick - this.windowTicks && tick <= currentTick;
  }

  get size() {
    return this.#entries.length;
  }

  clear() {
    this.#entries = [];
  }
}

export default SnapshotHistory;
