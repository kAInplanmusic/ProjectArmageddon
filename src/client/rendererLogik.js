/**
 * Reine Darstellungslogik des Renderers, ohne Canvas und ohne Vite.
 *
 * WARUM DIESES MODUL EXISTIERT (A5/ENG-12)
 *
 * `renderer.js` ist eine 2500-Zeilen-Zeichenklasse: Konstruktor, Canvas,
 * Effekte, Figuren, HUD. Ein Test konnte sie nicht einmal LADEN, weil ihre
 * Importkette `import.meta.glob` auf Modulebene auswertete. Die Kistenlogik
 * (Farbe und sichtbare Marke) hängt dagegen an keiner Zeichenfläche — sie
 * gehört hierher, wo `node --test` sie direkt prüfen kann.
 *
 * Die Werte kommen aus denselben Quellen wie im Motor: `RARITY_IDS` und
 * `CRATE_TYPES` aus `engine/systems/lootSystem.js`, die Farben aus
 * `shared/config/loot.js`. Keine zweite Farbliste (ENG-3).
 *
 * @module rendererLogik
 */
import { CRATE_TYPES, RARITY_IDS } from '../engine/systems/lootSystem.js';
import { LOOT_DROP_RULES } from '../shared/config/loot.js';

/**
 * Seltenheitsfarbe einer Kiste. Unbekannte Stufen fallen auf `standard`
 * zurück, damit ein alter Snapshot keine Ausnahme im Zeichenpfad auslöst.
 *
 * @param {number} stufe - Index in `RARITY_IDS`
 * @returns {string}
 */
export const kistenFarbe = stufe =>
  LOOT_DROP_RULES.rarityColors[RARITY_IDS[stufe]] ?? LOOT_DROP_RULES.rarityColors.standard;

/**
 * Sichtbare Marke einer Kiste. Die Art (`crateType`) reist im Zustand mit;
 * ohne Marke sähe eine Sprengfalle wie eine Waffenkiste aus.
 *
 * - `gefuellt`: Waffenkiste (gefülltes Quadrat)
 * - `ring`:    Nachschub (Kreis)
 * - `streifen`: Munition (drei Striche)
 * - `dreieck`: Falle (Warndreieck — die einzige Art, die man nicht öffnen will)
 * - `leer`:    leere Kiste (keine Marke, das ist die Aussage)
 *
 * @param {number} crateType
 * @returns {'gefuellt'|'ring'|'streifen'|'dreieck'|'leer'}
 */
export function kistenMarke(crateType) {
  switch (crateType) {
    case CRATE_TYPES.weapon: return 'gefuellt';
    case CRATE_TYPES.sustain: return 'ring';
    case CRATE_TYPES.ammo: return 'streifen';
    case CRATE_TYPES.trap: return 'dreieck';
    default: return 'leer';
  }
}
