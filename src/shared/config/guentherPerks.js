/**
 * Günthers Perks — die 30 benannten Gaben der Fassung 4 (`config.guenther` = 4).
 *
 * ## Warum eine eigene Datei
 *
 * `guenther.js` beschreibt, WIE Günther läuft, pinkelt und sein Rad dreht. Diese
 * Datei beschreibt, WAS er dabei verteilt. Die Trennung hält beide lesbar: Die
 * Liste ist reine Spielinhaltsdaten (Name, Erklärung, Gewicht, Wirkung), das
 * Verhalten steht weiter in `guenther.js`. `guenther.js` reicht die Liste als
 * `GUENTHER_PERKS` weiter — eine Quelle, kein zweiter Katalog.
 *
 * ## Aufbau eines Eintrags
 *
 *   id          Kennung im Replay und in Ereignissen (stabil, nie umbenennen)
 *   name        deutscher Name für das HUD
 *   erklaerung  EIN Satz ohne Zahlen; die Zahlen stehen in `wirkung`
 *   weight      Auswahlgewicht (Summe 100, damit die Wahrscheinlichkeit ablesbar ist)
 *   stufe       common | uncommon | rare | epic | legendary (wie `powerTier` der Waffen)
 *   rad         Segment des bestehenden Glücksrads, auf das die Anzeige dreht
 *   wirkung     `{art, …}` — genau eine Wirkungsart aus `engine/tierWirkung.js`
 *
 * ## Warum Fassung 4 und nicht eine Änderung an Fassung 3
 *
 * Die Perks ersetzen ab Fassung 4 den Ausgang des Rads. Fassung 1–3 würfeln
 * weiterhin die fünf alten Ausgänge (`GUENTHER_WHEEL`) und laufen Bit für Bit
 * wie bisher — deshalb hängen alle neuen Wirkungen an der Marke, nicht an einem
 * Schalter im Code (AGENTS.md §2).
 *
 * @module config/guentherPerks
 */

/** Erlaubte Seltenheitsstufen (dieselben wie `powerTier`). */
export const GUENTHER_PERK_STUFEN = Object.freeze([
  'common', 'uncommon', 'rare', 'epic', 'legendary',
]);

/**
 * Die 30 Perks.
 *
 * Alle Wirkungen sind positiv oder schräg-lustig — Günther verteilt Gutes. Die
 * Wirkungsarten sind absichtlich wenige: Heilung, Schutz, Munition, Waffe,
 * Wind, Zugzeit, Zielhilfe, Kiste und Stoß. Jede davon benutzt ein bestehendes
 * System; keine neue Physik.
 */
