# Project Armageddon — Weapon Engine v1.0

## What is implemented
- 150 JSON-driven weapons; one stable ID per icon (`pa_001` … `pa_150`).
- Projectile spawning and deterministic fixed-step update.
- Gravity, projectile speed, bounces, piercing and fuse handling.
- Homing target acquisition and bounded steering.
- Direct-hit and radial explosion damage with distance falloff.
- Knockback as an impulse derived from the weapon's `knockback` value.
- Permanent terrain deformation through a world adapter.
- Terrain damage using `terrainDamage` or a 35% base-damage fallback.
- Status effects: burn, freeze, stun, poison, acid, sleep, curse, corruption, disorient and freeze aura.
- Special-effect dispatch for portals, summons, turrets, pools/zones, meteor/air strikes, gravity wells, fragmentation, teleport, buffs and ultimate effects.
- Boomerang/returning projectile, rocket, drill and guided projectile behaviors.
- Data validation and no renderer dependency.

## Data normalization
The original weapon JSON contains legacy camelCase fields and newer snake_case fields. The engine deliberately prefers the snake_case value when present, then falls back to camelCase. This prevents the legacy `baseDamage: 25` placeholder from overriding weapon-specific `base_damage` values such as 28, 34, 42, 110, etc.

## Integration
Implement `WorldAdapter` in the game's physics/terrain layer. The engine then owns weapon behavior while the game owns collision, rendering, entity storage and terrain representation.

Recommended simulation: fixed timestep 1/120 s for projectiles; render independently. For network play, run authoritative weapon simulation on the server and replicate projectile/event state.

## Files
- `weapon_engine_v1_0.ts` — core engine
- `terrain_v1.json` — 12 terrain materials and destruction rules
- `weapon_engine_types.ts` — export convenience
- `tests/weapon_engine.test.ts` — smoke tests
- `dist/` — compiled JavaScript
