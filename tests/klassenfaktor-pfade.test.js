/**
 * BAL-02: Klassenfaktor im Strahl- und Projektilpfad.
 *
 * ## Befund
 *
 * `shooting.js` multiplizierte den Projektilschaden mit
 * `combatProfile().damageMultiplier`; `match.js#resolveHitscan` ließ den Faktor
 * aus. Ein neutraler Treffer mit `pa_083` (Goldene Hand, Hitscan) ergab deshalb
 * für Nahkampf, Fernkampf und Okkultist dreimal denselben Rohschaden 46 statt
 * 34,5 / 46 / 57,5 — der Klassenvertrag galt nur für einen von zwei Wegen.
 *
 * ## Abhilfe
 *
 * Seit Waffenfassung 17 (`WAFFEN_KLASSE`) rechnen beide Pfade
 * `weapon.damage × Klassenfaktor × Buff`, jeden Faktor genau einmal; Schild und
 * Rüstung bleiben allein Sache des `DamageSystem`. Der Kettenblitz (Mehrfach-
 * wirkung eines Strahls) nimmt den Klassenfaktor einmal vor dem Sprungabfall.
 * Fassungen 15 und 16 bleiben bitgleich — belegt über den Zustandshash.
 *
 * Abgrenzung: `tests/hitscan.test.js` prüft, DASS der Strahl trifft;
 * `tests/klassen-fassung.test.js` prüft die Klassentabelle selbst;
 * `tests/waffen-fassung.test.js` die Katalogschichten. Hier steht nur, wie der
 * Faktor auf dem Weg zum Schaden verrechnet wird.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController, MAP_WIDTH } from '../src/engine/match.js';
import { getWaffe, WAFFEN_KLASSE, WAFFEN_NACHSCHUB, WAFFEN_STANDARD, WAFFEN_TEMPO, WAFFEN_TREFFER } from '../src/shared/config/waffen-fassung.js';
import { CLASS_IDS, CLASS_DEFINITIONS } from '../src/shared/config/classes.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';

const STRAHL = 'pa_083'; // Goldene Hand: Hitscan, 46 Schaden, keine Fläche
const PROJEKTIL = 'pa_022'; // Plasmawerfer: Projektil, keine Fläche, gerade Bahn
const KETTE = 'pa_129'; // Tesla-Turm: Hitscan mit Kettenblitz (2 Sprünge, Abfall 0,6)

/** Waagerecht freie Schusslinie auf der Karte. */
function findClearLine(match, distance, { margin = 40, step = 4 } = {}) {
  for (let shooterX = margin; shooterX + distance <= MAP_WIDTH - margin; shooterX += step) {
    const groundY = Math.max(0, match.surfaceYAt(shooterX));
    if (groundY < 0) continue;
    const lineY = groundY - 5;
    let clear = true;
    for (let offset = 0; offset <= distance; offset += 2) {
      const surface = match.surfaceYAt(shooterX + offset);
      if (surface < 0 || surface <= lineY) { clear = false; break; }
    }
    if (clear) return { shooterX, groundY };
  }
  return null;
}

/**
 * Feuert auf ein Ziel auf gleicher Höhe und liefert den tatsächlich
 * abgezogenen Rohschaden (vor Tod, 500 LP Puffer).
 */
