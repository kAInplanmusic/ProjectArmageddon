/**
 * Allsehendes Auge (`pa_107`, Waffenfassung 21, Entscheidung 14 vom 2026-11-11): Solange die Wirkung des Schützen läuft
 * (`statuses.isRevealed`), sieht er den Inhalt ALLER liegenden Kisten.
 *
 * Bis Fassung 20 setzte die Waffe nur den Zähler `revealedTurns`; ihn las kein Verbraucher. Der Inhalt einer Kiste
 * (Waffe, Munition, Art) steht NICHT im öffentlichen Zustand (`getState().crates` führt nur Art und Seltenheit) und nicht
 * im binären Snapshot. Diese reine Funktion liefert ihn nur für einen Spieler mit laufender Wirkung; der Server schickt
 * das Ergebnis ausschließlich an die Sitze des Teams dieses Spielers (`lobbySession.js`), der lokale Client liest es für
 * die aktive Figur.
 *
 * Kein Zufall, keine Uhr, ändert keinen Zustand.
 *
 * @module engine/kistenSicht
 */
import { COMPONENT_SIGNATURES } from './ecs/world.js';
import { CRATE_TYPES, weaponIdFromIndex } from './systems/lootSystem.js';

const ART_NAMEN = Object.freeze(Object.fromEntries(Object.entries(CRATE_TYPES).map(([name, id]) => [id, name])));

/**
 * @param {object} world
 * @param {{isRevealed:function(number):boolean}} statuses
 * @param {number} playerId - Schütze mit dem Auge
 * @returns {{entityId:number, art:string, weaponId:string|null, ammo:number}[]} leer ohne laufende Wirkung
 */
export function kistenInhalt(world, statuses, playerId) {
  if (!statuses?.isRevealed?.(playerId)) return [];
  const liste = [];
  for (const id of world.getEntitiesBySignature(COMPONENT_SIGNATURES.CRATE | COMPONENT_SIGNATURES.POSITION)) {
    if (!world.isActive(id) || world.getComponent(id, 'Crate', 'picked') === 1) continue;
    const art = world.getComponent(id, 'Crate', 'crateType');
    const waffe = art === CRATE_TYPES.weapon ? weaponIdFromIndex(world.getComponent(id, 'Crate', 'weaponId')) : null;
    liste.push({ entityId: id, art: ART_NAMEN[art] ?? 'empty', weaponId: waffe, ammo: world.getComponent(id, 'Crate', 'ammo') || 0 });
  }
  return liste;
}
