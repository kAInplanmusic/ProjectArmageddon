/**
 * Start-Loadouts je Klasse.
 *
 * ## Warum es diese Datei gibt
 *
 * Bis hierher startete **jeder** Spieler mit `getDefaultLoadout(4)` — dieselben
 * vier Waffen für Scout, Heavy und Artillerie. Die Klasse veränderte damit nur
 * Leben, Schaden und Abschussgeschwindigkeit, nicht die Wahl der Mittel. Ein
 * Scout mit der schwersten Flächenwaffe des Katalogs spielt sich wie ein Scout,
 * der zufällig langsam schießt.
 *
 * ## Aufbau: gleiche Rollen, andere Waffen
 *
 * Jedes Klassen-Loadout hat dieselbe **Rollenstruktur**; die Klassen
 * unterscheiden sich darin, welche Waffe eine Rolle ausfüllt:
 *
 *   1. `flaeche`  — Projektil mit Flächenwirkung (Terrain und Gruppen)
 *   2. `direkt`   — Projektil ohne Flächenwirkung (Präzision)
 *   3. `hitscan`  — Strahlwaffe (sofortiger Treffer)
 *   4. `kuer`     — die klassenprägende Waffe (siehe `KUER`)
 *
 * Die Struktur ist Absicht: Eine Klasse ohne Flächenwaffe könnte kein Terrain
 * bearbeiten, eine ohne Strahlwaffe nicht auf kurze Distanz bestehen. Gleiche
 * Rollen, andere Mittel — jede Klasse bleibt spielbar, ohne gleich zu sein.
 *
 * ## Startwaffen sind Grundausstattung
 *
 * Erlaubt sind nur `common`, `uncommon` und `rare`. **Epische und legendäre
 * Waffen bleiben Loot** (`START_TIERS`). Ohne diese Grenze hätte die schwere
 * Klasse die stärkste Flächenwaffe des Katalogs (110 Schaden, 90 Radius) im
 * ersten Zug — und die Loot-Kisten wären entwertet, bevor das Match beginnt.
 * Der Katalog ist nach dieser Stufe eingefärbt, die Grenze ist also auch das,
 * was der Spieler sieht.
 *
 * ## Determinismus
 *
 * Alle Entscheidungen sind reine Sortierungen über Katalogfelder. Kein Zufall,
 * kein `Math.random()`: Derselbe Katalog ergibt dasselbe Loadout, in jedem
 * Replay und auf jedem Rechner. Bei Gleichstand entscheidet der Katalogindex.
 *
 * Es wird KEINE Waffe erfunden — ausgewählt wird ausschließlich aus den
 * vorhandenen 150. Das Loadout ist eine Ableitung, keine neue Datenquelle.
 *
 * ## Die Reserve kommt hinzu
 *
 * `getClassLoadout()` liefert die vier Klassenwaffen. `PlayerInventory.register`
 * legt zusätzlich die Reservewaffe mit unbegrenzter Munition dazu
 * (`FALLBACK_WEAPON_ID`) — sie verhindert, dass ein Match stehenbleibt, wenn
 * alle Ladungen verbraucht sind. Im Spiel führt ein Spieler also **fünf**
 * Waffen: vier aus dem Loadout plus die Reserve. Sie zählt nicht gegen
 * `MAX_WEAPONS` (siehe `droppableCount`), es bleiben damit zwei Plätze für
 * Loot frei.
 *
 * Vorher fiel das nicht auf: Die Reserve (`pa_028`) war zufällig zugleich die
 * erste Flächenwaffe des neutralen Loadouts, die Anmeldung erkannte sie wieder
 * und legte sie nicht doppelt an — es waren also vier Zeilen. Diese Kopplung
 * ist mit den Klassen-Loadouts entfallen, und das ist gut so: Die Reserve ist
 * jetzt bei jeder Klasse dieselbe und nicht mehr ein Nebeneffekt der
 * Waffenreihenfolge im Katalog.
 */

import { WEAPONS, getDefaultLoadout, FALLBACK_WEAPON_ID } from './weapons.js';

