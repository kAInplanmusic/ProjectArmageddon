/**
 * Gemeinsames Gitterrauschen für Terrain-Generatoren.
 *
 * Die Implementierung ist bewusst doppelt gehalten gewesen in
 * terrainGen2.js und terrainGen3.js — beide Rumpfe sind bytegleich.
 * Hier liegt die einzige Quelle.
 */

/**
 * Erzeugt ein Wertrauschen über einem 2D-Gitter.
 *
 * @param {object} rng - SeededRandom mit `next()`
 * @param {number} spalten - Gitterpunkte in x
 * @param {number} zeilen - Gitterpunkte in y
 * @returns {(fx:number, fy:number) => number} Wert in [0,1]
 */
export function gitterrauschen(rng, spalten, zeilen) {
  const punkte = new Float32Array((spalten + 1) * (zeilen + 1));
  for (let i = 0; i < punkte.length; i += 1) punkte[i] = rng.next();

  /** Weiche Interpolation (smoothstep) — verhindert sichtbare Gitterkanten. */
  const glatt = t => t * t * (3 - 2 * t);

  return (fx, fy) => {
    const x = Math.max(0, Math.min(spalten - 1e-6, fx * spalten));
    const y = Math.max(0, Math.min(zeilen - 1e-6, fy * zeilen));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = glatt(x - x0);
    const ty = glatt(y - y0);

    const i = (px, py) => punkte[py * (spalten + 1) + px];
    const oben = i(x0, y0) + (i(x0 + 1, y0) - i(x0, y0)) * tx;
    const unten = i(x0, y0 + 1) + (i(x0 + 1, y0 + 1) - i(x0, y0 + 1)) * tx;
    return oben + (unten - oben) * ty;
  };
}
