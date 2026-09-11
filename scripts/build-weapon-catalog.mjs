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
 * Schadenswert für Waffen, die in der Quelldatei KEINEN Designwert haben.
 *
 * 52 der 150 Waffen tragen nur den camelCase-Platzhalter mit dem konstanten Wert
 * 25. Ein Einheitswert für ein Drittel aller Waffen ist kein Balancing: ein
 * „Morgenstern" und ein „Astraltrank" richteten denselben Schaden an.
 *
 * Deshalb wird der Wert hier aus der Kategorie abgeleitet. Die Kategorie ist die
 * belastbare Angabe der Quelldatei (acht Gruppen), und sie beschreibt die Rolle:
 * ein Nahkampfangriff wirkt anders als ein schweres Geschütz. Dazu kommt eine
 * deterministische Streuung aus dem Index, damit nicht alle Waffen einer Gruppe
 * denselben Wert tragen — ohne Zufall, also in Replays stabil.
 *
 * Die Werte liegen bewusst über dem bisherigen Platzhalter: 25 war die Untergrenze
 * eines Ersatzwerts, nicht ein Designziel.
 */
export const DAMAGE_BY_CATEGORY = Object.freeze({
  melee: 30,
  ranged: 26,
  heavy_ranged: 52,
  elemental: 36,
  magic: 34,
  tech: 30,
  utility: 16,
  ultimate: 68,
});

/** Abgeleiteter Schaden für eine Waffe ohne Designwert. */
export function derivePlaceholderDamage(weapon) {
  const basis = DAMAGE_BY_CATEGORY[weapon.category] ?? 30;
  const index = toNumber(weapon.index);
  // 11 Stufen zwischen 0.82 und 1.18 — deterministisch aus dem Index.
  const streuung = 0.82 + ((index * 7) % 11) * 0.036;
  return Math.max(1, Math.round(basis * streuung));
}

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
 * Vier Waffenpaare, die faktisch dieselbe Waffe waren.
 *
 * Ausgangslage: `Raketenwerfer Mk I` und `Mk II` hatten beide 25 Schaden und
 * 70 Geschwindigkeit — der „höhere" Mk hatte nur WENIGER Munition. Bei
 * `Maschinenpistole` verhielt es sich genauso. `Raketenrucksack` und `Mk III`
 * waren beide reine Fluggeräte, wobei es gar kein Mk I/II gab. Und
 * `Dimensionssprung I`/`II` waren in ALLEN Werten identisch.
 *
 * Eine Kennung, die keinen Unterschied bezeichnet, ist irreführend. Diese acht
 * Waffen bekommen deshalb eine eigene Identität mit einem echten Zielkonflikt:
 * jede Paarung ist stark in einer Sache und schwach in der anderen. Es gibt
 * keinen „höheren" Mk mehr, weil beide Varianten ihre Berechtigung haben.
 *
 * IDs, Indizes und Icons bleiben unberührt — die Quelldatei erlaubt ausdrücklich,
 * Anzeigenamen zu ändern, ohne IDs oder Assets anzutasten.
 */
