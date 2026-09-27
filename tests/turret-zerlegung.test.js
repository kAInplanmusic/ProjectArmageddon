/**
 * Tests: Das Geschütz ist ein reines Modul (`engine/turret.js`).
 *
 * ## Der Auftrag, den diese Datei festhält
 *
 * Das Geschütz lag vollständig in `MatchController`: seine Konstanten (69
 * Zeilen), die Aufstellung, die Zielwahl, die Winkel/Kraft-Suche und die Werte
 * seines Geschosses — zusammen rund 150 Zeilen zwischen Karten- und
 * Terrainzugriffen der Klasse. Prüfbar waren sie damit nur über einen
 * vollständigen Match.
 *
 * `engine/turret.js` führt sie jetzt als **reine Funktionen**; der Match baut
 * eine **Quelle** und reicht sie hinein — dasselbe Muster wie `shooting.js`
 * (W1-4b, `tests/shooting.test.js`) und `stateSnapshot.js` (W1-4a).
 *
 * Geprüft werden fünf Zusagen:
 *
 *  1. **Kein `this`** in `turret.js` — sonst wäre das Modul keine Sammlung
 *     reiner Funktionen, sondern eine verkappte Methode.
 *  2. **Die Delegatoren** — der Match ruft die Funktionen auf und rechnet sie
 *     nicht nach; die Konstanten des Geschützes sind nur EINMAL definiert.
 *  3. **Die Schnittstelle** — jede Funktion läuft über eine schlichte Quelle.
 *     Ein Aufruf mit einem Literal muss genügen, und die Regeln der Suche
 *     (Richtung, Gleichstand, kein Blindfeuer) müssen daran sichtbar sein.
 *  4. **Die Bahn bleibt im Match** — `#simulateTurretPath` ist von
 *     `tests/turret-ballistics.test.js` im Quelltext von `match.js` gepinnt.
 *     Dieses Modul darf die Physik deshalb NICHT ein zweites Mal führen.
 *  5. **Die Gegenprobe** am echten Motor: Das Geschütz feuert weiterhin.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MatchController } from '../src/engine/match.js';
import { damageTypeId } from '../src/engine/damageTypes.js';
import {
  aimTurret, freierPlatz, naechsterGegner, turretProjectile,
} from '../src/engine/turret.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(HIER, '..');

function quelle(datei) {
  return readFileSync(resolve(WURZEL, datei), 'utf8');
}

/**
 * Entfernt Kommentare — ein Strukturtest prüft den CODE, nicht die Doku.
 * (Dieselbe Haltung wie in `tests/shooting.test.js`.)
 */
test('turret.js enthält kein `this`', () => {
  /*
   * DIE Kernzusage der Auslagerung. Eine Funktion, die über `this` an eine
   * Instanz gebunden ist, ist keine reine Funktion — sie wäre nur eine Methode
   * an einem anderen Ort, und kein Test dürfte sie ohne Match aufrufen.
   */
  const code = ohneKommentare(quelle('src/engine/turret.js'));
  const treffer = code.match(/\bthis\b/g) ?? [];

  assert.deepEqual(treffer, [],
    `turret.js greift ${treffer.length}-mal auf \`this\` zu — der Ablauf muss `
    + 'über die Quelle (Parameter) laufen, nicht über die Instanz');
});

test('Die Aufstellung und die Zielsuche sind reine Delegatoren', () => {
  /*
   * Strukturtest. Gemessen wird an der METHODE, nicht an der ganzen Datei: Der
   * Rumpf zwischen Signatur und schließender Klammer darf nur den einen Aufruf
   * enthalten. Eine zweite Fassung der Suche in `match.js` fiele hier auf.
   */
  const code = ohneKommentare(quelle('src/engine/match.js'));

  const suche = /#turretShot\(turret, ziel\)\s*\{([\s\S]*?)\n {2}}/.exec(code);
  assert.ok(suche, '#turretShot(turret, ziel) wurde nicht gefunden');
  assert.equal(suche[1].trim(), 'return aimTurret(this.#geschuetzQuelle(), turret, ziel);',
    `#turretShot ist kein reiner Delegator mehr. Rumpf:\n${suche[1].trim()}`);

  const zielwahl = /#nearestEnemyOf\(turret\)\s*\{([\s\S]*?)\n {2}}/.exec(code);
  assert.ok(zielwahl, '#nearestEnemyOf(turret) wurde nicht gefunden');
  assert.equal(zielwahl[1].trim(), 'return naechsterGegner(this.#geschuetzQuelle(), turret);',
    `#nearestEnemyOf ist kein reiner Delegator mehr. Rumpf:\n${zielwahl[1].trim()}`);

  assert.match(code, /from '\.\/turret\.js'/,
    'match.js importiert das Geschütz-Modul nicht (mehr)');
  assert.match(code, /#geschuetzQuelle\(\)/,
    'die Quelle des Geschützes fehlt');
});

