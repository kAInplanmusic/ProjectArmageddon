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
