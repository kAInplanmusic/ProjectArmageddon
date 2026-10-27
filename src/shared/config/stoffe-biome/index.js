/**
 * Materialwerte der Biome: je Material Optik, Zerstörbarkeit und Bewegung (Spezifikation:
 * `docs/biome/material-spezifikation.md`). Reine Daten; noch nicht in den Spielkatalog `stoffe.js`
 * eingebunden — das ist ein eigener Schritt mit Versionsmarke.
 */
import teil1 from './teil1.js';
import teil2 from './teil2.js';
import teil3 from './teil3.js';

export const MATERIALIEN_BIOME = Object.freeze([...teil1, ...teil2, ...teil3]);
