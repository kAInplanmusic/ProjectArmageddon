#!/usr/bin/env node
/**
 * Generiert src/shared/config/weapons.js aus project_armageddon_weapons_v1.json.
 *
 * Grund: JSON-Importe funktionieren in Node-ESM nur mit Import-Attributen,
 * Vite erwartet sie ohne. Eine generierte JS-Datei ist in beiden Laufzeiten
 * identisch importierbar und bleibt die Single Source of Truth fuer Runtime.
 *
 * WICHTIG: Die Quelldatei fuehrt zwei parallele Feldfamilien. Die camelCase-
 * Felder (`blastRadius`, `terrainDamage`, ...) sind ueberwiegend 0-Platzhalter,
 * die snake_case-Felder (`blast_radius`, `terrain_damage`, ...) tragen die
 * echten Werte und sind nur bei manchen Eintraegen vorhanden. Deshalb wird pro
 * Feld der erste *positive* Kandidat gewaehlt statt blind der erste.
 *
 * Aufruf: node scripts/build-weapon-catalog.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const sourcePath = resolve(root, 'project_armageddon_weapons_v1.json');
const targetPath = resolve(root, 'src/shared/config/weapons.js');

const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Waehlt den aussagekraeftigsten Wert aus mehreren Feldnamen.
 * Bevorzugt den ersten positiven Wert; sonst 0.
 */
/**
 * Waehlt den ersten positiven Wert aus mehreren Feldnamen.
 *
 * REIHENFOLGE IST ENTSCHEIDEND: In der Quelldatei sind die camelCase-Felder
 * ueberwiegend Platzhalter — `blastRadius`, `terrainDamage`, `fuseTime` und alle
 * Elementarschaeden stehen dort konstant auf 0, `baseDamage` konstant auf 25 und
 * `projectileSpeed` konstant auf 70. Die echten, je Waffe verschiedenen Werte
 * liegen in den snake_case-Feldern. Deshalb wird IMMER zuerst der snake_case-Name
 * uebergeben und der camelCase-Name nur als Rueckfall verwendet.
 */
function pickPositive(stats, ...names) {
  for (const name of names) {
    const value = toNumber(stats[name]);
    if (value > 0) return value;
  }
  return 0;
}

