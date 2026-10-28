/**
 * Tests: Start-Kit (Worms-Stil) — Waffen sind nicht klassengebunden.
 *
 * Jeder Spieler startet mit der Reserve (`pa_028`, unbegrenzt), zwei
 * Common-Waffen und (Fassung `kit` 3, Standard) einer schwachen Uncommon-
 * Flächenwaffe mit wenig Munition, deterministisch aus Match-Seed und Platz.
 * Fassung 2 (nur Common, kein Geländeabtrag zu Beginn) und Fassung 1 (Klassen-
 * loadout) bleiben für alte Aufzeichnungen lauffähig; weitere Waffen kommen
 * über Loot-Kisten, und JEDE der 150 Waffen darf dort fallen. Geprüft wird
 * (1) der Start, (2) dass JEDE Waffe einmal abgefeuert werden kann, ohne dass der
 * Motor wirft — auch die 11 Waffen ohne eigenen Handler —, (3) Determinismus über
 * den Zustandshash, (4) Abwurf/Limit/Kistenregeln unverändert, (5) alte
 * Replay-Köpfe (ohne `kit`) spielen weiter das Klassenloadout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, playReplay } from '../src/engine/replay.js';
import { WEAPONS, FALLBACK_WEAPON_ID, pickWeaponForRarity } from '../src/shared/config/weapons.js';
import {
  KIT_KLASSE, KIT_STARTER, KIT_FLAECHE, KIT_SCHARF, KIT_STANDARD, STARTER_FLAECHE_MUNITION,
  getClassLoadout, getStartWaffen, getStarterFlaeche, normalisiereKit,
} from '../src/shared/config/loadouts.js';
import { RARITY_WEIGHTS } from '../src/engine/systems/lootSystem.js';
import { SeededRandom } from '../src/shared/prng.js';
import { MAX_WEAPONS } from '../src/engine/inventory.js';
import { waffeVorAuslese } from '../src/shared/config/waffen-fassung.js';

/**
 * Die Waffe, wie die Start-Kits sie lesen: Katalogwerte VOR der Auslese vom 2026-10-28 (Stufe, Schaden,
 * Radius). Der Katalog zeigt den Salvengeber seitdem als `rare` mit Schaden 48 (Spielwert der Fassung 5);
 * das Kit wählt ihn weiter als schwache Uncommon-Flächenwaffe, damit alte Aufzeichnungen dieselben
 * Startwaffen bekommen (`tests/waffen-auslese.test.js`).
 */
const kitWaffe = id => waffeVorAuslese(WEAPONS.find(x => x.id === id));

/** Die sieben Waffen, die im Motor keinen eigenen Handler haben (Stand 2026-10-14). */
const OHNE_HANDLER = [
  'pa_149', 'pa_115', 'pa_105', 'pa_085', 'pa_116', 'pa_107', 'pa_088',
];

function neuesMatch(extra = {}) {
  // Sturm ausser Reichweite: Hier werden Kits und Waffen gemessen, nicht der
  // Mahlstrom (seit 2026-10-25 rundenbasiert, ab Runde 8).
  const match = new MatchController({
    seed: 20261014, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000, valhallaRound: 999, ...extra,
  });
  match.start();
  return match;
}

/**
 * Feuert jede Waffe einmal. Zwischen den Schüssen wird der Zug zurückgesetzt und
 * die Figuren werden geheilt, damit das Match nicht endet.
 * @returns {{ergebnisse:object[], hash:string}}
 */
function feuereAlle() {
  const match = neuesMatch();
  const ergebnisse = [];
  for (const waffe of WEAPONS) {
    const aktiv = match.activePlayerId;
    for (const spieler of match.getState().entities) {
      match.world.setComponent(spieler.entityId, 'Health', 'current', 100000);
      match.world.setComponent(spieler.entityId, 'Health', 'max', 100000);
    }
    // Beide Figuren auf gleicher Höhe, 60 px auseinander: Sichtlinienwaffen haben freie Sicht.
    const boden = match.surfaceYAt(200);
    match.getState().entities.forEach((spieler, i) => {
      match.world.setComponent(spieler.entityId, 'Position', 'x', 200 + i * 60);
      match.world.setComponent(spieler.entityId, 'Position', 'y', boden - 12);
    });
    // Fremde Waffe ins Inventar legen (die Kiste hätte sie gebracht).
    match.inventory.grantWeapon(aktiv, waffe.id);
    match.inventory.selectWeapon(aktiv, waffe.id);
    const schuss = match.fire(aktiv, Math.PI / 4, 60, waffe.id);
    ergebnisse.push({ id: waffe.id, ok: schuss.ok, fehler: schuss.errors ?? null });
    let schutz = 0;
    while (match.activeProjectileCount > 0 && schutz < 900) { match.step(); schutz += 1; }
    match.consumeEvents();
    if (match.status === 'playing' && match.activePlayerId === aktiv) match.endTurn();
  }
  return { ergebnisse, hash: match.stateHash() };
}