function schuss(weaponId, klasse, {
  waffen = WAFFEN_STANDARD, distanz = 80, buff = 0, armor = 0, shield = 0,
} = {}) {
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000_000,
    waffen, klassen: KLASSEN_STANDARD,
    loadouts: [{ classId: klasse }, { classId: klasse }],
  });
  match.start();

  const schuetze = match.activePlayerId;
  const ziel = match.players.find(p => p.entityId !== schuetze).entityId;
  const line = findClearLine(match, distanz);
  assert.ok(line, 'Testannahme: es gibt eine freie Schusslinie');

  match.world.setComponent(schuetze, 'Position', 'x', line.shooterX);
  match.world.setComponent(schuetze, 'Position', 'y', line.groundY);
  match.world.setComponent(ziel, 'Position', 'x', line.shooterX + distanz);
  match.world.setComponent(ziel, 'Position', 'y', line.groundY);
  for (const p of match.players) {
    match.world.setComponent(p.entityId, 'Health', 'max', 500);
    match.world.setComponent(p.entityId, 'Health', 'current', 500);
  }
  if (buff > 0) match.statuses.addBoost(schuetze, buff, 2);
  if (armor > 0) match.statuses.addArmor(ziel, armor);
  if (shield > 0) match.statuses.addShield(ziel, shield);

  match.inventory.register(schuetze, [weaponId]);
  match.inventory.selectWeapon(schuetze, weaponId);

  const vorher = match.world.getComponent(ziel, 'Health', 'current');
  const ergebnis = match.fire(schuetze, 0, 100, weaponId);
  assert.equal(ergebnis.ok, true, `Schuss abgelehnt: ${ergebnis.errors?.join(', ')}`);

  let wache = 0;
  while (match.activeProjectileCount > 0 && wache < 900) { match.step(); match.consumeEvents(); wache += 1; }
  for (let i = 0; i < 8; i++) { match.step(); match.consumeEvents(); }

  const nachher = match.world.getComponent(ziel, 'Health', 'current');
  return {
    schaden: Math.round((vorher - nachher) * 1000) / 1000,
    schildRest: Math.round(match.statuses.shieldOf(ziel) * 1000) / 1000,
    getroffen: ergebnis.hit?.target ?? null,
    ziel,
  };
}

/** Drei Figuren in einer Linie; liefert den Schaden je Figur (Ersttreffer, Sprung 1). */
function kettenSchuss(klasse, waffen = WAFFEN_STANDARD) {
  const match = new MatchController({
    seed: 4242, teams: 3, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000_000,
    waffen, klassen: KLASSEN_STANDARD,
    loadouts: Array.from({ length: 3 }, () => ({ classId: klasse })),
  });
  match.start();

  const schuetze = match.activePlayerId;
  const andere = match.players.filter(p => p.entityId !== schuetze).map(p => p.entityId);
  const line = findClearLine(match, 260);
  assert.ok(line, 'Testannahme: es gibt eine freie Schusslinie für drei Figuren');

  match.world.setComponent(schuetze, 'Position', 'x', line.shooterX);
  match.world.setComponent(schuetze, 'Position', 'y', line.groundY);
  andere.forEach((id, i) => {
    match.world.setComponent(id, 'Position', 'x', line.shooterX + 80 + i * 85);
    match.world.setComponent(id, 'Position', 'y', line.groundY);
    match.world.setComponent(id, 'Health', 'max', 500);
    match.world.setComponent(id, 'Health', 'current', 500);
  });

  match.inventory.register(schuetze, [KETTE]);
  match.inventory.selectWeapon(schuetze, KETTE);
  const vorher = andere.map(id => match.world.getComponent(id, 'Health', 'current'));
  match.fire(schuetze, 0, 100, KETTE);
  for (let i = 0; i < 20; i++) { match.step(); match.consumeEvents(); }
  const nachher = andere.map(id => match.world.getComponent(id, 'Health', 'current'));
  return vorher.map((v, i) => Math.round((v - nachher[i]) * 1000) / 1000);
}

/** Klassenfaktor aus der Tabelle, nicht aus dem Motor. */
const faktoren = Object.fromEntries(CLASS_IDS.map(id => [id, CLASS_DEFINITIONS[id].power]));

// ------------------------------------------------------------- Strahlpfad

