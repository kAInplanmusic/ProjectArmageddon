/**
 * Validiert und lädt ein zeilenweises Terrain-Bitmap-Format.
 * Werte ungleich null gelten als solide Pixel.
 */
import { CollisionMask } from './collisionMask.js';

export function terrainMaskFromBitmap(bitmap, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new TypeError('width und height müssen positive Ganzzahlen sein');
  }
  if (!ArrayBuffer.isView(bitmap) && !Array.isArray(bitmap)) {
    throw new TypeError('bitmap muss ein Array oder TypedArray sein');
  }
  return CollisionMask.fromBitmap(bitmap, width, height);
}

export function terrainMaskFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || !rows.every(row => typeof row === 'string')) {
    throw new TypeError('rows muss ein nichtleeres Array aus Strings sein');
  }
  const width = rows[0].length;
  if (width === 0 || !rows.every(row => row.length === width)) {
    throw new Error('Alle Terrain-Zeilen müssen dieselbe positive Breite haben');
  }
  const bitmap = rows.flatMap(row => [...row].map(char => char === '#' || char === '1' ? 1 : 0));
  return terrainMaskFromBitmap(bitmap, width, rows.length);
}

export default terrainMaskFromRows;