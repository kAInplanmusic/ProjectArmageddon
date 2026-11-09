/**
 * Adressen der HD-Porträts — ein nachgeladener Baustein (siehe `figurenDaten.js`
 * für die Begründung). Wird nur über `import()` aus `roster.js` geholt, sobald eine
 * große Anzeige (Figurenkarte, Kaderansicht) ein HD-Bild verlangt.
 *
 * @module figurenHdDaten
 */

/** HD-Porträts: Pfad -> Adresse. */
export const hdBilder = import.meta.glob('./assets/characters-hd/*/*.png', { query: '?url', import: 'default', eager: true });
