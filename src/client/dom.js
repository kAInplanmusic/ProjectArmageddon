/**
 * Kleine DOM-Hilfen für den Client.
 *
 * @module dom
 */

/** Eingabetypen, die keine Texteingabe sind (Knöpfe, Schalter, Regler). */
const NON_TEXT_INPUT_TYPES = new Set([
  'button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'file', 'color', 'image',
]);

/**
 * Prüft, ob ein Tastaturereignis in einer Texteingabe landet.
 *
 * Hintergrund: Die Tastatursteuerung hängt global am Fenster (Winkel, Kraft,
 * Feuern, Neustart). Ohne diese Prüfung würde das Tippen in einem Formularfeld
 * gleichzeitig das Spiel steuern — der Seed "2026" verändert den Winkel, die
 * Leertaste feuert, und "r" startet das Match neu.
 *
 * @param {EventTarget|null} target - typischerweise `event.target`
 * @returns {boolean} true, wenn das Spiel die Taste ignorieren soll
 */
export function isTextEntry(target) {
  if (!target || typeof target.tagName !== 'string') return false;

  const tagName = target.tagName.toUpperCase();

  if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;

  if (tagName === 'INPUT') {
    const type = typeof target.type === 'string' ? target.type.toLowerCase() : 'text';
    return !NON_TEXT_INPUT_TYPES.has(type);
  }

  // Inhaltlich bearbeitbare Elemente (contenteditable) zählen ebenfalls dazu.
  return target.isContentEditable === true;
}

export default { isTextEntry };
