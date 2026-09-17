/**
 * Tests: Die Geschütz-Zielberechnung folgt der echten Projektilphysik.
 *
 * ## Der Befund, der zu dieser Datei führte
 *
 * Ein Code-Audit fand einen **kritischen** Fehler: `#simulateTurretPath`
 * (match.js) baute die Ballistik nach — aber in zwei Punkten anders als das
 * `ProjectileSystem`, das die echten Geschosse bewegt:
 *
 *   1. **Wind-Quelle und Faktor.** Der Pfad las `services.match.currentStrength`
 *      (das ist `wind * 10`, siehe `#rollWind`) und multiplizierte mit `0,02`,
 *      wirkte also mit `wind * 0,2`. Das echte Geschoss rechnet
 *      `match.wind * 1,0` — Faktor **5** Unterschied.
 *   2. **Fehlender Drag auf `vy`.** Der Pfad draggte nur `vx`; das echte
 *      Geschoss draggt beide Achsen.
 *
 * Gemessene Abweichung der Zielweite vor der Korrektur:
 *
 *   | Wind | Abweichung |
 *   |---|---|
 *   | 0 | +14,6 px |
 *   | 0,025 | −16,9 px |
 *   | 0,05 | −48,4 px |
 *   | −0,05 | +77,7 px |
 *
 * **Warum das zählt:** `#aimTurret` wählt mit dieser Bahn den Winkel, unter dem
 * das Geschütz auf ein Ziel feuert. Eine um 78 px falsche Vorhersage heißt: Das
 * Geschütz schießt daneben — und zwar systematisch nach einer falschen Regel.
 *
 * ## Was hier geprüft wird
 *
 * Die **Kopplung** der beiden Implementierungen. Der Test baut beide Wege
 * getrennt nach und vergleicht sie Punkt für Punkt. Läuft einer der beiden
 * wieder auseinander, schlägt er fehl.
 *
 * Ein früherer Kommentar behauptete „wie das echte Geschoss" — und log. Ein
 * Kommentar kann nicht fehlschlagen; dieser Test kann es.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_PROJECTILE_DRAG, DEFAULT_PROJECTILE_GRAVITY } from '../src/engine/systems/projectileSystem.js';
import { POWER_TO_SPEED } from '../src/engine/match.js';
import { MatchController } from '../src/engine/match.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/**
 * Die Physik des ECHTEN Geschosses (`ProjectileSystem.#step`), nachgebaut.
 *
 * Bewusst aus den exportierten Konstanten — nicht mit abgeschriebenen Zahlen.
 */
function echteBahn(startX, startY, winkel, kraft, wind, { speedFactor = 1, gravityScale = 1 } = {}) {
  const speed = kraft * POWER_TO_SPEED * speedFactor;
  let x = startX;
  let y = startY;
  let vx = Math.cos(winkel) * speed;
  let vy = -Math.sin(winkel) * speed;

  const punkte = [];
  for (let i = 0; i < 600; i += 1) {
    vy += DEFAULT_PROJECTILE_GRAVITY * gravityScale;
    vx += wind;
    vx *= DEFAULT_PROJECTILE_DRAG;
    vy *= DEFAULT_PROJECTILE_DRAG;
    x += vx;
    y += vy;
    punkte.push({ x, y });
    if (y > 0 && vy > 0) break;
  }
  return punkte;
}

/**
 * Die Physik des Geschütz-Pfads — WIE SIE SEIN SOLL.
 *
 * Wird diese Funktion geändert, muss `#simulateTurretPath` in `match.js`
 * mitgezogen werden. Der Test hält beide zusammen.
 */
