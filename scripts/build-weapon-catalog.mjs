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
 * Ermittelt den Schaden und woher er stammt.
 *
 * Die Quelldatei enthält das Feld `base_damage` nur für 124 der 150 Waffen.
 * Fehlt es, bleibt nur der camelCase-Platzhalter `baseDamage` mit dem konstanten
 * Wert 25 — ein Design-Wert ist das nicht. Statt ihn stillschweigend zu
 * übernehmen, wird die Herkunft mitgeführt, damit erkennbar bleibt, welche
 * Waffen echte Designdaten haben und welche einen Ersatzwert tragen.
 *
 * @returns {{damage:number, damageSource:'source'|'placeholder'|'none'}}
 */
/**
 * Namensserien: Varianten desselben Geräts tragen eine fortlaufende Kennung.
 *
 * Die Quelldatei ist hier uneinheitlich: `Raketenwerfer Mk I`/`Mk II` und
 * `Dimensionssprung I`/`II` sind sauber, `Raketenrucksack` hat aber keinen
 * Zusatz, obwohl ein `Mk III` daneben steht, und `Maschinenpistole` stand neben
 * `Maschinenpistole Mk II` ohne Kennung. Die Kennungen werden deshalb beim Bau
 * vereinheitlicht — IDs und Icons bleiben unberührt (siehe designRule der
 * Quelldatei: Anzeigenamen dürfen sich ändern).
 */
export const NAME_SERIES_FIXES = Object.freeze({
  // Nur zwei Varianten vorhanden: „Mk III“ versprach eine dritte, die es nicht gibt.
  'Raketenrucksack Mk III': 'Raketenrucksack Mk II',
  // Erste Variante ohne Kennung, während eine zweite eine trägt.
  'Maschinenpistole': 'Maschinenpistole Mk I',
  // Der Basisname gehört zur ersten Variante.
  'Raketenrucksack': 'Raketenrucksack Mk I',
});

/** Anzeigename mit vereinheitlichter Serienkennung. */
export function normalizeDisplayName(name) {
  return NAME_SERIES_FIXES[name] ?? name;
}

/**
 * Die vier Gruppen der Waffenauswahl.
 *
 * Acht Kategorien der Quelldatei werden auf vier Gruppen abgebildet. Das ist die
 * Gliederung, die der Spieler sieht: mehr als vier Gruppen sind am Rand des
 * Spielfelds nicht mehr erfassbar, und mehrere Kategorien teilen sich eine
 * Spielweise (Technik, Nutzen und Ultimatives sind alle Sonderwerkzeuge).
 */
export const WEAPON_SUBCATEGORIES = Object.freeze([
  { id: 'melee', label: 'Nahkampf', categories: ['melee'] },
  { id: 'guns', label: 'Schusswaffen', categories: ['ranged', 'heavy_ranged'] },
  { id: 'elemental', label: 'Elementar & Magie', categories: ['elemental', 'magic'] },
  { id: 'special', label: 'Technik & Nutzen', categories: ['tech', 'utility', 'ultimate'] },
]);

/** Gruppe einer Kategorie (oder null, wenn unbekannt). */
export function subcategoryFor(category) {
  const treffer = WEAPON_SUBCATEGORIES.find(gruppe => gruppe.categories.includes(category));
  return treffer?.id ?? null;
}

export function resolveDamage(stats) {
  const fromSource = toNumber(stats.base_damage);
  if (fromSource > 0) return { damage: fromSource, damageSource: 'source' };

  const fromCamel = toNumber(stats.baseDamage);
  if (fromCamel > 0) {
    // Nur vorhanden, wenn `base_damage` fehlt: das ist der Platzhalter.
    return { damage: fromCamel, damageSource: 'placeholder' };
  }
  return { damage: 0, damageSource: 'none' };
}

/**
 * Referenzwert der `gravity`-Skala in den Quelldaten.
 *
 * Die Quelle nennt für 26 Waffen einen Wert zwischen 62 und 92, wovon 19 exakt
 * 65 haben — 65 ist damit der Bezugswert, 62/70/…/92 sind Abweichungen davon in
 * Prozent. Alle übrigen Waffen führen das Feld gar nicht.
 *
 * WICHTIG: Der Wert ist KEIN Multiplikator. Ihn direkt als `gravityScale` zu
 * verwenden setzte die Fallbeschleunigung auf das 65-fache (20,8 statt 0,32
 * px/Tick²); das Geschoss schlug im nächsten Tick auf dem Boden auf und die
 * Waffe war wirkungslos. Deshalb wird auf den Bezugswert normalisiert.
 */
export const GRAVITY_REFERENCE = 65;

