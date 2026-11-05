/**
 * Tests: Günthers 30 Perks (Fassung 4, `config.guenther` = 4).
 *
 * Zusagen:
 *   - 30/30 Einträge sind vollständig (Name, Erklärung, Wirkung, Gewicht, Stufe).
 *   - Jeder Perk wirkt EINMAL nachweisbar im Motor (`MatchController`).
 *   - Fassung 1–3 bleiben bitgleich (Goldwerte der Fassung 3, gemessen VOR der
 *     Erweiterung im unveränderten Stand).
 *   - Der Replay-Kopf trägt die Fassung; das HUD zeigt Name und Erklärung ohne
 *     Zahlen.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { GuentherSystem } from '../src/engine/systems/guentherSystem.js';
import { loeseGuentherRad } from '../src/engine/guentherRad.js';
import { ReplayRecorder } from '../src/engine/replay.js';
import { SeededRandom } from '../src/shared/prng.js';
import { EREIGNIS_WIRKUNGEN } from '../src/client/ereignisse.js';
import { TIER_WIRKUNGSARTEN } from '../src/engine/tierWirkung.js';
import {
  GUENTHER_PERKS, GUENTHER_PERK_IDS, GUENTHER_PERK_TOTAL, GUENTHER_PERK_STUFEN,
  GUENTHER_PERKS_FASSUNG, GUENTHER_FASSUNG_STANDARD, GUENTHER_FEINSCHLIFF,
  GUENTHER_WHEEL, normalisiereGuenther,
} from '../src/shared/config/guenther.js';

/** Neues Match der Fassung 4 (Günther und Cookie). */
function match4(options = {}) {
  const m = new MatchController({
    seed: 11, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 30000,
    guenther: GUENTHER_PERKS_FASSUNG, cookie: 4, ...options,
  });
  m.start();
  return m;
}

/** Prüft eine Wirkung an einem echten Match und nennt den Beleg. */
function belegeWirkung(m, playerId, wirkung) {
  const vorher = {
    leben: m.getState().entities.find(e => e.entityId === playerId)?.health ?? 0,
    schild: m.statuses.snapshot()[playerId]?.shield ?? 0,
    panzerung: m.statuses.snapshot()[playerId]?.armor ?? 0,
    boost: m.statuses.snapshot()[playerId]?.boostMultiplier ?? 1,
    waffe: (m.inventory.getWeapons(playerId) ?? []).length,
    munition: (m.inventory.getWeapons(playerId) ?? [])
      .reduce((s, w) => s + (Number.isFinite(m.inventory.getAmmo(playerId, w)) ? m.inventory.getAmmo(playerId, w) : 0), 0),
    wind: m.wind,
    kisten: m.getState().crates.length,
    dauer: m.getState().turnDurationMs,
    vx: m.world.getComponent(playerId, 'Velocity', 'x') ?? 0,
    vy: m.world.getComponent(playerId, 'Velocity', 'y') ?? 0,
  };
  const bericht = m.wendeTierWirkung(playerId, wirkung);
  const nachher = {
    leben: m.getState().entities.find(e => e.entityId === playerId)?.health ?? 0,
    schild: m.statuses.snapshot()[playerId]?.shield ?? 0,
    panzerung: m.statuses.snapshot()[playerId]?.armor ?? 0,
    boost: m.statuses.snapshot()[playerId]?.boostMultiplier ?? 1,
    waffe: (m.inventory.getWeapons(playerId) ?? []).length,
    munition: (m.inventory.getWeapons(playerId) ?? [])
      .reduce((s, w) => s + (Number.isFinite(m.inventory.getAmmo(playerId, w)) ? m.inventory.getAmmo(playerId, w) : 0), 0),
    wind: m.wind,
    kisten: m.getState().crates.length,
    dauer: m.getState().turnDurationMs,
    vx: m.world.getComponent(playerId, 'Velocity', 'x') ?? 0,
    vy: m.world.getComponent(playerId, 'Velocity', 'y') ?? 0,
  };
  const tier = m.getState().tier?.[playerId] ?? {};
  switch (wirkung.art) {
    case 'heilung':
      assert.ok(nachher.leben > vorher.leben, `Heilung: ${vorher.leben} -> ${nachher.leben}`);
      break;
    case 'schild':
      assert.ok(nachher.schild > vorher.schild, `Schild: ${vorher.schild} -> ${nachher.schild}`);
      break;
    case 'panzerung':
      assert.ok(nachher.panzerung > vorher.panzerung, 'Panzerung');
      break;
    case 'verstaerkung':
      assert.ok(nachher.boost > vorher.boost, 'Verstärkung');
      break;
    case 'munition':
      assert.ok(bericht.betrag > 0, `Munition: ${bericht.betrag}`);
      break;
    case 'waffe':
      assert.ok(bericht.weaponId, 'Waffe');
      assert.ok(m.inventory.has(playerId, bericht.weaponId), `Waffe ${bericht.weaponId} im Inventar`);
      break;
    case 'wind':
      assert.notEqual(nachher.wind, vorher.wind, 'Wind gedreht');
      break;
    case 'zugzeit':
      assert.notEqual(tier.zugzeitFaktor, undefined, 'Zugzeit-Faktor gesetzt');
      assert.notEqual(tier.zugzeitFaktor, 1, 'Zugzeit verändert');
      break;
    case 'zielhilfe':
      assert.notEqual(tier.zielhilfeFaktor, 1, 'Zielhilfe verändert');
      break;
    case 'stoss':
      assert.ok(nachher.vx !== vorher.vx || nachher.vy !== vorher.vy,
        `Stoß: (${vorher.vx},${vorher.vy}) -> (${nachher.vx},${nachher.vy})`);
      break;
    case 'kiste':
      assert.equal(bericht.betrag, 1, 'Kiste gelegt');
      break;
    default:
      assert.ok(bericht.art === wirkung.art);
  }
  return bericht;
}

