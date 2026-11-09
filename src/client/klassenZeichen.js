/**
 * Klassenzeichen: Klinge, Projektilvisier, Ritualzeichen (Audit A16).
 *
 * ## Warum nicht über Farbe
 *
 * Farbe gehört der Fraktion (A09). Würde die Klasse ebenfalls eingefärbt, wäre
 * ein Acht-Bit-Nahkämpfer und ein Acht-Bit-Fernkämpfer nur über einen Ton
 * unterscheidbar, den das Fraktionsschema schon belegt. Die Klasse bekommt
 * deshalb ein ZEICHEN, das in jeder Fraktion gleich aussieht und in der
 * Anzeige die Textfarbe erbt (`currentColor`).
 *
 * ## Warum gezeichnet und nicht als Bild
 *
 * Es sind drei kleine Vektorformen; als SVG-Pfad bleiben sie bei jeder Größe
 * scharf, kosten keinen zusätzlichen Datei-Download und lassen sich im Kader,
 * in der Hilfe und in der HUD-Figurenkarte aus derselben Quelle zeichnen.
 *
 * Die Haltung der Figur (Klinge am Körper, Visier vor dem Auge, Zeichen vor der
 * Brust) gehört in die Bildproduktion und ist hier NICHT behauptet.
 *
 * @module klassenZeichen
 */

/**
 * Je Klasse ein Zeichen. `pfad` ist SVG-Pfaddaten in einem 24×24-Raster,
 * `titel` der lesbare Name für Tooltip und Screenreader.
 */
export const KLASSEN_ZEICHEN = Object.freeze({
  nahkampf: Object.freeze({
    id: 'klinge',
    titel: 'Klinge',
    /*
     * Senkrechte Klinge mit Parierstange: bei 13 px in der Figurenliste bleibt
     * die Silhouette (Spitze, Griff, Stange) erkennbar — eine schräge Klinge
     * verliert dort ihre Kontur.
     */
    pfad: 'M12 2 L15 6 L13 16 L12 19 L11 16 L9 6 Z M6 17 H18 M12 19 V22',
  }),
  fernkampf: Object.freeze({
    id: 'visier',
    titel: 'Projektilvisier',
    pfad: 'M12 4 A8 8 0 1 0 12 20 A8 8 0 1 0 12 4 Z M12 1 V5 M12 19 V23 M1 12 H5 M19 12 H23 M12 12 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M16 5 L21 2',
  }),
  okkultist: Object.freeze({
    id: 'ritualzeichen',
    titel: 'Ritualzeichen',
    pfad: 'M12 3 L21 20 H3 Z M12 9 A3.5 3.5 0 1 0 12 16 A3.5 3.5 0 1 0 12 9 Z M12 1 V4 M12 20 V23',
  }),
});

/**
 * Zeichen einer Spielklasse, `null` bei unbekannter Klasse.
 *
 * @param {string} klasse - 'nahkampf' | 'fernkampf' | 'okkultist'
 */
export function zeichenFuerKlasse(klasse) {
  return KLASSEN_ZEICHEN[klasse] ?? null;
}

/**
 * Fertiges Inline-SVG als Zeichenkette — für `element.innerHTML`.
 *
 * Enthält bewusst KEINE Farbe: `stroke="currentColor"` erbt die Textfarbe der
 * Umgebung, damit das Zeichen in jedem Menü- und HUD-Kontext lesbar bleibt und
 * nicht mit der Fraktionsfarbe verwechselt wird.
 *
 * @param {string} klasse
 * @param {{groesse?: number, titel?: boolean}} [optionen] - `titel: true` gibt dem
 *   Zeichen einen eigenen Namen (role="img"); sonst ist es Schmuck (`aria-hidden`)
 *   neben einem bereits vorhandenen Klassentext.
 * @returns {string} leere Zeichenkette bei unbekannter Klasse
 */
export function klassenSvg(klasse, { groesse = 16, titel = false } = {}) {
  const zeichen = zeichenFuerKlasse(klasse);
  if (!zeichen) return '';
  const zugang = titel ? `role="img" aria-label="${zeichen.titel}"` : 'aria-hidden="true"';
  return `<svg class="klassen-zeichen" data-zeichen="${zeichen.id}" viewBox="0 0 24 24" `
    + `width="${groesse}" height="${groesse}" fill="none" stroke="currentColor" `
    + `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" `
    + `${zugang} focusable="false"><path d="${zeichen.pfad}"/></svg>`;
}
