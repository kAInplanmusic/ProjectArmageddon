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

const weapons = raw.weapons.map(entry => {
  const stats = entry.stats ?? {};
  const balance = entry.balance ?? {};
  const category = entry.category ?? 'projectile';
  const isMelee = category === 'melee';

  const projectileSpeed = pickPositive(stats, 'projectileSpeed', 'projectile_speed');
  const blastRadius = pickPositive(stats, 'blastRadius', 'blast_radius');
  const terrainDamage = pickPositive(stats, 'terrainDamage', 'terrain_damage');
  const baseDamage = pickPositive(stats, 'baseDamage', 'base_damage');

  return {
    id: entry.id,
    index: toNumber(entry.index),
    displayName: entry.displayName ?? entry.internalName ?? entry.id,
    internalName: entry.internalName ?? entry.id,
    category,
    icon: entry.icon?.file ?? null,
    rarity: balance.rarity ?? 'common',
    maxAmmo: Math.max(0, toNumber(balance.maxAmmo) || 1),
    cooldown: toNumber(balance.cooldown),
    requiresLineOfSight: Boolean(balance.requiresLineOfSight),
    damage: baseDamage,
    blastRadius,
    knockback: pickPositive(stats, 'knockback'),
    projectileSpeed,
    gravityScale: pickPositive(stats, 'gravity') || 1,
    bounces: pickPositive(stats, 'bounces'),
    fuseTime: pickPositive(stats, 'fuseTime', 'fuse_time'),
    terrainDamage,
    homing: pickPositive(stats, 'homing'),
    piercing: pickPositive(stats, 'piercing'),
    aoe: toNumber(stats.aoe) > 0 || blastRadius > 0,
    damageType: pickString(stats, 'damage_type', 'damageType') ?? 'physical',
    elemental: {
      fire: pickPositive(stats, 'fireDamage', 'fire_damage'),
      ice: pickPositive(stats, 'iceDamage', 'ice_damage'),
      poison: pickPositive(stats, 'poisonDamage', 'poison_damage'),
    },
    special: pickString(stats, 'special') ?? entry.mechanic?.specialEffect ?? null,
    targeting: entry.mechanic?.targeting ?? null,
    maxRange: pickPositive(stats, 'maxRange') || 600,
    // Abgeleitete Feuerart: Hitscan ohne Flugzeit, Projektil mit Flugzeit.
    delivery: isMelee || projectileSpeed <= 0 ? 'hitscan' : 'projectile',
  };
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
