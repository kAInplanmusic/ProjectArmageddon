import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LICHT_KLASSEN,
  KONTRAST_MIN,
  lichtKlasseFuer,
  lichtFuerKulisse,
  saettigungsFaktorAusMessung,
  kontrastVerhaeltnis,
  lesbarkeitsHinweis,
} from '../src/client/kulissenLicht.js';

/**
 * A19: Licht und Sättigung je Biom. Die sechs Referenzbiome müssen sich
 * unterscheiden, helle Kulissen stärker abdunkeln als dunkle, und vorhandene
 * Bilder unter dem Deckel unverändert bleiben.
 */

const KLASSEN = ['schnee', 'wald', 'wueste', 'lava', 'stadt', 'nacht', 'standard'];

test('Alle Lichtklassen sind vollständig und plausibel', () => {
  for (const name of KLASSEN) {
    const k = LICHT_KLASSEN[name];
    assert.ok(k, `${name} fehlt`);
    assert.equal(k.klasse, name);
    assert.ok(k.saettigungDeckel > 0 && k.saettigungDeckel <= 0.6, `${name}: Deckel außerhalb 0…0,6`);
    assert.ok(k.daempfung.start >= 0.2 && k.daempfung.start <= 0.5, `${name}: Startwert unplausibel`);
    assert.equal(k.daempfung.stops[0].offset, 0);
    assert.equal(k.daempfung.stops[0].alpha, 0, `${name}: oben darf nicht abgedunkelt werden`);
    assert.equal(k.daempfung.stops.at(-1).offset, 1);
    assert.ok(k.lichtVon.length > 3 && k.hinweis.length > 10);
  }
});

test('Standard reproduziert die bisherigen Werte (keine stille Verschlechterung)', () => {
  const k = LICHT_KLASSEN.standard;
  assert.equal(k.saettigungDeckel, 0.45);
  assert.deepEqual(k.daempfung.stops.map(s => s.alpha), [0, 0.28, 0.55]);
});

test('Schnee und Wüste dunkeln unten stärker ab als Wald, Nacht am wenigsten', () => {
  const unten = name => LICHT_KLASSEN[name].daempfung.stops.at(-1).alpha;
  assert.ok(unten('schnee') > unten('wald'));
  assert.ok(unten('wueste') > unten('wald'));
  assert.ok(unten('nacht') < unten('wald'));
});

test('Helle Kulissen bekommen den strengeren Sättigungsdeckel', () => {
  assert.ok(LICHT_KLASSEN.schnee.saettigungDeckel < LICHT_KLASSEN.standard.saettigungDeckel);
  assert.ok(LICHT_KLASSEN.wueste.saettigungDeckel < LICHT_KLASSEN.standard.saettigungDeckel);
  // Lava ist die Lichtquelle selbst und darf gesättigter bleiben.
  assert.ok(LICHT_KLASSEN.lava.saettigungDeckel > LICHT_KLASSEN.schnee.saettigungDeckel);
});

test('Zuordnung über Biom und Variantenname', () => {
  assert.equal(lichtKlasseFuer({ key: 'alpine/peaks', biomeId: 'alpine' }), 'schnee');
  assert.equal(lichtKlasseFuer({ key: 'forest/deep', biomeId: 'forest' }), 'wald');
  assert.equal(lichtKlasseFuer({ key: 'western/mesa', biomeId: 'western' }), 'wueste');
  assert.equal(lichtKlasseFuer({ key: 'urban/docks', biomeId: 'urban' }), 'stadt');
  assert.equal(lichtKlasseFuer({ key: 'noir/street', biomeId: 'noir' }), 'nacht');
  // Variantenname sticht vor Biom: Lavaröhre in der Höhlenwelt.
  assert.equal(lichtKlasseFuer({ key: 'caverns/lava_tube', biomeId: 'caverns' }), 'lava');
  assert.equal(lichtKlasseFuer({ key: 'maritime/arctic_ice', biomeId: 'maritime' }), 'schnee');
  assert.equal(lichtKlasseFuer({ key: 'maritime/storm_night', biomeId: 'maritime' }), 'nacht');
  // Eine dunkle Stimmung macht aus einem Wald keine Nacht.
  assert.equal(lichtKlasseFuer({ key: 'forest/stimmung_dunkel', biomeId: 'forest' }), 'wald');
  assert.equal(lichtKlasseFuer({ key: 'abstract/psychedelic', biomeId: 'abstract' }), 'standard');
  assert.equal(lichtFuerKulisse({ key: 'unbekannt/x', biomeId: 'unbekannt' }), LICHT_KLASSEN.standard);
});

test('Sättigungsfaktor: unter dem Deckel unverändert, darüber genau auf den Deckel', () => {
  assert.equal(saettigungsFaktorAusMessung(0.3, 0.45), 1);
  assert.equal(saettigungsFaktorAusMessung(0.45, 0.45), 1);
  assert.ok(Math.abs(saettigungsFaktorAusMessung(0.8, 0.4) - 0.5) < 1e-9);
  assert.equal(saettigungsFaktorAusMessung(0, 0.45), 1, 'unbekannte Messung ändert nichts');
  assert.equal(saettigungsFaktorAusMessung(NaN, 0.45), 1);
});

test('Kontrast der Spielfläche: heller Schnee braucht dunkle Figuren, Schwelle 3:1', () => {
  assert.equal(KONTRAST_MIN, 3);
  assert.ok(kontrastVerhaeltnis(1, 0) > 3);
  assert.ok(kontrastVerhaeltnis(0.9, 0.85) < 3);
  assert.equal(lesbarkeitsHinweis({ figur: 0.05, hintergrund: 0.85 }).ausreichend, true);
  assert.equal(lesbarkeitsHinweis({ figur: 0.7, hintergrund: 0.8 }).ausreichend, false);
  // Die Formel ist symmetrisch und nie null/negativ.
  assert.equal(kontrastVerhaeltnis(0.2, 0.6), kontrastVerhaeltnis(0.6, 0.2));
  assert.ok(kontrastVerhaeltnis(0, 0) >= 1);
});
