/**
 * Tests: Nahkampfwaffen wirken als Wurf.
 *
 * ## Der Befund, der zu dieser Datei führte
 *
 * Gemessen mit `npm run balance`: **21 der 150 Waffen hatten Schadenswerte
 * (20–52), aber keine Wirkung.** Alle `category: 'melee'`, alle mit
 * `projectileSpeed: 0` UND `blastRadius: 0`. Der Motor kennt keine
 * Nahkampfmechanik — die Waffe war ausrüstbar und abfeuerbar, aber es geschah
 * nichts.
 *
 * ## Was hier geprüft wird
 *
 *  1. Die Wurf-Ableitung greift genau bei den wirkungslosen Einträgen — und
 *     NICHT bei Einträgen, die schon eigene Werte haben.
 *  2. Die Wurfstärke hängt am `knockback`: Eine schwere Waffe fliegt kürzer.
 *  3. Die Reichweiten UNTERSCHEIDEN sich — das war der zweite Fehler (alle
 *     Würfe wurden auf denselben Faktor geklemmt).
 *  4. Die Würfe bleiben kurz (eine Wurfwaffe ist kein Fernkampf).
 *  5. Alles ist rein und deterministisch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  meleeThrowFor, brauchtWurf, speedFactorFor,
} from '../scripts/build-weapon-catalog.mjs';
import { WEAPONS } from '../src/shared/config/weapons.js';

/** Alle Nahkampfwaffen des Katalogs. */
const MELEE = WEAPONS.filter(w => w.category === 'melee');

test('Der Befund ist behoben: Keine Nahkampfwaffe ist mehr wirkungslos', () => {
  /*
   * Die Kernprüfung. Vorher hatten alle 21 `projectileSpeed: 0` UND
   * `blastRadius: 0` — sie konnten auf keine Weise treffen.
   */
  assert.ok(MELEE.length >= 20, 'Vorbedingung: es gibt Nahkampfwaffen');

  const wirkungslos = MELEE.filter(w => !w.projectileSpeed && !w.blastRadius);
  assert.deepEqual(wirkungslos.map(w => w.displayName), [],
    'diese Nahkampfwaffen können weiterhin nicht treffen');
});

test('Die Wurf-Ableitung greift genau bei den wirkungslosen Einträgen', () => {
  // Die Bedingung ist bewusst eng: melee UND kein Projektil UND kein Blast.
  assert.equal(brauchtWurf({ category: 'melee', projectileSpeed: 0, blastRadius: 0 }), true);
  assert.equal(brauchtWurf({ category: 'melee' }), true, 'fehlende Felder zählen als 0');

  // Einträge MIT eigenen Werten werden NICHT überschrieben — die Daten haben
  // Vorrang vor der Ableitung.
  assert.equal(brauchtWurf({ category: 'melee', projectileSpeed: 40, blastRadius: 0 }), false,
    'eine melee-Waffe mit eigenem Projektil darf nicht überschrieben werden');
  assert.equal(brauchtWurf({ category: 'melee', projectileSpeed: 0, blastRadius: 20 }), false,
    'eine melee-Waffe mit Flächenwirkung darf nicht überschrieben werden');

  // Und andere Kategorien sind nicht betroffen.
  assert.equal(brauchtWurf({ category: 'ranged', projectileSpeed: 0, blastRadius: 0 }), false);
  assert.equal(brauchtWurf({ category: 'magic', projectileSpeed: 0, blastRadius: 0 }), false);
  assert.equal(brauchtWurf(null), false);
  assert.equal(brauchtWurf(undefined), false);
});

test('Die Wurfstärke hängt am knockback', () => {
  /*
   * `knockback` ist der einzige vorhandene Ausdruck für die WUCHT einer Waffe
   * (30 bis 82 in den Daten). Eine schwere Waffe wird langsamer geworfen — der
   * Wurf ist DECKEND, nicht steigernd.
   */
  const leicht = meleeThrowFor({ knockback: 30 });
  const mittel = meleeThrowFor({ knockback: 56 });
  const schwer = meleeThrowFor({ knockback: 82 });

  assert.ok(schwer.projectileSpeed < mittel.projectileSpeed,
    'die schwerste Waffe muss langsamer fliegen als die mittlere');
  assert.ok(mittel.projectileSpeed < leicht.projectileSpeed,
    'die mittlere muss langsamer fliegen als die leichteste');

  // Der Normalfall ist der Bezug: Eine durchschnittliche Waffe fliegt
  // unverändert (Faktor 1) — es wird kein Wert erfunden.
  assert.equal(mittel.projectileSpeed, 34);
});

test('Fehlender knockback fällt auf den Mittelwert zurück', () => {
  // Toleranz: Ein Eintrag ohne Wucht wird wie eine durchschnittliche Waffe
  // behandelt, statt eine Ausnahme zu werfen.
  for (const unsinn of [undefined, null, NaN, 'viel']) {
    const t = meleeThrowFor({ knockback: unsinn });
    assert.equal(t.projectileSpeed, 34, `knockback=${String(unsinn)}`);
  }
});

test('Der Wurf bleibt kurz — er ist kein Fernkampf', () => {
  /*
   * Die Leitentscheidung: Ein Katana, das über die halbe Karte fliegt, wäre
   * kein Nahkampf mehr, sondern ein besserer Speer. Die Reichweite hält den
   * Widerspruch zwischen Physik („geworfen") und Name („geschlagen") klein.
   *
   * Die Karte ist 1280 px breit; ein Wurf muss deutlich darunter bleiben.
   */
  for (const w of MELEE) {
    assert.ok(w.maxRange < 260,
      `${w.displayName}: Wurfweite ${Math.round(w.maxRange)} px ist zu weit für eine Wurfwaffe`);
    assert.ok(w.maxRange > 60,
      `${w.displayName}: Wurfweite ${Math.round(w.maxRange)} px ist zu kurz zum Spielen`);
  }
});