test('Start (Fassung 3, alt): Reserve + zwei Common voll geladen + eine knappe Uncommon-Flächenwaffe', () => {
  assert.equal(KIT_STANDARD, KIT_SCHARF);
  const match = neuesMatch({ playersPerTeam: 2, kit: KIT_FLAECHE });
  assert.equal(match.kit, KIT_FLAECHE);
  for (const spieler of match.getState().entities) {
    const waffen = match.inventory.getWeapons(spieler.entityId);
    assert.equal(waffen.length, 4);
    assert.ok(waffen.includes(FALLBACK_WEAPON_ID));
    assert.equal(match.inventory.getAmmo(spieler.entityId, FALLBACK_WEAPON_ID), Infinity);
    const uncommon = waffen.filter(id => kitWaffe(id).powerTier === 'uncommon');
    assert.equal(uncommon.length, 1, 'genau eine Uncommon-Startwaffe');
    for (const id of waffen.filter(w => w !== FALLBACK_WEAPON_ID && !uncommon.includes(w))) {
      const w = kitWaffe(id);
      assert.equal(w.powerTier, 'common', id);
      assert.equal(match.inventory.getAmmo(spieler.entityId, id), Math.max(1, w.maxAmmo));
    }
    // Die Flächenwaffe: schwach, mit Geländeabtrag, wenig Munition.
    const flaeche = kitWaffe(uncommon[0]);
    assert.ok(flaeche.blastRadius > 0 && flaeche.terrainDamage > 0, 'Flächenwirkung mit Geländeabtrag');
    assert.ok(flaeche.damage <= 25, 'schwach');
    assert.equal(match.inventory.getAmmo(spieler.entityId, flaeche.id), STARTER_FLAECHE_MUNITION);
    assert.ok(STARTER_FLAECHE_MUNITION < flaeche.maxAmmo, 'weniger als die Katalogmunition');
    assert.equal(match.inventory.isFull(spieler.entityId), false);
  }
});

test('Fassung 3 hat zu Beginn eine Flächenwaffe, Fassung 2 nicht (keine Common-Flächenwaffe)', () => {
  const abtrag = id => { const w = WEAPONS.find(x => x.id === id); return w.blastRadius > 0; };
  for (let seed = 0; seed < 30; seed++) {
    for (let platz = 0; platz < 4; platz++) {
      assert.ok(!getStartWaffen('scout', KIT_STARTER, { seed, platz }).some(abtrag), `Fassung 2, Seed ${seed}`);
      const kit3 = getStartWaffen('scout', KIT_FLAECHE, { seed, platz });
      assert.equal(kit3.length, 3);
      assert.ok(kit3.some(abtrag), `Fassung 3 braucht Flächenwirkung, Seed ${seed}`);
      assert.deepEqual(kit3.slice(0, 2), getStartWaffen('scout', KIT_STARTER, { seed, platz }),
        'die zwei Common-Waffen sind in beiden Fassungen gleich');
    }
  }
  assert.equal(getStarterFlaeche(5, 0), getStarterFlaeche(5, 0));
  assert.equal(normalisiereKit(3), KIT_FLAECHE);
  assert.equal(normalisiereKit(99), KIT_STANDARD);
});

test('Fassung 3: der erste Schuss mit der Flächenwaffe gräbt ein Loch ins Gelände', () => {
  const match = neuesMatch();
  const id = match.activePlayerId;
  const flaeche = match.inventory.getWeapons(id).find(w => kitWaffe(w).powerTier === 'uncommon');
  match.inventory.selectWeapon(id, flaeche);
  assert.equal(match.fire(id, Math.PI / 4, 60, flaeche).ok, true);
  let schutz = 0;
  while (match.activeProjectileCount > 0 && schutz < 900) { match.step(); schutz += 1; }
  assert.ok(match.consumeEvents().some(e => e.type === 'terrain_destroyed'), 'Geländeabtrag');
  assert.equal(match.inventory.getAmmo(id, flaeche), STARTER_FLAECHE_MUNITION - 1);
});

test('Fassung 2 bleibt lauffähig: Reserve + zwei Common, kein Abtrag, gleiches Replay-Verhalten', () => {
  const match = neuesMatch({ kit: KIT_STARTER, playersPerTeam: 2 });
  assert.equal(match.kit, KIT_STARTER);
  for (const spieler of match.getState().entities) {
    const waffen = match.inventory.getWeapons(spieler.entityId);
    assert.equal(waffen.length, 3);
    for (const id of waffen.filter(w => w !== FALLBACK_WEAPON_ID)) {
      assert.equal(WEAPONS.find(x => x.id === id).powerTier, 'common', id);
    }
  }
  // Altkopf mit `kit: 2`: spielt als Fassung 2 zurück, nicht als Standard.
  const kopf = {
    format: 1, createdAt: 0, seed: 779,
    config: { teams: 2, playersPerTeam: 1, preset: 'hills', maxRounds: 5, turnDurationMs: 30000, kit: 2 },
    totalTicks: 10, entries: [], rounds: [],
  };
  const { match: zurueck } = playReplay(ReplayRecorder.fromJSON(kopf));
  assert.equal(zurueck.kit, KIT_STARTER);
  assert.equal(zurueck.inventory.getWeapons(zurueck.getState().entities[0].entityId).length, 3);
});