/*
 * START-KIT (Worms-Stil) — Stand 2026-10-14.
 *
 * Neue Vorgabe: Die Waffen sind NICHT mehr klassengebunden. Jeder Spieler startet
 * mit wenigen einfachen Waffen (Reserve `pa_028` unbegrenzt + zwei Common-Waffen)
 * und findet den Rest über Loot-Kisten — jede der 150 Waffen kann dort fallen.
 * Die Klasse (Power/Speed/Health, `combatProfile`) bestimmt nur noch die WERTE
 * einer Figur.
 *
 * Die Klassenloadouts oben bleiben als Fassung 1 erhalten, weil Aufzeichnungen aus
 * der Zeit davor sonst ein anderes Match spielten (anderes Inventar = anderer
 * Zustandshash).
 *
 * Die Fassung heißt `kit`:
 *   - `KIT_KLASSE` (1): Klassenloadout, 4 Waffen + Reserve (alt, nur für Replays)
 *   - `KIT_STARTER` (2): Reserve + 2 Common-Waffen, klassenunabhängig (alt, nur für Replays)
 *   - `KIT_FLAECHE` (3): wie 2, dazu eine schwache Uncommon-Flächenwaffe mit wenig
 *     Munition (Standard) — Fassung 2 hatte keine Waffe mit Flächenwirkung, damit
 *     auch keinen Geländeabtrag zu Beginn
 *
 * Eine Aufzeichnung OHNE `kit` im Kopf stammt aus der Zeit davor und ist
 * `KIT_KLASSE` (siehe `replay.js`).
 */
export const KIT_KLASSE = 1;
export const KIT_STARTER = 2;
export const KIT_FLAECHE = 3;
/** Fassung, mit der neue Partien starten. */
export const KIT_STANDARD = KIT_FLAECHE;

/** Ist `kit` eine bekannte Fassung? Alles andere fällt auf den Standard. */
export function normalisiereKit(kit) {
  return kit === KIT_KLASSE || kit === KIT_STARTER || kit === KIT_FLAECHE ? kit : KIT_STANDARD;
}

/** Kleiner Ganzzahl-Mischer (reiner Hash, KEIN Zufallsstrom): gleiche Eingabe, gleiche Zahl. */
function mische(seed, platz, salz) {
  let x = (Number(seed) ^ Math.imul(platz + 1, 0x9E3779B1) ^ Math.imul(salz + 1, 0x85EBCA6B)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7FEB352D) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846CA68B) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Die zwei Common-Startwaffen eines Platzes — deterministisch aus Match-Seed und
 * Spielerplatz, unabhängig von der Klasse. Eine Wurfwaffe (Projektil mit Flugbahn)
 * und eine Strahlwaffe (sofortiger Treffer): So kann jeder Weit- und Direktschüsse.
 * Der Katalog hat keine Common-Waffe mit Flächenwirkung; die Flächenwaffe der
 * Fassung 3 kommt aus `getStarterFlaeche`.
 *
 * Es zählt nur der Katalog: keine Nahkampfwaffe (kurze Reichweite), keine
 * Sichtlinienwaffe (wird je nach Gelände abgelehnt), nicht die Reserve, keine
 * Waffe mit Nachladezeit (der erste Zug bleibt unkompliziert) und keine ohne
 * eigenen Motor-Handler (nur `ranged`-Projektile, `tech`-Strahlwaffen).
 */
export function getStarterWaffen(seed, platz) {
  const taugt = w => w.powerTier === 'common' && w.id !== FALLBACK_WEAPON_ID
    && !w.requiresLineOfSight && w.maxAmmo >= 2 && w.damage > 0 && w.cooldown === 0;
  const wurf = WEAPONS.filter(w => taugt(w) && w.delivery === 'projectile' && w.category === 'ranged');
  const strahl = WEAPONS.filter(w => taugt(w) && w.delivery === 'hitscan' && w.category === 'tech');
  return [wurf[mische(seed, platz, 0) % wurf.length], strahl[mische(seed, platz, 1) % strahl.length]]
    .filter(Boolean).map(w => w.id);
}

