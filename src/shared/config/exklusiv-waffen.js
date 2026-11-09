/**
 * Exklusive Waffe je Charakter (EXKL-1) — Datenschicht, kein Katalogumbau.
 *
 * ## Was hier steht und was ausdrücklich NICHT
 *
 * Der Waffenkatalog (`config/weapons.js`, 150 Einträge) ist AUTO-GENERIERT und
 * bleibt unverändert. Eine exklusive Waffe ist deshalb **kein neuer Eintrag** in
 * `WEAPONS`: Sie ist eine Zuordnung `Charakter → vorhandene Katalogwaffe`, die
 * nur für diesen Charakter als besondere Beute fällt.
 *
 * Das hält zwei Zusagen ein:
 *  - **Altreplays bleiben bitgleich.** Kein neues Feld auf `WEAPONS`, keine
 *    geänderte Reihenfolge, keine andere Ziehung im Loot.
 *  - **Der Katalog wird nicht künstlich aufgebläht.** Es entstehen keine 81
 *    erfundenen Waffen; die 81 Figuren teilen sich die vorhandenen 150.
 *
 * ## Warum die Zuordnungstabelle leer startet
 *
 * Jede Figur trägt in `factions.js` eine `superWeapon` (Name + Beschreibung).
 * Das sind **Geschichten**, keine Spielwerte: Von 81 Namen kommt genau einer
 * (`Enterhaken`) wörtlich im Katalog vor. Welche Katalogwaffe eine Figur
 * exklusiv führen soll, ist eine Inhaltsentscheidung des Auftraggebers — sie
 * wird hier nicht geraten. Die Mechanik ist fertig und geprüft; sobald die
 * Tabelle gefüllt ist, greift sie ohne weiteren Umbau.
 *
 * ## Die Drop-Regel
 *
 * Eine exklusive Waffe fällt NUR als legendärer Drop und NUR für ihren
 * Charakter. Für alle anderen ist sie kein normales Loot. Beides ist eine reine
 * Prüffunktion (`darfAlsExklusivDrop`, `istNormalloot`), damit der Loot-Pfad
 * dieselbe Quelle liest, statt die Regel nachzubauen.
 *
 * @module config/exklusiv-waffen
 */

import { getWeapon } from './weapons.js';
import { getCharacter } from './factions.js';

/**
 * Die Stufe, auf der eine exklusive Waffe fallen darf.
 *
 * `legendary` ist die höchste Stufe des Loot-Systems (fünf Stufen,
 * `lootSystem.js#STUFEN`). Sie ist hier eine Zeichenkette, weil die Stufe im
 * Katalog als `powerTier` geführt wird und die Kiste dieselbe Schreibweise
 * benutzt.
 */
export const EXKLUSIV_DROP_STUFE = 'legendary';

/**
 * Zuordnung Charakter-Kennung → Waffen-Kennung.
 *
 * Absichtlich LEER: Siehe Modulkopf. Ein Eintrag ist eine Inhaltsentscheidung,
 * keine Ableitung. Die Form ist dennoch festgelegt, damit Tests und Werkzeuge
 * gegen dieselbe Struktur laufen.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const EXKLUSIV_ZUORDNUNGEN = Object.freeze({});

/**
 * Die exklusive Waffe eines Charakters.
 *
 * @param {string} charakterId
 * @param {Readonly<Record<string,string>>} [zuordnungen]
 * @returns {Readonly<{charakterId:string, charakter:object, waffeId:string, waffe:object, dropStufe:string}>|null}
 *   `null`, wenn die Figur keine Zuordnung hat oder eines der Ziele unbekannt ist.
 */
export function exklusivwaffeFuer(charakterId, zuordnungen = EXKLUSIV_ZUORDNUNGEN) {
  const waffeId = zuordnungen?.[charakterId];
  if (typeof waffeId !== 'string' || waffeId.length === 0) return null;
  const charakter = getCharacter(charakterId);
  const waffe = getWeapon(waffeId);
  if (!charakter || !waffe) return null;
  return Object.freeze({
    charakterId,
    charakter,
    waffeId,
    waffe,
    dropStufe: EXKLUSIV_DROP_STUFE,
  });
}

