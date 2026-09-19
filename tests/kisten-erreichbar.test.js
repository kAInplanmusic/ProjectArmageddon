/**
 * Tests: Kisten sind erreichbar.
 *
 * ## Der Befund
 *
 * Ein User-Flow-Audit stellte fest: Der Aufheberadius war **18 px** bei Karten
 * von 1280 px Breite. Gemessen kam eine Figur praktisch nie in Reichweite — der
 * Loot-Strang hing an einem Zufall.
 *
 * ## Warum 110 px
 *
 * Die Messung (`npm run check:crates`) zeigt eine **Schwelle** zwischen 70 und
 * 110 px, keinen sanften Verlauf:
 *
 *     Radius   Partien mit Berührung
 *      18 px          1 von 4
 *      70 px          1 von 4
 *     110 px          4 von 4
 *
 * Der kleinste gemessene Abstand lag bei **71 px** — die natürliche Distanz,
 * die ein Sprungbogen überbrückt.
 *
 * ## Was hier geprüft wird
 *
 * Nicht die Höhe des Werts (die ist eine Spielgefühls-Entscheidung), sondern:
 * Der Loot-Strang **wirkt** — eine Kiste kann aufgenommen werden. Ein Test, der
 * „110" festschreibt, müsste bei jeder Anpassung geändert werden und würde
 * damit genau die Arbeit behindern, für die er gedacht ist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MatchController } from '../src/engine/match.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
import { PICKUP_RADIUS } from '../src/engine/systems/lootSystem.js';

/** Ein Match, in dem ein Platz frei ist (sonst greift `crate_pickup_blocked`). */
function matchMitPlatz(seed = 1000) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 60_000,
  });
  match.start();

  const id = match.getState().entities[0].entityId;
  const inventar = match.getState().entities[0].inventory;
  // Eine Waffe abwerfen, damit Platz zum Aufheben ist.
  match.dropWeapon(id, inventar[1]);

  return { match, id };
}

/**
 * Lässt alle Figuren springen, bis die Partie endet.
 *
 * `jump()` wirkt nur für den AKTIVEN Spieler und nur vom Boden aus — deshalb
 * wird vor jedem Absprung `isGrounded()` geprüft. Ohne diese beiden Bedingungen
 * lehnt die Physik ab („In der Luft ist kein erster Sprung möglich"), und der
 * Test misst nichts.
 */
function springeUndSammle(match) {
  const ereignisse = [];

  for (let schritt = 0; schritt < 3000 && match.status === 'playing'; schritt += 1) {
    const aktiv = match.activePlayerId;
    if (aktiv !== null && match.isGrounded?.(aktiv)) {
      match.jump(aktiv, schritt % 3 === 0);
      for (let i = 0; i < 12 && match.status === 'playing'; i += 1) {
        match.step();
        match.consumeEvents();
      }
    }
    match.endTurn();
    match.step();
    ereignisse.push(...match.consumeEvents());
  }

  return ereignisse;
}

test('Der Aufheberadius liegt über der Sprungdistanz', () => {
  /*
   * Die Beziehung, nicht der Wert: Ein Radius kleiner als die natürliche
   * Distanz zwischen Figur und Kiste (gemessen 71 px) macht das Aufheben
   * unmöglich. Geprüft wird die Untergrenze — die Obergrenze ist Geschmack.
   */
  assert.ok(PICKUP_RADIUS >= 71,
    `Der Radius ist ${PICKUP_RADIUS} px. Gemessen lag der kleinste Abstand `
    + 'zwischen Figur und Kiste bei 71 px — darunter ist kein Aufheben möglich '
    + '(siehe npm run check:crates).');

  assert.ok(PICKUP_RADIUS <= 200,
    `Der Radius ist ${PICKUP_RADIUS} px — so groß, dass die Kiste im `
    + 'Vorbeigehen eingesammelt würde. Sie wäre dann keine Entscheidung mehr.');
});

