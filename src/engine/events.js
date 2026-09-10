/**
 * Leichtgewichtiger synchroner Event-Bus für Simulationsereignisse.
 *
 * Ereignisse werden pro Tick gepuffert und beim Flush in stabiler Reihenfolge
 * ausgeliefert. Damit können Rendering, Audio und Netzwerk denselben
 * Ereignisstrom konsumieren, ohne die Simulation zu beeinflussen.
 *
 * @module events
 */
export class EventBus {
  #handlers = new Map();
  #queue = [];
  #history = [];

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
