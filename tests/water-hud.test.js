import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { CharacterSystem } from '../src/engine/systems/characterSystem.js';
import {
  WET_LEVEL,
  DROWN_LEVEL,
  WATER_STATE,
  clampWaterLevel,
  waterStateFor,
  waterLabel,
  toWireWaterLevel,
  fromWireWaterLevel,
} from '../src/shared/config/water.js';
import {
  encodeSnapshot,
  decodeSnapshot,
  toDeltaBase,
  DIRTY,
  PROTOCOL_VERSION,
} from '../src/shared/protocol.js';

/**
 * Wasser im HUD: Ertrinken und Wasserverdrängung sichtbar machen.
 *
 * Hintergrund: Die Schwellen „nass" (0,35) und „ertrinkt" (0,72) standen nur im
 * CharacterSystem, und übertragen wurde nichts davon. Der Spieler sah also
 * weder, dass seine Figur im Wasser steht, noch ab wann es Leben kostet — und
 * im Online-Modus schon gar nicht, weil der binäre Snapshot das Feld nicht
 * führte. Diese Datei sichert die Schwellen, die Kopplung an die Simulation,
 * den Transport im Protokoll und den Rückfall auf „trocken" ab.
 */

// ----------------------------------------------------------- Schwellenwerte

test('Die Wasserzustände folgen den Schwellen', () => {
  assert.equal(WET_LEVEL, 0.35);
  assert.equal(DROWN_LEVEL, 0.72);

  assert.equal(waterStateFor(0), WATER_STATE.DRY);
  assert.equal(waterStateFor(WET_LEVEL), WATER_STATE.DRY, 'Genau an der Schwelle noch trocken');
  assert.equal(waterStateFor(WET_LEVEL + 0.01), WATER_STATE.WET);
  assert.equal(waterStateFor(DROWN_LEVEL - 0.01), WATER_STATE.WET);
  assert.equal(waterStateFor(DROWN_LEVEL), WATER_STATE.SUBMERGED, 'Ertrinken ab der Schwelle');
  assert.equal(waterStateFor(1), WATER_STATE.SUBMERGED);

  // Unsinnige Werte dürfen nicht durchschlagen.
  assert.equal(waterStateFor(-5), WATER_STATE.DRY);
  assert.equal(waterStateFor(Number.NaN), WATER_STATE.DRY);
  assert.equal(waterStateFor(undefined), WATER_STATE.DRY);
  assert.equal(clampWaterLevel(3), 1);
});

test('Die Anzeige nennt Prozent und Zustand, nicht den Rohwert', () => {
  assert.equal(waterLabel(0), '');
  assert.equal(waterLabel(0.2), '');
  assert.equal(waterLabel(0.5), 'nass 50 %');
  assert.equal(waterLabel(0.8), 'untergetaucht 80 %');
  assert.equal(waterLabel(2), 'untergetaucht 100 %');
});

test('Die Drahtkodierung ist verlustarm und begrenzt', () => {
  assert.equal(toWireWaterLevel(0), 0);
  assert.equal(toWireWaterLevel(1), 255);
  assert.equal(toWireWaterLevel(5), 255, 'Über 1 wird begrenzt');
  assert.equal(toWireWaterLevel(-1), 0);

  // Ein Byte darf den Zustand an der Grenze nicht kippen.
  for (const level of [0, 0.2, WET_LEVEL, 0.5, DROWN_LEVEL, 0.9, 1]) {
    const zurueck = fromWireWaterLevel(toWireWaterLevel(level));
    assert.ok(Math.abs(zurueck - level) <= 1 / 255,
      `${level} kam als ${zurueck} zurück`);
    assert.equal(waterStateFor(zurueck), waterStateFor(level),
      `${level} kippt durch die Kodierung in einen anderen Zustand`);
  }
});

// --------------------------------------------- Kopplung an die Simulation

test('Das CharacterSystem benutzt dieselben Schwellen', () => {
  // Ohne diese Kopplung könnte die Anzeige „sicher" sagen, während die
  // Simulation bereits Schaden zufügt.
  const system = new CharacterSystem();
  assert.equal(system.submergedLevel, DROWN_LEVEL,
    'Das CharacterSystem hat eine eigene Ertrinkgrenze');
});

