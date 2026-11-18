/**
 * QV-6, Welle 2: Wasserlauf (`config/biomregeln.js`, Fassung 5; `engine/waterField.js` `stepAktiv`).
 *
 * Geprüft wird: Menge bleibt erhalten, ein ruhendes Feld schläft, die Fließrichtung stimmt, `step()` bleibt Bit für Bit
 * der alte, die Strömung schiebt Figuren nur mit Fassung 5, und im Match fließt Wasser nach einer Zerstörung nur ab
 * Fassung 5. Die Stärke des Schubs ist nicht Gegenstand (erster Ansatz).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { neuesMatch } from '../scripts/bot-partien.mjs';
import { WaterField } from '../src/engine/waterField.js';
import { CharacterSystem } from '../src/engine/systems/characterSystem.js';
import {
  BIOMREGELN_WASSER, BIOMREGELN_WASSERLAUF, BIOMREGELN_STANDARD, WASSERLAUF, wasserlaufAktiv, normalisiereBiomregeln,
} from '../src/shared/config/biomregeln.js';
import { wasserregelText, meldeBiomregel, meldeWasserregel } from '../src/client/biomregelAnzeige.js';

/** Rinne: Boden unten (y = 9 fest), links ein Wasserturm, rechts offen. */
function rinne() {
  const w = new WaterField({ width: 40, height: 10, isSolid: (x, y) => y >= 9 });
  for (let y = 4; y < 9; y++) for (let x = 0; x < 4; x++) w.setLevel(x, y, 1);
  return w;
}

test('Fassungen: 5 ist der Standard; 1 bis 4 bleiben gültig', () => {
  assert.equal(BIOMREGELN_STANDARD, BIOMREGELN_WASSERLAUF);
  for (const f of [1, 2, 3, 4, 5]) assert.equal(normalisiereBiomregeln(f), f);
  assert.equal(wasserlaufAktiv(BIOMREGELN_WASSER), false);
  assert.equal(wasserlaufAktiv(BIOMREGELN_WASSERLAUF), true);
});

test('stepAktiv: schläft ohne Wecken; weckt man es, fließt das Wasser nach rechts und die Menge bleibt', () => {
  const w = rinne();
  const v0 = w.totalVolume();
  assert.equal(w.stepAktiv(), 0, 'ohne Wecken passiert nichts');
  w.wecke(8, 20, 30); // Weltmaßstab 1
  let summeFluss = 0;
  let schritte = 0;
  for (; schritte < 1000; schritte++) {
    const n = w.stepAktiv();
    for (let x = 0; x < 40; x++) summeFluss += w.flussAn(x, 7);
    if (n === 0) break;
  }
  assert.ok(Math.abs(w.totalVolume() - v0) < 0.02 * v0, `Menge ${w.totalVolume()} gegen ${v0} (der alte step() verliert ebenfalls Restwasser unter 0,001)`);
  assert.ok(summeFluss > 0, 'Fließrichtung nach rechts (+)');
  assert.ok(w.getLevel(12, 8) > 0.05, 'Wasser ist nach rechts geflossen');
  assert.ok(schritte < 1000, 'das Feld kommt zur Ruhe');
  assert.equal(w.stepAktiv(), 0);
});

test('stepAktiv mit Fenster über das ganze Feld rechnet wie step() (Abweichung nur durch Restwasser unter 0,001)', () => {
  const a = rinne(); const b = rinne();
  for (let i = 0; i < 30; i++) a.step();
  b.wecke(20, 5, 100);
  for (let i = 0; i < 30; i++) b.stepAktiv();
  let d = 0;
  for (let i = 0; i < a.levels.length; i++) d = Math.max(d, Math.abs(a.levels[i] - b.levels[i]));
  assert.ok(d < 0.01, `größte Abweichung ${d}`);
});

