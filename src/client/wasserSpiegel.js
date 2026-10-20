/**
 * Wasserspiegelung: reine Optik im Wasserfeld des Renderers, ohne zusätzliche Ebene und ohne Zufall.
 *
 * Der Renderer rechnet das Wasser in einem Durchlauf über alle nassen Zellen (`#drawWater`). Die
 * Spiegelung ist ein Summand darin: In den obersten `SPIEGEL_TIEFE` Zellen unter dem Spiegel mischt
 * sich die Himmelsfarbe am Horizont in die Wasserfarbe, nach unten abklingend und in waagerechten,
 * langsam wandernden Streifen — so liest sich der Himmel (und mit ihm die Landmarken-Töne) als
 * gebrochenes Spiegelbild. Pro Zelle sind das einige Multiplikationen; die Zeit je Bild bleibt im
 * Rahmen der Profiling-Spezifikation (`tests/e2e/wasser-spiegelung.spec.mjs`).
 *
 * @module wasserSpiegel
 */

/** So viele Zellen (je 4 px) unter dem Spiegel zeigen die Spiegelung. */
export const SPIEGEL_TIEFE = 22;

/** Stärke der Beimischung an der Oberfläche (0 bis 1). */
export const SPIEGEL_STAERKE = 0.34;

/**
 * Farbe des Himmels am Horizont (letzte Verlaufsstufe der Kulisse), als [r, g, b].
 * Ohne Kulisse oder ohne lesbare Farbe: ein helles Blau.
 *
 * @param {{sky?:{colors?:string[]}}|null} scenery
 * @returns {number[]}
 */
export function spiegelFarbe(scenery) {
  const farben = scenery?.sky?.colors;
  const letzte = Array.isArray(farben) ? farben[farben.length - 1] : null;
  const treffer = typeof letzte === 'string' ? /#([0-9a-f]{6})/i.exec(letzte) : null;
  if (!treffer) return [170, 205, 232];
  const wert = parseInt(treffer[1], 16);
  return [(wert >> 16) & 255, (wert >> 8) & 255, wert & 255];
}

/**
 * Gewicht der Spiegelung in Zelle `(x, k)`: `k` ist die Tiefe unter dem Spiegel in Zellen.
 * 0 ab `SPIEGEL_TIEFE`; dazwischen klingt es linear ab und schwingt in Streifen
 * (Phase aus Zeit; bei „Bewegung reduzieren" steht sie).
 */
export function spiegelGewicht(x, k, phase) {
  if (k >= SPIEGEL_TIEFE) return 0;
  return SPIEGEL_STAERKE * (1 - k / SPIEGEL_TIEFE) * (0.65 + 0.35 * Math.sin(k * 1.9 + x * 0.17 + phase * 1.4));
}
