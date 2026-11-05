/**
 * Musik-Stimmung aus der Spiel-Lage (AUDIO-1).
 *
 * ## Der Befund
 *
 * Das Musik-Manifest kennt seit immer drei Stimmungen (`menu`, `match`,
 * `intensiv`), aber `intensiv` wurde nie gesetzt: Die Stimmung folgte allein
 * dem `hidden` des Menüs. Der spannendste Teil einer Partie — Valhalla, das
 * Ende — klang wie der Anfang.
 *
 * ## Die Regel (Entscheidung 2026-11-05, docs/plan-produktion.md §1)
 *
 * `intensiv` gilt, solange eine der drei Lagen zutrifft:
 *
 *  1. **Valhalla/Mahlstrom läuft** — der Zustand trägt `maelstrom.active`
 *     (lokal aus dem Motor, online aus dem Snapshot bzw. dem Einschnitt).
 *  2. **Nur noch zwei Figuren leben** — das Ende ist nah.
 *  3. **Ein Team hat ≤ 25 % seines Lebens** — es steht auf der Kippe.
 *
 * Zurück auf `match` geht es, sobald keine Lage mehr zutrifft („die Lage
 * entspannt sich"). Die Funktion ist deshalb zustandslos: Sie liest den
 * aktuellen Zustand und liefert die Stimmung, ohne sich etwas zu merken.
 *
 * Bewusst KEINE Auslöser: Zugzeit, Rundenzahl, einzelne Treffer. Die Musik soll
 * dem Verlauf folgen, nicht dem Takt der Anzeige — sonst wechselt sie im
 * Sekundentakt und wird zur Unruhe.
 *
 * Reine Darstellung: liest nur den Anzeigezustand, ändert nichts (AGENTS.md §2
 * gilt ohnehin nur für Engine/Shared).
 *
 * @module musikStimmung
 */

/** Ab diesem Anteil gilt ein Team als „auf der Kippe" (≤ 25 %). */
export const TEAM_LEBEN_SCHWELLE = 0.25;
/** Ab dieser Zahl lebender Figuren wird es „intensiv" (die letzten zwei). */
export const LETZTE_FIGUREN = 2;

/**
 * Lebende Figuren und ihr Lebensstand je Team aus dem Anzeigezustand.
 *
 * Tote Figuren tragen im Zustand `health: 0` UND `maxHealth: 0` (siehe
 * `engine/stateSnapshot.js`); sie werden hier nicht mitgezählt, sonst sähe ein
 * fast ausgelöschtes Team nach dem Tod seiner letzten Figur wieder „gesund"
 * aus. Gezählt wird nur, was noch lebt.
 *
 * @param {object} state
 * @returns {{lebende: number, teams: Map<number, {leben: number, max: number}>}}
 */
function lageAusZustand(state) {
  const teams = new Map();
  let lebende = 0;
  for (const e of state?.entities ?? []) {
    if (e?.alive === false) continue;
    const max = Number(e?.maxHealth ?? 0);
    const leben = Number(e?.health ?? 0);
    if (!(max > 0)) continue;
    lebende += 1;
    const team = teams.get(e.teamId) ?? { leben: 0, max: 0 };
    team.leben += Math.max(0, leben);
    team.max += max;
    teams.set(e.teamId, team);
  }
  return { lebende, teams };
}

/**
 * Die Musik-Stimmung zum Anzeigezustand.
 *
 * @param {object|null} state - `Main#currentState()` (lokal und online gleich)
 * @param {{basis?: 'match'|'menu'}} [optionen] - Grundstimmung; außerhalb einer
 *   laufenden Partie bleibt sie stehen (Menü, Spielende, Replay).
 * @returns {'menu'|'match'|'intensiv'}
 */
export function waehleStimmung(state, { basis = 'match' } = {}) {
  if (basis === 'menu') return 'menu';
  // Nur eine LAUFENDE Partie ist spannend. Nach dem Sieg (Status `gameover`)
  // und in der Wiedergabe bleibt es bei der ruhigen Match-Musik.
  if (!state || state.status !== 'playing') return 'match';
  if (state.maelstrom?.active) return 'intensiv';

  const { lebende, teams } = lageAusZustand(state);
  if (lebende > 0 && lebende <= LETZTE_FIGUREN) return 'intensiv';

  for (const team of teams.values()) {
    if (team.max > 0 && team.leben / team.max <= TEAM_LEBEN_SCHWELLE) return 'intensiv';
  }
  return 'match';
}

export default waehleStimmung;
