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

/**
 * Sollen Spieltasten (Leertaste, Pfeile, Enter, Ziffern …) gerade NICHT die Figur steuern?
 *
 * Drei Fälle neben der Texteingabe:
 * - Der Fokus liegt im Einstellungs-Dropdown des HUD oder auf seinem Knopf (`[data-spieltasten-aus]`):
 *   Leertaste/Enter drücken dort den Knopf, Pfeile wandern durch die Einträge — ein Schuss nebenbei
 *   wäre ein Fehlgriff.
 * - Der Dreh-Hinweis deckt das Spiel ab (Telefon hochkant, `body.dreh-hinweis-aktiv`).
 * - Der Fokus liegt auf einem nativen Bedienelement (Knopf, `summary`, Link, Tab): Enter und
 *   Leertaste gehören dort dem Element. Die Spielsteuerung hängt global am Fenster und rief sonst
 *   `preventDefault()` auf — damit ließ sich im Menü kein `details` per Tastatur öffnen und kein
 *   Knopf auslösen (erster Befund beim Erstkontakt-E2E, `tests/e2e/onboarding-erstkontakt.spec.mjs`).
 *
 * @param {EventTarget|null} target - typischerweise `event.target`
 * @param {string} [key] - `event.key`; ohne Angabe gelten nur die alten Fälle
 * @returns {boolean} true, wenn das Spiel die Taste ignorieren soll
 */
export function spielTastenAus(target, key = '') {
  if (isTextEntry(target)) return true;
  if (typeof target?.closest === 'function') {
    if (target.closest('[data-spieltasten-aus]')) return true;
    if ((key === 'Enter' || key === ' ') && target.closest(
      'button, summary, a[href], [role="button"], [role="tab"], [role="option"]',
    )) return true;
  }
  const body = globalThis.document?.body;
  return Boolean(body?.classList?.contains('dreh-hinweis-aktiv'));
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

/**
 * Baut ein Element mit optionaler Klasse und Textinhalt.
 * @param {string} tag @param {string} [text] @param {string} [className]
 * @returns {HTMLElement}
 */
export function el(tag, text, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Lädt ein Bild als Promise. Ein Ladefehler wird zu einer Ablehnung, nie zu einem hängenden Promise.
 * @param {string} url @param {string} [fehlerText]
 * @returns {Promise<HTMLImageElement>}
 */
export function ladeBild(url, fehlerText = 'Bild nicht ladbar') {
  return new Promise((ok, fehler) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fehler(new Error(fehlerText));
    img.src = url;
  });
}

/**
 * Legt eine Zeichenfläche an — bevorzugt ohne DOM (`OffscreenCanvas`).
 * @param {number} b @param {number} h
 * @returns {OffscreenCanvas|HTMLCanvasElement}
 */
export function neueLeinwand(b, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(b, h);
  const c = document.createElement('canvas');
  c.width = b; c.height = h;
  return c;
}

export default {
  isTextEntry, prefersReducedMotion, REDUCED_MOTION_QUERY, el, ladeBild, neueLeinwand,
};