test('Eine Kiste wird tatsächlich aufgenommen', () => {
  /*
   * DIE Prüfung: Der Loot-Strang WIRKT.
   *
   * FUND (belegt, 2026-09-19): Vorher ließ dieser Test alle Figuren bis zum
   * Partieende springen und HOFFTE auf eine Aufnahme. Seit die Wurfweite des
   * Abwurfs aus der Zieldistanz gerechnet wird (Landestelle AUSSERHALB des
   * Aufhebe-Radius, wie der Mechaniktext des Abwurfs es verlangt), liegt die
   * abgeworfene Kiste weiter weg — die Zufalls-Hüpferei erreicht sie nicht mehr.
   * Der Fall wird deshalb GEZIELT aufgebaut: Figur neben die Kiste stellen,
   * Schritte laufen, Ereignis prüfen. Das misst dieselbe Zusage, ohne Zufall.
   */
  const { match, id } = matchMitPlatz(1000);

  const kisten = match.getState().crates;
  assert.ok(kisten.length > 0, 'der Abwurf muss eine Kiste erzeugt haben');
  const kiste = kisten[0];

  // Die Engine kennt keine Marsch-Eingabe (nur `jump`) — die Figur wird
  // deshalb direkt an die Kiste gestellt.
  match.world.setComponent(id, 'Position', 'x', kiste.x);
  match.world.setComponent(id, 'Position', 'y', kiste.y);
  match.consumeEvents();

  let aufgenommen = false;
  for (let i = 0; i < 5 && !aufgenommen; i += 1) {
    match.step();
    aufgenommen = match.consumeEvents().some(e => e.type === 'crate_pickup');
  }

  assert.ok(aufgenommen,
    'Die Kiste in Reichweite wurde nicht aufgenommen — der Loot-Strang ist '
    + 'damit wirkungslos. Prüfe den Aufheberadius (`npm run check:crates`).');
  assert.equal(match.world.isActive(kiste.entityId), false,
    'die aufgenommene Kiste muss aus der Welt verschwinden');
});

test('Die abgeworfene Waffe landet AUSSERHALB des Aufheberadius', () => {
  /*
   * Die harte Regel des Abwurfs (siehe `#rollDropThrow`): Die Landestelle muss
   * außerhalb des Aufhebe-Radius liegen — sonst sammelt der Werfer seine eigene
   * Waffe im nächsten Schritt wieder ein, und der Abwurf ist wirkungslos.
   *
   * FUND (belegt, gemessen 2026-09-19): Die alte Wurfgeschwindigkeit
   * (1,2–2,8 px/Tick) ergab 48–113 px — gemessen 74 px gegen `PICKUP_RADIUS`
   * von 110 px: `crate_landed` und `crate_pickup` fielen in denselben Takt.
   */
  const zuNah = [];

  for (const seed of [1000, 1001, 1002, 2000, 313, 4711, 4242, 9001]) {
    const match = new MatchController({
      seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 60_000,
    });
    match.start();
    const id = match.getState().entities[0].entityId;
    const spieler = match.getState().entities[0];
    match.consumeEvents();

    const wurf = match.dropWeapon(id, spieler.inventory[1]);
    assert.ok(wurf.ok, `Abwurf abgelehnt: ${wurf.errors}`);

    let gelandet = null;
    for (let schritt = 0; schritt < 200 && gelandet === null; schritt += 1) {
      match.step();
      const einschlag = match.consumeEvents().find(e => e.type === 'crate_landed');
      if (einschlag) gelandet = einschlag;
    }

    assert.ok(gelandet, `Seed ${seed}: die Kiste ist nie gelandet`);
    const abstand = Math.hypot(gelandet.x - spieler.x, gelandet.y - spieler.y);
    if (abstand <= PICKUP_RADIUS) {
      zuNah.push(`Seed ${seed}: ${abstand.toFixed(0)} px (Grenze ${PICKUP_RADIUS} px)`);
    }
  }

  assert.equal(zuNah.length, 0,
    `Die Kiste landet im Aufheberadius:\n  ${zuNah.join('\n  ')}`);
});

