/**
 * Menü: Kartengröße folgt der Figurenzahl (Vorschlag, keine Regel).
 *
 * Solange die Spielerin die Kartengröße nicht selbst gewählt hat, setzt eine Änderung von „Teams" oder „Einheiten je Spieler" die
 * Größe auf `mapGroesseFuerFiguren(Teams × Einheiten)` (`engine/karte.js`). Eine eigene Wahl bleibt stehen. Das Format 24:9 und die
 * Stufe `gross` sind die Menü-Vorgabe (`index.html`); die Engine-Vorgabe für Replays ohne Angabe bleibt 16:9/mittel.
 *
 * @module kartenVorschlag
 */
import { mapGroesseFuerFiguren } from '../engine/karte.js';

/** Hängt den Vorschlag an die Menüfelder; ohne die Felder (Test-DOM) geschieht nichts. */
export function verdrahteKartenVorschlag(doc = document) {
  const groesse = doc.getElementById('cfg-kartengroesse');
  if (!groesse) return;
  let eigeneWahl = false;
  groesse.addEventListener('change', () => { eigeneWahl = true; });
  for (const id of ['cfg-teams', 'cfg-players']) {
    doc.getElementById(id)?.addEventListener('change', () => {
      if (eigeneWahl) return;
      const figuren = Number(doc.getElementById('cfg-teams')?.value ?? 2) * Number(doc.getElementById('cfg-players')?.value ?? 3);
      const vorschlag = mapGroesseFuerFiguren(figuren);
      if ([...groesse.options].some(o => o.value === vorschlag)) groesse.value = vorschlag;
    });
  }
}
