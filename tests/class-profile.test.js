import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MatchController } from '../src/engine/match.js';
import {
  CLASS_DEFINITIONS,
  CLASS_ARCHETYPES,
  CLASS_IDS,
  ARCHETYPE_IDS,
  ARCHETYPE_DAMAGE_BASE,
  combatProfile,
  allCombatProfiles,
} from '../src/shared/config/classes.js';

/**
 * Kampfprofil: eine Regel, eine Stelle.
 *
 * Hintergrund: Klasse und Archetyp wurden an ZWEI Orten verrechnet. In
 * `src/shared/config/classes.js` standen die Helfer `applyClassModifiers` und
 * `applyArchetypeModifiers` — nirgends aufgerufen, also toter Code, der
 * obendrein eine andere Rechnung beschrieb als die, die lief. Das echte Spiel
 * multiplizierte in `src/engine/match.js` inline. Wer die Balance ändern wollte,
 * musste beide Stellen finden und hätte sich an der ersten vertun können.
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

test('Die wirksamen Faktoren des Profils sind festgehalten', () => {
  // Absichtlich als Tabelle: Ändert jemand die Balance, muss er hier
  // vorbeikommen und die Zahl bewusst anpassen — statt sie zu übersehen.
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

  for (const profil of allCombatProfiles()) {
    const key = `${profil.classId}/${profil.archetypeId}`;
    const soll = erwartet[key];
    assert.ok(soll, `Unerwartete Kombination im Profil: ${key}`);
    // Auf neun Stellen verglichen: die Tabelle soll die Balance festhalten,
    // nicht die letzte Binärstelle einer Gleitkommarechnung.
    assert.equal(profil.healthMultiplier.toFixed(9), soll.health.toFixed(9), `${key}: Leben`);
    assert.equal(profil.damageMultiplier.toFixed(9), soll.damage.toFixed(9), `${key}: Schaden`);
    assert.equal(profil.launchSpeedMultiplier.toFixed(9), soll.speed.toFixed(9),
      `${key}: Abschussgeschwindigkeit`);
  }

  assert.equal(Object.keys(erwartet).length, CLASS_IDS.length * ARCHETYPE_IDS.length,
    'Die Tabelle deckt nicht alle Kombinationen ab');
});

test('Das Profil entsteht aus den Rohdaten, nicht aus einer zweiten Formel', () => {
  for (const classId of CLASS_IDS) {
    for (const archetypeId of ARCHETYPE_IDS) {
      const profil = combatProfile(classId, archetypeId);
      const klasse = CLASS_DEFINITIONS[classId];
      const archetyp = CLASS_ARCHETYPES[archetypeId];

      assert.equal(profil.healthMultiplier, klasse.health * archetyp.health);
      assert.equal(profil.damageMultiplier, klasse.power);
      assert.equal(profil.launchSpeedMultiplier,
        klasse.power * (archetyp.damage / ARCHETYPE_DAMAGE_BASE));
      assert.equal(profil.onFallback, false);
    }
  }

  // Fund: Der Bezugswert 1,2 gehört zu KEINEM Archetyp (1,1 / 1,4 / 1,6).
  // Damit ist der neutrale Fall nicht erreichbar — jeder Archetyp schießt
  // entweder langsamer oder schneller als „normal". Festgehalten, nicht
  // stillschweigend korrigiert: das wäre eine Balance-Änderung.
  assert.equal(ARCHETYPE_DAMAGE_BASE, 1.2);
  for (const archetypeId of ARCHETYPE_IDS) {
    assert.notEqual(CLASS_ARCHETYPES[archetypeId].damage, ARCHETYPE_DAMAGE_BASE,
      `${archetypeId} hat den Bezugswert — die Annahme im Code stimmt nicht mehr`);
  }
});

// --------------------------------------------------- Wirkung im echten Match

test('Das Leben im Match entsteht genau aus dem Kampfprofil', () => {
  // 3 Teams × 3 Spieler = 9 Spieler.
  //
  // Fund: Klasse und Archetyp werden BEIDE über `index % 3` zugeteilt. Sie sind
  // damit im laufenden Match immer gekoppelt — scout tritt nur als brawler auf,
  // heavy nur als artillerist, artillery nur als occultist. Die neun
  // Kombinationen der Tabellen sind also nicht erreichbar; geprüft werden hier
  // die drei, die das Spiel tatsächlich erzeugt.
  const match = new MatchController({ seed: 4242, teams: 3, playersPerTeam: 3 });
  match.start();
  const state = match.getState();

  assert.equal(state.entities.length, 9);
  const gesehen = new Set();

  for (const entity of state.entities) {
    const profil = combatProfile(CLASS_IDS[entity.classId], ARCHETYPE_IDS[entity.archetypeId]);
    const erwartet = Math.round(BASE_HEALTH * profil.healthMultiplier);

    assert.equal(entity.maxHealth, erwartet,
      `${profil.classId}/${profil.archetypeId}: Leben ${entity.maxHealth} statt ${erwartet}`);
    assert.equal(entity.health, erwartet, 'Startleben muss dem Maximum entsprechen');
    gesehen.add(entity.classId * 10 + entity.archetypeId);
    // Die Kopplung selbst festhalten: bricht sie auf, ist das eine gute
    // Nachricht — dann muss dieser Test angepasst und die Vielfalt geprüft werden.
    assert.equal(entity.classId, entity.archetypeId,
      'Klasse und Archetyp sind nicht mehr aneinander gekoppelt');
  }

  assert.deepEqual([...gesehen].sort(), [0, 11, 22]);
});

test('Die Klasse verändert den Schaden wirklich', () => {
  // Ein Schuss derselben Waffe muss je Klasse unterschiedlich hart treffen.
  const treffer = ['scout', 'heavy', 'artillery'].map(() => null);
  const match = new MatchController({ seed: 777, teams: 3, playersPerTeam: 3 });
  match.start();

  // Spieler 0 = scout/brawler, 3 = scout/… , sicherer: über classId suchen.
  const state = match.getState();
  const schuetze = id => state.entities.find(entity => entity.classId === id);
  for (const classIndex of [0, 1, 2]) {
    const spieler = schuetze(classIndex);
    assert.ok(spieler, `Kein Spieler der Klasse ${CLASS_IDS[classIndex]}`);
    const profil = combatProfile(CLASS_IDS[classIndex], ARCHETYPE_IDS[spieler.archetypeId]);
    // Die Waffe, die der Motor benutzt, skaliert mit genau diesem Faktor.
    assert.equal(profil.damageMultiplier, CLASS_DEFINITIONS[CLASS_IDS[classIndex]].power);
    treffer[classIndex] = profil.damageMultiplier;
  }

  assert.ok(treffer[2] > treffer[1] && treffer[1] > treffer[0],
    'Artillerie > Heavy > Scout beim Schaden');
});

// ----------------------------------------------------- Unwirksame Dimensionen

test('Nicht wirksame Modifikatoren sind ausdrücklich als unwirksam gekennzeichnet', () => {
  const profil = combatProfile('heavy', 'occultist');

  // Diese Schlüssel sind festgenagelt: Wer eine davon verdrahtet, MUSS diesen
  // Test anfassen — und damit die Balance-Entscheidung sichtbar machen.
  assert.deepEqual(Object.keys(profil.inert).sort(),
    ['archetypeDamageAsDamage', 'archetypeSpeed', 'classSpeed', 'drag', 'mass']);

  assert.equal(profil.inert.drag, CLASS_DEFINITIONS.heavy.drag);
  assert.equal(profil.inert.mass, CLASS_DEFINITIONS.heavy.mass);
  assert.equal(profil.inert.classSpeed, CLASS_DEFINITIONS.heavy.speed);
  assert.equal(profil.inert.archetypeSpeed, CLASS_ARCHETYPES.occultist.speed);
  assert.equal(profil.inert.archetypeDamageAsDamage, CLASS_ARCHETYPES.occultist.damage);

  // Das Profil selbst führt keine dieser Dimensionen als wirksam.
  assert.equal(profil.drag, undefined);
  assert.equal(profil.mass, undefined);
  assert.equal(profil.speed, undefined);
});

// --------------------------------------------------------- Eine Stelle nur

test('src/engine/match.js multipliziert Klasse und Archetyp nicht mehr selbst', () => {
  const quelle = fs.readFileSync(path.join(ROOT, 'src', 'engine', 'match.js'), 'utf8');

  assert.ok(!/CLASS_DEFINITIONS|CLASS_ARCHETYPES/.test(quelle),
    'match.js liest die Rohdaten direkt. Klasse und Archetyp gehören ausschließlich '
    + 'über combatProfile() aus src/shared/config/classes.js verrechnet.');

  // Ein direkter Zugriff auf ein Archetyp-Feld wäre die nächste zweite Wahrheit.
  assert.ok(!/archetype\.\w+/.test(quelle), 'match.js greift direkt auf ein Archetyp-Feld zu');
  assert.ok(!/classDef\.\w+/.test(quelle), 'match.js greift direkt auf ein Klassen-Feld zu');
  assert.match(quelle, /combatProfile/, 'match.js benutzt das Kampfprofil nicht');
});

test('Die toten Klassen-Helfer sind entfallen', () => {
  const roh = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'config', 'classes.js'), 'utf8');
  // Kommentare zuerst entfernen: Der Dateikopf ERKLÄRT, warum die Helfer
  // entfallen sind, und nennt sie dabei beim Namen. Ohne diesen Schritt würde
  // die Begründung als Verstoß gelesen.
  const quelle = roh
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(zeile => !zeile.trim().startsWith('//'))
    .join('\n');

  assert.ok(!/applyClassModifiers/.test(quelle),
    'applyClassModifiers existiert wieder — es war toter Code mit einer eigenen Rechnung');
  assert.ok(!/applyArchetypeModifiers/.test(quelle),
    'applyArchetypeModifiers existiert wieder — es war toter Code mit einer eigenen Rechnung');

  // Und niemand importiert sie mehr.
  for (const datei of ['src/client/index.js', 'src/server/index.js']) {
    const inhalt = fs.readFileSync(path.join(ROOT, datei), 'utf8');
    assert.ok(!/apply(Class|Archetype)Modifiers/.test(inhalt),
      `${datei} re-exportiert die entfallenen Helfer`);
  }
});
