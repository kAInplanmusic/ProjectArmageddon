// Mapping of class IDs to gameplay modifiers
// Each class defines: dragCoefficient multiplier, mass multiplier, power multiplier
// These values are applied on top of the base projectile parameters when the entity fires.
export const CLASS_DEFINITIONS = Object.freeze({
  // Example classes – you can extend later
  0: { // Default / Scout
    name: "Scout",
    dragMultiplier: 0.8,
    massMultiplier: 0.9,
    powerMultiplier: 1.0,
    color: "#4caf50"
  },
  1: { // Heavy
    name: "Heavy",
    dragMultiplier: 1.2,
    massMultiplier: 1.5,
    powerMultiplier: 0.9,
    color: "#f44336"
  },
  2: { // Artillery
    name: "Artillery",
    dragMultiplier: 1.0,
    massMultiplier: 1.0,
    powerMultiplier: 1.2,
    color: "#2196f3"
  }
});

/**
 * Apply class modifiers to an entity's projectile components.
 * Looks up the entity's class via `components.classId` and multiplies
 * the corresponding component values (drag, mass, power) by the class
 * modifiers defined in `CLASS_DEFINITIONS`.
 *
 * @param {number} entityId - The entity ID to modify.
 * @param {object} components - The ComponentStore instance containing component arrays.
 */
export function applyClassModifiers(entityId, components) {
  const classId = components.classId?.[entityId];
  if (classId === undefined) return;
  const def = CLASS_DEFINITIONS[classId];
  if (!def) return;
  if (components.drag?.[entityId] !== undefined) {
    components.drag[entityId] *= def.dragMultiplier;
  }
  if (components.mass?.[entityId] !== undefined) {
    components.mass[entityId] *= def.massMultiplier;
  }
  if (components.power?.[entityId] !== undefined) {
    components.power[entityId] *= def.powerMultiplier;
  }
}