export const WEAPON_IDENTITIES = Object.freeze({
  // Paar 1: schwerer Einzeltreffer gegen schnelle Salve.
  pa_037: {
    displayName: 'Raketenwerfer',
    concept: 'Eine Ladung, große Wirkung',
    overrides: { damage: 62, blastRadius: 46, projectileSpeed: 62, maxAmmo: 3, knockback: 30, terrainDamage: 55 },
  },
  pa_041: {
    displayName: 'Salvengeber',
    concept: 'Schnelles kleines Kaliber, viele Schüsse',
    overrides: { damage: 22, blastRadius: 16, projectileSpeed: 92, maxAmmo: 6, knockback: 8, terrainDamage: 18 },
  },

  // Paar 2: Dauerfeuer auf kurze Distanz gegen Einzelschuss auf weite.
  pa_040: {
    displayName: 'Maschinenpistole',
    concept: 'Dauerfeuer, kurz und schnell',
    overrides: { damage: 14, blastRadius: 0, projectileSpeed: 90, maxAmmo: 8, knockback: 0, terrainDamage: 4 },
  },
  pa_056: {
    displayName: 'Präzisionsgewehr',
    concept: 'Ein Schuss, weit und hart',
    overrides: { damage: 55, blastRadius: 0, projectileSpeed: 100, maxAmmo: 2, knockback: 12, terrainDamage: 20 },
  },

  // Paar 3: kurzer Satz gegen weiter Gleitflug.
  pa_032: {
    displayName: 'Raketenrucksack',
    concept: 'Kurzer, häufiger Satz',
    // Reines Fluggerät: kein Schaden. Ohne diese Angabe hätte die Waffe den
    // abgeleiteten Kategoriewert bekommen — ein Fluggerät, das Schaden anrichtet,
    // wäre ein Widerspruch zur eigenen Beschreibung.
    overrides: { damage: 0, effectMagnitude: 64, maxAmmo: 6, cooldownTurns: 0 },
  },
  pa_114: {
    displayName: 'Gleitschirm',
    concept: 'Weiter, aber mit Pause',
    overrides: { damage: 0, effectMagnitude: 150, maxAmmo: 3, cooldownTurns: 2 },
  },

  // Paar 4: billiger Blitz gegen teurer weiter Riss.
  pa_087: {
    displayName: 'Dimensionssprung',
    concept: 'Kurzer, häufiger Blitz',
    // Häufig nutzbar: viel Munition, keine Pause. Das ist die Gegenleistung für
    // die geringe Weite.
    overrides: { damage: 0, effectMagnitude: 72, maxAmmo: 5, cooldownTurns: 0 },
  },
  pa_088: {
    displayName: 'Dimensionsriss',
    concept: 'Weiter Riss mit Nachladezeit',
    // Dafür weit und teuer: wenig Munition, eine Pause.
    overrides: { damage: 0, effectMagnitude: 165, maxAmmo: 2, cooldownTurns: 2 },
  },
});

/** Identität einer Waffe (oder null). */
export function identityFor(weaponId) {
  return WEAPON_IDENTITIES[weaponId] ?? null;
}

/**
 * Anzeigename einer Waffe.
 *
 * Waffen mit eigener Identität tragen ihren neuen Namen; alle übrigen den
 * Namen aus der Quelldatei. Die Vereinheitlichung der Serienkennungen entfällt,
 * weil die betroffenen Paare jetzt eigenständige Namen haben.
 */
export function normalizeDisplayName(name, weaponId = null) {
  const identity = weaponId ? identityFor(weaponId) : null;
  return identity?.displayName ?? name;
}

/**
 * Zünder: Waffen, die nicht beim Aufprall, sondern nach einer Verzögerung
 * wirken.
 *
 * Die Quelldatei führt `fuse_time` nur bei EINER Waffe (Kaktusbombe, 1,8 s);
 * bei den übrigen 149 steht der Platzhalter 0. Damit sind Granaten faktisch
 * Aufprallwaffen — der Name verspricht aber etwas anderes.
 *
 * Erkannt werden sie an ihrem Wirkungsnamen und am Anzeigenamen. Die Dauer wird
 * NICHT gewürfelt, sondern aus der Wucht abgeleitet: eine stärkere Ladung hat
 * einen längeren Zünder, damit man ihr ausweichen kann. Das ist die einzige
 * sinnvolle Staffelung — ein kurzer Zünder an einer starken Bombe wäre kein
 * Spiel, sondern ein Zufallstreffer.
 */
export const FUSE_SPECIALS = Object.freeze(new Set([
  'fragmentation', 'sticky', 'delayed_bot', 'banana_split', 'spike_blast',
  'energy_explosion', 'cosmic_banana', 'fire_pool', 'poison_cloud',
  'poison_zone', 'tentacle_zone', 'lava', 'meteor_impact', 'meteor_rain',
  'shell', 'hell_cannon',
]));

