/**
 * Tests: Cookies 30 Mali (Fassung 4, `config.cookie` = 4).
 *
 * Zusagen:
 *   - 30/30 Einträge sind vollständig (Name, Erklärung, Wirkung, Gewicht, Stufe).
 *   - Jeder Malus wirkt EINMAL nachweisbar im Motor (`MatchController`).
 *   - Der Zugzeit-Malus verkürzt die Zugzeit der BETROFFENEN Figur, nicht des
 *     ganzen Zuges (docs/anforderungen-2026-11-05.md §5).
 *   - Fassung 1–3 bleiben unberührt: Die Berührung zieht dort keinen Malus.
 *   - Das HUD zeigt Name und Erklärung ohne Zahlen.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { CookieSystem } from '../src/engine/systems/cookieSystem.js';
import { loeseCookieMalus } from '../src/engine/cookieMalus.js';
import { ReplayRecorder } from '../src/engine/replay.js';
import { SeededRandom } from '../src/shared/prng.js';
import { EREIGNIS_WIRKUNGEN } from '../src/client/ereignisse.js';
import { TIER_WIRKUNGSARTEN } from '../src/engine/tierWirkung.js';
import {
  COOKIE_MALI, COOKIE_MALUS_IDS, COOKIE_MALUS_TOTAL, COOKIE_MALUS_STUFEN,
  COOKIE_MALI_FASSUNG, COOKIE_STANDARD, COOKIE_FEINSCHLIFF, COOKIE_KATER,
  COOKIE_HUNGER, normalisiereCookie, cookieMali,
} from '../src/shared/config/cookie.js';

function match4(options = {}) {
  const m = new MatchController({
    seed: 11, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 30000,
    guenther: 4, cookie: COOKIE_MALI_FASSUNG, ...options,
  });
  m.start();
  return m;
}

/** Prüft einen Malus an einem echten Match und nennt den Beleg. */
function belegeMalus(m, playerId, wirkung) {
  const zustand = () => m.statuses.snapshot()[playerId] ?? {};
  const vorher = {
    leben: m.getState().entities.find(e => e.entityId === playerId)?.health ?? 0,
    dots: (zustand().dots ?? []).length,
    langsam: zustand().slowTurns ?? 0,
    gefroren: zustand().frozenTurns ?? 0,
    aufgedeckt: zustand().revealedTurns ?? 0,
    munition: (m.inventory.getWeapons(playerId) ?? [])
      .reduce((s, w) => s + (Number.isFinite(m.inventory.getAmmo(playerId, w)) ? m.inventory.getAmmo(playerId, w) : 0), 0),
    waffen: (m.inventory.getWeapons(playerId) ?? []).length,
    wind: m.wind,
  };
  const bericht = m.wendeTierWirkung(playerId, wirkung);
  const nachher = {
    leben: m.getState().entities.find(e => e.entityId === playerId)?.health ?? 0,
    dots: (zustand().dots ?? []).length,
    langsam: zustand().slowTurns ?? 0,
    gefroren: zustand().frozenTurns ?? 0,
    aufgedeckt: zustand().revealedTurns ?? 0,
    munition: (m.inventory.getWeapons(playerId) ?? [])
      .reduce((s, w) => s + (Number.isFinite(m.inventory.getAmmo(playerId, w)) ? m.inventory.getAmmo(playerId, w) : 0), 0),
    waffen: (m.inventory.getWeapons(playerId) ?? []).length,
    wind: m.wind,
  };
  const tier = m.getState().tier?.[playerId] ?? {};
  switch (wirkung.art) {
    case 'schaden':
      assert.ok(nachher.leben < vorher.leben, `Schaden: ${vorher.leben} -> ${nachher.leben}`);
      break;
    case 'brand':
      assert.ok(nachher.dots > vorher.dots, 'Brand setzt Schaden über Zeit');
      break;
    case 'verlangsamung':
      assert.ok(nachher.langsam > vorher.langsam, 'Verlangsamung');
      break;
    case 'einfrieren':
      assert.ok(nachher.gefroren > vorher.gefroren, 'Einfrieren');
      break;
    case 'aufdecken':
      assert.ok(nachher.aufgedeckt > vorher.aufgedeckt, 'Aufdecken');
      break;
    case 'munitionWeg':
      assert.ok(nachher.munition < vorher.munition, `Munition: ${vorher.munition} -> ${nachher.munition}`);
      break;
    case 'waffeWeg':
      assert.ok(nachher.waffen < vorher.waffen, 'Waffe verloren');
      assert.ok(bericht.weaponId, 'verlorene Waffe benannt');
      break;
    case 'wind':
      assert.notEqual(nachher.wind, vorher.wind, 'Wind gedreht');
      break;
    case 'zugzeit':
      assert.notEqual(tier.zugzeitFaktor, 1, 'Zugzeit verkürzt');
      assert.equal(m.getState().turnDurationMs, Math.round(30000 * wirkung.faktor), 'Dauer der Figur');
      break;
    case 'zielhilfe':
      assert.notEqual(tier.zielhilfeFaktor, 1, 'Zielhilfe verkleinert');
      break;
    case 'stoss': {
      const vy = m.world.getComponent(playerId, 'Velocity', 'y') ?? 0;
      assert.ok(vy !== 0 || (m.world.getComponent(playerId, 'Velocity', 'x') ?? 0) !== 0, 'Stoß wirkt');
      break;
    }
    case 'kisteWeg':
      assert.equal(bericht.betrag, 1, 'Kiste entfernt');
      break;
    case 'krater':
      assert.ok(bericht.betrag > 0, 'Krater');
      break;
    default:
      assert.fail(`unbekannte Wirkungsart ${wirkung.art}`);
  }
  return bericht;
}

