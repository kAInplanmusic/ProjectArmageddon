/**
 * WASM-Ballistik-Wrapper (Stub für WebAssembly-Implementierung).
 *
 * Wird später durch eine kompilierte WASM-Ballistik-Engine ersetzt.
 * Aktuell leitet an ballistics.js weiter.
 *
 * @module ballisticsWasm
 */

import { computeTrajectory, computeAimAngle, ccdRaycast } from './ballistics.js';

export { computeTrajectory, computeAimAngle, ccdRaycast };

/**
 * Prüft, ob WebAssembly verfügbar ist.
 * @returns {boolean}
 */
export function isWasmSupported() {
  try {
    return typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function';
  } catch {
    return false;
  }
}
