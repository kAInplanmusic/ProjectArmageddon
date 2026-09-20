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
 *
 * NEBENEFFEKT BEIM IMPORT — BEHOBEN
 * ---------------------------------
 * Diese Datei enthaelt ZWEI Dinge: die Generator-Logik (die eine Ausgabedatei
 * schreibt) und die exportierten Ableitungsfunktionen (`deriveMaxRange`,
 * `deriveCooldown`, `simulateProjectileReach`, ...). Der Schreibvorgang stand
 * frueher auf der obersten Ebene und lief damit AUCH bei einem reinen `import`.
 *
 * Nachgemessen war das an der mtime von `src/shared/config/weapons.js`
 * sichtbar. Die Tests `tests/range-cooldown.test.js`,
 * `tests/weapon-identity.test.js` und `tests/assets.test.js` importieren aus
 * dieser Datei und loesten den Schreibvorgang mit aus — im Vite-Log als drei
 * `page reload`-Zeilen zu sehen.
 *
 * Unkritisch war es, weil der Generator DETERMINISTISCH ist (dieselben Bytes,
 * `git status` blieb sauber). Die Schwaechen: Ein `import` soll nichts
 * veraendern, und in einem schreibgeschuetzten Checkout brach er ab — mit einem
 * Fehler, der nach einem Testproblem aussah.
 *
 * Der Schreibvorgang haengt jetzt an `import.meta.main` (siehe unten, fail-safe
 * gebaut) und ist in `tests/weapon-builder-guard.test.js` in BEIDE Richtungen
 * abgesichert: Import schreibt nicht, Programmaufruf schreibt weiterhin.
 *
 * Die Laufzeit-Helfer (`getWeapon`, `orderInventoryBySubcategory`, `hasFuse`)
 * sind KEINE Exporte dieser Datei — sie stehen im ERZEUGTEN Katalog
 * (`src/shared/config/weapons.js`) und werden hier nur als Text erzeugt.
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

/**
 * Hat diese Waffe einen Zünder?
 *
 * Die ANGABE AUS DER DESIGNDATEI schlägt jede Erschließung: `impact` heißt
 * „kein Zünder", `timed` heißt „Zünder". Nur wenn die Absicht fehlt (ältere
 * Designdatei), greifen Wirkungsname und Namenshinweis wie zuvor.
 */
