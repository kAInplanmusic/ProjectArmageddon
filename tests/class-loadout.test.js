import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController, CLASS_IDS } from '../src/engine/match.js';
import {
  getClassLoadout,
  getClassLoadoutDetail,
  LOADOUT_ROLES,
  START_TIERS,
  MOVE_SPECIALS,
} from '../src/shared/config/loadouts.js';
import { WEAPONS, WEAPONS_BY_ID, getDefaultLoadout, FALLBACK_WEAPON_ID } from '../src/shared/config/weapons.js';
import { EFFECT_KIND, SPECIAL_EFFECTS } from '../src/engine/specials.js';

/**
 * Klassenabhängige Startloadouts.
 *
 * Hintergrund: Bis hierher startete jede Klasse mit `getDefaultLoadout(4)`, also
 * mit exakt denselben vier Waffen. Die Klasse veränderte nur Werte, nicht die
 * Wahl der Mittel. Diese Datei sichert ab, dass die Loadouts existieren,
 * unterschiedlich sind, eine feste Rollenstruktur haben — und dass die Grenzen
 * (Startstufen, Determinismus, kein Erfinden neuer Waffen) eingehalten werden.
 */

// ------------------------------------------------------------- Grundgerüst

test('Jede Klasse erhält vier verschiedene, gültige Waffen', () => {
  for (const klasse of CLASS_IDS) {
    const loadout = getClassLoadout(klasse);
    assert.equal(loadout.length, 4, `${klasse}: falsche Anzahl Waffen`);
    assert.equal(new Set(loadout).size, 4, `${klasse}: Waffe doppelt im Loadout`);

    for (const weaponId of loadout) {
      assert.ok(WEAPONS_BY_ID[weaponId], `${klasse}: unbekannte Waffe ${weaponId}`);
    }
  }
});

test('Die Rollenstruktur ist bei jeder Klasse dieselbe', () => {
  for (const klasse of CLASS_IDS) {
    const detail = getClassLoadoutDetail(klasse);
    assert.deepEqual(detail.map(eintrag => eintrag.role), [...LOADOUT_ROLES],
      `${klasse}: Rollen weichen von der festen Reihenfolge ab`);

    for (const eintrag of detail) {
      assert.ok(eintrag.reason && eintrag.reason.length > 0,
        `${klasse}/${eintrag.role}: keine Begründung`);
      assert.ok(eintrag.roleLabel && eintrag.roleLabel.length > 0,
        `${klasse}/${eintrag.role}: keine Rollenbeschriftung`);
    }
  }
});

test('Jede Klasse kann Terrain bearbeiten: eine Flächenwaffe ist immer dabei', () => {
  // Ohne Flächenwaffe wäre eine Klasse im Spiel benachteiligt — der Gegner kann
  // sich eingraben, sie kann nichts dagegen tun.
  for (const klasse of CLASS_IDS) {
    const waffen = getClassLoadout(klasse).map(id => WEAPONS_BY_ID[id]);
    assert.ok(waffen.some(w => w.blastRadius > 0 && w.delivery === 'projectile'),
      `${klasse}: keine Flächenwaffe im Loadout`);
    assert.ok(waffen.some(w => w.delivery === 'hitscan'),
      `${klasse}: keine Strahl-/Nahkampfwaffe im Loadout`);
  }
});

// ------------------------------------------------------------- Unterschiede

test('Die Klassen unterscheiden sich in der Wahl der Mittel', () => {
  const scout = getClassLoadout('scout');
  const heavy = getClassLoadout('heavy');
  const artillery = getClassLoadout('artillery');

  assert.notDeepEqual(scout, heavy, 'Scout und Heavy starten identisch');
  assert.notDeepEqual(heavy, artillery, 'Heavy und Artillerie starten identisch');
  assert.notDeepEqual(scout, artillery, 'Scout und Artillerie starten identisch');

  // Nicht nur irgendeine Abweichung: Die Flächenwaffe spiegelt die Klasse.
  const flaeche = (klasse) => WEAPONS_BY_ID[
    getClassLoadoutDetail(klasse).find(e => e.role === 'flaeche').weaponId
  ];
  const scoutFlaeche = flaeche('scout');
  const heavyFlaeche = flaeche('heavy');

  assert.ok(heavyFlaeche.blastRadius > scoutFlaeche.blastRadius,
    'Der Heavy muss die größere Fläche tragen als der Scout');

  // Der Scout trägt das schnellste Geschoss, die Artillerie die größte Reichweite.
  const direkt = (klasse) => WEAPONS_BY_ID[
    getClassLoadoutDetail(klasse).find(e => e.role === 'direkt').weaponId
  ];
  assert.ok(direkt('scout').speedFactor > direkt('heavy').speedFactor,
    'Der Scout muss das schnellere Geschoss tragen');
  assert.ok(direkt('artillery').maxRange >= direkt('scout').maxRange,
    'Die Artillerie muss weiter reichen als der Scout');
});

