/**
 * Tests: Katalogfassung der Waffenwerte (`config.waffen`), Balance-Korrektur
 * vom 2026-10-14, Start-Kit Fassung 4 und die Balance-Werkzeuge.
 *
 * Die zentrale Zusage: Eine Aufzeichnung OHNE `waffen` im Kopf spielt Bit für Bit
 * wie vor der Korrektur. Belegt auf drei Wegen:
 *  1. Katalog + `WAFFEN_ALT_WERTE` = der Katalog von vorher (Prüfsumme, gemessen am
 *     Stand 573a2c6),
 *  2. ein Schuss jeder geänderten Waffe: Zustandshash und Schaden mit `waffen: 1`
 *     gleich den Goldwerten von 573a2c6, mit der Standardfassung anders,
 *  3. Replay-Kopf: Altdatei ohne Feld = Fassung 1, neue Aufzeichnung = Fassung 2.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, playReplay } from '../src/engine/replay.js';
import { WEAPONS, WEAPONS_BY_ID } from '../src/shared/config/weapons.js';
import {
  WAFFEN_ALT, WAFFEN_BALANCE, WAFFEN_KORREKTUR, WAFFEN_FEIN, WAFFEN_FAIR, WAFFEN_ZUENDER, WAFFEN_STANDARD, WAFFEN_ALT_WERTE, WAFFEN_F2_WERTE, WAFFEN_F3_WERTE, normalisiereWaffen, getWaffe,
} from '../src/shared/config/waffen-fassung.js';
import {
  KIT_FLAECHE, KIT_SCHARF, KIT_STANDARD, getStartWaffen, normalisiereKit, getStartMunition,
} from '../src/shared/config/loadouts.js';
import { KISTEN_ALT } from '../src/shared/config/kisten.js';
import { BALANCE_KORREKTUREN, BALANCE_KORREKTUREN_3, BALANCE_KORREKTUREN_4, FLUGPROFILE_4, FESTE_ABLEITUNGEN_3, tierForScore } from '../scripts/build-weapon-catalog.mjs';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';
import {
  messeWaffe, findeAusreisser, klassenGesundheit, ENTFERNUNGEN, STUFEN, ZU_SCHWACH, ZU_STARK,
} from '../scripts/waffen-balance.mjs';
import { spiele } from '../scripts/bot-partien.mjs';

/**
 * SHA-256 über den Katalog mit sortierten Schlüsseln (gemessen an 573a2c6).
 *
 * ANZEIGETEXTE GEHÖREN NICHT DAZU (2026-10-28, Namens- und Beschreibungsdurchsicht): `displayName`
 * und `description` stehen nicht in der Summe. Die Summe beweist, dass die SPIELWERTE alter
 * Fassungen bitgleich bleiben; ein Anzeigename ändert keinen Schuss. Die drei Summen sind neu
 * gemessen: Katalog und Fassungs-Tabelle des Stands vor der Umbenennung (6fd0a90), gleiche
 * Projektion; mit der alten Projektion (inklusive `displayName`) ergaben dieselben Daten wieder
 * die bisherigen Werte d80e28df…, 75ba797b… und 63914aee…. Es wurde kein Spielwert angepasst.
 */
const PRUEFSUMME_ALTER_KATALOG = 'ceb60ae649218406c71d9986417cc6f25c04bed8907fd8a1d20c1962836ac30a';

/** SHA-256 des Katalogs in Fassung 2 (gemessen am Stand d2d65aa, vor Fassung 3). */
const PRUEFSUMME_F2 = 'd8b3632fc9c9a9057b6b063c4f8a26afff05e58bd3f5bc440aed357c60725411';

const ANZEIGETEXTE = new Set(['displayName', 'description']);

function stabil(wert) {
  return JSON.stringify(wert, (k, x) => {
    if (ANZEIGETEXTE.has(k)) return undefined;
    return x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x;
  });
}

