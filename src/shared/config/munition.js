/**
 * Munitionsklassen (Waffenfassung 11, Entscheidung des Auftraggebers vom 2026-10-29).
 *
 * Es gibt VIER Klassen je Waffe: UNENDLICH, 1, 2 oder 3 Schuss.
 *
 *   - UNENDLICH: die Reserve (`pa_028`) und die Standard-Startwaffen (der Pool, aus dem das Start-Kit
 *     zieht: `STARTWAFFEN_POOL`). Wer mit ihnen beginnt, hat sie ohne Ende.
 *   - 3 Schuss: schwache Waffen (Spielwert `powerScore` unter 50).
 *   - 2 Schuss: mittlere Waffen (Spielwert 50 bis unter 100).
 *   - 1 Schuss: starke Waffen (Spielwert ab 100) und alles Epische und Legendäre.
 *
 * Wer eine Waffe bekommt (Kiste, Günther, Aufheben), bekommt sie IMMER voll geladen mit der Munition ihrer
 * Klasse; ein Fund hat also höchstens 3. Obergrenze für ALLE Waffen ist 5 (`MUNITION_OBERGRENZE`); mehr als 3
 * erreicht man NUR über Munitionskisten (`CRATE_TYPES.ammo`, Kistenfassung 4), die 1 bis 5 Schuss in EINE
 * begrenzte Waffe des Spielers füllen. Die Klasse folgt dem Katalog (Stufe, Spielwert); die Fassungen 1 bis 10
 * lesen weiter `maxAmmo` und kennen die Obergrenze nicht.
 *
 * @module config/munition
 */
import { FALLBACK_WEAPON_ID } from './weapons.js';

/** Höchstvorrat jeder Waffe. */
export const MUNITION_OBERGRENZE = 5;
/** Höchstvorrat einer frisch erhaltenen Waffe (Klasse 3). */
export const MUNITION_FUND_MAX = 3;
/** Spielwert-Grenzen der Klassen: unter 50 = 3 Schuss, unter 100 = 2, sonst 1. */
export const MUNITION_GRENZE_SCHWACH = 50;
export const MUNITION_GRENZE_STARK = 100;
/** Eine Munitionskiste füllt 1 bis 5 Schuss. */
export const MUNITION_KISTE_MIN = 1;
export const MUNITION_KISTE_MAX = 5;

/**
 * Die Standard-Startwaffen: Common-Würfe mit Schaden, aus denen das Start-Kit (`loadouts.js`, Fassung 4)
 * zieht. Ein Test belegt, dass jede Kit-Startwaffe hier steht.
 */
export const STARTWAFFEN_POOL = Object.freeze(['pa_023', 'pa_024', 'pa_025', 'pa_027', 'pa_033', 'pa_034', 'pa_036', 'pa_040']);

const UNENDLICH = new Set([FALLBACK_WEAPON_ID, ...STARTWAFFEN_POOL]);

/**
 * Munitionsklasse einer Waffe: `Infinity`, 1, 2 oder 3.
 *
 * @param {{id:string, powerTier?:string, powerScore?:number}} waffe - Katalogeintrag
 * @returns {number}
 */
export function munitionsKlasse(waffe) {
  if (!waffe) return 1;
  if (UNENDLICH.has(waffe.id)) return Infinity;
  if (waffe.powerTier === 'epic' || waffe.powerTier === 'legendary') return 1;
  const wert = Number(waffe.powerScore) || 0;
  if (wert < MUNITION_GRENZE_SCHWACH) return 3;
  if (wert < MUNITION_GRENZE_STARK) return 2;
  return 1;
}