/** Startmunition der Flächenwaffe in Fassung 3 — bewusst knapp, der Rest kommt über Kisten. */
export const STARTER_FLAECHE_MUNITION = 3;

/**
 * Die schwache Flächenwaffe der Fassung 3, deterministisch aus Seed und Platz.
 *
 * Uncommon, Projektil mit Flächenwirkung UND Geländeabtrag, geringer Schaden
 * (höchstens 25), ohne Nachladezeit und ohne Sichtlinienpflicht. Der Katalog
 * liefert heute genau eine solche Waffe (Salvengeber `pa_041`, 22 Schaden, Radius
 * 16); kämen weitere dazu, entscheidet derselbe Mischer wie bei den Common-Waffen.
 */
export function getStarterFlaeche(seed, platz) {
  const pool = WEAPONS.filter(w => w.powerTier === 'uncommon' && w.delivery === 'projectile'
    && w.blastRadius > 0 && w.terrainDamage > 0 && w.damage > 0 && w.damage <= 25
    && w.cooldown === 0 && !w.requiresLineOfSight);
  return pool.length ? pool[mische(seed, platz, 2) % pool.length].id : null;
}

/** Begrenzte Startmunition je Waffe (Kennung -> Ladungen); leer für Fassung 1 und 2. */
export function getStartMunition(kit, waffenIds) {
  if (normalisiereKit(kit) !== KIT_FLAECHE) return {};
  const grenze = {};
  for (const id of waffenIds) {
    const w = WEAPONS.find(x => x.id === id);
    if (w && w.powerTier !== 'common') grenze[id] = Math.min(w.maxAmmo, STARTER_FLAECHE_MUNITION);
  }
  return grenze;
}

/**
 * Startwaffen eines Spielers (ohne die Reserve; `register` legt sie dazu).
 *
 * @param {string} klasse - Klassenkennung (nur für Fassung 1 relevant)
 * @param {number} [kit] - Fassung, siehe oben
 * @param {{seed?:number, platz?:number}} [wo] - Match-Seed und Spielerplatz (Fassung 2 und 3)
 * @returns {string[]} Waffenkennungen
 */
export function getStartWaffen(klasse, kit = KIT_STANDARD, { seed = 0, platz = 0 } = {}) {
  const fassung = normalisiereKit(kit);
  if (fassung === KIT_KLASSE) return getClassLoadout(klasse);
  const basis = getStarterWaffen(seed, platz);
  if (fassung === KIT_STARTER) return basis;
  const flaeche = getStarterFlaeche(seed, platz);
  return flaeche ? [...basis, flaeche] : basis;
}

/** Rollen eines Klassen-Loadouts, in fester Reihenfolge. */
export const LOADOUT_ROLES = Object.freeze(['flaeche', 'direkt', 'hitscan', 'kuer']);

const ROLE_LABEL = Object.freeze({
  flaeche: 'Flächenwirkung',
  direkt: 'Direktschuss',
  hitscan: 'Strahl- oder Nahkampfwaffe',
  kuer: 'Klassenwaffe',
});

/**
 * Stufen, die als Startwaffe zulässig sind.
 * Episch und legendär sind Loot — siehe Dateikopf.
 */
export const START_TIERS = Object.freeze(['common', 'uncommon', 'rare']);

/**
 * Bewegungswirkungen.
 *
 * Muss mit der Zuordnung `EFFECT_KIND.MOVE` in `src/engine/specials.js`
 * übereinstimmen — ein Test prüft die Deckung. Diese Waffen sind die Kür des
 * Scouts: Er schießt am schwächsten und muss über Stellung spielen.
 */
export const MOVE_SPECIALS = Object.freeze([
  'flight', 'mobility', 'water_mobility', 'grapple', 'teleport', 'portal',
  'portal_field', 'hologram_portal', 'teleport_platform', 'dimension_orb',
  'dimensionssprung',
]);

