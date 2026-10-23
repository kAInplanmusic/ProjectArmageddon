/**
 * Kleine Rechenhilfen für die Darstellung.
 *
 * Begrenzen und Glätten standen mehrfach als eigene Kopie in Client-Modulen. Als reine
 * Funktionen ohne Browserbezug sind sie hier gemeinsam nutzbar.
 *
 * @module mathe
 */

/** Ein voller Kreis im Bogenmaß. */
export const TWO_PI = Math.PI * 2;

/** Begrenzt `wert` auf `[min, max]`; nicht endliche Werte werden `min`. */
export function begrenze(wert, min, max) {
  const n = Number(wert);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}

/** Begrenzt `wert` auf `[0, 1]` (nicht endliche Werte werden 0). */
export const begrenze01 = wert => begrenze(wert, 0, 1);

/** Weicher Übergang (Smoothstep) zwischen `a` und `b`, außerhalb 0 bzw. 1. */
export function glatt(a, b, x) {
  const t = begrenze01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Weicher Übergang auf `[0, 1]` (Smoothstep über das ganze Intervall). */
export const glatt01 = u => glatt(0, 1, u);

export default { TWO_PI, begrenze, begrenze01, glatt, glatt01 };