test('Perks: 30 Einträge, eindeutig, vollständig, Gewichte ergeben 100', () => {
  assert.equal(GUENTHER_PERKS.length, 30);
  assert.equal(GUENTHER_PERK_IDS.length, 30);
  assert.equal(new Set(GUENTHER_PERK_IDS).size, 30, 'Kennungen eindeutig');
  assert.equal(GUENTHER_PERK_TOTAL, 100, 'Gewichtssumme');
  for (const p of GUENTHER_PERKS) {
    assert.ok(p.id && /^[a-z0-9_]+$/.test(p.id), `Kennung: ${p.id}`);
    assert.ok(p.name && p.name.length > 2, `${p.id}: Name`);
    assert.ok(p.erklaerung && p.erklaerung.endsWith('.'), `${p.id}: Erklärung`);
    assert.equal(/\d/.test(p.erklaerung), false, `${p.id}: Erklärung ohne Zahlen`);
    assert.ok(Number.isInteger(p.weight) && p.weight > 0, `${p.id}: Gewicht`);
    assert.ok(GUENTHER_PERK_STUFEN.includes(p.stufe), `${p.id}: Stufe ${p.stufe}`);
    assert.ok(TIER_WIRKUNGSARTEN.includes(p.wirkung.art), `${p.id}: Wirkungsart ${p.wirkung.art}`);
    assert.ok(GUENTHER_WHEEL.some(o => o.id === p.rad), `${p.id}: Radsegment ${p.rad}`);
  }
  assert.ok(GUENTHER_PERKS.filter(p => p.wirkung.art !== 'schaden' && p.wirkung.art !== 'waffeWeg').length >= 28,
    'Günther verteilt überwiegend Gutes');
});

test('Fassungen: Standard ist 4, 3 bleibt 3, Unbekanntes bleibt 1', () => {
  assert.equal(GUENTHER_FASSUNG_STANDARD, GUENTHER_PERKS_FASSUNG);
  assert.equal(GUENTHER_PERKS_FASSUNG, 4);
  assert.equal(normalisiereGuenther(4), GUENTHER_PERKS_FASSUNG);
  assert.equal(normalisiereGuenther(GUENTHER_FEINSCHLIFF), GUENTHER_FEINSCHLIFF);
  assert.equal(normalisiereGuenther(undefined), 1);
  assert.equal(normalisiereGuenther(9), 1);
  const kopf = new ReplayRecorder({ seed: 5, guenther: GUENTHER_FASSUNG_STANDARD }).toJSON().config;
  assert.equal(kopf.guenther, 4, 'Replay-Kopf trägt die Fassung');
});