/**
 * Ist diese Waffe irgendwem exklusiv zugeordnet?
 *
 * @param {string} waffeId
 * @param {Readonly<Record<string,string>>} [zuordnungen]
 * @returns {boolean}
 */
export function istExklusivwaffe(waffeId, zuordnungen = EXKLUSIV_ZUORDNUNGEN) {
  if (typeof waffeId !== 'string') return false;
  return Object.values(zuordnungen ?? {}).includes(waffeId);
}

/**
 * Darf diese Waffe als EXKLUSIVER Drop fallen?
 *
 * Drei Bedingungen zusammen: richtige Stufe (`legendary`), die Waffe gehört
 * genau diesem Charakter, und beide Kennungen existieren.
 *
 * @param {string} waffeId
 * @param {string} charakterId
 * @param {string} stufe - Loot-Stufe der Kiste
 * @param {Readonly<Record<string,string>>} [zuordnungen]
 * @returns {boolean}
 */
export function darfAlsExklusivDrop(waffeId, charakterId, stufe, zuordnungen = EXKLUSIV_ZUORDNUNGEN) {
  if (stufe !== EXKLUSIV_DROP_STUFE) return false;
  if (typeof waffeId !== 'string' || typeof charakterId !== 'string') return false;
  if (zuordnungen?.[charakterId] !== waffeId) return false;
  return exklusivwaffeFuer(charakterId, zuordnungen) !== null;
}

/**
 * Darf diese Waffe im NORMALEN Loot erscheinen?
 *
 * Exklusive Waffen sind ausdrücklich ausgenommen: Wer sie auch regulär ziehen
 * könnte, hätte keine exklusive Waffe mehr. Alte Zuordnungsleere ändert nichts
 * (dann ist alles normales Loot).
 *
 * @param {string} waffeId
 * @param {Readonly<Record<string,string>>} [zuordnungen]
 * @returns {boolean}
 */
export function istNormalloot(waffeId, zuordnungen = EXKLUSIV_ZUORDNUNGEN) {
  return typeof waffeId === 'string' && !istExklusivwaffe(waffeId, zuordnungen);
}

/**
 * Prüft eine Zuordnungstabelle auf Vollständigkeit und Widersprüche.
 *
 * Geprüft wird gegen die ECHTEN Kataloge (`factions.js`, `weapons.js`), nicht
 * gegen abgeschriebene Listen:
 *  - jede Charakter-Kennung existiert,
 *  - jede Waffen-Kennung existiert,
 *  - keine Waffe ist zwei Charakteren zugeordnet (dann wäre sie nicht exklusiv),
 *  - die Drop-Stufe ist die festgelegte.
 *
 * @param {Readonly<Record<string,string>>} [zuordnungen]
 * @returns {string[]} Fehlertexte; leer = in Ordnung
 */
export function pruefeExklusivdaten(zuordnungen = EXKLUSIV_ZUORDNUNGEN) {
  const fehler = [];
  if (!zuordnungen || typeof zuordnungen !== 'object' || Array.isArray(zuordnungen)) {
    return ['Zuordnungen müssen ein Objekt Charakter → Waffe sein'];
  }

  const benutzteWaffen = new Map();
  for (const [charakterId, waffeId] of Object.entries(zuordnungen)) {
    if (!getCharacter(charakterId)) {
      fehler.push(`${charakterId}: unbekannter Charakter`);
    }
    if (typeof waffeId !== 'string' || !getWeapon(waffeId)) {
      fehler.push(`${charakterId}: unbekannte Waffe ${JSON.stringify(waffeId)}`);
      continue;
    }
    if (benutzteWaffen.has(waffeId)) {
      fehler.push(`${waffeId}: doppelt zugeordnet (${benutzteWaffen.get(waffeId)}, ${charakterId})`);
    }
    benutzteWaffen.set(waffeId, charakterId);
  }

  if (EXKLUSIV_DROP_STUFE !== 'legendary') {
    fehler.push(`Drop-Stufe ist ${EXKLUSIV_DROP_STUFE}, erwartet legendary`);
  }
  return fehler;
}

export default EXKLUSIV_ZUORDNUNGEN;