/**
 * Anflugarten nach Wirkungsnamen.
 * `sky`: von oben herab (Luftangriff, Mörser, Meteor).
 * `flank`: von der Seite in Zielrichtung (schwere Artillerie, Kanone).
 */
export const STRIKE_FROM_SKY = Object.freeze(new Set([
  'air_strike', 'mortar', 'meteor_impact', 'meteor_rain', 'artillery',
]));
export const STRIKE_FROM_FLANK = Object.freeze(new Set([
  'hell_cannon', 'railgun', 'sniper', 'drill_cannon',
]));

/** Anflugart einer Waffe ('self' | 'sky' | 'flank'). */
export function strikeStyleFor(weapon) {
  if (STRIKE_FROM_SKY.has(weapon.special)) return 'sky';
  if (STRIKE_FROM_FLANK.has(weapon.special)) return 'flank';
  return 'self';
}

/** Zündnamen, die im Anzeigenamen erkennbar sind (Rückfall). */
const FUSE_NAME_HINTS = ['granate', 'bombe', 'mine', 'spreng', 'eimer', 'molotow'];

/** Hat diese Waffe einen Zünder? */
export function hasFuse(weapon) {
  if (FUSE_SPECIALS.has(weapon.special)) return true;
  const name = (weapon.displayName ?? '').toLowerCase();
  return FUSE_NAME_HINTS.some(hinweis => name.includes(hinweis));
}

/**
 * Zünderdauer in Sekunden.
 * Stufen 1–5, abgeleitet aus dem Schaden: stärkere Ladung, längerer Zünder.
 *
 * @returns {number} 0 = kein Zünder (Aufprallwaffe)
 */