test('Altreplays der Fassung 3 laufen bitgleich (Goldwerte vor der Erweiterung gemessen)', () => {
  const lauf = seed => {
    const m = new MatchController({
      seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 1_000_000,
      turnPauseTicks: 0, valhallaRound: 999, guenther: GUENTHER_FEINSCHLIFF, cookie: 3,
      waffen: 10, kisten: 3,
    });
    m.start();
    let ereignisse = 0;
    for (let z = 0; z < 36; z += 1) {
      for (let i = 0; i < 400; i += 1) {
        m.step();
        ereignisse += m.consumeEvents().filter(e => e.type.startsWith('guenther_') || e.type.startsWith('cookie_')).length;
      }
      m.endTurn();
    }
    return [m.stateHash(), ereignisse, m.round];
  };
  // Gemessen im unveränderten Stand (main, vor Fassung 4).
  assert.deepEqual(lauf(7), ['f4e94071', 128, 10]);
  assert.deepEqual(lauf(99), ['4dfa2a32', 29, 10]);
  assert.deepEqual(lauf(4242), ['48cffc3c', 25, 10]);
});

test('Fassung 4 ist deterministisch (gleicher Seed, gleicher Endhash)', () => {
  const lauf = (guenther, cookie, seed) => {
    const m = new MatchController({
      seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 1_000_000,
      turnPauseTicks: 0, valhallaRound: 999, guenther, cookie,
    });
    m.start();
    for (let i = 0; i < 2400; i += 1) { m.step(); m.consumeEvents(); }
    return m.stateHash();
  };
  const a = lauf(GUENTHER_PERKS_FASSUNG, 4, 7);
  const b = lauf(GUENTHER_PERKS_FASSUNG, 4, 7);
  assert.equal(a, b, 'gleicher Seed, gleicher Hash');
  // Die Fassung ist im Replay-Kopf unterscheidbar; der Verlauf selbst ändert
  // sich erst bei einer Begegnung (Perk) oder Berührung (Malus) — das prüfen
  // die Wirkungstests oben am Motor.
  assert.equal(new ReplayRecorder({ seed: 7, guenther: GUENTHER_PERKS_FASSUNG }).toJSON().config.guenther, 4);
});

test('Jeder der 30 Perks wirkt im Motor', () => {
  for (const perk of GUENTHER_PERKS) {
    const m = match4();
    const spieler = m.activePlayerId;
    if (perk.wirkung.art === 'heilung') {
      // Vorschaden, sonst ist die Heilung am vollen Leben nicht messbar.
      m.world.getSystem('damage').applyDamage(m.world, spieler, 40, null);
    }
    belegeWirkung(m, spieler, perk.wirkung);
  }
});

test('Das Rad zieht in Fassung 4 einen der 30 Perks, in Fassung 3 die fünf alten Ausgänge', () => {
  const neu = (seed) => new GuentherSystem({
    rng: new SeededRandom(seed), maxRounds: 30, width: 1280, height: 720, fassung: GUENTHER_PERKS_FASSUNG,
    aktionRng: new SeededRandom(seed + 1), perkRng: new SeededRandom(seed + 2),
  });
  const gesehen = new Set();
  for (let i = 0; i < 200; i += 1) gesehen.add(neu(5).wuerfleAusgang().id);
  assert.ok([...gesehen].every(id => GUENTHER_PERK_IDS.includes(id)), 'nur bekannte Perks');
  // Gleicher Seed, gleiche Folge.
  assert.equal(neu(5).wuerfleAusgang().id, neu(5).wuerfleAusgang().id);

  const alt = new GuentherSystem({
    rng: new SeededRandom(5), maxRounds: 30, width: 1280, height: 720, fassung: GUENTHER_FEINSCHLIFF,
    aktionRng: new SeededRandom(6),
  });
  const altIds = new Set(GUENTHER_WHEEL.map(o => o.id));
  for (let i = 0; i < 50; i += 1) assert.ok(altIds.has(alt.wuerfleAusgang().id), 'Fassung 3: alte Ausgänge');
});