test('Mali: 30 Einträge, eindeutig, vollständig, Gewichte ergeben 100', () => {
  assert.equal(COOKIE_MALI.length, 30);
  assert.equal(COOKIE_MALUS_IDS.length, 30);
  assert.equal(new Set(COOKIE_MALUS_IDS).size, 30, 'Kennungen eindeutig');
  assert.equal(COOKIE_MALUS_TOTAL, 100, 'Gewichtssumme');
  for (const m of COOKIE_MALI) {
    assert.ok(m.id && /^[a-z0-9_]+$/.test(m.id), `Kennung: ${m.id}`);
    assert.ok(m.name && m.name.length > 2, `${m.id}: Name`);
    assert.ok(m.erklaerung && m.erklaerung.endsWith('.'), `${m.id}: Erklärung`);
    assert.equal(/\d/.test(m.erklaerung), false, `${m.id}: Erklärung ohne Zahlen`);
    assert.ok(Number.isInteger(m.weight) && m.weight > 0, `${m.id}: Gewicht`);
    assert.ok(COOKIE_MALUS_STUFEN.includes(m.stufe), `${m.id}: Stufe ${m.stufe}`);
    assert.ok(TIER_WIRKUNGSARTEN.includes(m.wirkung.art), `${m.id}: Wirkungsart ${m.wirkung.art}`);
    // Alle Mali sind unangenehm: keine Heilung, kein Schild, keine Waffe als Gabe.
    assert.ok(!['heilung', 'schild', 'panzerung', 'verstaerkung', 'waffe', 'kiste'].includes(m.wirkung.art),
      `${m.id}: kein Bonus`);
  }
  assert.equal(cookieMali(3).length, 0, 'Fassung 3 kennt keine Mali');
  assert.equal(cookieMali(4).length, 30);
});

test('Fassungen: Standard ist 4, 3 bleibt 3, Unbekanntes bleibt 1', () => {
  assert.equal(COOKIE_STANDARD, COOKIE_MALI_FASSUNG);
  assert.equal(COOKIE_MALI_FASSUNG, 4);
  assert.equal(normalisiereCookie(4), COOKIE_MALI_FASSUNG);
  assert.equal(normalisiereCookie(COOKIE_FEINSCHLIFF), COOKIE_FEINSCHLIFF);
  assert.equal(normalisiereCookie(COOKIE_KATER), COOKIE_KATER);
  assert.equal(normalisiereCookie(undefined), 1);
  const kopf = new ReplayRecorder({ seed: 5, cookie: COOKIE_STANDARD }).toJSON().config;
  assert.equal(kopf.cookie, 4, 'Replay-Kopf trägt die Fassung');
});

test('Jeder der 30 Mali wirkt im Motor', () => {
  for (const malus of COOKIE_MALI) {
    const m = match4();
    const spieler = m.activePlayerId;
    if (malus.wirkung.art === 'kisteWeg') {
      // Eine Kiste muss liegen: eine Waffe abwerfen legt eine.
      const waffe = m.inventory.getWeapons(spieler)[0];
      assert.ok(m.dropWeapon(spieler, waffe).ok);
    }
    belegeMalus(m, spieler, malus.wirkung);
  }
});

test('Zugzeit-Malus trifft nur die betroffene Figur und beendet ihren Zug früher', () => {
  const m = match4({ turnDurationMs: 30000 });
  const erste = m.activePlayerId;
  assert.equal(m.getState().turnDurationMs, 30000);
  m.wendeTierWirkung(erste, { art: 'zugzeit', faktor: 0.8, zuege: 1 });
  assert.equal(m.getState().turnDurationMs, 24000, 'betroffene Figur: 80 %');
  assert.equal(Object.keys(m.getState().tier).length, 1, 'nur eine Figur betroffen');

  // Nach 24 s endet ihr Zug — nicht erst nach 30 s.
  let ticks = 0;
  while (m.activePlayerId === erste && ticks < 2000) { m.step(); m.consumeEvents(); ticks += 1; }
  assert.equal(m.activePlayerId === erste, false, 'Zug endete');
  assert.ok(ticks <= 1460, `Zug endete nach ${ticks} Ticks (24 s = 1440)`);
  assert.equal(m.getState().turnDurationMs, 30000, 'Mitspieler behält die volle Zugzeit');
  m.endTurn();
  assert.equal(m.getState().turnDurationMs, 30000, 'nach dem Zug ist die Wirkung abgebaut');
});