export function hasFuse(weapon) {
  if (weapon.fuseIntent === 'impact') return false;
  if (weapon.fuseIntent === 'timed') return true;
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

/**
 * Nahkampfwaffen flugfähig machen — als WURF.
 *
 * ## Der Befund
 *
 * Gemessen mit `npm run balance`: **21 der 150 Waffen haben Schadenswerte
 * (20–52), aber keine Wirkung.** Alle sind `category: 'melee'`. Der Grund steht
 * in den Daten:
 *
 *   projectileSpeed = 0   -> es fliegt nichts
 *   blastRadius     = 0   -> es explodiert nichts
 *
 * Der Motor kennt `melee` nicht — es gibt keine Nahkampfmechanik. Die Waffe ist
 * ausrüstbar und abfeuerbar, aber es geschieht nichts. Der Balance-Bericht
 * nannte das „Datenmangel"; das ist ungenau: Die Schadenswerte SIND vorhanden,
 * es fehlt die Mechanik.
 *
 * ## Warum Wurf und nicht Nahkampf-Zone
 *
 * Drei Wege waren denkbar (Wurf, aufgestellte Zone, Einträge streichen). Gewählt
 * ist der WURF, weil er den bestehenden Spielrahmen nicht umbaut:
 *
 *  - Der Motor hat bereits einen Projektilpfad; hier werden nur dessen
 *    Eingangswerte gesetzt. Keine neue Systemart, kein neuer Zustand.
 *  - Das Spielgefühl bleibt Artillerie: zielen, Kraft dosieren, Flugbahn lesen.
 *  - Eine „aufgestellte Zone" hätte neben dem Geschütz eine ZWEITE stationäre
 *    Mechanik geschaffen — zwei Dinge, die dasselbe tun, sind eine schlechtere
 *    Antwort als eines, das beides kann.
 *
 * ## Was der Wurf NICHT ist
 *
 * Kein Fernkampf: Die Reichweite bleibt bewusst kurz. Ein Katana, das über die
 * halbe Karte fliegt, wäre keine Nahkampfwaffe mehr, sondern ein besserer
 * Speer — und die Waffe hieße weiter Klinge. Die Physik sagt „geworfen", der
 * Name sagt „geschlagen"; die Reichweite hält den Widerspruch klein.
 *
 * ## Verhältnis zur tatsächlichen Wurfweite im Match
 *
 * `simulateProjectileReach` rechnet mit NEUTRALEM Klassenprofil (Faktor 1,0) und
 * einer Bahn, die auf Zielhöhe endet. Im Match gilt beides nicht:
 *
 *   - `launchSpeedMultiplier` der Klasse dämpft die Startgeschwindigkeit
 *     (scout/brawler: 0,642),
 *   - der Abschuss beginnt auf Kopfhöhe und fällt damit ~10 px tiefer.
 *
 * Gemessen (Karte `open`, volle Kraft, bester Winkel):
 *
 *   Plasma-Blaster (Fernkampf)  maxRange 850  ->  tatsächlich 317 px (Faktor 0,37)
 *   Baseballschläger (Wurf)     maxRange 110  ->  tatsächlich  30 px (Faktor 0,28)
 *
 * Der Faktor ~0,37 gilt für ALLE Waffen, nicht nur für Würfe — er ist eine
 * Eigenschaft der Simulation, nicht der Wurf-Ableitung. `maxRange` beschreibt
 * damit die Reichweite bei neutralem Profil (die Obergrenze), nicht die im
 * Spiel erreichbare. Das ist als **Bekannte Grenze** in MASTERDOTO.md
 * festgehalten; die Zahl hier stillschweigend zu korrigieren wäre eine
 * Balance-Änderung an allen 150 Waffen.
 *
 * @param {object} weapon - Roheintrag mit `category`, `knockback`, `damage`
 * @returns {{projectileSpeed: number, gravityScale: number, bounces: number}}
 *   Werte, die den Wurf beschreiben. `bounces: 1` — eine geworfene Klinge
 *   springt einmal ab, öfter wäre sie ein Ball.
 */
export function meleeThrowFor(weapon) {
  /*
   * Die Wurfgeschwindigkeit kommt aus dem KNOCKBACK, nicht aus einem neuen
   * erfundenen Wert: `knockback` ist der einzige vorhandene Ausdruck dafür, wie
   * viel WUCHT in der Waffe steckt (30 bis 82 in den Daten). Eine schwere Waffe
   * wird langsamer geworfen — deshalb ist der Wurf DECKEND, nicht steigernd.
   *
   * 56 ist die Mitte des tatsächlichen Knockback-Bereichs (30..82), sie
   * bildet also den Normalfall ab, ohne einen Wert zu erfinden: Der Faktor ist 1
   * für eine durchschnittliche Waffe.
   */
  const KB_MITTE = 56;
  const KB_SPANNE = 26; // halbe Breite des Bereichs (56-30 = 26, 82-56 = 26)
  const wucht = Number.isFinite(weapon?.knockback) ? weapon.knockback : KB_MITTE;
  const faktor = 1 - ((wucht - KB_MITTE) / KB_SPANNE) * 0.2;

  return {
    // 34 von 70: deutlich langsamer als ein Geschoss — es ist eine Wurfwaffe.
    projectileSpeed: Number((34 * Math.min(1.2, Math.max(0.8, faktor))).toFixed(4)),
    // Etwas stärkere Krümmung: Handwaffen werden flacher geworfen als ein
    // Mörser, aber sie sollen sichtbar fallen — sonst wirkt es wie ein Schuss.
    gravityScale: 1.15,
    bounces: 1,
  };
}

/**
 * Ist dieser Eintrag eine Nahkampfwaffe ohne Wirkung?
 *
 * Die Bedingung ist bewusst ENG: `category: 'melee'` UND kein Projektil UND
 * keine Explosion. Ein melee-Eintrag, der später einen eigenen
 * `projectileSpeed` bekommt, wird NICHT überschrieben — die Daten haben dann
 * Vorrang vor der Ableitung.
 */
export function brauchtWurf(weapon) {
  return weapon?.category === 'melee'
    && !(Number.isFinite(weapon.projectileSpeed) && weapon.projectileSpeed > 0)
    && !(Number.isFinite(weapon.blastRadius) && weapon.blastRadius > 0);
}

/** Geschwindigkeitsfaktor aus den Quelldaten (1 = Normaltempo). */
export function speedFactorFor(weapon) {
  const roh = weapon.projectileSpeed;
  if (!Number.isFinite(roh) || roh <= 0) return 1;
  /*
   * Die Untergrenze hängt von der ART der Waffe ab.
   *
   * Für Geschosse gilt 0,6: Ein Ausreißer in den Quelldaten darf die Bahn nicht
   * unspielbar machen, und ein langsameres Geschoss als 0,6 wäre kaum noch
   * steuerbar.
   *
   * Für WÜRFE gilt 0,3: Eine geworfene Waffe ist absichtlich deutlich langsamer
   * (Wurfgeschwindigkeit 27–41 gegen 70 bei Geschossen). Mit der 0,6-Grenze
   * wurden ALLE Würfe auf denselben Faktor geklemmt — gemessen ergaben der
   * Baseballschläger (27,2) und die Schaufel (40,8) identische Werte, und die
   * Differenzierung über `knockback` ging verloren.
   *
   * Die Grenze wird NICHT global gesenkt: Das würde die Bahnkurven aller
   * Geschosse verändern — eine Balance-Änderung an 129 Waffen, um 21 zu retten.
   * Belegt mit `tests/melee-throw.test.js`.
   */
  const untergrenze = weapon.category === 'melee' ? 0.3 : 0.6;
  return Number(Math.min(1.6, Math.max(untergrenze, roh / REFERENCE_PROJECTILE_SPEED)).toFixed(4));
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

/**
 * Untere Grenze der Reichweite.
 *
 * Sie ist keine Physik, sondern eine Spielbarkeitsgrenze: Ein Wurf, der
 * rechnerisch 82 px weit fliegt, bekäme 110 — darunter träfe man nie etwas.
 * Deshalb exportiert, damit Tests den Fall von einer echten Abweichung
 * unterscheiden können (siehe `tests/range-cooldown.test.js`).
 */
export const MIN_RANGE = 110;
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
    /*
     * Absicht des Zünders, aus der Designdatei — NICHT erschlossen:
     *   `timed`  : die Ladung bleibt liegen und zündet nach Ablauf (Granate).
     *   `impact` : die Ladung wirkt beim Aufprall (Zünder = 0).
     *   `null`   : ältere Designdatei ohne Angabe — es gilt die alte Ableitung.
     */
    fuseIntent: entry.mechanic?.fuseIntent ?? null,
    // Abgeleitete Feuerart: Hitscan ohne Flugzeit, Projektil mit Flugzeit.
    // Muss VOR maxRange stehen: die Reichweite hängt von der Feuerart ab.
    //
    // FUND (belegt): Hier stand `isMelee || projectileSpeed <= 0 ? 'hitscan'`.
    // Die Nahkampfwaffen wurden damit als HITSCAN eingestuft — sie hatten eine
    // `maxRange`, aber keinen Flug und keine Wirkung am Ziel. Zusammen mit
    // `projectileSpeed: 0` und `blastRadius: 0` machte das 21 Waffen komplett
    // wirkungslos (`npm run balance`: „Ohne jede Wirkung: 59").
    //
    // `isMelee` ist deshalb ENTFERNT: Eine Nahkampfwaffe ist eine Wurfwaffe und
    // fliegt (siehe `meleeThrowFor()` weiter unten, das `delivery` mitzieht).
    // Ein Hitscan bleibt, wer keinen Flugweg hat UND kein Nahkampf ist.
    delivery: projectileSpeed <= 0 ? 'hitscan' : 'projectile',
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

  /*
   * Zünder: Die Designdatei hält die ABSICHT fest (`mechanic.fuseIntent`).
   *
   * FUND (belegt, gemessen 2026-09-19): Vorher wurde die Zündabsicht aus dem
   * Wirkungsnamen und dem Anzeigenamen ERschlossen (`hasFuse`). Das traf zwar
   * die Granaten, machte aber jede Einschlagwaffe zur Liegezeit-Waffe: Bei
   * ALLEN 18 Zünder-Waffen war der Zünder länger als die Flugzeit
   * (`npm run check:fuses`), „Meteoritenbrocken" etwa 6×. Der „Explosive
   * Energieball" war dadurch nach der Wurf-Behebung die EINZIGE Waffe, die
   * `npm run balance:sweep` noch als „ohne Wirkung" meldete.
   *
   * `impact` setzt den Zünder auf 0 — die Waffe wirkt beim Aufprall. `timed`
   * lässt die aus der Wucht abgeleitete Dauer stehen. Fehlt die Angabe (ältere
   * Designdatei), gilt die alte Ableitung unverändert.
   */
  if (weapon.fuseIntent === 'impact') {
    weapon.fuseTime = 0;
  } else if (!identity || identity.overrides.fuseTime === undefined) {
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

  /*
   * Nahkampfwaffen ohne Wirkung werden flugfähig — als WURF.
   *
   * FUND (belegt, `npm run balance`): 21 Waffen der Kategorie `melee` haben
   * Schadenswerte (20–52), aber `projectileSpeed: 0` UND `blastRadius: 0`. Der
   * Motor kennt keine Nahkampfmechanik: Die Waffe ist ausrüstbar und abfeuerbar,
   * aber es geschieht nichts. Siehe `meleeThrowFor()`.
   *
   * Die Reihenfolge ist WESENTLICH: Der Wurf muss VOR `speedFactorFor` stehen,
   * weil der Faktor aus `projectileSpeed` gebildet wird. Stand er danach,
   * bekam die Waffe `speedFactor: 1` (Normaltempo, weil `projectileSpeed` noch
   * 0 war) und flog mit 70 statt mit 27 — gemessen: der Baseballschläger galt
   * als 850 px weit statt als 110. Ein Test hält das fest
   * (`tests/melee-throw.test.js`, „Wurf vor dem Geschwindigkeitsfaktor").
   *
   * Und VOR `deriveMaxRange`, damit die Reichweite den tatsächlichen Wurf
   * beschreibt und nicht eine Bahn, die es nicht gibt.
   */
  if (brauchtWurf(weapon)) {
    Object.assign(weapon, meleeThrowFor(weapon));
    /*
     * Der Zustellweg muss mitziehen: Ohne das bliebe die Waffe als `instant`
     * oder `support` eingestuft, obwohl sie jetzt fliegt — und der Motor würde
     * sie weiterhin nicht als Projektil behandeln.
     */
    weapon.delivery = 'projectile';
  }

  // Geschwindigkeit aus den Quelldaten wird jetzt tatsächlich wirksam. Steht
  // NACH der Wurf-Ableitung, damit auch der Wurf seinen Faktor bekommt.
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

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * AB HIER BEGINNT EIN TEMPLATE-LITERAL — der Text des erzeugten Katalogs.
 *
 * FUND (belegt, beim Einbau der Raritaets-Gewichte): Alles bis zum schliessenden
 * Backtick bei Zeile ~1217 ist STRINGINHALT, kein Code. Wer hier editiert,
 * aendert die VORLAGE fuer `src/shared/config/weapons.js`.
 *
 * Die Falle: Ein Backtick im Text schliesst das Literal vorzeitig. Der Rest
 * wird dann als Code geparst, und der Parser meldet einen Fehler an einer
 * STELLE, DIE NICHT DIE URSACHE IST — die Fehlermeldung zeigt auf die Zeile,
 * an der er haengenbleibt, nicht auf den Backtick.
 *
 * Genau das ist passiert: Ein Backtick in einem neuen Kommentar machte die
 * Datei unparsbar, und die Suche kostete mehrere Anlaeufe, weil die
 * Fehlermeldung auf eine harmlose Zeile zeigte. Deshalb dieser Hinweis.
 * ═══════════════════════════════════════════════════════════════════════════
 */
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
export ${speedFactorFor.toString().trim()}

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

/**
 * Hat diese Waffe einen Zünder?
 *
 * Die Absicht aus der Designdatei schlägt die Erschließung: 'impact' heißt
 * „kein Zünder" (die Waffe wirkt beim Aufprall), 'timed' heißt „Zünder". Nur
 * ohne Angabe greifen Wirkungsname und Namenshinweis.
 */
export function hasFuse(weapon) {
  if (weapon?.fuseIntent === 'impact') return false;
  if (weapon?.fuseIntent === 'timed') return true;
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
 * Die Reservewaffe steht IMMER zuletzt (siehe unten).
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
    /*
     * Die Reservewaffe steht immer zuletzt — vor jeder Gruppierung.
     *
     * Sie ist die einzige Waffe, die sich nicht abwerfen lässt (siehe
     * PlayerInventory.removeWeapon). Ihre Stellung ergab sich bisher allein aus
     * ihrer Kategorie, und die ist guns: Bei der Klasse heavy stand sie damit
     * auf Anzeigeposition 1 (scout 4, artillery 3). Folge: Der erste
     * Listeneintrag war nicht abwerfbar, und die Zifferntaste 1 wählte sie.
     *
     * PlayerInventory hält dieselbe Regel für die AKTIVE Waffe bereits ein
     * („Als aktive Waffe die erste ABWERFBARE wählen, nicht die Reserve"). Hier
     * gilt sie jetzt auch für die Reihenfolge der Anzeige.
     *
     * Achtung: Dieser Rumpf wird als Quelltext in den Katalog geschrieben und
     * liegt im Generator in einem Template-String. Backticks und Dollar-Klammern
     * sind hier deshalb verboten — sie beenden den String.
     */
    .sort((a, b) => {
      // Ueber das gemeinsame Praedikat, nicht ueber einen zweiten Vergleich:
      // Sortierung und Gruppierung muessen dieselbe Auffassung davon haben,
      // was die Reserve ist.
      const reserveA = isReserveWeapon(a.weaponId) ? 1 : 0;
      const reserveB = isReserveWeapon(b.weaponId) ? 1 : 0;
      return reserveA - reserveB
        || rang(a.weaponId) - rang(b.weaponId)
        || a.index - b.index;
    })
    .map(eintrag => eintrag.index);
}

/**
 * Gruppe einer Waffe in der ANZEIGE.
 *
 * Anders als subcategoryFor (das die acht Kategorien der Quelldatei auf vier
 * Spielweisen abbildet) beruecksichtigt diese Funktion die Sonderstellung der
 * Reservewaffe: Sie bekommt eine eigene Gruppe. Sie ist keine Spielweise, sondern
 * eine Ausnahme — unbegrenzte Munition, nicht abwerfbar —, und sie steht in der
 * Liste zuletzt. Ohne eigene Gruppe fiele sie unter ihre Unterkategorie
 * ("Schusswaffen") und die angezeigten Nummern liefen aus der Reihe: 1, 2, 3, 5,
 * 4, weil die Nummer aus der Sortierung kommt (Reserve zuletzt) und der Platz
 * aus der Gruppierung.
 *
 * Die vier Eintraege in WEAPON_SUBCATEGORIES bleiben unberuehrt: Sie
 * beschreiben weiterhin die Kategorien-Zuordnung des Katalogs, und ein Test
 * haelt fest, dass es genau vier sind. Diese Funktion ergaenzt die Anzeige um
 * eine fuenfte Gruppe, die keine Kategorie ist.
 *
 * Achtung: Dieser Rumpf liegt im Generator in einem Template-String. Backticks
 * und Dollar-Klammern sind hier verboten — sie beenden den String.
 *
 * @param {string} weaponId
 * @returns {string} Gruppen-Kennung fuer die Waffenliste
 */
export function displayGroupFor(weaponId) {
  if (isReserveWeapon(weaponId)) return 'reserve';
  return getWeapon(weaponId)?.subcategory ?? 'special';
}

/** Beschriftung einer Anzeigegruppe (auch der Reserve-Gruppe). */
export function displayGroupLabel(groupId) {
  if (groupId === 'reserve') return 'Reserve (unbegrenzt)';
  return subcategoryLabel(groupId);
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
 * Ist das die Reservewaffe (unbegrenzte Munition, nicht abwerfbar)?
 *
 * EINE Stelle für diese Frage. Sie wird an zwei Orten gebraucht, die
 * zusammengehoeren muessen:
 *  - in der Sortierung der Anzeige (sie steht immer zuletzt), und
 *  - in der Gruppierung der Waffenliste (sie bekommt eine eigene Gruppe).
 *
 * Fund (belegt): Die beiden Orte liefen auseinander. Die Sortierung schob die
 * Reserve ans Ende, die Gruppierung stufte sie weiter nach ihrer Unterkategorie
 * ein ("Schusswaffen") — dadurch standen die angezeigten Nummern nicht mehr in
 * aufsteigender Reihenfolge: 1, 2, 3, 5, 4. Ein Leser sieht die 5 ueber der 4.
 *
 * @param {string} weaponId
 * @returns {boolean}
 */
export function isReserveWeapon(weaponId) {
  return weaponId === FALLBACK_WEAPON_ID;
}

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

/**
 * Waehlt Waffen nach gewichteter Raritaetsstufe.
 *
 * FUND (belegt, Code-Audit): Hier stand ein Default-Parameter
 * "weights = { common: 55, uncommon: 25, rare: 12, epic: 6, legendary: 2 }" —
 * eine ZWEITE Kopie der Gewichte, die in engine/systems/lootSystem.js als
 * RARITY_WEIGHTS gefuehrt werden. Beide waren zum Zeitpunkt des Audits
 * identisch; ein Aufrufer, der den Parameter weglaesst, haette aber die alte
 * Zahl benutzt, waehrend die Konstante geaendert wurde — unbemerkt.
 *
 * Der Default ist deshalb ENTFERNT: Die Gewichte muessen uebergeben werden.
 * Damit gibt es nur eine Quelle, und ein Fehlen faellt sofort auf.
 *
 * ACHTUNG beim Editieren: Dieser Bereich liegt INNERHALB eines Template-
 * Literals (ab Zeile 891). Ein Backtick im Text wuerde es vorzeitig schliessen
 * und die Datei unparsbar machen — das ist beim Einbau dieses Kommentars
 * passiert und hat die Ursache zunaechst verschleiert.
 *
 * @param {object} rng - Zufallsquelle mit next()
 * @param {object} weights - Gewichte je Raritaetsstufe (PFLICHT)
 */
export function pickWeaponForRarity(rng, weights) {
  if (!rng || typeof rng.next !== 'function') {
    throw new TypeError('pickWeaponForRarity benoetigt einen RNG mit next()');
  }
  if (!weights || typeof weights !== 'object' || Object.keys(weights).length === 0) {
    throw new TypeError(
      'pickWeaponForRarity benoetigt Gewichte. Die eine Quelle ist '
      + 'RARITY_WEIGHTS in engine/systems/lootSystem.js — ein Default hier '
      + 'waere eine zweite, still auseinanderlaufende Kopie.',
    );
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

/*
 * Der Schreibvorgang laeuft NUR, wenn diese Datei als Programm aufgerufen wird.
 *
 * Vorher stand er auf der obersten Ebene und lief damit auch bei einem reinen
 * `import` — drei Tests importieren aus dieser Datei nur Helfer und haben den
 * Katalog jedes Mal neu geschrieben. Unkritisch (der Generator ist
 * deterministisch, `git status` blieb sauber), aber ein `import` soll nichts
 * veraendern: In einem schreibgeschuetzten Checkout brach er ab, und der Fehler
 * sah nach einem Testproblem aus.
 *
 * DIE PRUEFUNG IST FAIL-SAFE GEBAUT — und das ist der wichtige Teil:
 *
 *   `import.meta.main` gibt es erst ab Node 22.13. Auf aelteren Versionen waere
 *   es `undefined`. Ein Guard der Form `if (import.meta.main)` wuerde dort NIE
 *   schreiben — `npm run weapons:build` liefe ohne Fehler durch und der Katalog
 *   veraltete STILL. Genau dieses Risiko war der Grund, den Guard nicht
 *   nebenbei einzubauen.
 *
 *   Deshalb wird NUR bei einem ausdruecklichen `false` uebersprungen. Ist der
 *   Wert `undefined` (alte Node-Version), wird geschrieben wie bisher — der
 *   Generator verhaelt sich dann exakt wie vor der Aenderung. Ein vergessener
 *   Katalog ist der schlimmere Fehler, ein ueberfluessiger Schreibvorgang der
 *   harmlosere.
 *
 * Die Alternative ohne `import.meta.main` waere ein Vergleich von
 * `process.argv[1]` mit `fileURLToPath(import.meta.url)`. Sie ist hier NICHT
 * noetig, weil `import.meta.main` vorliegt; der Vergleich waere auf
 * Windows-Pfaden und bei Symlinks fehleranfaelliger.
 */
const alsProgrammAufgerufen = import.meta.main !== false;

if (alsProgrammAufgerufen) {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, file, 'utf8');
  console.log(`Weapon-Katalog geschrieben: ${targetPath}`);
  console.log(`  Waffen: ${weapons.length} | Projektile: ${projectileCount} | mit Flaechenwirkung: ${areaCount} | mit Schaden: ${damagingCount}`);
} else {
  // Beim Import wird NICHTS geschrieben. Die Meldung bleibt trotzdem: Ein
  // stiller Import waere nicht von einem vergessenen Aufruf zu unterscheiden.
  console.log('Weapon-Katalog nicht geschrieben (Modul importiert, nicht als Programm aufgerufen)');
}
