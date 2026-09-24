/**
 * Schadensarten des Waffenkatalogs als Zahlenindex.
 *
 * WARUM HANDGESCHRIEBEN UND NICHT GENERIERT
 * ----------------------------------------
 * Die Kennungen sind Teil des WIRKUNGSVERTRAGS: Sie stehen in
 * Int32-Feldern des Komponentenspeichers (Projektil) und gehen über
 * Momentaufnahmen an den Client. Ein generierter Index würde sich mit jeder
 * Katalogänderung verschieben und damit die Bedeutung laufender Aufzeichnungen
 * und Netzwerkverbindungen brechen. Diese Liste ist deshalb von Hand gepflegt
 * und darf nur ERWEITERT (angehängt), niemals umgeordnet werden.
 *
 * `physical` steht auf 0 und ist zugleich der Rückfallwert: Eine Waffe ohne
 * Angabe — in der Designdatei sind das 26 der 150, alle aus dem Nahkampf und
 * dem direkten Fernkampf — wirkt stumpf/schneidend. Der Generator leitet die
 * Art für diese Fälle aus dem Anzeigenamen ab (`deriveDamageType` in
 * `scripts/build-weapon-catalog.mjs`); "physical" bleibt nur, wenn auch der
 * Name keinen Hinweis trägt.
 *
 * FUND (belegt, gemessen 2026-09-25): Das Feld `damageType` war im Katalog
 * vorhanden, aber KEIN Stück Motor las es. Ein Raketenwerfer und ein
 * Baseballschläger trugen dieselbe Angabe und dieselbe Wirkung. Erst mit
 * diesem Index ist die Schadensart im Motor greifbar — sie reist als Zahl im
 * Projektil mit und steht im `damage`-Ereignis.
 */

/** Stabile Kennungen. NUR ANHÄNGEN — siehe Kopfkommentar. */
export const DAMAGE_TYPE_IDS = Object.freeze([
  'physical',   // 0 — Rückfallwert: stumpf/schneidend
  'acid',       // 1
  'arcane',     // 2
  'astral',     // 3
  'chaos',      // 4
  'dark',       // 5
  'defense',    // 6
  'dragon',     // 7
  'electric',   // 8
  'energy',     // 9
  'explosive',  // 10
  'fire',       // 11
  'holy',       // 12
  'ice',        // 13
  'impact',     // 14
  'magnetic',   // 15
  'medical',    // 16
  'nature',     // 17
  'poison',     // 18
  'psychic',    // 19
  'spatial',    // 20
  'temporal',   // 21
  'time',       // 22
  'utility',    // 23
  'void',       // 24
  'water',      // 25
  'wind',       // 26
]);

/** Der Rückfallwert, wenn eine Waffe keine (bekannte) Art nennt. */
export const DEFAULT_DAMAGE_TYPE_ID = 0;

const ID_BY_NAME = new Map(DAMAGE_TYPE_IDS.map((name, id) => [name, id]));

/**
 * Name → Kennung.
 *
 * Unbekannte Namen fallen auf `physical` (0) zurück, statt `undefined` in ein
 * Int32-Feld zu schreiben (das würde 0 ergeben — dieselbe Zahl, aber ohne
 * Begründung). Ein unbekannter Name ist ein Katalogfehler; `npm run
 * check:damage-types` meldet ihn.
 */
export function damageTypeId(name) {
  if (typeof name === 'number') return Number.isInteger(name) ? name : DEFAULT_DAMAGE_TYPE_ID;
  const id = ID_BY_NAME.get(name);
  return id === undefined ? DEFAULT_DAMAGE_TYPE_ID : id;
}

/** Kennung → Name (für Ereignisse, Anzeige und Tests). */
export function damageTypeName(id) {
  return DAMAGE_TYPE_IDS[id] ?? DAMAGE_TYPE_IDS[DEFAULT_DAMAGE_TYPE_ID];
}

/** Kennt der Motor diese Schadensart? */
export function isKnownDamageType(name) {
  return ID_BY_NAME.has(name);
}
