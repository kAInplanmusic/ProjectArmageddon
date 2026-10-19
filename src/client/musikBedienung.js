/**
 * Bedienung der Musik: Schalter, Regler, Titelanzeige, Taste M.
 *
 * Die Bedienelemente stehen zweimal im Dokument (Menü und HUD) und werden über
 * Datenattribute gefunden, nicht über IDs:
 *
 *   `[data-musik-schalter]`  Knopf mit `aria-pressed` (Musik an/aus)
 *   `[data-musik-regler]`    `<input type="range">`, 0–100
 *   `[data-musik-titel]`     Anzeige „Läuft: <Titel>"; mit `data-musik-kurz` (HUD) nur
 *                            „♪ <Titel>", der volle Text steht im Tooltip (`title`)
 *
 * Alle Kopien zeigen denselben Zustand: Jede Änderung (auch per Taste M) geht
 * über `Musik`, und `beiAenderung` schreibt sie in alle Kopien zurück.
 *
 * @module musikBedienung
 */

import { isTextEntry } from './dom.js';

/**
 * Verdrahtet die Bedienelemente.
 * @param {Document} doc
 * @param {import('./musik.js').Musik} musik
 * @returns {() => void} Aufräumfunktion (für Tests)
 */
export function bindeMusikBedienung(doc, musik) {
  const schalter = [...doc.querySelectorAll('[data-musik-schalter]')];
  const regler = [...doc.querySelectorAll('[data-musik-regler]')];
  const titel = [...doc.querySelectorAll('[data-musik-titel]')];

  const zeige = zustand => {
    for (const knopf of schalter) {
      knopf.setAttribute('aria-pressed', String(zustand.an));
      const text = knopf.querySelector('[data-musik-schalter-text]');
      if (text) text.textContent = zustand.an ? 'Musik an' : 'Musik aus';
    }
    const prozent = String(Math.round(zustand.lautstaerke * 100));
    for (const r of regler) {
      if (r.value !== prozent) r.value = prozent;
      r.setAttribute('aria-valuetext', `${prozent} Prozent`);
    }
    let text = '';
    let kurz = '';
    if (!zustand.aktiv) { text = 'Wiedergabe in dieser Umgebung aus'; kurz = '\u266A aus'; }
    else if (!zustand.an) { text = 'stumm'; kurz = '\u266A stumm'; }
    else if (zustand.titel) { text = `Läuft: ${zustand.titel}`; kurz = `\u266A ${zustand.titel}`; }
    else if (!zustand.gestartet) { text = 'startet nach dem ersten Klick oder Tastendruck'; kurz = '\u266A \u2026'; }
    for (const t of titel) {
      const klein = t.hasAttribute('data-musik-kurz');
      t.textContent = klein ? kurz : text;
      if (klein && text) t.title = text; else t.removeAttribute('title');
      t.dataset.titel = zustand.titel;
    }
  };

  const abmelden = musik.beiAenderung(zeige);
  const aufSchalter = () => musik.schalte();
  const aufRegler = event => musik.setzeLautstaerke(Number(event.target.value) / 100);
  for (const knopf of schalter) knopf.addEventListener('click', aufSchalter);
  for (const r of regler) r.addEventListener('input', aufRegler);

  /*
   * Taste M. Nicht in Textfeldern (der Seed „m…" darf nichts schalten), nicht
   * mit Strg/Alt/Meta (Browserkürzel) und nicht bei Wiederholung.
   */
  const aufTaste = event => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key !== 'm' && event.key !== 'M') return;
    if (isTextEntry(event.target)) return;
    musik.schalte();
  };
  doc.defaultView?.addEventListener('keydown', aufTaste);

  zeige(musik.zustand);

  return () => {
    abmelden();
    doc.defaultView?.removeEventListener('keydown', aufTaste);
    for (const knopf of schalter) knopf.removeEventListener('click', aufSchalter);
    for (const r of regler) r.removeEventListener('input', aufRegler);
  };
}
