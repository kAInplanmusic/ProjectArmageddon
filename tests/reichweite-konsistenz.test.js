/**
 * Tests: Die Reichweitenskalierung wird an JEDER Stelle gleich angewandt.
 *
 * ## Der Befund, der diese Datei nötig machte
 *
 * FUND (belegt, gemessen 2026-09-19): Der Faktor aus `src/shared/reichweite.js`
 * wurde an drei Stellen mit DREI Bedeutungen gelesen:
 *
 *     Spielerschuss (#launchVector)            gar nicht      613 px (konstant)
 *     Geschütz (#simulateTurretPath, …)        auf v  → Weite × f²  1633 px
 *     Erreichbarkeits-Check (pruefeErreich…)   auf Weite → × f      1001 px
 *
 * (bei 5120 px Kartenbreite). Die Reserve gegen den nächsten Gegner wäre damit
 * 0,48× / 1,28× / 0,78× — je nachdem, wen man fragt. Ein Spiel, das seine
 * eigene Reichweite nicht kennt, kann keine Karte richtig belegen.
 *
 * Vorgabe ist die mittlere Auffassung der damaligen Aufstellung („wie das
 * Geschütz"): die Weite wächst linear mit der Kartenbreite, die Reserve bleibt
 * gleich. Dafür gibt es zwei benannte Funktionen — und diese Datei hält fest,
 * dass alle Lesestellen sie benutzen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  reichweitenFaktor, geschwindigkeitsFaktor, weitenFaktor, wurfweite,
} from '../src/shared/reichweite.js';
import { maxWurfweite } from '../src/shared/erreichbarkeit.js';
import { POWER_TO_SPEED, HOHECHSTE_KRAFT } from '../src/engine/match.js';
import { MatchController } from '../src/engine/match.js';
import { COMPONENT_SIGNATURES } from '../src/engine/ecs/componentStore.js';
import { launchSpeedMultiplier } from '../src/shared/launchSpeed.js';
import { getWeapon, WEAPONS } from '../src/shared/config/weapons.js';
import { DEFAULT_PROJECTILE_GRAVITY } from '../src/engine/systems/projectileSystem.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(HIER, '..');
const BREITEN = [1280, 1920, 2560, 3840, 5120];

function quelle(datei) {
  return readFileSync(resolve(WURZEL, datei), 'utf8');
}

/**
 * Entfernt Kommentare — dieselbe Haltung wie in `tests/abort-knopf.test.js`:
 * Ein Strukturtest prüft den CODE, nicht die Doku. Sonst schlägt er an, weil
 * ein Kommentar den behobenen Fehler erklärt.
 */