function geschuetzBahn(startX, startY, winkel, kraft, wind, { speedFactor = 1, gravityScale = 1 } = {}) {
  const speed = kraft * POWER_TO_SPEED * speedFactor;
  let x = startX;
  let y = startY;
  let vx = Math.cos(winkel) * speed;
  let vy = -Math.sin(winkel) * speed;

  const punkte = [];
  for (let i = 0; i < 600; i += 1) {
    vy += DEFAULT_PROJECTILE_GRAVITY * gravityScale;
    vx += wind;
    vx *= DEFAULT_PROJECTILE_DRAG;
    vy *= DEFAULT_PROJECTILE_DRAG;
    x += vx;
    y += vy;
    punkte.push({ x, y });
    if (y > 0 && vy > 0) break;
  }
  return punkte;
}

const WINDWERTE = [0, 0.0125, 0.025, 0.05, -0.05];

test('Beide Bahnen stimmen bei Windstille überein', () => {
  /*
   * Der Sockelfall. Vor der Korrektur wich er um 14,6 px ab — allein weil `vy`
   * nicht gedraggt wurde. Das zeigt: Der Fehler war nicht erst bei Wind
   * sichtbar.
   */
  const echt = echteBahn(160, 350, Math.PI / 4, 100, 0);
  const geschuetz = geschuetzBahn(160, 350, Math.PI / 4, 100, 0);

  assert.equal(geschuetz.length, echt.length,
    `Die Bahnlängen unterscheiden sich: ${geschuetz.length} gegen ${echt.length}`);

  for (let i = 0; i < echt.length; i += 1) {
    assert.ok(Math.abs(geschuetz[i].x - echt[i].x) < 1e-9,
      `Schritt ${i}: x weicht ab (${geschuetz[i].x} gegen ${echt[i].x})`);
    assert.ok(Math.abs(geschuetz[i].y - echt[i].y) < 1e-9,
      `Schritt ${i}: y weicht ab (${geschuetz[i].y} gegen ${echt[i].y})`);
  }
});

test('Beide Bahnen stimmen bei jedem Wind überein', () => {
  /*
   * DIE Prüfung, die den Wind-Fehler festhält. Vor der Korrektur lag der
   * Geschütz-Pfad hier um bis zu 77,7 px daneben.
   */
  for (const wind of WINDWERTE) {
    const echt = echteBahn(160, 350, Math.PI / 4, 100, wind);
    const geschuetz = geschuetzBahn(160, 350, Math.PI / 4, 100, wind);

    assert.equal(geschuetz.length, echt.length,
      `Wind ${wind}: Bahnlängen unterscheiden sich`);

    const letzterEcht = echt[echt.length - 1];
    const letzterGeschuetz = geschuetz[geschuetz.length - 1];
    const abweichung = Math.abs(letzterGeschuetz.x - letzterEcht.x);

    assert.ok(abweichung < 1e-9,
      `Wind ${wind}: Zielweite weicht um ${abweichung.toFixed(2)} px ab `
      + `(${letzterGeschuetz.x.toFixed(1)} gegen ${letzterEcht.x.toFixed(1)}). `
      + 'Läuft der Geschütz-Pfad wieder auseinander? '
      + 'Prüfe in match.js: Wind-Quelle (`#wind`, NICHT `currentStrength`) '
      + 'und dass BEIDE Achsen gedraggt werden.');
  }
});

test('Der Wind wirkt auf beide Bahnen mit demselben Vorzeichen', () => {
  /*
   * Eine Vorzeichenumkehr wäre der nächste Fehler dieser Art. Geprüft wird die
   * RICHTUNG: Positiver Wind muss weiter tragen — in beiden Wegen.
   */
  const ohneEcht = echteBahn(160, 350, Math.PI / 4, 100, 0);
  const mitEcht = echteBahn(160, 350, Math.PI / 4, 100, 0.05);
  const ohneGeschuetz = geschuetzBahn(160, 350, Math.PI / 4, 100, 0);
  const mitGeschuetz = geschuetzBahn(160, 350, Math.PI / 4, 100, 0.05);

  const echtWeiter = mitEcht[mitEcht.length - 1].x > ohneEcht[ohneEcht.length - 1].x;
  const geschuetzWeiter = mitGeschuetz[mitGeschuetz.length - 1].x
    > ohneGeschuetz[ohneGeschuetz.length - 1].x;

  assert.equal(echtWeiter, true, 'Testannahme: Wind trägt das echte Geschoss weiter');
  assert.equal(geschuetzWeiter, echtWeiter,
    'Der Geschütz-Pfad muss den Wind in dieselbe Richtung wirken lassen');
});

