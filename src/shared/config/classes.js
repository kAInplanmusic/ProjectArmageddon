/**
 * Klassen-Konfiguration für ProjectArmageddon.
 * Definiert Klassen-Modifikatoren (Drag/Mass/Power) und Battle-Archetypen.
 */
export const CLASS_DEFINITIONS = Object.freeze({
  scout: { drag: 0.9, mass: 0.8, power: 0.7, speed: 1.2, health: 0.8 },
  heavy: { drag: 1.1, mass: 1.2, power: 1.0, speed: 0.8, health: 1.3 },
  artillery: { drag: 0.8, mass: 0.9, power: 1.3, speed: 0.7, health: 0.9 }
});

export const CLASS_ARCHETYPES = Object.freeze({
  brawler: { health: 1.2, damage: 1.1, speed: 0.9 },
  artillerist: { health: 0.8, damage: 1.4, speed: 0.8 },
  occultist: { health: 0.7, damage: 1.6, speed: 1.0 }
});

export function applyClassModifiers(weaponParams, className) {
  const classDef = CLASS_DEFINITIONS[className];
  if (!classDef) return { ...weaponParams };
  return {
    angle: weaponParams.angle,
    power: Math.round(weaponParams.power * classDef.power),
    drag: classDef.drag,
    mass: classDef.mass,
    speed: weaponParams.speed !== undefined ? weaponParams.speed * classDef.speed : undefined
  };
}

export function applyArchetypeModifiers(baseStats, archetypeName) {
  const archetype = CLASS_ARCHETYPES[archetypeName];
  if (!archetype) return { ...baseStats };
  return {
    health: Math.round(baseStats.health * archetype.health),
    damage: Math.round(baseStats.damage * archetype.damage),
    speed: baseStats.speed * archetype.speed
  };
}
