Project Armageddon — Weapon & Weapon-Icon System v1.0
Canonical identity
	●	id is immutable: pa_001 … pa_150.
	●	index is the slot number.
	●	displayName is UI/lore text and may change.
	●	internalName is the code slug.
	●	icon.file is the exact source asset filename.
	●	The icon is resolved through the weapon ID, never by display name.
Categories
melee, ranged, heavy_ranged, elemental, magic, utility, tech, ultimate
Combat parameters
baseDamage, blastRadius, knockback, projectileSpeed, gravity, bounces, fuseTime, terrainDamage, fireDamage, iceDamage, poisonDamage, homing, piercing, aoe
Mechanic parameters
specialEffect, targeting, movement, destructibleTerrain
Balance parameters
rarity, maxAmmo, cooldown, requiresLineOfSight
Runtime chain
UI slot → pa_### → weapon record → icon.file + gameplay parameters
Asset layout
assets/weapons/icons/<exact source filename> data/project_armageddon_weapons_v1.json
Important
The numerical values are initial game-design/balance defaults. They must be playtested and tuned against the actual Project Armageddon physics engine.