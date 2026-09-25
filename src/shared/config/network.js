/**
 * Netzwerk-Regel-Konfiguration für ProjectArmageddon.
 */
export const NETWORK_RULES = Object.freeze({
  authoritativeServer: true,
  protocol: 'binary-websocket',
  lagCompensationBufferMs: 200,
  deterministicSeeds: true,
  clientValidatedInputs: Object.freeze(['angle', 'power']),
  projectileCollisionMode: 'ccd-raycast'
});

/**
 * Der Simulationstakt — EINE Zahl für Server und Client.
 *
 * FUND (belegt, Audit-Bericht): Der Takt stand ZWEIMAL im Baum, je einmal pro
 * Seite — `SIMULATION_HZ = 60` in `src/server/gameServer.js` und
 * `TICKS_PER_SECOND = 60` in `src/client/networkClient.js`. Beide leiteten
 * daraus ihr eigenes `TICK_MS` ab. Solange beide 60 sagen, fällt nichts auf;
 * ändert jemand eine der beiden, zählt der Client Ticks anders als der Server
 * sie erzeugt — und das äußert sich nicht als Fehler, sondern als Client, der
 * Eingaben auf den falschen Tick bezieht. Zwei Zahlen für dieselbe Tatsache
 * sind eine Regel an zwei Stellen.
 *
 * Der Wert gehört hierher, weil BEIDE Seiten ihn lesen müssen. `src/shared`
 * darf keine Node-Builtins laden (`tests/source-boundaries.test.js`) — eine
 * reine Konstantendatei tut das nicht.
 */
export const SIMULATION_HZ = 60;

/** Dauer eines Simulationstakts in Millisekunden. Abgeleitet, nie doppelt. */
export const TICK_MS = 1000 / SIMULATION_HZ;
