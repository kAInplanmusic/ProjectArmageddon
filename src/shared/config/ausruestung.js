/**
 * Startausrüstung ab Kit-Fassung 5 (`KIT_AUSRUESTUNG`, TODO 2.17, Entscheidung 2026-11-25; ersetzt EXKL-1).
 *
 * Jede Figur trägt:
 *  - **5 feste Startwaffen mit unbegrenzter Munition** — für alle gleich, damit jede Figur dasselbe Grundwerkzeug hat
 *    (Granate, Rakete, Direktschuss mit Tunnel, Schläger, Maschinenpistole: das klassische Werkzeug eines Artilleriespiels).
 *  - **2 Gimmicks**: Seil = Enterhaken `pa_111` (5×) und Gleitschirm `pa_114` (5×).
 *  - **1 Spezialwaffe** ihrer Figur (`ausruestung-spezial.js`), Munition nach Stufe: legendär 1, stark 2, normal 3.
 *    11 legendäre Waffen (`LEGENDAERE_WAFFEN`): jede der 9 Fraktionen hat eine eigene.
 *
 * Die Zuordnung der Spezialwaffen erzeugt `scripts/ausruestung-zuordnen.mjs` als feste Tabelle. Ältere Kit-Fassungen
 * (1 bis 4) lesen diese Datei nicht: alte Aufzeichnungen spielen unverändert (AGENTS.md §2).
 *
 * @module config/ausruestung
 */
import { getWeapon } from './weapons.js';
import { SPEZIAL_JE_FIGUR } from './ausruestung-spezial.js';

/**
 * Die fünf festen Startwaffen (Reihenfolge = Reihenfolge in der Waffenleiste).
 *  - `pa_041` Minirakete: Rakete mit kleinem Radius, ohne Nachladezeit (Hauptwaffe)
 *  - `pa_028` Kaktusbombe: Bombe mit Verzögerung und großem Radius, Nachladezeit 2 (zugleich die Reserve)
 *  - `pa_113` Bohrkanone: Strahl, der einen Tunnel gräbt (Direktschuss und Bewegung durchs Gelände)
 *  - `pa_001` Baseballschläger: Nahkampf mit Rückstoß (vom Rand stoßen)
 *  - `pa_040` Maschinenpistole: schneller Direktschuss, wenig Schaden
 */
export const FESTE_STARTWAFFEN = Object.freeze(['pa_041', 'pa_028', 'pa_113', 'pa_001', 'pa_040']);

/** Gimmicks mit Startmunition: das Seil (Enterhaken) und der Gleitschirm. */
export const GIMMICKS = Object.freeze({ pa_111: 5, pa_114: 5 });

/** Munition der Spezialwaffe je Stufe. */
export const SPEZIAL_MUNITION = Object.freeze({ legendaer: 1, stark: 2, normal: 3 });

/**
 * Die legendären Waffen (Rückmeldung 2026-11-27: „mindestens zehn legendäre“). Der Katalog führte nur 3 als
 * `legendary`; dazu kommen alle 8 bisher epischen: 11 legendäre, jede Fraktion bekommt eine eigene. Waffenfassung 23
 * führt sie auch im Spiel als legendär (`config/waffen-f23.js`); die Startausrüstung liest diese feste Liste, damit
 * ihre Stufen nicht von der Waffenfassung einer Partie abhängen.
 */
export const LEGENDAERE_WAFFEN = Object.freeze([
  'pa_145', 'pa_147', 'pa_150', // Erdspalter, Weltendrache, Kosmischer Kern (schon legendär)
  'pa_037', 'pa_044', 'pa_065', 'pa_077', 'pa_133', 'pa_144', 'pa_146', 'pa_148', // bisher episch
]);
const LEGENDAER = new Set(LEGENDAERE_WAFFEN);

/**
 * Stufe einer Waffe für die Spezialmunition: legendär (`LEGENDAERE_WAFFEN`), stark (`rare`), normal (`common`/`uncommon`).
 * @param {{id?:string, powerTier?:string}|null} waffe
 * @returns {'legendaer'|'stark'|'normal'}
 */
export function spezialStufe(waffe) {
  if (LEGENDAER.has(waffe?.id)) return 'legendaer';
  const t = waffe?.powerTier;
  if (t === 'legendary' || t === 'epic' || t === 'rare') return 'stark';
  return 'normal';
}

/**
 * Die Startausrüstung einer Figur.
 *
 * @param {string|null} figurId - Kennung aus `CHARACTERS` (oder null: klassische Darstellung ohne Figur, dann ohne Spezialwaffe)
 * @returns {{waffen:string[], munition:Record<string, number>}} Waffen in Leistenreihenfolge, Munition je Waffe (Infinity = unbegrenzt)
 */
export function startAusruestung(figurId) {
  const munition = {};
  for (const id of FESTE_STARTWAFFEN) munition[id] = Infinity;
  const spezial = figurId ? SPEZIAL_JE_FIGUR[figurId] ?? null : null;
  const spezialWaffe = spezial ? getWeapon(spezial) : null;
  if (spezialWaffe) munition[spezial] = SPEZIAL_MUNITION[spezialStufe(spezialWaffe)];
  for (const [id, n] of Object.entries(GIMMICKS)) munition[id] = n;
  return { waffen: Object.keys(munition), munition };
}