test('Eine untergetauchte Figur verliert Leben — und meldet sich fortlaufend', () => {
  const match = new MatchController({ seed: 4711, teams: 2, playersPerTeam: 1 });
  match.start();

  const spieler = match.getState().entities[0];
  /*
   * Eine ganze Zelle reicht NICHT: Die Figur sinkt langsam und rutscht nach
   * wenigen Schritten aus dem gefluteten Rasterfeld — das Ertrinken setzt dann
   * aus, obwohl der Test „Wasser" annimmt. Deshalb ein breiter Streifen um die
   * Figur, damit sie untergetaucht bleibt. (Genau dieser Umstand hat den ersten
   * Anlauf dieses Tests scheitern lassen: 18 statt 60 Meldungen.)
   */
  for (let x = spieler.x - 60; x <= spieler.x + 60; x += 4) {
    for (let y = spieler.y - 40; y <= spieler.y + 120; y += 4) {
      match.setWaterLevelAt(x, y, 0.95);
    }
  }
  assert.ok(match.waterLevelAt(spieler.x, spieler.y) > DROWN_LEVEL);

  const vorher = match.getState().entities[0].health;
  // Echte Ticks: `step()` erwartet Millisekunden, ein Aufruf mit 60 wäre EIN
  // Schritt von 60 ms. Für eine Sekunde Spielzeit sind 60 Schritte nötig.
  let meldungen = 0;
  let untergetauchtTicks = 0;
  for (let i = 0; i < 60; i += 1) {
    match.step();
    meldungen += match.consumeEvents().filter(e => e.type === 'drowning').length;
    // Wasser breitet sich aus, der Pegel sinkt also mit der Zeit. Gezählt wird
    // deshalb, in wie vielen Schritten die Figur WIRKLICH unter Wasser stand —
    // nur dagegen ist die Zahl der Meldungen aussagekräftig.
    const jetzt = match.getState().entities[0];
    if (waterStateFor(jetzt.waterLevel) === WATER_STATE.SUBMERGED) untergetauchtTicks += 1;
  }
  const nachher = match.getState().entities[0].health;
  assert.ok(nachher < vorher, `Kein Ertrinkungsschaden: ${vorher} → ${nachher}`);

  // Der Beleg für die Begründung im Client, warum dort NICHT je Ereignis
  // protokolliert wird: Es ist eine Meldung JE SIMULATIONSSCHRITT, also bis zu
  // 60 je Sekunde. Eine Meldung pro Ereignis hätte das Protokoll überschwemmt.
  assert.ok(untergetauchtTicks >= 30,
    `Die Figur war nur ${untergetauchtTicks} Schritte unter Wasser — der Testaufbau trägt nicht`);
  assert.ok(Math.abs(meldungen - untergetauchtTicks) <= 2,
    `${untergetauchtTicks} Schritte unter Wasser, aber ${meldungen} Meldungen — `
    + 'es muss eine Meldung je Schritt sein');
  assert.ok(meldungen >= 30,
    `Nur ${meldungen} Meldungen — bei einer Meldung je Sekunde wäre das Protokoll nicht überflutet`);
  assert.ok(match.getState().entities[0].health > 0, 'Nach einer Sekunde noch am Leben');
});

test('getState liefert den Wasserstand und die Zustandsentscheidung dazu', () => {
  const match = new MatchController({ seed: 88, teams: 2, playersPerTeam: 2 });
  match.start();

  // Ohne Wasser: alle trocken.
  for (const entity of match.getState().entities) {
    assert.equal(entity.waterLevel, 0, 'Eine Figur startet trocken');
    assert.equal(waterStateFor(entity.waterLevel), WATER_STATE.DRY);
  }

  const ziel = match.getState().entities[2];
  match.setWaterLevelAt(ziel.x, ziel.y, DROWN_LEVEL + 0.05);
  const nachher = match.getState().entities.find(e => e.entityId === ziel.entityId);
  assert.ok(nachher.waterLevel > DROWN_LEVEL);
  assert.equal(waterStateFor(nachher.waterLevel), WATER_STATE.SUBMERGED);

  // Der Wasserstand wird gerundet (Draht und Anzeige sollen dieselbe Zahl
  // sehen) — also prüfen, dass die Rundung nicht unter die Schwelle fällt.
  assert.ok(nachher.waterLevel >= DROWN_LEVEL,
    'Die Rundung hat den Zustand unter die Schwelle gedrückt');
});

test('Wasserverdrängung hebt den Pegel und wird sichtbar', () => {
  // Das ist der Fall, den die Anzeige zeigen soll: Die Figur bewegt sich nicht,
  // der Pegel steigt trotzdem — eine Explosion im Wasser verdrängt es.
  const match = new MatchController({ seed: 2024, teams: 2, playersPerTeam: 1 });
  match.start();

  const spieler = match.getState().entities[0];
  const trocken = match.getState().entities[0].waterLevel;
  assert.equal(trocken, 0);

  match.water.fillRectangle(
    0, 0, match.water.width - 1, match.water.height - 1, 1,
  );
  const geflutet = match.getState().entities.find(e => e.entityId === spieler.entityId);
  assert.equal(geflutet.waterLevel, 1, 'Das Fluten des Feldes muss ankommen');
  assert.equal(waterStateFor(geflutet.waterLevel), WATER_STATE.SUBMERGED);
});