/** Gold: ein Schuss jeder geänderten Waffe auf 30 px, gemessen mit dem Stand 573a2c6. */
const GOLD_ALT = {
  pa_001: { verloren: 19.6, hash: '3bcd080b' },
  pa_005: { verloren: 29.4, hash: '9ba26561' },
  pa_006: { verloren: 14, hash: '6eec6834' },
  pa_007: { verloren: 15.4, hash: '713bee6a' },
  pa_009: { verloren: 21, hash: 'ec094e55' },
  pa_039: { verloren: 89.9, hash: 'ba77de3c' },
  pa_040: { verloren: 6.0, hash: '5c0fa056' },
  pa_066: { verloren: 99.7, hash: 'dda4bef8' },
  pa_140: { verloren: 50.4, hash: 'c1d1f3bc' },
};

function schussAufNachbarn(id, extra = {}) {
  const match = new MatchController({
    seed: 31337, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000, kit: KIT_FLAECHE, kisten: KISTEN_ALT, schaden: 1, ...extra,
  });
  match.start();
  const aktiv = match.activePlayerId;
  const ziel = match.getState().entities.find(e => e.entityId !== aktiv);
  const boden = match.surfaceYAt(300);
  match.world.setComponent(aktiv, 'Position', 'x', 300);
  match.world.setComponent(aktiv, 'Position', 'y', boden - 12);
  match.world.setComponent(ziel.entityId, 'Position', 'x', 330);
  match.world.setComponent(ziel.entityId, 'Position', 'y', boden - 12);
  match.world.setComponent(ziel.entityId, 'Health', 'max', 1000);
  match.world.setComponent(ziel.entityId, 'Health', 'current', 1000);
  match.inventory.grantWeapon(aktiv, id);
  match.inventory.selectWeapon(aktiv, id);
  assert.ok(match.fire(aktiv, 0.05, 80, id).ok, id);
  let g = 0;
  while (match.activeProjectileCount > 0 && g < 900) { match.step(); g += 1; }
  for (let i = 0; i < 20; i += 1) match.step();
  match.consumeEvents();
  return {
    verloren: 1000 - match.world.getComponent(ziel.entityId, 'Health', 'current'),
    hash: match.stateHash(),
  };
}

test('Katalog + Altwerte ergibt genau den Katalog von vor der Korrektur (Prüfsumme)', () => {
  const alt = WEAPONS.map(w => getWaffe(w.id, WAFFEN_ALT));
  assert.equal(createHash('sha256').update(stabil(alt)).digest('hex'), PRUEFSUMME_ALTER_KATALOG);
  assert.notEqual(createHash('sha256').update(stabil(WEAPONS)).digest('hex'), PRUEFSUMME_ALTER_KATALOG,
    'der heutige Katalog unterscheidet sich vom alten');
});

test('Fassung 2 bleibt bitgleich: Katalog + Fassung-2-Werte = Katalog von d2d65aa (Prüfsumme)', () => {
  const f2 = WEAPONS.map(w => getWaffe(w.id, WAFFEN_BALANCE));
  assert.equal(createHash('sha256').update(stabil(f2)).digest('hex'), PRUEFSUMME_F2);
  assert.notEqual(createHash('sha256').update(stabil(WEAPONS)).digest('hex'), PRUEFSUMME_F2);
  assert.deepEqual(Object.keys(WAFFEN_F2_WERTE).sort(), Object.keys(BALANCE_KORREKTUREN_3).sort());
  assert.equal(getWaffe('pa_028', WAFFEN_BALANCE), WEAPONS_BY_ID.pa_028);
  assert.equal(getWaffe('pa_028', WAFFEN_KORREKTUR), WEAPONS_BY_ID.pa_028);
  assert.equal(getWaffe('pa_028', WAFFEN_FEIN), WEAPONS_BY_ID.pa_028);
});