test('Die Konstanten des Geschützes stehen nur EINMAL', () => {
  /*
   * Dieselbe Haltung wie `tests/eine-regel-eine-stelle.test.js`: Eine zweite
   * Definition lässt diesen Test fallen, egal welchen Wert sie hat. Die Suche
   * liest ihre Listen aus dem Modul — eine Kopie in `match.js` könnte von ihr
   * abweichen, ohne dass eine Prüfung anschlägt.
   */
  const motor = ohneKommentare(quelle('src/engine/match.js'));
  const zweite = /const\s+TURRET_(WEAPON|WEAPON_ID|POWERS|ELEVATIONS|PATH_STEPS|MAX_MISS)\b/.exec(motor);

  assert.equal(zweite, null,
    `match.js definiert \`TURRET_${zweite?.[2]}\` ein zweites Mal — die Konstanten `
    + 'gehören nach `engine/turret.js`');

  // Und die Gegenprobe: Dort stehen sie wirklich.
  const modul = ohneKommentare(quelle('src/engine/turret.js'));
  for (const name of ['TURRET_WEAPON', 'TURRET_WEAPON_ID', 'TURRET_PATH_STEPS']) {
    assert.match(modul, new RegExp(`export const ${name}\\b`),
      `${name} fehlt in engine/turret.js`);
  }
});

