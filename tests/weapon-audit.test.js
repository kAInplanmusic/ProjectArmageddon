import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WEAPONS,
  WEAPONS_BY_ID,
  WEAPON_SUBCATEGORIES,
  subcategoryFor,
  getWeaponsBySubcategory,
  pickWeaponForRarity,
  hasSpecialEffect,
  orderInventoryBySubcategory,
  SPECIAL_WITHOUT_DAMAGE,
} from '../src/shared/config/weapons.js';
import { SeededRandom } from '../src/shared/prng.js';
import { MatchController } from '../src/engine/match.js';
import { effectFor } from '../src/engine/specials.js';

/**
 * Bestandsprüfung des Waffenkatalogs.
 *
 * Die Tests sichern die Eigenschaften ab, die bei der Durchsicht aller 150
 * Waffen geprüft wurden: Vollständigkeit, Erreichbarkeit, Gruppierung und die
 * Deckung zwischen Katalog und Wirkungssystem.
 */

const LOOT_WEIGHTS = { common: 55, uncommon: 25, rare: 12, epic: 6, legendary: 2 };

// --------------------------------------------------------------- Vollständigkeit

test('Alle 150 Waffen sind vollständig benannt und eindeutig', () => {
  assert.equal(WEAPONS.length, 150);

  const display = WEAPONS.map(w => w.displayName);
  const intern = WEAPONS.map(w => w.internalName);
  assert.equal(new Set(display).size, 150, 'Anzeigenamen müssen eindeutig sein');
  assert.equal(new Set(intern).size, 150, 'interne Namen müssen eindeutig sein');
  assert.equal(new Set(WEAPONS.map(w => w.id)).size, 150, 'IDs müssen eindeutig sein');
  assert.equal(new Set(WEAPONS.map(w => w.index)).size, 150, 'Indizes müssen eindeutig sein');

  // Keine Platzhalter- oder Nummerierungsreste.
  for (const weapon of WEAPONS) {
    assert.ok(weapon.displayName.trim().length >= 2,
      `${weapon.id}: Anzeigename zu kurz: "${weapon.displayName}"`);
    assert.ok(!/^(weapon|waffe|test|platzhalter|placeholder)\b/i.test(weapon.displayName),
      `${weapon.id}: Platzhaltername "${weapon.displayName}"`);
    assert.ok(!/\bundefined\b|\bnull\b|\bNaN\b/i.test(weapon.displayName),
      `${weapon.id}: kaputter Name "${weapon.displayName}"`);
  }
});

test('Namensserien tragen eine fortlaufende Kennung', () => {
  // Die Quelldatei war hier uneinheitlich: „Raketenrucksack Mk III“ ohne
  // Mk I/II, „Maschinenpistole“ neben „Maschinenpistole Mk II“. Der Generator
  // vereinheitlicht das.
  const nachBasis = new Map();
  for (const weapon of WEAPONS) {
    const basis = weapon.displayName.replace(/\s+(Mk\.?\s*[IVX]+|I{1,3}|IV|V)$/u, '').trim();
    if (!nachBasis.has(basis)) nachBasis.set(basis, []);
    nachBasis.get(basis).push(weapon.displayName);
  }

  for (const [basis, namen] of nachBasis.entries()) {
    if (namen.length < 2) continue;
    // Mehrere Varianten: jede muss eine Kennung tragen (römisch oder Mk).
    for (const name of namen) {
      assert.ok(/\s+(Mk\.?\s*[IVX]+|I{1,2}|III|IV)$/u.test(name),
        `Serie "${basis}": "${name}" trägt keine Kennung, obwohl es mehrere Varianten gibt`);
    }
  }

  // Konkret: „Mk III“ ohne Mk I und Mk II darf es nicht geben.
  for (const weapon of WEAPONS) {
    const treffer = weapon.displayName.match(/\sMk\.?\s*(III|IV|V)$/u);
    if (!treffer) continue;
    const basis = weapon.displayName.replace(/\sMk\.?\s*[IVX]+$/u, '').trim();
    const vorherige = WEAPONS.filter(w =>
      w.displayName.startsWith(`${basis} Mk I`) || w.displayName.startsWith(`${basis} Mk II`));
    assert.ok(vorherige.length >= 2,
      `${weapon.displayName}: eine dritte Variante verlangt zwei vorherige, gefunden ${vorherige.length}`);
  }
});