const groesste = feld => w => w[feld];
const kleinste = feld => w => -(w[feld]);

/**
 * Sortierkriterien je Klasse UND Rolle — absteigend nach dem jeweils ersten
 * Wert, danach die weiteren, zuletzt der Katalogindex (stabiler Gleichstand).
 *
 * Die Kriterien folgen den Klassenwerten aus `classes.js`:
 *
 *  - **scout** (power 0,7 · speed 1,2 · health 0,8): schießt schwach und ist
 *    beweglich. Er trägt deshalb das *leichte* Besteck — kleinste Fläche,
 *    schnellstes Geschoss, kürzeste Strahlwaffe — und als Kür ein
 *    Bewegungsmittel. `speedFactor` ist der einzige Faktor, den die schwache
 *    Klasse nicht dämpft; er hat deshalb Vorrang beim Direktschuss.
 *  - **heavy** (power 1,0 · health 1,3): robust und langsam. Er darf stehen
 *    bleiben und nimmt dafür Wucht: größte Fläche, mehr Schaden.
 *  - **artillery** (power 1,3 · health 0,9): stärkster Schuss, zerbrechlich.
 *    Er muss treffen, bevor er getroffen wird — in JEDER Rolle zählt zuerst die
 *    Reichweite.
 */
const KLASSEN_KRITERIEN = Object.freeze({
  scout: Object.freeze({
    flaeche: Object.freeze([kleinste('blastRadius'), kleinste('damage')]),
    direkt: Object.freeze([groesste('speedFactor'), kleinste('damage')]),
    hitscan: Object.freeze([kleinste('maxRange'), kleinste('damage')]),
    kuer: Object.freeze([groesste('maxAmmo'), kleinste('damage')]),
  }),
  heavy: Object.freeze({
    flaeche: Object.freeze([groesste('blastRadius'), groesste('damage')]),
    direkt: Object.freeze([groesste('damage'), groesste('blastRadius')]),
    hitscan: Object.freeze([groesste('damage'), groesste('maxRange')]),
    kuer: Object.freeze([groesste('blastRadius'), groesste('damage')]),
  }),
  artillery: Object.freeze({
    flaeche: Object.freeze([groesste('maxRange'), groesste('damage')]),
    direkt: Object.freeze([groesste('maxRange'), groesste('damage')]),
    hitscan: Object.freeze([groesste('maxRange'), groesste('damage')]),
    kuer: Object.freeze([groesste('maxRange'), groesste('damage')]),
  }),
});

/** Die klassenprägende Waffe: Auswahlpool und Begründung. */
const KUER = Object.freeze({
  scout: Object.freeze({
    label: 'Bewegungsmittel',
    filter: w => MOVE_SPECIALS.includes(w.special),
  }),
  heavy: Object.freeze({
    label: 'Flächenelement',
    filter: w => w.subcategory === 'elemental' && w.blastRadius > 0,
  }),
  artillery: Object.freeze({
    label: 'weittragende Schusswaffe',
    filter: w => w.subcategory === 'guns',
  }),
});

/** Rollenfilter. Sie sichern die Struktur, unabhängig von der Klasse. */
const ROLLEN_FILTER = Object.freeze({
  // Flächenwirkung setzt ein Projektil voraus: Ein Strahl mit Radius gibt es im
  // Katalog nicht, und ein Zünder braucht etwas, das liegen bleibt.
  flaeche: w => w.delivery === 'projectile' && w.blastRadius > 0 && w.damage > 0,
  direkt: w => w.delivery === 'projectile' && w.blastRadius === 0 && w.damage > 0,
  hitscan: w => w.delivery === 'hitscan' && w.damage > 0,
});

/**
 * Als Startwaffe zulässig: erlaubte Stufe UND spielbar.
 *
 * Spielbar heißt: Die Waffe richtet Schaden an ODER hat eine Wirkung. Gleiche
 * Regel wie beim Loot — siehe `pickWeaponForRarity` in `weapons.js`.
 */