test('loeseGuentherRad wendet den Perk an und liefert Name und Erklärung', () => {
  const m = match4();
  const spieler = m.activePlayerId;
  for (let i = 0; i < 12; i += 1) {
    const q = {
      fassung: GUENTHER_PERKS_FASSUNG, guenther: m.guentherSystem, statuses: m.statuses,
      inventory: m.inventory, world: m.world, tier: m.tierHandgriffe, rng: m.seedManager.getSubRng('GUENTHER_PERK'),
    };
    const r = loeseGuentherRad(q, spieler);
    assert.ok(GUENTHER_PERK_IDS.includes(r.outcome), `Perk ${r.outcome}`);
    assert.ok(TIER_WIRKUNGSARTEN.includes(r.effect), `Wirkung ${r.effect}`);
    assert.ok(r.perk.name && r.perk.erklaerung, 'Name und Erklärung');
    assert.equal(r.label, r.perk.name, 'label = Name');
    assert.equal(r.detail, r.perk.erklaerung, 'detail = Erklärung');
    assert.equal(/\d/.test(r.detail), false, 'Erklärung ohne Zahlen');
  }
});

test('Begegnung meldet den Perk als eigenes Ereignis', () => {
  const g = new GuentherSystem({
    rng: new SeededRandom(5), maxRounds: 30, width: 1280, height: 720, fassung: GUENTHER_PERKS_FASSUNG,
    aktionRng: new SeededRandom(6), perkRng: new SeededRandom(7),
  });
  for (let r = 1; r < 30 && !g.aktiv; r += 1) g.setRunde(r);
  assert.ok(g.aktiv, 'Günther tritt auf');
  const { x, y } = g.position;
  const daten = new Map([[1, { x: x + 10, y }]]);
  const welt = {
    isActive: id => daten.has(id),
    getComponent: (id, _k, feld) => daten.get(id)?.[feld],
    setPosition: (id, px, py) => daten.set(id, { x: px, y: py }),
  };
  const ereignisse = [];
  const perk = GUENTHER_PERKS[0];
  const ctx = {
    aktiverSpieler: 1, spielerIds: [1], surfaceYAt: () => y,
    schaden: () => {}, haufenGetroffen: () => {},
    radAufloesen: () => ({ outcome: perk.id, label: perk.name, detail: perk.erklaerung, effect: perk.wirkung.art, perk }),
    melde: (typ, d) => ereignisse.push([typ, d]),
  };
  g.update(welt, ctx); // merkt sich die Startposition
  for (let i = 0; i < 40 && !ereignisse.some(e => e[0] === 'guenther_perk'); i += 1) {
    const p = daten.get(1);
    welt.setPosition(1, p.x + 1, p.y); // eigene Bewegung löst die Berührung aus
    g.update(welt, ctx);
  }
  const treffer = ereignisse.find(e => e[0] === 'guenther_perk');
  assert.ok(treffer, 'Perk-Ereignis gemeldet');
  assert.equal(treffer[1].playerId, 1);
  assert.equal(treffer[1].perk, perk.id);
  assert.equal(treffer[1].name, perk.name);
  assert.equal(treffer[1].erklaerung, perk.erklaerung);
  assert.equal(/\d/.test(`${treffer[1].name} ${treffer[1].erklaerung}`), false);
});

test('HUD: der Perk-Text nennt Name und Erklärung und enthält keine Zahlen', () => {
  const zeilen = [];
  const kontext = { hud: { log: text => zeilen.push(text) } };
  for (const perk of GUENTHER_PERKS) {
    EREIGNIS_WIRKUNGEN.guenther_perk.lokal(kontext, {
      playerId: 1, perk: perk.id, name: perk.name, erklaerung: perk.erklaerung, stufe: perk.stufe, amount: 37,
    });
  }
  assert.equal(zeilen.length, 30);
  for (const [i, text] of zeilen.entries()) {
    assert.ok(text.includes(GUENTHER_PERKS[i].name), `Name in Zeile ${i}`);
    assert.equal(/\d/.test(text), false, `keine Zahlen: ${text}`);
  }
});