test('Keine Anzeigenamen sind durch die Vereinheitlichung doppelt geworden', () => {
  // Die Umbenennung darf keine Kollision erzeugen.
  const namen = WEAPONS.map(w => w.displayName);
  const doppelt = namen.filter((n, i) => namen.indexOf(n) !== i);
  assert.deepEqual([...new Set(doppelt)], [], `Doppelte Namen: ${doppelt.join(', ')}`);
});

// --------------------------------------------------------------- Unterkategorien

test('Die vier Gruppen decken alle 150 Waffen lückenlos und überschneidungsfrei ab', () => {
  assert.equal(WEAPON_SUBCATEGORIES.length, 4, 'Es müssen genau vier Gruppen sein');

  const ids = WEAPON_SUBCATEGORIES.map(g => g.id);
  assert.equal(new Set(ids).size, 4, 'Gruppen-IDs müssen eindeutig sein');

  // Jede Kategorie darf in höchstens einer Gruppe stehen.
  const kategorien = WEAPON_SUBCATEGORIES.flatMap(g => g.categories);
  assert.equal(new Set(kategorien).size, kategorien.length,
    'Eine Kategorie darf nur zu einer Gruppe gehören');

  // Jede Waffe genau einer Gruppe zugeordnet.
  let summe = 0;
  for (const gruppe of WEAPON_SUBCATEGORIES) {
    const waffen = getWeaponsBySubcategory(gruppe.id);
    assert.ok(waffen.length > 0, `Gruppe ${gruppe.id} ist leer`);
    for (const weapon of waffen) {
      assert.equal(weapon.subcategory, gruppe.id);
      assert.ok(gruppe.categories.includes(weapon.category),
        `${weapon.id}: Kategorie ${weapon.category} passt nicht zu ${gruppe.id}`);
    }
    summe += waffen.length;
  }
  assert.equal(summe, WEAPONS.length, `Summe der Gruppen ${summe} ≠ ${WEAPONS.length}`);

  // Waffen ohne Gruppe dürfte es nicht geben.
  const ohne = WEAPONS.filter(w => !subcategoryFor(w.category));
  assert.deepEqual(ohne.map(w => w.id), [], 'Waffen ohne Gruppe');
  assert.ok(WEAPONS.every(w => w.subcategory !== null));
});

test('Die Gruppenbeschriftungen sind nicht leer', () => {
  for (const gruppe of WEAPON_SUBCATEGORIES) {
    assert.ok(typeof gruppe.label === 'string' && gruppe.label.trim().length >= 3,
      `Gruppe ${gruppe.id}: Beschriftung fehlt`);
  }
});

// --------------------------------------------------------------- Erreichbarkeit

test('Alle 150 Waffen sind über Kisten erreichbar', () => {
  // Vorher waren vier Utility-Waffen nie zu bekommen, weil der Filter
  // `damage > 0` sie ausschloss — genau die Waffen mit eigener Wirkung
  // (Sprung, Nachschub). Sie waren spielbar, aber unerreichbar.
  const rng = new SeededRandom(20260910);
  const gesehen = new Set();
  for (let i = 0; i < 40_000; i++) gesehen.add(pickWeaponForRarity(rng, LOOT_WEIGHTS).id);

  const nie = WEAPONS.filter(w => !gesehen.has(w.id));
  assert.deepEqual(nie.map(w => `${w.id} (${w.displayName})`), [],
    'Diese Waffen sind über Kisten nicht erreichbar');
});

test('Jede Stufe des Loot-Gewichts wird tatsächlich genutzt', () => {
  // Vorher liefen die Gewichte für epic und legendary ins Leere, weil keine
  // Waffe diese Rarität trug — 8 % des Gewichtsbudgets waren wirkungslos.
  const rng = new SeededRandom(4711);
  const proStufe = {};
  for (let i = 0; i < 40_000; i++) {
    const weapon = pickWeaponForRarity(rng, LOOT_WEIGHTS);
    proStufe[weapon.powerTier] = (proStufe[weapon.powerTier] ?? 0) + 1;
  }

  for (const stufe of Object.keys(LOOT_WEIGHTS)) {
    assert.ok((proStufe[stufe] ?? 0) > 0,
      `Stufe ${stufe} hat Gewicht ${LOOT_WEIGHTS[stufe]}, wurde aber nie gezogen`);
  }
  assert.ok(proStufe.common > proStufe.epic, 'Häufige Stufen müssen häufiger sein');
});