function pickString(stats, ...names) {
  for (const name of names) {
    const value = stats[name];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/**
 * Einstufung in fünf Stufen.
 *
 * Die Quelldaten kennen nur `common`, `uncommon` und `rare`. `epic` und
 * `legendary` werden deshalb NICHT erfunden, sondern deterministisch aus den
 * Waffenwerten abgeleitet: eine reine Funktion der Statistik, damit dieselbe
 * Waffe immer dieselbe Stufe bekommt.
 *
 * Die Gewichtung spiegelt den tatsächlichen Kampfwert wider: Schaden und
 * Flächenwirkung wiegen am schwersten, danach Terrain-Abbau, Rückstoß und
 * Elementareffekte. Munition und Abklingzeit wirken als Begrenzung — eine
 * stärkere Waffe mit sehr wenig Munition steigt dadurch nicht auf.
 */
export function computePowerScore(weapon) {
  const elemental = (weapon.elemental?.fire ?? 0)
    + (weapon.elemental?.ice ?? 0)
    + (weapon.elemental?.poison ?? 0);

  const rawScore =
    weapon.damage * 1.0
    + weapon.blastRadius * 0.85
    + weapon.terrainDamage * 0.6
    + weapon.knockback * 0.12
    + (weapon.aoe ? 12 : 0)
    + weapon.piercing * 6
    + weapon.homing * 5
    + weapon.bounces * 3
    + elemental * 0.5;

  // Verfügbarkeitsfaktor: viel Munition und keine Abklingzeit machen eine Waffe
  // im Spiel wertvoller, sehr wenig Munition drückt den Wert.
  const ammoFactor = weapon.maxAmmo <= 0 ? 1 : 1 + Math.min(0.25, (weapon.maxAmmo - 3) * 0.05);
  const cooldownFactor = weapon.cooldown > 0 ? 0.9 : 1;
  const losFactor = weapon.requiresLineOfSight ? 0.95 : 1;

  return Number((rawScore * ammoFactor * cooldownFactor * losFactor).toFixed(2));
}

/** Schwellen der abgeleiteten Einstufung. Bewusst dokumentiert und testbar. */
export const POWER_TIERS = Object.freeze([
  Object.freeze({ tier: 'legendary', min: 190 }),
  Object.freeze({ tier: 'epic', min: 130 }),
  Object.freeze({ tier: 'rare', min: 80 }),
  Object.freeze({ tier: 'uncommon', min: 45 }),
  Object.freeze({ tier: 'common', min: 0 }),
]);

/** Ordnet einem Leistungswert die Stufe zu. */
export function tierForScore(score) {
  return (POWER_TIERS.find(entry => score >= entry.min) ?? POWER_TIERS[POWER_TIERS.length - 1]).tier;
}

/** Basis-URL für Waffen-Icons (Vite löst den Import-Pfad relativ zu diesem Modul auf). */
export const WEAPON_ICON_BASE = '../../client/assets/icons';

/** Icons liegen als `<Dateiname ohne Endung>_icon.png` vor. */
export function iconPathFor(iconFile) {
  if (!iconFile) return null;
  const stem = String(iconFile).replace(/\.[^.]+$/, '');
  return `${WEAPON_ICON_BASE}/${stem}_icon.png`;
}

const weapons = raw.weapons.map(entry => {
  const stats = entry.stats ?? {};
  const balance = entry.balance ?? {};
  const category = entry.category ?? 'projectile';
  const isMelee = category === 'melee';

  const projectileSpeed = pickPositive(stats, 'projectile_speed', 'projectileSpeed');
  const blastRadius = pickPositive(stats, 'blast_radius', 'blastRadius');
  const terrainDamage = pickPositive(stats, 'terrain_damage', 'terrainDamage');
  const baseDamage = pickPositive(stats, 'base_damage', 'baseDamage');

  const sourceRarity = balance.rarity ?? 'common';

  const weapon = {
    id: entry.id,
    index: toNumber(entry.index),
    displayName: entry.displayName ?? entry.internalName ?? entry.id,
    internalName: entry.internalName ?? entry.id,
    category,
    icon: entry.icon?.file ?? null,
    rarity: sourceRarity,
    /** Rarität aus den Quelldaten (nur common/uncommon/rare). */
    sourceRarity,
    maxAmmo: Math.max(0, toNumber(balance.maxAmmo) || 1),
    cooldown: toNumber(balance.cooldown),
    requiresLineOfSight: Boolean(balance.requiresLineOfSight),
    damage: baseDamage,
    blastRadius,
    knockback: pickPositive(stats, 'knockback'),
    projectileSpeed,
    gravityScale: pickPositive(stats, 'gravity') || 1,
    bounces: pickPositive(stats, 'bounces'),
    fuseTime: pickPositive(stats, 'fuse_time', 'fuseTime'),
    terrainDamage,
    homing: pickPositive(stats, 'homing'),
    piercing: pickPositive(stats, 'piercing'),
    // `aoe` ist in der Quelle konstant false — Flaechenwirkung ergibt sich aus dem Radius.
    aoe: toNumber(stats.aoe) > 0 || blastRadius > 0,
    damageType: pickString(stats, 'damage_type', 'damageType') ?? 'physical',
    elemental: {
      fire: pickPositive(stats, 'fire_damage', 'fireDamage'),
      ice: pickPositive(stats, 'ice_damage', 'iceDamage'),
      poison: pickPositive(stats, 'poison_damage', 'poisonDamage'),
    },
    special: pickString(stats, 'special') ?? entry.mechanic?.specialEffect ?? null,
    targeting: entry.mechanic?.targeting ?? null,
    maxRange: pickPositive(stats, 'maxRange') || 600,
    // Abgeleitete Feuerart: Hitscan ohne Flugzeit, Projektil mit Flugzeit.
    delivery: isMelee || projectileSpeed <= 0 ? 'hitscan' : 'projectile',
  };

  // Abgeleitete Einstufung: erweitert die Quelle um epic/legendary, ohne Werte
  // zu erfinden — reine Funktion der oben gemappten Statistiken.
  weapon.powerScore = computePowerScore(weapon);
  weapon.powerTier = tierForScore(weapon.powerScore);
  weapon.iconPath = iconPathFor(weapon.icon);
  return weapon;
});

// Konsistenzpruefung: Der Katalog darf nicht still leer sein.
const projectileCount = weapons.filter(weapon => weapon.delivery === 'projectile').length;
const damagingCount = weapons.filter(weapon => weapon.damage > 0).length;
const areaCount = weapons.filter(weapon => weapon.blastRadius > 0).length;
if (damagingCount === 0) {
  throw new Error('Waffenkatalog ohne Schaden — Quelldatei oder Feldmapping pruefen');
}
if (areaCount === 0) {
  throw new Error('Waffenkatalog ohne Flaechenwirkung — Feldmapping fuer blast_radius pruefen');
}

const body = JSON.stringify(weapons, null, 2);
const indented = body.split('\n').map((line, i) => (i === 0 ? line : `  ${line}`)).join('\n');

const file = `/**
 * AUTO-GENERIERT von scripts/build-weapon-catalog.mjs — nicht manuell editieren.
 * Quelle: project_armageddon_weapons_v1.json (${raw.weapons.length} Waffen).
 *
 * @module weapons
 */

export const WEAPON_CATALOG_VERSION = ${JSON.stringify(raw.version ?? '1.0.0')};

export const WEAPONS = Object.freeze(
  ${indented}.map(Object.freeze)
);

export const WEAPONS_BY_ID = Object.freeze(
  Object.fromEntries(WEAPONS.map(weapon => [weapon.id, weapon]))
);

export const WEAPON_RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'legendary']);

export function getWeapon(id) {
  return WEAPONS_BY_ID[id] ?? null;
}

export function getWeaponsByCategory(category) {
  return WEAPONS.filter(weapon => weapon.category === category);
}

export function getWeaponsByRarity(rarity) {
  return WEAPONS.filter(weapon => weapon.rarity === rarity);
}

/** Waffe mit unbegrenzter Munition — verhindert Softlocks bei leerem Inventar. */
export const FALLBACK_WEAPON_ID = ${JSON.stringify(
  (weapons.find(w => w.delivery === 'projectile' && w.blastRadius > 0 && w.damage > 0)
    ?? weapons.find(w => w.delivery === 'projectile' && w.damage > 0)
    ?? weapons.find(w => w.damage > 0)
    ?? weapons[0]).id
)};

/**
 * Standardlastout: bewusst gemischt, damit ein Match von Beginn an
 * Flaechenwirkung, Direktschaden und eine Hitscan-Option bietet.
 */
export function getDefaultLoadout(count = 4) {
  const chosen = [];
  const push = weapon => {
    if (weapon && !chosen.some(entry => entry.id === weapon.id) && chosen.length < count) {
      chosen.push(weapon);
    }
  };

  const explosives = WEAPONS.filter(w => w.delivery === 'projectile' && w.blastRadius > 0 && w.damage > 0);
  const direct = WEAPONS.filter(w => w.delivery === 'projectile' && w.blastRadius === 0 && w.damage > 0);
  const hitscan = WEAPONS.filter(w => w.delivery === 'hitscan' && w.damage > 0);

  push(explosives[0]);
  push(direct[0]);
  push(hitscan[0]);
  push(explosives[1]);
  for (const weapon of [...explosives, ...direct, ...hitscan]) push(weapon);

  return chosen.map(weapon => weapon.id);
}

export function pickWeaponForRarity(rng, weights = { common: 55, uncommon: 25, rare: 12, epic: 6, legendary: 2 }) {
  if (!rng || typeof rng.next !== 'function') {
    throw new TypeError('pickWeaponForRarity benoetigt einen RNG mit next()');
  }
  const pool = WEAPONS.filter(weapon => (weights[weapon.rarity] ?? 0) > 0 && weapon.damage > 0);
  const total = pool.reduce((sum, weapon) => sum + (weights[weapon.rarity] ?? 0), 0);
  if (total <= 0) return WEAPONS[0];
  let threshold = rng.next() * total;
  for (const weapon of pool) {
    threshold -= weights[weapon.rarity] ?? 0;
    if (threshold <= 0) return weapon;
  }
  return pool[pool.length - 1];
}
`;

mkdirSync(dirname(targetPath), { recursive: true });
writeFileSync(targetPath, file, 'utf8');
console.log(`Weapon-Katalog geschrieben: ${targetPath}`);
console.log(`  Waffen: ${weapons.length} | Projektile: ${projectileCount} | mit Flaechenwirkung: ${areaCount} | mit Schaden: ${damagingCount}`);