export const GUENTHER_PERKS = Object.freeze([
  {
    id: 'nachschub', name: 'Nachschub', rad: 'fuettern', weight: 12, stufe: 'common',
    erklaerung: 'Günther schleppt dir frische Ladungen für alle Waffen heran.',
    wirkung: { art: 'munition', menge: 1, alle: true },
  },
  {
    id: 'gnade', name: 'Günthers Gnade', rad: 'spielen', weight: 6, stufe: 'common',
    erklaerung: 'Er lässt von dir ab und leckt deine Wunden sauber.',
    wirkung: { art: 'heilung', anteil: 0.25 },
  },
  {
    id: 'wumms', name: 'Doppelter Wumms', rad: 'gassi', weight: 5, stufe: 'uncommon',
    erklaerung: 'Dein nächster Treffer sitzt deutlich tiefer als sonst.',
    wirkung: { art: 'verstaerkung', faktor: 1.5, zuege: 1 },
  },
  {
    id: 'schutzschild', name: 'Schutzschild', rad: 'spielen', weight: 5, stufe: 'common',
    erklaerung: 'Ein unsichtbarer Kreis bleibt eine Weile vor dir stehen.',
    wirkung: { art: 'schild', betrag: 30 },
  },
  {
    id: 'dicker_pelz', name: 'Dicker Pelz', rad: 'spielen', weight: 3, stufe: 'uncommon',
    erklaerung: 'Günthers Winterfell legt sich schützend um deine Schultern.',
    wirkung: { art: 'panzerung', anteil: 0.25 },
  },
  {
    id: 'winddreher', name: 'Winddreher', rad: 'gassi', weight: 4, stufe: 'common',
    erklaerung: 'Der Wind dreht sich zu deinen Gunsten.',
    wirkung: { art: 'wind' },
  },
  {
    id: 'fernglas', name: 'Fernglas', rad: 'gassi', weight: 4, stufe: 'common',
    erklaerung: 'Günther schnüffelt die Flugbahn weiter voraus als sonst.',
    wirkung: { art: 'zielhilfe', faktor: 1.5, zuege: 2 },
  },
  {
    id: 'extragranate', name: 'Extragranate', rad: 'fuettern', weight: 3, stufe: 'uncommon',
    erklaerung: 'Er schüttelt dir eine Granate aus dem Fell.',
    wirkung: { art: 'waffe', id: 'pa_047' },
  },
  {
    id: 'leckerli', name: 'Heilendes Leckerli', rad: 'spielen', weight: 7, stufe: 'common',
    erklaerung: 'Ein geteilter Snack macht dich wieder munter.',
    wirkung: { art: 'heilung', betrag: 20 },
  },
  {
    id: 'zeitgeschenk', name: 'Zeitgeschenk', rad: 'gassi', weight: 3, stufe: 'uncommon',
    erklaerung: 'Er bellt, bis du in Ruhe zielen kannst.',
    wirkung: { art: 'zugzeit', faktor: 1.25, zuege: 1 },
  },
  {
    id: 'spuernase', name: 'Spürnase', rad: 'fuettern', weight: 3, stufe: 'uncommon',
    erklaerung: 'Er gräbt neben dir eine Kiste aus dem Boden.',
    wirkung: { art: 'kiste' },
  },
  {
    id: 'rueckenwind', name: 'Rückenwind', rad: 'gassi', weight: 3, stufe: 'common',
    erklaerung: 'Ein Sprung mit Hundeschwung trägt dich ein Stück nach oben.',
    wirkung: { art: 'stoss', vx: 0, vy: -6 },
  },
  {
    id: 'waffenfund', name: 'Waffenfund', rad: 'fuettern', weight: 4, stufe: 'common',
    erklaerung: 'Im Gebüsch lag etwas Brauchbares, das er dir bringt.',
    wirkung: { art: 'waffe', seltenheit: 'uncommon' },
  },
  {
    id: 'heldenmut', name: 'Heldenmut', rad: 'gassi', weight: 3, stufe: 'uncommon',
    erklaerung: 'Sein Bellen macht dich für zwei Züge unerschrocken.',
    wirkung: { art: 'verstaerkung', faktor: 1.35, zuege: 2 },
  },
  {
    id: 'fellpflege', name: 'Fellpflege', rad: 'spielen', weight: 3, stufe: 'common',
    erklaerung: 'Er putzt dich sauber, und der Schmutz fällt wie Rüstung ab.',
    wirkung: { art: 'schild', betrag: 15 },
  },
  {
    id: 'wurfarm', name: 'Wurfarm', rad: 'fuettern', weight: 3, stufe: 'uncommon',
    erklaerung: 'Er trägt dir einen ganzen Vorrat hinterher.',
    wirkung: { art: 'munition', menge: 2, alle: true },
  },
  {
    id: 'gluecksbringer', name: 'Glücksbringer', rad: 'fuettern', weight: 2, stufe: 'rare',
    erklaerung: 'Ein seltener Fund, den er dir vor die Füße legt.',
    wirkung: { art: 'waffe', seltenheit: 'rare' },
  },
  {
    id: 'bisshemmung', name: 'Bisshemmung', rad: 'spielen', weight: 3, stufe: 'common',
    erklaerung: 'Er hat beschlossen, dich nicht zu beißen, und du atmest auf.',
    wirkung: { art: 'heilung', betrag: 10 },
  },
  {
    id: 'wachhund', name: 'Wachhund', rad: 'spielen', weight: 2, stufe: 'uncommon',
    erklaerung: 'Er stellt sich breit vor dich und passt auf.',
    wirkung: { art: 'panzerung', anteil: 0.15 },
  },
  {
    id: 'tunnelblick', name: 'Tunnelblick', rad: 'gassi', weight: 2, stufe: 'common',
    erklaerung: 'Du siehst die Bahn klarer, weil er die Nase in den Wind hält.',
    wirkung: { art: 'zielhilfe', faktor: 1.25, zuege: 2 },
  },
  {
    id: 'nachtisch', name: 'Nachtisch', rad: 'spielen', weight: 4, stufe: 'common',
    erklaerung: 'Ein Rest aus seinem Napf macht dich wieder standsicher.',
    wirkung: { art: 'heilung', anteil: 0.15 },
  },
  {
    id: 'pfotentanz', name: 'Pfotentanz', rad: 'gassi', weight: 2, stufe: 'common',
    erklaerung: 'Er wirbelt dich einmal im Kreis und lässt dich hoch fliegen.',
    wirkung: { art: 'stoss', vx: 4, vy: -4 },
  },
  {
    id: 'heimdallblick', name: 'Heimdalls Blick', rad: 'heimdall', weight: 1, stufe: 'rare',
    erklaerung: 'Für einen Augenblick sieht er durch dich hindurch und gibt dir eine Waffe der Legenden.',
    wirkung: { art: 'waffe', seltenheit: 'legendary' },
  },
  {
    id: 'munitionsbeutel', name: 'Munitionsbeutel', rad: 'fuettern', weight: 4, stufe: 'common',
    erklaerung: 'Er hat deine Tasche gefunden und schleppt sie voll zurück.',
    wirkung: { art: 'munition', menge: 1 },
  },
  {
    id: 'stahlkragen', name: 'Stahlkragen', rad: 'spielen', weight: 1, stufe: 'rare',
    erklaerung: 'Ein Fund aus dem Müll, der wirklich hält.',
    wirkung: { art: 'panzerung', anteil: 0.35 },
  },
  {
    id: 'zeitsprung', name: 'Zeitsprung', rad: 'gassi', weight: 1, stufe: 'rare',
    erklaerung: 'Die Uhr bleibt stehen, solange du zielst.',
    wirkung: { art: 'zugzeit', faktor: 1.5, zuege: 1 },
  },
  {
    id: 'wunderheilung', name: 'Wunderheilung', rad: 'spielen', weight: 1, stufe: 'rare',
    erklaerung: 'Er leckt einmal kräftig über dich, und alles wird gut.',
    wirkung: { art: 'heilung', anteil: 0.5 },
  },
  {
    id: 'schutzgeist', name: 'Schutzgeist', rad: 'spielen', weight: 1, stufe: 'rare',
    erklaerung: 'Etwas Unsichtbares läuft von nun an neben dir her.',
    wirkung: { art: 'schild', betrag: 50 },
  },
  {
    id: 'gjallarhorn', name: 'Gjallarhorns Nachhall', rad: 'heimdall', weight: 1, stufe: 'epic',
    erklaerung: 'Der Ton des Horns bleibt in deiner Tasche liegen.',
    wirkung: { art: 'waffe', seltenheit: 'epic' },
  },
  {
    id: 'hundepfote', name: 'Hundepfote', rad: 'spielen', weight: 4, stufe: 'common',
    erklaerung: 'Er stupst dich an, und plötzlich geht alles leichter.',
    wirkung: { art: 'heilung', betrag: 15 },
  },
]);

