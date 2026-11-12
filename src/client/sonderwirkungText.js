/**
 * Protokolltext einer Wirkung auf den Schützen (Heilung, Schild, Schadensbonus ...). Reine Textfunktion, aus
 * `main.js` ausgelagert (Zeilenbudget); Inhalt und Reihenfolge der Fälle sind unverändert.
 *
 * @module client/sonderwirkungText
 */
import { wirkungLabel } from '../shared/config/wirkungstexte.js';

/**
 * @param {object} payload - Ereignis `special_effect`
 * @param {string} name - Anzeigename des Schützen
 * @returns {{text: string, art?: string}|null} `null`, wenn keine Zeile ins Protokoll soll (Mine)
 */
export function sonderwirkungText(payload, name) {
  switch (payload.kind) {
    case 'heal':
      return payload.healed > 0
        ? { text: `${name} heilt ${Math.round(payload.healed)} Lebenspunkte`, art: 'good' }
        : { text: `${name} ist bereits vollständig geheilt`, art: 'neutral' };
    case 'shield': return { text: `${name} erhält ${Math.round(payload.shield)} Schild`, art: 'accent' };
    case 'damage_boost': return { text: `${name} macht ×${payload.multiplier} Schaden`, art: 'accent' };
    case 'armor': return { text: `${name} nimmt ${Math.round(payload.reduction * 100)} % weniger Schaden`, art: 'accent' };
    case 'ammo':
      return payload.restored > 0
        ? { text: `${name} füllt ${payload.restored} Ladungen nach`, art: 'good' }
        : { text: `${name} hat nichts nachzufüllen`, art: 'neutral' };
    case 'move':
      return { text: `${name} versetzt sich um ${Math.round(Math.hypot(payload.moved?.dx ?? 0, payload.moved?.dy ?? 0))} px`, art: 'accent' };
    case 'mine': return null; // `mine_placed` meldet die Mine selbst (Protokoll und Blitz); keine zweite Zeile
    case 'reveal': return { text: `${name} ist für ${payload.revealedTurns} Züge aufgedeckt`, art: 'accent' };
    case 'random': return { text: `${name}: Zufallswirkung ${wirkungLabel(payload.randomKind)}`, art: 'accent' };
    default: return { text: `${name} setzt ${wirkungLabel(payload.kind)} ein` };
  }
}