test('Die Kür ist klassenprägend', () => {
  const kuer = klasse => WEAPONS_BY_ID[
    getClassLoadoutDetail(klasse).find(e => e.role === 'kuer').weaponId
  ];

  // Scout: ein Bewegungsmittel — er schießt am schwächsten und muss über
  // Stellung spielen.
  assert.ok(MOVE_SPECIALS.includes(kuer('scout').special),
    `Scout-Kür ist kein Bewegungsmittel: ${kuer('scout').displayName}`);

  // Heavy: Flächenelement.
  assert.equal(kuer('heavy').subcategory, 'elemental');
  assert.ok(kuer('heavy').blastRadius > 0);

  // Artillerie: Schusswaffe.
  assert.equal(kuer('artillery').subcategory, 'guns');
});

// ------------------------------------------------------------------ Grenzen

test('Startwaffen sind Grundausstattung — episch und legendär bleiben Loot', () => {
  assert.deepEqual([...START_TIERS], ['common', 'uncommon', 'rare']);

  const epischOderLegendaer = WEAPONS
    .filter(w => w.powerTier === 'epic' || w.powerTier === 'legendary')
    .map(w => w.id);

  for (const klasse of CLASS_IDS) {
    for (const weaponId of getClassLoadout(klasse)) {
      assert.ok(!epischOderLegendaer.includes(weaponId),
        `${klasse}: ${weaponId} ist episch/legendär und darf keine Startwaffe sein`);
      assert.ok(START_TIERS.includes(WEAPONS_BY_ID[weaponId].powerTier));
    }
  }

  // Gegenprobe: Ohne die Stufengrenze wäre die stärkste Waffe des Katalogs eine
  // Startwaffe. Der Test wäre also nicht leer.
  const staerkste = [...WEAPONS].sort((a, b) => b.powerScore - a.powerScore)[0];
  assert.ok(staerkste.powerTier === 'legendary' || staerkste.powerTier === 'epic',
    'Die stärkste Waffe liegt nicht mehr in einer gesperrten Stufe — Grenze prüfen');
});

test('Das Loadout ist deterministisch', () => {
  for (const klasse of CLASS_IDS) {
    assert.deepEqual(getClassLoadout(klasse), getClassLoadout(klasse));
    assert.deepEqual(getClassLoadout(klasse, 6), getClassLoadout(klasse, 6));
  }
});

test('Unbekannte Klassen fallen auf das neutrale Loadout zurück', () => {
  const unbekannt = getClassLoadout('gibt-es-nicht');
  assert.deepEqual(unbekannt, getDefaultLoadout(4));

  const detail = getClassLoadoutDetail('gibt-es-nicht');
  assert.ok(detail.every(e => e.role === 'neutral'));
  assert.match(detail[0].reason, /Unbekannte Klasse/);
});

test('Ein längeres Loadout behält die Rollen und füllt danach auf', () => {
  const detail = getClassLoadoutDetail('heavy', 6);
  assert.equal(detail.length, 6);
  assert.deepEqual(detail.slice(0, 4).map(e => e.role), [...LOADOUT_ROLES]);
  assert.ok(detail.slice(4).every(e => e.role === 'fuellung'));
  assert.equal(new Set(detail.map(e => e.weaponId)).size, 6);
});

// ------------------------------------------- Kopplung an den Wirkungskatalog

test('Die Bewegungsliste deckt sich mit dem Wirkungskatalog', () => {
  // MOVE_SPECIALS dupliziert bewusst eine Zuordnung aus src/engine/specials.js:
  // src/shared darf nicht aus src/engine importieren. Damit die Kopie nicht
  // veraltet, wird hier verglichen.
  const bewegung = Object.entries(SPECIAL_EFFECTS)
    .filter(([, effect]) => effect.kind === EFFECT_KIND.MOVE)
    .map(([name]) => name)
    .sort();

  assert.deepEqual([...MOVE_SPECIALS].sort(), bewegung,
    'MOVE_SPECIALS und der Wirkungskatalog sind auseinandergelaufen');
});

