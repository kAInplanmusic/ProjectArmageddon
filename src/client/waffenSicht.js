/**
 * Die EINE Waffensicht für Anzeige und Darstellung.
 *
 * ## Warum es dieses Modul gibt (W02/W03/W07/W09/W19)
 *
 * Menü-Kachel, Detailzeile, HUD-Leiste und Renderer lasen bisher an
 * verschiedenen Stellen entweder den Grundkatalog (`WEAPONS_BY_ID`) oder die
 * Partiefassung (`getWaffe`). Bei `pa_127` stand deshalb „Teleportplattform“ auf
 * der Kachel und „Mine“ in der Detailzeile, und die HUD-Leiste zeigte den
 * Katalogschaden statt den der Partie. Diese Datei beantwortet die drei Fragen
 * EINMAL, immer mit derselben Fassung:
 *
 *   1. Welche Waffe gilt?                 → `getWaffe(id, fassung)`
 *   2. Welche Rolle hat sie in der Welt?  → `waffenRolle(...)`
 *   3. Welche Kennzahl beschreibt sie?    → `wirkungsKennzahl(...)`
 *
 * ## Rollen (W07)
 *
 * `hand`      wird gehalten (Gewehr, Schwert, Zauberstab).
 * `geschoss`  wird selbst geworfen; das Handbild ist zugleich das Flugbild.
 * `ruecken`   Rucksack/Gleitschirm: am Körper getragen, nicht in der Faust.
 * `selbst`    wirkt auf den Anwender (Heilung, Schild, Sprung, Munition …).
 * `weltobjekt` wird aufgestellt/beschwört (Mine, Geschütz, Portal, Baum …).
 * `ui`        reine Menü-/Katalogrolle (kein eigener Weltsprite).
 *
 * Nur `hand`, `geschoss` und `ruecken` dürfen im Renderer als getragene Waffe
 * gezeichnet werden; `selbst` und `weltobjekt` haben eigene Darstellungen.
 *
 * ## Kennzahlen (W09)
 *
 * 38 Waffen sind Selbstwirkungen, 23 davon tragen dennoch einen positiven
 * Katalogschaden. Der ist ein abgeleiteter Parameter, keine Aussage „diese
 * Waffe nimmt 35 Leben“. Deshalb liefert `wirkungsKennzahl` für sie Heilwert,
 * Schild, Verstärkung, Bewegung, Munition oder Minenfunktion — und
 * `anzeigeKennzahl` nur für echte Angriffe „Schaden N“.
 *
 * @module waffenSicht
 */
import { getWaffe } from '../shared/config/waffen-fassung.js';
import { buildEffect, SELF_TARGET_KINDS } from '../engine/specials.js';
import { wirkungLabel } from '../shared/config/wirkungstexte.js';
import { ROLLEN, rolleFuer, wirkpfadFuer, rollenLabel } from '../shared/config/waffen-rollen.js';

export const WAFFEN_ROLLEN = Object.freeze(['hand', 'geschoss', 'ruecken', 'selbst', 'weltobjekt', 'ui']);

/**
 * Die fünf semantischen Rollen (BAL-11) mit deutschen Anzeigenamen. Sie stehen
 * in `config/waffen-rollen.js`; hier nur der Durchgriff für die Anzeige.
 */
export { ROLLEN as SEMANTISCHE_ROLLEN, rollenLabel, rolleFuer, wirkpfadFuer };

/** Am Körper getragen, nicht in der Hand (Rucksack, Düsenrucksack, Gleitschirm). */
const RUECKEN_IDS = Object.freeze(new Set(['pa_032', 'pa_112', 'pa_114']));

/**
 * Aufstell-, Beschwörungs- und Ortswirkung. Die Wirkungsart allein reicht
 * nicht: Ein Giftbaum ist `damage_boost`, ein Portal `move`, eine
 * Wächterstatue `heal` — in allen drei Fällen steht trotzdem ein Objekt in
 * der Welt und keine gehaltene Waffe.
 */
const WELT_SPECIALS = Object.freeze(new Set([
  'auto_target',        // Wachgeschütz
  'summon_warrior',     // Astralkrieger
  'summon_mount',       // Astralross
  'guardian',           // Wächterstatue
  'mine',               // Mine (ab Fassung 12)
  'bunker',             // Bunker
  'camouflage',         // Tarnnetz
  'ammo_drop',          // Munitionskiste
  'supply_drop',        // Nachschubkiste
  'portal',             // Portalring
  'portal_field',       // Kosmisches Portal
  'hologram_portal',    // Hologrammportal
  'area_buff',          // Giftbaum
  'water_mobility',     // Schlauchboot
  'teleport_platform',  // Teleportplattform (pa_127 bis Fassung 11)
]));

/** Wirkungsarten, die immer ein Weltobjekt erzeugen. */
const WELT_KINDS = Object.freeze(new Set(['turret', 'mine', 'mount']));

/**
 * Wirkt die Waffe zuerst auf den Anwender? Maßgeblich ist derselbe Pfad wie im
 * Motor (`buildEffect` + `SELF_TARGET_KINDS`), NICHT `damage === 0`: 23
 * Selbstwirkungen tragen einen positiven Katalogwert.
 *
 * @param {object|null|undefined} waffe
 * @returns {boolean}
 */
export function istSelbstwirkung(waffe) {
  const effekt = buildEffect(waffe);
  return Boolean(effekt && SELF_TARGET_KINDS.has(effekt.kind));
}