const startwaffe = w => START_TIERS.includes(w.powerTier)
  && (w.damage > 0 || Boolean(w.special) || w.blastRadius > 0 || w.terrainDamage > 0);

/** Sortiert eine Auswahl nach den Kriterien einer Klasse und Rolle. */
function nachKlasse(klasse, role, kandidaten) {
  const regeln = KLASSEN_KRITERIEN[klasse]?.[role] ?? KLASSEN_KRITERIEN.heavy.direkt;
  return [...kandidaten].sort((a, b) => {
    for (const regel of regeln) {
      const unterschied = regel(b) - regel(a);
      if (unterschied !== 0) return unterschied;
    }
    // Gleichstand: Katalogindex. Damit ist die Reihenfolge reproduzierbar.
    return a.index - b.index;
  });
}

/**
 * Start-Loadout einer Klasse mit Begründung je Platz.
 *
 * Unbekannte Klassen erhalten das neutrale Loadout (`getDefaultLoadout`) mit
 * `role: 'neutral'` — ein Match darf niemals ohne Waffen beginnen, und ein
 * stiller Rückfall auf ein anderes Klassenprofil wäre irreführend.
 *
 * @param {string} klasse - `"scout"`, `"heavy"`, `"artillery"`
 * @param {number} count - Anzahl Waffen (Standard 4)
 * @returns {{weaponId: string, role: string, roleLabel: string, reason: string}[]}
 */
export function getClassLoadoutDetail(klasse, count = 4) {
  if (!KLASSEN_KRITERIEN[klasse]) {
    return getDefaultLoadout(count).map(weaponId => ({
      weaponId,
      role: 'neutral',
      roleLabel: 'Neutral',
      reason: `Unbekannte Klasse "${klasse}" — neutrales Startloadout`,
    }));
  }

  const gewaehlt = [];
  const vergeben = new Set();
  const nimm = (weapon, role, reason) => {
    if (!weapon || vergeben.has(weapon.id) || gewaehlt.length >= count) return;
    vergeben.add(weapon.id);
    gewaehlt.push({
      weaponId: weapon.id,
      role,
      roleLabel: ROLE_LABEL[role] ?? role,
      reason,
    });
  };

  for (const role of LOADOUT_ROLES) {
    if (gewaehlt.length >= count) break;
    const pool = role === 'kuer'
      ? WEAPONS.filter(w => startwaffe(w) && KUER[klasse].filter(w))
      : WEAPONS.filter(w => startwaffe(w) && ROLLEN_FILTER[role](w));
    const treffer = nachKlasse(klasse, role, pool).find(w => !vergeben.has(w.id));
    const begruendung = role === 'kuer'
      ? `${KUER[klasse].label} — Kür der Klasse ${klasse}`
      : `Rolle ${ROLE_LABEL[role]} — Wahl der Klasse ${klasse}`;
    nimm(treffer, role, begruendung);
  }

  // Auffüllen, falls eine Rolle im Katalog nicht besetzt werden konnte oder
  // weniger Waffen als Rollen verlangt sind. Die Struktur wird dabei nicht
  // aufgegeben, nur erweitert.
  if (gewaehlt.length < count) {
    const rest = nachKlasse(klasse, 'direkt', WEAPONS.filter(w => startwaffe(w) && !vergeben.has(w.id)));
    for (const weapon of rest) {
      if (gewaehlt.length >= count) break;
      nimm(weapon, 'fuellung', 'Auffüllung nach Klassenkriterium');
    }
  }

  return gewaehlt;
}

/**
 * Start-Loadout einer Klasse als Kennungsliste.
 *
 * @param {string} klasse
 * @param {number} count
 * @returns {string[]}
 */
export function getClassLoadout(klasse, count = 4) {
  return getClassLoadoutDetail(klasse, count).map(eintrag => eintrag.weaponId);
}

export default {
  getClassLoadout, getClassLoadoutDetail, getStartWaffen, getStarterWaffen, LOADOUT_ROLES, START_TIERS,
  KIT_KLASSE, KIT_STARTER, KIT_STANDARD,
};