test('Loot und Anzeige verwenden dieselbe Stufe', () => {
  // Der Client färbt nach `powerTier`, die Ziehung gewichtet nach derselben
  // Stufe. Vorher nutzte die Ziehung `rarity` (drei Stufen) — dadurch passte die
  // angezeigte Farbe nicht zur tatsächlichen Seltenheit.
  const stufen = new Set(WEAPONS.map(w => w.powerTier));
  for (const stufe of stufen) {
    assert.ok(stufe in LOOT_WEIGHTS,
      `Stufe ${stufe} kommt im Katalog vor, hat aber kein Loot-Gewicht`);
  }
  // Die Quell-Rarität bleibt als Herkunftsnachweis erhalten.
  for (const weapon of WEAPONS) {
    assert.ok(['common', 'uncommon', 'rare'].includes(weapon.sourceRarity),
      `${weapon.id}: unerwartete Quell-Rarität ${weapon.sourceRarity}`);
  }
});

test('Waffen ohne Schaden haben eine Wirkung — sonst wären sie nutzlos', () => {
  // Eine Waffe ohne Schaden UND ohne Wirkung wäre im Spiel ein leeres Stück
  // Munition. Genau dieser Fall wurde bei der Durchsicht gesucht.
  const nutzlos = WEAPONS.filter(w => !hasSpecialEffect(w) && w.maxAmmo > 0);
  assert.deepEqual(
    nutzlos.map(w => `${w.id} (${w.displayName}, special=${w.special})`),
    [],
    'Waffen ohne Schaden und ohne Wirkung verbrauchen nur Munition',
  );

  // Gegenprobe: Die Aussage „spielbar“ muss für alle 150 gelten, sonst wäre eine
  // Waffe zwar erreichbar, aber ohne jeden Effekt.
  for (const weapon of WEAPONS) {
    assert.ok(hasSpecialEffect(weapon),
      `${weapon.id} (${weapon.displayName}) gilt als nicht spielbar`);
  }
});

// --------------------------------------------------------------- Deckung Katalog/Engine

test('SPECIAL_WITHOUT_DAMAGE deckt sich mit dem Wirkungssystem', () => {
  // Die Liste im Katalog entscheidet über die Erreichbarkeit, die Registry im
  // Wirkungssystem über das Verhalten. Weichen sie ab, ist eine Waffe entweder
  // unerreichbar oder wirkungslos.
  assert.ok(SPECIAL_WITHOUT_DAMAGE.length > 20,
    `Liste zu klein: ${SPECIAL_WITHOUT_DAMAGE.length}`);

  for (const name of SPECIAL_WITHOUT_DAMAGE) {
    // Jeder Name muss eine Wirkung haben, die auf den Schützen geht — sonst
    // hätte er einen Schadenswert gebraucht.
    const effect = effectFor(name);
    if (effect) continue;
    // Einige Namen sind reine Schadensarten ohne eigene Wirkung. Sie dürfen nur
    // dann in der Liste stehen, wenn die Waffe tatsächlich Schaden hat.
    const betroffen = WEAPONS.filter(w => w.special === name);
    assert.ok(betroffen.length > 0,
      `SPECIAL_WITHOUT_DAMAGE nennt "${name}", das im Katalog nicht vorkommt`);
    for (const weapon of betroffen) {
      assert.ok(weapon.damage > 0 || effectFor(weapon.special),
        `${weapon.id} (${name}) hat weder Schaden noch Wirkung`);
    }
  }
});

test('Alle Wirkungsnamen des Katalogs sind der Engine bekannt oder reine Schadensarten', () => {
  const unbekannt = new Set();
  for (const weapon of WEAPONS) {
    if (!weapon.special) continue;
    if (effectFor(weapon.special)) continue;
    // Ohne Wirkung: dann muss die Waffe Schaden anrichten, sonst tut sie nichts.
    if (weapon.damage <= 0) unbekannt.add(`${weapon.id}: ${weapon.special}`);
  }
  assert.deepEqual([...unbekannt], [],
    'Diese Waffen haben einen unbekannten Wirkungsnamen und keinen Schaden');
});

