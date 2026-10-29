/**
 * Deutsche Bezeichnungen und Erklärtexte für Schadensarten, Wirkungen (Buffs, Heilung, Schild ...)
 * und Mali — die EINE Stelle für Tooltips, Protokoll und Hilfe.
 *
 * Warum eine eigene Datei: Der Motor kennt nur englische Schlüssel (`fire`, `damage_boost`, `brand`).
 * Bis zum 2026-10-28 gab es für die 27 Schadensarten und die 16 Wirkungsarten keine deutsche
 * Bezeichnung; das Protokoll zeigte `nutzt eine Wirkung (turret)`. Hier stehen die Texte, die Anzeige
 * liest nur noch von hier (`artText`, `wirkungText`, `statusText`).
 *
 * Regeln für die Texte:
 *   - ein Satz, ohne Zahlen. Spielwerte stehen in den Configs (`schaden.js`, `specials.js`); eine
 *     Zahl im Erklärtext wäre eine zweite Quelle, die bei jeder Balance-Änderung mitwandern müsste
 *     (Test „Keine Zahlen im Erklärungstext der Anzeige", `tests/e2e/hilfe.spec.mjs`);
 *   - nur, was der Motor tut (`ART_REGEL` und `MALUS` in `schaden.js`, `SPECIAL_EFFECTS` in
 *     `engine/specials.js`); `tests/wirkungstexte.test.js` prüft die Vollständigkeit gegen beide.
 *
 * @module config/wirkungstexte
 */

/** Schadensarten: Bezeichnung und was sie bewirken. Schlüssel = `DAMAGE_TYPE_IDS` des Motors. */
export const ART_TEXT = Object.freeze({
  physical: Object.freeze({ label: 'Körperlich', text: 'Schlag, Hieb und Geschoss; die Rüstung wirkt voll.' }),
  impact: Object.freeze({ label: 'Wucht', text: 'Die Wucht eines Einschlags; die Erschütterung ist der Rückstoß.' }),
  explosive: Object.freeze({ label: 'Sprengstoff', text: 'Explosion mit Fläche und Krater.' }),
  defense: Object.freeze({ label: 'Schutz', text: 'Selbstwirkung: schützt den Schützen.' }),
  utility: Object.freeze({ label: 'Hilfsmittel', text: 'Selbstwirkung: Bewegung, Munition und Aufklärung.' }),
  fire: Object.freeze({ label: 'Feuer', text: 'Setzt in Brand; Wasser, Eis und große Heilung löschen.' }),
  dragon: Object.freeze({ label: 'Drachenfeuer', text: 'Das Feuer der Drachen setzt ebenfalls in Brand.' }),
  ice: Object.freeze({ label: 'Eis', text: 'Bremst; ein zweiter Treffer oder Nässe betäubt.' }),
  electric: Object.freeze({ label: 'Elektrisch', text: 'Schock bremst; bei Nässe betäubt er und leitet auf nasse Gegner weiter.' }),
  magnetic: Object.freeze({ label: 'Magnetisch', text: 'Zieht das Ziel heran, statt es zu schwächen.' }),
  energy: Object.freeze({ label: 'Energie', text: 'Schildbrecher: ein Schild fängt nur einen Teil des Schadens.' }),
  poison: Object.freeze({ label: 'Gift', text: 'Schaden über Zeit; mindert Heilung, und die Rüstung wirkt nur zum Teil.' }),
  acid: Object.freeze({ label: 'Säure', text: 'Zersetzt die Rüstung des Getroffenen.' }),
  arcane: Object.freeze({ label: 'Arkan', text: 'Magie, die einen Teil der Rüstung durchdringt.' }),
  astral: Object.freeze({ label: 'Astral', text: 'Magie aus dem Zwischenraum; durchdringt einen Teil der Rüstung.' }),
  psychic: Object.freeze({ label: 'Psi', text: 'Geistiger Angriff; durchdringt einen Teil der Rüstung.' }),
  spatial: Object.freeze({ label: 'Raum', text: 'Raummagie: versetzt und öffnet Tore; durchdringt einen Teil der Rüstung.' }),
  temporal: Object.freeze({ label: 'Zeit', text: 'Alter Name der Zeitmagie; heute heißt sie Zeit.' }),
  time: Object.freeze({ label: 'Zeit', text: 'Zeitmagie; durchdringt einen Teil der Rüstung.' }),
  dark: Object.freeze({ label: 'Dunkel', text: 'Schwarze Magie: verflucht, und die Rüstung wirkt nur zum Teil.' }),
  void: Object.freeze({ label: 'Leere', text: 'Die Leere verflucht, und die Rüstung wirkt nur zum Teil.' }),
  chaos: Object.freeze({ label: 'Chaos', text: 'Unberechenbare Magie: verflucht, und die Rüstung wirkt nur zum Teil.' }),
  water: Object.freeze({ label: 'Wasser', text: 'Macht nass, löscht Brand und verstärkt Frost und Schock.' }),
  wind: Object.freeze({ label: 'Wind', text: 'Sog und Versatz statt Nachteil.' }),
  nature: Object.freeze({ label: 'Natur', text: 'Aufbau und Verstärkung statt Nachteil.' }),
  holy: Object.freeze({ label: 'Heilig', text: 'Trifft Verfluchte härter.' }),
  medical: Object.freeze({ label: 'Medizin', text: 'Heilung des Schützen.' }),
});

/** Familien der Schadensarten (`FAMILIE_VON_ART` in `schaden.js`): Überschrift in der Hilfe. */
export const FAMILIE_LABEL = Object.freeze({
  koerper: 'Körper', feuer: 'Feuer', eis: 'Eis', elektro: 'Elektro', energie: 'Energie', gift: 'Gift und Säure',
  magie: 'Magie', schatten: 'Schatten', natur: 'Natur', heilig: 'Heilig und Medizin',
});

