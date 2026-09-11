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

import { WEAPONS, WEAPON_SUBCATEGORIES, getDefaultLoadout } from './weapons.js';

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

/**
 * Alle Unterkategorien, in denen überhaupt Startwaffen liegen.
 * Nützlich für Anzeige und Tests.
 */
export function startSubcategories() {
  return WEAPON_SUBCATEGORIES
    .map(gruppe => gruppe.id)
    .filter(id => WEAPONS.some(w => w.subcategory === id && startwaffe(w)));
}

export default { getClassLoadout, getClassLoadoutDetail, LOADOUT_ROLES, START_TIERS };