test('Der Wirkungskatalog deckt die Selbstwirkungs-Waffen vollständig ab', () => {
  // Jede Waffe mit einer Wirkung auf den Schützen muss in
  // SPECIAL_WITHOUT_DAMAGE stehen, sonst wird sie beim Loot übersprungen, wenn
  // sie keinen Schaden hat.
  const selbstOhneSchaden = WEAPONS.filter(w => {
    const effect = effectFor(w.special);
    return w.damage <= 0 && effect && [
      'heal', 'shield', 'damage_boost', 'armor', 'ammo', 'move', 'reveal', 'random',
    ].includes(effect.kind);
  });
  assert.ok(selbstOhneSchaden.length > 0, 'Es muss solche Waffen geben');

  for (const weapon of selbstOhneSchaden) {
    assert.ok(SPECIAL_WITHOUT_DAMAGE.includes(weapon.special),
      `${weapon.id} (${weapon.special}) wirkt auf den Schützen, fehlt aber in SPECIAL_WITHOUT_DAMAGE`);
  }
});

// --------------------------------------------------------------- Bestandsführung

test('Der Waffenbestand, den der Client liest, ist vollständig und konsistent', () => {
  // Die Waffenliste im HUD liest `inventory`, `ammo` und `activeWeaponId` je
  // Spieler. Geprüft wird, dass diese drei Angaben zueinander passen — sonst
  // zeigt die Liste Munition für Waffen an, die es nicht gibt, oder umgekehrt.
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const state = match.getState();

  for (const entity of state.entities) {
    assert.ok(Array.isArray(entity.inventory), `${entity.entityId}: inventory fehlt`);
    assert.ok(entity.inventory.length > 0, `${entity.entityId}: kein Startinventar`);

    // Jede Waffe im Inventar muss einen Munitionswert haben — und umgekehrt.
    for (const weaponId of entity.inventory) {
      assert.ok(WEAPONS_BY_ID[weaponId], `${entity.entityId}: unbekannte Waffe ${weaponId}`);
      assert.ok(weaponId in entity.ammo,
        `${entity.entityId}: Munition für ${weaponId} fehlt`);
      const wert = entity.ammo[weaponId];
      assert.ok(wert === 'unbegrenzt' || (Number.isInteger(wert) && wert >= 0),
        `${entity.entityId}: ungültiger Munitionswert für ${weaponId}: ${wert}`);
    }
    for (const weaponId of Object.keys(entity.ammo)) {
      assert.ok(entity.inventory.includes(weaponId),
        `${entity.entityId}: Munition für nicht geführte Waffe ${weaponId}`);
    }

    // Die aktive Waffe muss im Inventar liegen.
    assert.ok(entity.inventory.includes(entity.activeWeaponId),
      `${entity.entityId}: aktive Waffe ${entity.activeWeaponId} nicht im Inventar`);
  }
});