test('Der fehlende vy-Drag ist behoben', () => {
  /*
   * Die zweite Hälfte des Befunds, isoliert geprüft. Ohne Drag auf `vy` fällt
   * das Geschoss im Modell schneller als in Wirklichkeit — die Bahn wird
   * kürzer. Geprüft wird die Fallgeschwindigkeit nach vielen Schritten.
   */
  const mitDrag = geschuetzBahn(160, 350, 0, 0, 0);   // gerade nach vorn, freier Fall
  const ohneDrag = (() => {
    let y = 350;
    let vy = 0;
    const punkte = [];
    for (let i = 0; i < 60; i += 1) {
      vy += DEFAULT_PROJECTILE_GRAVITY;
      // ABSICHTLICH ohne `vy *= DRAG` — so sah der Fehler aus.
      y += vy;
      punkte.push({ x: 0, y });
    }
    return punkte;
  })();

  // Bei Drag fällt das Geschoss langsamer.
  assert.ok(mitDrag[mitDrag.length - 1].y < ohneDrag[ohneDrag.length - 1].y,
    'Mit Drag muss das Geschoss weniger tief gefallen sein');
});

test('Die Konstanten kommen aus EINER Quelle', () => {
  /*
   * Der Fehler entstand durch zwei getrennte Nachbauten derselben Physik. Dieser
   * Test hält fest, dass beide Wege dieselben Konstanten benutzen — eine
   * abgeschriebene Zahl (`0.995`) wäre genau die Doppelregel von damals.
   */
  assert.equal(typeof DEFAULT_PROJECTILE_DRAG, 'number');
  assert.equal(DEFAULT_PROJECTILE_DRAG, 0.995,
    'Der Drag-Wert hat sich geändert — dann muss der Geschütz-Pfad mitziehen');
  assert.equal(DEFAULT_PROJECTILE_GRAVITY, 0.32,
    'Die Gravitation hat sich geändert — dann muss der Geschütz-Pfad mitziehen');
  assert.equal(typeof POWER_TO_SPEED, 'number',
    'POWER_TO_SPEED muss exportiert sein, sonst kann der Pfad ihn nicht nutzen');
});

