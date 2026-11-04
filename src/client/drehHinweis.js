/**
 * Dreh-Hinweis: Telefon hochkant (Entscheidung des Auftraggebers 2026-11-04, „nur quer und fertig").
 *
 * Ein eigenes Hochformat-Layout gibt es nicht mehr. Hochkant und schmal zeigt CSS die Fläche
 * `#dreh-hinweis` über allem (design.css, „Dreh-Hinweis"); dieses Modul sorgt dafür, dass das Spiel
 * darunter auch per Tastatur und Vorlesehilfe nicht bedient wird: `inert` an `#app` und am Skip-Link,
 * `body.dreh-hinweis-aktiv` für die Spieltasten (`dom.js#spielTastenAus`). Beim Erscheinen wird der
 * Titel neu gesetzt, damit die Live-Region (`role="alert"`) ihn ansagt.
 *
 * @module drehHinweis
 */

/** Dieselbe Abfrage wie in design.css (Seitenverhältnis ≤ 4:5 und höchstens 900 px breit). */
export const DREH_ABFRAGE = '(max-aspect-ratio: 4/5) and (max-width: 900px)';

/**
 * @param {Document} doc
 * @returns {() => boolean} liefert, ob der Hinweis gerade aktiv ist (für Tests)
 */
export function bindeDrehHinweis(doc) {
  const abfrage = doc.defaultView?.matchMedia?.(DREH_ABFRAGE);
  if (!abfrage) return () => false;
  const gesperrt = [doc.getElementById('app'), doc.getElementById('skip-to-board')].filter(Boolean);
  const titel = doc.querySelector('#dreh-hinweis .dreh-titel');

  const setze = () => {
    const an = abfrage.matches;
    for (const el of gesperrt) el.inert = an;
    doc.body?.classList.toggle('dreh-hinweis-aktiv', an);
    if (an && titel) {
      const text = titel.textContent;
      titel.textContent = '';
      titel.textContent = text;
    }
  };
  abfrage.addEventListener?.('change', setze);
  setze();
  return () => abfrage.matches;
}