test('Das Geschütz-Modul führt die Bahn nicht ein zweites Mal', () => {
  /*
   * Die Bahn (`#simulateTurretPath`) bleibt im Match — sie ist dort gepinnt
   * (`tests/turret-ballistics.test.js:232-281`). Eine zweite Integrationsschleife
   * hier wäre genau die Doppelung, die `docs/duplikate-bericht.md` als Fund 1
   * beschreibt: dieselben vier Zeilen an zwei Stellen, die auseinanderlaufen
   * können.
   */
  const modul = ohneKommentare(quelle('src/engine/turret.js'));

  assert.doesNotMatch(modul, /for \(let schritt = 0/,
    'in turret.js steht eine zweite Integrationsschleife — die Bahn gehört nach match.js');
  assert.doesNotMatch(modul, /\bvx \*=|\bvy \*=/,
    'in turret.js wird der Integrationsschritt nachgebaut — er gehört nach match.js');
});

test('Die Zielsuche läuft über die Quelle — Richtung, Gleichstand, kein Blindfeuer', () => {
  /*
   * Der schärfste Beleg für die Entkopplung: `aimTurret` wird mit einem LITERAL
   * aufgerufen — kein MatchController, kein `this`. Die Attrappe zählt mit, was
   * gefragt wurde, und entscheidet selbst, welche Bahn trifft.
   */
  const ziel = { x: 200, y: 300 };
  const probiert = [];
  const quelle = {
    bahn: (turret, winkel, kraft) => {
      probiert.push({ turret, winkel, kraft });
      // Nur die Kräfte ab 52 legen die Bahn auf das Ziel.
      return kraft >= 52 ? [{ x: ziel.x, y: ziel.y }] : [{ x: -1000, y: -1000 }];
    },
  };

  const turret = { x: 0, y: 300 };
  const ergebnis = aimTurret(quelle, turret, ziel);

  assert.ok(ergebnis, 'die Suche muss einen Schuss finden');
  assert.equal(ergebnis.naehe, 0, 'die gewählte Bahn liegt nicht auf dem Ziel');
  assert.ok(probiert.length > 1, 'die Suche muss mehrere Bahnen probieren');
  assert.deepEqual(probiert[0].turret, turret, 'die Quelle bekommt den Turm übergeben');

  /*
   * Die kleinste Kraft, die trifft — abgeleitet aus dem, was die Attrappe
   * gesehen hat, nicht aus einer abgeschriebenen Zahl. Damit hängt der Test
   * nicht an der Länge der Kraftliste.
   */
  const treffendeKraefte = probiert.filter(p => p.kraft >= 52).map(p => p.kraft);
  assert.equal(ergebnis.power, Math.min(...treffendeKraefte),
    'bei mehreren treffenden Kräften muss die kleinere gewinnen');

  // Und bei gleichem Abstand entscheidet die Reihenfolge der Liste.
  const ersterVersuch = probiert.find(p => p.kraft === ergebnis.power);
  assert.equal(ergebnis.angle, ersterVersuch.winkel,
    'bei gleicher Näherung muss der zuerst probierte Winkel gewinnen');

  // Das Ziel liegt RECHTS: alle Winkel zeigen nach rechts oben (0 … π/2).
  assert.ok(probiert.every(p => p.winkel > 0 && p.winkel < Math.PI / 2),
    'das Ziel liegt rechts — die Winkel müssen nach rechts oben zeigen');

  // Die Gegenprobe: Ziel links ⇒ gespiegelte Winkel.
  const linksZiel = { x: 100, y: 300 };
  const linksProbiert = [];
  const links = aimTurret({
    bahn: (turretArg, winkel) => { linksProbiert.push(winkel); return [{ x: linksZiel.x, y: linksZiel.y }]; },
  }, { x: 400, y: 300 }, linksZiel);

  assert.ok(links, 'auch nach links muss die Suche einen Schuss finden');
  assert.ok(linksProbiert.every(w => w > Math.PI / 2 && w < Math.PI),
    'das Ziel liegt links — die Winkel müssen nach links oben zeigen');

  // Kein Blindfeuer: keine Bahn in der Nähe des Ziels ⇒ kein Schuss.
  assert.equal(
    aimTurret({ bahn: () => [{ x: 0, y: 0 }] }, { x: 0, y: 0 }, { x: 5000, y: 0 }),
    null,
    'ohne Bahn nahe am Ziel darf nicht geschossen werden',
  );

  // Eine leere Bahn (Wand im ersten Schritt) ist ebenfalls kein Schuss.
  assert.equal(
    aimTurret({ bahn: () => [] }, { x: 0, y: 0 }, { x: 0, y: 0 }),
    null,
    'eine leere Bahn ist kein Schuss',
  );
});

test('Die Zielwahl nimmt den nächsten lebenden Gegner in Reichweite', () => {
  /*
   * Die Zielwahl entscheidet, WOHIN die Suche zielt — sie ist der erste Teil
   * des Zielpfads. Geprüft werden die vier Regeln: eigenes Team, Gefallene,
   * Reichweite und der Gleichstand.
   */
  const positionen = new Map([
    [1, { x: 0, y: 0 }],
    [2, { x: 100, y: 0 }],
    [3, { x: 60, y: 0 }],     // gefallen — darf nicht zählen
    [4, { x: 0, y: 100 }],    // gleich weit wie 2
    [5, { x: 900, y: 0 }],    // außer Reichweite
  ]);
  const quelle = {
    players: [
      { entityId: 1, teamId: 0, alive: true },
      { entityId: 2, teamId: 1, alive: true },
      { entityId: 3, teamId: 1, alive: false },
      { entityId: 4, teamId: 1, alive: true },
      { entityId: 5, teamId: 1, alive: true },
    ],
    positionOf: entityId => positionen.get(entityId),
  };
  const turret = { x: 0, y: 0, teamId: 0, range: 200 };

  const ziel = naechsterGegner(quelle, turret);
  assert.ok(ziel, 'es muss ein Ziel gefunden werden');
  assert.equal(ziel.distanz, 100);
  assert.equal(ziel.entityId, 2,
    'bei gleichem Abstand (2 und 4) muss die kleinere Kennung gewinnen');

  // Und die Gegenprobe zur Reichweite: das dritte Ziel liegt weit draußen.
  assert.ok(ziel.distanz <= turret.range);

  // Ohne Gegner in Reichweite gibt es KEIN Ziel — kein Blindfeuer.
  assert.equal(
    naechsterGegner(quelle, { x: 0, y: 0, teamId: 0, range: 50 }),
    null,
    'außerhalb der Reichweite darf kein Ziel gefunden werden',
  );
});

test('Die Aufstellung sucht festes, trockenes Gelände in fester Folge', () => {
  /*
   * Die Aufstellung ist reine Rechnung über Karte und Terrain — mit einer
   * Attrappe prüfbar, ohne einen Match zu bauen.
   */
  const quelle = {
    breite: 1000,
    surfaceYAt: x => (x >= 100 ? 300 : 0),
    // Der direkte Standort steht unter Wasser, 12 px rechts nicht.
    waterLevelAt: x => (x < 112 ? 1 : 0),
  };

  assert.deepEqual(freierPlatz(quelle, 100), { x: 112, y: 294 },
    'der überflutete Standort wird übersprungen, der nächste feste genommen');

  // Kein Grund ⇒ kein Geschütz (statt eines Geschützes im Gestein).
  assert.equal(
    freierPlatz({ breite: 1000, surfaceYAt: () => 0, waterLevelAt: () => 0 }, 500),
    null,
    'ohne festen Boden darf kein Platz entstehen',
  );

  // Und am Kartenrand: jeder Kandidat liegt außerhalb des Körpermasses.
  assert.equal(
    freierPlatz({ breite: 12, surfaceYAt: () => 300, waterLevelAt: () => 0 }, 6),
    null,
    'am Kartenrand ist kein Platz — das Geschütz darf nicht halb herausragen',
  );
});

test('Das Geschoss trägt die Werte der Geschütz-Komponente', () => {
  /*
   * Die Werte des Geschosses sind reine Rechnung: Der Match erzeugt die
   * Entität, dieses Modul liefert den Inhalt. Geprüft wird die Ableitung, nicht
   * eine abgeschriebene Zahl.
   */
  const turret = { x: 100, y: 200, ownerId: 7, damage: 23, range: 400 };
  const waffe = {
    index: -1, damageType: 'explosive', blastRadius: 18,
    knockback: 0, gravityScale: 1, terrainDamage: 6,
  };
  const winkel = Math.PI / 4;
  const speed = 10;

  const geschoss = turretProjectile({ turret, waffe, winkel, speed });

  assert.deepEqual(geschoss.position, { x: 100, y: 200 });
  assert.equal(geschoss.velocity.x, Math.cos(winkel) * speed);
  assert.equal(geschoss.velocity.y, -Math.sin(winkel) * speed,
    'der Winkel wird gegen die Bildschirmachse gemessen — nach oben ist negativ');
  assert.equal(geschoss.projectile.owner, 7);
  assert.equal(geschoss.projectile.weaponId, -1);
  assert.equal(geschoss.projectile.damage, 23, 'der Schaden kommt aus dem Geschütz-Eintrag');
  assert.equal(geschoss.projectile.damageType, damageTypeId('explosive'));
  assert.equal(geschoss.projectile.windFactor, 1);
  assert.equal(geschoss.projectile.alive, 1);
  assert.equal(geschoss.projectile.lifetime,
    Math.max(30, Math.round(turret.range / speed) * 2),
    'die Lebensdauer folgt der Reichweite und der Abschussgeschwindigkeit');
});

test('Der Motor feuert weiterhin über das ausgelagerte Modul', () => {
  /*
   * Die Gegenprobe zur Struktur: Am echten Motor muss herauskommen, was vorher
   * herauskam — ein Geschütz, ein Abschuss je Runde, ein Ziel und ein Geschoss
   * dazu. Geprüft wird über die ECHTE Waffe (`pa_124`, `special: auto_target`),
   * nicht über eine geratene Kennung.
   */
  const WAFFE = 'pa_124';
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 2, preset: 'open',
    turnDurationMs: 300, maxRounds: 12,
  });
  match.start();

  const spieler = match.activePlayerId;
  match.inventory.register(spieler, [WAFFE]);
  match.inventory.selectWeapon(spieler, WAFFE);
  const aufgestellt = match.fire(spieler, 0.5, 60, WAFFE);
  assert.equal(aufgestellt.ok, true,
    `Aufstellen abgelehnt: ${aufgestellt.errors?.join(', ')}`);
  assert.equal(match.getState().turrets.length, 1, 'es muss ein Geschütz stehen');
  match.consumeEvents();

  const ereignisse = [];
  const geschosse = new Set();
  let schritte = 0;
  while (match.status === 'playing' && match.round < 4 && schritte < 20_000) {
    match.step();
    for (const e of match.consumeEvents()) {
      if (e.type === 'projectile_spawn') geschosse.add(e.payload.projectileId);
      ereignisse.push(e);
    }
    schritte += 1;
  }

  const schuesse = ereignisse.filter(e => e.type === 'turret_fired');
  assert.ok(schuesse.length >= 1,
    `kein Geschützschuss in drei Runden (${schritte} Schritte)`);

  for (const schuss of schuesse) {
    assert.equal(schuss.payload.ownerId, spieler, 'Geschützschuss ohne den richtigen Besitzer');
    assert.ok(Number.isInteger(schuss.payload.targetId),
      'Geschützschuss ohne Ziel — es hätte blind gefeuert');
    assert.ok(geschosse.has(schuss.payload.projectileId),
      `zum Geschützschuss fehlt das Geschoss (${schuss.payload.projectileId})`);
  }
});