/** Wirkungen der Waffen (`EFFECT_KIND` in `engine/specials.js`): Bezeichnung und Erklärung. */
export const WIRKUNG_TEXT = Object.freeze({
  heal: Object.freeze({ label: 'Heilung', text: 'Stellt Leben wieder her, nie über das Maximum; löst Brand, Gift, Säure und Fluch, manche Heilung auch Frost oder Schock.' }),
  shield: Object.freeze({ label: 'Schild', text: 'Fängt Schaden ab, bevor das Leben sinkt; ein Schild mit Element belegt den Angreifer mit dessen Nachteil.' }),
  damage_boost: Object.freeze({ label: 'Verstärkung', text: 'Der eigene Schaden steigt für einige Züge; eine Verstärkung mit Element legt dem Getroffenen dessen Nachteil auf.' }),
  armor: Object.freeze({ label: 'Rüstung', text: 'Mindert den erlittenen Schaden für einige Züge.' }),
  freeze: Object.freeze({ label: 'Einfrieren und Betäuben', text: 'Der getroffene Gegner setzt aus.' }),
  damage_over_time: Object.freeze({ label: 'Schaden über Zeit', text: 'Der Betroffene verliert zu Beginn seiner Züge weiter Leben.' }),
  ammo: Object.freeze({ label: 'Nachschub', text: 'Füllt Ladungen auf, bis zur Kapazität.' }),
  move: Object.freeze({ label: 'Versetzen', text: 'Versetzt den Schützen auf festes Gelände; ein Element setzt Figuren auf dem Weg in Brand, vereist den Landepunkt oder schockt am Zielpunkt.' }),
  reveal: Object.freeze({ label: 'Aufdecken', text: 'Der Schütze gilt für einige Züge als aufgedeckt.' }),
  pull: Object.freeze({ label: 'Heranziehen', text: 'Zieht den Getroffenen zum Schützen.' }),
  turret: Object.freeze({ label: 'Geschütz', text: 'Stellt ein Geschütz oder einen Kämpfer auf, der in den folgenden Runden selbst feuert.' }),
  water_push: Object.freeze({ label: 'Wasserschub', text: 'Drückt den Getroffenen weg und hebt das Wasser an seiner Stelle.' }),
  random: Object.freeze({ label: 'Zufallswirkung', text: 'Wählt eine Selbstwirkung aus dem Pool der Waffe nach dem Zufall des Matches.' }),
  chain: Object.freeze({ label: 'Kettenblitz', text: 'Springt auf nahe Gegner über, mit abnehmender Wirkung.' }),
  mount: Object.freeze({ label: 'Reittier', text: 'Trägt den Schützen weiter als ein gewöhnlicher Sprung.' }),
  drill: Object.freeze({ label: 'Bohrstrahl', text: 'Gräbt einen Tunnel durchs Gelände.' }),
});

/** Mali (`MALUS` in `schaden.js`): ausführliche Erklärung ohne Zahlen; die Kurzfassung mit Werten steht dort. */
export const MALUS_TEXT = Object.freeze({
  brand: 'Der Betroffene brennt und verliert zu Beginn seiner Züge Leben; Wasser, Eis und große Heilung löschen.',
  gift: 'Schaden über Zeit, der sich stapeln lässt; jeder Stapel mindert die Heilung.',
  fluch: 'Heilung wirkt nur halb und der eigene Schaden sinkt; nur große Heilung bricht den Fluch.',
  saeure: 'Die Rüstung des Betroffenen wird zersetzt.',
  frost: 'Der Betroffene ist langsamer; ein zweiter Treffer oder Nässe betäubt ihn.',
  schock: 'Der Betroffene ist stark verlangsamt; bei Nässe betäubt der Schock und leitet auf nasse Gegner weiter.',
  nass: 'Löscht Brand und verstärkt Frost und Schock.',
});

/** Zustandsmarken in Rangliste und HUD (nicht die Mali): Bezeichnung und Erklärung. */
export const STATUS_TEXT = Object.freeze({
  shield: Object.freeze({ label: 'Schild', text: 'Fängt Schaden ab, bevor das Leben sinkt.' }),
  frozen: Object.freeze({ label: 'Eingefroren', text: 'Der Betroffene setzt aus.' }),
  dots: Object.freeze({ label: 'Schaden über Zeit', text: 'Der Betroffene verliert zu Beginn seiner Züge weiter Leben.' }),
  boost: Object.freeze({ label: 'Verstärkt', text: 'Der eigene Schaden ist für einige Züge erhöht.' }),
});

/** Bezeichnung einer Schadensart (unbekannt: der Schlüssel selbst). */
export function artLabel(art) {
  return ART_TEXT[art]?.label ?? String(art ?? '');
}

/** Erklärung einer Schadensart ('' wenn unbekannt). */
export function artText(art) {
  return ART_TEXT[art]?.text ?? '';
}

/** Bezeichnung einer Wirkungsart (unbekannt: 'Wirkung'). */
export function wirkungLabel(kind) {
  return WIRKUNG_TEXT[kind]?.label ?? 'Wirkung';
}

/** Erklärung einer Wirkungsart ('' wenn unbekannt). */
export function wirkungText(kind) {
  return WIRKUNG_TEXT[kind]?.text ?? '';
}

/** Tooltip einer Zustandsmarke („Schild: Fängt Schaden ab ..."), '' wenn unbekannt. */
export function statusTooltip(schluessel) {
  const eintrag = STATUS_TEXT[schluessel];
  return eintrag ? `${eintrag.label}: ${eintrag.text}` : '';
}