/**
 * Wandelt den `gravity`-Wert der Quelle in einen Multiplikator um.
 *
 * Unbestimmt (fehlend oder 0) → 1.0, also die normale Fallbeschleunigung der
 * Engine. Angegeben → Verhältnis zum Bezugswert, hier 0.95 bis 1.42.
 *
 * @param {object} stats - Rohstatistik einer Waffe
 * @returns {number} Multiplikator für DEFAULT_PROJECTILE_GRAVITY
 */
export function gravityScaleFor(stats) {
  const raw = pickPositive(stats, 'gravity', 'gravity_scale');
  if (raw <= 0) return 1;
  const scale = raw / GRAVITY_REFERENCE;
  // Sicherheitsgrenzen: ein fehlerhafter Quelldatensatz darf die Simulation
  // nicht unspielbar machen.
  return Number(Math.min(3, Math.max(0.2, scale)).toFixed(4));
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
/**
 * Absoluter URL zum Waffen-Icon.
 *
 * Der gespeicherte `iconPath` ist relativ zu DIESER Datei
 * (src/shared/config/), nicht zu der Datei, die ihn benutzt. Wird er im Client
 * gegen das aufrufende Modul aufgeloest, zeigt er ins Leere — genau das war der
 * Fall: Der Client liegt eine Ebene tiefer, die Icons waren dadurch nie
 * geladen. Die Aufloesung gehoert deshalb hierher, wo der Pfad entsteht.
 */
export function iconUrlFor(weapon) {
  if (!weapon || !weapon.iconPath) return null;
  return new URL(weapon.iconPath, import.meta.url).href;
}

export function iconPathFor(iconFile) {
  if (!iconFile) return null;
  const stem = String(iconFile).replace(/\.[^.]+$/, '');
  return `${WEAPON_ICON_BASE}/${stem}_icon.png`;
}

/**
 * Hat diese Waffe eine Wirkung über Schaden und Fläche hinaus?
 *
 * Eigene Prüfung mit der Liste aus `src/engine/specials.js`: Der Generator darf
 * nicht von der Laufzeit abhängen (Build-Reihenfolge), braucht aber dieselbe
 * Aussage, um zu entscheiden, ob eine Waffe überhaupt erspielbar ist.
 */
const SPECIAL_WITHOUT_DAMAGE = new Set([
  'flight', 'mobility', 'water_mobility', 'grapple', 'teleport', 'portal',
  'portal_field', 'hologram_portal', 'teleport_platform', 'dimension_orb',
  'dimensionssprung', 'hook_pull', 'ammo_drop', 'supply_drop', 'loop',
  'target_scan', 'random_effect', 'random_spell', 'scroll_spell', 'mutation',
  'heal', 'instant_heal', 'guardian', 'blood_ritual', 'shield_heal',
  'shield_freeze', 'guardian_ultimate', 'bunker', 'buff', 'area_buff',
  'relic_buff', 'random_buff', 'time_control', 'camouflage',
]);

const weapons = raw.weapons.map(entry => {
  const stats = entry.stats ?? {};
  const balance = entry.balance ?? {};
  const category = entry.category ?? 'projectile';
  const isMelee = category === 'melee';

  const projectileSpeed = pickPositive(stats, 'projectile_speed', 'projectileSpeed');
  const blastRadius = pickPositive(stats, 'blast_radius', 'blastRadius');
  const terrainDamage = pickPositive(stats, 'terrain_damage', 'terrainDamage');
  const { damage, damageSource } = resolveDamage(stats);

  const sourceRarity = balance.rarity ?? 'common';

  const weapon = {
    id: entry.id,
    index: toNumber(entry.index),
    displayName: normalizeDisplayName(entry.displayName ?? entry.internalName ?? entry.id),
    internalName: entry.internalName ?? entry.id,
    category,
    /** Gruppe der Waffenauswahl (vier Gruppen, siehe WEAPON_SUBCATEGORIES). */
    subcategory: subcategoryFor(category),
    icon: entry.icon?.file ?? null,
    rarity: sourceRarity,
    /** Rarität aus den Quelldaten (nur common/uncommon/rare). */
    sourceRarity,
    maxAmmo: Math.max(0, toNumber(balance.maxAmmo) || 1),
    cooldown: toNumber(balance.cooldown),
    requiresLineOfSight: Boolean(balance.requiresLineOfSight),
    damage,
    /** Herkunft des Schadenswerts: echte Designdaten oder Ersatzwert. */
    damageSource,
    blastRadius,
    knockback: pickPositive(stats, 'knockback'),
    projectileSpeed,
    // Normalisiert aus der 0-100-Skala der Quelle, NICHT als Multiplikator.
    gravityScale: gravityScaleFor(stats),
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

/**
 * Die vier Gruppen der Waffenauswahl. Reihenfolge ist die Anzeigereihenfolge.
 * Jede Kategorie der Quelldatei gehört zu höchstens einer Gruppe.
 */
export const WEAPON_SUBCATEGORIES = Object.freeze(
  ${JSON.stringify(WEAPON_SUBCATEGORIES)}
);

/**
 * Wirkungen, die eine Waffe auch OHNE Schadenswert spielbar machen.
 * Muss mit dem Wirkungskatalog in src/engine/specials.js uebereinstimmen;
 * ein Test prueft die Deckung.
 */
export const SPECIAL_WITHOUT_DAMAGE = Object.freeze(
  ${JSON.stringify([...SPECIAL_WITHOUT_DAMAGE])}
);

/** Hat diese Waffe eine Wirkung ueber Schaden und Flaeche hinaus? */
export function hasSpecialEffect(weapon) {
  return weapon.damage > 0 || SPECIAL_WITHOUT_DAMAGE.includes(weapon.special);
}

/** Gruppe einer Kategorie (oder null). */
export function subcategoryFor(category) {
  const treffer = WEAPON_SUBCATEGORIES.find(gruppe => gruppe.categories.includes(category));
  return treffer?.id ?? null;
}

/** Beschriftung einer Gruppe. */
export function subcategoryLabel(subcategoryId) {
  return WEAPON_SUBCATEGORIES.find(gruppe => gruppe.id === subcategoryId)?.label ?? subcategoryId;
}

/** Waffen einer Gruppe in Katalogreihenfolge. */
export function getWeaponsBySubcategory(subcategoryId) {
  return WEAPONS.filter(weapon => weapon.subcategory === subcategoryId);
}

/**
 * Absoluter URL zum Waffen-Icon (aufgeloest gegen diese Datei).
 * Der gespeicherte Pfad ist relativ zu src/shared/config/, nicht zum Aufrufer.
 */
export function iconUrlFor(weapon) {
  if (!weapon || !weapon.iconPath) return null;
  return new URL(weapon.iconPath, import.meta.url).href;
}

/**
 * Inventar-Indizes in Anzeigereihenfolge.
 *
 * Die Waffenliste gliedert nach den vier Gruppen; die Zifferntasten müssen
 * dieselbe Reihenfolge treffen wie die angezeigten Nummern. Deshalb gibt es
 * genau EINE Ordnungsfunktion, die Liste und Tastatur gemeinsam nutzen — sonst
 * liefen Anzeige und Eingabe auseinander.
 *
 * Innerhalb einer Gruppe bleibt die Reihenfolge des Inventars erhalten.
 *
 * @param {string[]} weaponIds - Waffen des Inventars in Inventarreihenfolge
 * @returns {number[]} Inventar-Indizes, nach Gruppe sortiert
 */
export function orderInventoryBySubcategory(weaponIds) {
  const rang = weaponId => {
    const kategorie = getWeapon(weaponId)?.category;
    const stelle = WEAPON_SUBCATEGORIES.findIndex(gruppe => gruppe.categories.includes(kategorie));
    // Unbekannte Kategorien ans Ende, statt sie zu verlieren.
    return stelle < 0 ? WEAPON_SUBCATEGORIES.length : stelle;
  };

  return weaponIds
    .map((weaponId, index) => ({ weaponId, index }))
    .sort((a, b) => rang(a.weaponId) - rang(b.weaponId) || a.index - b.index)
    .map(eintrag => eintrag.index);
}

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

  // Gewichtet wird nach der ABGELEITETEN Stufe (powerTier, fuenf Stufen), nicht
  // nach der Quell-Raritaet (rarity, drei Stufen). Grund: Die Stufe ist es, die
  // der Spieler als Farbe sieht, und nur sie kennt epic/legendary. Vorher
  // liefen 8 Prozent des Gewichts ins Leere, weil keine Waffe diese Raritaeten
  // trug.
  //
  // Utility-Waffen ohne Schaden sind ausdruecklich enthalten: Sie sind spielbar
  // und wirken (Sprung, Nachschub, Schild), waren aber vorher nie zu bekommen,
  // weil der Filter damage > 0 sie ausschloss.
  const spielbar = weapon => hasSpecialEffect(weapon);
  const gewicht = weapon => weights[weapon.powerTier] ?? weights[weapon.rarity] ?? 0;
  const pool = WEAPONS.filter(weapon => gewicht(weapon) > 0 && spielbar(weapon));
  const total = pool.reduce((sum, weapon) => sum + gewicht(weapon), 0);
  if (total <= 0) return WEAPONS[0];
  let threshold = rng.next() * total;
  for (const weapon of pool) {
    threshold -= gewicht(weapon);
    if (threshold <= 0) return weapon;
  }
  return pool[pool.length - 1];
}
`;

mkdirSync(dirname(targetPath), { recursive: true });
writeFileSync(targetPath, file, 'utf8');
console.log(`Weapon-Katalog geschrieben: ${targetPath}`);
console.log(`  Waffen: ${weapons.length} | Projektile: ${projectileCount} | mit Flaechenwirkung: ${areaCount} | mit Schaden: ${damagingCount}`);
