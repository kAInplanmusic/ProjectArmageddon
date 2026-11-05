import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MatchController } from '../src/engine/match.js';
import {
  CLASS_DEFINITIONS,
  LEGACY_CLASS_DEFINITIONS,
  CLASS_ARCHETYPES,
  CLASS_IDS,
  LEGACY_CLASS_IDS,
  ARCHETYPE_IDS,
  ARCHETYPE_LAUNCH_BASE,
  combatProfile,
  allCombatProfiles,
} from '../src/shared/config/classes.js';
import { KLASSEN_ALT, KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';

/**
 * Kampfprofil: eine Regel, eine Stelle.
 *
 * Seit Klassenfassung 3 (`docs/anforderungen-2026-11-05.md` §6) gibt es drei
 * Klassen ohne Archetypen. Die Fassungen 1 und 2 behalten Klasse × Archetyp
 * unverändert — beide Rechnungen stehen in `combatProfile()`, keine zweite
 * Formel im Motor.
 *
 * Diese Datei sichert drei Dinge ab:
 *   1. die wirksamen Faktoren (Zahlen festgehalten, nicht nur die Struktur),
 *   2. dass das Leben im echten Match daraus entsteht,
 *   3. dass die Rohdaten nirgends mehr direkt multipliziert werden.
 */

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
const BASE_HEALTH = 100;

// ------------------------------------------------------- Wirksame Faktoren

test('Fassung 3: Die wirksamen Faktoren der drei Klassen sind festgehalten', () => {
  // Absichtlich als Tabelle: Ändert jemand die Balance, muss er hier
  // vorbeikommen und die Zahl bewusst anpassen — statt sie zu übersehen.
  const erwartet = {
    nahkampf: { health: 1.3, damage: 0.75, speed: 0.75, mobility: 1.2 },
    fernkampf: { health: 1.0, damage: 1.0, speed: 1.0, mobility: 1.0 },
    okkultist: { health: 0.7, damage: 1.25, speed: 1.25, mobility: 0.8 },
  };

  for (const profil of allCombatProfiles(KLASSEN_STANDARD)) {
    const soll = erwartet[profil.classId];
    assert.ok(soll, `Unerwartete Klasse im Profil: ${profil.classId}`);
    assert.equal(profil.archetypeId, null, `${profil.classId}: Archetyp muss neutral sein`);
    assert.equal(profil.healthMultiplier.toFixed(9), soll.health.toFixed(9), `${profil.classId}: Leben`);
    assert.equal(profil.damageMultiplier.toFixed(9), soll.damage.toFixed(9), `${profil.classId}: Schaden`);
    assert.equal(profil.launchSpeedMultiplier.toFixed(9), soll.speed.toFixed(9),
      `${profil.classId}: Abschussgeschwindigkeit`);
    assert.equal(profil.mobilityMultiplier.toFixed(9), soll.mobility.toFixed(9),
      `${profil.classId}: Beweglichkeit`);
  }

  assert.equal(Object.keys(erwartet).length, CLASS_IDS.length,
    'Die Tabelle deckt nicht alle Klassen ab');
  assert.equal(allCombatProfiles(KLASSEN_STANDARD).length, 3,
    'Fassung 3 hat genau drei Profile — keine Archetyp-Kombinationen');
});

test('Fassungen 1 und 2: Die alten neun Kombinationen bleiben bitgleich', () => {
  /*
   * Die Goldwerte standen vor dem Umbau in dieser Datei. Sie sind der Beleg,
   * dass `combatProfile()` für Altreplays unverändert rechnet.
   */
  const erwartet = {
    'scout/brawler': { health: 0.96, damage: 0.7, speed: 0.641666667 },
    'scout/artillerist': { health: 0.64, damage: 0.7, speed: 0.816666667 },
    'scout/occultist': { health: 0.56, damage: 0.7, speed: 0.933333333 },
    'heavy/brawler': { health: 1.56, damage: 1, speed: 0.916666667 },
    'heavy/artillerist': { health: 1.04, damage: 1, speed: 1.166666667 },
    'heavy/occultist': { health: 0.91, damage: 1, speed: 1.333333333 },
    'artillery/brawler': { health: 1.08, damage: 1.3, speed: 1.191666667 },
    'artillery/artillerist': { health: 0.72, damage: 1.3, speed: 1.516666667 },
    'artillery/occultist': { health: 0.63, damage: 1.3, speed: 1.733333333 },
  };

  for (const profil of allCombatProfiles(KLASSEN_ALT)) {
    const key = `${profil.classId}/${profil.archetypeId}`;
    const soll = erwartet[key];
    assert.ok(soll, `Unerwartete Kombination im Profil: ${key}`);
    assert.equal(profil.healthMultiplier.toFixed(9), soll.health.toFixed(9), `${key}: Leben`);
    assert.equal(profil.damageMultiplier.toFixed(9), soll.damage.toFixed(9), `${key}: Schaden`);
    assert.equal(profil.launchSpeedMultiplier.toFixed(9), soll.speed.toFixed(9),
      `${key}: Abschussgeschwindigkeit`);
  }

  assert.equal(Object.keys(erwartet).length, LEGACY_CLASS_IDS.length * ARCHETYPE_IDS.length,
    'Die Tabelle deckt nicht alle Kombinationen ab');
});

test('Das Profil entsteht aus den Rohdaten, nicht aus einer zweiten Formel', () => {
  // Fassung 3: Klasse pur, Archetyp neutral (Faktor 1,0).
  for (const classId of CLASS_IDS) {
    const profil = combatProfile(classId, 'occultist', null, KLASSEN_STANDARD);
    const klasse = CLASS_DEFINITIONS[classId];

    assert.equal(profil.healthMultiplier, klasse.health);
    assert.equal(profil.damageMultiplier, klasse.power);
    assert.equal(profil.launchSpeedMultiplier, klasse.power,
      'Der Archetyp darf in Fassung 3 keinen Tempo-Faktor beitragen');
    assert.equal(profil.archetypeId, null);
    assert.equal(profil.onFallback, false);
  }

  // Fassungen 1 und 2: unveränderte Verkettung Klasse × Archetyp.
  for (const classId of LEGACY_CLASS_IDS) {
    for (const archetypeId of ARCHETYPE_IDS) {
      const profil = combatProfile(classId, archetypeId);
      const klasse = LEGACY_CLASS_DEFINITIONS[classId];
      const archetyp = CLASS_ARCHETYPES[archetypeId];

      assert.equal(profil.healthMultiplier, klasse.health * archetyp.health);
      assert.equal(profil.damageMultiplier, klasse.power);
      assert.equal(profil.launchSpeedMultiplier,
        klasse.power * (archetyp.launch / ARCHETYPE_LAUNCH_BASE));
      assert.equal(profil.onFallback, false);
    }
  }

  assert.equal(ARCHETYPE_LAUNCH_BASE, 1.2,
    'Der Bezugswert der Altreplays ist verrutscht');
  for (const archetypeId of ARCHETYPE_IDS) {
    assert.notEqual(CLASS_ARCHETYPES[archetypeId].launch, ARCHETYPE_LAUNCH_BASE,
      `${archetypeId} hat den Bezugswert — die Annahme im Code stimmt nicht mehr`);
  }
});

test('Fassung 3: Ein übergebener Archetyp ist wirkungslos', () => {
  /*
   * Die Kernregel des Umbaus: Es gibt keine Archetypen mehr. Wer aus einer
   * alten Konfiguration noch eine Kennung mitschickt, bekommt dasselbe Profil —
   * keine stille zweite Balance.
   */
  for (const classId of CLASS_IDS) {
    const ohne = combatProfile(classId, null, null, KLASSEN_STANDARD);
    for (const archetypeId of ARCHETYPE_IDS) {
      const mit = combatProfile(classId, archetypeId, null, KLASSEN_STANDARD);
      assert.deepEqual(mit, ohne,
        `${classId}/${archetypeId}: Archetyp verändert das Profil in Fassung 3`);
    }
  }
});

// --------------------------------------------------- Wirkung im echten Match

test('Das Leben im Match entsteht genau aus dem Kampfprofil', () => {
  // 3 Teams × 3 Spieler = 9 Spieler, Klassenfassung 3 (Standard neuer Partien).
  const match = new MatchController({
    seed: 4242, teams: 3, playersPerTeam: 3, klassen: KLASSEN_STANDARD,
  });
  match.start();
  const state = match.getState();

  assert.equal(state.entities.length, 9);
  const gesehen = new Set();

  for (const entity of state.entities) {
    const klasse = CLASS_IDS[entity.classId];
    const profil = combatProfile(klasse, null, null, KLASSEN_STANDARD);
    const erwartet = Math.round(BASE_HEALTH * profil.healthMultiplier);

    assert.equal(entity.maxHealth, erwartet,
      `${klasse}: Leben ${entity.maxHealth} statt ${erwartet}`);
    assert.equal(entity.health, erwartet, 'Startleben muss dem Maximum entsprechen');
    assert.equal(entity.archetypeId, 0, 'Fassung 3 führt keinen Archetyp');
    assert.ok(entity.platz >= 0 && entity.platz <= 2, 'Platz muss 0..2 sein');
    gesehen.add(klasse);
  }

  assert.deepEqual([...gesehen].sort(), [...CLASS_IDS].sort());
});

test('Die Klasse verändert den Schaden wirklich', () => {
  // Ein Schuss derselben Waffe muss je Klasse unterschiedlich hart treffen.
  const match = new MatchController({
    seed: 777, teams: 3, playersPerTeam: 3, klassen: KLASSEN_STANDARD,
  });
  match.start();

  const state = match.getState();
  const werte = {};
  for (const classIndex of [0, 1, 2]) {
    const spieler = state.entities.find(entity => entity.classId === classIndex);
    assert.ok(spieler, `Kein Spieler der Klasse ${CLASS_IDS[classIndex]}`);
    const profil = combatProfile(CLASS_IDS[classIndex], null, null, KLASSEN_STANDARD);
    assert.equal(profil.damageMultiplier, CLASS_DEFINITIONS[CLASS_IDS[classIndex]].power);
    werte[CLASS_IDS[classIndex]] = profil.damageMultiplier;
  }

  assert.ok(werte.okkultist > werte.fernkampf && werte.fernkampf > werte.nahkampf,
    'Okkultist > Fernkampf > Nahkampf beim Schaden');
});

// ----------------------------------------------------- Unwirksame Dimensionen

test('Nicht wirksame Modifikatoren sind ausdrücklich als unwirksam gekennzeichnet', () => {
  // Fassung 3: nur noch drag/mass sind deklariert, aber unwirksam.
  const neu = combatProfile('nahkampf', null, null, KLASSEN_STANDARD);
  assert.deepEqual(Object.keys(neu.inert).sort(), ['drag', 'mass']);
  assert.equal(neu.inert.drag, CLASS_DEFINITIONS.nahkampf.drag);
  assert.equal(neu.inert.mass, CLASS_DEFINITIONS.nahkampf.mass);
  assert.equal(neu.drag, undefined);
  assert.equal(neu.mass, undefined);

  // Fassungen ≤ 2 behalten die Archetyp-Dimensionen als ausdrücklich inert.
  const alt = combatProfile('heavy', 'occultist');
  assert.deepEqual(Object.keys(alt.inert).sort(),
    ['archetypeLaunchAsDamage', 'archetypeSpeed', 'classSpeed', 'drag', 'mass']);
  assert.equal(alt.inert.archetypeSpeed, CLASS_ARCHETYPES.occultist.speed);
  assert.equal(alt.inert.archetypeLaunchAsDamage, CLASS_ARCHETYPES.occultist.launch);
});

// --------------------------------------------------------- Eine Stelle nur

test('src/engine/match.js multipliziert Klasse und Archetyp nicht mehr selbst', () => {
  const roh = fs.readFileSync(path.join(ROOT, 'src', 'engine', 'match.js'), 'utf8');

  /*
   * Kommentare zuerst entfernen: Der Code ERKLÄRT an mehreren Stellen, warum er
   * die Rohdaten NICHT liest, und nennt sie dabei beim Namen. Ohne diesen
   * Schritt würde die Begründung als Verstoß gelesen.
   */
  const quelle = roh
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(zeile => !zeile.trim().startsWith('//'))
    .join('\n');

  assert.ok(!/CLASS_DEFINITIONS|CLASS_ARCHETYPES/.test(quelle),
    'match.js liest die Rohdaten direkt. Klasse (und Archetyp in Altreplays) '
    + 'gehören ausschließlich über combatProfile() aus src/shared/config/classes.js verrechnet.');

  assert.ok(!/archetype\.\w+/.test(quelle), 'match.js greift direkt auf ein Archetyp-Feld zu');
  assert.ok(!/classDef\.\w+/.test(quelle), 'match.js greift direkt auf ein Klassen-Feld zu');
  assert.match(quelle, /combatProfile/, 'match.js benutzt das Kampfprofil nicht');
});

test('Die toten Klassen-Helfer sind entfallen', () => {
  const roh = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'config', 'classes.js'), 'utf8');
  const quelle = roh
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(zeile => !zeile.trim().startsWith('//'))
    .join('\n');

  assert.ok(!/applyClassModifiers/.test(quelle),
    'applyClassModifiers existiert wieder — es war toter Code mit einer eigenen Rechnung');
  assert.ok(!/applyArchetypeModifiers/.test(quelle),
    'applyArchetypeModifiers existiert wieder — es war toter Code mit einer eigenen Rechnung');

  for (const datei of ['src/client/index.js', 'src/server/index.js']) {
    const inhalt = fs.readFileSync(path.join(ROOT, datei), 'utf8');
    assert.ok(!/apply(Class|Archetype)Modifiers/.test(inhalt),
      `${datei} re-exportiert die entfallenen Helfer`);
  }
});
