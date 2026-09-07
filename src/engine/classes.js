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