/** Ein CharacterSystem-Lauf: Figur im Wasser (Pegel 0,5, flach), Strömung `fluss`; liefert die Geschwindigkeit danach. */
function vxNachTick(fluss, schub) {
  let vx = 0;
  const system = new CharacterSystem();
  const world = {
    services: {
      terrain: { width: 400, height: 400, isSolid: () => false },
      water: { levelAtWorld: () => 0.5, getLevel: () => 0.5, flussAn: () => fluss },
      events: { emit() {} },
      match: schub === undefined ? {} : { wasserSchub: schub },
    },
    isActive: () => true,
    getSystem: () => ({ applyDamage() {} }),
    getComponent: (_id, komp, feld) => ({ Position: { x: 200, y: 200 }, Velocity: { x: 0, y: 0 } }[komp]?.[feld] ?? 0),
    setComponent: (_id, komp, feld, wert) => { if (komp === 'Velocity' && feld === 'x') vx = wert; },
  };
  system.update(world, [1], 1000 / 60);
  return vx;
}

test('CharacterSystem: die Strömung schiebt nur mit Schub; flaches Wasser (0,5) verletzt nicht', () => {
  assert.equal(vxNachTick(0.4, undefined), 0, 'Altstand: kein Schub');
  assert.equal(vxNachTick(0.4, 0), 0);
  assert.ok(vxNachTick(0.4, WASSERLAUF.schub) > 0.1, 'nach rechts');
  assert.ok(vxNachTick(-0.4, WASSERLAUF.schub) < -0.1, 'nach links');
});

function matchMit(biomregeln) {
  const m = neuesMatch(20261111, 4, { teams: 2, proTeam: 1, extra: { biom: 'klassisch', biomregeln, format: '24:9', groesse: 'gross' } });
  if (m.status !== 'playing') m.start();
  return m;
}

test('Match: Wasser fließt nach einer Zerstörung nur ab Fassung 5 nach, die Menge bleibt', () => {
  const ergebnis = {};
  for (const f of [BIOMREGELN_WASSER, BIOMREGELN_WASSERLAUF]) {
    const m = matchMit(f);
    const wasser = m.world.services.water;
    const v0 = wasser.totalVolume();
    let ziel = null;
    for (let i = 0; i < wasser.levels.length && !ziel; i++) {
      if (wasser.levels[i] > 0.9) ziel = { x: (i % wasser.width) * wasser.worldScale, y: Math.floor(i / wasser.width) * wasser.worldScale };
    }
    assert.ok(ziel, 'Testaufbau: es gibt Wasser');
    // Wie eine Explosion: Krater, Wasser verdrängen, Zerstörung melden.
    // Wie `engine/explosion.js`: Krater, dann das Wasser im Radius verdrängen (das weckt das Feld).
    m.world.services.terrain.punchCrater(ziel.x, ziel.y - 20, 60);
    wasser.displace(ziel.x, ziel.y - 20, 60, 0.65);
    const vorher = Array.from(wasser.levels);
    for (let i = 0; i < 240; i++) m.step();
    const nachher = Array.from(wasser.levels);
    ergebnis[f] = { verschoben: nachher.some((w, i) => Math.abs(w - vorher[i]) > 0.01), menge: Math.abs(wasser.totalVolume() - v0) / v0 };
  }
  assert.equal(ergebnis[BIOMREGELN_WASSER].verschoben, false, 'Fassung 4: Wasser steht still');
  assert.equal(ergebnis[BIOMREGELN_WASSERLAUF].verschoben, true, 'Fassung 5: Wasser fließt');
  assert.ok(ergebnis[BIOMREGELN_WASSERLAUF].menge < 0.05, 'Menge bleibt (bis auf Restwasser) erhalten');
});

test('Hinweiszeile: Wasserlauf wird ab Fassung 5 gemeldet', () => {
  const zeilen = [];
  const hud = { log: (t) => zeilen.push(t) };
  meldeBiomregel(hud, { biom: 'klassisch', biomregeln: 5, seed: 1 });
  meldeWasserregel(hud, 'deep_sea');
  assert.ok(zeilen.some((z) => /^Wasserlauf:/.test(z)));
  const alt = [];
  meldeBiomregel({ log: (t) => alt.push(t) }, { biom: 'klassisch', biomregeln: 4, seed: 1 });
  meldeWasserregel({ log: (t) => alt.push(t) }, 'deep_sea');
  assert.equal(alt.length, 0);
  assert.equal(wasserregelText('deep_sea', 5), null);
});
