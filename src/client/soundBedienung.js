/**
 * Bedienung der Effekte: Schalter, Regler, Taste T.
 *
 * Datenattribute (wie bei der Musik, `musikBedienung.js`):
 *
 *   `[data-ton-schalter]`  Knopf mit `aria-pressed` (Effekte an/aus)
 *   `[data-ton-regler]`    `<input type="range">`, 0–100 (Effekt-Lautstärke)
 *
 * Jede Änderung geht über den Mischer; `beiAenderung` schreibt sie in alle Kopien zurück.
 *
 * @module soundBedienung
 */

import { isTextEntry } from './dom.js';

/**
 * @param {Document} doc
 * @param {import('./soundMixer.js').SoundMixer} mischer
 * @returns {() => void} Aufräumfunktion (für Tests)
 */
export function bindeTonBedienung(doc, mischer) {
  const schalter = [...doc.querySelectorAll('[data-ton-schalter]')];
  const regler = [...doc.querySelectorAll('[data-ton-regler]')];

  const zeige = zustand => {
    for (const knopf of schalter) {
      knopf.setAttribute('aria-pressed', String(zustand.an));
      const text = knopf.querySelector('[data-ton-schalter-text]');
      if (text) text.textContent = zustand.an ? 'Effekte an' : 'Effekte aus';
    }
    const prozent = String(Math.round(zustand.lautstaerke * 100));
    for (const r of regler) {
      if (r.value !== prozent) r.value = prozent;
      r.setAttribute('aria-valuetext', `${prozent} Prozent`);
    }
  };

  const abmelden = mischer.beiAenderung(zeige);
  const aufSchalter = () => mischer.schalte();
  const aufRegler = event => mischer.setzeLautstaerke(Number(event.target.value) / 100);
  for (const knopf of schalter) knopf.addEventListener('click', aufSchalter);
  for (const r of regler) r.addEventListener('input', aufRegler);

  const aufTaste = event => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key !== 't' && event.key !== 'T') return;
    if (isTextEntry(event.target)) return;
    mischer.schalte();
  };
  doc.defaultView?.addEventListener('keydown', aufTaste);

  zeige({ an: mischer.an, lautstaerke: mischer.lautstaerke });

  return () => {
    abmelden();
    doc.defaultView?.removeEventListener('keydown', aufTaste);
    for (const knopf of schalter) knopf.removeEventListener('click', aufSchalter);
    for (const r of regler) r.removeEventListener('input', aufRegler);
  };
}