test('Die Reichweiten UNTERSCHEIDEN sich — kein Klemmwert', () => {
  /*
   * Der ZWEITE Fehler, der beim Bauen auffiel: `speedFactorFor` klemmte auf 0,6
   * als Untergrenze. Die Wurfgeschwindigkeiten (27–41) liegen darunter, also
   * wurden ALLE Würfe auf denselben Faktor geklemmt — gemessen ergaben der
   * Baseballschläger (27,2) und die Schaufel (40,8) identische Werte, und die
   * ganze Differenzierung über `knockback` ging verloren.
   *
   * Vorher: alle 21 Würfe 191 px. Jetzt müssen es mehrere sein.
   */
  const weiten = new Set(MELEE.map(w => Math.round(w.maxRange)));
  assert.ok(weiten.size >= 5,
    `nur ${weiten.size} verschiedene Wurfweiten — die Klemme ist zurück?`);

  // Und die Ordnung stimmt: Wuchtiger = kürzer.
  const nachWucht = [...MELEE].sort((a, b) => a.knockback - b.knockback);
  const erste = nachWucht[0], letzte = nachWucht[nachWucht.length - 1];
  assert.ok(letzte.maxRange <= erste.maxRange,
    'die wuchtigste Waffe darf nicht weiter fliegen als die leichteste');
});

test('speedFactorFor lässt Würfe durch, klemmt aber Ausreißer', () => {
  /*
   * Die Untergrenze hängt an der Kategorie: Ein Wurf darf langsamer sein als
   * ein Geschoss, sonst fiele die ganze Klasse unter den Tisch. Deshalb muss
   * `category: 'melee'` mitgegeben werden — ohne sie gilt die Geschoss-Grenze.
   */
  assert.equal(speedFactorFor({ projectileSpeed: 27.2, category: 'melee' }), 0.3886);
  assert.equal(speedFactorFor({ projectileSpeed: 40.8, category: 'melee' }), 0.5829);

  // Die Grenzen greifen weiterhin, in beide Richtungen.
  assert.equal(speedFactorFor({ projectileSpeed: 5, category: 'melee' }), 0.3,
    'Untergrenze für Würfe ist 0,3');
  assert.equal(speedFactorFor({ projectileSpeed: 5, category: 'ranged' }), 0.6,
    'Untergrenze für Geschosse bleibt 0,6');
  assert.equal(speedFactorFor({ projectileSpeed: 500 }), 1.6, 'Obergrenze 1,6');
  assert.equal(speedFactorFor({ projectileSpeed: 0 }), 1, 'ohne Wert gilt Normaltempo');
  assert.equal(speedFactorFor({}), 1);
});

test('Der Wurf steht VOR dem Geschwindigkeitsfaktor', () => {
  /*
   * DIE Reihenfolge-Prüfung. `speedFactor` wird aus `projectileSpeed` gebildet —
   * steht die Wurf-Ableitung danach, ist `projectileSpeed` noch 0, der Faktor
   * wird 1 (Normaltempo) und die Waffe fliegt mit 70 statt mit 27.
   *
   * Dieser Fehler war real: Der Baseballschläger galt als 850 px weit statt als
   * 110, und ein Balance-Test deckte ihn auf. Ohne diese Prüfung wäre er
   * stillschweigend zurückgekehrt, sobald jemand die Zeilen umsortiert.
   */
  for (const w of MELEE) {
    const erwartet = speedFactorFor(w);
    assert.equal(w.speedFactor, erwartet,
      `${w.displayName}: speedFactor ist ${w.speedFactor}, erwartet ${erwartet} `
      + '(steht die Wurf-Ableitung hinter speedFactorFor?)');
    assert.ok(w.speedFactor < 0.7,
      `${w.displayName}: speedFactor ${w.speedFactor} ist kein Wurftempo — `
      + 'vermutlich wurde projectileSpeed erst nach dem Faktor gesetzt');
  }
});

test('Der Wurf ist rein und deterministisch', () => {
  // Zweimal dieselbe Waffe, zweimal dasselbe Ergebnis — sonst wäre der Katalog
  // bei jedem Bau anders und Replays wären nicht reproduzierbar.
  const waffe = { category: 'melee', knockback: 45, projectileSpeed: 0, blastRadius: 0 };
  assert.deepEqual(meleeThrowFor(waffe), meleeThrowFor(waffe));
  assert.equal(brauchtWurf(waffe), brauchtWurf({ ...waffe }));
});

test('Alle Nahkampfwaffen fliegen als Projektil', () => {
  /*
   * Der Zustellweg muss mitziehen: Ohne `delivery: 'projectile'` bliebe die
   * Waffe als `instant` eingestuft und der Motor würde sie weiterhin nicht als
   * Projektil behandeln — die Werte wären gesetzt und trotzdem wirkungslos.
   */
  for (const w of MELEE) {
    assert.equal(w.delivery, 'projectile',
      `${w.displayName}: Zustellweg ist "${w.delivery}" statt "projectile"`);
  }
});

test('Kein Schaden der Nahkampfwaffen ist verloren gegangen', () => {
  // Die Schadenswerte standen schon in den Daten (20–52) und dürfen durch die
  // Ableitung nicht überschrieben werden — sie sind der Grund, warum die
  // Waffen spielbar sind.
  for (const w of MELEE) {
    assert.ok(w.damage > 0, `${w.displayName}: Schaden ist ${w.damage}`);
    assert.ok(w.damage <= 60, `${w.displayName}: Schaden ${w.damage} ist unplausibel hoch`);
  }
});
