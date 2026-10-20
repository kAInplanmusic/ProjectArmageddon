/**
 * Zuschnitt von Kulissenbildern beliebigen Formats (cover mit Parallax).
 *
 * Das Bild füllt die Zeichenfläche ohne Verzerrung (gleicher Maßstab in x und y).
 * Überstehende Breite wird per Parallax-Anteil `pan` (0 = links, 1 = rechts)
 * verschoben; überstehende Höhe wird UNTEN abgeschnitten, damit Himmel und
 * Horizont sichtbar bleiben (das Terrain deckt die untere Hälfte).
 *
 * @module kulissenZuschnitt
 */

/**
 * @param {number} bildB - Bildbreite
 * @param {number} bildH - Bildhöhe
 * @param {number} flaecheB - Breite der Zeichenfläche
 * @param {number} flaecheH - Höhe der Zeichenfläche
 * @param {number} [pan=0.5] - horizontaler Anteil 0..1
 * @returns {{sx:number, sy:number, sb:number, sh:number}} Quellrechteck im Bild
 */
export function coverZuschnitt(bildB, bildH, flaecheB, flaecheH, pan = 0.5) {
  if (!(bildB > 0 && bildH > 0 && flaecheB > 0 && flaecheH > 0)) {
    return { sx: 0, sy: 0, sb: Math.max(bildB, 0), sh: Math.max(bildH, 0) };
  }
  const p = Number.isFinite(pan) ? Math.min(1, Math.max(0, pan)) : 0.5;
  const massstab = Math.max(flaecheB / bildB, flaecheH / bildH);
  const sb = flaecheB / massstab;
  const sh = flaecheH / massstab;
  return { sx: (bildB - sb) * p, sy: 0, sb, sh };
}

/** Stärke (0..0,3) des Glutfilters der Ragnarök-Stimmungen nach Runde. */
export function glutStaerke(runde) {
  const r = Number.isFinite(runde) ? Math.max(1, runde) : 1;
  return Math.min(0.3, ((r - 1) / 12) * 0.3);
}
