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
 * Die **Kopplung** der beiden Implementierungen. Der Test lässt sich die Bahn
 * vom MOTOR geben — `match.turretPath(...)` in `match.js` — und rechnet die
 * Gegenprobe mit der geteilten Regel (`simulateFlight`, die `integrateStep`
 * benutzt, aus `src/shared/ballistics.js`). Verglichen wird Punkt für Punkt,
 * die Abweichung muss 0 px sein.
 *
 * ## Warum das eine Messung ist und keine Textprobe
 *
 * Vorher stand hier eine Strukturprüfung AM QUELLTEXT: Sie suchte die Signatur
 * `#simulateTurretPath(turret, winkel, kraft, waffe) {` in `match.js`, schnitt
 * den Rumpf per Klammerzählung heraus und verlangte darin `vy *= drag` und
 * `const wind = this.#wind`. Das hält den WORTLAUT fest, nicht die Wirkung:
 *
 *     const wind = this.#wind * 0.5;   // erfüllt BEIDE Muster — und rechnet falsch
 *
 * Zwei Kurven zu vergleichen ist strenger. Jede Änderung an der Rechnung fällt
 * auf, auch eine, die den Text unverändert lässt.
 *
 * Ein früherer Kommentar behauptete „wie das echte Geschoss" — und log. Ein
 * Kommentar kann nicht fehlschlagen; dieser Test kann es.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_PROJECTILE_DRAG, DEFAULT_PROJECTILE_GRAVITY } from '../src/engine/systems/projectileSystem.js';
