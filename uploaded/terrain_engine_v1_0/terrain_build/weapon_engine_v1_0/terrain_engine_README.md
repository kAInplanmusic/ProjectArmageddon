# Project Armageddon — Terrain Engine v1.0

## Purpose

A renderer/physics-independent terrain core for the Project Armageddon Weapon Engine. It turns weapon terrain damage into persistent terrain deformation and supports:

- 12 terrain materials from the supplied concept art
- cell-based destructible terrain
- radial damage + linear/quadratic falloff
- material-specific blast/ice resistance
- permanent craters and holes
- support checks and collapse of weak materials
- water/lava flow
- water → mud and water + lava → ice/rock interactions
- fire/flammability and wood chain reactions
- event stream for renderer, particles, audio and gameplay systems
- changed-cell tracking for efficient rendering/network replication
- heightmap bootstrap generation

## Coordinate convention

`y=0` is the bottom of the world. Increasing `y` moves upward. `cellSize` is in world units.

## Integration with Weapon Engine v1.0

The existing `WeaponEngine` already calls `queryTerrainCircle()` and `applyTerrainDamage()`. `TerrainEngine` exposes both methods directly. A thin game adapter can therefore delegate those calls to one TerrainEngine instance.

For explosion/deformation, use:

```ts
terrain.deform(center, blastRadius, terrainStrength, weaponId, 'explosive');
```

For projectile impact:

```ts
terrain.damageCell(cell, amount, weaponId, 'impact');
```

## Events

Consume `terrain.consumeEvents()` after a simulation tick. Renderers should react to `cell_destroyed`, `terrain_deformed`, `collapse`, `material_transition` and `liquid_flow` rather than reconstructing terrain state themselves.

## Performance model

The engine is intentionally sparse: only occupied cells exist in the map. `changed` tracks dirty cells. This keeps destruction and replication localized instead of rebuilding the complete map after every shot.

## Production note

This v1.0 is the deterministic gameplay/data layer. For lockstep multiplayer, replace the liquid lateral `Math.random()` branch with a seeded PRNG supplied by the match simulation.
