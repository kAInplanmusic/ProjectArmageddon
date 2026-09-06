Project Armageddon — Weapon & Weapon-Icon System v1.0
Canonical identity
	●	id is immutable: pa_001 … pa_150.
	●	index is the slot number.
	●	displayName is UI/lore text and may change.
	●	internalName is the code slug.
	●	icon.file is the runtime app-icon filename.
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
assets/weapons/source/<original upload filename>
assets/weapons/icons/<64x64 runtime icon filename>
project_armageddon_weapons_v1.json
Note
	●	The uploaded master files are stored in assets/weapons/source.
	●	The app-ready icons are generated as 64x64 PNG files in assets/weapons/icons.
	●	The former HEIC source asset was converted to PNG for runtime compatibility.
Important
The numerical values are initial game-design/balance defaults. They must be playtested and tuned against the actual Project Armageddon physics engine.