/**
 * Rolle einer Waffe in der Darstellung.
 *
 * Seit BAL-11 kommt die Entscheidung aus `config/waffen-rollen.js` (eine
 * dokumentierte Rolle je ID), nicht mehr aus einer Sonderfall-Heuristik:
 *
 *   hand                      → `hand`, Wurfwaffen mit Ding-Bild → `geschoss`
 *   ruecken                    → `ruecken`
 *   aufstell | beschwoerung    → `weltobjekt`
 *   symbol                     → `selbst`
 *
 * Nur `hand`, `geschoss` und `ruecken` werden als getragene Waffe gezeichnet;
 * `selbst` und `weltobjekt` haben eigene Darstellungen. Für unbekannte IDs
 * bleibt die frühere Heuristik als Rückfall erhalten.
 *
 * @param {object|null|undefined} waffe - Katalogeintrag in der Partiefassung
 * @param {object|null} [effekt] - Ergebnis von `buildEffect` (optional, spart Arbeit)
 * @param {{projektilInfo?:{art?:string}|null}|null} [sp] - Sprite-Eintrag (Wurfdinge)
 * @returns {'hand'|'geschoss'|'ruecken'|'selbst'|'weltobjekt'|'ui'}
 */
export function waffenRolle(waffe, effekt = buildEffect(waffe), sp = null) {
  if (!waffe) return 'ui';
  const rolle = rolleFuer(waffe);
  if (rolle === 'ruecken') return 'ruecken';
  if (rolle === 'aufstell' || rolle === 'beschwoerung') return 'weltobjekt';
  if (rolle === 'symbol') return 'selbst';
  if (rolle === 'hand') {
    if (sp?.projektilInfo?.art === 'ding' || (waffe.fuseTime ?? 0) > 0) return 'geschoss';
    return 'hand';
  }
  // Rückfall für IDs ohne Eintrag (z. B. Sonderwerkzeuge): bisherige Heuristik.
  if (RUECKEN_IDS.has(waffe.id)) return 'ruecken';
  if (WELT_SPECIALS.has(waffe.special) || (effekt && WELT_KINDS.has(effekt.kind))) return 'weltobjekt';
  if (effekt && SELF_TARGET_KINDS.has(effekt.kind)) return 'selbst';
  if (sp?.projektilInfo?.art === 'ding' || (waffe.fuseTime ?? 0) > 0) return 'geschoss';
  return 'hand';
}

/**
 * Kennzahl einer Wirkung in Worten — nie „DMG“ für Heilung, Schild oder
 * Bewegung. Zahlen kommen aus demselben `buildEffect` wie im Motor.
 *
 * @param {object|null|undefined} waffe
 * @param {object|null} [effekt]
 * @returns {string|null} `null` für gewöhnliche Angriffswaffen
 */
export function wirkungsKennzahl(waffe, effekt = buildEffect(waffe)) {
  if (!effekt) return null;
  switch (effekt.kind) {
    case 'heal':
      return `Heilung ${effekt.amount}${effekt.reinigt?.length ? ` · reinigt ${effekt.reinigt.join(', ')}` : ''}`;
    case 'shield':
      return `Schild ${effekt.amount}${effekt.gegen ? ` · gegen ${effekt.gegen}` : ''}`;
    case 'damage_boost':
      return `Verstärkung ×${effekt.multiplier}${effekt.turns ? ` · ${effekt.turns} Züge` : ''}`;
    case 'armor':
      return `Rüstung ${Math.round((effekt.reduction ?? 0) * 100)} %`;
    case 'ammo':
      return `Munition +${effekt.amount}`;
    case 'move':
      return `Versetzen ${effekt.distance}`;
    case 'mount':
      return `Reittier ${effekt.distance}`;
    case 'reveal':
      return `Aufdecken ${effekt.turns} ${effekt.turns === 1 ? 'Zug' : 'Züge'}`;
    case 'random':
      return `Zufallswirkung: ${(effekt.pool ?? []).map(kind => wirkungLabel(kind)).join(', ')}`;
    case 'turret':
      return `Geschütz ${effekt.damage} Schaden · Reichweite ${effekt.range}`;
    case 'mine':
      return 'Minenfunktion (legt eine Mine)';
    default:
      return wirkungLabel(effekt.kind);
  }
}

/**
 * Die Kennzahl, die eine Zeile beschreiben darf: Schaden nur für echte
 * Angriffe, für Selbst- und Weltwirkungen die passende Wirkungszahl.
 *
 * @param {object|null|undefined} waffe
 * @returns {string}
 */
export function anzeigeKennzahl(waffe) {
  if (!waffe) return '';
  const effekt = buildEffect(waffe);
  const rolle = waffenRolle(waffe, effekt);
  const selbst = Boolean(effekt && SELF_TARGET_KINDS.has(effekt.kind));
  if (selbst || rolle === 'weltobjekt') {
    return wirkungsKennzahl(waffe, effekt) ?? wirkungLabel(effekt?.kind);
  }
  return `Schaden ${waffe.damage ?? 0}`;
}

/**
 * Die vollständige Anzeigesicht einer Waffe in einer Partiefassung.
 *
 * @param {string} id
 * @param {number} [fassung]
 * @returns {{waffe:object, effekt:object|null, rolle:string, semantischeRolle:string|null,
 *   rollenLabel:string, wirkpfad:string|null, selbst:boolean, kennzahl:string}|null}
 */
export function waffeFuerAnzeige(id, fassung) {
  const waffe = getWaffe(id, fassung);
  if (!waffe) return null;
  const effekt = buildEffect(waffe);
  const rolle = waffenRolle(waffe, effekt);
  const semantischeRolle = rolleFuer(waffe);
  return {
    waffe,
    effekt,
    rolle,
    semantischeRolle,
    rollenLabel: rollenLabel(semantischeRolle),
    wirkpfad: wirkpfadFuer(waffe),
    selbst: Boolean(effekt && SELF_TARGET_KINDS.has(effekt.kind)),
    kennzahl: anzeigeKennzahl(waffe),
  };
}
