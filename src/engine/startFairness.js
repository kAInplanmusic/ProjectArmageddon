/**
 * Startfairness (Geländefassung 16, TODO 2.3b): Welches Team bekommt welchen Startplatz?
 *
 * ## Der Fund (gemessen, `scripts/messung-kartenqualitaet.mjs`)
 *
 * Die Startplätze entstehen in Reihe (`spawnManager`: Spalte `B/(n+1)·(i+1)`, dann `karteStart.trockenerStartX`), die Teams
 * wechseln sich ab (`index % teams`). Wo der trockene Platz weit wandert, kippt das: In 25 von 200 Menü-Partien stand ein Team im
 * Mittel über 150 px höher als das andere, auf 1:1-Karten in 26 von 100; in 17 von 100 (1:1) war ein Team 1,6-mal weiter vom
 * nächsten Gegner entfernt; auf kleinen Karten standen Gegner in 19 von 100 Partien keine 120 px auseinander.
 *
 * Dieselben Plätze, anders verteilt, beheben das fast ganz (offline über alle Teilungen gerechnet: 25 → 1, 26 → 6, 19 → 2).
 *
 * ## Die Regel
 *
 * Nur auf autonomen Karten (wie alle Startregeln der Geländefassungen, `karteStart.trockenerStartX`) und nur bei zwei Teams mit gleich vielen Figuren und höchstens `MAX_PLAETZE` Plätzen (sonst wächst die Zahl der Teilungen zu stark;
 * dann bleibt alles wie vorher). Gilt die bisherige Verteilung als fair, bleibt sie (die Partie ändert sich nicht). Sonst wird unter
 * allen fairen Teilungen die gewählt, in der sich die Teams entlang der Karte am häufigsten abwechseln (gemischte Fronten statt
 * „links gegen rechts“); gibt es keine faire, die mit den kleinsten Kosten. Gleichstand: die erste in fester Aufzählungsreihenfolge.
 * Kein Zufall, keine Uhr.
 *
 * @module engine/startFairness
 */

/** Höchstens so viele Plätze werden umverteilt (C(12, 6) = 924 Teilungen). */
export const MAX_PLAETZE = 12;
/** Fair heißt: mittlere Standhöhe der Teams höchstens so weit auseinander (px) … */
export const HOEHE_MAX = 150;
/** … mittlerer Abstand zum nächsten Gegner höchstens so ein Verhältnis … */
export const ABSTAND_VERHAELTNIS_MAX = 1.6;
/** … und kein Gegner näher als das (px). */
export const NAH_MIN = 120;

/**
 * Kosten einer Teilung: 1 oder weniger heißt fair. `team[i]` ist 0 oder 1 für Platz i.
 * @param {Array<{x:number,y:number}>} plaetze
 * @param {number[]} team
 */
export function startKosten(plaetze, team) {
  const summe = [{ d: 0, y: 0, n: 0 }, { d: 0, y: 0, n: 0 }];
  let nah = Infinity;
  for (let i = 0; i < plaetze.length; i += 1) {
    let d = Infinity;
    for (let j = 0; j < plaetze.length; j += 1) {
      if (team[j] !== team[i]) d = Math.min(d, Math.hypot(plaetze[j].x - plaetze[i].x, plaetze[j].y - plaetze[i].y));
    }
    nah = Math.min(nah, d);
    const s = summe[team[i]];
    s.d += d; s.y += plaetze[i].y; s.n += 1;
  }
  const [a, b] = summe.map(s => ({ d: s.d / s.n, y: s.y / s.n }));
  const hoehe = Math.abs(a.y - b.y) / HOEHE_MAX;
  const verhaeltnis = (Math.max(a.d, b.d) / Math.max(1, Math.min(a.d, b.d)) - 1) / (ABSTAND_VERHAELTNIS_MAX - 1);
  return Math.max(hoehe, verhaeltnis) + (nah < NAH_MIN ? 1 : 0);
}

/** Wie oft wechselt das Team zwischen benachbarten Plätzen (nach x sortiert)? */
function wechsel(plaetze, team) {
  const ordnung = plaetze.map((p, i) => i).sort((i, j) => plaetze[i].x - plaetze[j].x || i - j);
  let n = 0;
  for (let k = 1; k < ordnung.length; k += 1) if (team[ordnung[k]] !== team[ordnung[k - 1]]) n += 1;
  return n;
}

/**
 * Verteilt die Plätze auf die Spieler. Spieler `i` gehört zu Team `i % 2` (wie im `spawnManager`). Liefert für jeden Spieler den
 * Index seines Platzes; ohne Umverteilung die Identität.
 * @param {Array<{x:number,y:number}>} plaetze - in Spielerreihenfolge
 * @param {number} teams
 * @returns {number[]}
 */
export function verteileStartplaetze(plaetze, teams) {
  const n = plaetze.length;
  const identitaet = plaetze.map((_, i) => i);
  if (teams !== 2 || n < 4 || n % 2 !== 0 || n > MAX_PLAETZE) return identitaet;
  const bisher = identitaet.map(i => i % 2);
  if (startKosten(plaetze, bisher) <= 1) return identitaet;

  // Alle Teilungen in n/2 Plätze für Team 0; Platz 0 gehört immer Team 0 (die Spiegelung wäre dieselbe Teilung).
  let beste = null;
  const halb = n / 2;
  const auswahl = [0];
  const pruefe = () => {
    const team = new Array(n).fill(1);
    for (const i of auswahl) team[i] = 0;
    for (const t of [team, team.map(v => 1 - v)]) {
      const k = startKosten(plaetze, t);
      const fair = k <= 1;
      const w = wechsel(plaetze, t);
      const besser = !beste
        || (fair && !beste.fair)
        || (fair && beste.fair && w > beste.w)
        || (!fair && !beste.fair && k < beste.k);
      if (besser) beste = { team: t, k, fair, w };
    }
  };
  const waehle = start => {
    if (auswahl.length === halb) { pruefe(); return; }
    for (let i = start; i < n; i += 1) { auswahl.push(i); waehle(i + 1); auswahl.pop(); }
  };
  waehle(1);

  // Spieler i (Team i % 2) bekommt den nächsten freien Platz seines Teams, Plätze in aufsteigender Reihenfolge.
  const frei = [[], []];
  for (let i = 0; i < n; i += 1) frei[beste.team[i]].push(i);
  return identitaet.map(i => frei[i % 2].shift());
}