test('Ein abgeworfener Vorrat landet nicht im Wasser', () => {
  /*
   * Die einzige harte Regel des Abwurfs: Die Kiste darf nicht im Wasser landen.
   *
   * Geprüft wird über das Ereignis `crate_landed` und nicht über die Position:
   * Eine fliegende Kiste IST über Wasser — sie schwebt aber, sie landet nicht.
   * Auf die Position zu prüfen hieße, den Flug mit der Landung zu verwechseln.
   *
   * Die Kontrolle auf trockenem Boden steht darunter: Ohne sie wäre der Test
   * auch dann grün, wenn die Kiste überhaupt nie landete.
   */
  const wuerfe = (fluten) => {
    const match = new MatchController({ seed: 31, teams: 2, playersPerTeam: 1 });
    match.start();
    const spieler = match.getState().entities[0];
    if (fluten) match.water.fillRectangle(0, 0, match.water.width - 1, match.water.height - 1, 1);
    const ergebnis = match.dropWeapon(spieler.entityId, match.inventory.getWeapons(spieler.entityId)[0]);
    assert.equal(ergebnis.ok, true, `Abwurf abgelehnt: ${ergebnis.errors?.join(', ')}`);
    const landungen = [];
    for (let i = 0; i < 600; i += 1) {
      match.step();
      landungen.push(...match.consumeEvents().filter(e => e.type === 'crate_landed'));
    }
    return { match, landungen };
  };

  // Kontrolle: Trockener Boden — die Kiste muss landen, und zwar auf trockenem Grund.
  const trocken = wuerfe(false);
  assert.equal(trocken.landungen.length, 1, 'Auf trockenem Boden muss die Kiste landen');
  const landeplatz = trocken.landungen[0].payload;
  assert.ok(trocken.match.waterLevelAt(landeplatz.x, landeplatz.y) <= WET_LEVEL,
    'Die Kiste ist auf nassem Boden gelandet');

  // Und geflutet: keine einzige Landung — sie wird weitergetragen.
  const geflutet = wuerfe(true);
  assert.equal(geflutet.landungen.length, 0,
    'Die Kiste darf im Wasser nicht landen');
});

test('Eine gelandete Kiste bleibt liegen (kein Durchsinken)', () => {
  /*
   * Fund: Die generische Physik (POSITION|VELOCITY) zog JEDE Kiste nach unten,
   * weil eine Kiste weder Projektil- noch Gesundheitskomponente hat. Eine
   * gelandete Kiste bekam erneut Schwerkraft, sank durch das Gelände und stand
   * nach 480 Schritten auf y ≈ 10 558 bei 720 px Kartenhöhe — auf trockenem
   * Boden, also unabhängig vom Wasser. Betroffen war jede Kiste: der
   * abgeworfene Vorrat und die Rundenkisten.
   *
   * Diese Prüfung hält fest, dass eine Landung eine Landung ist.
   */
  const match = new MatchController({ seed: 31, teams: 2, playersPerTeam: 1 });
  match.start();

  // Die Rundenkiste steht von Anfang an auf festem Grund.
  const rundenkiste = match.getState().crates[0];
  const hoeheVorher = rundenkiste.y;

  const spieler = match.getState().entities[0];
  const wurf = match.dropWeapon(spieler.entityId, match.inventory.getWeapons(spieler.entityId)[0]);
  const abwurfId = wurf.crateId;

  let landung = null;
  for (let i = 0; i < 600; i += 1) {
    match.step();
    for (const e of match.consumeEvents()) {
      if (e.type === 'crate_landed' && e.payload.crateId === abwurfId) landung = e.payload;
    }
  }
  assert.ok(landung, 'Die abgeworfene Kiste ist nie gelandet');

  const jetztRunde = match.getState().crates.find(c => c.entityId === rundenkiste.entityId);
  const jetztAbwurf = match.getState().crates.find(c => c.entityId === abwurfId);

  assert.equal(jetztRunde.y, hoeheVorher, 'Die Rundenkiste hat sich vertikal bewegt');
  assert.ok(Math.abs(jetztAbwurf.y - landung.y) < 1,
    `Die gelandete Kiste ist gesunken: gelandet auf ${landung.y}, jetzt auf ${jetztAbwurf.y.toFixed(1)}`);
  assert.ok(jetztAbwurf.y <= match.height,
    `Die Kiste hat die Karte verlassen: y = ${jetztAbwurf.y.toFixed(0)} bei Höhe ${match.height}`);
});

// ---------------------------------------------------------------- Protokoll

