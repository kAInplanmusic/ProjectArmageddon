/**
 * QV-6, Welle 1, Baustein A: Strömung in Düne, Riff und Tiefsee (`config/biomregeln.js`).
 *
 * Geprüft wird: Versionsmarke (alt bleibt bitgleich), Wertebereich, Richtung aus dem Seed, gleiche Zahl gezogener
 * Zufallswerte, Anbindung in Replay-Kopf und Hinweiszeile. Die Stärke der Anteile ist nicht Gegenstand (erste Ansätze).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOMREGELN_ALT, BIOMREGELN_STROEMUNG, BIOMREGELN_SCHWERKRAFT, BIOMREGELN_STANDARD, BIOM_STROEMUNG, normalisiereBiomregeln, stroemungFuer, verschiebeWind,
} from '../src/shared/config/biomregeln.js';
import { MAX_WIND } from '../src/shared/config/wind.js';
import { neuesMatch } from '../scripts/bot-partien.mjs';
import { biomregelText } from '../src/client/biomregelAnzeige.js';
import { ReplayRecorder } from '../src/engine/replay.js';
import { MatchController } from '../src/engine/match.js';
import { MENUE_FASSUNGEN } from '../src/shared/config/menueStart.js';

const NEAR = (a, b, eps = 1.5e-4) => Math.abs(a - b) <= eps;

test('Fassungen: Standard ist die neueste (6), unbekannte Werte fallen auf den Standard, ALT bleibt ALT', () => {
  assert.equal(BIOMREGELN_STANDARD, 6);
  assert.equal(normalisiereBiomregeln(1), BIOMREGELN_ALT);
  assert.equal(normalisiereBiomregeln(2), BIOMREGELN_STROEMUNG);
  assert.equal(normalisiereBiomregeln(3), BIOMREGELN_SCHWERKRAFT);
  assert.equal(normalisiereBiomregeln(4), 4);
  assert.equal(normalisiereBiomregeln(5), 5);
  assert.equal(normalisiereBiomregeln(6), 6);
  assert.equal(normalisiereBiomregeln(undefined), BIOMREGELN_STANDARD);
  assert.equal(normalisiereBiomregeln(99), BIOMREGELN_STANDARD);
});

test('stroemungFuer: nur Düne, Riff, Tiefsee mit Fassung 2; Richtung aus der Seed-Parität', () => {
  assert.deepEqual(Object.keys(BIOM_STROEMUNG).sort(), ['duenen', 'riff', 'tiefsee']);
  assert.equal(stroemungFuer('duenen', BIOMREGELN_ALT, 4, MAX_WIND), null, 'Fassung 1: keine Regel');
  assert.equal(stroemungFuer('vulkan', BIOMREGELN_STROEMUNG, 4, MAX_WIND), null, 'anderes Biom: keine Regel');
  assert.equal(stroemungFuer(null, BIOMREGELN_STROEMUNG, 4, MAX_WIND), null);
  const gerade = stroemungFuer('duenen', BIOMREGELN_STROEMUNG, 4, MAX_WIND);
  const ungerade = stroemungFuer('duenen', BIOMREGELN_STROEMUNG, 5, MAX_WIND);
  assert.equal(gerade.richtung, 1);
  assert.equal(ungerade.richtung, -1);
  assert.ok(NEAR(gerade.drift, 0.5 * MAX_WIND, 1e-12));
  assert.ok(NEAR(ungerade.drift, -0.5 * MAX_WIND, 1e-12));
});

test('verschiebeWind: bleibt im Bereich ±MAX_WIND und liegt einseitig (Anteil 0,5 → 0 bis MAX_WIND)', () => {
  for (const drift of [0.5 * MAX_WIND, -0.5 * MAX_WIND, 0.35 * MAX_WIND]) {
    for (let i = 0; i <= 200; i += 1) {
      const roh = -MAX_WIND + (2 * MAX_WIND * i) / 200;
      const w = verschiebeWind(roh, drift, MAX_WIND);
      assert.ok(w <= MAX_WIND + 1e-12 && w >= -MAX_WIND - 1e-12, `${drift}/${roh} → ${w} außerhalb`);
    }
  }
  assert.ok(NEAR(verschiebeWind(-MAX_WIND, 0.5 * MAX_WIND, MAX_WIND), 0, 1e-12), 'untere Grenze bei Anteil 0,5 ist 0');
  assert.ok(NEAR(verschiebeWind(MAX_WIND, 0.5 * MAX_WIND, MAX_WIND), MAX_WIND, 1e-12));
});

function windAmStart(seed, biom, biomregeln) {
  const m = neuesMatch(seed, 4, { teams: 2, proTeam: 1, extra: { biom, ...(biomregeln === undefined ? {} : { biomregeln }) } });
  m.start();
  return { wind: m.getState().wind, stroemung: m.stroemung, fassung: m.biomregeln };
}

test('Engine: ohne Angabe gilt ALT (Replay-Kompatibilität), Wind unverändert gegenüber ausdrücklich ALT', () => {
  const direkt = (seed, extra = {}) => {
    const m = new MatchController({ seed, teams: 2, playersPerTeam: 1, preset: 'hills', kartentyp: 'autonom', biom: 'duenen', ...extra });
    m.start();
    return m;
  };
  for (const seed of [101, 102, 103]) {
    const ohne = direkt(seed);
    const alt = direkt(seed, { biomregeln: BIOMREGELN_ALT });
    assert.equal(ohne.biomregeln, BIOMREGELN_ALT);
    assert.equal(ohne.stroemung, null);
    assert.equal(ohne.getState().wind, alt.getState().wind);
  }
});

test('Menü und Messwerkzeug starten mit dem Standard; MENUE_FASSUNGEN enthält die Biomregel', () => {
  assert.equal(MENUE_FASSUNGEN.biomregeln, BIOMREGELN_STANDARD);
  assert.equal(neuesMatch(1, 4, { teams: 2, proTeam: 1 }).biomregeln, BIOMREGELN_STANDARD);
});

test('Engine: Fassung 2 in der Düne — Wind einseitig, Richtung folgt dem Seed, gleicher Wurf wie ALT', () => {
  let negativeAlt = 0;
  for (let seed = 200; seed < 232; seed += 1) {
    const alt = windAmStart(seed, 'duenen', BIOMREGELN_ALT);
    const neu = windAmStart(seed, 'duenen', BIOMREGELN_STROEMUNG);
    assert.ok(neu.stroemung, `Seed ${seed}: Strömung fehlt`);
    const richtung = neu.stroemung.richtung;
    assert.equal(richtung, seed % 2 === 0 ? 1 : -1);
    assert.ok(neu.wind * richtung >= -1e-9, `Seed ${seed}: Wind ${neu.wind} gegen die Strömungsrichtung`);
    assert.ok(Math.abs(neu.wind) <= MAX_WIND + 1e-9);
    // Derselbe gewürfelte Wert: neu = verschiebe(alt) bis auf die Rundung auf 4 Stellen.
    const erwartet = verschiebeWind(alt.wind, neu.stroemung.drift, MAX_WIND);
    assert.ok(NEAR(neu.wind, erwartet), `Seed ${seed}: ${neu.wind} ≠ ${erwartet}`);
    if (alt.wind < 0) negativeAlt += 1;
  }
  assert.ok(negativeAlt > 0, 'ALT-Wind ist beidseitig, sonst ist der Test nicht aussagekräftig');
});

test('Engine: Biome ohne Regel behalten ihren Wind auch mit Fassung 2', () => {
  for (const biom of ['vulkan', 'kosmos', 'klassisch']) {
    for (const seed of [301, 302, 303]) {
      assert.equal(windAmStart(seed, biom, BIOMREGELN_STROEMUNG).wind, windAmStart(seed, biom, BIOMREGELN_ALT).wind, `${biom}/${seed}`);
    }
  }
});

test('Replay-Kopf: Fassung wird geschrieben; eine Datei ohne das Feld ist ALT', () => {
  const rec = new ReplayRecorder({ seed: 1, teams: 2, playersPerTeam: 1, preset: 'hills', biomregeln: BIOMREGELN_STROEMUNG });
  assert.equal(rec.toJSON().config.biomregeln, BIOMREGELN_STROEMUNG);
  const alt = new ReplayRecorder({ seed: 1, teams: 2, playersPerTeam: 1, preset: 'hills' });
  assert.equal(alt.toJSON().config.biomregeln, BIOMREGELN_ALT);
});

test('Hinweiszeile: nur in Biomen mit Regel, mit Name und Richtung; keine bei ALT', () => {
  const t = biomregelText({ biom: 'tiefsee', biomregeln: 2, seed: 8 });
  assert.match(t, /^Tiefseestrom: .*rechts/);
  assert.match(biomregelText({ biom: 'riff', biomregeln: 2, seed: 7 }), /links/);
  assert.equal(biomregelText({ biom: 'tiefsee', biomregeln: 1, seed: 8 }), null);
  assert.equal(biomregelText({ biom: 'vulkan', biomregeln: 2, seed: 8 }), null);
  assert.equal(biomregelText({}), null);
});
