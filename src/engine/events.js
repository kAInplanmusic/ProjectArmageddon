/**
 * Leichtgewichtiger synchroner Event-Bus für Simulationsereignisse.
 *
 * Ereignisse werden pro Tick gepuffert und beim Flush in stabiler Reihenfolge
 * ausgeliefert. Damit können Rendering, Audio und Netzwerk denselben
 * Ereignisstrom konsumieren, ohne die Simulation zu beeinflussen.
 *
 * @module events
 */

/** Obergrenze der Warteschlange, damit sie ohne Abnehmer nicht unbegrenzt wächst. */
const MAX_QUEUE = 2000;

export class EventBus {
  #handlers = new Map();
  #queue = [];
  #history = [];
  #dropped = 0;

  on(type, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Event-Handler muss eine Funktion sein');
    }
    if (!this.#handlers.has(type)) this.#handlers.set(type, []);
    this.#handlers.get(type).push(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    const list = this.#handlers.get(type);
    if (!list) return;
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  }

  emit(type, payload = {}) {
    this.#queue.push({ type, payload });
    // Obergrenze: Die Warteschlange wird von `flush()` geleert, das der
    // Konsument aufruft. Ruft niemand ab (Headless-Läufe ohne Ereignisauswertung),
    // wüchse sie unbegrenzt. Die ältesten Einträge fallen dann heraus — dieselbe
    // Politik wie beim Verlauf.
    if (this.#queue.length > MAX_QUEUE) {
      this.#queue.splice(0, this.#queue.length - MAX_QUEUE);
      this.#dropped += 1;
    }
  }

  /** Anzahl wegen der Obergrenze verworfener Ereignisse (Diagnose). */
  get dropped() {
    return this.#dropped;
  }

  /** Liefert alle gepufferten Ereignisse in Reihenfolge des Auftretens. */
  flush() {
    const batch = this.#queue;
    this.#queue = [];
    this.#history.push(...batch);
    if (this.#history.length > 500) {
      this.#history.splice(0, this.#history.length - 500);
    }
    return batch;
  }

  /** Verteilt ein Ereignis sofort an registrierte Handler. */
  dispatch(type, payload = {}) {
    const list = this.#handlers.get(type);
    if (!list) return;
    for (const handler of [...list]) {
      handler(payload);
    }
  }

  /** Flusht den Puffer und verteilt jedes Ereignis an seine Handler. */
  drain() {
    const batch = this.flush();
    for (const { type, payload } of batch) {
      this.dispatch(type, payload);
    }
    return batch;
  }

  get pending() {
    return this.#queue.length;
  }

  get history() {
    return [...this.#history];
  }
}

export default EventBus;
