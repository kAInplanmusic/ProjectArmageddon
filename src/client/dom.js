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

/** Die Abfrage, auf die sich `prefersReducedMotion` stützt. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Will der Nutzer Bewegung reduzieren?
 *
 * Betriebssysteme bieten eine Einstellung für Menschen, denen Bewegung,
 * Flackern und Zoomen Beschwerden bereitet (Schwindel, Migräne, Vestibular-
 * störungen). Diese Einstellung ist keine Höflichkeit, sondern eine
 * Zugänglichkeitsanforderung — und sie wird hier tatsächlich befolgt:
 * Explosionspartikel entfallen, CSS-Animationen laufen nicht.
 *
 * Bewusst defensiv: Fehlt `matchMedia` (alte Umgebung, Test-Attrappe), gilt
 * `false` — der Standardfall. Ein Fehler hier darf das Spiel nicht aufhalten.
 *
 * @param {object} [win] - Fensterobjekt (für Tests ersetzbar)
 * @returns {boolean}
 */
export function prefersReducedMotion(win = globalThis) {
  try {
    if (!win || typeof win.matchMedia !== 'function') return false;
    return win.matchMedia(REDUCED_MOTION_QUERY).matches === true;
  } catch {
    return false;
  }
}

export { REDUCED_MOTION_QUERY };

export default { isTextEntry, prefersReducedMotion, REDUCED_MOTION_QUERY };