test('Berührung: Fassung 4 zieht einen Malus, Fassung 3 nicht', () => {
  const bauen = fassung => {
    const c = new CookieSystem({ rng: new SeededRandom(3), width: 1280, height: 720, fassung });
    const daten = new Map([[1, { x: 0, y: 0 }]]);
    const w = {
      isActive: id => daten.has(id),
      getComponent: (id, _k, feld) => daten.get(id)?.[feld],
    };
    const log = { events: [], heile: [], malus: 0 };
    const ctx = {
      aktiverSpieler: 1, spielerIds: [1], surfaceYAt: () => 100,
      melde: (typ, d) => log.events.push([typ, d]),
      kisten: () => [], heile: (_id, b) => log.heile.push([_id, b]),
      malusAufloesen: (_id) => { log.malus += 1; return { malus: 'kratzer', name: 'Kratzer', erklaerung: 'Ein Hieb.', stufe: 'common', amount: 8 }; },
    };
    // Hungrig genug machen (füttern erst ab Stufe „leise").
    for (let i = 0; i < 4000; i += 1) c.update(w, ctx);
    const p = c.position;
    daten.set(1, { x: p.x + 20, y: p.y });
    let bewegt = 0;
    for (let i = 0; i < 40 && log.malus === 0; i += 1) {
      daten.set(1, { x: p.x + 20 + (bewegt += 1), y: p.y });
      c.update(w, ctx);
    }
    return { c, log, hunger: c.hunger };
  };

  const neu = bauen(COOKIE_MALI_FASSUNG);
  assert.equal(neu.log.malus, 1, 'Fassung 4: genau ein Malus je Berührung');
  const ereignis = neu.log.events.find(e => e[0] === 'cookie_malus');
  assert.ok(ereignis, 'Ereignis gemeldet');
  assert.equal(ereignis[1].playerId, 1);
  assert.equal(ereignis[1].name, 'Kratzer');
  assert.ok(neu.log.heile.length > 0, 'Füttern heilt weiterhin');

  const alt = bauen(COOKIE_FEINSCHLIFF);
  assert.equal(alt.log.malus, 0, 'Fassung 3 zieht keinen Malus');
  assert.equal(alt.log.events.some(e => e[0] === 'cookie_malus'), false);
  assert.ok(alt.log.heile.length > 0, 'Füttern wirkt wie bisher');
});

test('loeseCookieMalus liefert einen Eintrag der Liste und wendet ihn an', () => {
  const m = match4();
  const spieler = m.activePlayerId;
  for (let i = 0; i < 12; i += 1) {
    const r = loeseCookieMalus({
      world: m.world, statuses: m.statuses, inventory: m.inventory, tier: m.tierHandgriffe, rng: m.cookieSystem.rng,
    }, spieler);
    assert.ok(COOKIE_MALUS_IDS.includes(r.malus), `Malus ${r.malus}`);
    assert.ok(r.name && r.erklaerung, 'Name und Erklärung');
    assert.equal(/\d/.test(r.erklaerung), false);
  }
});

test('HUD: der Malus-Text nennt Name und Erklärung und enthält keine Zahlen', () => {
  const zeilen = [];
  const kontext = { hud: { log: text => zeilen.push(text) } };
  for (const malus of COOKIE_MALI) {
    EREIGNIS_WIRKUNGEN.cookie_malus.lokal(kontext, {
      playerId: 1, malus: malus.id, name: malus.name, erklaerung: malus.erklaerung, stufe: malus.stufe, amount: 15,
    });
  }
  assert.equal(zeilen.length, 30);
  for (const [i, text] of zeilen.entries()) {
    assert.ok(text.includes(COOKIE_MALI[i].name), `Name in Zeile ${i}`);
    assert.equal(/\d/.test(text), false, `keine Zahlen: ${text}`);
  }
});

test('Hunger/Fressen der Fassung 4 nutzt weiter die Werte der Fassung 3', () => {
  assert.equal(COOKIE_HUNGER.stufen.leise, 30);
  const m = match4();
  assert.equal(m.cookie, COOKIE_MALI_FASSUNG);
  assert.ok(m.getState().cookie, 'Cookie liegt auf der Karte');
});