test('Korrekturtabelle und Altwerte decken dieselben Waffen; Stufe bleibt gleich', () => {
  assert.deepEqual(Object.keys(WAFFEN_ALT_WERTE).sort(), Object.keys(BALANCE_KORREKTUREN).sort());
  for (const [id, alt] of Object.entries(WAFFEN_ALT_WERTE)) {
    const neu = WEAPONS_BY_ID[id];
    assert.equal(getWaffe(id, WAFFEN_BALANCE).damage, BALANCE_KORREKTUREN[id].damage, id);
    assert.notEqual(neu.damage, alt.damage, `${id}: Wert hat sich geändert`);
    assert.equal(tierForScore(alt.powerScore), neu.powerTier, `${id}: Stufe darf sich nicht ändern (Loot-Gewichte)`);
    assert.equal(getWaffe(id, WAFFEN_ALT).damage, alt.damage);
    assert.equal(getWaffe(id, WAFFEN_BALANCE).damage, BALANCE_KORREKTUREN[id].damage);
  }
  assert.equal(getWaffe('pa_028', WAFFEN_ALT), WEAPONS_BY_ID.pa_028, 'ungeänderte Waffen sind dasselbe Objekt');
  assert.equal(getWaffe('gibt_es_nicht', WAFFEN_ALT), null);
});

test('Kontaktwaffen sind moderat stärker (+20 bis +30 %), Luftschläge/Quantenblaster moderat schwächer', () => {
  for (const id of ['pa_001', 'pa_005', 'pa_006', 'pa_007', 'pa_009']) {
    const faktor = WEAPONS_BY_ID[id].damage / WAFFEN_ALT_WERTE[id].damage;
    assert.ok(faktor >= 1.19 && faktor <= 1.30, `${id}: ${faktor.toFixed(2)}`);
  }
  for (const id of ['pa_039', 'pa_066', 'pa_140']) {
    const faktor = WEAPONS_BY_ID[id].damage / WAFFEN_ALT_WERTE[id].damage;
    assert.ok(faktor >= 0.80 && faktor < 1, `${id}: ${faktor.toFixed(2)}`);
  }
});

test('normalisiereWaffen: bekannte Fassungen bleiben, alles andere fällt auf den Standard', () => {
  assert.equal(WAFFEN_STANDARD, WAFFEN_ZUENDER);
  assert.equal(WAFFEN_ZUENDER, 6);
  assert.equal(normalisiereWaffen(1), WAFFEN_ALT);
  assert.equal(normalisiereWaffen(2), WAFFEN_BALANCE);
  assert.equal(normalisiereWaffen(3), WAFFEN_KORREKTUR);
  assert.equal(normalisiereWaffen(4), WAFFEN_FEIN);
  assert.equal(normalisiereWaffen(5), WAFFEN_FAIR);
  assert.equal(normalisiereWaffen(6), WAFFEN_ZUENDER);
  assert.equal(normalisiereWaffen(undefined), WAFFEN_STANDARD);
  assert.equal(normalisiereWaffen(7), WAFFEN_STANDARD);
});

/** SHA-256 des Katalogs in Fassung 3 (gemessen am Stand 09664fe, vor Fassung 4). */
const PRUEFSUMME_F3 = '0b587300cb451bdcd911acf05264572c252deb08e35d6423ada5802468b98d34';

/** Gold: ein Schuss der neun Waffen von Fassung 4 — Fassung 3 gemessen am Stand 09664fe, Fassung 4 neu. */
const GOLD_F3_NEUN = {
  pa_038: { verloren: 27.2, hash: '40b65b40' }, pa_059: { verloren: 38.5, hash: '872e1393' },
  pa_060: { verloren: 12.2, hash: '21906ab' }, pa_068: { verloren: 35, hash: '99bc52b4' },
  pa_069: { verloren: 24.9, hash: 'bad32a31' }, pa_083: { verloren: 50, hash: '1875a801' },
  pa_104: { verloren: 43.4, hash: '81ceb516' }, pa_118: { verloren: 72, hash: 'e768ce7c' },
  pa_139: { verloren: 102, hash: 'd21677dd' },
};
const GOLD_F4 = {
  pa_038: { verloren: 31.6, hash: '5156ffba' }, pa_059: { verloren: 46.2, hash: '8a668ffc' },
  pa_060: { verloren: 14.8, hash: '8fc899b6' }, pa_068: { verloren: 37.8, hash: 'c1745163' },
  pa_069: { verloren: 30.4, hash: '9b12dcb7' }, pa_083: { verloren: 46, hash: 'af7b64d' },
  pa_104: { verloren: 39.2, hash: 'b86c7751' }, pa_118: { verloren: 66, hash: 'f7a51851' },
  pa_139: { verloren: 92, hash: 'adb4b90b' },
};

