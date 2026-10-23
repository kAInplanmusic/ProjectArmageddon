/**
 * FNV-1a (32 Bit): Basis und Primzahl an EINER Stelle.
 *
 * Die Stoffkarte (`stoffkarte.js`) und die Kollisionsmaske (`engine/terrain/collisionMask.js`)
 * berechnen beide einen FNV-1a-Hash über Breite, Höhe und Zellen. Basis und Primzahl sind
 * Vertrag beider Seiten: Ändert sich eine Zahl an einer Stelle, muss der andere Hash weiter
 * zusammenpassen. Deshalb stehen sie hier gemeinsam.
 *
 * @module fnv
 */

/** FNV-1a-32-Basis (Offset). */
export const FNV_BASIS = 0x811C9DC5;
/** FNV-1a-32-Primzahl. */
export const FNV_PRIM = 0x01000193;

export default { FNV_BASIS, FNV_PRIM };
