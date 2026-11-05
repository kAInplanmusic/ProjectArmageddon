/**
 * Cookies Mali: zieht und wendet einen der 30 benannten Unglücke an (Fassung 4).
 *
 * Aus `match.js` herausgehalten, wie schon das Günther-Rad (`engine/guentherRad.js`):
 * Das Ziehen braucht den Teilgenerator `COOKIE`, das Anwenden Inventar, Status,
 * Wind, Zugzeit und Zielhilfe. Beides steht hier an einer Stelle.
 *
 * Der Malus hängt an der Berührung: Wer Cookie füttert, bekommt ihn. Fassung 1–3
 * rufen diese Datei nie auf — dort bleibt die Berührung folgenlos (AGENTS.md §2).
 *
 * @module cookieMalus
 */
import { waehleCookieMalus } from '../shared/config/cookieMali.js';
import { wendeTierWirkung } from './tierWirkung.js';

/**
 * @param {{world:object, statuses:object, inventory:object, tier:object, rng:object}} q
 * @param {number} playerId
 * @returns {{malus:string, name:string, erklaerung:string, stufe:string, amount:number, weaponId:string|null}|null}}
 */
export function loeseCookieMalus(q, playerId) {
  const malus = waehleCookieMalus(q.rng);
  const bericht = wendeTierWirkung(q, playerId, malus.wirkung);
  return {
    malus: malus.id,
    name: malus.name,
    erklaerung: malus.erklaerung,
    stufe: malus.stufe,
    amount: bericht.betrag,
    weaponId: bericht.weaponId ?? null,
  };
}

export default loeseCookieMalus;