test('Fassung 3 bleibt bitgleich: Katalog + Fassung-3-Werte = Katalog von 09664fe, Schüsse wie vorher', () => {
  const f3 = WEAPONS.map(w => getWaffe(w.id, WAFFEN_KORREKTUR));
  assert.equal(createHash('sha256').update(stabil(f3)).digest('hex'), PRUEFSUMME_F3);
  assert.notEqual(createHash('sha256').update(stabil(WEAPONS)).digest('hex'), PRUEFSUMME_F3);
  assert.deepEqual(Object.keys(WAFFEN_F3_WERTE).sort(), [...new Set([...Object.keys(BALANCE_KORREKTUREN_4), ...Object.keys(FLUGPROFILE_4)])].sort());
  for (const [id, gold] of Object.entries(GOLD_F3_NEUN)) {
    const r = schussAufNachbarn(id, { waffen: WAFFEN_KORREKTUR });
    assert.equal(r.hash, gold.hash, `${id}: Zustandshash Fassung 3`);
    assert.ok(Math.abs(r.verloren - gold.verloren) < 0.1, `${id}: ${r.verloren}`);
  }
});

test('Fassung 4: die neun Waffen wirken wie gemessen, Stufe und Abklingzeit bleiben, Richtung stimmt', () => {
  for (const [id, gold] of Object.entries(GOLD_F4)) {
    const r = schussAufNachbarn(id, { waffen: WAFFEN_FEIN });
    assert.equal(r.hash, gold.hash, `${id}: Zustandshash Fassung 4`);
    assert.ok(Math.abs(r.verloren - gold.verloren) < 0.1, `${id}: ${r.verloren}`);
    const neu = WEAPONS_BY_ID[id];
    const f3 = getWaffe(id, WAFFEN_KORREKTUR);
    assert.equal(neu.damage, BALANCE_KORREKTUREN_4[id].damage);
    assert.equal(neu.powerTier, f3.powerTier, `${id}: Stufe bleibt`);
    assert.equal(neu.cooldown, f3.cooldown, `${id}: Abklingzeit bleibt`);
    assert.equal(neu.maxAmmo, f3.maxAmmo, `${id}: Magazin bleibt`);
  }
  // Gesenkt: die drei Strahlwaffen über dem Stufenmedian; angehoben: die fünf Schwachen.
  for (const id of ['pa_083', 'pa_104', 'pa_118', 'pa_139']) assert.ok(WEAPONS_BY_ID[id].damage < getWaffe(id, WAFFEN_KORREKTUR).damage, id);
  for (const id of ['pa_038', 'pa_059', 'pa_060', 'pa_068', 'pa_069']) assert.ok(WEAPONS_BY_ID[id].damage > getWaffe(id, WAFFEN_KORREKTUR).damage, id);
});

test('Altfassung (waffen: 1): jede geänderte Waffe wirkt Bit für Bit wie auf 573a2c6', () => {
  for (const [id, gold] of Object.entries(GOLD_ALT)) {
    const r = schussAufNachbarn(id, { waffen: WAFFEN_ALT });
    assert.equal(r.hash, gold.hash, `${id}: Zustandshash`);
    assert.ok(Math.abs(r.verloren - gold.verloren) < 0.1, `${id}: Schaden ${r.verloren} statt ${gold.verloren}`);
  }
});

test('Standardfassung: dieselben Schüsse wirken anders und im Sinne der Korrektur', () => {
  for (const [id, gold] of Object.entries(GOLD_ALT)) {
    const r = schussAufNachbarn(id);
    assert.notEqual(r.hash, gold.hash, `${id}: Hash muss sich ändern`);
    const stärker = BALANCE_KORREKTUREN[id].damage > WAFFEN_ALT_WERTE[id].damage;
    assert.equal(r.verloren > gold.verloren, stärker, `${id}: ${r.verloren} gegen ${gold.verloren}`);
  }
});