export function deriveFuseTime(weapon) {
  if (!hasFuse(weapon)) return 0;
  const dmg = weapon.damage ?? 0;
  if (dmg < 25) return 1;
  if (dmg < 40) return 2;
  if (dmg < 55) return 3;
  if (dmg < 75) return 4;
  return 5;
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

/**
 * Bezugsgeschwindigkeit der Quelldaten.
 *
 * `projectile_speed` liegt zwischen 48 und 100, der Modalwert ist 70. Die 70 ist
 * damit die normale Geschwindigkeit; alles andere skaliert darum herum. Wichtig:
 * Das Feld war bis hierher TOT — der Motor hat es nie gelesen und jedes Geschoss
 * flog gleich schnell. Eine `Minigun` und ein `Mörser` waren dadurch technisch
 * identisch im Flug.
 */
export const REFERENCE_PROJECTILE_SPEED = 70;

/** Geschwindigkeitsfaktor aus den Quelldaten (1 = Normaltempo). */
export function speedFactorFor(weapon) {
  const roh = weapon.projectileSpeed;
  if (!Number.isFinite(roh) || roh <= 0) return 1;
  // Begrenzt, damit ein Ausreißer in den Quelldaten die Bahn nicht unspielbar macht.
  return Number(Math.min(1.6, Math.max(0.6, roh / REFERENCE_PROJECTILE_SPEED)).toFixed(4));
}

/** Referenzwerte der Simulation — dieselben Größen wie im Motor. */
const SIM_POWER = 100;
const SIM_POWER_TO_SPEED = 0.14;
const SIM_GRAVITY = 0.32;
const SIM_DRAG = 0.995;

/**
 * Reichweite eines Projektils durch Simulation der Flugbahn.
 *
 * Warum simulieren statt formeln: Mit Luftwiderstand (0.995 je Tick) gibt es
 * keine geschlossene Lösung, und die tatsächliche Bahn hängt von Geschwindigkeit,
 * Gravitation und Widerstand zusammen ab. Die Simulation ist deterministisch und
 * liefert genau die Strecke, die der Motor später auch fliegt.
 *
 * Gemessen wird der weiteste Abschuss (45°) auf ebener Fläche, Rückkehrhöhe =
 * Starthöhe.
 *
 * @returns {number} Reichweite in Pixeln
 */
export function simulateProjectileReach(weapon) {
  const v0 = SIM_POWER * SIM_POWER_TO_SPEED * speedFactorFor(weapon);
  const gravity = SIM_GRAVITY * (weapon.gravityScale || 1);
  const winkel = Math.PI / 4;

  let x = 0;
  let y = 0;
  let vx = Math.cos(winkel) * v0;
  let vy = -Math.sin(winkel) * v0;

  let weiteste = 0;
  // 1500 Schritte = 25 s Flugzeit: deutlich mehr als jede reale Bahn.
  for (let schritt = 0; schritt < 1500; schritt++) {
    vy += gravity;
    vx *= SIM_DRAG;
    vy *= SIM_DRAG;
    x += vx;
    y += vy;
    if (y >= 0 && vy > 0) {
      // Zurück auf Starthöhe: die horizontale Strecke ist die Reichweite.
      weiteste = Math.max(weiteste, x);
      break;
    }
    weiteste = Math.max(weiteste, x);
  }
  return weiteste;
}

/**
 * Basisreichweite von Soforttreffern je Kategorie.
 *
 * Ein Hitscan hat keine Flugzeit — seine Reichweite ist eine
 * Designentscheidung, keine Physik. Die Werte spiegeln die Rolle: ein
 * Nahkampfangriff reicht eine Figur weit, ein schweres Geschütz über die halbe
 * Karte.
 */
export const HITSCAN_RANGE_BY_CATEGORY = Object.freeze({
  melee: 130,
  ranged: 520,
  heavy_ranged: 820,
  elemental: 560,
  magic: 520,
  tech: 600,
  utility: 420,
  ultimate: 900,
});

const MIN_RANGE = 110;
const MAX_RANGE = 1400;

/**
 * Reichweite einer Waffe.
 *
 * Projektile: aus der simulierten Flugbahn, mit 12 % Sicherheitszuschlag, damit
 * ein Geschoss nicht mitten im Flug verschwindet (die Lebensdauer leitet sich
 * daraus ab).
 * Hitscan: Kategoriebasis, skaliert mit dem Schaden — eine 110-Schaden-Waffe
 * reicht weiter als eine mit 20.
 */
export function deriveMaxRange(weapon) {
  let reichweite;

  if (weapon.delivery === 'projectile') {
    reichweite = simulateProjectileReach(weapon) * 1.12;
  } else {
    const basis = HITSCAN_RANGE_BY_CATEGORY[weapon.category] ?? 520;
    // Schaden als Maß für die Rolle (0.6 bis 2.0).
    const kraft = Math.min(2, Math.max(0.6, weapon.damage / 45));
    reichweite = basis * kraft;
  }

  return Math.round(Math.min(MAX_RANGE, Math.max(MIN_RANGE, reichweite)));
}

/**
 * Nachladezeit in ZÜGEN (nicht Millisekunden — damit ist sie deterministisch und
 * unabhängig von der Zugzeit, wie die Wirkungsdauern).
 *
 * Bemessungsgrundlage ist die "Last" der Waffe: Schaden, Flächenwirkung und ein
 * knapper Munitionsvorrat. Ein schweres Geschütz braucht eine Pause, eine
 * Maschinenpistole nicht.
 *
 * Warum in Zügen und nicht in Sekunden: Der Zug ist die Zeiteinheit des Spiels.
 * Eine Pause von 1,4 Sekunden hinge an der konfigurierten Zugdauer; "eine Runde
 * aussetzen" ist für den Spieler nachvollziehbar und in Replays stabil.
 */
export function deriveCooldown(weapon) {
  const last = weapon.damage * (1 + weapon.blastRadius / 60)
    + (weapon.maxAmmo <= 3 ? 20 : 0);

  if (last < 40) return 0;
  if (last < 75) return 1;
  if (last < 120) return 2;
  return 3;
}

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
    displayName: normalizeDisplayName(entry.displayName ?? entry.internalName ?? entry.id, entry.id),
    internalName: entry.internalName ?? entry.id,
    category,
    /** Gruppe der Waffenauswahl (vier Gruppen, siehe WEAPON_SUBCATEGORIES). */
    subcategory: subcategoryFor(category),
    icon: entry.icon?.file ?? null,
    rarity: sourceRarity,
    /** Rarität aus den Quelldaten (nur common/uncommon/rare). */
    sourceRarity,
    maxAmmo: Math.max(0, toNumber(balance.maxAmmo) || 1),
    /**
     * Nachladezeit in Zügen, hergeleitet aus der Last der Waffe.
     * Die Quelldatei führt `cooldown`, aber konstant 0 — siehe deriveCooldown().
     * Das Feld bleibt als Herkunftsnachweis erhalten.
     */
    cooldownSource: toNumber(balance.cooldown),
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
    /**
     * Anflugart. Bestimmt, von wo der Angriff kommt:
     *  - `self`  : vom Schützen (Normalfall)
     *  - `sky`   : von oben auf den Zielpunkt (Luftangriff, Mörser)
     *  - `flank` : von der Seite in Zielrichtung (schwere Artillerie)
     *
     * Nötig, weil ein „Luftangriff", der wie ein Gewehrschuss aus der Hand des
     * Schützen kommt, dem Namen widerspricht. Die Zielrichtung bleibt die
     * normale Zielung — die Anflugart bestimmt nur, woher das Geschoss kommt.
     */
    strikeStyle: 'self',
    targeting: entry.mechanic?.targeting ?? null,
    // Abgeleitete Feuerart: Hitscan ohne Flugzeit, Projektil mit Flugzeit.
    // Muss VOR maxRange stehen: die Reichweite hängt von der Feuerart ab.
    delivery: isMelee || projectileSpeed <= 0 ? 'hitscan' : 'projectile',
  };

  // Eigene Identität: Die acht Waffen der vier Dubletten-Paare bekommen
  // unterschiedliche Werte, damit sie sich wirklich unterscheiden. Das geschieht
  // VOR allen Ableitungen, weil Reichweite, Geschwindigkeit und Nachladezeit
  // daraus folgen.
  const identity = identityFor(entry.id);
  if (identity) {
    Object.assign(weapon, identity.overrides);
    weapon.concept = identity.concept;
    // Ein eigener Schadenswert ist kein Ersatzwert mehr.
    if (identity.overrides.damage !== undefined) {
      // 0 ist kein Schadenswert, sondern „richtet keinen Schaden an".
      weapon.damageSource = identity.overrides.damage > 0 ? 'source' : 'none';
    }
    weapon.displayName = identity.displayName;
  }

  // Anflugart aus dem Wirkungsnamen ableiten.
  if (STRIKE_FROM_SKY.has(weapon.special)) weapon.strikeStyle = 'sky';
  else if (STRIKE_FROM_FLANK.has(weapon.special)) weapon.strikeStyle = 'flank';

  // Zünder für Granaten und Abwurfwaffen: Die Quelldatei hat hier nur bei einer
  // Waffe einen echten Wert, alle übrigen tragen 0. Die Dauer folgt der Wucht.
  if (!identity || identity.overrides.fuseTime === undefined) {
    weapon.fuseTime = deriveFuseTime(weapon);
  }

  // Wirkungsstärke für Verschiebungen (Sprung, Teleport). Ohne eigene Angabe
  // gilt der Standard aus dem Wirkungssystem.
  weapon.effectMagnitude = weapon.effectMagnitude ?? null;

  // Waffen ohne Designwert bekommen einen aus der Kategorie abgeleiteten
  // Schaden. Das geschieht VOR den Ableitungen, weil Reichweite und Nachladezeit
  // vom Schaden abhängen.
  if (weapon.damageSource === 'placeholder') {
    weapon.damage = derivePlaceholderDamage(weapon);
    weapon.damageSource = 'derived';
  }

  // Geschwindigkeit aus den Quelldaten wird jetzt tatsächlich wirksam.
  weapon.speedFactor = speedFactorFor(weapon);
  // Reichweite: physikalisch hergeleitet, nicht der Konstantwert 600 für alle.
  weapon.maxRange = deriveMaxRange(weapon);
  // Nachladezeit in Zügen. Eine eigene Vorgabe hat Vorrang: manche Waffen
  // brauchen eine Pause, die sich nicht aus Schaden und Radius ergibt
  // (Gleitschirm, Dimensionsriss).
  weapon.cooldown = identity?.overrides.cooldownTurns ?? deriveCooldown(weapon);

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

