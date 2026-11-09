/**
 * Zwei Farbrollen, streng getrennt (Audit A09).
 *
 * ## Das Problem
 *
 * Bisher trug die Fraktionsfarbe dieselbe Aufgabe wie die Teamfarbe: Wer zwei
 * Spieler derselben Fraktion führte, sah zwei gleich markierte Figuren. Die
 * Fraktion ist aber Aussehen, das Team ist Besitz.
 *
 * ## Die Regel
 *
 *  - **Eigentümer** (Team): Ring um die Figur, Rahmen und Punkt des
 *    Namensschilds, Marker auf der Figurenkarte, Rahmen der HUD-Figurenkarte.
 *    Quelle ist `TEAM_COLORS` — dieselbe Tabelle, die schon HUD und Renderer
 *    lesen. Zwei Spieler mit derselben Fraktion bleiben dadurch unterscheidbar.
 *  - **Fraktion**: Körper, Emblem, Banner, Zierring am Team-Punkt. Quelle ist
 *    `FRAKTIONS_FARBEN`.
 *
 * Diese Datei ist reine Anzeige-Ableitung: keine Spielwerte, keine Zufälle.
 * Sie ist bewusst ohne `import.meta.glob` geschrieben, damit Tests sie ohne
 * Vite laden können; die Bild-URLs liefert `fraktionsIdentitaet.js`.
 *
 * @module teamFarben
 */
import { TEAM_COLORS } from '../engine/match.js';
import { FACTIONS } from '../shared/config/factions.js';
import { FRAKTIONS_FARBEN } from '../shared/config/fraktions-farben.js';

/** Neutrale Farbe, wenn ein Team keine Kennung hat (Zuschauer, Replay ohne Team). */
export const NEUTRALE_FARBE = '#7d8590';

/** Ein Satz für die Anzeige: was welche Farbe bedeutet. */
export const FARBTRENNUNG_HINWEIS = 'Ring, Namensschild und Marker tragen die Teamfarbe '
  + 'und zeigen damit den Eigentümer — zwei Spieler derselben Fraktion bleiben unterscheidbar. '
  + 'Körper und Emblem zeigen die Fraktion.';

/**
 * Teamfarbe eines Eigentümers.
 *
 * @param {number|null|undefined} teamId
 * @returns {string} Hexfarbe aus `TEAM_COLORS` oder die neutrale Farbe
 */
export function teamFarbe(teamId) {
  const id = Number(teamId);
  if (teamId === null || teamId === undefined || !Number.isInteger(id) || id < 0) return NEUTRALE_FARBE;
  return TEAM_COLORS[id % TEAM_COLORS.length];
}

/**
 * Kurze Eigentümer-Marke für Anzeigen mit wenig Platz („T1“, „T2“ …).
 *
 * Sie ist die lesbare Form derselben Aussage wie die Teamfarbe: Wer die Marke
 * liest, weiß den Eigentümer auch ohne Farbwahrnehmung.
 */
export function teamMarke(teamId) {
  const id = Number(teamId);
  return teamId === null || teamId === undefined || !Number.isInteger(id) || id < 0
    ? '—'
    : `T${id + 1}`;
}

/**
 * Fraktionsmerkmale einer Kennung — Farbe, Schrift, Name, Wahlspruch.
 *
 * @param {string} id
 * @returns {{id: string, name: string, motto: string, farbe: string, schrift: string}|null}
 */
export function fraktionsMerkmale(id) {
  const farben = FRAKTIONS_FARBEN[id];
  const fraktion = FACTIONS.find(f => f.id === id);
  if (!farben || !fraktion) return null;
  return {
    id,
    name: fraktion.name,
    motto: fraktion.motto,
    farbe: farben.farbe,
    schrift: farben.schrift,
  };
}

/**
 * Prüft, ob eine Fraktionsfarbe zufällig einer Teamfarbe gleicht.
 *
 * Die beiden Rollen dürfen sich farblich ähneln; die Anzeige unterscheidet sie
 * über FORM (Ring/Punkt gegen Emblem), nicht über den Farbton allein. Diese
 * Funktion ist deshalb nur ein Hinweis für Gestaltungsprüfungen, keine Regel.
 */
export function farbaehnlich(fraktionsId, teamId) {
  return String(fraktionsMerkmale(fraktionsId)?.farbe ?? '').toLowerCase()
    === String(teamFarbe(teamId)).toLowerCase();
}