test('Start ist klassenunabhängig und deterministisch aus Seed und Platz', () => {
  const inv = seed => {
    const m = neuesMatch({ seed, teams: 3, playersPerTeam: 1,
      loadouts: [{ classId: 'scout', archetypeId: 'brawler' }, { classId: 'heavy', archetypeId: 'brawler' }, { classId: 'artillery', archetypeId: 'brawler' }] });
    return m.getState().entities.map(e => m.inventory.getWeapons(e.entityId).join());
  };
  assert.deepEqual(inv(5), inv(5), 'gleicher Seed, gleicher Start');
  // Dieselbe Klasse an anderem Platz oder anderer Seed darf andere Waffen bekommen — die Klasse selbst entscheidet nichts.
  const viele = new Set([...Array(12).keys()].flatMap(seed => inv(seed)));
  assert.ok(viele.size > 3, 'der Seed variiert den Start');
});

test('Jede der 150 Waffen kann aus einer Kiste fallen (Epic/Legendary selten)', () => {
  const rng = new SeededRandom(1234);
  const gesehen = new Map();
  for (let i = 0; i < 60000; i++) {
    const w = pickWeaponForRarity(rng, RARITY_WEIGHTS);
    gesehen.set(w.powerTier, (gesehen.get(w.powerTier) ?? 0) + 1);
  }
  const selten = ((gesehen.get('epic') ?? 0) + (gesehen.get('legendary') ?? 0)) / 60000;
  assert.ok(selten < 0.03, `Epic/Legendary müssen selten bleiben (${selten})`);
  assert.equal(WEAPONS.filter(w => (RARITY_WEIGHTS[w.powerTier] ?? 0) > 0).length, WEAPONS.length);
});

test('Abwurf (Q), MAX_WEAPONS-Limit und Kisten-Regeln bleiben unverändert', () => {
  const match = neuesMatch();
  const id = match.activePlayerId;
  const zusatz = WEAPONS.filter(w => !match.inventory.has(id, w.id)).slice(0, MAX_WEAPONS);
  for (const w of zusatz) match.inventory.grantWeapon(id, w.id);
  assert.equal(match.inventory.isFull(id), true);
  const ergebnis = match.dropWeapon(id, zusatz[0].id);
  assert.equal(ergebnis.ok, true);
  assert.equal(match.inventory.has(id, zusatz[0].id), false);
});

test('Alle 150 Waffen lassen sich feuern, ohne dass der Motor wirft — und deterministisch', () => {
  const erster = feuereAlle();
  const zweiter = feuereAlle();
  assert.equal(erster.ergebnisse.length, WEAPONS.length);
  const abgelehnt = erster.ergebnisse.filter(e => !e.ok);
  assert.deepEqual(abgelehnt, [], 'jede Waffe muss feuerbar sein');
  for (const id of OHNE_HANDLER) {
    assert.ok(erster.ergebnisse.find(e => e.id === id)?.ok, `${id} (ohne Handler) muss feuern`);
  }
  assert.equal(erster.hash, zweiter.hash, 'derselbe Ablauf ergibt denselben Zustandshash');
});

test('Altes Replay (Kopf ohne `kit`) spielt weiter das Klassenloadout', () => {
  const alt = {
    format: 1, createdAt: 0, seed: 777,
    config: { teams: 2, playersPerTeam: 1, preset: 'hills', maxRounds: 5, turnDurationMs: 30000 },
    totalTicks: 10, entries: [], rounds: [],
  };
  const recorder = ReplayRecorder.fromJSON(alt);
  assert.equal(recorder.config.kit, KIT_KLASSE);
  const { match } = playReplay(recorder);
  assert.equal(match.kit, KIT_KLASSE);
  const spieler = match.getState().entities[0];
  // Klassenloadout: 4 Waffen plus Reserve — nicht das Start-Kit mit 3.
  assert.equal(match.inventory.getWeapons(spieler.entityId).length, 5);
  assert.ok(getClassLoadout('scout').every(id => typeof id === 'string'));
});

test('Neue Aufzeichnung trägt `kit` im Kopf und spielt als Start-Kit zurück', () => {
  const recorder = new ReplayRecorder({ seed: 778, teams: 2, playersPerTeam: 1, preset: 'hills', maxRounds: 5 });
  assert.equal(recorder.toJSON().config.kit, KIT_STANDARD);
  recorder.finalize(10);
  const geladen = ReplayRecorder.fromJSON(recorder.serialize());
  const { match } = playReplay(geladen);
  assert.equal(match.kit, KIT_STANDARD);
  assert.equal(match.inventory.getWeapons(match.getState().entities[0].entityId).length, 4);
});