/** Gewichtssumme (muss 100 sein, damit die Wahrscheinlichkeit direkt ablesbar ist). */
export const GUENTHER_PERK_TOTAL = GUENTHER_PERKS.reduce((summe, p) => summe + p.weight, 0);

/** Kennungen in Listenreihenfolge (Draht- und Testreihenfolge). */
export const GUENTHER_PERK_IDS = Object.freeze(GUENTHER_PERKS.map(p => p.id));

/**
 * Gewichte für Waffen einer Perk-Stufe.
 *
 * Die Stufe des Perks bestimmt, wie gut der Fund ist. Es sind dieselben Formen
 * wie bei `LOW_RARITY_WEIGHTS`/`LEGENDARY_WEIGHTS`: Summe 100, abgeleitet über
 * `powerTier`. Keine neue Verteilung, nur eine Zuordnung.
 */
export const PERK_WAFFEN_GEWICHTE = Object.freeze({
  common: Object.freeze({ common: 68, uncommon: 26, rare: 6, epic: 0, legendary: 0 }),
  uncommon: Object.freeze({ common: 30, uncommon: 50, rare: 18, epic: 2, legendary: 0 }),
  rare: Object.freeze({ common: 0, uncommon: 45, rare: 45, epic: 10, legendary: 0 }),
  epic: Object.freeze({ common: 0, uncommon: 0, rare: 30, epic: 55, legendary: 15 }),
  legendary: Object.freeze({ common: 0, uncommon: 0, rare: 0, epic: 12, legendary: 88 }),
});

/**
 * Zieht einen Perk nach Gewicht.
 *
 * Der Zufall kommt ausschließlich aus dem übergebenen Teilgenerator — dieselbe
 * Mechanik wie beim alten Rad (`GuentherSystem#wuerfleAusgang`).
 *
 * @param {{next:()=>number}} rng
 * @returns {object} Perk-Eintrag
 */
export function waehleGuentherPerk(rng) {
  const wurf = rng.next() * GUENTHER_PERK_TOTAL;
  let summe = 0;
  for (const perk of GUENTHER_PERKS) {
    summe += perk.weight;
    if (wurf < summe) return perk;
  }
  return GUENTHER_PERKS[0];
}

export default GUENTHER_PERKS;