test('Ohne Platz wird die Aufnahme abgelehnt und gemeldet', () => {
  /*
   * Die andere Seite: Ein voller Vorrat darf nicht stillschweigend schlucken.
   * Der Spieler muss erfahren, warum er die Kiste liegen lassen muss.
   *
   * FUND (belegt, beim Schreiben): Ein erster Anlauf spielte einfach eine
   * Partie und erwartete das Ereignis. Es kam nicht — und zwar zu Recht:
   *
   *   1. `crate_pickup_blocked` gilt NUR für Waffenkisten (crateType 0). Die
   *      Kisten des Standardlaufs waren leere Kisten (crateType 2).
   *   2. Es gilt nur, wenn die Waffe NICHT schon im Inventar liegt — sonst
   *      bleibt die Kiste still liegen (sie wäre keine neue Wahl).
   *   3. Der Vorrat war gar nicht voll: `isFull` meldete false.
   *
   * Der Test baut den Fall deshalb GEZIELT auf, statt ihn zu erhoffen.
   */
  const match = new MatchController({
    seed: 1000, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 60_000,
  });
  match.start();

  const id = match.getState().entities[0].entityId;

  // Vorrat füllen, bis er voll ist.
  const FUELLER = ['pa_101', 'pa_102', 'pa_103', 'pa_104', 'pa_105', 'pa_106', 'pa_107'];
  for (const waffe of FUELLER) {
    if (match.inventory.isFull(id)) break;
    match.inventory.grantWeapon(id, waffe);
  }
  assert.equal(match.inventory.isFull(id), true,
    'Testannahme: der Vorrat muss voll sein');

  /*
   * Eine Waffenkiste an der Position der Figur anlegen.
   *
   * Das ECS ist die Schnittstelle: `Position` und `Crate` an einer neuen
   * Entität. `weaponId` ist der KATALOG-INDEX, nicht die Kennung — die Umrechnung
   * macht das Loot-System beim Aufheben (`weaponIdFromIndex`).
   */
  const figur = match.getState().entities.find(e => e.entityId === id);
  const neueWaffe = 'pa_050';
  assert.equal(match.inventory.has(id, neueWaffe), false,
    'Testannahme: diese Waffe fehlt noch');

  const index = match.getState().crates.length > 0
    ? 50   // ein belegter Index, der nicht im Inventar liegt
    : 50;

  const kisteId = match.world.createEntity();
  match.world.addComponent(kisteId, 'Position', { x: figur.x, y: figur.y });
  match.world.addComponent(kisteId, 'Velocity', { x: 0, y: 0 });
  match.world.addComponent(kisteId, 'Crate', {
    crateType: 0,          // weapon
    crateX: figur.x,
    crateY: figur.y,
    rarity: 1,
    weaponId: index,
    picked: 0,
    ammo: 0,
  });

  match.step();

  const blockiert = match.consumeEvents()
    .filter(e => e.type === 'crate_pickup_blocked');

  assert.ok(blockiert.length > 0,
    'Bei vollem Vorrat und einer noch fehlenden Waffe muss '
    + '`crate_pickup_blocked` kommen — sonst erfährt der Spieler nicht, warum '
    + 'die Kiste liegen bleibt');

  /*
   * Geprüft wird das Ereignis zu UNSERER Kiste, nicht das erste in der Liste.
   *
   * FUND (belegt): Der erste Anlauf nahm `blockiert[0]` — und bekam
   * `reason: undefined`. Der Grund: In derselben Runde lag eine RUNDENKISTE in
   * Reichweite, die regulär aufgenommen wurde (`crate_pickup`). Die Liste
   * enthält also Ereignisse aus mehreren Quellen; die richtige Prüfung sucht
   * die eigene Kiste heraus.
   */
  const eigenes = blockiert.find(e => e.payload?.weaponId === neueWaffe);
  assert.ok(eigenes,
    `Kein blockiertes Ereignis für die Kiste mit ${neueWaffe} gefunden. `
    + `Gefunden: ${JSON.stringify(blockiert.map(e => e.payload))}`);
  assert.equal(eigenes.payload.reason, 'voll',
    'Der Grund muss genannt sein — sonst weiß der Spieler nicht, was zu tun ist');
});

test('Das Aufheben ist deterministisch', () => {
  /*
   * Die Kernzusage des Projekts gilt auch hier: Gleicher Seed, gleicher
   * Verlauf. Ein Loot-System, das bei jedem Lauf andere Kisten liefert, wäre
   * mit Replays unvereinbar.
   */
  const lauf = () => {
    const { match } = matchMitPlatz();
    return springeUndSammle(match).filter(e => e.type === 'crate_pickup').length;
  };

  assert.equal(lauf(), lauf(),
    'Zwei Läufe mit demselben Seed müssen gleich viele Aufnahmen ergeben');
});

test('Der Radius steht an genau einer Stelle', () => {
  /*
   * Er war zwischenzeitlich zweimal da: als Konstante im Loot-System UND als
   * abgeschriebener Wert im Prüfwerkzeug (`HEUTE = 18`). Nach der Änderung
   * meldete das Werkzeug „heute 18 px" — eine falsche Entscheidungsgrundlage.
   */
  const werkzeug = fs.readFileSync(
    path.join(ROOT, 'scripts', 'check-crates.mjs'), 'utf8',
  );

  assert.match(werkzeug, /import \{ PICKUP_RADIUS as HEUTE \}/,
    'Das Prüfwerkzeug muss den Radius IMPORTIEREN, nicht abschreiben');

  const code = werkzeug.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /const HEUTE = \d+/,
    'Das Prüfwerkzeug trägt wieder einen eigenen Wert');
});
