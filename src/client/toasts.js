/**
 * Kurzmeldungen (Toasts) über Menü und Spielfeld.
 *
 * Das Ereignisprotokoll (`Hud#log`, `role="log"`) bleibt die einzige Live-Region
 * und die vollständige Chronik. Toasts sind die SICHTBARE Zweitanzeige für wenige
 * Meldungen, die der Spieler nicht übersehen darf (Verbindung, Serverfehler,
 * Lobby-Auswahl). Deshalb sind sie KEINE Live-Region: Ein Screenreader läse sonst
 * jede Meldung doppelt.
 *
 * Stapelung: höchstens `TOAST_MAX` gleichzeitig, die älteste weicht. Gleicher Text
 * im selben Ton wird nicht neu gestapelt, sondern hochgezählt (×n) und die Frist
 * erneuert. Ein Klick (Tippfläche ≥ 44 px) schließt den Toast.
 */

const TOAST_MAX = 4;
const TOAST_DAUER_MS = Object.freeze({ danger: 7000, notice: 5000, good: 3500, info: 4000 });

const TOENE = Object.freeze({
  danger: { symbol: '!', rolle: 'Fehler' },
  notice: { symbol: 'i', rolle: 'Hinweis' },
  good: { symbol: '✓', rolle: 'Erfolg' },
  info: { symbol: 'i', rolle: 'Hinweis' },
});

/**
 * Zeigt einen Toast.
 * @param {string} message Meldungstext
 * @param {'danger'|'notice'|'good'|'info'} [tone]
 * @param {Document} [doc] Dokument (für Tests)
 * @returns {HTMLElement|null} Der Toast-Knoten, oder `null` ohne Container
 */
export function zeigeToast(message, tone = 'info', doc = globalThis.document) {
  const behaelter = doc?.getElementById?.('toasts');
  if (!behaelter) return null;
  const ton = TOENE[tone] ? tone : 'info';
  const text = String(message);

  const vorhanden = [...behaelter.children].find(
    k => k.dataset.ton === ton && k.dataset.text === text && !k.classList.contains('is-weg'),
  );
  if (vorhanden) {
    const n = Number(vorhanden.dataset.anzahl) + 1;
    vorhanden.dataset.anzahl = String(n);
    const zaehler = vorhanden.querySelector('.toast-zahl');
    zaehler.textContent = `×${n}`;
    zaehler.hidden = false;
    plane(vorhanden, ton);
    return vorhanden;
  }

  const toast = doc.createElement('button');
  toast.type = 'button';
  toast.className = 'toast';
  toast.dataset.ton = ton;
  toast.dataset.text = text;
  toast.dataset.anzahl = '1';
  toast.setAttribute('aria-label', `${TOENE[ton].rolle}: ${text}. Schließen`);

  const symbol = doc.createElement('span');
  symbol.className = 'toast-symbol';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = TOENE[ton].symbol;

  const inhalt = doc.createElement('span');
  inhalt.className = 'toast-text';
  inhalt.textContent = text;

  const zahl = doc.createElement('span');
  zahl.className = 'toast-zahl';
  zahl.hidden = true;

  toast.append(symbol, inhalt, zahl);
  toast.addEventListener('click', () => entferne(toast));
  behaelter.append(toast);

  while (behaelter.children.length > TOAST_MAX) behaelter.firstElementChild.remove();
  plane(toast, ton);
  return toast;
}

/** Standzeit: in niedrigen Fenstern (die Toasts sitzen dort über dem Menü) kürzer. */
function dauerFuer(ton) {
  const niedrig = globalThis.matchMedia?.('(max-height: 520px)').matches;
  return Math.round(TOAST_DAUER_MS[ton] * (niedrig ? 0.6 : 1));
}

function plane(toast, ton) {
  clearTimeout(toast._frist);
  toast._frist = setTimeout(() => entferne(toast), dauerFuer(ton));
}

function entferne(toast) {
  clearTimeout(toast._frist);
  if (!toast.isConnected) return;
  toast.classList.add('is-weg');
  // Ohne Animation (reduzierte Bewegung) kommt kein animationend: sofort entfernen.
  const ohneBewegung = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (ohneBewegung) { toast.remove(); return; }
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
  setTimeout(() => toast.remove(), 400);
}