/** Baut einen Snapshot-Eingang mit einem Spieler in vorgegebenem Wasser. */
function zustandMitWasser(level, { health = 90, x = 100, y = 200 } = {}) {
  return {
    tick: 42,
    round: 2,
    wind: 0.01,
    activePlayerId: 1,
    entities: [{
      entityId: 1,
      teamId: 0,
      alive: true,
      x,
      y,
      health,
      waterLevel: level,
      shield: 0,
      frozenTurns: 0,
    }],
    projectiles: [],
  };
}

test('Der Wasserstand überlebt die Kodierung (Protokoll v4)', () => {
  assert.equal(PROTOCOL_VERSION, 4);
  assert.ok(DIRTY.WATER > 0);

  for (const level of [0, 0.1, WET_LEVEL, 0.5, DROWN_LEVEL, 0.99, 1]) {
    const bytes = encodeSnapshot(zustandMitWasser(level));
    const decoded = decodeSnapshot(bytes);
    assert.ok(decoded, `Dekodierung fehlgeschlagen für ${level}`);
    assert.ok(Math.abs(decoded.entities[0].waterLevel - level) <= 1 / 255,
      `${level} → ${decoded.entities[0].waterLevel}`);
    assert.equal(waterStateFor(decoded.entities[0].waterLevel), waterStateFor(level));
  }
});

test('Unverändertes Wasser wird im Delta nicht erneut übertragen', () => {
  const vorher = encodeSnapshot(zustandMitWasser(0.5));
  const basis = decodeSnapshot(vorher).previous;

  // Gleicher Zustand: kein Wasser-Bit im Delta.
  const gleich = decodeSnapshot(encodeSnapshot(zustandMitWasser(0.5), { previous: basis }), basis);
  assert.equal(gleich.isFull, false);
  assert.ok(Math.abs(gleich.entities[0].waterLevel - 0.5) <= 1 / 255);

  const deltaBytes = encodeSnapshot(zustandMitWasser(0.5), { previous: basis });
  const dirtyByte = deltaBytes[22 + 11];
  assert.equal(dirtyByte & DIRTY.WATER, 0, 'Wasser wurde als geändert gemeldet, obwohl gleich');
  assert.equal(dirtyByte, 0, 'Das Delta spart nichts, obwohl sich nichts geändert hat');

  // Neuer Pegel: Wasser-Bit gesetzt, Wert kommt an.
  const neu = encodeSnapshot(zustandMitWasser(0.9), { previous: basis });
  assert.equal(neu[22 + 11] & DIRTY.WATER, DIRTY.WATER);
  const decoded = decodeSnapshot(neu, basis);
  assert.ok(Math.abs(decoded.entities[0].waterLevel - 0.9) <= 1 / 255);
});

test('Bei unverändertem Wasser behält der Client seinen Wert (Delta)', () => {
  const basis = decodeSnapshot(encodeSnapshot(zustandMitWasser(0.6))).previous;
  // Zweiter Snapshot ohne Wasseränderung, aber mit neuer Position: Das
  // Wasser-Bit bleibt aus, der Client muss den alten Wert behalten.
  const bytes = encodeSnapshot(zustandMitWasser(0.6, { x: 150 }), { previous: basis });
  const decoded = decodeSnapshot(bytes, basis);
  assert.ok(Math.abs(decoded.entities[0].waterLevel - 0.6) <= 1 / 255,
    'Der Wasserstand ging beim Delta verloren');
});

test('Die Delta-Basis führt den Wasserstand', () => {
  const basis = toDeltaBase(zustandMitWasser(0.8));
  const eintrag = basis.get(1);
  assert.ok(eintrag, 'Kein Eintrag in der Delta-Basis');
  assert.equal(eintrag.waterRaw, toWireWaterLevel(0.8));
  // Ohne Wasserangabe gilt trocken — nicht undefined.
  assert.equal(toDeltaBase({ entities: [{ entityId: 2, x: 0, y: 0 }] }).get(2).waterRaw, 0);
});

test('Ein volles Match kommt mit Wasser durch den Draht', () => {
  const match = new MatchController({ seed: 555, teams: 2, playersPerTeam: 2 });
  match.start();
  const spieler = match.getState().entities[1];
  match.setWaterLevelAt(spieler.x, spieler.y, 0.8);

  const bytes = encodeSnapshot(match.getState());
  const decoded = decodeSnapshot(bytes);
  const zurueck = decoded.entities.find(e => e.entityId === spieler.entityId);
  assert.ok(zurueck.waterLevel > DROWN_LEVEL,
    `Der Wasserstand kam nicht an: ${zurueck.waterLevel}`);
  assert.equal(waterStateFor(zurueck.waterLevel), WATER_STATE.SUBMERGED);

  // Und die anderen bleiben trocken.
  for (const entity of decoded.entities) {
    if (entity.entityId === spieler.entityId) continue;
    assert.equal(entity.waterLevel, 0);
  }
});
