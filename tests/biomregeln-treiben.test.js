/**
 * QV-6, Welle 2: Treiben (`config/biomregeln.js`, Fassung 6): Kisten und Bodenobjekte im Wasser wandern mit der Strömung.
 *
 * Geprüft wird: Fassungsmarke, die reine Wegstrecke (`treibweg`), Kisten (`LootSystem`), Minen und Fässer
 * (`BodenobjektSystem`) mit Strömung, ohne Wasser und ohne Fassung 6, und die Hinweiszeile.
 * Die Stärke des Treibens ist nicht Gegenstand (erster Ansatz).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOMREGELN_STANDARD, BIOMREGELN_TREIBEN, TREIBEN, treibenAktiv, treibweg, normalisiereBiomregeln,
} from '../src/shared/config/biomregeln.js';
import { LootSystem } from '../src/engine/systems/lootSystem.js';
import { BodenobjektSystem, OBJEKT_TYP } from '../src/engine/systems/bodenobjektSystem.js';
import { meldeBiomregel, meldeWasserregel } from '../src/client/biomregelAnzeige.js';

const dienste = ({ treiben = true, level = 1, fluss = 0.4, fest = false } = {}) => ({
  match: { wasserTreiben: treiben },
  water: { levelAtWorld: () => level, flussAn: () => fluss },
  terrain: { isSolid: () => fest },
});

test('Fassungen: 6 bleibt gültig, der Standard (7, Sturzflut) enthält das Treiben; 1 bis 5 bleiben gültig', () => {
  assert.ok(BIOMREGELN_STANDARD > BIOMREGELN_TREIBEN);
  for (const f of [1, 2, 3, 4, 5, 6]) assert.equal(normalisiereBiomregeln(f), f);
  assert.equal(treibenAktiv(5), false);
  assert.equal(treibenAktiv(6), true);
  assert.equal(treibenAktiv(BIOMREGELN_STANDARD), true);
});

test('treibweg: Strömung mal Faktor im Wasser; 0 ohne Regel, ohne Wasser, bei Gegenströmung null und an festem Boden', () => {
  assert.ok(Math.abs(treibweg(dienste(), 100, 100, 3) - 1.2) < 1e-9);
  assert.ok(treibweg(dienste({ fluss: -0.4 }), 100, 100, 3) < 0, 'nach links');
  assert.equal(treibweg(dienste({ treiben: false }), 100, 100, 3), 0, 'Regel aus');
  assert.equal(treibweg(dienste({ level: TREIBEN.schwelle - 0.01 }), 100, 100, 3), 0, 'zu flach');
  assert.equal(treibweg(dienste({ fest: true }), 100, 100, 3), 0, 'fester Boden');
  assert.equal(treibweg(dienste({ fluss: 0 }), 100, 100, 3), 0);
  assert.equal(treibweg({}, 100, 100, 3), 0, 'ohne Wasserfeld');
});

function lootWelt(dienst, x = 200) {
  const komponenten = { Position: { x, y: 300 }, Crate: { picked: 0, inFlight: 0, crateType: 0, weaponId: 0 } };
  return {
    services: dienst,
    komponenten,
    isActive: () => true,
    getSystem: () => null,
    getEntitiesBySignature: () => [],
    getComponent: (_id, komp, feld) => komponenten[komp]?.[feld],
    setComponent: (_id, komp, feld, wert) => { komponenten[komp][feld] = wert; },
  };
}

test('Kiste: liegt sie im Wasser, wandert sie mit der Strömung; ohne Fassung 6 bleibt sie liegen', () => {
  const sys = new LootSystem({ rng: { next: () => 0.5 } });
  const mit = lootWelt(dienste());
  for (let i = 0; i < 10; i++) sys.update(mit, [1], 1000 / 60);
  assert.ok(mit.komponenten.Position.x > 200 + 5, `Kiste ${mit.komponenten.Position.x}`);
  const ohne = lootWelt(dienste({ treiben: false }));
  for (let i = 0; i < 10; i++) sys.update(ohne, [1], 1000 / 60);
  assert.equal(ohne.komponenten.Position.x, 200);
  const trocken = lootWelt(dienste({ level: 0 }));
  for (let i = 0; i < 10; i++) sys.update(trocken, [1], 1000 / 60);
  assert.equal(trocken.komponenten.Position.x, 200);
});

function bodenSystem(dienst) {
  const world = { services: dienst, tickCount: 0, getEntitiesBySignature: () => [], isActive: () => false, getComponent: () => 0 };
  const events = { emit() {} };
  const q = { breite: 4000, surfaceYAt: () => 300, bodenNahe: () => true, waterLevelAt: () => 1, startplaetze: () => [] };
  return new BodenobjektSystem({ rng: { next: () => 0.5 }, world, events, q, faesser: true });
}

test('Mine und Fass: liegende Objekte im Wasser treiben seitlich; ohne Fassung 6 oder ohne Wasser bleiben sie', () => {
  for (const typ of [OBJEKT_TYP.MINE, OBJEKT_TYP.FASS]) {
    const mit = bodenSystem(dienste());
    mit.lege(500, 300, { typ });
    for (let i = 0; i < 20; i++) mit.update();
    assert.ok(mit.snapshot()[0].x > 500 + 10, `${typ}: ${mit.snapshot()[0].x}`);
    assert.equal(mit.snapshot()[0].y, 300, 'treibt nur seitlich');
    const ohne = bodenSystem(dienste({ treiben: false }));
    ohne.lege(500, 300, { typ });
    for (let i = 0; i < 20; i++) ohne.update();
    assert.equal(ohne.snapshot()[0].x, 500);
    const trocken = bodenSystem(dienste({ level: 0 }));
    trocken.lege(500, 300, { typ });
    for (let i = 0; i < 20; i++) trocken.update();
    assert.equal(trocken.snapshot()[0].x, 500);
  }
});

test('Hinweiszeile: Treibgut wird ab Fassung 6 gemeldet, nicht davor', () => {
  const sechs = []; const fuenf = [];
  meldeBiomregel({ log: (t) => sechs.push(t) }, { biom: 'klassisch', biomregeln: 6, seed: 1 });
  meldeWasserregel({ log: (t) => sechs.push(t) }, 'deep_sea');
  assert.ok(sechs.some((z) => /^Treibgut:/.test(z)));
  meldeBiomregel({ log: (t) => fuenf.push(t) }, { biom: 'klassisch', biomregeln: 5, seed: 1 });
  meldeWasserregel({ log: (t) => fuenf.push(t) }, 'deep_sea');
  assert.ok(!fuenf.some((z) => /^Treibgut:/.test(z)));
});