test('BAL-02: der Strahl verrechnet den Klassenfaktor — 34,5 / 46 / 57,5 statt dreimal 46', () => {
  const roh = getWaffe(STRAHL, WAFFEN_STANDARD).damage;
  const werte = CLASS_IDS.map(klasse => schuss(STRAHL, klasse).schaden);

  assert.deepEqual(werte, [34.5, 46, 57.5],
    `neutrale Treffer müssen 34,5 / 46 / 57,5 Rohschaden liefern, waren ${werte.join(' / ')}`);
  assert.deepEqual(werte, CLASS_IDS.map(klasse => roh * faktoren[klasse]),
    'jeder Wert ist Katalogschaden × Klassenfaktor — genau einmal');
  assert.equal(new Set(werte).size, CLASS_IDS.length,
    'drei Klassen dürfen nicht denselben Rohschaden ergeben (der alte Fehler)');
});

test('BAL-02: Strahl und Projektil folgen demselben Schadensvertrag', () => {
  for (const klasse of CLASS_IDS) {
    const roh = getWaffe(PROJEKTIL, WAFFEN_STANDARD).damage;
    const strahl = schuss(STRAHL, klasse).schaden;
    const projektil = schuss(PROJEKTIL, klasse).schaden;
    const strahlRoh = getWaffe(STRAHL, WAFFEN_STANDARD).damage;

    assert.equal(projektil, roh * faktoren[klasse], `${klasse}: Projektil`);
    assert.equal(strahl / strahlRoh, projektil / roh,
      `${klasse}: beide Pfade müssen mit demselben Klassenfaktor rechnen`);
  }
});

// ---------------------------------------------------- Buff, Rüstung, Schild

test('BAL-02: der Buff wirkt genau einmal, auch auf den Strahl', () => {
  const roh = getWaffe(STRAHL, WAFFEN_STANDARD).damage;
  for (const klasse of CLASS_IDS) {
    const ohne = schuss(STRAHL, klasse).schaden;
    const mit = schuss(STRAHL, klasse, { buff: 1.5 }).schaden;

    assert.equal(mit, ohne * 1.5, `${klasse}: Buff muss einmal multiplizieren`);
    assert.equal(mit, roh * faktoren[klasse] * 1.5, `${klasse}: Klasse × Buff, je einmal`);
    assert.notEqual(mit, ohne * 1.5 * 1.5, 'der Buff darf nicht doppelt einlaufen');
  }
});

test('BAL-02: Rüstung wirkt genau einmal — Magie durchdringt die Hälfte', () => {
  const roh = getWaffe(STRAHL, WAFFEN_STANDARD).damage;
  const magieAnteil = 0.5; // pa_083: arkane Art, `artRegel('arcane').ruestung` = 0,5
  for (const klasse of CLASS_IDS) {
    const ohne = schuss(STRAHL, klasse).schaden;
    const mit = schuss(STRAHL, klasse, { armor: 0.2 }).schaden;
    const erwartet = roh * faktoren[klasse] * (1 - 0.2 * magieAnteil);

    assert.equal(mit, Math.round(erwartet * 1000) / 1000, `${klasse}: Rüstung einmal`);
    assert.ok(mit < ohne, `${klasse}: Rüstung muss wirken`);
    assert.notEqual(mit, Math.round(ohne * (1 - 0.2 * magieAnteil) * (1 - 0.2 * magieAnteil) * 1000) / 1000,
      'die Rüstung darf nicht zweimal einlaufen');
  }
});

test('BAL-02: das Schild fängt genau einmal, der Rest trifft das Leben', () => {
  const roh = getWaffe(STRAHL, WAFFEN_STANDARD).damage;
  for (const klasse of CLASS_IDS) {
    const ohne = schuss(STRAHL, klasse).schaden;
    const ergebnis = schuss(STRAHL, klasse, { shield: 20 });

    assert.equal(ergebnis.schaden, ohne - 20, `${klasse}: 20 Schildpunkte, einmal abgezogen`);
    assert.equal(ergebnis.schildRest, 0, `${klasse}: Schild ist verbraucht`);
    assert.equal(ohne, roh * faktoren[klasse], `${klasse}: Basisschaden bleibt Klassenwert`);
  }
});

// ------------------------------------------------------ Mehrfachwirkung