// ------------------------------------------------------- Wirkung im Spiel

test('Das echte Match benutzt die Klassen-Loadouts', () => {
  const match = new MatchController({ seed: 9001, teams: 3, playersPerTeam: 3 });
  match.start();
  const state = match.getState();

  assert.equal(state.entities.length, 9);
  for (const entity of state.entities) {
    const klasse = CLASS_IDS[entity.classId];
    const erwartet = getClassLoadout(klasse);
    // Die Reihenfolge im Inventar ist die Reihenfolge des Loadouts, dahinter
    // steht die Reservewaffe mit unbegrenzter Munition.
    for (const weaponId of erwartet) {
      assert.ok(entity.inventory.includes(weaponId),
        `${klasse}: ${weaponId} fehlt im Inventar des Spielers`);
    }
    // Vier Klassenwaffen plus die Reserve — die Reserve ist bei jeder Klasse
    // dieselbe und nicht mehr ein Nebeneffekt der Katalogreihenfolge.
    assert.equal(entity.inventory.length, erwartet.length + 1,
      `${klasse}: ${entity.inventory.length} Waffen im Inventar, erwartet ${erwartet.length + 1}`);
    assert.equal(entity.ammo[FALLBACK_WEAPON_ID], 'unbegrenzt',
      `${klasse}: Die Reservewaffe hat keine unbegrenzte Munition`);
    assert.ok(!erwartet.includes(FALLBACK_WEAPON_ID),
      `${klasse}: Die Reserve steht im Klassen-Loadout — dann gäbe es keine Reserve mehr`);
  }

  // Zwei Spieler unterschiedlicher Klasse dürfen NICHT dasselbe Inventar haben.
  const nachKlasse = new Map();
  for (const entity of state.entities) {
    nachKlasse.set(entity.classId, entity.inventory.join(','));
  }
  assert.equal(new Set(nachKlasse.values()).size, 3,
    'Klassen teilen sich dasselbe Startinventar');
});

test('Ein Match mit einer Klasse läuft über viele Züge ohne Munitionsnot', () => {
  /*
   * Das Loadout darf nicht so knapp sein, dass ein Match stehenbleibt. Die
   * Reservewaffe sichert das ab — hier wird geprüft, dass der Schuss trotzdem
   * über die Startwaffen gelingt.
   *
   * Fund (belegt): Der Test schoss achtmal und machte dazwischen je EINEN
   * Schritt (`match.step(60)` verschiebt die Zuguhr um 60 ms, es sind nicht 60
   * Schritte). Der Zug war damit nie vorbei — der Test bestand nur, weil
   * MEHRERE Schüsse je Zug möglich waren. Das war ein Fehler im Motor (siehe
   * `fire()`: „In diesem Zug wurde bereits geschossen"), den er damit
   * stillschweigend vorausgesetzt hat.
   *
   * Jetzt wird der Zug zu Ende gespielt: bis der Zug wechselt oder das Match
   * endet. Erst dann ist der nächste Schuss ein regulärer Schuss des nächsten
   * Spielers.
   */
  const match = new MatchController({ seed: 12, teams: 2, playersPerTeam: 1, maxRounds: 5 });
  match.start();

  for (let schuss = 0; schuss < 8; schuss++) {
    if (match.status !== 'playing') break;
    const aktiver = match.getState().activePlayerId;
    const ergebnis = match.fire(aktiver, Math.PI / 4, 50);
    assert.ok(ergebnis.ok, `Schuss ${schuss + 1} abgelehnt: ${ergebnis.errors?.join(', ')}`);

    // Den Zug ausspielen: bis der Zug wechselt oder das Match endet.
    let schutz = 0;
    while (match.status === 'playing'
      && match.getState().activePlayerId === aktiver
      && schutz < 5_000) {
      match.step();
      match.consumeEvents();
      schutz += 1;
    }
    assert.ok(schutz < 5_000, `Zug ${schuss + 1} endete nach 5000 Schritten nicht`);
  }
});