/**
 * Bezugsgeschwindigkeit der Quelldaten (Modalwert). 1.0 bedeutet Normaltempo.
 */
export const REFERENCE_PROJECTILE_SPEED = ${REFERENCE_PROJECTILE_SPEED};

/** Geschwindigkeitsfaktor einer Waffe aus den Quelldaten. */
export function speedFactorFor(weapon) {
  const roh = weapon.projectileSpeed;
  if (!Number.isFinite(roh) || roh <= 0) return 1;
  return Number(Math.min(1.6, Math.max(0.6, roh / REFERENCE_PROJECTILE_SPEED)).toFixed(4));
}

/**
 * Laenge des Strahls bzw. Lebensdauer-Basis fuer Projektile, in Pixeln.
 * Projektile: simulierte Flugbahn mit Sicherheitszuschlag.
 * Hitscan: Kategoriebasis, skaliert mit dem Schaden.
 */
export const HITSCAN_RANGE_BY_CATEGORY = Object.freeze(
  ${JSON.stringify(HITSCAN_RANGE_BY_CATEGORY)}
);

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
/**
 * Waffen mit eigener Identität: die vier früheren Dubletten-Paare.
 * Je Eintrag ein Anzeigename, das Konzept und der Grund für die Abgrenzung.
 */
export const WEAPON_IDENTITIES = Object.freeze(
  ${JSON.stringify(WEAPON_IDENTITIES, null, 2).split('\n').join('\n  ')}
);