/** Gold: ein Schuss der drei Waffen von Fassung 3, gemessen mit Fassung 2 (Stand d2d65aa) und Fassung 3. */
const GOLD_F2 = {
  pa_040: { verloren: 7.7, hash: '88a31078' },
  pa_120: { verloren: 55, hash: '497a7ad1' },
  pa_137: { verloren: 70, hash: 'fe7df532' },
};
const GOLD_F3 = {
  pa_040: { verloren: 9, hash: 'c338a8c3' },
  pa_120: { verloren: 48, hash: '9cde18cd' },
  pa_137: { verloren: 48, hash: '4634e8f6' },
};

test('Fassung 2 und 3: die drei geänderten Waffen wirken wie gemessen, Fassung 2 wie vor der Änderung', () => {
  for (const [id, gold] of Object.entries(GOLD_F2)) {
    const r = schussAufNachbarn(id, { waffen: WAFFEN_BALANCE });
    assert.equal(r.hash, gold.hash, `${id}: Zustandshash Fassung 2`);
    assert.ok(Math.abs(r.verloren - gold.verloren) < 0.1, `${id}: ${r.verloren}`);
  }
  for (const [id, gold] of Object.entries(GOLD_F3)) {
    const r = schussAufNachbarn(id, { waffen: WAFFEN_KORREKTUR });
    assert.equal(r.hash, gold.hash, `${id}: Zustandshash Fassung 3`);
    assert.ok(Math.abs(r.verloren - gold.verloren) < 0.1, `${id}: ${r.verloren}`);
  }
});

test('Fassung 3: Maschinenpistole über 0,5x Stufenmedian, Energiefaust/Flammenklinge unter 2x, Stufe/Reichweite/Abklingzeit gleich', () => {
  const m = messeWaffe(WEAPONS_BY_ID.pa_040, 40);
  assert.ok(m.schadenBest >= 0.5 * 17.5, `MP ${m.schadenBest}`);
  for (const id of ['pa_120', 'pa_137']) {
    const e = messeWaffe(WEAPONS_BY_ID[id], 40);
    assert.ok(e.schadenBest <= 2 * 24.3 && e.schadenBest > 1.8 * 24.3, `${id} ${e.schadenBest}`);
  }
  for (const [id, f2] of Object.entries(WAFFEN_F2_WERTE)) {
    const neu = WEAPONS_BY_ID[id];
    assert.notEqual(neu.damage, f2.damage);
    assert.equal(neu.damage, BALANCE_KORREKTUREN_3[id].damage);
    assert.equal(tierForScore(f2.powerScore), neu.powerTier, `${id}: Stufe bleibt`);
    const f2w = getWaffe(id, WAFFEN_BALANCE);
    for (const feld of ['cooldown', 'maxAmmo', 'powerTier', 'blastRadius']) assert.equal(f2w[feld], neu[feld], `${id}.${feld}`);
  }
  assert.ok(Object.keys(FESTE_ABLEITUNGEN_3).every(id => id in BALANCE_KORREKTUREN_3));
  assert.ok(WEAPONS_BY_ID.pa_040.damage > getWaffe('pa_040', WAFFEN_BALANCE).damage);
  assert.ok(WEAPONS_BY_ID.pa_120.damage < getWaffe('pa_120', WAFFEN_BALANCE).damage);
  assert.ok(WEAPONS_BY_ID.pa_137.damage < getWaffe('pa_137', WAFFEN_BALANCE).damage);
});