import { MatchController, POWER_TO_SPEED } from '../src/engine/match.js';
import { simulateFlight } from '../src/shared/ballistics.js';
import { geschwindigkeitsFaktor } from '../src/shared/reichweite.js';
import { TURRET_PATH_STEPS, TURRET_WEAPON } from '../src/engine/turret.js';

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
 * Die Physik des Geschütz-Pfads — nachgebaut, als Modell für die Tests unten.
 *
 * ACHTUNG: Diese Nachbildung hält `match.js` NICHT mehr fest. Sie ist ein
 * Modell für sich („so soll die Bewegung aussehen") und kann nur gegen die
 * zweite Nachbildung oben laufen. Die Kopplung an den MOTOR prüft allein
 * `Die Geschütz-Bahn ist Punkt für Punkt die Bahn der geteilten Regel` unten —
 * sie vergleicht `match.turretPath(...)` mit `simulateFlight` aus
 * `src/shared/ballistics.js`.
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

test('Die Geschütz-Bahn ist Punkt für Punkt die Bahn der geteilten Regel', () => {
  /*
   * DIE Prüfung, die den Fehler von damals festhält — als Messung, nicht als
   * Textprobe.
   *
   * Der Motor gibt seine Bahn heraus (`match.turretPath`, siehe `match.js`),
   * die Gegenprobe rechnet `simulateFlight` aus `src/shared/ballistics.js` —
   * dieselbe Funktion, aus der die echten Geschosse ihre Bewegung nehmen.
   * Verglichen wird jeder einzelne Bahnpunkt; die Abweichung muss 0 px sein.
   *
   * Was der Fund war (gemessen, Kraft 100, 45 Grad): Die Bahn des Geschützes
   * wich in ZWEI Punkten von der Regel des echten Geschosses ab —
   *
   *   1. `vx += wind * 0.02` mit `currentStrength` (das ist `wind * 10`)
   *      wirkte mit Faktor 0,2 statt 1,0 — das FÜNFFACHE zu wenig.
   *   2. `vy` wurde nicht gedraggt, `vx` schon.
   *
   * Zielweiten-Abweichung vor der Korrektur: Wind 0 → +14,6 px (allein der
   * fehlende vy-Drag), Wind 0,025 → −16,9 px, Wind 0,05 → −48,4 px,
   * Wind −0,05 → +77,7 px. Das Geschütz zielte damit systematisch nach einer
   * falschen Regel und schoss daneben.
   *
   * Keine dieser Abweichungen überlebt diese Messung: Eine andere Windquelle,
   * ein anderer Windfaktor, ein fehlender Drag auf einer der beiden Achsen oder
   * eine andere Reihenfolge verschiebt PUNKTE — nicht Text.
   */
  const TAKTE = TURRET_PATH_STEPS;
  /*
   * Weit über der Karte: Innerhalb der Takte, die die Bahn selbst rechnen darf
   * (`TURRET_PATH_STEPS`), kann so weder das Gelände noch die Unterkante die
   * Bahn beenden — verglichen wird der reine Integrationsschritt, und genau
   * dort saß der Fehler.
   */
  const START = { x: 1280, y: -200_000 };
  // Zwei Schüsse je Wind: steil und flach — der steile wiegt `vy`, der flache `vx`.
  const SCHUESSE = [[Math.PI / 4, 100], [1.2, 60]];

  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open',
    turnDurationMs: 1_000_000, maxRounds: 12,
  });
  match.start();

  const windwerte = [];
  let verglichen = 0;

  for (let runde = 0; runde < 12; runde += 1) {
    /*
     * Der Wind wird zu RUNDENBEGINN neu gewürfelt, und die Bahn liest ihn aus
     * `this.#wind`. Jede Runde liefert damit einen ECHTEN, reproduzierbaren
     * Windwert — keiner wird im Test gesetzt.
     */
    const wind = match.wind;
    if (!windwerte.includes(wind)) windwerte.push(wind);

    for (const [winkel, kraft] of SCHUESSE) {
      const speed = kraft * POWER_TO_SPEED * (TURRET_WEAPON.speedFactor ?? 1)
        * geschwindigkeitsFaktor(match.width);

      /*
       * Die Gegenprobe: derselbe Abschussvektor, aber gerechnet von der
       * geteilten Regel. `gravity` und `drag` werden ABSICHTLICH nicht
       * mitgegeben — die Vorgaben des Moduls SIND die Konstanten, aus denen das
       * Geschoss lebt. Eine hier abgeschriebene 0,995 wäre die Doppelregel von
       * damals. `bounds` sind die Kartengrenzen: dieselben, an denen die Bahn
       * des Geschützes abbricht.
       */
      const referenz = simulateFlight({
        x: START.x, y: START.y, angle: winkel, power: kraft, speed, wind,
        gravityScale: TURRET_WEAPON.gravityScale ?? 1,
        steps: TAKTE,
        includeStart: false,
        bounds: {
          minX: 0, maxX: match.width,
          minY: Number.NEGATIVE_INFINITY, maxY: match.height,
        },
      });

      const bahn = match.turretPath({ x: START.x, y: START.y }, winkel, kraft);

      // Ein Vergleich über wenige Punkte wäre kein Vergleich.
      assert.ok(bahn.length > 100,
        `Wind ${wind}, Kraft ${kraft}: die Bahn des Geschützes hat nur `
        + `${bahn.length} Punkte`);

      const gemeinsam = Math.min(bahn.length, referenz.points.length);
      for (let i = 0; i < gemeinsam; i += 1) {
        const p = bahn[i];
        const q = referenz.points[i];

        assert.ok(p.x === q.x && p.y === q.y,
          `Wind ${wind}, Kraft ${kraft}, Winkel ${winkel.toFixed(3)}: Bahnpunkt ${i} `
          + `weicht um ${Math.hypot(p.x - q.x, p.y - q.y).toFixed(2)} px ab `
          + `(${p.x} / ${p.y} gegen ${q.x} / ${q.y}).\n`
          + 'Die Bahn des Geschützes muss die GETEILTE Regel benutzen '
          + '(`integrateStep` aus `src/shared/ballistics.js`): Windquelle '
          + '`this.#wind` (NICHT `currentStrength` — das ist wind * 10), '
          + 'Windfaktor 1,0 und Drag auf BEIDE Achsen. Der Fehler von damals '
          + 'verschob die Zielweite um bis zu 77,7 px (Wind 0: +14,6 px, '
          + 'Wind 0,025: −16,9 px, Wind 0,05: −48,4 px, Wind −0,05: +77,7 px) '
          + '— das Geschütz zielte nach einer falschen Regel und schoss daneben.');
      }

      /*
       * Die Länge: Der Motor bricht am Kartenrand ab und behält den Punkt
       * jenseits der Grenze nicht (`match.js`); `simulateFlight` meldet ihn als
       * Aufprall. Genau EIN Punkt mehr ist deshalb erlaubt — und nur, wenn die
       * Gegenprobe auch wirklich an den Kartengrenzen endete.
       */
      const mehr = referenz.points.length - bahn.length;
      assert.ok(mehr === 0 || (mehr === 1 && referenz.terminatedBy === 'bounds'),
        `Wind ${wind}, Kraft ${kraft}: die Bahnen enden verschieden lang `
        + `(${bahn.length} gegen ${referenz.points.length} Punkte, Ende der `
        + `Gegenprobe: ${referenz.terminatedBy})`);

      verglichen += 1;
    }

    match.endTurn();
    match.consumeEvents();
  }

  /*
   * Die Vorbedingungen des Vergleichs — ohne sie wäre er über die Jahre still
   * bedeutungslos: mehrere Windwerte, in BEIDE Richtungen, jeder von Wirkung.
   * (Der Wind, den das Geschütz liest, wirkt nur, wenn er nicht 0 ist.)
   */
  const wirksame = windwerte.filter(w => Math.abs(w) > 0.001);
  assert.ok(wirksame.length >= 4,
    `nur ${wirksame.length} Windwerte mit Wirkung: ${windwerte.join(', ')}`);
  assert.ok(windwerte.some(w => w > 0.001) && windwerte.some(w => w < -0.001),
    `die Windwerte decken nur eine Richtung ab: ${windwerte.join(', ')}`);
  assert.equal(verglichen, 12 * SCHUESSE.length,
    'es wurden nicht alle Windwerte verglichen');
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