test('BAL-02: die Mehrfachwirkung (Kettenblitz) rechnet den Klassenfaktor einmal', () => {
  const roh = getWaffe(KETTE, WAFFEN_STANDARD).damage;
  const abfall = 0.6; // `buildEffect(pa_129).falloff`

  for (const [klasse, primaer, sprung] of [
    ['nahkampf', 36, 21.6],
    ['fernkampf', 48, 28.8],
    ['okkultist', 60, 36],
  ]) {
    const [erster, zweiter] = kettenSchuss(klasse);
    assert.equal(erster, primaer, `${klasse}: Ersttreffer`);
    assert.equal(zweiter, sprung, `${klasse}: ein Sprung mit Abfall ${abfall}`);
    assert.equal(erster, roh * faktoren[klasse], `${klasse}: Klassenfaktor einmal am Anfang`);
    assert.equal(zweiter, Math.round(roh * faktoren[klasse] * abfall * 1000) / 1000,
      `${klasse}: Abfall kommt NACH dem Klassenfaktor, nicht daneben`);
  }
});

// -------------------------------------------------------- Alte Fassungen

test('BAL-02: Fassung 16 und 15 bleiben bitgleich — dreimal 46, gleicher Zustandshash', () => {
  const roh = getWaffe(STRAHL, WAFFEN_STANDARD).damage;
  /* Vor der Änderung gemessen (main, 2026-11-09): ein Strahltreffer mit pa_083
   * auf eine Fernkämpfer-Figur, 120 Ticks, Zustandshash `8b36dc7a`. */
  const GOLD_F15 = { hash: '8b36dc7a', leben: 54 };

  for (const waffen of [WAFFEN_TEMPO, WAFFEN_TREFFER]) {
    for (const klasse of CLASS_IDS) {
      assert.equal(schuss(STRAHL, klasse, { waffen }).schaden, roh,
        `Fassung ${waffen} (${klasse}): der Strahl bleibt beim Katalogschaden`);
    }

    const match = new MatchController({
      seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5,
      waffen, klassen: KLASSEN_STANDARD,
    });
    match.start();
    const schuetze = match.players[0];
    const ziel = match.players.find(p => p.teamId !== schuetze.teamId);
    const line = findClearLine(match, 90);
    match.world.setComponent(schuetze.entityId, 'Position', 'x', line.shooterX);
    match.world.setComponent(schuetze.entityId, 'Position', 'y', line.groundY);
    match.world.setComponent(ziel.entityId, 'Position', 'x', line.shooterX + 90);
    match.world.setComponent(ziel.entityId, 'Position', 'y', line.groundY);
    match.inventory.register(schuetze.entityId, [STRAHL]);
    match.inventory.selectWeapon(schuetze.entityId, STRAHL);
    match.fire(schuetze.entityId, 0, 100, STRAHL);
    for (let i = 0; i < 120; i++) { match.step(); match.consumeEvents(); }

    assert.equal(match.stateHash(), GOLD_F15.hash, `Fassung ${waffen}: Zustandshash`);
    assert.equal(match.world.getComponent(ziel.entityId, 'Health', 'current'), GOLD_F15.leben,
      `Fassung ${waffen}: Lebensstand nach dem Treffer`);
  }
});

test('BAL-02: Fassung 17 folgt auf 16, der Standard enthält sie, und sie ändert nur den Strahlschaden', () => {
  assert.equal(WAFFEN_KLASSE, WAFFEN_TREFFER + 1);
  // Seit Fassung 18 (BAL-05, Nachschub) ist 17 nicht mehr die jüngste; 18 ändert am Schaden nichts.
  assert.equal(WAFFEN_STANDARD, WAFFEN_NACHSCHUB);
  assert.equal(WAFFEN_NACHSCHUB, WAFFEN_KLASSE + 1);
  assert.equal(schuss(STRAHL, 'nahkampf').schaden, 34.5,
    'erst ab Fassung 17 gilt der Klassenfaktor im Strahl — der Test oben belegt Fassung 16 davor');
});