test('Replay-Kopf: Altdatei ohne `waffen` = Fassung 1, neue Aufzeichnung trägt Fassung 2, Rückspiel übernimmt sie', () => {
  const alt = {
    format: 1, createdAt: 0, seed: 4242,
    config: { teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, turnDurationMs: 30000, kit: 3, zerstoerung: 3 },
    totalTicks: 600, entries: [], rounds: [],
  };
  const recorder = ReplayRecorder.fromJSON(alt);
  assert.equal(recorder.config.waffen, WAFFEN_ALT);
  const { match } = playReplay(recorder);
  assert.equal(match.waffen, WAFFEN_ALT);
  assert.equal(match.kit, 3, 'Altkopf behält auch das Start-Kit der Zeit');

  const neu = new ReplayRecorder({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5 });
  assert.equal(neu.toJSON().config.waffen, WAFFEN_ZUENDER);
  assert.equal(neu.toJSON().config.kit, KIT_STANDARD);
  neu.finalize(300);
  const zurueck = ReplayRecorder.fromJSON(neu.serialize());
  assert.equal(zurueck.config.waffen, WAFFEN_ZUENDER);
  assert.equal(playReplay(zurueck).match.waffen, WAFFEN_ZUENDER);
});

test('Altkopf-Aufzeichnung mit Schüssen: Wiedergabe gleicht der Live-Partie in Fassung 1 und in Fassung 2', () => {
  for (const waffen of [WAFFEN_ALT, WAFFEN_BALANCE, WAFFEN_KORREKTUR, WAFFEN_FEIN]) {
    const live = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, kit: KIT_FLAECHE, waffen });
    const aufnahme = new ReplayRecorder({
      seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, kit: KIT_FLAECHE, waffen,
    });
    live.start();
    let schuesse = 0;
    for (let tick = 0; tick < 1500; tick++) {
      if (live.activeProjectileCount === 0 && tick % 120 === 0) {
        const winkel = 0.5 + (schuesse % 9) * 0.15;
        const kraft = 40 + (schuesse * 13) % 50;
        aufnahme.recordInput({ playerId: live.activePlayerId, angle: winkel, power: kraft, weaponId: null, tick: live.world.tickCount, type: 'fire' });
        live.fire(live.activePlayerId, winkel, kraft, null);
        schuesse += 1;
      }
      live.step();
      live.consumeEvents();
    }
    aufnahme.finalize(live.world.tickCount);
    const json = JSON.parse(aufnahme.serialize());
    if (waffen === WAFFEN_ALT) delete json.config.waffen;
    const { match } = playReplay(ReplayRecorder.fromJSON(json));
    assert.equal(match.waffen, waffen);
    assert.equal(match.stateHash(), live.stateHash(), `Fassung ${waffen}`);
  }
});

test('Start-Kit Fassung 4: zwei verschiedene schadenmachende Würfe statt wirkungsloser Strahlwaffe', () => {
  assert.equal(KIT_STANDARD, KIT_SCHARF);
  assert.equal(normalisiereKit(4), KIT_SCHARF);
  let strahlSelbstwirkung = 0;
  for (let seed = 1; seed <= 200; seed++) {
    for (let platz = 0; platz < 4; platz++) {
      const neu = getStartWaffen('scout', KIT_SCHARF, { seed, platz });
      const alt = getStartWaffen('scout', KIT_FLAECHE, { seed, platz });
      assert.equal(neu.length, 3, 'zwei Common + eine Flächenwaffe');
      assert.equal(neu[0], alt[0], 'der erste Wurf ist derselbe wie in Fassung 3');
      assert.equal(neu[2], alt[2], 'dieselbe Flächenwaffe');
      assert.notEqual(neu[0], neu[1]);
      for (const id of neu.slice(0, 2)) {
        const w = WEAPONS_BY_ID[id];
        assert.equal(w.powerTier, 'common');
        assert.equal(w.delivery, 'projectile');
        const effekt = buildEffect(w);
        assert.ok(!effekt || !SELF_TARGET_KINDS.has(effekt.kind), `${id} darf keine Selbstwirkung sein`);
        assert.ok(w.damage > 0 && w.cooldown === 0);
      }
      const effektAlt = buildEffect(WEAPONS_BY_ID[alt[1]]);
      if (effektAlt && SELF_TARGET_KINDS.has(effektAlt.kind)) strahlSelbstwirkung += 1;
      assert.deepEqual(getStartMunition(KIT_SCHARF, neu), getStartMunition(KIT_FLAECHE, neu), 'gleiche Munitionsgrenzen');
    }
  }
  assert.equal(strahlSelbstwirkung, 800, 'Beleg: der Strahlplatz der Fassung 3 war immer eine Selbstwirkung');
});

