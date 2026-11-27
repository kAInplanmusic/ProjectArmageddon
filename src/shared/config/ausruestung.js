/**
 * Startausrüstung ab Kit-Fassung 5 (`KIT_AUSRUESTUNG`, TODO 2.17, Entscheidung 2026-11-25; ersetzt EXKL-1).
 *
 * Jede Figur trägt:
 *  - **5 feste Startwaffen mit unbegrenzter Munition** — für alle gleich, damit jede Figur dasselbe Grundwerkzeug hat
 *    (Granate, Rakete, Direktschuss mit Tunnel, Schläger, Maschinenpistole: das klassische Werkzeug eines Artilleriespiels).
 *  - **2 Gimmicks**: Seil = Enterhaken `pa_111` (5×) und Gleitschirm `pa_114` (5×).
 *  - **1 Spezialwaffe** ihrer Figur (`ausruestung-spezial.js`), Munition nach Stufe: legendär 1, stark 2, normal 3.
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
 * Stufe einer Waffe für die Spezialmunition (nach `powerTier` des Katalogs).
 * @param {{powerTier?:string}|null} waffe
 * @returns {'legendaer'|'stark'|'normal'}
 */
export function spezialStufe(waffe) {
  const t = waffe?.powerTier;
  if (t === 'legendary') return 'legendaer';
  if (t === 'epic' || t === 'rare') return 'stark';
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