/** Identität einer Waffe (oder null). */
export function identityFor(weaponId) {
  return WEAPON_IDENTITIES[weaponId] ?? null;
}

/** Anflugarten: von oben bzw. von der Seite. */
export const STRIKE_FROM_SKY = Object.freeze(${JSON.stringify([...STRIKE_FROM_SKY])});
export const STRIKE_FROM_FLANK = Object.freeze(${JSON.stringify([...STRIKE_FROM_FLANK])});

/**
 * Anflugart einer Waffe ('self' | 'sky' | 'flank').
 * Ein Luftangriff kommt von oben auf den Zielpunkt, schwere Artillerie von der
 * Seite — nicht aus der Hand des Schützen.
 */
export function strikeStyleFor(weapon) {
  if (STRIKE_FROM_SKY.includes(weapon.special)) return 'sky';
  if (STRIKE_FROM_FLANK.includes(weapon.special)) return 'flank';
  return 'self';
}

/** Schadenswert je Kategorie für Waffen ohne Designwert. */
export const DAMAGE_BY_CATEGORY = Object.freeze(${JSON.stringify(DAMAGE_BY_CATEGORY)});

/** Wirkungsnamen, die einen Zünder tragen. */
export const FUSE_SPECIALS = Object.freeze(${JSON.stringify([...FUSE_SPECIALS])});

/** Hat diese Waffe einen Zünder? */
export function hasFuse(weapon) {
  if (FUSE_SPECIALS.includes(weapon.special)) return true;
  const name = String(weapon.displayName ?? '').toLowerCase();
  return ['granate', 'bombe', 'mine', 'spreng', 'eimer', 'molotow'].some(h => name.includes(h));
}

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