test('Start-Kit Fassung 3 bleibt unverändert (Altreplays)', () => {
  const kit = getStartWaffen('scout', KIT_FLAECHE, { seed: 4242, platz: 0 });
  assert.equal(kit.length, 3);
  assert.equal(WEAPONS_BY_ID[kit[1]].delivery, 'hitscan');
});

test('Balance-Werkzeug: Klassengesundheit wie im Motor, Messung deterministisch und Ausreißerregel', () => {
  assert.deepEqual(klassenGesundheit(), { scout: 96, heavy: 156, artillery: 108 });
  assert.ok(ENTFERNUNGEN.length >= 6 && ENTFERNUNGEN[0] <= 60 && ENTFERNUNGEN.at(-1) >= 1200);
  const a = messeWaffe(WEAPONS_BY_ID.pa_040, 40);
  const b = messeWaffe(WEAPONS_BY_ID.pa_040, 40);
  assert.deepEqual(a, b, 'gleiche Eingabe, gleiche Messung');
  assert.ok(a.schadenBest > 0 && a.reichweite > 0 && a.trefferquote > 0);
  assert.equal(a.stk.heavy >= a.stk.artillery && a.stk.artillery >= a.stk.scout, true, 'mehr Leben, mehr Schüsse');
  assert.equal(a.zuege.scout, a.stk.scout, 'ohne Abklingzeit sind Züge = Schüsse');

  const tafel = (stufe, schaden, extra = {}) => ({ id: `x${schaden}`, name: 'x', stufe, schadenBest: schaden, selbstwirkung: false, lunte: false, ...extra });
  const { stufen, liste } = findeAusreisser([
    tafel('common', 10), tafel('common', 12), tafel('common', 14), tafel('common', 3), tafel('common', 40),
    tafel('common', 99, { selbstwirkung: true }), tafel('common', 99, { lunte: true }),
  ]);
  assert.equal(stufen.common.medianSchaden, 12);
  assert.deepEqual(liste.map(e => [e.schadenBest, e.art]), [[3, 'zu schwach'], [40, 'zu stark']]);
  assert.ok(ZU_SCHWACH < 1 && ZU_STARK > 1);
  assert.deepEqual([...STUFEN], ['common', 'uncommon', 'rare', 'epic', 'legendary']);
});

test('Bot-Partie: deterministisch, endet, und das Start-Kit richtet Schaden an', () => {
  const a = spiele(7000, KIT_SCHARF, { teams: 2, proTeam: 1 });
  const b = spiele(7000, KIT_SCHARF, { teams: 2, proTeam: 1 });
  assert.deepEqual(a, b);
  assert.notEqual(a.ausgang, 'offen', 'Partie endet');
  assert.ok(a.schuesse > 0 && a.schaden > 0);
});

test('Fassung 4: die 20 Flugprofile machen Wurf- und Schusswaffen verschieden, Stufe/Schaden/Magazin bleiben', () => {
  const bahnen = new Set();
  for (const id of Object.keys(FLUGPROFILE_4)) {
    const neu = WEAPONS_BY_ID[id];
    const f3 = getWaffe(id, WAFFEN_KORREKTUR);
    for (const feld of ['damage', 'maxAmmo', 'powerTier', 'cooldown', 'delivery', 'blastRadius']) assert.equal(neu[feld], f3[feld], `${id}.${feld}`);
    assert.notDeepEqual([neu.projectileSpeed, neu.gravityScale, neu.bounces, neu.knockback], [f3.projectileSpeed, f3.gravityScale, f3.bounces, f3.knockback], id);
    bahnen.add([neu.projectileSpeed, neu.gravityScale, neu.bounces, neu.knockback].join('|'));
  }
  assert.equal(bahnen.size, Object.keys(FLUGPROFILE_4).length, 'jede Bahn ist einmalig');
});
