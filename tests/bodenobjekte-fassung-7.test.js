/**
 * Bodenobjektfassung 7 (TODO 2.5 QV-6-F): Biomobjekte für Fabrik, Dschungel, Pilzwald und Tempelstadt (`BIOMOBJEKTE_2`).
 *
 * Geprüft wird: Versionsmarke; welche Fassung welche Objekte kennt; jedes neue Objekt löst seine eigene Wirkung aus (Radius,
 * Schaden, Schadensart); im Match legen 5 und 6 in den neuen Biomen normale Fässer (bitgleich wie bisher), 7 die Biomobjekte.
 * Die Werte selbst sind erste Ansätze, nicht Gegenstand.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLE_BIOMOBJEKTE, BIOMOBJEKTE, BIOMOBJEKTE_2, BODENOBJEKTE_BIOM, BODENOBJEKTE_BIOM_2, BODENOBJEKTE_BREIT, BODENOBJEKTE_STANDARD,
  biomobjekteFuer, normalisiereBodenobjekte,
} from '../src/shared/config/bodenobjekte.js';
import { BodenobjektSystem, OBJEKT_TYP } from '../src/engine/systems/bodenobjektSystem.js';
import { MatchController } from '../src/engine/match.js';
import { SeededRandom } from '../src/shared/prng.js';
import { SEED_OFFSETS } from '../src/shared/seed.js';
import { damageTypeId } from '../src/engine/damageTypes.js';
import { zeichneBiomobjekt } from '../src/client/biomobjektBild.js';

test('Marke: 7 bleibt gültig (Standard 8, Portal); 5 und 6 bleiben gültig', () => {
  assert.equal(BODENOBJEKTE_BIOM_2, 7);
  assert.equal(BODENOBJEKTE_STANDARD, BODENOBJEKTE_BIOM_2 + 1, 'Standard ist 8 (bodenobjekte-portal.test.js)');
  assert.equal(normalisiereBodenobjekte(7), 7);
  assert.equal(normalisiereBodenobjekte(6), BODENOBJEKTE_BREIT);
});

test('Tabellen: vor 5 keine, 5 und 6 die drei alten, ab 7 alle sieben', () => {
  assert.deepEqual(Object.keys(biomobjekteFuer(4)), []);
  for (const f of [BODENOBJEKTE_BIOM, BODENOBJEKTE_BREIT]) assert.deepEqual(Object.keys(biomobjekteFuer(f)).sort(), ['eiswueste', 'schrott', 'vulkan']);
  assert.deepEqual(Object.keys(biomobjekteFuer(7)).sort(), ['dschungel', 'eiswueste', 'fabrik', 'pilzwald', 'schrott', 'tempelstadt', 'vulkan']);
  assert.deepEqual(Object.keys(BIOMOBJEKTE_2).sort(), ['dschungel', 'fabrik', 'pilzwald', 'tempelstadt']);
  for (const k of Object.keys(BIOMOBJEKTE)) assert.equal(ALLE_BIOMOBJEKTE[k], BIOMOBJEKTE[k], `${k} unverändert`);
});

/** Attrappe wie `baueAttrappe` in minen.test.js: flacher Boden bei y = 800, keine Figuren. */
function fassSystem(biom, biomobjekte) {
  const ereignisse = [];
  const welt = {
    services: { events: { emit: (typ, nutzlast) => ereignisse.push({ typ, ...nutzlast }) }, match: { knockbackMultiplier: 1 } },
    getEntitiesBySignature: () => [],
    isActive: () => true,
    getComponent: () => 0,
    setComponent: () => {},
    getSystem: () => null,
  };
  const system = new BodenobjektSystem({
    rng: new SeededRandom(1 + SEED_OFFSETS.BODENOBJEKTE), world: welt, events: welt.services.events, faesser: true, biom, biomobjekte,
    q: { breite: 2560, surfaceYAt: () => 800, bodenNahe: () => 800, waterLevelAt: () => 0, startplaetze: () => [] },
  });
  welt.services.bodenobjekte = system;
  return { system, ereignisse };
}

test('Die vier neuen Biomobjekte lösen ihre eigene Wirkung aus; mit der alten Tabelle bleiben es Fässer', () => {
  for (const [biom, p] of Object.entries(BIOMOBJEKTE_2)) {
    const { system, ereignisse } = fassSystem(biom, biomobjekteFuer(7));
    system.lege(320, 800, { typ: OBJEKT_TYP.FASS });
    assert.equal(system.snapshot()[0].biomobjekt, biom);
    system.explosionBei(320, 800, 10);
    system.update();
    const e = ereignisse.find(x => x.typ === 'explosion');
    assert.ok(e, `${biom}: Explosion`);
    assert.deepEqual([e.radius, e.damage, e.damageType], [p.radius, p.schaden, damageTypeId(p.schadensart)], biom);
    const alt = fassSystem(biom, biomobjekteFuer(6));
    alt.system.lege(320, 800, { typ: OBJEKT_TYP.FASS });
    assert.equal(alt.system.snapshot()[0].biomobjekt, undefined, `${biom}: Fassung 6 legt ein normales Fass`);
  }
});

test('Match: in der Fabrik legen 6 normale Fässer (wie bisher), 7 Druckkessel; derselbe Lauf ergibt denselben Hash', () => {
  const baue = fassung => {
    const m = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, biom: 'fabrik', bodenobjekte: fassung });
    m.start();
    return m;
  };
  const alt = baue(6);
  const faesserAlt = alt.getState().bodenobjekte.filter(o => o.typ === 'fass');
  assert.ok(faesserAlt.length > 0 && faesserAlt.every(o => !o.biomobjekt), 'Fassung 6: normale Fässer');
  const neu = baue(7);
  const faesserNeu = neu.getState().bodenobjekte.filter(o => o.typ === 'fass');
  assert.ok(faesserNeu.length > 0 && faesserNeu.every(o => o.biomobjekt === 'fabrik'), 'Fassung 7: Druckkessel');
  assert.equal(neu.stateHash(), baue(7).stateHash());
});

test('Bild: jedes Biomobjekt hat eine Zeichnung, unbekannte nicht', () => {
  const aufrufe = [];
  const ctx = new Proxy({}, { get: (_z, k) => (typeof k === 'string' && !['lineWidth', 'strokeStyle', 'fillStyle'].includes(k) ? () => aufrufe.push(k) : undefined), set: () => true });
  for (const biom of Object.keys(ALLE_BIOMOBJEKTE)) assert.equal(zeichneBiomobjekt(ctx, biom), true, biom);
  assert.equal(zeichneBiomobjekt(ctx, 'klassisch'), false);
  assert.ok(aufrufe.includes('fill') && aufrufe.includes('stroke'));
});