function ohneKommentare(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('Weitenfaktor ist das Quadrat des Geschwindigkeitsfaktors', () => {
  /*
   * Die eine Regel: `x = v²/g`. Wer die Geschwindigkeit mit `g` skaliert,
   * bekommt die Weite in `g²`. Beide Zahlen müssen deshalb an jeder Karte
   * zusammenpassen — sonst rechnet eine Stelle mit der anderen Auffassung.
   */
  for (const breite of BREITEN) {
    const g = geschwindigkeitsFaktor(breite);
    assert.equal(
      weitenFaktor(breite), g * g,
      `bei ${breite} px passt das Quadrat nicht zum Geschwindigkeitsfaktor`,
    );
  }

  // Und die Zusage des Moduls: auf der Bezugsbreite ändert sich nichts.
  assert.equal(geschwindigkeitsFaktor(1920), 1);
  assert.equal(weitenFaktor(1920), 1);
  assert.equal(reichweitenFaktor(1920), 1);
});

test('Prüfung und Schuss nehmen dieselbe Weite an', () => {
  /*
   * DAS Kernstück. Die Erreichbarkeitsprüfung rechnet mit
   * `maxWurfweite(...) * weitenFaktor`. Ein Schuss mit voller Kraft rechnet mit
   * `wurfweite(..., geschwindigkeitsFaktor)`. Beide Wege müssen dasselbe
   * ergeben — sonst belegt der Motor Karten, die seine Waffen nicht bespielen
   * können (oder umgekehrt).
   *
   * Der einzige erlaubte Unterschied ist der Windzuschlag der Prüfung (1,15).
   */
  const windReserve = 1.15;
  for (const breite of BREITEN) {
    const angesetzt = maxWurfweite({
      powerToSpeed: POWER_TO_SPEED,
      maxPower: HOHECHSTE_KRAFT,
      gravity: DEFAULT_PROJECTILE_GRAVITY,
    }) * weitenFaktor(breite);

    const geflogen = wurfweite({
      powerToSpeed: POWER_TO_SPEED,
      kraft: HOHECHSTE_KRAFT,
      schwerkraft: DEFAULT_PROJECTILE_GRAVITY,
      speedFactor: 1,
      geschwindigkeitsFaktor: geschwindigkeitsFaktor(breite),
    }) * windReserve;

    assert.ok(
      Math.abs(angesetzt - geflogen) < 1e-9,
      `bei ${breite} px: Prüfung sagt ${angesetzt.toFixed(1)} px, `
      + `der Schuss fliegt ${geflogen.toFixed(1)} px`,
    );
  }
});

test('Der Motor wendet den Faktor auf die Abschussgeschwindigkeit an', () => {
  /*
   * Die Gegenprobe zur reinen Rechnung — am echten Motor, nicht am Modul.
   *
   * Gelesen wird die GESCHWINDIGKEIT des frisch erzeugten Geschosses: Sie ist
   * der Abschussvektor, bevor der erste Physikschritt läuft. Damit fällt auf,
   * wenn `#launchVector` den Kartenfaktor vergisst — genau der Fehler, der
   * zwei Jahre lang unentdeckt blieb.
   */
  const match = new MatchController({
    seed: 4711, teams: 2, playersPerTeam: 1, preset: 'hills', maxRounds: 5,
  });
  match.start();
  match.consumeEvents();

  const spielerId = match.activePlayerId;
  const spieler = match.players.find(entry => entry.entityId === spielerId);
  const waffeId = match.inventory.getActiveWeaponId(spielerId);
  const waffe = getWeapon(waffeId);
  const winkel = Math.PI / 4;
  const kraft = HOHECHSTE_KRAFT;

  const erwartet = kraft * POWER_TO_SPEED * launchSpeedMultiplier({
    classId: spieler?.classId ?? 0,
    archetypeId: spieler?.archetypeId ?? 0,
    sidegradeId: spieler?.sidegradeId ?? null,
    weapon: waffe,
  }) * geschwindigkeitsFaktor(match.width);

  const ergebnis = match.fire(spielerId, winkel, kraft);
  assert.ok(ergebnis.ok, `der Schuss wurde abgelehnt: ${JSON.stringify(ergebnis.errors)}`);

  const geschosse = match.world
    .getEntitiesBySignature(COMPONENT_SIGNATURES.PROJECTILE)
    .filter(id => match.world.isActive(id));
  assert.equal(geschosse.length, 1, 'es muss genau ein Geschoss unterwegs sein');

  const vx = match.world.getComponent(geschosse[0], 'Velocity', 'x');
  const vy = match.world.getComponent(geschosse[0], 'Velocity', 'y');
  const gemessen = Math.hypot(vx, vy);

  assert.ok(
    Math.abs(gemessen - erwartet) < 1e-6,
    `Der Motor schießt mit ${gemessen.toFixed(4)} px/Tick, erwartet sind `
    + `${erwartet.toFixed(4)} (Kartenbreite ${match.width}). `
    + 'Fehlt der Kartenfaktor in #launchVector?',
  );
});

test('Der Strahl einer Hitscan-Waffe folgt der Karte', () => {
  /*
   * FUND (belegt 2026-09-19, Vorgabe des Auftraggebers „Strahl mitskalieren"):
   * `#resolveHitscan` leitete die Strahllänge aus `weapon.maxRange` ab — in
   * Pixeln, ohne Kartenfaktor. Die ballistischen Waffen wachsen mit der Karte,
   * die Hitscan-Waffen nicht: auf einer 5120er Karte fielen 76 Waffen gegen 74
   * ab. Geprüft wird die Stelle im Code, weil der Strahl nur mit Terrain und
   * Gegnern im Weg messbar wäre — und die Aussage hängt an EINER Zeile.
   */
  const motor = ohneKommentare(quelle('src/engine/match.js'));
  const treffer = /const strahlweite = weapon\.maxRange \* weitenFaktor\(this\.width\)/.exec(motor);

  assert.ok(treffer,
    'die Strahllänge der Hitscan-Waffe muss mit dem WEITENfaktor der Karte '
    + 'rechnen (weitenFaktor(this.width))');
  assert.ok(!/Math\.round\(weapon\.maxRange \/ Math\.max\(1, speed\)\)/.test(motor),
    'die Strahllänge rechnet wieder ohne Kartenfaktor');
});

test('Die Lebensdauer des Geschosses beschneidet die Weite nicht KARTENABHÄNGIG', () => {
  /*
   * FUND (belegt, gemessen 2026-09-19): `projectileLifetime` rechnete
   * `maxRange / v * 1,5` — die zurücklegbare Strecke ist damit `maxRange * 1,5`,
   * ein Katalogwert in Pixeln OHNE Kartenfaktor. Seit die ballistische Weite mit
   * der Kartenbreite wächst, wurde der Deckel zum kartenabhängigen Engpass.
   *
   * Gemessen über 150 Waffen × 3 Klassen × 5 Kartengrößen (1425 Kombinationen),
   * Verhältnis Deckel/Weite:
   *
   *     Schwelle        vorher   nachher
   *     < 1,00             569       465
   *     < 0,90             482        45
   *     < 0,50             189         0
   *     kleinster Wert    0,27      0,72
   *
   * Vorher wurde die Beschneidung MIT der Karte schlimmer (0,27 auf 5120 px);
   * jetzt ist sie für eine Waffe+Klasse auf JEDER Größe gleich — der Deckel
   * skaliert mit. Genau das prüft dieser Test, und zusätzlich, dass keine
   * Kombination mehr als 30 % verliert (der gemessene Worst Case ist 28 %).
   *
   * Die verbleibende Beschneidung ist damit eine Eigenschaft der Waffe (ihr
   * `maxRange` ist klein gegenüber ihrer Wurfweite — etwa bei Granaten), keine
   * der Karte. Das ist eine Balance-Frage, keine Skalierungslücke.
   */
  const KLASSEN = [0, 1, 2];
  const GRENZE = 0.7;
  const jeKombination = new Map();
  const verletzungen = [];

  for (const breite of BREITEN) {
    for (const waffe of WEAPONS) {
      if (waffe.delivery !== 'projectile') continue;
      for (const klasse of KLASSEN) {
        const v = HOHECHSTE_KRAFT * POWER_TO_SPEED * launchSpeedMultiplier({
          classId: klasse, archetypeId: 0, weapon: waffe, kartenbreite: breite,
        });
        const weite = (v * v) / DEFAULT_PROJECTILE_GRAVITY;
        const verhaeltnis = (waffe.maxRange * weitenFaktor(breite) * 1.5) / weite;
        const schluessel = `${waffe.id}|${klasse}`;

        if (verhaeltnis < GRENZE) {
          verletzungen.push(
            `${schluessel} auf ${breite} px: Deckel lässt nur `
            + `${(verhaeltnis * 100).toFixed(0)} % der Weite zu`,
          );
        }

        // Kartenabhängigkeit: dasselbe Verhältnis auf jeder Größe.
        const vorher = jeKombination.get(schluessel);
        if (vorher === undefined) jeKombination.set(schluessel, verhaeltnis);
        else if (Math.abs(vorher - verhaeltnis) > 0.01) {
          verletzungen.push(
            `${schluessel}: Deckel/Weite hängt von der Karte ab `
            + `(${vorher.toFixed(3)} gegen ${verhaeltnis.toFixed(3)} auf ${breite} px)`,
          );
        }
      }
    }
  }

  assert.equal(verletzungen.length, 0,
    `${verletzungen.length} Verletzungen:\n  ` + verletzungen.slice(0, 5).join('\n  '));
});

test('Der Motor rechnet die Lebensdauer wie das Modul', () => {
  // Die Gegenprobe am echten Motor: Er muss die Karte in derselben Rechnung
  // haben wie der Test — sonst gilt die Zusage oben nur auf dem Papier.
  const match = new MatchController({
    seed: 2026, teams: 2, playersPerTeam: 1, preset: 'hills', maxRounds: 5,
  });
  match.start();
  match.consumeEvents();

  const spielerId = match.activePlayerId;
  const spieler = match.players.find(entry => entry.entityId === spielerId);
  const waffe = getWeapon(match.inventory.getActiveWeaponId(spielerId));
  const winkel = Math.PI / 4;
  const kraft = HOHECHSTE_KRAFT;

  const v = kraft * POWER_TO_SPEED * launchSpeedMultiplier({
    classId: spieler?.classId ?? 0,
    archetypeId: spieler?.archetypeId ?? 0,
    sidegradeId: spieler?.sidegradeId ?? null,
    weapon: waffe,
    kartenbreite: match.width,
  });
  const erwartet = Math.round(
    (waffe.maxRange * weitenFaktor(match.width)) / Math.max(1, v),
  ) * 1.5;

  const gemessen = match.projectileLifetime(spielerId, winkel, kraft, waffe);
  assert.ok(
    Math.abs(gemessen - erwartet) < 1.5,
    `Der Motor plant ${gemessen} Ticks, das Modul rechnet ${erwartet} `
    + `(Kartenbreite ${match.width}) — fehlt der Kartenfaktor?`,
  );
});

test('Jede Lesestelle benutzt die benannte Funktion', () => {
  /*
   * Strukturtest. Er hält fest, dass es bei EINER Quelle bleibt: Das alte Feld
   * `#reichweite` ist weg, und die drei Stellen, die eine Geschwindigkeit
   * bilden, rufen `geschwindigkeitsFaktor` — die Prüfung `weitenFaktor`.
   */
  const motor = ohneKommentare(quelle('src/engine/match.js'));

  assert.ok(!motor.includes('#reichweite'),
    'In match.js wird wieder ein Feld #reichweite gelesen — genau der Name, der '
    + 'dreierlei bedeutete. Bitte geschwindigkeitsFaktor/weitenFaktor benutzen.');

  /*
   * Und die drei Stellen, die eine GESCHWINDIGKEIT bilden, geben die
   * Kartenbreite an die gemeinsame Regel mit (`launchSpeedMultiplier`). Seit
   * 2026-09-19 gehört sie dort hinein — der Versuch, sie daneben zu
   * multiplizieren, hat genau den Fehler erzeugt, den diese Datei festhält.
   */
  const geschwindigkeitsStellen = motor.match(/\* geschwindigkeitsFaktor\(this\.width\)/g) ?? [];
  assert.equal(geschwindigkeitsStellen.length, 2,
    `match.js skaliert an ${geschwindigkeitsStellen.length} Stellen selbst — `
    + 'erwartet sind 2 (Geschütz-Vorschau und Geschoss). Der Spielerschuss geht '
    + 'über launchSpeedMultiplier und muss dort `kartenbreite` mitgeben.');

  assert.match(motor, /launchSpeedMultiplier\({[\s\S]*?kartenbreite: this\.width[\s\S]*?}\)/,
    'der Spielerschuss muss seine Kartenbreite an launchSpeedMultiplier geben');

  assert.match(motor, /maxWurfweite\({[\s\S]*?}\) \* weitenFaktor\(this\.width\)/,
    'die Erreichbarkeitsprüfung muss mit dem WEITENfaktor rechnen');

  /*
   * Und die Stellen, die eine Richtung FÜR EINE FIGUR bilden, geben die
   * Kartenbreite an die gemeinsame Regel mit.
   *
   * Hier stand `src/server/bot.js` — der Server-Bot ist am 2026-09-20 entfallen
   * („Es gibt keine Bot-KI, Teams sind Menschen"). Übrig bleibt der Client, der
   * die Vorschau und die Schussvorhersage rechnet.
   */
  const erwarteteBreite = {
    'src/client/main.js': /launchSpeedMultiplier\({[\s\S]*?kartenbreite: breite[\s\S]*?}\)/,
  };
  for (const [datei, muster] of Object.entries(erwarteteBreite)) {
    const text = ohneKommentare(quelle(datei));
    assert.match(text, muster,
      `${datei} muss die Kartenbreite an launchSpeedMultiplier geben — sonst `
      + 'rechnet sie ohne Kartenskalierung');
    assert.ok(!text.includes('reichweitenFaktor('),
      `${datei} benutzt reichweitenFaktor — das ist der WEITENfaktor und `
      + 'gehört nicht in eine Geschwindigkeit');
  }
});

test('Ein Geschoss am Lebensdauer-Deckel detoniert — es verschwindet nicht lautlos', () => {
  /*
   * FUND (belegt, MASTERDOTO „Die Lebensdauer beschneidet kurze Waffen"): Der
   * Deckel (`maxRange × 1,5`, siehe `projectileLifetime`) liegt für 465 von 1425
   * Kombinationen UNTER der tatsächlichen Wurfweite. Ein Geschoss verfällt dann
   * mitten im Flug.
   *
   * Vorher geschah das ohne jede Wirkung: Das Geschoss war einfach weg. Gemessen
   * an Seed 1000, Zug 3, lebte ein Schuss 72 Ticks, obwohl er 83 gebraucht hätte
   * — und die Rechnung sah trotzdem „Treffer".
   *
   * Geprüft wird deshalb: Am Deckel gibt es eine EXPLOSION (mit Krater und
   * Flächenwirkung), nicht nur ein Entfernen. Der Deckel selbst bleibt bestehen —
   * er ist die dokumentierte Obergrenze, keine zu behebende Zahl.
   */
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000,
  });
  match.start();
  match.consumeEvents();
  const spieler = match.activePlayerId;

  const waffe = WEAPONS
    .filter(w => w.delivery === 'projectile' && w.fuseTime === 0 && w.damage > 0)
    .sort((a, b) => b.blastRadius - a.blastRadius)[0];
  assert.ok(waffe, 'Es muss eine Projektilwaffe ohne Zünder geben');
  assert.ok(waffe.blastRadius > 0, 'für die Wirkungsprüfung braucht es Flächenwirkung');
  match.inventory.register(spieler, [waffe.id]);

  /*
   * Das Ziel steht NEBEN dem Schützen. Grund: Der Deckel greift nach wenigen
   * Ticks, und die Explosion liegt dann direkt über dem Schützen. Gemessen wird
   * deshalb, ob die Explosion AM DECKEL Schaden anrichtet — das ist die Wirkung,
   * die vorher fehlte (das Geschoss verschwand lautlos).
   */
  const ziel = match.players.find(p => p.entityId !== spieler).entityId;
  const spielerX = match.world.getComponent(spieler, 'Position', 'x') ?? 0;
  const zielX = spielerX + 20;
  match.world.setComponent(ziel, 'Health', 'current', 500);
  match.world.setComponent(ziel, 'Health', 'max', 500);
  match.world.setComponent(ziel, 'Position', 'x', zielX);
  match.world.setComponent(ziel, 'Position', 'y', match.surfaceYAt(zielX) - 12);
  const hpVorher = match.world.getComponent(ziel, 'Health', 'current');

  // Senkrecht nach oben: Das Geschoss bleibt in der Luft, damit der Deckel
  // sicher greift und nicht vorher der Boden.
  const schuss = match.fire(spieler, Math.PI / 2, 100, waffe.id);
  assert.equal(schuss.ok, true, `Schuss abgelehnt: ${schuss.errors?.join(', ')}`);
  const pid = schuss.projectileId;

  // Den Deckel künstlich kurz setzen: Das Geschoss ist noch im Flug.
  match.world.setComponent(pid, 'Projectile', 'lifetime', 2);

  const ereignisse = [];
  for (let i = 0; i < 20; i++) {
    match.step();
    for (const e of match.consumeEvents()) ereignisse.push(e.type);
  }

  assert.equal(match.world.isActive(pid), false, 'das Geschoss muss am Deckel enden');
  assert.ok(ereignisse.includes('projectile_expired'),
    `der Deckel muss greifen: ${[...new Set(ereignisse)].join(', ')}`);
  assert.ok(ereignisse.includes('explosion'),
    'am Deckel fehlt die Explosion — das Geschoss verschwand lautlos');
  assert.ok(!ereignisse.includes('projectile_impact'),
    'in der Luft gibt es keinen Einschlag — nur das Ende am Deckel');

  const hpNachher = match.world.getComponent(ziel, 'Health', 'current');
  assert.ok(hpNachher < hpVorher,
    `die Explosion am Deckel muss wirken (${waffe.displayName}): `
    + `Leben ${hpVorher} → ${hpNachher}`);
});
