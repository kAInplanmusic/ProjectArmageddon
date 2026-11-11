/**
 * Bildzeit-Statistik der Messseite (`messung.html`) und des Profiling-Tests.
 *
 * Eine einzige Stelle für Perzentile und Bildkennzahlen: `tests/e2e/profiling.spec.mjs` und die
 * Messseite rechnen damit, statt je eine eigene Kopie zu pflegen (vorher standen Perzentil-Rechnungen
 * dreifach im Repo: Profiling-Test, `scripts/browser-perf.mjs`, Messseite). Reine Funktionen ohne
 * Browserbezug, damit sie in Node geprüft werden können.
 *
 * @module messung/statistik
 */

/** 60 Hz: ein Bild hat 16,7 ms (Grenze für „über 16,7 ms“; gerundet wie im Profiling-Test). */
export const BUDGET_60HZ_MS = 16.7;
/** Zwei verpasste 60-Hz-Bilder (Grenze für „über 33,4 ms“). */
export const BUDGET_30HZ_MS = 33.4;

/**
 * Perzentil aus einer AUFSTEIGEND sortierten Liste (Index `floor(n · anteil)`, wie im Profiling-Test).
 * @param {number[]} sortiert
 * @param {number} anteil 0..1
 */
export function perzentil(sortiert, anteil) {
  if (!sortiert.length) return 0;
  return sortiert[Math.min(sortiert.length - 1, Math.floor(sortiert.length * anteil))] ?? 0;
}

/**
 * Kennzahlen einer Bildzeitenfolge (Millisekunden je Bild).
 * @param {number[]} zeiten
 * @returns {{bilder:number, mittel:number, p50:number, p95:number, p99:number, max:number,
 *   ueber16:number, ueber33:number, fps:number}}
 */
export function bildStatistik(zeiten) {
  const sortiert = [...zeiten].sort((a, b) => a - b);
  const summe = sortiert.reduce((a, b) => a + b, 0);
  const mittel = sortiert.length ? summe / sortiert.length : 0;
  return {
    bilder: sortiert.length,
    mittel,
    p50: perzentil(sortiert, 0.5),
    p95: perzentil(sortiert, 0.95),
    p99: perzentil(sortiert, 0.99),
    max: sortiert[sortiert.length - 1] ?? 0,
    ueber16: sortiert.filter(z => z > BUDGET_60HZ_MS).length,
    ueber33: sortiert.filter(z => z > BUDGET_30HZ_MS).length,
    fps: mittel > 0 ? 1000 / mittel : 0,
  };
}

/** Rundet auf `stellen` Nachkommastellen (für lesbares JSON). */
export function runde(wert, stellen = 2) {
  if (!Number.isFinite(wert)) return null;
  const f = 10 ** stellen;
  return Math.round(wert * f) / f;
}

/** Mittelwert und Maximum einer Zeitenliste (Terrain-Neuaufbau). */
export function mittelUndMax(werte) {
  if (!werte.length) return { mittel: 0, max: 0 };
  return { mittel: werte.reduce((a, b) => a + b, 0) / werte.length, max: Math.max(...werte) };
}