test('Aufgenommene Waffen erscheinen im Bestand mit Munition', () => {
  // Entspricht dem Weg „Waffe per Kiste erhalten“ und prüft, dass der Bestand
  // danach vollständig ist — die Grundlage der Waffenliste.
  const match = new MatchController({ seed: 808, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;

  const vorher = new Set(match.getState().entities
    .find(e => e.entityId === spieler).inventory);

  // Eine Waffe vergeben, die noch nicht geführt wird.
  const neue = WEAPONS.find(w => !vorher.has(w.id) && w.maxAmmo > 0);
  match.inventory.grantWeapon(spieler, neue.id);

  const entity = match.getState().entities.find(e => e.entityId === spieler);
  assert.ok(entity.inventory.includes(neue.id), 'Die neue Waffe muss im Inventar stehen');
  assert.ok(neue.id in entity.ammo, 'Die neue Waffe muss Munition haben');
  assert.ok(entity.ammo[neue.id] === 'unbegrenzt' || entity.ammo[neue.id] > 0,
    `Neue Waffe ohne Munition: ${entity.ammo[neue.id]}`);
});

test('Munition sinkt beim Schuss und ist danach im Bestand sichtbar', () => {
  const match = new MatchController({ seed: 5150, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;

  // Eine verbrauchende Waffe wählen.
  const entity0 = match.getState().entities.find(e => e.entityId === spieler);
  const verbrauchend = entity0.inventory.find(id => entity0.ammo[id] !== 'unbegrenzt');
  assert.ok(verbrauchend, 'Es muss eine Waffe mit begrenzter Munition geben');

  match.inventory.selectWeapon(spieler, verbrauchend);
  const vorher = match.inventory.getAmmo(spieler, verbrauchend);
  const schuss = match.fire(spieler, 0, 50, verbrauchend);
  assert.equal(schuss.ok, true, `Schuss abgelehnt: ${schuss.errors?.join(', ')}`);
  const nachher = match.inventory.getAmmo(spieler, verbrauchend);

  assert.equal(nachher, vorher - 1, 'Ein Schuss kostet genau eine Ladung');
  const entity = match.getState().entities.find(e => e.entityId === spieler);
  assert.equal(entity.ammo[verbrauchend], nachher, 'Der Bestand muss den neuen Wert führen');
});

test('Waffen ohne Munitionsvorrat sind als unbegrenzt gekennzeichnet', () => {
  // Der Client prüft auf genau diesen Text; ein Zahlenwert würde dort als
  // Munition angezeigt.
  const match = new MatchController({ seed: 99, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const entity = match.getState().entities[0];
  const unbegrenzt = Object.entries(entity.ammo).filter(([, v]) => v === 'unbegrenzt');
  assert.ok(unbegrenzt.length >= 1, 'Mindestens eine Waffe muss unbegrenzt sein');
  for (const [weaponId] of unbegrenzt) {
    assert.ok(entity.inventory.includes(weaponId));
  }
});


// --------------------------------------------------------------- Anzeigereihenfolge

test('Die Anzeigereihenfolge ist eine echte Permutation des Inventars', () => {
  // Liste und Zifferntasten nutzen dieselbe Ordnung. Wäre sie keine Permutation,
  // ließe sich eine Waffe nicht mehr erreichen oder eine doppelt.
  const inventar = ['pa_001', 'pa_037', 'pa_087', 'pa_114', 'pa_040'];
  const reihenfolge = orderInventoryBySubcategory(inventar);

  assert.equal(reihenfolge.length, inventar.length, 'Länge muss erhalten bleiben');
  assert.deepEqual([...reihenfolge].sort((a, b) => a - b), [0, 1, 2, 3, 4],
    'Jeder Inventarplatz muss genau einmal vorkommen');
  assert.equal(new Set(reihenfolge).size, reihenfolge.length, 'Keine Wiederholungen');

  // Die Reihenfolge muss der Gruppengliederung folgen: erst Nahkampf, dann
  // Schusswaffen, dann Elementar & Magie, dann Technik & Nutzen.
  const gruppenRang = id => {
    const gruppe = WEAPON_SUBCATEGORIES.find(g => g.categories.includes(WEAPONS_BY_ID[id].category));
    return WEAPON_SUBCATEGORIES.indexOf(gruppe);
  };
  const raenge = reihenfolge.map(i => gruppenRang(inventar[i]));
  assert.deepEqual(raenge, [...raenge].sort((a, b) => a - b),
    `Gruppen nicht in Anzeigereihenfolge: ${raenge.join(', ')}`);
});

test('Die Anzeigereihenfolge erhält die Reihenfolge innerhalb einer Gruppe', () => {
  // Zwei Waffen derselben Gruppe müssen ihre relative Reihenfolge behalten,
  // sonst würde die Liste bei jedem Aufruf neu mischen.
  const gleichGruppe = WEAPONS.filter(w => w.category === 'melee').slice(0, 4).map(w => w.id);
  const inventar = [...gleichGruppe, 'pa_001']; // pa_001 ist ebenfalls Nahkampf
  const reihenfolge = orderInventoryBySubcategory(inventar);
  const nahkampfIndizes = reihenfolge.filter(i => WEAPONS_BY_ID[inventar[i]].category === 'melee');
  assert.deepEqual(nahkampfIndizes, [...nahkampfIndizes].sort((a, b) => a - b),
    'Innerhalb der Gruppe muss die Inventarreihenfolge erhalten bleiben');
});

test('Unbekannte Waffen fallen nicht aus der Reihenfolge', () => {
  // Ein unbekannter Eintrag darf die Liste nicht verkürzen — sonst wäre eine
  // Waffe unerreichbar.
  const reihenfolge = orderInventoryBySubcategory(['pa_001', 'gibt_es_nicht', 'pa_040']);
  assert.equal(reihenfolge.length, 3, 'Unbekannte Einträge müssen enthalten bleiben');
});

test('Die Ordnung ist stabil bei wiederholtem Aufruf', () => {
  const inventar = WEAPONS.slice(0, 8).map(w => w.id);
  const erst = orderInventoryBySubcategory(inventar);
  const zweit = orderInventoryBySubcategory(inventar);
  assert.deepEqual(erst, zweit, 'Zweimal dieselbe Ordnung');
});

test('Für ein leeres Inventar liefert die Ordnung nichts', () => {
  assert.deepEqual(orderInventoryBySubcategory([]), []);
  assert.deepEqual(orderInventoryBySubcategory(null ?? []), []);
});