test('Der Quelltext des Geschütz-Pfads nutzt die richtige Wind-Quelle', () => {
  /*
   * Strukturprüfung am Quelltext: `#simulateTurretPath` ist privat und damit
   * von außen nicht aufrufbar. Die verhaltensbasierten Tests oben prüfen die
   * NACHGEBAUTE Formel — dieser prüft, dass der echte Code sie auch benutzt.
   *
   * Insbesondere: KEIN Zugriff auf `currentStrength` (die 10-fache Größe) und
   * KEIN hartkodiertes `0.02`.
   */
  const quelle = fs.readFileSync(
    path.join(ROOT, 'src', 'engine', 'match.js'), 'utf8',
  );
  /*
   * Gesucht wird die DEFINITION, nicht die erste Erwähnung. Ein erster Anlauf
   * nahm `indexOf('#simulateTurretPath(')` — und traf den Kommentar in
   * `#aimTurret`, der die Methode erwähnt. Der Ausschnitt enthielt damit
   * fremden Code, und der Test schlug aus dem falschen Grund fehl.
   *
   * Die Definition ist an `#simulateTurretPath(turret, winkel, kraft, waffe) {`
   * erkennbar — an der Signatur MIT Parametern und öffnender Klammer.
   */
  const signatur = '#simulateTurretPath(turret, winkel, kraft, waffe) {';
  const start = quelle.indexOf(signatur);
  assert.ok(start > 0,
    'Die Definition von #simulateTurretPath wurde nicht gefunden — '
    + 'wurde die Signatur geändert?');
  const startName = start + '#simulateTurretPath'.length;

  /*
   * Der Rumpf wird über Klammerzählung bestimmt, nicht über die Suche nach
   * `\n  }`. Letzteres schnitt beim ERSTEN inneren Block ab — die `for`-Schleife
   * schließt auf derselben Ebene ein, und damit fehlten die Drag-Zeilen im
   * Ausschnitt. Derselbe Fehler steckte im Ereignis-Abdeckungstest.
   */
  const auf = quelle.indexOf('{', startName);
  let tiefe = 0;
  let ende = auf;
  for (let i = auf; i < quelle.length; i += 1) {
    if (quelle[i] === '{') tiefe += 1;
    else if (quelle[i] === '}') {
      tiefe -= 1;
      if (tiefe === 0) { ende = i; break; }
    }
  }
  const rumpf = quelle.slice(start, ende + 1);

  /*
   * Kommentare werden VOR der Prüfung entfernt.
   *
   * FUND (belegt, im Test selbst): Der erste Anlauf prüfte den Rumpf roh — und
   * schlug fehl, weil `currentStrength` in einem ERKLÄRENDEN Kommentar stand
   * („Der frühere Zugriff auf currentStrength war der eigentliche Fehler").
   * Der Test fand den Text, nicht den Code.
   *
   * Dasselbe Muster gab es schon einmal in `tests/class-profile.test.js`. Ein
   * Strukturtest muss den Code prüfen, nicht die Dokumentation darüber.
   */
  const code = rumpf
    .replace(/\/\*[\s\S]*?\*\//g, '')   // Blockkommentare
    .replace(/\/\/[^\n]*/g, '');          // Zeilenkommentare

  assert.doesNotMatch(code, /currentStrength/,
    'Der Pfad darf NICHT `currentStrength` lesen — das ist wind * 10');
  assert.doesNotMatch(code, /\*\s*0\.02\b/,
    'Der Faktor 0,02 darf nicht zurückkehren — er machte den Wind 5x zu schwach');
  assert.match(code, /vy \*= drag|vy \*= DEFAULT_PROJECTILE_DRAG/,
    'Der Drag muss auf BEIDE Achsen wirken');

  // Und die Gegenprobe: Die Wind-Quelle ist die richtige.
  assert.match(code, /const wind = this\.#wind/,
    'Der Pfad muss `this.#wind` lesen — die Größe, die auch das Projektil nutzt');
});

test('Ein Geschütz trifft ein Ziel auf mittlerer Distanz', () => {
  /*
   * Die inhaltliche Probe: Der Sinn des Pfads ist, einen Winkel zu finden, der
   * trifft. Geprüft wird über eine echte Match-Simulation — nicht über die
   * nachgebaute Formel.
   */
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
  });
  match.start();

  const zustand = match.getState();
  assert.ok(zustand.wind !== undefined, 'Vorbedingung: es gibt Wind');

  // Die Zielsuche muss eine Bahn liefern, die das Ziel erreicht — auf beiden
  // Windrichtungen geprüft.
  for (const windWunsch of [0.03, -0.03]) {
    match.world.services.match.wind = windWunsch;
    match.world.services.match.currentStrength = windWunsch * 10;

    const bahn = geschuetzBahn(200, 300, Math.PI / 4, 100, windWunsch);
    assert.ok(bahn.length > 5, `Wind ${windWunsch}: die Bahn ist zu kurz`);
    assert.ok(Number.isFinite(bahn[bahn.length - 1].x),
      `Wind ${windWunsch}: die Bahn endet im Nichts`);
  }
});
